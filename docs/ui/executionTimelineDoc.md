# ExecutionTimeline

## Overview

`ExecutionTimeline` is a molecule component that visualizes an `ExecutionRecord`
as a horizontal, zoomable timeline of step blocks. It provides scrubbing,
zoom/pan, step selection, autoplay/step navigation, two time modes (execution vs
wall-clock), and drill-down into loop iterations and switch branches. The
component is designed for post-hoc replay of graph execution inside the
`NodeRunnerPanel`.

Rather than a flat set of concurrency tracks, the timeline arranges the
recording into ordered **segments** (`flat`, `loop`, `switch`) via
`buildSegments`. Flat runs of steps are grouped by `concurrencyLevel` into
sub-rows; loops and switches collapse into a single summary block that the user
can expand to reveal the steps that ran inside.

Source files (all under `src/components/molecules/ExecutionTimeline/`):

- `ExecutionTimeline.tsx` — top-level component, header toolbar, layout
- `useTimelineZoomPan.ts` — auto-fit/manual zoom + click-drag pan
- `useTimelineScrub.ts` — scrubber drag, nearest-step snapping
- `useTimelineAutoplay.ts` — autoplay interval, prev/next/start/end, auto-scroll
- `SupportingSubcomponents/types.ts` — constants, segment types, `buildSegments`
- `SupportingSubcomponents/FlatSection.tsx`, `TimelineTrack.tsx`,
  `TimelineBlock.tsx` — flat step rendering
- `SupportingSubcomponents/LoopComponents.tsx` — loop track + iteration detail
- `SupportingSubcomponents/SwitchComponents.tsx` — switch track + branch detail
- `SupportingSubcomponents/TimelineGrid.tsx` — `TimeRuler` + `TimelineGrid`
- `SupportingSubcomponents/ScrubberHead.tsx` — triangle scrubber head + time
  label
- `SupportingSubcomponents/BlockTooltipContent.tsx` — block hover tooltip body

Key capabilities:

- Renders step blocks colored by status (`completed`, `errored`, `skipped`)
- Partitions steps into ordered `flat` / `loop` / `switch` segments
  (`buildSegments`)
- Groups flat steps into stacked sub-rows by `concurrencyLevel`
- Collapsible **loop** blocks per iteration with expandable iteration detail
  (recursive for nested loops/switches)
- Collapsible **switch** blocks with expandable taken-branch detail
- Scrubber with drag, nearest-step snapping, and ruler click
- Zoom (buttons + Shift+wheel) with auto-fit and click-drag pan
  (`useTimelineZoomPan`)
- Autoplay and `|< < ▶/■ > >|` step navigation with adjustable interval
  (`useTimelineAutoplay`)
- Optional auto-scroll that follows the active step (timeline + canvas)
- Time ruler and vertical grid with adaptive tick intervals
- Collapsible header with duration / step-count / JIT-warmup summary
- Execution vs Wall Clock time-mode toggle (visible only when pause data exists)
- Left-click a block to inspect; right-click to scrub to it
- UI preferences (time mode, collapse, selected iterations, autoplay interval,
  auto-scroll) live in `RecordingViewStateContext`, so they persist with a saved
  recording

## Data Flow Diagram

```
ExecutionRecord (record)            RecordingViewStateContext
       |                            (timeMode, autoScroll, timelineCollapsed,
       v                             selectedIterations, autoplayIntervalSec)
+-------------------------------+              |
| adjustedSteps (useMemo)       |<-------------+
| - wallClock: raw steps        |   timeMode === 'execution' subtracts
| - execution: subtract         |   step.pauseAdjustment from start/end
|   pauseAdjustment from times  |
+-------------------------------+
       |
       v
+-------------------------------+      adjustedTotalDuration =
| segments = buildSegments(     |        totalDuration - totalPauseDuration
|   adjustedSteps,              |        (execution)  |  totalDuration (wallClock)
|   record.loopRecords,         |
|   record.switchRecords,       |      totalDuration  = adjustedTotalDuration
|   timeMode === 'execution')   |                       * (1 + TIME_PAD_RIGHT_MS)
| -> TimelineSegment[]          |      contentWidth   = totalDuration * timeScale
|    (flat | loop | switch)     |
+-------------------------------+
       |
       +----------------------------+----------------------------+
       v                            v                            v
+----------------+        +-------------------+        +--------------------+
| FlatSection    |        | LoopSection       |        | SwitchSection      |
| groupByLevel   |        | LoopTrack +        |       | SwitchTrack +      |
|  -> TimelineTrack       |  IterationDetail  |        |  SwitchDetail      |
|     -> TimelineBlock    |  (recursive       |        |  (recursive        |
| left=start*scale|       |   buildSegments)  |        |   buildSegments)   |
| width=dur*scale |       +-------------------+        +--------------------+
| color=status    |
+----------------+

Hooks driving the surface:
+---------------------------+   +---------------------------+   +-----------------------+
| useTimelineZoomPan        |   | useTimelineScrub          |   | useTimelineAutoplay   |
| -> timeScale (px/ms)      |   | -> scrubberPx             |   | -> isAutoplaying      |
| -> scrollContainerRef     |   | -> isDraggingScrubber     |   | -> canGoPrev/canGoNext|
| -> fitToView, zoomBy      |   | -> nearestDragStepIndex   |   | -> goToPrev/Next/     |
| -> handlePanStart         |   | -> isSnapping             |   |    Start/End          |
| -> didPanMoveRef          |   | -> handleRulerScrubDown   |   | -> toggleAutoplay     |
+---------------------------+   | -> handleScrubberMouseDown|   +-----------------------+
                                | -> onSnapTransitionEnd    |             |
+-------------------------------+---------------------------+             v
| TimeRuler + ScrubberHead (sticky top) + TimelineGrid       |   onStepClick(step) /
| full-height scrubber line overlay                          |   onNavigateToNode(nodeId)
+-------------------------------+---------------------------+   -> parent (NodeRunnerPanel)
                                |
                                v
                       onScrubTo(stepIndex) -> parent (replayTo)
```

## Props

`ExecutionTimelineProps` (defined in
`src/components/molecules/ExecutionTimeline/ExecutionTimeline.tsx` ›
`ExecutionTimelineProps`):

| Prop                | Type                                        | Description                                                                                              |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `record`            | `ExecutionRecord \| null`                   | The execution record to visualize. Renders the empty state when `null`.                                  |
| `currentStepIndex`  | `number`                                    | The replay scrubber position (controlled by parent). Determines which block has the blue ring highlight. |
| `onScrubTo`         | `(stepIndex: number) => void`               | Called when the user scrubs to a new step (drag, ruler mousedown, or right-click a block).               |
| `onStepClick`       | `(stepRecord: ExecutionStepRecord) => void` | Called when a step block is left-clicked, and by step navigation (opens inspector / selects the step).   |
| `selectedStepIndex` | `number \| null`                            | Index of the step currently selected in the inspector. Renders a white ring on that block.               |
| `onNavigateToNode`  | `(nodeId: string) => void` _(optional)_     | Called during prev/next navigation and live auto-scroll to center the canvas on the step's node.         |

Note: `ExecutionTimeline` itself takes no `timeMode`, `autoScroll`, or collapse
props — those preferences are read from and written to
`RecordingViewStateContext` (see below). The component must therefore be
rendered inside a `RecordingViewStateProvider`.

## View State (RecordingViewStateContext)

`ExecutionTimeline` reads several pieces of UI state from
`useRecordingViewState()`
(`src/components/organisms/FullGraph/RecordingViewStateContext.ts` ›
`useRecordingViewState`) rather than holding them locally:

| Field / setter                                   | Type                         | Used for                                                                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `autoScroll` / `setAutoScroll`                   | `boolean`                    | Auto-scroll toggle; follows the active step on the timeline + canvas.                                                                                                                                                         |
| `timeMode` / `setTimeMode`                       | `'execution' \| 'wallClock'` | Time-mode toggle (default `'execution'`).                                                                                                                                                                                     |
| `timelineCollapsed` / `setTimelineCollapsed`     | `boolean`                    | Accordion collapse of the timeline body.                                                                                                                                                                                      |
| `selectedIterations` / `setSelectedIterations`   | `Map<string, number>`        | Which loop iteration is expanded per `loopStructureId`.                                                                                                                                                                       |
| `autoplayIntervalSec` / `setAutoplayIntervalSec` | `number`                     | Seconds between steps during autoplay (default `2`). The setter stores the raw value; the header `SliderNumberInput` enforces the lower bound (`Math.max(0.5, v)` onChange) and the upper bound only via its `max={30}` prop. |

These fields are serialized into / restored from `RecordingViewState`
(`getViewState` / `restoreViewState`), so a saved recording reopens with the
same time mode, collapse state, expanded iterations, and autoplay interval.
`selectedIterations` is persisted as a plain object (`Record<string, number>`)
and rehydrated into a `Map`.

`expandedSwitches` (a `Set<string>` of `switchStructureId`) is local component
state in `src/components/molecules/ExecutionTimeline/ExecutionTimeline.tsx` ›
`ExecutionTimeline` and is **not** persisted.

## Segments (buildSegments)

`buildSegments(steps, loopRecords, switchRecords, adjustForPause)`
(`src/components/molecules/ExecutionTimeline/SupportingSubcomponents/types.ts` ›
`buildSegments`) partitions the adjusted step array into an ordered
`TimelineSegment[]`:

```ts
type FlatSegment = { kind: 'flat'; steps: ExecutionStepRecord[] };

type LoopSegment = {
  kind: 'loop';
  loopStructureId: string;
  loopRecord: LoopRecord;
  adjustedIterations: AdjustedLoopIterationRecord[];
  iterations: LoopIterationDisplay[];
};

type SwitchSegment = {
  kind: 'switch';
  switchStructureId: string;
  switchRecord: SwitchRecord;
  branchTaken: boolean;
  adjustedStartTime: number;
  adjustedEndTime: number;
  adjustedDuration: number;
  steps: ExecutionStepRecord[];
};

type TimelineSegment = FlatSegment | LoopSegment | SwitchSegment;
```

Routing rules (one pass over `steps`, flushing a running `currentFlat` buffer):

- **Switch steps** (`switchStructureId` set and present in `switchRecords`) are
  consumed into a `SwitchSegment` and removed from the flat stream.
- **Loop body steps** (`loopStructureId` **and** `loopIteration` both set) are
  consumed into a `LoopSegment`. Structural loop steps (Loop Start/Stop/End,
  which have `loopStructureId` but no `loopIteration`) render as ordinary flat
  blocks **if** the loop is owned at this level; structural steps for
  deeper-nested loops not in `loopRecords` are skipped.
- Everything else accumulates into a `FlatSegment`.
- After the main pass, any `loopRecords` not yet encountered (nested loops whose
  body steps live only in `LoopIterationRecord.stepRecords`) are inserted by
  start time, splitting a surrounding flat segment if necessary.

`buildLoopSegment` derives each iteration's bounds from its constituent steps
(min start / max end, pause-adjusted in execution mode) so iteration blocks line
up with the step blocks inside them. It also strips `loopStructureId` /
`loopIteration` from each iteration's steps and sorts them with `compareByPhase`
(phase order from `PHASE_ORDER`, then `startTime`) so the recursive
`buildSegments` inside an iteration treats them as flat.

`buildSwitchSegment` sorts the switch's `stepRecords` by start time, applies
pause adjustment, and clears `switchStructureId` for recursive rendering.

## Track Layout

### Flat sections (concurrency sub-rows)

`FlatSection` groups its steps by `concurrencyLevel` via `groupByLevel` into a
`Map<number, ExecutionStepRecord[]>`, sorts the levels ascending, and renders
one `TimelineTrack` per level.

Each `TimelineTrack` stacks its steps into vertical sub-rows. With `rowCount`
steps at a level:

- `rowCount === 1`: `trackHeight = TRACK_HEIGHT` (28px)
- `rowCount > 1`:
  `trackHeight = TRACK_HEIGHT + (rowCount - 1) * (TRACK_HEIGHT - BLOCK_PADDING_Y * 2) + totalGap`
  where `totalGap = (rowCount - 1) * SUB_ROW_GAP`

`subRowHeight = (trackHeight - BLOCK_PADDING_Y*2 - totalGap) / rowCount`, and
the i-th block's `top = BLOCK_PADDING_Y + i * (subRowHeight + SUB_ROW_GAP)`.
Every track has a `marginBottom` of `SUB_ROW_GAP`.

There is **no left gutter** — `GUTTER_WIDTH = 0` and tracks span the full
`contentWidth`. (Loop/switch detail panels indent visually with `ml-4`, not a
gutter.)

### Step block sizing and coloring (TimelineBlock)

Each `TimelineBlock` is absolutely positioned:

| Property | Calculation                                                                   |
| -------- | ----------------------------------------------------------------------------- |
| `left`   | `(step.startTime - timeOffset) * timeScale` (`timeOffset` defaults to 0)      |
| `width`  | `max(step.duration * timeScale, MIN_BLOCK_WIDTH)` where `MIN_BLOCK_WIDTH = 6` |
| `top`    | `subRowTop` (from `TimelineTrack`)                                            |
| `height` | `subRowHeight` (from `TimelineTrack`)                                         |

Status coloring (`statusBlockClass` / `statusTooltipClass` / `statusLabel` in
`src/components/molecules/ExecutionTimeline/SupportingSubcomponents/types.ts` ›
`statusBlockClass`):

| Status      | Block class               | Tooltip text class          | Tooltip label |
| ----------- | ------------------------- | --------------------------- | ------------- |
| `completed` | `bg-runner-bar-completed` | `text-status-completed`     | `Done`        |
| `errored`   | `bg-runner-bar-errored`   | `text-status-errored`       | `Error`       |
| `skipped`   | `bg-status-skipped`       | `text-secondary-light-gray` | `Skipped`     |

Visual states on a block (via `cn`):

- **Selected** (`selectedStepIndex` match): `ring-1 ring-white`.
- **Snapped** (`currentStepIndex` match, not selected, not nearest-drag): blue
  ring with glow (`ring-2 ring-primary-blue` + shadow).
- **Nearest drag target** (during scrub drag): white/blue glow with
  `brightness-125`.

Labels (`step.nodeTypeName`) show inside a block only when
`width > LABEL_MIN_WIDTH` (50px) **and** `subRowHeight >= LABEL_MIN_HEIGHT`
(18px).

Each block carries a `data-step-index={step.stepIndex}` attribute (used by
auto-scroll to locate the element) and uses a `Tooltip` (`as='div'`,
`placement='top'`) whose body is `BlockTooltipContent`. The tooltip shows the
node type name, status label, duration (`formatDuration` → `< 0.1ms` when
`estimatedTiming`, else `N.NNms`), step index, and — when present — loop
iteration (`Iter N`) and switch branch (`True Branch` / `False Branch` from
`switchPhase`).

### Loop sections (LoopComponents.tsx)

A `LoopSection` renders:

1. A `LoopTrack` row of iteration blocks. Each iteration block spans
   `adjustedIterations[idx].adjustedStartTime/Duration`, is colored
   `bg-[#8c52d1]/60` (purple), and is labeled `Iter N` (with a `Repeat` icon)
   when wide enough or just `N` otherwise. Selecting it toggles that loop's
   entry in `selectedIterations`. The block shows a white ring when it contains
   the currently selected step, and a red border on the final iteration when the
   loop hit its max-iteration guard (`conditionValue === true` on the last
   iteration).
2. When an iteration is selected, an expandable **IterationDetail** panel
   (purple header with a `Repeat` icon, iteration number, step count, and a
   continues/exits indicator from `conditionValue`). `IterationDetail`
   recursively calls `buildSegments` on the iteration's steps using its
   `nestedLoopRecords` / `nestedSwitchRecords`, so nested loops drill in
   arbitrarily deep. Note, however, that `IterationDetail` only renders flat and
   loop segments — it `return`s `null` for any nested **switch** segment, so a
   switch nested inside a loop iteration is produced by `buildSegments` but not
   displayed.

The tooltip on an iteration block (`LoopIterationTooltipContent`) shows
`Loop Iteration N`, a continues / exits / `max exceeded` indicator, the
iteration duration, and step count.

### Switch sections (SwitchComponents.tsx)

A `SwitchSection` renders:

1. A `SwitchTrack` block spanning the switch's adjusted bounds, colored
   `bg-[#d18c52]/60` (orange) and labeled `True Branch` / `False Branch` (with a
   `GitBranch` icon) or `T` / `F` when narrow. Clicking it toggles the switch's
   id in the local `expandedSwitches` set. A white ring appears when it contains
   the selected step.
2. When expanded, a **SwitchDetail** panel (orange header with branch label,
   step count, and a condition true/false indicator). `SwitchDetail` recursively
   calls `buildSegments` on the branch's steps with
   `switchRecord.nestedLoopRecords` / `nestedSwitchRecords`, so a nested loop
   drills in. Like `IterationDetail`, it renders only flat and loop segments and
   `return`s `null` for a nested **switch** segment, so a switch nested inside a
   switch branch is produced but not displayed.

Only the taken branch is recorded, so only its steps appear.
`SwitchTooltipContent` shows `Switch`, the branch indicator, duration, and step
count.

## Ruler and Grid (TimelineGrid.tsx)

`TimeRuler` (height `RULER_HEIGHT = 32`) renders tick labels across the content
width; `TimelineGrid` renders matching vertical grid lines behind the tracks.
Both compute `roughInterval = MIN_LABEL_GAP_PX / timeScale`
(`MIN_LABEL_GAP_PX = 48`) and round it to a "nice" value via `niceTickInterval`
(1/2/5/10 × power of ten). Tick labels use `formatTime` (`µs` below 1ms, `ms`
below 1s, `s` otherwise).

The ruler is wrapped in a `sticky top-0 z-20` container together with the
scrubber head, so both stay visible while scrolling vertically. The ruler's
`onMouseDown` is wired to `handleRulerScrubDown`.

## Scrubber (useTimelineScrub.ts)

The scrubber is a full-height vertical line (`z-[15]`) plus a triangle
`ScrubberHead` anchored in the sticky ruler. The head shows the current scrub
time (`formatTime(scrubberTimeMs)`, where
`scrubberTimeMs = scrubberPx / timeScale`) and turns lighter blue while
dragging.

```
       [ time label ]
            v          <- triangle (border-t triangle, runner-scrubber-blue)
            |
            | <-- vertical line (full height, rgba(74,133,255,0.5/0.7))
            |
  ----------+---------- ruler area
```

`scrubberPx` is either the live drag position (`scrubDragPx`) or, when not
dragging, the **snapped** position of the current step:
`blockVisualCenterPx(step, timeScale) = left + width/2`, where `width` honors
`MIN_BLOCK_WIDTH` so tiny blocks still snap to their visual center.

### useTimelineScrub

Located at `src/components/molecules/ExecutionTimeline/useTimelineScrub.ts` ›
`useTimelineScrub`.

**Options** (`UseTimelineScrubOptions`):

| Field                | Type                                      | Description                          |
| -------------------- | ----------------------------------------- | ------------------------------------ |
| `steps`              | `ReadonlyArray<ExecutionStepRecord>`      | Adjusted (pause-corrected) steps     |
| `timeScale`          | `number`                                  | Current zoom scale (px/ms)           |
| `contentWidth`       | `number`                                  | Total content width in px            |
| `currentStepIndex`   | `number`                                  | Parent-controlled scrubber position  |
| `scrollContainerRef` | `React.RefObject<HTMLDivElement \| null>` | Scroll container for coordinate math |
| `gutterWidth`        | `number`                                  | Gutter offset to subtract (0 today)  |
| `onScrubTo`          | `(stepIndex: number) => void`             | Callback when scrub position changes |

**Returns** (`UseTimelineScrubReturn`):

| Field                     | Type                            | Description                              |
| ------------------------- | ------------------------------- | ---------------------------------------- |
| `scrubberPx`              | `number`                        | Current pixel position (drag or snapped) |
| `isDraggingScrubber`      | `boolean`                       | Whether the user is dragging             |
| `nearestDragStepIndex`    | `number \| null`                | Step nearest to the drag cursor          |
| `isSnapping`              | `boolean`                       | Whether a snap transition is active      |
| `startScrubDrag`          | `(clientX: number) => void`     | Begin a scrub drag from a clientX        |
| `handleRulerScrubDown`    | `(e: React.MouseEvent) => void` | Ruler mousedown handler                  |
| `handleScrubberMouseDown` | `(e: React.MouseEvent) => void` | Scrubber-handle mousedown handler        |
| `onSnapTransitionEnd`     | `() => void`                    | `onTransitionEnd` handler                |

**Nearest-step algorithm** (`findNearestStep`): converts the cursor's clientX to
a content-space pixel (`clientX - rect.left + scrollLeft - gutterWidth`, clamped
to `[0, contentWidth]`), then iterates all steps and returns the `stepIndex`
whose `blockVisualCenterPx` is closest. During a drag, `onScrubTo` fires when
the nearest step changes; on mouseup it fires once more for the final step.

**Snap behavior**: on release, `scrubDragPx` resets to `null`, so `scrubberPx`
jumps to the snapped center of the current step. A 150ms CSS `left ease-out`
transition (applied via the `isSnapping` flag in `ExecutionTimeline.tsx`)
animates the jump. `isSnapping` is also set when `currentStepIndex` changes
while not dragging, and is cleared by `onSnapTransitionEnd` or a 200ms
`setTimeout` fallback.

## Zoom/Pan (useTimelineZoomPan.ts)

Located at `src/components/molecules/ExecutionTimeline/useTimelineZoomPan.ts` ›
`useTimelineZoomPan`.

**Options** (`UseTimelineZoomPanOptions`):

| Field                   | Type     | Description                                                      |
| ----------------------- | -------- | ---------------------------------------------------------------- |
| `adjustedTotalDuration` | `number` | Total time duration (ms) after time-mode adjustment              |
| `timePadRightMs`        | `number` | Padding ratio beyond total duration (`TIME_PAD_RIGHT_MS` = 0.15) |
| `gutterWidth`           | `number` | Gutter width to exclude from calculations (`GUTTER_WIDTH` = 0)   |

**Returns** (`UseTimelineZoomPanReturn`):

| Field                | Type                                      | Description                                                               |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| `timeScale`          | `number`                                  | Current zoom level in px/ms (clamped `MIN_SCALE` 0.5 – `MAX_SCALE` 10000) |
| `scrollContainerRef` | `React.RefObject<HTMLDivElement \| null>` | Ref to attach to the scrollable container                                 |
| `fitToView`          | `() => void`                              | Re-enter auto-fit mode and reset scroll to 0                              |
| `zoomBy`             | `(factor: number) => void`                | Multiply scale by `factor` (centered on viewport center)                  |
| `handlePanStart`     | `(e: React.MouseEvent) => void`           | Mousedown handler for click-drag pan                                      |
| `didPanMoveRef`      | `React.RefObject<boolean>`                | True if the last pan gesture moved (used to suppress click-after-drag)    |

**Auto-fit vs manual scale**: the hook tracks the container width with a
`ResizeObserver` (re-attached when the conditionally-rendered scroll container
changes). When `isAutoFit` is `true`, `timeScale` is derived **synchronously**
via `useMemo` from
`availableWidth / (adjustedTotalDuration * (1 + timePadRightMs))` (clamped to
`[MIN_SCALE, MAX_SCALE]`) — no effect cascade, no second render. Any manual zoom
sets `isAutoFit = false` and uses `manualTimeScale`.

**Zoom modes**:

| Mode        | Trigger                                                                   | Center point       |
| ----------- | ------------------------------------------------------------------------- | ------------------ |
| Button zoom | Zoom In (`zoomBy(1.5)`) / Zoom Out (`zoomBy(1/1.5)`)                      | Viewport center    |
| Wheel zoom  | Shift + scroll wheel                                                      | Cursor position    |
| Fit to view | Maximize button (`fitToView`) / auto when `adjustedTotalDuration` changes | Resets scroll to 0 |

**Scroll correction**: button and wheel zoom set `pendingScrollLeftRef`, which a
`useLayoutEffect` applies to `scrollLeft` before paint so the focal point stays
under the cursor / viewport center. A separate `useLayoutEffect` keeps
`scrollLeft = 0` whenever the auto-fit scale changes.

**Wheel zoom** is attached as a non-passive `wheel` listener (so
`preventDefault` works) and re-attached if the scroll container element changes
(e.g. after a collapse/expand cycle). `WHEEL_ZOOM_SPEED = 0.003`; the factor is
`2 ** (-deltaY * WHEEL_ZOOM_SPEED)`.

**Pan**: click-drag with the left or middle button (`e.button === 0 || 1`)
scrolls both X and Y. A `PAN_MOVE_THRESHOLD` (3px) distinguishes a click from a
pan; once exceeded, `didPanMoveRef.current` is set, and `ExecutionTimeline` uses
it (via `guardedStepClick`) to suppress `onStepClick` after a pan. The flag is
reset on the next animation frame after the gesture ends.

## Autoplay & Step Navigation (useTimelineAutoplay.ts)

Located at `src/components/molecules/ExecutionTimeline/useTimelineAutoplay.ts` ›
`useTimelineAutoplay`. This hook powers the `|< < ▶/■ > >|` button cluster, the
autoplay interval, and all auto-scrolling. (There is no separate `useAutoScroll`
involved in the timeline.)

**Options** (`UseTimelineAutoplayOptions` — defined internally but, unlike the
analogous `UseTimelineScrubOptions` / `UseTimelineZoomPanOptions`, **not**
exported from the module; only `UseTimelineAutoplayReturn` is exported):
`record`, `currentStepIndex`, `selectedStepIndex`, `adjustedSteps`, `timeScale`,
`autoScroll`, `autoplayIntervalSec`, `isDraggingScrubber`, `scrollContainerRef`,
`setSelectedIterations`, `onStepClick`, and optional `onNavigateToNode`.

**Returns** (`UseTimelineAutoplayReturn`):

| Field            | Type         | Description                                                       |
| ---------------- | ------------ | ----------------------------------------------------------------- |
| `isAutoplaying`  | `boolean`    | Whether autoplay is active                                        |
| `canGoPrev`      | `boolean`    | `record !== null && navigableStepIndex > 0`                       |
| `canGoNext`      | `boolean`    | `record !== null && navigableStepIndex < record.steps.length - 1` |
| `goToPrevStep`   | `() => void` | Move to the previous step                                         |
| `goToNextStep`   | `() => void` | Move to the next step                                             |
| `goToStart`      | `() => void` | Jump to the first step (stops autoplay)                           |
| `goToEnd`        | `() => void` | Jump to the last step (stops autoplay)                            |
| `toggleAutoplay` | `() => void` | Toggle autoplay on/off                                            |

**Navigation index**:
`navigableStepIndex = selectedStepIndex ?? currentStepIndex`, so the buttons
step relative to the inspected step when one is selected, else relative to the
scrubber.

**Stepping**: each navigation call selects the target step via `onStepClick`,
calls `ensureIterationExpanded` (writing the step's `loopIteration` into
`selectedIterations` when inside a loop body so the iteration auto-opens), and —
when `autoScroll` is on — calls `onNavigateToNode(step.nodeId)` and
`scrollTimelineToStep`.

**Autoplay**: `toggleAutoplay` flips `isAutoplaying`; an effect runs
`setInterval(goToNextStep, autoplayIntervalSec * 1000)`. Autoplay auto-stops at
the last step or when `record` changes. The interval is controlled by the header
`SliderNumberInput` (`autoplayIntervalSec`, clamped to ≥ 0.5).

**Auto-scroll** (`scrollTimelineToStep`): computes the block's visual center
(`adjStart * timeScale + max(adjDur * timeScale, MIN_BLOCK_WIDTH)/2`) for the X
target, then after a 50ms timeout (to let loop expansion re-render) locates the
block via `[data-step-index="…"]`, computes a Y target to center it, and issues
a single smooth `scrollTo`. A separate live-stepping effect runs the same scroll
when `currentStepIndex` changes externally (skipped while dragging, while a step
is explicitly selected, or when `autoScroll` is off).

## Header Toolbar

The header (`h-12`) is always visible (even when collapsed) and contains:

- **Collapse toggle** — chevron + "Timeline" label; toggles `timelineCollapsed`.
- **Step navigation** — `ChevronsLeft` (start), `ChevronLeft` (prev),
  `Play`/`Square` (autoplay toggle), `ChevronRight` (next), `ChevronsRight`
  (end). Disabled buttons render in a muted style.
- **Autoplay interval** — `SliderNumberInput` (`Interval`, 0.5–30s, small).
- **Auto-scroll** — checkbox bound to `autoScroll`; now backed by the
  document-level graph preference `state.runnerViewPreferences.autoScroll`
  (toggled via the non-undoable `UPDATE_RUNNER_VIEW_PREFERENCE` action, and
  still snapshotted into the recording `viewState`).
- **Time-mode toggle** — `ButtonToggle` over `TIME_MODE_OPTIONS` (`Execution` /
  `Wall Clock`), rendered **only** when
  `hasPauseData = (record?.totalPauseDuration ?? 0) > 0`.
- **Summary** — `Timer` + `adjustedTotalDuration.toFixed(2)}ms`, `Layers` +
  `record.steps.length} steps`, and (when `record.warmupDuration > 0`) `Zap` +
  `JIT {warmupDuration.toFixed(1)}ms`.
- **Zoom controls** — `ZoomIn` (`zoomBy(1.5)`), `ZoomOut` (`zoomBy(1/1.5)`),
  `Maximize2` (`fitToView`).

When `record` is `null`, the component renders an empty state ("No execution
record to display") and no toolbar controls beyond the collapse label.

## Step Selection (click to inspect)

Left-clicking a step block calls `guardedStepClick(step)`, which forwards to
`onStepClick(step)` unless `didPanMoveRef.current` is set (suppressing clicks
right after a pan). Clicking does **not** move the scrubber; right-clicking a
block calls `onScrubTo(step.stepIndex)` (which moves the scrubber and does not
change the selection).

`ExecutionTimeline` also has two selection-driven effects:

- On first render, it auto-selects iteration 0 of the first loop segment so a
  loop is expanded by default.
- When `selectedStepIndex` points at a step inside a loop body, it writes that
  step's `loopIteration` into `selectedIterations` so the containing iteration
  expands.

The parent (`NodeRunnerPanel`) uses `onStepClick` to set `selectedStepIndex`
(toggling the inspector closed if you click the already-selected step) and open
`ExecutionStepInspector` with the clicked step's data. Selection and scrubbing
are independent.

## Stories

`src/components/molecules/ExecutionTimeline/ExecutionTimeline.stories.tsx` ›
`Playground` (title `Molecules/ExecutionTimeline`) provides: `Playground`,
`NoRecord`, `LinearExecution`, `ConcurrentExecution`, `LargeGraph`,
`WithErrors`, `WithSelectedStep`, `StressTestLong`, `InteractiveDemo`, and
`FullyCompleted`. Supporting subcomponents have their own stories in
`src/components/molecules/ExecutionTimeline/SupportingSubcomponents/SupportingSubcomponents.stories.tsx`,
covering `TimelineBlock`, `TimelineTrack`, `FlatSection`, the loop components
(`LoopTrack`, `LoopIterationBlockInner`, `LoopSection`,
`LoopIterationTooltipContent`), `TimeRuler`, `TimelineGrid`, `ScrubberHead`, and
`BlockTooltipContent`.

## Limitations and Notes

- **No virtualization**: every segment, track, and block is rendered to the DOM.
  For very large executions this can affect performance; `StressTestLong`
  exercises a deep/long recording.
- **Sub-row stacking is index-based, not time-based**: steps within a
  concurrency level stack by array order, so non-overlapping steps at the same
  level still occupy separate sub-rows.
- **Time-mode toggle only appears with pause data**: hidden when
  `totalPauseDuration === 0` (instant / performance-mode runs). This is
  intentional.
- **Only the taken switch branch is recorded**, so switch detail shows just that
  branch's steps.
- **Snap transition uses a timeout fallback**: the 200ms `setTimeout` in
  `useTimelineScrub` clears `isSnapping` if `onTransitionEnd` never fires (e.g.
  the element unmounts mid-transition).
- **Provider required**: the component reads view state from
  `RecordingViewStateContext`; rendering it without a
  `RecordingViewStateProvider` throws.

## Relationships with Other Features

### -> [Execution Recording](../runner/executionRecordingDoc.md)

`ExecutionTimeline` consumes an `ExecutionRecord` produced by the execution
recorder (`src/utils/nodeRunner/types.ts` › `ExecutionRecord`). The fields it
relies on:

- `steps: ReadonlyArray<ExecutionStepRecord>` — the primary data source.
- `loopRecords: ReadonlyMap<string, LoopRecord>` and
  `switchRecords: ReadonlyMap<string, SwitchRecord>` — drive loop/switch
  segments and their drill-downs (each iteration/branch carries its own
  `nestedLoopRecords` / `nestedSwitchRecords`).
- `totalDuration` / `totalPauseDuration` — drive `adjustedTotalDuration` and the
  time-mode toggle.
- `warmupDuration` — shown as the JIT badge when > 0.

Each `ExecutionStepRecord` provides `stepIndex`, `nodeId`, `nodeTypeName`,
`concurrencyLevel`, `startTime`, `endTime`, `duration`, `pauseAdjustment`,
`status`, `estimatedTiming`, and the loop/switch context fields
(`loopStructureId`, `loopIteration`, `loopPhase`, `switchStructureId`,
`switchPhase`, `branchTaken`) — all consumed by the timeline.

### -> [NodeRunnerPanel](nodeRunnerPanelDoc.md)

`ExecutionTimeline` is a child of the `NodeRunnerPanel` organism
(`src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx` ›
`NodeRunnerPanel`). The panel provides `record`, `currentStepIndex`,
`onScrubTo`, `onStepClick` (which sets `selectedStepIndex` and toggles the
inspector), `selectedStepIndex`, and `onNavigateToNode`.

### -> [ExecutionStepInspector (via onStepClick)](executionStepInspectorDoc.md)

When a step block is clicked, the panel opens `ExecutionStepInspector`
(`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`ExecutionStepInspector`) with the corresponding `ExecutionStepRecord` (its
`inputValues`, `outputValues`, `error`, timing, and loop/group metadata).

### -> [Runner Hook (onScrubTo / onNavigateToNode -> replayTo)](../runner/runnerHookDoc.md)

When the scrubber moves (drag, ruler mousedown, right-click) or navigation
advances a step, `onScrubTo` ultimately drives the `useNodeRunner` hook's
`replayTo()`, reconstructing `nodeVisualStates` up to the target step so the
canvas reflects which nodes completed, errored, or are yet to run.
`onNavigateToNode` centers the canvas on the active step's node during
navigation and live auto-scroll.
