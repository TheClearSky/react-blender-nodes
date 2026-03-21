# Nodes

## Overview

Nodes are the primary building blocks of the graph in `react-blender-nodes`. The
node system operates on two distinct layers:

1. **Node Type Definitions (`TypeOfNode`)** - Templates that define a node's
   name, header color, inputs, outputs, context menu placement, and optional
   subtree (for node groups). These are stored in `State.typeOfNodes` as a
   `Record<NodeTypeUniqueId, TypeOfNode>`.

2. **Node Instances** - ReactFlow `Node` objects whose `data` property contains
   instantiated handles (with generated IDs and resolved data type info), the
   `nodeTypeUniqueId` reference back to the type definition, and all
   visual/interaction state. These are stored in `State.nodes` as an array.

A node type definition acts as a blueprint. When a user adds a node to the
graph, `constructNodeOfType` reads the blueprint, instantiates handles with
unique IDs and resolved data type colors/shapes, and produces a
ReactFlow-compatible node object placed at the requested position.

Five **standard node types** are built into the library: `groupInput`,
`groupOutput` (for node groups), and `loopStart`, `loopStop`, `loopEnd` (for
loops).

## Entity-Relationship Diagram

```
+---------------------+          +------------------------+
|    State            |          |  TypeOfNode            |
|---------------------|    1:N   |------------------------|
| dataTypes       ----+----+     | name                   |
| typeOfNodes     ----+----+--->| headerColor            |
| nodes           ----+-+       | inputs[]               |
| edges           ----+-+-+     |   TypeOfInput           |
| openedNodeGroup |   | | |     |   TypeOfInputPanel      |
|   Stack         |   | | |     | outputs[]               |
+---------------------+ | |     |   TypeOfInput           |
                         | |     | locationInContextMenu  |
                         | |     | priorityInContextMenu  |
                         | |     | subtree? (node groups) |
                         | |     +------------------------+
                         | |
                         | |     +---------------------------+
                         | +---->| Node Instance (ReactFlow) |
                         |       |---------------------------|
                         |       | id                        |
                         |       | position: { x, y }        |
                         |       | type: 'configurableNode'  |
                         |       | width: 400                |
                         |       | data:                     |
                         |       |   InstantiatedNodeData    |
                         |       |   .name                   |
                         |       |   .headerColor            |
                         |       |   .inputs[]               |
                         |       |     ConfigurableNodeInput |
                         |       |     ConfigurableNodeInput |
                         |       |       Panel               |
                         |       |   .outputs[]              |
                         |       |     ConfigurableNodeOutput|
                         |       |   .nodeTypeUniqueId       |
                         |       |   .showNodeOpenButton     |
                         |       +---------------------------+
                         |                    |
                         |                    | references
                         |                    v
                         |       +---------------------------+
                         +------>| Edge                      |
                                 |---------------------------|
                                 | id                        |
                                 | source (node id)          |
                                 | target (node id)          |
                                 | sourceHandle (handle id)  |
                                 | targetHandle (handle id)  |
                                 +---------------------------+
```

## Functional Dependency Diagram

```
makeDataTypeWithAutoInfer()    makeTypeOfNodeWithAutoInfer()    makeStateWithAutoInfer()
         |                              |                              |
         v                              v                              v
   DataType defs                 TypeOfNode defs                 State (complete)
         |                              |                              |
         +-----------+------------------+                              |
                     |                                                 |
                     v                                                 |
         constructInputOrOutputOfType()                                |
         constructInputPanelOfType()                                   |
                     |                                                 |
                     v                                                 |
              constructNodeOfType()  <---------------------------------+
                     |
                     v
            mainReducer (ADD_NODE / ADD_NODE_AND_SELECT)
                     |
                     v
         getCurrentNodesAndEdgesFromState()  <--- openedNodeGroupStack
         setCurrentNodesAndEdgesToStateWithMutatingState()
                     |
                     v
         ReactFlow renders via nodeTypes = { configurableNode: Wrapper }
                     |
                     v
         ConfigurableNodeReactFlowWrapper --> ConfigurableNode
```

## Data Flow Diagram

```
 TypeOfNode definition                           Node instance in state
 (template in typeOfNodes)                        (entry in nodes[])
+----------------------------+                   +----------------------------+
| name: "Math Add"           |                   | id: "abc123xyz..."         |
| headerColor: "#C44536"     | constructNode     | position: { x:100, y:100 }|
| inputs: [                  | OfType()          | type: "configurableNode"   |
|   { name:"A",              | ================> | data: {                    |
|     dataType:"numberType"} |   generates IDs,  |   name: "Math Add",       |
| ]                          |   resolves colors |   headerColor: "#C44536", |
| outputs: [                 |   and shapes from |   inputs: [{              |
|   { name:"Sum",            |   allDataTypes    |     id: "rnd20charID",    |
|     dataType:"numberType"} |                   |     name: "A",            |
| ]                          |                   |     handleColor: "#E74C3C"|
+----------------------------+                   |     type: "number",       |
                                                  |     dataType: {...}       |
                                                  |   }],                     |
                                                  |   outputs: [{...}],       |
                                                  |   nodeTypeUniqueId:       |
                                                  |     "mathAdd",            |
                                                  |   showNodeOpenButton:     |
                                                  |     false                 |
                                                  | }                         |
                                                  +----------------------------+
                                                             |
                                                             | ReactFlow renders
                                                             v
                                                  +----------------------------+
                                                  | ConfigurableNode-          |
                                                  | ReactFlowWrapper          |
                                                  |   -> ConfigurableNode     |
                                                  |     (header, inputs,      |
                                                  |      outputs, handles,    |
                                                  |      panels, resizer)     |
                                                  +----------------------------+
```

## System Diagram

```
+===========================================================================+
|                            react-blender-nodes                            |
+===========================================================================+
|                                                                           |
|  +-----------------------+     +--------------------------------------+   |
|  | Type Definitions      |     | State (Runtime)                      |   |
|  |                       |     |                                      |   |
|  | DataType defs --------+---->| state.dataTypes                      |   |
|  | TypeOfNode defs ------+---->| state.typeOfNodes                    |   |
|  |                       |     | state.nodes  (Node instances[])      |   |
|  +-----------------------+     | state.edges  (Edge instances[])      |   |
|                                | state.openedNodeGroupStack          |   |
|  +-----------------------+     | state.viewport                       |   |
|  | Standard Nodes        |     +--------+-----------------------------+   |
|  | (built-in types)      |              |                                 |
|  |                       |              | mainReducer                     |
|  | groupInput            |              | (Immer produce)                 |
|  | groupOutput           |              |                                 |
|  | loopStart             |     +--------v-----------------------------+   |
|  | loopStop              |     | Actions                              |   |
|  | loopEnd               |     |                                      |   |
|  +-----------------------+     | ADD_NODE, ADD_NODE_AND_SELECT,       |   |
|                                | UPDATE_NODE_BY_REACT_FLOW,          |   |
|  +-----------------------+     | UPDATE_EDGES_BY_REACT_FLOW,         |   |
|  | Construction Fns      |     | ADD_EDGE_BY_REACT_FLOW,             |   |
|  |                       |     | UPDATE_INPUT_VALUE,                  |   |
|  | constructNodeOfType   |     | OPEN_NODE_GROUP, CLOSE_NODE_GROUP,  |   |
|  | constructInputOr-     |     | ADD_NODE_GROUP, SET_VIEWPORT,       |   |
|  |   OutputOfType        |     | REPLACE_STATE                       |   |
|  | constructInputPanel-  |     +--------------------------------------+   |
|  |   OfType              |                                                |
|  | constructTypeOfHandle-|     +--------------------------------------+   |
|  |   FromIndices         |     | ReactFlow Rendering                  |   |
|  +-----------------------+     |                                      |   |
|                                | nodeTypes = {                        |   |
|  +-----------------------+     |   configurableNode:                  |   |
|  | Navigation            |     |     ConfigurableNodeReactFlowWrapper |   |
|  |                       |     | }                                    |   |
|  | getCurrentNodesAnd-   |     |                                      |   |
|  |   EdgesFromState      |     | ConfigurableNode                    |   |
|  | setCurrentNodesAnd-   |     |   RenderInput / RenderOutput        |   |
|  |   EdgesToState...     |     |   RenderInputPanel                  |   |
|  | openedNodeGroupStack  |     |   ContextAwareHandle                |   |
|  +-----------------------+     |   ContextAwareInput                  |   |
|                                |   ContextAwareOpenButton             |   |
|  +-----------------------+     +--------------------------------------+   |
|  | Dependency Analysis   |                                                |
|  |                       |     +--------------------------------------+   |
|  | getDependencyGraph-   |     | Runner System                        |   |
|  |   BetweenNodeTypes    |     |                                      |   |
|  | getDirectDependents-  |     | Compiles nodes into execution steps  |   |
|  |   OfNodeType          |     | Handles loops and node groups        |   |
|  | getAllDependentsOf-   |     | Records execution for timeline UI    |   |
|  |   NodeTypeRecursively |     +--------------------------------------+   |
|  +-----------------------+                                                |
|                                                                           |
+===========================================================================+
```

## Type Definitions

### TypeOfNode

Defined in [types.ts:189-245](src/utils/nodeStateManagement/types.ts#L189-L245).

The template for a node type. Key fields:

| Field                   | Type                                  | Description                                                                                                            |
| ----------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`                  | `string`                              | Display name                                                                                                           |
| `headerColor`           | `string?`                             | CSS color for the header bar                                                                                           |
| `inputs`                | `(TypeOfInput \| TypeOfInputPanel)[]` | Input handle definitions (may include panels)                                                                          |
| `outputs`               | `TypeOfInput[]`                       | Output handle definitions                                                                                              |
| `locationInContextMenu` | `string[]?`                           | Path in the "Add Node" context menu (e.g., `["Math", "Trig"]`)                                                         |
| `priorityInContextMenu` | `number?`                             | Ordering priority (higher = first). Default: 0                                                                         |
| `subtree`               | `object?`                             | If present, this type is a node group (contains `nodes`, `edges`, `numberOfReferences`, `inputNodeId`, `outputNodeId`) |

### TypeOfInput

Defined in [types.ts:161-170](src/utils/nodeStateManagement/types.ts#L161-L170).

| Field            | Type               | Description                                                                    |
| ---------------- | ------------------ | ------------------------------------------------------------------------------ |
| `name`           | `string`           | Display name                                                                   |
| `dataType`       | `DataTypeUniqueId` | References a key in `state.dataTypes`                                          |
| `allowInput`     | `boolean?`         | Whether to show an interactive input widget (overrides DataType-level setting) |
| `maxConnections` | `number?`          | Connection limit (overrides DataType-level setting)                            |

### TypeOfInputPanel

Defined in [types.ts:177-182](src/utils/nodeStateManagement/types.ts#L177-L182).

| Field    | Type            | Description                                  |
| -------- | --------------- | -------------------------------------------- |
| `name`   | `string`        | Panel display name                           |
| `inputs` | `TypeOfInput[]` | Array of inputs within the collapsible panel |

### InstantiatedNodeData

Defined in
[nodes/types.ts:29-43](src/utils/nodeStateManagement/nodes/types.ts#L29-L43).

The runtime data of a node instance. Equivalent to
`NonNullable<State['nodes'][number]['data']>`. Contains instantiated handles
(with generated IDs, resolved colors, and shapes), plus `nodeTypeUniqueId` and
`showNodeOpenButton`.

### ConfigurableNodeState

Defined in
[ConfigurableNodeReactFlowWrapper.tsx:12-30](src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx#L12-L30).

The ReactFlow `Node` type specialized for configurable nodes:
`Node<Omit<ConfigurableNodeProps, 'isCurrentlyInsideReactFlow'>, 'configurableNode'>`.

### ConfigurableNodeProps

Defined in
[ConfigurableNode.tsx:174-221](src/components/organisms/ConfigurableNode/ConfigurableNode.tsx#L174-L221).

Props accepted by the `ConfigurableNode` React component. Key fields beyond
what's in `InstantiatedNodeData`:

| Field                        | Type                                | Description                                                 |
| ---------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `isCurrentlyInsideReactFlow` | `boolean?`                          | Whether running inside ReactFlow (enables handles, resizer) |
| `nodeResizerProps`           | `NodeResizerWithMoreControlsProps?` | Node resizer configuration                                  |
| `showNodeOpenButton`         | `boolean?`                          | Shows the "open" button for node groups                     |
| `runnerVisualState`          | `NodeVisualState?`                  | Runner execution state overlay                              |
| `runnerErrors`               | `ReadonlyArray<GraphError>?`        | Errors from the runner                                      |
| `runnerWarnings`             | `ReadonlyArray<string>?`            | Warnings from the runner                                    |

### Nodes Type

Defined in
[FullGraph/types.ts:24-39](src/components/organisms/FullGraph/types.ts#L24-L39).

```typescript
type Nodes = Optional<
  ConfigurableNodeReactFlowWrapperProps,
  NodeOptionalKeys
>[];
```

An array of ReactFlow node objects with some optional keys (`draggable`,
`zIndex`, `selectable`, `deletable`, `dragging`, `selected`, `isConnectable`,
`positionAbsoluteX`, `positionAbsoluteY`).

## Node Type Definition Structure

### name, headerColor

- `name` is displayed in the node's header bar.
- `headerColor` is an optional CSS color string applied as the `backgroundColor`
  of the header. Defaults to `'#79461D'` (brown) in the `ConfigurableNode`
  component if not provided.

### inputs and outputs (with panels)

**Inputs** can be either:

- **Regular inputs** (`TypeOfInput`) - a single handle with a name, data type
  reference, optional `allowInput`, and optional `maxConnections`.
- **Input panels** (`TypeOfInputPanel`) - a collapsible group of inputs.
  Detected at construction time by checking `'inputs' in input`.

**Outputs** are always `TypeOfInput[]` (no panel nesting for outputs).

The `dataType` field on each input/output references a key in `state.dataTypes`.
At construction time, the data type's `color`, `shape`, `allowInput`, and
`maxConnections` are resolved and baked into the instantiated handle.

### locationInContextMenu, priorityInContextMenu

- `locationInContextMenu` is an array of strings defining the path in the "Add
  Node" context menu. For example, `["Math", "Trig"]` places the node under
  Math > Trig. Omitting it places the node at the root level.
- `priorityInContextMenu` controls ordering within a menu level. Higher values
  appear first. Standard nodes use priority `200`; group nodes use `100`.

### subtree (for node groups)

If `subtree` is defined, the `TypeOfNode` represents a **node group**. The
subtree contains:

| Field                | Type     | Description                                                                                          |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `nodes`              | `Nodes`  | The nodes inside this group                                                                          |
| `edges`              | `Edges`  | The edges inside this group                                                                          |
| `numberOfReferences` | `number` | Count of instances of this group in the graph. Editing the subtree is only allowed when this is `0`. |
| `inputNodeId`        | `string` | ID of the `groupInput` node inside the subtree                                                       |
| `outputNodeId`       | `string` | ID of the `groupOutput` node inside the subtree                                                      |

The presence of `subtree` also triggers `showNodeOpenButton: true` on
instantiated nodes, displaying the UI button to open and enter the group.

## Standard Node Types

Defined in [standardNodes.ts](src/utils/nodeStateManagement/standardNodes.ts).
Five standard node types exist, alongside four standard data types:

### Standard Data Types

| Name            | Underlying Type       | Color     | Purpose                                                         |
| --------------- | --------------------- | --------- | --------------------------------------------------------------- |
| `groupInfer`    | `inferFromConnection` | `#333333` | Used by group input/output handles; type inferred on connection |
| `loopInfer`     | `inferFromConnection` | `#333333` | Used by loop node handles; type inferred on connection          |
| `condition`     | `boolean`             | `#cca6d6` | Loop stop condition; `allowInput: true`                         |
| `bindLoopNodes` | `noEquivalent`        | `#8c52d1` | Links loop triplet nodes together; `maxConnections: 1`          |

### Standard Node Types

| Name          | Header Color | Context Menu         | Inputs                                             | Outputs                            | Purpose                                                                                                          |
| ------------- | ------------ | -------------------- | -------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `groupInput`  | `#1d1d1d`    | Standard Nodes (200) | none                                               | 1x `groupInfer`                    | Entry point inside a node group subtree. Outputs data flowing into the group.                                    |
| `groupOutput` | `#1d1d1d`    | Standard Nodes (200) | 1x `groupInfer`                                    | none                               | Exit point inside a node group subtree. Collects data flowing out of the group.                                  |
| `loopStart`   | `#1d1d1d`    | Standard Nodes (200) | 1x `loopInfer`                                     | 1x `bindLoopNodes`, 1x `loopInfer` | Marks the beginning of a loop. Receives initial data, outputs `bindLoopNodes` to link with `loopStop`/`loopEnd`. |
| `loopStop`    | `#1d1d1d`    | Standard Nodes (200) | 1x `bindLoopNodes`, 1x `condition`, 1x `loopInfer` | 1x `bindLoopNodes`, 1x `loopInfer` | Evaluates the loop condition ("Continue If Condition Is True"). Sits between `loopStart` and `loopEnd`.          |
| `loopEnd`     | `#1d1d1d`    | Standard Nodes (200) | 1x `bindLoopNodes`, 1x `loopInfer`                 | 1x `loopInfer`                     | Marks the end of a loop. Outputs the final loop result.                                                          |

### Loop Triplet Structure

Loop nodes form a **triplet** bound together by `bindLoopNodes` edges (max 1
connection each). The `getLoopStructureFromNode` function traverses from any
loop node to find the complete `LoopStructure` containing all three nodes.

```
                       bindLoopNodes          bindLoopNodes
  +------------+  =====================>  +------------+  =====================>  +----------+
  | Loop Start |                          | Loop Stop  |                          | Loop End |
  |            |  <--- loopInfer data --> |            |  <--- loopInfer data --> |          |
  +------------+                          +------------+                          +----------+
       |                                    |        |                                 |
   loopInfer in                      condition in    loopInfer in                loopInfer out
   (initial data)                    (boolean)       (iteration data)            (final result)
```

## Node Lifecycle

### 1. Type Definition (TypeOfNode)

A node type is defined using `makeTypeOfNodeWithAutoInfer()` for type safety,
then placed in the `state.typeOfNodes` record:

```typescript
const typeOfNodes = {
  mathAdd: makeTypeOfNodeWithAutoInfer({
    name: 'Math Add',
    headerColor: '#C44536',
    inputs: [
      { name: 'A', dataType: 'numberType', allowInput: true },
      { name: 'B', dataType: 'numberType', allowInput: true },
    ],
    outputs: [{ name: 'Sum', dataType: 'numberType' }],
    locationInContextMenu: ['Math'],
  }),
};
```

### 2. Instantiation (constructNodeOfType)

When the user adds a node (via `ADD_NODE` or `ADD_NODE_AND_SELECT` action),
`constructNodeOfType` is called. It:

1. Reads the `TypeOfNode` definition from `typeOfNodes[nodeType]`.
2. Iterates over `inputs`, calling `constructInputOrOutputOfType` for regular
   inputs or `constructInputPanelOfType` for panels.
3. For each handle, resolves the data type from `allDataTypes`, generating a
   unique 20-character ID and extracting `color`, `shape`, `allowInput`, and
   `maxConnections`.
4. Iterates over `outputs`, calling `constructInputOrOutputOfType` for each.
5. Returns a ReactFlow node object with `type: 'configurableNode'`,
   `width: 400`, `sourcePosition: Position.Right`,
   `targetPosition: Position.Left`.

### 3. Placement in State

The reducer adds the new node to the currently visible node array:

```typescript
case 'ADD_NODE':
  const node = constructNodeOfType(state.dataTypes, type, state.typeOfNodes, nodeId, position);
  setCurrentNodesAndEdgesToStateWithMutatingState(state, [
    ...getCurrentNodesAndEdgesFromState(state).nodes,
    node,
  ]);
```

For `ADD_NODE_AND_SELECT`, all existing nodes are first deselected, then the new
node is added with `selected: true`.

### 4. Rendering (ConfigurableNode)

ReactFlow uses the registered `nodeTypes` map to render nodes:

```typescript
const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};
```

`ConfigurableNodeReactFlowWrapper` receives `NodeProps` from ReactFlow, extracts
`data` and `id`, and passes them to `ConfigurableNode` with
`isCurrentlyInsideReactFlow: true`.

`ConfigurableNode` renders:

- A colored header bar with the node name (and optional debug ID, open button).
- Outputs section with `RenderOutput` components (right-aligned handles).
- Inputs section with either `RenderInput` (single handles with optional
  interactive inputs) or `RenderInputPanel` (collapsible groups).

When inside ReactFlow, handles are active and input widgets are hidden when
connected.

### 5. Connection (Edges)

Edges reference node IDs and handle IDs. When a connection is made
(`ADD_EDGE_BY_REACT_FLOW`), the reducer validates type compatibility, checks for
cycles (if enabled), and adds the edge. Type inference may trigger handle
duplication on group input/output and loop nodes.

### 6. Execution (Runner)

The runner system compiles node instances into execution steps using topological
sort. It classifies nodes by type (regular, loop start/stop/end, group
input/output) and generates appropriate execution steps. See the Runner
documentation for details.

## Node Navigation (openedNodeGroupStack)

The `openedNodeGroupStack` in `State` is an array that tracks which node group
the user has navigated into. It supports nested navigation (group within group).

### getCurrentNodesAndEdgesFromState

Defined in
[constructAndModifyNodes.ts:417-462](src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts#L417-L462).

This is a critical function that resolves which nodes and edges are currently
visible:

1. It reads the **top** of the `openedNodeGroupStack` (last element).
2. If the stack is empty or undefined, it returns `state.nodes` and
   `state.edges` (root level).
3. If a group is open, it reads `state.typeOfNodes[topGroup.nodeType].subtree`
   and returns that subtree's `nodes`, `edges`, `inputNodeId`, and
   `outputNodeId`.
4. If the subtree doesn't exist (shouldn't happen), it falls back to root-level
   nodes/edges.

```
openedNodeGroupStack = []
  -> returns state.nodes, state.edges (root graph)

openedNodeGroupStack = [{ nodeType: "myGroup" }]
  -> returns typeOfNodes["myGroup"].subtree.nodes,
             typeOfNodes["myGroup"].subtree.edges

openedNodeGroupStack = [{ nodeType: "outerGroup" }, { nodeType: "innerGroup" }]
  -> returns typeOfNodes["innerGroup"].subtree.nodes,
             typeOfNodes["innerGroup"].subtree.edges
```

### setCurrentNodesAndEdgesToStateWithMutatingState

The write counterpart. Updates either root-level or subtree nodes/edges
depending on the stack. Notably, subtree editing is only permitted when
`numberOfReferences === 0`.

### OPEN_NODE_GROUP / CLOSE_NODE_GROUP Actions

- **OPEN_NODE_GROUP with `nodeId`** (instance opening): Finds the node, reads
  its `nodeTypeUniqueId`, verifies it has a subtree, pushes
  `{ nodeType, nodeId, previousViewport }` onto the stack.
- **OPEN_NODE_GROUP with `nodeType`** (original opening): Clears the stack and
  pushes `{ nodeType, previousViewport }`. Used when editing the type definition
  directly.
- **CLOSE_NODE_GROUP**: Restores the `previousViewport` from the top entry, then
  pops the stack.

## Node Construction Details

### constructNodeOfType

Defined in
[constructAndModifyNodes.ts:291-352](src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts#L291-L352).

Parameters:

- `allDataTypes` - The `state.dataTypes` record
- `nodeType` - The `NodeTypeUniqueId` to instantiate
- `typeOfNodes` - The `state.typeOfNodes` record
- `nodeId` - Pre-generated unique ID for the new node
- `position` - `XYPosition` for placement

Returns a complete ReactFlow node object. Key behaviors:

- IDs are 20-character random strings (generated by `generateRandomString`).
- `type` is always `'configurableNode'`.
- `width` defaults to `400`.
- `sourcePosition` is `Position.Right`; `targetPosition` is `Position.Left`.
- `showNodeOpenButton` is `true` if the type definition has a `subtree`.

### constructInputOrOutputOfType

Defined in
[constructAndModifyNodes.ts:57-154](src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts#L57-L154).

Creates a single handle instance. Resolves the data type from `allDataTypes` and
branches on `underlyingType`:

- `'number'` -> `type: 'number'`
- `'string'` -> `type: 'string'`
- `'boolean'` -> `type: 'boolean'`
- Everything else (`complex`, `noEquivalent`, `inferFromConnection`) ->
  `type: 'unsupportedDirectly'`

Each handle gets: `id`, `name`, `handleColor`, `allowInput`, `maxConnections`,
`type`, `handleShape`, and `dataType` (containing both the data type object and
its unique ID).

### constructInputPanelOfType

Defined in
[constructAndModifyNodes.ts:200-233](src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts#L200-L233).

Creates a panel instance with its own 20-character ID and an array of
constructed inputs.

### constructTypeOfHandleFromIndices

Defined in
[constructAndModifyNodes.ts:365-415](src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts#L365-L415).

Constructs a handle from index-based references (used internally for handle
duplication during type inference). Supports both regular inputs and inputs
within panels via `HandleIndices` (`{ type, index1, index2? }`).

## Node Type Dependency Analysis

The codebase provides utilities for analyzing dependencies between node types
based on their subtrees:

- **`getDependencyGraphBetweenNodeTypes`** - Builds a complete dependency graph
  by examining which node types appear inside each type's subtree.
- **`getDirectDependentsOfNodeType`** - Returns node types whose subtrees
  contain the given type.
- **`getDirectDependenciesOfNodeType`** - Returns node types that the given
  type's subtree contains.
- **`getAllDependentsOfNodeTypeRecursively`** - BFS traversal of all transitive
  dependents (includes self).
- **`getAllDependenciesOfNodeTypeRecursively`** - BFS traversal of all
  transitive dependencies (includes self).

These are used for recursion checking (`enableRecursionChecking`) to prevent
circular group nesting.

## Limitations and Deprecated Patterns

- **No runtime type checking of handle values**: The type system tracks data
  types for connection validation but does not validate actual values at
  connection time (validation happens at the schema level for complex types if
  `enableComplexTypeChecking` is enabled).
- **Fixed node width**: All nodes are constructed with `width: 400` regardless
  of content. Resizing is available at runtime via
  `NodeResizerWithMoreControls`.
- **Panel-only inputs**: Only inputs support panels. Outputs are always flat
  arrays.
- **Subtree editing restriction**: A node group's subtree can only be edited
  when `numberOfReferences === 0`. This is enforced in
  `setCurrentNodesAndEdgesToStateWithMutatingState`.

## Examples

### Defining a Custom Node Type

```typescript
import {
  makeTypeOfNodeWithAutoInfer,
  makeDataTypeWithAutoInfer,
  makeStateWithAutoInfer,
} from 'react-blender-nodes';

// 1. Define data types
const dataTypes = {
  numberType: makeDataTypeWithAutoInfer({
    name: 'Number',
    underlyingType: 'number',
    color: '#E74C3C',
    allowInput: true,
  }),
  stringType: makeDataTypeWithAutoInfer({
    name: 'String',
    underlyingType: 'string',
    color: '#4A90E2',
    allowInput: true,
  }),
};

// 2. Define node types
const typeOfNodes = {
  formatNumber: makeTypeOfNodeWithAutoInfer({
    name: 'Format Number',
    headerColor: '#2D5A87',
    inputs: [
      { name: 'Value', dataType: 'numberType', allowInput: true },
      {
        name: 'Options',
        inputs: [
          { name: 'Decimals', dataType: 'numberType' },
          { name: 'Prefix', dataType: 'stringType' },
        ],
      },
    ],
    outputs: [{ name: 'Formatted', dataType: 'stringType' }],
    locationInContextMenu: ['Formatting'],
    priorityInContextMenu: 10,
  }),
};
```

### Using makeTypeOfNodeWithAutoInfer

The `makeTypeOfNodeWithAutoInfer` function is an identity function that provides
TypeScript type inference. Without it, `dataType` references in inputs/outputs
are unvalidated strings. With it, TypeScript ensures `dataType` values match the
`DataTypeUniqueId` generic parameter.

```typescript
// With auto-infer: TypeScript validates 'numberType' exists
const node = makeTypeOfNodeWithAutoInfer<'numberType' | 'stringType'>({
  name: 'Example',
  inputs: [{ name: 'A', dataType: 'numberType' }], // Validated
  outputs: [{ name: 'B', dataType: 'invalidType' }], // TYPE ERROR
});
```

### Standard Node Type Definitions

Standard node types are defined in
[standardNodes.ts:71-182](src/utils/nodeStateManagement/standardNodes.ts#L71-L182).
They use the standard data types (`groupInfer`, `loopInfer`, `condition`,
`bindLoopNodes`) and are placed in the "Standard Nodes" context menu with
priority 200.

## Relationships with Other Features

### -> [Data Types](dataTypesDoc.md)

Node type definitions reference `DataTypeUniqueId` keys in their inputs and
outputs. At construction time, the data type's `color`, `shape`,
`underlyingType`, `allowInput`, and `maxConnections` are resolved and embedded
into each instantiated handle.

### -> [Handles](handlesDoc.md)

Each input and output on a node instance is an instantiated handle with a unique
ID, resolved visual properties, and data type information. Handles are what
edges actually connect to.

### -> [Edges](edgesDoc.md)

Edges reference `source`/`target` node IDs and `sourceHandle`/`targetHandle`
handle IDs. The reducer validates edge additions against data type compatibility
and optional cycle checking.

### -> [State Management](stateManagementDoc.md)

Nodes are managed by `mainReducer` via actions like `ADD_NODE`,
`UPDATE_NODE_BY_REACT_FLOW`, and `UPDATE_INPUT_VALUE`. The reducer uses Immer
for immutable updates and delegates to `getCurrentNodesAndEdgesFromState` /
`setCurrentNodesAndEdgesToStateWithMutatingState` for group-aware read/write.

### -> [Node Groups](../features/nodeGroupsDoc.md)

Node types with a `subtree` property are node groups. They contain `groupInput`
and `groupOutput` standard nodes inside their subtree. The
`openedNodeGroupStack` enables navigation into and out of groups, and
`getCurrentNodesAndEdgesFromState` resolves the visible graph level.

### -> [Loops](../features/loopsDoc.md)

Three standard node types (`loopStart`, `loopStop`, `loopEnd`) form loop
triplets connected via `bindLoopNodes` edges. The `loopInfer` data type enables
dynamic handle creation as connections are made. `getLoopStructureFromNode`
traverses from any loop node to find the complete triplet.

### -> [Runner](../runner/runnerHookDoc.md)

The runner system reads node instances from state, classifies them (regular,
loop, group), performs topological sort, and compiles them into execution steps.
Node `id` and `nodeTypeUniqueId` are used to map execution results back to
visual state (`runnerVisualState`, `runnerErrors`, `runnerWarnings` on
`ConfigurableNodeProps`).

### -> [ConfigurableNode UI](../ui/configurableNodeDoc.md)

`ConfigurableNode` is the React component that renders a node instance. It
receives instantiated data as props and renders a header, outputs with source
handles, and inputs with target handles (plus optional interactive input widgets
and collapsible panels). `ConfigurableNodeReactFlowWrapper` bridges ReactFlow's
`NodeProps` to `ConfigurableNode`.

### -> [Context Menu](../ui/contextMenuDoc.md)

`locationInContextMenu` and `priorityInContextMenu` on `TypeOfNode` control
where the node type appears in the "Add Node" context menu. Standard nodes
appear under "Standard Nodes" (priority 200), group nodes under "Group Nodes"
(priority 100), and custom nodes at their specified location or root.

### -> [Import/Export](../importExport/importExportDoc.md)

The `REPLACE_STATE` action allows replacing the entire graph state, used by the
import system. All node type definitions and node instances are
serialized/deserialized as part of the state.
