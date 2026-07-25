# Zones

## Overview

Zones are **first-class regions** of the graph — named, colored areas that group
a set of body nodes together, render as a dashed convex-hull **frame** behind
the nodes, and (when enforced) feed connection validation to prevent edges from
crossing a structure's boundary illegally.

Every loop and switch structure automatically owns a small set of zones:

- A **loop** (`loopStart` / `loopStop` / `loopEnd` triplet) owns two zones:
  **Pre-Stop Body** (`preStop`) and **Post-Stop Body** (`postStop`).
- A **switch** (`switchStart` / `switchEnd` pair) owns two zones: **True
  Branch** (`trueBranch`) and **False Branch** (`falseBranch`).

Key facts:

- A `Zone` is a plain data record stored **scope-locally**: root-level zones
  live on `state.zones`, subtree zones live on `subtree.zones` inside their node
  group (`src/utils/nodeStateManagement/types.ts` › `State`,
  `src/utils/nodeStateManagement/types.ts` › `TypeOfNode`).
- Each zone declares its boundary as **per-boundary-node handle definitions**
  (`boundaryHandles`). These are populated **only from concrete data handles** —
  structural handles (`bindLoopNodes` / `bindSwitchNodes`), infer template
  handles (`loopInfer`, with `underlyingType: 'inferFromConnection'`), and
  `condition` handles are filtered out.
- Zone membership (`zone.nodeIds`) is **recomputed on every edge change** via a
  single-pass bidirectional BFS (`discoverZoneNodesFromHandles`) that seeds from
  the boundary handles and stops at boundary nodes.
- Zones are **system-controlled** today: created by `ADD_LOOP` / `ADD_SWITCH`,
  refreshed after edge changes, removed when their structure is deleted, and
  **rehydrated from scratch on import** (`REPLACE_STATE`). The `Zone` type
  reserves a `structureLink?` for system zones and anticipates future
  **user-created** zones (visual-only, no `boundaryHandles`, no enforcement).
- A reverse index, `ZoneIndex.handleToZone`, maps each boundary handle ID to its
  owning zone ID for O(1) lookups; it is rebuilt whenever zones change.
- Zones are **UI-only state**: `state.zones`, `state.zoneIndex`, and the subtree
  equivalents are **stripped on export** and never appear in serialized graphs
  (`src/utils/importExport/stateSerializer.ts` › `StateSerializer`).
- The visual frame is rendered by `ZoneFrameOverlay`
  (`src/components/molecules/ZoneFrameOverlay/ZoneFrameOverlay.tsx` ›
  `ZoneFrameOverlay`), an SVG overlay inside `FullGraph` that draws a padded
  convex hull per zone in the zone's color.

## User Zones

Beyond the system zones above, the user can create their own **named, colored
visual zones** by selecting nodes and wrapping them in a frame. User zones are
**authored** (not derived): membership is the explicit set of nodes the user
chose, never recomputed. They are purely visual — no execution / codegen /
connection effect.

- **Storage (separate + authored).** User zones live in a scope-local
  `userZones` field — at root on `State`
  (`src/utils/nodeStateManagement/types.ts` › `State`) and inside a group on the
  subtree (`src/utils/nodeStateManagement/types.ts` › `TypeOfNode`). They reuse
  the `Zone` type with the system fields ABSENT (`enforced: false`, no
  `structureLink`, no `boundaryHandles`). Keeping them out of `state.zones`
  means the derived-zone machinery (`recomputeAllZoneMemberships`,
  `rehydrateAllZones`) never recomputes or wipes their authored membership.
  Scope reads/writes go through
  `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
  `setCurrentUserZonesToState`.
- **Actions (4, all undoable).** `src/utils/nodeStateManagement/mainReducer.ts`
  › `Action`: `ADD_USER_ZONE` (from a selection; the zone is minted by
  `src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `createUserZone`),
  `UPDATE_USER_ZONE` (rename / recolor), `UPDATE_USER_ZONE_MEMBERS` (add /
  remove; removing the last member auto-deletes the zone), and
  `DELETE_USER_ZONE`. A deleted member node is pruned from every user zone in
  `applyPlan`'s `UPDATE_NODES_RF` case — a pure `nodeIds.filter`, a no-op unless
  a node was actually removed (so a drag / selection change never churns
  `userZones`).
- **Affordances.** A context-menu group
  (`src/components/molecules/ContextMenu/createUserZoneMenuItem.ts` ›
  `createUserZoneMenuItem`): "Create Zone from Selection", "Add / Remove
  Selection to/from Zone", and a "Delete Zone" list (always reachable) — every
  per-zone submenu entry carries a color dot so same-named zones stay
  distinguishable. Default names are NUMBERED per scope ("Zone", "Zone 2", … =
  max existing suffix + 1, so deletions never cause a duplicate default) and the
  default color is the first palette entry no existing user zone uses — both
  derived in `src/utils/nodeStateManagement/zones/zoneLifecycle.ts` ›
  `createUserZone`. (One documented exception: the import repair
  `src/utils/importExport/validation.ts` › `coerceUserZones` defaults a
  malformed imported name to bare `Zone`, unnumbered.)
- **The frame label.** At REST it renders as a lightweight caption in the zone's
  own color, bottom-anchored just ABOVE the hull — optically a sibling of the
  system-zone SVG labels (a display-only OKLCH lightness floor keeps a
  near-black zone's caption readable; the stored color, the swatch, and the
  frame keep the true color). On HOVER it expands into a pill with a
  select-members button (selects exactly the zone's nodes so its authored
  membership is legible — an exclusive selection that replaces the current one;
  the selected nodes are then Delete-armed like any selection), a color swatch
  (opens the OKLCH picker; the recolor is committed ONCE when the picker closes,
  via `onOpenChange`), and a delete button — the controls trail the name so the
  caption never shifts, and they stay mounted while the picker or the inline
  editor is open even if the mouse leaves. DOUBLE-CLICK anywhere on the label
  renames it in place (`src/components/atoms/EditableText/EditableText.tsx` ›
  `EditableText`). The label stacks above ReactFlow's selected-node elevation,
  so it stays visible while its members are selected (e.g. immediately after
  creation); labels sharing an anchor (two zones over the same nodes, or a user
  zone wrapping a loop/switch's exact node set) stagger upward so each stays
  independently editable.
- **Rendering split.** `ZoneFrameOverlay` still draws the dashed polygon but
  SUPPRESSES a user zone's label; the interactive label is rendered by
  `src/components/molecules/ZoneFrameOverlay/UserZoneLabelLayer.tsx` ›
  `UserZoneLabelLayer` — an HTML layer rendered via `createPortal` into
  ReactFlow's `react-flow__viewport-portal` (inheriting the viewport transform)
  with an inner `scale(1 / zoom)` for constant visual size. Frame geometry (the
  padded convex hull for both the polygon and the label) is computed ONCE in
  `FullGraph` via `src/components/molecules/ZoneFrameOverlay/useZoneFrames.ts` ›
  `computeZoneFrames` and passed to both overlays; it falls back to a bounding
  box if a hull degenerates so a user zone is never invisible.
- **Persistence (visual-only, but PERSISTED).** Unlike system zones, user zones
  are NOT stripped on export and NOT rehydrated on import — they ride `...rest`
  through `REPLACE_STATE` verbatim (an additive, backward-compatible export
  field). A malformed `userZones` from a hand-edited / version-skewed file can
  never crash the canvas: `src/utils/importExport/validation.ts` ›
  `coerceUserZones` runs on EVERY import (always-on — it also canonicalizes each
  zone's id≡key and color and drops empties), and
  `src/utils/importExport/validation.ts` › `normalizeUserZones` (enabled by the
  studio's import) prunes ghost member ids from root AND each group subtree,
  pruning each container against its own nodes.

## Entity-Relationship Diagram

```
+----------------------------+        +-----------------------------+
|           State            |        |            Zone             |
|----------------------------|        |-----------------------------|
| zones?:                    | 1    n | id: string (16-char rand)   |
|   Record<string, Zone> ----+------->| name: string                |
| zoneIndex?: ZoneIndex      |        | color: string (CSS)         |
| nodes / edges              |        | nodeIds: string[]  (body)   |
| openedNodeGroupStack?      |        | enforced: boolean           |
+----------------------------+        | boundaryHandles?:           |
   |  (subtree mirror)                |   Record<                   |
   v                                  |     nodeId,                 |
+----------------------------+        |     ZoneBoundaryHandle      |
| TypeOfNode.subtree         |        |   >          ----+          |
|----------------------------|        | structureLink?   |          |
| nodes / edges              |        |   ZoneStructureLink         |
| zones?: Record<.., Zone>   |        +-----------------------------+
| zoneIndex?: ZoneIndex      |               |              |
+----------------------------+               v              v
                                +---------------------+  +---------------------+
                                | ZoneBoundaryHandle  |  | ZoneStructureLink   |
                                |---------------------|  |---------------------|
                                | handleIds: string[] |  | structureType:      |
                                | direction:          |  |   'switch' | 'loop' |
                                |   'inputs'|'outputs'|  | structureId: string |
                                +---------------------+  | zoneRole: string    |
                                                         +---------------------+

ZoneIndex
+---------------------------------+
| handleToZone:                   |   handleId  ->  zone.id   (O(1) reverse map)
|   Record<string, string>        |
+---------------------------------+
```

A switch owns 2 zones; a loop owns 2 zones. `structureLink.structureId` is the
**anchor node** of the structure (`switchStartId` for switches, `loopStartId`
for loops), and `zoneRole` is one of `'trueBranch' | 'falseBranch'` (switch) or
`'preStop' | 'postStop'` (loop).

## Functional Dependency Diagram

```
recomputeAllZoneMemberships(state)        // call after ANY edge add/remove
├── (for each switchStart node)
│   ├── getSwitchStructureFromNode         // resolve switchStart/switchEnd
│   ├── getZoneHandleIds                    // split data handles into true/false halves
│   │   ├── getAllHandlesFromNodeData
│   │   ├── isDataHandle                    // keep switchInfer; drop bindSwitchNodes/noEquivalent
│   │   └── splitIntoZones                  // first ceil(n/2) -> true, rest -> false
│   └── findZoneByStructure(.., 'trueBranch'|'falseBranch')  // refresh boundaryHandles
├── (for each loopStart node)
│   ├── getLoopStructureFromNode            // resolve loopStart/loopStop/loopEnd
│   ├── getDataHandleIdsFromNode            // drop bindLoopNodes/loopInfer/condition/infer/noEquivalent
│   └── findZoneByStructure(.., 'preStop'|'postStop')        // refresh boundaryHandles
├── (for every zone with boundaryHandles)
│   └── discoverZoneNodesFromHandles        // BFS -> zone.nodeIds
│       ├── getBoundaryNodeIds              // Object.keys(boundaryHandles)
│       └── getOutgoers / getIncomers       // @xyflow/react traversal
└── buildZoneIndex                          // -> ZoneIndex.handleToZone

rehydrateAllZones(importedState)            // on REPLACE_STATE (zones stripped on export)
├── createSwitchZones    (per switchStart)
├── createLoopZones      (per loopStart)
└── recomputeAllZoneMemberships

isSwitchConnectionValid(...)                // boundary enforcement
├── findZoneByStructure                     // prefer precomputed zone.nodeIds
├── getNodesInSwitchRegion                  // fallback if zones absent
└── isNodeReachableToBoundary               // isolated node vs. truly-external node
```

## Data Flow Diagram

```
1. CREATION (ADD_LOOP / ADD_SWITCH)
   +------------------------------------------------------------------+
   |  applyPlan mints structure node IDs + bind edges                  |
   |  ADD_LOOP   -> createLoopZones(start, stop, end, startData,       |
   |                  stopData, endData)   => Pre-Stop + Post-Stop      |
   |  ADD_SWITCH -> createSwitchZones(start, end)  => True + False      |
   |  setCurrentZonesToState(draft, {...existing, ...new},             |
   |                          { handleToZone: {} })  // index rebuilt   |
   |                                                  // on next edge   |
   +------------------------------------------------------------------+
                              |
                              v
2. EDGE CHANGE (plan kinds ADD_EDGE / UPDATE_EDGES_RF — add / remove / inference)
   +------------------------------------------------------------------+
   |  After edges settle, applyPlan calls (if draft.zones non-empty):   |
   |    cv = getCurrentNodesAndEdgesFromState(draft)  // scope-correct  |
   |    zr = recomputeAllZoneMemberships({ ...draft,                    |
   |             nodes: cv.nodes, edges: cv.edges, zones: cv.zones })   |
   |    setCurrentZonesToState(draft, zr.zones, zr.zoneIndex)           |
   |                                                                   |
   |  -> refreshes boundaryHandles (handles change after inference)    |
   |  -> re-runs BFS membership for every zone                         |
   |  -> rebuilds handleToZone                                         |
   +------------------------------------------------------------------+
                              |
                              v
3. NODE / STRUCTURE DELETION (UPDATE_NODES_RF — node removals)
   +------------------------------------------------------------------+
   |  Drop any zone whose structureLink.structureId is no longer       |
   |  a node in the current scope, then recompute remaining zones.     |
   +------------------------------------------------------------------+
                              |
                              v
4. RENDER (FullGraph)
   +------------------------------------------------------------------+
   |  currentNodesAndEdges = getCurrentNodesAndEdgesFromState(state)   |
   |  <ZoneFrameOverlay zones={currentNodesAndEdges.zones}             |
   |                    nodes={currentNodesAndEdges.nodes} />          |
   |    -> per zone: computePaddedHull(node rects, 24) -> polygon      |
   +------------------------------------------------------------------+
                              |
                              v
5. EXPORT / IMPORT
   +------------------------------------------------------------------+
   |  Export: stateSerializer deletes state.zones / state.zoneIndex    |
   |          and subtree.zones / subtree.zoneIndex.                   |
   |  Import: REPLACE_STATE -> rehydrateAllZones(imported) repopulates |
   |          imported.zones + imported.zoneIndex from scratch.        |
   +------------------------------------------------------------------+
```

## System Diagram

```
+===========================================================================+
|                        zones/ MODULE                                      |
|                                                                           |
|  types.ts                       zoneLifecycle.ts                          |
|  +-------------------------+    +-------------------------------------+    |
|  | type Zone               |    | createSwitchZones()                 |    |
|  | type ZoneStructureLink  |    | createLoopZones()                   |    |
|  | type ZoneBoundaryHandle |    | removeStructureZones()              |    |
|  | type ZoneIndex          |    | getDataHandleIdsFromNode() (loop)   |    |
|  | getBoundaryNodeIds()    |    | recomputeAllZoneMemberships()       |    |
|  | buildZoneIndex()        |    | rehydrateAllZones()                 |    |
|  | findZoneByStructure()   |    | findZoneByStructure() (def types.ts)|    |
|  +-------------------------+    +-------------------------------------+    |
|                                                                           |
|  discoverZoneNodes.ts                                                     |
|  +---------------------------------------------------------------+        |
|  | discoverZoneNodesFromHandles()  (BFS body discovery)          |        |
|  | isNodeReachableToBoundary()     (isolated vs. external check)  |        |
|  +---------------------------------------------------------------+        |
+---------------------------------------------------------------------------+
|                     STATE MANAGEMENT INTEGRATION                          |
|                                                                           |
|  planApply/applyPlan.ts             nodes/constructAndModifyNodes.ts      |
|  +----------------------------+     +--------------------------------+    |
|  | ADD_LOOP   -> createLoop   |     | getCurrentNodesAndEdgesFrom    |    |
|  | ADD_SWITCH -> createSwitch |     |   State() -> {..,zones,        |    |
|  | edge change -> recompute   |     |              zoneIndex}        |    |
|  | delete -> prune + recompute|     | setCurrentZonesToState()       |    |
|  | REPLACE_STATE -> rehydrate |     |   (root or subtree, scope-aware|    |
|  +----------------------------+     +--------------------------------+    |
|                                                                           |
|  nodes/switches/switchRegion.ts     nodes/switches/switchValidation.ts    |
|  +----------------------------+     +--------------------------------+    |
|  | getZoneHandleIds()         |     | isSwitchConnectionValid():     |    |
|  |   isDataHandle()           |     |  uses zone.nodeIds when zones  |    |
|  |   splitIntoZones()         |     |  exist; else getNodesInSwitch  |    |
|  | getNodesInSwitchRegion()   |     |  Region(); isNodeReachableTo   |    |
|  +----------------------------+     |  Boundary() for isolated nodes |    |
|                                     +--------------------------------+    |
+---------------------------------------------------------------------------+
|                              UI / GRAPH                                   |
|                                                                           |
|  components/molecules/ZoneFrameOverlay/                                   |
|  +---------------------------------------------------------------+        |
|  | ZoneFrameOverlay.tsx  -> SVG overlay, viewport-transformed     |        |
|  | convexHull.ts         -> convexHull() + computePaddedHull()    |        |
|  +---------------------------------------------------------------+        |
|  Mounted by FullGraph.tsx:                                                |
|    <ZoneFrameOverlay zones={current.zones} nodes={current.nodes} />       |
+---------------------------------------------------------------------------+
```

## The Zone Type

Defined in `src/utils/nodeStateManagement/zones/types.ts` › `Zone`:

```typescript
type Zone = {
  /** Opaque unique identifier (16-char base-36 random, not derived from node IDs). */
  id: string;
  /** Display name shown on the zone frame label. */
  name: string;
  /** CSS color for the zone frame polygon and label. */
  color: string;
  /** IDs of body nodes currently inside this zone (recomputed on every edge change). */
  nodeIds: string[];
  /**
   * Per-boundary-node handle definitions. Keys are boundary node IDs.
   * BFS discovery starts from edges on these handles and stops at boundary nodes.
   * Undefined for user-created zones (no boundaries, visual only).
   */
  boundaryHandles?: Record<string, ZoneBoundaryHandle>;
  /** Present for system-controlled zones; absent for user-created zones. */
  structureLink?: ZoneStructureLink;
  /** Whether connections crossing this zone's boundary are blocked. */
  enforced: boolean;
};
```

### ZoneStructureLink

`src/utils/nodeStateManagement/zones/types.ts` › `ZoneStructureLink`. Links a
system zone to the structural node pair/triplet that owns it, so zones can be
found **by structure** rather than by their opaque IDs:

```typescript
type ZoneStructureLink = {
  structureType: 'switch' | 'loop';
  structureId: string; // anchor node ID: switchStartId or loopStartId
  zoneRole: string; // e.g. 'trueBranch', 'falseBranch', 'preStop', 'postStop'
};
```

### ZoneBoundaryHandle

`src/utils/nodeStateManagement/zones/types.ts` › `ZoneBoundaryHandle`. Describes
the handles on **one** boundary node that bound the zone. `direction` tells the
BFS which side of the boundary node the zone's body connects to:

```typescript
type ZoneBoundaryHandle = {
  handleIds: string[]; // handle IDs on this boundary node belonging to this zone
  direction: 'inputs' | 'outputs';
};
```

### ZoneIndex

`src/utils/nodeStateManagement/zones/types.ts` › `ZoneIndex`. A reverse index
for O(1) lookups during connection validation:

```typescript
type ZoneIndex = {
  handleToZone: Record<string, string>; // boundary handle ID -> zone ID
};
```

Built by `buildZoneIndex(zones)` (`src/utils/nodeStateManagement/zones/types.ts`
› `buildZoneIndex`), which walks every zone's `boundaryHandles` and maps each
handle ID to its zone's `id`. Rebuilt whenever zones change.

### Helper functions (zones/types.ts)

- `getBoundaryNodeIds(zone)` — returns `Object.keys(zone.boundaryHandles ?? {})`
  (empty for user zones).
- `buildZoneIndex(zones)` — see above.
- `findZoneByStructure(zones, structureId, zoneRole)` — O(n) scan returning the
  zone whose `structureLink` matches the given `structureId` + `zoneRole` (n is
  small — 2 zones per structure).

## How Zones Are Stored (Scope-Local State)

Zones live on the **active scope**, mirroring how nodes/edges work for node
groups:

- Root graph: `state.zones` + `state.zoneIndex`
  (`src/utils/nodeStateManagement/types.ts` › `State`).
- Inside a node group: `subtree.zones` + `subtree.zoneIndex`
  (`src/utils/nodeStateManagement/types.ts` › `TypeOfNode`).

Two helpers in `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts`
› `getCurrentNodesAndEdgesFromState` read and write the correct scope based on
`openedNodeGroupStack`:

- `getCurrentNodesAndEdgesFromState(state)` returns
  `{ nodes, edges, zones, zoneIndex, ... }` for the current view — root-level
  when the stack is empty, or the opened group's subtree otherwise
  (`src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
  `getCurrentNodesAndEdgesFromState`).
- `setCurrentZonesToState(state, zones, zoneIndex)` writes back to
  `state.zones`/`state.zoneIndex` at root, or
  `subtree.zones`/`subtree.zoneIndex` inside a group
  (`src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
  `setCurrentZonesToState`).

Because zones are scope-local, a loop or switch **inside a group** gets its own
zones on that group's subtree, independent of root-level zones.

## Boundary Handles: Concrete Data Handles Only

A zone's boundary is defined by **data** handles, never by structural/control
handles. Two filters enforce this depending on the structure type.

### Loop boundaries — getDataHandleIdsFromNode

`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` ›
`getDataHandleIdsFromNode`. Extracts concrete data handle IDs from a loop node's
`inputs` or `outputs`, **filtering out**:

- handles with no `dataType.dataTypeUniqueId`,
- `standardDataTypeNamesMap.bindLoopNodes` (structural bind),
- `standardDataTypeNamesMap.loopInfer` (the infer template type),
- `standardDataTypeNamesMap.condition` (the boolean control handle),
- handles whose `underlyingType` is `'noEquivalent'`,
- handles whose `underlyingType` is `'inferFromConnection'` (unresolved infer
  templates).

```typescript
return handles
  .filter((h) => {
    const dtId = h.dataType?.dataTypeUniqueId;
    if (!dtId) return false;
    const ut = h.dataType?.dataTypeObject?.underlyingType;
    return (
      dtId !== standardDataTypeNamesMap.bindLoopNodes &&
      dtId !== standardDataTypeNamesMap.loopInfer &&
      dtId !== standardDataTypeNamesMap.condition &&
      ut !== 'noEquivalent' &&
      ut !== 'inferFromConnection'
    );
  })
  .map((h) => h.id)
  .filter((id): id is string => Boolean(id));
```

The net effect: only the **resolved** `loopInfer` channels (the ones that have
been connected and inferred to a concrete type) become boundary handles. The
pristine `loopInfer` template, the `bindLoopNodes` link, and the `condition`
input are excluded.

### Switch boundaries — getZoneHandleIds / isDataHandle

`src/utils/nodeStateManagement/nodes/switches/switchRegion.ts` ›
`getZoneHandleIds`. For switches, `getZoneHandleIds(switchStructure)` collects
the data outputs on `switchStart` and data inputs on `switchEnd`, then **splits
them in half** into true vs. false zones:

- `isDataHandle(h)` keeps a handle if its data type is `switchInfer`, or if it
  is neither `bindSwitchNodes` nor a `noEquivalent`-underlying type — so the
  `bindSwitchNodes` handle is excluded. (The `condition` input is excluded
  simply by side selection: `getZoneHandleIds` only reads `switchStart`
  **outputs** and `switchEnd` **inputs**, and `condition` is an _input_ on
  `switchStart`; note `condition`'s underlying type is `'boolean'`, not
  `'noEquivalent'`, so `isDataHandle` would not filter it.)
- `splitIntoZones(handles)` assigns the first `ceil(count / 2)` handles to the
  **true** zone and the rest to the **false** zone (by array order), returning
  `{ trueIds, falseIds }`.

`getZoneHandleIds` returns the four sets that become the switch zones' boundary
handles:

```typescript
type ZoneHandleIds = {
  switchStartTrueOutputIds: Set<string>;
  switchStartFalseOutputIds: Set<string>;
  switchEndTrueInputIds: Set<string>;
  switchEndFalseInputIds: Set<string>;
};
```

## Zone Membership: BFS Discovery

### discoverZoneNodesFromHandles

`src/utils/nodeStateManagement/zones/discoverZoneNodes.ts` ›
`discoverZoneNodesFromHandles`. A single-pass **bidirectional BFS** that returns
the set of body node IDs inside a zone (excluding the boundary nodes
themselves).

Algorithm:

1. If the zone has no `boundaryHandles`, return an empty set (user zones have no
   body to discover).
2. Build `boundaryNodeIdSet` from `getBoundaryNodeIds(zone)`.
3. **Seed the queue** by scanning all edges: for each boundary node and its
   `{ handleIds, direction }`:
   - `direction === 'outputs'`: an edge whose `source` is the boundary node and
     whose `sourceHandle` is in `handleIds` seeds the edge's `target` (unless
     that target is itself a boundary node).
   - `direction === 'inputs'`: an edge whose `target` is the boundary node and
     whose `targetHandle` is in `handleIds` seeds the edge's `source` (unless it
     is a boundary node).
4. **Expand**: pop nodes off the queue; skip if already visited or a boundary
   node; otherwise mark visited and enqueue all `getOutgoers` and `getIncomers`
   (from `@xyflow/react`) that are neither visited nor boundary nodes.
5. Return the `visited` set — these become `zone.nodeIds`.

The bidirectional expansion captures body nodes reachable through indirect /
zigzag paths, not just direct neighbors of the boundary.

### isNodeReachableToBoundary

`src/utils/nodeStateManagement/zones/discoverZoneNodes.ts` ›
`isNodeReachableToBoundary`. A bidirectional reachability check used by **switch
validation** to distinguish:

- **Isolated** nodes (no path to any boundary node) — allowed to join a zone,
  and
- **Truly external** nodes (connected to outside-structure nodes) — blocked from
  connecting to zone handles without going through the structure.

It BFS-walks outgoers/incomers from `startNodeId` and returns `true` as soon as
it reaches any node in `boundaryNodeIds`, otherwise `false`.

## Zone Lifecycle

### Creation: createSwitchZones / createLoopZones

`createSwitchZones(switchStartId, switchEndId, ...)`
(`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `createSwitchZones`)
returns two zones keyed by fresh 16-char random base-36 IDs
(`generateRandomString(16)` — pseudo-random, not RFC-4122 UUIDs):

| Zone         | name           | color     | zoneRole      | boundaryHandles                                |
| ------------ | -------------- | --------- | ------------- | ---------------------------------------------- |
| True Branch  | `True Branch`  | `#4ade80` | `trueBranch`  | `switchStart` (outputs) + `switchEnd` (inputs) |
| False Branch | `False Branch` | `#f87171` | `falseBranch` | `switchStart` (outputs) + `switchEnd` (inputs) |

`createLoopZones(loopStartId, loopStopId, loopEndId, loopStartData, loopStopData, loopEndData)`
(`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `createLoopZones`)
returns two zones:

| Zone           | name             | color     | zoneRole   | boundaryHandles                                                                            |
| -------------- | ---------------- | --------- | ---------- | ------------------------------------------------------------------------------------------ |
| Pre-Stop Body  | `Pre-Stop Body`  | `#a78bfa` | `preStop`  | `loopStart` outputs (data outs) + `loopStop` inputs (data ins) + `loopEnd` inputs (empty)  |
| Post-Stop Body | `Post-Stop Body` | `#8b5cf6` | `postStop` | `loopStop` outputs (data outs) + `loopEnd` inputs (data ins) + `loopStart` outputs (empty) |

The boundary handle IDs come from `getDataHandleIdsFromNode(...)` applied to
each loop node's data. The extra boundary node with an **empty** `handleIds`
array (e.g. `loopEnd` for the pre-stop zone) is present so that node is treated
as a boundary stop during BFS even though it contributes no seed edges. At
creation time the boundary handle IDs may be empty (loop nodes start with only
template infer handles); they are refreshed by `recomputeAllZoneMemberships`
once channels are wired.

All four system zones are created with `enforced: true`.

### Wiring at ADD_LOOP / ADD_SWITCH

In `applyPlan`:

- **ADD_LOOP** (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
  `ADD_LOOP`) calls `createLoopZones(...)` with the freshly minted node IDs +
  node data, then merges them into the current scope via
  `setCurrentZonesToState(draft, { ...existing, ...loopZones }, { handleToZone: {} })`.
- **ADD_SWITCH** (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
  `ADD_SWITCH`) calls `createSwitchZones(switchStartId, switchEndId)` and merges
  similarly.

Both pass an **empty** `{ handleToZone: {} }` index at creation; the real index
is rebuilt on the next `recomputeAllZoneMemberships` (which runs after edge
changes).

### Refresh after edge changes: recomputeAllZoneMemberships

`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` ›
`recomputeAllZoneMemberships`. This is the workhorse, called after **any** edge
addition/removal. It must be given **scope-correct** state (use
`getCurrentNodesAndEdgesFromState` first). It:

1. **Refreshes switch boundary handles**: for every `switchStart` node, resolves
   its structure, recomputes `getZoneHandleIds`, and rewrites the true/false
   zones' `boundaryHandles` (handles change as inference adds channels).
2. **Refreshes loop boundary handles**: for every `loopStart` node, recomputes
   data handle IDs via `getDataHandleIdsFromNode` and rewrites the pre-stop /
   post-stop zones' `boundaryHandles`.
3. **Recomputes membership** for **all** zones with `boundaryHandles` via
   `discoverZoneNodesFromHandles`, writing the result to `zone.nodeIds`.
4. Returns `{ zones, zoneIndex: buildZoneIndex(zones) }`.

`applyPlan` calls it after edge plans settle, gated on
`draft.zones && Object.keys(draft.zones).length > 0`
(`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `ADD_EDGE`,
`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `UPDATE_EDGES_RF`),
then persists via `setCurrentZonesToState`.

### Deletion cleanup

When nodes are deleted, `applyPlan`
(`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `UPDATE_NODES_RF`)
walks the current scope's zones and **deletes any zone whose
`structureLink.structureId` is no longer present** among the surviving nodes,
then recomputes memberships for the rest.
`removeStructureZones(zones, structureId)`
(`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` ›
`removeStructureZones`) provides the same "remove all zones owned by a
structure" operation.

### Rehydration on import: rehydrateAllZones

`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `rehydrateAllZones`.
Because zones are stripped on export, the imported state has **no** `zones`
field. On `REPLACE_STATE`, `applyPlan`
(`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `REPLACE_STATE`) calls
`rehydrateAllZones(imported)`, which:

1. Scans `state.nodes` for every `switchStart` and creates its switch zones via
   `createSwitchZones`.
2. Scans for every `loopStart` and creates its loop zones via `createLoopZones`
   (passing each triplet node's data).
3. Returns `recomputeAllZoneMemberships({ ...state, zones })` so boundary
   handles and memberships are computed from the imported edges.

The result is assigned to `imported.zones` and `imported.zoneIndex`.

> Note: `rehydrateAllZones` operates on the **root**
> `state.nodes`/`state.edges`. Subtree zones (`TypeOfNode.subtree.zones`) are
> likewise stripped on export and are recomputed lazily as the user edits/opens
> groups and edges settle in that scope.

## Zones and Connection Validation

Zone memberships are consumed by **switch** connection validation,
`isSwitchConnectionValid`
(`src/utils/nodeStateManagement/nodes/switches/switchValidation.ts` ›
`isSwitchConnectionValid`), which prefers the precomputed `zone.nodeIds` and
falls back to recomputing regions only when zones are absent.

For the **neither-node-is-a-switch** case
(`src/utils/nodeStateManagement/nodes/switches/switchValidation.ts` ›
`isSwitchConnectionValid`):

```typescript
const trueZone = state.zones
  ? findZoneByStructure(state.zones, structure.switchStart.id, 'trueBranch')
  : undefined;
const falseZone = state.zones
  ? findZoneByStructure(state.zones, structure.switchStart.id, 'falseBranch')
  : undefined;

let nodesInTrueBranch: Set<string>;
let nodesInFalseBranch: Set<string>;
if (trueZone && falseZone) {
  nodesInTrueBranch = new Set(trueZone.nodeIds); // use precomputed membership
  nodesInFalseBranch = new Set(falseZone.nodeIds);
} else {
  const regions = getNodesInSwitchRegion(state, structure); // fallback BFS
  nodesInTrueBranch = regions.nodesInTrueBranch;
  nodesInFalseBranch = regions.nodesInFalseBranch;
}
```

The validator then rejects:

- **Cross-branch** edges (source in true and target in false, or vice versa):
  _"Can't connect nodes across true and false branches of the same switch"_
- **Inside-to-outside** edges when the outside node is **not isolated**
  (`isNodeReachableToBoundary` returns `true`): _"Can't connect between inside
  and outside a switch branch without going through Switch Start/End"_ Isolated
  nodes are allowed so a freshly dropped node can be wired into a branch.

The scoped state passed into validation includes `zones`/`zoneIndex` when
present (`src/utils/nodeStateManagement/planApply/validateAddEdge.ts` ›
`validateAddEdge`), so validation runs against the correct scope's zones.

> Loop connection isolation is enforced separately by the loop validator
> (`isLoopConnectionValid`, region-based — see the Loops doc); the loop pre/post
> zones are primarily a **visual + membership** construct. Switch validation is
> the path that currently reads `zone.nodeIds` directly.

## Zone Frame Rendering

### ZoneFrameOverlay

`src/components/molecules/ZoneFrameOverlay/ZoneFrameOverlay.tsx` ›
`ZoneFrameOverlay`. An SVG overlay that draws one dashed polygon + label per
zone. Props:

```typescript
type ZoneFrameOverlayProps = {
  zones: Record<string, Zone> | undefined;
  nodes: ReadonlyArray<{
    id: string;
    position: { x: number; y: number };
    measured?: { width?: number; height?: number };
  }>;
};
```

Rendering logic:

1. Reads the live viewport (`x`, `y`, `zoom`) from ReactFlow's store via
   `useStore`, so the overlay tracks pan/zoom exactly.
2. For each zone (skipping zones with **0** `nodeIds`), builds the bounding
   rects of its member nodes (default size `180 x 60` when `measured` is
   missing).
3. `computePaddedHull(rects, 24)` produces a padded convex hull; zones whose
   hull has `< 3` points are skipped.
4. The hull becomes an SVG `<polygon>` filled with `zone.color` at low opacity
   plus a dashed stroke; stroke width / dash / font scale are divided by `zoom`
   so they stay visually constant. The `<text>` label uses `zone.name` and is
   placed near the hull's top-left point.
5. Everything is wrapped in a `<g transform="translate(x, y) scale(zoom)">` so
   the frame aligns with graph coordinates.

The overlay returns `null` when there are no renderable frames. It is mounted in
`FullGraph` after `<Background />`
(`src/components/organisms/FullGraph/FullGraph.tsx` › `graphContent`):

```tsx
<ZoneFrameOverlay
  zones={currentNodesAndEdges.zones}
  nodes={currentNodesAndEdges.nodes}
/>
```

### convexHull / computePaddedHull

`src/components/molecules/ZoneFrameOverlay/convexHull.ts` › `convexHull`.

- `convexHull(points)` — Andrew's monotone-chain algorithm. Sorts points by `x`
  then `y`, builds the lower and upper hull, and returns the hull vertices in
  winding order (clockwise in screen coordinates, where `y` grows downward).
  Handles `<= 1` point trivially. The orientation is irrelevant to the SVG
  `<polygon>` fill that consumes it.
- `computePaddedHull(nodeRects, padding = 20)` — expands each node rect by
  `padding` on all sides, emits the **four padded corners** of every rect as
  candidate points, and runs `convexHull` over them. `ZoneFrameOverlay` calls it
  with `padding = 24`.

## Import / Export Behavior

Zones are **UI-only** and never serialized:

- `stateSerializer` deletes `cloned.zones` and `cloned.zoneIndex`
  (`src/utils/importExport/stateSerializer.ts` › `StateSerializer`), and for
  each group type's subtree deletes `subtree.zones` / `subtree.zoneIndex`
  (`src/utils/importExport/stateSerializer.ts` › `StateSerializer`).
- On import, `REPLACE_STATE` rehydrates zones from the structures present in the
  imported nodes (see `rehydrateAllZones` above). This keeps the export format
  free of derived/visual state while guaranteeing zones reappear identically.

## Limitations and Future Work

- **System vs user zones.** `state.zones` holds the SYSTEM zones (created by
  `ADD_LOOP`/`ADD_SWITCH`, with a `structureLink` + `boundaryHandles`,
  recomputed / stripped / rehydrated). User-created zones are now SHIPPED in a
  separate `state.userZones` field (authored membership, persisted, no
  enforcement) — see the **User Zones** section above. `getBoundaryNodeIds` /
  `discoverZoneNodesFromHandles` return empty for any zone without
  `boundaryHandles`.
- **`enforced` is set but read indirectly.** System zones are created with
  `enforced: true`. Today the boundary rules are applied through switch
  validation (`isSwitchConnectionValid`) reading `zone.nodeIds`, rather than a
  single generic "block if `enforced`" gate keyed off `zoneIndex.handleToZone`.
  The `handleToZone` index is built and maintained for O(1) lookups and future
  generic enforcement.
- **Empty zones don't render.** A zone with no member nodes
  (`nodeIds.length === 0`) is skipped by `ZoneFrameOverlay`, so a brand-new
  loop/switch shows no frame until body nodes are wired into a branch.
- **Switch zone split is positional.** `splitIntoZones` assigns the first
  `ceil(n/2)` data handles to the true branch by **array order**; the true/false
  partition follows handle ordering, which the switch editor controls.
- **Membership recompute is O(zones x edges) per change.**
  `recomputeAllZoneMemberships` re-seeds and re-walks every zone on each edge
  change. This is acceptable because the BFS is bounded by the current scope and
  zone counts are small, but it is a full recompute rather than an incremental
  update.

## Examples

### Inspecting zones for a switch structure

```typescript
import { findZoneByStructure } from '@/utils/nodeStateManagement/zones';

// state.zones is the current root scope's zones (or subtree.zones inside a group)
const trueZone = findZoneByStructure(
  state.zones ?? {},
  switchStartId,
  'trueBranch',
);
const falseZone = findZoneByStructure(
  state.zones ?? {},
  switchStartId,
  'falseBranch',
);

console.log(trueZone?.name); // "True Branch"
console.log(trueZone?.color); // "#4ade80"
console.log(trueZone?.nodeIds); // body node IDs currently inside the true branch
```

### Recomputing memberships after a manual edge edit

```typescript
import { recomputeAllZoneMemberships } from '@/utils/nodeStateManagement/zones';
import {
  getCurrentNodesAndEdgesFromState,
  setCurrentZonesToState,
} from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';

// Inside an Immer producer (draft = mutable State):
const view = getCurrentNodesAndEdgesFromState(draft);
const scopedState = {
  ...draft,
  nodes: view.nodes,
  edges: view.edges,
  zones: view.zones,
};
const { zones, zoneIndex } = recomputeAllZoneMemberships(scopedState);
setCurrentZonesToState(draft, zones, zoneIndex);
```

### Rendering zone frames in a custom canvas

```tsx
import { ZoneFrameOverlay } from '@/components/molecules/ZoneFrameOverlay';
import { getCurrentNodesAndEdgesFromState } from '@/utils';

const current = getCurrentNodesAndEdgesFromState(state);

// Mount inside <ReactFlow> so useStore can read the viewport transform:
<ZoneFrameOverlay zones={current.zones} nodes={current.nodes} />;
```

## Relationships with Other Features

### -> [Loops (pre-stop / post-stop zones)](loopsDoc.md)

Each loop triplet owns the **Pre-Stop Body** and **Post-Stop Body** zones,
created by `createLoopZones` at `ADD_LOOP`. Loop boundary handles are the loop
nodes' **resolved** data channels (`loopInfer` after inference); the
`bindLoopNodes` link and `condition` input are filtered out by
`getDataHandleIdsFromNode`.

### -> [Switches (true / false branch zones)](switchesDoc.md)

Each switch pair owns the **True Branch** and **False Branch** zones, created by
`createSwitchZones` at `ADD_SWITCH`. Switch boundary handles come from
`getZoneHandleIds` (in `switchRegion.ts`), which splits the data handles in half
positionally. `isSwitchConnectionValid` reads `zone.nodeIds` to enforce
cross-branch and inside/outside rules.

### -> [Connection Validation (boundary enforcement)](connectionValidationDoc.md)

Switch branch validation consumes zone memberships and uses
`isNodeReachableToBoundary` to allow isolated nodes while blocking truly
external nodes from crossing a branch boundary. The scoped state handed to
validation includes `zones`/`zoneIndex`.

### -> [Node Groups (scope-local zones)](nodeGroupsDoc.md)

Zones are scope-local: a loop/switch inside a group stores its zones on
`subtree.zones`/`subtree.zoneIndex`. `getCurrentNodesAndEdgesFromState` and
`setCurrentZonesToState` route reads/writes to the active scope based on
`openedNodeGroupStack`.

### -> [State Management (ADD_LOOP / ADD_SWITCH, REPLACE_STATE)](../core/stateManagementDoc.md)

`applyPlan` creates zones in the `ADD_LOOP` / `ADD_SWITCH` plan cases,
recomputes them after edge plans, prunes them on deletion, and rehydrates them
on `REPLACE_STATE`. `state.zones` / `state.zoneIndex` are part of the `State`
type.

### -> [Handles (concrete data handles define boundaries)](../core/handlesDoc.md)

Boundary handles are drawn from each structure node's input/output handles,
filtered to **concrete data** handles only. As inference adds channels, boundary
handle sets are refreshed by `recomputeAllZoneMemberships`.

### -> [Type Inference (resolved infer channels become boundaries)](../core/typeInferenceDoc.md)

Only resolved `loopInfer` / `switchInfer` channels become boundary handles —
pristine `inferFromConnection` templates are filtered out. Connecting and
inferring a channel changes the handle set, triggering a zone recompute on the
next edge settle.

### -> [Import/Export (zones stripped + rehydrated)](../importExport/importExportDoc.md)

`stateSerializer` strips `zones`/`zoneIndex` (root and subtree) on export;
`REPLACE_STATE` rebuilds them from scratch via `rehydrateAllZones` on import.

### -> [FullGraph UI (ZoneFrameOverlay)](../ui/fullGraphDoc.md)

`FullGraph` mounts `ZoneFrameOverlay` inside ReactFlow, passing the current
scope's `zones` and `nodes`. The overlay renders a padded convex-hull frame per
non-empty zone, transformed by the live viewport.
