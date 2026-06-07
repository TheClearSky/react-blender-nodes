# RunControls

## Overview

`RunControls` is the transport-bar molecule component that provides
playback-style controls for graph execution. It renders as a single horizontal
bar with four sections separated by vertical dividers:

```
+-----------------------------------------------------------------------------+
| ● Status | [▶] [⏸] [⏭] [⏹] [↺] | [Instant|Step-by-Step] | Max Loops: [100] |
+-----------------------------------------------------------------------------+
  indicator    action buttons         mode toggle           max-iterations slider
```

The component is fully controlled (stateless) — all state and callbacks are
passed in via props. It is designed to be embedded inside the `NodeRunnerPanel`
organism.

**Source:** `src/components/molecules/RunControls/RunControls.tsx` ›
`RunControls`

The file exports the `RunControls` component plus the `RunControlsProps` and
`RunMode` types (`src/components/molecules/RunControls/RunControls.tsx` ›
`RunControlsProps`). `index.ts` re-exports everything from the component file.

## Dependencies

`RunControls` composes several lower-level building blocks rather than rendering
raw inputs itself:

| Import                                                | From                                       | Role                                          |
| ----------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `Play`, `Pause`, `SkipForward`, `Square`, `RotateCcw` | `lucide-react`                             | Icons for Run / Pause / Step / Stop / Reset   |
| `cn`                                                  | `@/utils`                                  | Tailwind class merge helper                   |
| `SliderNumberInput`                                   | `@/components/molecules/SliderNumberInput` | The "Max Loops" drag/slider/number input      |
| `Tooltip`                                             | `@/components/atoms/Tooltip`               | Wraps the mode toggle and the slider          |
| `ButtonToggle`                                        | `@/components/molecules/ButtonToggle`      | The two-segment Instant / Step-by-Step toggle |
| `RunnerState` (type)                                  | `@/utils/nodeRunner/types`                 | The runner state-machine union                |

Note: `RunnerState` is imported from `@/utils/nodeRunner/types`, **not** a
top-level `types.ts`. The same file defines and exports `runnerStates` (used by
the story's `argTypes`).

## Props (`RunControlsProps`)

| Prop                        | Type                      | Description                                            |
| --------------------------- | ------------------------- | ------------------------------------------------------ |
| `runnerState`               | `RunnerState`             | Current runner state-machine state                     |
| `onRun`                     | `() => void`              | Start or resume execution                              |
| `onPause`                   | `() => void`              | Pause a running execution                              |
| `onStep`                    | `() => void`              | Execute one step forward (starts step-by-step if idle) |
| `onStop`                    | `() => void`              | Stop and cancel execution                              |
| `onReset`                   | `() => void`              | Reset runner back to idle                              |
| `mode`                      | `RunMode`                 | Current execution mode (`'instant'` or `'stepByStep'`) |
| `onModeChange`              | `(mode: RunMode) => void` | Change execution mode                                  |
| `maxLoopIterations`         | `number`                  | Max loop iterations before error                       |
| `onMaxLoopIterationsChange` | `(max: number) => void`   | Update max loop iterations                             |

All props are required — there are no optional props and no default values on
the component itself.

### `RunMode` — `'instant' | 'stepByStep'`

`RunControls` defines and exports its own `RunMode` type:

```ts
type RunMode = 'instant' | 'stepByStep';
```

This is the representation used **end-to-end** by the transport UI and the
runner hook: `RunControls` → `NodeRunnerPanel`
(`NodeRunnerPanelProps.mode: RunMode`, imported from RunControls) →
`RunnerOverlay` → `useNodeRunner`
(`UseNodeRunnerMode = 'instant' | 'stepByStep'`). No component in this chain
converts to or from any other mode representation.

There is a **separate, unrelated** `RunMode` exported from
`@/utils/nodeRunner/types` whose values are `'performance' | 'debug'`
(`src/utils/nodeRunner/types.ts` › `RunMode`). That type is the **data-model**
mode stored on `RunSession.mode` and `NodeRunnerPanelSettings.mode` (the
persisted session/settings model). It is conceptually parallel —
`instant ≈ performance`, `stepByStep ≈ debug` — but it is **not** the type
flowing through RunControls or the runner hook. Do not confuse the two: the live
transport chain uses `'instant' | 'stepByStep'`.

## Button Enable Logic (derived from `runnerState`)

The component derives boolean flags from `runnerState` to control which controls
are enabled (`src/components/molecules/RunControls/RunControls.tsx` ›
`RunControls`):

```
canEdit  = idle | completed | errored      (gates mode toggle + max-loops slider)
canRun   = idle | errored
canPause = running
canStep  = paused | idle | errored
canStop  = running | paused
canReset = completed | errored
```

Full enable/disable matrix:

```
              +-------+-------+-------+-------+-------+----------+----------+
              |  Run  | Pause | Step  | Stop  | Reset |   Mode   | Max Loop |
              |  [▶]  | [⏸]  | [⏭]  | [⏹]  | [↺]  |  Toggle  |  Slider  |
+-------------+-------+-------+-------+-------+-------+----------+----------+
| idle        |  ON   |  off  |  ON   |  off  |  off  |    ON    |    ON    |
| compiling   |  off  |  off  |  off  |  off  |  off  |   off    |   off    |
| running     |  off  |  ON   |  off  |  ON   |  off  |   off    |   off    |
| paused      |  off  |  off  |  ON   |  ON   |  off  |   off    |   off    |
| completed   |  off  |  off  |  off  |  off  |  ON   |    ON    |    ON    |
| errored     |  ON   |  off  |  ON   |  off  |  ON   |    ON    |    ON    |
+-------------+-------+-------+-------+-------+-------+----------+----------+
```

Key observations:

- **compiling** disables everything — the user must wait for compilation to
  finish.
- **running** allows only Pause and Stop — no mode/iteration changes
  mid-execution.
- **paused** allows only Step (advance one step) and Stop (cancel). Note Run is
  **disabled** while paused (see "Resume semantics" below).
- **idle** and **errored** share the same Run/Step pattern; they differ only in
  Reset (errored enables Reset, idle does not — there is nothing to reset from
  idle).

## Status Indicator

The leftmost section is a fixed-width (`w-[140px]`) status block: a colored dot
plus a text label. Each `RunnerState` maps to an entry in `STATUS_CONFIG`
(`src/components/molecules/RunControls/RunControls.tsx` › `STATUS_CONFIG`) with
a Tailwind color class, a pulse flag, and a label:

| `runnerState` | Color class              | Resolved color    | Pulse | Label       |
| ------------- | ------------------------ | ----------------- | ----- | ----------- |
| `idle`        | `bg-secondary-dark-gray` | dark gray         | no    | `Idle`      |
| `compiling`   | `bg-primary-blue`        | blue              | yes   | `Compiling` |
| `running`     | `bg-status-completed`    | green (`#4caf50`) | yes   | `Running`   |
| `paused`      | `bg-status-warning`      | amber (`#ffa500`) | no    | `Paused`    |
| `completed`   | `bg-status-completed`    | green (`#4caf50`) | no    | `Completed` |
| `errored`     | `bg-status-errored`      | red (`#ff4444`)   | no    | `Error`     |

Color tokens are defined in `src/index.css` (`--color-status-completed`,
`--color-status-warning`, `--color-status-errored`, etc.).

**Pulse behavior:** pulsing states (`compiling`, `running`) render the dot with
both `animate-pulse` and a `shadow-[0_0_8px_currentColor]` glow, plus an
absolutely-positioned overlay dot with `animate-ping` at `opacity-50` for a
radiating-ring effect. Non-pulsing states render a static dot.

## Action Buttons

The five action buttons are rendered by an internal `ActionButton` sub-component
(`src/components/molecules/RunControls/RunControls.tsx` › `ActionButton`). Each
button takes `icon`, `onClick`, `disabled`, an optional `active` flag, a
`variant` (`'default' | 'play'`), and a `title` (used as the native tooltip /
accessible label).

| Button | Icon          | Variant     | `onClick` | `disabled` when | `active` when             | `title` |
| ------ | ------------- | ----------- | --------- | --------------- | ------------------------- | ------- |
| Run    | `Play`        | `'play'`    | `onRun`   | `!canRun`       | `runnerState==='running'` | `Run`   |
| Pause  | `Pause`       | `'default'` | `onPause` | `!canPause`     | —                         | `Pause` |
| Step   | `SkipForward` | `'default'` | `onStep`  | `!canStep`      | —                         | `Step`  |
| Stop   | `Square`      | `'default'` | `onStop`  | `!canStop`      | —                         | `Stop`  |
| Reset  | `RotateCcw`   | `'default'` | `onReset` | `!canReset`     | —                         | `Reset` |

Styling details:

- **Play variant** is larger (`h-8 w-8`, rounded-md) with a permanent
  `bg-primary-blue`, white icon, and a blue glow shadow
  (`shadow-[0_0_12px_rgba(74,120,194,0.4)]`). On hover (when enabled) it gets
  `brightness-110`. The Play icon uses `fill-current`.
- **Default variant** is smaller (`h-7 w-7`, rounded). When enabled and not
  active it gets a `hover:bg-primary-dark-gray hover:text-white` hover state.
- **Active (default variant only):** when `active` is true the button gets
  `bg-primary-blue` plus a `shadow-[0_0_8px_rgba(71,114,179,0.5)]` glow. In
  practice this is only the Run button at `runnerState === 'running'` — but
  since Run is the `'play'` variant, the active highlight branch
  (`active && !isPlay`) never actually applies. Only the Play variant's own
  styling is visible. (No default-variant button is ever passed `active`.)
- **Disabled:** `cursor-not-allowed opacity-30` (note: 30% opacity, applied to
  both variants).
- **Focus:** enabled buttons get
  `focus-visible:ring-1 focus-visible:ring-primary-blue`.
- All buttons use the shared `btn-press` class for the active-press transform
  (defined in `src/index.css`).

## Mode Toggle

The mode toggle is a `ButtonToggle` (`size='small'`) wrapped in a `Tooltip`
(`src/components/molecules/RunControls/RunControls.tsx` › `RunControls`). Its
options come from the module-level constant `RUN_MODE_OPTIONS`:

```ts
const RUN_MODE_OPTIONS = [
  { value: 'instant' as const, label: 'Instant' },
  { value: 'stepByStep' as const, label: 'Step-by-Step' },
];
```

```
+----------+--------------+
| Instant  | Step-by-Step |
+----------+--------------+
```

- **Instant** (`'instant'`): runs the entire graph at once, then enables replay
  via the timeline. No pauses between steps.
- **Step-by-Step** (`'stepByStep'`): pauses after each execution step so the
  user can inspect intermediate values.

`ButtonToggle` highlights the active segment with `bg-primary-blue text-white`
and renders inactive segments with `bg-[#1a1a1a] text-secondary-light-gray`. The
toggle is `disabled` when `canEdit` is false (i.e. during `compiling`,
`running`, or `paused`); disabled inactive segments get
`cursor-not-allowed opacity-50`. Clicking a segment fires `onModeChange` with
that segment's value.

The wrapping `Tooltip` content reads: _"Instant runs the entire graph at once,
then enables replay. Step-by-Step pauses after each node so you can inspect
intermediate values."_

## Max Loop Iterations

The rightmost control is a `SliderNumberInput` (`name='Max Loops'`,
`size='small'`, `decimals={0}`) wrapped in a `Tooltip`
(`src/components/molecules/RunControls/RunControls.tsx` › `RunControls`).
`SliderNumberInput` is a drag-to-adjust slider that also supports click-to-type
editing and increment/decrement chevrons; it is not a plain HTML
`<input type="number">`.

- **Value:** the controlled `maxLoopIterations` prop. The component does not set
  a default; the parent supplies one (the runner hook and stories default to
  `100`).
- **`onChange`:** the raw slider value is clamped before being forwarded:
  `onMaxLoopIterationsChange(Math.max(1, Math.round(v)))`. This rounds to the
  nearest integer and floors at `1`, so the callback always receives a positive
  integer ≥ 1.
- **`decimals={0}`:** the display shows no fractional digits.
- **Disabled state:** when `canEdit` is false, the wrapping `<div>` gets
  `pointer-events-none opacity-50` (the slider is dimmed and non-interactive).
  Note this is done on the wrapper, not via a `disabled` prop on
  `SliderNumberInput` (which has no such prop).
- **No `min`/`max`/`step` props** are passed to `SliderNumberInput`, so its drag
  step is derived from the current value's magnitude. The only lower bound is
  the `Math.max(1, …)` clamp in the `onChange` handler.

The tooltip content reads: _"Maximum loop iterations before the runner throws an
error. Protects against infinite loops."_

This value ultimately maps to `LoopExecutionBlock.maxIterations` in the compiled
execution plan (`src/utils/nodeRunner/types.ts` › `LoopExecutionBlock`) and is
captured on `RunSession.maxLoopIterations` /
`RecordingViewState.maxLoopIterations`.

## Layout & Styling

The root is a flex row:
`flex h-11 w-full items-center gap-2 border-b border-secondary-dark-gray bg-runner-toolbar-bg px-3`
(`--color-runner-toolbar-bg` = `#262626`). Sections in order:

1. Status block (`w-[140px]`): pulse-capable dot + label.
2. Vertical divider (`mx-3 h-6 w-px bg-secondary-dark-gray`).
3. Action buttons (`flex items-center gap-3`).
4. Vertical divider.
5. Mode toggle (`Tooltip` → `ButtonToggle`).
6. Max-loops slider (`Tooltip` → `ml-4` wrapper → `SliderNumberInput`).

## Stories

`RunControls.stories.tsx` (title `Molecules/RunControls`) exercises the
component. All callbacks are stubbed with `fn()`; the playground `argTypes`
drive `runnerState` (options spread from the exported `runnerStates`), `mode`
(`'instant' | 'stepByStep'`), and `maxLoopIterations` (number control,
`min: 1, max: 100000`). Notable stories:

- **Per-state stories:** `IdleState`, `RunningState`, `PausedState`,
  `CompletedState`, `ErroredState`, `CompilingState`, `StepByStepMode`.
- **`AllStatesComparison`:** renders one bar per state side-by-side to compare
  the enable/disable matrix.
- **`InteractiveLifecycle`:** a self-contained `useState` harness that simulates
  the runner lifecycle (compiling → running → completed, pause/step/stop/reset)
  and logs each transition. Note this is a **demo-only** state machine in the
  story — it does **not** reflect the real `useNodeRunner` transitions (e.g. the
  story's `handleStep` from idle forces `stepByStep` and jumps to `paused`).

## Limitations and Notes

- **Run is disabled while paused (Resume semantics):** `canRun` only enables Run
  for `idle` and `errored`, so the Run button is greyed out while `paused`. The
  resume capability still exists at the hook level — `RunnerOverlay.handleRun`
  calls `runner.resume()` when `runnerState === 'paused'` and `runner.run()`
  otherwise (`src/components/organisms/FullGraph/RunnerOverlay.tsx` ›
  `handleRun`) — but because the button is disabled in the paused state,
  resume-from-pause is effectively reached via **Step** (which advances and can
  transition `paused → running`). This is a deliberate UI choice to favour
  step-by-step advancement once paused.
- **No keyboard shortcuts:** the controls are click-only. No `onKeyDown`
  handlers or global hotkeys are registered.
- **No progress indicator:** the bar shows state but not progress (e.g. "step
  5/20"). Progress is surfaced elsewhere via the `RunProgress` type and the
  `ExecutionTimeline`.
- **No `'cancelled'`/`'stopped'` state in the bar:** Stop drives the runner to
  `errored` (the runner hook has no distinct cancelled UI state — see the runner
  hook doc). `RunControls` therefore only ever sees the six `RunnerState`
  values.

## Relationships with Other Features

### -> [NodeRunnerPanel](nodeRunnerPanelDoc.md)

`RunControls` is embedded as a child of the `NodeRunnerPanel` organism
(`src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx` ›
`NodeRunnerPanel`). The panel:

- Owns the `runnerState` and passes it straight down.
- Forwards all callbacks (`onRun`, `onPause`, `onStep`, `onStop`, `onReset`,
  `onModeChange`, `onMaxLoopIterationsChange`) unchanged.
- Declares its own `mode: RunMode` prop by **importing `RunMode` from
  RunControls** — so the panel uses the exact same `'instant' | 'stepByStep'`
  type. There is **no** translation to `'performance' | 'debug'` here.

```
+----------------------------------------------------+
|  NodeRunnerPanel (organism)                        |
|                                                    |
|  +----------------------------------------------+  |
|  | RunControls (molecule)                       |  |
|  | ● Status | [▶][⏸][⏭][⏹][↺] | Mode | MaxLoops |  |
|  +----------------------------------------------+  |
|                                                    |
|  +----------------------------------------------+  |
|  | ExecutionTimeline (molecule)                 |  |
|  +----------------------------------------------+  |
|                                                    |
|  +----------------------------------------------+  |
|  | ExecutionStepInspector (molecule)            |  |
|  +----------------------------------------------+  |
+----------------------------------------------------+
```

### -> [Runner Hook (`useNodeRunner`)](../runner/runnerHookDoc.md)

`RunControls` never drives state transitions directly — it only invokes callback
props. Those callbacks are wired (via `NodeRunnerPanel` → `RunnerOverlay`) to
the `useNodeRunner` hook: `onRun → handleRun` (`run()`/`resume()`),
`onPause → pause`, `onStep → step`, `onStop → stop`, `onReset → reset`,
`onModeChange → setMode`, `onMaxLoopIterationsChange → setMaxLoopIterations`.

`RunnerState` is the discriminated string union
`'idle' | 'compiling' | 'running' | 'paused' | 'completed' | 'errored'`
(`runnerStates` in `src/utils/nodeRunner/types.ts` › `runnerStates`). The
authoritative state machine lives in the hook; the RunControls enable matrix is
a UI projection of it. The real transitions (per the runner hook doc) are:

```
        reset() from ANY state ──────────────► idle
  idle ──run()/step()──► compiling ──► running ⇄ paused
  running ──(finish, no errors)──► completed
  running/paused ──stop()/error──► errored
  paused ──resume()/step()──► running
  completed/errored ──reset()──► idle
```

Note the UI enable rules are intentionally narrower than what the hook permits —
e.g. `reset()` works from any state in the hook, but the Reset **button** is
only enabled for `completed`/`errored` (there is nothing to reset from `idle`,
and reset is not offered mid-run).

### -> Execution Plan / Recording (max-loops)

The `maxLoopIterations` value the slider edits becomes
`LoopExecutionBlock.maxIterations` during compilation
(`src/utils/nodeRunner/types.ts` › `LoopExecutionBlock`) and is persisted on
`RunSession.maxLoopIterations` and `RecordingViewState.maxLoopIterations`. If a
loop exceeds this count at runtime the executor raises a `GraphError` with
`loopContext.maxIterations` set. See
[Runner Compiler](../runner/runnerCompilerDoc.md) and
[Execution Recording](../runner/executionRecordingDoc.md).
