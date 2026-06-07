# Context Menu

## Overview

The context menu system provides the right-click menu for the graph editor. It
is built from seven cooperating modules:

| Module                        | File                                                                                                | Role                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextMenu`                 | `src/components/molecules/ContextMenu/ContextMenu.tsx` › `ContextMenu`                              | Generic, recursive renderer for menu items with icons, shortcuts, separators, and nested submenus                                      |
| `useSubmenuManager`           | `src/components/molecules/ContextMenu/useSubmenuManager.ts` › `useSubmenuManager`                   | Hook managing submenu open/close state, hover timers, crossfade animations, Floating UI positioning, and ResizeObserver-driven sizing  |
| `createNodeContextMenu`       | `src/components/molecules/ContextMenu/createNodeContextMenu.ts` › `createNodeContextMenu`           | Generates the "Add Node" menu tree from `typeOfNodes`, respecting `locationInContextMenu` nesting and `priorityInContextMenu` ordering |
| `createLoopMenuItem`          | `src/components/molecules/ContextMenu/createLoopMenuItem.ts` › `createLoopMenuItem`                 | Generates the single "Add Loop" item that dispatches `ADD_LOOP`                                                                        |
| `createSwitchMenuItem`        | `src/components/molecules/ContextMenu/createSwitchMenuItem.ts` › `createSwitchMenuItem`             | Generates the single "Add Switch" item that dispatches `ADD_SWITCH`                                                                    |
| `createImportExportMenuItems` | `src/components/organisms/FullGraph/createImportExportMenuItems.ts` › `createImportExportMenuItems` | Generates the "Import/Export" submenu (state + recording export/import)                                                                |
| `FullGraphContextMenu`        | `src/components/organisms/FullGraph/FullGraphContextMenu.tsx` › `FullGraphContextMenu`              | Wrapper that positions the menu at the right-click coordinates using Floating UI, with fade-in/out animation                           |

The menu is opened via `onContextMenu` on the ReactFlow canvas. Clicking an item
dispatches an action (e.g. `ADD_NODE_AND_SELECT`, `ADD_LOOP`, `ADD_SWITCH`) or
triggers a callback (import/export), then closes the menu.

> **Barrel exports**: `src/components/molecules/ContextMenu/index.ts` re-exports
> (via `export *`) `ContextMenu` (and its `ContextMenuItem` / `ContextMenuProps`
> types) along with `createNodeContextMenu` (and its
> `CreateNodeContextMenuProps` type). `FullGraph` does not use this barrel,
> though: `createNodeContextMenu` and the loop, switch, and import/export
> builders are all imported by direct path from
> `src/components/organisms/FullGraph/FullGraph.tsx` ›
> `FullGraphWithReactFlowProvider`.

## Top-level menu structure

`FullGraph` assembles the items by concatenating four builders, in this exact
order (see `src/components/organisms/FullGraph/FullGraph.tsx` ›
`contextMenuItems`):

```
Add Loop      (RepeatIcon)        -> createLoopMenuItem
Add Switch    (GitBranchIcon)     -> createSwitchMenuItem
Add Node      (PlusIcon)          -> createNodeContextMenu  (nested submenu tree)
Import/Export (ArrowDownUpIcon)   -> createImportExportMenuItems  (separator above)
  ├── Export State      (FileOutputIcon)
  ├── Import State      (FileInputIcon)
  ├── Export Recording  (FileOutputIcon, separator above)
  └── Import Recording  (FileInputIcon)
```

`Add Loop` and `Add Switch` are flat leaf items (no submenu). `Add Node` is the
only top-level item with a generated nested submenu tree. `Import/Export`
carries `separator: true`, drawing a divider line above it to visually separate
it from the "Add Node" item.

## Entity-Relationship Diagram

```
+---------------------+        +------------------------+
|   ContextMenuItem   |        |    TypeOfNode          |
|---------------------|        |------------------------|
| id: string          |        | name: string           |
| label: string       |        | locationInContextMenu? |
| icon?: ReactNode    |        |   string[]             |
| subItems?:          |------->| priorityInContextMenu? |
|   ContextMenuItem[] |        |   number               |
| onClick?: () => void|        | subtree?               |
| shortcut?: string   |        +------------------------+
| separator?: boolean |               |
+---------------------+               | defines placement in
       |                              v
       | rendered by          +-------------------+
       v                      | createNodeContext |
+---------------------+       | Menu()            |
| ContextMenu         |       +-------------------+
|---------------------|               |
| subItems            |               | builds intermediate
| className?          |               v
| onItemClick?        |       +-------------------+
+---------------------+       | MenuTreeNode      |
       |                      |-------------------|
       | delegates to         | MenuTreeLeaf      |
       v                      |   kind: 'leaf'    |
+---------------------+       |   item, priority  |
| ContextMenuSubmenu  |       |   insertionIndex  |
|---------------------|       | MenuTreeFolder    |
| uses                |       |   kind: 'folder'  |
|  useSubmenuManager  |       |   label, children |
+---------------------+       +-------------------+
       |
       | positioned by
       v
+---------------------+
| FullGraphContextMenu|
|---------------------|
| isOpen: boolean     |
| position: XYPosition|
| onClose: () => void |
| items:              |
|   ContextMenuItem[] |
+---------------------+
```

## Data Flow Diagram

```
User right-clicks on canvas
        |
        v
+---------------------------+
| handleContextMenu(event)  |
| event.preventDefault()    |
| captures screen coords    |
|   { x: clientX,           |
|     y: clientY }          |
| setContextMenu({          |
|   isOpen: true,           |
|   position: {x, y} })     |   <- position is SCREEN space
+---------------------------+
        |
        v
+-----------------------------------------------------------+
| contextMenuItems = useMemo([                              |
|   ...createLoopMenuItem(...),                             |
|   ...createSwitchMenuItem(...),                           |
|   ...createNodeContextMenu(...),                          |
|   ...createImportExportMenuItems(...),                    |
| ])                                                        |
|                                                           |
| Every builder receives                                    |
|   contextMenuPosition =                                   |
|     screenToFlowPosition(contextMenu.position)            |   <- FLOW space
| so dispatched payloads carry flow-space coordinates.      |
+-----------------------------------------------------------+
        |
        v
+---------------------------+
| FullGraphContextMenu      |
| Floating UI positions the |
| menu at the SCREEN click  |
| coords (virtual ref).     |
| Fade-in / fade-out anim.  |
+---------------------------+
        |
        v
+---------------------------+
| ContextMenu               |
|  -> ContextMenuSubmenu    |
|     renders items         |
|     useSubmenuManager     |
|     handles hover/submenu |
+---------------------------+
        |
        v (user clicks item)
+-----------------------------------------------------------+
| handleItemClick(item):                                    |
|   item.onClick?.()                                        |
|   onItemClick?.(item)                                     |
|                                                           |
| Add Loop:   dispatch ADD_LOOP   { position } + close      |
| Add Switch: dispatch ADD_SWITCH { position } + close      |
| Add Node:   dispatch ADD_NODE_AND_SELECT                  |
|             { type, position } + close                    |
| Import/Export: callback (export/trigger file input)       |
|             then closeMenu()                              |
+-----------------------------------------------------------+
```

## System Diagram

```
+-----------------------------------------------------------------------+
|  FullGraphWithReactFlowProvider                                       |
|                                                                       |
|  +-- useGraphImportExport({ state, dispatch, ... })                   |
|  |     handleExportState / handleExportRecording                     |
|  |     importStateInputRef / importRecordingInputRef                 |
|  |     FileInputElements (hidden <input type="file"> x2)             |
|  |                                                                    |
|  +-- ReactFlow canvas                                                 |
|  |     onContextMenu ──> handleContextMenu()  (screen coords)        |
|  |     onClick       ──> closeMenu()                                 |
|  |                                                                    |
|  +-- contextMenuItems = useMemo([                                    |
|  |      ...createLoopMenuItem({ dispatch, setContextMenu,            |
|  |             contextMenuPosition }),                               |
|  |      ...createSwitchMenuItem({ dispatch, setContextMenu,          |
|  |             contextMenuPosition }),                               |
|  |      ...createNodeContextMenu({                                   |
|  |             typeOfNodes, dispatch, setContextMenu,                |
|  |             contextMenuPosition,                                  |
|  |             currentNodeType: currentNodeGroup?.nodeType,          |
|  |             isRecursionAllowed: !state.enableRecursionChecking,   |
|  |             hiddenNodeTypesInContextMenu }),                      |
|  |      ...createImportExportMenuItems({                             |
|  |             onExportState, onImportState,                         |
|  |             onExportRecording, onImportRecording, closeMenu })    |
|  |    ])                                                             |
|  |    (contextMenuPosition = screenToFlowPosition(position))        |
|  |                                                                    |
|  +-- FullGraphContextMenu                                            |
|       |  isOpen, position, onClose, items                            |
|       |                                                              |
|       +-- Floating UI (useFloating, useDismiss, useInteractions)     |
|       |     placement: 'bottom-start'                                |
|       |     middleware: offset(5),                                   |
|       |                 flip({ fallbackPlacements: ['top-start'] }), |
|       |                 shift({ padding: 8 })                        |
|       |     virtual reference from screen click position             |
|       |                                                              |
|       +-- ContextMenu                                                |
|            +-- ContextMenuSubmenu (recursive)                        |
|                 +-- useSubmenuManager                                |
|                 |     activeSubmenuId, hover timers,                 |
|                 |     crossfade phases, ResizeObserver,              |
|                 |     Floating UI for submenus                       |
|                 +-- ContextMenuItemComponent (per item)             |
|                 |     icon, label, shortcut, separator,             |
|                 |     chevron for items with subItems               |
|                 +-- FloatingPortal (shared submenu panel)           |
|                       slide + crossfade animations                  |
|                       -> recursive ContextMenuSubmenu (bare)        |
+-----------------------------------------------------------------------+
```

## ContextMenuItem Type

Defined and exported from `src/components/molecules/ContextMenu/ContextMenu.tsx`
› `ContextMenuItem`:

```typescript
type ContextMenuItem = {
  id: string; // Unique identifier
  label: string; // Display text
  icon?: ReactNode; // Optional icon (left of label)
  subItems?: ContextMenuItem[]; // Nested submenu items
  onClick?: () => void; // Click handler
  shortcut?: string; // Keyboard shortcut display text
  separator?: boolean; // Show separator line before this item
};
```

Key characteristics:

- **Recursive**: `subItems` allows unlimited nesting depth.
- **Both fields allowed**: Items can technically have both `onClick` and
  `subItems`, though in practice leaf items use `onClick` and folder items use
  `subItems`. An item is treated as a folder (chevron shown, hover opens a
  submenu) whenever `subItems` is non-empty.
- **`separator`**: Renders a `border-t border-gray-600` divider line _before_
  the item, and only when `index > 0` (the first item never shows a separator,
  even if `separator: true`).

`ContextMenuProps` (also exported from
`src/components/molecules/ContextMenu/ContextMenu.tsx` › `ContextMenuProps`):

```typescript
type ContextMenuProps = {
  subItems: ContextMenuItem[];
  className?: string;
  onItemClick?: (item: ContextMenuItem) => void;
};
```

## ContextMenu Component

**File**: `src/components/molecules/ContextMenu/ContextMenu.tsx` › `ContextMenu`

The public `ContextMenu` component is a thin wrapper that renders a single
`ContextMenuSubmenu` inside a `relative`-positioned `<div>`:

```
ContextMenu
  └── ContextMenuSubmenu (handles all rendering + submenu logic)
        ├── <ul> with ContextMenuItemComponent for each item
        └── FloatingPortal with shared submenu panel
              └── ContextMenuSubmenu (bare, recursive)
```

### ContextMenuSubmenu

The workhorse component. It:

1. Renders a `<ul>` list of `ContextMenuItemComponent` rows.
2. Manages a **single shared floating submenu panel** via `useSubmenuManager`.
3. When an item with `subItems` is hovered, the floating panel slides in from
   the right, anchored to that item row.
4. Uses `FloatingPortal` to escape `overflow:hidden` clipping.
5. Renders the shared floating panel only when at least one item in the current
   list actually has `subItems` (`hasAnySubItems`).
6. Supports a `bare` prop — when `true`, omits the `bg-[#181818]` / `rounded-md`
   / `shadow-lg` styling on the `<ul>` (used for the inner recursive submenu
   that already sits inside the styled panel).

The styled list wrapper uses `min-w-48 py-1`; the dark surface color is
`bg-[#181818]`; hovered rows use `hover:bg-[#3F3F3F]`.

### ContextMenuItemComponent

A simple row rendering (no Floating UI of its own):

- Left side: optional icon (`text-primary-white w-3 h-3`) + label.
- Right side: optional `shortcut` text (`text-gray-400 font-mono`) + a
  `ChevronRightIcon` (only when `subItems` are present).
- `onMouseEnter` calls `onHover(hasSubItems ? item.id : null)` — reporting the
  hovered item id (or `null` when the row has no submenu) up to the parent
  submenu manager.
- `onClick` calls `onItemClick(item)`, which the parent wires to
  `handleItemClick`.

### Animation Layers

The shared floating submenu panel contains three content layers that drive the
crossfade between submenus:

| Layer        | Purpose                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Outgoing** | Previous submenu content (`prevSubItems`); fades out with `translateX(10%)`                                              |
| **Incoming** | New submenu content (`activeSubItems`); fades in from `translateX(-10%)`; measured by `ResizeObserver` via `incomingRef` |
| **Exit**     | Preserves last content (`exitSubItems`) during the slide-out close animation                                             |

The panel itself animates `width` and `height` (from `panelSizeStyles`, derived
from the ResizeObserver `containerSize`) with `overflow: hidden`, creating a
smooth size transition when switching between submenus of different sizes.

## useSubmenuManager

**File**: `src/components/molecules/ContextMenu/useSubmenuManager.ts` ›
`useSubmenuManager`

Central hook managing all submenu interaction state. It is called with
`(subItems, onItemClick)` and returns the callbacks and state consumed by
`ContextMenuSubmenu`.

### Timing Constants

| Constant                   | Value | Purpose                                                                                                                         |
| -------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| `SUBMENU_DURATION_MS`      | 100   | Panel slide / size transition duration (ms)                                                                                     |
| `CONTENT_FADE_DURATION_MS` | 100   | Crossfade opacity transition duration (ms)                                                                                      |
| `HOVER_OPEN_DELAY`         | 75    | Delay before opening a submenu on hover (ms); also used for close timers in `handleFloatingMouseLeave` / `handleListMouseLeave` |
| `HOVER_SWITCH_DELAY`       | 100   | Delay before switching to a different submenu (ms); also the close delay when hovering a non-submenu row while one is open      |

### State Machine

```
                     hover item with subItems (after HOVER_OPEN_DELAY)
  [CLOSED] ──────────────────────────────────────────────> [OPEN]
     ^                                                        |
     |  hover item without subItems / mouse leaves            |
     |  (after HOVER_SWITCH_DELAY or HOVER_OPEN_DELAY,        |
     |   unless cursor entered the floating panel)            |
     +<───────────────────────────────────────────────────---+
                                                              |
                     hover a DIFFERENT item with subItems     |
                     (after HOVER_SWITCH_DELAY)                v
                   [OPEN] ─────────────────────────> [SWITCHING / crossfade]
                     ^                                  |
                     |   crossfade completes            |
                     +<─────────────────────────────────+
```

`switchSubmenu(newId)` is the single batched entry point that updates
`activeSubmenuId` and decides whether to crossfade (old → new), open from
closed, or close (and capture `exitSubItems` for the slide-out). Floating UI's
`onOpenChange` also routes to `switchSubmenu(null)` when it requests a close.

### Crossfade Phases

When switching between two submenus (both old and new have `subItems`):

1. **`'initial'`** — Old content at full opacity, new content at zero opacity.
   `prevSubItems` is captured and `crossfadePhase` set to `'initial'` in the
   same tick as `setActiveSubmenuId`.
2. **`'animating'`** — Triggered after two nested `requestAnimationFrame` ticks
   (ensures the `'initial'` frame has painted). Both layers transition: old
   fades out + `translateX(10%)`, new fades in + `translateX(0)`.
3. **`null`** — After `CONTENT_FADE_DURATION_MS`, cleanup clears `prevSubItems`
   and resets `isSwitchingRef`.

### Floating UI Configuration (submenus)

- **Strategy**: `'fixed'`
- **Placement**: `'right-start'` (submenu opens to the right of the hovered row)
- **Middleware**: `offset(5)`, `flip({ fallbackPlacements: ['left-start'] })`,
  `shift({ padding: 8 })`
- **`whileElementsMounted`**: `autoUpdate`
- **Reference switching**: When `activeSubmenuId` changes, a `useLayoutEffect`
  calls `refs.setReference` with the corresponding item DOM element looked up
  from `itemRefsMap`.

### Key Callbacks

| Callback                      | Behavior                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `handleHover(itemId \| null)` | Clears any pending timer, then starts a delayed timer to open / switch / close depending on current state |
| `handleItemClick(item)`       | Calls `item.onClick?.()` then `onItemClick?.(item)`                                                       |
| `handleFloatingMouseEnter`    | Sets the `isInFloatingRef` flag and clears the hover timer (keeps the panel open)                         |
| `handleFloatingMouseLeave`    | Clears the flag and starts a delayed close (`HOVER_OPEN_DELAY`)                                           |
| `handleListMouseLeave`        | If the cursor is not in the floating panel, starts a delayed close (`HOVER_OPEN_DELAY`)                   |
| `makeItemRef(itemId)`         | Returns a ref callback that registers / unregisters the row's DOM element in `itemRefsMap`                |

## createNodeContextMenu

**File**: `src/components/molecules/ContextMenu/createNodeContextMenu.ts` ›
`createNodeContextMenu`

Generates a single top-level **"Add Node"** item (with the `PlusIcon`) whose
`subItems` are a nested submenu tree built from `typeOfNodes`.

### Input

The function is generic over the same four type parameters as `FullGraph`
(`DataTypeUniqueId`, `NodeTypeUniqueId`, `UnderlyingType`, `ComplexSchemaType`).
Its props type:

```typescript
type CreateNodeContextMenuProps<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? any
    : never = never,
> = {
  typeOfNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['typeOfNodes'];
  dispatch: ActionDispatch<
    [
      action: Action<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >,
    ]
  >;
  setContextMenu: (menu: { isOpen: boolean; position: XYPosition }) => void;
  contextMenuPosition: XYPosition; // ALREADY flow-space (converted by caller)
  hiddenNodeTypesInContextMenu?: Partial<Record<NodeTypeUniqueId, true>>;
  /**
   * Whether to allow recursion.
   * - If not provided, treated as true.
   * - When true, recursion is checked and nesting node groups that would
   *   create a cycle is disallowed.
   * - When false, recursion is not checked and all nesting is allowed.
   * @default true
   */
  isRecursionAllowed?: boolean;
  currentNodeType?: NodeTypeUniqueId;
};
```

> **Coordinate note**: `contextMenuPosition` is consumed verbatim as the
> dispatched node position. `FullGraph` passes
> `screenToFlowPosition(contextMenu.position)`, so the conversion from screen to
> flow space happens at the **call site**, not inside this function.

### Output Structure

```
[
  {
    id: 'add-node',
    label: 'Add Node',
    icon: <PlusIcon className="w-4 h-4" />,
    subItems: [
      { id: 'folder-Standard Nodes', label: 'Standard Nodes', subItems: [...] },
      { id: 'folder-Group Nodes',    label: 'Group Nodes',    subItems: [...] },
      { id: 'add-someRootNode',      label: 'Some Root Node',  onClick: ... },
      ...
    ]
  }
]
```

If `typeOfNodes` has no keys, the function returns `[]` (no "Add Node" item at
all).

### `locationInContextMenu` nesting

Each `TypeOfNode` has an optional `locationInContextMenu: string[]`. This array
defines the folder path under "Add Node".

Examples:

- `[]` or omitted — places the node at the root level under "Add Node".
- `['Math']` — places under Add Node > Math.
- `['Math', 'Trig']` — places under Add Node > Math > Trig.

The algorithm builds an intermediate tree of `MenuTreeFolder` and `MenuTreeLeaf`
nodes:

```
For each node type:
  1. Read locationInContextMenu (default [])
  2. Walk the path segments, creating MenuTreeFolder nodes as needed
  3. Insert a MenuTreeLeaf at the final level
```

Internal tree types:

```typescript
type MenuTreeLeaf = {
  kind: 'leaf';
  item: ContextMenuItem;
  priority: number;
  insertionIndex: number;
};
type MenuTreeFolder = {
  kind: 'folder';
  label: string;
  children: MenuTreeNode[];
};
type MenuTreeNode = MenuTreeLeaf | MenuTreeFolder;
```

`treeToMenuItems` converts the tree back into `ContextMenuItem[]`. Folder items
get `id: \`folder-${label}\``; an empty folder (no resulting children) is
dropped.

### `priorityInContextMenu` ordering

Each `TypeOfNode` has an optional `priorityInContextMenu: number` (default `0`).
Higher values appear first.

`sortTreeLevel` sorts at every level of the tree:

1. **Primary sort**: descending by **effective priority**. For a folder, the
   effective priority is the `Math.max` of all descendants' priorities
   (`getEffectivePriority`); an empty folder has priority `0`.
2. **Tiebreaker**: ascending by **minimum insertion index**
   (`getMinInsertionIndex`), preserving the original declaration order for equal
   priorities.

Standard node presets (from `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardNodeContextMenu`):

- `standardNodeContextMenu`:
  `{ locationInContextMenu: ['Standard Nodes'], priorityInContextMenu: 200 }`
- `groupNodeContextMenu`:
  `{ locationInContextMenu: ['Group Nodes'], priorityInContextMenu: 100 }`

So the "Standard Nodes" folder appears before the "Group Nodes" folder.

### Filtering (recursion + hidden types)

Before building the tree, the node-type keys are filtered in two stages:

1. **Recursion filter** (`filterNodeTypeKeys`):
   - If `isRecursionAllowed` is `true` → return all keys (no filtering).
   - Else if `currentNodeType` is not provided → return all keys.
   - Otherwise call
     `getAllDependentsOfNodeTypeRecursively({ typeOfNodes }, currentNodeType)`
     (returns a `Set<NodeTypeUniqueId>` that includes `currentNodeType` itself)
     and filter out every node type in that set.
2. **Hidden-types filter**:
   `.filter((id) => !hiddenNodeTypesInContextMenu?.[id])` removes any node type
   flagged in `hiddenNodeTypesInContextMenu`.

Stage 1 prevents adding a node group inside itself or inside any group that
references it, which would create infinite recursion. In `FullGraph`,
`isRecursionAllowed` is wired to `!state.enableRecursionChecking` — i.e.,
recursion checking is enabled (filtering on) when
`state.enableRecursionChecking` is truthy.

### Leaf item `onClick` behavior

Each leaf item's `onClick`:

1. Dispatches `ADD_NODE_AND_SELECT` with
   `{ type: nodeTypeId, position: contextMenuPosition }` (`contextMenuPosition`
   is already flow-space).
2. Closes the menu via
   `setContextMenu({ isOpen: false, position: { x: 0, y: 0 } })`.

## createLoopMenuItem

**File**: `src/components/molecules/ContextMenu/createLoopMenuItem.ts` ›
`createLoopMenuItem`

Generates a single flat top-level **"Add Loop"** item (with the `RepeatIcon`).
It is generic over the same four type parameters.

```typescript
type CreateLoopMenuItemProps</* generics */> = {
  dispatch: ActionDispatch<[action: Action</* generics */>]>;
  setContextMenu: (menu: { isOpen: boolean; position: XYPosition }) => void;
  contextMenuPosition: XYPosition; // flow-space
};
```

The produced item (`id: 'add-loop'`) `onClick`:

1. Dispatches `ADD_LOOP` with `{ position: contextMenuPosition }`. This action
   inserts a complete loop triplet (`loopStart` + `loopStop` + `loopEnd`) with
   bind edges; `loopStart` is placed at `position` and the others auto-spread to
   the right.
2. Closes the menu via
   `setContextMenu({ isOpen: false, position: { x: 0, y: 0 } })`.

## createSwitchMenuItem

**File**: `src/components/molecules/ContextMenu/createSwitchMenuItem.ts` ›
`createSwitchMenuItem`

Generates a single flat top-level **"Add Switch"** item (with the
`GitBranchIcon`), generic over the same four type parameters.

```typescript
type CreateSwitchMenuItemProps</* generics */> = {
  dispatch: ActionDispatch<[action: Action</* generics */>]>;
  setContextMenu: (menu: { isOpen: boolean; position: XYPosition }) => void;
  contextMenuPosition: XYPosition; // flow-space
};
```

The produced item (`id: 'add-switch'`) `onClick`:

1. Dispatches `ADD_SWITCH` with `{ position: contextMenuPosition }`. This action
   inserts a complete switch pair (`switchStart` + `switchEnd`) with a bind
   edge; `switchStart` is placed at `position` and `switchEnd` auto-spreads to
   the right.
2. Closes the menu via
   `setContextMenu({ isOpen: false, position: { x: 0, y: 0 } })`.

## createImportExportMenuItems

**File**: `src/components/organisms/FullGraph/createImportExportMenuItems.ts` ›
`createImportExportMenuItems`

Generates a single top-level **"Import/Export"** item with four sub-items:

```
Import/Export (ArrowDownUpIcon, separator: true)
  ├── Export State      (FileOutputIcon)
  ├── Import State      (FileInputIcon)
  ├── Export Recording  (FileOutputIcon, separator: true)
  └── Import Recording  (FileInputIcon)
```

Each sub-item calls the provided callback then `closeMenu()`. The
`separator: true` on the top-level item draws a divider above it (separating it
from "Add Node"); the `separator: true` on "Export Recording" groups the two
recording actions apart from the two state actions.

### Config type

```typescript
type ImportExportMenuItemsConfig = {
  onExportState: () => void;
  onImportState: () => void;
  onExportRecording: () => void;
  onImportRecording: () => void;
  closeMenu: () => void;
};
```

This builder is purely structural — it knows nothing about serialization. The
actual handlers come from the `useGraphImportExport` hook (see the Import/Export
relationship below).

## FullGraphContextMenu (positioning)

**File**: `src/components/organisms/FullGraph/FullGraphContextMenu.tsx` ›
`FullGraphContextMenu`

Wrapper component that positions the `ContextMenu` at the right-click
coordinates.

```typescript
type FullGraphContextMenuProps = {
  isOpen: boolean;
  position: XYPosition; // SCREEN-space click coordinates
  onClose: () => void;
  items: ContextMenuItem[];
};
```

### Positioning

Uses Floating UI with a **virtual reference element** — a 1×1 pixel rectangle at
the (screen-space) click position:

```typescript
refs.setReference({
  getBoundingClientRect: () => ({
    x: position.x,
    y: position.y,
    width: 1,
    height: 1,
    top: position.y,
    right: position.x + 1,
    bottom: position.y + 1,
    left: position.x,
  }),
});
```

- **Placement**: `'bottom-start'` (menu opens below and to the right of the
  click).
- **Middleware**: `offset(5)`, `flip({ fallbackPlacements: ['top-start'] })`,
  `shift({ padding: 8 })`.
- **`whileElementsMounted`**: `autoUpdate`.

### Animation

- **Mount/unmount**: tracks `isMounted` separately from `isOpen` so the element
  stays in the DOM during the fade-out.
- **Fade-in**: 100ms ease-out opacity transition (`opacity-100 duration-100`).
- **Fade-out**: 150ms ease-out opacity transition (`opacity-0 duration-150`),
  then unmount after `ANIMATION_DURATION` (150ms).
- The virtual reference is only updated while `isOpen` is `true`, preventing the
  menu from jumping to `{0,0}` during fade-out (the close handler resets
  `position` to `{0,0}`).
- The floating container also sets `contain: 'layout'`.

### Dismissal

Uses Floating UI's `useDismiss` (wired through `useInteractions`) — clicking
outside or pressing Escape calls `onClose()`. Additionally, clicking the
ReactFlow canvas itself triggers `closeMenu` via the canvas `onClick` handler.
`onClick` on the floating container calls `e.stopPropagation()` so clicks inside
the menu don't bubble to the canvas.

## Geometry utilities

The shared geometry helpers in `src/utils/geometry.ts` provide the bounding-box
hit-testing used for "click outside" dismissal — `useClickedOutside`'s
coordinate mode resolves a `Coordinate` from the pointer and calls
`isCoordinateInBox` against the element's `getBoundingClientRect()`. Two further
public exports from the same module round out that pair:

- **`src/utils/geometry.ts` › `Box`** — a rectangular bounding box,
  `{ top: number; left: number; right: number; bottom: number }`. It is the
  second argument to `isCoordinateInBox` and is typically produced from
  `getBoundingClientRect()`.
- **`src/utils/geometry.ts` › `isNumberInRange`** —
  `isNumberInRange(number, min, max, minInclusive = false, maxInclusive = false): boolean`.
  Returns whether `number` lies between `min` and `max`. Both bounds are
  **exclusive by default**; pass `minInclusive` / `maxInclusive` to include
  either edge. If `min > max` the two are swapped first, so argument order does
  not matter. `isCoordinateInBox` is built on it, calling it once per axis
  (`box.left`/`box.right` for x, `box.top`/`box.bottom` for y) and forwarding
  the per-axis inclusive flags.

## Limitations and Deprecated Patterns

- **No keyboard navigation**: submenu opening is hover-only. There is no
  arrow-key navigation or focus management between menu items.
- **No search/filter**: for large node libraries there is no type-ahead search
  within the "Add Node" menu. (`hiddenNodeTypesInContextMenu` can hide types,
  but that is configuration, not interactive filtering.)
- **Shortcut display only**: the `shortcut` field on `ContextMenuItem` is purely
  cosmetic — it renders text but registers no keyboard listener.
- **Single context menu**: only one context menu can be open at a time (a single
  `contextMenu` `useState` in `FullGraphWithReactFlowProvider`).
- **No per-node context menu**: right-clicking anywhere on the canvas (including
  on a node) shows the same global menu. There is no node-specific menu (delete,
  duplicate, disconnect) on right-click; node editing is reached through edit
  drawers (e.g. `LoopEditDrawer`, `SwitchEditDrawer`, `NodeTypeEditDrawer`)
  opened via other UI, not the context menu.

## Relationships with Other Features

### -> [Nodes (locationInContextMenu, priorityInContextMenu)](../core/nodesDoc.md)

Node types define their context-menu placement via two properties on
`TypeOfNode`:

- `locationInContextMenu?: string[]` — folder path in the menu tree.
- `priorityInContextMenu?: number` — sort order (higher = appears first).

Standard nodes use the `standardNodeContextMenu` preset (`['Standard Nodes']`,
priority 200). Group nodes use `groupNodeContextMenu` (`['Group Nodes']`,
priority 100). User-defined node types can specify any custom path and priority.

### -> [State Management (dispatched actions)](../core/stateManagementDoc.md)

The menu dispatches three "add" actions and one state-replacement action
(`actionTypesMap`):

```typescript
// Add Node leaf
dispatch({
  type: actionTypesMap.ADD_NODE_AND_SELECT,
  payload: { type: nodeTypeId, position: contextMenuPosition }, // flow-space
});

// Add Loop
dispatch({ type: actionTypesMap.ADD_LOOP, payload: { position } });

// Add Switch
dispatch({ type: actionTypesMap.ADD_SWITCH, payload: { position } });
```

`ADD_NODE_AND_SELECT` creates a node instance at the click location and selects
it. `ADD_LOOP` and `ADD_SWITCH` insert a full loop triplet / switch pair with
their bind edges. All positions are flow-space because `FullGraph` converts the
screen coordinates with `screenToFlowPosition()` before passing
`contextMenuPosition` into each builder. Import (state) dispatches
`REPLACE_STATE` (see below).

### -> [Import/Export](../importExport/importExportDoc.md)

The Import/Export menu items are wired to the `useGraphImportExport` hook
(`src/components/organisms/FullGraph/useGraphImportExport.tsx` ›
`useGraphImportExport`), which owns the handlers and the two hidden
`<input type="file">` elements (`FileInputElements`). In `FullGraph`:

- **`onExportState`** → `handleExportState`:
  `exportGraphState(state, { pretty: true })` then
  `downloadJson(json, 'graph-state.json')`.
- **`onImportState`** → clicks `importStateInputRef`. On file load,
  `handleImportState` calls
  `importGraphState(json, { dataTypes, typeOfNodes, repair })`; on success it
  re-attaches live `dataTypes` / `typeOfNodes`, dispatches **`REPLACE_STATE`**,
  bumps `reactFlowKey` to remount ReactFlow, and fires the `ui:state:imported`
  graph event.
- **`onExportRecording`** → `handleExportRecording`: reads the current
  `ExecutionRecord` via `executionRecordRef`, then
  `exportExecutionRecord(record, { pretty: true })` +
  `downloadJson(json, 'execution-recording.json')`.
- **`onImportRecording`** → clicks `importRecordingInputRef`. On file load,
  `handleImportRecording` calls `importExecutionRecord(json, { repair })` and
  loads the record into the runner via `loadRecordRef`, firing the
  `ui:recording:imported` graph event.

### -> [FullGraph](fullGraphDoc.md)

`FullGraph` (specifically `FullGraphWithReactFlowProvider`) is the integration
point. It:

1. Manages the `contextMenu` state (`{ isOpen, position }`, screen-space).
2. Handles `onContextMenu` on the ReactFlow canvas (`handleContextMenu`) to
   capture the click position.
3. Builds `contextMenuItems` via `useMemo` by concatenating
   `createLoopMenuItem`, `createSwitchMenuItem`, `createNodeContextMenu`, and
   `createImportExportMenuItems` — each receiving
   `contextMenuPosition = screenToFlowPosition(contextMenu.position)`.
4. Wires `createNodeContextMenu`'s `currentNodeType` to the top of
   `openedNodeGroupStack` (`currentNodeGroup?.nodeType`), `isRecursionAllowed`
   to `!state.enableRecursionChecking`, and `hiddenNodeTypesInContextMenu` to
   `state.hiddenNodeTypesInContextMenu`.
5. Renders `FullGraphContextMenu` with the assembled items (and screen-space
   `position`).
6. Closes the menu on canvas click (`onClick={closeMenu}`) or item selection.
