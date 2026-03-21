# State Management

## Overview

The state management system is the central orchestrator of all graph data in
`react-blender-nodes`. It owns the canonical representation of every data type,
node type, node instance, edge, viewport, and feature flag. All mutations flow
through a single Immer-based reducer (`mainReducer`), giving consumers a
predictable, immutable update model while allowing ergonomic "mutating" syntax
inside the reducer body.

Key participants:

| Participant              | Location                                               | Role                                               |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| `State<D,N,U,C>`         | `src/utils/nodeStateManagement/types.ts`               | Complete graph state type                          |
| `mainReducer`            | `src/utils/nodeStateManagement/mainReducer.ts`         | Immer `produce()`-based reducer                    |
| `Action`                 | same file                                              | Discriminated union of all action payloads         |
| `actionTypesMap`         | same file                                              | String-constant map for type-safe dispatch         |
| `useFullGraph`           | `src/components/organisms/FullGraph/FullGraphState.ts` | `useReducer` wrapper returning `{state, dispatch}` |
| `FullGraphContext`       | same file                                              | React context distributing `state` + `dispatch`    |
| `createContextValue`     | same file                                              | Variance bridge for generic dispatch               |
| `makeStateWithAutoInfer` | `types.ts`                                             | Helper for type-safe state construction            |

---

## Entity-Relationship Diagram

```
+--------------------------------------------------------------------+
|                            State<D,N,U,C>                          |
+--------------------------------------------------------------------+
|                                                                    |
|  dataTypes ─────────────> Record<D, DataType<U,C>>                 |
|                              |                                     |
|  typeOfNodes ───────────> Record<N, TypeOfNode<D,N,U,C>>           |
|                              |                                     |
|                              +---> subtree? ──> { nodes, edges,    |
|                              |       numberOfReferences,           |
|                              |       inputNodeId, outputNodeId }   |
|                              |                                     |
|  nodes ─────────────────> Nodes[]  (ReactFlow Node instances)      |
|                              |                                     |
|  edges ─────────────────> Edges[]  (ReactFlow Edge instances)      |
|                                                                    |
|  openedNodeGroupStack? ─> Array<{nodeType, nodeId?, prevViewport}>|
|                                                                    |
|  viewport? ─────────────> { x, y, zoom }                          |
|                                                                    |
|  allowedConversionsBetweenDataTypes? ──> Partial<Record<D,...>>    |
|  allowConversionBetweenComplexTypes...? ──> boolean                |
|                                                                    |
|  enableTypeInference? ──────────> boolean                          |
|  enableComplexTypeChecking? ────> boolean                          |
|  enableCycleChecking? ──────────> boolean                          |
|  enableRecursionChecking? ──────> boolean                          |
|  enableDebugMode? ──────────────> boolean                          |
+--------------------------------------------------------------------+
```

---

## Functional Dependency Diagram

```
makeDataTypeWithAutoInfer()  ─┐
makeTypeOfNodeWithAutoInfer() ─┤
                               v
                    makeStateWithAutoInfer()
                               |
                               v
                         initialState
                               |
                               v
                    useFullGraph(initialState)
                       |              |
                       v              v
                    state          dispatch
                       |              |
                       v              v
                 FullGraphContext ──> FullGraph component tree
                       |
                       v
          getCurrentNodesAndEdgesFromState()
                       |
                       v
             ReactFlow nodes & edges
```

---

## Data Flow Diagram

```
  User Interaction (click, drag, connect, right-click menu)
         |
         v
  dispatch(action: Action)
         |
         v
  mainReducer(oldState, action)
         |
         v
  produce(oldState, draft => { ... })       <── Immer
         |                                        |
         |   switch(action.type)                  |
         |     ADD_NODE                           |
         |     ADD_NODE_AND_SELECT                |
         |     UPDATE_NODE_BY_REACT_FLOW          |
         |     UPDATE_EDGES_BY_REACT_FLOW         |
         |     ADD_EDGE_BY_REACT_FLOW             |
         |     UPDATE_INPUT_VALUE                 |
         |     OPEN_NODE_GROUP                    |
         |     CLOSE_NODE_GROUP                   |
         |     ADD_NODE_GROUP                     |
         |     SET_VIEWPORT                       |
         |     REPLACE_STATE                      |
         |                                        |
         v                                        v
  New immutable State                      Structural sharing
         |
         v
  React re-render (useReducer triggers)
         |
         v
  getCurrentNodesAndEdgesFromState(state)
         |           |
         |     (if openedNodeGroupStack)
         |           |
         |           v
         |    subtree.nodes / subtree.edges
         v
  ReactFlow <nodes={...} edges={...} />
```

---

## System Diagram

```
+─────────────────────────────────────────────────────────────────+
|                        FullGraph Component                      |
|                                                                 |
|  +──────────────────────────────────────────────────────────+   |
|  |  ReactFlowProvider                                       |   |
|  |                                                          |   |
|  |  FullGraphContext.Provider                                |   |
|  |    value = createContextValue({state, dispatch},         |   |
|  |                                nodeRunnerStates?)        |   |
|  |                                                          |   |
|  |  +────────────────────────────────────────────────────+  |   |
|  |  |  FullGraphWithReactFlowProvider                    |  |   |
|  |  |                                                    |  |   |
|  |  |  +──────────────────────────────────────────────+  |  |   |
|  |  |  | RunnerOverlay (if functionImplementations)   |  |  |   |
|  |  |  |   useNodeRunner() -> nodeRunnerStates        |  |  |   |
|  |  |  |   Nested FullGraphContext.Provider            |  |  |   |
|  |  |  |   NodeRunnerPanel                            |  |  |   |
|  |  |  +──────────────────────────────────────────────+  |  |   |
|  |  |                                                    |  |   |
|  |  |  ReactFlow                                         |  |   |
|  |  |    onNodesChange -> dispatch(UPDATE_NODE_BY_RF)    |  |   |
|  |  |    onEdgesChange -> dispatch(UPDATE_EDGES_BY_RF)   |  |   |
|  |  |    onConnect     -> dispatch(ADD_EDGE_BY_RF)       |  |   |
|  |  |    onViewportChange -> dispatch(SET_VIEWPORT)      |  |   |
|  |  |                                                    |  |   |
|  |  |  FullGraphContextMenu                              |  |   |
|  |  |    -> dispatch(ADD_NODE_AND_SELECT)                 |  |   |
|  |  |                                                    |  |   |
|  |  |  FullGraphNodeGroupSelector                        |  |   |
|  |  |    -> dispatch(OPEN_NODE_GROUP)                     |  |   |
|  |  |    -> dispatch(CLOSE_NODE_GROUP)                    |  |   |
|  |  |    -> dispatch(ADD_NODE_GROUP)                      |  |   |
|  |  +────────────────────────────────────────────────────+  |   |
|  +──────────────────────────────────────────────────────────+   |
+─────────────────────────────────────────────────────────────────+

External helpers called by mainReducer:
  constructNodeOfType()                  -> builds node from type def
  getCurrentNodesAndEdgesFromState()     -> resolves group stack
  setCurrentNodesAndEdgesToStateMut...() -> writes back to correct level
  addEdgeWithTypeChecking()              -> validates + adds edge
  removeEdgeWithTypeChecking()           -> validates + removes edge
  willAddingEdgeCreateCycle()            -> DFS cycle detection
  applyNodeChanges() / applyEdgeChanges()-> ReactFlow utilities
```

---

## The State Type

Defined in `src/utils/nodeStateManagement/types.ts:348-466`. The `State` type is
generic over four type parameters:

| Parameter           | Constraint                         | Purpose                                                                                     |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `DataTypeUniqueId`  | `extends string`                   | String-literal keys of the `dataTypes` record                                               |
| `NodeTypeUniqueId`  | `extends string`                   | String-literal keys of the `typeOfNodes` record                                             |
| `UnderlyingType`    | `extends SupportedUnderlyingTypes` | `'string' \| 'number' \| 'boolean' \| 'complex' \| 'noEquivalent' \| 'inferFromConnection'` |
| `ComplexSchemaType` | conditional on `UnderlyingType`    | Zod schema when underlying type is `'complex'`                                              |

### Fields

#### `dataTypes` (required)

```ts
dataTypes: Record<
  DataTypeUniqueId,
  DataType<UnderlyingType, ComplexSchemaType>
>;
```

Map of all data type definitions. Each `DataType` contains:

- `name: string` - Display name
- `underlyingType` - One of the supported underlying types
- `complexSchema` - Zod schema (only for `'complex'` underlying type)
- `color: string` - Color for visual representation (handle color)
- `shape?: HandleShape` - Optional handle shape override
- `allowInput?: boolean` - Whether inputs of this type allow direct user entry
- `maxConnections?: number` - Maximum simultaneous connections

#### `typeOfNodes` (required)

```ts
typeOfNodes: Record<NodeTypeUniqueId, TypeOfNode<D, N, U, C>>;
```

Map of all node type definitions. Each `TypeOfNode` contains:

- `name: string` - Display name
- `headerColor?: string` - Color for the node header
- `inputs: (TypeOfInput | TypeOfInputPanel)[]` - Array of inputs (may include
  panels)
- `outputs: TypeOfInput[]` - Array of outputs
- `locationInContextMenu?: string[]` - Path in the "Add Node" context menu (e.g.
  `["Math", "Trig"]`)
- `priorityInContextMenu?: number` - Ordering priority (higher = first,
  default: 0)
- `subtree?` - If present, this is a **node group** containing:
  - `nodes` / `edges` - The group's internal graph
  - `numberOfReferences: number` - Instance count (editable only when 0)
  - `inputNodeId: string` / `outputNodeId: string` - Interface node IDs

#### `nodes` (required)

```ts
nodes: Nodes<
  UnderlyingType,
  NodeTypeUniqueId,
  ComplexSchemaType,
  DataTypeUniqueId
>;
```

Array of ReactFlow node instances currently in the graph. Each node's `data`
property contains `inputs`, `outputs`, `name`, `headerColor`,
`nodeTypeUniqueId`, and `showNodeOpenButton`.

#### `edges` (required)

```ts
edges: Edges;
```

Array of ReactFlow edge instances. Each edge has `id`, `source`, `target`,
`sourceHandle`, `targetHandle`, and `type: 'configurableEdge'`.

#### `openedNodeGroupStack?` (optional)

```ts
openedNodeGroupStack?: ({
  nodeType: NodeTypeUniqueId;
  previousViewport?: Viewport;
} | {
  nodeType: NodeTypeUniqueId;
  nodeId: string;
  previousViewport?: Viewport;
})[]
```

Stack tracking nested navigation into node groups. Two variants:

1. **Original opening** (no `nodeId`) - Editing the node group type definition
   directly.
2. **Instance opening** (with `nodeId`) - Viewing a specific instantiated node
   group.

The `previousViewport` is saved so the viewport can be restored on
`CLOSE_NODE_GROUP`.

#### `viewport?` (optional)

```ts
viewport?: Viewport  // { x: number, y: number, zoom: number }
```

Current viewport position and zoom level. When `undefined`, `FullGraph` calls
`fitView()`.

#### `allowedConversionsBetweenDataTypes?` (optional)

```ts
allowedConversionsBetweenDataTypes?: AllowedConversionsBetweenDataTypes<DataTypeUniqueId>
// = Partial<Record<D, Partial<Record<D, boolean>>>>
```

When `undefined`, all type conversions are allowed. When provided (even as
`{}`), only explicitly allowed conversions are permitted. This is a
source-to-target mapping: `{ sourceDataType: { targetDataType: true } }`.

#### `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking?` (optional)

```ts
allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking?: boolean
```

When `true` and complex type checking is enabled, complex types can connect
unless the schema check explicitly rejects them. When `false` or `undefined`,
complex types require explicit allowance in
`allowedConversionsBetweenDataTypes`.

#### `enableTypeInference?` (optional, default: `undefined` = disabled)

When enabled, handles with `underlyingType: 'inferFromConnection'` automatically
adopt the type of the connected handle. Types reset when edges are removed.

#### `enableComplexTypeChecking?` (optional, default: `undefined` = disabled)

When enabled, Zod schemas of complex types are compared for structural
compatibility before allowing connections.

#### `enableCycleChecking?` (optional, default: `undefined` = disabled)

When enabled, a DFS traversal prevents edges that would create cycles in the
graph.

#### `enableRecursionChecking?` (optional, default: `undefined` = disabled)

When enabled, prevents nesting node groups in a way that creates recursion (a
group containing itself).

#### `enableDebugMode?` (optional, default: `undefined` = disabled)

When enabled, debug information is rendered in the graph UI.

---

## Action Types

All actions are defined as a discriminated union on the `type` field:

| Action Type                  | Payload                                                        | Description                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADD_NODE`                   | `{ type: NodeTypeUniqueId, position: XYPosition }`             | Creates a new node instance of the given type at the given position.                                                                                                                                                   |
| `ADD_NODE_AND_SELECT`        | `{ type: NodeTypeUniqueId, position: XYPosition }`             | Same as `ADD_NODE` but also deselects all existing nodes and selects the new one. Used by context menu.                                                                                                                |
| `UPDATE_NODE_BY_REACT_FLOW`  | `{ changes: NodeChanges }`                                     | Applies ReactFlow node change events (drag, resize, select, remove). Processes each change individually via `applyNodeChanges`.                                                                                        |
| `UPDATE_EDGES_BY_REACT_FLOW` | `{ changes: EdgeChanges }`                                     | Applies ReactFlow edge change events. For `remove` changes, calls `removeEdgeWithTypeChecking` to handle type inference cleanup.                                                                                       |
| `ADD_EDGE_BY_REACT_FLOW`     | `{ edge: Connection }`                                         | Validates and adds a new edge. Runs cycle checking, loop validation, type inference, complex type checking, and conversion checking as applicable.                                                                     |
| `UPDATE_INPUT_VALUE`         | `{ nodeId: string, inputId: string, value: string \| number }` | Updates the value of a specific input on a specific node. _(Note: this action type is defined but not handled in the current reducer switch - the input value is updated directly by the ConfigurableNode component.)_ |
| `OPEN_NODE_GROUP`            | `{ nodeId: string }` or `{ nodeType: NodeTypeUniqueId }`       | Pushes onto `openedNodeGroupStack`. With `nodeId`: instance opening (appends to stack). With `nodeType`: original opening (resets stack to single entry).                                                              |
| `CLOSE_NODE_GROUP`           | _(no payload)_                                                 | Pops the last entry from `openedNodeGroupStack` and restores the previous viewport.                                                                                                                                    |
| `ADD_NODE_GROUP`             | _(no payload)_                                                 | Creates a new node group type with auto-generated input/output nodes, adds it to `typeOfNodes`, and opens it for editing.                                                                                              |
| `SET_VIEWPORT`               | `{ viewport: Viewport }`                                       | Updates the stored viewport position and zoom.                                                                                                                                                                         |
| `REPLACE_STATE`              | `{ state: State<D,N,U,C> }`                                    | Replaces the entire state wholesale. Used by the import system to load a saved graph.                                                                                                                                  |

---

## The mainReducer

Defined in `src/utils/nodeStateManagement/mainReducer.ts:252-555`.

### The Immer `produce()` Pattern

The reducer wraps the entire switch block inside
`produce(oldState, draft => { ... })`. This means:

1. **Immer creates a draft proxy** of `oldState`.
2. Inside the callback, code can **directly mutate** the draft (e.g.,
   `newState.viewport = undefined`).
3. After the callback returns, Immer **produces a new immutable state** with
   structural sharing - only changed subtrees are new objects.
4. The returned state is passed back to React's `useReducer`.

**Exception: `REPLACE_STATE`** returns `action.payload.state` directly from the
produce callback, bypassing the draft entirely.

### Why `setCurrentNodesAndEdgesToStateWithMutatingState` Exists

When a node group is open, the "current" nodes and edges live inside
`typeOfNodes[groupType].subtree.nodes/edges` rather than at
`state.nodes`/`state.edges`. The helper:

- `getCurrentNodesAndEdgesFromState(state)` - Reads from the correct location
  based on `openedNodeGroupStack`.
- `setCurrentNodesAndEdgesToStateWithMutatingState(state, nodes?, edges?)` -
  Writes to the correct location.

This abstraction lets every action case use the same pattern regardless of
whether the user is editing the root graph or inside a nested node group. The
function **mutates the draft in place** (which is safe because it runs inside
Immer's `produce`).

Additional constraint: if a node group's `numberOfReferences > 0`, edits fall
back to modifying the root-level `state.nodes`/`state.edges` instead, protecting
shared group definitions from mutation.

### Case-by-Case Breakdown

**ADD_NODE**: Calls `constructNodeOfType()` to build a fully configured
ReactFlow node from the type definition, then appends it via
`setCurrentNodesAndEdgesToStateWithMutatingState`.

**ADD_NODE_AND_SELECT**: Same as ADD_NODE but first deselects all existing nodes
(`selected: false`), then adds the new node with `selected: true`.

**UPDATE_NODE_BY_REACT_FLOW**: Iterates each `NodeChange` individually and
applies it via ReactFlow's `applyNodeChanges`, writing back through the state
setter.

**UPDATE_EDGES_BY_REACT_FLOW**: For non-remove changes, applies via
`applyEdgeChanges`. For remove changes, calls `removeEdgeWithTypeChecking` which
handles type inference cleanup (resetting inferred types when edges are
disconnected).

**ADD_EDGE_BY_REACT_FLOW**: Multi-step validation pipeline:

1. Cycle checking (DFS via `willAddingEdgeCreateCycle`) if `enableCycleChecking`
   is on
2. Loop connection validation (`isLoopConnectionValid`)
3. Type inference (`inferTypesAfterEdgeAddition`) if `enableTypeInference` is on
4. Complex type compatibility checking if `enableComplexTypeChecking` is on
5. Type conversion compatibility checking if
   `allowedConversionsBetweenDataTypes` is provided

If any step fails, the edge is rejected (break without modification).

**OPEN_NODE_GROUP**: Two modes:

- _Instance opening_ (`nodeId` provided): Finds the node, gets its type,
  verifies it has a subtree, appends to stack with `previousViewport`.
- _Original opening_ (`nodeType` provided): Resets the stack to a single entry
  (no instance navigation history). Clears viewport to trigger `fitView()`.

**CLOSE_NODE_GROUP**: Pops the last stack entry, restores `previousViewport`.

**ADD_NODE_GROUP**: Generates a new node type with a random ID, creates group
input and group output nodes at (-500,0) and (500,0), registers the type in
`typeOfNodes`, and opens it for editing.

**SET_VIEWPORT**: Direct assignment of the viewport.

**REPLACE_STATE**: Returns the payload state directly, completely replacing the
previous state.

---

## useFullGraph Hook

Defined in `src/components/organisms/FullGraph/FullGraphState.ts:96-122`.

```ts
function useFullGraph<D, N, U, C>(
  initialState: State<D, N, U, C>,
): {
  state: State<D, N, U, C>;
  dispatch: React.Dispatch<Action<D, N, U, C>>;
};
```

A thin wrapper around React's `useReducer` that binds the generic type
parameters to `mainReducer`. It returns:

- `state` - The current immutable state
- `dispatch` - Function accepting `Action<D,N,U,C>` to trigger state transitions

Usage pattern:

```ts
const { state, dispatch } = useFullGraph(initialState);
// Pass both to <FullGraph state={state} dispatch={dispatch} />
```

---

## FullGraphContext

Defined in `src/components/organisms/FullGraph/FullGraphState.ts:21-26`.

```ts
const FullGraphContext = createContext<{
  allProps: FullGraphProps;
  nodeRunnerStates?: ReadonlyMap<string, NodeRunnerState>;
}>(null!);
```

The context provides:

- `allProps` - The complete `FullGraphProps` (which includes `state` and
  `dispatch`)
- `nodeRunnerStates?` - Optional map of `nodeId -> NodeRunnerState` for visual
  execution indicators

### `createContextValue` Variance Bridge

React's `createContext` doesn't support generic type parameters. When a
component has concrete generics (e.g., `State<'stringType', 'andGate', ...>`),
passing its `dispatch` to a context typed with default string generics creates a
variance mismatch.

`createContextValue` (`FullGraphState.ts:138-147`) erases the concrete generics
via a controlled type cast:

```ts
function createContextValue(
  props: { state: unknown; dispatch: unknown },
  nodeRunnerStates?: ReadonlyMap<string, NodeRunnerState>,
): React.ContextType<typeof FullGraphContext> {
  const allProps = props as unknown as FullGraphProps;
  return { allProps, nodeRunnerStates };
}
```

This is safe because context consumers dispatch actions using `actionTypesMap`
constants, which produce valid payloads regardless of the concrete generic
params.

### `NodeRunnerState`

```ts
type NodeRunnerState = {
  visualState: NodeVisualState;
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};
```

Provided by `RunnerOverlay` when `functionImplementations` is passed to
`FullGraph`. Consumed by `ConfigurableNodeReactFlowWrapper` to apply visual
indicators (running, completed, errored, etc.).

---

## Feature Flags

All feature flags are optional boolean fields on `State`. When `undefined`, the
feature is disabled.

| Flag                        | Effect When Enabled                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `enableTypeInference`       | Handles with `underlyingType: 'inferFromConnection'` adopt the type of connected handles. Types reset on edge removal.                  |
| `enableComplexTypeChecking` | Connections between complex types are validated by comparing their Zod schemas for structural compatibility.                            |
| `enableCycleChecking`       | DFS traversal prevents new edges that would create cycles in the directed graph.                                                        |
| `enableRecursionChecking`   | Prevents placing a node group inside itself (or a group that transitively contains it). The context menu filters out recursive options. |
| `enableDebugMode`           | Renders debug information overlays in the graph UI.                                                                                     |

### Interaction between conversion flags

```
allowedConversionsBetweenDataTypes defined?
  |
  +-- No  -> All conversions allowed
  |
  +-- Yes -> Only explicit entries allowed
              |
              +-- Is it a complex-to-complex connection?
                    |
                    +-- allowConversionBetweenComplexTypes...? = true
                    |     -> Allowed UNLESS complex type check rejects
                    |
                    +-- false/undefined
                          -> Must be explicitly listed in allowed map
```

---

## Node Group Navigation (`openedNodeGroupStack`)

The stack enables nested navigation into node groups while preserving return
context.

### How It Works

```
Root Graph
  |
  +-- User double-clicks GroupA instance (nodeId: "abc")
  |     Stack: [{ nodeType: "GroupA", nodeId: "abc", prevViewport: {x,y,zoom} }]
  |     getCurrentNodesAndEdgesFromState -> GroupA.subtree.nodes/edges
  |
  +-- Inside GroupA, user double-clicks GroupB instance (nodeId: "def")
  |     Stack: [
  |       { nodeType: "GroupA", nodeId: "abc", prevViewport: ... },
  |       { nodeType: "GroupB", nodeId: "def", prevViewport: ... }
  |     ]
  |     getCurrentNodesAndEdgesFromState -> GroupB.subtree.nodes/edges
  |
  +-- User clicks Back
  |     Stack: [{ nodeType: "GroupA", nodeId: "abc", prevViewport: ... }]
  |     viewport restored to GroupA's prevViewport
  |
  +-- User clicks Back again
        Stack: []
        viewport restored to root prevViewport
```

### Original vs Instance Opening

- **Instance opening** (via `OPEN_NODE_GROUP` with `nodeId`): Appends to the
  existing stack. Used when navigating from within the graph.
- **Original opening** (via `OPEN_NODE_GROUP` with `nodeType`): Resets the stack
  to a single entry. Used when selecting a group from the
  `FullGraphNodeGroupSelector` dropdown.

When editing the original node group (stack entry has no `nodeId`), changes
affect the type definition. When `numberOfReferences === 0`, edits modify the
subtree directly. When `numberOfReferences > 0`, the group is read-only
(modifications fall through to root state).

---

## Limitations and Deprecated Patterns

1. **`UPDATE_INPUT_VALUE` action**: Defined in the `Action` type but the
   reducer's switch statement has no explicit case for it. Input values are
   currently updated directly by `ConfigurableNode` components through their own
   state management, making this action type effectively unused.

2. **Generic type erasure in context**: The `createContextValue` variance bridge
   uses `unknown` casts. While safe in practice (consumers use `actionTypesMap`
   constants), it means context consumers lose compile-time validation of action
   payloads against concrete data/node type IDs.

3. **Single-reducer architecture**: All graph mutations go through one reducer.
   This is simple and predictable but means that adding new action types
   requires modifying `mainReducer` directly.

4. **Node group editing restriction**: Groups with `numberOfReferences > 0`
   cannot be edited through the stack navigation. The
   `setCurrentNodesAndEdgesToStateWithMutatingState` function silently falls
   back to root state modification.

---

## Examples

### Creating Initial State

```tsx
import {
  makeStateWithAutoInfer,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from 'react-blender-nodes';

const dataTypes = {
  stringType: makeDataTypeWithAutoInfer({
    name: 'String',
    underlyingType: 'string',
    color: '#4A90E2',
  }),
  numberType: makeDataTypeWithAutoInfer({
    name: 'Number',
    underlyingType: 'number',
    color: '#E74C3C',
  }),
};

const typeOfNodes = {
  mathAdd: makeTypeOfNodeWithAutoInfer({
    name: 'Add',
    headerColor: '#2D5A27',
    inputs: [
      { name: 'A', dataType: 'numberType', allowInput: true },
      { name: 'B', dataType: 'numberType', allowInput: true },
    ],
    outputs: [{ name: 'Result', dataType: 'numberType' }],
    locationInContextMenu: ['Math'],
  }),
};

const initialState = makeStateWithAutoInfer({
  dataTypes,
  typeOfNodes,
  nodes: [],
  edges: [],
  enableCycleChecking: true,
  enableTypeInference: true,
});
```

### Dispatching Actions

```tsx
import { actionTypesMap } from 'react-blender-nodes';

// Add a node
dispatch({
  type: actionTypesMap.ADD_NODE,
  payload: { type: 'mathAdd', position: { x: 200, y: 100 } },
});

// Add a node and select it (used by context menu)
dispatch({
  type: actionTypesMap.ADD_NODE_AND_SELECT,
  payload: { type: 'mathAdd', position: { x: 400, y: 100 } },
});

// Replace entire state (used by import)
dispatch({
  type: actionTypesMap.REPLACE_STATE,
  payload: { state: importedState },
});

// Open a node group by instance
dispatch({
  type: actionTypesMap.OPEN_NODE_GROUP,
  payload: { nodeId: 'some-node-id' },
});

// Open a node group by type (original editing)
dispatch({
  type: actionTypesMap.OPEN_NODE_GROUP,
  payload: { nodeType: 'myGroupType' },
});

// Close current node group
dispatch({ type: actionTypesMap.CLOSE_NODE_GROUP });

// Add a new empty node group
dispatch({ type: actionTypesMap.ADD_NODE_GROUP });
```

### Using useFullGraph

```tsx
import { useFullGraph, FullGraph } from 'react-blender-nodes';

function MyEditor() {
  const { state, dispatch } = useFullGraph(initialState);

  return (
    <div style={{ height: '100vh' }}>
      <FullGraph state={state} dispatch={dispatch} />
    </div>
  );
}
```

---

## Relationships with Other Features

### -> [Data Types](dataTypesDoc.md)

`State.dataTypes` is the authoritative registry of all data types. Every handle
references a `DataTypeUniqueId` that must exist in this map. The
`constructInputOrOutputOfType` function looks up data types here to set handle
colors, shapes, and input allowance.

### -> [Handles](handlesDoc.md)

The reducer delegates handle-level operations to `constructAndModifyHandles.ts`.
`addEdgeWithTypeChecking` and `removeEdgeWithTypeChecking` perform type
inference, complex type validation, and conversion checking at the handle level.
Handle indices are used to locate specific inputs/outputs within nodes.

### -> [Nodes](nodesDoc.md)

`constructNodeOfType` (in `constructAndModifyNodes.ts`) builds complete
ReactFlow node instances from `TypeOfNode` definitions, processing inputs
(including panels) and outputs. The reducer calls this for `ADD_NODE` and
`ADD_NODE_AND_SELECT`.

### -> [Edges](edgesDoc.md)

Edges are managed through ReactFlow's `applyEdgeChanges` for non-remove
operations and through `removeEdgeWithTypeChecking` for removals. New edges go
through `addEdgeWithTypeChecking` which runs the full validation pipeline.

### -> [Type Inference](typeInferenceDoc.md)

When `enableTypeInference` is true, `inferTypesAfterEdgeAddition` and
`inferTypesAfterEdgeRemoval` (from `newOrRemovedEdgeValidation.ts`) propagate
type information through `inferFromConnection` handles when edges are added or
removed.

### -> [Connection Validation](../features/connectionValidationDoc.md)

Connection validation is a pipeline triggered by `ADD_EDGE_BY_REACT_FLOW`:

1. Cycle checking (`willAddingEdgeCreateCycle`)
2. Loop connection validation (`isLoopConnectionValid`)
3. Type inference validation
4. Complex type compatibility (`checkComplexTypeCompatibilityAfterEdgeAddition`)
5. Conversion compatibility
   (`checkTypeConversionCompatibilityAfterEdgeAddition`)

### -> [Node Groups](../features/nodeGroupsDoc.md)

Node groups are `TypeOfNode` entries with a `subtree` property. The
`openedNodeGroupStack` enables navigation. `getCurrentNodesAndEdgesFromState`
resolves the stack to return the correct nodes/edges. `ADD_NODE_GROUP` creates
new groups. `OPEN_NODE_GROUP` / `CLOSE_NODE_GROUP` manage navigation. Dependency
tracking (`getDependencyGraphBetweenNodeTypes`) supports recursion checking.

### -> [Loops](../features/loopsDoc.md)

Loop nodes (from `nodes/loops.ts`) have special connection validation rules
checked via `isLoopConnectionValid` during `ADD_EDGE_BY_REACT_FLOW`. Loop node
deletion is validated by `canRemoveLoopNodesAndEdges` in the `onBeforeDelete`
handler.

### -> [FullGraph Component](../ui/fullGraphDoc.md)

`FullGraph` is the primary consumer of the state management system. It:

- Receives `state` and `dispatch` as props
- Provides them via `FullGraphContext`
- Wires ReactFlow callbacks to dispatch appropriate actions
- Builds context menu items that dispatch `ADD_NODE_AND_SELECT`
- Renders `FullGraphNodeGroupSelector` that dispatches group navigation actions

### -> [Runner](../runner/runnerHookDoc.md)

When `functionImplementations` is provided to `FullGraph`, the `RunnerOverlay`
component calls `useNodeRunner` and provides `nodeRunnerStates` through a nested
`FullGraphContext.Provider`. The runner reads `state` but does not modify it
through dispatch - it maintains its own execution state separately.

### -> [Import/Export](../importExport/importExportDoc.md)

The import system uses `REPLACE_STATE` to load a saved graph. `exportGraphState`
serializes the current state to JSON. `importGraphState` validates and repairs
the JSON before dispatch. After import, `FullGraph` increments a `reactFlowKey`
to force ReactFlow to remount and re-register handles. Recording import/export
is handled separately through the runner's `loadRecord` API.
