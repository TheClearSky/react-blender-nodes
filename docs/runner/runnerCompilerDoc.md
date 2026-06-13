# Runner Compiler

## Overview

The Runner Compiler transforms graph `State` into an `ExecutionPlan` — an
intermediate representation (IR) ready for execution. It reads nodes, edges, and
type definitions from the state and produces an ordered set of execution steps
grouped into concurrency levels.

The compiler is a pure function: it takes `State` + `FunctionImplementations`
and returns an `ExecutionPlan`. It has no side effects and does not mutate the
input state.

The compilation pipeline runs sequential phases:

1. **Graph Analysis** — extract active nodes/edges, build resolution maps from
   edges (skipping structural `bindLoopNodes` / `bindSwitchNodes` edges)
2. **Node Classification** — classify nodes by type, detect missing function
   implementations (warnings)
3. **Loop Compilation** — detect loop triplets, compile pre-stop/post-stop body
   regions into `LoopExecutionBlock`s (nested loops compiled recursively)
4. **Switch Compilation** — detect switch pairs, compile true/false branches
   into `SwitchExecutionBlock`s
5. **Group Compilation** — detect group instances, recursively compile subtrees
   into `GroupExecutionScope`s
6. **Group Boundary Identification** — collect `GroupInput`/`GroupOutput` nodes
   to exclude from the sort
7. **Topological Sort** — Kahn's algorithm producing concurrency levels, with
   loops and switches collapsed to proxy nodes

The compiler also generates warnings for missing function implementations
(warnings, not errors — execution errors only occur if an unimplemented node is
actually reached at runtime).

**Entry point:** `compile()` in `src/utils/nodeRunner/compiler.ts` › `compile`

> Phase numbering in the source comments uses "Phase 1, 2, 3, 3b, 4, 4.5, 5".
> "Phase 3b" is Switch Compilation and "Phase 4.5" is Group Boundary
> Identification. This doc keeps the same labels.

## Entity-Relationship Diagram

```
+------------------+          +---------------------+
|     State        |          | FunctionImplementa- |
|  (nodes, edges,  |          |   tions             |
|   typeOfNodes,   |          | (user-provided      |
|   dataTypes,     |          |  node logic)        |
|   zones)         |          |                     |
+--------+---------+          +---------+-----------+
         |                              |
         +------------+  +--------------+
                      |  |
                      v  v
              +-------+--+--------+
              |    compile()       |
              | (multi-phase       |
              |  pipeline)         |
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
              |  .warnings[]      |         |       { kind: 'loop', loopStartNodeId,
              +---------+---------+         |         preStopSteps[], postStopSteps[], ... }
                                            |
                                            +---> SwitchExecutionBlock
                                            |       { kind: 'switch', switchStartNodeId,
                                            |         trueBranchSteps[], falseBranchSteps[], ... }
                                            |
                                            +---> GroupExecutionScope
                                                    { kind: 'group', groupNodeId, innerPlan, ... }
```

### Relationships

```
State 1──────* Node          "state contains nodes"
State 1──────* Edge          "state contains edges"
State 1──────* TypeOfNode    "state defines node types"
State 0──────* Zone          "state may carry system zones"

ExecutionPlan 1──────* Level             "plan has concurrency levels"
Level         1──────* ExecutionStep     "level has parallel steps"

ExecutionStep ------|> StandardExecutionStep   (kind='standard')
ExecutionStep ------|> LoopExecutionBlock      (kind='loop')
ExecutionStep ------|> SwitchExecutionBlock    (kind='switch')
ExecutionStep ------|> GroupExecutionScope     (kind='group')

LoopExecutionBlock   1──────* ExecutionStep   "preStopSteps + postStopSteps"
SwitchExecutionBlock 1──────* ExecutionStep   "trueBranchSteps + falseBranchSteps"
GroupExecutionScope  1──────1 ExecutionPlan   "group has inner plan"

ExecutionPlan 1──────1 InputResolutionMap     "plan has input map"
ExecutionPlan 1──────1 OutputDistributionMap  "plan has output map"

InputResolutionMap    *──────1 InputResolutionEntry    "per handle:edge"
OutputDistributionMap *──────1 OutputDistributionEntry "per handle:edge"
```

## Functional Dependency Diagram

```
compile()
  |
  +-- getCurrentNodesAndEdgesFromState()    [Phase 1]
  |     src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts
  |     Extracts active nodes/edges from state (respects openedNodeGroupStack)
  |
  +-- isBindLoopNodesEdge()                [Phase 1 + Phase 5]
  |     src/utils/nodeRunner/loopCompiler.ts
  |     Detects structural bindLoopNodes edges to exclude from data flow maps
  |
  +-- isBindSwitchNodesEdge()              [Phase 1 + Phase 5]
  |     src/utils/nodeRunner/switchCompilerHelpers.ts
  |     Detects structural bindSwitchNodes edges to exclude from data flow maps
  |
  +-- isLoopNode()                         [Phase 2]
  |     src/utils/nodeStateManagement/nodes/loops/loopIdentification.ts
  |     Checks if nodeTypeId is loopStart, loopStop, or loopEnd
  |
  +-- isSwitchNode()                       [Phase 2]
  |     src/utils/nodeStateManagement/nodes/switches/switchIdentification.ts
  |     Checks if nodeTypeId is switchStart or switchEnd
  |
  +-- isStandardNodeType()                 [Phase 2]
  |     src/utils/nodeRunner/groupCompiler.ts
  |     Checks if nodeTypeId is any of the 7 standard node types
  |
  +-- hasKey()                             [Phase 2]
  |     src/utils/nodeRunner/groupCompiler.ts
  |     Type-safe key existence check on Record types
  |
  +-- compileLoopStructures()              [Phase 3]
  |     src/utils/nodeRunner/loopCompiler.ts
  |     |
  |     +-- getLoopStructureFromNode()
  |     |     src/utils/nodeStateManagement/nodes/loops/loopStructure.ts
  |     |     Finds loop triplet (start, stop, end) from any loop node
  |     |
  |     +-- findZoneByStructure()  (preStop / postStop zones)
  |     |     src/utils/nodeStateManagement/zones/types.ts
  |     |     Fast path: read body node IDs from state.zones
  |     |
  |     +-- getNodesInLoopRegion()  (BFS fallback)
  |     |     src/utils/nodeStateManagement/nodes/loops/loopRegion.ts
  |     |     Returns { nodesInRegionStartToStop, nodesInRegionStopToEnd }
  |     |
  |     +-- topologicalSortWithLevels()
  |     |     src/utils/nodeRunner/topologicalSort.ts
  |     |
  |     +-- compileGroupScopes()
  |           src/utils/nodeRunner/groupCompiler.ts
  |           Handles group instances inside loop body regions
  |
  +-- compileSwitchStructures()            [Phase 3b]
  |     src/utils/nodeRunner/switchCompiler.ts
  |     |
  |     +-- getSwitchStructureFromNode()
  |     |     src/utils/nodeStateManagement/nodes/switches/switchStructure.ts
  |     |     Finds switch pair (start, end) from any switch node
  |     |
  |     +-- findZoneByStructure()  (trueBranch / falseBranch zones)
  |     +-- getNodesInSwitchRegion()  (BFS fallback)
  |     |     src/utils/nodeStateManagement/nodes/switches/switchRegion.ts
  |     |     Returns { nodesInTrueBranch, nodesInFalseBranch }
  |     +-- topologicalSortWithLevels()
  |     +-- compileGroupScopes()
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
        Kahn's algorithm on remaining nodes + loop/switch proxies
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
  |     (early return empty plan if no nodes)   |
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
  |   zones OR getNodesInLoop |     |        |
  |     Region (preStop/post) |     |        |
  |   sort each body region   |     |        |
  |   (nested loops recursive)|     |        |
  |   => loopBlocks[]         |     |        |
  |   => loopNodeIds (Set)    |     |        |
  +--------+------------------+     |        |
           |                        |        |
           v                        |        |
  +--------+------------------+     |        |
  | Phase 3b: Switch Compile  |     |        |
  | For each switchStart node:|     |        |
  |   getSwitchStructure...    |     |        |
  |   zones OR getNodesIn     |     |        |
  |     SwitchRegion (T/F)    |     |        |
  |   sort each branch        |     |        |
  |   => switchBlocks[]       |     |        |
  |   => switchNodeIds (Set)  |     |        |
  +--------+------------------+     |        |
           |                        |        |
           v                        |        |
  +--------+------------------+     |        |
  | Phase 4: Group Compilation|     |        |
  | For each group instance:  |     |        |
  |   Build synthetic subtree |     |        |
  |   compile() recursively   |     |        |
  |   Build handle mappings   |     |        |
  |   => groupScopes[]        |     |        |
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
  | Remaining nodes + loop &  |     |        |
  |   switch proxies          |     |        |
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
|   +-- nodes, edges, typeOfNodes, dataTypes, zones
|   +-- getCurrentNodesAndEdgesFromState()
|   +-- Loop utilities (isLoopNode, getLoopStructureFromNode, getNodesInLoopRegion)
|   +-- Switch utilities (isSwitchNode, getSwitchStructureFromNode, getNodesInSwitchRegion)
|   +-- Zone utilities (findZoneByStructure)
|
+-- Runner Systems
    +-- >>> Runner Compiler <<< (this feature)
    |   +-- compiler.ts             compile() - main multi-phase pipeline
    |   +-- topologicalSort.ts      topologicalSortWithLevels() - Kahn's algorithm
    |   +-- loopCompiler.ts         compileLoopStructures(), isBindLoopNodesEdge()
    |   +-- switchCompiler.ts       compileSwitchStructures()
    |   +-- switchCompilerHelpers.ts isBindSwitchNodesEdge()
    |   +-- groupCompiler.ts        compileGroupScopes(), isStandardNodeType(),
    |   |                           isGroupBoundaryNode(), hasKey(), MAX_GROUP_DEPTH
    |   +-- types.ts                ExecutionPlan, ExecutionStep, StandardExecutionStep,
    |                               LoopExecutionBlock, SwitchExecutionBlock,
    |                               GroupExecutionScope, InputResolutionEntry,
    |                               OutputDistributionEntry
    |
    +-- Runner Executor
    |   +-- executor/             Consumes ExecutionPlan, calls FunctionImplementations
    |   +-- valueStore.ts         Stores intermediate values during execution
    |
    +-- Runner Hook
    |   +-- useNodeRunner.ts      React hook orchestrating compile + execute
    |
    +-- Execution Recording
        +-- executionRecorder.ts  Records steps, timing, values for replay
```

## ExecutionPlan Type

The `ExecutionPlan` (defined in `src/utils/nodeRunner/types.ts` ›
`ExecutionPlan`) is the compiled IR — the output of the compiler, consumed by
the executor.

```
ExecutionPlan
+-- levels: ReadonlyArray<ReadonlyArray<ExecutionStep>>
|     Execution steps grouped by concurrency level.
|     levels[0] runs first; levels[1] after all of levels[0] complete.
|     Steps within the same level run concurrently via Promise.allSettled.
|
+-- inputResolutionMap: ReadonlyMap<string, ReadonlyArray<InputResolutionEntry>>
|     Key format: "nodeId:handleId"  (target/consuming side)
|     Value: list of edges feeding into that input handle.
|     Used by executor to resolve input values from ValueStore.
|
+-- outputDistributionMap: ReadonlyMap<string, ReadonlyArray<OutputDistributionEntry>>
|     Key format: "nodeId:handleId"  (source/producing side)
|     Value: list of edges consuming from that output handle.
|     Used for building OutputHandleInfo for function implementations.
|
+-- nodeCount: number
|     Total executable nodes in the plan (recursive into loops/switches/groups).
|     Used for progress tracking (completedSteps / nodeCount).
|
+-- warnings: ReadonlyArray<string>
      Warnings generated during compilation.
      E.g., missing function implementations, excessive group nesting depth.
```

**nodeCount calculation** (`src/utils/nodeRunner/compiler.ts` › `compile`, after
the sort):

- Standard step: `+1`
- Loop block: `+3` (triplet) `+ preStopSteps.length + postStopSteps.length`
- Switch block: `+2` (pair) `+ trueBranchSteps.length + falseBranchSteps.length`
- Group scope: `+1` (group node) `+ innerPlan.nodeCount`

> The count only walks the **top-level** `levels` of the plan; it does not
> recurse into loop/switch body steps (it adds their `.length`). For groups it
> does add `innerPlan.nodeCount`, which already accounts for nesting.

## Execution Step Types

The `ExecutionStep` type is a discriminated union on the `kind` field
(`src/utils/nodeRunner/types.ts` › `ExecutionStep`):

```
ExecutionStep =
  | StandardExecutionStep   (kind: 'standard')
  | LoopExecutionBlock      (kind: 'loop')
  | SwitchExecutionBlock    (kind: 'switch')
  | GroupExecutionScope     (kind: 'group')
```

### StandardExecutionStep

Represents a single node that has a user-provided function implementation.

```
StandardExecutionStep {
  kind: 'standard'           -- discriminant
  nodeId: string             -- runtime node instance ID
  nodeTypeId: string         -- key in state.typeOfNodes
  nodeTypeName: string       -- display name from typeOfNodes (falls back to nodeTypeId)
  concurrencyLevel: number   -- which level this step belongs to
}
```

At execution time, the executor resolves inputs from the `inputResolutionMap` +
`ValueStore`, calls
`functionImplementations[nodeTypeId](inputs, outputs, context)`, and stores
returned outputs in the `ValueStore`.

### LoopExecutionBlock

Represents a compiled loop structure: the triplet (start, stop, end) plus the
two topologically sorted body regions.

```
LoopExecutionBlock {
  kind: 'loop'                               -- discriminant
  loopStartNodeId: string                     -- loopStart node instance ID
  loopStopNodeId: string                      -- loopStop node instance ID
  loopEndNodeId: string                       -- loopEnd node instance ID
  preStopSteps: ReadonlyArray<ExecutionStep>  -- sorted body between loopStart and loopStop
  postStopSteps: ReadonlyArray<ExecutionStep> -- sorted body between loopStop and loopEnd
  maxIterations: number                       -- safety limit (default: 100)
  concurrencyLevel: number                    -- level in the outer plan
}
```

> Loop bodies are split into **two** regions — `preStopSteps` (run before the
> condition check) and `postStopSteps` (run after, between loopStop and
> loopEnd). Each region is sorted independently. Both can contain nested
> `LoopExecutionBlock`, `SwitchExecutionBlock`, or `GroupExecutionScope` steps.

### SwitchExecutionBlock

Represents a compiled switch structure: the pair (start, end) plus the
topologically sorted true and false branch steps. Only one branch executes at
runtime depending on the condition.

```
SwitchExecutionBlock {
  kind: 'switch'                                 -- discriminant
  switchStartNodeId: string                       -- switchStart node instance ID
  switchEndNodeId: string                         -- switchEnd node instance ID
  trueBranchSteps: ReadonlyArray<ExecutionStep>   -- sorted steps for the true branch
  falseBranchSteps: ReadonlyArray<ExecutionStep>  -- sorted steps for the false branch
  concurrencyLevel: number                        -- level in the outer plan
}
```

Branch steps can themselves be `GroupExecutionScope` steps (groups inside a
branch). Switches have **no** `maxIterations` (they are not iterative).

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

**Handle mapping** works by index position (after flattening panels):

- `outerNode.inputs[i]` maps to `GroupInput.outputs[i]`
- `GroupOutput.inputs[i]` maps to `outerNode.outputs[i]`

The executor maps outer input values to GroupInput output positions, executes
`innerPlan`, then maps GroupOutput input values to outer output positions.

**Recursion depth limit:** `MAX_GROUP_DEPTH = 20`
(`src/utils/nodeRunner/groupCompiler.ts` › `MAX_GROUP_DEPTH`) prevents infinite
recursion from circular group references.

## The Compilation Phases

### Phase 1: Graph Analysis

**Input:** `State` (the complete graph state)

**Algorithm:**

1. Call `getCurrentNodesAndEdgesFromState(state)` to extract the active nodes
   and edges. This function respects `openedNodeGroupStack` — when viewing
   inside a group, it returns the subtree's nodes/edges.
2. If `nodes.length === 0`, return an empty `ExecutionPlan` immediately
   (`levels: []`, empty maps, `nodeCount: 0`, `warnings: []`).
3. Iterate over all edges to build two lookup maps:
   - **inputResolutionMap**: For each edge, create key
     `"${edge.target}:${targetHandle}"` and push an `InputResolutionEntry`
     (`edgeId`, `sourceNodeId`, `sourceHandleId`).
   - **outputDistributionMap**: For each edge, create key
     `"${edge.source}:${sourceHandle}"` and push an `OutputDistributionEntry`
     (`edgeId`, `targetNodeId`, `targetHandleId`).
4. Skip edges with missing handles (`!sourceHandle || !targetHandle`).
5. Skip structural bind edges — both `bindLoopNodes` edges
   (`isBindLoopNodesEdge()`) and `bindSwitchNodes` edges
   (`isBindSwitchNodesEdge()`). These connect loop/switch boundary nodes and
   carry no data.

**Output:** `inputResolutionMap`, `outputDistributionMap`, `nodes[]`, `edges[]`

**bindLoopNodes detection** (`src/utils/nodeRunner/loopCompiler.ts` ›
`isBindLoopNodesEdge`): the source node must be a loop node (`isLoopNode`) and
its source output handle's `dataType.dataTypeUniqueId` must equal
`standardDataTypeNamesMap.bindLoopNodes`. As a fallback it also checks the
target node: if the target is a loop node and the target input handle (after
flattening panels) has data type `bindLoopNodes`, the edge is structural.

**bindSwitchNodes detection** (`src/utils/nodeRunner/switchCompilerHelpers.ts` ›
`isBindSwitchNodesEdge`): the source node must be a switch node (`isSwitchNode`)
and its source output handle's `dataType.dataTypeUniqueId` must equal
`standardDataTypeNamesMap.bindSwitchNodes`. (This helper only checks the source
side.)

### Phase 2: Node Classification + Missing Implementation Detection

**Input:** `nodes[]` from Phase 1, `state.typeOfNodes`,
`functionImplementations`

**Algorithm:** For each node, read `node.data.nodeTypeUniqueId` and, in this
exact order:

1. `isLoopNode(typeId)` → skip (handled in Phase 3)
2. `isSwitchNode(typeId)` → skip (handled in Phase 3b)
3. `isStandardNodeType(typeId)` → skip (built-in execution)
4. `state.typeOfNodes[typeId]?.subtree` exists → skip (group instance, checked
   in Phase 4)
5. Otherwise → check if `functionImplementations[nodeTypeId]` exists (via
   `hasKey()` + truthiness)
   - If missing: push warning
     `Node type "${name}" (${nodeTypeId}) has no function implementation.`

**Order matters:** `isLoopNode` and `isSwitchNode` are checked _before_
`isStandardNodeType` to preserve TypeScript narrowing.

**Output:** `warnings[]` (appended to)

The `isStandardNodeType()` function acts as a TypeScript type guard. In the
false branch, the type of `nodeTypeId` narrows to
`Exclude<NodeTypeUniqueId, StandardNodeTypeName>`, which matches the key type of
`FunctionImplementations` — enabling direct indexed access without casts.
`StandardNodeTypeName` is derived from `standardNodeTypeNames` and covers all
**7** standard node types: `groupInput`, `groupOutput`, `loopStart`, `loopEnd`,
`loopStop`, `switchStart`, `switchEnd`.

**Note:** Warnings are non-blocking. The compiler produces a valid
`ExecutionPlan` even when implementations are missing. The executor errors only
if an unimplemented node is actually reached during execution.

### Phase 3: Loop Compilation

Delegated to `compileLoopStructures()` in `src/utils/nodeRunner/loopCompiler.ts`
› `compileLoopStructures`.

**Input:** `state`, `nodes[]`, `edges[]`, `maxIterations`,
`functionImplementations`, `compile` (self-reference for recursion), `depth`

**Algorithm:**

1. Find all nodes where
   `nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart`.
2. For each loopStart node, call
   `getLoopStructureFromNode(state, loopStartNode)` to resolve the complete
   triplet (`loopStart`, `loopStop`, `loopEnd`) by walking the `bindLoopNodes`
   edges. Skip if the structure is incomplete.
3. Discover the two body regions:
   - **Zone fast path:** if `state.zones` is present, look up
     `findZoneByStructure(state.zones, loopStart.id, 'preStop')` and
     `'postStop'`. If both zones exist, use their `nodeIds`.
   - **BFS fallback:** otherwise call
     `getNodesInLoopRegion(state, loopStructure)`, which returns
     `{ nodesInRegionStartToStop, nodesInRegionStopToEnd }` via bidirectional
     BFS bounded by the loop boundary nodes (handles zigzag paths).
4. Record each loop as a `LoopInfo` with `bodyNodeIds` (pre-stop),
   `postStopBodyNodeIds`, and their union `allBodyNodeIds`.
5. **Nesting detection:** a loop is _nested_ if its `loopStartId` appears in
   another loop's `allBodyNodeIds`. Nested loops are NOT compiled at the top
   level — they are compiled recursively by their parent (`compileSingleLoop`
   recurses on inner loops and embeds them as body steps via an inner proxy).
6. For each **top-level** loop, `compileSingleLoop()` builds the block:
   - `compileBodyRegion()` sorts each region's nodes. It uses an inner proxy for
     any inner loops (redirecting their edges), runs
     `topologicalSortWithLevels`, then calls `compileGroupScopes()` (at
     `depth + 1`) to detect group instances and replaces group node IDs with
     their `GroupExecutionScope`. `GroupInput`/`GroupOutput` boundary nodes are
     skipped.
   - The result is a `LoopExecutionBlock` with `preStopSteps`, `postStopSteps`,
     `maxIterations`, and `concurrencyLevel: 0` (reassigned by Phase 5).
7. Add ALL node IDs of each top-level loop tree (triplet + all body nodes,
   including nested-loop internals) to the `loopNodeIds` exclusion set.

**Output:** `loopBlocks: ReadonlyArray<LoopExecutionBlock>`,
`loopNodeIds: ReadonlySet<string>`

### Phase 3b: Switch Compilation

Delegated to `compileSwitchStructures()` in
`src/utils/nodeRunner/switchCompiler.ts` › `compileSwitchStructures`.

**Input:** `state`, `nodes[]`, `edges[]`, `maxIterations`,
`functionImplementations`, `compile`, `depth`

**Algorithm:**

1. Find all nodes where
   `nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart`.
2. For each, call `getSwitchStructureFromNode(state, switchStartNode)` to
   resolve the pair (`switchStart`, `switchEnd`) via the `bindSwitchNodes` edge.
   Skip if incomplete.
3. Discover the two branches:
   - **Zone fast path:**
     `findZoneByStructure(state.zones, switchStart.id, 'trueBranch')` and
     `'falseBranch'`; use their `nodeIds` if both exist.
   - **BFS fallback:** otherwise `getNodesInSwitchRegion(state, structure)`
     returns `{ nodesInTrueBranch, nodesInFalseBranch }`. It seeds BFS from
     edges leaving the switchStart's true/false output handle zones and entering
     the switchEnd's true/false input handle zones (`getZoneHandleIds` splits
     the data handles in half via `splitIntoZones`, true = first ceil(n/2)).
4. Add `switchStart.id`, `switchEnd.id`, and all branch node IDs to
   `switchNodeIds`.
5. `compileBranch()` sorts each branch (`topologicalSortWithLevels`), runs
   `compileGroupScopes()` at `depth + 1`, replaces group node IDs with scopes,
   and skips `GroupInput`/`GroupOutput` nodes.
6. Build a `SwitchExecutionBlock` with `trueBranchSteps`, `falseBranchSteps`,
   and `concurrencyLevel: 0` (reassigned by Phase 5).

**Output:** `switchBlocks: ReadonlyArray<SwitchExecutionBlock>`,
`switchNodeIds: ReadonlySet<string>`

> Unlike `compileLoopStructures`, the switch compiler does not perform separate
> nesting detection at this layer; nested switches/loops inside a branch are
> represented through recursive `compileGroupScopes` and the proxy logic, and a
> switch whose `switchStart` lies inside a loop body is compiled as part of that
> loop body region instead.

### Phase 4: Group Compilation

Delegated to `compileGroupScopes()` in `src/utils/nodeRunner/groupCompiler.ts` ›
`compileGroupScopes`.

**Input:** `state`, `nodes[]`, `functionImplementations`, `maxIterations`,
`compile` (self-reference), `depth`

**Algorithm:**

1. If `depth >= MAX_GROUP_DEPTH` (20), return empty results plus the warning
   `Maximum group nesting depth (20) exceeded. Possible recursive group.`
2. Find all nodes whose `state.typeOfNodes[nodeTypeId]?.subtree` exists (group
   instances).
3. For each group instance: a. Add `node.id` to `groupNodeIds`. b. For each
   inner node in `subtree.nodes`, skip standard node types; for the rest, push a
   warning if no function implementation exists:
   `Node type "${innerName}" inside group "${outerName}" has no function implementation.`
   c. Build a synthetic `State`: spread `...state`, replace `nodes`/`edges` with
   the subtree's, and set `openedNodeGroupStack: undefined` so
   `getCurrentNodesAndEdgesFromState` returns the subtree's root nodes. d. Call
   `compile()` recursively at `depth + 1` to produce `innerPlan`. e. Prefix and
   collect inner plan warnings: `[Group "${name}"] ${warning}`. f. Build
   **inputMapping**: find the `GroupInput` node, map outer input handle IDs →
   inner GroupInput output handle IDs by index position. g. Build
   **outputMapping**: find the `GroupOutput` node, map inner GroupOutput input
   handle IDs → outer output handle IDs by index position. h. Push a
   `GroupExecutionScope` with `concurrencyLevel: 0`.

**Output:** `groupScopes: ReadonlyArray<GroupExecutionScope>`,
`groupNodeIds: ReadonlySet<string>`, `warnings: ReadonlyArray<string>`

**Handle mapping detail:**

- `extractInputHandleIds()` flattens panel inputs (panels contain nested
  `inputs[]` arrays) to get ordered IDs.
- `extractOutputHandleIds()` gets ordered output IDs directly.
- Mapping uses `Math.min(outerCount, innerCount)` to handle mismatched counts
  safely.

> **Subtree zone caveat:** because the synthetic subtree state is built by
> spreading `...state` and only overriding
> `nodes`/`edges`/`openedNodeGroupStack`, it inherits the **outer root**
> `state.zones` rather than `subtree.zones`. As a result, loops/switches
> _inside_ a recursively-compiled subtree generally fall back to BFS region
> discovery (their structure IDs do not match the outer zones). The result is
> still correct; only the fast path differs.

**Phase 4.5: Group Boundary Node Identification**

After group compilation, the compiler iterates `nodes` and collects every
`GroupInput`/`GroupOutput` node (`isGroupBoundaryNode`) into
`groupBoundaryNodeIds`. These are data mapping points handled by the executor —
not executable nodes — and must be excluded from the topological sort. Their
edges remain in the resolution maps so the executor can resolve handle mappings.

### Phase 5: Topological Sort

**Input:** All data from previous phases

**Step 1 — Build proxy maps.** Each loop is represented by a single proxy node
(its `loopStartNodeId`); each switch by its `switchStartNodeId`. Every loop node
(triplet + standard body steps from `preStopSteps`/`postStopSteps`) maps to its
loop proxy via `nodeToLoopProxy`; every switch node (pair + standard branch
steps) maps to its switch proxy via `nodeToSwitchProxy`.

> Only `kind === 'standard'` body/branch steps are added to the proxy maps when
> walking `preStopSteps`/`postStopSteps`/`trueBranchSteps`/`falseBranchSteps`.
> Nested loop/switch/group steps are not individually proxied here — they live
> entirely inside the parent block.

**Step 2 — Build remaining node set:**

```
remainingNodeIds = nodes.map(id)
  .filter(id => !loopNodeIds.has(id)
             && !switchNodeIds.has(id)
             && !groupBoundaryNodeIds.has(id))
  + loopProxyIds      (one proxy per loop = its loopStartNodeId)
  + switchProxyIds    (one proxy per switch = its switchStartNodeId)
```

**Step 3 — Build filtered adjacency lists:** Iterate all edges, skipping bind
edges, then redirect loop/switch endpoints to their proxies:

- If source is a loop node → redirect to its loop proxy; then if still a switch
  node → redirect to its switch proxy. (Same chain for target.)
- Skip if `source === target` after redirection (internal loop/switch edge).
- Add the edge to `filteredAdjacency` / `filteredReverseAdjacency` only if both
  endpoints are in `remainingSet`.

**Step 4 — Run Kahn's algorithm:** Call
`topologicalSortWithLevels(remainingNodeIds, filteredAdjacency, filteredReverseAdjacency)`.

The algorithm:

1. Calculate in-degree for each node from `reverseAdjacencyList`.
2. Initialize the queue with all in-degree-0 nodes.
3. Process level by level: all nodes currently queued form one concurrency
   level; for each, decrement the in-degree of its forward neighbors; neighbors
   reaching in-degree 0 enter the next level's queue.
4. **If not all nodes are processed (cycle detected), it THROWS**
   `Error("Topological sort detected cycle among nodes: ...")` listing the
   unprocessed node IDs. (Upstream connection validation is expected to prevent
   cycles, so this should not occur in practice.)

**Step 5 — Convert to ExecutionStep levels:** For each sorted level (index
`levelIdx`):

- If the nodeId is a loop proxy → push its `LoopExecutionBlock` with
  `concurrencyLevel: levelIdx`.
- Else if the nodeId is a switch proxy → push its `SwitchExecutionBlock` with
  `concurrencyLevel: levelIdx`.
- Else if the nodeId has a `GroupExecutionScope` → push the scope with
  `concurrencyLevel: levelIdx`.
- Otherwise → create a `StandardExecutionStep` (looking up `nodeTypeName` from
  `state.typeOfNodes`, falling back to the ID).

Empty levels are dropped (`if (steps.length > 0) levels.push(steps)`).

**Step 6 — Count nodes:** compute `nodeCount` (see the nodeCount calculation
above).

**Output:** `ExecutionPlan`

## inputResolutionMap and outputDistributionMap

These two maps are the compiled edge data that the executor uses to resolve
values at runtime. Their entry types live in `src/utils/nodeRunner/types.ts` ›
`InputResolutionEntry` / `OutputDistributionEntry`.

### inputResolutionMap

**Key:** `"targetNodeId:targetHandleId"` (the consuming input handle)

**Value:** `InputResolutionEntry[]` — one entry per edge feeding into this
handle.

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
output.

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
  +--------+    |
  | Node D |    |
  | out-1 -+----+   (fan-in to B.in-1)
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

### Structural bind-edge exclusion

Structural `bindLoopNodes` and `bindSwitchNodes` edges (which connect
loop/switch boundary nodes to each other) are excluded from both maps and from
the adjacency lists. They carry no data — they exist only to define the
loop/switch structure in the visual graph. Both underlying data types are
`'noEquivalent'`. Detection uses `isBindLoopNodesEdge()`
(`src/utils/nodeRunner/loopCompiler.ts` › `isBindLoopNodesEdge`) and
`isBindSwitchNodesEdge()` (`src/utils/nodeRunner/switchCompilerHelpers.ts` ›
`isBindSwitchNodesEdge`).

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

**Loop and switch proxies participate in the sort.** A loop's (or switch's)
external edges (from upstream nodes into its inputs, from its outputs to
downstream nodes) determine the concurrency level at which the entire block
executes. All internal edges are skipped via proxy redirection.

**Group nodes participate directly.** A group node is a single node in the sort
— its internal complexity is hidden behind the `GroupExecutionScope`. External
edges to/from the group node determine its level.

**Cycle handling:** `topologicalSortWithLevels` **throws** on a detected cycle
(it does not place leftover nodes in a final level). Upstream connection
validation is responsible for preventing cycles before compilation.

## Warning Generation

The compiler generates warnings (not errors) for:

1. **Missing function implementations** (Phase 2):
   - For each non-standard, non-loop, non-switch, non-group node: checks if
     `functionImplementations[nodeTypeId]` exists.
   - Format:
     `Node type "${name}" (${nodeTypeId}) has no function implementation.`

2. **Missing implementations inside groups** (Phase 4):
   - Same check applied to inner (non-standard) nodes of each group subtree.
   - Format:
     `Node type "${innerName}" inside group "${outerName}" has no function implementation.`
   - Recursively compiled inner plan warnings are prefixed:
     `[Group "${name}"] ${warning}`.

3. **Excessive group nesting depth** (Phase 4):
   - If recursion depth reaches `MAX_GROUP_DEPTH` (20).
   - Format:
     `Maximum group nesting depth (20) exceeded. Possible recursive group.`

Warnings are advisory only. The `ExecutionPlan` is valid regardless of warnings.
The executor only errors if an unimplemented node is actually reached during
execution — nodes on unreachable branches (e.g., the not-taken side of a switch,
or a body behind a false loop condition) won't trigger errors.

## Limitations and Notes

1. **Cycle detection throws.** The compiler relies on upstream validation to
   prevent cycles. If a cycle reaches `topologicalSortWithLevels`, it throws an
   `Error` naming the unprocessed nodes.

2. **MAX_GROUP_DEPTH = 20.** Group recursion beyond 20 levels short-circuits
   with a warning and an empty group result, preventing stack overflow from
   accidentally recursive group type definitions.

3. **DEFAULT_MAX_LOOP_ITERATIONS = 100.** Defined in
   `src/utils/nodeRunner/compiler.ts` › `DEFAULT_MAX_LOOP_ITERATIONS`,
   configurable via `options.maxLoopIterations`. The executor enforces this
   limit at runtime; the compiler just records it on each `LoopExecutionBlock`.
   (Switches themselves have no iteration limit, but the switch compiler threads
   its received `maxIterations` through to its internal `compileGroupScopes`
   call, so loops inside groups inside switch branches honor
   `options.maxLoopIterations` too.)

4. **Bind edges are structural only.** `bindLoopNodes` / `bindSwitchNodes` edges
   (underlying type `'noEquivalent'`) are excluded from resolution maps and
   adjacency lists.

5. **Handle mapping by index position.** Group input/output mappings rely on the
   assumption that outer node handles and inner GroupInput/GroupOutput handles
   are kept in sync by the `mainReducer`. If they fall out of sync, mappings
   will be incorrect.

6. **Body/branch regions are sorted independently.** A loop's two body regions
   and a switch's two branches are each sorted in isolation — their internal
   adjacency only sees edges where both endpoints are within that region/branch.

7. **Zone fast path vs BFS fallback.** When `state.zones` carries the relevant
   `preStop`/`postStop` (loop) or `trueBranch`/`falseBranch` (switch) zones,
   body discovery is an O(1) read of the precomputed `nodeIds`. Otherwise the
   compiler falls back to bidirectional BFS region discovery. Both yield the
   same membership.

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
  Phase 3/3b/4: No loops, switches, or groups
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
  Phase 2: LoopStart/Stop/End are loop nodes, skip
  Phase 3: Loop compilation:
    - Triplet: LoopStart, LoopStop, LoopEnd
    - preStop body: [Body1, Body2]  (between LoopStart and LoopStop)
    - preStop sort: Level 0: [Body1], Level 1: [Body2]
    - postStop body: []  (nothing between LoopStop and LoopEnd)
    - LoopExecutionBlock created
  Phase 5: Topological sort with loop proxy:
    remainingNodes: [A, LoopStart(proxy), B]
    Level 0: [A]
    Level 1: [LoopExecutionBlock]  (replaces proxy)
    Level 2: [B]

ExecutionPlan:
  levels: [
    [ { kind:'standard', nodeId:'A', concurrencyLevel:0 } ],
    [ { kind:'loop', loopStartNodeId:'LoopStart',
        preStopSteps:[Body1, Body2], postStopSteps:[],
        maxIterations:100, concurrencyLevel:1 } ],
    [ { kind:'standard', nodeId:'B', concurrencyLevel:2 } ],
  ]
  nodeCount: 2 + (3 + 2 + 0) = 7
```

### Example 3: Graph with Switch

```
State:
  nodes: [A, SwitchStart, T1, F1, SwitchEnd, B]
  edges: [A->SwitchStart, SwitchStart-bind->SwitchEnd,
          SwitchStart(trueOut)->T1, T1->SwitchEnd(trueIn),
          SwitchStart(falseOut)->F1, F1->SwitchEnd(falseIn),
          Cond->SwitchStart(condition), SwitchEnd->B]

Compilation:
  Phase 1: Resolution maps (excluding bindSwitchNodes edges)
  Phase 2: SwitchStart/End are switch nodes, skip
  Phase 3b: Switch compilation:
    - Pair: SwitchStart, SwitchEnd
    - trueBranch: [T1]    falseBranch: [F1]
    - SwitchExecutionBlock created
  Phase 5: Topological sort with switch proxy:
    remainingNodes: [A, SwitchStart(proxy), B]
    Level 0: [A]
    Level 1: [SwitchExecutionBlock]
    Level 2: [B]

ExecutionPlan:
  levels: [
    [ { kind:'standard', nodeId:'A', concurrencyLevel:0 } ],
    [ { kind:'switch', switchStartNodeId:'SwitchStart',
        trueBranchSteps:[T1], falseBranchSteps:[F1],
        concurrencyLevel:1 } ],
    [ { kind:'standard', nodeId:'B', concurrencyLevel:2 } ],
  ]
  nodeCount: 2 + (2 + 1 + 1) = 6
```

### Example 4: Graph with Group

```
State:
  nodes: [A, GroupInstance, B]
  typeOfNodes: { myGroupType: { subtree: { nodes: [GI, Inner1, Inner2, GO],
                                           edges: [GI->Inner1, Inner1->Inner2, Inner2->GO] } } }

Compilation:
  Phase 2: GroupInstance has subtree, skip implementation check
  Phase 4: Group compilation:
    - Build synthetic state with subtree (openedNodeGroupStack cleared)
    - Recursive compile() => innerPlan with 2 levels ([Inner1],[Inner2])
    - inputMapping: { outerInput0 => GI_output0 }
    - outputMapping: { GO_input0 => outerOutput0 }
  Phase 4.5: GI and GO marked as boundary nodes (excluded from outer sort)
  Phase 5: Sort: Level 0: [A], Level 1: [GroupScope], Level 2: [B]

ExecutionPlan:
  levels: [
    [ { kind:'standard', nodeId:'A', concurrencyLevel:0 } ],
    [ { kind:'group', groupNodeId:'GroupInstance',
        innerPlan: { levels: [[Inner1],[Inner2]], ... },
        inputMapping: Map(...), outputMapping: Map(...),
        concurrencyLevel:1 } ],
    [ { kind:'standard', nodeId:'B', concurrencyLevel:2 } ],
  ]
  nodeCount: 2 + (1 + innerPlan.nodeCount=2) = 5
```

## Relationships with Other Features

### -> [State Management (reads State)](../core/stateManagementDoc.md)

The compiler reads `State` as its primary input. It uses:

- `state.nodes` and `state.edges` (via `getCurrentNodesAndEdgesFromState`)
- `state.typeOfNodes` to look up node type definitions, subtrees, and display
  names
- `state.zones` for the loop/switch body fast path (`findZoneByStructure`)
- `state.openedNodeGroupStack` (cleared for subtree compilation)

The compiler never mutates state. It is a pure function.

### -> [Nodes (classifies nodes)](../core/nodesDoc.md)

Nodes are classified by their `nodeTypeUniqueId`:

- **Standard node types** (the 7: `groupInput`, `groupOutput`, `loopStart`,
  `loopEnd`, `loopStop`, `switchStart`, `switchEnd`): detected by
  `isStandardNodeType()`, `isLoopNode()`, and `isSwitchNode()`. These have
  built-in execution semantics and don't need user function implementations.
- **Group instances**: nodes whose `typeOfNode.subtree` exists. Compiled into
  `GroupExecutionScope`.
- **User-defined nodes**: all others. Become `StandardExecutionStep` and require
  an entry in `functionImplementations`.

### -> [Edges (builds resolution maps)](../core/edgesDoc.md)

Edges are compiled into `inputResolutionMap` and `outputDistributionMap` in
Phase 1. Structural `bindLoopNodes` / `bindSwitchNodes` edges are excluded. The
maps persist into the `ExecutionPlan` and are used by the executor to resolve
values at runtime. Edges also drive the adjacency lists used for topological
sorting — they define the dependency graph.

### -> [Loops (compiles loop structures)](../features/loopsDoc.md)

The compiler delegates to `compileLoopStructures()` in Phase 3. It uses loop
utilities from `src/utils/nodeStateManagement/nodes/loops/`:

- `isLoopNode()` — checks if a node type is one of the 3 loop types
- `getLoopStructureFromNode()` — resolves the complete triplet from any loop
  node via `bindLoopNodes` edges
- `getNodesInLoopRegion()` — bidirectional BFS that returns
  `{ nodesInRegionStartToStop, nodesInRegionStopToEnd }`

Loops compile into `LoopExecutionBlock`s with independently sorted
`preStopSteps` and `postStopSteps`. Nested loops are compiled recursively as
body steps of their parent.

### -> [Switches (compiles switch structures)](../features/switchesDoc.md)

The compiler delegates to `compileSwitchStructures()` in Phase 3b. It uses
switch utilities from `src/utils/nodeStateManagement/nodes/switches/`:

- `isSwitchNode()` — checks if a node type is `switchStart` or `switchEnd`
- `getSwitchStructureFromNode()` — resolves the pair from any switch node via
  the `bindSwitchNodes` edge
- `getNodesInSwitchRegion()` — returns
  `{ nodesInTrueBranch, nodesInFalseBranch }`

Switches compile into `SwitchExecutionBlock`s with independently sorted
`trueBranchSteps` and `falseBranchSteps`.

### -> [Zones (body region discovery)](../features/zonesDoc.md)

When present, `state.zones` provides the precomputed body node sets for loops
(`preStop`/`postStop`) and switches (`trueBranch`/`falseBranch`), looked up by
`findZoneByStructure(zones, structureId, zoneRole)`. When zones are absent (or
inside a recursively-compiled subtree), the compiler falls back to BFS region
discovery.

### -> [Node Groups (compiles group scopes)](../features/nodeGroupsDoc.md)

The compiler delegates to `compileGroupScopes()` in Phase 4. Group instances are
detected by checking `typeOfNode.subtree`. The subtree is recursively compiled
by calling `compile()` again with a synthetic state. Handle mappings between
outer and inner boundaries are built by index position using
`extractInputHandleIds()` and `extractOutputHandleIds()`. Groups inside loop
bodies and switch branches are also handled — `compileLoopStructures()` and
`compileSwitchStructures()` both call `compileGroupScopes()` for their
region/branch nodes.

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
