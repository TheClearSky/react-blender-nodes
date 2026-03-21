# Node Groups

## Overview

Node groups are composable sub-graphs that allow users to encapsulate a set of
nodes and edges into a reusable unit. A node group is a `TypeOfNode` whose
definition includes a `subtree` property containing its own nodes, edges, and
boundary node references. Once defined, a group can be instantiated as a single
node in the main graph or inside other groups, creating a hierarchy of nested
computation.

Node groups enable:

- **Reusability**: Define a computation pattern once, use it many times across
  the graph.
- **Abstraction**: Hide internal complexity behind a clean input/output
  interface.
- **Composability**: Groups can contain other groups (with optional recursion
  protection), enabling layered architectures.
- **Dynamic Interfaces**: Group boundary handles use `inferFromConnection` data
  types, so the group's external interface adapts as internal connections are
  made.

The system maintains synchronization between the outer group node's handles and
the inner boundary nodes' handles, propagates type changes across all instances,
and supports stack-based navigation for editing group internals.

## Entity-Relationship Diagram

```
+-----------------------------+         +--------------------------+
|        TypeOfNode           |         |         State            |
|-----------------------------|         |--------------------------|
| name: string                |         | openedNodeGroupStack?:   |
| headerColor?: string        |         |   Array<{                |
| inputs: TypeOfInput[]       |         |     nodeType: string     |
| outputs: TypeOfInput[]      |         |     nodeId?: string      |
| subtree?: {                 |-------->|     previousViewport?    |
|   nodes: Node[]             |         |   }>                     |
|   edges: Edge[]             |         | typeOfNodes: Record<     |
|   numberOfReferences: number|         |   id, TypeOfNode>        |
|   inputNodeId: string       |         | nodes: Node[]            |
|   outputNodeId: string      |         | edges: Edge[]            |
| }                           |         +--------------------------+
+-----------------------------+
       |             |
       |             |        subtree.nodes contains:
       v             v
+-------------+  +---------------+
| groupInput  |  | groupOutput   |
| (boundary)  |  | (boundary)    |
|-------------|  |---------------|
| inputs: []  |  | inputs: [     |
| outputs: [  |  |   {groupInfer}|
|  {groupInfer}| |   ...         |
|   ...       |  | ]             |
| ]           |  | outputs: []   |
+-------------+  +---------------+
       |                  |
       | outputs[i] maps  | inputs[i] maps
       | to outer         | to outer
       | inputs[i]        | outputs[i]
       v                  v
+-------------------------------+
|   Outer Group Node Instance   |
|-------------------------------|
| inputs[0]  <--> GI.outputs[0] |
| inputs[1]  <--> GI.outputs[1] |
| outputs[0] <--> GO.inputs[0]  |
| outputs[1] <--> GO.inputs[1]  |
+-------------------------------+
```

## Functional Dependency Diagram

```
                          addDuplicateHandleToNodeGroupAfterInference()
                                          |
                    +---------------------+---------------------+
                    |                                           |
                    v                                           v
  insertOrDeleteHandleInNodeData            addAnInputOrOutputToAllNodesOfANodeType
  UsingHandleIndices()                      AcrossStateIncludingSubtrees()
  (updates the boundary node                        |
   that was just connected)              +-----------+-----------+
                                         |                       |
                                         v                       v
                              getDirectDependentsOf     addAnInputOrOutputToAll
                              NodeType()                NodesOfANodeTypeAcross
                              (finds all groups         Subtree()
                               containing this type)    (updates instances in
                                                         each dependent subtree)

  getCurrentNodesAndEdgesFromState() -----> reads openedNodeGroupStack
       |                                         |
       v                                         v
  Returns subtree.nodes/edges            Top of stack determines
  if inside a group, or                  which subtree is "current"
  state.nodes/edges if at root

  constructNodeOfType() -----> sets showNodeOpenButton = (subtree !== undefined)
```

## Data Flow Diagram

```
1. CREATION (ADD_NODE_GROUP action)
   +------------------------------------------------------------------+
   |  Generate random nodeType ID                                      |
   |  Create groupInput node at (-500, 0)                             |
   |  Create groupOutput node at (500, 0)                             |
   |  Register new TypeOfNode with subtree = {                        |
   |    nodes: [groupInput, groupOutput],                             |
   |    edges: [],                                                    |
   |    numberOfReferences: 0,                                        |
   |    inputNodeId, outputNodeId                                     |
   |  }                                                               |
   |  Auto-open the new group (push to openedNodeGroupStack)          |
   +------------------------------------------------------------------+
                              |
                              v
2. EDITING (user adds nodes/edges inside the group)
   +------------------------------------------------------------------+
   |  getCurrentNodesAndEdgesFromState() returns subtree.nodes/edges   |
   |  All ADD_NODE, ADD_EDGE actions operate on subtree                |
   |  setCurrentNodesAndEdgesToState writes back to subtree            |
   |  (only if numberOfReferences === 0, i.e. not yet instantiated)   |
   +------------------------------------------------------------------+
                              |
                              v
3. HANDLE INFERENCE (connecting to groupInput/groupOutput boundary)
   +------------------------------------------------------------------+
   |  User connects a typed handle to a groupInfer boundary handle    |
   |                                                                  |
   |  inferTypesAfterEdgeAddition() infers the type                   |
   |        |                                                         |
   |        v                                                         |
   |  addDuplicateHandleToNodeGroupAfterInference()                   |
   |    1. Adds a new groupInfer handle to the boundary node          |
   |       (for future connections)                                   |
   |    2. Adds corresponding input/output to the outer group         |
   |       TypeOfNode definition                                      |
   |    3. Propagates to all instances across the entire state        |
   |       (via addAnInputOrOutputToAllNodesOfANodeType               |
   |        AcrossStateIncludingSubtrees)                             |
   +------------------------------------------------------------------+
                              |
                              v
4. INSTANTIATION (user adds the group as a node in outer graph)
   +------------------------------------------------------------------+
   |  constructNodeOfType() builds a node from the group TypeOfNode   |
   |  showNodeOpenButton = true (because subtree exists)              |
   |  numberOfReferences++ (tracked for edit protection)              |
   +------------------------------------------------------------------+
                              |
                              v
5. EXECUTION (runner processes the group node)
   +------------------------------------------------------------------+
   |  Compiler: compileGroupScopes()                                  |
   |    - Builds synthetic subtreeState                               |
   |    - Recursively compiles inner ExecutionPlan                     |
   |    - Maps outer input handles -> GroupInput output handles        |
   |    - Maps GroupOutput input handles -> outer output handles       |
   |                                                                  |
   |  Executor: executeGroupScope()                                   |
   |    - Creates scoped ValueStore                                   |
   |    - Copies outer input values -> GroupInput outputs              |
   |    - Executes inner plan levels                                  |
   |    - Copies GroupOutput input values -> outer outputs             |
   |    - Records GroupRecord with inner ExecutionRecord               |
   +------------------------------------------------------------------+
```

## System Diagram

```
+===========================================================================+
|                           GRAPH STATE (State)                             |
|                                                                           |
|  typeOfNodes                                                              |
|  +------------------+  +------------------+  +-------------------------+  |
|  | "addNode"        |  | "multiplyNode"   |  | "myGroup" (auto-ID)    |  |
|  | inputs: [...]    |  | inputs: [...]    |  | inputs: [A, B]         |  |
|  | outputs: [...]   |  | outputs: [...]   |  | outputs: [Result]      |  |
|  | subtree: undef   |  | subtree: undef   |  | subtree: {             |  |
|  +------------------+  +------------------+  |   nodes: [             |  |
|                                               |     groupInput,        |  |
|  nodes (root level)                           |     addNode_instance,  |  |
|  +---------+ +---------+ +---------+         |     groupOutput        |  |
|  | node_1  | | node_2  | | node_3  |         |   ],                   |  |
|  | type:   | | type:   | | type:   |         |   edges: [...],        |  |
|  | addNode | | myGroup | | output  |         |   numberOfReferences:1 |  |
|  +---------+ +---------+ +---------+         |   inputNodeId: "gi_1"  |  |
|       |           |           ^               |   outputNodeId: "go_1" |  |
|       +--- edge --+--- edge -+               | }                      |  |
|                                               +-------------------------+  |
|  openedNodeGroupStack: []  (empty = viewing root graph)                   |
+===========================================================================+

                    NAVIGATION (OPEN_NODE_GROUP)
                              |
                              v

+===========================================================================+
|  openedNodeGroupStack: [                                                  |
|    { nodeType: "myGroup", nodeId: "node_2", previousViewport: {...} }     |
|  ]                                                                        |
|                                                                           |
|  getCurrentNodesAndEdgesFromState() now returns:                           |
|    nodes: subtree.nodes  (groupInput, addNode_instance, groupOutput)      |
|    edges: subtree.edges                                                   |
|    inputNodeId: "gi_1"                                                    |
|    outputNodeId: "go_1"                                                   |
+===========================================================================+

                    RUNNER PIPELINE

+===========================================================================+
|                                                                           |
|  COMPILER                          EXECUTOR                              |
|  +--------------------------+      +----------------------------------+   |
|  | compileGroupScopes()     |      | executeGroupScope()              |   |
|  |   For each group node:   |      |   1. Mark group node "running"   |   |
|  |   1. Build subtreeState  |      |   2. Build inner state           |   |
|  |   2. Compile inner plan  |      |   3. Create scoped ValueStore    |   |
|  |   3. Build input mapping |----->|   4. Map inputs to GroupInput    |   |
|  |   4. Build output mapping|      |   5. Execute inner plan levels   |   |
|  |   5. Emit warnings       |      |   6. Map GroupOutput to outputs  |   |
|  +--------------------------+      |   7. Record GroupRecord           |   |
|                                    |   8. Mark "completed"/"errored"  |   |
|                                    +----------------------------------+   |
+===========================================================================+
```

## Group Type Definition

### TypeOfNode.subtree structure

A `TypeOfNode` becomes a node group when it has a `subtree` property. The
subtree is defined in
[types.ts:214-244](src/utils/nodeStateManagement/types.ts#L214-L244):

```typescript
subtree?: {
  nodes: State['nodes'];        // Array of nodes inside the group
  edges: State['edges'];        // Array of edges inside the group
  numberOfReferences: number;   // How many instances exist
  inputNodeId: string;          // ID of the groupInput boundary node
  outputNodeId: string;         // ID of the groupOutput boundary node
};
```

The `subtree.nodes` and `subtree.edges` use the same types as the root-level
`state.nodes` and `state.edges`, making groups structurally recursive.

### numberOfReferences

Tracks how many instances of this group type exist across the entire state (root
graph and all subtrees). The subtree can only be edited when
`numberOfReferences === 0`. This is enforced in
`setCurrentNodesAndEdgesToStateWithMutatingState` at
[constructAndModifyNodes.ts:513](src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts#L513):
if references exist, mutations fall through to the root-level nodes/edges
instead.

### inputNodeId, outputNodeId

Stable references to the groupInput and groupOutput boundary nodes inside the
subtree. These IDs are generated once during `ADD_NODE_GROUP` and never change.
They are used by:

- The compiler (`compileGroupScopes`) to locate boundary nodes for handle
  mapping.
- The executor (`executeGroupScope`) to write/read values at the boundary.
- `getCurrentNodesAndEdgesFromState` to return them alongside nodes/edges for
  edge validation.

## Boundary Nodes

### groupInput node type

Defined in
[standardNodes.ts:72-86](src/utils/nodeStateManagement/standardNodes.ts#L72-L86):

```typescript
groupInput: {
  name: 'Group Input',
  headerColor: '#1d1d1d',
  inputs: [],                                    // No inputs (data enters from outside)
  outputs: [{ name: '', dataType: 'groupInfer' }], // One infer output (grows dynamically)
}
```

The groupInput node has **no inputs** and starts with a single `groupInfer`
output. Each time this output is connected and its type is inferred, a new
`groupInfer` output is appended, allowing unlimited dynamic handle addition.

### groupOutput node type

Defined in
[standardNodes.ts:87-101](src/utils/nodeStateManagement/standardNodes.ts#L87-L101):

```typescript
groupOutput: {
  name: 'Group Output',
  headerColor: '#1d1d1d',
  inputs: [{ name: '', dataType: 'groupInfer' }],  // One infer input (grows dynamically)
  outputs: [],                                       // No outputs (data exits to outside)
}
```

The groupOutput node mirrors groupInput: it has **no outputs** and starts with a
single `groupInfer` input.

### Handle index-position mapping (outer <-> inner)

The mapping between outer group node handles and inner boundary node handles is
strictly by **index position**:

```
Outer Group Node          GroupInput Node
  inputs[0]       <--->     outputs[0]
  inputs[1]       <--->     outputs[1]
  inputs[N]       <--->     outputs[N]

GroupOutput Node          Outer Group Node
  inputs[0]        <--->     outputs[0]
  inputs[1]        <--->     outputs[1]
  inputs[N]        <--->     outputs[N]
```

This mapping is maintained because whenever a handle is added to a boundary node
(via inference), the corresponding input or output is simultaneously added to
the outer group's `TypeOfNode` definition by
`addDuplicateHandleToNodeGroupAfterInference`.

## Group Lifecycle

### 1. Creation (ADD_NODE_GROUP)

Handled in
[mainReducer.ts:496-544](src/utils/nodeStateManagement/mainReducer.ts#L496-L544):

1. Generate a random `nodeType` ID for the group.
2. Create a `groupInput` node at position `(-500, 0)`.
3. Create a `groupOutput` node at position `(500, 0)`.
4. Count existing groups and name the new one `"Node Group N+1"`.
5. Register the new `TypeOfNode` with `subtree`, `numberOfReferences: 0`, the
   `groupNodeContextMenu` placement, and header color `#344621`.
6. Immediately open the group by setting `openedNodeGroupStack` to a single
   entry (original opening, no `nodeId`).
7. Clear the viewport so ReactFlow fits the new subtree.

### 2. Opening for editing (OPEN_NODE_GROUP)

Handled in
[mainReducer.ts:431-478](src/utils/nodeStateManagement/mainReducer.ts#L431-L478).
Two variants:

**Instance opening** (with `nodeId`):

- Finds the node, resolves its `nodeTypeUniqueId`.
- Validates the type has a subtree.
- Pushes `{ nodeType, nodeId, previousViewport }` onto the stack.
- Stack is **appended** (supports nested group navigation).

**Original opening** (with `nodeType`, no `nodeId`):

- Validates the type has a subtree.
- **Replaces** the entire stack with a single entry
  `{ nodeType, previousViewport }`.
- No `nodeId` means we're editing the template, not a specific instance.

Both variants clear `state.viewport` to trigger a viewport reset.

### 3. Adding nodes inside the group

Once a group is opened, `getCurrentNodesAndEdgesFromState` returns
`subtree.nodes` and `subtree.edges` instead of root-level data. All standard
actions (`ADD_NODE`, `ADD_EDGE_BY_REACT_FLOW`, etc.) operate transparently on
the subtree.

### 4. Connecting handles (triggers inference + handle sync)

When an edge is added inside the group that connects to a `groupInfer` handle on
`groupInput` or `groupOutput`:

1. The type inference system infers the concrete type from the connected handle.
2. `addDuplicateHandleToNodeGroupAfterInference` is called (see Handle
   Synchronization below).
3. A new `groupInfer` handle is appended to the boundary node for future
   connections.
4. The inferred type propagates as a new input/output on the outer group
   `TypeOfNode` and all its instances.

### 5. Closing the group (CLOSE_NODE_GROUP)

Handled in
[mainReducer.ts:480-495](src/utils/nodeStateManagement/mainReducer.ts#L480-L495):

1. Restores `state.viewport` from the last stack entry's `previousViewport`.
2. Pops the last entry from `openedNodeGroupStack` via `slice(0, -1)`.
3. If the stack is now empty, the user returns to the root graph.

### 6. Instantiating the group as a node

The group type appears in the context menu under `["Group Nodes"]` (from
`groupNodeContextMenu`). When the user adds it via `ADD_NODE`:

1. `constructNodeOfType` builds a node from the group's `TypeOfNode`.
2. `showNodeOpenButton` is set to `true` because `subtree !== undefined`
   ([constructAndModifyNodes.ts:349](src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts#L349)).
3. The node gets all the inputs and outputs currently defined on the group type.

### 7. Connecting the outer group node

The outer group node's inputs and outputs behave like any other node's handles.
They have concrete data types (set by inference when the group was edited) and
can be connected to other nodes in the parent graph.

## Handle Synchronization

### How outer inputs map to groupInput outputs

The outer group node's `inputs[i]` corresponds to `groupInput.outputs[i]` by
index position. When a value arrives at the outer group node's input during
execution, it is mapped to the corresponding groupInput output and made
available to inner nodes.

### How groupOutput inputs map to outer outputs

`groupOutput.inputs[i]` corresponds to the outer group node's `outputs[i]` by
index position. After inner execution completes, the values at groupOutput's
inputs are copied to the outer node's outputs for downstream consumption.

### Dynamic handle addition after inference (addDuplicateHandleToNodeGroupAfterInference)

This function at
[nodeGroups.ts:34-172](src/utils/nodeStateManagement/nodes/nodeGroups.ts#L34-L172)
is the core of handle synchronization. It triggers when a `groupInfer` handle on
a boundary node gets inferred (connected to a typed handle):

```
Step-by-step process:
─────────────────────
1. TRIGGER: An edge is added connecting a typed handle to a groupInfer
   handle on groupInput (output side) or groupOutput (input side).

2. XOR CHECK: Exactly one of the two handles must be an inferred
   groupInfer on a boundary node (line 88-92). If both are groupInfer
   or neither is, no action is taken. (Direct groupInput-to-groupOutput
   connections are rejected because insufficient type information exists.)

3. DETERMINE WHICH SIDE: If the target is groupOutput, we're adding
   an input to the group. If the source is groupInput, we're adding
   an output to the group.

4. CREATE DUPLICATE HANDLE: Construct a new groupInfer handle of the
   same type as the original (output for groupInput, input for groupOutput)
   using constructTypeOfHandleFromIndices. Insert it at position -1
   (end) via insertOrDeleteHandleInNodeDataUsingHandleIndices.

5. PROPAGATE TO OUTER TYPE AND ALL INSTANCES: Call
   addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees
   with the inferred name and data type. This:
   a. Modifies the group's TypeOfNode definition (adds input or output).
   b. Finds all direct dependents (groups that contain this group type).
   c. Updates all instances of this group type in each dependent's subtree.
   d. Updates all instances in the root-level nodes.
```

### Propagation across all instances (addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees)

This function at
[constructAndModifyHandles.ts:582-669](src/utils/nodeStateManagement/constructAndModifyHandles.ts#L582-L669)
ensures handle changes cascade globally:

```
addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees()
  |
  +-- 1. Modify the TypeOfNode definition itself
  |      (add input or output at the specified index)
  |
  +-- 2. Find direct dependents via getDirectDependentsOfNodeType()
  |      (groups whose subtrees contain instances of this node type)
  |      |
  |      +-- For each dependent:
  |           Update all instances within that dependent's subtree
  |           via addAnInputOrOutputToAllNodesOfANodeTypeAcrossSubtree()
  |
  +-- 3. Update all instances in root-level state.nodes
         via addAnInputOrOutputToAllNodesOfANodeTypeAcrossSubtree()
```

## Navigation (openedNodeGroupStack)

The `openedNodeGroupStack` is an array on `State`
([types.ts:356-371](src/utils/nodeStateManagement/types.ts#L356-L371)) that
tracks the chain of opened groups:

```typescript
openedNodeGroupStack?: (
  | { nodeType: NodeTypeUniqueId; previousViewport?: Viewport }              // original
  | { nodeType: NodeTypeUniqueId; nodeId: string; previousViewport?: Viewport } // instance
)[];
```

### Instance opening (with nodeId)

When the user clicks the "open" button on a group node instance in the graph
canvas:

- The entry `{ nodeType, nodeId, previousViewport }` is **pushed** onto the
  stack.
- The `nodeId` identifies which specific instance is being inspected.
- Stack supports depth: opening a group inside a group pushes another entry.
- The breadcrumb UI shows the full chain of opened groups.

### Original opening (without nodeId)

When the user selects a group from the dropdown selector in
`FullGraphNodeGroupSelector`:

- The stack is **replaced** with a single entry
  `{ nodeType, previousViewport }`.
- No `nodeId` means the user is editing the group template directly.
- Any existing navigation history is discarded.

### Stack-based navigation with viewport preservation

Each stack entry stores `previousViewport` — the viewport at the time of
opening. When `CLOSE_NODE_GROUP` is dispatched:

1. The last entry's `previousViewport` is restored to `state.viewport`.
2. The entry is popped from the stack.
3. ReactFlow transitions back to the parent graph's view.

The UI for navigation is `FullGraphNodeGroupSelector`
([FullGraphNodeGroupSelector.tsx](src/components/organisms/FullGraph/FullGraphNodeGroupSelector.tsx)),
which renders:

- A **back button** (enabled when the stack is non-empty).
- A **dropdown** listing all group types with an "Add New Node Group" option.
- A **breadcrumb trail** showing the current stack (`ChevronRight` separators
  between names).

## Recursion Checking

### enableRecursionChecking flag

The `State.enableRecursionChecking` flag
([types.ts:447-455](src/utils/nodeStateManagement/types.ts#L447-L455))
optionally prevents nesting a group inside itself (directly or transitively).
When enabled:

- Adding a node inside a group's subtree checks whether doing so would create a
  recursive dependency.
- The dependency graph functions `getDependencyGraphBetweenNodeTypes`,
  `getAllDependentsOfNodeTypeRecursively`, and
  `getAllDependenciesOfNodeTypeRecursively`
  ([constructAndModifyNodes.ts:531-776](src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts#L531-L776))
  provide the analysis infrastructure.
- These functions traverse `typeOfNodes` to build a dependency graph: for each
  group type, its subtree's nodes reference other node types, creating edges in
  the graph.

The runner also enforces a hard limit via `MAX_GROUP_DEPTH = 20`
([groupCompiler.ts:25](src/utils/nodeRunner/groupCompiler.ts#L25)) to prevent
infinite recursion during compilation regardless of this flag.

## Groups in the Runner

### Group compilation (compileGroupScopes)

`compileGroupScopes` at
[groupCompiler.ts:75-240](src/utils/nodeRunner/groupCompiler.ts#L75-L240)
processes all group node instances during graph compilation:

```
For each node whose TypeOfNode has a subtree:
  1. Check for missing function implementations in subtree nodes
     (emit warnings for non-standard nodes without implementations)
  2. Build a synthetic subtreeState:
     - Same typeOfNodes, dataTypes, feature flags as outer state
     - nodes/edges replaced with subtree.nodes/subtree.edges
     - openedNodeGroupStack cleared to undefined
  3. Recursively compile the subtree via compileGraph()
     (depth is tracked; MAX_GROUP_DEPTH=20 prevents infinite recursion)
  4. Build inputMapping: Map<outerInputHandleId, innerGroupInputOutputHandleId>
     - Pairs outer node's inputs[i] with groupInput's outputs[i] by index
  5. Build outputMapping: Map<innerGroupOutputInputHandleId, outerOutputHandleId>
     - Pairs groupOutput's inputs[i] with outer node's outputs[i] by index
  6. Emit a GroupExecutionScope with the inner plan and mappings
```

Boundary nodes (groupInput, groupOutput) are excluded from the topological sort
via `isGroupBoundaryNode`
([groupCompiler.ts:264-271](src/utils/nodeRunner/groupCompiler.ts#L264-L271))
since they are data mapping points, not executable nodes.

### Group execution (input/output value mapping)

`executeGroupScope` at
[executor.ts:924-1241](src/utils/nodeRunner/executor.ts#L924-L1241) runs a
compiled group:

```
1. Mark the group node as "running" in the UI.
2. Validate the group's TypeOfNode and subtree exist.
3. Build an inner state (subtree nodes/edges, shared type definitions).
4. Build an inner nodeInfoMap from subtree nodes.
5. Create a scoped ValueStore (isolated namespace for inner execution).
6. INPUT MAPPING: For each (outerHandleId -> innerHandleId) in inputMapping:
   a. Look up what feeds into the outer group node's input handle.
   b. Get the value from the parent ValueStore.
   c. Set it as the GroupInput's output in the scoped store.
7. Execute inner plan levels (standard nodes, nested groups, nested loops).
8. OUTPUT MAPPING: For each (innerHandleId -> outerHandleId) in outputMapping:
   a. Look up what feeds into GroupOutput's input handle in the inner graph.
   b. Get the value from the scoped store.
   c. Set it in the parent ValueStore as the group node's output.
9. End the recording scope, build a GroupRecord with the inner ExecutionRecord.
10. Record a structural step for the group node itself (for timeline visibility).
11. Mark the group node as "completed" or "errored" in the UI.
```

### GroupExecutionScope type

Defined in [types.ts:283-298](src/utils/nodeRunner/types.ts#L283-L298):

```typescript
type GroupExecutionScope = {
  kind: 'group';
  groupNodeId: string; // Instance ID in the outer graph
  groupNodeTypeId: string; // Key in typeOfNodes
  groupNodeTypeName: string; // Display name
  innerPlan: ExecutionPlan; // Recursively compiled inner plan
  inputMapping: ReadonlyMap<string, string>; // outer input -> inner output
  outputMapping: ReadonlyMap<string, string>; // inner input -> outer output
  concurrencyLevel: number;
};
```

### GroupRecord type

Defined in [types.ts:533-539](src/utils/nodeRunner/types.ts#L533-L539):

```typescript
type GroupRecord = {
  groupNodeId: string;
  groupNodeTypeId: string;
  innerRecord: ExecutionRecord; // Full recursive record
  inputMapping: ReadonlyMap<string, unknown>; // Handle ID -> actual value
  outputMapping: ReadonlyMap<string, unknown>; // Handle ID -> actual value
};
```

The `innerRecord` is a complete `ExecutionRecord` — the same type used for the
root-level execution — enabling recursive inspection of group execution in the
timeline/inspector UI.

## Limitations and Deprecated Patterns

- **Editing locked groups**: Once a group has `numberOfReferences > 0`, its
  subtree cannot be edited through the standard state management path. The
  `setCurrentNodesAndEdgesToStateWithMutatingState` function silently redirects
  mutations to root-level nodes/edges instead.
- **Direct groupInput-to-groupOutput connections**: Not supported. The XOR check
  in `addDuplicateHandleToNodeGroupAfterInference` (line 88-92) requires exactly
  one side to be an inferred boundary handle.
- **Fan-in at group boundaries**: The executor's input mapping uses
  `outerEntries[0]` (only the first source), meaning fan-in (multiple edges
  feeding the same group input) only propagates one value.
- **No per-instance subtree overrides**: All instances of a group type share the
  same subtree definition. There is no mechanism for per-instance customization.

## Examples

### Creating a simple "Add Two Numbers" group

```typescript
// 1. Dispatch ADD_NODE_GROUP to create a new group
dispatch({ type: 'ADD_NODE_GROUP' });

// 2. Inside the group (now auto-opened), add nodes:
dispatch({
  type: 'ADD_NODE',
  payload: { type: 'addNode', position: { x: 0, y: 0 } },
});

// 3. Connect groupInput's output to addNode's inputs
//    (this triggers handle inference + dynamic handle addition)
dispatch({
  type: 'ADD_EDGE_BY_REACT_FLOW',
  payload: {
    edge: {
      source: groupInputId,
      sourceHandle: '...',
      target: addNodeId,
      targetHandle: '...',
    },
  },
});

// 4. Connect addNode's output to groupOutput's input
dispatch({
  type: 'ADD_EDGE_BY_REACT_FLOW',
  payload: {
    edge: {
      source: addNodeId,
      sourceHandle: '...',
      target: groupOutputId,
      targetHandle: '...',
    },
  },
});

// 5. Close the group
dispatch({ type: 'CLOSE_NODE_GROUP' });

// 6. The group now appears in the context menu under "Group Nodes"
//    and can be instantiated like any other node type.
```

### Opening a group for inspection

```typescript
// Instance opening (view specific instance's context)
dispatch({
  type: 'OPEN_NODE_GROUP',
  payload: { nodeId: 'node_2' }, // ID of the group node instance
});

// Original opening (edit the group template)
dispatch({
  type: 'OPEN_NODE_GROUP',
  payload: { nodeType: 'myGroupTypeId' }, // TypeOfNode key
});
```

## Relationships with Other Features

### -> [Data Types (groupInfer)](../core/dataTypesDoc.md)

The `groupInfer` data type
([standardNodes.ts:47-51](src/utils/nodeStateManagement/standardNodes.ts#L47-L51))
has `underlyingType: 'inferFromConnection'`, which means its concrete type is
determined at connection time. This is the mechanism that allows groups to
accept any data type — the interface adapts to how internal nodes are wired.

### -> [Handles (dynamic handle addition)](../core/handlesDoc.md)

Groups trigger `insertOrDeleteHandleInNodeDataUsingHandleIndices` to add new
handles to boundary nodes after inference. This uses the same handle management
infrastructure as regular nodes.

### -> [Type Inference (triggers inference on group boundary nodes)](../core/typeInferenceDoc.md)

When `enableTypeInference` is active, connecting to a `groupInfer` handle
triggers `inferTypesAfterEdgeAddition`, which resolves the concrete type. This
is a prerequisite for `addDuplicateHandleToNodeGroupAfterInference`.

### -> [Nodes (group is a special node type)](../core/nodesDoc.md)

A group node is rendered as a standard `configurableNode` with
`showNodeOpenButton: true`. It appears in the graph exactly like any other node,
with inputs on the left and outputs on the right.

### -> [Edges (edges connect to group boundary nodes)](../core/edgesDoc.md)

Inside a group's subtree, edges connect internal nodes to groupInput/groupOutput
boundary nodes. The edge validation system (`addEdgeWithTypeChecking`) passes
`groupInputNodeId` and `groupOutputNodeId` to enable boundary-aware validation.

### -> [State Management (openedNodeGroupStack, ADD_NODE_GROUP action)](../core/stateManagementDoc.md)

The `openedNodeGroupStack` on `State` controls which subtree is active.
`getCurrentNodesAndEdgesFromState` and
`setCurrentNodesAndEdgesToStateWithMutatingState` use the top of this stack to
transparently redirect all node/edge operations to the correct subtree.

### -> [Runner (group compilation and execution)](../runner/runnerHookDoc.md)

Groups are compiled into `GroupExecutionScope` entries and executed via
`executeGroupScope`. The runner creates isolated `ValueStore` scopes for each
group, maps values across boundaries, and produces recursive `GroupRecord`
entries for the execution history.

### -> [FullGraph UI (group navigation)](../ui/fullGraphDoc.md)

`FullGraphNodeGroupSelector` provides the breadcrumb navigation UI.
`FullGraph.tsx` translates dropdown selections and button clicks into
`OPEN_NODE_GROUP`, `CLOSE_NODE_GROUP`, and `ADD_NODE_GROUP` actions.

### -> [Import/Export (subtree serialization)](../importExport/importExportDoc.md)

Group subtrees are serialized as part of `typeOfNodes` during state export.
Since `subtree.nodes` and `subtree.edges` use the same types as root-level data,
the import/export system handles them transparently.
