# State Management

## Overview

The state management subsystem is the single source of truth for the entire node
graph in `react-blender-nodes`. It owns the canonical representation of every
data type, node type, node instance, edge, viewport, zone, node-group navigation
stack, active drawer, and undo/redo history. Architecturally it is a strict
**validate -> plan -> apply** state machine wrapped by an **external,
Redux-style store** (`createGraphStore`) and an **Immer-patch-based undo/redo
history**.

Rather than mutating state in an ad-hoc reducer, every dispatch flows through
three pure-ish stages:

1. **validate** (`validateAction`) reads immutable state and returns a typed
   `Result<Plan, ValidationError> | null` — a description of intended change. It
   is deterministic and id-free (no `Math.random`, no id minting).
2. **apply with history** (`applyValidatedAction`) owns 3-path routing keyed off
   whether the action is undoable, capturing Immer patches when it is.
3. **apply** (`applyPlan`) is the ONLY mutator — a giant switch over `plan.kind`
   that mints ids and performs all draft mutations.

There are **two entry points** that share the same core: `mainReducer` (for
`useReducer` consumers) and `createGraphStore.dispatch` (the recommended path,
used by `useFullGraph` via `useSyncExternalStore`). Both delegate to
`applyValidatedAction`, so history is handled in exactly one place.

Key participants:

| Participant              | Location                                                                         | Role                                                          |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `State<D,N,U,C>`         | `src/utils/nodeStateManagement/types.ts` › `State`                               | Complete graph state type                                     |
| `validateAction`         | `src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`       | Pure validator -> `Result<Plan, ValidationError> \| null`     |
| `validateAddEdge`        | `src/utils/nodeStateManagement/planApply/validateAddEdge.ts` › `validateAddEdge` | 13-step edge-connection gauntlet                              |
| `Plan`                   | `src/utils/nodeStateManagement/planApply/types.ts` › `Plan`                      | Non-generic discriminated union of intended mutations (28)    |
| `ValidationError`        | `src/utils/nodeStateManagement/planApply/types.ts` › `ValidationError`           | Machine-readable rejection taxonomy (13 codes)                |
| `applyValidatedAction`   | `src/utils/nodeStateManagement/applyWithHistory.ts` › `applyValidatedAction`     | 3-path routing; patch capture + history recording             |
| `applyPlan`              | `src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`             | The ONLY mutator; mints ids; 28 plan kinds                    |
| `mainReducer`            | `src/utils/nodeStateManagement/mainReducer.ts` › `mainReducer`                   | `useReducer` entry; delegates to `applyValidatedAction`       |
| `Action`                 | `src/utils/nodeStateManagement/mainReducer.ts` › `Action`                        | Discriminated union of all 29 action payloads                 |
| `actionTypesMap`         | `src/utils/nodeStateManagement/mainReducer.ts` › `actionTypesMap`                | String-constant map for type-safe dispatch                    |
| `createGraphStore`       | `src/components/organisms/FullGraph/graphStore.ts` › `createGraphStore`          | External Redux-style store (recommended dispatch path)        |
| `useFullGraph`           | `src/components/organisms/FullGraph/FullGraphState.ts` › `useFullGraph`          | Store + `useSyncExternalStore` wrapper -> `{state, dispatch}` |
| History helpers          | `src/components/organisms/FullGraph/historyTypes.ts` › `isUndoable`              | `isUndoable`, `recordInHistory`, `applyPatchesToDraft`, …     |
| `GraphEvent` / derivers  | `src/utils/nodeStateManagement/graphEvent.ts` › `GraphEvent`                     | Observability stream + `deriveAppliedEvent`/`deriveRejected…` |
| `makeStateWithAutoInfer` | `src/utils/nodeStateManagement/types.ts` › `makeStateWithAutoInfer`              | Helper for type-safe state construction                       |

---

## Entity-Relationship Diagram

```
+--------------------------------------------------------------------+
|                            State<D,N,U,C>                          |
+--------------------------------------------------------------------+
|                                                                    |
|  dataTypes ─────────────> Record<D, DataType<U,C>>                 |
|                                                                    |
|  typeOfNodes ───────────> Record<N, TypeOfNode<D,N,U,C>>           |
|                              |                                     |
|                              +---> subtree? ──> { nodes, edges,    |
|                              |       numberOfReferences,           |
|                              |       inputNodeId, outputNodeId,    |
|                              |       zones?, zoneIndex? }          |
|                                                                    |
|  nodes ─────────────────> Nodes[]  (ReactFlow Node instances)      |
|  edges ─────────────────> Edges[]  (ReactFlow Edge instances)      |
|                                                                    |
|  openedNodeGroupStack? ─> Array<{nodeType, nodeId?, prevViewport}>|
|  viewport? ─────────────> { x, y, zoom }                          |
|                                                                    |
|  allowedConversionsBetweenDataTypes? ──> Partial<Record<D,...>>    |
|  allowConversionBetweenComplexTypes...? ──> boolean                |
|  enableTypeInference? / enableComplexTypeChecking? ──> boolean     |
|  enableCycleChecking? / enableRecursionChecking? ──> boolean       |
|  enableDebugMode? ──────────────> boolean                          |
|  nodeCountConstraints? ─────────> NodeCountConstraints<N>          |
|  hiddenNodeTypesInContextMenu? ─> Partial<Record<N, true>>         |
|                                                                    |
|  activeDrawer? ─────────> editLoop | editNodeType | editSwitch     |
|  zones? / zoneIndex? ───> UI-only region metadata (stripped)       |
|  history? ──────────────> { undoStack, redoStack, config,         |
|                              activeBatch }   (Immer patches)       |
+--------------------------------------------------------------------+
```

`activeDrawer`, `zones`, `zoneIndex`, and `history` are UI-only fields that are
stripped during export (see [Serialization](#serialization--history-stripping)).

---

## Data Flow Diagram (per dispatch)

```
  User Interaction (click, drag, connect, edit input, keyboard shortcut)
         |
         v
  dispatch(action: Action)            ── createGraphStore.dispatch (recommended)
         |                               or mainReducer(oldState, action)
         v
  validateAction(state, action)        ── PURE; no id minting
         |
         +-- null  ──> unrecognized action type; do nothing
         |
         +-- {ok:false, error} ──> typed rejection
         |        (store emits deriveRejectedEvent; state unchanged)
         |
         +-- {ok:true, value: Plan}
                  |
                  v
  applyValidatedAction(state, action, plan)   ── 3-path routing on isUndoable
                  |
                  +-- Non-undoable: produce(...) -> applyPlan(draft, plan)
                  |
                  +-- Undoable: produceWithPatches(...) -> applyPlan(draft, plan)
                  |        filterHistoryPatches -> second produce ->
                  |        recordInHistory(state.history, ...)
                  v
  applyPlan(draft, plan)               ── the ONLY mutator; mints ids;
         |                                scope-aware via getCurrent.../setCurrent...
         v
  next state
         |
   (store) next === prev ? short-circuit
         |  else: state = next; emit deriveAppliedEvent(action, plan, prev, next)
         v          ; listeners.forEach(...)
  React re-render (useSyncExternalStore / useReducer)
         |
         v
  getCurrentNodesAndEdgesFromState(state)  ── resolves openedNodeGroupStack
         |
         v
  ReactFlow <nodes={...} edges={...} />
```

---

## System Diagram

```
+─────────────────────────────────────────────────────────────────+
|                        FullGraph Component                      |
|                                                                 |
|  useFullGraph(initialState, { onGraphEvent? })                  |
|    -> createGraphStore(initialState, () => onGraphEventRef)     |
|    -> useSyncExternalStore(subscribe, getState, getState)       |
|    -> { state, dispatch }                                       |
|                                                                 |
|  FullGraphContext.Provider                                       |
|    value = createContextValue({ state, dispatch })              |
|                                                                 |
|  ReactFlow                                                       |
|    onNodesChange  -> [BEGIN_BATCH on drag start]                |
|                      UPDATE_NODE_BY_REACT_FLOW                  |
|                      [END_BATCH on drag end]                    |
|    onEdgesChange  -> UPDATE_EDGES_BY_REACT_FLOW                 |
|    onConnect      -> ADD_EDGE_BY_REACT_FLOW                     |
|    onConnectEnd   -> onGraphEvent({kind:'ui:drag:ended'})       |
|    onViewportChange -> SET_VIEWPORT                             |
|    onBeforeDelete -> canRemoveLoopNodesAndEdges + emit          |
|                       {kind:'ui:delete:attempted'}             |
|                                                                 |
|  document keydown (gated by enableUndoRedoShortcuts, default true) |
|    Ctrl/Cmd+Z            -> UNDO                                |
|    Ctrl/Cmd+Shift+Z / +Y -> REDO                               |
|                                                                 |
|  FullGraphContextMenu      -> ADD_NODE_AND_SELECT / ADD_LOOP /  |
|                               ADD_SWITCH / ADD_NODE_GROUP       |
|  FullGraphNodeGroupSelector-> OPEN_NODE_GROUP / CLOSE_NODE_GROUP |
|  ContextAwareInput         -> UPDATE_INPUT_VALUE                |
|  Drawers (loop/switch/type)-> OPEN_DRAWER / CLOSE_DRAWER /      |
|                               UPDATE_LOOP / UPDATE_SWITCH /     |
|                               UPDATE_NODE_TYPE                  |
+─────────────────────────────────────────────────────────────────+

Core helpers called by applyPlan:
  constructNodeOfType()                       -> builds node from type def
  constructInputOrOutputOfType()              -> builds a single handle
  getCurrentNodesAndEdgesFromState()          -> resolves group stack (scope)
  setCurrentNodesAndEdgesToStateWithMutatingState() -> writes back to scope
  setCurrentZonesToState()                    -> writes zones to scope
  generateRandomString(lengthOfIds=20)        -> mints node/edge/type ids
  createLoopZones() / createSwitchZones()     -> zone lifecycle on add
  recomputeAllZoneMemberships() / rehydrateAllZones() -> zone maintenance
```

---

## The State Type

Defined in `src/utils/nodeStateManagement/types.ts` › `State`. The `State` type
is generic over four type parameters:

| Parameter           | Constraint                         | Purpose                                                                                     |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `DataTypeUniqueId`  | `extends string`                   | String-literal keys of the `dataTypes` record                                               |
| `NodeTypeUniqueId`  | `extends string`                   | String-literal keys of the `typeOfNodes` record                                             |
| `UnderlyingType`    | `extends SupportedUnderlyingTypes` | `'string' \| 'number' \| 'boolean' \| 'complex' \| 'noEquivalent' \| 'inferFromConnection'` |
| `ComplexSchemaType` | conditional on `UnderlyingType`    | Zod schema when underlying type is `'complex'`                                              |

### Required fields

- **`dataTypes: Record<D, DataType<U,C>>`** — map of all data type definitions.
  Each `DataType` carries `name`, `underlyingType`, optional `complexSchema`
  (only when `'complex'`), `color`, optional `shape`, `allowInput`,
  `maxConnections`, and (for non-complex string types) `allowedStrings` for a
  select dropdown.
- **`typeOfNodes: Record<N, TypeOfNode<D,N,U,C>>`** — map of all node type
  definitions. Each `TypeOfNode` carries `name`, optional `headerColor`,
  `inputs: (TypeOfInput | TypeOfInputPanel)[]`, `outputs: TypeOfInput[]`,
  optional `locationInContextMenu`, optional `priorityInContextMenu`, and an
  optional **`subtree`** (presence marks it a node group):
  `{ nodes, edges, numberOfReferences, inputNodeId, outputNodeId, zones?, zoneIndex? }`.
- **`nodes`** — array of ReactFlow node instances at the root scope.
- **`edges`** — array of ReactFlow edge instances at the root scope. Each edge
  has `type: 'configurableEdge'`.

### Optional fields

- **`openedNodeGroupStack?`** — stack tracking nested navigation into node
  groups; entries are either `{ nodeType, previousViewport? }` (original
  opening) or `{ nodeType, nodeId, previousViewport? }` (instance opening). See
  [Node Group Navigation](#node-group-navigation-openednodegroupstack).
- **`viewport?`** — `{ x, y, zoom }`. When `undefined`, `FullGraph` triggers a
  fit/centering behavior.
- **`allowedConversionsBetweenDataTypes?`** — when `undefined`, all conversions
  are allowed; when provided (even `{}`), only explicit
  `{ source: { target: true } }` entries are permitted.
- **`allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking?`**
  — opt-in for complex-to-complex connections; only effective when conversions
  are restricted.
- **Feature flags** (all optional, default disabled): `enableTypeInference`,
  `enableComplexTypeChecking`, `enableCycleChecking`, `enableRecursionChecking`,
  `enableDebugMode`. See [Feature Flags](#feature-flags).
- **`nodeCountConstraints?: NodeCountConstraints<N>`** — per-node-type limits.
  See [Node-count constraints](#node-count-constraints).
- **`hiddenNodeTypesInContextMenu?: Partial<Record<N, true>>`** — node types to
  omit from the "Add Node" menu (`standardHiddenNodeTypesInContextMenu` provides
  the default set).
- **`activeDrawer?: ActiveDrawer`** — UI-only; the currently open editor drawer.
  Managed by `OPEN_DRAWER`/`CLOSE_DRAWER`. Shape:
  `{ type: 'editLoop'; nodeId } | { type: 'editNodeType'; nodeTypeId } | { type: 'editSwitch'; nodeId } | null`.
- **`zones?` / `zoneIndex?`** — UI-only root-scope zone metadata (loop/switch
  regions and the reverse handle->zone index). Stripped on export, rehydrated on
  import. See the [Zones](../features/zonesDoc.md) and
  [Switches](../features/switchesDoc.md) docs.
- **`history?`** — undo/redo history. See
  [History subsystem](#history-subsystem).

---

## Action Types

All actions are a discriminated union on `type`. There are **29** action types,
declared in the `actionTypes` array
(`src/utils/nodeStateManagement/mainReducer.ts` › `actionTypes`, indices 0–28)
and mirrored into the `actionTypesMap` constant. Indices 18–22 (`UNDO`, `REDO`,
`BEGIN_BATCH`, `END_BATCH`, `CLEAR_HISTORY`) are the history additions; indices
23–26 (`DELETE_NODE_TYPE_HANDLES`, `DELETE_LOOP_CHANNELS`,
`DELETE_SWITCH_CHANNELS`, `UPDATE_GRAPH_IO_HANDLES`) are the handle-deletion and
root Graph I/O additions; index 27 (`REORDER_INPUT_CONNECTIONS`) reorders a
fan-in input handle's connections; index 28 (`UPDATE_NODE_CUSTOM_NAME`)
sets/clears a standard node's custom display name.

| #   | Action Type                  | Payload                                                               | Description                                                                                                                                                                                                                                                  |
| --- | ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | `ADD_NODE`                   | `{ type: N, position: XYPosition }`                                   | Adds a new node instance of the given type at the given position.                                                                                                                                                                                            |
| 1   | `ADD_NODE_AND_SELECT`        | `{ type: N, position: XYPosition }`                                   | Like `ADD_NODE` but deselects all others and selects the new node. Collapses to one `ADD_NODE` plan with `selectExclusively: true`.                                                                                                                          |
| 2   | `UPDATE_NODE_BY_REACT_FLOW`  | `{ changes: NodeChanges }`                                            | Applies ReactFlow node changes via `applyNodeChanges`; cleans up zones for removed structures.                                                                                                                                                               |
| 3   | `UPDATE_EDGES_BY_REACT_FLOW` | `{ changes: EdgeChanges }`                                            | Applies edge changes. `remove` changes route through `removeEdgeWithTypeChecking` (type-inference cleanup).                                                                                                                                                  |
| 4   | `ADD_EDGE_BY_REACT_FLOW`     | `{ edge: Connection }`                                                | Validates and adds an edge via the 13-step `validateAddEdge` gauntlet.                                                                                                                                                                                       |
| 5   | `UPDATE_INPUT_VALUE`         | `{ nodeId, inputId, value: string \| number }`                        | Updates the value of a specific input handle. **Implemented** — dispatched from `ContextAwareInput`.                                                                                                                                                         |
| 6   | `OPEN_NODE_GROUP`            | `{ nodeId }` or `{ nodeType: N }`                                     | Pushes onto `openedNodeGroupStack`. `nodeId` = instance opening (append); `nodeType` = original opening (reset).                                                                                                                                             |
| 7   | `CLOSE_NODE_GROUP`           | _(none)_                                                              | Pops the last stack entry and restores its `previousViewport`.                                                                                                                                                                                               |
| 8   | `ADD_NODE_GROUP`             | _(none)_                                                              | Creates a new node-group type with auto-generated group input/output nodes and opens it for editing.                                                                                                                                                         |
| 9   | `SET_VIEWPORT`               | `{ viewport: Viewport }`                                              | Updates the stored viewport. **Non-undoable.**                                                                                                                                                                                                               |
| 10  | `REPLACE_STATE`              | `{ state: State<D,N,U,C> }`                                           | Replaces the entire state (import). Rehydrates zones, strips `history`. **Non-undoable.**                                                                                                                                                                    |
| 11  | `UPDATE_NODE_TYPE`           | `{ nodeTypeId, updates: { name?, headerColor?, inputs?, outputs? } }` | Updates a node type definition and reconstructs all instances (3-tier). Inputs/outputs may only be reordered/re-paneled, not added/removed.                                                                                                                  |
| 12  | `ADD_LOOP`                   | `{ position: XYPosition }`                                            | Adds a loop triplet (loopStart + loopStop + loopEnd) with bind edges and loop zones.                                                                                                                                                                         |
| 13  | `UPDATE_LOOP`                | `{ loopStart/Stop/EndNodeId, levels[] }`                              | Reorders/renames handles across a loop triplet.                                                                                                                                                                                                              |
| 14  | `OPEN_DRAWER`                | `{ activeDrawer: ActiveDrawer }`                                      | Opens an editor drawer (loop / node type / switch). **Non-undoable.**                                                                                                                                                                                        |
| 15  | `CLOSE_DRAWER`               | _(none)_                                                              | Closes the active drawer. **Non-undoable.**                                                                                                                                                                                                                  |
| 16  | `ADD_SWITCH`                 | `{ position: XYPosition }`                                            | Adds a switch pair (switchStart + switchEnd) with a bind edge and switch zones.                                                                                                                                                                              |
| 17  | `UPDATE_SWITCH`              | `{ switchStart/EndNodeId, levels[] }`                                 | Reorders/renames handles across a switch pair (true/false zoned).                                                                                                                                                                                            |
| 18  | `UNDO`                       | _(none)_                                                              | Undoes the most recent undoable entry. **Non-undoable.**                                                                                                                                                                                                     |
| 19  | `REDO`                       | _(none)_                                                              | Redoes the most recently undone entry. **Non-undoable.**                                                                                                                                                                                                     |
| 20  | `BEGIN_BATCH`                | _(none)_                                                              | Begins accumulating undoable dispatches into a single undo entry. **Non-undoable.**                                                                                                                                                                          |
| 21  | `END_BATCH`                  | _(none)_                                                              | Finalizes the active batch into one undo entry. **Non-undoable.**                                                                                                                                                                                            |
| 22  | `CLEAR_HISTORY`              | _(none)_                                                              | Clears both undo and redo stacks and any active batch. **Non-undoable.**                                                                                                                                                                                     |
| 23  | `DELETE_NODE_TYPE_HANDLES`   | `{ nodeTypeId, removedInputIds, removedOutputIds }`                   | Deletes inputs/outputs from a node type and cascades the broken edges across all instances (paired with `UPDATE_NODE_TYPE` reorder/rename).                                                                                                                  |
| 24  | `DELETE_LOOP_CHANNELS`       | `{ loopStart/Stop/EndNodeId, removedChannelIds }`                     | Deletes data channels carried through a loop triplet and cascades their edges.                                                                                                                                                                               |
| 25  | `DELETE_SWITCH_CHANNELS`     | `{ switchStart/EndNodeId, removedChannelIds }`                        | Deletes data channels carried through a switch pair and cascades their edges.                                                                                                                                                                                |
| 26  | `UPDATE_GRAPH_IO_HANDLES`    | `{ nodeId, direction, handles, removedHandleIds }`                    | Adds/renames/reorders/deletes the handles of a root **Graph Input / Output** node; new entries mint `groupInfer` handles, deletions cascade the root edges.                                                                                                  |
| 27  | `REORDER_INPUT_CONNECTIONS`  | `{ nodeId, handleId, orderedEdgeIds }`                                | Reorders the incoming connections of a multi-connection (fan-in) input handle by writing each edge's contiguous `data.order`. Validator requires a strict permutation of the handle's current 2+ fan-in edges (else `NOOP`); scope-aware; one undoable step. |
| 28  | `UPDATE_NODE_CUSTOM_NAME`    | `{ nodeId, customName: string \| undefined }`                         | Sets/clears a standard node's custom display name. Validator rejects system/structural nodes as `NOOP`; trims and treats empty as clear; scope-aware; one undoable step.                                                                                     |

> The `Plan` union has **28** kinds because `ADD_NODE` and `ADD_NODE_AND_SELECT`
> both produce a single `ADD_NODE` plan (distinguished by `selectExclusively`).

### ValidationError taxonomy (13 codes)

Defined in `src/utils/nodeStateManagement/planApply/types.ts` ›
`ValidationError`. `action:rejected` events carry the full error so consumers
can switch on `.code`:

`DUPLICATE_EDGE`, `CYCLE_DETECTED`, `MISSING_ENDPOINT`, `LOOP_PATH_INVALID`,
`SWITCH_PATH_INVALID`, `TYPE_INFERENCE_FAILED`, `COMPLEX_TYPE_MISMATCH`,
`CONVERSION_NOT_ALLOWED`, `NODE_TYPE_NOT_FOUND`, `INVALID_NODE_GROUP`,
`EMPTY_STACK`, `NODE_COUNT_CONSTRAINT_VIOLATED`, `NOOP`.

---

## The validate -> plan -> apply pipeline

### 1. `validateAction` (PURE)

`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`. A
switch over `action.type` that returns `Result<Plan, ValidationError> | null`:

- `null` — the action type is completely unrecognized (the **only** null case;
  `default: return null`).
- `{ ok: false, error }` — a typed rejection (e.g. node type not found, empty
  stack, node-count violation, nothing-to-undo `NOOP`).
- `{ ok: true, value: Plan }` — an intent description.

`validateAction` is deterministic and **id-free**: it never mints ids and never
calls `Math.random` (id minting was deliberately moved into apply so validate is
replay-safe). Edge validation is delegated to `validateAddEdge`.

### 2. `validateAddEdge` — the 13-step gauntlet

`src/utils/nodeStateManagement/planApply/validateAddEdge.ts` ›
`validateAddEdge`. Runs, in order: (1) null checks of
source/target/sourceHandle/targetHandle -> (2) cycle check
(`willAddingEdgeCreateCycle`, when `enableCycleChecking`) -> (3) duplicate check
(via xyflow `addEdge` identity trick) -> (4) node/handle lookup -> (5) loop
validation (`isLoopConnectionValid`) -> (6) switch validation
(`isSwitchConnectionValid`) -> (7) early-out if neither endpoint carries type
flags -> (8) inference plan (`planInferenceForEdgeAddition`) -> (9) projection
(`applyInferencePlanToProjection`) -> (10) complex-type check -> (11) conversion
check -> success. Inference replacements **are** precomputed in the resulting
`AddEdgePlan` (they carry existing node ids, so the plan stays deterministic);
the edge id itself is minted later in apply.

### 3. `applyValidatedAction` — 3-path routing

`src/utils/nodeStateManagement/applyWithHistory.ts` › `applyValidatedAction`.
The single function that both `mainReducer` and `createGraphStore` delegate to
after validation. Routing is keyed off `isUndoable(action, plan)`:

- **Non-undoable** (`SET_VIEWPORT`, `REPLACE_STATE`, `OPEN_DRAWER`,
  `CLOSE_DRAWER`, `UNDO`, `REDO`, `BEGIN_BATCH`, `END_BATCH`, `CLEAR_HISTORY`):
  plain `produce`. `applyPlan` may **return** a value (`REPLACE_STATE` returns
  the imported state), which Immer uses to replace the draft. `UNDO`/`REDO`
  mutate via `applyPatchesToDraft`; batch ops mutate `draft.history` directly.
- **Undoable** (everything else): `produceWithPatches` captures forward +
  inverse patches. If `next === state`, short-circuit and return `state`. Else
  filter out any patch whose `path[0] === 'history'` (`filterHistoryPatches`, to
  avoid recursive self-recording), then a **second** `produce` writes the entry
  into `state.history` via `recordInHistory`. (Two steps are required because
  patches aren't available until `produceWithPatches` returns.)

### 4. `applyPlan` — the ONLY mutator

`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`. A giant
switch over `plan.kind` (**28** kinds, exhaustively checked with
`default: throw new Error("Unknown plan kind: ...")`). It:

- Mints ids with `generateRandomString(lengthOfIds)` (`lengthOfIds = 20`,
  defined in `src/utils/nodeStateManagement/constants.ts` › `lengthOfIds`).
- Uses `getCurrentNodesAndEdgesFromState` /
  `setCurrentNodesAndEdgesToStateWithMutatingState` / `setCurrentZonesToState`
  so all mutations are **scope-aware** (root vs. the currently-open node-group
  subtree).
- Integrates zone lifecycle: `ADD_LOOP`/`ADD_SWITCH` create zones;
  `UPDATE_NODES_RF`/`UPDATE_EDGES_RF`/`ADD_EDGE` recompute memberships;
  `REPLACE_STATE` rehydrates zones.

Notable cases:

- **`ADD_NODE`**: mints node id, builds via `constructNodeOfType`, appends to
  the current scope; if `selectExclusively`, deselects all others.
- **`ADD_EDGE`**: mints edge id, deep-clones inference `newData`
  (`structuredClone`) to avoid mutating frozen prior state, deduplicates handle
  names, runs loop/switch/group handle duplication, applies switch zone
  prefixes, then pushes the edge and recomputes zones.
- **`UPDATE_NODE_TYPE`**: 3-tier instance reconstruction — Tier 1 updates the
  `TypeOfNode` definition; `reconstructAllInstances` rebuilds instances in
  dependent subtrees (Tier 2) and root nodes (Tier 3), preserving handle ids by
  matching on `name::dataTypeUniqueId`, and syncs group boundary nodes.
- **`UPDATE_INPUT_VALUE`**: looks up the handle via
  `getHandleFromNodeDataMatchingHandleId` in the current scope and writes
  `value`.
- **`UNDO`/`REDO`**: pop from the relevant stack, apply inverse/forward patches
  to the draft, push onto the opposite stack.
- **`BEGIN_BATCH`/`END_BATCH`/`CLEAR_HISTORY`**: mutate `draft.history`
  directly.

---

## The external store (`createGraphStore`)

Defined in `src/components/organisms/FullGraph/graphStore.ts` ›
`createGraphStore`. A Redux-style store that owns the graph state in a closure
variable. Components subscribe via `subscribe` (paired with React's
`useSyncExternalStore` in `useFullGraph`). `dispatch` is a plain function that
runs once per call (never replayed by React), so its side effect — event
emission — fires exactly once.

`dispatch(action)` does, synchronously:

1. `validateAction(state, action)`; if `null`, return (no apply, no emit).
2. If rejected, emit `deriveRejectedEvent(action, error)` and return (state
   unchanged).
3. Else compute `next = applyValidatedAction(prev, action, plan)`.
4. Identity short-circuit: if `next === prev`, return (no notify, no emit).
5. Set the closure `state = next` **before** emitting, so any handler calling
   `getState()` sees the post-apply view.
6. Emit `deriveAppliedEvent(action, plan, prev, next)` (diffs prev/next to
   recover minted ids).
7. Notify all listeners.

History lives **inside `state.history`**, not the closure. The store accepts a
`getOnGraphEvent` getter (not a value) so inline handlers whose identity changes
per render don't force store recreation.

> Note: `createGraphStore.dispatch` emits only `action:applied` and
> `action:rejected`. It does **not** emit `history:undo` / `history:redo` /
> `history:cleared` — those event kinds are declared in the `GraphEvent` union
> but currently have no emitter (see [GraphEvent stream](#graphevent-stream)).

---

## useFullGraph Hook

Defined in `src/components/organisms/FullGraph/FullGraphState.ts` ›
`useFullGraph`.

```ts
function useFullGraph<D, N, U, C>(
  initialState: State<D, N, U, C>,
  options?: UseFullGraphOptions<D, N, U, C>, // { onGraphEvent? }
): {
  state: State<D, N, U, C>;
  dispatch: GraphStore<D, N, U, C>['dispatch'];
};
```

This hook is **no longer a `useReducer` wrapper**. It:

1. Stores `options.onGraphEvent` in a ref (`onGraphEventRef`) so identity
   changes don't recreate the store.
2. Creates the external store **exactly once** per hook instance via a lazy
   `useRef`: `createGraphStore(initialState, () => onGraphEventRef.current)`.
   `initialState` is captured at first render (changes afterward are ignored —
   the same contract `useReducer` had).
3. Subscribes via
   `useSyncExternalStore(store.subscribe, store.getState, store.getState)`
   (React 18's tear-resistant, concurrent-safe primitive).
4. Runs a **render-commit barrier** `useEffect` keyed on
   `[state.nodes.length, state.edges.length]` that emits a `state:committed`
   event. This cannot live in `dispatch` because `dispatch` runs before React
   commits to the DOM.

Usage:

```tsx
const { state, dispatch } = useFullGraph(initialState, {
  onGraphEvent: (event) => {
    if (event.kind === 'action:rejected') console.warn(event.error.code);
  },
});
// Pass both to <FullGraph state={state} dispatch={dispatch} />
```

---

## FullGraphContext

Defined in `src/components/organisms/FullGraph/FullGraphState.ts` ›
`FullGraphContext`.

```ts
const FullGraphContext = createContext<{
  allProps: FullGraphProps;
}>(null!);
```

The context provides only `allProps` — the complete `FullGraphProps` (which
includes `state` and `dispatch`). Per-node runner visual state is provided
separately by `RunnerContext` (also in this file), not through
`FullGraphContext`.

### `createContextValue` Variance Bridge

`createContextValue` (`src/components/organisms/FullGraph/FullGraphState.ts` ›
`createContextValue`) erases concrete generics via a controlled cast. Its
current signature takes a single argument:

```ts
function createContextValue(props: {
  state: unknown;
  dispatch: unknown;
}): React.ContextType<typeof FullGraphContext> {
  const allProps = props as unknown as FullGraphProps;
  return { allProps };
}
```

React's `createContext` doesn't support generic type parameters, so providing a
concrete `FullGraphProps<'andGate', ...>` to a context typed with default string
generics requires this bridge. It is safe because consumers dispatch using
`actionTypesMap` constants, which produce valid payloads regardless of the
concrete generic params.

---

## History subsystem

The undo/redo history is a recent, major addition. Its building blocks live in
`src/components/organisms/FullGraph/historyTypes.ts`; the `State.history` shape
lives in `src/utils/nodeStateManagement/types.ts` › `State`.

### Shape

```ts
State.history?: {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  config: HistoryConfig;            // { maxSize?: number }
  activeBatch: {
    patches: Patch[];
    inversePatches: Patch[];
    actionTypes: string[];
    startTimestamp: number;
  } | null;
};

type HistoryEntry = {
  patches: Patch[];        // forward (apply on REDO)
  inversePatches: Patch[]; // backward (apply on UNDO)
  actionType: string;      // e.g. 'ADD_NODE' or 'UPDATE_NODES_RF+...' for batches
  timestamp: number;
};
```

### `isUndoable` (`src/components/organisms/FullGraph/historyTypes.ts` › `isUndoable`)

Rejects the 9 `NON_UNDOABLE_PLAN_KINDS` (`SET_VIEWPORT`, `REPLACE_STATE`,
`OPEN_DRAWER`, `CLOSE_DRAWER`, `UNDO`, `REDO`, `BEGIN_BATCH`, `END_BATCH`,
`CLEAR_HISTORY`). Two conditional cases:

- `UPDATE_NODES_RF` is undoable only if the payload contains at least one
  `position` or `remove` change (`hasNonSelectionChanges`) — `select`,
  `dimensions`, `replace`, `add`, and `reset` changes are ignored.
- `UPDATE_EDGES_RF` is undoable only if the plan contains a `removal` step
  (`hasRemovalStep`); pure passthroughs are no-ops for undo.

### `recordInHistory` (`src/components/organisms/FullGraph/historyTypes.ts` › `recordInHistory`)

- If an `activeBatch` exists: push forward patches, **`unshift`** inverse
  patches (so batch undo replays last-frame-first, restoring the original
  position), and append `actionType`.
- Else (only when there are data patches): push a new undo entry, **clear
  `redoStack`**, and trim the undo stack to `config.maxSize` via
  `slice(-maxSize)` when configured.

### `applyPatchesToDraft` (`src/components/organisms/FullGraph/historyTypes.ts` › `applyPatchesToDraft`)

A manual patch walker that mutates an Immer draft in place — necessary because
Immer's built-in `applyPatches` returns a new object and cannot operate on a
draft. Handles `add`/`remove` on arrays via `splice`.

### Batching (`BEGIN_BATCH` / `END_BATCH`)

Drag operations in `FullGraph.tsx` wrap a drag in `BEGIN_BATCH … END_BATCH` so a
whole drag becomes one undo entry. `onNodesChange` dispatches `BEGIN_BATCH` when
a `position` change with `dragging: true` first appears, and `END_BATCH` on
`dragging: false`. `END_BATCH` collapses `activeBatch` into one undo entry with
`actionType = actionTypes.join('+')`.

### Keyboard shortcuts

`FullGraph.tsx` registers a document-level `keydown` listener gated by the
`enableUndoRedoShortcuts` prop (default `true`): Ctrl/Cmd+Z dispatches `UNDO`;
Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y dispatches `REDO`.

### Export note

Serialization helpers `serializePatch` / `serializeHistoryEntry`
(`src/utils/importExport/serialization.ts` › `serializePatch`) and types
`SerializedPatch` / `SerializedHistoryEntry`
(`src/components/organisms/FullGraph/historyTypes.ts` › `SerializedPatch`)
exist, but they are **not wired to any exporter**. Of these, only
`SerializedHistoryEntry` (alongside `HistoryEntry` / `HistoryConfig`) is
re-exported from `src/components/organisms/FullGraph/index.ts`;
`SerializedPatch` is not. `StateSerializer.serialize` does
`delete cloned.history`, so history is **always** stripped on export. There is
no `deserializeHistoryEntry`, and no "Export with History" path is actually
wired (despite a JSDoc reference in `types.ts`).

---

## GraphEvent stream

`graphEvent.ts` defines a single unified observability stream. The `GraphEvent`
union spans:

- **Reducer events** — `action:applied` (carries `actionType` and an optional
  per-action `ActionDetail`) and `action:rejected` (carries the full
  `ValidationError`). Emitted by `createGraphStore.dispatch`.
- **`state:committed`** — emitted by `useFullGraph` in a `useEffect` keyed on
  node/edge count.
- **UI events** — `ui:drag:ended`, `ui:delete:attempted`, `ui:state:imported`,
  `ui:recording:imported` — emitted from `<FullGraph>` for ReactFlow lifecycle
  moments that bypass the reducer.
- **History events** — `history:undo`, `history:redo`, `history:cleared` — these
  are **declared in the union but currently have no emitter** anywhere in the
  codebase. Do not rely on them firing.

Derivation helpers:

- `deriveAppliedEvent(action, plan, prev, next)` -> `diffAppliedDetail` recovers
  minted ids by set-difference for `ADD_NODE` / `ADD_EDGE` / `ADD_NODE_GROUP`,
  else delegates to `planToDetail`.
- `deriveRejectedEvent(action, error)` — pure data shaping.
- `planToDetail` now returns a real detail for `UPDATE_INPUT_VALUE` (previously
  a NOOP stub). It returns `undefined` for id-minting and history plans.
- `deriveActionEvent` is **`@deprecated`** and has **zero callers** (only
  declared/exported). Prefer `deriveAppliedEvent` + `deriveRejectedEvent`.

---

## Node-count constraints

`NodeCountConstraints<N>` (`src/utils/nodeStateManagement/types.ts` ›
`NodeCountConstraints`) is an optional per-node-type map. Each entry has six
optional, AND-ed limits across three scopes:

| Field                 | Scope                                     | Checked on |
| --------------------- | ----------------------------------------- | ---------- |
| `maxAcrossAllNodes`   | root + all group subtrees combined        | ADD_NODE   |
| `minAcrossAllNodes`   | root + all group subtrees combined        | deletion   |
| `maxWithinANodeGroup` | each individual group subtree (per-group) | ADD_NODE   |
| `minWithinANodeGroup` | each individual group subtree (per-group) | deletion   |
| `maxInRoot`           | root scope only                           | ADD_NODE   |
| `minInRoot`           | root scope only                           | deletion   |

`max*` limits are enforced in `validateAction`'s `ADD_NODE` case; `min*` limits
are enforced in the `UPDATE_NODE_BY_REACT_FLOW` case for `remove` changes.
Violations return
`{ code: 'NODE_COUNT_CONSTRAINT_VIOLATED', nodeType, constraintKind, limit, currentCount }`.
Use `makeNodeCountConstraintsWithAutoInfer` for type-safe construction.

### Node-count helper functions

`src/utils/nodeStateManagement/nodeCountHelpers.ts` exports four pure, read-only
counting helpers. Each is generic over the same four type parameters as `State`
and takes a `Readonly<State<D,N,U,C>>` as its first argument; the first three
return a `number` and never mutate state. They are the scope-aware primitives
behind the node-count-constraint checks above (and are useful for custom UI such
as palette badges or "max reached" hints).

| Function                                                                          | Signature (after `state`)                       | Counts                                                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/utils/nodeStateManagement/nodeCountHelpers.ts` › `countNodesOfTypeInRoot`    | `(nodeType: N): number`                         | Instances of `nodeType` in the **root** `state.nodes` only.                                                |
| `src/utils/nodeStateManagement/nodeCountHelpers.ts` › `countNodesOfTypeAcrossAll` | `(nodeType: N): number`                         | Root count **plus** instances inside every group `subtree` (root + all `typeOfNodes[*].subtree.nodes`).    |
| `src/utils/nodeStateManagement/nodeCountHelpers.ts` › `countNodesOfTypeInGroup`   | `(groupNodeType: N, targetNodeType: N): number` | Instances of `targetNodeType` inside one group's `subtree`. Returns `0` when the group has no subtree.     |
| `src/utils/nodeStateManagement/nodeCountHelpers.ts` › `getCurrentScope`           | `(): N \| undefined`                            | The node type at the **top** of `openedNodeGroupStack` (the currently open group), or `undefined` at root. |

`countNodesOfTypeAcrossAll` and `countNodesOfTypeInGroup` read group subtrees
directly from `state.typeOfNodes` (each definition's optional `subtree`), so the
"all" and "in group" counts span the shared group definitions rather than the
live root scope. `getCurrentScope` is a thin reader over `openedNodeGroupStack`
(see [Node Group Navigation](#node-group-navigation-openednodegroupstack)),
returning the last entry's `nodeType` and `undefined` for an empty/absent stack.

---

## Node Group Navigation (`openedNodeGroupStack`)

The stack enables nested navigation into node groups while preserving return
context.

```
Root Graph
  |
  +-- OPEN_NODE_GROUP { nodeId: "abc" }  (instance opening — append)
  |     Stack: [{ nodeType: "GroupA", nodeId: "abc", previousViewport: ... }]
  |     getCurrentNodesAndEdgesFromState -> GroupA.subtree.nodes/edges
  |
  +-- OPEN_NODE_GROUP { nodeId: "def" }  (nested append)
  |     Stack: [{...GroupA...}, { nodeType: "GroupB", nodeId: "def", ... }]
  |
  +-- CLOSE_NODE_GROUP  (pop, restore previousViewport)
        Stack: [{...GroupA...}]
```

### Original vs Instance Opening

- **Instance opening** (`OPEN_NODE_GROUP` with `nodeId`): validated to exist and
  have a `subtree`, then **appended** to the stack with the current viewport
  snapshot. Used when navigating from within the graph.
- **Original opening** (`OPEN_NODE_GROUP` with `nodeType`): **resets** the stack
  to a single entry. Used when selecting a group from the node-group selector.
  Apply clears the viewport (so `FullGraph` re-centers).

When a node group's `numberOfReferences > 0`, edits to its subtree are protected
— scope-aware writes fall back to the root scope (the shared group definition is
read-only).

---

## Generics

Everything is generic over
`<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>`. The
`Plan` union is intentionally **non-generic** (it uses `string` / `unknown` at
boundaries), so `applyPlan` re-asserts concrete types via its own generic
parameters. This is the source of many deliberate `as`-casts, documented in code
as compile-time no-ops because `State` has no `readonly` properties (so
`Draft<State>` is structurally identical to `State`).

---

## Serialization / history stripping

`StateSerializer.serialize` (`src/utils/importExport/stateSerializer.ts` ›
`StateSerializer.serialize`) deep-clones the state and **deletes the UI-only
fields** before stripping non-serializable handle data:

```ts
delete cloned.activeDrawer;
delete cloned.zones;
delete cloned.zoneIndex;
delete cloned.history; // history is ALWAYS stripped on export
```

It then strips `complexSchema` (Zod schemas) from `dataTypes`, `onChange`
callbacks and `complexSchema` from handle data, and recurses into group subtrees
(also deleting subtree `zones`/`zoneIndex`). On import, `REPLACE_STATE`'s apply
rehydrates zones (`rehydrateAllZones`) and deletes any incoming `history`.

---

## Public API (exported)

- `mainReducer.ts`: `mainReducer`, `actionTypesMap`; type `Action`.
- `nodeCountHelpers.ts`: `countNodesOfTypeInRoot`, `countNodesOfTypeAcrossAll`,
  `countNodesOfTypeInGroup`, `getCurrentScope`.
- `types.ts`: `makeStateWithAutoInfer`, `makeTypeOfNodeWithAutoInfer`,
  `makeDataTypeWithAutoInfer`,
  `makeAllowedConversionsBetweenDataTypesWithAutoInfer`,
  `makeNodeCountConstraintsWithAutoInfer`, `isSupportedUnderlyingType`,
  `isValidDataTypeId`, `supportedUnderlyingTypesMap`; types `State`, `DataType`,
  `TypeOfNode`, `TypeOfInput`, `TypeOfInputPanel`, `NodeCountConstraints`,
  `ActiveDrawer`, `SupportedUnderlyingTypes`.
- `graphStore.ts`: `createGraphStore`; type `GraphStore`.
- `graphEvent.ts`: `deriveActionEvent` (deprecated), `deriveAppliedEvent`,
  `deriveRejectedEvent`; 19 event/detail types including `GraphEvent`,
  `ActionDetail`, `ActionType`.
- `historyTypes.ts`: `isUndoable`, `applyPatchesToDraft`,
  `filterHistoryPatches`, `recordInHistory`, `createEmptyHistory`; types
  `HistoryEntry`, `HistoryConfig`, `SerializedHistoryEntry`, `SerializedPatch`.
- `planApply/types.ts`: `ok`, `err`; all `Plan` / `Result` / `ValidationError`
  types.
- `FullGraphState.ts`: `useFullGraph`, `FullGraphContext`, `RunnerContext`,
  `RecordContext`, `createContextValue`, `useRecordContext`; types
  `NodeRunnerState`, `RunnerContextValue`, `UseFullGraphOptions`.
- `FullGraph/index.ts` re-exports `HistoryEntry`, `HistoryConfig`,
  `SerializedHistoryEntry`.

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

## Examples

### Creating Initial State

```tsx
import {
  makeStateWithAutoInfer,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from 'react-blender-nodes';

const dataTypes = {
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

// Add a node and select it (used by context menu)
dispatch({
  type: actionTypesMap.ADD_NODE_AND_SELECT,
  payload: { type: 'mathAdd', position: { x: 400, y: 100 } },
});

// Edit an input value (dispatched internally by ContextAwareInput)
dispatch({
  type: actionTypesMap.UPDATE_INPUT_VALUE,
  payload: { nodeId: 'someNode', inputId: 'someHandle', value: 42 },
});

// Undo / redo
dispatch({ type: actionTypesMap.UNDO });
dispatch({ type: actionTypesMap.REDO });

// Wrap a multi-step mutation as ONE undo entry
dispatch({ type: actionTypesMap.BEGIN_BATCH });
// ... several undoable dispatches ...
dispatch({ type: actionTypesMap.END_BATCH });

// Open an editor drawer
dispatch({
  type: actionTypesMap.OPEN_DRAWER,
  payload: { activeDrawer: { type: 'editSwitch', nodeId: 'switchStartId' } },
});
```

### Using useFullGraph

```tsx
import { useFullGraph, FullGraph } from 'react-blender-nodes';

function MyEditor() {
  const { state, dispatch } = useFullGraph(initialState, {
    onGraphEvent: (event) => {
      if (
        event.kind === 'action:applied' &&
        event.detail?.kind === 'ADD_NODE'
      ) {
        console.log('added node', event.detail.nodeId);
      }
    },
  });

  return (
    <div style={{ height: '100vh' }}>
      <FullGraph state={state} dispatch={dispatch} enableUndoRedoShortcuts />
    </div>
  );
}
```

---

## Relationships with Other Features

### -> [Data Types](dataTypesDoc.md)

`State.dataTypes` is the authoritative registry of all data types. Every handle
references a `DataTypeUniqueId` that must exist in this map.
`constructInputOrOutputOfType` looks up data types here to set handle colors,
shapes, and input allowance.

### -> [Handles](handlesDoc.md)

Edge addition delegates handle-level inference to `planInferenceForEdgeAddition`
(plan phase) and applies it in `applyPlan`'s `ADD_EDGE` case. Edge removal uses
`removeEdgeWithTypeChecking` (pure) in the `UPDATE_EDGES_RF` plan.
`getHandleFromNodeDataMatchingHandleId` locates handles for input-value edits.

### -> [Nodes](nodesDoc.md)

`constructNodeOfType` builds complete ReactFlow node instances from `TypeOfNode`
definitions. `applyPlan` calls it for `ADD_NODE`, `ADD_NODE_GROUP`, `ADD_LOOP`,
and `ADD_SWITCH`.

### -> [Edges](edgesDoc.md)

Non-remove edge changes flow through `applyEdgeChanges`; removals through
`removeEdgeWithTypeChecking`. New edges go through the 13-step `validateAddEdge`
gauntlet before `applyPlan` mints the edge id.

### -> [Type Inference](typeInferenceDoc.md)

When `enableTypeInference` is true, inference plans are precomputed in
`validateAddEdge` and applied (with deep-cloned node data) in `applyPlan`. Types
reset when edges are removed.

### -> [Zones](../features/zonesDoc.md) & [Switches](../features/switchesDoc.md)

`State.zones` / `zoneIndex` (and per-subtree `subtree.zones` /
`subtree.zoneIndex`) are maintained by `applyPlan`: `ADD_LOOP`/`ADD_SWITCH`
create zones, `UPDATE_NODES_RF`/`UPDATE_EDGES_RF`/`ADD_EDGE` recompute
memberships, and `REPLACE_STATE` rehydrates them. All zone fields are UI-only
and stripped on export.

### -> [Loops & Node Groups](../features/loopsDoc.md)

`ADD_LOOP`/`UPDATE_LOOP` and `ADD_NODE_GROUP` build their structures in
`applyPlan`. Loop deletion is validated by `canRemoveLoopNodesAndEdges` in the
`onBeforeDelete` handler, which also emits a `ui:delete:attempted` event.

### -> [FullGraph Component](../ui/fullGraphDoc.md)

`FullGraph` is the primary consumer. It receives `state` and `dispatch` as
props, provides them via `FullGraphContext`, wires ReactFlow callbacks to
dispatch actions (including drag batching and the undo/redo keyboard listener),
and emits UI-only `GraphEvent`s.

### -> [Import/Export](../importExport/importExportDoc.md)

Import uses `REPLACE_STATE`. `StateSerializer.serialize` strips `activeDrawer`,
`zones`, `zoneIndex`, and `history` plus non-serializable handle data. History
serialization helpers exist but are not wired into any exporter.

### -> [Runner](../runner/runnerHookDoc.md)

When `functionImplementations` is provided to `FullGraph`, `RunnerOverlay` calls
`useNodeRunner` and provides per-node visual state through `RunnerContext`. The
runner reads `state` but does not mutate it through dispatch.
