# Runner Compiler

## Overview

The Runner Compiler transforms graph `State` into an `ExecutionPlan` — an
intermediate representation (IR) ready for execution. It reads nodes, edges, and
type definitions from the state and produces an ordered set of execution steps
grouped into concurrency levels.

The compiler is a pure function: it takes `State` + `FunctionImplementations`
and returns an `ExecutionPlan`. It has no side effects and does not mutate the
input state.

The compilation pipeline runs 5 sequential phases:

1. **Graph Analysis** — extract active nodes/edges, build resolution maps from
   edges
2. **Node Classification** — classify nodes by type, detect missing function
   implementations
3. **Loop Compilation** — detect loop triplets, compile body nodes into
   `LoopExecutionBlock`s
4. **Group Compilation** — detect group instances, recursively compile subtrees
   into `GroupExecutionScope`s
5. **Topological Sort** — Kahn's algorithm producing concurrency levels for
   parallel execution

The compiler also generates warnings for missing function implementations
(warnings, not errors — execution errors only occur if an unimplemented node is
actually reached at runtime).

**Entry point:** `compile()` in `src/utils/nodeRunner/compiler.ts`

## Entity-Relationship Diagram

```
+------------------+          +--------------------+
|     State        |          | FunctionImplementa- |
|  (nodes, edges,  |          |   tions             |
|   typeOfNodes,   |          | (user-provided      |
|   dataTypes)     |          |  node logic)        |
+--------+---------+          +---------+----------+
         |                              |
         +------------+  +--------------+
                      |  |
                      v  v
              +-------+--+--------+
              |    compile()       |
              | (5-phase pipeline) |
              +--------+----------+
                       |
                       v
              +--------+----------+
              |   ExecutionPlan    |
              |  .levels[][]      |----> ExecutionStep (discriminated union)
              |  .inputResolution |         |
              |    Map            |         +---> StandardExecutionStep
              |  .outputDistribu- |         |       { kind: 'standard', nodeId, nodeTypeId, ... }
              |    tionMap        |         |
              |  .nodeCount       |         +---> LoopExecutionBlock
              |  .warnings[]      |         |       { kind: 'loop', loopStartNodeId, bodySteps[], ... }
              +---------+---------+         |
                                            +---> GroupExecutionScope
                                                    { kind: 'group', groupNodeId, innerPlan, ... }
```

### Relationships

```
State 1──────* Node          "state contains nodes"
State 1──────* Edge          "state contains edges"
State 1──────* TypeOfNode    "state defines node types"

ExecutionPlan 1──────* Level             "plan has concurrency levels"
Level         1──────* ExecutionStep     "level has parallel steps"

ExecutionStep ------|> StandardExecutionStep   (kind='standard')
ExecutionStep ------|> LoopExecutionBlock      (kind='loop')
ExecutionStep ------|> GroupExecutionScope     (kind='group')

LoopExecutionBlock  1──────* ExecutionStep   "loop body has steps"
GroupExecutionScope 1──────1 ExecutionPlan   "group has inner plan"

ExecutionPlan 1──────1 InputResolutionMap     "plan has input map"
ExecutionPlan 1──────1 OutputDistributionMap  "plan has output map"

InputResolutionMap  *──────1 InputResolutionEntry   "per handle:edge"
OutputDistributionMap *────1 OutputDistributionEntry "per handle:edge"
```

## Functional Dependency Diagram

```
compile()
  |
  +-- getCurrentNodesAndEdgesFromState()    [Phase 1]
  |     src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts
  |     Extracts active nodes/edges from state (respects openedNodeGroupStack)
  |
  +-- isBindLoopNodesEdge()                [Phase 1]
  |     src/utils/nodeRunner/loopCompiler.ts
  |     Detects structural bindLoopNodes edges to exclude from data flow maps
  |
  +-- isLoopNode()                         [Phase 2]
  |     src/utils/nodeStateManagement/nodes/loops.ts
  |     Checks if nodeTypeId is loopStart, loopStop, or loopEnd
  |
  +-- isStandardNodeType()                 [Phase 2]
  |     src/utils/nodeRunner/groupCompiler.ts
  |     Checks if nodeTypeId is any of the 5 standard node types
  |
  +-- hasKey()                             [Phase 2]
  |     src/utils/nodeRunner/groupCompiler.ts
  |     Type-safe key existence check on Record types
  |
  +-- compileLoopStructures()              [Phase 3]
  |     src/utils/nodeRunner/loopCompiler.ts
  |     |
  |     +-- getLoopStructureFromNode()
  |     |     src/utils/nodeStateManagement/nodes/loops.ts
  |     |     Finds loop triplet (start, stop, end) from any loop node
  |     |
  |     +-- getNodesInLoopRegion()
  |     |     src/utils/nodeStateManagement/nodes/loops.ts
  |     |     BFS from loopStart to discover body nodes
  |     |
  |     +-- topologicalSortWithLevels()
  |     |     src/utils/nodeRunner/topologicalSort.ts
  |     |     Sorts body nodes into concurrency levels
  |     |
  |     +-- compileGroupScopes()
  |           src/utils/nodeRunner/groupCompiler.ts
  |           Handles group instances inside loop bodies
  |
  +-- compileGroupScopes()                 [Phase 4]
  |     src/utils/nodeRunner/groupCompiler.ts
  |     |
  |     +-- compile() (recursive)
  |     |     Recursively compiles subtree into inner ExecutionPlan
  |     |
  |     +-- extractInputHandleIds()
  |     |     Flattens panels to get ordered input handle IDs
  |     |
  |     +-- extractOutputHandleIds()
  |           Gets ordered output handle IDs
  |
  +-- isGroupBoundaryNode()                [Phase 4.5]
  |     src/utils/nodeRunner/groupCompiler.ts
  |     Detects GroupInput/GroupOutput nodes to exclude from sort
  |
  +-- topologicalSortWithLevels()          [Phase 5]
        src/utils/nodeRunner/topologicalSort.ts
        Kahn's algorithm on remaining nodes + loop proxies
```

## Data Flow Diagram

```
                     State
                       |
                       v
  +--------------------------------------------+
  | Phase 1: Graph Analysis                     |
  |                                             |
  | State.nodes ----+                           |
  |                 +--> getCurrentNodesAndEdges |
  | State.edges ----+        FromState()        |
  |                          |       |          |
  |                     nodes[]   edges[]       |
  |                          |       |          |
  |                          |       +-------+  |
  |                          |       |       |  |
  |                          |       v       v  |
  |                          | inputResolu  outputDistri |
  |                          | tionMap      butionMap    |
  +--------+-----------------+------+--------+--+
           |                        |        |
           v                        |        |
  +--------+------+                 |        |
  | Phase 2:      |                 |        |
  | Node          |                 |        |
  | Classification|                 |        |
  | + Missing Impl|                 |        |
  | Detection     |                 |        |
  | => warnings[] |                 |        |
  +--------+------+                 |        |
           |                        |        |
           v                        |        |
  +--------+------------------+     |        |
  | Phase 3: Loop Compilation |     |        |
  | For each loopStart node:  |     |        |
  |   getLoopStructureFromNode|     |        |
  |   getNodesInLoopRegion    |     |        |
  |   topologicalSort(body)   |     |        |
  |   => LoopExecutionBlock[] |     |        |
  |   => loopNodeIds (Set)    |     |        |
  +--------+------------------+     |        |
           |                        |        |
           v                        |        |
  +--------+------------------+     |        |
  | Phase 4: Group Compilation|     |        |
  | For each group instance:  |     |        |
  |   Build synthetic subtree |     |        |
  |   compile() recursively   |     |        |
  |   Build handle mappings   |     |        |
  |   => GroupExecutionScope[]|     |        |
  +--------+------------------+     |        |
           |                        |        |
           v                        |        |
  +--------+------------------+     |        |
  | Phase 4.5: Identify group |     |        |
  | boundary nodes            |     |        |
  | (GroupInput/GroupOutput)   |     |        |
  | => groupBoundaryNodeIds   |     |        |
  +--------+------------------+     |        |
           |                        |        |
           v                        |        |
  +--------+------------------+     |        |
  | Phase 5: Topological Sort |     |        |
  | Remaining nodes + proxies |     |        |
  | Kahn's algorithm          |     |        |
  | Replace proxies with      |     |        |
  |   blocks/scopes           |     |        |
  | => levels: ExecutionStep[]|     |        |
  +--------+------------------+     |        |
           |                        |        |
           v                        v        v
  +--------+------------------------+--------+--+
  |              ExecutionPlan                    |
  |  {                                           |
  |    levels: ExecutionStep[][],                |
  |    inputResolutionMap,                       |
  |    outputDistributionMap,                    |
  |    nodeCount: number,                        |
  |    warnings: string[]                        |
  |  }                                           |
  +----------------------------------------------+
```

## System Diagram

```
react-blender-nodes
+-- State Management
|   +-- nodes, edges, typeOfNodes, dataTypes
|   +-- getCurrentNodesAndEdgesFromState()
|   +-- Loop utilities (isLoopNode, getLoopStructureFromNode, getNodesInLoopRegion)
|
+-- Runner Systems
    +-- >>> Runner Compiler <<< (this feature)
    |   +-- compiler.ts           compile() - main 5-phase pipeline
    |   +-- topologicalSort.ts    topologicalSortWithLevels() - Kahn's algorithm
    |   +-- loopCompiler.ts       compileLoopStructures(), isBindLoopNodesEdge()
    |   +-- groupCompiler.ts      compileGroupScopes(), isStandardNodeType(),
    |   |                         isGroupBoundaryNode(), hasKey()
    |   +-- types.ts              ExecutionPlan, ExecutionStep, StandardExecutionStep,
    |                             LoopExecutionBlock, GroupExecutionScope,
    |                             InputResolutionEntry, OutputDistributionEntry
    |
    +-- Runner Executor
    |   +-- executor.ts           Consumes ExecutionPlan, calls FunctionImplementations
    |   +-- valueStore.ts         Stores intermediate values during execution
    |
    +-- Runner Hook
    |   +-- useNodeRunner.ts      React hook orchestrating compile + execute
    |
    +-- Execution Recording
        +-- executionRecorder.ts  Records steps, timing, values for replay
```

## ExecutionPlan Type

The `ExecutionPlan` is the compiled IR — the output of the compiler, consumed by
the executor.

```
ExecutionPlan
+-- levels: ReadonlyArray<ReadonlyArray<ExecutionStep>>
|     Execution steps grouped by concurrency level.
|     levels[0] runs first; levels[1] after all of levels[0] complete.
|     Steps within the same level run concurrently via Promise.allSettled.
|
+-- inputResolutionMap: ReadonlyMap<string, ReadonlyArray<InputResolutionEntry>>
|     Key format: "nodeId:handleId"
|     Value: list of edges feeding into that input handle.
|     Used by executor to resolve input values from ValueStore.
|
+-- outputDistributionMap: ReadonlyMap<string, ReadonlyArray<OutputDistributionEntry>>
|     Key format: "nodeId:handleId"
|     Value: list of edges consuming from that output handle.
|     Used for building OutputHandleInfo for function implementations.
|
+-- nodeCount: number
|     Total executable nodes in the plan (recursive into loops/groups).
|     Used for progress tracking (completedSteps / nodeCount).
|
+-- warnings: ReadonlyArray<string>
      Warnings generated during compilation.
      E.g., missing function implementations, excessive nesting depth.
```

**nodeCount calculation:**

- Standard step: +1
- Loop block: +3 (triplet) + bodySteps.length
- Group scope: +1 (group node) + innerPlan.nodeCount

## Execution Step Types

The `ExecutionStep` type is a discriminated union on the `kind` field:

```
ExecutionStep = StandardExecutionStep | LoopExecutionBlock | GroupExecutionScope
```

### StandardExecutionStep

Represents a single node that has a user-provided function implementation.

```
StandardExecutionStep {
  kind: 'standard'          -- discriminant
  nodeId: string             -- runtime node instance ID
  nodeTypeId: string         -- key in state.typeOfNodes
  nodeTypeName: string       -- display name from typeOfNodes
  concurrencyLevel: number   -- which level this step belongs to
}
```

At execution time, the executor:

1. Resolves inputs from the `inputResolutionMap` + `ValueStore`
2. Calls `functionImplementations[nodeTypeId](inputs, outputs, context)`
3. Stores returned outputs in the `ValueStore`

### LoopExecutionBlock

Represents a compiled loop structure: the triplet (start, stop, end) plus
topologically sorted body steps.

```
LoopExecutionBlock {
  kind: 'loop'                               -- discriminant
  loopStartNodeId: string                     -- loopStart node instance ID
  loopStopNodeId: string                      -- loopStop node instance ID
  loopEndNodeId: string                       -- loopEnd node instance ID
  bodySteps: ReadonlyArray<ExecutionStep>     -- topologically sorted body (may contain groups)
  maxIterations: number                       -- safety limit (default: 10000)
  concurrencyLevel: number                    -- level in the outer plan
}
```

The executor iterates:

1. Feed upstream values into loopStart
2. Execute body steps
3. Check loopStop condition
4. If true: feed loopStop output back to loopStart, repeat
5. If false: feed values to loopEnd, continue downstream

Body steps can themselves be `GroupExecutionScope` steps (groups inside loops).

### GroupExecutionScope

Represents a node group instance with its recursively compiled inner execution
plan and handle mappings between outer and inner boundaries.

```
GroupExecutionScope {
  kind: 'group'                                  -- discriminant
  groupNodeId: string                             -- group node instance ID in outer graph
  groupNodeTypeId: string                         -- key in state.typeOfNodes
  groupNodeTypeName: string                       -- display name
  innerPlan: ExecutionPlan                        -- recursively compiled subtree
  inputMapping: ReadonlyMap<string, string>        -- outer input handle ID -> inner GroupInput output handle ID
  outputMapping: ReadonlyMap<string, string>       -- inner GroupOutput input handle ID -> outer output handle ID
  concurrencyLevel: number                        -- level in the outer plan
}
```

**Handle mapping** works by index position:

- `outerNode.inputs[i]` maps to `GroupInput.outputs[i]`
- `GroupOutput.inputs[i]` maps to `outerNode.outputs[i]`

The executor:

1. Maps outer input values to GroupInput output positions
2. Executes innerPlan
3. Maps GroupOutput input values to outer output positions

**Recursion depth limit:** `MAX_GROUP_DEPTH = 20` (prevents infinite recursion
from circular group references).

## The 5 Compilation Phases

### Phase 1: Graph Analysis

**Input:** `State` (the complete graph state)

**Algorithm:**

1. Call `getCurrentNodesAndEdgesFromState(state)` to extract the active nodes
   and edges. This function respects `openedNodeGroupStack` — when viewing
   inside a group, it returns the subtree's nodes/edges.
2. If nodes are empty, return an empty `ExecutionPlan` immediately.
3. Iterate over all edges to build two lookup maps:
   - **inputResolutionMap**: For each edge, create key
     `"targetNodeId:targetHandleId"` and push an `InputResolutionEntry` (edgeId,
     sourceNodeId, sourceHandleId).
   - **outputDistributionMap**: For each edge, create key
     `"sourceNodeId:sourceHandleId"` and push an `OutputDistributionEntry`
     (edgeId, targetNodeId, targetHandleId).
4. Skip edges with missing handles (`!sourceHandle || !targetHandle`).
5. Skip `bindLoopNodes` edges — these are structural edges connecting loop
   triplet nodes and carry no data. Detected via `isBindLoopNodesEdge()`.

**Output:** `inputResolutionMap`, `outputDistributionMap`, `nodes[]`, `edges[]`

**Key detail:** The `isBindLoopNodesEdge()` function checks both source and
target handles. It looks at the handle's `dataType.dataTypeUniqueId` — if it
equals `'bindLoopNodes'`, the edge is structural. It checks both directions
because either end could be the loop node.

### Phase 2: Node Classification + Missing Implementation Detection

**Input:** `nodes[]` from Phase 1, `state.typeOfNodes`,
`functionImplementations`

**Algorithm:** For each node, classify by checking `node.data.nodeTypeUniqueId`:

1. `isLoopNode(typeId)` → skip (handled in Phase 3)
2. `isStandardNodeType(typeId)` → skip (built-in execution: groupInput,
   groupOutput, loopStart, loopStop, loopEnd)
3. `typeOfNode.subtree` exists → skip (group instances handled in Phase 4)
4. Otherwise → check if `functionImplementations[nodeTypeId]` exists
   - If missing: push warning
     `"Node type "${name}" (${nodeTypeId}) has no function implementation."`

**Output:** `warnings[]` (appended to)

**Note:** Warnings are non-blocking. The compiler produces a valid
`ExecutionPlan` even when implementations are missing. The executor will error
only if an unimplemented node is actually reached during execution.

The `isStandardNodeType()` function acts as a TypeScript type guard. In the
false branch, the type of `nodeTypeId` narrows to
`Exclude<NodeTypeUniqueId, StandardNodeTypeName>`, which matches the key type of
`FunctionImplementations` — enabling direct indexed access without casts.

### Phase 3: Loop Compilation

**Input:** `state`, `nodes[]`, `edges[]`, `maxIterations`,
`functionImplementations`, `compile` (self-reference for recursion), `depth`

**Algorithm:**

1. Find all nodes where `nodeTypeUniqueId === 'loopStart'`
2. For each loopStart node: a. Call
   `getLoopStructureFromNode(state, loopStartNode)` to find the complete triplet
   (`loopStart`, `loopStop`, `loopEnd`) via the `bindLoopNodes` structural edges
   b. Add all triplet node IDs to `loopNodeIds` exclusion set c. Call
   `getNodesInLoopRegion(state, loopStructure)` to discover body nodes via BFS
   from loopStart (bounded by loop node boundaries) d. Add body node IDs to
   `loopNodeIds` e. Build adjacency lists for body nodes only (edges where both
   endpoints are body nodes, excluding `bindLoopNodes` edges) f. Call
   `topologicalSortWithLevels()` on body nodes g. Call `compileGroupScopes()` on
   body nodes to detect group instances within the loop body h. Convert sorted
   body levels into `ExecutionStep[]` (replacing group node IDs with their
   `GroupExecutionScope`) i. Create `LoopExecutionBlock` with
   `concurrencyLevel: 0` (reassigned by Phase 5)

**Output:** `loopBlocks: LoopExecutionBlock[]`, `loopNodeIds: Set<string>`

The `loopNodeIds` set includes all triplet nodes AND all body nodes — the entire
loop structure is excluded from the main topological sort and represented by a
single proxy node.

### Phase 4: Group Compilation

**Input:** `state`, `nodes[]`, `functionImplementations`, `maxIterations`,
`compile` (self-reference), `depth`

**Algorithm:**

1. Check recursion depth against `MAX_GROUP_DEPTH` (20). If exceeded, return
   empty with a warning.
2. Find all nodes whose `typeOfNode.subtree` exists (group instances).
3. For each group instance: a. Add `node.id` to `groupNodeIds` b. Check for
   missing function implementations in subtree's inner nodes (same logic as
   Phase 2 but prefixed with group name) c. Build a synthetic `State` from the
   subtree: spread `state`, replace `nodes` and `edges` with subtree's, clear
   `openedNodeGroupStack` d. Call `compile()` recursively on the synthetic state
   at `depth + 1` e. Collect inner plan warnings, prefixed with
   `[Group "${name}"]` f. Build **inputMapping**: find `GroupInput` node in
   subtree, map outer input handle IDs to inner GroupInput output handle IDs by
   index position g. Build **outputMapping**: find `GroupOutput` node in
   subtree, map inner GroupOutput input handle IDs to outer output handle IDs by
   index position h. Create `GroupExecutionScope` with `concurrencyLevel: 0`
   (reassigned by Phase 5)

**Output:** `groupScopes: GroupExecutionScope[]`, `groupNodeIds: Set<string>`,
`warnings: string[]`

**Handle mapping detail:**

- `extractInputHandleIds()` flattens panel inputs (panels contain nested
  `inputs[]` arrays) to get ordered IDs
- `extractOutputHandleIds()` gets ordered output IDs directly
- Mapping uses `Math.min(outerCount, innerCount)` to handle mismatched counts
  safely

**Phase 4.5: Group Boundary Node Identification**

After group compilation, the compiler identifies `GroupInput` and `GroupOutput`
nodes present in the current node set. These are data mapping points handled by
the executor — not executable nodes — and must be excluded from the topological
sort. Their edges remain in the resolution maps so the executor can resolve
handle mappings.

### Phase 5: Topological Sort

**Input:** All data from previous phases

**Algorithm:**

**Step 1 — Build proxy map for loops:** Each loop structure is represented by a
single proxy node (the `loopStartNodeId`) in the topological sort. All loop node
IDs (triplet + body) are mapped to their proxy via `nodeToLoopProxy`.

**Step 2 — Build remaining node set:**

```
remainingNodeIds = allNodeIds
  - loopNodeIds (all nodes belonging to loops)
  - groupBoundaryNodeIds (GroupInput/GroupOutput nodes)
  + loopProxyIds (one proxy per loop)
```

**Step 3 — Build filtered adjacency lists:** Iterate all edges, redirecting loop
node endpoints to their proxy:

- If source is a loop node → redirect to proxy
- If target is a loop node → redirect to proxy
- Skip if source === target (internal loop edge)
- Skip if either endpoint is not in `remainingSet`
- Add edge to `filteredAdjacency` and `filteredReverseAdjacency`

**Step 4 — Run Kahn's algorithm:** Call
`topologicalSortWithLevels(remainingNodeIds, filteredAdjacency, filteredReverseAdjacency)`.

The algorithm:

1. Calculate in-degree for each node from `reverseAdjacency`
2. Initialize queue with all in-degree=0 nodes
3. Process level by level:
   - All nodes in the current queue form one concurrency level
   - For each node in the level, decrement in-degree of its neighbors
   - Nodes reaching in-degree=0 enter the next level's queue
4. If not all nodes processed (cycle detected): place remaining in a final level

**Step 5 — Convert to ExecutionStep levels:** For each level from the sort:

- If nodeId is a loop proxy → replace with its `LoopExecutionBlock`
- If nodeId has a `GroupExecutionScope` → replace with the scope
- Otherwise → create `StandardExecutionStep`
- Set `concurrencyLevel` to the level index

**Step 6 — Count nodes:** Recursively count all executable nodes for the
`nodeCount` field.

**Output:** `ExecutionPlan`

## inputResolutionMap and outputDistributionMap

These two maps are the compiled edge data that the executor uses to resolve
values at runtime.

### inputResolutionMap

**Key:** `"targetNodeId:targetHandleId"` (the consuming input handle)

**Value:** `InputResolutionEntry[]` — one entry per edge feeding into this
handle

```
InputResolutionEntry {
  edgeId: string          -- the edge connecting source to target
  sourceNodeId: string    -- which node produces the value
  sourceHandleId: string  -- which output handle on the source
}
```

Multiple entries = fan-in (multiple edges feeding one input).

### outputDistributionMap

**Key:** `"sourceNodeId:sourceHandleId"` (the producing output handle)

**Value:** `OutputDistributionEntry[]` — one entry per edge consuming this
output

```
OutputDistributionEntry {
  edgeId: string          -- the edge
  targetNodeId: string    -- which node consumes the value
  targetHandleId: string  -- which input handle on the target
}
```

Multiple entries = fan-out (one output feeding multiple inputs).

### Example

Given this simple graph:

```
  +--------+       +--------+       +--------+
  | Node A |       | Node B |       | Node C |
  | out-1 -+------>+-in-1   |       |        |
  |        |    +->|        |       |        |
  +--------+    |  | out-1 -+------>+-in-1   |
                |  +--------+       +--------+
  +--------+   |
  | Node D |   |
  | out-1 -+---+   (fan-in to B.in-1)
  +--------+
```

**inputResolutionMap:**

```
"B:in-1" => [
  { edgeId: "e1", sourceNodeId: "A", sourceHandleId: "out-1" },
  { edgeId: "e2", sourceNodeId: "D", sourceHandleId: "out-1" },
]
"C:in-1" => [
  { edgeId: "e3", sourceNodeId: "B", sourceHandleId: "out-1" },
]
```

**outputDistributionMap:**

```
"A:out-1" => [
  { edgeId: "e1", targetNodeId: "B", targetHandleId: "in-1" },
]
"D:out-1" => [
  { edgeId: "e2", targetNodeId: "B", targetHandleId: "in-1" },
]
"B:out-1" => [
  { edgeId: "e3", targetNodeId: "C", targetHandleId: "in-1" },
]
```

### bindLoopNodes edge exclusion

Structural `bindLoopNodes` edges (which connect loop triplet nodes to each
other) are excluded from both maps. These edges carry no data — they exist only
to define the loop structure in the visual graph. The `isBindLoopNodesEdge()`
function detects them by checking if the source or target handle's
`dataType.dataTypeUniqueId` equals `'bindLoopNodes'`.

## Concurrency Levels

The topological sort produces concurrency levels — groups of nodes that have no
data dependencies on each other and can execute in parallel.

```
Given this DAG:
  A ──> C ──> E
  B ──> D ──> E

Concurrency levels:
  Level 0: [A, B]     -- no dependencies, run concurrently
  Level 1: [C, D]     -- depend only on level 0, run concurrently
  Level 2: [E]         -- depends on levels 0 and 1

Execution:
  await Promise.allSettled([execute(A), execute(B)])
  await Promise.allSettled([execute(C), execute(D)])
  await Promise.allSettled([execute(E)])
```

**Loop proxies participate in the sort.** A loop structure's external edges
(from upstream nodes to loopStart inputs, from loopEnd outputs to downstream
nodes) determine which concurrency level the entire loop executes at.

**Group nodes participate directly.** A group node is a single node in the sort
— its internal complexity is hidden behind the `GroupExecutionScope`. External
edges to/from the group node determine its level.

**Cycle handling:** If the sort detects unprocessed nodes (indicating a cycle),
it places them in a final level rather than silently dropping them. This should
not normally occur because upstream validation should prevent cycles.

## Warning Generation

The compiler generates warnings (not errors) for:

1. **Missing function implementations** (Phase 2):
   - For each non-standard, non-loop, non-group node: checks if
     `functionImplementations[nodeTypeId]` exists
   - Format:
     `Node type "${name}" (${nodeTypeId}) has no function implementation.`

2. **Missing implementations inside groups** (Phase 4):
   - Same check applied to inner nodes of each group subtree
   - Format:
     `Node type "${innerName}" inside group "${groupName}" has no function implementation.`
   - Recursively compiled inner plan warnings are prefixed:
     `[Group "${name}"] ${warning}`

3. **Excessive group nesting depth** (Phase 4):
   - If recursion depth reaches `MAX_GROUP_DEPTH` (20)
   - Format:
     `Maximum group nesting depth (20) exceeded. Possible recursive group.`

Warnings are advisory only. The `ExecutionPlan` is valid regardless of warnings.
The executor will only error if an unimplemented node is actually reached during
execution — nodes on unreachable branches (e.g., behind a false condition in a
loop) won't trigger errors.

## Limitations and Deprecated Patterns

1. **No cycle detection in the compiler itself.** The compiler relies on
   upstream validation to prevent cycles. If a cycle exists,
   `topologicalSortWithLevels` will place unprocessed nodes in a final level
   (degraded behavior, not an error).

2. **MAX_GROUP_DEPTH = 20.** Deeply nested groups beyond 20 levels are truncated
   with a warning. This prevents stack overflow from accidentally recursive
   group type definitions.

3. **DEFAULT_MAX_LOOP_ITERATIONS = 10000.** Configurable via
   `options.maxLoopIterations`. The executor enforces this limit at runtime; the
   compiler just records it in the `LoopExecutionBlock`.

4. **bindLoopNodes edges are structural only.** They are excluded from
   resolution maps and adjacency lists. The `'noEquivalent'` underlying type
   means they carry no runtime value.

5. **Handle mapping by index position.** Group input/output mappings rely on the
   assumption that outer node handles and inner GroupInput/GroupOutput handles
   are kept in sync by the `mainReducer`. If they fall out of sync, mappings
   will be incorrect.

6. **Body nodes within loops are sorted independently.** The body's topological
   sort is isolated from the main sort — body nodes only see edges where both
   endpoints are within the body.

## Examples

### Example 1: Simple Linear Graph

```
State:
  nodes: [A, B, C]
  edges: [A->B, B->C]

Compilation:
  Phase 1: inputResolutionMap = { "B:in" => [A:out], "C:in" => [B:out] }
           outputDistributionMap = { "A:out" => [B:in], "B:out" => [C:in] }
  Phase 2: Check A, B, C for implementations (warnings if missing)
  Phase 3: No loops
  Phase 4: No groups
  Phase 5: Topological sort =>
    Level 0: [A]
    Level 1: [B]
    Level 2: [C]

ExecutionPlan:
  levels: [
    [ { kind:'standard', nodeId:'A', concurrencyLevel:0 } ],
    [ { kind:'standard', nodeId:'B', concurrencyLevel:1 } ],
    [ { kind:'standard', nodeId:'C', concurrencyLevel:2 } ],
  ]
  nodeCount: 3
```

### Example 2: Graph with Loop

```
State:
  nodes: [A, LoopStart, Body1, Body2, LoopStop, LoopEnd, B]
  edges: [A->LoopStart, LoopStart-bind->LoopStop, LoopStop-bind->LoopEnd,
          LoopStart->Body1, Body1->Body2, Body2->LoopStop(infer),
          ConditionNode->LoopStop(condition), LoopEnd->B]

Compilation:
  Phase 1: Resolution maps (excluding bindLoopNodes edges)
  Phase 2: Classify — LoopStart/Stop/End are loop nodes, skip
  Phase 3: Loop compilation:
    - Triplet: LoopStart, LoopStop, LoopEnd
    - Body: [Body1, Body2]
    - Body sort: Level 0: [Body1], Level 1: [Body2]
    - LoopExecutionBlock created
  Phase 4: No groups
  Phase 5: Topological sort with loop proxy:
    remainingNodes: [A, LoopStart(proxy), B]
    Level 0: [A]
    Level 1: [LoopExecutionBlock]  (replaces proxy)
    Level 2: [B]

ExecutionPlan:
  levels: [
    [ { kind:'standard', nodeId:'A', concurrencyLevel:0 } ],
    [ { kind:'loop', loopStartNodeId:'LoopStart',
        bodySteps:[Body1, Body2], maxIterations:10000,
        concurrencyLevel:1 } ],
    [ { kind:'standard', nodeId:'B', concurrencyLevel:2 } ],
  ]
  nodeCount: 3 + (3 + 2) = 8
```

### Example 3: Graph with Group

```
State:
  nodes: [A, GroupInstance, B]
  typeOfNodes: { myGroupType: { subtree: { nodes: [GI, Inner1, Inner2, GO],
                                           edges: [GI->Inner1, Inner1->Inner2, Inner2->GO] } } }

Compilation:
  Phase 2: GroupInstance has subtree, skip implementation check
  Phase 4: Group compilation:
    - Build synthetic state with subtree
    - Recursive compile() => innerPlan with 2 levels
    - inputMapping: { outerInput0 => GI_output0 }
    - outputMapping: { GO_input0 => outerOutput0 }
  Phase 5: Sort: Level 0: [A], Level 1: [GroupScope], Level 2: [B]

ExecutionPlan:
  levels: [
    [ { kind:'standard', nodeId:'A' } ],
    [ { kind:'group', groupNodeId:'GroupInstance',
        innerPlan: { levels: [[Inner1],[Inner2]], ... },
        inputMapping: Map(...), outputMapping: Map(...) } ],
    [ { kind:'standard', nodeId:'B' } ],
  ]
  nodeCount: 2 + (1 + 2) = 5
```

## Relationships with Other Features

### -> [State Management (reads State)](../core/stateManagementDoc.md)

The compiler reads `State` as its primary input. It uses:

- `state.nodes` and `state.edges` (via `getCurrentNodesAndEdgesFromState`)
- `state.typeOfNodes` to look up node type definitions, subtrees, and display
  names
- `state.openedNodeGroupStack` (cleared for subtree compilation)

The compiler never mutates state. It is a pure function.

### -> [Nodes (classifies nodes)](../core/nodesDoc.md)

Nodes are classified by their `nodeTypeUniqueId`:

- **Standard node types** (`groupInput`, `groupOutput`, `loopStart`, `loopStop`,
  `loopEnd`): detected by `isStandardNodeType()` and `isLoopNode()`. These have
  built-in execution semantics and don't need user function implementations.
- **Group instances**: nodes whose `typeOfNode.subtree` exists. Compiled into
  `GroupExecutionScope`.
- **User-defined nodes**: all others. Become `StandardExecutionStep` and require
  an entry in `functionImplementations`.

### -> [Edges (builds resolution maps)](../core/edgesDoc.md)

Edges are compiled into `inputResolutionMap` and `outputDistributionMap` in
Phase 1. Structural `bindLoopNodes` edges are excluded. The maps persist into
the `ExecutionPlan` and are used by the executor to resolve values at runtime.

Edges also drive the adjacency lists used for topological sorting — they define
the dependency graph.

### -> [Loops (compiles loop structures)](../features/loopsDoc.md)

The compiler delegates to `compileLoopStructures()` in Phase 3. It uses loop
utilities from `src/utils/nodeStateManagement/nodes/loops.ts`:

- `isLoopNode()` — checks if a node type is one of the 3 loop types
- `getLoopStructureFromNode()` — finds the complete triplet from any loop node
  via `bindLoopNodes` edges
- `getNodesInLoopRegion()` — BFS to discover body nodes between loopStart and
  loopStop

Loop structures are compiled into self-contained `LoopExecutionBlock`s with
their own topologically sorted body steps.

### -> [Node Groups (compiles group scopes)](../features/nodeGroupsDoc.md)

The compiler delegates to `compileGroupScopes()` in Phase 4. Group instances are
detected by checking `typeOfNode.subtree`. The subtree is recursively compiled
by calling `compile()` again with a synthetic state. Handle mappings between
outer and inner boundaries are built by index position using
`extractInputHandleIds()` and `extractOutputHandleIds()`.

Groups inside loop bodies are also handled — `compileLoopStructures()` calls
`compileGroupScopes()` for body nodes.

### -> [Runner Executor (produces ExecutionPlan consumed by executor)](runnerExecutorDoc.md)

The `ExecutionPlan` is the compiler's sole output and the executor's sole input.
The executor reads:

- `levels` — to execute steps level by level via `Promise.allSettled`
- `inputResolutionMap` — to resolve each node's input values from the
  `ValueStore`
- `outputDistributionMap` — to build `OutputHandleInfo` passed to function
  implementations
- `nodeCount` — for progress tracking
- `warnings` — surfaced to the UI before execution starts

### -> [Runner Hook (called by useNodeRunner)](runnerHookDoc.md)

The `useNodeRunner` React hook orchestrates the compile-then-execute flow:

1. Calls `compile(state, functionImplementations, options)` to get an
   `ExecutionPlan`
2. Surfaces `plan.warnings` to the `RunSession.nodeWarnings` map
3. Passes the plan to the executor for execution
4. Creates and manages the `RunSession` lifecycle around the entire process
