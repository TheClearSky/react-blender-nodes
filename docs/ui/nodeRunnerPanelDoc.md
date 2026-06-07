# NodeRunnerPanel

## Overview

NodeRunnerPanel is the unified runner UI for the react-blender-nodes library. It
is an organism-level component rendered as a bottom drawer that composes three
children:

1. **RunControls** (molecule) - Transport bar with play/pause/step/stop/reset
   buttons, a mode toggle (Instant vs Step-by-Step), and a Max-loops slider
   input.
2. **ExecutionTimeline** (molecule) - Multi-segment timeline of execution step
   blocks grouped into flat/loop/switch sections, with a scrubber, zoom/pan,
   step navigation (prev/next/autoplay), auto-scroll, and a time-mode toggle.
3. **ExecutionStepInspector** (molecule) - Detail panel that slides in from the
   right showing a selected step's status, timing, loop/group context, inputs,
   outputs, and errors.

The panel slides up from the bottom of the viewport using `useSlideAnimation`
and supports vertical resize via `useResizeHandle` (drag the three-dot window
handle at the top). The inspector has its own independent horizontal slide
animation (from the right).

**Source:** `src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx` ›
`NodeRunnerPanel`

> **Important architectural note.** The panel does **not** own its open/close
> state, selected-step state, or most timeline UI preferences via props. Those
> live in a shared React context, `RecordingViewStateContext`, consumed through
> the `useRecordingViewState()` hook
> (`src/components/organisms/FullGraph/RecordingViewStateContext.tsx` ›
> `useRecordingViewState`). The panel reads `isRunnerPanelOpen`,
> `selectedStepIndex`, and `edgeValuesAnimated` (plus their setters) from that
> context. As a result the component **must** be rendered inside a
> `RecordingViewStateProvider`. The `RunSession` / `NodeRunnerPanelState` types
> in `src/utils/nodeRunner/types.ts` › `NodeRunnerPanelState` describe a richer
> multi-session model that is **not** what the current panel consumes — see
> [Limitations](#limitations-and-deprecated-patterns).

## Entity-Relationship Diagram

```
+----------------------+      +-----------------------+      +---------------------------+
|    RunnerState       |      |   ExecutionRecord     |      |   ExecutionStepRecord     |
| (idle | compiling |  |      | (id, steps[], timing, |      | (stepIndex, nodeId,       |
|  running | paused |  |      |  errors, loopRecords, |      |  timing, status,          |
|  completed | errored)|      |  switchRecords,       |      |  inputValues, outputValues|
+----------------------+      |  groupRecords,        |      |  error?, loop/group ctx,  |
        |                     |  finalValues)         |      |  loopPhase/switchPhase)   |
        |                     +-----------+-----------+      +-------------+-------------+
        | drives button                   | contains 0..N                  |
        | enable/disable                  |                                |
        v                                 v                                v
+----------------------+      +-----------------------+      +---------------------------+
|    RunControls       |      | ExecutionTimeline     |      | ExecutionStepInspector    |
| (transport bar)      |      | (flat/loop/switch     |      | (step detail panel)       |
+----------------------+      |  sections)            |      +---------------------------+
        |                     +-----------------------+                    |
        +----------------+----------------+--------------------------------+
                         |
                         v
              +----------------------+        reads/writes
              |  NodeRunnerPanel     |<-------------------------+
              |  (organism drawer)   |   RecordingViewStateContext
              +----------------------+   (isRunnerPanelOpen,
                                          selectedStepIndex,
                                          edgeValuesAnimated, ...)
```

## Data Flow Diagram

```
            RecordingViewStateContext                props from RunnerOverlay
   (isRunnerPanelOpen, selectedStepIndex,           (runnerState, record,
    edgeValuesAnimated + setters)                    currentStepIndex, callbacks)
                 |                                            |
                 v                                            v
    +-----------------------------------------------------------------+
    |                       NodeRunnerPanel                           |
    |                                                                 |
    | local hooks:                                                    |
    |   useResizeHandle  -> contentHeight (220 / 80..600px)           |
    |   useSlideAnimation(isRunnerPanelOpen)  -> drawer mount/style   |
    |   useSlideAnimation(inspectorOpen, translateX) -> inspector     |
    |                                                                 |
    | derived:                                                        |
    |   selectedStepRecord = record.steps.find(stepIndex === sel)     |
    |   inspectorOpen      = selectedStepRecord !== null              |
    |   displayedStepRecord= selectedStepRecord ?? lastStepRecordRef  |
    +------+--------------------------+----------------------+--------+
           |                          |                      |
           v                          v                      v
    +-------------+    +---------------------------+   +---------------------------+
    | RunControls |    | ExecutionTimeline         |   | ExecutionStepInspector    |
    |             |    |                           |   |                           |
    | runnerState |    | record                    |   | stepRecord (displayed)    |
    | mode        |    | currentStepIndex          |   | loopRecords               |
    | maxLoop...  |    | onScrubTo                 |   | hideComplexValues         |
    | callbacks   |    | onStepClick (handleStep   |   | debugMode                 |
    +-------------+    |   Click)                  |   | edgeValuesAnimated +      |
                       | selectedStepIndex         |   |   onEdgeValuesAnimated    |
                       | onNavigateToNode          |   |   Change                  |
                       +---------------------------+   | onClose                   |
                                                       +---------------------------+
```

## System Diagram

```
+----------------------------------------------------------------------+
| FullGraph                                                            |
|   <RecordingViewStateProvider>  (only when functionImplementations)  |
|     <ErrorBoundary>                                                  |
|       <RunnerOverlay>  (provides RunnerContext; wraps canvas + panel)|
|                                                                      |
|  +--------------------+          +-----------------------------+     |
|  | useNodeRunner Hook |          | ReactFlow Canvas (children) |     |
|  | - compiler         |          |  +------------------------+ |     |
|  | - executor         |          |  | ConfigurableNode       | |     |
|  | - recorder         |--------->|  |  +------------------+  | |     |
|  | - valueStore       |  Runner  |  |  | NodeStatus       |  | |     |
|  |                    |  Context |  |  | Indicator overlay|  | |     |
|  | Produces:          |          |  |  +------------------+  | |     |
|  | - runnerState      |          |  +------------------------+ |     |
|  | - executionRecord  |          +-----------------------------+     |
|  | - currentStepIndex |                                              |
|  | - nodeVisualStates |                                              |
|  | - control methods  |                                              |
|  +---------+----------+                                              |
|            |                                                         |
|            | props (state + callbacks + onNavigateToNode + panelRef) |
|            v                                                         |
|  +----------------------------------------------------------------+  |
|  | NodeRunnerPanel (organism, slides up; hidden when panel closed) |  |
|  |  [::: window handle / resize grip]                              |  |
|  |  +-----------------------------------------------+ [X] close    |  |
|  |  | RunControls                                   |              |  |
|  |  | (*) Status | [>][||][>>][[]][<-] | Mode | Max |              |  |
|  |  +-----------------------------------------------+              |  |
|  |  +------------------------------------+ +--------------------+  |  |
|  |  | ExecutionTimeline                  | | ExecutionStep      |  |  |
|  |  | header: collapse | nav | autoplay  | | Inspector (340px,  |  |  |
|  |  | | interval | auto-scroll | time    | | slides from right) |  |  |
|  |  | mode | duration/steps | zoom       | |  Status / Timing   |  |  |
|  |  | ruler + scrubber + flat/loop/      | |  Loop/Group ctx    |  |  |
|  |  | switch sections                    | |  Inputs / Outputs  |  |  |
|  |  +------------------------------------+ +--------------------+  |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
|  [ "Runner" reopen button — shown by RunnerOverlay when closed ]     |
+----------------------------------------------------------------------+
```

## Props (NodeRunnerPanelProps)

The prop type is declared inline in
`src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx` ›
`NodeRunnerPanelProps` and re-exported from the file. There is **no**
`isOpen`/`onOpenChange` prop — drawer open state is context-driven (see
[Drawer Behavior](#drawer-behavior)).

| Prop                        | Type                                      | Default     | Description                                                                                           |
| --------------------------- | ----------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `runnerState`               | `RunnerState`                             | required    | Current runner state machine state (`idle`, `compiling`, `running`, `paused`, `completed`, `errored`) |
| `record`                    | `ExecutionRecord \| null`                 | required    | The execution record to display; `null` before any run                                                |
| `currentStepIndex`          | `number`                                  | required    | Current scrubber / replay position (passed straight to the timeline)                                  |
| `onRun`                     | `() => void`                              | required    | Start or resume execution                                                                             |
| `onPause`                   | `() => void`                              | required    | Pause a running execution                                                                             |
| `onStep`                    | `() => void`                              | required    | Execute one step forward                                                                              |
| `onStop`                    | `() => void`                              | required    | Stop and cancel execution                                                                             |
| `onReset`                   | `() => void`                              | required    | Reset runner back to idle                                                                             |
| `mode`                      | `RunMode`                                 | required    | Current execution mode: `'instant'` or `'stepByStep'` (the RunControls-local `RunMode`)               |
| `onModeChange`              | `(mode: RunMode) => void`                 | required    | Change execution mode                                                                                 |
| `maxLoopIterations`         | `number`                                  | required    | Max loop iterations before error                                                                      |
| `onMaxLoopIterationsChange` | `(max: number) => void`                   | required    | Update max loop iterations                                                                            |
| `onScrubTo`                 | `(stepIndex: number) => void`             | required    | Navigate replay to a specific step (forwarded to the timeline scrubber)                               |
| `onNavigateToNode`          | `(nodeId: string) => void`                | `undefined` | Optional; called when prev/next/autoplay focuses a node so the canvas can recenter on it              |
| `panelRef`                  | `React.RefObject<HTMLDivElement \| null>` | `undefined` | Optional ref forwarded to the panel's outer element for height measurement                            |
| `debugMode`                 | `boolean`                                 | `false`     | Show node IDs and handle IDs alongside display names in the inspector                                 |
| `hideComplexValues`         | `boolean`                                 | `false`     | Replace complex values (objects, arrays, Maps) with type summaries in the inspector                   |
| `className`                 | `string`                                  | `undefined` | Optional className merged onto the animated drawer element                                            |

`RunMode` here is the **RunControls-local** union `'instant' | 'stepByStep'`
(imported from `src/components/molecules/RunControls/RunControls.tsx` ›
`RunMode`). It is distinct from the `RunMode` exported by
`src/utils/nodeRunner/types.ts` › `RunMode` (`'performance' | 'debug'`).
`RunnerState`, `ExecutionRecord`, and `ExecutionStepRecord` are imported from
`src/utils/nodeRunner/types.ts` › `ExecutionRecord`.

### State consumed from `useRecordingViewState()`

The panel destructures the following from the context (not props):

| Context value           | Type                                       | Use in the panel                             |
| ----------------------- | ------------------------------------------ | -------------------------------------------- |
| `selectedStepIndex`     | `number \| null`                           | Which step's detail is open in the inspector |
| `setSelectedStepIndex`  | `Dispatch<SetStateAction<number \| null>>` | Toggles selection on step click / close      |
| `edgeValuesAnimated`    | `boolean`                                  | Passed to the inspector's "Animate" toggle   |
| `setEdgeValuesAnimated` | `Dispatch<SetStateAction<boolean>>`        | Updates the edge-animation preference        |
| `isRunnerPanelOpen`     | `boolean`                                  | Drives `useSlideAnimation` mount/visibility  |
| `setIsRunnerPanelOpen`  | `Dispatch<SetStateAction<boolean>>`        | Called by the close (X) button               |

## Component Architecture

### Constants

```ts
const DEFAULT_CONTENT_HEIGHT = 220; // initial timeline+inspector area height
const MIN_CONTENT_HEIGHT = 80;
const MAX_CONTENT_HEIGHT = 600;
```

### RunControls composition

RunControls is a horizontal toolbar (`h-11`) rendered at the top of the panel
(below the window handle), structured as four sections separated by vertical
dividers:

```
+---------------------------------------------------------------------+
| (*) Status | [>] [||] [>>] [[]] [<-] | [Instant|Step] | Max loops: [_] |
+---------------------------------------------------------------------+
  140px wide   five ActionButtons         ButtonToggle    SliderNumberInput
```

- **Status indicator**: Colored dot with label, in a fixed `w-[140px]` slot.
  Pulses (`animate-pulse` + overlaid `animate-ping`) during `compiling` and
  `running`. Colors/labels come from the `STATUS_CONFIG` lookup table.
- **Action buttons**: Five `ActionButton` components (Play, Pause, Step, Stop,
  Reset) using lucide icons (`Play`, `Pause`, `SkipForward`, `Square`,
  `RotateCcw`). Each is enabled/disabled by `RunnerState`:
  - `canRun` = Play: enabled when `idle` or `errored`
  - `canPause` = Pause: enabled when `running`
  - `canStep` = Step: enabled when `paused`, `idle`, or `errored`
  - `canStop` = Stop: enabled when `running` or `paused`
  - `canReset` = Reset: enabled when `completed` or `errored`
  - The Play button uses `variant='play'` and gets the active blue glow when
    `runnerState === 'running'`.
- **Mode toggle**: A `ButtonToggle` (`Instant` / `Step-by-Step`), wrapped in a
  `Tooltip`. Disabled (via `disabled` prop) when `canEdit` is false; `canEdit`
  is true only when `idle`, `completed`, or `errored`.
- **Max iterations input**: A `SliderNumberInput` labeled "Max Loops"
  (drag/click to adjust), wrapped in a `Tooltip`, clamped to
  `Math.max(1, Math.round(v))`. Its wrapper gets
  `pointer-events-none opacity-50` when `canEdit` is false.

See [RunControls](runControlsDoc.md) for the full enable/disable matrix.

### ExecutionTimeline composition

The timeline fills the flexible-width region of the content area. It is itself a
context consumer (`useRecordingViewState`) for its UI preferences. The panel
passes it `record`, `currentStepIndex`, `onScrubTo`, `onStepClick`
(`handleStepClick`), `selectedStepIndex`, and `onNavigateToNode`. Highlights:

- **Header bar**: Collapse toggle ("Timeline"), step-navigation cluster (`|<`,
  `<`, autoplay `>`/stop, `>`, `>|`), an autoplay "Interval" `SliderNumberInput`
  (0.5s–30s), an "Auto-scroll" checkbox, a time-mode `ButtonToggle` (`Execution`
  vs `Wall Clock`, only rendered when `record.totalPauseDuration > 0`), a
  duration/step-count (and JIT warmup) summary, and zoom controls (Zoom In, Zoom
  Out, Fit to View).
- **Segments**: `buildSegments(...)` splits the adjusted steps into `flat`,
  `loop`, and `switch` segments, rendered by `FlatSection`, `LoopSection`, and
  `SwitchSection` respectively. Loop/switch iterations are selectable; the
  selected iteration is tracked in the context's `selectedIterations` map.
- **Ruler + grid + scrubber**: `TimeRuler` and `TimelineGrid` render the time
  axis; a `ScrubberHead` plus a full-height vertical line provide drag scrubbing
  that snaps to the nearest step on release.
- **Hooks**: `useTimelineZoomPan` (zoom buttons, Shift+wheel, click-drag pan,
  auto fit-to-view), `useTimelineScrub` (drag/snap), and `useTimelineAutoplay`
  (step navigation, autoplay timer, canvas focus via `onNavigateToNode`).

The panel does not manage any of this state itself; it only forwards the props
above. See [ExecutionTimeline](executionTimelineDoc.md) for details.

### ExecutionStepInspector (conditional, slides in)

The inspector mounts only while a step is selected (or briefly during its exit
animation). The panel wraps it in a `<div>` that is mounted/animated by a second
`useSlideAnimation` instance (horizontal). The inspector component itself is
**340px** wide (`w-[340px]`) and carries its own `animate-slide-in-right` entry
class.

The panel passes the inspector:

- `stepRecord={displayedStepRecord}` - the selected step (or last-selected
  during exit)
- `onClose={handleCloseInspector}` - sets `selectedStepIndex` to `null`
- `loopRecords={record?.loopRecords}` - for enriched loop context
- `hideComplexValues`, `debugMode` - display options
- `edgeValuesAnimated` + `onEdgeValuesAnimatedChange` - the "Animate" toggle,
  wired to the context's `edgeValuesAnimated` / `setEdgeValuesAnimated`

Inspector content sections (from
`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`ExecutionStepInspector`):

- **Header**: `Package` icon + `nodeTypeName`, an "Animate" edge-values checkbox
  (only when `onEdgeValuesAnimatedChange` is provided), and a close (X) button.
- **Status + Timing**: A `StatusBadge` (`completed` / `errored` / `skipped`) and
  duration (or `< 0.1ms` when `estimatedTiming`), plus a `startTime -> endTime`
  range box.
- **Loop/Group context**: Rendered when `loopIteration !== undefined` or
  `groupNodeId` is set. The loop row shows
  `Loop iteration {loopIteration + 1} of {loopRecord.totalIterations}` and the
  iteration's condition (`true (continues)` / `false (exits)`) when a matching
  `LoopRecord` is available. The group row shows `Group: {groupNodeId}` and
  `(depth N)`.
- **Inputs**: An `Accordion` section (open by default) listing each input handle
  via `InputHandleDisplay` - handle name + `(dataTypeId)`, then one
  `ConnectionLine` per incoming connection (source node/handle name, optional
  debug IDs, and the formatted value), or the formatted `defaultValue` when the
  handle is a default, or "No value".
- **Outputs**: An `Accordion` section (open by default) listing each output
  handle via `OutputHandleDisplay` - handle name + `(dataTypeId)` and the
  formatted value.
- **Error**: A red box rendered when `stepRecord.error` is set, showing
  `formatGraphError(stepRecord.error)`.

Value formatting uses the module-local `formatValue()` which handles primitives,
arrays, and Maps recursively and falls back to `JSON.stringify`. When
`hideComplexValues` is true, complex types (objects, arrays, Maps, functions)
render as type summaries via `typeSummary()` (e.g. `Array(5)`, `Object(3)`,
`Map(2)`).

## Drawer Behavior

### Slide animation (useSlideAnimation)

The panel calls `useSlideAnimation(isRunnerPanelOpen)` with default options:

- **Duration**: 250ms (`DEFAULT_DURATION_MS`)
- **Hidden transform**: `translateY(100%)` (below viewport)
- **Visible transform**: `translateY(0)`
- **Easing**: `cubic-bezier(0.32, 0.72, 0, 1)`

Implementation uses the Web Animations API with single-keyframe animations,
enabling smooth reversal on interrupted toggles (e.g., rapid close->open). It
returns `{ mounted, ref, style }`:

- `mounted`: Controls React mounting; the element unmounts after the exit
  animation finishes (`anim.onfinish` sets `mounted` false). The panel returns
  `null` when `!mounted`.
- `ref`: Attached to the animated `<div>` (combined with `panelRef` via a
  `combinedRef` callback so the parent can measure panel height).
- `style`: Initial inline style (`transform: hiddenTransform`) to prevent a
  flash-of-visible-content before the animation effect runs.

A clip wrapper
(`absolute inset-x-0 bottom-0 ... overflow-hidden pointer-events-none`) contains
the sliding element so `translateY(100%)` does not create viewport scrollbars;
the inner animated element re-enables `pointer-events-auto`.

The inspector uses a **second** `useSlideAnimation(inspectorOpen, ...)` with
`durationMs: 200`, `hiddenTransform: 'translateX(100%)'`, and
`visibleTransform: 'translateX(0)'`.

### Resize (useResizeHandle)

The content area (timeline + inspector, below RunControls) is resizable via
`useResizeHandle`:

- **Initial size**: 220px (`DEFAULT_CONTENT_HEIGHT`)
- **Min size**: 80px (`MIN_CONTENT_HEIGHT`)
- **Max size**: 600px (`MAX_CONTENT_HEIGHT`)
- **Direction**: `'up'` (dragging up increases height)

The resize handle is the **three-dot window handle** bar at the very top of the
panel (`cursor-ns-resize`, dots turn blue on hover). On mousedown the hook
captures the start position and listens for `mousemove`/`mouseup` on `document`,
clamping the computed size. During the drag it sets `user-select: none` and
`cursor: ns-resize` on `document.body`, restoring them on mouseup. The returned
`size` is applied as the content area's inline `height`.

### Open / close

- **Close**: An `X` button at the right edge of the RunControls row calls
  `setIsRunnerPanelOpen(false)`.
- **Open**: Controlled externally by writing `isRunnerPanelOpen` in the context.
  In the library, `RunnerOverlay` renders a floating "Runner" button
  (bottom-center) when `!isRunnerPanelOpen` that calls
  `setIsRunnerPanelOpen(true)`.
- When `isRunnerPanelOpen` becomes `false`, the slide animation plays the exit
  transition and then sets `mounted = false`, returning `null`.
- A `useEffect` clears `selectedStepIndex` (closes the inspector) whenever the
  panel closes.

## Selected Step Flow

```
1. User clicks a step block inside ExecutionTimeline
       |
       v
2. ExecutionTimeline calls onStepClick(stepRecord)  (guarded against pan drags)
       |
       v
3. NodeRunnerPanel.handleStepClick toggles selectedStepIndex (context):
   - same step already selected -> null (close)
   - different step             -> stepRecord.stepIndex (open / switch)
       |
       v
4. selectedStepRecord = record.steps.find(s => s.stepIndex === selectedStepIndex)
       |
       v
5. inspectorOpen = (selectedStepRecord !== null)
       |
       v
6. useSlideAnimation(inspectorOpen, { translateX }) controls mount + slide
       |
       +--> Inspector slides IN  (selectedStepRecord !== null)
       +--> Inspector slides OUT (selectedStepRecord === null)
       |
       v
7. lastStepRecordRef preserves the step data during the exit animation
   (displayedStepRecord = selectedStepRecord ?? lastStepRecordRef.current)
       |
       v
8. User can also close via the X button inside ExecutionStepInspector
   -> handleCloseInspector() sets selectedStepIndex to null
```

Note: in the production wiring (`RunnerOverlay`), changing `selectedStepIndex`
also drives `runner.replayTo(selectedStepIndex)`, which updates node visual
states on the canvas. The panel itself does not call `replayTo`.

## Limitations and Deprecated Patterns

- **No session history UI**: `NodeRunnerPanelState.sessionHistory` and
  `RunSession` exist in `src/utils/nodeRunner/types.ts` › `RunSession` as a
  richer model, but the panel operates on a single `record` prop plus
  `RecordingViewStateContext`, not a `RunSession` object or a session list.
- **No progress bar**: `RunProgress` is defined in
  `src/utils/nodeRunner/types.ts` › `RunProgress` but no UI here consumes it.
  The timeline shows total duration / step count instead.
- **Inspector width is hardcoded**: The inspector is fixed at `w-[340px]`, not
  responsive.
- **No breakpoints / watchpoints**: The types comment on future
  breakpoint/watchpoint support, but it is not implemented.
- **Two `RunMode` types**: The panel's `mode` prop uses the RunControls-local
  `RunMode = 'instant' | 'stepByStep'`, while `src/utils/nodeRunner/types.ts` ›
  `RunMode` exports `RunMode = 'performance' | 'debug'`. `RunnerOverlay` bridges
  these (`record.viewState.runMode` round-trips the `'instant' | 'stepByStep'`
  form).
- **Selection / open state are context, not props**: There is no
  `selectedStepIndex`, `isOpen`, or `onOpenChange` prop. The panel reads/writes
  these through `useRecordingViewState()`, so it must be wrapped in a
  `RecordingViewStateProvider`. The `RunSessionInteractionState` type is part of
  the not-yet-adopted multi-session model.

## Relationships with Other Features

### -> [RunControls](runControlsDoc.md)

NodeRunnerPanel passes through all control-related props (`runnerState`,
`onRun`, `onPause`, `onStep`, `onStop`, `onReset`, `mode`, `onModeChange`,
`maxLoopIterations`, `onMaxLoopIterationsChange`) directly to RunControls and
adds the close (X) button to the right of the bar.

### -> [ExecutionTimeline](executionTimelineDoc.md)

NodeRunnerPanel passes `record`, `currentStepIndex`, `onScrubTo`, `onStepClick`
(`handleStepClick`), `selectedStepIndex`, and `onNavigateToNode`. The timeline
reads its own UI preferences (auto-scroll, time mode, collapsed state, selected
iterations, autoplay interval) from `RecordingViewStateContext` and manages
zoom/pan and scrub state via its internal hooks.

### -> [ExecutionStepInspector](executionStepInspectorDoc.md)

Rendered conditionally based on `selectedStepIndex`. The inspector receives
`displayedStepRecord`, `loopRecords`, `hideComplexValues`, `debugMode`,
`edgeValuesAnimated`, `onEdgeValuesAnimatedChange`, and `onClose`. Its
mount/unmount is controlled by the panel's second `useSlideAnimation` instance
(`inspectorAnim.mounted` / `.ref` / `.style`).

### -> [Runner Hook (useNodeRunner)](../runner/runnerHookDoc.md)

`useNodeRunner` produces the data the panel renders: `runnerState`,
`executionRecord`, `currentStepIndex`, `nodeVisualStates`, and the control
methods (`run`, `pause`, `step`, `stop`, `reset`, `resume`, `replayTo`,
`setMode`, `setMaxLoopIterations`, `loadRecord`). `RunnerOverlay` adapts these
to the panel's props.

### -> [FullGraph (RunnerOverlay)](fullGraphDoc.md)

In the library, `RunnerOverlay`
(`src/components/organisms/FullGraph/RunnerOverlay.tsx` › `RunnerOverlay`) is
what actually renders NodeRunnerPanel. It:

- Calls `useNodeRunner` and maps its return values onto the panel's props.
- Provides `handleRun`, which **resumes** when `runnerState === 'paused'` and
  otherwise starts a new run; and `handleModeChange`, which forwards to
  `runner.setMode`.
- Supplies `onNavigateToNode={handleNavigateToNode}`, which recenters the
  ReactFlow canvas on a node (offsetting Y by the measured panel height so the
  drawer does not cover it) and `panelRef` for that measurement.
- Builds `nodeRunnerStates` (merging `nodeVisualStates`, `nodeWarnings`, and
  `nodeErrors`) and exposes them through `RunnerContext` so `ConfigurableNode`
  can render `NodeStatusIndicator` overlays.
- Persists / restores UI preferences via `getViewState()` / `restoreViewState()`
  from `RecordingViewStateContext` (round-tripping `record.viewState`, including
  `runMode` and `maxLoopIterations`).

### -> [Custom Hooks (useSlideAnimation, useResizeHandle)](../hooks/hooksDoc.md)

- **useSlideAnimation**: Used twice in NodeRunnerPanel - once for the drawer
  (vertical, 250ms) and once for the inspector (horizontal, 200ms). Web
  Animations API, GPU-accelerated transforms, smooth interrupt handling.
- **useResizeHandle**: Used once for the content-area height. Returns
  `{ size, onMouseDown }`; `size` is the current height (applied as inline
  `height`) and `onMouseDown` is attached to the three-dot window handle.

## Usage

```tsx
// NodeRunnerPanel is an INTERNAL organism — it is NOT re-exported from the
// package root (`src/components/organisms/index.ts` only exports FullGraph and
// ConfigurableNode), so it cannot be imported from
// '@theclearsky/react-blender-nodes'. Import it via the internal path:
import { NodeRunnerPanel } from '@/components/organisms/NodeRunnerPanel';
import { RecordingViewStateProvider } from '@/components/organisms/FullGraph/RecordingViewStateContext';

// NodeRunnerPanel MUST be rendered inside a RecordingViewStateProvider,
// which owns isRunnerPanelOpen / selectedStepIndex / edgeValuesAnimated.
<RecordingViewStateProvider>
  {/* The drawer pins itself to the bottom of the nearest positioned parent */}
  <div className='relative flex min-h-[600px] flex-col justify-end'>
    <NodeRunnerPanel
      runnerState={runnerState} // RunnerState from useNodeRunner
      record={executionRecord} // ExecutionRecord | null
      currentStepIndex={currentStepIndex}
      onRun={run}
      onPause={pause}
      onStep={step}
      onStop={stop}
      onReset={reset}
      mode={mode} // 'instant' | 'stepByStep'
      onModeChange={setMode}
      maxLoopIterations={maxLoopIterations}
      onMaxLoopIterationsChange={setMaxLoopIterations}
      onScrubTo={replayTo}
      onNavigateToNode={(nodeId) => focusCanvasOn(nodeId)} // optional
      debugMode={false}
      hideComplexValues={false}
    />
  </div>
</RecordingViewStateProvider>;
```

In practice you rarely wire this by hand: pass `functionImplementations` to
`FullGraph` and it renders `RunnerOverlay` -> NodeRunnerPanel for you. See
`src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.stories.tsx` ›
`NodeRunnerPanel` for self-contained mock-data examples of every runner state
(idle, compiling, running, paused, completed, errored) and scenario (half-adder,
full-adder, large pipeline, loops, loop-with-error, groups, nested groups,
loop-inside-group).
