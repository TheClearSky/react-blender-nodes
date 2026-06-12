# TypeScript Type-Safety & Contracts Review

## Domain Summary

I performed a paranoid, source-verified pass over the type-safety surface of
`react-blender-nodes`, concentrating on the immer reducer (`planApply/`,
`applyWithHistory`, `historyTypes`), the zone/loop/switch machinery, the
runner/executor, and the import/export serialization layer. The codebase is
unusually disciplined: `strict` is on with `noFallthroughCasesInSwitch`,
`npx tsc --noEmit -p tsconfig.app.json` is clean, there are **zero `as any`
casts in production code**, the large `Plan` and `ExecutionStep` discriminated
unions are dispatched exhaustively (`graphEvent.ts` even uses a real
`const _exhaustive: never` check), and the many `as`/`!` occurrences are
overwhelmingly `as const`, documented generic/Immer/JSON boundary casts, or
non-null assertions that are provably guarded (`queue.shift()!` after
`while (queue.length > 0)`, `.get(id)!` after `.has(id)`). Because of that
discipline, most of what I found is low-severity latent fragility rather than
active type holes. The one substantive finding is a serialization **contract
that lies**: `ExecutionRecord.switchRecords` is typed and round-tripped as if it
were serialized, but it is silently dropped on import and mangled on export.
Note: `noUncheckedIndexedAccess` is NOT enabled, so the pervasive `arr[0]` /
`map[key]` index access throughout the reducer is typed as non-`undefined` even
where it can be absent — this is the single biggest systemic source of latent
unsoundness, but it is a project-wide config choice, not a localized bug.

---

## HIGH

### TS-1 — `ExecutionRecord.switchRecords` is a dishonest serialization contract: dropped on import, Map-corrupted on export

- **Severity:** HIGH
- **Category:** Type contract / data-loss
- **Files:**
  - `src/utils/importExport/serialization.ts:189-206` (type), `:382`
    (serialize), `:436` (deserialize)
  - `src/utils/importExport/validation.ts:359-368` (validation omits
    switchRecords)
  - `src/utils/nodeRunner/executionRecorder.ts:586,847,875` (switchRecords IS
    produced)

**Current vs expected.** `SerializedExecutionRecord.switchRecords` is typed
`Record<string, unknown>` and sits in the union next to `loopRecords` /
`groupRecords`, implying it round-trips like its siblings. It does not:

```ts
// serialize (line 382) — NO recursion through a serializeSwitchRecord; writes
// live SwitchRecord objects (whose nested fields are ReadonlyMaps) straight in:
switchRecords: Object.fromEntries([...(record.switchRecords ?? new Map())]),
...
// deserialize (line 436) — switch records are thrown away entirely:
switchRecords: new Map(),
```

`loopRecords`/`groupRecords` each have a dedicated `serialize*`/`deserialize*`
pair (`serialization.ts:302-338, 353-410`) that converts every nested
`ReadonlyMap` (e.g. `stepRecords[].inputValues`, `nestedLoopRecords`,
`nestedSwitchRecords`) to/from a plain object. `switchRecords` has none.
`validation.ts` (`:359-368`) validates `loopRecords` and `groupRecords` but
never references `switchRecords`, confirming the field was overlooked across the
entire serialize → validate → deserialize path.

**Root cause.** `SwitchRecord` (`nodeRunner/types.ts:580-591`) was added with
nested `ReadonlyMap` fields but no serialization transform was written, and the
`Record<string, unknown>` type erased the mismatch so the compiler couldn't flag
it.

**Impact.** (1) Export: `JSON.stringify` turns the live `Map` fields inside each
`SwitchRecord` into `{}`, so an exported recording that ran a switch is silently
corrupted. (2) Import: `deserializeExecutionRecord` replaces switch records with
an empty `Map`, so all switch-branch timeline/inspector data is lost on reload.
The `ExecutionRecord.switchRecords` type promises data that the import path can
never deliver.

**Confidence:** high. The recorder demonstrably populates `switchRecords`
(`executionRecorder.ts:586`), the type claims it serializes, and both
serialize/deserialize are verifiably non-functional for it.

---

## LOW

### TS-2 — `isStandardNodeType` is a hand-maintained type guard that will silently lie if the standard-names list grows

- **Severity:** LOW
- **Category:** Type-guard soundness (latent)
- **Files:** `src/utils/nodeRunner/groupCompiler.ts:247-259`; array at
  `src/utils/nodeStateManagement/standardNodes.ts:35-43`

**Current vs expected.** The guard claims
`nodeTypeId is T & StandardNodeTypeName` where
`StandardNodeTypeName = (typeof standardNodeTypeNames)[number]`, but its body
hard-codes exactly the 7 current names:

```ts
function isStandardNodeType<T extends string>(
  nodeTypeId: T,
): nodeTypeId is T & StandardNodeTypeName {
  return (
    nodeTypeId === standardNodeTypeNamesMap.loopStart ||
    /* ...6 more literal comparisons... */
    nodeTypeId === standardNodeTypeNamesMap.switchEnd
  );
}
```

Today this matches `standardNodeTypeNames` exactly, so it is **sound right
now**. But there is no compile-time link between the array and the guard body:
if a future 8th standard node name is added to the array, the guard keeps the
same return type yet returns `false` for that name. The dangerous direction is
the _false_ branch — callers (`executeStandardNode.ts:117`,
`groupCompiler.ts:147`) rely on it to narrow to
`Exclude<T, StandardNodeTypeName>` so they can index `functionImplementations`.
A new standard node would be mis-narrowed as a user-implementable type and
treated as "missing implementation" instead of "built-in".

**Root cause.** Manual enumeration instead of deriving from
`standardNodeTypeNames` (e.g.
`(standardNodeTypeNames as readonly string[]).includes(nodeTypeId)`).

**Impact.** None currently; a maintenance landmine for the next standard node
type. **Confidence:** high that the guard is hand-maintained; low that it bites
(requires a future edit).

### TS-3 — `applyPatchesToDraft` mutates `target[key]` without validating `patch.path` length / interior shape

- **Severity:** LOW
- **Category:** Index-signature / non-null soundness at a generic tree-walk
- **Files:** `src/components/organisms/FullGraph/historyTypes.ts:189-227`

**Current vs expected.** On UNDO/REDO this walks a stored Immer `Patch.path` and
writes the leaf:

```ts
let target: PatchTarget = draft;
for (let i = 0; i < patch.path.length - 1; i++) {
  const step = patch.path[i];
  target = (
    Array.isArray(target) ? target[step as number] : target[step]
  ) as PatchTarget;
}
const key = patch.path[patch.path.length - 1];
```

Two unchecked assumptions: (a) if `patch.path.length === 0`, `key` is
`patch.path[-1]` → `undefined` and the code does
`target[undefined as any] = value`; (b) each interior node is assumed to be an
object/array via `as PatchTarget`, so a path pointing through a `null`/primitive
(e.g. a malformed patch from an imported `history`, see `SerializedPatch` at
`:74-78`) would throw a raw TypeError rather than failing gracefully.

**Root cause.** The walk trusts that stored/serialized patches are well-formed.
For patches produced in-process by `produceWithPatches` this holds (Immer never
emits empty-path patches for object/array mutations), so it is not currently
reachable — hence LOW.

**Impact.** Only reachable via externally-supplied/serialized history patches;
none in the current in-process undo/redo flow. **Confidence:** low — I could not
construct an in-process path that produces an empty/malformed `patch.path`;
flagged as defense-in-depth.

### TS-4 — `applyPlan` ADD_LOOP/ADD_SWITCH non-null assertions couple to standard-node definitions implicitly

- **Severity:** LOW
- **Category:** Non-null assertion on derived data
- **Files:**
  `src/utils/nodeStateManagement/planApply/applyPlan.ts:1049-1052,1058-1067,1228-1235`

**Current vs expected.**

```ts
const loopStartOutputs = loopStartNode.data.outputs!;   // ! on possibly-undefined
...
sourceHandle: loopStartOutputs[0].id,                    // [0] also unchecked
```

`constructNodeOfType` for
`loopStart`/`loopStop`/`loopEnd`/`switchStart`/`switchEnd` always yields the
handles defined in `standardNodes.ts:122-261`, so `outputs!` and `[0]` are safe
**today**. But the safety is an undocumented invariant between two files:
nothing at the type level guarantees a freshly-constructed standard node has a
non-empty `outputs`/`inputs`. If a standard node definition were ever edited to
drop its first output, this becomes a runtime `TypeError` at edge-bind time with
no compile-time warning.

**Root cause.** `constructNodeOfType` returns the widened node type where
`outputs?`/`inputs?` are optional; the apply code re-narrows with `!` + bare
index instead of a guarded lookup.

**Impact.** None currently; latent coupling. **Confidence:** high that it is
currently safe; low that it bites.

---

## Notes / non-findings (verified safe)

- `planApply/applyPlan.ts` switch (24 `Plan` kinds) and
  `executor/executionHelpers.ts` `getStep*` switches are exhaustive; their
  `default: throw` is dead code, and `graphEvent.ts:388-392` uses a real `never`
  exhaustiveness check.
- `applyWithHistory.ts` `draft as StateT` / `as Draft<StateT>` are the standard,
  documented Immer generic-draft no-ops — sound.
- `FullGraphState.ts:266` `props as unknown as FullGraphProps` and
  `graphStore.ts` carry no unsafe casts; the variance bridge is documented.
- `valueStore.ts`, `executeGroupScope.ts`, `groupCompiler.ts` use structural
  "Minimal\*" types and `hasKey`/`isObject` guards rather than casts — clean.
- `stateImport.ts` / `recordImport.ts` JSON boundaries narrow via `isObject` and
  `unknown`, with post-validation `is`-guards (`isValidState`,
  `isSerializedExecutionRecord`) that are honestly documented as "not a
  substitute for validation".
- `ContextAwareInput.tsx:75` cast to
  `{ type:'string'; allowedStrings: readonly string[] }` is sound given the
  immediately-preceding `input.allowedStrings && .length > 0` check;
  `ConfigurableNodeInput` is a proper discriminated union on `type`.
- `switchValidation.ts` `handle.id as string` widenings feed only `Set.has(...)`
  (a missing id yields `false`, not a crash) — benign.
