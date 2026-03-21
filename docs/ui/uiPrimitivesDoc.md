# UI Primitives

## Overview

UI Primitives are the foundational layout and display atoms used across the
react-blender-nodes library. They provide consistent visual building blocks —
badges, dividers, collapsible sections, scrollable containers, node resizing
controls, and connection line rendering — that higher-level components compose
into complete interfaces.

All primitives follow the same conventions:

- Accept `className` for Tailwind-based style overrides
- Use `data-slot` attributes for targeting in CSS/tests
- Wrap Radix UI or ReactFlow primitives where applicable
- Export both the component and its TypeScript props type

```
+------------------------------------------------------+
|                   UI Primitives                       |
|                                                      |
|  +--------+  +-----------+  +-------------+          |
|  | Badge  |  | Separator |  | Collapsible |          |
|  +--------+  +-----------+  +-------------+          |
|                                                      |
|  +---------------------------+  +-----------------+  |
|  | ScrollableButtonContainer |  | NodeResizer+++  |  |
|  +---------------------------+  +-----------------+  |
|                                                      |
|  +-------------------------+                         |
|  | ConfigurableConnection  |                         |
|  +-------------------------+                         |
+------------------------------------------------------+
```

---

## Badge

**File:** `src/components/atoms/Badge/Badge.tsx`

A styled inline status badge rendered as a `<span>` (or any element via
`asChild`). Built with `class-variance-authority` (CVA) for variant management.

### Props

| Prop        | Type                                                                          | Default     | Description                                                                     |
| ----------- | ----------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `variant`   | `'default' \| 'secondary' \| 'destructive' \| 'outline' \| 'ghost' \| 'link'` | `'default'` | Visual style variant                                                            |
| `asChild`   | `boolean`                                                                     | `false`     | When true, renders as a Radix `Slot.Root`, merging props onto the child element |
| `className` | `string`                                                                      | —           | Additional CSS classes                                                          |
| ...rest     | `React.ComponentProps<'span'>`                                                | —           | All standard span attributes                                                    |

### Variants

| Variant       | Visual Description                              |
| ------------- | ----------------------------------------------- |
| `default`     | Primary background with primary-foreground text |
| `secondary`   | Secondary background, muted appearance          |
| `destructive` | Red/danger background, white text               |
| `outline`     | Transparent background with visible border      |
| `ghost`       | No background; hover reveals accent color       |
| `link`        | Text-only with underline on hover               |

### Usage

```tsx
import { Badge } from '@/components/atoms';

<Badge variant="default">Running</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Idle</Badge>
```

### Implementation Notes

- Uses `cva()` to define a variant map; the base class applies `rounded-full`,
  `px-2`, `py-0.5`, `text-xs`.
- SVG icons nested inside the badge are automatically sized to `size-3` via the
  `[&>svg]` selector.
- Accessibility: supports `aria-invalid` styling and `focus-visible` ring.

---

## Separator

**File:** `src/components/atoms/Separator/Separator.tsx`

A thin divider line wrapping Radix UI's `Separator.Root`. Supports both
horizontal and vertical orientations.

### Props

| Prop          | Type                                            | Default        | Description                                   |
| ------------- | ----------------------------------------------- | -------------- | --------------------------------------------- |
| `orientation` | `'horizontal' \| 'vertical'`                    | `'horizontal'` | Direction of the divider                      |
| `decorative`  | `boolean`                                       | `true`         | If true, excluded from the accessibility tree |
| `className`   | `string`                                        | —              | Additional CSS classes                        |
| ...rest       | `React.ComponentProps<SeparatorPrimitive.Root>` | —              | All Radix Separator props                     |

### Sizing Behaviour

```
Horizontal (default):         Vertical:
+------------------------+    +---+---+---+
|  1px tall, full width  |    | L | | | R |
+------------------------+    |   |1px|   |
                              +---+---+---+
                              full height
```

- Horizontal: `h-px w-full`
- Vertical: `w-px h-full`
- Uses `data-[orientation=...]` attribute selectors so a single class string
  handles both.

### Usage

```tsx
import { Separator } from '@/components/atoms';

{
  /* Horizontal */
}
<Separator />;

{
  /* Vertical inside a flex row */
}
<div className='flex h-8 items-center gap-2'>
  <span>Left</span>
  <Separator orientation='vertical' />
  <span>Right</span>
</div>;
```

---

## Collapsible

**File:** `src/components/atoms/Collapsible/Collapsible.tsx`

A three-part compound component wrapping Radix UI's `Collapsible` primitive.
Provides expand/collapse behaviour with no built-in styling — consumers supply
all visual treatment.

### Exported Components

| Component            | Wraps                                     | `data-slot`           | Purpose                                   |
| -------------------- | ----------------------------------------- | --------------------- | ----------------------------------------- |
| `Collapsible`        | `CollapsiblePrimitive.Root`               | `collapsible`         | Root container; manages open/closed state |
| `CollapsibleTrigger` | `CollapsiblePrimitive.CollapsibleTrigger` | `collapsible-trigger` | Clickable toggle element                  |
| `CollapsibleContent` | `CollapsiblePrimitive.CollapsibleContent` | `collapsible-content` | Content revealed when open                |

### State Model

```
  User clicks trigger
        |
        v
+--[Collapsible]--+
|  open: boolean   |  (controlled or uncontrolled via Radix)
+------------------+
        |
   open === true
        |
        v
+--[CollapsibleContent]--+
|  children rendered     |
+------------------------+
```

All props are forwarded transparently to the underlying Radix primitives. The
Radix `open` / `defaultOpen` / `onOpenChange` props control the state.

### Usage

```tsx
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/atoms';

<Collapsible>
  <CollapsibleTrigger className='rounded bg-zinc-700 px-3 py-1.5 text-sm text-white'>
    Toggle Content
  </CollapsibleTrigger>
  <CollapsibleContent>
    <div className='mt-2 rounded border border-zinc-600 p-3 text-sm text-zinc-300'>
      This content can be expanded and collapsed.
    </div>
  </CollapsibleContent>
</Collapsible>;
```

---

## ScrollableButtonContainer

**File:**
`src/components/atoms/ScrollableButtonContainer/ScrollableButtonContainer.tsx`

A scrollable container that wraps overflow content and optionally displays
directional arrow buttons for scrolling. Supports both horizontal and vertical
layouts.

### Props

| Prop                    | Type                         | Default        | Description                                 |
| ----------------------- | ---------------------------- | -------------- | ------------------------------------------- |
| `orientation`           | `'horizontal' \| 'vertical'` | `'horizontal'` | Scroll axis                                 |
| `showArrows`            | `boolean`                    | `true`         | Show navigation arrow buttons               |
| `disabled`              | `boolean`                    | `false`        | Disable scrolling and hide arrows           |
| `scrollSpeedPxPerFrame` | `number`                     | `14`           | Pixels scrolled per animation frame         |
| `observeChildren`       | `boolean`                    | `true`         | Watch child size changes via ResizeObserver |
| `className`             | `string`                     | —              | Wrapper div classes                         |
| `scrollAreaClassName`   | `string`                     | —              | Inner scroll area classes                   |
| `ariaLabel`             | `string`                     | —              | Accessibility label for scroll region       |

### Architecture

```
+--[ScrollableButtonContainer]-----------------------------+
|                                                          |
|  [<< Arrow]   +--[scrollable div]--+   [Arrow >>]       |
|  (if overflow  |  child  child ...  |  (if overflow      |
|   at start)    +--------------------+   at end)          |
|                                                          |
+----------------------------------------------------------+

Vertical variant:

+--[ScrollableButtonContainer]--+
|         [^ Arrow]             |
|  +--[scrollable div]-------+  |
|  |  child                  |  |
|  |  child                  |  |
|  |  child                  |  |
|  +--------------------------+ |
|         [v Arrow]             |
+-------------------------------+
```

### Scroll Behaviour

The component delegates scroll state tracking and animation to the
`useAutoScroll` hook:

1. **Overflow detection** — a `ResizeObserver` (when `observeChildren` is true)
   and scroll-event listeners determine whether content overflows at the start
   or end.
2. **Arrow visibility** — `canScrollStart` / `canScrollEnd` booleans drive
   conditional rendering of the chevron buttons.
3. **Continuous scrolling** — pressing and holding an arrow button calls
   `startAutoScroll('start' | 'end')`, which uses `requestAnimationFrame` to
   scroll at `scrollSpeedPxPerFrame` px/frame until `mouseup` or `mouseleave`.
4. **Touch support** — `onTouchStart` / `onTouchEnd` mirror the mouse events.

The inner scroll area hides the native scrollbar via the `no-scrollbar` utility
class.

### Usage

```tsx
import { ScrollableButtonContainer } from '@/components/atoms';

<div className='w-[400px]'>
  <ScrollableButtonContainer orientation='horizontal'>
    {items.map((item) => (
      <div key={item.id} className='px-3 py-2 rounded-md border'>
        {item.label}
      </div>
    ))}
  </ScrollableButtonContainer>
</div>;
```

### Ref Forwarding

The component uses `forwardRef` + `useImperativeHandle` to expose the inner
scrollable `<div>` element, allowing parent components to imperatively control
scroll position.

---

## NodeResizerWithMoreControls

**File:**
`src/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls.tsx`

An enhanced node resizer that extends ReactFlow's `NodeResizer` with
fine-grained control over which resize handles and edge lines are rendered.

### Props

Extends `NodeResizerProps` from `@xyflow/react` with:

| Prop              | Type                     | Default             | Description                                     |
| ----------------- | ------------------------ | ------------------- | ----------------------------------------------- |
| `linePosition`    | `ControlLinePosition[]`  | `['left', 'right']` | Which edges show line-style resize controls     |
| `handlePosition`  | `ControlPosition[]`      | `[]`                | Which corners show handle-style resize controls |
| `resizeDirection` | `ResizeControlDirection` | `'horizontal'`      | Constrain resize to a single axis               |

Inherited from `NodeResizerProps`:

| Prop                                         | Type      | Default            |
| -------------------------------------------- | --------- | ------------------ |
| `isVisible`                                  | `boolean` | `true`             |
| `minWidth` / `minHeight`                     | `number`  | `10`               |
| `maxWidth` / `maxHeight`                     | `number`  | `Number.MAX_VALUE` |
| `keepAspectRatio`                            | `boolean` | `false`            |
| `autoScale`                                  | `boolean` | `true`             |
| `shouldResize`                               | callback  | —                  |
| `onResizeStart` / `onResize` / `onResizeEnd` | callbacks | —                  |

### Control Types

```
Line controls (edges):          Handle controls (corners):

  +--------[top]--------+       [TL]------------------[TR]
  |                     |       |                        |
 [left]             [right]     |                        |
  |                     |       |                        |
  +------[bottom]-------+       [BL]------------------[BR]
```

- **Line controls** use `ResizeControlVariant.Line` and render as invisible drag
  zones along an edge. The class `!border-none` hides the default ReactFlow
  border; `!w-4` or `!h-4` provides a comfortable hit area.
- **Handle controls** use the default variant and render as visible corner
  grips.

Both types share the same min/max, aspect ratio, and callback props.

### Usage

```tsx
// Inside a custom node component
<NodeResizerWithMoreControls
  linePosition={['left', 'right']}
  handlePosition={[]}
  resizeDirection='horizontal'
  minWidth={200}
  maxWidth={600}
/>
```

---

## ConfigurableConnection

**File:**
`src/components/atoms/ConfiguableConnection/ConfigurableConnection.tsx`

A custom connection-line component rendered by ReactFlow while the user drags
from a handle to create a new edge. It automatically colours the in-progress
connection line to match the source handle's colour.

### Props

Inherits all props from `ConnectionLineComponentProps` (ReactFlow):

| Prop              | Type       | Description                                    |
| ----------------- | ---------- | ---------------------------------------------- |
| `fromX` / `fromY` | `number`   | Source coordinates                             |
| `toX` / `toY`     | `number`   | Current cursor coordinates                     |
| `fromPosition`    | `Position` | Source handle position (top/bottom/left/right) |
| `toPosition`      | `Position` | Target handle position                         |

### Colour Resolution

```
  useConnection()
       |
       v
  fromHandle.nodeId -----> useNodesData(nodeId)
                                  |
                                  v
                     getHandleFromNodeDataMatchingHandleId(handleId, data)
                                  |
                                  v
                          handle.handleColor  --->  stroke colour
                          (fallback: #A1A1A1)
```

1. `useConnection()` provides the in-progress connection's `fromHandle` (node
   ID + handle ID).
2. `useNodesData()` fetches the source node's data.
3. `getHandleFromNodeDataMatchingHandleId()` looks up the specific handle
   definition to extract its `handleColor`.
4. The colour is memoized and applied as the `stroke` style on a `<BaseEdge>`
   rendered with a bezier path.

### Usage

```tsx
import { ConfigurableConnection } from '@/components/atoms';

<ReactFlow
  connectionLineComponent={ConfigurableConnection}
  nodes={nodes}
  edges={edges}
  // ...
/>;
```

### Styling

- Stroke width: `stroke-7!` (7px, `!important`)
- Selected highlight: `in-[g.selected]:brightness-150` brightens the line when
  the parent `<g>` has the `.selected` class.
- Fallback colour: `#A1A1A1` (medium grey) when handle colour is unavailable.

---

## Limitations and Deprecated Patterns

1. **No animation on Collapsible** — The Collapsible wrapper does not add
   enter/exit transitions. Consumers must add their own CSS or Framer Motion
   animations if smooth expand/collapse is needed.

2. **ScrollableButtonContainer arrow overlap** — Arrow buttons are absolutely
   positioned over the scroll content. Items near the edges can be partially
   obscured by the arrow. There is no built-in padding offset for this.

3. **ConfigurableConnection folder typo** — The folder is named
   `ConfiguableConnection` (missing the "r" in "Configurable"). Imports must use
   the misspelled path.

4. **NodeResizerWithMoreControls line hit area** — Line controls use `!w-4` /
   `!h-4` with `!important` to override ReactFlow defaults. This works but is
   fragile if ReactFlow changes its internal class specificity.

5. **Badge has no "size" variant** — All badges render at `text-xs`. If
   different sizes are needed, consumers must override via `className`.

---

## Relationships with Other Features

### -> [ConfigurableNode (resizer, collapsible panels)](configurableNodeDoc.md)

`ConfigurableNode` is the main node shell in the graph. It uses:

- **NodeResizerWithMoreControls** — embedded inside each node to allow
  horizontal resizing. The `linePosition` is typically `['left', 'right']` with
  `resizeDirection="horizontal"` so nodes stretch horizontally only.
- **Collapsible** — node body sections (e.g., input groups, output groups) can
  be wrapped in `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` to
  let users collapse parts of a large node.

```
+--[ConfigurableNode]---------------------------+
|  [NodeResizerWithMoreControls]                |
|                                               |
|  [Header / CollapsibleTrigger]                |
|  [CollapsibleContent]                         |
|    inputs, outputs, body fields ...           |
|                                               |
+-----------------------------------------------+
```

### -> [NodeRunnerPanel (badges, separators)](nodeRunnerPanelDoc.md)

The `NodeRunnerPanel` — the execution/debugging sidebar — uses:

- **Badge** — to display execution status (e.g., "Running", "Error", "Complete")
  with colour-coded variants (`default`, `destructive`, `secondary`).
- **Separator** — horizontal dividers between sections of the panel (e.g.,
  between the timeline and the step inspector).

```
+--[NodeRunnerPanel]----------+
|  Run Controls               |
|  ----[Separator]----        |
|  [Badge: Running]           |
|  Execution Timeline         |
|  ----[Separator]----        |
|  Step Inspector             |
+-----------------------------+
```

### -> [FullGraph (connection line)](fullGraphDoc.md)

The `FullGraph` component — the top-level ReactFlow canvas — passes
`ConfigurableConnection` as the `connectionLineComponent` prop. This ensures
that when a user drags from any handle to create an edge, the in-progress line
matches the source handle's colour rather than using ReactFlow's default grey.

```
+--[FullGraph / ReactFlow]----------------------------------+
|                                                           |
|   [Node A] ---(ConfigurableConnection)---> cursor         |
|              colour = handle.handleColor                  |
|                                                           |
+-----------------------------------------------------------+
```
