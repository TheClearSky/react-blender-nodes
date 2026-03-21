# Context Menu

## Overview

The context menu system provides right-click menus for the graph editor. It is
built from five cooperating modules:

| Module                        | Role                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextMenu`                 | Generic, recursive renderer for menu items with icons, shortcuts, separators, and nested submenus                                      |
| `useSubmenuManager`           | Hook managing submenu open/close state, hover timers, crossfade animations, floating UI positioning, and ResizeObserver-driven sizing  |
| `createNodeContextMenu`       | Generates the "Add Node" menu tree from `typeOfNodes`, respecting `locationInContextMenu` nesting and `priorityInContextMenu` ordering |
| `createImportExportMenuItems` | Generates the "Import/Export" submenu (state + recording export/import)                                                                |
| `FullGraphContextMenu`        | Wrapper that positions the menu at the right-click coordinates using Floating UI, with fade-in/out animation                           |

The menu is opened via `onContextMenu` on the ReactFlow canvas. Clicking an item
dispatches an action (e.g., `ADD_NODE_AND_SELECT`) or triggers a callback, then
closes the menu.

## Entity-Relationship Diagram

```
+---------------------+        +------------------------+
|   ContextMenuItem    |        |    TypeOfNode           |
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
       v                     | createNodeContext  |
+---------------------+      | Menu()             |
|   ContextMenu       |      +-------------------+
|---------------------|               |
| subItems            |               | builds
| className?          |               v
| onItemClick?        |      +-------------------+
+---------------------+      | MenuTreeNode      |
       |                     |-------------------|
       | delegates to        | MenuTreeLeaf      |
       v                     |   kind: 'leaf'    |
+---------------------+      |   item, priority  |
| ContextMenuSubmenu   |      |   insertionIndex  |
|---------------------|      | MenuTreeFolder    |
| uses                |      |   kind: 'folder'  |
|  useSubmenuManager   |      |   label, children |
+---------------------+      +-------------------+
       |
       | positions via
       v
+---------------------+
| FullGraphContextMenu |
|---------------------|
| isOpen: boolean      |
| position: XYPosition |
| onClose: () => void  |
| items: MenuItem[]    |
+---------------------+
```

## Data Flow Diagram

```
User right-clicks on canvas
        |
        v
+---------------------------+
| handleContextMenu()       |
| captures event.clientX/Y  |
| sets contextMenu state:   |
|   { isOpen: true,          |
|     position: {x, y} }    |
+---------------------------+
        |
        v
+---------------------------+     +----------------------------+
| createNodeContextMenu()   |     | createImportExportMenu     |
|                           |     | Items()                    |
| Reads state.typeOfNodes   |     |                            |
| Filters recursion         |     | Creates Import/Export      |
| Builds MenuTree from      |     | submenu with 4 items:      |
|   locationInContextMenu   |     |   Export State              |
| Sorts by priority         |     |   Import State              |
| Converts to MenuItem[]    |     |   Export Recording          |
| Wraps in "Add Node" parent|     |   Import Recording          |
+---------------------------+     +----------------------------+
        |                                    |
        +------ merged via spread -----------+
        |
        v
+---------------------------+
| FullGraphContextMenu      |
| Floating UI positions     |
| the menu at click coords  |
| Fade-in/out animation     |
+---------------------------+
        |
        v
+---------------------------+
| ContextMenu               |
|  -> ContextMenuSubmenu     |
|     renders items          |
|     useSubmenuManager      |
|     handles hover/submenu  |
+---------------------------+
        |
        v (user clicks item)
+---------------------------+
| item.onClick()            |
|                           |
| For "Add Node" items:     |
|   dispatch({              |
|     type: ADD_NODE_AND_   |
|           SELECT,         |
|     payload: { type,      |
|       position }          |
|   })                      |
|   setContextMenu(closed)  |
|                           |
| For Import/Export items:   |
|   callback + closeMenu()  |
+---------------------------+
```

## System Diagram

```
+-----------------------------------------------------------------------+
|  FullGraph Component                                                   |
|                                                                       |
|  +-- ReactFlow canvas                                                 |
|  |     onContextMenu ──> handleContextMenu()                          |
|  |     onClick ──> closeMenu()                                        |
|  |                                                                    |
|  +-- contextMenuItems = useMemo(                                      |
|  |      [...createNodeContextMenu({                                   |
|  |             typeOfNodes, dispatch, setContextMenu,                  |
|  |             contextMenuPosition, currentNodeType,                  |
|  |             isRecursionAllowed                                     |
|  |           }),                                                      |
|  |       ...createImportExportMenuItems({                             |
|  |             onExportState, onImportState,                          |
|  |             onExportRecording, onImportRecording,                  |
|  |             closeMenu                                              |
|  |           })]                                                      |
|  |    )                                                               |
|  |                                                                    |
|  +-- FullGraphContextMenu                                             |
|       |  isOpen, position, onClose, items                             |
|       |                                                               |
|       +-- Floating UI (useFloating, useDismiss)                       |
|       |     placement: 'bottom-start'                                 |
|       |     middleware: offset(5), flip, shift                        |
|       |     virtual reference from click position                     |
|       |                                                               |
|       +-- ContextMenu                                                 |
|            |                                                          |
|            +-- ContextMenuSubmenu (recursive)                         |
|                 |                                                     |
|                 +-- useSubmenuManager                                  |
|                 |     activeSubmenuId, hover timers,                   |
|                 |     crossfade phases, ResizeObserver,                |
|                 |     Floating UI for submenus                         |
|                 |                                                     |
|                 +-- ContextMenuItemComponent (per item)                |
|                 |     icon, label, shortcut, separator,                |
|                 |     chevron for sub-items                            |
|                 |                                                     |
|                 +-- FloatingPortal (shared submenu panel)              |
|                       slide + crossfade animations                    |
|                       -> recursive ContextMenuSubmenu (bare)          |
+-----------------------------------------------------------------------+
```

## ContextMenuItem Type

Defined in `ContextMenu.tsx`:

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

- **Recursive**: `subItems` allows unlimited nesting depth
- **Mutually useful fields**: Items can have both `onClick` and `subItems`,
  though typically leaf items have `onClick` and folder items have `subItems`
- **`separator`**: Renders a `border-t` divider line _before_ the item (only
  when `index > 0`)

## ContextMenu Component

**File**: `src/components/molecules/ContextMenu/ContextMenu.tsx`

The public `ContextMenu` component is a thin wrapper:

```
ContextMenu
  └── ContextMenuSubmenu (handles all rendering + submenu logic)
        ├── <ul> with ContextMenuItemComponent for each item
        └── FloatingPortal with shared submenu panel
              └── ContextMenuSubmenu (bare, recursive)
```

### ContextMenuSubmenu

The workhorse component. It:

1. Renders a `<ul>` list of `ContextMenuItemComponent` rows
2. Manages a **single shared floating submenu panel** via `useSubmenuManager`
3. When an item with `subItems` is hovered, the floating panel slides in from
   the right, anchored to that item row
4. Uses `FloatingPortal` to escape overflow clipping
5. Supports a `bare` prop — when `true`, omits background/shadow styling (used
   for the inner recursive submenu that already sits inside the styled panel)

### ContextMenuItemComponent

A simple row rendering:

- Left side: optional icon + label
- Right side: optional shortcut text + chevron icon (if `subItems` exist)
- Hover triggers `onHover(itemId | null)` — reports to parent submenu manager
- Click triggers `onItemClick(item)`

### Animation Layers

The floating submenu panel contains three animation layers:

| Layer        | Purpose                                                    |
| ------------ | ---------------------------------------------------------- |
| **Outgoing** | Previous submenu content, fades out with `translateX(10%)` |
| **Incoming** | New submenu content, fades in from `translateX(-10%)`      |
| **Exit**     | Preserves last content during slide-out close animation    |

The panel itself animates `width` and `height` via ResizeObserver measurements,
creating a smooth size transition when switching between submenus of different
sizes.

## useSubmenuManager

**File**: `src/components/molecules/ContextMenu/useSubmenuManager.ts`

Central hook managing all submenu interaction state. Returns callbacks and state
consumed by `ContextMenuSubmenu`.

### Timing Constants

| Constant                   | Value | Purpose                                       |
| -------------------------- | ----- | --------------------------------------------- |
| `SUBMENU_DURATION_MS`      | 100ms | Panel slide/size transition duration          |
| `CONTENT_FADE_DURATION_MS` | 100ms | Crossfade opacity transition duration         |
| `HOVER_OPEN_DELAY`         | 75ms  | Delay before opening a submenu on hover       |
| `HOVER_SWITCH_DELAY`       | 100ms | Delay before switching to a different submenu |

### State Machine

```
                     hover item with subItems
  [CLOSED] ──────────────────────────────────────> [OPEN]
     ^                                               |
     |          hover item without subItems           |
     |          or mouse leaves                       |
     +<──────────────────────────────────────────────-+
                                                      |
                     hover different item             |
                     with subItems                    v
                   [OPEN] ─────────────────> [SWITCHING]
                     ^                           |
                     |   crossfade completes     |
                     +<──────────────────────────+
```

### Crossfade Phases

When switching between submenus (both old and new have subItems):

1. **`'initial'`** — Old content at full opacity, new content at zero opacity.
   Set in same tick as `setActiveSubmenuId`.
2. **`'animating'`** — Triggered after two `requestAnimationFrame` ticks
   (ensures paint). Both layers transition: old fades out, new fades in.
3. **`null`** — After `CONTENT_FADE_DURATION_MS`, cleanup: clear `prevSubItems`,
   reset `isSwitching`.

### Floating UI Configuration

- **Strategy**: `fixed`
- **Placement**: `right-start` (submenu opens to the right of the hovered item)
- **Middleware**: `offset(5)`, `flip(['left-start'])`, `shift({ padding: 8 })`
- **Reference switching**: When `activeSubmenuId` changes, `refs.setReference`
  is called with the corresponding item DOM element from `itemRefsMap`

### Key Callbacks

| Callback                      | Behavior                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `handleHover(itemId \| null)` | Starts a delayed timer to open/switch/close submenu                                |
| `handleItemClick(item)`       | Calls `item.onClick()` then `onItemClick(item)`                                    |
| `handleFloatingMouseEnter`    | Sets `isInFloatingRef` flag, clears close timer                                    |
| `handleFloatingMouseLeave`    | Clears flag, starts delayed close                                                  |
| `handleListMouseLeave`        | Starts delayed close if cursor isn't in floating panel                             |
| `makeItemRef(itemId)`         | Returns a ref callback that registers/unregisters the DOM element in `itemRefsMap` |

## createNodeContextMenu

**File**: `src/components/molecules/ContextMenu/createNodeContextMenu.ts`

Generates the "Add Node" top-level menu item with nested submenus for each node
type.

### Input

```typescript
type CreateNodeContextMenuProps = {
  typeOfNodes: State['typeOfNodes'];
  dispatch: ActionDispatch<[action: Action]>;
  setContextMenu: (menu: { isOpen: boolean; position: XYPosition }) => void;
  contextMenuPosition: XYPosition;
  isRecursionAllowed?: boolean; // default: true
  currentNodeType?: NodeTypeUniqueId;
};
```

### Output Structure

```
[
  {
    id: 'add-node',
    label: 'Add Node',
    icon: <PlusIcon />,
    subItems: [
      { id: 'folder-Math', label: 'Math', subItems: [...] },
      { id: 'folder-Standard Nodes', label: 'Standard Nodes', subItems: [...] },
      { id: 'add-someRootNode', label: 'Some Root Node', onClick: ... },
      ...
    ]
  }
]
```

### locationInContextMenu nesting

Each `TypeOfNode` has an optional `locationInContextMenu: string[]` property.
This array defines the folder path in the menu tree.

Examples:

- `[]` or omitted — places the node at root level under "Add Node"
- `['Math']` — places under Add Node > Math
- `['Math', 'Trig']` — places under Add Node > Math > Trig

The algorithm builds an intermediate tree of `MenuTreeFolder` and `MenuTreeLeaf`
nodes:

```
For each node type:
  1. Read locationInContextMenu (default [])
  2. Walk the path segments, creating MenuTreeFolder nodes as needed
  3. Insert a MenuTreeLeaf at the final level
```

### priorityInContextMenu ordering

Each `TypeOfNode` has an optional `priorityInContextMenu: number` property
(default: 0). Higher values appear first.

The `sortTreeLevel` function sorts at every level of the tree:

1. **Primary sort**: Descending by effective priority (for folders, the max
   priority of all descendants)
2. **Tiebreaker**: Ascending by minimum insertion index (preserves original
   order for equal priorities)

Standard node presets:

- `standardNodeContextMenu`:
  `{ locationInContextMenu: ['Standard Nodes'], priorityInContextMenu: 200 }`
- `groupNodeContextMenu`:
  `{ locationInContextMenu: ['Group Nodes'], priorityInContextMenu: 100 }`

This means "Standard Nodes" folder appears before "Group Nodes" folder.

### Recursion checking filter

When `isRecursionAllowed` is `false` and `currentNodeType` is provided (i.e.,
the user is editing inside a node group), the function filters out node types
that would create recursive nesting.

```
filterNodeTypeKeys():
  1. If isRecursionAllowed is true -> return all keys (no filtering)
  2. If no currentNodeType -> return all keys
  3. Call getAllDependentsOfNodeTypeRecursively() to find all node types
     that the current node group depends on (transitively)
  4. Filter out those dependent node types from the menu
```

This prevents adding a node group inside itself or inside any group that
references it, which would create infinite recursion.

### Item onClick behavior

Each leaf item's `onClick`:

1. Dispatches `ADD_NODE_AND_SELECT` with the node type and the flow-space
   position (converted from screen coordinates via `screenToFlowPosition`)
2. Closes the context menu by calling
   `setContextMenu({ isOpen: false, position: { x: 0, y: 0 } })`

## createImportExportMenuItems

**File**: `src/components/organisms/FullGraph/createImportExportMenuItems.ts`

Generates a single top-level "Import/Export" menu item with four sub-items:

```
Import/Export (ArrowDownUpIcon, separator: true)
  ├── Export State (FileOutputIcon)
  ├── Import State (FileInputIcon)
  ├── Export Recording (FileOutputIcon, separator: true)
  └── Import Recording (FileInputIcon)
```

Each sub-item calls the provided callback then `closeMenu()`. The
`separator: true` on the top-level item visually separates it from the "Add
Node" item above.

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

## FullGraphContextMenu (positioning)

**File**: `src/components/organisms/FullGraph/FullGraphContextMenu.tsx`

Wrapper component that positions the `ContextMenu` at the right-click
coordinates.

### Positioning

Uses Floating UI with a **virtual reference element** — a 1x1 pixel rectangle at
the click position:

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

**Placement**: `bottom-start` (menu opens below and to the right of the click)
**Middleware**: `offset(5)`, `flip(['top-start'])`, `shift({ padding: 8 })`

### Animation

- **Mount/unmount**: Tracks `isMounted` separately from `isOpen` to allow
  fade-out before DOM removal
- **Fade-in**: 100ms ease-out opacity transition
- **Fade-out**: 150ms ease-out opacity transition, then unmount after
  `ANIMATION_DURATION` (150ms)
- Position is only updated when `isOpen` becomes `true`, preventing the menu
  from jumping to `{0,0}` during fade-out

### Dismissal

Uses Floating UI's `useDismiss` hook — clicking outside or pressing Escape calls
`onClose()`. Additionally, clicking the ReactFlow canvas itself triggers
`closeMenu` via the `onClick` handler.

## Limitations and Deprecated Patterns

- **No keyboard navigation**: The menu is hover-only for submenu opening. There
  is no arrow-key navigation or focus management between menu items.
- **No search/filter**: For large node libraries, there is no type-ahead search
  within the "Add Node" menu.
- **Shortcut display only**: The `shortcut` field on `ContextMenuItem` is purely
  cosmetic — it displays text but does not register any keyboard listener.
- **Single context menu**: Only one context menu can be open at a time (managed
  by a single `useState` in `FullGraph`).
- **No per-node context menu**: Right-clicking a specific node shows the same
  global context menu. There is no node-specific menu (e.g., delete, duplicate,
  disconnect).

## Relationships with Other Features

### -> [Nodes (locationInContextMenu, priorityInContextMenu)](../core/nodesDoc.md)

Node types define their context menu placement via two properties on
`TypeOfNode`:

- `locationInContextMenu?: string[]` — folder path in the menu tree
- `priorityInContextMenu?: number` — sort order (higher = appears first)

Standard nodes use the `standardNodeContextMenu` preset (`['Standard Nodes']`,
priority 200). Group nodes use `groupNodeContextMenu` (`['Group Nodes']`,
priority 100). User-defined node types can specify any custom path and priority.

### -> [State Management (ADD_NODE_AND_SELECT dispatch)](../core/stateManagementDoc.md)

When a node is selected from the "Add Node" submenu, the item's `onClick`
dispatches:

```typescript
dispatch({
  type: actionTypesMap.ADD_NODE_AND_SELECT,
  payload: {
    type: nodeTypeId,
    position: contextMenuPosition, // flow-space coordinates
  },
});
```

This action creates a new node instance at the right-click location and selects
it. The position is converted from screen coordinates to flow coordinates via
`screenToFlowPosition()` before being passed to `createNodeContextMenu`.

### -> [Import/Export](../importExport/importExportDoc.md)

The import/export menu items connect to the import/export utility system. In
`FullGraph`:

- `onExportState` calls `exportGraphState()` then `downloadJson()`
- `onImportState` triggers a hidden file input, reads the file, calls
  `importGraphState()`, and dispatches `SET_STATE`
- `onExportRecording` / `onImportRecording` follow the same pattern for
  `ExecutionRecord` data

### -> [FullGraph](fullGraphDoc.md)

`FullGraph` is the integration point. It:

1. Manages the `contextMenu` state (`{ isOpen, position }`)
2. Handles `onContextMenu` on the ReactFlow canvas to capture click position
3. Builds `contextMenuItems` via `useMemo` by merging `createNodeContextMenu`
   and `createImportExportMenuItems`
4. Renders `FullGraphContextMenu` with the assembled items
5. Closes the menu on canvas click or item selection
