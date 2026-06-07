# Nodes

## Overview

Nodes are the primary building blocks of the graph in `react-blender-nodes`. The
node system operates on two distinct layers:

1. **Node Type Definitions (`TypeOfNode`)** — templates that define a node's
   name, header color, inputs, outputs, context-menu placement, and an optional
   `subtree` (for node groups). These are stored in `State.typeOfNodes` as a
   `Record<NodeTypeUniqueId, TypeOfNode>`.

2. **Node Instances** — ReactFlow `Node` objects whose `data` property contains
   instantiated handles (with generated IDs and resolved data-type info), a
   `nodeTypeUniqueId` reference back to the type definition, and all
   visual/interaction state. These live in `State.nodes` as an array (root
   scope) or in `subtree.nodes` (inside a node group).

A node type definition acts as a blueprint. When a node is added to the graph,
`constructNodeOfType` reads the blueprint, instantiates handles with unique IDs
and resolved data-type colors/shapes, and produces a ReactFlow-compatible node
object placed at the requested position.

**Seven standard node types** are built into the library:

- `groupInput`, `groupOutput` — node-group boundaries,
- `loopStart`, `loopStop`, `loopEnd` — loop triplet,
- `switchStart`, `switchEnd` — switch pair.

They are defined in `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardNodeTypes` and use **six standard data types** (`groupInfer`,
`loopInfer`, `switchInfer`, `condition`, `bindLoopNodes`, `bindSwitchNodes`).

> Note on terminology: this document describes the `TypeOfNode`/`Node` model and
> the construction functions. The dispatch pipeline that actually _adds_ nodes
> (validate → plan → apply) is owned by
> [State Management](stateManagementDoc.md); this doc references it where node
> construction is invoked but does not re-document the reducer internals.

## Entity-Relationship Diagram

```
+---------------------+          +------------------------+
|    State            |          |  TypeOfNode            |
|---------------------|    1:N   |------------------------|
| dataTypes       ----+----+     | name                   |
| typeOfNodes     ----+----+--->| headerColor?           |
| nodes           ----+-+       | inputs[]               |
| edges           ----+-+-+     |   TypeOfInput           |
| openedNodeGroup |   | | |     |   | TypeOfInputPanel    |
|   Stack?        |   | | |     | outputs[]              |
| zones?/zoneIndex|   | | |     |   TypeOfInput           |
+---------------------+ | |     | locationInContextMenu? |
                         | |     | priorityInContextMenu? |
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
                         |       | sourcePosition: Right     |
                         |       | targetPosition: Left      |
                         |       | data:                     |
                         |       |   InstantiatedNodeData    |
                         |       |   .name                   |
                         |       |   .headerColor?           |
                         |       |   .inputs[]               |
                         |       |     ConfigurableNodeInput |
                         |       |     ConfigurableNodeInput |
                         |       |       Panel               |
                         |       |   .outputs[]              |
                         |       |     ConfigurableNodeOutput|
                         |       |   .nodeTypeUniqueId       |
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
                                 | type: 'configurableEdge'  |
                                 +---------------------------+
```

> The instantiated node `data` no longer carries a `showNodeOpenButton` field
> (it was removed). The "open group" / "edit" header buttons are now derived at
> render time from `nodeTypeUniqueId` (see
> [Rendering](#4-rendering-configurablenode)).

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
            applyPlan  (ADD_NODE / ADD_NODE_GROUP / ADD_LOOP / ADD_SWITCH)
                     |   (the only mutator; mints ids; see stateManagementDoc)
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
|   { name:"A",              | ================> | sourcePosition: "right"    |
|     dataType:"numberType", |   generates IDs,  | targetPosition: "left"     |
|     allowInput:true }      |   resolves colors | width: 400                 |
| ]                          |   shape, allowInput| data: {                   |
| outputs: [                 |   maxConnections  |   name: "Math Add",       |
|   { name:"Sum",            |   from allDataTypes|   headerColor: "#C44536",|
|     dataType:"numberType"} |                   |   inputs: [{              |
| ]                          |                   |     id: "rnd20charID",    |
+----------------------------+                   |     name: "A",            |
                                                  |     handleColor: "#E74C3C"|
                                                  |     allowInput: true,     |
                                                  |     type: "number",       |
                                                  |     handleShape: ...,     |
                                                  |     dataType: {           |
                                                  |       dataTypeObject,     |
                                                  |       dataTypeUniqueId }  |
                                                  |   }],                     |
                                                  |   outputs: [{...}],       |
                                                  |   nodeTypeUniqueId:       |
                                                  |     "mathAdd"             |
                                                  | }                         |
                                                  +----------------------------+
                                                             |
                                                             | ReactFlow renders
                                                             v
                                                  +----------------------------+
                                                  | ConfigurableNode-          |
                                                  | ReactFlowWrapper          |
                                                  |   (ErrorBoundary +        |
                                                  |    RunnerContext lookup)  |
                                                  |   -> ConfigurableNode     |
                                                  |     (header, outputs,     |
                                                  |      inputs, handles,     |
                                                  |      panels, resizer,     |
                                                  |      header actions)      |
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
|                                | state.openedNodeGroupStack?         |   |
|  +-----------------------+     | state.viewport?                      |   |
|  | Standard Nodes (7)    |     | state.zones? / zoneIndex?            |   |
|  | (built-in types)      |     +--------+-----------------------------+   |
|  |                       |              |                                 |
|  | groupInput            |              | validate -> plan -> apply       |
|  | groupOutput           |              | (see stateManagementDoc)        |
|  | loopStart             |              |                                 |
|  | loopStop              |     +--------v-----------------------------+   |
|  | loopEnd               |     | Actions that build nodes             |   |
|  | switchStart           |     |                                      |   |
|  | switchEnd             |     | ADD_NODE, ADD_NODE_AND_SELECT,       |   |
|  +-----------------------+     | ADD_NODE_GROUP, ADD_LOOP, ADD_SWITCH |   |
|                                | UPDATE_NODE_TYPE, UPDATE_LOOP,       |   |
|  +-----------------------+     | UPDATE_SWITCH, UPDATE_INPUT_VALUE,   |   |
|  | Construction Fns      |     | OPEN_NODE_GROUP, CLOSE_NODE_GROUP    |   |
|  |                       |     +--------------------------------------+   |
|  | constructNodeOfType   |                                                |
|  | constructInputOr-     |     +--------------------------------------+   |
|  |   OutputOfType        |     | ReactFlow Rendering                  |   |
|  | constructInputPanel-  |     |                                      |   |
|  |   OfType              |     | nodeTypes = {                        |   |
|  | constructTypeOfHandle-|     |   configurableNode:                  |   |
|  |   FromIndices         |     |     ConfigurableNodeReactFlowWrapper |   |
|  +-----------------------+     | }                                    |   |
|                                |                                      |   |
|  +-----------------------+     | ConfigurableNode                    |   |
|  | Navigation / Scope    |     |   RenderInput / RenderOutput        |   |
|  |                       |     |   RenderInputPanel                  |   |
|  | getCurrentNodesAnd-   |     |   ContextAwareHandle                |   |
|  |   EdgesFromState      |     |   ContextAwareInput                  |   |
|  | setCurrentNodesAnd-   |     |   ContextAwareNodeHeaderActions     |   |
|  |   EdgesToState...     |     |   NodeStatusIndicator (runner)      |   |
|  | setCurrentZonesToState|     +--------------------------------------+   |
|  | openedNodeGroupStack  |                                                |
|  +-----------------------+     +--------------------------------------+   |
|                                | Loop / Switch Structure              |   |
|  +-----------------------+     |                                      |   |
|  | Dependency Analysis   |     | getLoopStructureFromNode             |   |
|  |                       |     | getSwitchStructureFromNode           |   |
|  | getDependencyGraph-   |     | (traverse bind edges -> triplet/pair)|   |
|  |   BetweenNodeTypes    |     +--------------------------------------+   |
|  | getDirectDependents/  |                                                |
|  |   Dependencies...     |     +--------------------------------------+   |
|  | getAllDependents/     |     | Runner System                        |   |
|  |   Dependencies-       |     |                                      |   |
|  |   Recursively         |     | Compiles nodes into execution steps  |   |
|  +-----------------------+     | Handles loops, switches, groups      |   |
|                                | Records execution for timeline UI    |   |
|                                +--------------------------------------+   |
+===========================================================================+
```

## Type Definitions

### TypeOfNode

Defined in `src/utils/nodeStateManagement/types.ts` › `TypeOfNode`.

The template for a node type. It is generic over
`<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>`.

| Field                   | Type                                  | Description                                                                            |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| `name`                  | `string`                              | Display name shown in the header bar                                                   |
| `headerColor`           | `string?`                             | CSS color for the header bar                                                           |
| `inputs`                | `(TypeOfInput \| TypeOfInputPanel)[]` | Input handle definitions (may include collapsible panels)                              |
| `outputs`               | `TypeOfInput[]`                       | Output handle definitions (no panel nesting)                                           |
| `locationInContextMenu` | `string[]?`                           | Path in the "Add Node" context menu (e.g., `["Math", "Trig"]`). Omit to place at root. |
| `priorityInContextMenu` | `number?`                             | Ordering priority within a menu level (higher = first). Default: `0`.                  |
| `subtree`               | `object?`                             | If present, this type is a node group (see [subtree](#subtree-for-node-groups)).       |

### TypeOfInput

Defined in `src/utils/nodeStateManagement/types.ts` › `TypeOfInput`.

| Field            | Type               | Description                                                                        |
| ---------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `name`           | `string`           | Display name                                                                       |
| `dataType`       | `DataTypeUniqueId` | References a key in `state.dataTypes`                                              |
| `allowInput`     | `boolean?`         | Whether to show an interactive input widget (overrides the DataType-level setting) |
| `maxConnections` | `number?`          | Connection limit (overrides the DataType-level setting)                            |

### TypeOfInputPanel

Defined in `src/utils/nodeStateManagement/types.ts` › `TypeOfInputPanel`.

| Field    | Type            | Description                                  |
| -------- | --------------- | -------------------------------------------- |
| `name`   | `string`        | Panel display name                           |
| `inputs` | `TypeOfInput[]` | Array of inputs within the collapsible panel |

### InstantiatedNodeData

Defined in `src/utils/nodeStateManagement/nodes/types.ts` ›
`InstantiatedNodeData`.

The runtime `data` of a node instance, defined as
`NonNullable<State['nodes'][number]['data']>`. It contains the instantiated
handles (`inputs`, `outputs`), `name`, optional `headerColor`, and
`nodeTypeUniqueId`. (The sibling type `AllTypesOfNodeData`, same file, is the
union of instantiated node data **or** a raw `TypeOfNode` — used where a
component may render either a live instance or a type-definition preview.)

### ConfigurableNodeInput / ConfigurableNodeOutput

Defined in `src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNodeInput` (input) and
`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNodeOutput`.

A single instantiated handle. Common fields: `id`, `name`, `handleColor?`,
`handleShape?`, `allowInput?`, `maxConnections?`, `dataType?`
(`{ dataTypeObject, dataTypeUniqueId }`), and `inferredDataType?` (set only when
type inference is enabled, the handle's underlying type is
`inferFromConnection`, and it is connected). A discriminated `type` union splits
on the underlying type:

- `type: 'string'` — `value?: string`, `onChange?`, optional `allowedStrings`
  (select dropdown).
- `type: 'number'` — `value?: number`, `onChange?`.
- `type: 'boolean'` — `value?: boolean`, `onChange?`.
- `type: 'unsupportedDirectly'` — `value?: unknown` (used for `complex`,
  `noEquivalent`, and `inferFromConnection` underlying types).

`ConfigurableNodeInputPanel` is `{ id, name, inputs: ConfigurableNodeInput[] }`.

### ConfigurableNodeState

Defined in
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx`
› `ConfigurableNodeState`.

The ReactFlow `Node` type specialized for configurable nodes:
`Node<Omit<ConfigurableNodeProps, 'isCurrentlyInsideReactFlow'>, 'configurableNode'>`.

### ConfigurableNodeProps

Defined in `src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNodeProps`.

Props accepted by the `ConfigurableNode` React component (extends
`HTMLAttributes<HTMLDivElement>`). Key fields beyond what's in
`InstantiatedNodeData`:

| Field                        | Type                                | Description                                                                 |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `id`                         | `string?`                           | Node id (shown in the header when `enableDebugMode` is on)                  |
| `isCurrentlyInsideReactFlow` | `boolean?`                          | Whether running inside ReactFlow (enables handles, resizer, header actions) |
| `nodeResizerProps`           | `NodeResizerWithMoreControlsProps?` | Node resizer configuration                                                  |
| `nodeTypeUniqueId`           | `NodeTypeUniqueId?`                 | Used to detect node groups / loop / switch and derive header actions        |
| `runnerVisualState`          | `NodeVisualState?`                  | Runner execution-state overlay                                              |
| `runnerErrors`               | `ReadonlyArray<GraphError>?`        | Errors from the runner                                                      |
| `runnerWarnings`             | `ReadonlyArray<string>?`            | Warnings from the runner                                                    |

> There is **no** `showNodeOpenButton` prop anymore. Whether the "open group" /
> "edit" buttons render is computed inside `ConfigurableNode` from
> `nodeTypeUniqueId` (subtree presence, `isLoopNode`, `isSwitchNode`).

### Nodes Type

Defined in `src/components/organisms/FullGraph/types.ts` › `Nodes`.

```typescript
type Nodes<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = Optional<
  ConfigurableNodeReactFlowWrapperProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
  NodeOptionalKeys
>[];
```

An array of ReactFlow node objects with some optional keys (`NodeOptionalKeys` =
`draggable`, `zIndex`, `selectable`, `deletable`, `dragging`, `selected`,
`isConnectable`, `positionAbsoluteX`, `positionAbsoluteY`).

## Node Type Definition Structure

### name, headerColor

- `name` is displayed in the node's header bar.
- `headerColor` is an optional CSS color string applied as the `backgroundColor`
  of the header. If omitted, the `ConfigurableNode` component defaults to
  `'#79461D'` (brown). The standard nodes set `headerColor: '#1d1d1d'`.

### inputs and outputs (with panels)

**Inputs** can be either:

- **Regular inputs** (`TypeOfInput`) — a single handle with a name, data-type
  reference, optional `allowInput`, and optional `maxConnections`.
- **Input panels** (`TypeOfInputPanel`) — a collapsible group of inputs.
  Detected at construction time by checking `'inputs' in input`.

**Outputs** are always `TypeOfInput[]` (no panel nesting for outputs).

The `dataType` field on each input/output references a key in `state.dataTypes`.
At construction time the data type's `color`, `shape`, `allowInput`, and
`maxConnections` are resolved and baked into the instantiated handle (with the
input/output-level `allowInput`/`maxConnections` taking precedence via `??`).

### locationInContextMenu, priorityInContextMenu

- `locationInContextMenu` is an array of strings defining the path in the "Add
  Node" context menu. For example, `["Math", "Trig"]` places the node under
  Math > Trig. Omitting it places the node at the root level.
- `priorityInContextMenu` controls ordering within a menu level. Higher values
  appear first. Default `0`. Standard nodes use `200`; group nodes (the
  `groupNodeContextMenu` preset) use `100`.

### subtree (for node groups)

If `subtree` is defined, the `TypeOfNode` represents a **node group**. The
subtree contains:

| Field                | Type                    | Description                                                                                                   |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `nodes`              | `State['nodes']`        | The nodes inside this group                                                                                   |
| `edges`              | `State['edges']`        | The edges inside this group                                                                                   |
| `numberOfReferences` | `number`                | Count of instances of this group in the graph. Editing/deleting the subtree is only allowed when this is `0`. |
| `inputNodeId`        | `string`                | ID of the `groupInput` node inside the subtree (always exactly one; cannot be deleted/duplicated)             |
| `outputNodeId`       | `string`                | ID of the `groupOutput` node inside the subtree (always exactly one; cannot be deleted/duplicated)            |
| `zones`              | `Record<string, Zone>?` | Scope-local zone definitions for loop/switch structures inside this subtree. UI-only — stripped on export.    |
| `zoneIndex`          | `ZoneIndex?`            | Reverse index from boundary handle IDs to zone IDs for this subtree. UI-only — stripped on export.            |

The presence of `subtree` is detected at render time (`hasSubtree`) and adds the
"edit node type" and "open node group" header buttons. There is no longer a
`showNodeOpenButton` flag on the node data.

## Standard Node Types

Defined in `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardNodeTypes`. There are **seven** standard node types alongside **six**
standard data types. All standard node names and data-type names are also
exposed as `*NamesMap` constants (`standardNodeTypeNamesMap`,
`standardDataTypeNamesMap`) for type-safe references.

### Standard Data Types

`src/utils/nodeStateManagement/standardNodes.ts` › `standardDataTypes`.

| Name              | `underlyingType`      | Color     | Extra               | Purpose                                                 |
| ----------------- | --------------------- | --------- | ------------------- | ------------------------------------------------------- |
| `groupInfer`      | `inferFromConnection` | `#333333` | —                   | Group input/output handles; type inferred on connection |
| `loopInfer`       | `inferFromConnection` | `#333333` | —                   | Loop node data handles; type inferred on connection     |
| `switchInfer`     | `inferFromConnection` | `#333333` | —                   | Switch node data handles; type inferred on connection   |
| `condition`       | `boolean`             | `#cca6d6` | `allowInput`        | Loop-stop / switch condition (a boolean input)          |
| `bindLoopNodes`   | `noEquivalent`        | `#8c52d1` | `maxConnections: 1` | Links loop triplet nodes together                       |
| `bindSwitchNodes` | `noEquivalent`        | `#8c52d1` | `maxConnections: 1` | Links switch pair nodes together                        |

### Standard Node Types

`src/utils/nodeStateManagement/standardNodes.ts` › `standardNodeTypes`. All
standard node types have `headerColor: '#1d1d1d'` and use the
`standardNodeContextMenu` preset (`locationInContextMenu: ['Standard Nodes']`,
`priorityInContextMenu: 200`). They are, however, **hidden** from the "Add Node"
menu by default via `standardHiddenNodeTypesInContextMenu` (see below), so end
users add loops/switches/groups through dedicated commands rather than by name.

| Name          | Inputs (in order)                                                           | Outputs (in order)                                                       | Purpose                                                                                        |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `groupInput`  | none                                                                        | `groupInfer` (unnamed)                                                   | Entry point inside a node-group subtree. Outputs data flowing into the group.                  |
| `groupOutput` | `groupInfer` (unnamed)                                                      | none                                                                     | Exit point inside a node-group subtree. Collects data flowing out of the group.                |
| `loopStart`   | `loopInfer` (unnamed)                                                       | `bindLoopNodes` ("Bind Loop Nodes"), `loopInfer` (unnamed)               | Beginning of a loop. Receives initial data; outputs a bind handle to link with stop/end.       |
| `loopStop`    | `bindLoopNodes`, `condition` ("Continue If Condition Is True"), `loopInfer` | `bindLoopNodes` ("Bind Loop Nodes"), `loopInfer` (unnamed)               | Evaluates the loop's continue condition. Sits between `loopStart` and `loopEnd`.               |
| `loopEnd`     | `bindLoopNodes` ("Bind Loop Nodes"), `loopInfer` (unnamed)                  | `loopInfer` (unnamed)                                                    | End of a loop. Outputs the final loop result.                                                  |
| `switchStart` | `switchInfer` (unnamed), `condition` ("Condition")                          | `bindSwitchNodes` ("Bind Switch Nodes"), `switchInfer` ×2 (true / false) | Beginning of a switch. Routes data down the true or false branch based on a boolean condition. |
| `switchEnd`   | `bindSwitchNodes` ("Bind Switch Nodes"), `switchInfer` ×2 (true / false)    | `switchInfer` (unnamed)                                                  | End of a switch. Merges the branch outputs back into a single value.                           |

> The `loopStart`, `loopEnd`, `loopStop` ordering in the source array (and in
> the exported handle-index constants) is intentional; they still form one
> logical triplet (start → stop → end) at runtime.

The export also includes named handle-index constants for the inference handles
of each loop/switch node, e.g. `loopStartOutputInferHandleIndex`,
`loopStopInputInferHandleIndex`, `switchStartOutputInferTrueHandleIndex`,
`switchEndInputInferFalseHandleIndex`, etc.
(`src/utils/nodeStateManagement/standardNodes.ts` ›
`switchStartInputInferHandleIndex`).

### Hidden standard nodes and count constraints

- `standardHiddenNodeTypesInContextMenu`
  (`src/utils/nodeStateManagement/standardNodes.ts` ›
  `standardHiddenNodeTypesInContextMenu`) marks all seven standard node types as
  hidden so they don't appear directly in the "Add Node" menu. Feed this into
  `State.hiddenNodeTypesInContextMenu`.
- `standardNodeCountConstraints`
  (`src/utils/nodeStateManagement/standardNodes.ts` ›
  `standardNodeCountConstraints`) pins `groupInput`/`groupOutput` to exactly one
  per node group (`minWithinANodeGroup: 1`, `maxWithinANodeGroup: 1`) and
  forbids them at root (`minInRoot: 0`, `maxInRoot: 0`). Feed this into
  `State.nodeCountConstraints`.

### Loop Triplet Structure

Loop nodes form a **triplet** bound together by `bindLoopNodes` edges (max 1
connection each). `getLoopStructureFromNode`
(`src/utils/nodeStateManagement/nodes/loops/loopStructure.ts` ›
`getLoopStructureFromNode`) traverses from any loop node to find the complete
`LoopStructure` (`{ loopStart, loopStop, loopEnd }`,
`src/utils/nodeStateManagement/nodes/loops/types.ts` › `LoopStructure`).

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

### Switch Pair Structure

Switch nodes form a **pair** bound together by a `bindSwitchNodes` edge (max 1
connection). `getSwitchStructureFromNode`
(`src/utils/nodeStateManagement/nodes/switches/switchStructure.ts` ›
`getSwitchStructureFromNode`) traverses from either node to find the complete
`SwitchStructure` (`{ switchStart, switchEnd }`,
`src/utils/nodeStateManagement/nodes/switches/types.ts` › `SwitchStructure`).
`switchStart` takes a value plus a boolean `condition` and emits a true-branch
and a false-branch handle; `switchEnd` takes both branches back and emits a
single merged value.

```
                                bindSwitchNodes
  +--------------+  ============================================>  +------------+
  | Switch Start |                                                 | Switch End |
  |              |  --- switchInfer (true)  -----> ... ----------> |            |
  |              |  --- switchInfer (false) -----> ... ----------> |            |
  +--------------+                                                 +------------+
     |        |                                                          |
 switchInfer  condition in                                          switchInfer out
   in (value) (boolean)                                             (merged result)
```

## Node Lifecycle

### 1. Type Definition (TypeOfNode)

A node type is defined with `makeTypeOfNodeWithAutoInfer()` for type safety,
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

When a node is added (via the `ADD_NODE` / `ADD_NODE_AND_SELECT` actions, or the
loop/switch/group builders), `applyPlan` mints a 20-character id and calls
`constructNodeOfType`. It:

1. Reads the `TypeOfNode` definition from `typeOfNodes[nodeType]`.
2. Iterates over `inputs`, calling `constructInputPanelOfType` when
   `'inputs' in input` (a panel) or `constructInputOrOutputOfType` otherwise.
3. For each handle, resolves the data type from `allDataTypes`, generates a
   unique 20-character ID, and extracts `color`, `shape`, `allowInput`, and
   `maxConnections` (handle-level overriding data-type-level).
4. Iterates over `outputs`, calling `constructInputOrOutputOfType` for each.
5. Returns a ReactFlow node object with `type: 'configurableNode'`,
   `width: 400`, `sourcePosition: Position.Right`,
   `targetPosition: Position.Left`, and the `data` payload
   `{ name, headerColor, inputs, outputs, nodeTypeUniqueId }`.

### 3. Placement in State

`applyPlan`'s `ADD_NODE` case
(`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`) appends
the constructed node to the **current scope** (root or the open subtree),
resolved via `getCurrentNodesAndEdgesFromState`:

```typescript
case 'ADD_NODE': {
  const newNodeId = generateRandomString(lengthOfIds);
  const newNode = constructNodeOfType(
    draft.dataTypes,
    plan.nodeType as NodeTypeUniqueId,
    draft.typeOfNodes,
    newNodeId,
    plan.position,
  );
  const currentView = getCurrentNodesAndEdgesFromState(draft);
  let updatedNodes = [...currentView.nodes, newNode];
  if (plan.selectExclusively) {
    // deselect all others, select the new node
  }
  // ... write back via setCurrentNodesAndEdgesToStateWithMutatingState
}
```

`ADD_NODE` and `ADD_NODE_AND_SELECT` collapse to a single `ADD_NODE` plan; the
latter sets `selectExclusively: true`. (Both `ADD_NODE` and
`constructNodeOfType` are documented end-to-end in
[State Management](stateManagementDoc.md).)

### 4. Rendering (ConfigurableNode)

ReactFlow uses the registered `nodeTypes` map:

```typescript
const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};
```

`ConfigurableNodeReactFlowWrapper`
(`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx`
› `ConfigurableNodeReactFlowWrapper`) receives ReactFlow `NodeProps`, looks up
this node's runner state from `RunnerContext`, and renders `ConfigurableNode`
inside an `ErrorBoundary` with `isCurrentlyInsideReactFlow={true}`, passing
`runnerVisualState`/`runnerErrors`/ `runnerWarnings`.

`ConfigurableNode`
(`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNode`) renders:

- A colored header bar with the node name (plus the node id when
  `enableDebugMode` is true) and a `ContextAwareNodeHeaderActions` group.
- Outputs section with `RenderOutput` components (right-aligned source handles).
- Inputs section with either `RenderInput` (single handles with optional
  interactive widgets) or `RenderInputPanel` (collapsible groups).
- A `NodeResizerWithMoreControls` (only when inside ReactFlow).
- A `NodeStatusIndicator` overlay when `runnerVisualState` is provided.

**Header actions** are derived from `nodeTypeUniqueId`
(`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNode`):

- `isLoopNode(nodeTypeUniqueId)` → an "edit loop" pencil that dispatches
  `OPEN_DRAWER` with `activeDrawer: { type: 'editLoop', nodeId }`.
- `isSwitchNode(nodeTypeUniqueId)` → an "edit switch" pencil that dispatches
  `OPEN_DRAWER` with `{ type: 'editSwitch', nodeId }`.
- `hasSubtree` (the type definition has a `subtree`) → an "edit node type"
  pencil (`OPEN_DRAWER` with `{ type: 'editNodeType', nodeTypeId }`) **and** an
  "open node group" button (`OPEN_NODE_GROUP` with `{ nodeId }`).

When inside ReactFlow, handles are active and a connected input's interactive
widget is hidden.

### 5. Connection (Edges)

Edges reference node IDs and handle IDs. When a connection is made
(`ADD_EDGE_BY_REACT_FLOW`), the validator runs the 13-step `validateAddEdge`
gauntlet (cycle check, duplicate check, loop/switch validation, type inference
projection, complex-type and conversion checks) and `applyPlan` mints the edge
id. Type inference may trigger handle duplication on group input/output and on
loop/switch nodes. See [Edges](edgesDoc.md) and
[Type Inference](typeInferenceDoc.md).

### 6. Execution (Runner)

The runner compiles node instances into execution steps. It classifies nodes by
type (regular, loop start/stop/end, switch start/end, group input/output) and
generates appropriate steps. Node `id` and `nodeTypeUniqueId` map execution
results back to per-node visual state. See the
[Runner documentation](../runner/runnerHookDoc.md).

## Node Navigation (openedNodeGroupStack)

The `openedNodeGroupStack` in `State` is an array that tracks which node group
the user has navigated into. It supports nested navigation (group within group).

### getCurrentNodesAndEdgesFromState

Defined in `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`getCurrentNodesAndEdgesFromState`.

Resolves which nodes, edges, and zones are currently visible:

1. Reads the **top** of `openedNodeGroupStack` (the last element).
2. If the stack is empty/undefined, returns root `state.nodes`, `state.edges`,
   `state.zones`, `state.zoneIndex`.
3. If a group is open, reads `state.typeOfNodes[topGroup.nodeType].subtree` and
   returns its `nodes`, `edges`, `inputNodeId`, `outputNodeId`, `zones`,
   `zoneIndex`.
4. If the subtree is missing (shouldn't happen), falls back to root scope.

```
openedNodeGroupStack = []
  -> state.nodes, state.edges, state.zones, state.zoneIndex (root graph)

openedNodeGroupStack = [{ nodeType: "myGroup", ... }]
  -> typeOfNodes["myGroup"].subtree.{nodes,edges,zones,zoneIndex}

openedNodeGroupStack = [{ ...outerGroup }, { ...innerGroup }]
  -> typeOfNodes["innerGroup"].subtree.{nodes,edges,zones,zoneIndex}
```

### setCurrentNodesAndEdgesToStateWithMutatingState

Defined in `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`setCurrentNodesAndEdgesToStateWithMutatingState`. The write counterpart.
Updates either root-level or subtree nodes/edges depending on the stack.
Crucially, a subtree is only written when `numberOfReferences === 0`; if the
group has live instances, the write **falls back to the root scope** (the shared
definition is read-only).

### setCurrentZonesToState

Defined in `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`setCurrentZonesToState`. The zone counterpart of the writer above: writes
`zones` / `zoneIndex` to the open subtree, or to the root scope when no group is
open. Zones are UI-only metadata for loop/switch frames (see
[State Management](stateManagementDoc.md)).

### OPEN_NODE_GROUP / CLOSE_NODE_GROUP Actions

- **OPEN_NODE_GROUP with `nodeId`** (instance opening): finds the node, verifies
  it has a subtree, and **appends** `{ nodeType, nodeId, previousViewport }` to
  the stack.
- **OPEN_NODE_GROUP with `nodeType`** (original opening): **resets** the stack
  to a single `{ nodeType, previousViewport }`. Used when editing the type
  definition directly.
- In **both** cases `applyPlan` then clears the current viewport
  (`draft.viewport = undefined`) so `FullGraph` re-centers on the newly opened
  scope; the prior viewport is preserved in the stack entry's `previousViewport`
  and restored on `CLOSE_NODE_GROUP`.
- **CLOSE_NODE_GROUP**: restores the `previousViewport` from the top entry, then
  pops the stack.

## Node Construction Details

### constructNodeOfType

Defined in `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`constructNodeOfType`.

Parameters (in order): `allDataTypes` (the `state.dataTypes` record), `nodeType`
(the `NodeTypeUniqueId`), `typeOfNodes` (the `state.typeOfNodes` record),
`nodeId` (pre-generated unique ID), `position` (`XYPosition`).

Returns a complete ReactFlow node object. Key behaviors:

- IDs are 20-character random strings (`generateRandomString`,
  `lengthOfIds = 20`).
- `type` is always `'configurableNode'`; `width` is `400`.
- `sourcePosition` is `Position.Right`; `targetPosition` is `Position.Left`.
- `data` is `{ name, headerColor, inputs, outputs, nodeTypeUniqueId }`.

### constructInputOrOutputOfType

Defined in `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`constructInputOrOutputOfType`.

Creates a single handle instance. Resolves the data type from `allDataTypes`,
computes the effective `allowInput`/`maxConnections`
(`input-level ?? dataType-level`), and branches on `underlyingType`:

- `'number'` → `type: 'number'`
- `'string'` → `type: 'string'` (carries `allowedStrings` if the data type sets
  it)
- `'boolean'` → `type: 'boolean'`
- everything else (`complex`, `noEquivalent`, `inferFromConnection`) →
  `type: 'unsupportedDirectly'`

Each handle gets: `id`, `name`, `handleColor`, `allowInput`, `maxConnections`,
`type`, `handleShape`, and `dataType` (`{ dataTypeObject, dataTypeUniqueId }`).

### constructInputPanelOfType

Defined in `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`constructInputPanelOfType`. Creates a panel instance with its own 20-character
ID and an array of constructed inputs.

### constructTypeOfHandleFromIndices

Defined in `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`constructTypeOfHandleFromIndices`. Constructs a handle from index-based
references (used internally for handle duplication during type inference).
Supports regular inputs, inputs within panels, and outputs via `HandleIndices`
(`{ type, index1, index2? }`).

## Node Type Dependency Analysis

The codebase provides utilities for analyzing dependencies between node types
based on their subtrees
(`src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`getDependencyGraphBetweenNodeTypes`):

- **`getDependencyGraphBetweenNodeTypes`** — builds the full graph by examining
  which node types appear inside each type's subtree; returns both
  `nodeToNodeDependents` and `nodeToNodeDependencies` maps
  (`Partial<Record<N, Set<N>>>`).
- **`getDirectDependentsOfNodeType`** — node types whose subtrees contain the
  given type (excludes self).
- **`getDirectDependenciesOfNodeType`** — node types that the given type's
  subtree contains (excludes self).
- **`getAllDependentsOfNodeTypeRecursively`** — BFS over all transitive
  dependents (includes self).
- **`getAllDependenciesOfNodeTypeRecursively`** — BFS over all transitive
  dependencies (includes self).

These power recursion checking (`enableRecursionChecking`) to prevent circular
group nesting. Each "direct"/"all" helper accepts either a `{ typeOfNodes }`
slice (it builds the graph internally) or a precomputed dependents/dependencies
map.

## Limitations and Notes

- **`showNodeOpenButton` removed**: node `data` no longer carries this flag; the
  open/edit buttons are computed at render time from `nodeTypeUniqueId`.
- **Fixed node width**: all nodes are constructed with `width: 400`. Runtime
  resizing is available via `NodeResizerWithMoreControls`.
- **Panel-only inputs**: only inputs support panels; outputs are always flat
  arrays.
- **Subtree editing restriction**: a node group's subtree can only be edited
  when `numberOfReferences === 0`, enforced in
  `setCurrentNodesAndEdgesToStateWithMutatingState` (and
  `setCurrentZonesToState`).
- **No runtime value type-checking**: the type system validates _connections_,
  not handle _values_ (complex types may additionally be schema-checked when
  `enableComplexTypeChecking` is enabled).

## Examples

### Defining a Custom Node Type

```typescript
import {
  makeTypeOfNodeWithAutoInfer,
  makeDataTypeWithAutoInfer,
} from 'react-blender-nodes';

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

const typeOfNodes = {
  formatNumber: makeTypeOfNodeWithAutoInfer({
    name: 'Format Number',
    headerColor: '#2D5A87',
    inputs: [
      { name: 'Value', dataType: 'numberType', allowInput: true },
      {
        // A collapsible input panel
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

### Hiding standard nodes and constraining counts

```typescript
import {
  makeStateWithAutoInfer,
  standardNodeTypes,
  standardDataTypes,
  standardHiddenNodeTypesInContextMenu,
  standardNodeCountConstraints,
} from 'react-blender-nodes';

const initialState = makeStateWithAutoInfer({
  dataTypes: { ...standardDataTypes /*, ...your data types */ },
  typeOfNodes: { ...standardNodeTypes /*, ...your node types */ },
  nodes: [],
  edges: [],
  // keep the 7 standard nodes out of the "Add Node" menu
  hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
  // pin exactly one groupInput/groupOutput per node group, none at root
  nodeCountConstraints: standardNodeCountConstraints,
});
```

### Using makeTypeOfNodeWithAutoInfer

`makeTypeOfNodeWithAutoInfer` is an identity function that provides TypeScript
inference. With it, TypeScript ensures every `dataType` reference matches a real
`DataTypeUniqueId`:

```typescript
// TypeScript validates 'numberType' / rejects 'invalidType'
const node = makeTypeOfNodeWithAutoInfer<'numberType' | 'stringType'>({
  name: 'Example',
  inputs: [{ name: 'A', dataType: 'numberType' }], // OK
  outputs: [{ name: 'B', dataType: 'invalidType' }], // TYPE ERROR
});
```

### Constructing a node directly

```typescript
import { constructNodeOfType } from 'react-blender-nodes';

const node = constructNodeOfType(
  dataTypes,
  'formatNumber',
  typeOfNodes,
  'pre-generated-20-char-id',
  { x: 100, y: 100 },
);
// node.type === 'configurableNode', node.width === 400,
// node.data.inputs/outputs are instantiated handles with generated ids.
```

## Relationships with Other Features

### -> [Data Types](dataTypesDoc.md)

Node type definitions reference `DataTypeUniqueId` keys in their inputs and
outputs. At construction time the data type's `color`, `shape`,
`underlyingType`, `allowInput`, and `maxConnections` are resolved and embedded
into each instantiated handle.

### -> [Handles](handlesDoc.md)

Each input/output on a node instance is an instantiated handle
(`ConfigurableNodeInput` / `ConfigurableNodeOutput`) with a unique ID, resolved
visual properties, and `dataType` info. `HandleIndices` address handles by
position (used by `constructTypeOfHandleFromIndices` during inference
duplication). Handles are what edges connect to.

### -> [Edges](edgesDoc.md)

Edges reference `source`/`target` node IDs and `sourceHandle`/`targetHandle`
handle IDs (and carry `type: 'configurableEdge'`). Edge additions run the
13-step `validateAddEdge` gauntlet before `applyPlan` mints the edge id.

### -> [State Management](stateManagementDoc.md)

Nodes are built and placed through the validate → plan → apply pipeline:
`ADD_NODE`/`ADD_NODE_AND_SELECT` (and `ADD_NODE_GROUP`/`ADD_LOOP`/`ADD_SWITCH`)
call `constructNodeOfType` from inside `applyPlan`, the only mutator.
`UPDATE_NODE_TYPE` reconstructs all instances of a type. `UPDATE_INPUT_VALUE`
writes a handle's `value`. Scope-aware read/write goes through
`getCurrentNodesAndEdgesFromState` /
`setCurrentNodesAndEdgesToStateWithMutatingState` / `setCurrentZonesToState`.

### -> [Node Groups](../features/nodeGroupsDoc.md)

Node types with a `subtree` are node groups; the subtree always contains exactly
one `groupInput` and one `groupOutput`. `openedNodeGroupStack` enables
navigation in/out, and `getCurrentNodesAndEdgesFromState` resolves the visible
level.

### -> [Loops](../features/loopsDoc.md)

`loopStart`/`loopStop`/`loopEnd` form loop triplets connected by `bindLoopNodes`
edges; the `loopInfer` data type enables dynamic handle creation as connections
are made. `getLoopStructureFromNode` returns the complete triplet.

### -> [Connection Validation](../features/connectionValidationDoc.md)

`switchStart`/`switchEnd` form switch pairs connected by a `bindSwitchNodes`
edge, with true/false `switchInfer` branches and a boolean `condition`.
`isLoopConnectionValid` / `isSwitchConnectionValid` (called within
`validateAddEdge`) enforce the loop/switch wiring rules;
`getSwitchStructureFromNode` returns the complete pair.

### -> [Type Inference](typeInferenceDoc.md)

Handles whose underlying type is `inferFromConnection` (`groupInfer`,
`loopInfer`, `switchInfer`) adopt connected types when `enableTypeInference` is
on, populating the handle's `inferredDataType`. Inference also duplicates
boundary/loop/switch handles as connections are added.

### -> [Runner](../runner/runnerHookDoc.md)

The runner reads node instances, classifies them (regular / loop / switch /
group), performs topological sort, and compiles execution steps. Node `id` and
`nodeTypeUniqueId` map execution results to visual state
(`runnerVisualState`/`runnerErrors`/`runnerWarnings` on
`ConfigurableNodeProps`).

### -> [ConfigurableNode UI](../ui/configurableNodeDoc.md)

`ConfigurableNode` renders a node instance: a header (name, optional debug id,
`ContextAwareNodeHeaderActions`), outputs with source handles, and inputs with
target handles plus optional interactive widgets and collapsible panels.
`ConfigurableNodeReactFlowWrapper` bridges ReactFlow's `NodeProps` to
`ConfigurableNode` (inside an `ErrorBoundary`, with runner state from
`RunnerContext`).

### -> [Context Menu](../ui/contextMenuDoc.md)

`locationInContextMenu` and `priorityInContextMenu` control where a node type
appears in the "Add Node" menu. The seven standard node types are hidden by
default (`standardHiddenNodeTypesInContextMenu`); loops, switches, and groups
are added via dedicated commands rather than by name.

### -> [Import/Export](../importExport/importExportDoc.md)

The `REPLACE_STATE` action replaces the entire graph state during import. All
node type definitions and node instances are serialized/deserialized; UI-only
fields (`zones`, `zoneIndex`, `activeDrawer`, `history`) are stripped on export
and zones are rehydrated on import.
