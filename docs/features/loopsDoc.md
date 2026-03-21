# Loops

## Overview

Loops enable iterative computation within the react-blender-nodes graph system.
They are implemented as a **triplet** of standard nodes — `loopStart`,
`loopStop`, and `loopEnd` — that work together to define a loop structure. The
triplet is bound together by structural `bindLoopNodes` connections and carries
data through `loopInfer` handles.

On each iteration the loop body (nodes between loopStart and loopStop) executes,
then loopStop checks a boolean `condition` input: if `true`, the current output
is fed back to loopStart and the body runs again; if `false`, the output passes
through loopEnd to downstream nodes.

Key facts:

- Loop nodes are **standard nodes** registered alongside groupInput/groupOutput
  in `standardNodeTypes`.
- `bindLoopNodes` edges are **structural only** (`noEquivalent` underlying type,
  max 1 connection) — they carry no data at runtime.
- `loopInfer` handles use `inferFromConnection` and resolve to the concrete type
  of whatever is connected.
- When an infer handle on any loop node gets connected, **duplicate infer
  handles are added across all three triplet nodes** so additional data channels
  can be wired.
- Loop connection validation enforces region isolation: nodes inside the loop
  body cannot connect to nodes outside without going through the triplet.
- At execution time, loops are compiled into `LoopExecutionBlock` objects and
  executed by the executor with per-iteration recording.

## Entity-Relationship Diagram

```
                   bindLoopNodes          bindLoopNodes
  ┌───────────┐   (structural)   ┌───────────┐   (structural)   ┌───────────┐
  │ loopStart │ ────────────────>│ loopStop  │ ────────────────>│  loopEnd  │
  └───────────┘                  └───────────┘                  └───────────┘
    │  ^                           │  ^    │                       │
    │  │                           │  │    │                       │
    │  │  infer (feedback)         │  │    │  infer (exit)         │  infer
    │  └───────────────────────────┘  │    └───────────────────────┘  (downstream)
    │                                 │
    │  infer (to body)                │  condition (boolean)
    v                                 │
  [body nodes] ───────────────────────┘
```

## Functional Dependency Diagram

```
isLoopConnectionValid
├── isLoopNode
├── getLoopStructureFromNode
│   └── getHandleFromNodeDataFromIndices (follows bindLoopNodes edges)
├── getNodesInLoopRegion
│   └── bidirectional BFS between boundary loop nodes
├── getAllReachableNodes
├── verifyLoopStructureUniformHandleInference
│   └── getAllHandlesFromNodeData
├── verifyParentLoopRegionsAreValid
│   └── getBoundaryLoopNodesOfNode
└── getResultantDataTypeOfHandleConsideringInferredType

addDuplicateHandlesToLoopNodesAfterInference
├── isLoopNode
├── getLoopNodeInferHandleIndex
├── constructTypeOfHandleFromIndices
└── insertOrDeleteHandleInNodeDataUsingHandleIndices

canRemoveLoopNodesAndEdges
├── isLoopNode
├── getLoopStructureFromNode
└── getHandleFromNodeDataMatchingHandleId

compileLoopStructures
├── getLoopStructureFromNode
├── getNodesInLoopRegion
├── topologicalSortWithLevels
├── compileGroupScopes (for group instances inside loop body)
└── isBindLoopNodesEdge

executeLoopBlock
├── flattenInputs / buildOutputInfo
├── ValueStore (get/set per iteration)
├── ExecutionRecorder (loop structure + iteration recording)
├── executeStandardNode (body step execution)
└── executeOneStep (nested loops/groups in body)
```

## Data Flow Diagram

```
                            ┌─────────────────────────────────────────────┐
                            │              LOOP STRUCTURE                  │
                            │                                             │
  upstream ──> [infer in]──>│  loopStart ──> [body nodes] ──> loopStop   │──> loopEnd ──> downstream
                            │      ^                           │  │       │
                            │      │         feedback          │  │       │
                            │      └───────────────────────────┘  │       │
                            │                                     │       │
                            │              condition (bool) ──────┘       │
                            └─────────────────────────────────────────────┘

  Data:      upstream_val ──> body ──> result ──> condition check
                                                    │
                                         true: result ──> loopStart (next iter)
                                         false: result ──> loopEnd ──> downstream
```

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          STATE MANAGEMENT                               │
│                                                                         │
│  standardNodes.ts          loops.ts             constructAndModifyHandles│
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────┐   │
│  │ loopStart    │    │ isLoopNode()     │    │ addEdgeWithType-     │   │
│  │ loopStop     │    │ isLoopConnection │    │ Checking()           │   │
│  │ loopEnd      │    │   Valid()        │    │   calls              │   │
│  │ handle index │    │ getLoopStructure │    │   isLoopConnection   │   │
│  │ constants    │    │   FromNode()     │    │   Valid()            │   │
│  │ data types:  │    │ getNodesInLoop   │    └──────────────────────┘   │
│  │  loopInfer   │    │   Region()       │                               │
│  │  condition   │    │ addDuplicate     │    newOrRemovedEdgeValidation  │
│  │  bindLoop    │    │   HandlesToLoop  │    ┌──────────────────────┐   │
│  │  Nodes       │    │   NodesAfter     │    │ inferTypesAfter-     │   │
│  └──────────────┘    │   Inference()    │    │ EdgeAddition()       │   │
│                      │ canRemoveLoop    │    │   calls              │   │
│                      │   NodesAndEdges()│    │   addDuplicate-      │   │
│                      └──────────────────┘    │   HandlesToLoop-     │   │
│                                              │   NodesAfter-        │   │
│                                              │   Inference()        │   │
│                                              └──────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│                            RUNNER                                       │
│                                                                         │
│  loopCompiler.ts              executor.ts              types.ts         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐   │
│  │ compileLoop-     │    │ executeLoopBlock()│    │ LoopExecution-  │   │
│  │   Structures()   │───>│   per-iteration   │    │   Block         │   │
│  │ isBindLoopNodes  │    │   body execution  │    │ LoopIteration-  │   │
│  │   Edge()         │    │   condition check │    │   Record        │   │
│  └──────────────────┘    │   feedback/exit   │    │ LoopRecord      │   │
│                          └──────────────────┘    └─────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│                          UI / GRAPH                                      │
│                                                                         │
│  FullGraph.tsx                                                          │
│  ┌──────────────────────────────────────────┐                           │
│  │ onBeforeDelete calls                     │                           │
│  │   canRemoveLoopNodesAndEdges()           │                           │
│  │ to prevent partial loop triplet deletion │                           │
│  └──────────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## The Loop Triplet

### loopStart

The entry point of the loop. Receives initial data from upstream on its infer
input handle. On each iteration, copies its input value to its infer output
handle for the body nodes to consume. On iteration 0, the input comes from
upstream; on subsequent iterations, the input is the feedback value from
loopStop.

**Handles:**

- `input[0]` — infer (loopInfer) — receives upstream data or feedback from
  loopStop
- `output[0]` — bindLoopNodes — structural connection to loopStop
- `output[1]` — infer (loopInfer) — passes data into the loop body

### loopStop

The loop control node. Receives the body's output on its infer input and a
boolean condition. If condition is `true`, the loop continues (output is fed
back to loopStart). If condition is `false`, the loop exits (output passes to
loopEnd).

**Handles:**

- `input[0]` — bindLoopNodes — structural connection from loopStart
- `input[1]` — condition (boolean, `allowInput: true`) — "Continue If Condition
  Is True"
- `input[2]` — infer (loopInfer) — receives data from the loop body
- `output[0]` — bindLoopNodes — structural connection to loopEnd
- `output[1]` — infer (loopInfer) — passes data as feedback or exit value

### loopEnd

The exit point. Receives the final value from loopStop when the condition
becomes `false`, and passes it to downstream nodes.

**Handles:**

- `input[0]` — bindLoopNodes — structural connection from loopStop
- `input[1]` — infer (loopInfer) — receives exit value from loopStop
- `output[0]` — infer (loopInfer) — passes value to downstream nodes

### Handle Index Mapping Table

| Node      | Direction | Index | Handle Type   | Data Type     | Purpose                        |
| --------- | --------- | ----- | ------------- | ------------- | ------------------------------ |
| loopStart | input     | 0     | infer         | loopInfer     | Upstream data / feedback       |
| loopStart | output    | 0     | bindLoopNodes | bindLoopNodes | Structural link to loopStop    |
| loopStart | output    | 1     | infer         | loopInfer     | Data into loop body            |
| loopStop  | input     | 0     | bindLoopNodes | bindLoopNodes | Structural link from loopStart |
| loopStop  | input     | 1     | condition     | condition     | Boolean: continue if true      |
| loopStop  | input     | 2     | infer         | loopInfer     | Data from loop body            |
| loopStop  | output    | 0     | bindLoopNodes | bindLoopNodes | Structural link to loopEnd     |
| loopStop  | output    | 1     | infer         | loopInfer     | Feedback value / exit value    |
| loopEnd   | input     | 0     | bindLoopNodes | bindLoopNodes | Structural link from loopStop  |
| loopEnd   | input     | 1     | infer         | loopInfer     | Exit value from loopStop       |
| loopEnd   | output    | 0     | infer         | loopInfer     | Value to downstream            |

Handle index constants are exported from `standardNodes.ts`:

- `loopStartInputInferHandleIndex = 0`
- `loopStartOutputInferHandleIndex = 1`
- `loopStopInputInferHandleIndex = 2`
- `loopStopOutputInferHandleIndex = 1`
- `loopEndInputInferHandleIndex = 1`
- `loopEndOutputInferHandleIndex = 0`

## Standard Data Types for Loops

### loopInfer (`inferFromConnection`)

- **Name:** "Loop Infer"
- **Underlying type:** `inferFromConnection` — resolves to the concrete type of
  the connected handle
- **Color:** `#333333`
- Used on all infer handles across the triplet. When connected, the type is
  inferred from the other end of the connection. All infer handles within a loop
  structure must resolve to the same concrete type (enforced by
  `verifyLoopStructureUniformHandleInference`).

### condition (`boolean`)

- **Name:** "Condition"
- **Underlying type:** `boolean`
- **Color:** `#cca6d6`
- **allowInput:** `true` — users can type a default value in the UI
- Used on loopStop's `input[1]`. When `true`, the loop continues; when `false`,
  it exits.

### bindLoopNodes (`noEquivalent`)

- **Name:** "Bind Loop Nodes"
- **Underlying type:** `noEquivalent` — cannot carry data at runtime
- **Color:** `#8c52d1`
- **maxConnections:** `1` — each bind handle connects to exactly one target
- Structural-only connections that tie the triplet together. The executor skips
  these edges when building data flow adjacency lists.

## Loop Connection Validation

### isLoopConnectionValid

Located in `loops.ts:1379`. This is the primary validation function called by
`addEdgeWithTypeChecking` whenever a new edge involves a loop node.

**Three cases:**

1. **Both nodes are loop nodes:** Validates bindLoopNodes order
   (loopStart→loopStop→loopEnd only). For infer connections between two loop
   nodes, checks that both loop structures exist, have uniform handle inference,
   and that cross-structure connections follow valid patterns (series or
   nesting).

2. **One node is a loop node, one is not:** Validates that:
   - The loop structure is complete (all three triplet nodes connected via
     bindLoopNodes)
   - Handle inference is uniform across the triplet
   - The non-loop node connects to the correct loop node based on its region:
     - Nodes in startToStop region can only connect to/from loopStart or
       loopStop
     - Nodes in stopToEnd region can only connect to/from loopStop or loopEnd
     - Nodes outside the loop can only connect to/from loopStart (input) or
       loopEnd (output)
   - Parent loop regions are consistent (for nested loops)

3. **Neither node is a loop node:** Validates that parent loop regions are
   consistent — both nodes must be in the same loop region or both must be
   outside all loops.

### Valid and Invalid Connection Patterns

**Valid:**

- `upstream → loopStart.input[infer]`
- `loopStart.output[infer] → bodyNode`
- `bodyNode → loopStop.input[infer]`
- `bodyNode → loopStop.input[condition]`
- `loopEnd.output[infer] → downstream`
- `loopStart.output[bindLoopNodes] → loopStop.input[bindLoopNodes]`
- `loopStop.output[bindLoopNodes] → loopEnd.input[bindLoopNodes]`
- `loopEnd.output[infer] → anotherLoopStart.input[infer]` (loops in series)
- `parentLoopStart.output[infer] → childLoopStart.input[infer]` (nested loops)

**Invalid:**

- `loopStart.output[infer] → downstream` (must go through body and loopEnd)
- `upstream → loopStop.input[infer]` (must enter through loopStart)
- `bodyNode → downstream` (must exit through loopStop/loopEnd)
- `loopStart.output[bindLoopNodes] → loopEnd.input[bindLoopNodes]` (wrong order)
- Connecting nodes from different loop regions
- Partially removing loop triplet nodes or bind edges

### canRemoveLoopNodesAndEdges

Located in `loops.ts:1877`. Called by `FullGraph.tsx` in the `onBeforeDelete`
handler.

**Rules:**

- If any loop node in a triplet is being deleted, **all three** must be deleted
  together. Partial deletion is rejected.
- If a `bindLoopNodes` edge between two connected loop nodes is being deleted,
  all three triplet nodes must also be in the deletion set. You cannot
  disconnect a bound triplet without deleting it entirely.

## Dynamic Handle Addition for Loops

### addDuplicateHandlesToLoopNodesAfterInference

Located in `loops.ts:82`. Called during edge addition when type inference occurs
on a loop node's infer handle.

**Mechanism:**

When a `loopInfer` handle on any loop node gets its type inferred (i.e.,
connected to a concrete type), duplicate infer handles are added to that node on
**both** the input and output sides. This allows the user to wire additional
data channels through the loop.

**Process:**

1. Check if the source or target node is a loop node whose handle was just
   inferred
2. For each such loop node:
   - Create a new input handle matching the infer handle template (from
     `constructTypeOfHandleFromIndices`)
   - Insert it at the end of the inputs list
   - Create a new output handle matching the infer handle template
   - Insert it at the end of the outputs list

**Uniform inference enforcement:** The function
`verifyLoopStructureUniformHandleInference` (called during connection
validation) ensures that all three triplet nodes maintain the same number of
inferred handles and that corresponding handles across the triplet have the same
resolved type. Handles can differ by at most 1 count (the one currently being
connected). If the counts diverge too much, the connection is rejected with a
message asking the user to complete existing connections first.

## Loop Region Detection

### getLoopStructureFromNode

Located in `loops.ts:694`. Given any loop node, traverses the `bindLoopNodes`
edges to find the complete triplet.

**Algorithm:**

- If starting from **loopStart**: follows `output[0]` (bindLoopNodes) edge to
  find loopStop, then follows loopStop's `output[0]` to find loopEnd
- If starting from **loopStop**: follows `input[0]` backward to find loopStart,
  follows `output[0]` forward to find loopEnd
- If starting from **loopEnd**: follows `input[0]` backward to find loopStop,
  then follows loopStop's `input[0]` backward to find loopStart
- Returns `undefined` if the triplet is incomplete (missing bind edges or wrong
  node types)

### getNodesInLoopRegion

Located in `loops.ts:404`. Identifies all nodes inside the loop body using
bidirectional BFS.

**Returns two sets:**

- `nodesInRegionStartToStop` — nodes between loopStart and loopStop (the loop
  body)
- `nodesInRegionStopToEnd` — nodes between loopStop and loopEnd

**Algorithm:**

1. **startToStop region:** BFS starting from both loopStart and loopStop
   simultaneously. Traverses forward from loopStart (stopping at loopStop) and
   backward from loopStop (stopping at loopStart). Also traverses backward from
   intermediate nodes to handle zigzag paths. Any loop node encountered (other
   than the boundaries) stops traversal.
2. **stopToEnd region:** Same BFS approach between loopStop and loopEnd
   boundaries.

The bidirectional approach ensures nodes reachable through indirect paths (e.g.,
a node that feeds both forward and backward through non-loop nodes) are
correctly captured.

## Loops in the Runner

### Loop Compilation (`compileLoopStructures`)

Located in `loopCompiler.ts:37`. Called during the compilation phase.

**Steps:**

1. Find all `loopStart` nodes in the graph
2. For each loopStart, resolve the complete triplet via
   `getLoopStructureFromNode`
3. Get body nodes via `getNodesInLoopRegion` (startToStop region)
4. Build adjacency lists for body nodes only, excluding `bindLoopNodes` edges
5. Topologically sort body nodes via `topologicalSortWithLevels`
6. Detect group instances among body nodes and compile them as
   `GroupExecutionScope` steps
7. Package everything into a `LoopExecutionBlock`
8. Return the blocks and the set of all loop-related node IDs (for exclusion
   from the main topological sort)

### Loop Execution (`executeLoopBlock`)

Located in `executor.ts:494`. The core loop execution logic.

**Per-iteration steps:**

1. **Initialize:** Resolve initial value from upstream into loopStart's infer
   input (filtering out the feedback edge from loopStop)
2. **Set loopStart output:** Copy `currentValue` to loopStart's infer output
   handle in the ValueStore
3. **Execute body:** Run body steps grouped by concurrency level, using
   `Promise.allSettled` for steps at the same level
4. **Resolve condition:** Read the boolean from loopStop's condition input. If
   the condition source errored, default to `false`
5. **Resolve loopStop infer:** Read the body output from loopStop's infer input,
   write it to loopStop's infer output
6. **Check condition:**
   - `true` → set `currentValue = stopInferValue`, continue to next iteration
   - `false` → break out of loop
7. **Finalize:** If max iterations exceeded with condition still `true`, throw
   an error. Otherwise, write the final value to loopEnd's output for downstream
   consumption.

**Error handling:** Body node errors are tracked per-iteration. If a condition
source node errored, the condition defaults to `false` (exit). Max iteration
exceeded is a fatal error.

**Recording:** The executor records loop iterations via
`ExecutionRecorder.beginLoopIteration` / `completeLoopIteration`, and records
structural step completions for the triplet nodes after the loop finishes.

### LoopExecutionBlock Type

```typescript
type LoopExecutionBlock = {
  kind: 'loop';
  loopStartNodeId: string;
  loopStopNodeId: string;
  loopEndNodeId: string;
  bodySteps: ReadonlyArray<ExecutionStep>;
  maxIterations: number; // configurable, default 10000
  concurrencyLevel: number; // assigned by main compiler
};
```

### LoopRecord / LoopIterationRecord Types

```typescript
type LoopIterationRecord = {
  iteration: number; // 0-indexed
  startTime: number;
  endTime: number;
  duration: number;
  conditionValue: boolean; // what the condition resolved to
  stepRecords: ReadonlyArray<ExecutionStepRecord>;
};

type LoopRecord = {
  loopStructureId: string; // same as loopStartNodeId
  loopStartNodeId: string;
  loopStopNodeId: string;
  loopEndNodeId: string;
  iterations: ReadonlyArray<LoopIterationRecord>;
  totalIterations: number;
  startTime: number;
  endTime: number;
  duration: number;
};
```

The `ExecutionRecord` stores loop records in
`loopRecords: Map<loopStructureId, LoopRecord>`. Each `ExecutionStepRecord`
inside a loop body has `loopIteration` and `loopStructureId` fields set.

## Per-Iteration Data Flow

```
Iteration 0 (initial):
================================================================

  upstream_value
       │
       v
  LoopStart.input[0] (infer) ──────────────────────────────────┐
       │                                                        │
       │  (value copied to output)                              │
       v                                                        │
  LoopStart.output[1] (infer) ── value_0                        │
       │                                                        │
       v                                                        │
  ┌─────────────────────────────────────┐                       │
  │         BODY NODES                  │                       │
  │  (topologically sorted, execute     │                       │
  │   level by level with concurrency)  │                       │
  │                                     │                       │
  │  nodeA ──> nodeB ──> nodeC          │                       │
  └─────────────────────────────────────┘                       │
       │                    │                                    │
       v                    v                                    │
  LoopStop.input[2]    LoopStop.input[1]                        │
  (infer: body_out)    (condition: bool)                        │
       │                    │                                    │
       │    ┌───────────────┘                                   │
       │    │                                                    │
       v    v                                                    │
  ┌─────────────────┐                                           │
  │ condition=true? │                                           │
  │   YES ──> feedback ──> LoopStart.input[0] (next iteration)  │
  │   NO  ──> exit                                              │
  └─────────────────┘                                           │
       │ (exit)                                                  │
       v                                                        │
  LoopStop.output[1] (infer: body_out)                          │
       │                                                        │
       v                                                        │
  LoopEnd.input[1] (infer)                                      │
       │                                                        │
       v                                                        │
  LoopEnd.output[0] (infer) ──> downstream                      │
                                                                │

Iteration N (N > 0, feedback):
================================================================

  LoopStop.output[1] from iteration N-1 (result_{N-1})
       │
       v
  LoopStart.input[0] (infer, fed back)
       │
       │  (value copied to output)
       v
  LoopStart.output[1] (infer) ── result_{N-1}
       │
       v
  ┌─────────────────────────────────────┐
  │         BODY NODES                  │
  │  (same body, re-executed with       │
  │   new input value)                  │
  └─────────────────────────────────────┘
       │                    │
       v                    v
  LoopStop.input[2]    LoopStop.input[1]
  (infer: result_N)    (condition: bool)
       │                    │
       v                    v
  condition check ──> continue or exit


Value lifecycle across iterations:
================================================================

  iter 0:  upstream_value ──> body ──> result_0
  iter 1:  result_0       ──> body ──> result_1
  iter 2:  result_1       ──> body ──> result_2
  ...
  iter N:  result_{N-1}   ──> body ──> result_N  (condition=false)
  final:   result_N ──> LoopEnd ──> downstream
```

## Limitations and Deprecated Patterns

- **Maximum iterations:** Configurable via `maxLoopIterations` (default 10000).
  If the condition remains `true` after all iterations, an error is thrown.
- **No early break from body:** There is no mechanism for a body node to signal
  an early loop exit. Only the condition handle on loopStop controls loop flow.
- **Condition default on error:** If the node feeding the condition handle
  errors, the condition defaults to `false` (exit). This prevents infinite loops
  on errors but may produce unexpected results.
- **Single data channel per infer slot:** Each infer handle slot carries one
  value. Multiple data channels require multiple infer handles (added via the
  dynamic handle duplication mechanism).
- **No nested loop short-circuit:** Nested loops execute fully independently. An
  outer loop cannot directly inspect or modify an inner loop's iteration state.

## Examples

### Basic counter loop

```
[InitValue: 0] ──> loopStart ──> [Add1] ──> loopStop ──> loopEnd ──> [Display]
                                     │           ^
                                     v           │
                                  [LessThan10] ──┘ (condition)
```

- Iteration 0: 0 → Add1 → 1, LessThan10(1)=true → continue
- Iteration 1: 1 → Add1 → 2, LessThan10(2)=true → continue
- ...
- Iteration 9: 9 → Add1 → 10, LessThan10(10)=false → exit
- Display receives: 10

### Loops in series

```
loopEnd_A.output[infer] ──> loopStart_B.input[infer]
```

The output of one loop feeds directly into the next.

### Nested loops

```
outerLoopStart ──> innerLoopStart ──> [body] ──> innerLoopStop ──> innerLoopEnd ──> outerLoopStop
```

The inner loop triplet sits entirely within the outer loop's body region
(startToStop). The inner loop executes fully on each outer iteration.

## Relationships with Other Features

### -> [Data Types (`loopInfer`, `condition`, `bindLoopNodes`)](../core/dataTypesDoc.md)

Loop-specific data types are registered in `standardDataTypes` in
`standardNodes.ts`. They leverage the existing data type system's support for
`inferFromConnection`, `boolean`, and `noEquivalent` underlying types.

### -> [Handles (dynamic handle addition)](../core/handlesDoc.md)

When infer handles are connected, `addDuplicateHandlesToLoopNodesAfterInference`
uses the handle insertion system
(`insertOrDeleteHandleInNodeDataUsingHandleIndices`) to add new handles to loop
nodes.

### -> [Type Inference (triggers inference on loop nodes)](../core/typeInferenceDoc.md)

Type inference for `inferFromConnection` handles is the standard mechanism. The
loop system adds an additional constraint: all infer handles across the triplet
must resolve to the same concrete type
(`verifyLoopStructureUniformHandleInference`).

### -> [Nodes (standard node types)](../core/nodesDoc.md)

Loop nodes are standard node types (`loopStart`, `loopStop`, `loopEnd`)
registered alongside group nodes. They appear in the context menu under
"Standard Nodes".

### -> [Edges (loop connection validation)](../core/edgesDoc.md)

`isLoopConnectionValid` is called by `addEdgeWithTypeChecking` in
`constructAndModifyHandles.ts` for every new edge. It enforces region isolation,
bind order, and structural integrity.

### -> [State Management (standard nodes registered in state)](../core/stateManagementDoc.md)

Loop node types and data types are part of the standard set merged into every
graph's `typeOfNodes` and `dataTypes`.

### -> [Runner (loop compilation and execution)](../runner/runnerHookDoc.md)

The compiler (`compileLoopStructures`) transforms loop structures into
`LoopExecutionBlock` IR. The executor (`executeLoopBlock`) handles iteration,
condition checking, feedback, and recording.

### -> [Connection Validation (special loop validation)](connectionValidationDoc.md)

Beyond standard type compatibility checks, loop connections undergo region
validation, bind order validation, uniform inference checks, and parent region
consistency checks.
