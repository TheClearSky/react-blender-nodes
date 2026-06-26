# Run Targets (Pluggable Execution)

## Overview

A **run target** is one strategy for executing a graph. By default a graph runs
through the built-in in-process executor (producing a timeline), but consumers
can register additional targets and pick one from the runner's **split Run
button**. This is the Strategy pattern: a target is an execution strategy; the
runner is the context that selects one when the user clicks Run.

There are two first-class modes:

- **`execute`** — produces an `ExecutionRecord` that feeds the timeline /
  inspector exactly like the default run.
- **`artifact`** — returns or downloads a file/string (e.g. generated code, the
  plan as JSON) and skips the timeline.

The library ships three built-in targets — the in-process executor (default,
`execute`), `json-ir` and `codegen-js` (both `artifact`). Consumers register
more via `FullGraphProps.runTargets`.

**Source files:** `src/utils/nodeRunner/runTargets/types.ts` › `RunTarget`,
`src/components/organisms/FullGraph/FullGraph.tsx` › `FullGraphProps`.

---

## Public API surface

Unlike the rest of the runner (which is internal), the run-targets module IS
part of the published package — registering a target requires the contract and
the IR types. The curated barrel `src/utils/nodeRunner/runTargets/index.ts` ›
`inProcessRunTarget` re-exports:

- the contract: `src/utils/nodeRunner/runTargets/types.ts` › `RunTarget` (and
  `src/utils/nodeRunner/runTargets/types.ts` › `ExecuteRunTarget` /
  `src/utils/nodeRunner/runTargets/types.ts` › `ArtifactRunTarget`),
  `src/utils/nodeRunner/runTargets/types.ts` › `RunTargetMode`, and the
  authoring factory `src/utils/nodeRunner/runTargets/types.ts` ›
  `makeRunTargetWithAutoInfer`;
- the contexts `src/utils/nodeRunner/runTargets/types.ts` › `ExecuteRunContext`
  and `src/utils/nodeRunner/runTargets/types.ts` › `ArtifactRunContext`;
- the built-in values `src/utils/nodeRunner/runTargets/inProcessRunTarget.ts` ›
  `inProcessRunTarget`, `src/utils/nodeRunner/runTargets/jsonIrRunTarget.ts` ›
  `jsonIrRunTarget`, `src/utils/nodeRunner/runTargets/codegenJsRunTarget.ts` ›
  `codegenJsRunTarget`, and the delivery helper
  `src/utils/nodeRunner/runTargets/downloadTextArtifact.ts` ›
  `downloadTextArtifact`;
- the stable IR/record types the contract references (`ExecutionPlan`,
  `ExecutionRecord`, `ExecutionStepRecord`, `NodeVisualState`,
  `FunctionImplementations`, `ExecutionContext`) plus
  `src/utils/nodeRunner/executionRecorder.ts` › `ExecutionRecorder` for advanced
  authors who hand-build records.

Basic authoring needs none of the type names — `makeRunTargetWithAutoInfer`
infers them.

---

## The `RunTarget` contract

`RunTarget` is a discriminated union on `mode`, so the return type AND the
context shape are encoded in the type:

```ts
const exportCsv = makeRunTargetWithAutoInfer({
  id: 'export-csv',
  label: 'Export CSV',
  mode: 'artifact',
  run: async (context) => {
    // context: ArtifactRunContext — read-only base data only
    const csv = toCsv(context.executionPlan);
    downloadTextArtifact('graph.csv', csv, 'text/csv');
  },
});
```

Context segregation (Interface Segregation):

- `src/utils/nodeRunner/runTargets/types.ts` › `ArtifactRunContext` carries the
  read-only base: `state` (escape hatch), `executionPlan` (the stable IR — the
  default input), `options.maxLoopIterations`, and `abortSignal`. It has **no**
  `functionImplementations` — no artifact target needs the impl closures.
- `src/utils/nodeRunner/runTargets/types.ts` › `ExecuteRunContext` adds
  `functionImplementations`, `onNodeStateChange`, and
  `runWithInProcessExecutor()` (the easy path — delegate to the built-in
  executor and return its record).

Stepping (pause / step) is an **optional** per-target capability: an `execute`
target that provides `runStepwise` lights up the step/pause UI; one that omits
it runs single-shot. The mode toggle and Step button disable automatically for
targets without it (and for all `artifact` targets) — see
`src/components/molecules/RunControls/RunControls.tsx` › `RunControls`.

---

## Built-in targets

- **`inProcessRunTarget`** (`id: 'in-process'`, `execute`, default) — adapts the
  in-process executor; provides both `run` and `runStepwise`. Always available;
  it is prepended to the consumer's list by
  `src/components/organisms/FullGraph/useRunTargets.ts` › `useRunTargets` (via
  the pure `src/utils/nodeRunner/runTargets/resolveRunTargets.ts` ›
  `resolveRunTargets`) unless a consumer target reuses its id.
- **`jsonIrRunTarget`** (`id: 'json-ir'`, `artifact`) — serializes the compiled
  `ExecutionPlan` to JSON (lossless; the plan is pure structure) via
  `src/utils/nodeRunner/runTargets/serializeExecutionPlan.ts` ›
  `serializeExecutionPlan` and downloads it.
- **`codegenJsRunTarget`** (`id: 'codegen-js'`, `artifact`) — emits a
  standalone, dependency-free, human-readable JavaScript module via
  `src/utils/nodeRunner/runTargets/codegen/emitJs.ts` › `emitJs` and downloads
  it.
- **`codegenTsRunTarget`** (`id: 'codegen-ts'`, `artifact`) — the same compiler
  with `target: 'typescript'`: a typed `runGraph` whose stored values are cast
  from the codegen metadata registry's
  `src/utils/nodeRunner/runTargets/codegen/contract.ts` › `CodegenMetadata`
  `dataTypeToTsType` map. Both targets come from the
  `src/utils/nodeRunner/runTargets/codegenJsRunTarget.ts` ›
  `makeCodegenRunTarget` factory — call it directly for a custom `id` / `label`
  / `filename`, the TypeScript target, or the opt-in `optimize` /
  `analyzeImplementations` codegen-v2 passes.

### codegen-js: the emitted code

`emitJs(plan, state)` produces:

```js
async function runGraph(functionImplementations, options = {}) { … }
```

Nodes become implementation calls, loops become `for`, switches become
`if/else`, and groups become nested scoped blocks (inner value keys prefixed
`groupNodeId>`). It is **value-API fidelity**: emitted `inputs` carry
`connections[].value`, `isDefault`, and `defaultValue` (the compute API
implementations use — unconnected handles bake their current state value
inline); inspector-only provenance (source node/handle names, edge ids) and
`context.state` are omitted for readability.

**v1 boundaries (documented):** success-path parity (a throwing implementation
makes `runGraph` throw rather than record-and-skip — use the in-process target
for erroring graphs); concurrency is flattened to sequential `await`
(value-equivalent); input defaults must be JSON-able. Correctness is pinned by
parity tests that evaluate the emitted function and compare its value store to
the in-process executor across std / levels / loop / switch / group / defaults /
multi-input fixtures.

**Output shape.** `emitJs` lowers the plan to a small language-neutral IR
(`src/utils/nodeRunner/runTargets/codegen/ir.ts` › `CgModule`) and renders it
per language (`src/utils/nodeRunner/runTargets/codegen/printJs.ts` ›
`printSource`). The output reads like hand-written code: each value is a
READABLE local variable named from its node + handle (e.g. `bitInputOut`,
deduped, reserved-word-safe) by
`src/utils/nodeRunner/runTargets/codegen/nameRegistry.ts` ›
`createNameRegistry`, rather than a `values["nodeId:handleId"]` map entry. A
top-level single-output node declares its value inline
(`const sum = (await functionImplementations["add"](…)).get("Sum")`); values
that escape a structure are hoisted `let`s. Loops render as a real `for` whose
terminal is a single `if (!condition) { …; break }`. A one-time `makeInput` /
`makeOutputs` / `makeContext` helper prelude builds the value-API arguments.
`runGraph` still RETURNS an object keyed by the stable `nodeId:handleId`
(parity + a steady public contract). `target: 'typescript'`
(`codegenTsRunTarget`) adds a typed signature, a `NodeImplementation` alias, and
per-store `as <type>` casts resolved from the codegen metadata registry's
`src/utils/nodeRunner/runTargets/codegen/contract.ts` › `CodegenMetadata`
`dataTypeToTsType` map (data-type id → TS type string, e.g.
`{ numberType: 'number' }`; absent ⇒ `unknown`). All forms stay value-identical
to the in-process executor.

**Inline node templates (`emit`).** Codegen metadata is supplied to the codegen
factory / `emitJs` (NOT on the core `TypeOfNode` / `DataType`) via the
`src/utils/nodeRunner/runTargets/codegen/contract.ts` › `CodegenMetadata`
registry: `nodeTypeMetadata` keyed by node-type id (each a
`src/utils/nodeRunner/runTargets/codegen/contract.ts` › `NodeCodegenMetadata`
with an optional `src/utils/nodeRunner/runTargets/codegen/contract.ts` ›
`CodegenEmitContext`-shaped `emit` hook) and `dataTypeToTsType` keyed by
data-type id. A node type's `emit` renders it as a source EXPRESSION instead of
a value-API call — e.g. an AND gate emitting `Boolean(a) && Boolean(b)` yields
`const gateOut = Boolean(bitInputOut) && Boolean(bitInput2Out);`. The hook
receives each input's source expression (keyed by handle name) and returns an
expression per output handle name; it must cover every output to opt in, and a
throwing or partial `emit` safely falls back to the call form. This is the only
way to inline a node's logic — implementations are otherwise opaque to the
generator (it can call them, not read them). The context also carries
`inputsAll` — each input's array-literal of ALL its fan-in connection
expressions (`[a, b]`) — so a fan-in-aware hook renders the whole array while a
scalar hook uses `inputs` (the first connection). An OPAQUE author hook that
sources an input from `inputs` only is forced to the threaded call form when
that input has a fan-in (codegen cannot prove the hook ignores the rest); a hook
flagged `emitFanInSafe` (set by auto-emit derivation) inlines even under fan-in.

### Codegen v2 — `emitGraph`, optimization passes, auto-emit

`src/utils/nodeRunner/runTargets/codegen/emitGraph.ts` › `emitGraph` is the v2
entry point (async): it runs the `emitJs` string emit above, then opt-in
`ts.transform` optimization passes over the generated TypeScript AST, then
Prettier. `typescript` is a runtime dependency used as the AST substrate, loaded
lazily by `src/utils/nodeRunner/runTargets/codegen/tsLoader.ts` › `loadTs` and
externalized from the library bundle (so the ~8MB compiler is never bundled and
loads only on codegen use).

- **Inline defaults.** An unconnected input handle bakes its current state value
  INLINE (`src/utils/nodeRunner/runTargets/codegen/emitHelpers.ts` ›
  `defaultValueExpression`); there is no `initialInputValues` override object.
- **Dead-code elimination** (`optimize.deadCode`, with
  `assumePureImplementations`):
  `src/utils/nodeRunner/runTargets/codegen/ast/deadCode.ts` ›
  `eliminateDeadCode` drops bindings/blocks no returned value depends on
  (including dead loop/switch/group blocks) via a def-use + liveness fixpoint,
  then cleans the signature — removes unreferenced parameters and `async` when
  no `await` survives.
- **Auto-emit** (`analyzeImplementations: true` + `impls`):
  `src/utils/nodeRunner/runTargets/codegen/analyze/autoEmit.ts` ›
  `deriveAutoEmit` recognizes a self-contained value-API implementation that
  reads inputs via the `src/utils/nodeRunner/readInput.ts` › `readInput`
  intrinsic and returns `new Map([[name, pureExpr]])`, and synthesizes an inline
  `emit` hook for it (so the node inlines instead of threading). An input read
  as `readInput(inputs, "X")[0]` maps to its first-connection expression; the
  whole `readInput(inputs, "X")` maps to the array of ALL its connections, so a
  node that genuinely consumes a fan-in (e.g.
  `readInput(inputs,"In").some(Boolean)`) STILL inlines (rendered
  `[a, b, …].some(Boolean)`) rather than deopting the whole module to the
  threaded harness. A non-`[0]` indexed read (`[1]`, dynamic) is not
  scalarizable and threads. Derived hooks are `emitFanInSafe` by construction
  (they mirror exactly how the impl reads each input). Recognition is AST-based
  and robust to Vite/esbuild transpilation; author `emit` hooks win; anything
  not provably self-contained threads (the safe floor).
- **Loops** emit ONE named variable per loop variable (`let loopValue = …`,
  registry-unique, hoisted) instead of a `currentValues[i]` array
  (`src/utils/nodeRunner/runTargets/codegen/lower.ts` › `lowerLoop`); these
  carries are internal state, excluded from the compat keyed return
  (`src/utils/nodeRunner/runTargets/codegen/ir.ts` › `CgModule`
  `loopCarryNames`).

With root Graph I/O present, `runGraph(<inputs>)` takes the Graph Input handle
names as parameters and returns the Graph Output handles by name (the compiler
detects the root `groupInput` / `groupOutput` and the executor seeds/collects
them as `rootInputs` / `rootOutputs`). The removed legacy variants
(`emitStyle: 'functions'`, per-type `valueApiStyle` / `embed`) stay removed —
the tier model (author `emit` › auto-emit › thread) replaces them.

**Optional optimization (off by default).** Pass
`returnValues: ["nodeId:handleId", …]` to make `runGraph` return only those keys
instead of the whole `values` map; add `assumePureImplementations: true` to also
run dead-code elimination (`src/utils/nodeRunner/runTargets/codegen/passes.ts` ›
`dropDead`), which drops every pure top-level node no returned value depends on
(transitively, to a fixpoint). DCE is sound only when implementations are
side-effect free — the caller asserts that — and is inert with an un-narrowed
return (every key is then a live root). Both options are exposed through
`makeCodegenRunTarget`.

---

## Registering targets & the split Run button

Pass targets to the graph; the runner renders a compact picker next to Run when
more than one target is available:

```tsx
<FullGraph
  state={state}
  dispatch={dispatch}
  functionImplementations={implementations}
  runTargets={[codegenJsRunTarget, codegenTsRunTarget, jsonIrRunTarget]}
  defaultRunTargetId='in-process'
/>
```

`src/components/organisms/FullGraph/FullGraph.tsx` › `FullGraphProps` exposes
`runTargets` and `defaultRunTargetId` (both additive/optional — omitting them
keeps today's single Run button). Active-target selection is controlled OR
uncontrolled, mirroring the rest of the library via the shared
`src/hooks/useControllableState.ts` › `useControllableState` (used by
`useRunTargets`). The selected target is handed to
`src/utils/nodeRunner/useNodeRunner.ts` › `useNodeRunner` as `activeRunTarget`,
which dispatches: an `execute` target through the run/step machinery (feeding
the timeline), an `artifact` target single-shot (no timeline, settling back to
idle).

---

## Authoring a custom execute target

An `execute` target can delegate to the built-in executor and post-process, or
hand-build a record with the public `ExecutionRecorder`:

```ts
const loggedRun = makeRunTargetWithAutoInfer({
  id: 'logged',
  label: 'Run + log',
  mode: 'execute',
  run: async (context) => {
    const record = await context.runWithInProcessExecutor();
    console.log('finished', record.status, record.totalDuration);
    return record;
  },
  // Optional — provide runStepwise to enable the step/pause UI for this target.
});
```

---

## Related docs

- `runnerHookDoc.md` — the `useNodeRunner` state machine the targets dispatch
  through.
- `runnerExecutorDoc.md` — the in-process executor the default target adapts.
- `runnerCompilerDoc.md` — how `State` becomes the `ExecutionPlan` targets
  consume.
- `runControlsDoc.md` — the transport bar that hosts the split Run button.
