# ReactFlow (@xyflow/react)

## Overview

ReactFlow (package `@xyflow/react` v12.8.4) is the core graph rendering engine
for react-blender-nodes. It provides the interactive canvas where users place
nodes, draw edges, pan/zoom, and select elements. The library was chosen because
it offers a mature, React-native graph toolkit with first-class support for
custom node/edge renderers, controlled state, and a rich hook API.

This project does **not** use ReactFlow as a black box. Instead, it wraps
ReactFlow's types, intercepts its change events through a central reducer, and
registers fully custom node and edge components. Understanding this integration
layer is essential before touching any graph-related code.

## How This Project Uses ReactFlow

### Custom Node Types

A single custom node type `configurableNode` is registered:

```
src/components/organisms/FullGraph/FullGraphCustomNodesAndEdges.ts
```

```
const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};
```

`ConfigurableNodeReactFlowWrapper` receives `NodeProps<ConfigurableNodeState>`
from ReactFlow, extracts the node `data` and `id`, looks up runner visual state
from `FullGraphContext`, and renders the base `ConfigurableNode`.

All nodes in the graph use this single type. Differentiation between node kinds
(logic gates, loops, groups, etc.) happens inside `ConfigurableNode` via the
node's `data` payload, not via separate ReactFlow node types.

### Custom Edge Types

A single custom edge type `configurableEdge` is registered:

```
const edgeTypes = {
  configurableEdge: ConfigurableEdge,
};
```

`ConfigurableEdge` uses `getBezierPath` to compute the curve, applies a linear
SVG gradient between source and target handle colors (looked up via
`useNodesData`), and renders via `BaseEdge`. It also implements viewport
optimization using `IntersectionObserver` to reduce rendering cost for
off-screen edges.

### Connection Line Component

A custom `ConfigurableConnection` is provided as `connectionLineComponent`. It
uses `useConnection()` to get the source handle, looks up its color via
`useNodesData`, and renders a `BaseEdge` with matching stroke color for visual
feedback during drag-to-connect.

### Viewport Management

The `<ReactFlow>` component runs in **controlled viewport mode**:

```
viewport={state.viewport}
onViewportChange={(viewport) =>
  dispatch({ type: actionTypesMap.SET_VIEWPORT, payload: { viewport } })
}
```

Viewport state is stored in the main reducer alongside nodes and edges. On
initial load, if `state.viewport` is `undefined`, `fitView` is called
automatically:

```
useEffect(() => {
  if (state.viewport === undefined) {
    fitView({ maxZoom: 0.5, minZoom: 0.1 });
  }
}, [state.viewport]);
```

Zoom is constrained to `minZoom={0.1}` and `maxZoom={1}`.

### Event Handling

All ReactFlow events are routed through the central `dispatch`:

| ReactFlow Prop     | Action Dispatched                | Purpose                                         |
| ------------------ | -------------------------------- | ----------------------------------------------- |
| `onNodesChange`    | `UPDATE_NODE_BY_REACT_FLOW`      | Position, selection, dimension changes          |
| `onEdgesChange`    | `UPDATE_EDGES_BY_REACT_FLOW`     | Edge selection and removal                      |
| `onConnect`        | `ADD_EDGE_BY_REACT_FLOW`         | New connection with type-checking + cycle check |
| `onViewportChange` | `SET_VIEWPORT`                   | Zoom, pan updates                               |
| `onBeforeDelete`   | (inline validation, no dispatch) | Validates loop node/edge deletion constraints   |
| `onContextMenu`    | (local state, no dispatch)       | Opens context menu at click position            |
| `onClick`          | (local state, no dispatch)       | Closes context menu                             |

The reducer applies changes one-at-a-time in a loop (not batched) to ensure each
change sees the latest state:

```
for (const nodeChange of nodeChanges) {
  newState = setCurrentNodesAndEdgesToStateWithMutatingState(
    newState,
    applyNodeChanges([nodeChange], getCurrentNodesAndEdgesFromState(newState).nodes),
  );
}
```

### Selection

```
selectNodesOnDrag={true}
elevateNodesOnSelect={true}
elevateEdgesOnSelect={true}
selectionMode={SelectionMode.Partial}
deleteKeyCode={['Backspace', 'Delete', 'x']}
```

`SelectionMode.Partial` means elements only need to partially intersect the
selection box to be selected. The `'x'` key is included alongside
`Backspace`/`Delete` as a delete shortcut.

### Utility Functions Used

| Function            | Import Location                                      | Usage                                                        |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `addEdge`           | `constructAndModifyHandles.ts`                       | Adds edge with ReactFlow's built-in dedup check              |
| `applyEdgeChanges`  | `mainReducer.ts`, `constructAndModifyHandles.ts`     | Applies edge change objects to edge array                    |
| `applyNodeChanges`  | `mainReducer.ts`                                     | Applies node change objects to node array                    |
| `getOutgoers`       | `constructAndModifyHandles.ts`, `loops.ts`           | DFS traversal for cycle detection and loop validation        |
| `getIncomers`       | `loops.ts`                                           | Upstream traversal for loop validation                       |
| `getConnectedEdges` | `newOrRemovedEdgeValidation.ts`                      | Finds all edges connected to a node for type inference reset |
| `getBezierPath`     | `ConfigurableEdge.tsx`, `ConfigurableConnection.tsx` | Computes SVG bezier curve for edge rendering                 |

### Components Used

| Component           | Location                                             | Usage                                      |
| ------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `ReactFlow`         | `FullGraph.tsx`                                      | Main graph canvas                          |
| `ReactFlowProvider` | `FullGraph.tsx`                                      | Context provider wrapping the entire graph |
| `Background`        | `FullGraph.tsx`                                      | Dot-grid background pattern                |
| `Controls`          | `FullGraph.tsx`                                      | Zoom in/out/fit controls                   |
| `MiniMap`           | `FullGraph.tsx`                                      | Minimap with `pannable` enabled            |
| `BaseEdge`          | `ConfigurableEdge.tsx`, `ConfigurableConnection.tsx` | Low-level SVG edge renderer                |
| `Handle`            | `ContextAwareHandle.tsx`                             | Connection point on nodes                  |
| `NodeResizeControl` | `NodeResizerWithMoreControls.tsx`                    | Resize handles for nodes                   |

### Hooks Used

| Hook                 | Location                                              | Usage                                                    |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `useReactFlow`       | `FullGraph.tsx`, `ContextAwareInput.tsx`              | `screenToFlowPosition`, `fitView`                        |
| `useNodeConnections` | `ConfigurableNode.tsx`, `ContextAwareHandle.tsx`      | Check if a handle is connected; enforce `maxConnections` |
| `useNodesData`       | `ConfigurableEdge.tsx`, `ConfigurableConnection.tsx`  | Fetch source/target node data for handle colors          |
| `useStoreApi`        | `ConfigurableEdge.tsx`                                | Access ReactFlow DOM node for IntersectionObserver root  |
| `useConnection`      | `ConfigurableConnection.tsx`                          | Get in-progress connection source handle info            |
| `useNodeId`          | `ContextAwareOpenButton.tsx`, `ContextAwareInput.tsx` | Get current node ID from ReactFlow context               |

## Type Integration

The project wraps ReactFlow's generic types with its own data payloads:

```
ReactFlow Type          Project Wrapper                    Custom Data
---------------------------------------------------------------------------
Node<Data>              ConfigurableNodeReactFlowWrapperProps   ConfigurableNodeState (handles, inputs, outputs, nodeTypeUniqueId)
Edge<Data>              ConfigurableEdgeState                   Edge<{}, 'configurableEdge'>
NodeChange<Node>        NodeChanges<U, N, C, D>                 Parameterized by project generics
EdgeChange<Edge>        EdgeChanges                             EdgeChange<ConfigurableEdgeState>
Connection              (used directly)                         Extracted in ADD_EDGE_BY_REACT_FLOW
Viewport                (used directly)                         Stored in State.viewport
XYPosition              (used directly)                         Node positions, context menu placement
Position                (used directly)                         Handle sides (Left/Right)
```

The `Nodes` type also marks several ReactFlow-internal keys as optional via an
`Optional<T, K>` helper:

```
type NodeOptionalKeys =
  | 'draggable' | 'zIndex' | 'selectable' | 'deletable'
  | 'dragging' | 'selected' | 'isConnectable'
  | 'positionAbsoluteX' | 'positionAbsoluteY';
```

This allows the project to construct nodes without providing values for fields
that ReactFlow manages internally.

## ReactFlowProvider and Context

The component hierarchy is:

```
FullGraph (exported component)
 |
 +-- ReactFlowProvider              <-- Required by @xyflow/react
      |
      +-- FullGraphContext.Provider  <-- Project-specific context (allProps + nodeRunnerStates)
           |
           +-- FullGraphWithReactFlowProvider  <-- Uses useReactFlow() here
                |
                +-- <ReactFlow>
                     |
                     +-- <Controls />
                     +-- <Background />
                     +-- <MiniMap pannable />
```

`ReactFlowProvider` **must** wrap any component that calls `useReactFlow()`,
`useNodeConnections()`, `useNodesData()`, `useStoreApi()`, etc. Since the actual
`<ReactFlow>` component is rendered inside `FullGraphWithReactFlowProvider`, the
provider must be at the `FullGraph` level.

`FullGraphContext` carries the project's own state (`allProps`) and optional
runner visual states (`nodeRunnerStates`). This allows deeply nested custom node
components to access dispatch and state without prop drilling.

## Anti-Patterns and Limitations

### Do Not Bypass the Reducer for State Updates

All node/edge mutations **must** go through `dispatch`. Directly mutating the
arrays passed to `<ReactFlow>` will desynchronize the project state (which
includes type inference, loop validation, group stacks, etc.) from what
ReactFlow renders.

### Handle Registration Timing (reactFlowKey)

When importing a saved graph, new nodes are mounted with new `Handle`
components. ReactFlow registers handles asynchronously during render. If edges
reference handles that haven't registered yet, they fail silently.

The project solves this by incrementing `reactFlowKey` after import, forcing a
full remount:

```
setReactFlowKey((k) => k + 1);
```

This is a necessary workaround. Do not remove the key mechanism without
providing an alternative handle-registration strategy.

### Controlled Viewport Requirements

Because the viewport is controlled (`viewport={state.viewport}`), you **must**
always provide `onViewportChange` to update the stored viewport. Removing either
prop will break zoom/pan or cause the viewport to reset on every render.

### Edge Removal Validation

The reducer does **not** simply apply `applyEdgeChanges` for edge removals. It
intercepts `remove` changes, runs `removeEdgeWithTypeChecking` to reset inferred
types on affected handles, and only applies the removal if validation passes.
Non-remove edge changes (selection, etc.) are applied directly.

### Performance with Many Nodes

`ConfigurableEdge` uses `IntersectionObserver` to detect off-viewport edges and
reduces their opacity. This is a performance optimization, but the observer
setup runs per-edge. For graphs with hundreds of edges, this may become a
bottleneck. The observer uses the ReactFlow DOM node (via
`useStoreApi().getState().domNode`) as the intersection root.

### Conditional Hook Calls in ContextAwareHandle

`ContextAwareHandle` conditionally calls `useNodeConnections` based on
`isCurrentlyInsideReactFlow`. This violates React's rules of hooks but works in
practice because the prop is stable per component instance (a handle is either
always inside ReactFlow or never). Do not make this prop dynamic.

### onBeforeDelete Is Async

The `onBeforeDelete` callback returns a `Promise<boolean>`. Currently it
performs synchronous validation of loop node constraints but is wrapped in
`async`. Returning `false` prevents the deletion entirely -- there is no partial
deletion (i.e., you cannot allow some nodes while blocking others in the same
delete batch).

## Key Patterns

### Custom Node/Edge Type Registration

Node and edge types are defined as static objects outside the component to
prevent unnecessary re-renders:

```
// FullGraphCustomNodesAndEdges.ts (module-level, not inside a component)
const nodeTypes = { configurableNode: ConfigurableNodeReactFlowWrapper };
const edgeTypes = { configurableEdge: ConfigurableEdge };
```

This is a ReactFlow best practice. Defining these inside a component causes
ReactFlow to re-register types on every render.

### Controlled Component Pattern

The project uses ReactFlow in fully controlled mode -- `nodes`, `edges`, and
`viewport` are all passed as props and updated via `dispatch`. This gives the
reducer full authority over state transitions, enabling validation, type
inference, and undo/redo support.

### screenToFlowPosition for Coordinate Transformation

When the user right-clicks to add a node, the mouse event provides screen
coordinates. `screenToFlowPosition` converts these to flow-space coordinates
accounting for the current viewport (zoom + pan):

```
contextMenuPosition: screenToFlowPosition(contextMenu.position)
```

### proOptions.hideAttribution

```
proOptions={{ hideAttribution: true }}
```

Hides the "React Flow" attribution watermark. This is a paid feature in
ReactFlow Pro but is available in the open-source version.

### Dark Color Mode

```
colorMode='dark'
```

ReactFlow applies dark-mode styles to its built-in components (Background,
Controls, MiniMap).

## Relationships with Project Features

### -> [FullGraph (main consumer)](../ui/fullGraphDoc.md)

`FullGraph` is the sole `<ReactFlow>` mount point. All other ReactFlow usage is
either inside custom node/edge components (which render within ReactFlow's tree)
or in utility functions that operate on data arrays.

### -> [ConfigurableNode (custom node type)](../ui/configurableNodeDoc.md)

Rendered by ReactFlow for every node. Receives data via `NodeProps`. Uses
`useNodeConnections` to conditionally show/hide inline inputs based on whether a
handle is connected.

### -> [ConfigurableEdge (custom edge type)](../ui/configurableEdgeDoc.md)

Rendered by ReactFlow for every edge. Uses `getBezierPath` + `BaseEdge` for
rendering, `useNodesData` for handle colors, and `useStoreApi` for viewport
optimization.

### -> [ConfigurableConnection (connection line)](../ui/uiPrimitivesDoc.md)

Rendered during drag-to-connect. Uses `useConnection` for source handle info,
`useNodesData` for color lookup.

### -> [ContextAwareHandle (Handle wrapper)](../ui/configurableNodeDoc.md)

Wraps ReactFlow's `Handle` component with custom shapes, colors, and
`maxConnections` enforcement via `useNodeConnections`.

### -> [State Management (applyNodeChanges, applyEdgeChanges)](../core/stateManagementDoc.md)

The reducer uses `applyNodeChanges` and `applyEdgeChanges` to translate
ReactFlow's change objects into actual array mutations, with interception for
validation on edge removals.

### -> [Edges (addEdge, getOutgoers, getConnectedEdges)](../core/edgesDoc.md)

Edge creation uses `addEdge` for dedup, `getOutgoers` for DFS cycle detection,
and `getConnectedEdges` for finding edges to reset during type inference.

### -> [NodeResizerWithMoreControls](../ui/uiPrimitivesDoc.md)

Wraps `NodeResizeControl` from ReactFlow to provide customizable resize handles
with configurable line positions, handle positions, and directional constraints.
Uses `ResizeControlVariant` from `@xyflow/system`.

### -> [Loops (getOutgoers, getIncomers)](../features/loopsDoc.md)

Loop validation uses `getOutgoers` and `getIncomers` from ReactFlow to traverse
the graph and verify loop structure integrity.

## Complete Import Map

All source files that import from `@xyflow/react` or `@xyflow/system`:

```
File                                                    Imports
---------------------------------------------------------------------------------------------
FullGraph.tsx                                           ReactFlow, Background, Controls,
                                                        MiniMap, SelectionMode, XYPosition,
                                                        ReactFlowProvider, useReactFlow

FullGraph/types.ts                                      NodeChange, EdgeChange
                                                        (+ style.css)

FullGraphContextMenu.tsx                                XYPosition

FullGraph.stories.tsx                                   Position

ConfigurableEdge.tsx                                    BaseEdge, getBezierPath, useNodesData,
                                                        useStoreApi, EdgeProps, Edge

ConfigurableConnection.tsx                              BaseEdge, getBezierPath, useConnection,
                                                        useNodesData,
                                                        ConnectionLineComponentProps

ConfigurableNode.tsx                                    Position, useNodeConnections

ConfigurableNodeReactFlowWrapper.tsx                    NodeProps, Node, XYPosition

ContextAwareHandle.tsx                                  Position, Handle, HandleType,
                                                        useNodeConnections

ContextAwareInput.tsx                                   useReactFlow, useNodeId

ContextAwareOpenButton.tsx                              useNodeId

NodeResizerWithMoreControls.tsx                         NodeResizeControl, ControlLinePosition,
                                                        ControlPosition, NodeResizerProps
                                                        (@xyflow/system: ResizeControlVariant,
                                                         ResizeControlDirection)

mainReducer.ts                                          applyEdgeChanges, applyNodeChanges,
                                                        Connection, XYPosition, Viewport

constructAndModifyHandles.ts                            addEdge, applyEdgeChanges,
                                                        getOutgoers, EdgeChange

newOrRemovedEdgeValidation.ts                           getConnectedEdges

nodes/constructAndModifyNodes.ts                        Position, XYPosition

nodes/loops.ts                                          getOutgoers, getIncomers

createNodeContextMenu.ts                                XYPosition

nodeStateManagement/types.ts                            Viewport
```
