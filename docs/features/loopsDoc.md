# Loops

## Overview

Loops enable iterative computation within the react-blender-nodes graph system.
They are implemented as a **triplet** of standard nodes — `loopStart`,
`loopStop`, and `loopEnd` — that work together to define a loop structure. The
triplet is bound together by structural `bindLoopNodes` connections and carries
data through `loopInfer` handles.

The body of a loop is split into **two regions** by `loopStop`:

- The **Pre-Stop body** (between `loopStart` and `loopStop`) runs every
  iteration _before_ the continue condition is checked.
- The **Post-Stop body** (between `loopStop` and `loopEnd`) runs only when the
  condition is `true` (the continue path), and its results feed back into the
  next iteration.

On each iteration the pre-stop body executes, `loopStop` checks a boolean
`condition` input: if `true`, the post-stop body runs and the result is fed back
to `loopStart` for another iteration; if `false`, the value passes through
`loopEnd` to downstream nodes and the loop ends. These two regions are
first-class **zones** (`Pre-Stop Body` / `Post-Stop Body`); see
[Pre-Stop / Post-Stop body zones](#pre-stop--post-stop-body-zones).

Key facts:

- Loop nodes are **standard nodes** registered alongside
  `groupInput`/`groupOutput`/`switchStart`/`switchEnd` in `standardNodeTypes`
  (`src/utils/nodeStateManagement/standardNodes.ts` › `standardNodeTypes`).
- `bindLoopNodes` edges are **structural only** (`noEquivalent` underlying type,
  `maxConnections: 1`) — they carry no data at runtime.
- `loopInfer` handles use `inferFromConnection` and resolve to the concrete type
  of whatever is connected.
- When an infer handle on any loop node gets connected, the inferred type is
  **propagated to all three triplet nodes** and a fresh `loopInfer` placeholder
  pair (one input + one output) is appended to each, so additional data channels
  can be wired.
- Loop connection validation enforces region isolation: nodes inside a loop
  region cannot connect to nodes outside the region without going through the
  triplet.
- A loop triplet is added via the `ADD_LOOP` action and its data channels are
  renamed/reordered via the `UPDATE_LOOP` action (driven by the Loop edit
  drawer).
- At execution time, loops are compiled into `LoopExecutionBlock` objects and
  executed by `executeLoopBlock` with a five-phase per-iteration lifecycle and
  per-iteration recording.

## Source Files

| File                                                              | Responsibility                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/utils/nodeStateManagement/nodes/loops/index.ts`              | Barrel re-exporting the public loop functions and the `LoopStructure` type             |
| `src/utils/nodeStateManagement/nodes/loops/types.ts`              | `LoopStructure` type (the resolved `{ loopStart, loopStop, loopEnd }` triplet)         |
| `src/utils/nodeStateManagement/nodes/loops/loopIdentification.ts` | `isLoopNode`, `getLoopNodeInferHandleIndex`                                            |
| `src/utils/nodeStateManagement/nodes/loops/loopStructure.ts`      | `getLoopStructureFromNode`, `getBoundaryLoopNodesOfNode`                               |
| `src/utils/nodeStateManagement/nodes/loops/loopRegion.ts`         | `getNodesInLoopRegion`, `getAllReachableNodes`                                         |
| `src/utils/nodeStateManagement/nodes/loops/loopHandleSync.ts`     | `addDuplicateHandlesToLoopNodesAfterInference`                                         |
| `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts`     | `isLoopConnectionValid`, `canRemoveLoopNodesAndEdges`, uniform-inference/region checks |
| `src/utils/nodeStateManagement/standardNodes.ts`                  | Loop node types, loop data types, loop handle-index constants                          |
| `src/utils/nodeStateManagement/zones/zoneLifecycle.ts`            | `createLoopZones` (Pre-Stop / Post-Stop body zones)                                    |
| `src/utils/nodeRunner/loopCompiler.ts`                            | `compileLoopStructures`, `isBindLoopNodesEdge`                                         |
| `src/utils/nodeRunner/executor/executeLoopBlock.ts`               | `executeLoopBlock` (five-phase iteration loop)                                         |
| `src/components/molecules/LoopEditDrawer/`                        | Loop data-channel editor (drives `UPDATE_LOOP`)                                        |

## Entity-Relationship Diagram

```
                   bindLoopNodes          bindLoopNodes
  ┌───────────┐   (structural)   ┌───────────┐   (structural)   ┌───────────┐
  │ loopStart │ ────────────────>│ loopStop  │ ────────────────>│  loopEnd  │
  └───────────┘                  └───────────┘                  └───────────┘
    │  ^                           │  ^    │                       │
    │  │                           │  │    │                       │
    │  │  infer (feedback)         │  │    │  infer (postStop)     │  infer
    │  └───────────────────────────┘  │    └───────────────────────┘  (downstream)
    │                                 │
    │  infer (to preStop body)        │  condition (boolean)
    v                                 │
  [preStop body] ─────────────────────┘     [postStop body] ──> loopEnd
```

## Functional Dependency Diagram

```
isLoopConnectionValid                       (loopValidation.ts)
├── isLoopNode                              (loopIdentification.ts)
├── getResultantDataTypeOfHandleConsideringInferredType
├── getLoopStructureFromNode                (loopStructure.ts)
│   └── getHandleFromNodeDataFromIndices    (follows bindLoopNodes edges)
├── verifyLoopStructureUniformHandleInference
│   └── getAllHandlesFromNodeData
├── getNodesInLoopRegion / findZoneByStructure (zones preferred, BFS fallback)
├── getAllReachableNodes                    (loopRegion.ts)
├── verifyParentLoopRegionsAreValid
│   └── getBoundaryLoopNodesOfNode          (loopStructure.ts)
└── isGroupInputOrOutputNode                (group-boundary special cases)

addDuplicateHandlesToLoopNodesAfterInference (loopHandleSync.ts)
├── isLoopNode
├── addLoopInferDuplicateToNode             (per node)
│   ├── getLoopNodeInferHandleIndex
│   ├── constructTypeOfHandleFromIndices
│   └── insertOrDeleteHandleInNodeDataUsingHandleIndices
├── getLoopStructureFromNode                (find sibling triplet nodes)
└── inferTypeAcrossTheNodeForHandleOfDataType (propagate type to siblings)

canRemoveLoopNodesAndEdges                  (loopValidation.ts)
├── isLoopNode / isSwitchNode
├── getLoopStructureFromNode / getSwitchStructureFromNode
└── getHandleFromNodeDataMatchingHandleId

compileLoopStructures                       (loopCompiler.ts)
├── getLoopStructureFromNode
├── findZoneByStructure (preStop/postStop) / getNodesInLoopRegion (fallback)
├── topologicalSortWithLevels
├── compileGroupScopes (group instances in either body region)
├── isBindLoopNodesEdge (excluded from data-flow adjacency)
└── compileSingleLoop (recursive for nested loops via proxy ids)

executeLoopBlock                            (executor/executeLoopBlock.ts)
├── flattenInputs / getDataHandleIds / findConditionInputId
├── ValueStore (buildOutputInfo / get / set / resolveInputs)
├── ExecutionRecorder (beginLoopStructure / beginLoopIteration / completeLoopIteration / completeLoopStructure)
├── resolveConditionValue (condition; defaults to false on error)
├── executeStandardNode (body step execution)
└── executeOneStep (nested loops/switches/groups in body)
```

## Data Flow Diagram

```
                       ┌──────────────────────────────────────────────────┐
                       │                  LOOP STRUCTURE                    │
                       │                                                    │
  upstream ──>[infer]──>│ loopStart ─> [preStop body] ─> loopStop          │──> loopEnd ──> downstream
                       │     ^                              │  │            │
                       │     │   feedback (postStop result) │  │            │
                       │     └──── [postStop body] <─────────┘  │            │
                       │                                        │            │
                       │              condition (bool) ─────────┘            │
                       └──────────────────────────────────────────────────┘

  Data:  upstream_val ─> preStop body ─> stop pass-through value
                                              │
                              condition=true:  ─> postStop body ─> loopEnd input
                                                 ─> currentValue fed back to loopStart
                              condition=false: ─> currentValue ─> loopEnd output ─> downstream
```

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          STATE MANAGEMENT                                 │
│                                                                           │
│  standardNodes.ts          nodes/loops/            planApply/             │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────┐    │
│  │ loopStart    │    │ isLoopNode()     │    │ validateAddEdge.ts:  │    │
│  │ loopStop     │    │ isLoopConnection │    │   step 7 calls       │    │
│  │ loopEnd      │    │   Valid()        │    │   isLoopConnection   │    │
│  │ handle index │    │ getLoopStructure │    │   Valid()            │    │
│  │ constants    │    │   FromNode()     │    │   -> LOOP_PATH_INVALID│    │
│  │ data types:  │    │ getNodesInLoop   │    │                      │    │
│  │  loopInfer   │    │   Region()       │    │ applyPlan.ts ADD_EDGE│    │
│  │  condition   │    │ addDuplicate     │    │   calls addDuplicate │    │
│  │  bindLoop    │    │   HandlesToLoop  │    │   HandlesToLoopNodes │    │
│  │  Nodes       │    │   NodesAfter     │    │   AfterInference()   │    │
│  └──────────────┘    │   Inference()    │    │ applyPlan.ts ADD_LOOP│    │
│                      │ canRemoveLoop    │    │   builds triplet +   │    │
│                      │   NodesAndEdges()│    │   createLoopZones()  │    │
│                      └──────────────────┘    └──────────────────────┘    │
├─────────────────────────────────────────────────────────────────────────┤
│                            RUNNER                                         │
│                                                                           │
│  loopCompiler.ts              executor/                 types.ts          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐     │
│  │ compileLoop-     │    │ executeLoopBlock()│    │ LoopExecution-  │     │
│  │   Structures()   │───>│  five-phase loop  │    │   Block         │     │
│  │ isBindLoopNodes  │    │  (start/preStop/  │    │ LoopPhase       │     │
│  │   Edge()         │    │   stop/postStop/  │    │ LoopIteration-  │     │
│  │ proxy nesting    │    │   end)            │    │   Record        │     │
│  └──────────────────┘    │  condition check  │    │ LoopRecord      │     │
│                          │  feedback/exit    │    └─────────────────┘     │
│                          └──────────────────┘                            │
├─────────────────────────────────────────────────────────────────────────┤
│                          UI / GRAPH                                       │
│                                                                           │
│  FullGraph.tsx                            LoopEditDrawer/                  │
│  ┌──────────────────────────────────┐    ┌──────────────────────────┐    │
│  │ onBeforeDelete calls             │    │ extractLevelsFromLoop-   │    │
│  │   canRemoveLoopNodesAndEdges()   │    │   Nodes() -> channels    │    │
│  │ (prevents partial triplet del.)  │    │ onSave -> UPDATE_LOOP    │    │
│  └──────────────────────────────────┘    └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## The Loop Triplet

### loopStart

The entry point of the loop. Receives initial data from upstream on its infer
input handle. On each iteration, copies its input value to its infer output
handle for the pre-stop body to consume. On iteration 0, the value comes from
upstream; on subsequent iterations, it is the feedback value carried in
`currentValues` (sourced from `loopStop` pass-through, optionally transformed by
the post-stop body).

**Handles** (defined in `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardNodeTypes`):

- `input[0]` — infer (`loopInfer`) — receives upstream data or feedback
- `output[0]` — `bindLoopNodes` — structural connection to `loopStop`
- `output[1]` — infer (`loopInfer`) — passes data into the pre-stop body

### loopStop

The loop control node. Receives the pre-stop body's output on its infer input
and a boolean condition. If the condition is `true`, the post-stop body runs and
the loop continues; if `false`, the loop exits and the value passes to
`loopEnd`.

**Handles** (defined in `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardNodeTypes`):

- `input[0]` — `bindLoopNodes` — structural connection from `loopStart`
- `input[1]` — `condition` (boolean, `allowInput: true`) — named "Continue If
  Condition Is True"
- `input[2]` — infer (`loopInfer`) — receives data from the pre-stop body
- `output[0]` — `bindLoopNodes` — structural connection to `loopEnd`
- `output[1]` — infer (`loopInfer`) — pass-through value (feeds post-stop body
  and/or `loopEnd`)

### loopEnd

The exit point. Receives the final value from `loopStop` (or from the post-stop
body) when the condition becomes `false`, and passes it to downstream nodes.

**Handles** (defined in `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardNodeTypes`):

- `input[0]` — `bindLoopNodes` — structural connection from `loopStop`
- `input[1]` — infer (`loopInfer`) — receives exit / post-stop value
- `output[0]` — infer (`loopInfer`) — passes value to downstream nodes

### Handle Index Mapping Table

| Node      | Direction | Index | Handle Type     | Data Type       | Purpose                          |
| --------- | --------- | ----- | --------------- | --------------- | -------------------------------- |
| loopStart | input     | 0     | infer           | `loopInfer`     | Upstream data / feedback         |
| loopStart | output    | 0     | `bindLoopNodes` | `bindLoopNodes` | Structural link to `loopStop`    |
| loopStart | output    | 1     | infer           | `loopInfer`     | Data into pre-stop body          |
| loopStop  | input     | 0     | `bindLoopNodes` | `bindLoopNodes` | Structural link from `loopStart` |
| loopStop  | input     | 1     | `condition`     | `condition`     | Boolean: continue if true        |
| loopStop  | input     | 2     | infer           | `loopInfer`     | Data from pre-stop body          |
| loopStop  | output    | 0     | `bindLoopNodes` | `bindLoopNodes` | Structural link to `loopEnd`     |
| loopStop  | output    | 1     | infer           | `loopInfer`     | Pass-through / feedback value    |
| loopEnd   | input     | 0     | `bindLoopNodes` | `bindLoopNodes` | Structural link from `loopStop`  |
| loopEnd   | input     | 1     | infer           | `loopInfer`     | Exit / post-stop value           |
| loopEnd   | output    | 0     | infer           | `loopInfer`     | Value to downstream              |

Handle index constants are exported from
`src/utils/nodeStateManagement/standardNodes.ts` ›
`loopStartInputInferHandleIndex`:

```ts
const loopStartInputInferHandleIndex = 0;
const loopStartOutputInferHandleIndex = 1;
const loopStopInputInferHandleIndex = 2;
const loopStopOutputInferHandleIndex = 1;
const loopEndInputInferHandleIndex = 1;
const loopEndOutputInferHandleIndex = 0;
```

`getLoopNodeInferHandleIndex(nodeType, 'input' | 'output')`
(`src/utils/nodeStateManagement/nodes/loops/loopIdentification.ts` ›
`getLoopNodeInferHandleIndex`) maps a loop node type to the index where its
first infer handle begins. Every infer handle from that index onward (except the
trailing placeholder) is a real data channel.

### LoopStructure type

`src/utils/nodeStateManagement/nodes/loops/types.ts` › `LoopStructure` defines
the resolved triplet returned by `getLoopStructureFromNode`:

```ts
type LoopStructure<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType> = {
  loopStart: State<...>['nodes'][number];
  loopStop: State<...>['nodes'][number];
  loopEnd: State<...>['nodes'][number];
};
```

## Standard Data Types for Loops

Defined in `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardDataTypes`. The standard data type names array also includes
`groupInfer`, `switchInfer`, and `bindSwitchNodes` (used by node groups and
switches).

### loopInfer (`inferFromConnection`)

- **Name:** "Loop Infer"
- **Underlying type:** `inferFromConnection` — resolves to the concrete type of
  the connected handle
- **Color:** `#333333`
- Used on all infer handles across the triplet. When connected, the type is
  inferred from the other end. All infer handles within a loop structure must
  resolve to the same concrete type (enforced by
  `verifyLoopStructureUniformHandleInference`).

### condition (`boolean`)

- **Name:** "Condition"
- **Underlying type:** `boolean`
- **Color:** `#cca6d6`
- **allowInput:** `true` — users can type a default value in the UI
- Used on `loopStop`'s `input[1]`. When `true`, the loop continues; when `false`
  it exits.

### bindLoopNodes (`noEquivalent`)

- **Name:** "Bind Loop Nodes"
- **Underlying type:** `noEquivalent` — cannot carry data at runtime
- **Color:** `#8c52d1`
- **maxConnections:** `1` — each bind handle connects to exactly one target
- Structural-only connections that tie the triplet together. The compiler skips
  these edges (`isBindLoopNodesEdge`) when building data-flow adjacency lists.

## Loop Connection Validation

### isLoopConnectionValid

Located at `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts` ›
`isLoopConnectionValid`. It is invoked as **step 7** of the 13-step edge
gauntlet in `src/utils/nodeStateManagement/planApply/validateAddEdge.ts` ›
`validateAddEdge`; when it rejects, `validateAddEdge` returns a
`ValidationError` with code `LOOP_PATH_INVALID`. (It is also still called from
the legacy `addEdgeWithTypeChecking` path in
`src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`addEdgeWithTypeChecking`, which is test-only.) The state passed in is
**scope-correct** — when editing inside a node group, `validateAddEdge` rebinds
`nodes`/`edges`/`zones` to that subtree before calling.

**Three cases:**

1. **Both nodes are loop nodes.** If either handle is `bindLoopNodes`, only the
   order `loopStart→loopStop` and `loopStop→loopEnd` is accepted. For infer
   connections between two loop nodes, both loop structures must resolve and
   pass `verifyLoopStructureUniformHandleInference`. Cross-structure infer
   connections are only allowed when:
   - one loop's `loopEnd.output` feeds another loop's `loopStart.input` (loops
     in **series**), or
   - one loop's triplet sits inside the other's body region (**nesting**) — the
     child loop's nodes are ignored when checking parent regions.

   Same-structure infer connections must still follow
   `loopStart→loopStop→loopEnd` order.

2. **Exactly one node is a loop node.** Validates that:
   - The loop structure is complete (all three triplet nodes connected via
     `bindLoopNodes`) — otherwise "Can't connect to incomplete loop structure".
   - Handle inference is uniform across the triplet.
   - The non-loop node connects to the correct loop node based on which region
     it lives in. Region membership prefers the loop's **zones**
     (`findZoneByStructure(state.zones, loopStart.id, 'preStop' | 'postStop')`)
     and falls back to `getNodesInLoopRegion` BFS when zones are absent:
     - Nodes in the pre-stop (start→stop) region can only connect to/from
       `loopStart` or `loopStop`.
     - Nodes in the post-stop (stop→end) region can only connect to/from
       `loopStop` or `loopEnd`.
     - Nodes outside the loop (reachable but in neither region) can only connect
       to/from `loopStart` (as a target) or `loopEnd` (as a source).
     - A group input node may only connect to `loopStart`; a group output node
       may only connect to `loopEnd`.
   - Parent loop regions are consistent (`verifyParentLoopRegionsAreValid`, for
     nested loops).

3. **Neither node is a loop node.** Validates only that parent loop regions are
   consistent — both nodes must share the same set of boundary loop nodes, or
   both must be outside all loops. Nodes on an isolated island with no boundary
   loop nodes are always allowed.

### verifyLoopStructureUniformHandleInference

For each triplet, this counts the inferred (data-channel) handles on all six
slots (`loopStart` in/out, `loopStop` in/out, `loopEnd` in/out) by subtracting
the base infer index from each handle list length. It rejects the connection
when:

- the per-slot counts differ by more than 1 ("Loop structure has too different
  number of inferred handles, complete the connections"), or
- a new connection is added to a slot that is already at the max count while
  others lag ("Can't add a new connection to loops before older connections are
  synced across"), or
- corresponding handles across the triplet have mismatched resolved types ("Loop
  structure has different handle types").

The "off by at most 1" allowance exists because the handle being connected right
now is the one currently being synced across the triplet.

### Valid and Invalid Connection Patterns

**Valid:**

- `upstream → loopStart.input[infer]`
- `loopStart.output[infer] → preStopBodyNode`
- `preStopBodyNode → loopStop.input[infer]`
- `preStopBodyNode → loopStop.input[condition]`
- `loopStop.output[infer] → postStopBodyNode`
- `postStopBodyNode → loopEnd.input[infer]`
- `loopEnd.output[infer] → downstream`
- `loopStart.output[bindLoopNodes] → loopStop.input[bindLoopNodes]`
- `loopStop.output[bindLoopNodes] → loopEnd.input[bindLoopNodes]`
- `loopEnd_A.output[infer] → loopStart_B.input[infer]` (loops in series)
- `parentLoopStart.output[infer] → childLoopStart.input[infer]` (nested loops)

**Invalid:**

- `loopStart.output[infer] → downstream` (must go through body and `loopEnd`)
- `upstream → loopStop.input[infer]` (must enter through `loopStart`)
- `preStopBodyNode → downstream` (must exit through `loopStop`/`loopEnd`)
- `preStopBodyNode → postStopBodyNode` (different loop regions)
- `loopStart.output[bindLoopNodes] → loopEnd.input[bindLoopNodes]` (wrong order)
- Connecting a node inside the loop to a node outside it (other than via the
  triplet boundaries)

### canRemoveLoopNodesAndEdges

Located at `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts` ›
`canRemoveLoopNodesAndEdges`. Called by `FullGraph.tsx`'s `onBeforeDelete`
handler (`src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`), which also emits a `ui:delete:attempted`
`GraphEvent`. This single function guards **both** loops and switches.

**Rules:**

- If any loop node in a triplet is being deleted, **all three** must be deleted
  together ("Loop nodes all need to be removed together, can't partially remove
  them").
- If a `bindLoopNodes` edge between two connected loop nodes is being deleted,
  all three triplet nodes must also be in the deletion set ("Cannot disconnect
  loop nodes bind edges once fully connected…").
- The same logic applies to switch pairs (via `getSwitchStructureFromNode` and
  `bindSwitchNodes`) — both `switchStart` and `switchEnd` must be removed
  together.

## Dynamic Handle Addition for Loops

### addDuplicateHandlesToLoopNodesAfterInference

Located at `src/utils/nodeStateManagement/nodes/loops/loopHandleSync.ts` ›
`addDuplicateHandlesToLoopNodesAfterInference`. Called from the **apply** phase
of an `ADD_EDGE` plan (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
`applyPlan`, right after the standard edge inference runs) — and also from the
legacy `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`inferTypesAfterEdgeAddition` path. Its signature is:

```ts
addDuplicateHandlesToLoopNodesAfterInference(
  state,
  sourceNodeIndex: number,
  targetNodeIndex: number,
  isSourceHandleInferredFromConnection: boolean,
  isTargetHandleInferredFromConnection: boolean,
): { validation: ConnectionValidationResult };
```

**Mechanism:**

When a `loopInfer` handle on a loop node gets its type inferred (connected to a
concrete type), the system keeps the entire triplet in sync:

1. If the source/target node is a loop node whose handle was just inferred,
   `addLoopInferDuplicateToNode` appends **one new `loopInfer` input and one new
   `loopInfer` output** (template handles built by
   `constructTypeOfHandleFromIndices`, inserted at the end via
   `insertOrDeleteHandleInNodeDataUsingHandleIndices`). This makes the just-used
   slot a real channel and adds a fresh placeholder for the next channel.
2. The just-inferred handle is located on the processed node, and the node's
   complete `LoopStructure` is resolved via `getLoopStructureFromNode`.
3. For each **sibling** triplet node not already processed,
   `inferTypeAcrossTheNodeForHandleOfDataType` copies the inferred concrete type
   onto the sibling's matching `loopInfer` handle (overriding data type and
   name), and `addLoopInferDuplicateToNode` appends a fresh placeholder pair to
   the sibling too.

The net effect: connecting a single channel on _any_ one loop node propagates
the type to all three nodes and gives every node a new placeholder pair, so the
user does not have to wire each node manually.

**Uniform inference enforcement:** `verifyLoopStructureUniformHandleInference`
(during connection validation, above) guards against the triplet drifting out of
sync — handle counts may differ by at most 1 (the channel being connected), and
corresponding handles must share a resolved type.

## Loop Region Detection

### getLoopStructureFromNode

Located at `src/utils/nodeStateManagement/nodes/loops/loopStructure.ts` ›
`getLoopStructureFromNode`. Given any loop node, traverses the `bindLoopNodes`
edges (always `input[0]`/`output[0]`) to find the complete triplet.

- From **loopStart**: follow `output[0]` → `loopStop`, then `loopStop.output[0]`
  → `loopEnd`.
- From **loopStop**: follow `input[0]` back to `loopStart`, and `output[0]`
  forward to `loopEnd`.
- From **loopEnd**: follow `input[0]` back to `loopStop`, then
  `loopStop.input[0]` back to `loopStart`.

Returns `undefined` if the triplet is incomplete (a missing bind edge or a
wrong-typed neighbour).

### getNodesInLoopRegion

Located at `src/utils/nodeStateManagement/nodes/loops/loopRegion.ts` ›
`getNodesInLoopRegion`. Identifies body nodes in both regions using
bidirectional BFS. Used as the **fallback** when loop zones are not present
(`compileLoopStructures` and `isLoopConnectionValid` prefer `state.zones`).

**Returns two sets:**

- `nodesInRegionStartToStop` — nodes in the pre-stop body (between `loopStart`
  and `loopStop`).
- `nodesInRegionStopToEnd` — nodes in the post-stop body (between `loopStop` and
  `loopEnd`).

**Algorithm:** A bidirectional BFS seeded from both boundary nodes of each
region. From each node it traverses outgoers (unless the node is the region's
"stop" boundary) and incomers (unless the node is the region's "start"
boundary), skipping the triplet boundary nodes themselves. The bidirectional
approach captures nodes reachable through zigzag (forward-then-backward) paths.
`getAllReachableNodes` (a plain undirected BFS) is used separately by
`isLoopConnectionValid` to decide whether a node is "outside but reachable".

## Loops in the Runner

### Loop Compilation (compileLoopStructures)

Located at `src/utils/nodeRunner/loopCompiler.ts` › `compileLoopStructures`.
Called during the compilation phase. Signature (abridged):

```ts
compileLoopStructures(
  state, nodes, edges,
  maxIterations: number,
  functionImplementations,
  compileGraph,          // recursive compiler for group subtrees
  depth = 0,
): { loopBlocks: ReadonlyArray<LoopExecutionBlock>; loopNodeIds: ReadonlySet<string> };
```

**Steps:**

1. Find all `loopStart` nodes; for each, resolve the triplet via
   `getLoopStructureFromNode`.
2. Determine the two body regions. If the loop's `preStop`/`postStop` zones
   exist (`findZoneByStructure`), use their `nodeIds`; otherwise fall back to
   `getNodesInLoopRegion`.
3. Detect **nested** loops: a loop is nested when its `loopStart` is among
   another loop's body nodes (pre-stop ∪ post-stop).
4. For each **top-level** loop, recursively compile (`compileSingleLoop`):
   - Inner loops are recursively compiled to `LoopExecutionBlock`s and injected
     into their owning region using a **proxy id** (the inner `loopStart` id) so
     the outer topological sort treats the entire inner loop as one node.
   - Each region is topologically sorted via `topologicalSortWithLevels`, with
     `bindLoopNodes` edges excluded (`isBindLoopNodesEdge`).
   - Group instances among body nodes are compiled to `GroupExecutionScope`
     steps (`compileGroupScopes`); group boundary nodes are skipped.
5. Package both regions into a `LoopExecutionBlock` (`preStopSteps` /
   `postStopSteps`).
6. Return the top-level blocks plus the set of **all** loop-related node IDs
   (triplet + both bodies + nested loop nodes), so the main compiler can exclude
   them from the root topological sort.

`LoopExecutionBlock`s are executed by `executeOneStep`
(`src/utils/nodeRunner/executor/executeOneStep.ts` › `executeOneStep`,
`case 'loop'`), which delegates to `executeLoopBlock`.

The maximum iteration count comes from `compile(..., { maxLoopIterations })` and
defaults to `DEFAULT_MAX_LOOP_ITERATIONS = 100`
(`src/utils/nodeRunner/compiler.ts` › `DEFAULT_MAX_LOOP_ITERATIONS`).

### Loop Execution (executeLoopBlock)

Located at `src/utils/nodeRunner/executor/executeLoopBlock.ts` ›
`executeLoopBlock`. The core loop execution logic runs a **five-phase**
lifecycle per iteration. The phases are typed by
`LoopPhase = 'loopStart' | 'preStop' | 'loopStop' | 'postStop' | 'loopEnd'`
(`src/utils/nodeRunner/types.ts` › `LoopPhase`).

**Setup (once):**

1. Resolve the triplet's node info from `nodeInfoMap`; error out if missing.
2. Discover every **data channel** by flattening inputs and reading data handle
   IDs (`getDataHandleIds`) — everything except `bindLoopNodes`, `loopInfer`
   placeholders, and `condition`. The triplet must have matching data-handle
   counts across all six slots and a resolvable condition input, else a
   `GraphError` is thrown.
3. Resolve initial `currentValues[]` from upstream for each channel, filtering
   out the feedback edge whose source is `loopStop`.
4. `recorder.beginLoopStructure(...)`; precompute per-node output info.

**Per iteration (`for iteration in 0..maxIterations`):**

1. **`loopStart` phase** — write `currentValues[]` to `loopStart`'s data
   outputs, then record the `loopStart` step. `inputSource` is `'upstream'` on
   iteration 0 and `'feedback'` afterward; the recorded input map is filtered to
   show only the relevant source.
2. **`preStop` phase** — execute the `preStopSteps` grouped by concurrency
   level. In step-by-step (debug) mode steps run sequentially (awaiting
   `afterStep` between each); in instant (performance) mode same-level steps run
   concurrently via `Promise.allSettled`. Nodes whose inputs depend on an
   errored node are skipped.
3. **`loopStop` phase** — resolve the boolean condition
   (`resolveConditionValue`; if the condition source node errored, it defaults
   to `false`). Copy each channel's resolved input to `loopStop`'s data outputs
   (pass-through) and into `currentValues[]`, then record the `loopStop` step.
4. **`postStop` phase** — only when the condition is `true` **and** there are
   `postStopSteps`. Execute the post-stop region (same grouping/concurrency
   rules), then refresh `currentValues[]` from `loopEnd`'s resolved data inputs,
   so post-stop transformations feed into the next iteration.
5. **`loopEnd` phase** — recorded on **every** iteration for timeline
   visibility, but `loopEnd`'s ValueStore outputs are written **only** on the
   exit iteration (`!conditionValue`), and outputs are recorded only on exit (so
   edge animation naturally appears only on the last iteration).
6. `recorder.completeLoopIteration(loopStructureId, iteration, conditionValue)`.
   If the condition is `false`, break.

**Finalize:** if the loop ran all `maxIterations` with the condition still
`true`, a "Loop exceeded maximum iterations" `GraphError` is recorded on
`loopStop`, a structural errored completion is recorded on `loopEnd`, the
triplet is marked `errored`, and the error is thrown. Otherwise the triplet
nodes are marked `completed` and
`recorder.completeLoopStructure(loopStructureId)` is called.

**Recording identifiers:** `loopStructureId === loopStartNodeId`. Each
`ExecutionStepRecord` inside a loop body carries `loopIteration`,
`loopStructureId`, and `loopPhase`; `loopStart` steps also carry `inputSource`.
(The `parentLoopStructureId` / `parentLoopIteration` fields are `@deprecated` in
favor of hierarchical `LoopIterationRecord.nestedLoopRecords`.)

### LoopExecutionBlock Type

Defined in `src/utils/nodeRunner/types.ts` › `LoopExecutionBlock`:

```ts
type LoopExecutionBlock = {
  kind: 'loop';
  loopStartNodeId: string;
  loopStopNodeId: string;
  loopEndNodeId: string;
  /** Topologically sorted body steps (nodes between loopStart and loopStop) */
  preStopSteps: ReadonlyArray<ExecutionStep>;
  /** Topologically sorted body steps (nodes between loopStop and loopEnd) */
  postStopSteps: ReadonlyArray<ExecutionStep>;
  /** Maximum iterations before erroring (configurable, default 100) */
  maxIterations: number;
  concurrencyLevel: number;
};
```

### LoopRecord / LoopIterationRecord Types

Defined in `src/utils/nodeRunner/types.ts` › `LoopRecord`:

```ts
type LoopIterationRecord = {
  iteration: number; // 0-indexed
  startTime: number;
  endTime: number;
  duration: number;
  conditionValue: boolean; // what the condition resolved to
  stepRecords: ReadonlyArray<ExecutionStepRecord>;
  /** Hierarchical records for loops nested inside this iteration */
  nestedLoopRecords: ReadonlyMap<string, LoopRecord>;
  /** Hierarchical records for switches nested inside this iteration */
  nestedSwitchRecords: ReadonlyMap<string, SwitchRecord>;
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

`ExecutionRecord.loopRecords` is a `ReadonlyMap<string, LoopRecord>` keyed by
`loopStructureId` (`src/utils/nodeRunner/types.ts` › `ExecutionRecord`).

## Pre-Stop / Post-Stop body zones

The two loop body regions are first-class **zones** — visually rendered frame
polygons that also enforce the connection-boundary rules described above. They
are created automatically by `createLoopZones`
(`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `createLoopZones`)
when the `ADD_LOOP` plan is applied, and their `nodeIds` are recomputed on every
edge change.

Two zones are produced per loop, both with
`structureLink.structureType: 'loop'`, `structureId: loopStartId`, and
`enforced: true`:

| Zone role  | `name`           | `color`   | Boundary handles                                                                    |
| ---------- | ---------------- | --------- | ----------------------------------------------------------------------------------- |
| `preStop`  | "Pre-Stop Body"  | `#a78bfa` | `loopStart` data **outputs**, `loopStop` data **inputs**, `loopEnd` (empty inputs)  |
| `postStop` | "Post-Stop Body" | `#8b5cf6` | `loopStop` data **outputs**, `loopEnd` data **inputs**, `loopStart` (empty outputs) |

The runner (`compileLoopStructures`) and the validator (`isLoopConnectionValid`)
both look these zones up via
`findZoneByStructure(zones, loopStartId, 'preStop' | 'postStop')` and use their
`nodeIds` as the authoritative region membership, falling back to
`getNodesInLoopRegion` BFS only when zones are unavailable (e.g. legacy states).
Loop zones, like all zones, are **UI-only**: they are stripped from `state` on
export and rehydrated on import.

For the full zone model — `Zone`/`ZoneStructureLink`/`ZoneIndex` types, the
reverse `handleToZone` index, membership recomputation, and frame rendering —
see [Zones](zonesDoc.md).

## Editing Loop Data Channels (Loop edit drawer)

A loop triplet exposes a header action that opens the **Loop edit drawer** via
`OPEN_DRAWER` with `activeDrawer.type === 'editLoop'` (see
[State Management](../core/stateManagementDoc.md)). The drawer presents one
**data channel** per row.

`extractLevelsFromLoopNodes`
(`src/components/molecules/LoopEditDrawer/loopLevelConversion.ts` ›
`extractLevelsFromLoopNodes`) derives the channels: for each loop node it slices
the infer handles between `getLoopNodeInferHandleIndex(...)` and the trailing
placeholder, then pairs them positionally into a `LoopHandleLevel`:

```ts
type LoopHandleLevel = {
  id: string;
  dataTypeUniqueId: string;
  dataTypeColor: string;
  handles: {
    loopStartIn: { id: string; name: string };
    loopStartOut: { id: string; name: string };
    loopStopIn: { id: string; name: string };
    loopStopOut: { id: string; name: string };
    loopEndIn: { id: string; name: string };
    loopEndOut: { id: string; name: string };
  };
};
```

On save the drawer dispatches `UPDATE_LOOP` with the reordered/renamed `levels`
(payload shape in `src/utils/nodeStateManagement/mainReducer.ts` › `Action` and
`src/utils/nodeStateManagement/planApply/types.ts` › `UpdateLoopPlan`).
Validation (`src/utils/nodeStateManagement/planApply/validators.ts` ›
`validateAction`) checks that all three loop nodes exist and that handle **names
are unique per slot** (rejecting with `INVALID_NODE_GROUP` otherwise). Apply
(`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`)
reorders/renames each slot starting at its base infer index (`loopStartIn = 0`,
`loopStartOut = 1`, `loopStopIn = 2`, `loopStopOut = 1`, `loopEndIn = 1`,
`loopEndOut = 0`).

## Per-Iteration Data Flow

```
Iteration 0 (initial):
================================================================

  upstream_value
       │
       v
  LoopStart.input[0] (infer) ── filtered to exclude LoopStop feedback edge
       │
       │  (currentValues copied to outputs)
       v
  LoopStart.output[1] (infer) ── value_0
       │
       v
  ┌──────────────────────────────┐
  │      PRE-STOP BODY           │  topologically sorted; same-level steps
  │  nodeA ──> nodeB ──> nodeC   │  run concurrently (instant mode)
  └──────────────────────────────┘
       │                    │
       v                    v
  LoopStop.input[2]    LoopStop.input[1]
  (infer: body_out)    (condition: bool; false on condition-source error)
       │                    │
       │   pass-through      │
       v                    v
  LoopStop.output[1]   ┌─────────────────┐
  (= currentValues)    │ condition=true? │
                       └───────┬─────────┘
                  true │               │ false
                       v               v
              ┌──────────────┐   LoopEnd.input[1] (infer)
              │ POST-STOP    │        │
              │   BODY       │        v
              └──────┬───────┘   LoopEnd.output[0] ──> downstream (exit)
                     v
              LoopEnd.input[1] resolved ──> currentValues (feedback)
                     │
                     v
              next iteration: LoopStart.input[0]

Value lifecycle across iterations (condition true until iter N):
================================================================

  iter 0:  upstream_value      ──> preStop ──> stop ──> [postStop] ──> result_0
  iter 1:  result_0            ──> preStop ──> stop ──> [postStop] ──> result_1
  ...
  iter N:  result_{N-1}        ──> preStop ──> stop (condition=false)
  final:   currentValues_N ──> LoopEnd.output ──> downstream
```

## Limitations and Deprecated Patterns

- **Maximum iterations:** Configurable via the runner's `maxLoopIterations`
  option (default `DEFAULT_MAX_LOOP_ITERATIONS = 100`). If the condition remains
  `true` after all iterations, a `GraphError` is thrown.
- **No early break from body:** There is no mechanism for a body node to signal
  an early loop exit. Only `loopStop`'s `condition` handle controls loop flow.
- **Condition default on error:** If the node feeding the condition handle
  errors, the condition resolves to `false` (exit). This prevents infinite loops
  on errors but may produce unexpected results.
- **Post-stop runs only on continue:** The post-stop body executes only when the
  condition is `true`. On the exit iteration it is skipped, so any post-stop
  transformation is **not** applied to the value handed to `loopEnd`.
- **Uniform inference across the triplet:** All data channels must resolve to
  the same handle layout across `loopStart`/`loopStop`/`loopEnd`. The validator
  blocks new connections until pending channels are synced across all three
  nodes.
- **Nested loops execute independently:** A nested loop runs to completion on
  each outer iteration; an outer loop cannot inspect or modify an inner loop's
  iteration state.

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
- …
- Iteration 9: 9 → Add1 → 10, LessThan10(10)=false → exit
- Display receives: 10

(Here `Add1` lives in the pre-stop body; the post-stop body is empty.)

### Adding a loop and editing its channels

```ts
import { actionTypesMap } from 'react-blender-nodes';

// 1. Add a complete triplet (loopStart + loopStop + loopEnd) with bind edges,
//    auto-created Pre-Stop / Post-Stop zones.
dispatch({
  type: actionTypesMap.ADD_LOOP,
  payload: { position: { x: 200, y: 120 } },
});

// 2. Wire upstream -> loopStart input (infer) to create the first data channel;
//    the inferred type propagates to loopStop and loopEnd automatically.

// 3. Open the loop editor (header action also does this):
dispatch({
  type: actionTypesMap.OPEN_DRAWER,
  payload: { activeDrawer: { type: 'editLoop', nodeId: loopStartId } },
});

// 4. Rename / reorder channels, then save:
dispatch({
  type: actionTypesMap.UPDATE_LOOP,
  payload: {
    loopStartNodeId,
    loopStopNodeId,
    loopEndNodeId,
    levels: [
      {
        handles: {
          loopStartIn: { id: startInId, name: 'Accumulator' },
          loopStartOut: { id: startOutId, name: 'Accumulator' },
          loopStopIn: { id: stopInId, name: 'Accumulator' },
          loopStopOut: { id: stopOutId, name: 'Accumulator' },
          loopEndIn: { id: endInId, name: 'Accumulator' },
          loopEndOut: { id: endOutId, name: 'Accumulator' },
        },
      },
    ],
  },
});
```

### Loops in series

```
loopEnd_A.output[infer] ──> loopStart_B.input[infer]
```

The output of one loop feeds directly into the next; validated as a
cross-structure series connection.

### Nested loops

```
outerLoopStart ──> innerLoopStart ──> [body] ──> innerLoopStop ──> innerLoopEnd ──> outerLoopStop
```

The inner triplet sits entirely within the outer loop's pre-stop region. The
inner loop is compiled recursively (proxy id) and executes fully on each outer
iteration; its `LoopRecord` is nested under the outer iteration's
`nestedLoopRecords`.

## Relationships with Other Features

### -> [Data Types (`loopInfer`, `condition`, `bindLoopNodes`)](../core/dataTypesDoc.md)

Loop-specific data types are registered in `standardDataTypes`
(`src/utils/nodeStateManagement/standardNodes.ts` › `standardDataTypes`). They
reuse the data type system's support for `inferFromConnection`, `boolean`, and
`noEquivalent` underlying types.

### -> [Handles (dynamic handle addition)](../core/handlesDoc.md)

When infer handles are connected, `addDuplicateHandlesToLoopNodesAfterInference`
uses `insertOrDeleteHandleInNodeDataUsingHandleIndices` to append new handles to
all three triplet nodes.

### -> [Type Inference (triggers inference on loop nodes)](../core/typeInferenceDoc.md)

Type inference for `inferFromConnection` handles is the standard mechanism. The
loop system adds the constraint that all infer handles across the triplet must
resolve to the same concrete type (`verifyLoopStructureUniformHandleInference`),
and uses `inferTypeAcrossTheNodeForHandleOfDataType` to propagate the resolved
type to sibling nodes.

### -> [Nodes (standard node types)](../core/nodesDoc.md)

`loopStart`/`loopStop`/`loopEnd` are standard node types registered alongside
the group and switch nodes. They are hidden from the "Add Node" context menu
(`standardHiddenNodeTypesInContextMenu`) and added as a unit through `ADD_LOOP`.

### -> [Edges (loop connection validation)](../core/edgesDoc.md)

`isLoopConnectionValid` runs as step 7 of `validateAddEdge`; rejections surface
as the `LOOP_PATH_INVALID` `ValidationError`. It enforces region isolation, bind
order, structural integrity, and uniform inference.

### -> [Zones (Pre-Stop / Post-Stop body)](zonesDoc.md)

`ADD_LOOP` creates two enforced loop zones via `createLoopZones`. Region
membership for compilation and validation is read from these zones (BFS
fallback). All zone fields are UI-only and stripped on export.

### -> [State Management (ADD_LOOP / UPDATE_LOOP, drawers)](../core/stateManagementDoc.md)

`ADD_LOOP` and `UPDATE_LOOP` are validated by `validateAction` and applied by
`applyPlan` (the only mutator). The Loop edit drawer is opened via `OPEN_DRAWER`
(`activeDrawer.type === 'editLoop'`). Loop deletion is gated by
`canRemoveLoopNodesAndEdges` in `FullGraph`'s `onBeforeDelete`.

### -> [Runner (loop compilation and execution)](../runner/runnerCompilerDoc.md)

`compileLoopStructures` transforms loop structures into `LoopExecutionBlock` IR
(`preStopSteps` / `postStopSteps`). `executeLoopBlock` handles the five-phase
iteration lifecycle, condition checking, feedback, and recording.

### -> [Editor Drawers (loop data-channel editor)](../ui/editorsDoc.md)

The Loop edit drawer derives data channels via `extractLevelsFromLoopNodes` and
dispatches `UPDATE_LOOP` on save.

### -> [Connection Validation (special loop validation)](connectionValidationDoc.md)

Beyond standard type-compatibility checks, loop connections undergo region
validation, bind-order validation, uniform-inference checks, and parent-region
consistency checks.
