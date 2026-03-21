# ExecutionTimeline

## Overview

`ExecutionTimeline` is a molecule component that visualizes an `ExecutionRecord`
as a horizontal timeline of step blocks arranged on concurrency-level tracks. It
provides scrubbing, zoom/pan, step selection, and two time modes (execution vs
wall-clock). The component is designed for post-hoc replay of graph execution
inside the `NodeRunnerPanel`.

Key capabilities:

- Renders step blocks colored by status (`completed`, `errored`, `skipped`)
- Groups steps into horizontal tracks by `concurrencyLevel`
- Scrubber with drag, snap-to-step, and ruler click
- Zoom (buttons + Shift+wheel) and click-drag pan via `useTimelineZoomPan`
- Step click for inspector selection
- Time ruler with adaptive tick intervals
- Collapsible header with duration/step-count summary
- Execution vs Wall Clock time mode toggle (visible when pause data exists)

## Data Flow Diagram

```
ExecutionRecord
       |
       v
+-------------------------------+
| adjustedSteps (useMemo)       |
| - wallClock: raw steps        |
| - execution: subtract         |
|   pauseAdjustment from times  |
+-------------------------------+
       |
       v
+-------------------------------+
| stepsByLevel (useMemo)        |
| Map<concurrencyLevel,         |
|     ExecutionStepRecord[]>    |
+-------------------------------+
       |
       v
+-------------------------------+      +-----------------------------+
| sortedLevels                  |      | useTimelineZoomPan          |
| [0, 1, 2, ...]               |      | -> timeScale (px/ms)        |
+-------------------------------+      | -> scrollContainerRef       |
       |                               | -> fitToView, zoomBy        |
       v                               | -> handlePanStart           |
+-------------------------------+      +-----------------------------+
| TimelineTrack (per level)     |               |
| +---------------------------+ |               v
| | TimelineBlock (per step)  | |      contentWidth = totalDuration
| | left  = startTime * scale | |                    * timeScale
| | width = duration * scale  | |
| | color = status class      | |
| +---------------------------+ |
+-------------------------------+
       |
       v
+-------------------------------+      +-----------------------------+
| TimeRuler (bottom)            |      | useTimelineScrub            |
| - adaptive tick intervals     |      | -> scrubberPx               |
| - onMouseDown -> scrub drag   |      | -> isDraggingScrubber       |
+-------------------------------+      | -> nearestDragStepIndex     |
                                       | -> handleRulerScrubDown     |
       +------+                        | -> handleScrubberMouseDown  |
       v      v                        +-----------------------------+
  Scrubber  BlockTooltip                        |
  (full-height line +                           v
   pentagon handle)                    onScrubTo(stepIndex) -> parent
```

## Props

| Prop                | Type                                        | Description                                                                                              |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `record`            | `ExecutionRecord \| null`                   | The execution record to visualize. Renders empty state when `null`.                                      |
| `currentStepIndex`  | `number`                                    | The replay scrubber position (controlled by parent). Determines which block has the blue ring highlight. |
| `onScrubTo`         | `(stepIndex: number) => void`               | Called when the user scrubs to a new step (drag, ruler click, or right-click a block).                   |
| `onStepClick`       | `(stepRecord: ExecutionStepRecord) => void` | Called when a step block is left-clicked (opens inspector).                                              |
| `selectedStepIndex` | `number \| null`                            | Index of the step currently selected in the inspector. Renders a white ring on that block.               |

## Track Layout

### Concurrency level tracks

Steps are grouped by their `concurrencyLevel` field into a
`Map<number, ExecutionStepRecord[]>`. Levels are sorted ascending and each
rendered as a `TimelineTrack` component.

Each track has:

- A **gutter label** (70px wide, sticky left) displaying "Level N"
- A **content area** sized to `contentWidth` pixels containing positioned blocks

Track height scales with the number of steps at that level:

- 1 step: `TRACK_HEIGHT` (32px)
- N steps: base height + (N-1) sub-rows with `SUB_ROW_GAP` (3px) between them

Steps within the same level are stacked vertically as sub-rows (not
overlapping).

### Step block sizing and coloring

Each `TimelineBlock` is absolutely positioned within its track:

| Property | Calculation                                                                   |
| -------- | ----------------------------------------------------------------------------- |
| `left`   | `step.startTime * timeScale`                                                  |
| `width`  | `max(step.duration * timeScale, MIN_BLOCK_WIDTH)` where `MIN_BLOCK_WIDTH = 6` |
| `top`    | `BLOCK_PADDING_Y + subRowIndex * (subRowHeight + SUB_ROW_GAP)`                |
| `height` | `usableHeight / rowCount`                                                     |

Status coloring (Tailwind classes):

| Status      | Block class           | Tooltip class               |
| ----------- | --------------------- | --------------------------- |
| `completed` | `bg-status-completed` | `text-status-completed`     |
| `errored`   | `bg-status-errored`   | `text-status-errored`       |
| `skipped`   | `bg-status-skipped`   | `text-secondary-light-gray` |

Visual states on blocks:

- **Selected** (`selectedStepIndex` match): white ring (`ring-1 ring-white`)
- **Snapped** (`currentStepIndex` match, not dragging): blue ring with glow
- **Nearest drag target** (during scrub drag): white/blue glow with brightness
  boost

Labels are shown inside blocks only when `width > 50px` and
`subRowHeight >= 18px`.

Hovering a block shows a `BlockTooltip` (floating-ui) with node type name,
status, duration, and step index.

## Scrubber

The scrubber is a full-height vertical line with a pentagon-shaped SVG handle at
the top. It indicates the current replay position.

```
       [Pentagon Handle]
            |
            | <-- vertical line (full height)
            |
  ----------+---------- ruler area
```

The scrubber position (`scrubberPx`) is either:

- The **drag position** (continuous pixel value during drag)
- The **snapped position** (`(step.startTime + step.duration/2) * timeScale` of
  the current step)

Interactions:

- **Left-click block**: fires `onStepClick` (inspector selection, does NOT move
  scrubber)
- **Right-click block**: fires `onScrubTo` for that step (moves scrubber)
- **Click ruler**: starts scrub drag from click position
- **Drag scrubber handle**: continuous drag with nearest-step snapping

### useTimelineScrub

Hook managing scrubber drag state. Located at
`src/components/molecules/ExecutionTimeline/useTimelineScrub.ts`.

**Options** (`UseTimelineScrubOptions`):

| Field                | Type                                 | Description                          |
| -------------------- | ------------------------------------ | ------------------------------------ |
| `steps`              | `ReadonlyArray<ExecutionStepRecord>` | Adjusted step records                |
| `timeScale`          | `number`                             | Current zoom scale (px/ms)           |
| `contentWidth`       | `number`                             | Total content width in px            |
| `currentStepIndex`   | `number`                             | Parent-controlled scrubber position  |
| `scrollContainerRef` | `RefObject<HTMLDivElement>`          | Scroll container for coordinate math |
| `gutterWidth`        | `number`                             | Gutter offset to subtract            |
| `onScrubTo`          | `(stepIndex: number) => void`        | Callback when scrub position changes |

**Returns** (`UseTimelineScrubReturn`):

| Field                     | Type                      | Description                              |
| ------------------------- | ------------------------- | ---------------------------------------- |
| `scrubberPx`              | `number`                  | Current pixel position (drag or snapped) |
| `isDraggingScrubber`      | `boolean`                 | Whether user is dragging                 |
| `nearestDragStepIndex`    | `number \| null`          | Step nearest to drag cursor              |
| `isSnapping`              | `boolean`                 | Whether snap transition is active        |
| `handleRulerScrubDown`    | `(e: MouseEvent) => void` | Ruler mousedown handler                  |
| `handleScrubberMouseDown` | `(e: MouseEvent) => void` | Handle mousedown handler                 |
| `onSnapTransitionEnd`     | `() => void`              | Callback for CSS transition end          |

**Nearest-step algorithm** (`findNearestStep`): Iterates all steps, computes
`|midpoint - cursorTime|`, returns the step index with the smallest distance.

**Snap behavior**: On drag release, `scrubDragPx` resets to `null`, causing the
scrubber to jump to the snapped position. A 150ms CSS `ease-out` transition
animates the snap. The `isSnapping` flag enables the transition temporarily
(cleared by `onTransitionEnd` or a 200ms timeout fallback).

## Zoom/Pan

### useTimelineZoomPan

Hook managing zoom level and click-drag panning. Located at
`src/components/molecules/ExecutionTimeline/useTimelineZoomPan.ts`.

**Options** (`UseTimelineZoomPanOptions`):

| Field                   | Type     | Description                                         |
| ----------------------- | -------- | --------------------------------------------------- |
| `adjustedTotalDuration` | `number` | Total time duration (ms) after time-mode adjustment |
| `timePadRightMs`        | `number` | Padding ratio beyond total duration (0.15 = 15%)    |
| `gutterWidth`           | `number` | Gutter width (70px) to exclude from calculations    |

**Returns** (`UseTimelineZoomPanReturn`):

| Field                | Type                        | Description                                                                        |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `timeScale`          | `number`                    | Current zoom level in px/ms (clamped to 0.5 - 10000)                               |
| `scrollContainerRef` | `RefObject<HTMLDivElement>` | Ref to attach to scrollable container                                              |
| `fitToView`          | `() => void`                | Zoom to fit all content in the viewport                                            |
| `zoomBy`             | `(factor: number) => void`  | Multiply scale by factor (centered on viewport)                                    |
| `handlePanStart`     | `(e: MouseEvent) => void`   | Mousedown handler for click-drag pan                                               |
| `didPanMoveRef`      | `RefObject<boolean>`        | True if the last pan gesture involved movement (used to suppress click-after-drag) |

**Zoom modes**:

| Mode        | Trigger                                           | Center point       |
| ----------- | ------------------------------------------------- | ------------------ |
| Button zoom | Zoom In / Zoom Out buttons                        | Viewport center    |
| Wheel zoom  | Shift + scroll wheel                              | Cursor position    |
| Fit to view | Maximize button or `adjustedTotalDuration` change | Resets scroll to 0 |

**Scroll correction**: Zoom operations use `useLayoutEffect` with a
`pendingScrollLeftRef` to adjust `scrollLeft` before paint, preventing visual
jumping.

**Pan**: Click-drag (left or middle button) scrolls both X and Y axes. A
`PAN_MOVE_THRESHOLD` (3px) distinguishes clicks from pans. The `didPanMoveRef`
is used by `ExecutionTimeline` to suppress `onStepClick` when the user was
panning, not clicking.

**Auto fit-to-view**: `fitToView` runs automatically via `useEffect` whenever
`adjustedTotalDuration` changes (e.g., new record loaded, time mode toggled).

## Auto-Scroll

### useAutoScroll

Generic hook for overflow-scroll state detection and RAF-based auto-scrolling.
Located at `src/hooks/useAutoScroll.ts`.

Note: This hook is a general-purpose utility. It is **not directly used** by
`ExecutionTimeline` itself (the timeline uses `useTimelineZoomPan` for its own
scrolling). It is referenced in the prompt context as a related hook used
elsewhere in the runner UI (e.g., `ScrollableButtonContainer`).

**Options** (`UseAutoScrollOptions`):

| Field                   | Type                         | Default        | Description                |
| ----------------------- | ---------------------------- | -------------- | -------------------------- |
| `orientation`           | `'horizontal' \| 'vertical'` | `'horizontal'` | Scroll axis                |
| `disabled`              | `boolean`                    | `false`        | Disable all scrolling      |
| `scrollSpeedPxPerFrame` | `number`                     | `14`           | Pixels per animation frame |
| `observeChildren`       | `boolean`                    | `true`         | Watch child DOM mutations  |

**Returns** (`UseAutoScrollReturn`):

| Field             | Type                        | Description                             |
| ----------------- | --------------------------- | --------------------------------------- |
| `listRef`         | `RefObject<HTMLDivElement>` | Ref for the scrollable container        |
| `canScrollStart`  | `boolean`                   | Content overflows at start (left/top)   |
| `canScrollEnd`    | `boolean`                   | Content overflows at end (right/bottom) |
| `startAutoScroll` | `(direction) => void`       | Begin continuous RAF scrolling          |
| `stopAutoScroll`  | `() => void`                | Stop scrolling                          |

**Detection**: Uses `scroll` events, `ResizeObserver`, `window.resize`, and
optionally `MutationObserver` on children to track overflow state.

**Scrolling**: `requestAnimationFrame`-driven loop that increments scroll
position each frame. Stops automatically when reaching the boundary or on
`pointerup`/`touchend`.

## Step Selection (click to inspect)

Left-clicking a step block calls `onStepClick(stepRecord)`. This is guarded by
`didPanMoveRef` from `useTimelineZoomPan` to prevent accidental selection after
a pan gesture.

The parent (`NodeRunnerPanel`) uses `onStepClick` to:

1. Set `selectedStepIndex` in the session's interaction state
2. Open the `ExecutionStepInspector` with the clicked step's data

The selected step gets a white ring highlight on the timeline. Selection and
scrubbing are independent: clicking a step does not move the scrubber, and
scrubbing does not change the selection.

## Limitations and Deprecated Patterns

- **No virtualization**: All tracks and blocks are rendered to the DOM. For very
  large executions (hundreds of steps), this could impact performance. The
  `StressTestLong` story tests ~30 steps across 8 levels.
- **Sub-row stacking is index-based, not time-based**: Steps within a
  concurrency level are stacked by array index, not by time overlap detection.
  This means non-overlapping steps at the same level still get separate
  sub-rows.
- **Time mode toggle only appears with pause data**: The Execution/Wall Clock
  toggle is hidden when `totalPauseDuration === 0` (i.e., performance mode
  runs). This is intentional, not a limitation.
- **Snap transition uses timeout fallback**: The 200ms `setTimeout` in
  `useTimelineScrub` clears `isSnapping` as a fallback in case `onTransitionEnd`
  doesn't fire (e.g., if the element is unmounted during transition).

## Relationships with Other Features

### -> [Execution Recording](../runner/executionRecordingDoc.md)

`ExecutionTimeline` consumes an `ExecutionRecord` produced by the execution
recorder (`src/utils/nodeRunner/executionRecorder.ts`). The record contains:

- `steps: ReadonlyArray<ExecutionStepRecord>` -- the primary data source for
  blocks
- `totalDuration` / `totalPauseDuration` -- used for time-mode calculation
- `status` -- not directly used by the timeline (handled by parent)

Each `ExecutionStepRecord` provides `startTime`, `endTime`, `duration`,
`concurrencyLevel`, `status`, `pauseAdjustment`, and `nodeTypeName` -- all
consumed directly by the timeline.

### -> [NodeRunnerPanel](nodeRunnerPanelDoc.md)

`ExecutionTimeline` is a child of the `NodeRunnerPanel` organism. The panel
provides:

- `record` from the active `RunSession`
- `currentStepIndex` from `RunSessionInteractionState`
- `onScrubTo` which calls `replayTo()` on the runner hook to reconstruct node
  visual states up to the target step
- `onStepClick` which updates `selectedStepIndex` and opens the inspector
- `selectedStepIndex` from `RunSessionInteractionState`

### -> [ExecutionStepInspector (via onStepClick)](executionStepInspectorDoc.md)

When a step block is clicked, `onStepClick` passes the full
`ExecutionStepRecord` to the parent, which opens `ExecutionStepInspector`
(`src/components/molecules/ExecutionStepInspector/`). The inspector displays:

- Input values (`inputValues` map with per-connection detail)
- Output values (`outputValues` map)
- Error details (if `status === 'errored'`)
- Timing and metadata

### -> [Runner Hook (onScrubTo -> replayTo)](../runner/runnerHookDoc.md)

When the scrubber moves to a new step index (via drag, ruler click, or
right-click), `onScrubTo` propagates to the `useNodeRunner` hook's `replayTo()`
function. This reconstructs `nodeVisualStates` up to the target step, allowing
the graph canvas to show which nodes have completed, errored, or are yet to run
at that point in the execution.
