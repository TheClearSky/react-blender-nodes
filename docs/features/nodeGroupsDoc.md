# Node Groups

## Overview

Node groups are composable sub-graphs that let users encapsulate a set of nodes
and edges into a reusable unit. A node group is a `TypeOfNode` whose definition
carries a `subtree` property holding its own nodes, edges, and boundary-node
references. Once defined, a group can be instantiated as a single node in the
root graph or inside other groups, creating a hierarchy of nested computation.

Node groups enable:

- **Reusability**: define a computation pattern once, instantiate it many times.
- **Abstraction**: hide internal complexity behind a clean input/output
  interface.
- **Composability**: groups can contain other groups (with optional recursion
  protection), enabling layered architectures.
- **Dynamic interfaces**: group boundary handles use the `groupInfer` data type
  (`underlyingType: 'inferFromConnection'`), so the group's external interface
  adapts as internal connections are made.
- **Editing**: a group type can be renamed and its handles reordered/re-paneled
  through the node-type edit drawer (`UPDATE_NODE_TYPE`), which reconstructs all
  instances and re-syncs the boundary nodes.

The system keeps the outer group node's handles synchronized with the inner
boundary nodes' handles, propagates type changes across all instances and
dependent subtrees, and supports stack-based navigation for editing group
internals.

> **Architecture note.** Node-group actions are processed by the **validate →
> plan → apply** pipeline (see
> [State Management](../core/stateManagementDoc.md)), not by a hand-written
> reducer. `validateAction`
> (`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`)
> produces an id-free `Plan`; `applyPlan`
> (`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`) is the
> only mutator and mints the ids. `mainReducer` and `createGraphStore.dispatch`
> both delegate to this pipeline.

## Entity-Relationship Diagram

```
+-----------------------------+         +--------------------------+
|        TypeOfNode           |         |         State            |
|-----------------------------|         |--------------------------|
| name: string                |         | openedNodeGroupStack?:   |
| headerColor?: string        |         |   Array<                 |
| inputs: (TypeOfInput |      |         |     | {nodeType,         |
|   TypeOfInputPanel)[]       |         |     |    previousViewport?}|
| outputs: TypeOfInput[]      |         |     | {nodeType, nodeId, |
| locationInContextMenu?      |         |     |    previousViewport?}|
| priorityInContextMenu?      |         |   >                      |
| subtree?: {                 |-------->| typeOfNodes: Record<     |
|   nodes: State['nodes']     |         |   N, TypeOfNode>         |
|   edges: State['edges']     |         | nodes: State['nodes']    |
|   numberOfReferences: number|         | edges: State['edges']    |
|   inputNodeId: string       |         | enableRecursionChecking? |
|   outputNodeId: string      |         | nodeCountConstraints?    |
|   zones?, zoneIndex?        |         +--------------------------+
| }                           |
+-----------------------------+
       |             |
       |             |   subtree.nodes contains (at minimum):
       v             v
+-------------+  +---------------+
| groupInput  |  | groupOutput   |
| (boundary)  |  | (boundary)    |
|-------------|  |---------------|
| inputs: []  |  | inputs: [     |
| outputs: [  |  |   ...,        |
|   ...,      |  |   {groupInfer}| <- trailing empty-name template
|   {groupInfer}| | ]           |
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
                          applyPlan ADD_EDGE case (step 4c)
                                          |
                                          v
              growSpareAndPropagateBoundaryHandle()
   (src/utils/nodeStateManagement/nodes/nodeGroups.ts › growSpareAndPropagateBoundaryHandle)
                                          |
                    +---------------------+---------------------+
                    |                                           |
                    v                                           v
  insertOrDeleteHandleInNodeData            addAnInputOrOutputToAllNodesOfANodeType
  UsingHandleIndices()                      AcrossStateIncludingSubtrees()
  (appends a fresh empty-name              (src/utils/nodeStateManagement/constructAndModifyHandles.ts › addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees)
   groupInfer template to the                       |
   boundary node)                        +----------+-----------+
                                         |                      |
                                         v                      v
                              getDirectDependentsOf    addAnInputOrOutputToAll
                              NodeType()               NodesOfANodeTypeAcross
                              (groups containing       Subtree()
                               this group type)        (root nodes + each
                                                        dependent's subtree)

  getCurrentNodesAndEdgesFromState() -----> reads openedNodeGroupStack (top)
   (src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts › getCurrentNodesAndEdgesFromState)  |
       |                                          v
       v                                   Top of stack determines which
  Returns {nodes, edges, inputNodeId,     subtree is the "current" scope;
   outputNodeId, zones, zoneIndex}        empty stack = root scope
   for the current scope

  ConfigurableNode reads state.typeOfNodes[nodeTypeUniqueId]?.subtree
       -> hasSubtree -> renders "edit-node-type" + "open-node-group" header actions
```

## Data Flow Diagram

```
1. CREATION (ADD_NODE_GROUP action)
   +------------------------------------------------------------------+
   |  validateAction: returns AddNodeGroupPlan { previousViewport }    |
   |  applyPlan:                                                       |
   |    Mint groupNodeTypeId + groupInputNodeId + groupOutputNodeId   |
   |    Build groupInput node at (-500, 0) via constructNodeOfType     |
   |    Build groupOutput node at (500, 0) via constructNodeOfType     |
   |    name = "Node Group " + (numberOfExistingGroups + 1)            |
   |    headerColor = '#344621', ...groupNodeContextMenu               |
   |    subtree = {                                                    |
   |      nodes: [groupInput, groupOutput], edges: [],                |
   |      numberOfReferences: 0, inputNodeId, outputNodeId            |
   |    }                                                              |
   |    Replace openedNodeGroupStack with [{ nodeType, prevViewport }] |
   |    Clear viewport (FullGraph re-centers)                          |
   +------------------------------------------------------------------+
                              |
                              v
2. EDITING (user adds nodes/edges inside the group)
   +------------------------------------------------------------------+
   |  getCurrentNodesAndEdgesFromState -> subtree.nodes/edges          |
   |  All scope-aware plans (ADD_NODE, ADD_EDGE, ...) operate on it    |
   |  setCurrentNodesAndEdgesToStateWithMutatingState writes back to   |
   |  the subtree (falls back to root if numberOfReferences !== 0)     |
   +------------------------------------------------------------------+
                              |
                              v
3. HANDLE INFERENCE (connecting a typed handle to a groupInfer boundary handle)
   +------------------------------------------------------------------+
   |  validateAddEdge: planInferenceForEdgeAddition(..., inputNodeId, |
   |     outputNodeId, ...) computes the concrete type                |
   |  applyPlan ADD_EDGE: applies overrideDataType to the boundary,   |
   |     then calls growSpareAndPropagateBoundaryHandle:      |
   |    1. Appends a new empty-name groupInfer template handle to the |
   |       boundary node (for the next connection)                    |
   |    2. Adds the inferred input/output to the group TypeOfNode     |
   |    3. Propagates to all instances + dependent subtrees           |
   +------------------------------------------------------------------+
                              |
                              v
4. INSTANTIATION (user adds the group as a node from "Group Nodes" menu)
   +------------------------------------------------------------------+
   |  ADD_NODE_AND_SELECT -> applyPlan ADD_NODE                        |
   |  constructNodeOfType builds a node from the group TypeOfNode      |
   |  ConfigurableNode detects subtree -> renders open + edit actions  |
   |  (numberOfReferences is NOT incremented — see note below)         |
   +------------------------------------------------------------------+
                              |
                              v
5. EXECUTION (runner processes the group node)
   +------------------------------------------------------------------+
   |  Compiler: compileGroupScopes()                                  |
   |    - Builds synthetic subtreeState (stack cleared)               |
   |    - Recursively compiles inner ExecutionPlan (MAX_GROUP_DEPTH)   |
   |    - Maps outer inputs[i]  -> GroupInput.outputs[i]              |
   |    - Maps GroupOutput.inputs[i] -> outer outputs[i]             |
   |                                                                  |
   |  Executor: executeGroupScope()                                   |
   |    - Creates scoped ValueStore (createScope(groupNodeId))        |
   |    - Copies outer input values -> GroupInput outputs             |
   |    - Executes inner plan levels (standard/group/loop/switch)     |
   |    - Copies GroupOutput input values -> outer outputs            |
   |    - Records a GroupRecord with the inner ExecutionRecord         |
   +------------------------------------------------------------------+
```

## System Diagram

```
+===========================================================================+
|                           GRAPH STATE (State)                             |
|                                                                           |
|  typeOfNodes                                                              |
|  +------------------+  +------------------+  +-------------------------+  |
|  | "addNode"        |  | "multiplyNode"   |  | "<auto-id>" (a group)  |  |
|  | inputs: [...]    |  | inputs: [...]    |  | name: "Node Group 1"   |  |
|  | outputs: [...]   |  | outputs: [...]   |  | inputs: [A, B]         |  |
|  | subtree: undef   |  | subtree: undef   |  | outputs: [Result]      |  |
|  +------------------+  +------------------+  | subtree: {             |  |
|                                               |   nodes: [             |  |
|  nodes (root scope)                           |     groupInput,        |  |
|  +---------+ +---------+ +---------+         |     addNode_instance,  |  |
|  | node_1  | | node_2  | | node_3  |         |     groupOutput        |  |
|  | type:   | | type:   | | type:   |         |   ],                   |  |
|  | addNode | | <group> | | output  |         |   edges: [...],        |  |
|  +---------+ +---------+ +---------+         |   numberOfReferences:0 |  |
|       |           |           ^               |   inputNodeId: "gi_1"  |  |
|       +--- edge --+--- edge -+               |   outputNodeId: "go_1" |  |
|                                               | }                      |  |
|  openedNodeGroupStack: []  (empty = root)     +-------------------------+  |
+===========================================================================+

                    NAVIGATION (OPEN_NODE_GROUP)
                              |
                              v

+===========================================================================+
|  openedNodeGroupStack: [                                                  |
|    { nodeType: "<group-id>", nodeId: "node_2", previousViewport: {...} }  |
|  ]                                                                        |
|                                                                           |
|  getCurrentNodesAndEdgesFromState() now returns:                          |
|    nodes: subtree.nodes  (groupInput, addNode_instance, groupOutput)      |
|    edges: subtree.edges                                                   |
|    inputNodeId: "gi_1", outputNodeId: "go_1"                              |
|    zones: subtree.zones, zoneIndex: subtree.zoneIndex                     |
+===========================================================================+

                    RUNNER PIPELINE

+===========================================================================+
|  COMPILER                            EXECUTOR                              |
|  +--------------------------+      +----------------------------------+   |
|  | compileGroupScopes()     |      | executeGroupScope()              |   |
|  |   For each group node:   |      |   1. Mark group node "running"   |   |
|  |   1. Warn on inner nodes |      |   2. buildInnerState(subtree)    |   |
|  |      w/o implementations |      |   3. createScope(groupNodeId)    |   |
|  |   2. Build subtreeState  |----->|   4. Map inputs -> GroupInput    |   |
|  |   3. Compile inner plan  |      |   5. Execute inner plan levels   |   |
|  |   4. Build input mapping |      |   6. Map GroupOutput -> outputs  |   |
|  |   5. Build output mapping|      |   7. completeGroup -> GroupRecord|   |
|  +--------------------------+      |   8. Mark "completed"/"errored"  |   |
|                                    +----------------------------------+   |
+===========================================================================+
```

## Group Type Definition

### `TypeOfNode.subtree` structure

A `TypeOfNode` becomes a node group when it has a `subtree` property. The
subtree is defined in `src/utils/nodeStateManagement/types.ts` › `TypeOfNode`:

```typescript
subtree?: {
  nodes: State<D, N, U, C>['nodes']; // Nodes inside the group (same type as root)
  edges: State<D, N, U, C>['edges']; // Edges inside the group (same type as root)
  numberOfReferences: number;        // Reference counter (see note below)
  inputNodeId: string;               // ID of the groupInput boundary node
  outputNodeId: string;              // ID of the groupOutput boundary node
  zones?: Record<string, Zone>;      // UI-only scope-local zones (stripped on export)
  zoneIndex?: ZoneIndex;             // UI-only reverse handle->zone index (stripped)
};
```

`subtree.nodes` and `subtree.edges` use the exact same types as the root-level
`state.nodes` and `state.edges`, making groups structurally recursive. The
optional `zones`/`zoneIndex` mirror the root-scope zone fields for loops or
switches placed _inside_ the group; like all zone fields they are UI-only and
stripped on export (see [Zones](./zonesDoc.md)).

### `numberOfReferences`

Declared as a counter for how many instances of the group type exist, intended
to gate subtree editing. **In the current source it is only ever initialized to
`0`** (in `ADD_NODE_GROUP`,
`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `ADD_NODE_GROUP`) and
**read** by `setCurrentNodesAndEdgesToStateWithMutatingState`
(`src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`setCurrentNodesAndEdgesToStateWithMutatingState`). No code path increments it —
`ADD_NODE` does not bump it on instantiation. The write-protection guard (below)
reads the field, but because the count stays at `0` the guard is currently
dormant and subtrees remain editable. Treat `numberOfReferences` as scaffolding
for a future feature, not an active lock.

### `inputNodeId`, `outputNodeId`

Stable references to the groupInput and groupOutput boundary nodes inside the
subtree. These ids are generated once during `ADD_NODE_GROUP` and never change.
They are used by:

- The compiler (`compileGroupScopes`) — though it locates boundary nodes by
  `nodeTypeUniqueId` rather than by these ids.
- The executor (`executeGroupScope`) — `subtree.inputNodeId` / `outputNodeId`
  are the qualifier used to write/read boundary values in the scoped store.
- `getCurrentNodesAndEdgesFromState`, which returns them alongside nodes/edges
  so edge-inference can detect boundary connections in the current scope.

## Boundary Nodes

### `groupInput` node type

Defined in `src/utils/nodeStateManagement/standardNodes.ts` › `groupInput`:

```typescript
[standardNodeTypeNamesMap.groupInput]: makeTypeOfNodeWithAutoInfer({
  name: 'Group Input',
  headerColor: '#1d1d1d',
  ...standardNodeContextMenu,                    // ['Standard Nodes'], priority 200
  inputs: [],                                    // No inputs (data enters from outside)
  outputs: [{ name: '', dataType: 'groupInfer' }], // One infer-template output
})
```

The groupInput node has **no inputs** and starts with a single empty-name
`groupInfer` output. Each time that template output is connected and its type is
inferred, a new empty-name `groupInfer` output is appended, allowing unlimited
dynamic handle growth.

### `groupOutput` node type

Defined in `src/utils/nodeStateManagement/standardNodes.ts` › `groupOutput`:

```typescript
[standardNodeTypeNamesMap.groupOutput]: makeTypeOfNodeWithAutoInfer({
  name: 'Group Output',
  headerColor: '#1d1d1d',
  ...standardNodeContextMenu,                     // ['Standard Nodes'], priority 200
  inputs: [{ name: '', dataType: 'groupInfer' }], // One infer-template input
  outputs: [],                                     // No outputs (data exits to outside)
})
```

The groupOutput node mirrors groupInput: it has **no outputs** and starts with a
single empty-name `groupInfer` input.

### Menu visibility and count constraints

Both boundary node types are _hidden_ from the "Add Node" menu by
`standardHiddenNodeTypesInContextMenu`
(`src/utils/nodeStateManagement/standardNodes.ts` ›
`standardHiddenNodeTypesInContextMenu`), so users cannot place them manually.
`standardNodeCountConstraints` (`src/utils/nodeStateManagement/standardNodes.ts`
› `standardNodeCountConstraints`) additionally pins them to exactly one per
subtree and none at root:

```typescript
groupInput:  { maxInRoot: 0, minInRoot: 0, minWithinANodeGroup: 1, maxWithinANodeGroup: 1 },
groupOutput: { maxInRoot: 0, minInRoot: 0, minWithinANodeGroup: 1, maxWithinANodeGroup: 1 },
```

These constraints are enforced by the node-count checks in `validateAction` (see
[Node-count constraints](../core/stateManagementDoc.md#node-count-constraints)).

### Handle index-position mapping (outer ⇄ inner)

The mapping between outer group-node handles and inner boundary-node handles is
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

This alignment is maintained because whenever a handle is added to a boundary
node (via inference), the corresponding input or output is simultaneously added
to the outer group's `TypeOfNode` definition — and to every instance — by
`growSpareAndPropagateBoundaryHandle`.

## Group Lifecycle

All lifecycle steps flow through `validateAction` (planning) and `applyPlan`
(mutation). The relevant `Plan` kinds are `ADD_NODE_GROUP`, `OPEN_NODE_GROUP`,
and `CLOSE_NODE_GROUP` (`src/utils/nodeStateManagement/planApply/types.ts` ›
`OpenNodeGroupPlan`).

### 1. Creation (`ADD_NODE_GROUP`)

`validateAction` (`src/utils/nodeStateManagement/planApply/validators.ts` ›
`ADD_NODE_GROUP`) returns `{ kind: 'ADD_NODE_GROUP', previousViewport }`.
`applyPlan` (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
`ADD_NODE_GROUP`):

1. Mints three ids: `groupNodeTypeId`, `groupInputNodeId`, `groupOutputNodeId`.
2. Builds a `groupInput` node at `(-500, 0)` and a `groupOutput` node at
   `(500, 0)` via `constructNodeOfType`.
3. Counts existing groups (`typeOfNodes` entries that have a `subtree`) and
   names the new one `"Node Group " + (count + 1)`.
4. Registers the new `TypeOfNode` with `headerColor: '#344621'`,
   `...groupNodeContextMenu` (`locationInContextMenu: ['Group Nodes']`,
   `priorityInContextMenu: 100`), empty `inputs`/`outputs`, and
   `subtree = { nodes: [groupInput, groupOutput], edges: [], numberOfReferences: 0, inputNodeId, outputNodeId }`.
5. **Replaces** `openedNodeGroupStack` with a single entry
   `{ nodeType: groupNodeTypeId, previousViewport }` (original opening — no
   `nodeId`).
6. Clears `viewport` so ReactFlow fits the new subtree.

### 2. Opening for editing (`OPEN_NODE_GROUP`)

`validateAction` (`src/utils/nodeStateManagement/planApply/validators.ts` ›
`OPEN_NODE_GROUP`) handles two variants and emits an
`OpenNodeGroupPlan { pushEntry }`.

**Instance opening** (`payload` has `nodeId`):

- Looks up the node in the current scope, resolves its `nodeTypeUniqueId`.
- Rejects with `INVALID_NODE_GROUP` if the node is missing, has no
  `nodeTypeUniqueId`, or its type has no `subtree`.
- Emits `pushEntry = { nodeType, nodeId, previousViewport: state.viewport }`.
- `applyPlan` (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
  `OPEN_NODE_GROUP`) **pushes** it onto the existing stack (supports nested
  navigation).

**Original opening** (`payload` has `nodeType`, no `nodeId`):

- Rejects with `INVALID_NODE_GROUP` if the type has no `subtree`.
- Emits
  `pushEntry = { nodeType, previousViewport: <first stack entry's previousViewport, else state.viewport> }`.
- `applyPlan` **replaces** the entire stack with this single entry (editing the
  template, not a specific instance).

Both variants set `draft.viewport = undefined` to trigger a viewport reset.

### 3. Adding nodes inside the group

Once a group is opened, `getCurrentNodesAndEdgesFromState` returns
`subtree.nodes`/`subtree.edges` instead of root-level data. All scope-aware
plans (`ADD_NODE`, `ADD_EDGE`, `UPDATE_NODES_RF`, `ADD_LOOP`, `ADD_SWITCH`, …)
operate transparently on the subtree because `applyPlan` reads/writes through
`getCurrentNodesAndEdgesFromState` /
`setCurrentNodesAndEdgesToStateWithMutatingState`.

### 4. Connecting handles (triggers inference + handle sync)

When an edge connects a typed handle to a `groupInfer` template handle on
`groupInput` (output side) or `groupOutput` (input side):

1. `validateAddEdge` calls `planInferenceForEdgeAddition`, passing the current
   scope's `inputNodeId`/`outputNodeId`, to compute the concrete type.
2. `applyPlan`'s `ADD_EDGE` case applies the inference (via `overrideDataType`,
   deep-cloned with `structuredClone`), then in step 4c calls
   `growSpareAndPropagateBoundaryHandle` (see
   [Handle Synchronization](#handle-synchronization)).
3. A fresh empty-name `groupInfer` template handle is appended to the boundary
   node for the next connection.
4. The inferred type is propagated as a new input/output on the outer group
   `TypeOfNode` and on every instance (root + dependent subtrees).

### 5. Closing the group (`CLOSE_NODE_GROUP`)

`validateAction` (`src/utils/nodeStateManagement/planApply/validators.ts` ›
`CLOSE_NODE_GROUP`) rejects with `EMPTY_STACK` if the stack is empty; otherwise
it emits
`{ kind: 'CLOSE_NODE_GROUP', restoreViewport: <last entry's previousViewport> }`.
`applyPlan` (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
`CLOSE_NODE_GROUP`):

1. Restores `draft.viewport` from `restoreViewport`.
2. Pops the last entry via `openedNodeGroupStack.slice(0, -1)`.
3. If the stack is now empty, the user is back at the root graph.

### 6. Instantiating the group as a node

The group type appears in the context menu under `["Group Nodes"]` (from
`groupNodeContextMenu`). The context menu adds it via `ADD_NODE_AND_SELECT`
(`src/components/molecules/ContextMenu/createNodeContextMenu.ts` ›
`createNodeContextMenu`), which collapses to a single `ADD_NODE` plan with
`selectExclusively: true`:

1. `applyPlan`'s `ADD_NODE` case mints the node id and builds the node via
   `constructNodeOfType`, appending it to the current scope.
2. The node receives all inputs and outputs currently defined on the group type.
3. There is **no** `showNodeOpenButton` flag on the node data. The "open"
   affordance is computed at render time: `ConfigurableNode` reads
   `state.typeOfNodes[nodeTypeUniqueId]?.subtree` (`hasSubtree`) and, when
   truthy, pushes two header actions (see
   [Group Editing](#group-editing-node-type-drawer) and
   [Navigation](#navigation-openednodegroupstack)).

### 7. Connecting the outer group node

The outer group node's inputs and outputs behave like any other node's handles.
They carry concrete data types (set by inference during editing) and connect to
other nodes in the parent graph through the normal edge-validation gauntlet.

## Handle Synchronization

### How outer inputs map to groupInput outputs

The outer group node's `inputs[i]` corresponds to `groupInput.outputs[i]` by
index position. During execution, the value arriving at an outer input is
written to the matching groupInput output in the group's scoped `ValueStore` and
made available to inner nodes.

### How groupOutput inputs map to outer outputs

`groupOutput.inputs[i]` corresponds to the outer group node's `outputs[i]` by
index position. After inner execution completes, the value at each groupOutput
input is copied to the outer node's matching output for downstream consumption.

### Dynamic handle addition after inference (`growSpareAndPropagateBoundaryHandle`)

This function in `src/utils/nodeStateManagement/nodes/nodeGroups.ts` ›
`growSpareAndPropagateBoundaryHandle` is the core of handle synchronization. It
is called from `applyPlan`'s `ADD_EDGE` case (step 4c) **after** inference has
been applied, for an open group OR at root (the trailing `scope` discriminant
selects the behavior; at root it grows a spare on the Graph I/O boundary node
and skips cross-instance propagation). Its full signature is:

```typescript
growSpareAndPropagateBoundaryHandle(
  state,                                 // scoped state (current subtree's nodes/edges)
  sourceNodeIndex, targetNodeIndex,      // indices within the scoped node list
  sourceHandle, targetHandle,            // POST-inference handle objects (carry inferred name/type)
  unmodifiedState,                       // the draft, mutated by the propagation step
  isSourceHandleInferredFromConnection,  // PRE-inference: was source a groupInfer?
  isTargetHandleInferredFromConnection,  // PRE-inference: was target a groupInfer?
  isSourceNodeGroupInput,                // is the source node groupInput?
  isTargetNodeGroupOutput,               // is the target node groupOutput?
  nodeGroup,                             // top entry of openedNodeGroupStack (undefined at root)
  scope,                                 // { kind: 'group' } | { kind: 'root'; allowNameOverride; allowStructureGrow }
): { validation: ConnectionValidationResult }
```

```
Step-by-step process:
─────────────────────
1. TRIGGER: an edge connects a typed handle to a groupInfer template handle on
   groupInput (output side) or groupOutput (input side).

2. XOR GATE (nodeGroups.ts › growSpareAndPropagateBoundaryHandle): act only when a node group is open OR at root, AND
     (isSourceHandleInferredFromConnection && isSourceNodeGroupInput)
       !== (isTargetHandleInferredFromConnection && isTargetNodeGroupOutput)
   The PRE-inference infer flags are used because overrideDataType rewrites the
   handle's underlyingType from 'inferFromConnection' to the concrete type.
   A direct GroupInput->GroupOutput connection fails the XOR (both sides infer),
   so it is rejected — no type information exists to propagate.

3. DETERMINE SIDE: the inferred side decides what is added. If the source was
   the infer side -> add an OUTPUT to the group; if the target was the infer
   side -> add an INPUT to the group.

4. CREATE TEMPLATE HANDLE: build a fresh empty-name groupInfer handle of the
   matching kind (output for groupInput, input for groupOutput) via
   constructTypeOfHandleFromIndices, then append it to the boundary node at
   index1: -1 with insertOrDeleteHandleInNodeDataUsingHandleIndices.

5. PROPAGATE (GROUP SCOPE ONLY): call
   addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees with the
   inferred handle's name, dataType, allowInput, and maxConnections. This
   (a) adds the input/output to the group's TypeOfNode, (b) updates every
   instance in each dependent subtree, and (c) updates every instance in root.
   At ROOT scope there is no node type to propagate to (the root graph is a
   single instance — the runtime caller), so this step is skipped.
```

> `isGroupInputOrOutputNode(nodeTypeUniqueId)`
> (`src/utils/nodeStateManagement/nodes/nodeGroups.ts` ›
> `isGroupInputOrOutputNode`) is the small helper exported alongside it,
> returning true for `groupInput` or `groupOutput`.

### Propagation across all instances (`addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees`)

This function in `src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees` makes
handle changes cascade globally:

```
addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees()
  |
  +-- 1. Modify the TypeOfNode definition itself
  |      (insertOrDeleteHandleInNodeDataUsingHandleIndices at addAtIndex)
  |
  +-- 2. For each direct dependent (getDirectDependentsOfNodeType):
  |      groups whose subtrees contain instances of this node type ->
  |      update those instances via
  |      addAnInputOrOutputToAllNodesOfANodeTypeAcrossSubtree()
  |
  +-- 3. Update all instances in root-level state.nodes/edges via
         addAnInputOrOutputToAllNodesOfANodeTypeAcrossSubtree()
```

Note that recursive (transitive) dependents are not walked here — each direct
dependent stores the handle for its own subtree; deeper instances inherit it
through their own dependent relationships when those subtrees are processed.

## Group Editing (node-type drawer)

A group's name and handle ordering can be edited through the **node-type edit
drawer** (`ActiveDrawer` of `{ type: 'editNodeType'; nodeTypeId }`), opened from
either:

- The group node's `edit-node-type` header action (Pencil icon), or
- The pencil button on the last breadcrumb in `FullGraphNodeGroupSelector`.

Saving dispatches `UPDATE_NODE_TYPE`
(`src/utils/nodeStateManagement/planApply/validators.ts` › `UPDATE_NODE_TYPE`;
applied at `src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
`UPDATE_NODE_TYPE`). Validation enforces that handles may only be **reordered or
re-paneled, never added or removed** (`validateInputsUpdate` /
`validateOutputsUpdate` compare the flattened `name::dataType` multisets); names
must be unique and dataTypes must exist; panels cannot be empty. On apply:

1. **Tier 1** — updates the `TypeOfNode` definition's `name`/`headerColor`/
   `inputs`/`outputs`.
2. **`reconstructAllInstances`**
   (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
   `reconstructAllInstances`) rebuilds every instance in dependent subtrees
   (Tier 2) and root nodes (Tier 3), preserving existing handle ids by matching
   on `name::dataTypeUniqueId`.
3. **Boundary sync** — for a group type, the same function reorders the
   `groupInput.outputs` and `groupOutput.inputs` to match the new handle order,
   keeping the index-position mapping intact while preserving the trailing
   empty-name `groupInfer` template handle(s).

`FullGraph.handleSaveNodeType` follows the save with a `requestAnimationFrame`
call to `updateNodeInternals` for the affected nodes (including `groupInput`/
`groupOutput`) so ReactFlow repositions the handles.

## Navigation (`openedNodeGroupStack`)

The `openedNodeGroupStack` is an optional array on `State`
(`src/utils/nodeStateManagement/types.ts` › `State`) tracking the chain of
opened groups. Each entry is one of:

```typescript
openedNodeGroupStack?: (
  | { nodeType: NodeTypeUniqueId; previousViewport?: Viewport }              // original
  | { nodeType: NodeTypeUniqueId; nodeId: string; previousViewport?: Viewport } // instance
)[];
```

`getCurrentNodesAndEdgesFromState` resolves the **top** entry's
`nodeType.subtree` as the current scope; an empty/undefined stack means the root
graph.

### Instance opening (with `nodeId`)

Triggered by the group node's `open-node-group` header action
(`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNode`), which dispatches `OPEN_NODE_GROUP` with `{ nodeId }`:

- The entry `{ nodeType, nodeId, previousViewport }` is **pushed** onto the
  stack.
- `nodeId` identifies which specific instance is being inspected.
- Opening a group inside a group pushes another entry (depth navigation).
- The breadcrumb UI shows the full chain.

### Original opening (without `nodeId`)

Triggered by selecting a group from the dropdown in `FullGraphNodeGroupSelector`
(`src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`), which dispatches `OPEN_NODE_GROUP` with
`{ nodeType }`:

- The stack is **replaced** with a single entry
  `{ nodeType, previousViewport }`.
- No `nodeId` means the user is editing the group template directly.
- Any existing navigation history is discarded.

### Stack-based navigation with viewport preservation

Each stack entry stores `previousViewport` — the viewport at open time. On
`CLOSE_NODE_GROUP`, the last entry's `previousViewport` is restored to
`state.viewport`, the entry is popped, and ReactFlow transitions back to the
parent view.

### `FullGraphNodeGroupSelector` UI

`src/components/organisms/FullGraph/FullGraphNodeGroupSelector.tsx` ›
`FullGraphNodeGroupSelector` renders:

- A **back button** (`ArrowLeftIcon`), enabled when the stack is non-empty
  (`handleBack` → `CLOSE_NODE_GROUP`).
- A **dropdown** (`Select`) listing all group types plus an "Add New Node Group"
  item (`handleAddNewGroup` → `ADD_NODE_GROUP`); selecting a group →
  `OPEN_NODE_GROUP { nodeType }`.
- A **breadcrumb trail** of the current stack with `ChevronRight` separators
  between names; the **last** breadcrumb shows a **Pencil edit button**
  (`onEditNodeType`) that opens the node-type drawer (`OPEN_DRAWER` with
  `editNodeType`) for the current group.

`FullGraph` builds the selector's `openedNodeGroupStack` prop by mapping each
entry to
`{ id: nodeType + (nodeId ?? ''), name: typeOfNodes[nodeType].name, nodeType }`.

## Recursion Checking

### `enableRecursionChecking` flag

The `State.enableRecursionChecking` flag
(`src/utils/nodeStateManagement/types.ts` › `State`) optionally prevents nesting
a group inside itself (directly or transitively). Enforcement lives in the
**context menu**: `FullGraph` passes
`isRecursionAllowed: !state.enableRecursionChecking` and
`currentNodeType: currentNodeGroup?.nodeType` to `createNodeContextMenu`.

When recursion is disallowed and a group is open, `createNodeContextMenu`
(`src/components/molecules/ContextMenu/createNodeContextMenu.ts` ›
`createNodeContextMenu`) computes
`getAllDependentsOfNodeTypeRecursively(currentNodeType)` and **filters those
node types out of the "Add Node" menu**. Because that set includes the current
group itself and any group that (transitively) contains it, adding such a type —
which would create a recursive dependency — is impossible from the menu.

The supporting dependency-graph helpers live in
`src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`getDependencyGraphBetweenNodeTypes`: `getDependencyGraphBetweenNodeTypes`
(builds `nodeToNodeDependents` / `nodeToNodeDependencies` by scanning each
subtree's node types), `getDirectDependentsOfNodeType`,
`getDirectDependenciesOfNodeType`, `getAllDependentsOfNodeTypeRecursively`, and
`getAllDependenciesOfNodeTypeRecursively` (BFS closures).

The runner additionally enforces a hard depth cap via `MAX_GROUP_DEPTH = 20`
(`src/utils/nodeRunner/groupCompiler.ts` › `MAX_GROUP_DEPTH`) so compilation
terminates even without this flag.

## Groups in the Runner

### Group compilation (`compileGroupScopes`)

`compileGroupScopes` (`src/utils/nodeRunner/groupCompiler.ts` ›
`compileGroupScopes`) processes every node whose `TypeOfNode` has a `subtree`:

```
For each group-node instance:
  1. Warn for any non-standard subtree node lacking a function implementation
     (isStandardNodeType skips groupInput/groupOutput/loop*/switch*).
  2. Build a synthetic subtreeState:
       { ...state, nodes: subtree.nodes, edges: subtree.edges,
         openedNodeGroupStack: undefined }
  3. Recursively compile via compileGraph(...) (depth+1; bails past MAX_GROUP_DEPTH=20).
  4. inputMapping: Map<outerInputHandleId, innerGroupInputOutputHandleId>
       outer node's inputs[i] (flattening panels) paired with groupInput's outputs[i].
  5. outputMapping: Map<innerGroupOutputInputHandleId, outerOutputHandleId>
       groupOutput's inputs[i] (flattening panels) paired with outer node's outputs[i].
  6. Push a GroupExecutionScope { kind:'group', groupNodeId, groupNodeTypeId,
       groupNodeTypeName, innerPlan, inputMapping, outputMapping, concurrencyLevel }.
```

Boundary nodes are recognized by `isGroupBoundaryNode`
(`src/utils/nodeRunner/groupCompiler.ts` › `isGroupBoundaryNode`) and are
excluded from the topological sort during compilation, since they are data
mapping points rather than executable nodes.

### Group execution (`executeGroupScope`)

`executeGroupScope` (`src/utils/nodeRunner/executor/executeGroupScope.ts` ›
`executeGroupScope`) runs a compiled group scope (it is recursive and accepts a
`groupDepth`, default `1`):

```
1. onNodeStateChange(groupNodeId, 'running').
2. Validate the group's TypeOfNode and subtree exist (error -> recorded + thrown).
3. innerState = buildInnerState(state, subtree); build innerNodeInfoMap from subtree nodes.
4. scopedStore = valueStore.createScope(groupNodeId)  (isolated namespace).
5. INPUT MAPPING: for each (outerHandleId -> innerHandleId) in inputMapping:
   a. plan.inputResolutionMap[qualifiedId(groupNodeId, outerHandleId)] -> source entries.
   b. value = parent valueStore.get(entries[0].sourceNodeId, entries[0].sourceHandleId).
   c. scopedStore.set(subtree.inputNodeId, innerHandleId, value).
6. recorder.beginGroup + beginScope; execute inner plan levels:
   - 'standard' -> executeStandardNode; 'group' -> recurse (groupDepth+1);
     loop/switch -> executeOneStep. Sequential when step-by-step (afterStep present),
     else Promise.allSettled per level.
7. OUTPUT MAPPING: for each (innerHandleId -> outerHandleId) in outputMapping:
   a. innerPlan.inputResolutionMap[qualifiedId(subtree.outputNodeId, innerHandleId)].
   b. value = scopedStore.get(entries[0].sourceNodeId, entries[0].sourceHandleId).
   c. parent valueStore.set(groupNodeId, outerHandleId, value).
8. recorder.endScope(...) -> innerSnapshot; recorder.completeGroup(...) -> GroupRecord.
9. recordStructuralNodeCompletion for the group node (timeline visibility).
10. onNodeStateChange(groupNodeId, 'completed' | 'errored').
```

### `GroupExecutionScope` type

Defined in `src/utils/nodeRunner/types.ts` › `GroupExecutionScope`:

```typescript
type GroupExecutionScope = {
  kind: 'group';
  groupNodeId: string; // Instance ID in the outer graph
  groupNodeTypeId: string; // Key in typeOfNodes
  groupNodeTypeName: string; // Display name
  innerPlan: ExecutionPlan; // Recursively compiled inner plan
  inputMapping: ReadonlyMap<string, string>; // outer input handle -> inner output handle
  outputMapping: ReadonlyMap<string, string>; // inner input handle -> outer output handle
  concurrencyLevel: number; // Reassigned by the main compiler
};
```

It is one arm of the `ExecutionStep` union (`src/utils/nodeRunner/types.ts` ›
`ExecutionStep`).

### `GroupRecord` type

Defined in `src/utils/nodeRunner/types.ts` › `GroupRecord`:

```typescript
type GroupRecord = {
  groupNodeId: string;
  groupNodeTypeId: string;
  innerRecord: ExecutionRecord; // Full recursive record
  inputMapping: ReadonlyMap<string, unknown>; // boundary handle ID -> actual value
  outputMapping: ReadonlyMap<string, unknown>; // boundary handle ID -> actual value
};
```

`innerRecord` is a complete `ExecutionRecord` — the same type used for
root-level execution — enabling recursive inspection of group execution in the
timeline/inspector UI. The `ExecutionRecord` carries
`groupRecords: ReadonlyMap<string, GroupRecord>`
(`src/utils/nodeRunner/types.ts` › `ExecutionRecord`).

## Limitations and Notes

- **`numberOfReferences` is never incremented.** The write-protection guard in
  `setCurrentNodesAndEdgesToStateWithMutatingState` checks `references !== 0`,
  but since the count is always `0`, subtrees of _all_ group types are currently
  editable. This is scaffolding; do not rely on it as an edit lock.
- **Handles cannot be freely added/removed via the editor.** `UPDATE_NODE_TYPE`
  only allows reorder/re-panel of a group's inputs/outputs; the actual set of
  handles grows only through boundary inference (connecting to a `groupInfer`
  template handle inside the group).
- **No direct groupInput → groupOutput connections.** The XOR gate in
  `growSpareAndPropagateBoundaryHandle`
  (`src/utils/nodeStateManagement/nodes/nodeGroups.ts` ›
  `growSpareAndPropagateBoundaryHandle`) requires exactly one side to be an
  inferred boundary handle, so a wire straight from groupInput to groupOutput
  carries no type information and is not propagated.
- **Fan-in at group boundaries uses only the first source.** Both the input and
  output mapping in `executeGroupScope` read `entries[0]` from the resolution
  map, so multiple edges feeding one boundary handle propagate a single value.
- **No per-instance subtree overrides.** All instances of a group type share one
  subtree definition; there is no per-instance customization.

## Examples

### Creating a simple "Add Two Numbers" group

```typescript
import { actionTypesMap } from 'react-blender-nodes';

// 1. Create a new group (auto-named "Node Group N", auto-opened for editing).
dispatch({ type: actionTypesMap.ADD_NODE_GROUP });

// 2. Inside the now-open group, add a node (operates on the subtree scope).
dispatch({
  type: actionTypesMap.ADD_NODE,
  payload: { type: 'addNode', position: { x: 0, y: 0 } },
});

// 3. Connect groupInput's groupInfer output to addNode's input.
//    With enableTypeInference on, this infers the type and appends a fresh
//    groupInfer template to groupInput AND adds an input to the group type.
dispatch({
  type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
  payload: {
    edge: {
      source: groupInputId,
      sourceHandle: groupInputTemplateOutputHandleId,
      target: addNodeId,
      targetHandle: addNodeInputHandleId,
    },
  },
});

// 4. Connect addNode's output to groupOutput's groupInfer input (adds an output).
dispatch({
  type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
  payload: {
    edge: {
      source: addNodeId,
      sourceHandle: addNodeOutputHandleId,
      target: groupOutputId,
      targetHandle: groupOutputTemplateInputHandleId,
    },
  },
});

// 5. Close the group (restores the previous viewport).
dispatch({ type: actionTypesMap.CLOSE_NODE_GROUP });

// 6. The group now appears in the context menu under "Group Nodes" and can be
//    instantiated like any other node type.
```

### Opening a group for inspection or editing

```typescript
import { actionTypesMap } from 'react-blender-nodes';

// Instance opening (push onto the stack — view a specific instance's context).
dispatch({
  type: actionTypesMap.OPEN_NODE_GROUP,
  payload: { nodeId: 'node_2' }, // a group node instance id in the current scope
});

// Original opening (replace the stack — edit the group template directly).
dispatch({
  type: actionTypesMap.OPEN_NODE_GROUP,
  payload: { nodeType: 'myGroupTypeId' }, // a typeOfNodes key with a subtree
});

// Open the node-type drawer to rename / reorder a group's handles.
dispatch({
  type: actionTypesMap.OPEN_DRAWER,
  payload: {
    activeDrawer: { type: 'editNodeType', nodeTypeId: 'myGroupTypeId' },
  },
});
```

## Relationships with Other Features

### → [Data Types (`groupInfer`)](../core/dataTypesDoc.md)

The `groupInfer` data type (`src/utils/nodeStateManagement/standardNodes.ts` ›
`groupInfer`) has `underlyingType: 'inferFromConnection'`, so its concrete type
is decided at connection time. This is the mechanism that lets a group accept
any data type — the interface adapts to how the internal nodes are wired.

### → [Handles (dynamic handle addition)](../core/handlesDoc.md)

Groups use `insertOrDeleteHandleInNodeDataUsingHandleIndices` to append fresh
template handles to boundary nodes after inference, and
`addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees` to mirror
the change onto the group type and all instances — the same handle-management
infrastructure used by loops and switches.

### → [Type Inference](../core/typeInferenceDoc.md)

When `enableTypeInference` is active, `validateAddEdge` calls
`planInferenceForEdgeAddition` (passing the scope's
`inputNodeId`/`outputNodeId`) to resolve the concrete type; `applyPlan` applies
it via `overrideDataType`. This inference is a prerequisite for
`growSpareAndPropagateBoundaryHandle`.

### → [Nodes (group is a special node type)](../core/nodesDoc.md)

A group node renders as a standard `configurableNode`. It is identified as a
group purely by the presence of `state.typeOfNodes[nodeTypeUniqueId].subtree`
(`hasSubtree`); there is no per-node boolean flag. `groupInput` and
`groupOutput` are two of the seven standard node types.

### → [Edges (edges connect to group boundary nodes)](../core/edgesDoc.md)

Inside a subtree, edges connect internal nodes to the groupInput/groupOutput
boundary nodes. Edge validation runs through the same `validateAddEdge` gauntlet
as root edges, operating on the current scope's nodes/edges (the subtree when a
group is open).

### → [State Management (`openedNodeGroupStack`, `ADD_NODE_GROUP`)](../core/stateManagementDoc.md)

`openedNodeGroupStack` selects the active subtree.
`getCurrentNodesAndEdgesFromState` and
`setCurrentNodesAndEdgesToStateWithMutatingState` use its top entry to redirect
all scope-aware plan mutations to the correct subtree. `ADD_NODE_GROUP`,
`OPEN_NODE_GROUP`, `CLOSE_NODE_GROUP`, and `UPDATE_NODE_TYPE` are validated in
`validators.ts` and applied in `applyPlan.ts`.

### → [Zones & Switches](./zonesDoc.md)

Loops and switches placed inside a group store their region metadata in
`subtree.zones` / `subtree.zoneIndex`. `setCurrentZonesToState` writes zones to
the correct scope, and `recomputeAllZoneMemberships` runs after node/edge
changes. All zone fields are UI-only and stripped on export.

### → [Runner (group compilation and execution)](../runner/runnerHookDoc.md)

Groups compile into `GroupExecutionScope` entries (`compileGroupScopes`) and run
via `executeGroupScope`, which creates an isolated scoped `ValueStore`, maps
values across the boundaries, and emits recursive `GroupRecord` entries for the
execution history.

### → [FullGraph UI (group navigation)](../ui/fullGraphDoc.md)

`FullGraphNodeGroupSelector` provides the back button, group dropdown, and
breadcrumb (with the trailing edit pencil). `FullGraph.tsx` translates these
into `OPEN_NODE_GROUP`, `CLOSE_NODE_GROUP`, `ADD_NODE_GROUP`, and `OPEN_DRAWER`
(`editNodeType`) dispatches, and gates the context menu's recursion filtering.

### → [Import/Export (subtree serialization)](../importExport/importExportDoc.md)

Group subtrees serialize as part of `typeOfNodes` during state export. Because
`subtree.nodes`/`subtree.edges` use the same types as root-level data, the
serializer handles them transparently; it additionally strips each subtree's
`zones`/`zoneIndex` (UI-only). On import, `REPLACE_STATE` rehydrates all zones.
