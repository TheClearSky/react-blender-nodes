# Custom Hooks

## Overview

The `react-blender-nodes` library ships six custom React hooks that handle
common interaction patterns across the component tree. All hooks are exported
from `src/hooks/index.ts` as a single barrel module.

```
src/hooks/
  index.ts                  <-- barrel export
  useClickedOutside.ts      <-- outside-click detection
  useDrag.ts                <-- generic drag interaction
  useSlideAnimation.ts      <-- mount/unmount slide transitions
  useResizeHandle.ts        <-- drag-to-resize panels
  useFloatingTooltip.ts     <-- floating-ui tooltip boilerplate
  useAutoScroll.ts          <-- overflow detection + RAF scrolling
```

Hook dependency map (which components consume which hooks):

```
+---------------------+       +-------------------+
| ConfigurableNode    |------>| useDrag           |
+---------------------+       +-------------------+

+---------------------+       +-------------------+
| ContextMenu         |------>| useClickedOutside |
+---------------------+       +-------------------+

+---------------------+       +-------------------+       +-------------------+
| NodeRunnerPanel     |------>| useSlideAnimation |       | useResizeHandle   |
|                     |------>|                   |       |                   |
+---------------------+       +-------------------+       +-------------------+

+---------------------+       +-------------------+
| ExecutionTimeline   |------>| useAutoScroll     |
+---------------------+       +-------------------+

+---------------------+       +-------------------+
| NodeStatusIndicator |------>| useFloatingTooltip|
| ExecutionTimeline   |------>|                   |
+---------------------+       +-------------------+
```

---

## useClickedOutside

Detects clicks (mouse or touch) outside a specified element. Commonly used to
close dropdowns, modals, and context menus.

### API

```ts
function useClickedOutside<T extends HTMLElement>(
  ref: RefObject<T | null> | T | null,
  callback: () => void,
  checkDescendants?: boolean, // default: true
  checkCoordinates?: boolean, // default: false
): void;
```

**Parameters**

| Parameter          | Type                                | Default | Description                                                                           |
| ------------------ | ----------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `ref`              | `RefObject<T \| null> \| T \| null` | -       | The element to monitor. Accepts a React ref or a direct DOM element.                  |
| `callback`         | `() => void`                        | -       | Invoked when a click outside is detected.                                             |
| `checkDescendants` | `boolean`                           | `true`  | Uses `Node.contains()` to check if the click target is a descendant.                  |
| `checkCoordinates` | `boolean`                           | `false` | Uses bounding-box coordinate math (via `isCoordinateInBox`) instead of DOM hierarchy. |

**Return value**: `void` (side-effect only).

**How it works**

```
Document (mousedown / touchstart)
        |
        v
  +-----------+     yes
  | ref null? |---------> do nothing
  +-----------+
        | no
        v
  +------------------+     target is descendant
  | checkDescendants |--------------------------> do nothing
  +------------------+
        | target is NOT descendant
        v
  +------------------+     coordinate inside box
  | checkCoordinates |--------------------------> do nothing
  +------------------+
        | coordinate outside box (or skipped)
        v
    callback()
```

Listeners are attached to `document` for both `mousedown` and `touchstart`
events. They are cleaned up when the component unmounts.

### Usage context

- **ContextMenu**: Closes the context menu when the user clicks anywhere outside
  its boundary.

---

## useDrag

Provides generic drag interaction tracking with pixel movement, delta ratios,
and click detection.

### API

```ts
function useDrag(options?: UseDragOptions): UseDragReturn;
```

**UseDragOptions**

| Option                             | Type       | Default | Description                                                                              |
| ---------------------------------- | ---------- | ------- | ---------------------------------------------------------------------------------------- |
| `onMove`                           | `function` | -       | Called on each `mousemove` with `(movementX, movementY, deltaX, deltaY, width, height)`. |
| `onClick`                          | `function` | -       | Called on `mouseup` if the total drag distance was below `clickThreshold`.               |
| `clickThreshold`                   | `number`   | `2`     | Maximum Euclidean distance (px) to still count as a click.                               |
| `enabled`                          | `boolean`  | `true`  | Whether drag tracking is active.                                                         |
| `preventDefaultAndStopPropagation` | `boolean`  | `true`  | Prevents default browser behavior and stops event propagation during drag.               |

**UseDragReturn**

| Field        | Type                                     | Description                                      |
| ------------ | ---------------------------------------- | ------------------------------------------------ |
| `isDragging` | `boolean`                                | `true` while a drag is in progress.              |
| `dragRef`    | `(element: HTMLElement \| null) => void` | Callback ref to attach to the draggable element. |

**Delta calculation**

```
deltaX = movementX / element.clientWidth
deltaY = movementY / element.clientHeight
```

The delta values represent the mouse movement as a fraction of the element's
dimensions, useful for normalized slider-style controls.

**Drag lifecycle**

```
mousedown on element
  |
  +---> record initial position & element size
  +---> setIsDragging(true)
  +---> attach document-level mousemove + mouseup
            |
            v
        mousemove --> onMove(movementX, movementY, deltaX, deltaY, w, h)
            |
            v
        mouseup
          +---> remove document listeners
          +---> setIsDragging(false)
          +---> if distance < clickThreshold --> onClick()
```

### Usage context

- **ConfigurableNode**: Enables dragging of node slider inputs to adjust numeric
  values.

---

## useSlideAnimation

Manages CSS slide-in/slide-out animations with a proper mount/unmount lifecycle
using the Web Animations API.

### API

```ts
function useSlideAnimation(
  isOpen: boolean,
  options?: {
    durationMs?: number; // default: 250
    hiddenTransform?: string; // default: 'translateY(100%)'
    visibleTransform?: string; // default: 'translateY(0)'
    easing?: string; // default: 'cubic-bezier(0.32, 0.72, 0, 1)'
  },
): {
  mounted: boolean;
  ref: React.RefObject<HTMLDivElement | null>;
  style: React.CSSProperties;
};
```

**Parameters**

| Parameter          | Type      | Default                            | Description                                                  |
| ------------------ | --------- | ---------------------------------- | ------------------------------------------------------------ |
| `isOpen`           | `boolean` | -                                  | Controls visibility. `true` = slide in, `false` = slide out. |
| `durationMs`       | `number`  | `250`                              | Animation duration in milliseconds.                          |
| `hiddenTransform`  | `string`  | `'translateY(100%)'`               | CSS transform when the element is off-screen.                |
| `visibleTransform` | `string`  | `'translateY(0)'`                  | CSS transform when the element is fully visible.             |
| `easing`           | `string`  | `'cubic-bezier(0.32, 0.72, 0, 1)'` | CSS easing function for the animation.                       |

**Return value**

| Field     | Type                        | Description                                                              |
| --------- | --------------------------- | ------------------------------------------------------------------------ |
| `mounted` | `boolean`                   | Whether the element should be in the DOM. Use for conditional rendering. |
| `ref`     | `RefObject<HTMLDivElement>` | Attach to the animated element.                                          |
| `style`   | `React.CSSProperties`       | Initial inline style (sets `hiddenTransform`). Apply to the element.     |

### Animation lifecycle

The hook uses the Web Animations API with single-keyframe animations. This
approach allows interrupted animations (e.g., rapid open/close toggles) to
smoothly reverse from the current position rather than snapping.

```
isOpen changes to true
  |
  +---> setMounted(true)
  +---> Element renders into DOM with style={ transform: hiddenTransform }
  +---> effect fires: el.animate([{ transform: visibleTransform }])
  |        fill: 'forwards' keeps final position
  |
  v
isOpen changes to false (while open OR mid-animation)
  |
  +---> Commit current computed transform to inline style
  +---> Cancel previous animation
  +---> el.animate([{ transform: hiddenTransform }])
  |        single keyframe = browser interpolates from current position
  +---> onfinish --> setMounted(false)
  |        Element removed from DOM
  v
```

Key design decisions:

- **Single-keyframe animation**: The browser interpolates from the element's
  current `transform` to the target. This handles interruptions gracefully.
- **Inline style commit before cancel**: Before cancelling a running animation,
  the current computed transform is written to inline style. Without this,
  `cancel()` removes `fill: forwards` and the element snaps back.
- **Clip wrapper pattern**: The parent should use `overflow: hidden` to prevent
  layout overflow during the slide.

### Usage context

- **NodeRunnerPanel**: Slides the panel in from the bottom when opened, slides
  out when closed.
- **ExecutionStepInspector**: Slides in/out as the user inspects execution
  steps.

---

## useResizeHandle

Provides drag-to-resize functionality for panel dimensions with min/max bounds
and cursor management.

### API

```ts
function useResizeHandle(
  options: UseResizeHandleOptions,
): UseResizeHandleReturn;
```

**UseResizeHandleOptions**

| Option        | Type                                  | Default | Description                              |
| ------------- | ------------------------------------- | ------- | ---------------------------------------- |
| `initialSize` | `number`                              | -       | Starting size in pixels.                 |
| `minSize`     | `number`                              | -       | Minimum allowed size in pixels.          |
| `maxSize`     | `number`                              | -       | Maximum allowed size in pixels.          |
| `direction`   | `'up' \| 'down' \| 'left' \| 'right'` | `'up'`  | Which drag direction increases the size. |

**UseResizeHandleReturn**

| Field         | Type                            | Description                                          |
| ------------- | ------------------------------- | ---------------------------------------------------- |
| `size`        | `number`                        | Current size in pixels (reactive state).             |
| `onMouseDown` | `(e: React.MouseEvent) => void` | Attach to the resize handle element's `onMouseDown`. |

### Direction support

The `direction` parameter controls which axis is tracked and how mouse movement
maps to size changes:

```
direction = 'up'     -->  vertical axis,   drag UP increases size    (sign = -1)
direction = 'down'   -->  vertical axis,   drag DOWN increases size  (sign = +1)
direction = 'left'   -->  horizontal axis, drag LEFT increases size  (sign = -1)
direction = 'right'  -->  horizontal axis, drag RIGHT increases size (sign = +1)
```

During a drag:

- `document.body.style.cursor` is overridden to `ns-resize` (vertical) or
  `ew-resize` (horizontal).
- `document.body.style.userSelect` is set to `'none'` to prevent text selection.
- Both are restored on `mouseup`.

**Resize formula**:

```
newSize = clamp(startSize + (currentPos - startPos) * sign, minSize, maxSize)
```

### Usage context

- **NodeRunnerPanel**: Allows the user to resize the panel height by dragging
  its top edge (`direction = 'up'`).

---

## useFloatingTooltip

Consolidates the common `@floating-ui/react` tooltip boilerplate into a single
hook. Wraps `useFloating`, `useHover`, `useDismiss`, `useInteractions`,
`useTransitionStyles`, and the optional `arrow` middleware.

### API

```ts
function useFloatingTooltip(options?: UseFloatingTooltipOptions): {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  refs: { setReference: ..., setFloating: ... };
  floatingStyles: React.CSSProperties;
  context: FloatingContext;
  arrowRef: React.RefObject<SVGSVGElement | null>;
  getReferenceProps: () => Record<string, unknown>;
  getFloatingProps: () => Record<string, unknown>;
  isMounted: boolean;
  transitionStyles: React.CSSProperties;
};
```

**UseFloatingTooltipOptions**

| Option               | Type                  | Default                                        | Description                            |
| -------------------- | --------------------- | ---------------------------------------------- | -------------------------------------- |
| `placement`          | `Placement`           | `'top'`                                        | Tooltip placement relative to trigger. |
| `offsetPx`           | `number`              | `10`                                           | Offset distance in pixels.             |
| `hoverDelay`         | `{ open, close }`     | `{ open: 150, close: 0 }`                      | Hover delay in ms.                     |
| `transitionDuration` | `number`              | `150`                                          | Enter/exit transition duration in ms.  |
| `withArrow`          | `boolean`             | `true`                                         | Whether to include an arrow element.   |
| `initialTransition`  | `React.CSSProperties` | `{ opacity: 0, transform: 'translateY(4px)' }` | Initial transition style.              |

**Middleware pipeline**:

```
offset(offsetPx)  -->  flip()  -->  shift({ padding: 8 })  -->  arrow (if withArrow)
```

- `flip()`: Flips placement when the tooltip would overflow the viewport.
- `shift()`: Shifts the tooltip along the axis to stay in view (8px padding).
- `autoUpdate`: Keeps position in sync with scroll/resize while mounted.

### Usage context

- **NodeStatusIndicator** (`StatusTooltip`): Shows status information on hover.
- **ExecutionTimeline** (`BlockTooltip`, `TimeModeInfoTooltip`): Shows execution
  block details and time mode info on hover.

---

## useAutoScroll

Manages overflow-scroll state detection and `requestAnimationFrame`-based
continuous scrolling for containers with overflowing content.

### API

```ts
function useAutoScroll(options?: UseAutoScrollOptions): UseAutoScrollReturn;
```

**UseAutoScrollOptions**

| Option                  | Type                         | Default        | Description                                                |
| ----------------------- | ---------------------------- | -------------- | ---------------------------------------------------------- |
| `orientation`           | `'horizontal' \| 'vertical'` | `'horizontal'` | Scroll axis.                                               |
| `disabled`              | `boolean`                    | `false`        | Disables all scroll detection and auto-scrolling.          |
| `scrollSpeedPxPerFrame` | `number`                     | `14`           | Pixels scrolled per animation frame.                       |
| `observeChildren`       | `boolean`                    | `true`         | Watch for child DOM mutations to recalculate scroll state. |

**UseAutoScrollReturn**

| Field             | Type                                    | Description                                             |
| ----------------- | --------------------------------------- | ------------------------------------------------------- |
| `listRef`         | `RefObject<HTMLDivElement \| null>`     | Attach to the scrollable container element.             |
| `canScrollStart`  | `boolean`                               | Whether content overflows at the start (left or top).   |
| `canScrollEnd`    | `boolean`                               | Whether content overflows at the end (right or bottom). |
| `startAutoScroll` | `(direction: 'start' \| 'end') => void` | Begin continuous scrolling (call on button press).      |
| `stopAutoScroll`  | `() => void`                            | Stop continuous scrolling (call on button release).     |

**Scroll state detection**

The hook uses multiple mechanisms to keep `canScrollStart` and `canScrollEnd`
accurate:

```
+---------------------+
| Scroll state update |<--- scroll event (passive listener)
|  canScrollStart =   |<--- ResizeObserver on container
|    pos > 0          |<--- window resize
|  canScrollEnd =     |<--- MutationObserver on children (if observeChildren)
|    pos + size       |<--- requestAnimationFrame (initial + prop changes)
|    < full - 1       |
+---------------------+
```

**Auto-scroll loop (RAF-based)**

```
startAutoScroll('end')
  |
  +---> scrollingDirectionRef = 'end'
  +---> requestAnimationFrame(tickScroll)
            |
            v
        tickScroll()
          +---> el.scrollLeft += direction * scrollSpeedPxPerFrame
          +---> updateScrollState()
          +---> if reached boundary --> stopAutoScroll()
          +---> else --> requestAnimationFrame(tickScroll)
```

Scrolling also stops automatically on `pointerup` and `touchend` events on
`window`.

### Usage context

- **ExecutionTimeline**: Provides scroll arrows for the timeline when execution
  blocks overflow the visible area.
- **ScrollableButtonContainer**: Enables horizontal scrolling of button rows
  that overflow.

---

## Limitations and Deprecated Patterns

- **useClickedOutside**: The `checkDescendants` and `checkCoordinates` flags are
  mutually exclusive in practice -- when `checkDescendants` passes (target IS a
  descendant), the coordinate check is skipped via `else if`. If both
  fine-grained DOM and coordinate checks are needed simultaneously, the hook
  would need modification.
- **useDrag**: Mouse-only. Does not handle touch or pointer events. Touch-based
  dragging requires a separate solution or extending the hook.
- **useResizeHandle**: Mouse-only (same as `useDrag`). The `size` state resets
  on re-mount since it is not persisted.
- **useAutoScroll**: The boundary-reached check inside `tickScroll` references
  `canScrollStart` / `canScrollEnd` from the closure, which may be stale by one
  frame relative to the just-updated scroll position. In practice, the scroll
  event listener fires and corrects on the next frame.

---

## Relationships with Other Features

### -> [NodeRunnerPanel (useSlideAnimation, useResizeHandle)](../ui/nodeRunnerPanelDoc.md)

The `NodeRunnerPanel` uses `useSlideAnimation` for its open/close transition and
`useResizeHandle` for user-controlled height adjustment. The slide animation
controls mount/unmount of the panel DOM, while the resize handle controls the
panel's height within its mounted state.

```
NodeRunnerPanel
  |
  +--- useSlideAnimation(isOpen)
  |      |
  |      +--- mounted? --> render panel
  |      +--- ref      --> attached to panel container
  |      +--- style    --> initial hidden transform
  |
  +--- useResizeHandle({ direction: 'up', ... })
         |
         +--- size        --> panel height
         +--- onMouseDown --> attached to top-edge drag handle
```

### -> [ExecutionTimeline (useAutoScroll)](../ui/executionTimelineDoc.md)

The `ExecutionTimeline` component uses `useAutoScroll` to provide scroll
navigation when execution step blocks overflow the timeline container. The
`canScrollStart` and `canScrollEnd` flags control the visibility of directional
scroll arrow buttons.

```
ExecutionTimeline
  |
  +--- useAutoScroll({ orientation: 'horizontal' })
         |
         +--- listRef         --> timeline container
         +--- canScrollStart  --> show/hide left arrow
         +--- canScrollEnd    --> show/hide right arrow
         +--- startAutoScroll --> arrow button onPointerDown
         +--- stopAutoScroll  --> arrow button onPointerUp
```

### -> [Context Menu (useClickedOutside)](../ui/contextMenuDoc.md)

The `ContextMenu` component uses `useClickedOutside` to close itself when the
user clicks anywhere outside the menu boundary.

```
ContextMenu
  |
  +--- useClickedOutside(menuRef, closeMenu)
         |
         +--- document mousedown/touchstart
         +--- if click outside menuRef --> closeMenu()
```

### -> [ConfigurableNode (useDrag)](../ui/configurableNodeDoc.md)

`ConfigurableNode` uses `useDrag` in its slider sub-components to allow dragging
to adjust numeric input values. The `deltaX` ratio is used to map mouse movement
to value changes relative to the slider width.

```
ConfigurableNode (slider input)
  |
  +--- useDrag({ onMove: (_, _, deltaX) => updateValue(deltaX) })
         |
         +--- dragRef --> attached to slider element
         +--- isDragging --> visual feedback (cursor, highlight)
```
