# FullGraph Component

## Overview

FullGraph is the top-level graph editor component of `react-blender-nodes`. It
assembles the complete visual node editing experience by integrating ReactFlow
(the core graph renderer), a right-click context menu system, node group
navigation, an optional graph execution runner, and state import/export
functionality.

FullGraph follows a three-layer component architecture:

1. **FullGraph** (outer) -- wraps everything in `ReactFlowProvider` +
   `FullGraphContext.Provider`
2. **FullGraphWithReactFlowProvider** (inner) -- contains all the actual logic:
   ReactFlow, context menu, group selector, import/export, and conditional
   runner overlay
3. **RunnerOverlay** (conditional) -- wraps graph content with `useNodeRunner`
   and `NodeRunnerPanel` when `functionImplementations` is provided

All three layers are generic over four type parameters: `DataTypeUniqueId`,
`NodeTypeUniqueId`, `UnderlyingType`, and `ComplexSchemaType`.

---

## Entity-Relationship Diagram

```
+-------------------+       +-------------------+       +-------------------+
|   FullGraphProps   |       |      State        |       |    Action          |
+-------------------+       +-------------------+       +-------------------+
| state        -----+------>| nodes[]           |       | ADD_NODE           |
| dispatch     -----+------>| edges[]           |       | ADD_NODE_AND_SELECT|
| functionImpl?     |       | dataTypes{}       |       | UPDATE_NODE_BY_RF  |
| onStateImported?  |       | typeOfNodes{}     |       | UPDATE_EDGES_BY_RF |
| onRecordingImp?   |       | openedNodeGroup   |       | ADD_EDGE_BY_RF     |
| onImportError?    |       |   Stack[]         |       | UPDATE_INPUT_VALUE |
+-------------------+       | viewport?         |       | OPEN_NODE_GROUP    |
                             | enableRecursion   |       | CLOSE_NODE_GROUP   |
                             |   Checking?       |       | ADD_NODE_GROUP     |
                             +-------------------+       | SET_VIEWPORT       |
                                                         | REPLACE_STATE      |
                                                         +-------------------+

+-------------------+       +-------------------+
| FunctionImpl.     |       | ExecutionRecord   |
+-------------------+       +-------------------+
| [nodeTypeId]:     |       | steps[]           |
|   (inputs) =>     |       | errors[]          |
|     outputs       |       | loopRecords       |
+-------------------+       | groupRecords      |
                             | status            |
                             +-------------------+

+-------------------+       +-------------------+
| NodeRunnerState   |       | ContextMenuItem   |
+-------------------+       +-------------------+
| visualState       |       | id                |
| errors?           |       | label             |
| warnings?         |       | icon?             |
+-------------------+       | onClick?          |
                             | subItems?         |
                             +-------------------+
```

---

## Functional Dependency Diagram

```
FullGraph (outer)
  |
  +-- ReactFlowProvider          (from @xyflow/react)
  +-- FullGraphContext.Provider   (provides {allProps, nodeRunnerStates?})
  |
  +-- FullGraphWithReactFlowProvider (inner)
        |
        +-- useReactFlow()                    (screenToFlowPosition, fitView)
        +-- createNodeContextMenu()           (node creation items)
        +-- createImportExportMenuItems()     (import/export items)
        +-- getCurrentNodesAndEdgesFromState() (filters by group stack)
        +-- exportGraphState / importGraphState
        +-- exportExecutionRecord / importExecutionRecord
        +-- canRemoveLoopNodesAndEdges()      (deletion guard)
        |
        +-- [conditional] RunnerOverlay
        |     +-- useNodeRunner()             (compile, execute, replay)
        |     +-- FullGraphContext.Provider    (nested, with nodeRunnerStates)
        |     +-- NodeRunnerPanel             (execution controls UI)
        |
        +-- ReactFlow                         (core graph renderer)
        |     +-- Controls, Background, MiniMap
        |     +-- ConfigurableConnection      (custom connection line)
        |
        +-- FullGraphContextMenu              (floating context menu)
        +-- FullGraphNodeGroupSelector        (breadcrumb + dropdown)
        +-- <input type="file" /> x2          (hidden import triggers)
```

---

## Data Flow Diagram

```
  User provides:
  state, dispatch, functionImplementations?
        |
        v
+-------+-------+
|   FullGraph    |  (outer)
|  ReactFlow    |
|   Provider     |
+-------+-------+
        |
        v
+-------+-----------+
| FullGraphContext   |  createContextValue({state, dispatch})
|   .Provider        |
+-------+-----------+
        |
        v
+-------+------------------------------+
| FullGraphWithReactFlowProvider        |
|                                       |
|  state ---> getCurrentNodesAndEdges   |
|               FromState()             |
|                 |                     |
|                 v                     |
|  +-----------+   +------------------+ |
|  | ReactFlow |   | ContextMenu      | |
|  |  nodes    |   |  node items      | |
|  |  edges    |   |  import/export   | |
|  +-----------+   +------------------+ |
|       |                               |
|  onNodesChange ---> dispatch(         |
|  onEdgesChange      UPDATE_NODE,      |
|  onConnect          UPDATE_EDGES,     |
|  onViewportChange   ADD_EDGE,         |
|  onBeforeDelete     SET_VIEWPORT)     |
|                                       |
|  [if functionImplementations]         |
|  +----------------------------------+ |
|  | RunnerOverlay                    | |
|  |  useNodeRunner(state, funcImpl)  | |
|  |       |                          | |
|  |       v                          | |
|  |  nodeRunnerStates (Map)          | |
|  |       |                          | |
|  |       v                          | |
|  |  FullGraphContext.Provider       | |
|  |    (nested, with runner states)  | |
|  |       |                          | |
|  |       v                          | |
|  |  NodeRunnerPanel                 | |
|  |  (run/pause/step/stop/reset)     | |
|  +----------------------------------+ |
+---------------------------------------+
```

---

## System Diagram

```
+========================================================================+
|                        react-blender-nodes                             |
|                                                                        |
|  +-- UI Layer -------------------------------------------------------+ |
|  |                                                                    | |
|  |  +-- FullGraph (top-level editor) ------------------------------+ | |
|  |  |                                                               | | |
|  |  |  +-- ReactFlow ---------+  +-- ContextMenu ---------------+ | | |
|  |  |  | ConfigurableNode     |  | createNodeContextMenu         | | | |
|  |  |  | ConfigurableEdge     |  | createImportExportMenuItems   | | | |
|  |  |  | ConfigurableConnect. |  +-------------------------------+ | | |
|  |  |  +----------------------+                                     | | |
|  |  |                                                               | | |
|  |  |  +-- NodeGroupSelector -+  +-- RunnerOverlay -------------+ | | |
|  |  |  | Dropdown + Breadcrumb|  | useNodeRunner                 | | | |
|  |  |  | Back button          |  | NodeRunnerPanel               | | | |
|  |  |  +----------------------+  | Toggle button                 | | | |
|  |  |                            +-------------------------------+ | | |
|  |  +--------------------------------------------------------------+ | |
|  +--------------------------------------------------------------------+ |
|                                                                        |
|  +-- State Layer ----------------------------------------------------+ |
|  |  mainReducer (Immer-based)                                        | |
|  |  useFullGraph hook (useReducer wrapper)                           | |
|  |  FullGraphContext (state + dispatch + nodeRunnerStates)            | |
|  +--------------------------------------------------------------------+ |
|                                                                        |
|  +-- Runner Layer ---------------------------------------------------+ |
|  |  compiler -> executor -> executionRecorder                        | |
|  |  useNodeRunner hook (compile, execute, replay, step-by-step)      | |
|  +--------------------------------------------------------------------+ |
|                                                                        |
|  +-- Import/Export Layer --------------------------------------------+ |
|  |  exportGraphState / importGraphState                              | |
|  |  exportExecutionRecord / importExecutionRecord                    | |
|  |  validation + repair strategies                                   | |
|  +--------------------------------------------------------------------+ |
+========================================================================+
```

---

## Component Architecture

### FullGraph (outer wrapper)

Defined at `src/components/organisms/FullGraph/FullGraph.tsx:766-802`.

The outermost component. Its sole job is to wrap children in:

1. `ReactFlowProvider` -- required by `@xyflow/react` so that `useReactFlow()`
   hooks work in descendants
2. `FullGraphContext.Provider` -- provides `{allProps, nodeRunnerStates?}` via
   `createContextValue()`

It then renders `FullGraphWithReactFlowProvider` as its child.

### FullGraphWithReactFlowProvider (implementation)

Defined at `src/components/organisms/FullGraph/FullGraph.tsx:307-678`.

The main implementation component. It:

- Calls `useReactFlow()` to get `screenToFlowPosition` and `fitView`
- Manages context menu open/close state
- Builds context menu items from `createNodeContextMenu()` +
  `createImportExportMenuItems()`
- Computes `currentNodesAndEdges` from state (filtered by
  `openedNodeGroupStack`)
- Renders `ReactFlow` with custom `nodeTypes` and `edgeTypes`
- Renders `FullGraphContextMenu`, `FullGraphNodeGroupSelector`
- Conditionally wraps graph content in `RunnerOverlay` when
  `functionImplementations` is provided
- Renders two hidden `<input type="file">` elements for state/recording import
- Handles export via `downloadJson()` helper and import via `FileReader`
- Forces ReactFlow remount via `reactFlowKey` after state import

### RunnerOverlay (conditional runner wrapper)

Defined at `src/components/organisms/FullGraph/FullGraph.tsx:133-295`.

Rendered only when `functionImplementations` is provided. It:

- Calls `useNodeRunner({state, functionImplementations})` to get the full runner
  API
- Builds a combined `nodeRunnerStates` Map merging visual states, warnings, and
  errors
- Provides a **nested** `FullGraphContext.Provider` that includes
  `nodeRunnerStates` (overriding the outer provider)
- Renders `NodeRunnerPanel` with all runner controls (run, pause, step, stop,
  reset, mode, scrub)
- Renders a toggle button to reopen the panel when closed
- Exposes `executionRecord` and `loadRecord` to the parent via refs

---

## Props (FullGraphProps)

| Prop                      | Type                                   | Required | Description                                                                                    |
| ------------------------- | -------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `state`                   | `State<D, N, U, C>`                    | Yes      | The complete graph state: nodes, edges, dataTypes, typeOfNodes, openedNodeGroupStack, viewport |
| `dispatch`                | `ActionDispatch<[Action<D, N, U, C>]>` | Yes      | Dispatch function from `useReducer` / `useFullGraph`                                           |
| `functionImplementations` | `FunctionImplementations<N>`           | No       | Map of nodeTypeId to execution functions. When provided, enables the runner overlay            |
| `onStateImported`         | `(importedState: State) => void`       | No       | Called after successful state import with the parsed state                                     |
| `onRecordingImported`     | `(record: ExecutionRecord) => void`    | No       | Called after successful recording import with the parsed record                                |
| `onImportError`           | `(errors: string[]) => void`           | No       | Called when import validation fails, receives error messages                                   |

All four generic type parameters (`DataTypeUniqueId`, `NodeTypeUniqueId`,
`UnderlyingType`, `ComplexSchemaType`) default to their widest types, so
consumers only need to provide them for stricter type safety.

---

## FullGraphContext

Defined in `src/components/organisms/FullGraph/FullGraphState.ts:21-26`.

```typescript
type FullGraphContextValue = {
  allProps: FullGraphProps;
  nodeRunnerStates?: ReadonlyMap<string, NodeRunnerState>;
};
```

**What it provides:**

- `allProps` -- the `state` and `dispatch` passed to FullGraph, so deeply nested
  components (e.g., `ConfigurableNodeReactFlowWrapper`) can access them without
  prop drilling
- `nodeRunnerStates` -- optional map of
  `nodeId -> { visualState, errors?, warnings? }`, provided by `RunnerOverlay`

**createContextValue variance bridge:**

React's `createContext` does not support generic type parameters. The
`createContextValue()` function (`FullGraphState.ts:138-147`) bridges the
variance gap by erasing the concrete generic parameters to match the context's
default-param type. This is safe because context consumers dispatch actions
using `actionTypesMap` constants, which produce valid payloads regardless of the
concrete generic params.

**NodeRunnerState type:**

```typescript
type NodeRunnerState = {
  visualState: NodeVisualState; // 'idle' | 'running' | 'completed' | 'errored' | 'skipped' | 'warning'
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};
```

---

## ReactFlow Integration

### nodeTypes and edgeTypes

Defined in `src/components/organisms/FullGraph/FullGraphCustomNodesAndEdges.ts`.

```typescript
const nodeTypes = { configurableNode: ConfigurableNodeReactFlowWrapper };
const edgeTypes = { configurableEdge: ConfigurableEdge };
```

All nodes in the graph use the `configurableNode` type, and all edges use the
`configurableEdge` type. ReactFlow dispatches rendering to these components
based on the `type` field of each node/edge in state.

### Event handlers

| Handler            | Action Dispatched            | Description                                                                                                      |
| ------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `onNodesChange`    | `UPDATE_NODE_BY_REACT_FLOW`  | Applies position, selection, dimension changes from ReactFlow                                                    |
| `onEdgesChange`    | `UPDATE_EDGES_BY_REACT_FLOW` | Applies edge selection, removal changes from ReactFlow                                                           |
| `onConnect`        | `ADD_EDGE_BY_REACT_FLOW`     | Adds a new edge when user drags between handles                                                                  |
| `onViewportChange` | `SET_VIEWPORT`               | Persists pan/zoom state                                                                                          |
| `onBeforeDelete`   | (guard only)                 | Validates loop node/edge deletion via `canRemoveLoopNodesAndEdges()`. Returns `false` to block invalid deletions |

### Viewport management

- **Controlled viewport**: `state.viewport` is passed to ReactFlow and updated
  via `SET_VIEWPORT` on every change
- **fitView on group navigation**: When `state.viewport` becomes `undefined`
  (after opening/closing a node group), `fitView()` is called with
  `maxZoom: 0.5, minZoom: 0.1`
- **ReactFlow config**: `maxZoom: 1`, `minZoom: 0.1`, dark color mode, partial
  selection mode, delete keys: Backspace/Delete/x

---

## Context Menu Integration

### Node creation items

Generated by `createNodeContextMenu()` from
`src/components/molecules/ContextMenu/createNodeContextMenu.ts`.

- Iterates over `state.typeOfNodes` to build an "Add Node" submenu
- Supports nested folder structure via `locationInContextMenu` on each node type
- Sorts by `priorityInContextMenu` (descending), then insertion order
- Respects recursion checking: when `state.enableRecursionChecking` is true,
  filters out node types that would create circular group dependencies
- Dispatches `ADD_NODE_AND_SELECT` on click, placing the node at the flow-space
  position of the right-click

### Import/Export items

Generated by `createImportExportMenuItems()` from
`src/components/organisms/FullGraph/createImportExportMenuItems.ts`.

Creates an "Import/Export" submenu with four items:

- **Export State** -- serializes current state via `exportGraphState()` and
  downloads as `graph-state.json`
- **Import State** -- triggers hidden file input, reads JSON, calls
  `importGraphState()` with repair strategies
- **Export Recording** -- serializes current execution record via
  `exportExecutionRecord()` and downloads as `execution-recording.json`
- **Import Recording** -- triggers hidden file input, reads JSON, calls
  `importExecutionRecord()` with repair strategies

---

## Node Group Navigation

### FullGraphNodeGroupSelector

Defined in `src/components/organisms/FullGraph/FullGraphNodeGroupSelector.tsx`.

Props: | Prop | Type | Description | |------|------|-------------| |
`nodeGroups` | `{id, name}[]` | All node types with `subtree` defined | |
`value` | `string` | Currently selected node group type | | `setValue` |
`(value: string) => void` | Dispatches `OPEN_NODE_GROUP` | | `handleAddNewGroup`
| `() => void` | Dispatches `ADD_NODE_GROUP` | | `enableBackButton` | `boolean`
| True when `openedNodeGroupStack.length > 0` | | `handleBack` | `() => void` |
Dispatches `CLOSE_NODE_GROUP` | | `openedNodeGroupStack` | `{id, name}[]` |
Breadcrumb path |

### Breadcrumb rendering

The `openedNodeGroupStack` is rendered as a horizontal scrollable list of group
names separated by `ChevronRight` icons, using `ScrollableButtonContainer`.

### Back button

An arrow-left button that dispatches `CLOSE_NODE_GROUP`, popping the last group
from the stack. Disabled when the stack is empty (at root level).

---

## Runner Integration

### RunnerOverlay

When `functionImplementations` is provided, `FullGraphWithReactFlowProvider`
wraps the graph content in `RunnerOverlay`. Otherwise, the graph content renders
directly without any runner functionality.

The overlay:

1. Calls `useNodeRunner({state, functionImplementations})` to get the runner API
2. Builds `nodeRunnerStates` by merging three maps from the runner:
   `nodeVisualStates`, `nodeWarnings`, `nodeErrors`
3. Provides a nested `FullGraphContext.Provider` so all descendant components
   (nodes, edges) can read per-node visual states

### nodeRunnerStates propagation

```
RunnerOverlay
  |
  +-- useNodeRunner() returns:
  |     nodeVisualStates: Map<nodeId, 'idle'|'running'|'completed'|...>
  |     nodeWarnings:     Map<nodeId, string[]>
  |     nodeErrors:       Map<nodeId, GraphError[]>
  |
  +-- Merges into single Map<nodeId, NodeRunnerState>
  |
  +-- FullGraphContext.Provider value includes nodeRunnerStates
  |
  +-- ConfigurableNodeReactFlowWrapper reads from context
        to apply visual indicators (border colors, status icons)
```

### Panel toggle button

When the `NodeRunnerPanel` is closed (`isRunnerPanelOpen === false`), a floating
button labeled "Runner" with a Play icon appears at the bottom center of the
graph. Clicking it reopens the panel.

---

## Import/Export Integration

### State export/import

**Export flow:**

1. `handleExportState()` calls `exportGraphState(state, { pretty: true })`
2. `downloadJson()` creates a Blob, generates an object URL, and triggers a
   download of `graph-state.json`

**Import flow:**

1. Hidden `<input type="file" accept=".json">` is triggered by context menu item
2. `FileReader.readAsText()` reads the selected file
3. `handleImportState(json)` calls `importGraphState(json, options)` with repair
   strategies:
   - `removeOrphanEdges`, `removeDuplicateNodeIds`, `removeDuplicateEdgeIds`,
     `fillMissingDefaults`, `rehydrateDataTypeObjects`
4. On success: replaces `dataTypes` and `typeOfNodes` with live originals
   (export strips non-serializable fields like `onChange`, `complexSchema`)
5. Dispatches `REPLACE_STATE` with the imported state
6. Increments `reactFlowKey` to force ReactFlow remount (ensures Handle
   registration happens before edge rendering)
7. Calls `onStateImported?.(importedState)`
8. On failure: calls `onImportError?.(errors)`

### Recording export/import

**Export flow:**

1. `handleExportRecording()` reads the current execution record from
   `executionRecordRef`
2. Calls `exportExecutionRecord(record, { pretty: true })`
3. Downloads as `execution-recording.json`

**Import flow:**

1. Hidden `<input type="file">` triggered by context menu
2. `handleImportRecording(json)` calls `importExecutionRecord(json, options)`
   with repair strategies:
   - `sanitizeNonSerializableValues`, `removeOrphanSteps`
3. On success: loads into runner via `loadRecordRef.current(result.data)`, which
   validates against current graph
4. Calls `onRecordingImported?.(result.data)`
5. On failure: calls `onImportError?.(errors)`

### Hidden file inputs

Two hidden `<input type="file">` elements are rendered at the bottom of
`FullGraphWithReactFlowProvider`:

- `importStateInputRef` -- for state JSON import
- `importRecordingInputRef` -- for recording JSON import

Both reset their value after reading (`e.target.value = ''`) to allow
re-importing the same file.

---

## Limitations and Deprecated Patterns

- **No undo/redo**: The reducer does not maintain a history stack. State import
  via `REPLACE_STATE` is the only way to restore a previous state.
- **Single connection line component**: All connection previews use
  `ConfigurableConnection`; there is no per-edge-type customization of the drag
  preview.
- **Viewport stored in state**: The viewport is stored in the reducer state and
  dispatched on every change. This creates frequent state updates during
  pan/zoom.
- **ReactFlow remount on import**: After importing state, the entire ReactFlow
  instance is remounted via key change. This is necessary due to Handle
  registration timing but causes a visual flash.
- **Generic variance bridge**: The `createContextValue()` type erasure is safe
  but relies on the convention that context consumers only dispatch via
  `actionTypesMap` constants.

---

## Examples

### Basic usage (no runner)

```tsx
import {
  FullGraph,
  useFullGraph,
  makeStateWithAutoInfer,
} from 'react-blender-nodes';

function MyEditor() {
  const { state, dispatch } = useFullGraph(
    makeStateWithAutoInfer({
      dataTypes: {
        /* ... */
      },
      typeOfNodes: {
        /* ... */
      },
      nodes: [],
      edges: [],
    }),
  );

  return (
    <div style={{ height: '600px', width: '100%' }}>
      <FullGraph state={state} dispatch={dispatch} />
    </div>
  );
}
```

### With runner enabled

```tsx
import {
  FullGraph,
  useFullGraph,
  makeStateWithAutoInfer,
  makeFunctionImplementationsWithAutoInfer,
} from 'react-blender-nodes';

const functionImplementations = makeFunctionImplementationsWithAutoInfer({
  myNode: async (inputs) => ({ output: inputs.input * 2 }),
});

function MyEditor() {
  const { state, dispatch } = useFullGraph(initialState);

  return (
    <div style={{ height: '600px', width: '100%' }}>
      <FullGraph
        state={state}
        dispatch={dispatch}
        functionImplementations={functionImplementations}
      />
    </div>
  );
}
```

### With import/export callbacks

```tsx
<FullGraph
  state={state}
  dispatch={dispatch}
  onStateImported={(imported) => console.log('State imported', imported)}
  onRecordingImported={(record) => console.log('Recording imported', record)}
  onImportError={(errors) => alert(errors.join('\n'))}
/>
```

---

## Relationships with Other Features

### -> [State Management](../core/stateManagementDoc.md)

FullGraph receives `state` and `dispatch` from the consumer (typically via
`useFullGraph`). It dispatches actions (`ADD_NODE_AND_SELECT`,
`UPDATE_NODE_BY_REACT_FLOW`, `UPDATE_EDGES_BY_REACT_FLOW`,
`ADD_EDGE_BY_REACT_FLOW`, `SET_VIEWPORT`, `OPEN_NODE_GROUP`, `CLOSE_NODE_GROUP`,
`ADD_NODE_GROUP`, `REPLACE_STATE`) through the `mainReducer`.

### -> [ConfigurableNode](configurableNodeDoc.md)

All nodes render as `ConfigurableNodeReactFlowWrapper` (registered as
`nodeTypes.configurableNode`). The wrapper reads `FullGraphContext` to access
state, dispatch, and `nodeRunnerStates` for visual indicators.

### -> [ConfigurableEdge](configurableEdgeDoc.md)

All edges render as `ConfigurableEdge` (registered as
`edgeTypes.configurableEdge`). Edge connections are validated via type checking
in the reducer.

### -> [Context Menu](contextMenuDoc.md)

`FullGraphContextMenu` wraps the `ContextMenu` molecule with floating-ui
positioning. Menu items are built from two sources: `createNodeContextMenu()`
(node creation) and `createImportExportMenuItems()` (import/export). The menu
uses `@floating-ui/react` for positioning, flip, shift, and dismiss behavior.

### -> [NodeRunnerPanel](nodeRunnerPanelDoc.md)

Rendered by `RunnerOverlay` when `functionImplementations` is provided. Receives
all runner controls (run, pause, step, stop, reset, mode, scrub,
maxLoopIterations) as props. Can be toggled open/closed.

### -> [Runner Hook (useNodeRunner)](../runner/runnerHookDoc.md)

Called inside `RunnerOverlay` with `state` and `functionImplementations`.
Provides the full execution lifecycle: compile -> execute (instant or
step-by-step) -> replay. Supports two modes: `'instant'` (full execution, then
timeline replay) and `'stepByStep'` (pause after each step). Also provides
`loadRecord()` for importing pre-recorded executions.

### -> [Import/Export](../importExport/importExportDoc.md)

FullGraph integrates import/export at two levels:

1. **Context menu items**: via `createImportExportMenuItems()` which triggers
   hidden file inputs
2. **Handler functions**: `handleExportState`, `handleImportState`,
   `handleExportRecording`, `handleImportRecording` which use functions from
   `src/utils/importExport/`

State import replaces live `dataTypes` and `typeOfNodes` (since exported JSON
strips non-serializable fields), dispatches `REPLACE_STATE`, and remounts
ReactFlow.

### -> [ReactFlow (external)](../external/reactFlowDoc.md)

FullGraph uses `@xyflow/react` as its rendering engine. It provides
`ReactFlowProvider` at the top level, uses `useReactFlow()` for coordinate
conversion and fitView, and passes controlled viewport, custom node/edge types,
and all event handlers to the `<ReactFlow>` component.
