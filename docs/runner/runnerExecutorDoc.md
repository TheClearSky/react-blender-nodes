# Runner Executor

## Overview

The Runner Executor takes a compiled `ExecutionPlan` (produced by the Runner
Compiler) and runs it. It is the runtime engine that orchestrates value
propagation, function invocation, error handling, and execution recording for
the entire node graph.

The executor supports two modes:

- **Performance mode** (`execute`) — runs all levels sequentially, steps within
  each level concurrently via `Promise.allSettled`, returns the complete
  `ExecutionRecord` when done.
- **Debug mode** (`executeStepByStep`) — an `AsyncGenerator` that yields after
  each step, allowing the caller to inspect intermediate state, pause, and
  resume.

Key responsibilities:

1. Maintain a `ValueStore` (a `Map<qualifiedHandleId, value>`) for all computed
   values during execution.
2. Process concurrency levels sequentially, with nodes within a level running
   concurrently.
3. For each step: resolve inputs from the ValueStore, call the user-provided
   function implementation, validate and store outputs, and record
   timing/values.
4. Handle loop iteration with condition checking and value feedback.
5. Handle group execution by recursively executing inner plans with scoped
   ValueStores.
6. Catch errors, wrap them in `GraphError` with full path traces, and skip
   downstream dependents.
7. Record all execution events via `ExecutionRecorder` for timeline replay.
8. Support cooperative cancellation via `AbortSignal`.

Primary source: `src/utils/nodeRunner/executor.ts`

## Entity-Relationship Diagram

```
┌──────────────────┐       consumes        ┌──────────────────┐
│  ExecutionPlan   │◄──────────────────────│     execute()    │
│                  │                        │ executeStepByStep│
│  levels[][]      │                        └────────┬─────────┘
│  inputResMap     │                                 │
│  outputDistMap   │                                 │ creates
│  nodeCount       │                                 │
│  warnings        │                                 ▼
└──────────────────┘                        ┌──────────────────┐
                                            │   ValueStore     │
┌──────────────────┐       uses             │                  │
│  FunctionImple-  │◄──────────────────────│  store: Map<     │
│  mentations      │                        │   qualifiedId,   │
│                  │                        │   value>         │
│  [nodeTypeId]:   │                        │  prefix, parent  │
│   (in,out,ctx)   │                        └──────────────────┘
│    => Map        │
└──────────────────┘                        ┌──────────────────┐
                                            │ExecutionRecorder │
┌──────────────────┐       produces         │                  │
│  ExecutionRecord │◄──────────────────────│  steps[]         │
│                  │                        │  errors[]        │
│  steps[]         │                        │  loopRecords     │
│  errors[]        │                        │  groupRecords    │
│  loopRecords     │                        │  scopeStack[]    │
│  groupRecords    │                        └──────────────────┘
│  finalValues     │
└──────────────────┘                        ┌──────────────────┐
                                            │    NodeInfo      │
┌──────────────────┐       wraps            │                  │
│   GraphError     │◄──────────────────────│  data, typeOfNode│
│                  │                        │  nodeTypeId      │
│  message, nodeId │                        │  nodeTypeName    │
│  path[], loop/   │                        │  concurrencyLevel│
│  groupContext    │                        └──────────────────┘
│  timestamp       │
│  duration        │
└──────────────────┘
```

## Functional Dependency Diagram

```
execute()
├── buildNodeInfoMap()          Build lookup map from plan + state
├── initializeDefaultValues()   (no-op; defaults resolved at input resolution time)
├── [per level]
│   ├── collectNodeIds()        Collect node IDs for level tracking
│   ├── shouldSkipNode()        Check if upstream errored
│   ├── recorder.beginLevel()
│   ├── [per step via Promise.allSettled]
│   │   └── executeOneStep()    Dispatcher by step.kind
│   │       ├── executeStandardNode()
│   │       │   ├── valueStore.resolveInputs()
│   │       │   ├── valueStore.buildOutputInfo()
│   │       │   ├── impl(inputMap, outputInfo, context)
│   │       │   ├── valueStore.set()           (store outputs)
│   │       │   ├── recorder.beginStep() / completeStep() / errorStep()
│   │       │   ├── recordInputValues()
│   │       │   ├── recordOutputValues()
│   │       │   ├── createGraphError()         (on error)
│   │       │   └── buildErrorPath()           (on error)
│   │       ├── executeLoopBlock()
│   │       │   ├── flattenInputs()            (resolve handle IDs)
│   │       │   ├── recorder.beginLoopStructure()
│   │       │   ├── [per iteration]
│   │       │   │   ├── recorder.beginLoopIteration()
│   │       │   │   ├── valueStore.set()       (LoopStart output)
│   │       │   │   ├── [body steps via Promise.allSettled]
│   │       │   │   │   └── executeStandardNode() / executeOneStep()
│   │       │   │   ├── resolve condition from ValueStore
│   │       │   │   ├── resolve infer value, feed back
│   │       │   │   └── recorder.completeLoopIteration()
│   │       │   ├── valueStore.set()           (LoopEnd output)
│   │       │   ├── recordStructuralNodeCompletion() x3
│   │       │   └── recorder.completeLoopStructure()
│   │       └── executeGroupScope()
│   │           ├── buildInnerState()          (scoped state with subtree)
│   │           ├── valueStore.createScope()   (scoped store)
│   │           ├── map outer inputs → GroupInput outputs
│   │           ├── recorder.beginGroup() / beginScope()
│   │           ├── [inner levels via Promise.allSettled]
│   │           │   └── executeStandardNode() / executeGroupScope() / executeLoopBlock()
│   │           ├── map GroupOutput inputs → outer outputs
│   │           ├── recorder.endScope()
│   │           ├── recorder.completeGroup()
│   │           └── recordStructuralNodeCompletion()
│   └── recorder.completeLevel()
└── recorder.finalize()

executeStepByStep()
├── (same structure as execute, but steps are sequential, not concurrent)
├── [per step] yield { stepRecord, partialRecord }
├── recorder.pause() / resume()  (subtract idle time)
└── recorder.snapshot()          (partial record for each yield)
```

## Data Flow Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────────────┐
│ExecutionPlan │────>│ ValueStore init   │────>│ Level-by-level execution  │
│(from compiler│     │ (empty Map)       │     │                           │
│ with levels, │     └──────────────────┘     │ for each level:           │
│ resolution   │                               │   for each step:          │
│ maps)        │                               │                           │
└──────────────┘                               │   ┌─────────────────────┐ │
                                               │   │1. Resolve inputs    │ │
┌──────────────┐                               │   │   from ValueStore   │ │
│FunctionImple-│                               │   │                     │ │
│mentations    │──────────────────────────────>│   │2. Call function     │ │
│(user-provided│                               │   │   implementation    │ │
│ per nodeType)│                               │   │                     │ │
└──────────────┘                               │   │3. Store outputs     │ │
                                               │   │   in ValueStore     │ │
┌──────────────┐                               │   │                     │ │
│  Graph State │                               │   │4. Record step       │ │
│  (read-only) │──────────────────────────────>│   │   in Recorder       │ │
└──────────────┘                               │   └─────────────────────┘ │
                                               └─────────────┬─────────────┘
                                                             │
                                                             ▼
                                               ┌───────────────────────────┐
                                               │    ExecutionRecord        │
                                               │  (steps, errors, timing,  │
                                               │   loop/group records,     │
                                               │   final ValueStore        │
                                               │   snapshot)               │
                                               └───────────────────────────┘
```

## System Diagram

```
react-blender-nodes
├── Runner Systems
│   ├── Runner Compiler (compiler.ts)
│   │   └── Produces ExecutionPlan
│   │
│   ├── >>> Runner Executor (executor.ts) <<<
│   │   ├── execute()              Performance mode entry point
│   │   ├── executeStepByStep()    Debug mode entry point (AsyncGenerator)
│   │   ├── executeOneStep()       Dispatcher: standard | loop | group
│   │   ├── executeStandardNode()  Single node execution
│   │   ├── executeLoopBlock()     Loop iteration orchestration
│   │   ├── executeGroupScope()    Recursive group execution
│   │   ├── buildNodeInfoMap()     Node metadata lookup
│   │   ├── shouldSkipNode()       Upstream error detection
│   │   └── recordStructuralNodeCompletion()  Loop/group bookkeeping
│   │
│   ├── Value Store (valueStore.ts)
│   │   ├── ValueStore class       Scoped key-value store
│   │   ├── qualifiedId()          "nodeId:handleId" format
│   │   ├── flattenInputs()        Panel-aware input flattening
│   │   ├── resolveInputs()        Input resolution algorithm
│   │   └── buildOutputInfo()      Output metadata builder
│   │
│   ├── Execution Recorder (executionRecorder.ts)
│   │   └── ExecutionRecorder class
│   │       ├── beginStep/completeStep/errorStep/skipStep
│   │       ├── beginLevel/completeLevel
│   │       ├── beginLoopStructure/Iteration, completeLoopIteration/Structure
│   │       ├── beginGroup/completeGroup
│   │       ├── beginScope/endScope  (group isolation)
│   │       ├── pause/resume         (debug mode timing)
│   │       ├── snapshot             (partial records)
│   │       └── finalize             (final record)
│   │
│   ├── Errors (errors.ts)
│   │   ├── createGraphError()     Rich error wrapper
│   │   ├── buildErrorPath()       BFS upstream path trace
│   │   └── formatGraphError()     Human-readable formatter
│   │
│   └── Runner Hook (useNodeRunner.ts)
│       └── Calls execute/executeStepByStep, manages RunSession
│
├── Types (types.ts)
│   ├── ExecutionPlan, ExecutionStep (IR)
│   ├── FunctionImplementation, FunctionImplementations
│   ├── InputHandleValue, InputConnectionValue, OutputHandleInfo
│   ├── ExecutionContext
│   ├── GraphError, GraphErrorPathEntry
│   ├── ExecutionRecord, ExecutionStepRecord
│   ├── LoopRecord, GroupRecord
│   └── RunSession, RunnerState, NodeVisualState
│
└── State Management
    └── Provides graph state (nodes, edges, typeOfNodes)
```

## Execution Modes

### Instant Execution (`execute`)

`execute()` is an async function that runs the entire plan to completion:

1. Creates a `ValueStore`, `ExecutionRecorder`, and `nodeInfoMap`.
2. Iterates through `plan.levels` sequentially (level 0 first, then level 1,
   etc.).
3. Within each level, runs all steps concurrently via `Promise.allSettled`.
4. Before executing a step, checks `shouldSkipNode()` — if any upstream node
   errored, the step is skipped.
5. After all levels complete, returns the finalized `ExecutionRecord`.

Signature:

```
execute(plan, functionImplementations, state, { onNodeStateChange, abortSignal })
  => Promise<ExecutionRecord>
```

### Step-by-Step Execution (`executeStepByStep`)

`executeStepByStep()` is an `AsyncGenerator` that yields after each step:

1. Same initialization as `execute()`.
2. Steps within a level are executed **sequentially** (not concurrently), so
   each step can be individually inspected.
3. After each step, the recorder is paused (`recorder.pause()`), and the
   generator yields `{ stepRecord, partialRecord }`.
4. When the caller resumes the generator, `recorder.resume()` is called — the
   idle time between pause and resume is tracked as `totalPauseDuration` and
   excluded from step timing.
5. Returns the finalized `ExecutionRecord` when all steps are complete.

Signature:

```
executeStepByStep(plan, functionImplementations, state, { onNodeStateChange, abortSignal })
  => AsyncGenerator<{ stepRecord, partialRecord }, ExecutionRecord>
```

Key difference: in debug mode, steps within the same concurrency level run one
at a time to enable per-step inspection, whereas performance mode runs them
concurrently.

## Value Store

The `ValueStore` class (`src/utils/nodeRunner/valueStore.ts`) is the runtime
value propagation mechanism. It stores all computed output values during
execution and resolves input values when a node is about to execute.

### `qualifiedId` format (`"nodeId:handleId"`)

All values are stored using a qualified key format:

```
"nodeId:handleId"

Examples:
  "node-1:output-0"     Output handle 0 of node-1
  "node-3:input-2"      Input handle 2 of node-3
```

In group scope, a prefix is prepended:

```
"groupNodeId>nodeId:handleId"

Nested groups:
  "group-outer>group-inner>node-1:output-0"
```

### How values are stored and retrieved

```
store.set(nodeId, handleId, value)
  => stores at key: prefix + "nodeId:handleId"

store.get(nodeId, handleId)
  => looks up prefix + "nodeId:handleId"
  => if not found locally, falls back to parent store (for group scoping)
  => returns undefined if not found anywhere

store.has(nodeId, handleId)
  => same lookup chain, returns boolean

store.createScope(prefix)
  => returns new ValueStore with prefix "prefix>" and parent = this

store.clearScope(prefix)
  => deletes all entries with key starting with "prefix>"

store.snapshot()
  => returns a read-only copy of the entire Map (for recording)
```

### `flattenInputs`

Node inputs may be organized into panels (groups of inputs). `flattenInputs`
flattens this hierarchy into a flat array of individual input handles:

```
Input:  [ input1, { inputs: [input2, input3] }, input4 ]
Output: [ input1, input2, input3, input4 ]
```

This ensures consistent index-based handle resolution regardless of panel
structure.

## Per-Step Execution Flow

The `executeStandardNode()` function handles a single standard node. Here is the
complete flow:

### 1. Set node visual state to `'running'`

```ts
onNodeStateChange(nodeId, 'running');
```

### 2. Resolve inputs from ValueStore

```ts
const inputMap = valueStore.resolveInputs(
  nodeId,
  nodeInfo.data,
  plan.inputResolutionMap,
  nodeInfoMap,
);
```

Returns `Map<handleName, InputHandleValue>` — see the Input Resolution Algorithm
section below.

### 3. Build `inputMap` and `outputMap`

```ts
const outputInfo = valueStore.buildOutputInfo(
  nodeId,
  nodeInfo.data,
  plan.outputDistributionMap,
);
```

Returns `Map<handleName, OutputHandleInfo>` with handle metadata and downstream
connection info.

### 4. Call function implementation

```ts
const result = await impl(inputMap, outputInfo, context);
```

The implementation may be sync (returns `Map`) or async (returns
`Promise<Map>`). The `await` handles both.

### 5. Validate returned output map

```ts
if (!(result instanceof Map)) {
  throw new Error(
    `Function implementation must return a Map, got ${typeof result}`,
  );
}
```

### 6. Store output values

```ts
for (const [handleName, value] of result) {
  const info = outputInfo.get(handleName);
  if (info) {
    valueStore.set(nodeId, info.handleId, value);
  }
}
```

Output values are stored using the handle's runtime ID (not its name), since
downstream resolution uses IDs.

### 7. Record step

```ts
recorder.completeStep(
  stepIndex,
  recordInputValues(inputMap),
  recordOutputValues(result, outputInfo),
);
onNodeStateChange(nodeId, 'completed');
```

On error, the caught exception is wrapped in a `GraphError` via
`createGraphError()` with a full path trace from `buildErrorPath()`, recorded
via `recorder.errorStep()`, and the node is marked `'errored'`. The error is
then re-thrown so `Promise.allSettled` captures it.

## Input Resolution Algorithm

The `ValueStore.resolveInputs()` method resolves all input values for a node. It
is the core data flow mechanism.

```
For each input handle in the node's flattened inputs:

  1. Skip handles without an id or name.

  2. Build the qualified key: "nodeId:handleId"

  3. Look up edges in inputResolutionMap.get(key):

     CASE A — Edges exist (edges.length > 0):
     ┌─────────────────────────────────────────────────────────┐
     │ For each edge entry:                                    │
     │   - Get source node info from nodesById                 │
     │   - Find source output handle metadata                  │
     │   - Build InputConnectionValue:                         │
     │     {                                                   │
     │       value: valueStore.get(sourceNodeId, sourceHandleId)│
     │       sourceNodeId, sourceNodeName, sourceNodeTypeId,   │
     │       sourceHandleId, sourceHandleName,                 │
     │       sourceDataTypeId, edgeId                          │
     │     }                                                   │
     │                                                         │
     │ Result InputHandleValue:                                │
     │   connections: [conn1, conn2, ...]  (one per edge)      │
     │   isDefault: false                                      │
     │   handleId, handleName, dataTypeId                      │
     └─────────────────────────────────────────────────────────┘

     CASE B — No edges, but allowInput=true AND value defined:
     ┌─────────────────────────────────────────────────────────┐
     │ Result InputHandleValue:                                │
     │   connections: []                                       │
     │   isDefault: true                                       │
     │   defaultValue: input.value  (user-entered in UI)       │
     │   handleId, handleName, dataTypeId                      │
     └─────────────────────────────────────────────────────────┘

     CASE C — No edges, no allowInput or no value:
     ┌─────────────────────────────────────────────────────────┐
     │ Result InputHandleValue:                                │
     │   connections: []                                       │
     │   isDefault: true                                       │
     │   defaultValue: undefined                               │
     │   handleId, handleName, dataTypeId                      │
     └─────────────────────────────────────────────────────────┘

  The result map is keyed by handle **name** (not ID).
```

Fan-in behavior: multiple edges into one handle produce multiple entries in the
`connections` array. The function implementation accesses individual connections
via `connections[0]`, `connections[1]`, etc., or iterates all of them.

Fan-out is implicit: one output handle's value is read by multiple downstream
nodes, each doing their own `valueStore.get()`.

## FunctionImplementation Contract

```
type FunctionImplementation = (
  inputs:  ReadonlyMap<string, InputHandleValue>,
  outputs: ReadonlyMap<string, OutputHandleInfo>,
  context: ExecutionContext,
) => Map<string, unknown> | Promise<Map<string, unknown>>;
```

### `inputs: Map<handleName, InputHandleValue>`

Each entry represents one input handle, keyed by the handle's display **name**.

```
InputHandleValue {
  connections: ReadonlyArray<InputConnectionValue>
    // ALWAYS an array:
    //   1 edge  -> 1 entry
    //   N edges -> N entries (fan-in)
    //   0 edges -> empty array (isDefault=true)
  handleId: string       // Runtime handle ID
  handleName: string     // Display name
  dataTypeId: string     // Data type unique ID
  isDefault: boolean     // true when no edges exist
  defaultValue?: unknown // User-entered value (when isDefault=true)
}

InputConnectionValue {
  value: unknown            // The computed value from the source
  sourceNodeId: string      // Source node instance ID
  sourceNodeName: string    // Source node display name
  sourceNodeTypeId: string  // Source node type ID
  sourceHandleId: string    // Source output handle ID
  sourceHandleName: string  // Source output handle display name
  sourceDataTypeId: string  // Source output data type ID
  edgeId: string            // Edge ID
}
```

### `outputs: Map<handleName, OutputHandleInfo>`

Metadata about what outputs the function should produce, keyed by handle
**name**.

```
OutputHandleInfo {
  handleId: string       // Runtime handle ID
  handleName: string     // Display name
  dataTypeId: string     // Data type unique ID
  connections: ReadonlyArray<{
    targetNodeId: string
    targetHandleId: string
    edgeId: string
  }>                     // Downstream consumers
}
```

### `context: ExecutionContext`

```
ExecutionContext {
  nodeId: string              // This node's instance ID
  nodeTypeId: string          // This node's type ID
  nodeTypeName: string        // Display name
  state: Readonly<State>      // Read-only graph state reference
  loopIteration?: number      // Set when inside a loop body
  groupDepth?: number         // Set when inside a group
  abortSignal: AbortSignal    // Cooperative cancellation
}
```

### Return value

A `Map<handleName, value>` where:

- Keys must be output handle **names** (matching those in the `outputs` map).
- Values are the computed results for each output.
- May be returned synchronously or as a `Promise`.

Usage patterns:

```ts
// Single connection:
const a = inputs.get('A')?.connections[0]?.value ?? false;

// Default value:
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

### Iteration flow

`executeLoopBlock()` handles the three loop structural nodes (LoopStart,
LoopStop, LoopEnd) and the body steps between them.

```
┌─────────────────────────────────────────────────────────┐
│ 1. Resolve handle IDs from loop triplet node data       │
│ 2. Get initial value from upstream (filter feedback edge)│
│ 3. Begin loop recording                                 │
│ 4. Group body steps by concurrency level                │
│                                                         │
│ for iteration = 0 to maxIterations-1:                   │
│   a. Set LoopStart's infer output = currentValue        │
│   b. Execute body steps (level-by-level, concurrent)    │
│   c. Resolve LoopStop condition input                   │
│   d. Resolve LoopStop infer input (pass-through)        │
│   e. Set LoopStop's infer output = pass-through value   │
│   f. currentValue = pass-through value                  │
│   g. if condition == false: break (exit loop)           │
│                                                         │
│ 5. If condition still true after all iterations: error  │
│ 6. Set LoopEnd output = final value                     │
│ 7. Record structural completion for triplet nodes       │
│ 8. Complete loop structure recording                    │
└─────────────────────────────────────────────────────────┘
```

### Condition checking

The condition input is at index 1 in LoopStop's flattened inputs
(`LOOP_STOP_CONDITION_INPUT_INDEX = 1`). After each iteration's body executes:

1. The condition source handle is looked up in the `inputResolutionMap`.
2. If the condition source node errored, condition defaults to `false` (exit
   loop).
3. Otherwise, the raw value is read from the ValueStore and coerced to boolean
   via `Boolean(raw)`.
4. If `conditionValue === true`, the loop continues to the next iteration.
5. If `conditionValue === false`, the loop exits normally.

### Value feedback to LoopStart

The feedback mechanism works by filtering edges:

```
Initial input resolution for LoopStart:
  allStartEntries = inputResolutionMap.get("loopStartId:inferInputId")
  upstreamEntries = allStartEntries.filter(e => e.sourceNodeId !== loopStopNodeId)

  // Only upstream edges are used for the initial value.
  // The feedback edge (LoopStop -> LoopStart) is excluded from initial resolution.
```

On each iteration:

- LoopStop's infer output is set to the body's output value.
- `currentValue` is updated to this value.
- On the next iteration, `currentValue` is set as LoopStart's infer output,
  completing the feedback loop.

### Max iterations limit

If the loop completes `maxIterations` iterations and the condition is still
`true`, a `GraphError` is created with the message
`"Loop exceeded maximum iterations (N)"`. The default limit is 100 (configurable
via `options.maxLoopIterations`).

## Group Execution

### Input/output value mapping

Groups use index-based handle mapping between outer and inner boundaries:

```
Outer Group Node inputs  -->  GroupInput Node outputs (inside subtree)
  input[0]  ──mapped──>  output[0]
  input[1]  ──mapped──>  output[1]
  ...

GroupOutput Node inputs (inside subtree)  -->  Outer Group Node outputs
  input[0]  ──mapped──>  output[0]
  input[1]  ──mapped──>  output[1]
  ...
```

Input mapping: For each entry in `scope.inputMapping`:

1. Look up what feeds the outer group node's input handle via
   `plan.inputResolutionMap`.
2. Read the value from the parent `ValueStore`.
3. Set it as the GroupInput node's output in the scoped `ValueStore`.

Output mapping: After inner execution, for each entry in `scope.outputMapping`:

1. Look up what feeds the GroupOutput's input handle via
   `innerPlan.inputResolutionMap`.
2. Read the value from the scoped `ValueStore`.
3. Set it as the outer group node's output in the parent `ValueStore`.

### Recursive inner plan execution

1. **Build inner state**: `buildInnerState()` creates a copy of the outer state
   with `nodes` and `edges` replaced by the subtree's nodes/edges. Type
   definitions (`typeOfNodes`, `dataTypes`) remain shared since they are global.

2. **Build inner nodeInfoMap**: All subtree nodes (including
   GroupInput/GroupOutput) are added to a separate `innerNodeInfoMap` for error
   path building and input resolution within the group.

3. **Create scoped ValueStore**: `valueStore.createScope(groupNodeId)` creates a
   child store with prefix `"groupNodeId>"`. Reads fall back to the parent store
   if not found locally.

4. **Execute inner levels**: The inner plan's levels are executed the same way
   as the outer plan — level-by-level with `Promise.allSettled`. Inner steps use
   `innerState`, `innerNodeInfoMap`, and the `scopedStore`.

5. **Scope isolation**: `recorder.beginScope()` captures the current step/error
   count. `recorder.endScope()` slices only the entries recorded during the
   scope, producing a clean inner `ExecutionRecord` without contamination from
   outer steps.

6. **Nested groups**: If the inner plan contains group steps,
   `executeGroupScope` is called recursively with `groupDepth + 1`.

## Error Handling

### GraphError creation with path traces

When a node's function implementation throws (or other execution errors occur),
the error is wrapped in a `GraphError`:

```
GraphError {
  message: string           // Extracted from the thrown error
  nodeId: string            // Node where the error occurred
  nodeTypeId: string        // Node type ID
  nodeTypeName: string      // Display name
  handleId?: string         // Handle where error manifested
  path: GraphErrorPathEntry[]  // Upstream chain leading to error
  loopContext?: { loopStructureId, iteration, maxIterations }
  groupContext?: { groupNodeId, groupNodeTypeId, depth }
  timestamp: number         // Duration before error (ms)
  duration: number          // Step execution time (ms)
  originalError: unknown    // The original thrown value
}
```

The `buildErrorPath()` function performs a BFS backward through the
`inputResolutionMap` to trace all upstream nodes that contributed data to the
errored node. The path is reversed so it reads from earliest upstream to the
errored node.

### Error propagation (skip downstream dependents)

When a node errors:

1. The node ID is added to the `erroredNodes` set.
2. Before executing any subsequent step, `shouldSkipNode()` checks if any of the
   step's input sources are in `erroredNodes`.
3. If so, the step is recorded as `'skipped'` and its node ID is also added to
   `erroredNodes`, propagating the skip further downstream.
4. Independent branches (nodes with no dependency on the errored node) continue
   executing normally.

```
shouldSkipNode(nodeId, inputResolutionMap, erroredNodes):
  for each entry in inputResolutionMap where targetNodeId == nodeId:
    if entry.sourceNodeId is in erroredNodes:
      return true   // skip this node
  return false      // safe to execute
```

### Partial results

Execution never aborts entirely on a single error. `Promise.allSettled` captures
both fulfilled and rejected results. After all levels complete, the final status
is:

- `'completed'` — no errors
- `'errored'` — at least one error occurred
- `'cancelled'` — `AbortSignal` was triggered

The `ExecutionRecord` contains both successful step records and error records,
allowing partial result inspection.

## Concurrent Execution

### `Promise.allSettled` per level

Steps within a concurrency level have no data dependencies on each other and run
concurrently:

```
Level 0: await Promise.allSettled([exec(A), exec(B)])   // A,B independent
Level 1: await Promise.allSettled([exec(C), exec(D)])   // C,D independent
Level 2: await Promise.allSettled([exec(E)])             // E depends on C,D
```

`Promise.allSettled` is used instead of `Promise.all` because:

- It does not short-circuit on rejection — all steps in the level complete (or
  fail individually).
- Each rejected result is captured and the errored node is tracked, while
  fulfilled nodes proceed normally.
- This enables partial execution where independent branches complete even if
  siblings error.

In debug mode (`executeStepByStep`), steps within a level are executed
**sequentially** (one at a time) to allow per-step yielding and inspection.

## Abort/Cancellation

The executor accepts an `AbortSignal` for cooperative cancellation:

1. Before each level begins, `abortSignal.aborted` is checked. If true,
   execution stops and the record is finalized with status `'cancelled'`.
2. Inside loop iterations, the signal is checked before each iteration and
   before each body level.
3. The `AbortSignal` is passed to function implementations via
   `context.abortSignal`, allowing async implementations to respect cancellation
   cooperatively.
4. The executor does **not** forcefully terminate running Promises — it relies
   on implementations to check the signal.

## Limitations and Deprecated Patterns

1. **`initializeDefaultValues` is a no-op**: Default values are resolved lazily
   at input resolution time from `node.data`, not pre-loaded into the
   ValueStore.

2. **Loop body concurrency within iterations**: Body steps within a loop
   iteration are grouped by concurrency level and executed concurrently within
   each level (same as top-level execution). However, iterations themselves are
   always sequential.

3. **Group scope prefix collision**: The scoped ValueStore uses `"groupNodeId>"`
   as prefix. If a nodeId happened to contain `">"`, it could theoretically
   collide, but this is prevented by the ID generation system.

4. **No breakpoint support yet**: The step-by-step mode yields after every step.
   There is no mechanism to yield only at specific breakpoints (mentioned as a
   future extensibility point in `RunSession` types).

5. **Fan-in for loop initial value**: Only the first upstream entry is used for
   the initial loop value (`upstreamEntries[0]`). Multiple upstream edges to a
   LoopStart's infer input are not aggregated.

## Examples

### Basic execution

```ts
import { compile } from './compiler';
import { execute } from './executor';

const plan = compile(state, functionImplementations);
const controller = new AbortController();

const record = await execute(plan, functionImplementations, state, {
  onNodeStateChange: (nodeId, visualState) => {
    // Update UI overlay for this node
  },
  abortSignal: controller.signal,
});

console.log(`Status: ${record.status}`);
console.log(`Steps: ${record.steps.length}`);
console.log(`Errors: ${record.errors.length}`);
```

### Step-by-step execution

```ts
import { executeStepByStep } from './executor';

const gen = executeStepByStep(plan, functionImplementations, state, {
  onNodeStateChange,
  abortSignal: controller.signal,
});

let result = await gen.next();
while (!result.done) {
  const { stepRecord, partialRecord } = result.value;
  // Display step details to user, wait for "next step" click
  console.log(`Step ${stepRecord.stepIndex}: ${stepRecord.nodeTypeName}`);
  result = await gen.next();
}

const finalRecord = result.value; // ExecutionRecord
```

### Function implementation

```ts
const implementations = {
  addNode: (inputs, outputs, context) => {
    const a = inputs.get('A')?.connections[0]?.value ?? 0;
    const b = inputs.get('B')?.connections[0]?.value ?? 0;
    return new Map([['Sum', Number(a) + Number(b)]]);
  },
  filterNode: async (inputs, outputs, context) => {
    const items = inputs.get('Items')?.connections.map((c) => c.value) ?? [];
    const threshold = inputs.get('Threshold')?.isDefault
      ? inputs.get('Threshold')?.defaultValue
      : inputs.get('Threshold')?.connections[0]?.value;
    const filtered = items.filter((v) => Number(v) > Number(threshold));
    return new Map([['Result', filtered]]);
  },
};
```

## Relationships with Other Features

### -> [Runner Compiler (consumes ExecutionPlan)](runnerCompilerDoc.md)

The executor consumes the `ExecutionPlan` produced by `compile()` in
`compiler.ts`. The plan provides:

- `levels`: ordered concurrency levels with `ExecutionStep` arrays
- `inputResolutionMap`: edge-to-input mappings for value resolution
- `outputDistributionMap`: output-to-edge mappings for output metadata
- `nodeCount`: total step count for progress tracking

### -> [Runner Hook (called by useNodeRunner)](runnerHookDoc.md)

`useNodeRunner` is the React hook that orchestrates the full run lifecycle. It
calls `execute()` or `executeStepByStep()`, manages the `RunSession` state, and
wires up `onNodeStateChange` to update `nodeVisualStates` on the graph canvas.

### -> [Execution Recording (records steps)](executionRecordingDoc.md)

The `ExecutionRecorder` is created by the executor and used throughout execution
to capture:

- Per-step timing, input/output snapshots, and errors
- Per-level timing
- Loop iteration records with condition values
- Group inner execution records (via scope isolation)
- Pause durations (debug mode)

The final `ExecutionRecord` is consumed by the `ExecutionTimeline` and
`ExecutionStepInspector` components for replay.

### -> [Loops (loop execution logic)](../features/loopsDoc.md)

`executeLoopBlock()` handles the LoopStart/LoopStop/LoopEnd triplet. It uses
handle index constants from `standardNodes.ts` to resolve the infer and
condition handles. Body steps are compiled by `loopCompiler.ts` and embedded in
the `LoopExecutionBlock`.

### -> [Node Groups (group execution logic)](../features/nodeGroupsDoc.md)

`executeGroupScope()` handles group nodes by recursively executing their inner
subtree. It creates scoped ValueStores and uses
`recorder.beginScope()`/`endScope()` for isolated recording. Handle mappings
come from `GroupExecutionScope.inputMapping`/`outputMapping`, compiled by
`groupCompiler.ts`.

### -> Function Implementations (user-provided)

The executor calls user-provided `FunctionImplementation` functions for each
standard node. Implementations are looked up by `nodeTypeId` in the
`FunctionImplementations` map. Standard node types (loop nodes, group boundary
nodes) are excluded — they have built-in execution logic in the executor itself.

### -> [State Management (reads state for node info)](../core/stateManagementDoc.md)

The executor reads `state.nodes`, `state.typeOfNodes`, and subtree data from the
graph state. The state is passed read-only to function implementations via
`context.state`. For group execution, `buildInnerState()` creates a view with
the subtree's nodes/edges while sharing type definitions from the outer state.
