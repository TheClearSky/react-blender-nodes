# Runner Executor

## Overview

The Runner Executor takes a compiled `ExecutionPlan` (produced by the Runner
Compiler) and runs it. It is the runtime engine that orchestrates value
propagation, function invocation, error handling, and execution recording for
the entire node graph.

The executor is split into a folder of per-responsibility modules
(`src/utils/nodeRunner/executor/`). The two public entry points are re-exported
from `src/utils/nodeRunner/executor/index.ts` › `execute`:

- **Performance / instant mode** (`src/utils/nodeRunner/executor/runAll.ts` ›
  `execute`) — runs all levels sequentially; the steps within each level run
  concurrently via `Promise.allSettled`; returns the complete `ExecutionRecord`
  when done.
- **Debug / step-by-step mode** (`src/utils/nodeRunner/executor/stepByStep.ts` ›
  `executeStepByStep`) — an `AsyncGenerator` that yields after each internal
  step, allowing the caller to inspect intermediate state, pause, and resume.
  Steps run sequentially (one at a time) so each can be individually inspected.

Both modes share the same sub-executors and helpers, parameterised by a single
immutable `ExecutionEnv` object built once per run.

Key responsibilities:

1. Maintain a `ValueStore` (a scoped `Map<qualifiedHandleId, value>`) for all
   computed values during execution.
2. Process concurrency levels sequentially, with the nodes within a level
   running concurrently (instant mode) or sequentially (debug mode).
3. For each standard step: resolve inputs from the `ValueStore`, call the
   user-provided function implementation, validate and store outputs, and record
   timing/values.
4. Drive loop iteration through its five phases with condition checking and
   per-handle value feedback (`executeLoopBlock`).
5. Drive conditional branching by running only the taken branch
   (`executeSwitchBlock`).
6. Execute groups by recursively running their compiled inner plan with a scoped
   `ValueStore` and inner state (`executeGroupScope`).
7. Catch errors, wrap them in `GraphError` with full path traces, and skip
   downstream dependents.
8. Record all execution events via `ExecutionRecorder` for timeline replay.
9. Support cooperative cancellation via `AbortSignal`.

Primary source: `src/utils/nodeRunner/executor/` (folder with per-responsibility
modules); supporting modules `src/utils/nodeRunner/valueStore.ts` ›
`ValueStore`, `src/utils/nodeRunner/errors.ts` › `createGraphError`,
`src/utils/nodeRunner/stepChannel.ts` › `StepChannel`,
`src/utils/nodeRunner/executionRecorder.ts` › `ExecutionRecorder`, and shared
`src/utils/nodeRunner/types.ts` › `ExecutionPlan`.

## Module Map

```
src/utils/nodeRunner/executor/
├── index.ts               Re-exports execute, executeStepByStep, buildNodeInfoMap, ExecutionEnv, NodeInfo
├── runAll.ts              execute() — instant/performance mode
├── stepByStep.ts          executeStepByStep() — debug AsyncGenerator
├── executeOneStep.ts      executeOneStep() — dispatcher by step.kind
├── executeStandardNode.ts executeStandardNode() — single standard node
├── executeLoopBlock.ts    executeLoopBlock() — loop phase orchestration
├── executeSwitchBlock.ts  executeSwitchBlock() — conditional branch selection
├── executeGroupScope.ts   executeGroupScope() — recursive group execution
└── executionHelpers.ts    ExecutionEnv, NodeInfo, Subtree, buildNodeInfoMap, shouldSkipNode,
                           collectNodeIds, recordInputValues, recordOutputValues,
                           recordStructuralNodeCompletion, getStepNodeId/TypeId/TypeName,
                           handleCatchError, initializeDefaultValues, getDataHandleIds,
                           findConditionInputId, resolveConditionValue, buildInnerState

src/utils/nodeRunner/
├── valueStore.ts          ValueStore class, qualifiedId(), flattenInputs()
├── errors.ts              createGraphError(), buildErrorPath(), formatGraphError(), extractErrorMessage()
├── stepChannel.ts         StepChannel — single-item async handshake for debug stepping
├── executionRecorder.ts   ExecutionRecorder class + MonotonicTimer
└── types.ts               ExecutionPlan, ExecutionStep union, records, GraphError, RunSession, ...
```

## Entity-Relationship Diagram

```
┌──────────────────┐       consumes        ┌──────────────────┐
│  ExecutionPlan   │◄──────────────────────│    execute()     │
│                  │                        │ executeStepByStep│
│  levels[][]      │                        └────────┬─────────┘
│  inputResolution │                                 │
│    Map           │                                 │ builds once
│  outputDistribu- │                                 ▼
│    tionMap       │                        ┌──────────────────┐
│  nodeCount       │                        │   ExecutionEnv   │
│  warnings        │                        │  recorder        │
└──────────────────┘                        │  abortSignal     │
                                            │  onNodeStateChange│
┌──────────────────┐       used via env     │  plan, state     │
│  FunctionImple-  │◄──────────────────────│  functionImpls   │
│  mentations      │                        │  nodeInfoMap     │
│  [nodeTypeId]?:  │                        └──────────────────┘
│   (in,out,ctx)   │
│    => Map        │                        ┌──────────────────┐
└──────────────────┘                        │   ValueStore     │
                                            │  store: Map<     │
┌──────────────────┐       produces         │   qualifiedId,   │
│  ExecutionRecord │◄──────────────────────│   value>         │
│  steps[]         │                        │  prefix, parent  │
│  errors[]        │                        └──────────────────┘
│  concurrencyLevels                        ┌──────────────────┐
│  loopRecords     │                        │ExecutionRecorder │
│  switchRecords   │◄──────────────────────│  steps[] errors[]│
│  groupRecords    │                        │  loop/switch/    │
│  finalValues     │                        │   group records  │
│  warmupDuration  │                        │  scopeStack[]    │
│  totalPause-     │                        │  MonotonicTimer  │
│   Duration       │                        └──────────────────┘
└──────────────────┘
                                            ┌──────────────────┐
┌──────────────────┐       wraps            │     NodeInfo     │
│   GraphError     │◄──────────────────────│  data            │
│  message, nodeId │                        │  typeOfNode      │
│  nodeTypeId/Name │                        │  nodeTypeId      │
│  handleId?       │                        │  nodeTypeName    │
│  path[]          │                        │  concurrencyLevel│
│  loopContext?    │                        └──────────────────┘
│  groupContext?   │
│  timestamp       │                        ┌──────────────────┐
│  duration        │       coordinates      │   StepChannel    │
│  originalError   │       debug stepping   │  push()/pull()   │
└──────────────────┘◄──────────────────────│  close()/        │
                                            │   closeWithError │
                                            └──────────────────┘
```

## Functional Dependency Diagram

```
execute()  /  executeStepByStep()
├── new ValueStore()
├── new ExecutionRecorder()
├── buildNodeInfoMap(plan, state)        Build lookup map from plan + state
├── { build ExecutionEnv }               recorder, abortSignal, onNodeStateChange,
│                                         plan, state, functionImplementations, nodeInfoMap
├── { JIT warmup }                        Exercise ValueStore/Map/async paths → warmupDuration
├── recorder.start()
├── initializeDefaultValues(...)          (no-op stub; defaults resolved lazily at resolveInputs)
├── [per level]
│   ├── collectNodeIds(level)             First node ID of each step (for level tracking)
│   ├── recorder.beginLevel()
│   ├── partition steps via shouldSkipNode() → toSkip / toExecute
│   ├── [per skipped step] beginStep() + skipStep(); add to erroredNodes
│   ├── [per executed step]
│   │   instant : await Promise.allSettled(toExecute.map(executeOneStep))
│   │   debug   : await executeOneStep(...) one at a time, then yield
│   │   └── executeOneStep()              Dispatcher by step.kind
│   │       ├── executeStandardNode()
│   │       │   ├── valueStore.resolveInputs()
│   │       │   ├── valueStore.buildOutputInfo()
│   │       │   ├── isStandardNodeType() / hasKey() guards
│   │       │   ├── impl(inputMap, outputInfo, context)
│   │       │   ├── valueStore.set()      (store outputs by handleId)
│   │       │   ├── recorder.beginStep()/completeStep()/errorStep()
│   │       │   ├── recordInputValues() / recordOutputValues()
│   │       │   └── createGraphError() + buildErrorPath()   (on error)
│   │       ├── executeLoopBlock()        (see Loop Execution)
│   │       ├── executeSwitchBlock()      (see Switch Execution)
│   │       └── executeGroupScope()       (see Group Execution)
│   ├── [instant] process rejected results → erroredNodes + handleCatchError()
│   └── recorder.completeLevel()
└── recorder.finalize(status, valueStore.snapshot(), warmupDuration)

executeStepByStep() additionally:
├── standard steps : await executeOneStep(); recorder.pause(); yield { stepRecord, partialRecord }
├── loop/switch/group steps : drive via StepChannel + afterStep callback
│   ├── afterStep()  → recorder.pause(); channel.push({ stepRecord, partialRecord })
│   ├── pull loop    → yield each pushed payload
│   └── channel.close()/closeWithError()
├── recorder.beginStep() commits any pending pause (captures inter-step idle time)
└── recorder.resume() before finalize (closes a dangling pause)
```

## Data Flow Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────────────┐
│ExecutionPlan │────>│ ValueStore (new) │────>│ Level-by-level execution  │
│(from compiler│     │ ExecutionRecorder│     │                           │
│ with levels, │     │ ExecutionEnv     │     │ for each level:           │
│ resolution   │     │ JIT warmup       │     │   partition skip/execute  │
│ maps)        │     └──────────────────┘     │   for each step:          │
└──────────────┘                               │                           │
                                               │   ┌─────────────────────┐ │
┌──────────────┐                               │   │1. Resolve inputs    │ │
│FunctionImple-│                               │   │   from ValueStore   │ │
│mentations    │──────────────────────────────>│   │2. Call function     │ │
│(user-provided│                               │   │   implementation    │ │
│ per nodeType)│                               │   │3. Store outputs     │ │
└──────────────┘                               │   │   in ValueStore     │ │
                                               │   │4. Record step       │ │
┌──────────────┐                               │   │   in Recorder       │ │
│  Graph State │──────────────────────────────>│   └─────────────────────┘ │
│  (read-only) │                               └─────────────┬─────────────┘
└──────────────┘                                             │
                                                             ▼
                                               ┌───────────────────────────┐
                                               │    ExecutionRecord        │
                                               │  steps, errors, timing,   │
                                               │  concurrencyLevels,       │
                                               │  loop/switch/group records│
                                               │  final ValueStore snapshot│
                                               │  warmup + pause durations │
                                               └───────────────────────────┘
```

## Execution Modes

### Instant Execution (`src/utils/nodeRunner/executor/runAll.ts` › `execute`)

`execute()` is an async function that runs the entire plan to completion:

1. Creates a `ValueStore`, `ExecutionRecorder`, an `erroredNodes` set, and the
   `nodeInfoMap` via `buildNodeInfoMap(plan, state)`.
2. Bundles these (plus `plan`, `state`, `functionImplementations`,
   `onNodeStateChange`, `abortSignal`) into a single immutable `ExecutionEnv`.
3. Runs a short **JIT warmup** block (exercising `ValueStore.set/get`, `Map`
   ops, and `Promise.allSettled`) so V8 compiles the hot paths before real
   execution; the elapsed time is captured as `warmupDuration`.
4. Calls `recorder.start()` and the `initializeDefaultValues(...)` stub (a no-op
   — see Limitations).
5. Iterates `plan.levels` sequentially. Before each level, checks
   `abortSignal.aborted`; if set, returns `recorder.finalize('cancelled', ...)`.
6. Within each level, partitions the steps into `toSkip` (any upstream source in
   `erroredNodes`, via `shouldSkipNode`) and `toExecute`. Skipped steps are
   recorded with `beginStep` + `skipStep`, and their node IDs are added to
   `erroredNodes` to propagate the skip.
7. Runs `toExecute` concurrently with `Promise.allSettled(...)`, mapping each to
   `executeOneStep(step, env, valueStore, erroredNodes)`. Rejected results add
   the node to `erroredNodes` and call `handleCatchError`.
8. After all levels complete, returns
   `recorder.finalize(status, valueStore.snapshot(), warmupDuration)` where
   `status` is `'cancelled'` (aborted), `'errored'` (any error), or
   `'completed'`.

Signature (generic over the graph's type parameters; defaults shown elide the
generics):

```ts
function execute(
  plan: ExecutionPlan,
  functionImplementations: FunctionImplementations,
  state: State,
  options: {
    onNodeStateChange: (nodeId: string, state: NodeVisualState) => void;
    abortSignal: AbortSignal;
  },
): Promise<ExecutionRecord>;
```

Note: the maximum loop-iteration count is baked into each `LoopExecutionBlock`
at **compile** time (`compile(state, impls, { maxLoopIterations })`), not passed
to `execute()`.

### Step-by-Step Execution (`src/utils/nodeRunner/executor/stepByStep.ts` › `executeStepByStep`)

`executeStepByStep()` is an `AsyncGenerator` that yields after each internal
step:

1. Same initialization as `execute()` (ValueStore, recorder, env, JIT warmup,
   `recorder.start()`, `initializeDefaultValues`). The JIT warmup block
   exercises `ValueStore.set/get` and `Promise.allSettled`, but — unlike instant
   mode — omits the raw `Map` set/get/delete ops.
2. Levels are iterated sequentially and steps are partitioned/skipped exactly as
   in instant mode, but **steps run one at a time** (no `Promise.allSettled`).
3. For a `'standard'` step: it is awaited via `executeOneStep`, then
   `recorder.pause()` is called and the generator yields
   `{ stepRecord, partialRecord }` where `stepRecord = recorder.getLatestStep()`
   and `partialRecord = recorder.snapshot(...)`.
4. For a `'loop'`, `'switch'`, or `'group'` step: a `StepChannel` is created and
   an `afterStep` callback is passed into `executeOneStep`. Each internal node
   inside the block calls `afterStep`, which pauses the recorder and
   `channel.push(...)` the payload; the generator pulls and yields each payload.
   When the block finishes the channel is closed (`close()` / `closeWithError`).
5. The pause is **not** explicitly resumed after a yield. Instead,
   `recorder.beginStep()` of the next step commits the pending pause, so all
   inter-step time (microtasks, channel teardown, event-loop yields, and user
   idle time) is accumulated into `totalPauseDuration` and excluded from step
   timing via each step's `pauseAdjustment`.
6. On abort or completion, `recorder.resume()` is called to close any dangling
   pause before `recorder.finalize(...)` is returned.

Signature:

```ts
function executeStepByStep(
  plan: ExecutionPlan,
  functionImplementations: FunctionImplementations,
  state: State,
  options: {
    onNodeStateChange: (nodeId: string, state: NodeVisualState) => void;
    abortSignal: AbortSignal;
  },
): AsyncGenerator<
  { stepRecord: ExecutionStepRecord; partialRecord: ExecutionRecord },
  ExecutionRecord
>;
```

Key difference: in debug mode, every node (including the structural nodes and
body nodes of loops/switches/groups) is executed one at a time to enable
per-step inspection, whereas performance mode runs the nodes within a level —
and within loop body / switch branch / group levels — concurrently.

### `ExecutionEnv` (`src/utils/nodeRunner/executor/executionHelpers.ts` › `ExecutionEnv`)

`ExecutionEnv` is the immutable per-run context threaded through every
sub-executor, so individual functions take far fewer parameters:

```ts
type ExecutionEnv = {
  readonly recorder: ExecutionRecorder;
  readonly abortSignal: AbortSignal;
  readonly onNodeStateChange: (nodeId: string, state: NodeVisualState) => void;
  readonly plan: ExecutionPlan;
  readonly state: State;
  readonly functionImplementations: FunctionImplementations;
  readonly nodeInfoMap: ReadonlyMap<string, NodeInfo>;
};
```

For group execution a fresh `innerEnv` is derived with `plan` → `innerPlan`,
`state` → `innerState`, and `nodeInfoMap` → `innerNodeInfoMap`.

### `NodeInfo` and `buildNodeInfoMap`

`buildNodeInfoMap(plan, state)` walks every step in `plan.levels` (recursing
into loop pre/post-stop steps, switch true/false branch steps, and group steps)
and builds a `Map<nodeId, NodeInfo>` used for input resolution and error path
tracing:

```ts
type NodeInfo = {
  data: MinimalNodeData; // node.data (inputs/outputs/nodeTypeUniqueId)
  typeOfNode?: { name?: string };
  nodeTypeId: string;
  nodeTypeName: string;
  concurrencyLevel: number;
};
```

For `'loop'` steps it registers the LoopStart/LoopStop/LoopEnd triplet; for
`'switch'` steps the SwitchStart/SwitchEnd pair; for `'group'` steps the group
node itself (inner subtree nodes are added separately inside
`executeGroupScope`).

## Value Store

The `ValueStore` class (`src/utils/nodeRunner/valueStore.ts` › `ValueStore`) is
the runtime value propagation mechanism. It stores all computed output values
during execution and resolves input values when a node is about to execute.

### `qualifiedId` format (`"nodeId:handleId"`)

All values are stored using a qualified key format produced by `qualifiedId`:

```
"nodeId:handleId"

Examples:
  "node-1:output-0"     Output handle "output-0" of node-1
  "node-3:input-2"      Input handle "input-2" of node-3
```

In group scope, the store carries a `prefix` that is prepended to every key:

```
"groupNodeId>nodeId:handleId"

Nested groups (each createScope adds one ">" segment):
  "group-outer>group-inner>node-1:output-0"
```

`qualifiedId(nodeId, handleId)` warns (outside production) if either ID contains
the reserved characters `:` or `>`, since `:` separates node/handle IDs and `>`
separates scope segments. Using them risks key collisions / data corruption.

### How values are stored and retrieved

```
store.set(nodeId, handleId, value)
  => stores at key: prefix + "nodeId:handleId"

store.get(nodeId, handleId)
  => looks up prefix + "nodeId:handleId"
  => if not found locally, falls back to parent store (group scoping)
  => returns undefined if not found anywhere

store.has(nodeId, handleId)
  => same lookup chain, returns boolean

store.createScope(prefix)
  => returns a new ValueStore with prefix "prefix>" and parent = this
  => (warns if prefix contains ">" or ":")

store.clearScope(prefix)
  => deletes all local entries whose key starts with "prefix>"

store.snapshot()
  => returns a new Map copy of THIS store's local entries (for recording)
```

`ValueStore` operates on `MinimalNodeData` (a structural subset of node data:
`inputs?`, `outputs?`, `nodeTypeUniqueId?`) to avoid importing the full generic
`ConfigurableNode` types and the variance issues that come with them.

### `flattenInputs`

Node inputs may be organized into panels (groups of inputs). `flattenInputs`
flattens this hierarchy into a flat array of individual input handles,
preserving index order. A panel is detected structurally by the presence of an
`inputs` property:

```
Input:  [ input1, { inputs: [input2, input3] }, input4 ]
Output: [ input1, input2, input3, input4 ]
```

This ensures consistent index-based handle resolution regardless of panel
structure.

## Per-Step Execution Flow

`executeStandardNode()` (`src/utils/nodeRunner/executor/executeStandardNode.ts`
› `executeStandardNode`) handles a single standard node. Its `nested?` parameter
optionally carries `loopContext`, `groupContext`, `loopPhase`, `switchContext`,
and `switchPhase` so steps inside loops/switches/groups are recorded with the
correct context. The complete flow:

### 1. Set node visual state to `'running'` and begin the step record

```ts
onNodeStateChange(nodeId, 'running');
const stepIndex = recorder.beginStep({
  nodeId,
  nodeTypeId,
  nodeTypeName,
  concurrencyLevel,
  loopIteration: loopContext?.loopIteration,
  loopStructureId: loopContext?.loopStructureId,
  groupNodeId: groupContext?.groupNodeId,
  groupDepth: groupContext?.groupDepth,
  loopPhase,
  switchPhase,
  switchStructureId: switchContext?.switchStructureId,
});
```

If `nodeInfoMap.get(nodeId)` is missing, a `GraphError` ("Node not found in
state") is recorded via `errorStep` and thrown.

### 2. Resolve inputs from the ValueStore

```ts
const inputMap = valueStore.resolveInputs(
  nodeId,
  nodeInfo.data,
  plan.inputResolutionMap,
  nodeInfoMap,
);
```

Returns `Map<handleName, InputHandleValue>` — see the Input Resolution Algorithm
below.

### 3. Build output handle info

```ts
const outputInfo = valueStore.buildOutputInfo(
  nodeId,
  nodeInfo.data,
  plan.outputDistributionMap,
);
```

Returns `Map<handleName, OutputHandleInfo>` with handle metadata and downstream
connection info.

### 4. Resolve the function implementation (with guards)

```ts
if (isStandardNodeType(nodeTypeId)) {
  // Structural nodes have built-in logic and should never reach here;
  // complete with empty outputs as a safety guard.
  recorder.completeStep(stepIndex, recordInputValues(inputMap), new Map());
  onNodeStateChange(nodeId, 'completed');
  return;
}
if (!hasKey(functionImplementations, nodeTypeId)) {
  /* GraphError + throw */
}
const impl = functionImplementations[nodeTypeId];
if (!impl) {
  /* GraphError + throw */
}
```

`isStandardNodeType` and `hasKey` come from
`src/utils/nodeRunner/groupCompiler.ts` › `isStandardNodeType`. A missing
implementation produces a `GraphError`
(`No function implementation for node type "name" (id)`) with a full
`buildErrorPath(...)` trace, recorded and thrown.

### 5. Call the function implementation

```ts
const context = {
  nodeId,
  nodeTypeId,
  nodeTypeName,
  state,
  loopIteration: loopContext?.loopIteration,
  groupDepth: groupContext?.groupDepth,
  abortSignal,
};
const result = await impl(inputMap, outputInfo, context);
```

The implementation may be sync (returns `Map`) or async (returns
`Promise<Map>`); the `await` handles both.

### 6. Validate the returned output map

```ts
if (!(result instanceof Map)) {
  throw new Error(
    `Function implementation for "${nodeTypeName}" must return a Map, got ${typeof result}`,
  );
}
```

### 7. Store output values (keyed by handle ID)

```ts
for (const [handleName, value] of result) {
  const info = outputInfo.get(handleName);
  if (info) valueStore.set(nodeId, info.handleId, value);
}
```

Outputs are returned keyed by handle **name** but stored under the handle's
runtime **ID**, because downstream resolution looks up by ID.

### 8. Record completion

```ts
recorder.completeStep(
  stepIndex,
  recordInputValues(inputMap),
  recordOutputValues(result, outputInfo),
);
onNodeStateChange(nodeId, 'completed');
```

On any thrown error, the catch block wraps it in a `GraphError` via
`createGraphError()` with a `buildErrorPath()` trace plus the active
`loopContext`/`groupContext`, records it via `recorder.errorStep()`, marks the
node `'errored'`, and re-throws so the caller (`Promise.allSettled` or the
debug-mode `try/catch`) captures it.

## Input Resolution Algorithm

`ValueStore.resolveInputs()` resolves all input values for a node. It is the
core data-flow mechanism.

```
For each input handle in flattenInputs(nodeData.inputs):

  1. Skip handles missing an id OR a name.

  2. dataTypeId = input.inferredDataType?.dataTypeUniqueId
               ?? input.dataType?.dataTypeUniqueId
               ?? ''     (inferred type wins over declared type)

  3. key = qualifiedId(nodeId, handleId)
     entries = inputResolutionMap.get(key)

     CASE A — entries exist (entries.length > 0):
     ┌─────────────────────────────────────────────────────────┐
     │ For each entry (one per incoming edge):                 │
     │   - sourceInfo = nodesById.get(entry.sourceNodeId)      │
     │   - find source output handle metadata                  │
     │   - push InputConnectionValue:                          │
     │       value: this.get(sourceNodeId, sourceHandleId)     │
     │       sourceNodeId, sourceNodeName (typeOfNode.name),   │
     │       sourceNodeTypeId, sourceHandleId, sourceHandleName,│
     │       sourceDataTypeId, edgeId                           │
     │                                                         │
     │ Result InputHandleValue:                                │
     │   connections: [conn1, conn2, ...]  (one per edge)      │
     │   isDefault: false                                      │
     │   handleId, handleName, dataTypeId                      │
     └─────────────────────────────────────────────────────────┘

     CASE B — no edges, but input.allowInput AND input.value !== undefined:
     ┌─────────────────────────────────────────────────────────┐
     │   connections: []                                       │
     │   isDefault: true                                       │
     │   defaultValue: input.value   (user-entered in UI)      │
     │   handleId, handleName, dataTypeId                      │
     └─────────────────────────────────────────────────────────┘

     CASE C — no edges, no allowInput, or value === undefined:
     ┌─────────────────────────────────────────────────────────┐
     │   connections: []                                       │
     │   isDefault: true                                       │
     │   defaultValue: undefined                               │
     │   handleId, handleName, dataTypeId                      │
     └─────────────────────────────────────────────────────────┘

  The result map is keyed by handle **name** (not ID).
```

Fan-in behavior: multiple edges into one handle produce multiple entries in the
`connections` array. The implementation reads individual connections via
`connections[0]`, `connections[1]`, etc., or iterates all of them.

Fan-out is implicit: one output handle's value is read by multiple downstream
nodes, each doing its own `valueStore.get()`.

`buildOutputInfo()` mirrors this: for each output handle it looks up
`outputDistributionMap.get(key)` and produces an `OutputHandleInfo` whose
`connections` array lists each `{ targetNodeId, targetHandleId, edgeId }`.

## FunctionImplementation Contract

```ts
type FunctionImplementation = (
  inputs: ReadonlyMap<string, InputHandleValue>,
  outputs: ReadonlyMap<string, OutputHandleInfo>,
  context: ExecutionContext,
) => Map<string, unknown> | Promise<Map<string, unknown>>;

type FunctionImplementations<NodeTypeUniqueId extends string = string> = {
  [K in Exclude<
    NodeTypeUniqueId,
    (typeof standardNodeTypeNames)[number]
  >]?: FunctionImplementation;
};
```

`FunctionImplementations` is a partial map keyed by node type ID, with the seven
standard node types excluded (`groupInput`, `groupOutput`, `loopStart`,
`loopEnd`, `loopStop`, `switchStart`, `switchEnd`) — those have built-in
execution logic. Implementations are optional; a missing one is a compile-time
warning and only errors if that node is actually reached at runtime.

Use the `makeFunctionImplementationsWithAutoInfer(...)` helper (from
`src/utils/nodeRunner/types.ts` › `makeFunctionImplementationsWithAutoInfer`) to
get full type inference without manual generic annotations.

### `inputs: ReadonlyMap<handleName, InputHandleValue>`

Each entry represents one input handle, keyed by the handle's display **name**.

```ts
type InputHandleValue = {
  connections: ReadonlyArray<InputConnectionValue>;
  // ALWAYS an array:
  //   1 edge  -> 1 entry
  //   N edges -> N entries (fan-in)
  //   0 edges -> empty array (isDefault === true)
  handleId: string; // Runtime handle ID
  handleName: string; // Display name
  dataTypeId: string; // Data type unique ID
  isDefault: boolean; // true when no edges exist
  defaultValue?: unknown; // User-entered value (when isDefault === true)
};

type InputConnectionValue = {
  value: unknown; // The computed value from the source
  sourceNodeId: string; // Source node instance ID
  sourceNodeName: string; // Source node display name (typeOfNodes[..].name)
  sourceNodeTypeId: string; // Source node type ID
  sourceHandleId: string; // Source output handle ID
  sourceHandleName: string; // Source output handle display name
  sourceDataTypeId: string; // Source output data type ID
  edgeId: string; // Edge ID
};
```

### `outputs: ReadonlyMap<handleName, OutputHandleInfo>`

Metadata about what outputs the function should produce, keyed by handle
**name**.

```ts
type OutputHandleInfo = {
  handleId: string; // Runtime handle ID
  handleName: string; // Display name
  dataTypeId: string; // Data type unique ID
  connections: ReadonlyArray<{
    targetNodeId: string;
    targetHandleId: string;
    edgeId: string;
  }>; // Downstream consumers (fan-out)
};
```

### `context: ExecutionContext`

```ts
type ExecutionContext = {
  nodeId: string; // This node's instance ID
  nodeTypeId: string; // This node's type ID
  nodeTypeName: string; // Display name
  state: Readonly<State>; // Read-only graph state reference
  loopIteration?: number; // Set when inside a loop body
  groupDepth?: number; // Set when inside a group
  abortSignal: AbortSignal; // Cooperative cancellation
};
```

`ExecutionContext` is intentionally **non-generic** (state widened to default
type params): because `context` is a parameter of `FunctionImplementation`
(contravariant position), generic params here would make
`FunctionImplementations<ConcreteType>` invariant and break assignment to
`FunctionImplementations<string>`.

### Return value

A `Map<handleName, value>` where keys are output handle **names** (matching the
`outputs` map) and values are the computed results. May be returned
synchronously or as a `Promise`.

Usage patterns:

```ts
// Single connection:
const a = inputs.get('A')?.connections[0]?.value ?? false;

// Default (unconnected) value:
const input = inputs.get('Value');
const val = input?.isDefault
  ? input.defaultValue
  : input?.connections[0]?.value;

// Fan-in:
const allValues = inputs.get('Items')?.connections.map((c) => c.value) ?? [];

// Return:
return new Map([['Result', computedValue]]);
```

## Loop Execution

`executeLoopBlock()` (`src/utils/nodeRunner/executor/executeLoopBlock.ts` ›
`executeLoopBlock`) handles a `LoopExecutionBlock`: the
LoopStart/LoopStop/LoopEnd triplet plus two ordered sets of body steps —
`preStopSteps` (between LoopStart and LoopStop) and `postStopSteps` (between
LoopStop and LoopEnd).

```ts
type LoopExecutionBlock = {
  kind: 'loop';
  loopStartNodeId: string;
  loopStopNodeId: string;
  loopEndNodeId: string;
  preStopSteps: ReadonlyArray<ExecutionStep>;
  postStopSteps: ReadonlyArray<ExecutionStep>;
  maxIterations: number; // baked in by the compiler (default 100)
  concurrencyLevel: number;
};
```

### Multiple data handles (positional pairing)

A loop can carry **any number** of data handles through its triplet — not just a
single "infer" value. The executor discovers them with `getDataHandleIds(...)`,
which returns every handle whose resolved data type is **not** one of the
structural types in `STRUCTURAL_HANDLE_TYPES` (`bindLoopNodes`, `loopInfer`,
`bindSwitchNodes`, `switchInfer`, `condition`). These data handles are paired
positionally across the triplet:

```
startDataInputIds[i] ↔ startDataOutputIds[i] ↔
  stopDataInputIds[i] ↔ stopDataOutputIds[i] ↔
  endDataInputIds[i]  ↔ endDataOutputIds[i]
```

If the counts mismatch (or there are zero data handles, or no condition input is
found via `findConditionInputId`), a `GraphError` with the per-handle counts is
recorded and thrown. The condition input is located by data type (`condition`),
not by a fixed index.

A `currentValues: unknown[]` array (length = data-handle count) carries the loop
state across iterations.

### Iteration lifecycle (five phases)

Each iteration runs through five `LoopPhase` values —
`'loopStart' | 'preStop' | 'loopStop' | 'postStop' | 'loopEnd'` — recorded on
each step for deterministic timeline ordering and edge-animation control:

```
Initial: for each data handle i, currentValues[i] = upstream value
         (inputResolutionMap entry for the LoopStart input, EXCLUDING any
          feedback edge whose sourceNodeId === loopStopNodeId; only the first
          remaining upstream entry is used).

for iteration = 0 .. maxIterations-1:
  if abortSignal.aborted: break
  recorder.beginLoopIteration(...)

  ── loopStart ──
    Set every LoopStart data output: valueStore.set(start, startDataOutputIds[i], currentValues[i])
    inputSource = iteration === 0 ? 'upstream' : 'feedback'
    Record LoopStart (inputs filtered for display: upstream-only on iter 0,
      feedback-only on iter N>0); await afterStep?.()

  ── preStop ──
    executeBodyLevels(preStopSteps grouped by concurrency level, phase 'preStop')

  ── loopStop ──
    conditionValue = resolveConditionValue(stop, conditionInputId, ...)
      (if ALL condition sources errored → false; else Boolean(valueStore value);
       falls back to an inline allowInput value when there are no edges)
    For each data handle: stopDataValue = first resolved input;
      valueStore.set(stop, stopDataOutputIds[i], stopDataValue); currentValues[i] = stopDataValue
    Record LoopStop; await afterStep?.()

  ── postStop (only if conditionValue === true AND postStopSteps exist) ──
    executeBodyLevels(postStopSteps, phase 'postStop')
    Update currentValues[i] from LoopEnd's resolved data inputs, so post-stop
      transforms feed back into the next iteration.

  ── loopEnd ──
    isExitIteration = !conditionValue
    If exiting: set every LoopEnd data output for downstream consumption.
    Record LoopEnd on EVERY iteration (timeline visibility); record OUTPUT values
      only on the exit iteration (so edge animation shows only on the last pass).
    await afterStep?.()

  lastConditionValue = conditionValue
  recorder.completeLoopIteration(loopStructureId, iteration, conditionValue)
  if !conditionValue: break
```

`loopStructureId === loopStartNodeId`.

### Condition checking (`resolveConditionValue`)

The condition input is found by data type (`condition`) via
`findConditionInputId`. After the pre-stop body runs:

1. Look up the condition source in `inputResolutionMap`.
2. If there are entries and a `bodyErroredNodes` set is supplied where **every**
   condition source errored, the condition is `false` (exit).
3. Otherwise read the first entry's value from the ValueStore and coerce with
   `Boolean(...)`.
4. With no edges, fall back to the handle's inline `allowInput` value
   (`Boolean(handle.value)`), else `false`.

`conditionValue === true` continues to the next iteration; `false` exits.

### Value feedback to LoopStart

Feedback works by excluding the feedback edge during the _initial_ upstream
read, then re-supplying the loop's running values on subsequent iterations:

```
Initial (iteration 0):
  allStartEntries = inputResolutionMap.get(qualifiedId(loopStart, startDataInputIds[i]))
  upstreamEntries = allStartEntries.filter(e => e.sourceNodeId !== loopStopNodeId)
  currentValues[i] = upstreamEntries[0] ? valueStore.get(its source) : undefined

Each iteration:
  LoopStop pass-through (and any post-stop transform via LoopEnd inputs) updates
  currentValues[i]; the next iteration writes currentValues[i] back onto the
  LoopStart data outputs — closing the feedback loop.
```

### Concurrency within the body

In instant mode, body levels run their non-skipped steps via
`Promise.allSettled` (concurrent within a level); levels are processed in
ascending `concurrencyLevel` order. In debug mode (`afterStep` present), body
nodes run sequentially with an `afterStep()` pause/yield after each. Iterations
themselves are always sequential. Body errors are tracked in a per-iteration
`bodyErroredNodes` set and skip downstream body nodes via `shouldSkipNode`.

### Max-iterations limit

If the loop finishes `maxIterations` passes with the condition still `true`
(`lastConditionValue && maxIterations > 0`), a `GraphError`
`"Loop exceeded maximum iterations (N)"` is recorded against LoopStop, LoopEnd
is recorded as errored via `recordStructuralNodeCompletion`, the triplet is
added to `erroredNodes`, the loop structure is completed, and the error is
thrown. The default limit is 100 (`DEFAULT_MAX_LOOP_ITERATIONS`), configurable
at compile time via `options.maxLoopIterations`.

## Switch Execution

`executeSwitchBlock()` (`src/utils/nodeRunner/executor/executeSwitchBlock.ts` ›
`executeSwitchBlock`) handles a `SwitchExecutionBlock`: a SwitchStart/SwitchEnd
pair plus two ordered sets of body steps, one per branch.

```ts
type SwitchExecutionBlock = {
  kind: 'switch';
  switchStartNodeId: string;
  switchEndNodeId: string;
  trueBranchSteps: ReadonlyArray<ExecutionStep>;
  falseBranchSteps: ReadonlyArray<ExecutionStep>;
  concurrencyLevel: number;
};

type SwitchPhase = 'switchStart' | 'trueBranch' | 'falseBranch' | 'switchEnd';
```

### Flow

```
recorder.beginSwitchStructure(switchStructureId, start, end)   // id === switchStartNodeId

Discover data handles (getDataHandleIds) on SwitchStart/SwitchEnd and the
condition input (findConditionInputId on SwitchStart).

SwitchStart outputs are split into two zones — a TRUE zone and a FALSE zone —
each holding `dataHandleCount` handles:
  trueOutputCount = ceil(startDataOutputIds.length / 2)
  trueInputCount  = ceil(endDataInputIds.length  / 2)
Validate: dataHandleCount > 0, endDataOutputIds.length === dataHandleCount,
          conditionInputId present  (else GraphError + throw).

conditionValue = resolveConditionValue(start, conditionInputId, ...)
  (edge value or inline allowInput value, coerced with Boolean)

Resolve each data input → inputValues[i]; write inputValues[i] to BOTH the
true-zone output (index i) and the false-zone output (index trueOutputCount + i)
of SwitchStart. Record SwitchStart with switchPhase 'switchStart' and
branchTaken = conditionValue; await afterStep?.()

branchSteps = conditionValue ? trueBranchSteps : falseBranchSteps
Group branchSteps by concurrency level (ascending). For each level:
  partition skip/execute via shouldSkipNode (branchErroredNodes)
  branchPhase = conditionValue ? 'trueBranch' : 'falseBranch'
  instant : Promise.allSettled over the level
  debug   : sequential with afterStep() after each
  (standard steps run with switchContext + switchPhase; nested loop/switch/group
   steps go through executeOneStep)

Resolve SwitchEnd outputs from the EXECUTED branch's zone:
  branchInputIdx = conditionValue ? i : trueInputCount + i
  value = (entries exist AND source not errored) ? valueStore.get(...) : undefined
  valueStore.set(switchEnd, endDataOutputIds[i], value)

Record SwitchEnd with switchPhase 'switchEnd' and branchTaken = conditionValue;
await afterStep?.()
recorder.completeSwitchStructure(switchStructureId, conditionValue)
Mark SwitchStart/SwitchEnd 'completed'.
```

Only the taken branch executes; the untaken branch's nodes are never run (so
their downstream SwitchEnd outputs resolve to `undefined`). The compiler derives
the branch node sets from the switch's true/false **zones**
(`src/utils/nodeRunner/switchCompiler.ts` › `compileSwitchStructures`).

## Group Execution

`executeGroupScope()` (`src/utils/nodeRunner/executor/executeGroupScope.ts` ›
`executeGroupScope`) handles a `GroupExecutionScope` by recursively executing
its compiled inner plan with a scoped `ValueStore`. `groupDepth` defaults to `1`
and increments by 1 per nesting level.

```ts
type GroupExecutionScope = {
  kind: 'group';
  groupNodeId: string;
  groupNodeTypeId: string;
  groupNodeTypeName: string;
  innerPlan: ExecutionPlan; // recursively compiled subtree
  inputMapping: ReadonlyMap<string, string>; // outer input handleId -> inner GroupInput output handleId
  outputMapping: ReadonlyMap<string, string>; // inner GroupOutput input handleId -> outer output handleId
  concurrencyLevel: number;
};
```

### Setup and validation

1. Mark the group node `'running'`.
2. Validate the group's type exists
   (`hasKey(state.typeOfNodes, groupNodeTypeId)`) and has a `subtree`; either
   failure records a `GraphError` with `groupContext` and throws.
3. **Build inner state**: `buildInnerState(state, subtree)` returns a shallow
   copy of the outer state with `nodes`/`edges` replaced by the subtree's, and
   `openedNodeGroupStack` set to `undefined`. Type definitions (`typeOfNodes`,
   `dataTypes`, etc.) remain shared (they are global). This is what function
   implementations see through `context.state` (the "DC-3" fix).
4. **Build inner nodeInfoMap**: every subtree node (including GroupInput /
   GroupOutput) is registered in `innerNodeInfoMap`; concurrency levels are then
   filled in from the inner plan's standard steps.
5. **Create scoped ValueStore**: `valueStore.createScope(groupNodeId)` → a child
   store with prefix `"groupNodeId>"` that falls back to the parent on reads.

### Input/output value mapping

Index-/handle-based mapping bridges the outer and inner boundaries:

```
Outer group node inputs   --inputMapping-->  GroupInput node outputs (inside subtree)
GroupOutput node inputs (inside subtree)  --outputMapping-->  Outer group node outputs
```

Input mapping (before inner execution): for each
`[outerHandleId, innerHandleId]` in `scope.inputMapping`, look up what feeds the
outer group node's input via `plan.inputResolutionMap`, read that value from the
**parent** store, and `scopedStore.set(groupInputNodeId, innerHandleId, value)`.

Output mapping (after inner execution): for each
`[innerHandleId, outerHandleId]` in `scope.outputMapping`, look up what feeds
GroupOutput's input via `innerPlan.inputResolutionMap`, read that value from the
**scoped** store, and `valueStore.set(groupNodeId, outerHandleId, value)` in the
parent.

`subtree.inputNodeId` / `subtree.outputNodeId` identify the GroupInput /
GroupOutput nodes; mapping is skipped if either is absent.

### Recursive inner execution and scope isolation

1. An `innerEnv` is derived from `env` with `plan = innerPlan`,
   `state = innerState`, `nodeInfoMap = innerNodeInfoMap` (recorder,
   abortSignal, onNodeStateChange, functionImplementations are shared).
2. `recorder.beginGroup(...)` then `recorder.beginScope(instancePath)` — the
   latter returns a single-use scope token capturing the owner's instance path
   plus the current step/error/record counts.
3. Inner levels execute exactly like the outer plan — partition skip/execute,
   then `Promise.allSettled` (instant) or sequential `afterStep` (debug). Nested
   `'group'` steps recurse into `executeGroupScope(..., groupDepth + 1)`; other
   nested blocks go through `executeOneStep`.
4. `recorder.endScope(scopeToken, status, scopedStore.snapshot())` filters out
   **only** the entries the scope's OWNER created (window + instance-path
   ownership — concurrent sibling scopes interleave in the shared arrays, so the
   window alone is not ownership), producing a clean inner `ExecutionRecord`
   (the "BUG #3 / DC-2" fix) which is attached via `recorder.completeGroup(...)`
   alongside the input/output mappings.
5. A structural step for the group node is recorded **after** `endScope()` (so
   it belongs to the outer scope) via `recordStructuralNodeCompletion`. If the
   inner run had errors, the group node is marked `'errored'`, added to the
   outer `erroredNodes`, and a wrapper `GraphError`
   (`Group "name" inner execution had errors`) is recorded; otherwise it is
   marked `'completed'`.

## Error Handling

### GraphError creation with path traces

When a node's function implementation throws (or another execution error
occurs), the error is wrapped in a `GraphError` via `createGraphError()`
(`src/utils/nodeRunner/errors.ts` › `createGraphError`):

```ts
type GraphError = {
  message: string; // extractErrorMessage(thrown)
  nodeId: string; // node where the error occurred
  nodeTypeId: string;
  nodeTypeName: string;
  customName?: string; // user custom name (standard nodes only); rendered as `Custom : Type`
  handleId?: string; // handle where the error manifested (if applicable)
  path: ReadonlyArray<GraphErrorPathEntry>; // upstream chain leading to the error
  loopContext?: {
    loopStructureId: string;
    iteration: number;
    maxIterations: number;
  };
  groupContext?: {
    groupNodeId: string;
    groupNodeTypeId: string;
    depth: number;
  };
  timestamp: number; // ms (typically performance.now() - stepStart at throw)
  duration: number; // step execution time before the error (ms)
  originalError: unknown; // the original thrown value
};
```

`extractErrorMessage` returns `error.message` for `Error`, the string itself for
a string, or `'Unknown error'` otherwise.

`buildErrorPath()` performs a BFS backward through the `inputResolutionMap` to
collect every upstream node that contributed data to the errored node, looking
up each node's `NodeInfo`. The collected path is **reversed** so it reads from
earliest upstream node to the errored node. Each `GraphErrorPathEntry` carries
`{ nodeId, nodeTypeId, nodeTypeName, customName?, handleId?, concurrencyLevel }`
(the optional `customName` is read from the node's `data.customName` so error
paths show `Custom : Type` for named standard nodes).

`formatGraphError()` renders a multi-line string (node, message, `Path:` joined
with `→`, optional `Loop:`/`Group:` lines, and `Duration`) for tooltips/logs.

### Error propagation (skip downstream dependents)

When a node errors, its ID is added to an `erroredNodes` set. Before executing
any subsequent step, `shouldSkipNode()` checks whether any of that step's input
sources are in `erroredNodes`:

```
shouldSkipNode(nodeId, inputResolutionMap, erroredNodes):
  for each [key, entries] in inputResolutionMap:
    colonIdx = key.indexOf(':'); if -1 continue
    targetNodeId = key.substring(0, colonIdx)
    if targetNodeId !== nodeId: continue
    for each entry in entries:
      if erroredNodes.has(entry.sourceNodeId): return true   // skip
  return false   // safe to execute
```

A skipped step is recorded as `'skipped'` and its node ID is **also** added to
`erroredNodes`, propagating the skip transitively. Independent branches (nodes
with no dependency on an errored node) continue executing normally. The same
mechanism applies within loop bodies (`bodyErroredNodes`), switch branches
(`branchErroredNodes`), and group inner plans (`innerErroredNodes`).

### `handleCatchError`

`handleCatchError(e, step, env)` is the orchestration-level catch handler. If
`e` is already a `GraphError` (recognized structurally by having `nodeId`,
`message`, and `timestamp`), it was already recorded by `executeStandardNode`,
so it only ensures the node's visual state is `'errored'`. Otherwise it records
a fresh error step (with an empty path) so unexpected errors are never silently
swallowed.

### Partial results

Execution never aborts entirely on a single error. In instant mode
`Promise.allSettled` captures both fulfilled and rejected results; in debug mode
each step is wrapped in `try/catch`. After all levels complete, the final status
is one of:

- `'completed'` — no errors
- `'errored'` — at least one error occurred
- `'cancelled'` — the `AbortSignal` was triggered

The `ExecutionRecord` contains both successful step records and error records,
enabling partial-result inspection.

## Concurrent Execution

### `Promise.allSettled` per level (instant mode)

The non-skipped steps within a concurrency level have no data dependencies on
each other and run concurrently:

```
Level 0: await Promise.allSettled([exec(A), exec(B)])   // A,B independent
Level 1: await Promise.allSettled([exec(C), exec(D)])   // C,D independent
Level 2: await Promise.allSettled([exec(E)])            // E depends on C,D
```

`Promise.allSettled` (not `Promise.all`) is used because:

- It does not short-circuit on rejection — every step in the level settles.
- Each rejected result is captured and its node added to `erroredNodes`, while
  fulfilled nodes proceed.
- This enables partial execution where independent branches complete even if
  siblings error.

In debug mode (`executeStepByStep`), the steps within a level — and within loop
bodies, switch branches, and group levels — are executed **sequentially** to
allow per-step yielding and inspection. The `afterStep` callback + `StepChannel`
coordinate this lock-step handshake.

### `StepChannel` (`src/utils/nodeRunner/stepChannel.ts` › `StepChannel`)

`StepChannel` is a single-item async channel that synchronizes the debug-mode
generator with the structural executors (loop / switch / group). The execution
function calls `push(payload)` and blocks until the generator `pull()`s it,
creating a lock-step "execute one node, pause, yield, resume" handshake.
`close()` resolves a pending `pull()` with `null` (done); `closeWithError(err)`
rejects it so the generator can rethrow.

## Abort / Cancellation

The executor accepts an `AbortSignal` for cooperative cancellation:

1. Before each level begins, `abortSignal.aborted` is checked. If set, execution
   stops and the record is finalized with status `'cancelled'`. In debug mode
   `recorder.resume()` is called first to close any dangling pause.
2. Inside loop iterations and within body/branch/inner levels, the signal is
   checked before each iteration and before each level (the loop `break`s out).
3. The `AbortSignal` is passed to function implementations via
   `context.abortSignal`, so async implementations can respect cancellation.
4. The executor does **not** forcefully terminate in-flight Promises — it relies
   on implementations and the per-level/per-iteration checks to stop.

## Limitations and Notes

1. **`initializeDefaultValues` is a no-op stub.** Default values are resolved
   lazily at input-resolution time from `node.data` (CASE B in the Input
   Resolution Algorithm), not pre-loaded into the ValueStore. The function is
   kept as an extension point.

2. **Loop body / switch branch / group concurrency.** In instant mode, steps
   within each internal level run concurrently via `Promise.allSettled`; in
   debug mode they run sequentially. Loop iterations are always sequential.

3. **Reserved characters in IDs.** Scoped stores use `"groupNodeId>"` prefixes
   and `"nodeId:handleId"` keys. `qualifiedId` and `createScope` warn (outside
   production) if an ID contains `:` or `>`, which would collide. The ID
   generation system avoids these characters.

4. **Step-by-step granularity.** The generator yields after **every** node
   (standard nodes directly, structural/body nodes via `StepChannel`). There is
   no breakpoint mechanism to yield only at selected nodes (noted as a future
   extension point in the `RunSession` types).

5. **Single-source loop/switch resolution.** For initial loop values, LoopStop
   pass-through, LoopEnd post-stop feedback, and switch data inputs, only the
   **first** resolution entry (`entries[0]` / `upstreamEntries[0]`) is read.
   Multiple incoming edges to those structural data inputs are not aggregated.

6. **Switch resolves untaken outputs to `undefined`.** Only the taken branch
   runs, so SwitchEnd outputs sourced from the untaken branch (or from errored
   sources) resolve to `undefined`.

## Examples

### Basic (instant) execution

```ts
import { compile, execute } from '../nodeRunner';

const plan = compile(state, functionImplementations, {
  maxLoopIterations: 100,
});
const controller = new AbortController();

const record = await execute(plan, functionImplementations, state, {
  onNodeStateChange: (nodeId, visualState) => {
    // Update the UI overlay for this node
  },
  abortSignal: controller.signal,
});

console.log(`Status: ${record.status}`);
console.log(`Steps: ${record.steps.length}`);
console.log(`Errors: ${record.errors.length}`);
console.log(`Warmup: ${record.warmupDuration.toFixed(2)}ms`);
```

### Step-by-step execution

```ts
import { executeStepByStep } from '../nodeRunner';

const gen = executeStepByStep(plan, functionImplementations, state, {
  onNodeStateChange,
  abortSignal: controller.signal,
});

let result = await gen.next();
while (!result.done) {
  const { stepRecord, partialRecord } = result.value;
  // Display step details; wait for the user's "next step" interaction.
  console.log(`Step ${stepRecord.stepIndex}: ${stepRecord.nodeTypeName}`);
  result = await gen.next();
}

const finalRecord = result.value; // ExecutionRecord
```

### Function implementation

```ts
import { makeFunctionImplementationsWithAutoInfer } from '../nodeRunner';

const implementations = makeFunctionImplementationsWithAutoInfer({
  addNode: (inputs) => {
    const a = inputs.get('A')?.connections[0]?.value ?? 0;
    const b = inputs.get('B')?.connections[0]?.value ?? 0;
    return new Map([['Sum', Number(a) + Number(b)]]);
  },
  filterNode: async (inputs) => {
    const items = inputs.get('Items')?.connections.map((c) => c.value) ?? [];
    const threshold = inputs.get('Threshold')?.isDefault
      ? inputs.get('Threshold')?.defaultValue
      : inputs.get('Threshold')?.connections[0]?.value;
    const filtered = items.filter((v) => Number(v) > Number(threshold));
    return new Map([['Result', filtered]]);
  },
});
```

## Relationships with Other Features

### -> [Runner Compiler (produces ExecutionPlan)](runnerCompilerDoc.md)

The executor consumes the `ExecutionPlan` produced by `compile()` in
`src/utils/nodeRunner/compiler.ts` › `compile`. The plan provides:

- `levels`: ordered concurrency levels of `ExecutionStep`s (a discriminated
  union of
  `StandardExecutionStep | LoopExecutionBlock | SwitchExecutionBlock | GroupExecutionScope`).
- `inputResolutionMap`: `"nodeId:handleId"` → incoming edges, for value
  resolution.
- `outputDistributionMap`: `"nodeId:handleId"` → consuming edges, for output
  metadata.
- `nodeCount` and `warnings` for progress tracking and compile-time diagnostics.

Loop/switch/group blocks are compiled by `src/utils/nodeRunner/loopCompiler.ts`
› `compileLoopStructures`, `src/utils/nodeRunner/switchCompiler.ts` ›
`compileSwitchStructures`, and `src/utils/nodeRunner/groupCompiler.ts` ›
`compileGroupScopes` respectively; `maxIterations` is baked into each loop block
(default `DEFAULT_MAX_LOOP_ITERATIONS = 100`).

### -> [Runner Hook (called by useNodeRunner)](runnerHookDoc.md)

`useNodeRunner` is the React hook that orchestrates the full run lifecycle. It
compiles the plan, calls `execute()` or `executeStepByStep()`, manages the
`RunSession` state, and wires `onNodeStateChange` to update `nodeVisualStates`
on the graph canvas.

### -> [Execution Recording (records steps)](executionRecordingDoc.md)

The `ExecutionRecorder` is created by the executor and used throughout execution
to capture per-step timing/value snapshots and errors, per-level timing, loop
iteration records (including nested loops), switch branch records, group inner
execution records (via `beginScope`/`endScope`), and pause durations (debug
mode). Timing uses a `MonotonicTimer` and flags sub-resolution steps via
`estimatedTiming`. The final `ExecutionRecord` is consumed by the
ExecutionTimeline and ExecutionStepInspector for replay.

### -> [Loops (loop execution logic)](../features/loopsDoc.md)

`executeLoopBlock()` handles the LoopStart/LoopStop/LoopEnd triplet across its
five phases. It identifies structural vs. data handles via `getDataHandleIds`,
which treats every type in `STRUCTURAL_HANDLE_TYPES` (`bindLoopNodes`,
`loopInfer`, `bindSwitchNodes`, `switchInfer`, `condition` — sourced from
`standardDataTypeNamesMap`) as structural and everything else as a data handle;
for a loop the relevant ones are `bindLoopNodes`, `loopInfer`, and `condition`.
Body steps are compiled by `src/utils/nodeRunner/loopCompiler.ts` ›
`compileLoopStructures` and embedded as `preStopSteps` / `postStopSteps` in the
`LoopExecutionBlock`.

### -> Switches (conditional branch logic)

`executeSwitchBlock()` (`src/utils/nodeRunner/executor/executeSwitchBlock.ts` ›
`executeSwitchBlock`) handles the SwitchStart/SwitchEnd pair, runs only the
taken branch, and bridges SwitchStart's true/false output zones to SwitchEnd's
matching input zone. Branch node sets come from the switch's true/false zones,
compiled by `src/utils/nodeRunner/switchCompiler.ts` ›
`compileSwitchStructures`. Structural data types `bindSwitchNodes`,
`switchInfer`, and `condition` are excluded from data-handle discovery.

### -> [Node Groups (group execution logic)](../features/nodeGroupsDoc.md)

`executeGroupScope()` handles group nodes by recursively executing their inner
plan. It builds an `innerState` (subtree nodes/edges, shared type definitions),
a scoped `ValueStore`, and an `innerNodeInfoMap`, and uses
`recorder.beginScope(instancePath)`/`endScope(token, …)` for isolated,
ownership-filtered recording. Handle mappings come from
`GroupExecutionScope.inputMapping` / `outputMapping`, compiled by
`src/utils/nodeRunner/groupCompiler.ts` › `compileGroupScopes`.

### -> Function Implementations (user-provided)

The executor calls user-provided `FunctionImplementation` functions for each
standard node, looked up by `nodeTypeId` in the `FunctionImplementations` map.
The seven standard node types (`groupInput`, `groupOutput`, `loopStart`,
`loopEnd`, `loopStop`, `switchStart`, `switchEnd`) are excluded — they have
built-in execution logic in the executor itself.

### -> [State Management (reads state for node info)](../core/stateManagementDoc.md)

The executor reads `state.nodes`, `state.typeOfNodes`, and subtree data from the
graph state. The state is passed read-only to function implementations via
`context.state`. For group execution, `buildInnerState()` produces a view with
the subtree's nodes/edges (and `openedNodeGroupStack: undefined`) while sharing
type definitions from the outer state.
