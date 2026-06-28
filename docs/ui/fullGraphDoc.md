# FullGraph Component

## Overview

FullGraph is the top-level graph editor component of `react-blender-nodes`. It
assembles the complete visual node editing experience by integrating ReactFlow
(the core graph renderer), a right-click context menu, node group navigation, a
zone frame overlay, three editor drawers (node-type / loop / switch), an
optional graph execution runner, keyboard undo/redo, a unified observability
event stream, a custom-input-component registry, and state/recording
import/export.

FullGraph is defined in `src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraph`. Its folder (`src/components/organisms/FullGraph/`) also holds the
external store, the several React contexts, the import/export hook, the
context-menu wrapper, and the node-group selector.

FullGraph follows a layered component architecture:

1. **FullGraph** (outer wrapper) — wraps everything in `ReactFlowProvider`,
   `FullGraphContext.Provider`, and `RecordContext.Provider`
   (`src/components/organisms/FullGraph/FullGraph.tsx` › `FullGraph`)
2. **FullGraphWithReactFlowProvider** (implementation) — all the actual logic:
   ReactFlow, context menu, group selector, zone overlay, edit drawers, keyboard
   shortcuts, drag batching, error boundaries, and conditional runner overlay
   (`src/components/organisms/FullGraph/FullGraph.tsx` ›
   `FullGraphWithReactFlowProvider`)
3. **RunnerOverlay** (conditional) — wraps graph content with `useNodeRunner`
   and `NodeRunnerPanel`, and provides `RunnerContext`. Rendered only when
   `functionImplementations` is provided. Lives in its own file,
   `src/components/organisms/FullGraph/RunnerOverlay.tsx` › `RunnerOverlay`

All three layers are generic over four type parameters: `DataTypeUniqueId`,
`NodeTypeUniqueId`, `UnderlyingType`, and `ComplexSchemaType`.

> **Note on state ownership.** FullGraph is fully controlled — it never owns
> graph state. State + dispatch come from `useFullGraph` (the recommended path,
> backed by an external Redux-style store and `useSyncExternalStore`) or from a
> raw `useReducer(mainReducer, …)`. See
> [State Management](../core/stateManagementDoc.md).

---

## Entity-Relationship Diagram

```
+--------------------------+      +--------------------------+      +--------------------------+
|      FullGraphProps       |      |          State           |      |         Action            |
+--------------------------+      +--------------------------+      +--------------------------+
| state               -----+----->| openedNodeGroupStack?    |      | ADD_NODE                  |
| dispatch            -----+----->| dataTypes{}              |      | ADD_NODE_AND_SELECT       |
| functionImplementations? |      | typeOfNodes{}            |      | UPDATE_NODE_BY_REACT_FLOW |
| onStateImported?         |      | nodes[]                  |      | UPDATE_EDGES_BY_REACT_FLOW|
| onRecordingImported?     |      | edges[]                  |      | ADD_EDGE_BY_REACT_FLOW    |
| onImportError?           |      | viewport?                |      | UPDATE_INPUT_VALUE        |
| executionRecord?         |      | activeDrawer?            |      | OPEN_NODE_GROUP           |
| onExecutionRecordChange? |      | zones? / zoneIndex?      |      | CLOSE_NODE_GROUP          |
| onGraphEvent?            |      | history?                 |      | ADD_NODE_GROUP            |
| inputComponents?         |      | enableRecursionChecking? |      | SET_VIEWPORT              |
| enableUndoRedoShortcuts? |      | hiddenNodeTypesIn-       |      | REPLACE_STATE             |
+--------------------------+      |   ContextMenu?           |      | UPDATE_NODE_TYPE          |
                                  +--------------------------+      | ADD_LOOP / UPDATE_LOOP    |
                                                                    | ADD_SWITCH / UPDATE_SWITCH|
+--------------------------+      +--------------------------+      | OPEN_DRAWER / CLOSE_DRAWER|
|    NodeRunnerState        |      |     ActiveDrawer         |      | UNDO / REDO               |
+--------------------------+      +--------------------------+      | BEGIN_BATCH / END_BATCH   |
| visualState              |      | {editLoop, nodeId}       |      | CLEAR_HISTORY             |
| errors?                  |      | {editNodeType,nodeTypeId}|      +--------------------------+
| warnings?                |      | {editSwitch, nodeId}     |
+--------------------------+      | null                     |
                                  +--------------------------+

+--------------------------+      +--------------------------+      +--------------------------+
|     GraphEvent (union)    |      |     ContextMenuItem      |      |        Zone               |
+--------------------------+      +--------------------------+      +--------------------------+
| action:applied {detail?} |      | id / label / icon?       |      | id / name / color         |
| action:rejected {error}  |      | onClick? / subItems?     |      | nodeIds[]                 |
| state:committed          |      | shortcut? / separator?   |      | (rendered by              |
| ui:drag:ended            |      +--------------------------+      |  ZoneFrameOverlay)        |
| ui:delete:attempted      |                                        +--------------------------+
| ui:state:imported        |
| ui:recording:imported    |
| history:undo/redo/cleared|   (declared; no emitter)
+--------------------------+
```

> **Note.** The `history:undo`, `history:redo`, and `history:cleared` kinds are
> declared in the `GraphEvent` union but currently have **no emitter** — the
> store's `dispatch` only emits `action:applied` / `action:rejected` /
> `state:committed` (`src/components/organisms/FullGraph/graphStore.ts` ›
> `createGraphStore`). The `ui:*` kinds are emitted by `<FullGraph>`. (The JSDoc
> comment above the history variants in the `graphEvent.ts` **source** —
> "History events — emitted by the store on undo/redo/clear" — is stale; no code
> path emits these events.)

---

## Functional Dependency Diagram

```
FullGraph (outer)                          FullGraph.tsx › FullGraph
  |
  +-- ReactFlowProvider                  (from @xyflow/react)
  +-- FullGraphContext.Provider          (provides { allProps })   FullGraphState.ts › FullGraphContext
  +-- RecordContext.Provider             (controlled executionRecord) FullGraphState.ts › RecordContext
  |
  +-- FullGraphWithReactFlowProvider (inner)   FullGraph.tsx › FullGraphWithReactFlowProvider
        |
        +-- useReactFlow()               (screenToFlowPosition, fitView, getNodes)
        +-- useUpdateNodeInternals()     (re-measure handles after type/loop/switch edits)
        +-- useGraphImportExport()       (export/import handlers + hidden file inputs)
        +-- createLoopMenuItem()         ("Add Loop")
        +-- createSwitchMenuItem()       ("Add Switch")
        +-- createNodeContextMenu()      ("Add Node" submenu)
        +-- createImportExportMenuItems()("Import/Export" submenu)
        +-- getCurrentNodesAndEdgesFromState()  (nodes/edges/zones for the active scope)
        +-- canRemoveLoopNodesAndEdges() (onBeforeDelete guard)
        +-- getLoopStructureFromNode() / getSwitchStructureFromNode() (drawer data)
        |
        +-- ErrorBoundary (graph)        wraps everything
        |     +-- InputComponentRegistryContext.Provider (inputComponents)
        |
        +-- [conditional] RecordingViewStateProvider   RecordingViewStateProvider.tsx › RecordingViewStateProvider
        |     +-- ErrorBoundary (runner)
        |     +-- RunnerOverlay                        RunnerOverlay.tsx › RunnerOverlay
        |           +-- useNodeRunner()    (compile, execute, replay, record)
        |           +-- RunnerContext.Provider (nodeRunnerStates, selectedStepRecord,
        |           |                            edgeValuesAnimated)
        |           +-- NodeRunnerPanel    (transport, timeline, inspector)
        |
        +-- graphContent (shared between runner and non-runner modes)
        |     +-- ReactFlow               (core graph renderer; key=reactFlowKey)
        |     |     +-- Controls, Background, MiniMap (pannable)
        |     |     +-- ZoneFrameOverlay   (convex-hull zone frames)
        |     |     +-- ConfigurableConnection (custom drag preview)
        |     +-- FullGraphContextMenu     (floating context menu)
        |     +-- FullGraphNodeGroupSelector (back button + dropdown + breadcrumb)
        |
        +-- FileInputElements              (two hidden <input type="file">)
        +-- NodeTypeEditDrawer             (group / node-type editor)
        +-- LoopEditDrawer                 (loop channel editor)
        +-- SwitchEditDrawer               (switch channel editor)
```

---

## Data Flow Diagram

```
  User provides:
  state, dispatch, functionImplementations?, executionRecord?, inputComponents?, …
        |
        v
+-------+--------+
|   FullGraph     |  ReactFlowProvider
|   (outer)       |  FullGraphContext.Provider value = createContextValue({state, dispatch})
|                 |  RecordContext.Provider value = { executionRecord, setExecutionRecord }
+-------+--------+
        |
        v
+-------+------------------------------------+
| FullGraphWithReactFlowProvider              |
|                                             |
|  state ─> getCurrentNodesAndEdgesFromState  |  (filtered by openedNodeGroupStack)
|             -> { nodes, edges, zones }      |
|                 |                           |
|     +-----------+   +-------------------+   |
|     | ReactFlow |   | ContextMenu items |   |
|     |  nodes    |   |  loop / switch    |   |
|     |  edges    |   |  add-node         |   |
|     |  zones    |   |  import/export    |   |
|     +-----------+   +-------------------+   |
|          |                                  |
|  onNodesChange  ─> BEGIN_BATCH (drag start) |
|                    UPDATE_NODE_BY_REACT_FLOW|
|                    END_BATCH   (drag end)   |
|  onEdgesChange  ─> UPDATE_EDGES_BY_REACT_FLOW
|  onConnect      ─> ADD_EDGE_BY_REACT_FLOW   |
|  onConnectEnd   ─> onGraphEvent(ui:drag:ended)
|  onViewportChange ─> SET_VIEWPORT           |
|  onBeforeDelete ─> canRemoveLoopNodesAndEdges
|                    + onGraphEvent(ui:delete:attempted)
|  keydown Ctrl+Z / Shift+Z / Y ─> UNDO / REDO|
|                                             |
|  activeDrawer ─> NodeTypeEditDrawer / Loop  |
|                  EditDrawer / SwitchEditDrawer
|                  onSave ─> UPDATE_NODE_TYPE /|
|                  UPDATE_LOOP / UPDATE_SWITCH |
|                  + updateNodeInternals()     |
|                                             |
|  [if functionImplementations]               |
|  +----------------------------------------+ |
|  | RunnerOverlay                          | |
|  |  useNodeRunner({state, funcImpl,       | |
|  |    executionRecord, onExecutionRecord- | |
|  |    Change})                            | |
|  |       |                                | |
|  |       v                                | |
|  |  nodeRunnerStates (Map) + selectedStep | |
|  |       |                                | |
|  |       v                                | |
|  |  RunnerContext.Provider                | |
|  |       |                                | |
|  |       v                                | |
|  |  NodeRunnerPanel (run/pause/step/stop/ | |
|  |    reset/mode/scrub/maxLoopIterations) | |
|  +----------------------------------------+ |
+---------------------------------------------+
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
|  |  |  ErrorBoundary > InputComponentRegistryContext               | | |
|  |  |                                                               | | |
|  |  |  +-- ReactFlow ---------+  +-- ContextMenu ---------------+ | | |
|  |  |  | ConfigurableNode     |  | createLoopMenuItem            | | | |
|  |  |  | ConfigurableEdge     |  | createSwitchMenuItem          | | | |
|  |  |  | ConfigurableConnect. |  | createNodeContextMenu         | | | |
|  |  |  | ZoneFrameOverlay     |  | createImportExportMenuItems   | | | |
|  |  |  | Controls/Background/ |  +-------------------------------+ | | |
|  |  |  | MiniMap              |                                     | | |
|  |  |  +----------------------+                                     | | |
|  |  |                                                               | | |
|  |  |  +-- NodeGroupSelector -+  +-- Edit Drawers --------------+ | | |
|  |  |  | back / dropdown /    |  | NodeTypeEditDrawer            | | | |
|  |  |  | breadcrumb / edit    |  | LoopEditDrawer                | | | |
|  |  |  +----------------------+  | SwitchEditDrawer              | | | |
|  |  |                            +-------------------------------+ | | |
|  |  |  +-- RunnerOverlay (conditional) -----------------------+   | | |
|  |  |  | RecordingViewStateProvider + ErrorBoundary           |   | | |
|  |  |  | useNodeRunner / RunnerContext / NodeRunnerPanel       |   | | |
|  |  |  +------------------------------------------------------+   | | |
|  |  +--------------------------------------------------------------+ | |
|  +--------------------------------------------------------------------+ |
|                                                                        |
|  +-- State Layer ----------------------------------------------------+ |
|  |  createGraphStore (external store) + useFullGraph                 | |
|  |    (useSyncExternalStore)                                         | |
|  |  validateAction -> applyValidatedAction (Immer + undo/redo)        | |
|  |  FullGraphContext { allProps }   RecordContext { executionRecord } | |
|  |  RunnerContext { nodeRunnerStates, selectedStepRecord, … }         | |
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

Defined at `src/components/organisms/FullGraph/FullGraph.tsx` › `FullGraph`.

The outermost component. Its job is to set up the three top-level providers and
the controlled-record memo, then render `FullGraphWithReactFlowProvider`:

1. `ReactFlowProvider` — required by `@xyflow/react` so `useReactFlow()` /
   `useUpdateNodeInternals()` work in descendants
2. `FullGraphContext.Provider` — provides `{ allProps }` via
   `createContextValue({ state, dispatch })`
3. `RecordContext.Provider` — provides
   `{ executionRecord, setExecutionRecord }`, wiring the controlled
   `executionRecord` / `onExecutionRecordChange` props down to `RunnerOverlay`.
   When the consumer omits `onExecutionRecordChange`, a stable `noop` is used so
   the runner stays internally controlled.

### FullGraphWithReactFlowProvider (implementation)

Defined at `src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`. Receives all props except `executionRecord` /
`onExecutionRecordChange` (those flow via `RecordContext`). It:

- Calls `useReactFlow()` (`screenToFlowPosition`, `fitView`, `getNodes`) and
  `useUpdateNodeInternals()`
- Calls `useGraphImportExport()` to obtain export/import handlers, the two
  hidden file-input refs, `executionRecordRef`, `loadRecordRef`, and a
  `FileInputElements` component
- Manages context-menu open/close state (`{ isOpen, position }`)
- Derives the active drawer target from `state.activeDrawer` (`editNodeType` →
  node type id, `editLoop` / `editSwitch` → node id) and computes the loop
  triplet / switch pair data via `getLoopStructureFromNode` /
  `getSwitchStructureFromNode`
- Builds context menu items from four sources: `createLoopMenuItem`,
  `createSwitchMenuItem`, `createNodeContextMenu`, `createImportExportMenuItems`
- Computes `currentNodesAndEdges` (nodes, edges, **zones**) from state via
  `getCurrentNodesAndEdgesFromState()` (filtered by `openedNodeGroupStack`)
- Renders `ReactFlow` (keyed by `reactFlowKey`) with custom `nodeTypes` /
  `edgeTypes`, `Controls`, `Background`, `MiniMap pannable`, and
  `ZoneFrameOverlay`
- Renders `FullGraphContextMenu` and `FullGraphNodeGroupSelector`
- Installs a `keydown` listener for undo/redo (gated by
  `enableUndoRedoShortcuts`)
- Batches drag moves into a single undo entry via `BEGIN_BATCH` / `END_BATCH`
- Conditionally wraps graph content in `RecordingViewStateProvider` →
  `ErrorBoundary` → `RunnerOverlay` when `functionImplementations` is provided
- Renders `<FileInputElements />` plus the three edit drawers
- Wraps the whole tree in a top-level `ErrorBoundary` and an
  `InputComponentRegistryContext.Provider`

### RunnerOverlay (conditional runner wrapper)

Defined at `src/components/organisms/FullGraph/RunnerOverlay.tsx` ›
`RunnerOverlay`. Rendered only when `functionImplementations` is provided. It:

- Reads the controlled record from `useRecordContext()` and calls
  `useNodeRunner({ state, functionImplementations, executionRecord, onExecutionRecordChange })`
- Reads UI preferences from `useRecordingViewState()` (selected step, panel
  open, edge-value animation, etc.)
- Builds a combined `nodeRunnerStates` Map by merging the runner's
  `nodeVisualStates`, `nodeWarnings`, and `nodeErrors`
- Provides `RunnerContext` with
  `{ nodeRunnerStates, selectedStepRecord, edgeValuesAnimated }`
- Renders `NodeRunnerPanel` with all runner controls, plus a "navigate to node"
  callback (`setCenter`) and a floating "Runner" reopen button when the panel is
  closed
- Exposes the execution-record getter and `loadRecord` to the parent via the
  `onExecutionRecordRef` / `loadRecordRef` refs (used by import/export); the
  record getter merges the current `viewState` (run mode, max loop iterations,
  panel/timeline prefs) into the returned record

---

## Props (FullGraphProps)

Defined at `src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphProps`.

| Prop                       | Type                                           | Required | Description                                                                                                                                                        |
| -------------------------- | ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `state`                    | `State<D, N, U, C>`                            | Yes      | Complete graph state: nodes, edges, dataTypes, typeOfNodes, openedNodeGroupStack, viewport, zones, history                                                         |
| `dispatch`                 | `ActionDispatch<[action: Action<D, N, U, C>]>` | Yes      | Dispatch from `useFullGraph` (or raw `useReducer`)                                                                                                                 |
| `functionImplementations`  | `FunctionImplementations<N>`                   | No       | Map of nodeTypeId → execution function. When provided, mounts the runner overlay                                                                                   |
| `onStateImported`          | `(importedState: State<D,N,U,C>) => void`      | No       | Called after a successful state import with the merged state                                                                                                       |
| `onRecordingImported`      | `(record: ExecutionRecord) => void`            | No       | Called after a successful recording import                                                                                                                         |
| `onImportError`            | `(errors: string[]) => void`                   | No       | Called when import validation (state or recording) fails                                                                                                           |
| `executionRecord`          | `ExecutionRecord \| null`                      | No       | Controlled execution record. When provided, the runner uses it instead of internal state                                                                           |
| `onExecutionRecordChange`  | `(record: ExecutionRecord \| null) => void`    | No       | Called whenever the record changes (run completes, reset, load, etc.)                                                                                              |
| `onGraphEvent`             | `(event: GraphEvent<D,N,U,C>) => void`         | No       | Unified observability stream for UI-layer lifecycle events (see below)                                                                                             |
| `inputComponents`          | `InputComponentRegistry<D>`                    | No       | Registry of custom input components keyed by `DataTypeUniqueId` (for `unsupportedDirectly` types)                                                                  |
| `enableUndoRedoShortcuts`  | `boolean`                                      | No       | Listen for Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl/⌘+Y. **Defaults to `true`**                                                                                              |
| `rootInputs`               | `Record<string, unknown>`                      | No       | Values seeded into the root Graph Input on run, keyed by handle **name** OR stable handle **id** (id is rename-proof). Mirrors codegen's `runGraph` params         |
| `allowRootIORename`        | `boolean`                                      | No       | Root I/O renames on connect (group parity) + editor rename. **Defaults to `true`** (behavior change — see Root I/O contract stability). `false` keeps names stable |
| `allowRootIOStructureEdit` | `boolean`                                      | No       | Root I/O grows a blank spare on connect + editor add/delete. **Defaults to `true`**. `false` freezes the root handle count                                         |

The four generic type parameters default to: `DataTypeUniqueId = string`,
`NodeTypeUniqueId = string`, `UnderlyingType = SupportedUnderlyingTypes`, and
`ComplexSchemaType = never` (it is only a `z.ZodType` when `UnderlyingType`
extends `'complex'`). Consumers only supply them for stricter type safety;
`useFullGraph<MyDataTypeId, MyNodeTypeId>(…)` is the common form.

### Root I/O contract stability

A root Graph Input/Output handle's **name is its public contract**: it is the
`runGraph(a, b)` parameter / return identifier and the key of the `rootInputs`
prop. By default (`allowRootIORename` and `allowRootIOStructureEdit` both
`true`), connecting a wire to a root boundary handle renames it to the connected
source's name and grows a fresh blank spare — full parity with group boundaries.
This means **an interactive connect can move a `rootInputs` key.** These three
concepts are a unit; documenting them apart is the trap.

If you depend on a stable `runGraph(a, b)` signature, choose one:

- **Lock it:** set `allowRootIORename={false}` (and usually
  `allowRootIOStructureEdit={false}`). The Graph I/O editor's rename / add /
  delete affordances disable in lockstep with the inference path — one prop,
  both layers.
- **Or key by id:** pass `rootInputs` keyed by the stable handle **id** instead
  of the name. `seedRootInputs` (`src/utils/nodeRunner/executor/rootIo.ts` ›
  `seedRootInputs`) honors id keys as a fallback, so id-keyed inputs survive
  renames. `record.rootOutputs` stays name-keyed — byte-for-byte the object
  codegen's `runGraph` returns.

### `onGraphEvent` and `useFullGraph`'s `onGraphEvent` are two halves of one stream

The event taxonomy lives in `src/utils/nodeStateManagement/graphEvent.ts` ›
`GraphEvent`. Events come from two source layers and should usually share
**one** handler:

- **Reducer-layer events** — emitted by the store inside `useFullGraph`:
  `action:applied` (carries an optional per-action `detail`, e.g.
  `{ kind: 'ADD_NODE', nodeId, nodeType, position }`), `action:rejected`
  (carries the full `ValidationError` — switch on `.code`), and
  `state:committed` (post-commit render barrier with `nodeCount` / `edgeCount`).
  Wire via `useFullGraph(initialState, { onGraphEvent })`.
- **UI-layer events** — emitted by `<FullGraph>` for ReactFlow lifecycle moments
  that bypass the reducer: `ui:drag:ended` (from `onConnectEnd`, carries
  `isValid`), `ui:delete:attempted` (from the `onBeforeDelete` guard, carries
  `success` / `reason` / `nodeIds` / `edgeIds`), `ui:state:imported` (success +
  merged `state`, or failure + `errors`), and `ui:recording:imported`. Wire via
  `<FullGraph onGraphEvent={…} />`.

Pass the **same** handler to both for a single subscription point.

---

## Contexts

FullGraph defines and consumes five contexts. They are intentionally split so
that runner state and controlled-record state do not force every node to
re-render when only one of them changes.

A sixth, optional context lives OUTSIDE FullGraph: the consumer can wrap
`<FullGraph>` in `GraphThemeProvider` (from
`src/components/organisms/FullGraph/GraphThemeProvider.tsx` ›
`GraphThemeProvider`) to retheme the whole tree; components read it via
`src/utils/theme/GraphThemeContext.ts` › `useGraphTheme` (non-throwing —
`undefined` keeps the default dark look). See [themingDoc.md](./themingDoc.md).

### FullGraphContext

Defined at `src/components/organisms/FullGraph/FullGraphState.ts` ›
`FullGraphContext`.

```typescript
const FullGraphContext = createContext<{
  allProps: FullGraphProps;
}>(null!);
```

`allProps` carries the `state` and `dispatch` (plus the rest of FullGraph's
props) so deeply nested components (`ConfigurableNode`, `ContextAwareInput`,
`ContextAwareNodeHeaderActions`) can read them without prop drilling.

> **Changed from earlier versions:** `FullGraphContext` no longer carries
> `nodeRunnerStates`. Per-node runner state now lives in a separate
> `RunnerContext` (below), so non-runner editors don't re-render on every
> execution tick.

**`createContextValue` variance bridge**
(`src/components/organisms/FullGraph/FullGraphState.ts` › `createContextValue`):
React's `createContext` does not support generic type parameters. This function
erases the concrete generics to the context's default-param type. It returns
`{ allProps }` only. Safe because context consumers dispatch via
`actionTypesMap` constants, which produce valid payloads regardless of the
concrete generic params.

### RunnerContext

Defined at `src/components/organisms/FullGraph/FullGraphState.ts` ›
`RunnerContext`, **provided** by `RunnerOverlay`.

```typescript
type RunnerContextValue = {
  nodeRunnerStates: ReadonlyMap<string, NodeRunnerState>;
  selectedStepRecord: ExecutionStepRecord | null;
  edgeValuesAnimated: boolean;
};
const RunnerContext = createContext<RunnerContextValue | undefined>(undefined);
```

`ConfigurableNodeReactFlowWrapper`
(`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx`
› `ConfigurableNodeReactFlowWrapper`) reads `RunnerContext` to apply per-node
visual indicators (status border, error / warning surfacing) and step-scoped
values. The context is `undefined` outside the runner overlay (i.e., when
`functionImplementations` is not provided), so nodes fall back to the idle
visual state.

**NodeRunnerState type** (`src/components/organisms/FullGraph/FullGraphState.ts`
› `NodeRunnerState`):

```typescript
type NodeRunnerState = {
  visualState: NodeVisualState; // 'idle' | 'running' | 'completed' | 'errored' | 'skipped' | 'warning'
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};
```

### RecordContext

Defined at `src/components/organisms/FullGraph/FullGraphState.ts` ›
`RecordContext`, provided by the outer `FullGraph`.

```typescript
type RecordContextValue = {
  executionRecord: ExecutionRecord | null;
  setExecutionRecord: (record: ExecutionRecord | null) => void;
};
```

Bridges the controlled `executionRecord` / `onExecutionRecordChange` props to
`RunnerOverlay` (read via `useRecordContext()`), which forwards them into
`useNodeRunner`. This makes the execution record a fully controllable prop.

### InputComponentRegistryContext

Defined in `src/components/organisms/FullGraph/InputComponentRegistryContext.ts`
› `InputComponentRegistryContext`, provided by `FullGraphWithReactFlowProvider`.

```typescript
type InputComponentRegistry<DataTypeUniqueId extends string = string> = Partial<
  Record<DataTypeUniqueId, ComponentType<InputComponentProps>>
>;
```

Lets consumers register custom inline editors for data types whose
`underlyingType` resolves to `'unsupportedDirectly'`. Built-in types (string,
number, boolean) always use their native components. Follows the same
"prop-passed map, kept out of serialized state" pattern as
`functionImplementations`. Read via `useInputComponentRegistry()`.

### RecordingViewStateContext

Defined in `src/components/organisms/FullGraph/RecordingViewStateContext.ts` ›
`RecordingViewStateContext`, provided by `RecordingViewStateProvider` (from
`src/components/organisms/FullGraph/RecordingViewStateProvider.tsx` ›
`RecordingViewStateProvider`; only inside the runner branch). Holds all
runner/timeline UI preferences (selected step index, panel open, edge-value
animation, auto-scroll, time mode, timeline collapsed, selected loop iterations,
autoplay interval) and `getViewState` / `restoreViewState` serializers used to
persist these preferences into an `ExecutionRecord`'s `viewState` on export.

---

## State Management Integration

FullGraph is fully controlled. The recommended store is `useFullGraph`
(`src/components/organisms/FullGraph/FullGraphState.ts` › `useFullGraph`),
which:

- Creates an external Redux-style store **once** via `createGraphStore`
  (`src/components/organisms/FullGraph/graphStore.ts` › `createGraphStore`)
  using a lazy `useRef`
- Subscribes React with `useSyncExternalStore` (concurrent-safe, tear-resistant)
- Keeps the consumer's `onGraphEvent` in a ref so inline handlers don't recreate
  the store
- Emits `state:committed` from a render-commit `useEffect` keyed on node/edge
  counts

`createGraphStore.dispatch` runs synchronously and exactly once per call:
`validateAction(state, action)` → if valid,
`applyValidatedAction(prev, action, plan)` → identity short-circuit (no
notify/emit if `next === prev`) → `deriveAppliedEvent` / `deriveRejectedEvent` →
notify subscribers. Because dispatch is outside React's reducer pipeline, event
ids are diff-derived from the actually-committed state (the fix for the historic
"wrapper-emits-with-stale-id" bug). See
[State Management](../core/stateManagementDoc.md).

Direct `useReducer(mainReducer, …)` consumers still work: `mainReducer`
(`src/utils/nodeStateManagement/mainReducer.ts` › `mainReducer`) delegates to
the same `validateAction` + `applyValidatedAction`.

### Action types (29)

`actionTypes` (`src/utils/nodeStateManagement/mainReducer.ts` › `actionTypes`):
`ADD_NODE`, `ADD_NODE_AND_SELECT`, `UPDATE_NODE_BY_REACT_FLOW`,
`UPDATE_EDGES_BY_REACT_FLOW`, `ADD_EDGE_BY_REACT_FLOW`, `UPDATE_INPUT_VALUE`,
`OPEN_NODE_GROUP`, `CLOSE_NODE_GROUP`, `ADD_NODE_GROUP`, `SET_VIEWPORT`,
`REPLACE_STATE`, `UPDATE_NODE_TYPE`, `ADD_LOOP`, `UPDATE_LOOP`, `OPEN_DRAWER`,
`CLOSE_DRAWER`, `ADD_SWITCH`, `UPDATE_SWITCH`, `UNDO`, `REDO`, `BEGIN_BATCH`,
`END_BATCH`, `CLEAR_HISTORY`, `DELETE_NODE_TYPE_HANDLES`,
`DELETE_LOOP_CHANNELS`, `DELETE_SWITCH_CHANNELS`, `UPDATE_GRAPH_IO_HANDLES`,
`REORDER_INPUT_CONNECTIONS`, `UPDATE_NODE_CUSTOM_NAME`. FullGraph dispatches
most of these directly; the exceptions are `ADD_NODE` and `UPDATE_INPUT_VALUE`
(from the context-menu helper and node inputs respectively), `ADD_LOOP` /
`ADD_SWITCH` (dispatched only transitively by the context-menu builders in
`src/components/molecules/ContextMenu/createLoopMenuItem.ts` ›
`createLoopMenuItem` and
`src/components/molecules/ContextMenu/createSwitchMenuItem.ts` ›
`createSwitchMenuItem`), `CLEAR_HISTORY` (a supported action the component never
dispatches itself), and the last six (`DELETE_NODE_TYPE_HANDLES` …
`UPDATE_NODE_CUSTOM_NAME`), which are dispatched from the editor drawers / node
UI. See the full dispatched-action list in the **State Management** relationship
section below.

---

## ReactFlow Integration

### nodeTypes and edgeTypes

Defined in `src/components/organisms/FullGraph/FullGraphCustomNodesAndEdges.ts`.

```typescript
const nodeTypes = { configurableNode: ConfigurableNodeReactFlowWrapper };
const edgeTypes = { configurableEdge: ConfigurableEdge };
```

All nodes use the `configurableNode` type; all edges use the `configurableEdge`
type. ReactFlow dispatches rendering by the `type` field of each node/edge.

### Event handlers

| Handler            | Behavior                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onNodesChange`    | Detects drag start/end in the change set; brackets the changes with `BEGIN_BATCH` / `END_BATCH`; dispatches `UPDATE_NODE_BY_REACT_FLOW` with the raw changes               |
| `onEdgesChange`    | Dispatches `UPDATE_EDGES_BY_REACT_FLOW` (edge selection / removal)                                                                                                         |
| `onConnect`        | Dispatches `ADD_EDGE_BY_REACT_FLOW` with the ReactFlow `Connection`                                                                                                        |
| `onConnectEnd`     | Fires `onGraphEvent({ kind: 'ui:drag:ended', isValid })` — pure observability, no dispatch                                                                                 |
| `onViewportChange` | Dispatches `SET_VIEWPORT` (controlled pan/zoom)                                                                                                                            |
| `onBeforeDelete`   | Validates loop/switch atomic deletion via `canRemoveLoopNodesAndEdges()` (scoped to the current group view); fires `ui:delete:attempted`; returns `success` to allow/block |

### Drag batching

`onNodesChange` inspects each `NodeChange` for `type === 'position'` with a
`dragging` flag. On the first `dragging: true` it dispatches `BEGIN_BATCH`
(once, guarded by `isDraggingRef`); on `dragging: false` it dispatches
`END_BATCH`. This collapses an entire drag into a single undo entry rather than
one entry per intermediate position. (See
[Undo/Redo History](../core/historyDoc.md).)

### Viewport management

- **Controlled viewport**: `state.viewport` is passed to ReactFlow and updated
  via `SET_VIEWPORT` on every change
- **Auto-frame on group navigation**: when `state.viewport` is `undefined`
  (e.g., after opening/closing a node group), an effect either calls
  `fitView({ maxZoom: 0.5, minZoom: 0.1 })` if there are nodes, or dispatches
  `SET_VIEWPORT` with `{ x: 0, y: 0, zoom: 0.45 }` for an empty scope
  (`src/components/organisms/FullGraph/FullGraph.tsx` ›
  `FullGraphWithReactFlowProvider`)
- **ReactFlow config**: `maxZoom: 1`, `minZoom: 0.1`, `colorMode='dark'`,
  `selectNodesOnDrag`, `elevateNodesOnSelect`, `elevateEdgesOnSelect`,
  `selectionMode={SelectionMode.Partial}`,
  `deleteKeyCode={['Backspace','Delete','x']}`,
  `proOptions={{ hideAttribution: true }}`, and
  `connectionLineComponent={ConfigurableConnection}`

### Decorations

`Controls`, `Background`, and `MiniMap pannable` are rendered inside
`<ReactFlow>`, alongside `ZoneFrameOverlay` (below).

---

## Zone Frame Overlay

`ZoneFrameOverlay`
(`src/components/molecules/ZoneFrameOverlay/ZoneFrameOverlay.tsx` ›
`ZoneFrameOverlay`) is rendered inside `<ReactFlow>` and draws the dashed
colored frames behind zone member nodes (loop pre-stop/post-stop bodies, switch
true/false branches).

- Receives `zones={currentNodesAndEdges.zones}` and
  `nodes={currentNodesAndEdges.nodes}` (zones come from the active scope:
  root-level `state.zones`, or the opened group's `subtree.zones`, via
  `getCurrentNodesAndEdgesFromState`)
- Reads the live transform from `useStore` (ReactFlow), so the overlay tracks
  pan/zoom in sync with the canvas
- For each zone with at least one member node, computes a padded convex hull
  (`computePaddedHull(rects, 24)` from
  `src/components/molecules/ZoneFrameOverlay/convexHull.ts` ›
  `computePaddedHull`) and renders a dashed `<polygon>` plus a `<text>` label at
  the top-left, both colored by `zone.color`

Zone data is UI-only state (stripped on export, rehydrated on import). See
[Zones](../features/zonesDoc.md).

---

## Context Menu Integration

`FullGraphWithReactFlowProvider` builds `contextMenuItems` by spreading four
generators (`src/components/organisms/FullGraph/FullGraph.tsx` ›
`contextMenuItems`), in order:

1. **`createLoopMenuItem`** — a single "Add Loop" item that dispatches
   `ADD_LOOP` at the flow-space click position
2. **`createSwitchMenuItem`** — a single "Add Switch" item that dispatches
   `ADD_SWITCH` at the flow-space click position
3. **`createNodeContextMenu`** — the "Add Node" submenu built from
   `state.typeOfNodes`. Honors `locationInContextMenu` nesting,
   `priorityInContextMenu` ordering, recursion filtering
   (`isRecursionAllowed: !state.enableRecursionChecking` with the current
   group's `nodeType`), and `hiddenNodeTypesInContextMenu`. Dispatches
   `ADD_NODE_AND_SELECT` on click
4. **`createImportExportMenuItems`** — the "Import/Export" submenu (four items,
   below)

`onContextMenu` captures the screen click position and opens the menu; `onClick`
on the canvas closes it. `FullGraphContextMenu`
(`src/components/organisms/FullGraph/FullGraphContextMenu.tsx` ›
`FullGraphContextMenu`) positions the menu at the click point with
`@floating-ui/react` (`bottom-start`, `offset(5)`,
`flip({ fallbackPlacements: ['top-start'] })`, `shift({ padding: 8 })`) and
fades in/out. See [Context Menu](contextMenuDoc.md).

### Import/Export items

`createImportExportMenuItems()`
(`src/components/organisms/FullGraph/createImportExportMenuItems.ts` ›
`createImportExportMenuItems`) builds one "Import/Export" parent
(`ArrowDownUpIcon`, `separator: true`) with four children: **Export State**,
**Import State**, **Export Recording**, **Import Recording**. Each child calls
its handler then `closeMenu()`. The export items call the handlers from
`useGraphImportExport`; the import items click the corresponding hidden file
input.

---

## Node Group Navigation

### FullGraphNodeGroupSelector

Defined in `src/components/organisms/FullGraph/FullGraphNodeGroupSelector.tsx` ›
`FullGraphNodeGroupSelector`.

| Prop                   | Type                                               | Description                                                                            |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `nodeGroups`           | `{ id: string; name: string }[]`                   | All node types with a `subtree` defined (computed from `state.typeOfNodes`)            |
| `value`                | `string`                                           | Currently opened group's `nodeType` (empty string at root)                             |
| `setValue`             | `(value: string) => void`                          | Dispatches `OPEN_NODE_GROUP` with `{ nodeType }`                                       |
| `handleAddNewGroup`    | `() => void`                                       | Dispatches `ADD_NODE_GROUP`                                                            |
| `enableBackButton`     | `boolean`                                          | True when `openedNodeGroupStack.length > 0`                                            |
| `handleBack`           | `() => void`                                       | Dispatches `CLOSE_NODE_GROUP`                                                          |
| `openedNodeGroupStack` | `{ id: string; name: string; nodeType: string }[]` | Breadcrumb path (each entry's `id` combines `nodeType` + optional `nodeId`)            |
| `onEditNodeType`       | `(nodeTypeId: string) => void`                     | Dispatches `OPEN_DRAWER` with `{ activeDrawer: { type: 'editNodeType', nodeTypeId } }` |

### Breadcrumb, dropdown, back, and edit

- A **back button** (`ArrowLeftIcon`) dispatches `CLOSE_NODE_GROUP`, disabled at
  root level
- A **dropdown** (`Select`) lists every group node type plus an "Add New Node
  Group" item (a sentinel value that triggers `handleAddNewGroup`)
- The **breadcrumb** renders the opened stack inside a
  `ScrollableButtonContainer`, separated by `ChevronRight` icons
- The **deepest** breadcrumb entry shows a `Pencil` button that opens the
  node-type edit drawer for the current group via `onEditNodeType`

---

## Editor Drawers

FullGraph renders three slide-in drawers (right edge, `translateX` animation via
`useSlideAnimation`). Each is opened by dispatching `OPEN_DRAWER` with an
`ActiveDrawer` discriminant (`src/utils/nodeStateManagement/types.ts` ›
`ActiveDrawer`) and closed via `CLOSE_DRAWER`. `state.activeDrawer` is UI-only
state (stripped on export). After a save, FullGraph calls
`updateNodeInternals(...)` on a `requestAnimationFrame` so ReactFlow re-measures
the changed handles.

| Drawer               | Opened by `activeDrawer`               | Save dispatches    | Source                                         |
| -------------------- | -------------------------------------- | ------------------ | ---------------------------------------------- |
| `NodeTypeEditDrawer` | `{ type: 'editNodeType', nodeTypeId }` | `UPDATE_NODE_TYPE` | `src/components/molecules/NodeTypeEditDrawer/` |
| `LoopEditDrawer`     | `{ type: 'editLoop', nodeId }`         | `UPDATE_LOOP`      | `src/components/molecules/LoopEditDrawer/`     |
| `SwitchEditDrawer`   | `{ type: 'editSwitch', nodeId }`       | `UPDATE_SWITCH`    | `src/components/molecules/SwitchEditDrawer/`   |

- **NodeTypeEditDrawer** edits a node type's `name`, `headerColor`, and the
  order / names of its `inputs` (including input panels) and `outputs`. On save
  with changed inputs/outputs, FullGraph re-measures all instances of that type
  plus every `groupInput` / `groupOutput` node
  (`src/components/organisms/FullGraph/FullGraph.tsx` › `handleSaveNodeType`).
- **LoopEditDrawer** edits the synchronized data channels ("levels") across the
  loop triplet (loopStart / loopStop / loopEnd). FullGraph resolves the triplet
  via `getLoopStructureFromNode`
  (`src/components/organisms/FullGraph/FullGraph.tsx` › `editLoopTriplet`) and
  dispatches `UPDATE_LOOP` with per-level handle maps.
- **SwitchEditDrawer** edits the data channels across the switch pair
  (switchStart / switchEnd). FullGraph resolves the pair via
  `getSwitchStructureFromNode`
  (`src/components/organisms/FullGraph/FullGraph.tsx` › `editSwitchPair`) and
  dispatches `UPDATE_SWITCH`.

For the channel reorder/rename model and structure details, see
[Editor Drawers](editorsDoc.md), [Loops](../features/loopsDoc.md), and
[Switches](../features/switchesDoc.md).

---

## Keyboard Undo/Redo

`FullGraphWithReactFlowProvider` installs a `document` `keydown` listener
(`src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`), active when
`enableUndoRedoShortcuts !== false` (default `true`):

- **Ctrl/⌘ + Z** (without Shift) → dispatches `UNDO`
- **Ctrl/⌘ + Shift + Z** or **Ctrl/⌘ + Y** → dispatches `REDO`

History itself (Immer-patch undo/redo stacks, batching, max size) lives in
`state.history` and is managed by `applyValidatedAction`
(`src/utils/nodeStateManagement/applyWithHistory.ts` › `applyValidatedAction`)
plus the helpers in `src/components/organisms/FullGraph/historyTypes.ts`
(`isUndoable`, `recordInHistory`, `filterHistoryPatches`, `applyPatchesToDraft`,
`createEmptyHistory`). `SET_VIEWPORT`, `REPLACE_STATE`, `OPEN_DRAWER`,
`CLOSE_DRAWER`, `UNDO`, `REDO`, `BEGIN_BATCH`, `END_BATCH`, and `CLEAR_HISTORY`
are non-undoable; pure-selection node changes and edge-passthrough changes are
also skipped. See [Undo/Redo History](../core/historyDoc.md).

---

## Runner Integration

### RunnerOverlay

When `functionImplementations` is provided, graph content is wrapped in
`RecordingViewStateProvider` → `ErrorBoundary` → `RunnerOverlay`. Otherwise the
graph content renders directly with no runner functionality (and `RunnerContext`
stays `undefined`).

The overlay:

1. Calls
   `useNodeRunner({ state, functionImplementations, executionRecord, onExecutionRecordChange })`
2. Merges `runner.nodeVisualStates`, `runner.nodeWarnings`, and
   `runner.nodeErrors` into a single `Map<nodeId, NodeRunnerState>`
   (`src/components/organisms/FullGraph/RunnerOverlay.tsx` › `RunnerOverlay`)
3. Computes `selectedStepRecord` from `selectedStepIndex` + the execution record
4. Provides `RunnerContext` with
   `{ nodeRunnerStates, selectedStepRecord, edgeValuesAnimated }`
5. Renders `NodeRunnerPanel`, wiring `runnerState`, `record`,
   `currentStepIndex`, and the transport callbacks (`onRun`, `onPause`,
   `onStep`, `onStop`, `onReset`, `onModeChange`, `onMaxLoopIterationsChange`,
   `onScrubTo`, `onNavigateToNode`)
6. In `stepByStep` mode, `onRun` resumes when paused instead of starting a fresh
   run (`src/components/organisms/FullGraph/RunnerOverlay.tsx` ›
   `RunnerOverlay`)

### nodeRunnerStates propagation

```
RunnerOverlay
  |
  +-- useNodeRunner() returns:
  |     nodeVisualStates: Map<nodeId, 'idle'|'running'|'completed'|'errored'|'skipped'|'warning'>
  |     nodeWarnings:     Map<nodeId, string[]>
  |     nodeErrors:       Map<nodeId, GraphError[]>
  |
  +-- merges into a single Map<nodeId, NodeRunnerState>
  |
  +-- RunnerContext.Provider value.nodeRunnerStates
  |
  +-- ConfigurableNodeReactFlowWrapper reads RunnerContext
        to apply visual indicators (border color, status icon, value badges)
```

### Panel toggle button

When the panel is closed (`isRunnerPanelOpen === false` in
`RecordingViewStateContext`), a floating "Runner" button with a `Play` icon
appears at the bottom-center of the graph; clicking it reopens the panel
(`src/components/organisms/FullGraph/RunnerOverlay.tsx` › `RunnerOverlay`).

### Navigate-to-node

`onNavigateToNode` centers the canvas on a node via `setCenter`, offsetting the
Y to account for the runner panel covering the bottom of the canvas
(`src/components/organisms/FullGraph/RunnerOverlay.tsx` › `RunnerOverlay`).

---

## Import/Export Integration

All import/export logic is encapsulated in the `useGraphImportExport` hook
(`src/components/organisms/FullGraph/useGraphImportExport.tsx` ›
`useGraphImportExport`). FullGraph consumes its handlers and the
`FileInputElements` component.

### State export/import

**Export** — `handleExportState()` calls
`exportGraphState(state, { pretty: true })` and triggers a browser download of
`graph-state.json` via the internal `downloadJson()` helper.

**Import** — the "Import State" menu item clicks the hidden
`importStateInputRef` file input; its `onChange` reads the file with
`FileReader.readAsText` and calls `handleImportState(json)`, which:

1. Calls `importGraphState(json, { dataTypes, typeOfNodes, repair: { … } })`
   with repair strategies `removeOrphanEdges`, `removeDuplicateNodeIds`,
   `removeDuplicateEdgeIds`, `fillMissingDefaults`, `rehydrateDataTypeObjects`
2. On success: replaces the imported `dataTypes` / `typeOfNodes` with the
   **live** originals (export strips non-serializable fields like `onChange`,
   `complexSchema`), then dispatches `REPLACE_STATE` with the merged state
3. Increments `reactFlowKey` (`setReactFlowKey((k) => k + 1)`) to **remount**
   ReactFlow, so Handle registration happens before edges try to resolve handles
4. Fires `onGraphEvent({ kind: 'ui:state:imported', success: true, state })` and
   calls `onStateImported?.(merged)`
5. On failure: maps errors to `"${path}: ${message}"`, fires the failure variant
   of `ui:state:imported`, and calls `onImportError?.(errors)`

### Recording export/import

**Export** — `handleExportRecording()` reads the current record from
`executionRecordRef.current?.()` (populated by `RunnerOverlay`, which merges the
current `viewState`), then `exportExecutionRecord(record, { pretty: true })` and
downloads `execution-recording.json`.

**Import** — `handleImportRecording(json)` calls
`importExecutionRecord(json, { repair: { sanitizeNonSerializableValues: true, removeOrphanSteps: true } })`,
then loads the deserialized record into the runner via
`loadRecordRef.current?.(result.data)`. `loadRecord` validates the record
against the current graph and restores the recording's `viewState` (including
run mode and max loop iterations). On invalid → `onImportError`; on success →
`onGraphEvent({ kind: 'ui:recording:imported' })` and
`onRecordingImported?.(record)`.

### Hidden file inputs

`useGraphImportExport` returns a `FileInputElements` component rendering two
hidden `<input type="file" accept=".json">` elements (one for state, one for
recording). Both reset `e.target.value = ''` after reading to allow re-importing
the same file. `onGraphEvent` is captured in a ref inside the hook so identity
changes don't recreate `FileInputElements` and detach the input between the menu
click and the file selection. See
[Import/Export](../importExport/importExportDoc.md).

---

## Error Boundaries

FullGraph wraps its tree in `ErrorBoundary`
(`src/components/atoms/ErrorBoundary`) at two levels:

- An **outer** boundary around the entire editor — renders a "Graph rendering
  error" fallback with a Retry button
  (`src/components/organisms/FullGraph/FullGraph.tsx` ›
  `FullGraphWithReactFlowProvider`)
- An **inner** boundary around `RunnerOverlay` — renders a "Runner panel error"
  fallback so a runner crash doesn't take down the canvas
  (`src/components/organisms/FullGraph/FullGraph.tsx` ›
  `FullGraphWithReactFlowProvider`)

Both log to `console.error` via `onError`.

---

## Limitations and Notes

- **Viewport stored in state**: the viewport is held in reducer state and
  dispatched on every change, producing frequent (non-undoable) state updates
  during pan/zoom.
- **ReactFlow remount on import**: after importing state, the entire ReactFlow
  instance is remounted via `reactFlowKey`. Necessary for correct Handle
  registration timing, but causes a brief visual flash.
- **Generic variance bridge**: `createContextValue()` type-erases the generics;
  safe because consumers only dispatch via `actionTypesMap` constants.
- **Single context menu**: only one context menu is open at a time (a single
  `useState` in FullGraph). There is no node-specific (per-node) context menu.
- **UI-only state**: `activeDrawer`, `zones` / `zoneIndex`, and `history` are
  not serialized by default — they are stripped on export and rehydrated on
  import.

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

### With runner enabled (controlled record)

```tsx
import { useState } from 'react';
import {
  FullGraph,
  useFullGraph,
  makeFunctionImplementationsWithAutoInfer,
  type ExecutionRecord,
} from 'react-blender-nodes';

const functionImplementations = makeFunctionImplementationsWithAutoInfer({
  myNode: async (inputs) => ({ output: inputs.input * 2 }),
});

function MyEditor() {
  const { state, dispatch } = useFullGraph(initialState);
  const [record, setRecord] = useState<ExecutionRecord | null>(null);

  return (
    <div style={{ height: '600px', width: '100%' }}>
      <FullGraph
        state={state}
        dispatch={dispatch}
        functionImplementations={functionImplementations}
        executionRecord={record}
        onExecutionRecordChange={setRecord}
      />
    </div>
  );
}
```

### Unified observability (one handler, both layers)

```tsx
import { FullGraph, useFullGraph } from 'react-blender-nodes';
import type { GraphEvent } from 'react-blender-nodes';

function MyEditor() {
  const onGraphEvent = (event: GraphEvent) => {
    switch (event.kind) {
      case 'action:applied':
        if (event.detail?.kind === 'ADD_NODE')
          console.log('added node', event.detail.nodeId);
        break;
      case 'action:rejected':
        console.warn('rejected:', event.error.code);
        break;
      case 'ui:delete:attempted':
        if (!event.success) console.warn('delete blocked:', event.reason);
        break;
    }
  };

  // Reducer-layer events come from useFullGraph's wrapped dispatch …
  const { state, dispatch } = useFullGraph(initialState, { onGraphEvent });

  return (
    <div style={{ height: '600px', width: '100%' }}>
      {/* … UI-layer events come from FullGraph. Same handler. */}
      <FullGraph
        state={state}
        dispatch={dispatch}
        onGraphEvent={onGraphEvent}
      />
    </div>
  );
}
```

### Import callbacks, custom inputs, and disabling shortcuts

```tsx
<FullGraph
  state={state}
  dispatch={dispatch}
  inputComponents={{ myComplexType: MyCustomEditor }}
  enableUndoRedoShortcuts={false}
  onStateImported={(imported) => console.log('State imported', imported)}
  onRecordingImported={(record) => console.log('Recording imported', record)}
  onImportError={(errors) => alert(errors.join('\n'))}
/>
```

---

## Relationships with Other Features

### → [State Management](../core/stateManagementDoc.md)

FullGraph is controlled by `state` + `dispatch` (typically from `useFullGraph`,
backed by `createGraphStore` + `useSyncExternalStore`). It dispatches
`ADD_NODE_AND_SELECT`, `UPDATE_NODE_BY_REACT_FLOW`,
`UPDATE_EDGES_BY_REACT_FLOW`, `ADD_EDGE_BY_REACT_FLOW`, `SET_VIEWPORT`,
`OPEN_NODE_GROUP`, `CLOSE_NODE_GROUP`, `ADD_NODE_GROUP`, `REPLACE_STATE`,
`ADD_LOOP`, `UPDATE_LOOP`, `ADD_SWITCH`, `UPDATE_SWITCH`, `UPDATE_NODE_TYPE`,
`OPEN_DRAWER`, `CLOSE_DRAWER`, `UNDO`, `REDO`, `BEGIN_BATCH`, and `END_BATCH`.

### → [Undo/Redo History](../core/historyDoc.md)

FullGraph drives history with keyboard shortcuts (`UNDO` / `REDO`) and brackets
node drags with `BEGIN_BATCH` / `END_BATCH`. History lives in `state.history`.

### → [Editor Drawers](editorsDoc.md)

FullGraph hosts `NodeTypeEditDrawer`, `LoopEditDrawer`, and `SwitchEditDrawer`,
driven by `state.activeDrawer`, saving via `UPDATE_NODE_TYPE` / `UPDATE_LOOP` /
`UPDATE_SWITCH`.

### → [Zones](../features/zonesDoc.md)

FullGraph renders `ZoneFrameOverlay` inside ReactFlow, framing zone member nodes
for the active scope.

### → [ConfigurableNode](configurableNodeDoc.md)

All nodes render as `ConfigurableNodeReactFlowWrapper`
(`nodeTypes.configurableNode`). It reads `FullGraphContext` for state/dispatch
and `RunnerContext` for per-node runner visual states.

### → [ConfigurableEdge](configurableEdgeDoc.md)

All edges render as `ConfigurableEdge` (`edgeTypes.configurableEdge`).
Connections are validated in the validate → plan → apply pipeline.

### → [Context Menu](contextMenuDoc.md)

`FullGraphContextMenu` positions the `ContextMenu` molecule with
`@floating-ui/react`. Items are assembled from `createLoopMenuItem`,
`createSwitchMenuItem`, `createNodeContextMenu`, and
`createImportExportMenuItems`.

### → [Input Components](inputComponentsDoc.md)

`inputComponents` registers custom editors via `InputComponentRegistryContext`,
read by node inputs through `useInputComponentRegistry()`.

### → [NodeRunnerPanel](nodeRunnerPanelDoc.md)

Rendered by `RunnerOverlay` when `functionImplementations` is provided; receives
all transport controls and the execution record.

### → [Runner Hook (useNodeRunner)](../runner/runnerHookDoc.md)

Called inside `RunnerOverlay` with `state`, `functionImplementations`, and the
controlled `executionRecord` / `onExecutionRecordChange`. Provides compile →
execute (instant or step-by-step) → replay, plus `loadRecord()`.

### → [Import/Export](../importExport/importExportDoc.md)

Integrated through `useGraphImportExport`: context-menu items trigger hidden
file inputs; handlers call `exportGraphState` / `importGraphState` /
`exportExecutionRecord` / `importExecutionRecord`. State import re-merges live
`dataTypes` / `typeOfNodes`, dispatches `REPLACE_STATE`, and remounts ReactFlow.

### → [ReactFlow (external)](../external/reactFlowDoc.md)

FullGraph uses `@xyflow/react` as its renderer: `ReactFlowProvider` at the top,
`useReactFlow()` / `useUpdateNodeInternals()` for coordinate conversion and
re-measuring, and a controlled viewport with custom node/edge types and event
handlers.
