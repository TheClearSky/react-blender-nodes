# Custom Hooks

## Overview

The `react-blender-nodes` library ships six custom React hooks that encapsulate
common interaction patterns (drag, outside-click, slide transitions, resize,
floating tooltips, auto-scroll) shared across the component tree. They live in
six modules under `src/hooks/`, all re-exported through the `index.ts` barrel.

```
src/hooks/
  index.ts                  <-- barrel export (all six hooks)
  useClickedOutside.ts      <-- outside-click detection
  useDrag.ts                <-- generic drag interaction
  useSlideAnimation.ts      <-- mount/unmount slide transitions (WAAPI)
  useResizeHandle.ts        <-- drag-to-resize panels
  useFloatingTooltip.ts     <-- @floating-ui/react tooltip boilerplate
  useAutoScroll.ts          <-- overflow detection + RAF scrolling
```

### Barrel export

`src/hooks/index.ts` re-exports all six hooks (`src/hooks/index.ts` ›
`useClickedOutside`):

```ts
export * from './useClickedOutside';
export * from './useDrag';
export * from './useSlideAnimation';
export * from './useResizeHandle';
export * from './useFloatingTooltip';
export * from './useAutoScroll';
```

This barrel is in turn re-exported from the package root via `src/index.ts` ›
`export * from './hooks'`, so all six hooks (and their exported types) are part
of the library's public surface. Note that the in-repo call sites import each
hook by its direct module path (e.g.
`import { useFloatingTooltip } from '@/hooks/useFloatingTooltip'`) rather than
from the barrel; both paths resolve to the same export.

> Note: only `useDrag`, `useResizeHandle`, `useFloatingTooltip`, and
> `useAutoScroll` export named TypeScript option/return types (`UseDragOptions`,
> `UseDragReturn`, `UseResizeHandleOptions`, `UseResizeHandleReturn`,
> `UseFloatingTooltipOptions`, `UseAutoScrollOptions`, `UseAutoScrollReturn`).
> `useClickedOutside` and `useSlideAnimation` take inline option object literals
> and export no named types.

### Hook dependency map

Which components actually consume which hooks (verified against source):

```
+-----------------------+        +-------------------+
| SliderNumberInput     |------->| useDrag           |
+-----------------------+        +-------------------+

+-----------------------+        +-------------------+
| Input (atom)          |------->| useClickedOutside |
+-----------------------+        +-------------------+

+-----------------------+        +-------------------+
| NodeRunnerPanel       |------->| useSlideAnimation | (panel + inspector)
| SwitchEditDrawer      |------->|                   |
| LoopEditDrawer        |------->|                   |
| NodeTypeEditDrawer    |------->|                   |
+-----------------------+        +-------------------+

+-----------------------+        +-------------------+
| NodeRunnerPanel       |------->| useResizeHandle   |
+-----------------------+        +-------------------+

+-----------------------+        +-------------------+
| NodeStatusIndicator   |------->| useFloatingTooltip|
| (StatusTooltip)       |        |                   |
+-----------------------+        +-------------------+

+-----------------------------+    +-------------------+
| ScrollableButtonContainer   |--->| useAutoScroll     |
| (FullGraphNodeGroupSelector)|    +-------------------+
+-----------------------------+
```

> The `Tooltip` atom (`src/components/atoms/Tooltip/Tooltip.tsx`) does **not**
> use `useFloatingTooltip`; it calls `@floating-ui/react`'s `useFloating`
> directly. `ExecutionTimeline` reaches floating tooltips only through that
> `Tooltip` atom — it does not import any of these hooks itself, and it does
> **not** use `useAutoScroll` (its internal scrolling is driven by
> `useTimelineAutoplay`). The only consumer of `ScrollableButtonContainer`, and
> therefore the only indirect user of `useAutoScroll`, is
> `FullGraphNodeGroupSelector`.

---

## useClickedOutside

Detects clicks (mouse or touch) outside a specified element. Commonly used to
commit/close inputs, dropdowns, modals, and overlays. Source:
`src/hooks/useClickedOutside.ts`.

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

The `ref` argument is normalized so a `RefObject` (`'current' in ref`) and a raw
element are both accepted (`src/hooks/useClickedOutside.ts` ›
`useClickedOutside`). Coordinate checks resolve a `Coordinate` from
`event.clientX/clientY` for mouse events or `event.touches[0]` for touch events,
then call `isCoordinateInBox` against `getBoundingClientRect()` (both imported
from `@/utils`).

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
  +-----------------------------------+   true (checkDescendants && target NOT
  | checkDescendants &&               |   inside ref): allChecksPassed = false,
  | target is NOT a descendant of ref |---> coordinate branch is SKIPPED (else if),
  +-----------------------------------+       fall straight to callback() below
        | false  (checkDescendants off, OR target IS inside ref)
        v
  +------------------+     coordinate inside box --> do nothing
  | else if          |     (only reached on the `false` branch above)
  | checkCoordinates |
  +------------------+
        | coordinate outside box (sets allChecksPassed = false)
        v
    callback()   // only when !allChecksPassed
```

Listeners are attached to `document` for both `mousedown` and `touchstart`
events and removed on unmount (`src/hooks/useClickedOutside.ts` ›
`useClickedOutside`).

### Usage context

- **Input (atom)** (`src/components/atoms/Input/Input.tsx` › `Input`): commits
  the text input's temporary value when the user clicks outside the `<input>`,
  via
  `useClickedOutside(inputRef, () => handleSettingValueFromTemporaryValue())`.

---

## useDrag

Provides generic drag interaction tracking with pixel movement, normalized delta
ratios, and click detection. Mouse-only. Source: `src/hooks/useDrag.ts`.

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
| `preventDefaultAndStopPropagation` | `boolean`  | `true`  | Calls `preventDefault()` + `stopPropagation()` on mousedown/move/up.                     |

**UseDragReturn**

| Field        | Type                                     | Description                                      |
| ------------ | ---------------------------------------- | ------------------------------------------------ |
| `isDragging` | `boolean`                                | `true` while a drag is in progress.              |
| `dragRef`    | `(element: HTMLElement \| null) => void` | Callback ref to attach to the draggable element. |

Both `UseDragOptions` and `UseDragReturn` are exported types
(`src/hooks/useDrag.ts` › `UseDragOptions`). `dragRef` is a callback ref backed
by `useState`, so attaching it triggers an effect that wires the `mousedown`
listener on the element (`src/hooks/useDrag.ts` › `dragRef`).

**Delta calculation** (`src/hooks/useDrag.ts` › `useDrag`)

```
width  = element.clientWidth  (captured at mousedown, falls back to 1)
height = element.clientHeight (captured at mousedown, falls back to 1)
deltaX = movementX / width
deltaY = movementY / height
```

The delta values represent each `mousemove`'s `movementX/movementY` as a
fraction of the element's dimensions captured at drag start, useful for
normalized slider-style controls.

**Drag lifecycle**

```
mousedown on element
  |
  +---> record initialMouseDownPosition (clientX/clientY) & elementSize (clientWidth/Height)
  +---> setIsDragging(true)
  +---> attach document-level mousemove + mouseup
            |
            v
        mousemove --> onMove(movementX, movementY, deltaX, deltaY, width, height)
            |
            v
        mouseup
          +---> remove document listeners (and clear the stored handler refs)
          +---> setIsDragging(false)
          +---> distance = hypot(dx, dy) from mousedown point
          +---> if distance < clickThreshold --> onClick()
```

The hook also stores the active `mousemove`/`mouseup` handlers in refs so the
effect cleanup can detach any in-flight listeners on unmount
(`src/hooks/useDrag.ts` › `useDrag`).

### Usage context

- **SliderNumberInput**
  (`src/components/molecules/SliderNumberInput/SliderNumberInput.tsx` ›
  `SliderNumberInput`): the slider-mode input uses `useDrag` to convert
  horizontal mouse movement into value changes. It reads `movementX` and `width`
  (not the `deltaX` ratio directly), computing
  `distanceRatio = movementX / (width + 60)`, accumulates it into a ref, and
  commits a change once the cumulative ratio passes a threshold. `onClick`
  switches the slider back into text-input mode, and `isDragging` drives the
  cursor/visual state. `SliderNumberInput` is itself rendered by
  `ConfigurableNode`'s number inputs.

---

## useSlideAnimation

Manages CSS slide-in/slide-out animations with a proper mount/unmount lifecycle
using the Web Animations API (WAAPI). Source: `src/hooks/useSlideAnimation.ts`.

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
| `durationMs`       | `number`  | `250`                              | Animation duration in milliseconds (`DEFAULT_DURATION_MS`).  |
| `hiddenTransform`  | `string`  | `'translateY(100%)'`               | CSS transform when the element is off-screen.                |
| `visibleTransform` | `string`  | `'translateY(0)'`                  | CSS transform when the element is fully visible.             |
| `easing`           | `string`  | `'cubic-bezier(0.32, 0.72, 0, 1)'` | CSS easing function for the animation.                       |

**Return value**

| Field     | Type                                      | Description                                                                    |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `mounted` | `boolean`                                 | Whether the element should be in the DOM. Use for conditional rendering.       |
| `ref`     | `React.RefObject<HTMLDivElement \| null>` | Attach to the animated element.                                                |
| `style`   | `React.CSSProperties`                     | Initial inline style (`{ transform: hiddenTransform }`). Apply to the element. |

### Animation lifecycle

The hook uses the Web Animations API with single-keyframe animations. This
approach allows interrupted animations (e.g., rapid open/close toggles) to
smoothly reverse from the current position rather than snapping
(`src/hooks/useSlideAnimation.ts` › `useSlideAnimation`).

```
isOpen changes to true
  |
  +---> setMounted(true)                                  (mount effect)
  +---> Element renders into DOM with style={ transform: hiddenTransform }
  +---> animation effect fires: el.animate([{ transform: visibleTransform }], { fill: 'forwards' })
  |        single keyframe -> browser interpolates from current transform
  |
  v
isOpen changes to false (while open OR mid-animation)
  |
  +---> Commit current computed transform to inline style (getComputedStyle)
  +---> Cancel previous animation (animRef)
  +---> el.animate([{ transform: hiddenTransform }], { fill: 'forwards' })
  +---> anim.onfinish --> setMounted(false)   // element removed from DOM
  v
```

Key design decisions:

- **Single-keyframe animation**: the browser interpolates from the element's
  current `transform` to the target, so interruptions are handled gracefully.
- **Inline-style commit before cancel**: before cancelling a running animation,
  the current computed transform is written to inline style. Without this,
  `cancel()` removes `fill: 'forwards'` and the element snaps back to the
  baseline inline style (`hiddenTransform`), making the exit animation a no-op
  (`src/hooks/useSlideAnimation.ts` › `useSlideAnimation`).
- **`onfinish` only on close**: `setMounted(false)` is wired only when
  `!isOpen`, so the element unmounts after the exit animation completes
  (`src/hooks/useSlideAnimation.ts` › `useSlideAnimation`).
- **Clip wrapper pattern**: the parent should use `overflow: hidden` to prevent
  layout overflow during the slide.

### Usage context

- **NodeRunnerPanel**
  (`src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx` ›
  `NodeRunnerPanel`): slides the panel up from the bottom (default `translateY`
  transforms) when `isRunnerPanelOpen`.
- **NodeRunnerPanel inspector**
  (`src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx` ›
  `NodeRunnerPanel`): a second `useSlideAnimation` slides the step inspector in
  from the right with `hiddenTransform: 'translateX(100%)'`,
  `visibleTransform: 'translateX(0)'`, and `durationMs: 200`.
- **SwitchEditDrawer**, **LoopEditDrawer**, **NodeTypeEditDrawer**
  (`src/components/molecules/SwitchEditDrawer/SwitchEditDrawer.tsx` ›
  `SwitchEditDrawer`,
  `src/components/molecules/LoopEditDrawer/LoopEditDrawer.tsx` ›
  `LoopEditDrawer`,
  `src/components/molecules/NodeTypeEditDrawer/NodeTypeEditDrawer.tsx` ›
  `NodeTypeEditDrawer`): each side drawer slides in from the right using the
  same `translateX(100%)` / `translateX(0)` / `durationMs: 200` configuration.

---

## useResizeHandle

Provides drag-to-resize functionality for a single panel dimension with min/max
clamping and cursor management. Mouse-only. Source:
`src/hooks/useResizeHandle.ts`.

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

Both `UseResizeHandleOptions` and `UseResizeHandleReturn` are exported types
(`src/hooks/useResizeHandle.ts` › `UseResizeHandleOptions`).

### Direction support

The `direction` parameter controls which axis is tracked and how mouse movement
maps to size changes (`src/hooks/useResizeHandle.ts` › `useResizeHandle`):

```
isVertical = direction === 'up' || direction === 'down'
cursorStyle = isVertical ? 'ns-resize' : 'ew-resize'
sign       = (direction === 'up' || direction === 'left') ? -1 : +1

direction = 'up'     -->  vertical axis,   drag UP increases size    (sign = -1)
direction = 'down'   -->  vertical axis,   drag DOWN increases size  (sign = +1)
direction = 'left'   -->  horizontal axis, drag LEFT increases size  (sign = -1)
direction = 'right'  -->  horizontal axis, drag RIGHT increases size (sign = +1)
```

During a drag (`src/hooks/useResizeHandle.ts` › `useResizeHandle`):

- `e.preventDefault()` and `e.stopPropagation()` are called on mousedown.
- `document.body.style.cursor` is overridden to `ns-resize` (vertical) or
  `ew-resize` (horizontal).
- `document.body.style.userSelect` is set to `'none'` to prevent text selection.
- Both are restored on `mouseup`, and again in the unmount cleanup effect
  (`src/hooks/useResizeHandle.ts` › `useResizeHandle`).

**Resize formula** (`src/hooks/useResizeHandle.ts` › `useResizeHandle`):

```
currentPos = isVertical ? moveEvent.clientY : moveEvent.clientX
delta      = (currentPos - startPos) * sign
newSize    = clamp(startSize + delta, minSize, maxSize)
```

### Usage context

- **NodeRunnerPanel**
  (`src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx` ›
  `NodeRunnerPanel`): resizes the panel content height by dragging its top edge
  with `direction: 'up'`, bounded by `MIN_CONTENT_HEIGHT`/`MAX_CONTENT_HEIGHT`
  and starting at `DEFAULT_CONTENT_HEIGHT`. The returned `size` is read as
  `contentHeight` and `onMouseDown` as `handleResizeStart`.

---

## useFloatingTooltip

Consolidates the common `@floating-ui/react` tooltip boilerplate into a single
hook. Wraps `useFloating`, `useHover`, `useDismiss`, `useInteractions`,
`useTransitionStyles`, and the optional `arrow` middleware. Source:
`src/hooks/useFloatingTooltip.ts`.

### API

```ts
function useFloatingTooltip(options?: UseFloatingTooltipOptions): {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  refs: ReturnType<typeof useFloating>['refs'];
  floatingStyles: React.CSSProperties;
  context: ReturnType<typeof useFloating>['context'];
  arrowRef: React.RefObject<SVGSVGElement | null>;
  getReferenceProps: (
    userProps?: React.HTMLProps<Element>,
  ) => Record<string, unknown>;
  getFloatingProps: (
    userProps?: React.HTMLProps<HTMLElement>,
  ) => Record<string, unknown>;
  isMounted: boolean;
  transitionStyles: React.CSSProperties;
};
```

**UseFloatingTooltipOptions** (exported; `src/hooks/useFloatingTooltip.ts` ›
`UseFloatingTooltipOptions`)

| Option               | Type                              | Default                                        | Description                                |
| -------------------- | --------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| `placement`          | `Placement`                       | `'top'`                                        | Tooltip placement relative to trigger.     |
| `offsetPx`           | `number`                          | `10`                                           | Offset distance in pixels.                 |
| `hoverDelay`         | `{ open: number; close: number }` | `{ open: 150, close: 0 }`                      | Hover delay in ms.                         |
| `transitionDuration` | `number`                          | `150`                                          | Enter/exit transition duration in ms.      |
| `withArrow`          | `boolean`                         | `true`                                         | Whether to include the `arrow` middleware. |
| `initialTransition`  | `React.CSSProperties`             | `{ opacity: 0, transform: 'translateY(4px)' }` | Initial transition style.                  |

`Placement` is the `@floating-ui/react` type, imported (as a type) and used by
`UseFloatingTooltipOptions`; the hook module does **not** re-export it, so
consumers needing the type must import it from `@floating-ui/react` directly.

**Middleware pipeline** (`src/hooks/useFloatingTooltip.ts` ›
`useFloatingTooltip`):

```
offset(offsetPx)  -->  flip()  -->  shift({ padding: 8 })  -->  arrow({ element: arrowRef }) (only if withArrow)
```

- `flip()`: flips placement when the tooltip would overflow the viewport.
- `shift({ padding: 8 })`: shifts the tooltip along the axis to stay in view.
- `whileElementsMounted: autoUpdate`: keeps position in sync with scroll/resize
  while mounted (`src/hooks/useFloatingTooltip.ts` › `useFloatingTooltip`).
- `useHover(context, { delay: hoverDelay })` + `useDismiss(context)` are
  combined via `useInteractions` to drive
  `getReferenceProps`/`getFloatingProps`.
- `useTransitionStyles(context, { duration: transitionDuration, initial: initialTransition })`
  produces `isMounted` and `transitionStyles` for fade/slide enter-exit.

### Usage context

- **NodeStatusIndicator → StatusTooltip**
  (`src/components/atoms/NodeStatusIndicator/NodeStatusIndicator.tsx` ›
  `StatusTooltip`): the only consumer. Hovering an error/warning badge shows a
  floating tooltip; it destructures `refs`, `floatingStyles`, `context`,
  `arrowRef`, `getReferenceProps`, `getFloatingProps`, `isMounted`, and
  `transitionStyles` from the hook (called with `placement: 'top'`,
  `offsetPx: 10`, `hoverDelay: { open: 150, close: 0 }`,
  `transitionDuration: 150`).

> The standalone `Tooltip` atom and `ExecutionTimeline` use `@floating-ui/react`
> directly and do not depend on this hook.

---

## useAutoScroll

Manages overflow-scroll state detection and `requestAnimationFrame`-based
continuous scrolling for containers with overflowing content. Supports both
horizontal and vertical orientations. Source: `src/hooks/useAutoScroll.ts`.

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

| Field             | Type                                      | Description                                             |
| ----------------- | ----------------------------------------- | ------------------------------------------------------- |
| `listRef`         | `React.RefObject<HTMLDivElement \| null>` | Attach to the scrollable container element.             |
| `canScrollStart`  | `boolean`                                 | Whether content overflows at the start (left or top).   |
| `canScrollEnd`    | `boolean`                                 | Whether content overflows at the end (right or bottom). |
| `startAutoScroll` | `(direction: 'start' \| 'end') => void`   | Begin continuous scrolling (call on button press).      |
| `stopAutoScroll`  | `() => void`                              | Stop continuous scrolling (call on button release).     |

Both `UseAutoScrollOptions` and `UseAutoScrollReturn` are exported types
(`src/hooks/useAutoScroll.ts` › `UseAutoScrollOptions`).

**Axis resolution** (`src/hooks/useAutoScroll.ts` › `getAxis`): `orientation`
selects the DOM properties read — vertical uses `scrollTop`/`clientHeight`/
`scrollHeight`, horizontal uses `scrollLeft`/`clientWidth`/`scrollWidth`.

**Scroll state detection** (`src/hooks/useAutoScroll.ts` › `updateScrollState`)

```
canScrollStart = pos > 0
canScrollEnd   = pos + size < full - 1     (1px tolerance)

pos/size/full read for the active axis. When disabled or no element,
both flags are forced false.
```

`updateScrollState` is re-run from several sources to stay accurate:

```
+---------------------+
| updateScrollState() |<--- scroll event on the container (passive listener)
|                     |<--- ResizeObserver on container (when available)
|                     |<--- window 'resize'
|                     |<--- MutationObserver childList+subtree (if observeChildren)
|                     |<--- requestAnimationFrame (initial + when updater changes)
+---------------------+
```

**Auto-scroll loop (RAF-based)** (`src/hooks/useAutoScroll.ts` › `tickScroll`)

```
startAutoScroll('end')
  |
  +---> ignore if disabled, or if already scrolling that direction
  +---> scrollingDirectionRef = 'end'
  +---> requestAnimationFrame(tickScroll)
            |
            v
        tickScroll()
          +---> direction = (scrollingDirectionRef === 'start') ? -1 : +1
          +---> el.scrollLeft/scrollTop += direction * scrollSpeedPxPerFrame
          +---> updateScrollState()
          +---> read pos/size/full directly from the DOM (avoids stale React state)
          +---> reachedEnd = (dir<0 && pos<=0) || (dir>0 && pos+size>=full-1)
          +---> if reachedEnd --> stopAutoScroll()
          +---> else --> requestAnimationFrame(tickScroll)
```

`stopAutoScroll` cancels the pending RAF and clears the direction ref. Scrolling
also stops automatically on `pointerup` and `touchend` on `window`
(`src/hooks/useAutoScroll.ts` › `useAutoScroll`).

### Usage context

- **ScrollableButtonContainer**
  (`src/components/atoms/ScrollableButtonContainer/ScrollableButtonContainer.tsx`
  › `ScrollableButtonContainer`): the only consumer. It forwards `orientation`,
  `disabled`, `scrollSpeedPxPerFrame`, and `observeChildren` into the hook,
  exposes `listRef` through `useImperativeHandle`, gates the start/end arrow
  buttons on `canScrollStart`/`canScrollEnd`, and wires the arrows'
  `onMouseDown` to `startAutoScroll('start' | 'end')`.
  `ScrollableButtonContainer` is in turn rendered only by
  `FullGraphNodeGroupSelector`
  (`src/components/organisms/FullGraph/FullGraphNodeGroupSelector.tsx` ›
  `FullGraphNodeGroupSelector`), which uses it for its horizontally overflowing
  node-group button row. (`ExecutionTimeline` does **not** use this component or
  the hook; its own scrolling is handled internally by `useTimelineAutoplay`.)

---

## Limitations and Notes

- **useClickedOutside**: the descendant and coordinate checks are an `if` /
  `else if`, so they never both run in the same pass
  (`src/hooks/useClickedOutside.ts` › `useClickedOutside`). The coordinate
  branch runs **only** when the descendant `if` is false — i.e. when
  `checkDescendants` is `false`, the target is not a `Node`, or the target IS a
  descendant of the ref. When `checkDescendants` is `true` and the target is NOT
  a descendant, the descendant branch already sets `allChecksPassed = false` and
  the coordinate branch is skipped. Coordinate mode reads only
  `event.touches[0]` for touch events and assumes a touch point is present.
- **useDrag**: mouse-only — it listens for `mousedown`/`mousemove`/`mouseup` and
  uses `event.movementX/movementY`. Touch/pointer dragging needs a separate
  solution. Element size is sampled once at mousedown, so mid-drag resizes are
  not reflected in the delta ratios.
- **useSlideAnimation**: depends on the Web Animations API and a single
  `HTMLDivElement` ref; the element must be a block-level box that accepts
  `transform`. The parent should clip overflow during the slide.
- **useResizeHandle**: mouse-only (same as `useDrag`). `size` is local React
  state seeded from `initialSize`, so it resets on remount and is not persisted
  by the hook.
- **useAutoScroll**: the boundary check inside `tickScroll` reads
  `pos/size/full` **directly from the DOM** (not from
  `canScrollStart`/`canScrollEnd` React state) specifically to avoid a
  stale-closure off-by-one-frame bug (`src/hooks/useAutoScroll.ts` ›
  `tickScroll`). `ResizeObserver` is feature-detected
  (`'ResizeObserver' in window`); the `MutationObserver` branch only runs when
  `observeChildren` is `true`.

---

## Relationships with Other Features

### -> [NodeRunnerPanel (useSlideAnimation, useResizeHandle)](../ui/nodeRunnerPanelDoc.md)

`NodeRunnerPanel` uses `useSlideAnimation` for two transitions — the panel
itself (slide up from the bottom) and the step inspector (slide in from the
right) — and `useResizeHandle` for user-controlled panel height. The slide
animations control mount/unmount of DOM, while the resize handle controls the
panel's content height within its mounted state.

```
NodeRunnerPanel
  |
  +--- useSlideAnimation(isRunnerPanelOpen)            // panel, translateY
  |      +--- mounted? --> render panel
  |      +--- ref      --> combined with external panelRef
  |      +--- style    --> initial hidden transform
  |
  +--- useSlideAnimation(inspectorOpen, { translateX, 200ms })  // inspector
  |
  +--- useResizeHandle({ direction: 'up', initialSize, minSize, maxSize })
         +--- size        --> panel content height
         +--- onMouseDown --> attached to top-edge drag handle
```

### -> [Side Drawers (useSlideAnimation)](../ui/uiPrimitivesDoc.md)

`SwitchEditDrawer`, `LoopEditDrawer`, and `NodeTypeEditDrawer` each use
`useSlideAnimation` with `translateX(100%)`/`translateX(0)` and
`durationMs: 200` to slide in from the right edge, mounting/unmounting their
contents with the open/close transition.

### -> [ScrollableButtonContainer / FullGraphNodeGroupSelector (useAutoScroll)](../ui/uiPrimitivesDoc.md)

`ScrollableButtonContainer` wraps `useAutoScroll` to provide scroll-arrow
navigation when its button row overflows. `canScrollStart`/`canScrollEnd`
control arrow visibility, and the arrows drive
`startAutoScroll`/`stopAutoScroll`. `FullGraphNodeGroupSelector` consumes
`useAutoScroll` through `ScrollableButtonContainer` for its node-group button
row rather than calling the hook directly. (`ExecutionTimeline` does not use
this component; its scrolling is handled internally by `useTimelineAutoplay`.)

```
ScrollableButtonContainer
  |
  +--- useAutoScroll({ orientation, disabled, scrollSpeedPxPerFrame, observeChildren })
         +--- listRef         --> scrollable container
         +--- canScrollStart  --> show/hide start arrow
         +--- canScrollEnd    --> show/hide end arrow
         +--- startAutoScroll --> arrow button onMouseDown
         +--- stopAutoScroll  --> window pointerup/touchend (auto)
```

### -> [Input (useClickedOutside)](../ui/inputComponentsDoc.md)

The text `Input` atom uses `useClickedOutside` to commit its temporary value
when the user clicks outside the field.

```
Input (atom)
  |
  +--- useClickedOutside(inputRef, () => handleSettingValueFromTemporaryValue())
         +--- document mousedown/touchstart
         +--- if click outside inputRef --> commit temporary value
```

### -> [SliderNumberInput / ConfigurableNode (useDrag)](../ui/configurableNodeDoc.md)

`SliderNumberInput` (used by `ConfigurableNode`'s number inputs) uses `useDrag`
to convert horizontal mouse movement into numeric value changes, and `onClick`
to switch the control back into text-input mode.

```
SliderNumberInput
  |
  +--- useDrag({ onMove: (movementX, _, _, _, width) => accumulate & commit,
  |              onClick: handleSwitchFromSliderToInput, clickThreshold: 2 })
         +--- dragRef    --> attached to the slider element
         +--- isDragging --> cursor / visual feedback
```

### -> [NodeStatusIndicator (useFloatingTooltip)](../ui/nodeStatusIndicatorDoc.md)

`NodeStatusIndicator`'s internal `StatusTooltip` uses `useFloatingTooltip` to
show error/warning details on hover over the status badge.

```
NodeStatusIndicator (StatusTooltip)
  |
  +--- useFloatingTooltip({ placement: 'top', offsetPx: 10, hoverDelay, transitionDuration })
         +--- refs.setReference / refs.setFloating
         +--- getReferenceProps / getFloatingProps (hover + dismiss)
         +--- isMounted + transitionStyles (enter/exit fade)
         +--- arrowRef --> FloatingArrow
```
