# Editor Drawers

## Overview

The editor drawers are the right-hand slide-in panels that edit the structural
shape of three special node kinds in the graph editor. They are built from three
sibling drawer components plus their per-kind conversion/row helpers:

| Drawer               | File                                                                                        | Edits                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `LoopEditDrawer`     | `src/components/molecules/LoopEditDrawer/LoopEditDrawer.tsx` › `LoopEditDrawer`             | The **data channels** of a loop triplet (`loopStart` + `loopStop` + `loopEnd`): reorder + rename                          |
| `SwitchEditDrawer`   | `src/components/molecules/SwitchEditDrawer/SwitchEditDrawer.tsx` › `SwitchEditDrawer`       | The **data channels** of a switch pair (`switchStart` + `switchEnd`): reorder + rename                                    |
| `NodeTypeEditDrawer` | `src/components/molecules/NodeTypeEditDrawer/NodeTypeEditDrawer.tsx` › `NodeTypeEditDrawer` | A **node-type definition** (node group): name, header color, and the inputs/outputs (reorder, rename, panels)             |
| `GraphIOEditDrawer`  | `src/components/molecules/NodeTypeEditDrawer/GraphIOEditDrawer.tsx` › `GraphIOEditDrawer`   | The **handles of a root Graph Input / Output node** (the graph's I/O boundary): add, rename, reorder, delete — names only |

All three drawers share the same skeleton: a 320px-wide panel pinned to the
right edge, slid in/out by `useSlideAnimation`, with a title bar (label + X
close button), a scrollable body, and a footer with **Save** / **Cancel**
buttons. They are **controlled** by a single piece of graph state —
`state.activeDrawer` — and are rendered unconditionally at the bottom of
`FullGraph`, each receiving `isOpen` derived from that state.

The drawers are intentionally "edit a local draft, then commit on Save":

- On open, each drawer copies the relevant node/node-type data into local React
  state (via a per-kind `extract…` / `…ToDragListItems` conversion).
- All edits (reorder, rename, color, add/remove panel) mutate only that local
  state.
- **Save** converts the local draft back to the canonical shape and dispatches a
  single update action (`UPDATE_LOOP` / `UPDATE_SWITCH` / `UPDATE_NODE_TYPE`),
  then closes the drawer.
- **Cancel** / **X** / outside `CLOSE_DRAWER` discards the local draft.

> **Barrel exports**: `LoopEditDrawer/index.ts` re-exports `LoopEditDrawer`,
> `LoopEditDrawerProps`, `extractLevelsFromLoopNodes`, `getCommonName`, and the
> `LoopHandleLevel` / `HandleInfo` types. `SwitchEditDrawer/index.ts` re-exports
> only `SwitchEditDrawer` and the `SwitchHandleLevel` type.
> `NodeTypeEditDrawer/index.ts` does `export *` from `NodeTypeEditDrawer.tsx`
> (so `NodeTypeEditDrawer` + `NodeTypeEditDrawerProps`). `FullGraph.tsx` imports
> `LoopEditDrawer` / `SwitchEditDrawer` from the barrels and
> `NodeTypeEditDrawer` by direct path (`NodeTypeEditDrawer/NodeTypeEditDrawer`).

## ActiveDrawer state shape

The single source of truth for which drawer is open is the optional
`activeDrawer` field on `State`. The `ActiveDrawer` union is defined in
`src/utils/nodeStateManagement/types.ts` › `ActiveDrawer`:

```ts
/**
 * Currently open drawer. UI-only state — stripped during export.
 * Managed by OPEN_DRAWER / CLOSE_DRAWER actions.
 */
type ActiveDrawer =
  | { type: 'editLoop'; nodeId: string }
  | { type: 'editNodeType'; nodeTypeId: string }
  | { type: 'editSwitch'; nodeId: string }
  | { type: 'editGraphInput'; nodeId: string }
  | { type: 'editGraphOutput'; nodeId: string }
  | null;
```

Key facts (all verified in source):

- The drawers are **mutually exclusive** — only one `activeDrawer` exists, so at
  most one drawer is open at a time.
- `editLoop` / `editSwitch` / `editGraphInput` / `editGraphOutput` carry a
  **`nodeId`** (the clicked node instance); `editNodeType` carries a
  **`nodeTypeId`** (a key into `state.typeOfNodes`), not a node instance id.
  `editGraphInput` / `editGraphOutput` target a **root** `groupInput` /
  `groupOutput` instance (the graph's I/O boundary).
- `activeDrawer` is **UI-only** and is explicitly stripped on export:
  `src/utils/importExport/stateSerializer.ts` › `StateSerializer` does
  `delete cloned.activeDrawer;` (alongside `zones`, `zoneIndex`, `history`). So
  an exported/imported graph never carries an open drawer.

## OPEN_DRAWER / CLOSE_DRAWER lifecycle

Two actions manage `activeDrawer`. Their constants live in `actionTypesMap`
(`src/utils/nodeStateManagement/mainReducer.ts` › `actionTypesMap`) and their
payload types in the `Action` union
(`src/utils/nodeStateManagement/mainReducer.ts` › `Action`):

```ts
| { type: typeof actionTypesMap.OPEN_DRAWER;  payload: { activeDrawer: ActiveDrawer } }
| { type: typeof actionTypesMap.CLOSE_DRAWER }   // no payload
```

### Dispatch flow (reducer → plan → apply)

The reducer is a pure pipeline: `dispatch(action)` →
`validateAction(oldState, action)` (the "planning" step) →
`applyValidatedAction(...)`. `validateAction` lives in
`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction` and
is imported by `src/utils/nodeStateManagement/mainReducer.ts` › `mainReducer`
and called at `src/utils/nodeStateManagement/mainReducer.ts` › `mainReducer`
(`const planResult = validateAction(oldState, action);`).

1. **Planning** (`src/utils/nodeStateManagement/planApply/validators.ts` ›
   `validateAction`) — these two actions are always valid (no graph mutation, no
   validation), so they produce trivial plans:

   ```ts
   case actionTypesMap.OPEN_DRAWER:
     return ok({ kind: 'OPEN_DRAWER' as const, activeDrawer: action.payload.activeDrawer });
   case actionTypesMap.CLOSE_DRAWER:
     return ok({ kind: 'CLOSE_DRAWER' as const });
   ```

2. **Apply** (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
   `applyPlan`) — the plan is applied to the Immer draft:

   ```ts
   case 'OPEN_DRAWER':
     draft.activeDrawer = plan.activeDrawer as typeof draft.activeDrawer;
     return;
   case 'CLOSE_DRAWER':
     draft.activeDrawer = undefined;
     return;
   ```

   Note the asymmetry: `OPEN_DRAWER` sets `activeDrawer` to the payload value
   (an object or `null`); `CLOSE_DRAWER` sets it to `undefined`. Both read as
   "no specific drawer" at the call sites (which check `=== 'editLoop'` etc.).

### UI triggers that dispatch OPEN_DRAWER

`OPEN_DRAWER` is dispatched from two places:

1. **Node header action icons**
   (`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
   `ConfigurableNode`). On each render, ConfigurableNode builds a
   `headerActions` array from `nodeTypeUniqueId`:
   - `isLoopNode(nodeTypeUniqueId)` → pushes an `edit-loop` action (Pencil icon)
     dispatching `OPEN_DRAWER` with `{ type: 'editLoop', nodeId: id ?? '' }`
     (`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
     `ConfigurableNode`).
   - `isSwitchNode(nodeTypeUniqueId)` → pushes an `edit-switch` action (Pencil)
     dispatching `OPEN_DRAWER` with `{ type: 'editSwitch', nodeId: id ?? '' }`
     (`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
     `ConfigurableNode`).
   - `hasSubtree` (the node type has a `subtree`, i.e. it is a node group;
     computed at
     `src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
     `hasSubtree`) → pushes an `edit-node-type` action (Pencil) dispatching
     `OPEN_DRAWER` with `{ type: 'editNodeType', nodeTypeId: nodeTypeUniqueId }`
     (`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
     `ConfigurableNode`), **plus** a separate `open-node-group` action
     (`SquareMousePointerIcon`) that dispatches `OPEN_NODE_GROUP` (not a drawer)
     to navigate into the subtree
     (`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
     `ConfigurableNode`).
   - `isGroupInputOrOutputNode(nodeTypeUniqueId)` **at root scope** (the context
     `isAtRootScope` flag is true) → pushes an `edit-graph-io` action (Pencil)
     dispatching `OPEN_DRAWER` with
     `{ type: 'editGraphInput' | 'editGraphOutput', nodeId: id ?? '' }`
     (`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
     `ConfigurableNode`). The same node types inside a group get no such button
     (they are the group boundary, edited via `editNodeType`).

   These icons only dispatch in ReactFlow mode — `ContextAwareNodeHeaderActions`
   wires `onClick` to `dispatch` only when `isCurrentlyInsideReactFlow` is true
   (see [configurableNodeDoc](configurableNodeDoc.md)).

2. **The node-group selector**
   (`src/components/organisms/FullGraph/FullGraph.tsx` ›
   `FullGraphNodeGroupSelector`). The `FullGraphNodeGroupSelector`'s
   `onEditNodeType(nodeTypeId)` dispatches `OPEN_DRAWER` with
   `{ type: 'editNodeType', nodeTypeId }`. This is the path for editing a
   group's type definition without first instantiating it on the canvas.

> There is **no** right-click/context-menu trigger for these drawers — the
> context menu only adds nodes/loops/switches and import/export (see
> [contextMenuDoc](contextMenuDoc.md)). Drawers open exclusively through the
> header icons and the group selector.

### UI triggers that dispatch CLOSE_DRAWER

Every drawer's `onClose` is wired to
`dispatch({ type: actionTypesMap.CLOSE_DRAWER })` in
`src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`. `onClose` fires from:

- The title-bar **X** button (all three drawers).
- The footer **Cancel** button (all three drawers).
- The footer **Save** button — each drawer's `handleSave` calls `onSave(...)`
  then `onClose()` (so a successful save also closes via `CLOSE_DRAWER`).

## Entity-Relationship Diagram

```
+------------------------------+        +-------------------------------+
|   State.activeDrawer          |        |   FullGraph (organism)        |
|   (ActiveDrawer | undefined)  |        |-------------------------------|
|------------------------------|        | derives:                       |
| { type:'editLoop',   nodeId } |<-------|  editLoopNodeId                |
| { type:'editSwitch', nodeId } |        |  editSwitchNodeId              |
| { type:'editNodeType',        |        |  editDrawerNodeTypeId          |
|   nodeTypeId }                |        | memoizes:                      |
| null / undefined              |        |  editLoopTriplet               |
+------------------------------+        |  editSwitchPair               |
                                         |  editDrawerNodeType           |
                                         +---------------+---------------+
                                                         | renders (always)
            +--------------------------+-----------------+------------------+
            v                          v                                    v
   +------------------+       +-------------------+              +---------------------+
   |  LoopEditDrawer  |       |  SwitchEditDrawer |              |  NodeTypeEditDrawer |
   |------------------|       |-------------------|              |---------------------|
   | localLevels:     |       | localLevels:      |              | localName           |
   |  LoopHandleLevel[]|      |  SwitchHandleLevel[]|            | localHeaderColor    |
   +--------+---------+       +---------+---------+              | localInputs[]       |
            |                           |                        | localOutputs[]      |
            | per level                 | per level              | showEmptyPanelError |
            v                           v                        +----------+----------+
   +------------------+       +-------------------+                         |
   | LoopHandleLevel  |       | SwitchHandleLevel |              +----------+----------+
   |------------------|       |-------------------|              | InputOutput         |
   | id               |       | id                |              | ReorderSection (x2) |
   | dataTypeUniqueId |       | dataTypeUniqueId  |              +----------+----------+
   | dataTypeColor    |       | dataTypeColor     |                         |
   | handles: {       |       | handles: {        |                         v
   |  loopStartIn,    |       |  switchStartIn,   |              +---------------------+
   |  loopStartOut,   |       |  switchStartTrueOut,|            | DragListItem<       |
   |  loopStopIn,     |       |  switchStartFalseOut,|           |  InputAdditional    |
   |  loopStopOut,    |       |  switchEndTrueIn, |              |  Props>             |
   |  loopEndIn,      |       |  switchEndFalseIn,|              | (leaf or panel with |
   |  loopEndOut }    |       |  switchEndOut }   |              |  subTrees[])        |
   +------------------+       +-------------------+              +---------------------+
        (6 handles/level)         (6 handles/level)
```

## Data Flow Diagram

```
ConfigurableNode header icon  |  Node-group selector "edit"
  (edit-loop/switch/node-type)|  (onEditNodeType)
        |                                 |
        +---------------+-----------------+
                        v
        dispatch(OPEN_DRAWER { activeDrawer })
                        |
                        v
   validateAction -> ok({ kind:'OPEN_DRAWER', activeDrawer })
                        |
                        v
   applyPlan: draft.activeDrawer = plan.activeDrawer
                        |
                        v
   FullGraph re-renders, derives:
     editLoopNodeId / editSwitchNodeId / editDrawerNodeTypeId
                        |
       +----------------+----------------------------+
       | (editLoop)     | (editSwitch)               | (editNodeType)
       v                v                            v
  editLoopTriplet  editSwitchPair             editDrawerNodeType
  = getLoop-       = getSwitch-               = state.typeOfNodes[id]
    StructureFrom-   StructureFrom-
    Node(...)        Node(...)
       |                |                            |
       | loopStart/      | switchStart/               | name, headerColor,
       | Stop/End .data  | switchEnd .data            | inputs, outputs
       v                v                            v
  <LoopEditDrawer>  <SwitchEditDrawer>          <NodeTypeEditDrawer>
   isOpen=editLoop-  isOpen=editSwitch-          isOpen=editDrawer-
   NodeId!==null     NodeId!==null               NodeTypeId!==null
       |                |                            |
       | on open: useEffect extracts local draft     |
       | extractLevelsFromLoopNodes / FromSwitchNodes / ToDragListItems
       v                v                            v
   localLevels[]    localLevels[]               localName/Color/Inputs/Outputs
       |                |                            |
       | edit: reorder (DragList) + rename (rows/modal)
       v                v                            v
   handleSave        handleSave                  handleSave
       |                |                            |
       v                v                            v
  onSave(levels)    onSave(levels)              onSave(id, updates)
       |                |                            |
       v                v                            v
  handleSaveLoop    handleSaveSwitch            handleSaveNodeType
  dispatch          dispatch                    dispatch
  UPDATE_LOOP       UPDATE_SWITCH               UPDATE_NODE_TYPE
       |                |                            |
       v                v                            v
  rAF -> update     rAF -> update               rAF -> update
  NodeInternals     NodeInternals               NodeInternals (affected
  ([start,stop,     ([start,end])               instances + groupInput/
    end])                                        groupOutput nodes)
       |                |                            |
       +----------------+----------------------------+
                        v
              onClose() -> dispatch(CLOSE_DRAWER)
```

## System Diagram

```
+-----------------------------------------------------------------------+
|  FullGraphWithReactFlowProvider                                       |
|                                                                       |
|  state.activeDrawer  (single open-drawer source of truth)            |
|     |                                                                 |
|     +-- editDrawerNodeTypeId = activeDrawer.type==='editNodeType'    |
|     |        ? activeDrawer.nodeTypeId : null                        |
|     +-- editDrawerNodeType  = typeOfNodes[id]                        |
|     +-- editLoopNodeId      = ...'editLoop'  ? nodeId               |
|     +-- editSwitchNodeId    = ...'editSwitch'? nodeId               |
|     +-- editLoopTriplet  = useMemo(getLoopStructureFromNode)        |
|     +-- editSwitchPair   = useMemo(getSwitchStructureFromNode)      |
|                                                                       |
|  Save handlers (useCallback):                                        |
|     handleSaveLoop      -> UPDATE_LOOP        + updateNodeInternals  |
|     handleSaveSwitch    -> UPDATE_SWITCH      + updateNodeInternals  |
|     handleSaveNodeType  -> UPDATE_NODE_TYPE   + updateNodeInternals  |
|                                                                       |
|  Render tree (bottom of FullGraph, always mounted):                  |
|     <NodeTypeEditDrawer isOpen={editDrawerNodeTypeId!==null} ...>    |
|     <LoopEditDrawer     isOpen={editLoopNodeId!==null}      ...>    |
|     <SwitchEditDrawer   isOpen={editSwitchNodeId!==null}    ...>    |
|        |                                                             |
|        +-- useSlideAnimation(isOpen, translateX 100%->0, 200ms)     |
|        +-- DragList (reorder)                                       |
|        +-- LoopHandleLevelRow / SwitchHandleLevelRow / Input-       |
|        |     OutputReorderSection (rename + per-handle edit)        |
|        +-- PresetModal (rename-all / add-panel / rename-panel)      |
|        +-- PopoverColorPicker (NodeType only)                       |
|                                                                       |
|  Triggers elsewhere:                                                 |
|     ConfigurableNode header icons -> dispatch(OPEN_DRAWER)          |
|     FullGraphNodeGroupSelector.onEditNodeType -> OPEN_DRAWER        |
+-----------------------------------------------------------------------+
```

## Shared drawer skeleton

All three components are structurally identical except for the body content.
Verified common structure:

- **Outer positioning**:
  `absolute right-0 top-0 bottom-0 w-[320px] z-20 overflow-hidden pointer-events-none`
  — a 320px clip wrapper pinned to the right edge. `pointer-events-none` on the
  wrapper lets clicks pass through the empty region; the inner panel re-enables
  `pointer-events-auto`.
- **Slide animation**:
  `useSlideAnimation(isOpen, { hiddenTransform: 'translateX(100%)', visibleTransform: 'translateX(0)', durationMs: 200 })`.
  Returns `{ mounted, ref, style }`. The component returns `null` while
  `!mounted`, so the panel is unmounted when fully closed and stays mounted
  through the 200ms exit animation. (See `src/hooks/useSlideAnimation.ts` ›
  `useSlideAnimation` — a Web Animations API single-keyframe slide that reverses
  smoothly on interrupted toggles.)
- **Inner panel**:
  `w-full h-full pointer-events-auto flex flex-col bg-[#222222] border-l border-secondary-dark-gray`
  with the animation `ref` / `style` attached.
- **Title bar**:
  `flex items-center justify-between border-b border-secondary-dark-gray px-3 py-2.5`
  containing a truncated label
  (`text-primary-white text-[16px] leading-[16px] font-main`) and a small
  transparent X `Button` (lucide `X`, `w-[18px] h-[18px]`) wired to `onClose`.
  Labels: **"Edit Loop"**, **"Edit Switch"**, **"Edit Node Type"**.
- **Body**: `flex-1 overflow-y-auto p-3 flex flex-col gap-3` (scrollable).
- **Footer**: `border-t border-secondary-dark-gray px-3 py-2 flex gap-2` with a
  **Save** `Button` (`size='small' color='lightNonPriority'` → `handleSave`) and
  a **Cancel** `Button` (`size='small' color='dark'` → `onClose`).

## LoopEditDrawer

**File:** `src/components/molecules/LoopEditDrawer/LoopEditDrawer.tsx` ›
`LoopEditDrawer`

Edits the **data channels** of a loop. A loop is a triplet of nodes —
`loopStart`, `loopStop`, `loopEnd` — and each "data channel" (called a _level_)
threads one piece of data through all three, contributing six handles total
(in/out on each of the three nodes).

### Props

```ts
type LoopEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  loopStartNodeData: Record<string, unknown> | null;
  loopStopNodeData: Record<string, unknown> | null;
  loopEndNodeData: Record<string, unknown> | null;
  onSave: (levels: LoopHandleLevel[]) => void;
};
```

`FullGraph` supplies the three `*NodeData` props from `editLoopTriplet`
(`src/components/organisms/FullGraph/FullGraph.tsx` › `LoopEditDrawer`), which
is a memo over `getLoopStructureFromNode(...)` resolving the triplet from
`editLoopNodeId` (`src/components/organisms/FullGraph/FullGraph.tsx` ›
`editLoopTriplet`). `isOpen` is `editLoopNodeId !== null`.

### LoopHandleLevel (the data-channel model)

Defined in `src/components/molecules/LoopEditDrawer/loopLevelConversion.ts` ›
`LoopHandleLevel`:

```ts
type HandleInfo = { id: string; name: string };

type LoopHandleLevel = {
  id: string; // = loopStartIn handle id (channel identity)
  dataTypeUniqueId: string;
  dataTypeColor: string; // from dataType.dataTypeObject.color, default '#666666'
  handles: {
    loopStartIn: HandleInfo;
    loopStartOut: HandleInfo;
    loopStopIn: HandleInfo;
    loopStopOut: HandleInfo;
    loopEndIn: HandleInfo;
    loopEndOut: HandleInfo;
  };
};
```

`extractLevelsFromLoopNodes(loopStartData, loopStopData, loopEndData)` builds
the levels (verified logic):

- For each node it calls `getInferHandles`, which slices the node's `inputs` /
  `outputs` from `getLoopNodeInferHandleIndex(nodeType, 'input'|'output')` up to
  (but excluding) the **last** handle — i.e. it drops the leading bind/control
  handles and the trailing handle, keeping only the per-channel "infer" handles.
- `levelCount = Math.min(...)` of all six handle-array lengths, so a level only
  exists when every one of the six positions is present (defensive against
  desynced nodes).
- Each level's `id` is the `loopStartIn` handle id; `dataTypeUniqueId` /
  `dataTypeColor` come from that same handle's `dataType`.

### Editing model

The body shows `Data Channels (N)` and, when `localLevels.length > 0`, a
`DragList<LevelAdditionalProps>` with `maxDepth={0}` (flat list — no nesting).
Otherwise an empty-state message: _"No data channels yet. Connect a data source
to any loop node to create the first channel."_

- **Reorder**: `DragList.onChange(newItems)` →
  `setLocalLevels(itemsToLevels(...))`. `levelsToItems` maps each level to a
  `DragListItem` whose `name` is `level.handles.loopStartIn.name || \`Channel
  ${index +
  1}\``and stashes the full level in`additionalProperties.level`. `itemsToLevels`reads each item's stashed level back (falling back to a lookup by`id`,
  else the first level). Reordering is therefore lossless — the level objects
  are preserved, only their order changes.
- **Per-channel content**: each row renders `LoopHandleLevelRow` (looked up by
  `level.id`, with a defensive `index === -1 ? 0 : index`).

#### LoopHandleLevelRow

**File:** `src/components/molecules/LoopEditDrawer/LoopHandleLevelRow.tsx` ›
`LoopHandleLevelRow`

A collapsible row (chevron, color dot, name, rename Pencil):

- `getCommonName(level)` returns the shared name if **all six** handle names are
  identical, else `null`; the header shows the common name
  (`text-primary-white`) or `(mixed names)` (italic, light-gray).
- **Rename all** (Pencil button → `PresetModal` "Rename Channel"): on confirm
  (non-empty trimmed) sets **every** handle's `name` to the new value via
  `onUpdateLevel`.
- **Per-handle rename** (when expanded): three groups — `Loop Start`,
  `Loop Stop`, `Loop End` (from `HANDLE_GROUPS`) — each with an **In** and an
  **Out** `Input` (`liveUpdate`, `allowOnlyNumbers={false}`). Editing one calls
  `handleSingleNameChange(key, value)`, which updates just that handle.

Loop channel names are stored **verbatim** — there is no zone prefix (contrast
with Switch below).

### Save

`handleSave` → `onSave(localLevels)` then `onClose()`. In `FullGraph`,
`handleSaveLoop` (`src/components/organisms/FullGraph/FullGraph.tsx` ›
`handleSaveLoop`):

1. dispatches `UPDATE_LOOP` with
   `{ loopStartNodeId, loopStopNodeId, loopEndNodeId, levels: levels.map((l) => ({ handles: l.handles })) }`
   — note it sends **only `handles`** per level (the order of the array is the
   new channel order; `id`/`dataType*` are dropped from the payload).
2. in a `requestAnimationFrame`, calls
   `updateNodeInternals([loopStartId, loopStopId, loopEndId])` so ReactFlow
   re-measures the three nodes' handle positions after the reorder/rename.

The `UPDATE_LOOP` action payload type is in
`src/utils/nodeStateManagement/mainReducer.ts` › `Action`.

## SwitchEditDrawer

**File:** `src/components/molecules/SwitchEditDrawer/SwitchEditDrawer.tsx` ›
`SwitchEditDrawer`

Structurally a twin of `LoopEditDrawer`, but for a **switch pair**
(`switchStart` + `switchEnd`). Each data channel here spans six handles split
across the two nodes and the True/False branches.

### Props

```ts
type SwitchEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  switchStartNodeData: Record<string, unknown> | null;
  switchEndNodeData: Record<string, unknown> | null;
  onSave: (levels: SwitchHandleLevel[]) => void;
};
```

`FullGraph` supplies `switchStartNodeData` / `switchEndNodeData` from
`editSwitchPair` (`src/components/organisms/FullGraph/FullGraph.tsx` ›
`SwitchEditDrawer`), a memo over `getSwitchStructureFromNode(...)` resolved from
`editSwitchNodeId` (`src/components/organisms/FullGraph/FullGraph.tsx` ›
`editSwitchPair`). `isOpen` is `editSwitchNodeId !== null`.

### SwitchHandleLevel (the data-channel model)

Defined in `src/components/molecules/SwitchEditDrawer/switchLevelConversion.ts`
› `SwitchHandleLevel`:

```ts
type SwitchHandleLevel = {
  id: string; // = switchStartIn handle id
  dataTypeUniqueId: string;
  dataTypeColor: string;
  handles: {
    switchStartIn: HandleInfo;
    switchStartTrueOut: HandleInfo;
    switchStartFalseOut: HandleInfo;
    switchEndTrueIn: HandleInfo;
    switchEndFalseIn: HandleInfo;
    switchEndOut: HandleInfo;
  };
};
```

`extractLevelsFromSwitchNodes(switchStartData, switchEndData)` reconstructs
channels from the known socket layout (documented inline in the source):

```
SwitchStart inputs:  [data1, data2..., condition, template]
SwitchStart outputs: [bind, trueData1..., falseData1..., template]
SwitchEnd   inputs:  [bind, trueData1..., falseData1..., template]
SwitchEnd   outputs: [data1, data2..., template]
```

Logic (verified):

- `getDataHandles(...)` filters out handles with no `dataType`, with
  `underlyingType === 'noEquivalent'`, and (for inputs) the `condition` handle
  (`isConditionHandle` matches `dataTypeUniqueId === 'condition'`).
- The leading `bind` output/input and the trailing `template` handle are sliced
  off (`.slice(1, -1)` for the start outputs / end inputs; `.slice(0, -1)` for
  the start data-inputs and end data-outputs).
- The remaining data outputs/inputs are split in half —
  `trueOutputCount = Math.ceil(len / 2)` — into True… and False… branches.
- `levelCount = Math.min(...)` across the six derived arrays; each level's `id`
  and `dataType*` come from the `switchStartIn` handle.

### Zone-prefix naming (the switch-specific twist)

Switch branch handles carry a **zone prefix** in storage so True/False sockets
are visually labelled, but the editor presents the _bare_ channel name. This is
handled by helpers in
`src/components/molecules/SwitchEditDrawer/switchLevelConversion.ts` ›
`stripZonePrefix` and
`src/components/molecules/SwitchEditDrawer/SwitchHandleLevelRow.tsx` ›
`SwitchHandleLevelRow`:

- `stripZonePrefix(name)` removes a leading `'True: '` (6 chars) or `'False: '`
  (7 chars).
- `getCommonName(level)` strips the prefix from all six names before comparing —
  so a channel reads as "common-named" when the underlying name matches across
  branches even though the stored strings differ by prefix.
- In `SwitchHandleLevelRow`, the per-handle `zonePrefixes` map assigns
  `'True: '` to `switchStartTrueOut` / `switchEndTrueIn`, `'False: '` to
  `switchStartFalseOut` / `switchEndFalseIn`, and `''` to `switchStartIn` /
  `switchEndOut`. Both rename-all and per-handle edits **re-apply** the correct
  prefix (`zonePrefixes[key] + trimmed`), and the per-handle `Input` shows
  `stripZonePrefix(...)` as its value.

### Editing model

Identical reorder mechanism to the loop drawer (`DragList` `maxDepth={0}`,
`levelsToItems` / `itemsToLevels`). Empty-state message differs: _"No data
channels yet. Connect a data source to Switch Start to create the first
channel."_

`SwitchHandleLevelRow`'s `HANDLE_GROUPS` are two groups:

- **Switch Start**: `In` (`switchStartIn`), `True Out` (`switchStartTrueOut`),
  `False Out` (`switchStartFalseOut`).
- **Switch End**: `True In` (`switchEndTrueIn`), `False In`
  (`switchEndFalseIn`), `Out` (`switchEndOut`).

(Label column is `w-14` here vs `w-6` for the loop's In/Out labels.)

### Save

`handleSave` → `onSave(localLevels)` then `onClose()`. `handleSaveSwitch`
(`src/components/organisms/FullGraph/FullGraph.tsx` › `handleSaveSwitch`)
dispatches `UPDATE_SWITCH` with
`{ switchStartNodeId, switchEndNodeId, levels: levels.map((l) => ({ handles: l.handles })) }`,
then in a `requestAnimationFrame` calls
`updateNodeInternals([switchStartId, switchEndId])`. The `UPDATE_SWITCH` payload
type is in `src/utils/nodeStateManagement/mainReducer.ts` › `Action`.

## NodeTypeEditDrawer

**File:** `src/components/molecules/NodeTypeEditDrawer/NodeTypeEditDrawer.tsx` ›
`NodeTypeEditDrawer`

Edits a **node-type definition** (a node group entry in `state.typeOfNodes`):
its display **name**, **header color**, and its **inputs** / **outputs**
(reorder, rename, and — for inputs — group into collapsible panels). Unlike the
loop/switch drawers (keyed by a node instance), this drawer is keyed by a
**`nodeTypeId`**.

### Props

```ts
type NodeTypeEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  nodeTypeId: string | null;
  nodeTypeName: string | null;
  nodeTypeHeaderColor: string | null;
  nodeTypeInputs: (TypeOfInput | TypeOfInputPanel)[] | null;
  nodeTypeOutputs: TypeOfInput[] | null;
  onSave: (
    nodeTypeId: string,
    updates: {
      name?: string;
      headerColor?: string;
      inputs?: (TypeOfInput | TypeOfInputPanel)[];
      outputs?: TypeOfInput[];
    },
  ) => void;
};
```

`FullGraph` supplies these from `editDrawerNodeType` (the `typeOfNodes` entry
for `editDrawerNodeTypeId`) at
`src/components/organisms/FullGraph/FullGraph.tsx` › `NodeTypeEditDrawer`;
`isOpen` is `editDrawerNodeTypeId !== null`.
`nodeTypeName`/`HeaderColor`/`Inputs`/`Outputs` fall back to `null` via
`?? null`, which matters for the conditional rendering and diffing below.

### Local draft state

On open (`useEffect` keyed on `isOpen` + the four field props):

- `localName` ← `nodeTypeName` (only if non-null).
- `localHeaderColor` ← `nodeTypeHeaderColor` (may be `null`).
- `localInputs` ← `nodeTypeInputs ? typeOfInputsToDragListItems(...) : []`.
- `localOutputs` ← `nodeTypeOutputs ? typeOfOutputsToDragListItems(...) : []`.
- `showEmptyPanelError` ← `false`.

### Body sections

1. **Name** — an `Input` (`size='small'`, placeholder `'Node type name'`,
   `allowOnlyNumbers={false}`) bound to `localName`. Always shown.
2. **Header Color** — only rendered when `localHeaderColor !== null`; a
   `PopoverColorPicker` (`size='small'`) bound to `localHeaderColor` via
   `handleColorChange`.
3. **Inputs** — only when `nodeTypeInputs !== null`; an
   `InputOutputReorderSection` with `allowPanels={true}`, `maxDepth={1}`, and
   `hasEmptyPanelError={showEmptyPanelError}`. Its `onChange` updates
   `localInputs` and resets `showEmptyPanelError` to `false`.
4. **Outputs** — only when `nodeTypeOutputs !== null`; an
   `InputOutputReorderSection` with `allowPanels={false}`, `maxDepth={0}`,
   `hasEmptyPanelError={false}`, `onChange={setLocalOutputs}`.

### The reorder/rename/panel model (InputOutputReorderSection)

**File:**
`src/components/molecules/NodeTypeEditDrawer/InputOutputReorderSection.tsx` ›
`InputOutputReorderSection`

This is the inputs/outputs analogue of the loop/switch level list. It wraps a
`DragList<InputAdditionalProps>` plus panel management:

- **DragListItem mapping**
  (`src/components/molecules/NodeTypeEditDrawer/inputOutputConversion.ts` ›
  `typeOfInputsToDragListItems`): each `TypeOfInput` becomes a leaf
  `DragListItem` with a fresh random id (`generateRandomString(20)`) and
  `additionalProperties = { dataType, allowInput?, maxConnections? }`. A
  `TypeOfInputPanel` (detected by `'inputs' in input`) becomes a non-leaf item
  with `subTrees` (its child inputs as leaves). The reverse functions
  (`dragListItemsToTypeOfInputs` / `…Outputs`) detect panels by
  `'subTrees' in item` and only re-emit `allowInput` / `maxConnections` when
  they are defined.
- **Reorder / re-nest**: handled by `DragList`. Inputs allow `maxDepth={1}`
  (leaves can be dragged into/out of one level of panel); outputs use
  `maxDepth={0}` (flat).
- **Rename a socket**: by default there is **no inline rename for leaf
  inputs/outputs** — the row shows the socket name + its `dataType` string, with
  a rename Pencil **only on panels**. The `NodeTypeEditDrawer` uses this default
  (handle names there are type-derived). Two **optional, additive** props extend
  the section into a full handle-list editor (used by `GraphIOEditDrawer`):
  `allowLeafRename` puts a rename Pencil on leaf rows too (same `PresetModal`
  flow as panels, via `renameItemById`), and `onAddItem` + `addItemLabel` add a
  `+ <label>` button to the section header so the owner can append new leaves.
  When neither prop is passed the section behaves exactly as before.
- **Panels (inputs only, `allowPanels=true`)**:
  - **Add Panel** — the section header shows a `+ Panel` button → opens a
    `PresetModal` ("Add Panel"); confirming appends a new empty non-leaf item
    (`subTrees: []`).
  - **Rename Panel** — the Pencil on a panel row opens the same `PresetModal`
    ("Rename Panel") prefilled with the current name.
  - **Delete Panel** — `DragList`'s delete (enabled via
    `isDeletable={(item) => isDragListNonLeaf(item)}` and `onDelete`) _unwraps_
    the panel: its children are spliced back into the top level in place and the
    panel is removed. `handleDeletePanel` returns `false` (it performs the
    `onChange` itself rather than letting `DragList` delete the node).
  - Empty state: _"No {inputs|outputs}"_ (lower-cased section label).

### InputAdditionalProps

```ts
type InputAdditionalProps = {
  dataType: string;
  allowInput?: boolean;
  maxConnections?: number;
};
```

### Save (with validation)

`handleSave`
(`src/components/molecules/NodeTypeEditDrawer/NodeTypeEditDrawer.tsx` ›
`handleSave`):

1. Returns early if `nodeTypeId` is falsy.
2. `trimmedName = localName.trim()`; returns early (no-op) if it is `''` — i.e.
   **an empty name silently cancels the save** (no error shown).
3. If `hasEmptyPanels(localInputs)` (any panel with zero children) → sets
   `showEmptyPanelError = true` and returns **without saving**. The error
   surfaces as red text on the empty panel row (`renderContent` colors an empty
   panel `text-red-400` when `hasEmptyPanelError`).
4. Builds a **diff** `updates` object:
   - `name` only if `trimmedName !== nodeTypeName`.
   - `headerColor` only if
     `localHeaderColor !== null && localHeaderColor !== nodeTypeHeaderColor`.
   - `inputs` whenever `nodeTypeInputs !== null` (sent as
     `dragListItemsToTypeOfInputs(localInputs)`).
   - `outputs` whenever `nodeTypeOutputs !== null`.
5. Calls `onSave(nodeTypeId, updates)` **only if** `updates` has at least one
   key; then always `onClose()`.

In `FullGraph`, `handleSaveNodeType`
(`src/components/organisms/FullGraph/FullGraph.tsx` › `handleSaveNodeType`):

1. dispatches `UPDATE_NODE_TYPE` with `{ nodeTypeId, updates }` (payload type at
   `src/utils/nodeStateManagement/mainReducer.ts` › `Action`).
2. if `updates.inputs` or `updates.outputs` changed, in a
   `requestAnimationFrame` it computes the affected node ids — every canvas node
   whose `data.nodeTypeUniqueId` equals this `nodeTypeId`, **or** is a
   `groupInput` / `groupOutput` standard node — and calls
   `updateNodeInternals(affectedNodeIds)` so all instances re-measure handles.

## GraphIOEditDrawer

**File:** `src/components/molecules/NodeTypeEditDrawer/GraphIOEditDrawer.tsx` ›
`GraphIOEditDrawer`

Edits the **handles of a root Graph Input / Output node** — the graph's I/O
boundary. The root graph IS the top-level node group: its `groupInput` /
`groupOutput` instances are the parameters and return of the generated
`runGraph(...)` (see [runTargetsDoc](../runner/runTargetsDoc.md)) and the
executor's `rootInputs` / `rootOutputs`. The drawer manages **names only** — a
Graph Input edits its node's **outputs**, a Graph Output edits its **inputs**;
new handles default to a `groupInfer` type that concretizes on connect, so the
editor never asks the user to pick a type.

### Props

```ts
type GraphIOVariant = 'graphInput' | 'graphOutput';
type GraphIOHandleSpec = { id?: string; name: string };

type GraphIOEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  variant: GraphIOVariant;
  nodeId: string | null;
  handles: { id: string; name: string }[];
  onSave: (nodeId: string, handles: GraphIOHandleSpec[]) => void;
  // When omitted, the deletion-review surface is disabled (plain Save + Undo).
  getHandleBlastRadius?: (
    nodeId: string,
    handle: { id: string; name: string; direction: 'input' | 'output' },
  ) => HandleBlastRadius;
  getNeighborhood?: GetNeighborhood;
  // Lock switches forwarded from the `<FullGraph>` props of the same name.
  // Default `true`. `allowStructureEdit` is ONE switch that short-circuits the
  // add button, per-row delete, staged deletion section, AND the review modal.
  allowRename?: boolean;
  allowStructureEdit?: boolean;
};
```

`FullGraph` supplies `variant` (`graphInput` when `editGraphInputNodeId` is set,
else `graphOutput`), `nodeId` (`editGraphInputNodeId ?? editGraphOutputNodeId`),
and `handles` from `editGraphIoHandles`
(`src/components/organisms/FullGraph/FullGraph.tsx` › `editGraphIoHandles`), a
memo that reads the root node's `outputs` (Graph Input) or `inputs` (Graph
Output) from `state.nodes`. `isOpen` is
`editGraphInputNodeId !== null || editGraphOutputNodeId !== null`.

### Editing model

The drawer reuses one `InputOutputReorderSection` (`allowPanels={false}`,
`maxDepth={0}`) with the optional `allowLeafRename` + `onAddItem` props enabled,
so the user can **add** (`+ Input` / `+ Output`), **rename** (leaf Pencil →
`PresetModal`), **reorder** (DragList), and **delete** (staged into a "Deleted"
section with Undo restore). The DragList item id of each existing handle IS its
real handle id; a freshly added item gets a throwaway id so on Save it is
recognised as new.

### Save

`handleSave` validates names client-side (non-empty + unique, else an inline
error) then maps `localItems` to the `GraphIOHandleSpec[]` payload: items whose
id is among the originals keep that id (reuse); new items omit `id` (minted in
`applyPlan`). `FullGraph`'s `handleSaveGraphIoHandles`
(`src/components/organisms/FullGraph/FullGraph.tsx` ›
`handleSaveGraphIoHandles`) dispatches a single `UPDATE_GRAPH_IO_HANDLES` action
then `updateNodeInternals([nodeId])` in a `requestAnimationFrame`.

### UPDATE_GRAPH_IO_HANDLES (the action)

Unlike `UPDATE_NODE_TYPE` (which edits a node TYPE and reconstructs every
instance), this edits a **single root instance**. The pure validator
(`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`)
confirms the node is a root `groupInput` / `groupOutput`, checks names are
non-empty + unique, and derives `removedHandleIds` (old ids absent from the new
list). `applyPlan` (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
`applyPlan`) cascade-removes the **root** edges touching the removed handles
(via `removeEdgeWithTypeChecking`, reverting inferred types on the opposite
endpoint), recomputes zones if any edge was removed, then rebuilds the handle
list — existing handles reused by id (name updated), new handles minted as
`groupInfer` via `constructInputOrOutputOfType`. The Plan type is
`src/utils/nodeStateManagement/planApply/types.ts` › `UpdateGraphIoHandlesPlan`.

### Placement and triggers

- **Add** a root Graph Input / Output from the canvas context menu: at root
  scope the otherwise-hidden boundary types surface as **"Graph Input"** /
  **"Graph Output"** entries under _Add Node_, each single-instance (hidden once
  one exists). Built in
  `src/components/molecules/ContextMenu/createNodeContextMenu.ts` ›
  `createNodeContextMenu` from the `isAtRootScope` / `rootGraphInputExists` /
  `rootGraphOutputExists` props that `FullGraph` computes.
- **Edit** via the Pencil on the root node's header
  (`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
  `ConfigurableNode`), gated on `isAtRootScope`
  (`src/components/organisms/FullGraph/FullGraphState.ts` ›
  `FullGraphContextValue`) so the SAME `groupInput` / `groupOutput` types inside
  a group keep using the group's `NodeTypeEditDrawer` instead. At root the node
  is also displayed as "Graph Input" / "Graph Output" rather than its type name.

## Limitations and Deprecated Patterns

- **Channels are created by connections, not by the drawers.** None of the
  drawers can add or delete a loop/switch data channel; both empty states tell
  the user to _connect a data source_ to spawn the first channel. The drawers
  only **reorder** and **rename** existing channels. (Inputs/outputs panels are
  the only "add/remove" affordance, and only in `NodeTypeEditDrawer`.)
- **Save sends only `handles` (loop/switch).** `UPDATE_LOOP` / `UPDATE_SWITCH`
  payloads carry `levels.map((l) => ({ handles: l.handles }))` — the per-level
  `id`, `dataTypeUniqueId`, and `dataTypeColor` are not part of the update; the
  new array order _is_ the new channel order.
- **Empty node-type name silently no-ops.** `NodeTypeEditDrawer.handleSave`
  returns early (no toast/error) when the trimmed name is empty; the only
  surfaced validation is the empty-panel error.
- **Leaf rename inside `InputOutputReorderSection` is opt-in.** By default only
  panel rows expose a rename Pencil (the `NodeTypeEditDrawer` case); passing
  `allowLeafRename` (as `GraphIOEditDrawer` does) adds a rename Pencil to leaf
  rows, and `onAddItem` adds a header `+` button. Without those props the
  section is display-only for leaves, as before.
- **`activeDrawer` is non-serializable UI state.** It is stripped on export
  (`src/utils/importExport/stateSerializer.ts` › `StateSerializer`) and never
  restored on import, so reloading a graph always starts with all drawers
  closed.
- **`OPEN_DRAWER` vs `CLOSE_DRAWER` set different "closed" values.**
  `CLOSE_DRAWER` sets `activeDrawer = undefined`; `OPEN_DRAWER` may set it to a
  payload of `null`. The derivations in `FullGraph` (`=== 'editLoop'` etc.)
  treat both as "no matching drawer", so the difference is invisible to the UI.
- **Drawers are always mounted.** All three `<…EditDrawer>` are rendered
  unconditionally; `isOpen` + `useSlideAnimation`'s `mounted` gate whether the
  panel actually appears (the panel returns `null` while not mounted). Local
  draft state is reset on each open via the `useEffect`, so transient edits do
  not persist between openings.

## Relationships with Other Features

### -> [ConfigurableNode (header action icons)](configurableNodeDoc.md)

ConfigurableNode is where the loop/switch/node-type **Pencil** icons live. It
derives `headerActions` from `nodeTypeUniqueId` (`isLoopNode` / `isSwitchNode` /
`hasSubtree`) and dispatches `OPEN_DRAWER` with the appropriate `activeDrawer`
shape. The `open-node-group` icon next to the node-type Pencil dispatches
`OPEN_NODE_GROUP` (navigation), **not** a drawer.

### -> [FullGraph (drawer wiring + save handlers)](fullGraphDoc.md)

`FullGraph` owns all the glue: it reads `state.activeDrawer`, derives the per-
drawer ids, memoizes the loop triplet / switch pair via
`getLoopStructureFromNode` / `getSwitchStructureFromNode`, looks up the
node-type definition, renders the three drawers with their `isOpen` / data
props, and implements the three save callbacks (`handleSaveLoop`,
`handleSaveSwitch`, `handleSaveNodeType`) that dispatch `UPDATE_LOOP` /
`UPDATE_SWITCH` / `UPDATE_NODE_TYPE` and follow up with `updateNodeInternals` in
a `requestAnimationFrame`. The node-group selector's `onEditNodeType` is the
second `OPEN_DRAWER` trigger.

### -> [State Management (OPEN*DRAWER / CLOSE_DRAWER / UPDATE*\*)](../core/stateManagementDoc.md)

The drawer lifecycle rides the standard pure-reducer pipeline:
`dispatch → validateAction`
(`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`)
`→ applyValidatedAction` (`src/utils/nodeStateManagement/applyWithHistory.ts` ›
`applyValidatedAction`). `OPEN_DRAWER` / `CLOSE_DRAWER` are trivial plans that
only touch `draft.activeDrawer`. The Save actions (`UPDATE_LOOP`,
`UPDATE_SWITCH`, `UPDATE_NODE_TYPE`) are the real mutations and are validated /
applied through the same pipeline (e.g. `UPDATE_NODE_TYPE` input/output
validation in `src/utils/nodeStateManagement/planApply/validators.ts` ›
`validateAction`).

### -> [DragList](uiPrimitivesDoc.md)

All three drawers use `DragList<T>`
(`src/components/molecules/DragList/DragList.tsx` › `DragList`) as the reorder
primitive. Loop/switch lists are flat (`maxDepth={0}`); the node-type **inputs**
list allows one level of nesting (`maxDepth={1}`) to support input **panels**
(non-leaf `DragListItem`s with `subTrees`). `isDragListNonLeaf` /
`DragListItem<T>` come from `src/components/molecules/DragList/types.ts` ›
`DragListItem`.

### -> [Nodes (loops, switches, node groups)](../core/nodesDoc.md)

The drawers operate on the three structural node kinds: loop triplets
(`loopStart`/`loopStop`/`loopEnd`), switch pairs (`switchStart`/`switchEnd`),
and node groups (a `typeOfNodes` entry with a `subtree`). The level-extraction
helpers depend on the loops' `getLoopNodeInferHandleIndex` and the switches'
documented socket ordering (bind / condition / template / True / False).
