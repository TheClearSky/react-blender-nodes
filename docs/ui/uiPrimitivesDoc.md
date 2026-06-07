# UI Primitives

## Overview

UI Primitives are the foundational layout, overlay, and display atoms in
`src/components/atoms/`. They provide consistent, reusable building blocks —
scrollable containers, node resize controls, in-progress connection lines,
expand/collapse sections, dialogs, tooltips, and an error boundary — that the
higher-level molecules and organisms compose into complete interfaces.

This document covers the **layout / overlay / display** atoms. The
**form-input** atoms (`Button`, `Input`, `Checkbox`) and input molecules
(`SliderNumberInput`, `Select`) are documented separately in
[Input Components](inputComponentsDoc.md). Two display atoms that have grown
their own dedicated docs are covered there instead:
[NodeStatusIndicator](nodeStatusIndicatorDoc.md) (runner visual overlay) and
[ConfigurableEdge](configurableEdgeDoc.md) (gradient edge renderer).

The barrel `src/components/atoms/index.ts` re-exports the public atoms:

```ts
export * from './Accordion';
export * from './Button';
export * from './ConfigurableEdge';
export * from './ErrorBoundary';
export * from './Input';
export * from './Modal';
export * from './NodeResizerWithMoreControls';
export * from './NodeStatusIndicator';
export * from './ScrollableButtonContainer';
export * from './Tooltip';
```

> **Note on `ConfigurableConnection` and `Checkbox`:** both exist as folders
> under `src/components/atoms/` but are **not** re-exported from the atoms
> barrel `index.ts`. `ConfigurableConnection` is imported directly by
> `FullGraph` from
> `@/components/atoms/ConfigurableConnection/ConfigurableConnection` (though its
> own `index.ts` re-exports it too); `Checkbox` is imported directly by
> `ContextAwareInput` from `@/components/atoms/Checkbox/Checkbox` — note its
> `Checkbox/index.ts` is **empty**, so the folder path does not resolve the
> export. `Checkbox` is documented in
> [Input Components](inputComponentsDoc.md#checkbox-atom-radix-ui).

> **No `Badge`, `Separator`, or `Collapsible` atoms exist.** Earlier revisions
> of this doc described those as "planned"; they were never implemented. The
> expand/collapse primitive that does exist is `Accordion` (a Radix wrapper),
> documented below.

Conventions shared across these atoms:

- Accept `className` for Tailwind-based style overrides, merged through the
  `cn()` helper (`src/utils/cnHelper.ts` › `cn`).
- Wrap Radix UI (`radix-ui` / `@radix-ui/*`), `@floating-ui/react`, or ReactFlow
  (`@xyflow/react`) primitives where applicable.
- Export both the component and its TypeScript props type (the one exception is
  `Accordion`, whose four parts use Radix's inline `React.ComponentProps<...>`
  and export no named props alias — see the Accordion section below).
- Radix-backed atoms set `data-slot` attributes for CSS/test targeting; custom
  atoms generally do not (exceptions noted per-atom).

```
+----------------------------------------------------------------------+
|                          UI Primitives (atoms)                        |
|                                                                      |
|  Layout / scroll        Node-canvas                Overlays          |
|  +-------------------+   +-------------------------+ +-------------+  |
|  | Scrollable        |   | NodeResizerWith         | | Modal       |  |
|  | ButtonContainer   |   |  MoreControls           | | (Dialog)    |  |
|  | (useAutoScroll)   |   | ConfigurableConnection  | | Tooltip     |  |
|  +-------------------+   +-------------------------+ +-------------+  |
|                                                                      |
|  Disclosure             Resilience                                   |
|  +-------------------+   +-------------------+                        |
|  | Accordion         |   | ErrorBoundary     |                        |
|  | (Radix)           |   | (class component) |                        |
|  +-------------------+   +-------------------+                        |
|                                                                      |
|  Documented elsewhere: NodeStatusIndicator, ConfigurableEdge,        |
|  Button, Input, Checkbox (see Input Components / their own docs)     |
+----------------------------------------------------------------------+
```

---

## ScrollableButtonContainer

**File:**
`src/components/atoms/ScrollableButtonContainer/ScrollableButtonContainer.tsx` ›
`ScrollableButtonContainer`

A scrollable wrapper that hides the native scrollbar and optionally overlays
directional arrow buttons for scrolling overflowing content. Supports both
horizontal and vertical layouts. All scroll-state detection and the press-and-
hold auto-scroll animation are delegated to the `useAutoScroll` hook
(`src/hooks/useAutoScroll.ts` › `useAutoScroll`).

### Props (ScrollableButtonContainerProps)

| Prop                    | Type                         | Default        | Description                                                                                            |
| ----------------------- | ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `children`              | `React.ReactNode`            | —              | Scrollable content                                                                                     |
| `orientation`           | `'horizontal' \| 'vertical'` | `'horizontal'` | Scroll axis                                                                                            |
| `className`             | `string`                     | —              | Classes for the outer wrapper `<div>` (`relative w-full h-full`)                                       |
| `scrollAreaClassName`   | `string`                     | —              | Classes for the inner scroll-area `<div>`                                                              |
| `showArrows`            | `boolean`                    | `true`         | Whether to render the navigation arrow buttons                                                         |
| `disabled`              | `boolean`                    | `false`        | Disables scroll detection and auto-scroll, and hides arrows                                            |
| `ariaLabel`             | `string`                     | —              | `aria-label` applied to the inner scroll area                                                          |
| `scrollSpeedPxPerFrame` | `number`                     | `14`           | Pixels scrolled per animation frame while a button is held                                             |
| `reserveArrowSpace`     | `boolean`                    | —              | Present in the props type but **not currently consumed** by the component (see Notes)                  |
| `observeChildren`       | `boolean`                    | `true`         | Forwarded to `useAutoScroll`; watches child DOM mutations via `MutationObserver` to recompute overflow |

The component is wrapped in `forwardRef<HTMLDivElement, ...>`. Its props type is
exported as `ScrollableButtonContainerProps`.

### Architecture

```
Horizontal (default):
+--[ScrollableButtonContainer wrapper: relative w-full h-full]----------+
|                                                                       |
|  [< Button]      +--[inner scroll div: no-scrollbar overflow-x-scroll]--+   [> Button]
|  (z-10, abs,     |  child  child  child  child  ...                     |   (z-10, abs,
|   left-0,        +------------------------------------------------------+    right-0,
|   centered Y)        (rendered only when canScrollStart / canScrollEnd)       centered Y)

Vertical:
+--[wrapper]----------------+
|        [^ Button]         |  (abs, top-0, centered X)
|  +--[scroll div]-------+  |
|  |  child              |  |  overflow-y-scroll overflow-x-hidden
|  |  child              |  |  flex flex-col items-start gap-2
|  +---------------------+  |
|        [v Button]         |  (abs, bottom-0, centered X)
+---------------------------+
```

The arrow buttons are the project's `Button` atom (see
[Input Components](inputComponentsDoc.md#button-atom)), styled
`h-[44px] border-secondary-dark-gray bg-primary-black absolute z-10`. The inner
scroll area hides the native scrollbar with the `no-scrollbar` utility (defined
in `src/index.css`) and applies orientation-specific defaults:

- Horizontal:
  `overflow-x-scroll overflow-y-hidden flex items-center gap-2 whitespace-nowrap`
- Vertical:
  `overflow-y-scroll overflow-x-hidden flex flex-col items-start gap-2`

The arrow icons are lucide-react chevrons: `ChevronLeft` / `ChevronRight` for
horizontal, `ChevronUp` / `ChevronDown` for vertical.

### Scroll Behaviour (via `useAutoScroll`)

`useAutoScroll` (`src/hooks/useAutoScroll.ts` › `useAutoScroll`) returns
`{ listRef, canScrollStart, canScrollEnd, startAutoScroll, stopAutoScroll }`:

1. **Overflow detection** — `updateScrollState()` reads the axis-appropriate
   `scrollTop/scrollLeft`, `clientHeight/clientWidth`, and
   `scrollHeight/scrollWidth` to set `canScrollStart` (`pos > 0`) and
   `canScrollEnd` (`pos + size < full - 1`). It is re-run on `scroll` events, a
   `ResizeObserver` on the element, `window` `resize`, the next animation frame
   after a children change, and (when `observeChildren`) a `MutationObserver`
   watching `{ childList: true, subtree: true }`.
2. **Arrow visibility** — the container computes
   `showStart = showArrows && canScrollStart && !disabled` and the analogous
   `showEnd`; each arrow `Button` is rendered only when its flag is true.
3. **Continuous scrolling** — `onMouseDown` / `onTouchStart` on an arrow calls
   `startAutoScroll('start' | 'end')`, which drives a `requestAnimationFrame`
   loop (`tickScroll`) that advances the scroll position by
   `scrollSpeedPxPerFrame` each frame and stops when the edge is reached.
   `onMouseUp`, `onMouseLeave`, and `onTouchEnd` call `stopAutoScroll()`; the
   hook also installs `window` `pointerup` / `touchend` listeners as a safety
   net so a release outside the button still halts scrolling.
4. **Ref forwarding** — `useImperativeHandle(ref, () => listRef.current!)`
   exposes the inner scrollable `<div>` so parents can imperatively read/set
   scroll position.

### Usage

```tsx
import { ScrollableButtonContainer } from '@/components/atoms';

<div className='w-[400px]'>
  <ScrollableButtonContainer orientation='horizontal'>
    {items.map((item) => (
      <div
        key={item.id}
        className='px-3 py-2 rounded-md border border-secondary-dark-gray bg-primary-black'
      >
        {item.label}
      </div>
    ))}
  </ScrollableButtonContainer>
</div>;
```

See `ScrollableButtonContainer.stories.tsx` for `Playground`,
`HorizontalAdjustableWidth`, `Vertical`, and `Disabled` stories.

### Notes

- `reserveArrowSpace` exists on `ScrollableButtonContainerProps` but is **not
  destructured or used** in the current implementation, so passing it has no
  visual effect. Arrow buttons are absolutely positioned **over** the scroll
  content (`z-10`); items near the edges can be partially obscured. There is no
  built-in padding offset for the arrows.

---

## NodeResizerWithMoreControls

**File:**
`src/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls.tsx`
› `NodeResizerWithMoreControls`

An enhanced node resizer that renders ReactFlow `NodeResizeControl` elements
with fine-grained control over which edge "line" controls and which corner
"handle" controls appear, and on which axis resizing is constrained. It does not
wrap `NodeResizer`; instead it maps over the requested positions and renders one
`NodeResizeControl` per position.

### Props (NodeResizerWithMoreControlsProps)

Extends `NodeResizerProps` from `@xyflow/react` and adds three fields:

| Prop              | Type                     | Default             | Description                                                       |
| ----------------- | ------------------------ | ------------------- | ----------------------------------------------------------------- |
| `linePosition`    | `ControlLinePosition[]`  | `['left', 'right']` | Edges that show line-style (`ResizeControlVariant.Line`) controls |
| `handlePosition`  | `ControlPosition[]`      | `[]`                | Corners/edges that show default handle-style controls             |
| `resizeDirection` | `ResizeControlDirection` | `'horizontal'`      | Constrains resizing to a single axis                              |

`ResizeControlDirection` and `ResizeControlVariant` are imported from
`@xyflow/system`; `ControlLinePosition`, `ControlPosition`, and
`NodeResizerProps` from `@xyflow/react`.

Inherited from `NodeResizerProps` (destructured with these defaults):

| Prop                                         | Type      | Default            |
| -------------------------------------------- | --------- | ------------------ |
| `nodeId`                                     | `string`  | —                  |
| `isVisible`                                  | `boolean` | `true`             |
| `minWidth` / `minHeight`                     | `number`  | `10`               |
| `maxWidth` / `maxHeight`                     | `number`  | `Number.MAX_VALUE` |
| `keepAspectRatio`                            | `boolean` | `false`            |
| `autoScale`                                  | `boolean` | `true`             |
| `color`                                      | `string`  | —                  |
| `handleClassName` / `handleStyle`            | —         | —                  |
| `lineClassName` / `lineStyle`                | —         | —                  |
| `shouldResize`                               | callback  | —                  |
| `onResizeStart` / `onResize` / `onResizeEnd` | callbacks | —                  |

When `isVisible` is `false`, the component returns `null`.

### Control Types

```
Line controls (edges):          Handle controls (corners/edges):

  +--------[top]--------+       [TL]------------------[TR]
  |                     |       |                        |
 [left]             [right]     |                        |
  |                     |       |                        |
  +------[bottom]-------+       [BL]------------------[BR]
```

- **Line controls** (`linePosition`) render `NodeResizeControl` with
  `variant={ResizeControlVariant.Line}` and the class
  `cn('!border-none', position === 'left' || position === 'right' ? '!w-4' : '!h-4', lineClassName)`
  — `!border-none` hides the default ReactFlow border and `!w-4` / `!h-4`
  provides a comfortable invisible hit area along the edge.
- **Handle controls** (`handlePosition`) render `NodeResizeControl` with the
  default (visible grip) variant and `className={handleClassName}`.

Both control sets share the same `nodeId`, `color`, min/max width/height,
`keepAspectRatio`, `autoScale`, `shouldResize`, the three resize callbacks, and
`resizeDirection`.

### Usage

```tsx
// Inside a custom node component (rendered only when inside ReactFlow)
<NodeResizerWithMoreControls
  linePosition={['left', 'right']}
  handlePosition={[]}
  resizeDirection='horizontal'
  minWidth={200}
  maxWidth={600}
/>
```

### Notes

- Line hit areas rely on `!w-4` / `!h-4` (`!important`) to override ReactFlow's
  defaults. This works but is sensitive to ReactFlow changing its internal class
  specificity.

---

## ConfigurableConnection

**File:**
`src/components/atoms/ConfigurableConnection/ConfigurableConnection.tsx` ›
`ConfigurableConnection`

The custom connection-line component ReactFlow renders while the user drags from
a handle to create a new edge. It colours the in-progress bezier line to match
the **source handle's** colour. (This atom is imported directly by `FullGraph`
and is **not** re-exported from `atoms/index.ts`.)

### Props (ConfigurableConnectionProps)

The props type is `{} & ConnectionLineComponentProps` (from `@xyflow/react`).
ReactFlow supplies the props; consumers only pass the component itself as
`connectionLineComponent`. The component destructures:

| Prop              | Type       | Description                                    |
| ----------------- | ---------- | ---------------------------------------------- |
| `fromX` / `fromY` | `number`   | Source coordinates                             |
| `toX` / `toY`     | `number`   | Current cursor coordinates                     |
| `fromPosition`    | `Position` | Source handle position (top/bottom/left/right) |
| `toPosition`      | `Position` | Target handle position                         |

### Colour Resolution

```
  useConnection()  --->  fromHandle { nodeId, id }
        |                       |
        | nodeId                | id
        v                       v
  useNodesData(fromHandle.nodeId)
        |
        v
  getHandleFromNodeDataMatchingHandleId(fromHandle.id, nodeData.data)
        |
        v
  .value (the matched handle) -> .handleColor
        |
        v
  stroke colour   (fallback: '#A1A1A1')
```

1. `useConnection()` exposes the in-progress connection's `fromHandle`
   (`{ nodeId, id, ... }`).
2. `useNodesData(fromHandle?.nodeId || '')` fetches the source node's data.
3. Inside a `useMemo` keyed on `[fromHandle?.id, nodeData?.data]`,
   `getHandleFromNodeDataMatchingHandleId(fromHandle.id, nodeData.data)`
   (`src/utils/nodeStateManagement/handles/handleGetters.ts` ›
   `getHandleFromNodeDataMatchingHandleId`) locates the matching handle; the
   result's `.value?.handleColor` is read, falling back to `'#A1A1A1'`.
4. A `<BaseEdge>` is rendered along a `getBezierPath(...)` path with
   `style={{ stroke: handleColor || '#A1A1A1' }}`.

### Usage

```tsx
import { ConfigurableConnection } from '@/components/atoms/ConfigurableConnection';

<ReactFlow
  connectionLineComponent={ConfigurableConnection}
  nodes={nodes}
  edges={edges}
  // ...
/>;
```

### Styling

- Stroke width: `stroke-7!` (7px, `!important`) via the `className`.
- Selected highlight: `in-[g.selected]:brightness-150` brightens the line when
  its parent `<g>` carries the `.selected` class.
- The edge is rendered with `focusable={true}`.
- Fallback colour: `'#A1A1A1'` (medium grey) when the handle colour is
  unavailable.

> `ConfigurableConnection` is the **drag-preview** line. The colour-gradient
> line for **committed** edges is `ConfigurableEdge`, documented in
> [ConfigurableEdge](configurableEdgeDoc.md). Both share the
> `getHandleFromNodeDataMatchingHandleId` lookup and the
> `stroke-7! in-[g.selected]:brightness-150` styling.

---

## Accordion

**File:** `src/components/atoms/Accordion/Accordion.tsx` › `Accordion`

A four-part compound component wrapping Radix UI's `Accordion` (imported as
`Accordion as AccordionPrimitive` from the `radix-ui` package). It is the
library's expand/collapse disclosure primitive and supplies the dark-theme
styling, a rotating chevron, and the slide animations; consumers control
open/closed state through the standard Radix props.

### Exported Components

| Component          | Wraps                                                             | `data-slot`         | Notes                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Accordion`        | `AccordionPrimitive.Root`                                         | `accordion`         | Root; takes Radix `type` (`'single'` \| `'multiple'`), `collapsible`, `value` / `defaultValue`, `onValueChange`                                                       |
| `AccordionItem`    | `AccordionPrimitive.Item`                                         | `accordion-item`    | Adds `border-b border-secondary-dark-gray last:border-b-0`                                                                                                            |
| `AccordionTrigger` | `AccordionPrimitive.Trigger` (inside `AccordionPrimitive.Header`) | `accordion-trigger` | Renders a leading `ChevronDownIcon` that rotates 180° when open (`[&[data-state=open]>svg]:rotate-180`); themed with `bg-runner-section-header-bg text-primary-white` |
| `AccordionContent` | `AccordionPrimitive.Content`                                      | `accordion-content` | Animated via `data-[state=closed]:animate-accordion-up` / `data-[state=open]:animate-accordion-down`; wraps children in a `pt-0 pb-4` div                             |

All four are plain function components that spread their remaining props onto
the underlying Radix element, so any Radix Accordion prop is supported. The
props types are Radix's `React.ComponentProps<typeof AccordionPrimitive.*>` and
are not re-exported as named aliases.

### State Model

```
  User clicks AccordionTrigger
            |
            v
  +--[AccordionPrimitive.Root]--+   type: 'single' | 'multiple'
  |  value / defaultValue       |   collapsible (single mode only)
  +-----------------------------+
            |
   item value matches open set
            |
            v
  +--[AccordionContent]--+
  |  children rendered    |  (animate-accordion-down on open)
  +-----------------------+
```

### Usage

```tsx
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/atoms';

<Accordion type='single' collapsible defaultValue='item-1'>
  <AccordionItem value='item-1'>
    <AccordionTrigger>Section One</AccordionTrigger>
    <AccordionContent>
      <p className='px-4 text-secondary-light-gray'>Content for section one.</p>
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value='item-2'>
    <AccordionTrigger>Section Two</AccordionTrigger>
    <AccordionContent>
      <p className='px-4 text-secondary-light-gray'>Content for section two.</p>
    </AccordionContent>
  </AccordionItem>
</Accordion>;
```

The `Accordion.stories.tsx` file demonstrates `Single`, `Multiple`, and an
all-collapsed multiple variant. In the live app, the `ExecutionStepInspector`
molecule uses `Accordion type='multiple'` for its "Inputs" / "Outputs" sections
(`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`ExecutionStepInspector`).

### Notes

- The slide animation depends on the `accordion-up` / `accordion-down` keyframes
  (defined in global CSS). Without them the content toggles without a
  transition.
- `ConfigurableNode`'s own collapsible input panels are a bespoke implementation
  and do **not** use this `Accordion` atom.

---

## Modal

**File:** `src/components/atoms/Modal/Modal.tsx` › `Modal`

A compound dialog built on Radix UI's `Dialog` (imported as
`Dialog as DialogPrimitive` from `radix-ui`). It supplies the dark-theme
overlay, centred content panel with size variants, and structured
header/body/footer sub-parts. Every part sets a `data-slot` attribute.

### Exported Parts

| Export             | Wraps / Renders                                       | `data-slot`          |
| ------------------ | ----------------------------------------------------- | -------------------- |
| `Modal`            | `DialogPrimitive.Root`                                | `modal`              |
| `ModalTrigger`     | `DialogPrimitive.Trigger`                             | `modal-trigger`      |
| `ModalOverlay`     | `DialogPrimitive.Overlay`                             | `modal-overlay`      |
| `ModalContent`     | `Portal` + `ModalOverlay` + `DialogPrimitive.Content` | `modal-content`      |
| `ModalHeader`      | `<div>`                                               | `modal-header`       |
| `ModalTitle`       | `DialogPrimitive.Title`                               | `modal-title`        |
| `ModalDescription` | `DialogPrimitive.Description`                         | `modal-description`  |
| `ModalBody`        | `<div>` (`flex-1 overflow-y-auto px-5 py-4`)          | `modal-body`         |
| `ModalFooter`      | `<div>` (alignable)                                   | `modal-footer`       |
| `ModalClose`       | `DialogPrimitive.Close`                               | `modal-close`        |
| `ModalCloseButton` | `DialogPrimitive.Close` with an `X` icon              | `modal-close-button` |

Also exported: `modalContentVariants` (the CVA factory) and the prop types
`ModalContentProps`, `ModalHeaderProps`, `ModalBodyProps`, `ModalFooterProps`.

### Variants & Alignment

`ModalContent` uses `class-variance-authority` with a single `size` variant
(default `'md'`):

| `size` | Max width       |
| ------ | --------------- |
| `sm`   | `max-w-[360px]` |
| `md`   | `max-w-[480px]` |
| `lg`   | `max-w-[640px]` |

The content panel is fixed and centred
(`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`), capped at
`max-h-[85vh] w-[calc(100%-2rem)]`, and animates in/out with the
`data-[state=...]` fade + zoom classes. `ModalContent` portals itself and
renders its own `ModalOverlay`, so consumers do not place the overlay manually.

`ModalFooter` accepts `align?: 'left' | 'center' | 'right'` (default `'right'`)
mapped through `footerAlignMap` to
`justify-start | justify-center | justify-end`.

### Usage

```tsx
import {
  Modal,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalClose,
  ModalCloseButton,
} from '@/components/atoms';
import { Button } from '@/components/atoms';

<Modal>
  <ModalTrigger asChild>
    <Button>Open</Button>
  </ModalTrigger>
  <ModalContent size='md'>
    <ModalCloseButton />
    <ModalHeader>
      <ModalTitle>Confirm</ModalTitle>
      <ModalDescription>This action cannot be undone.</ModalDescription>
    </ModalHeader>
    <ModalBody>Body content…</ModalBody>
    <ModalFooter>
      <ModalClose asChild>
        <Button color='dark'>Cancel</Button>
      </ModalClose>
      <Button color='lightPriority'>Confirm</Button>
    </ModalFooter>
  </ModalContent>
</Modal>;
```

---

## Tooltip

**File:** `src/components/atoms/Tooltip/Tooltip.tsx` › `Tooltip`

A hover tooltip built on `@floating-ui/react`. It wraps its trigger in a
configurable element, positions a portalled floating panel with collision
handling (`flip` + `shift`), draws a `FloatingArrow`, and animates the panel
with `useTransitionStyles`. Open/close is driven by `onMouseEnter` /
`onMouseLeave`.

### Props (TooltipProps)

| Prop           | Type                                                            | Default    | Description                                                           |
| -------------- | --------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| `content`      | `ReactNode`                                                     | —          | Tooltip content (string or node)                                      |
| `children`     | `ReactNode`                                                     | —          | Trigger element(s)                                                    |
| `infoIcon`     | `boolean`                                                       | `false`    | Render a leading lucide `Info` icon next to the trigger               |
| `placement`    | `Placement` (`@floating-ui/react`)                              | `'bottom'` | Preferred placement                                                   |
| `maxWidth`     | `number`                                                        | `240`      | Max width of the tooltip panel, in px                                 |
| `className`    | `string`                                                        | —          | Classes for the trigger wrapper                                       |
| `style`        | `CSSProperties`                                                 | —          | Inline style for the trigger wrapper (e.g. absolute positioning)      |
| `as`           | `'span' \| 'div' \| ComponentType<HTMLAttributes<HTMLElement>>` | `'span'`   | Element/component used for the trigger wrapper                        |
| `triggerProps` | `HTMLAttributes<HTMLElement>`                                   | —          | Extra props forwarded to the trigger wrapper (`data-*`, `onClick`, …) |

### Behaviour

- Middleware: `offset(6)`, `flip()`, `shift({ padding: 8 })`, and
  `arrow({ element: arrowRef })`; `whileElementsMounted: autoUpdate`.
- The floating layer is rendered in a `FloatingPortal` with
  `pointerEvents: 'none'` and `zIndex: 50`.
- Transition:
  `useTransitionStyles(context, { duration: 120, initial: { opacity: 0, transform: 'translateY(-3px)' } })`.
- Panel styling:
  `rounded-md border-[1.25px] border-primary-white/60 bg-tooltip-bg px-3 py-2 text-[12px] text-primary-white shadow-2xl backdrop-blur-sm`.
- `FloatingArrow`: width `8`, height `4`, `fill='var(--color-tooltip-bg)'`,
  stroke `var(--color-secondary-dark-gray)`.

> This is the generic, hover-driven tooltip atom, and it calls `useFloating`
> directly. The runner's per-node error/warning tooltip is a **separate**
> internal `StatusTooltip` inside `NodeStatusIndicator` (a different
> style/timing tuned via its own `useFloatingTooltip` hook, which this generic
> `Tooltip` does **not** use) — see
> [NodeStatusIndicator](nodeStatusIndicatorDoc.md).

### Usage

```tsx
import { Tooltip } from '@/components/atoms';

<Tooltip content='Resets the graph' placement='top'>
  <span>Reset</span>
</Tooltip>

<Tooltip content='More info about this field' infoIcon>
  <span>Label</span>
</Tooltip>
```

---

## ErrorBoundary

**File:** `src/components/atoms/ErrorBoundary/ErrorBoundary.tsx` ›
`ErrorBoundary`

A React class component that catches rendering errors in its subtree and renders
a fallback UI instead of crashing the tree. As with all React error boundaries,
it only catches errors during rendering, in lifecycle methods, and in
constructors of the subtree — **not** errors in event handlers, async callbacks
(`setTimeout`, `requestAnimationFrame`), or SSR.

### Props (ErrorBoundaryProps)

| Prop       | Type                                                                                                     | Description                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `children` | `ReactNode`                                                                                              | Subtree to guard                                                              |
| `fallback` | `ReactNode \| ((props: { error: Error; errorInfo: ErrorInfo \| null; reset: () => void }) => ReactNode)` | Static node or render-prop fallback. If omitted, a built-in fallback is shown |
| `onError`  | `(error: Error, errorInfo: ErrorInfo) => void`                                                           | Called from `componentDidCatch` when an error is caught                       |
| `resetKey` | `string \| number`                                                                                       | Changing this value (while in an error state) auto-resets the boundary        |

### Behaviour

- `getDerivedStateFromError` flips `hasError` and stores the `error`;
  `componentDidCatch` stores `errorInfo` and invokes `onError`.
- `componentDidUpdate` calls `reset()` when `resetKey` changes and the boundary
  is currently in an error state — useful for recovering when upstream data
  changes.
- `reset` clears `hasError` / `error` / `errorInfo`. It is passed to the
  render-prop fallback so custom UIs can offer a "Try Again" button.
- The default fallback (`data-slot='error-boundary'`) shows an `AlertTriangle`
  icon, the error message, and a `RotateCcw` "Try Again" button wired to
  `reset`.

### Usage

```tsx
import { ErrorBoundary } from '@/components/atoms';

<ErrorBoundary
  fallback={({ error, reset }) => (
    <div>
      <p>Something went wrong: {error.message}</p>
      <button onClick={reset}>Try Again</button>
    </div>
  )}
  onError={(error) => console.error(error)}
>
  <MyComponent />
</ErrorBoundary>;
```

`FullGraph` wraps both the top-level editor and the inner graph content in
`ErrorBoundary` (`src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`), and `ConfigurableNodeReactFlowWrapper` wraps
each rendered node so a single faulty node cannot crash the whole canvas.

---

## Limitations and Notes

1. **`reserveArrowSpace` is inert.** It is part of
   `ScrollableButtonContainerProps` but is not consumed by the component, so it
   has no effect. Arrow buttons overlay the content (`z-10`) with no padding
   offset, and can obscure items near the edges.

2. **Accordion / Modal animations depend on global CSS keyframes.** The
   `accordion-up` / `accordion-down` and Modal fade/zoom classes require their
   keyframes/utilities to be present (global CSS / Tailwind config). Without
   them the components still function but toggle without transitions.

3. **`NodeResizerWithMoreControls` line hit area uses `!important`.** The `!w-4`
   / `!h-4` overrides are fragile against changes in ReactFlow's internal class
   specificity.

4. **`Tooltip` z-index.** The floating panel uses `zIndex: 50`; in deeply
   stacked layouts it can render behind higher-z elements.

5. **`ErrorBoundary` scope.** It cannot catch event-handler or async errors;
   those must be handled with `try/catch` or `onError`-style callbacks at the
   source.

6. **`ConfigurableConnection` and `Checkbox` are not in the barrel.** Import
   `ConfigurableConnection` from its folder path
   (`@/components/atoms/ConfigurableConnection` — its `index.ts` re-exports the
   component). `Checkbox`, however, has an **empty `Checkbox/index.ts`**, so it
   must be imported from the file directly:
   `@/components/atoms/Checkbox/Checkbox` (documented under Input Components).

---

## Relationships with Other Features

### -> [ConfigurableNode (resizer)](configurableNodeDoc.md)

`ConfigurableNode` embeds **NodeResizerWithMoreControls** inside each node and
renders it only when the node is mounted inside ReactFlow
(`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNode`), via a `nodeResizerProps` prop. Typical configuration is
`linePosition={['left','right']}` with `resizeDirection='horizontal'` so nodes
stretch horizontally only.

```
+--[ConfigurableNode]---------------------------+
|  isCurrentlyInsideReactFlow &&                |
|    <NodeResizerWithMoreControls {...props} /> |
|                                               |
|  Header / actions                             |
|  body: inputs, outputs, bespoke panels ...    |
+-----------------------------------------------+
```

### -> [FullGraph (connection line + error boundaries)](fullGraphDoc.md)

`FullGraph` passes **ConfigurableConnection** as ReactFlow's
`connectionLineComponent`, so a drag from any handle previews an in-progress
line coloured to match the source handle. `FullGraph` also wraps the editor and
the inner graph content in **ErrorBoundary**
(`src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`).

```
+--[FullGraph / ReactFlow]----------------------------------+
|   connectionLineComponent = ConfigurableConnection        |
|   [Node A] ---(drag preview, colour = handle.handleColor)-> cursor
|   wrapped in <ErrorBoundary> (editor + content)           |
+-----------------------------------------------------------+
```

### -> [FullGraph group breadcrumb (scroll)](fullGraphDoc.md)

`FullGraphNodeGroupSelector` uses a horizontal **ScrollableButtonContainer** for
the node-group breadcrumb trail so a deep group stack stays navigable
(`src/components/organisms/FullGraph/FullGraphNodeGroupSelector.tsx` ›
`FullGraphNodeGroupSelector`).

### -> [ExecutionStepInspector (accordion)](executionStepInspectorDoc.md)

The runner's **ExecutionStepInspector** composes the **Accordion** atom
(`type='multiple'`) to provide collapsible "Inputs" and "Outputs" sections
(`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`ExecutionStepInspector`).

### -> [Input Components (Button / Input / Checkbox)](inputComponentsDoc.md)

The arrow buttons in **ScrollableButtonContainer**, the trigger/footer buttons
in **Modal** usage, and form fields throughout reuse the `Button`, `Input`, and
`Checkbox` atoms documented in [Input Components](inputComponentsDoc.md). Those
atoms are intentionally not re-documented here to avoid drift.

### -> [NodeStatusIndicator & ConfigurableEdge (display atoms)](nodeStatusIndicatorDoc.md)

Two display atoms living in `src/components/atoms/` have their own dedicated
docs: **NodeStatusIndicator** (runner visual overlay — see
[NodeStatusIndicator](nodeStatusIndicatorDoc.md)) and **ConfigurableEdge** (the
committed-edge gradient renderer — see
[ConfigurableEdge](configurableEdgeDoc.md)).
