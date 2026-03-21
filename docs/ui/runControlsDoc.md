# RunControls

## Overview

RunControls is the transport bar molecule component that provides playback-style
controls for graph execution. It renders as a single horizontal bar with four
distinct sections separated by vertical dividers:

```
+-----------------------------------------------------------------------+
| [*] Status | [>] [||] [>>] [[]  [<-] | [Instant|Step] | Max loops: [___] |
+-----------------------------------------------------------------------+
  indicator    action buttons              mode toggle     iterations input
```

The component is a controlled (stateless) component -- all state and callbacks
are passed in via props. It is designed to be embedded inside the
NodeRunnerPanel organism.

**Source:** `src/components/molecules/RunControls/RunControls.tsx`

## Props (RunControlsProps)

| Prop                        | Type                      | Description                                            |
| --------------------------- | ------------------------- | ------------------------------------------------------ |
| `runnerState`               | `RunnerState`             | Current runner state machine state                     |
| `onRun`                     | `() => void`              | Start or resume execution                              |
| `onPause`                   | `() => void`              | Pause a running execution                              |
| `onStep`                    | `() => void`              | Execute one step forward (starts step-by-step if idle) |
| `onStop`                    | `() => void`              | Stop and cancel execution                              |
| `onReset`                   | `() => void`              | Reset runner back to idle                              |
| `mode`                      | `RunMode`                 | Current execution mode (`'instant'` or `'stepByStep'`) |
| `onModeChange`              | `(mode: RunMode) => void` | Change execution mode                                  |
| `maxLoopIterations`         | `number`                  | Max loop iterations before error                       |
| `onMaxLoopIterationsChange` | `(max: number) => void`   | Update max loop iterations                             |

`RunMode` is a local type defined in RunControls: `'instant' | 'stepByStep'`.
This is distinct from the `RunMode` exported from `types.ts`
(`'performance' | 'debug'`), though they map to the same concepts (instant =
performance, stepByStep = debug).

## Button States by RunnerState

The component derives five boolean flags from `runnerState` to control which
buttons are enabled:

```
canRun   = idle | errored
canPause = running
canStep  = paused | idle | errored
canStop  = running | paused
canReset = completed | errored
canEdit  = idle | completed | errored   (controls mode toggle + max iterations input)
```

Full enable/disable matrix:

```
              +-------+-------+-------+-------+-------+----------+----------+
              |  Run  | Pause |  Step |  Stop | Reset |   Mode   | Max Loop |
              |  [>]  | [||]  | [>>]  |  [[]  | [<-]  |  Toggle  |  Input   |
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

- **compiling** disables everything -- the user must wait for compilation to
  finish.
- **running** only allows Pause and Stop -- no mode changes mid-execution.
- **paused** only allows Step (advance one step) and Stop (cancel).
- **idle** and **errored** share the same enable pattern except Reset (errored
  allows Reset, idle does not).

### Status Indicator

Each `RunnerState` has an associated status dot with color and optional pulse
animation:

```
idle       -> dark gray dot, no pulse,   label "Idle"
compiling  -> blue dot,      pulsing,    label "Compiling"
running    -> green dot,     pulsing,    label "Running"
paused     -> yellow dot,    no pulse,   label "Paused"
completed  -> green dot,     no pulse,   label "Completed"
errored    -> red dot,       no pulse,   label "Error"
```

Pulsing states (`compiling`, `running`) use both `animate-pulse` on the dot and
an overlaid `animate-ping` ring for emphasis.

### Active State Highlight

The Run button receives an `active` prop when `runnerState === 'running'`,
giving it a blue background with a glow shadow. No other button uses the active
highlight.

## Mode Toggle

A two-segment toggle button with options:

```
+----------+--------------+
| Instant  | Step-by-Step |
+----------+--------------+
```

- **Instant** (`'instant'`): Runs the entire graph without pausing between
  steps. Corresponds to `'performance'` RunMode in the runner types.
- **Step-by-Step** (`'stepByStep'`): Pauses after each execution step, allowing
  inspection. Corresponds to `'debug'` RunMode in the runner types.

The active segment is highlighted with `bg-primary-blue`. The toggle is disabled
(with `cursor-not-allowed opacity-50`) when `canEdit` is false -- i.e., during
`compiling`, `running`, or `paused` states. This prevents mode changes
mid-execution.

## Max Loop Iterations

A numeric input field labeled "Max loops:" that controls the maximum number of
iterations a loop structure is allowed to execute before the runner raises an
error.

- **Default value:** 10000 (from stories)
- **Minimum value:** 1 (HTML `min` attribute)
- **Validation:** Only accepts integer values > 0 via `parseInt` + `isNaN`
  check. Invalid or non-positive values are silently ignored (the callback is
  not fired).
- **Disabled** when `canEdit` is false (same as the mode toggle).
- Spin buttons are hidden via CSS (`appearance: textfield` and webkit
  overrides).

This value maps to `LoopExecutionBlock.maxIterations` in the compiled execution
plan and `RunSession.maxLoopIterations` in the session model.

## Limitations and Deprecated Patterns

- **No Resume button:** The Run button doubles as resume when in a paused state
  conceptually, but the current `canRun` logic does NOT enable Run during
  `paused`. Resuming from pause must be done through the Step button or by the
  parent component managing state transitions. This may be a deliberate design
  choice to force step-by-step advancement when paused.
- **Local RunMode vs types.ts RunMode:** The component defines its own
  `RunMode = 'instant' | 'stepByStep'`, while `types.ts` exports
  `RunMode = 'performance' | 'debug'`. The parent component (NodeRunnerPanel) is
  responsible for mapping between these two representations.
- **No keyboard shortcuts:** Transport controls are mouse-only. No `onKeyDown`
  handlers or global hotkeys are registered.
- **No progress indicator:** The component shows state but not progress (e.g.,
  "step 5/20"). Progress is handled by the NodeRunnerPanel via the `RunProgress`
  type.

## Relationships with Other Features

### -> [NodeRunnerPanel](nodeRunnerPanelDoc.md)

RunControls is embedded as a child of the NodeRunnerPanel organism. The panel:

- Owns the `RunnerState` and passes it down as a prop.
- Provides all callback handlers (`onRun`, `onPause`, etc.) that trigger state
  transitions in the runner hook.
- Maps between RunControls' local `RunMode` (`'instant'`/`'stepByStep'`) and the
  runner's `RunMode` (`'performance'`/`'debug'`).
- Manages `maxLoopIterations` as part of `NodeRunnerPanelSettings` and feeds the
  current value to RunControls.

```
+--------------------------------------------------+
|  NodeRunnerPanel (organism)                      |
|                                                  |
|  +--------------------------------------------+ |
|  | RunControls (molecule)                      | |
|  | [*] Status | [>][||][>>][[][<-] | Mode | ML | |
|  +--------------------------------------------+ |
|                                                  |
|  +--------------------------------------------+ |
|  | ExecutionTimeline (molecule)                | |
|  +--------------------------------------------+ |
|                                                  |
|  +--------------------------------------------+ |
|  | ExecutionStepInspector (molecule)           | |
|  +--------------------------------------------+ |
+--------------------------------------------------+
```

### -> [Runner Hook (RunnerState)](../runner/runnerHookDoc.md)

The `RunnerState` type is a discriminated string union defined in `types.ts`:

```
'idle' | 'compiling' | 'running' | 'paused' | 'completed' | 'errored'
```

The runner hook (`useNodeRunner`) manages a state machine with these states.
RunControls does not drive transitions directly -- it merely calls callback
props that the hook processes to determine the next valid state. The state
machine flow:

```
                    +--------+
              +---->| idle   |<-----------+
              |     +--------+            |
              |       |    |              |
              |   onRun  onStep        onReset
              |       |    |              |
              |       v    v              |
              |   +-----------+     +-----------+
              |   | compiling |     | completed |
              |   +-----------+     +-----------+
              |       |                   ^
              |       v                   |
              |   +---------+  onPause  +--------+
              |   | running |---------->| paused |
              |   +---------+           +--------+
              |       |                   |
              |    onStop              onStep / onStop
              |       |                   |
              |       v                   v
              |   +---------+         +---------+
              +---| errored |<--------| errored |
                  +---------+         +---------+
```

Note: `onStop` transitions to `errored` in the interactive story demo, signaling
a user-cancelled run.
