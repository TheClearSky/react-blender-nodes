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

The library ships two built-in targets — the in-process executor (default,
`execute`) and `json-ir` (`artifact`). Code generation (`codegen-js` /
`codegen-ts`) now ships as a SEPARATE plugin package,
`@theclearsky/react-blender-nodes-codegen`, which registers exactly like any
other target. Consumers register more via `FullGraphProps.runTargets`.

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
  `inProcessRunTarget` and `src/utils/nodeRunner/runTargets/jsonIrRunTarget.ts`
  › `jsonIrRunTarget`, plus the delivery helper
  `src/utils/nodeRunner/runTargets/downloadTextArtifact.ts` ›
  `downloadTextArtifact` and the `src/utils/nodeRunner/readInput.ts` ›
  `readInput` intrinsic (both also re-exported on the `/contract` subpath, for
  the codegen plugin);
- the stable IR/record types the contract references (`ExecutionPlan`,
  `ExecutionRecord`, `ExecutionStepRecord`, `NodeVisualState`,
  `FunctionImplementations`, `ExecutionContext`) plus
  `src/utils/nodeRunner/executionRecorder.ts` › `ExecutionRecorder` — with its
  signature types `RecorderScopeToken`, `StructureParentContext`, and
  `RecorderWarning` — for advanced authors who hand-build records.

Basic authoring needs none of the type names — `makeRunTargetWithAutoInfer`
infers them.

### The `/contract` subpath — a React-free codegen surface

The library publishes a SECOND entry point,
`@theclearsky/react-blender-nodes/contract` (source: `src/contract.ts` ›
`getDataHandleIds`), built separately as `dist/react-blender-nodes-contract.*`.
It re-exports ONLY the runner IR / graph-state types plus the handful of pure
runtime helpers a headless codegen consumer needs — the four executor
classifiers/value helpers (`src/contract.ts` › `findConditionInputId`,
`src/contract.ts` › `qualifiedId`, `src/contract.ts` › `flattenInputs`), the
`src/contract.ts` › `readInput` intrinsic, and `src/contract.ts` ›
`downloadTextArtifact` — and NOTHING from the React/editor surface. Its
value-import graph is React- and `@xyflow/react`-free by construction: the two
handle classifiers are leaf-extracted into
`src/utils/nodeRunner/executor/handleClassifiers.ts` › `getDataHandleIds`
(re-exported from `src/utils/nodeRunner/executor/executionHelpers.ts` ›
`getDataHandleIds` for back-compat), so reaching them never drags in the
node-construction core. The subpath exists so the out-of-tree codegen plugin (or
any headless codegen tool) can consume the runner types + executor classifiers
without depending on React; the built `dist/contract.d.ts` imports
`@xyflow/react` / `immer` / `react` / `zod` as TYPES only (erased at runtime).

This subpath is the ONLY runtime coupling between this library and the
`@theclearsky/react-blender-nodes-codegen` plugin: the plugin peer-depends on
this package and its shipped code imports exclusively from `/contract`, so the
two version and publish independently while staying behavior-compatible. (The
plugin's own Storybook and host-contract tests — dev-time only — additionally
use the root barrel's `compile` / `serializeExecutionPlan`.)

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
  `functionImplementations` — no artifact target needs the impl closures. This
  is exactly the context the codegen plugin consumes.
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

### Code generation — the `@theclearsky/react-blender-nodes-codegen` plugin

Code generation is no longer built into this library. The `codegen-js` /
`codegen-ts` artifact targets — `codegenJsRunTarget`, `codegenTsRunTarget`, and
the `makeCodegenRunTarget` factory, plus the programmatic `emitGraph` / `emitJs`
entry points and the `CodegenMetadata` registry — moved to the separate plugin
package `@theclearsky/react-blender-nodes-codegen`. Install it alongside this
library and register its targets exactly like any other:

```tsx
import {
  codegenJsRunTarget,
  codegenTsRunTarget,
} from '@theclearsky/react-blender-nodes-codegen';

<FullGraph … runTargets={[codegenJsRunTarget, codegenTsRunTarget, jsonIrRunTarget]} />
```

The plugin compiles a graph to a standalone, dependency-free `runGraph`
JavaScript/TypeScript module (nodes → implementation calls, loops → `for`,
switches → `if/else`, groups → nested scoped blocks), with opt-in codegen-v2
optimization passes (dead-code elimination, auto-emit of self-contained
value-API nodes) and an `emitImplementations: 'source'` mode that bakes the node
implementations into the artifact so `runGraph()` runs with no arguments. It
reaches this library only through the React-free `/contract` subpath above.

**For the full codegen reference** — the emitted code shape, the inline-node
`emit` templates, the codegen-v2 passes, and the self-contained-artifact
coverage contract — see the plugin repo's own `codegenDoc.md`. It carries the
source citations for the emitter internals (which now live in that package).

---

## Registering targets & the split Run button

Pass targets to the graph; the runner renders a compact picker next to Run when
more than one target is available. Built-in and plugin targets compose freely:

```tsx
import {
  codegenJsRunTarget,
  codegenTsRunTarget,
} from '@theclearsky/react-blender-nodes-codegen';

<FullGraph
  state={state}
  dispatch={dispatch}
  functionImplementations={implementations}
  runTargets={[codegenJsRunTarget, codegenTsRunTarget, jsonIrRunTarget]}
  defaultRunTargetId='in-process'
/>;
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
hand-build a record with the public `ExecutionRecorder`. Hand-driving
invariants: one recorder instance per run (instances are fully isolated — no
shared or global state); pair every `begin*` with its `complete*`; call
`finalize()` once (leftover pending state is salvaged into the record and
reported through the `onRecorderWarning` constructor option); scope tokens are
single-use — `beginScope(ownerInstancePath)` returns a `RecorderScopeToken` that
`endScope(token, status, values)` consumes (a reused or foreign token throws).
Example:

```ts
const recorder = new ExecutionRecorder();
recorder.start();
const token: RecorderScopeToken = recorder.beginScope(['my-group-instance']);
// ...beginStep/completeStep the inner steps...
const innerRecord = recorder.endScope(token, 'completed', new Map());
```

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
- The `@theclearsky/react-blender-nodes-codegen` plugin's `codegenDoc.md` — the
  codegen targets, the emitter, and the self-contained-artifact contract.
