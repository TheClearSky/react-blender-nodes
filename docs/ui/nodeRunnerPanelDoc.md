# NodeRunnerPanel

## Overview

NodeRunnerPanel is the unified runner UI for the react-blender-nodes library. It
is an organism-level component rendered as a bottom drawer that composes three
molecule-level children:

1. **RunControls** - Transport bar with play/pause/step/stop/reset buttons, mode
   toggle (instant vs step-by-step), and max loop iterations input.
2. **ExecutionTimeline** - Multi-track timeline displaying execution step blocks
   grouped by concurrency level, with scrubber, zoom/pan, and time ruler.
3. **ExecutionStepInspector** - Detail panel that slides in from the right
   showing a selected step's inputs, outputs, timing, and errors.

The panel itself slides up from the bottom of the viewport using
`useSlideAnimation` and supports vertical resize via `useResizeHandle` (drag the
top grip edge). The inspector has its own independent slide animation
(horizontal, from the right).

## Entity-Relationship Diagram

```
+---------------------+       +---------------------+       +---------------------------+
|    RunnerState       |       |   ExecutionRecord    |       |   ExecutionStepRecord     |
| (idle | compiling |  |       | (id, steps[], timing,|       | (stepIndex, nodeId,       |
|  running | paused |  |       |  errors, loopRecords,|       |  timing, status,          |
|  completed | errored)|       |  groupRecords,       |       |  inputValues, outputValues|
+---------------------+       |  finalValues)        |       |  error?, loop/group ctx)  |
        |                      +----------+-----------+       +-------------+-------------+
        |                                 |                                 |
        | drives button                   | contains 0..N                   |
        | enable/disable                  |                                 |
        v                                 v                                 v
+---------------------+       +---------------------+       +---------------------------+
|    RunControls       |       | ExecutionTimeline    |       | ExecutionStepInspector     |
| (transport bar)      |       | (multi-track blocks) |       | (step detail panel)        |
+---------------------+       +---------------------+       +---------------------------+
        |                                 |                                 |
        +----------------+----------------+---------------------------------+
                         |
                         v
              +---------------------+
              |  NodeRunnerPanel     |
              |  (organism drawer)   |
              +---------------------+
```

## Data Flow Diagram

```
                   RunnerState
                       |
    ExecutionRecord     |    currentStepIndex
           |            |          |
           v            v          v
    +--------------------------------------+
    |        NodeRunnerPanel               |
    |                                      |
    | state:                               |
    |   selectedStepIndex (local)          |
    |   contentHeight (useResizeHandle)    |
    |   mounted/style (useSlideAnimation)  |
    +------+----------+----------+--------+
           |          |          |
           v          v          v
    +-----------+ +----------+ +-------------------+
    |RunControls| |Execution | |ExecutionStep      |
    |           | |Timeline  | |Inspector          |
    | Receives: | |          | |                   |
    | runnerState| | record  | | stepRecord        |
    | mode      | | current  | | (selected step)   |
    | callbacks | | StepIndex| | hideComplexValues |
    +-----------+ | onScrubTo| | debugMode         |
                  | onStep   | +-------------------+
                  | Click    |
                  +----------+
```

## System Diagram

```
+------------------------------------------------------------------+
| FullGraph Component                                               |
|                                                                   |
|  +--------------------+          +-----------------------------+  |
|  | useNodeRunner Hook |          | ReactFlow Canvas            |  |
|  | - compiler         |          |  +------------------------+ |  |
|  | - executor         |          |  | ConfigurableNode       | |  |
|  | - recorder         |          |  |  +------------------+  | |  |
|  | - valueStore       |--------->|  |  |NodeStatus        |  | |  |
|  |                    |          |  |  |Indicator (overlay)|  | |  |
|  | Produces:          |          |  |  +------------------+  | |  |
|  | - RunnerState      |          |  +------------------------+ |  |
|  | - ExecutionRecord  |          +-----------------------------+  |
|  | - control callbacks|                                           |
|  +---------+----------+                                           |
|            |                                                      |
|            | props (state + callbacks)                             |
|            v                                                      |
|  +--------------------------------------------------------------+ |
|  | NodeRunnerPanel (organism)                                    | |
|  |                                                               | |
|  |  +----------------------------------------------------------+| |
|  |  | RunControls (molecule - top bar)                          || |
|  |  | [> Run] [|| Pause] [>> Step] [[] Stop] [<< Reset]        || |
|  |  | Mode: [Instant | Step-by-Step]  |  Max loops: [10000]     || |
|  |  +----------------------------------------------------------+| |
|  |                                                               | |
|  |  +------------------------------------+  +------------------+| |
|  |  | ExecutionTimeline (molecule)       |  | StepInspector    || |
|  |  | +------+-------------------------+|  | (slides in from  || |
|  |  | |Gutter|  Track 0: #### ##### ## ||  |  the right)      || |
|  |  | |      |  Track 1: ######## #### ||  | +------------+   || |
|  |  | +------+-------------------------+|  | |Node: AND   |   || |
|  |  | |      | ------|-------- scrubber||  | |Status: OK  |   || |
|  |  | +------+-------------------------+|  | |Inputs: ... |   || |
|  |  | [- Zoom +] [Fit] [Exec|WallClock]|  | |Outputs: ...|   || |
|  |  +------------------------------------+  | +------------+   || |
|  |                                          +------------------+| |
|  +--------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

## NodeRunnerPanelProps

| Prop                        | Type                          | Default     | Description                                                                                           |
| --------------------------- | ----------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `runnerState`               | `RunnerState`                 | required    | Current runner state machine state (`idle`, `compiling`, `running`, `paused`, `completed`, `errored`) |
| `record`                    | `ExecutionRecord \| null`     | required    | The execution record to display; `null` before any run                                                |
| `currentStepIndex`          | `number`                      | required    | Current scrubber / replay position                                                                    |
| `onRun`                     | `() => void`                  | required    | Start or resume execution                                                                             |
| `onPause`                   | `() => void`                  | required    | Pause a running execution                                                                             |
| `onStep`                    | `() => void`                  | required    | Execute one step forward                                                                              |
| `onStop`                    | `() => void`                  | required    | Stop and cancel execution                                                                             |
| `onReset`                   | `() => void`                  | required    | Reset runner back to idle                                                                             |
| `mode`                      | `RunMode`                     | required    | Current execution mode: `'instant'` or `'stepByStep'`                                                 |
| `onModeChange`              | `(mode: RunMode) => void`     | required    | Change execution mode                                                                                 |
| `maxLoopIterations`         | `number`                      | required    | Max loop iterations before error                                                                      |
| `onMaxLoopIterationsChange` | `(max: number) => void`       | required    | Update max loop iterations                                                                            |
| `onScrubTo`                 | `(stepIndex: number) => void` | required    | Navigate replay to a specific step                                                                    |
| `isOpen`                    | `boolean`                     | required    | Whether the drawer is open                                                                            |
| `onOpenChange`              | `(open: boolean) => void`     | required    | Called when the drawer open state changes                                                             |
| `debugMode`                 | `boolean`                     | `false`     | Show node IDs and handle IDs alongside display names in inspector                                     |
| `hideComplexValues`         | `boolean`                     | `false`     | Replace complex values (objects, arrays, Maps) with type summaries in inspector                       |
| `className`                 | `string`                      | `undefined` | Optional className for the root element                                                               |

## Component Architecture

### RunControls composition

RunControls is a horizontal toolbar rendered at the top of the panel, structured
as:

```
+---------------------------------------------------------------+
| [dot] Status | [>] [||] [>>] [[]  [<<] | [Instant|Step] | Max loops: [___] |
+---------------------------------------------------------------+
```

- **Status indicator**: Colored dot with label. Pulses during `compiling` and
  `running` states. Colors map via `STATUS_CONFIG` lookup table.
- **Action buttons**: 5 `ActionButton` components (Play, Pause, Step, Stop,
  Reset). Each is enabled/disabled based on `RunnerState`:
  - Play: enabled when `idle` or `errored`
  - Pause: enabled when `running`
  - Step: enabled when `paused`, `idle`, or `errored`
  - Stop: enabled when `running` or `paused`
  - Reset: enabled when `completed` or `errored`
- **Mode toggle**: Two-button segmented control (`Instant` / `Step-by-Step`).
  Editable only when `idle`, `completed`, or `errored`.
- **Max iterations input**: Numeric input, editable only when `canEdit` (same as
  mode toggle).

### ExecutionTimeline composition

The timeline is a scrollable multi-track view with zoom/pan, composed of several
sub-components and hooks:

- **Header bar**: Collapse toggle, total duration + step count summary, time
  mode toggle (`Execution` vs `Wall Clock`, only shown when pause data exists),
  zoom controls (Zoom In, Zoom Out, Fit to View).
- **TimelineTrack** (one per concurrency level): Contains `TimelineBlock`
  components positioned absolutely by `startTime * timeScale` and sized by
  `duration * timeScale`. Tracks have a gutter label ("Level N") that stays
  pinned left via `sticky`.
- **TimelineBlock**: Colored by status (`completed`=green, `errored`=red,
  `skipped`=gray). Shows inline label when wide enough. Shows `BlockTooltip`
  (floating-ui) on hover with node name, status, duration, and step index.
- **TimeRuler**: Bottom-aligned ruler with auto-computed tick intervals via
  `niceTickInterval()`. Clickable/draggable to control scrubber.
- **Scrubber**: Full-height vertical line with a pentagon-shaped SVG handle.
  Draggable for continuous scrubbing; snaps to nearest step on release.
- **useTimelineZoomPan**: Manages zoom (buttons, Shift+wheel) and click-drag
  pan. Auto fit-to-view when duration changes.
- **useTimelineScrub**: Manages drag state, nearest-step detection, snap-to-step
  transitions.

### ExecutionStepInspector (conditional, slides in)

The inspector is conditionally rendered when a step is selected. It occupies a
fixed-width (300px) region on the right side of the timeline area, with its own
`useSlideAnimation` (horizontal, 200ms, `translateX(100%)` -> `translateX(0)`).

Content sections:

- **Header**: Node type name, node ID (or full debug IDs in debug mode), close
  button.
- **Status + Timing**: StatusBadge (completed/errored/skipped), duration,
  start->end time range.
- **Loop/Group context**: Shown conditionally when `loopIteration` or
  `groupNodeId` are present.
- **Inputs section**: Lists each input handle with connections. Each
  `InputHandleDisplay` shows handle name, data type, connection count badge, and
  per-connection detail (`ConnectionLine` with source node/handle names and
  formatted values).
- **Outputs section**: Lists each output handle with `OutputHandleDisplay`
  showing handle name, data type, target count, and formatted value.
- **Error section**: Conditionally rendered red box with formatted `GraphError`
  message.

Value formatting uses `formatValue()` which handles primitives, arrays, Maps,
and objects. When `hideComplexValues` is true, complex types display as type
summaries (e.g., `Array(5)`, `Object(3)`).

## Drawer Behavior

### Slide animation (useSlideAnimation)

The panel uses `useSlideAnimation(isOpen)` with default options:

- **Duration**: 250ms
- **Hidden transform**: `translateY(100%)` (below viewport)
- **Visible transform**: `translateY(0)`
- **Easing**: `cubic-bezier(0.32, 0.72, 0, 1)`

Implementation uses the Web Animations API with single-keyframe animations,
enabling smooth reversal on interrupted toggles (e.g., rapid close->open).
Returns `{ mounted, ref, style }`:

- `mounted`: Controls React mounting; the element unmounts after exit animation
  completes.
- `ref`: Attached to the animated `<div>`.
- `style`: Initial inline style (`transform: hiddenTransform`) to prevent
  flash-of-visible-content before the animation effect runs.

A clip wrapper (`overflow: hidden`, `pointer-events: none`) prevents the sliding
element from causing viewport scrollbars.

### Resize (useResizeHandle)

The panel content area (below RunControls) is resizable via `useResizeHandle`:

- **Initial size**: 220px
- **Min size**: 80px
- **Max size**: 600px
- **Direction**: `'up'` (dragging up increases height)

The resize handle is the `GripHorizontal` icon bar at the very top of the panel.
On mousedown, the hook captures the start position and listens for
mousemove/mouseup on `document`, clamping the computed size. During drag,
`user-select: none` and `cursor: ns-resize` are applied to `document.body`.

### Open/close toggle

The panel has a close button (X icon) in the top-right corner of the RunControls
bar that calls `onOpenChange(false)`. Opening is controlled externally via the
`isOpen` prop (typically toggled from FullGraph or a toolbar button).

When `isOpen` transitions to `false`, the slide animation plays the exit
transition and then sets `mounted = false`, which returns `null` from the
render.

## Selected Step Flow

```
1. User clicks a TimelineBlock in ExecutionTimeline
       |
       v
2. onStepClick(stepRecord) fires
       |
       v
3. NodeRunnerPanel.handleStepClick toggles selectedStepIndex:
   - If same step already selected -> sets to null (close)
   - If different step -> sets to new stepIndex (open/switch)
       |
       v
4. selectedStepRecord is looked up from record.steps
       |
       v
5. inspectorOpen = (selectedStepRecord !== null)
       |
       v
6. useSlideAnimation(inspectorOpen, { translateX }) controls mount/animation
       |
       +---> Inspector slides IN  (selectedStepRecord !== null)
       +---> Inspector slides OUT (selectedStepRecord === null)
       |
       v
7. lastStepRecordRef preserves the step data during exit animation
   (displayedStepRecord = selectedStepRecord ?? lastStepRecordRef.current)
       |
       v
8. User can also close via the X button inside ExecutionStepInspector
   -> handleCloseInspector() sets selectedStepIndex to null
```

## Limitations and Deprecated Patterns

- **No session history UI**: The `NodeRunnerPanelState.sessionHistory` type
  exists but the panel currently operates on a single `record` prop rather than
  a full `RunSession` object.
- **No progress bar**: `RunProgress` type is defined but not yet consumed by any
  UI component.
- **Inspector width is hardcoded**: The inspector is fixed at 300px
  (`w-[300px]`), not responsive.
- **No breakpoints**: The types mention future breakpoint support but it is not
  implemented.
- **RunMode naming**: The panel uses `RunMode = 'instant' | 'stepByStep'` (from
  RunControls), while the types file defines
  `RunMode = 'performance' | 'debug'`. These are parallel concepts not yet
  unified.
- **selectedStepIndex is local**: The panel manages `selectedStepIndex`
  internally rather than via the `RunSessionInteractionState` type. The
  interaction state type exists for future multi-session support.

## Relationships with Other Features

### -> [RunControls](runControlsDoc.md)

NodeRunnerPanel passes through all control-related props (`runnerState`,
`onRun`, `onPause`, `onStep`, `onStop`, `onReset`, `mode`, `onModeChange`,
`maxLoopIterations`, `onMaxLoopIterationsChange`) directly to RunControls. The
panel adds a close button adjacent to the RunControls bar.

### -> [ExecutionTimeline](executionTimelineDoc.md)

NodeRunnerPanel passes `record`, `currentStepIndex`, `onScrubTo`,
`selectedStepIndex`, and a `handleStepClick` callback to ExecutionTimeline. The
timeline manages its own zoom/pan state (`useTimelineZoomPan`), scrubber state
(`useTimelineScrub`), collapse state, and time mode (`execution` vs `wallClock`)
independently.

### -> [ExecutionStepInspector](executionStepInspectorDoc.md)

Rendered conditionally based on `selectedStepIndex`. The inspector receives
`displayedStepRecord` (the selected step or last-selected for exit animation),
`hideComplexValues`, `debugMode`, and `onClose`. Its mount/unmount is controlled
by `inspectorAnim.mounted` from a second `useSlideAnimation` instance.

### -> [Runner Hook (useNodeRunner)](../runner/runnerHookDoc.md)

The panel is designed to receive its data from `useNodeRunner` (or equivalent).
The hook produces `RunnerState`, `ExecutionRecord`, control callbacks, and
eventually `nodeVisualStates`. Currently, FullGraph bridges between the hook and
the panel.

### -> [FullGraph (RunnerOverlay)](fullGraphDoc.md)

FullGraph renders NodeRunnerPanel and feeds it data from `useNodeRunner`.
`nodeVisualStates` flow upward from the execution record through FullGraph's
context to `ConfigurableNodeReactFlowWrapper`, which renders
`NodeStatusIndicator` border overlays on each node.

### -> [Custom Hooks (useSlideAnimation, useResizeHandle)](../hooks/hooksDoc.md)

- **useSlideAnimation**: Used twice in NodeRunnerPanel: once for the drawer
  itself (vertical slide, 250ms) and once for the inspector (horizontal slide,
  200ms). The hook uses Web Animations API for GPU-accelerated transforms with
  smooth interrupt handling.
- **useResizeHandle**: Used once for the panel content area height. Returns
  `{ size, onMouseDown }` where `size` is the current height and `onMouseDown`
  is attached to the grip handle element.
