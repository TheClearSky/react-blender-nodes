# Security & Data Integrity Review — react-blender-nodes

## Domain summary

I reviewed the import/export deserialization boundary
(`src/utils/importExport/*`), the state reducer that consumes imported state
(`mainReducer` → `validateAction` → `applyPlan`, plus
`applyWithHistory`/`historyTypes`), the runner value/record handling
(`valueStore.ts`, `executionRecorder.ts`, `useNodeRunner.ts`), and the React
render surfaces that display user/imported strings (`ContextAwareInput.tsx`,
ColorPicker parts, FullGraph). The import path IS a real untrusted-input
surface: `importGraphState`/`importExecutionRecord` are documented public API,
and `FullGraph`'s hidden `<input type="file">` reads an arbitrary `.json` via
`FileReader` and dispatches `REPLACE_STATE`
(`useGraphImportExport.tsx:147-208`). **Good news first:** there is no
`dangerouslySetInnerHTML`, no `eval`/`new Function`/dynamic `import()` of
strings, and no `localStorage`/`sessionStorage` trust in app code (the only
`innerHTML`/`localStorage` hits live in a static Storybook asset
`.storybook/static/colorpickerlogo.html`, not bundled). React's default escaping
covers the rendered-value surfaces I checked, and the runtime `ValueStore` is
`Map`-based (immune to prototype pollution). The real issues are concentrated in
**data-integrity / round-trip correctness** of the (de)serializer plus a few
**input-validation gaps** at the import boundary that trust unvalidated nested
shapes. No CRITICAL issues found.

---

## HIGH

### SEC-1 — `switchRecords` are silently dropped on every execution-record import (round-trip data loss)

- **Severity:** HIGH · **Confidence:** high · **Category:** data-corruption /
  lossy deserialization
- **Files:** `src/utils/importExport/serialization.ts:382` (serialize) vs `:436`
  (deserialize); consumed at
  `src/components/molecules/ExecutionTimeline/SupportingSubcomponents/types.ts:276,295,308`
- **Current vs expected:** Export _does_ write switch records to JSON —
  `switchRecords: Object.fromEntries([...(record.switchRecords ?? new Map())])`
  (line 382), and the serialized type reserves the field
  (`SerializedExecutionRecord.switchRecords: Record<string, unknown>`, line
  203). But `deserializeExecutionRecord` hardcodes `switchRecords: new Map()`
  (line 436), unconditionally discarding whatever was in the file. Expected:
  deserialize the field back into a `Map<string, SwitchRecord>` symmetric to
  `loopRecords`/`groupRecords`.
- **Root cause:** Deserializer stub never implemented for switch records
  (loop/group were); the field is also not deep-deserialized (it's
  `Record<string, unknown>` on the way out, never typed/rebuilt on the way in).
- **Impact:** Any recording that contains switch structures loses ALL switch
  visualization after an export→import round-trip. `buildSegments` is guarded
  (`switchRecords.has(step.switchStructureId)` at line 295 gates the
  `switchRecords.get(switchId)!` at 308, so no crash), but every switch step
  silently degrades to a flat timeline block — the imported recording no longer
  faithfully represents the original run. This is exactly the "serialization
  round-trip that drops graph state" risk in scope.
- **Reproduction:** Run a graph with a switch, export the recording
  (`exportExecutionRecord`), re-import it (`importExecutionRecord`);
  `result.data.switchRecords.size === 0` even though the JSON file contained
  switch entries.
- **Evidence:** `serialize`
  `switchRecords: Object.fromEntries([...(record.switchRecords ?? new Map())])`
  ; `deserialize` `switchRecords: new Map(),`

---

## MEDIUM

### SEC-2 — Import validation never inspects `node.data` / handle shapes; malformed-but-structurally-valid graphs are trusted into `REPLACE_STATE`

- **Severity:** MEDIUM · **Confidence:** high · **Category:** input validation /
  unsafe deserialization
- **Files:** `src/utils/importExport/validation.ts:114-156` (only
  `id`/`type`/`position` checked);
  `src/utils/importExport/stateImport.ts:317-343` (`isValidState` is
  presence-only);
  `src/utils/nodeStateManagement/planApply/validators.ts:203-204`
  (`REPLACE_STATE` does zero validation); applied at `applyPlan.ts:442-454`
- **Current vs expected:** `validateGraphStateStructure` validates the
  _envelope_, `dataTypes`/`typeOfNodes` headers, and per-node
  `id`/`type`/`position`, but never validates `node.data` (which holds
  `inputs`/`outputs`/`value`/`nodeTypeUniqueId` — the data the renderer and
  runner actually consume). The final guard `isValidState` only checks that the
  keys `nodes`/`edges`/`dataTypes`/`typeOfNodes` _exist_
  (`stateImport.ts:38-44`). `REPLACE_STATE` validation just echoes the payload
  (`validators.ts:204: return ok({ kind: 'REPLACE_STATE', state: action.payload.state })`)
  and `applyPlan` returns the imported object as the new state. So a file with
  `nodes:[{id:"x",type:"t",position:{x:0,y:0}, data: 42}]` (or `data.inputs` not
  an array, or a `nodeTypeUniqueId` with no matching `typeOfNodes` entry) passes
  validation and becomes live state.
- **Root cause:** The structural validator is intentionally shallow ("Does NOT
  check type-level correctness … that's the importer's job" —
  validation.ts:26-28), but the importer also doesn't deep-validate `data`; the
  type guard is presence-only; and the reducer trusts `REPLACE_STATE` entirely.
- **Impact:** Malformed imported `node.data` reaches `ConfigurableNode` render
  and the runner, surfacing as runtime exceptions (e.g.
  `getHandleFromNodeDataMatchingHandleId` / `resolveInputs` reading
  `.inputs`/`.outputs` of a non-object) rather than a clean import error. It is
  data-integrity corruption from an untrusted file, not a clean rejection. Most
  array-typed handles are later coerced defensively
  (`instanceof Array ? … : []`), which limits crashes but means corrupted nodes
  render empty/blank instead of failing import.
- **Evidence:**
  `function isValidState(...) { return 'nodes' in data && 'edges' in data && 'dataTypes' in data && 'typeOfNodes' in data; }`
  ; validator:
  `case actionTypesMap.REPLACE_STATE: return ok({ kind: 'REPLACE_STATE', state: action.payload.state });`

### SEC-3 — `safeSerializeValue` recurses with no cycle detection → stack-overflow (DoS) on export of a circular value

- **Severity:** MEDIUM · **Confidence:** high · **Category:** unsafe
  serialization / DoS
- **Files:** `src/utils/importExport/serialization.ts:54-98` (recurses
  arrays/objects/Map/Set with no `seen` set); reached via
  `serializeRecordedOutputHandleValue` (`:225-232`),
  `serializeRecordedInputHandleValue` (`:212-223`), `serializeExecutionRecord`
  `finalValues` (`:366-368`), and `serializePatch` (`:598-601`)
- **Current vs expected:** `safeSerializeValue` recursively walks plain objects
  (`:88-95`), arrays (`:84`), `Map` (`:63-69`) and `Set` (`:71-73`) with no
  visited-set. Node-function output values are arbitrary `unknown` (recorded at
  `executionRecorder.ts:316` `step.outputValues = outputValues`; final values
  likewise). A node implementation that returns a self-referential object
  (`const o={}; o.self=o; return o`) yields a recorded value with a cycle. On
  `exportExecutionRecord`, `safeSerializeValue` infinitely recurses and throws
  `RangeError: Maximum call stack size exceeded` _before_ `JSON.stringify`
  (which would otherwise throw a clean `TypeError`). Expected: track visited
  objects and substitute a `"[Circular]"` placeholder (the function already
  substitutes placeholders for functions/symbols, so the pattern is
  established).
- **Root cause:** Recursive serializer written without cycle guarding, while the
  inputs it processes are genuinely user-controlled (node outputs / final
  values).
- **Impact:** A graph whose node functions emit a cyclic value cannot be
  exported; the export call throws and (depending on caller) can crash the
  surrounding handler. Lower likelihood than SEC-1/2 because it requires a
  user-authored node returning a cycle, but it is a denial-of-service on the
  export feature with no graceful failure.
- **Evidence:**
  `if (Array.isArray(value)) { return value.map(safeSerializeValue); }` and
  `for (const [k, v] of Object.entries(value)) { obj[k] = safeSerializeValue(v); }`
  — no `WeakSet`/`seen` tracking anywhere in the function.

### SEC-4 — Handle/dataType rehydration trusts file-supplied `dataTypeUniqueId` keys; `__proto__`/`constructor` keys yield prototype objects as `dataTypeObject`

- **Severity:** MEDIUM · **Confidence:** medium · **Category:**
  prototype-pollution-adjacent / data integrity
- **Files:** `src/utils/importExport/serialization.ts:529-554`
  (`rehydrateHandleDataType`); driven from `stateImport.ts:248-292`
  (`Object.keys(state.dataTypes)`, `rehydrateNodeHandles`)
- **Current vs expected:** `rehydrateHandleDataType` reads
  `const dtId = dt.dataTypeUniqueId; if (typeof dtId === 'string' && isObject(dataTypes[dtId])) { handle.dataType = { ...dt, dataTypeObject: dataTypes[dtId] }; }`.
  `dtId` comes from the imported file. With `dataTypeUniqueId: "__proto__"`,
  `dataTypes["__proto__"]` resolves to `Object.prototype` (a real object →
  `isObject` true), so the handle's `dataTypeObject` is set to
  `Object.prototype`. Similarly `stateImport.ts:251-265` iterates
  `Object.keys(state.dataTypes)` (which, post-`JSON.parse`, can include an own
  `__proto__` key) and writes `dt.complexSchema = providedDt.complexSchema`.
  Expected: reject non-own / reserved keys (`__proto__`, `constructor`,
  `prototype`) or look up via a `null`-prototype map /
  `Object.prototype.hasOwnProperty.call(dataTypes, dtId)` guard (the codebase
  already uses exactly this guard in `groupCompiler.ts:286`).
- **Root cause:** Untrusted string keys used directly for bracket lookups into a
  trusted record without an own-property / reserved-key check.
- **Impact:** This does NOT pollute the global prototype (the writes are
  `handle.dataType = {...}` and `dt.complexSchema = …` on own objects, and
  `JSON.parse` does not pollute via `__proto__`), so it is below CRITICAL. But
  it corrupts the imported graph's data model: a handle whose `dataTypeObject`
  is `Object.prototype` carries no `underlyingType`/`color`, which then flows
  into inference and rendering as a malformed handle. Confidence is medium
  because exploitation requires a hand-crafted file naming a dataType
  `__proto__` and the downstream blast radius depends on inference reading those
  fields.
- **Evidence:**
  `const dtId = dt.dataTypeUniqueId; if (typeof dtId === 'string' && isObject(dataTypes[dtId])) { handle.dataType = { ...dt, dataTypeObject: dataTypes[dtId] }; }`

### SEC-5 — `applyPatchesToDraft` walks an arbitrary patch path and writes `target[key]`; safe today only because the import path strips `history`

- **Severity:** MEDIUM · **Confidence:** medium · **Category:** unsafe
  deserialization (defense-in-depth) / prototype pollution
- **Files:** `src/components/organisms/FullGraph/historyTypes.ts:189-227`;
  serializer support exists at `serialization.ts:593-615`
  (`serializePatch`/`serializeHistoryEntry`) and `historyTypes.ts:62-78`
  (`SerializedHistoryEntry`/`SerializedPatch`)
- **Current vs expected:** `applyPatchesToDraft` navigates `patch.path` and does
  `target[key] = patch.value` / `delete target[key]` with no validation that
  `key` isn't `__proto__`/`constructor`/`prototype`. In the _current_ wiring
  this is safe: undo/redo patches are produced internally by Immer
  (`produceWithPatches`), and the only untrusted-import path, `REPLACE_STATE`,
  explicitly `delete imported.history` (`applyPlan.ts:452`) and export strips
  `history` (`stateSerializer.ts:109`). However, the codebase _also_ ships a
  serializer for history patches (`serializePatch`/`serializeHistoryEntry`) and
  the public `SerializedHistoryEntry`/`SerializedPatch` types are re-exported
  from `FullGraph/index.ts:5-9` — i.e. the project anticipates
  exporting/importing patch history. If any future consumer feeds deserialized
  patches into `applyPatchesToDraft` (UNDO/REDO restore from file), a path of
  `['__proto__','polluted']` with op `add`/`replace` becomes a genuine
  prototype-pollution write.
- **Root cause:** A generic path-walk writer with no key sanitization, paired
  with a (currently dormant) patch-serialization surface that is exported
  publicly.
- **Impact:** No live exploit today (history never round-trips through import).
  Flagging as defense-in-depth: the building blocks for an untrusted-patch path
  exist and are public; adding a reserved-key guard now prevents a latent
  prototype-pollution sink.
- **Evidence:** `case 'add': … else { target[key] = patch.value; }` and
  `case 'replace': … else target[key] = patch.value;` — `key` derived from
  `patch.path[patch.path.length - 1]` with no filtering.

---

## LOW

### SEC-6 — Runner key separators (`:` / `>`) in node/handle IDs only warned in dev; imported IDs can collide and corrupt the ValueStore

- **Severity:** LOW · **Confidence:** medium · **Category:** data-corruption /
  id collision
- **Files:** `src/utils/nodeRunner/valueStore.ts:50-62` (`qualifiedId`),
  `:299-307` (`createScope`)
- **Current vs expected:** `qualifiedId` builds `"${nodeId}:${handleId}"` and
  scopes use `"${prefix}>"`. IDs containing `:` or `>` collide across
  handles/scopes. This is checked only under
  `process.env.NODE_ENV !== 'production'` as a `console.warn` — in production,
  colliding IDs silently overwrite each other in `this.store` (a
  `Map<string,unknown>`), so the wrong value is read for an input. Imported
  graph state supplies node/handle/edge IDs verbatim (no sanitization in
  `importGraphState`), so a crafted or hand-edited file with `:`/`>` in IDs
  causes silent value corruption during execution.
- **Root cause:** Delimiter-encoded composite keys without enforced ID charset;
  validation downgraded to a dev-only warning.
- **Impact:** Silent wrong-value propagation at run time for adversarial/edited
  IDs. Low severity because normal IDs are generated via `generateRandomString`
  and avoid these chars; only relevant for untrusted/edited files.
- **Evidence:**
  `return \`${nodeId}:${handleId}\`;`with the collision check wrapped in`if
  (process.env.NODE_ENV !== 'production') { … console.warn(…) }`.

### SEC-7 — `recordImport` advertises `sanitizeNonSerializableValues` repair but it is a no-op

- **Severity:** LOW · **Confidence:** high · **Category:** misleading validation
  / API correctness
- **Files:** `src/utils/importExport/recordImport.ts:120-124`; option declared
  at `types.ts:83-88`
- **Current vs expected:** The `sanitizeNonSerializableValues` repair strategy
  body is empty (only a comment: "Values are already JSON since they came from
  JSON.parse"). The strategy name implies active sanitization, and `FullGraph`
  enables it (`useGraphImportExport.tsx:221`). Callers may assume protection
  that isn't provided. Largely benign (post-`JSON.parse` values are JSON
  primitives, so there is nothing non-serializable to strip), but it is a
  validation/expectation gap worth either implementing meaningfully or
  documenting as a guaranteed no-op.
- **Root cause:** Placeholder repair retained for "API symmetry" without
  behavior.
- **Evidence:**
  `if (repair.sanitizeNonSerializableValues && Array.isArray(recordData.steps)) { // Values are already JSON … This repair is more about ensuring consistency. }`

---

## Notes on things checked and found NOT to be issues

- **XSS:** No `dangerouslySetInnerHTML`, `innerHTML`, or unsanitized string→DOM
  in app code. `ContextAwareInput.tsx` renders `input.name`/`input.value`
  through normal JSX (React-escaped). ColorPicker parts use only hardcoded
  `data:image/svg+xml` backgrounds (`Alpha.tsx`/`Swatches.tsx`/`Preview.tsx`),
  not user strings.
- **Code-eval:** No `eval`, `new Function`, or dynamic `import()` of untrusted
  strings anywhere in `src/`.
- **localStorage/sessionStorage trust:** Not used in app code
  (`nodeRunner/types.ts:909` is only a doc comment; the
  `.storybook/static/*.html` usages are an unbundled static asset).
- **JSON.parse safety:** Both importers wrap `JSON.parse` in try/catch and fail
  cleanly (`stateImport.ts:133-143`, `recordImport.ts:46-56`). `JSON.parse`
  itself does not prototype-pollute via `__proto__`.
- **Runtime value store / record maps:** `ValueStore` and all (de)serialized
  record collections use `Map`, immune to prototype pollution.
- **Imported execution records are validated against the live graph**
  (`validateRecordAgainstGraph`, `useNodeRunner.ts:261-331`): missing node/type
  IDs are warnings, empty-steps is a hard error — reasonable.
- **`URL.createObjectURL` / download** is export-only
  (`useGraphImportExport.tsx:20-28`); no untrusted URL is opened or assigned to
  `href`/`src`.
