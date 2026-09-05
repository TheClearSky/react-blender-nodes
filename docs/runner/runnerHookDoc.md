# Runner Hook (useNodeRunner)

## Overview

`useNodeRunner` is the React hook that integrates the runner system (compiler +
executor) into the component tree. It is the sole bridge between the pure-logic
runner pipeline and the React rendering lifecycle. The hook manages a state
machine (`idle -> compiling -> running -> completed/errored`, with `paused` for
step-by-step mode), exposes control actions (`run`, `pause`, `resume`, `step`,
`stop`, `reset`), maintains per-node visual states for graph overlays, and
provides replay capabilities via `replayTo` and record loading via `loadRecord`.

The hook supports a **controlled or uncontrolled execution record**. When
`executionRecord` is passed in (even `null`), the hook treats the record as
controlled and reports every change up through `onExecutionRecordChange`;
otherwise it owns the record in internal state.

The hook is consumed by the `RunnerOverlay` component (its own file,
`src/components/organisms/FullGraph/RunnerOverlay.tsx` › `RunnerOverlay`), which
is rendered by `FullGraph` only when `functionImplementations` is provided.
`RunnerOverlay` feeds the runner's visual states into a `RunnerContext.Provider`
so that `ConfigurableNodeReactFlowWrapper` instances can render
`NodeStatusIndicator` overlays without prop drilling.

> **Packaging note (API surface):** `useNodeRunner` is exported from
> `src/utils/nodeRunner/index.ts`, but `src/utils/index.ts` (the package's
> public barrel) re-exports only `./nodeRunner/runTargets` plus a few named
> compiler symbols — so `useNodeRunner` and `execute` are **not** importable
> from `'react-blender-nodes'`, while `compile`, `serializeExecutionPlan` and
> `DEFAULT_MAX_LOOP_ITERATIONS` **are**. Call `compile` with three arguments —
> its trailing `depth` parameter is `@internal` (the recursion counter the
> sub-compilers thread) and must not be passed. The run-target surface IS:
> `ExecutionRecorder` (with its `RecorderScopeToken` / `StructureParentContext`
> / `RecorderWarning` types), `formatGraphError`, the run-target values, and the
> IR/record types are all root-importable via the runTargets barrel (see
> `src/utils/nodeRunner/runTargets/index.ts`). The supported UI path to the
> runner remains `FullGraph`'s optional `functionImplementations` prop, which
> makes `FullGraph` mount `RunnerOverlay` internally; the `ExecutionRecord`
> shape is also reachable through `FullGraph`'s `executionRecord` /
> `onExecutionRecordChange` props and the import/export helpers.

**Source file:** `src/utils/nodeRunner/useNodeRunner.ts` › `useNodeRunner`

---

## Entity-Relationship Diagram

```
┌──────────────────────┐        ┌─────────────────────┐
│   useNodeRunner      │        │   State             │
│   (hook instance)    │ reads  │   (nodes, edges,    │
│                      │◄───────│    typeOfNodes,     │
│ Owns:                │        │    dataTypes)       │
│ - runnerState        │        └─────────────────────┘
│ - nodeVisualStates   │                 │
│ - nodeWarnings       │                 │ fed to
│ - nodeErrors         │                 v
│ - executionRecord    │        ┌─────────────────────┐
│   (controlled OR     │        │ FunctionImpl's      │
│    internal)         │        │ (user-provided      │
│ - currentStepIndex   │        │  per node type)     │
│ - mode               │        └─────────────────────┘
│ - maxLoopIterations  │                 │
└──────┬───────────────┘                 │ passed to
       │                                 │
       │ calls                           v
       v                        ┌──────────────────────┐
┌──────────────────┐            │    Executor          │
│    Compiler      │──────────> │    execute()         │
│    compile()     │  produces  │    executeStepByStep()│
│                  │  Exec.     │                      │
│  Produces:       │  Plan      │  Produces:           │
│  ExecutionPlan   │            │  ExecutionRecord     │
│  (IR with levels)│            │  (steps, errors,     │
└──────────────────┘            │   timing, values)    │
                                └──────────┬───────────┘
                                           │
                                           │ consumed by
                                           v
                                ┌──────────────────────┐
                                │ RunnerOverlay        │
                                │ (FullGraph child)    │
                                │                      │
                                │ Merges into:         │
                                │ RunnerContext        │
                                │   .nodeRunnerStates  │
                                └──────────┬───────────┘
                                           │
                                           v
                                ┌──────────────────────┐
                                │ ConfigurableNode     │
                                │   NodeStatusIndicator│
                                │   (outline overlay)  │
                                └──────────────────────┘
```

---

## Functional Dependency Diagram

```
useNodeRunner({ state, functionImplementations, options,
                executionRecord?, onExecutionRecordChange? })
│
├── controlled-record bridge
│   ├── isControlled = executionRecord !== undefined
│   ├── executionRecord = isControlled ? controlledRecord : internalRecord
│   └── setExecutionRecord(record)
│       ├── lastSetRecordRef.current = record   (distinguish own vs external)
│       ├── if (!isControlled) setInternalRecord(record)
│       └── onExecutionRecordChange?.(record)
│
├── external-sync effect (controlled only)
│   └── on a TRULY external record change (not lastSetRecordRef):
│       rebuild currentStepIndex / nodeErrors / nodeVisualStates / runnerState
│
├── detectWarnings(state, functionImplementations)
│   └── Runs on state.nodes / state.typeOfNodes / impl change (useEffect)
│   └── Skips: isStandardNodeType, isLoopNode, isSwitchNode, group instances
│   └── Produces: nodeWarnings Map<nodeId, string[]>
│
├── compileGraph()
│   └── compile(state, functionImplementations, { maxLoopIterations })
│   └── Produces: ExecutionPlan | null  (null + 'errored' on throw)
│
├── run() ─────────────────────────────────────────┐
│   ├── mode === 'instant'  ──> runInstant()       │
│   │   ├── compileGraph()                         │
│   │   ├── execute(plan, ...)                     │
│   │   └── finalizeRun(record)                    │
│   └── mode === 'stepByStep' ──> runStepByStep()  │
│       ├── compileGraph()                         │
│       ├── executeStepByStep(plan, ...)           │
│       └── gen.next() ──> pause after first step  │
│                                                  │
├── step() ────────────────────────────────────────┤
│   ├── No generator? ──> runStepByStep()          │
│   └── gen.next() ──> pause after one step        │
│                                                  │
├── stepOver() ──> drain until the yielded step's  │
│   instancePath depth ≤ the head's depth (executes│
│   THROUGH a group's interior; resume-grade guards)│
│                                                  │
├── pause() ──> shouldContinueRef = false          │
│                                                  │
├── resume() ──> drain generator until done/paused │
│                                                  │
├── stop() ──> abort + terminateGenerator()        │
│                                                  │
├── reset() ──> abort + terminate + clear to idle  │
│                                                  │
├── replayTo(stepIndex) ──────────────────────────┤
│   └── computeVisualStatesAtStep(record, index)   │
│                                                  │
├── loadRecord(record)                             │
│   ├── validateRecordAgainstGraph(record, state)  │
│   └── finalizeRun(record)                        │
│                                                  │
├── finalizeRun(record) ──────────────────────────┤
│   ├── setExecutionRecord(record)                 │
│   ├── extractNodeErrors(record)                  │
│   ├── Build final visual states from steps       │
│   ├── terminateGenerator()                       │
│   └── Set runnerState completed / errored         │
│                                                  │
├── handleNodeStateChange(nodeId, vs)              │
│   └── Updates liveVisualStatesRef (mutable map)  │
│                                                  │
├── flushVisualStates()                            │
│   └── Copies liveVisualStatesRef to React state  │
│                                                  │
└── terminateGenerator()                           │
    └── generator.return(undefined); generatorRef = null
```

---

## Data Flow Diagram

```
                          ┌──────────────────┐
                          │   Graph State    │
                          │ (nodes, edges,   │
                          │  typeOfNodes)    │
                          └────────┬─────────┘
                                   │
                   ┌───────────────┼───────────────┐
                   │               │               │
                   v               v               v
            ┌────────────┐  ┌───────────┐  ┌──────────────┐
            │detectWarns │  │ compile() │  │ FunctionImpl │
            └─────┬──────┘  └─────┬─────┘  └──────┬───────┘
                  │               │               │
                  │               v               │
                  │        ┌────────────┐         │
                  │        │ Execution  │         │
                  │        │   Plan     │         │
                  │        └─────┬──────┘         │
                  │              │                │
                  │              v                │
                  │     ┌──────────────────┐      │
                  │     │ execute() or     │◄─────┘
                  │     │ executeStepBy    │
                  │     │ Step()           │
                  │     └───────┬──────────┘
                  │             │
                  │     ┌───────┴──────────┐
                  │     │                  │
                  │     v                  v
                  │  ┌──────────┐  ┌─────────────────┐
                  │  │ onNode   │  │ ExecutionRecord  │
                  │  │ State    │  │ (steps, errors,  │
                  │  │ Change   │  │  timing, values) │
                  │  └────┬─────┘  └────────┬─────────┘
                  │       │                 │
                  │       v                 v
                  │  ┌──────────┐  ┌─────────────────────┐
                  │  │ liveVis. │  │ finalizeRun /        │
                  │  │ StatesRef│  │ replayTo / step /    │
                  │  └────┬─────┘  │ resume               │
                  │       │        │   └─ setExecutionRec.│
                  │       │        │       └─ onExecution │
                  │       │        │          RecordChange│
                  │       │        └──────────┬───────────┘
                  │       │                   │
                  v       v                   v
            ┌──────────────────────────────────────┐
            │     nodeVisualStates (React state)    │
            │     nodeWarnings    (React state)     │
            │     nodeErrors      (React state)     │
            └──────────────────┬───────────────────┘
                               │
                               v
            ┌──────────────────────────────────────┐
            │ RunnerOverlay merges into             │
            │ RunnerContext.nodeRunnerStates         │
            └──────────────────┬───────────────────┘
                               │
                               v
            ┌──────────────────────────────────────┐
            │ ConfigurableNodeReactFlowWrapper      │
            │   reads RunnerContext                 │
            │   -> NodeStatusIndicator (outline)    │
            └──────────────────────────────────────┘
```

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ FullGraph Component                                                  │
│  (mounts RecordContext.Provider for the controlled record)           │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ RunnerOverlay (rendered when functionImplementations exists)   │   │
│  │  reads useRecordContext() for controlled executionRecord        │   │
│  │                                                               │   │
│  │  ┌─────────────────────────────────────┐                      │   │
│  │  │       useNodeRunner Hook            │                      │   │
│  │  │  (executionRecord + onExecution     │                      │   │
│  │  │   RecordChange from RecordContext)  │                      │   │
│  │  │                                     │                      │   │
│  │  │  ┌───────────┐  ┌───────────┐       │                      │   │
│  │  │  │ Compiler  │  │ Executor  │       │                      │   │
│  │  │  │ compile() │─>│ execute() │       │                      │   │
│  │  │  │           │  │ execSbS() │       │                      │   │
│  │  │  └───────────┘  └─────┬─────┘       │                      │   │
│  │  │                       │             │                      │   │
│  │  │  State:               │ callbacks   │                      │   │
│  │  │  - runnerState        │             │                      │   │
│  │  │  - nodeVisualStates   │             │                      │   │
│  │  │  - nodeWarnings ◄─────┘             │                      │   │
│  │  │  - nodeErrors                       │                      │   │
│  │  │  - executionRecord                  │                      │   │
│  │  │  - currentStepIndex                 │                      │   │
│  │  │                                     │                      │   │
│  │  │  Actions:                           │                      │   │
│  │  │  run, pause, resume, step,          │                      │   │
│  │  │  stop, reset, replayTo, loadRecord  │                      │   │
│  │  └──────────────┬──────────────────────┘                      │   │
│  │                 │                                             │   │
│  │                 │ runner return values                         │   │
│  │                 v                                             │   │
│  │  ┌──────────────────────────────┐  ┌───────────────────────┐  │   │
│  │  │ RunnerContext.Provider       │  │ NodeRunnerPanel        │  │   │
│  │  │  .nodeRunnerStates (merged   │  │  RunControls          │  │   │
│  │  │   visual + warnings + errs)  │  │  ExecutionTimeline    │  │   │
│  │  │  .selectedStepRecord         │  │  ExecutionStepInsp.   │  │   │
│  │  │  .edgeValuesAnimated         │  └───────────────────────┘  │   │
│  │  └──────────────┬───────────────┘                             │   │
│  │                 │                                             │   │
│  │                 v                                             │   │
│  │  ┌──────────────────────────────┐                             │   │
│  │  │ ConfigurableNode instances   │                             │   │
│  │  │   NodeStatusIndicator        │                             │   │
│  │  │   (colored outline overlay)  │                             │   │
│  │  └──────────────────────────────┘                             │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## State Machine

`RunnerState` is
`'idle' | 'compiling' | 'running' | 'paused' | 'completed' | 'errored'` (defined
as `runnerStates` in `src/utils/nodeRunner/types.ts` › `runnerStates`). Note
there is **no distinct `'cancelled'` / `'stopped'` UI state**: both `stop()` and
an execution record whose `status === 'cancelled'` map to `runnerState`
`'errored'`.

```
                         reset() from ANY state
                    ┌──────────────────────────────────┐
                    │                                  │
                    v                                  │
              ┌──────────┐                             │
    ┌────────>│   idle    │<────────────────────────┐  │
    │         └────┬─────┘                         │  │
    │              │ run() / step()                 │  │
    │              │ [begins compilation]           │  │
    │              v                                │  │
    │         ┌──────────┐                         │  │
    │         │compiling │                         │  │
    │         └──┬───┬───┘                         │  │
    │    success │   │ error                       │  │
    │            v   └──────────────────────┐      │  │
    │     ┌──────────┐                     │      │  │
    │     │ running  │◄────── resume() ──┐ │      │  │
    │     └──┬──┬──┬─┘                   │ │      │  │
    │        │  │  │                     │ │      │  │
    │        │  │  │ pause()             │ │      │  │
    │        │  │  └───────┐             │ │      │  │
    │        │  │          v             │ │      │  │
    │        │  │     ┌──────────┐       │ │      │  │
    │        │  │     │  paused  │───────┘ │      │  │
    │        │  │     └──┬───┬──┘         │      │  │
    │        │  │        │   │            │      │  │
    │        │  │ step() │   │ error      │      │  │
    │        │  │        v   │            │      │  │
    │        │  │   running ─┘            │      │  │
    │        │  │   (single step)         │      │  │
    │        │  │        │                │      │  │
    │        │  │        v                │      │  │
    │        │  │     paused              │      │  │
    │        │  │                         │      │  │
    │        │  │ stop()                  │      │  │
    │        │  └────────────────────┐    │      │  │
    │        │                      v    │      │  │
    │        │ complete         ┌──────────┐    │  │
    │        v                  │ errored  │────┘  │
    │     ┌───────────┐        └──────────┘       │
    │     │ completed │                            │
    │     └───────────┘                            │
    │          │                                   │
    │          └───────── reset() ─────────────────┘
    │
    └── reset() from ANY state returns to idle
```

### All State Transitions

| From        | To                           | Trigger                                                          |
| ----------- | ---------------------------- | ---------------------------------------------------------------- |
| `idle`      | `compiling`                  | `run()` or `step()` called                                       |
| `compiling` | `running`                    | Compilation succeeds                                             |
| `compiling` | `errored`                    | Compilation throws                                               |
| `running`   | `paused`                     | `pause()` ends a `resume()` drain                                |
| `running`   | `paused`                     | Step completes in step-by-step mode (after yield)                |
| `running`   | `completed`                  | All steps finish, record `status !== 'cancelled'` and no errors  |
| `running`   | `errored`                    | Execution throws, record has errors, or `status === 'cancelled'` |
| `running`   | `errored`                    | `stop()` called (aborts execution)                               |
| `paused`    | `running`                    | `resume()` or `step()` called                                    |
| `paused`    | `errored`                    | Error during step or `stop()` called                             |
| `completed` | `idle`                       | `reset()` called                                                 |
| `errored`   | `idle`                       | `reset()` called                                                 |
| _any_       | `idle`                       | `reset()` called                                                 |
| _any_       | `errored`                    | `stop()` called                                                  |
| _external_  | `completed`/`errored`/`idle` | Controlled record replaced from outside (sync effect)            |

> The final row reflects the controlled-record sync effect: when a parent
> replaces `executionRecord` with a different reference (one the hook did not
> set itself), the hook recomputes `runnerState` from `record.status` /
> `record.errors` (or `'idle'` when the new record is `null`).

---

## Hook Parameters

```typescript
type UseNodeRunnerParams = {
  state: State; // graph: nodes, edges, typeOfNodes, dataTypes
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>;
  options?: {
    maxLoopIterations?: number; // default DEFAULT_MAX_LOOP_ITERATIONS (100)
    /** Observer for recorder bookkeeping warnings — the four
     *  `recorderWarningKinds`: 'orphan-promoted', 'orphan-dropped',
     *  'unclosed-scope', 'key-collision'. Threaded into the executor's
     *  ExecutionRecorder via the ExecuteRunContext; when absent the recorder
     *  dev-console.warns and stays silent in production.
     *
     *  Read from a ref at emit time, so a new inline function each render is
     *  safe (it neither restarts a run nor re-creates the runner) — but the
     *  handler runs with the LATEST render's closure, not the one from when
     *  the run started. `FullGraph` exposes the same callback as a prop. */
    onRecorderWarning?: (warning: RecorderWarning) => void;
  };
  /** Controlled execution record. When provided (even null), useNodeRunner
   *  treats the record as controlled and reads it instead of internal state. */
  executionRecord?: ExecutionRecord | null;
  /** Called whenever the execution record changes (run completes, reset, load). */
  onExecutionRecordChange?: (record: ExecutionRecord | null) => void;
};
```

`state` and the hook itself are generic over
`<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>`.

### Controlled vs. uncontrolled record

- **Uncontrolled** (no `executionRecord` prop): the hook stores the record in
  internal `useState` (`internalRecord`). `onExecutionRecordChange`, if present,
  is still called on every change.
- **Controlled** (`executionRecord` passed, including `null`): the hook reads
  `controlledRecord` and never writes internal state. Every internal change is
  pushed up through `onExecutionRecordChange`. A `lastSetRecordRef` records the
  exact reference the hook last emitted so the sync effect can ignore
  round-trips of the hook's own updates and only resync on a _truly external_
  change.
- **Lazy initial state**: `runnerState`, `nodeVisualStates`, `nodeErrors`, and
  `currentStepIndex` are lazily seeded from the record. If a record is present
  at mount, the hook starts in `'completed'` with visual states/errors computed
  at the last step
  (`computeVisualStatesAtStep(record, Math.max(0, steps.length - 1))`).

---

## UseNodeRunnerReturn Interface

```typescript
type UseNodeRunnerReturn = {
  // ── State ──────────────────────────────────
  runnerState: RunnerState; // 'idle' | 'compiling' | 'running' | 'paused' | 'completed' | 'errored'
  nodeVisualStates: ReadonlyMap<string, NodeVisualState>; // Per-node: 'idle' | 'running' | 'completed' | 'errored' | 'skipped' | 'warning'
  nodeWarnings: ReadonlyMap<string, ReadonlyArray<string>>; // Per-node compilation warnings
  nodeErrors: ReadonlyMap<string, ReadonlyArray<GraphError>>; // Per-node runtime errors
  executionRecord: ExecutionRecord | null; // Controlled or internal record
  currentStepIndex: number; // Current replay/scrubber position

  // ── Actions ────────────────────────────────
  run: () => void; // Start execution (mode-dependent)
  pause: () => void; // Pause step-by-step drain
  resume: () => void; // Resume auto-draining steps
  step: () => void; // Advance one step (or start new run)
  stop: () => void; // Abort execution immediately
  reset: () => void; // Return to idle, clear all state
  replayTo: (stepIndex: number) => void; // Reconstruct visual states at step
  loadRecord: (record: ExecutionRecord) => RecordValidationResult; // Load imported record

  // ── Settings ───────────────────────────────
  mode: UseNodeRunnerMode; // 'instant' | 'stepByStep'
  setMode: (mode: UseNodeRunnerMode) => void;
  maxLoopIterations: number; // Default: 100 (DEFAULT_MAX_LOOP_ITERATIONS)
  setMaxLoopIterations: (max: number) => void;
};
```

`useNodeRunner`, `computeVisualStatesAtStep`, and the types
`UseNodeRunnerParams`, `UseNodeRunnerReturn`, `UseNodeRunnerMode`, and
`RecordValidationResult` are exported from
`src/utils/nodeRunner/useNodeRunner.ts` › `useNodeRunner`. (The index re-exports
`useNodeRunner`, `computeVisualStatesAtStep`, and the first three types;
`RecordValidationResult` is exported from the module file but not re-exported by
`src/utils/nodeRunner/index.ts`.)

---

## Execution Modes

### Instant Mode

In instant mode (`mode === 'instant'`), `run()` delegates to `runInstant()`:

1. Clear all previous state (visual states, errors, record, step index).
2. Abort any prior `AbortController`, then create a fresh one.
3. Set `runnerState` to `'compiling'` and call `compileGraph()`.
4. If compilation succeeds, set `runnerState` to `'running'`.
5. Call
   `execute(plan, functionImplementations, state, { onNodeStateChange, abortSignal })`
   which runs all steps to completion asynchronously.
6. On completion, call `finalizeRun(record)` which sets the final visual states,
   extracts per-node errors, terminates any generator, and transitions to
   `'completed'` or `'errored'`.

The user sees the graph go from idle to running to completed in one shot.
Post-execution replay is available via the timeline scrubber calling
`replayTo()`.

### Step-by-Step Mode

In step-by-step mode (`mode === 'stepByStep'`), `run()` delegates to
`runStepByStep()`:

1. Clear all previous state and recreate the `AbortController`.
2. Set `runnerState` to `'compiling'` and call `compileGraph()`.
3. If compilation succeeds, set `runnerState` to `'running'`.
4. Call `executeStepByStep(plan, functionImplementations, state, ...)` which
   returns an `AsyncGenerator`, stored in `generatorRef`.
5. Advance the generator by one step (`gen.next()`).
6. If the step yields (not done), set the record/step index/visual states and
   transition to `'paused'`. If the generator is already done (e.g. zero steps),
   call `finalizeRun(result.value)`.
7. The user can then call `step()` to advance one more step, `resume()` to
   auto-drain all remaining steps, or `pause()` to interrupt a drain.

The `AsyncGenerator` yields `{ stepRecord, partialRecord }` after each step,
giving the hook access to the in-progress record. After each yield the hook
updates `executionRecord` (via `setExecutionRecord`, so controlled parents see
the partial record too), `currentStepIndex`, and `nodeVisualStates` (via
`computeVisualStatesAtStep(partialRecord, stepRecord.stepIndex)`).

---

## Control Actions

### run()

```
run() ──> if mode === 'instant':    runInstant()
          if mode === 'stepByStep': runStepByStep()
```

Starts a new execution from scratch. Clears all prior state. In `RunnerOverlay`,
when the runner is already `'paused'`, the panel's "Run" button calls `resume()`
instead of `run()` (see `handleRun` in
`src/components/organisms/FullGraph/RunnerOverlay.tsx` › `handleRun`) to
continue the current execution rather than starting over.

### pause()

```
pause() ──> shouldContinueRef.current = false
            setRunnerState('paused')
```

Only meaningful when `resume()` is auto-draining steps. Sets the
`shouldContinueRef` flag to `false`, which the drain loop checks on each
iteration. The loop exits and the state transitions to `'paused'`.

### resume()

```
resume() ──> if no generator: return
             shouldContinueRef = true
             setRunnerState('running')
             while (shouldContinueRef):
               gen.next()
               if done: finalizeRun(record); return
               setExecutionRecord/StepIndex/VisualStates
             if loop exits: setRunnerState('paused')  // pause() was called
```

Auto-drains the remaining steps from the `AsyncGenerator`. On each step, updates
the execution record, step index, and visual states. The drain stops when:

- The generator completes (all steps done) -> `finalizeRun()`.
- `pause()` sets `shouldContinueRef` to `false` -> transitions back to
  `'paused'`.
- An error occurs -> flush visual states, `terminateGenerator()`, transition to
  `'errored'`.

### step()

```
step() ──> if no active generator:
             runStepByStep()  // start new execution
           else:
             setRunnerState('running')
             gen.next()
             if not done: setExecutionRecord/StepIndex/VisualStates; 'paused'
             if done:     finalizeRun(record)
```

Advances the execution by exactly one step. If no generator exists (first call
or after reset), starts a fresh step-by-step run. Otherwise calls `gen.next()`
once and returns to `'paused'`.

### stop()

```
stop() ──> shouldContinueRef = false
           abortController.abort()
           terminateGenerator()      // generator.return(undefined); ref = null
           flushVisualStates()
           setRunnerState('errored')
```

Immediately aborts any in-flight execution. The `AbortSignal` propagates to the
executor, which checks it between steps. The generator is terminated via
`terminateGenerator()` (which calls `generator.return(undefined)` and nulls the
ref). The state transitions to `'errored'` (not `'idle'`) so the user can see
which nodes completed before the abort. Call `reset()` to return to `'idle'`.

### reset()

```
reset() ──> shouldContinueRef = false
            abortController.abort()
            terminateGenerator()
            liveVisualStatesRef = new Map()
            setRunnerState('idle')
            setNodeVisualStates(EMPTY)
            setNodeErrors(EMPTY)
            setExecutionRecord(null)   // notifies controlled parent
            setCurrentStepIndex(0)
```

Returns the hook to its initial state. Clears all visual states, errors, the
execution record (propagated up via `onExecutionRecordChange`), and the step
index. Can be called from any state. (Note: `reset()` does not clear
`nodeWarnings`; warnings are recomputed by the `detectWarnings` effect.)

---

## Visual State Management

### How nodeVisualStates are computed during live execution

During execution, visual states are maintained in a **mutable ref**
(`liveVisualStatesRef`) for performance, and flushed to React state at key
points:

1. **The executor calls `onNodeStateChange(nodeId, vs)`** whenever a node's
   visual state changes (e.g., `'running'` when execution starts, `'completed'`
   or `'errored'` when it finishes).
2. **`handleNodeStateChange`** writes directly to `liveVisualStatesRef.current`
   (a plain `Map`), bypassing React re-renders.
3. **`flushVisualStates()`** copies the mutable map into a new `Map` and calls
   `setNodeVisualStates()`, triggering a React re-render (guarded by
   `isMountedRef`).
4. Flush points:
   - In step-by-step mode: after each step yields, visual states are set via
     `computeVisualStatesAtStep(partialRecord, stepRecord.stepIndex)` (not
     `flushVisualStates`).
   - In instant mode: only on error (`flushVisualStates()` before `'errored'`).
   - On `stop()`: `flushVisualStates()` before `'errored'`.
   - On finalize: `finalizeRun()` builds the final visual states map from the
     complete record and sets it directly.

This two-tier approach (mutable ref + periodic flush) avoids re-rendering the
graph on every single node state change during fast instant execution.

### How nodeVisualStates are reconstructed during replay

After execution completes, visual states are reconstructed on demand by
`computeVisualStatesAtStep()`. See the **Replay** section below.

---

## Replay (replayTo)

`replayTo(stepIndex)` allows scrubbing to any point in a completed execution:

```typescript
replayTo(stepIndex: number) => void
```

It no-ops if there is no `executionRecord`.

### Algorithm: `computeVisualStatesAtStep(record, stepIndex)`

The exported function processes the execution record in three phases:

**Phase 1: Regular Step Records**

For each step in `record.steps`:

- `step.stepIndex < targetIndex` -> node is `'completed'` (or `'errored'` /
  `'skipped'` based on `step.status`).
- `step.stepIndex === targetIndex` -> node is `'running'`.
- `step.stepIndex > targetIndex` -> node is `'idle'` (only if not already set by
  an earlier step, since a node can appear multiple times across loop
  iterations).

**Phase 2: Loop Structural Node Overrides**

Loop triplet step records (LoopStart, LoopStop, LoopEnd) are appended AFTER body
steps in the record (they have high stepIndex values). Without correction,
they'd show as `'idle'` while the body replays. This phase iterates
`record.loopRecords` and, for each loop, scans all `iterations[].stepRecords` to
find the body's `[minBody, maxBody]` index range (skipping loops with no body
steps). If `targetIndex` falls within that range, it forces:

- `loopRec.loopStartNodeId` -> `'running'`
- `loopRec.loopStopNodeId` -> `'running'`
- `loopRec.loopEndNodeId` stays `'idle'` (it represents the final output after
  the loop).

**Phase 3: Group Structural Node Overrides**

Same logic for groups: it iterates `record.groupRecords`, scans
`groupRec.innerRecord.steps` for the inner `[minInner, maxInner]` range, and if
`targetIndex` falls within it, sets the group node to `'running'`.

> **Note:** there is no equivalent phase for **switch** structural nodes.
> `computeVisualStatesAtStep` does not iterate `record.switchRecords`, so during
> replay of a switch body the SwitchStart/SwitchEnd nodes are governed only by
> their Phase-1 step records.

### Clamping

The step index is clamped to `[0, record.steps.length - 1]` to prevent
out-of-bounds access.

### State Updates

`replayTo` updates:

- `currentStepIndex` (drives the timeline scrubber position),
- `liveVisualStatesRef.current` (kept in sync for consistency if execution
  resumes), and
- `nodeVisualStates` React state (triggers re-render).

---

## Record Loading (loadRecord)

```typescript
loadRecord(record: ExecutionRecord) => RecordValidationResult
```

`loadRecord` validates an imported execution record against the current graph
state and, if valid, loads it into the runner.

### Validation: `validateRecordAgainstGraph(record, state)`

**Fatal errors** (prevent loading; `valid: false`):

- Record has zero steps (`record.steps.length === 0`), message:
  `"Recording has no execution steps."`

**Warnings** (loading proceeds but issues are surfaced):

- Steps reference node IDs not present in the current graph.
- Steps reference node type IDs not registered in `state.typeOfNodes`. Standard
  node types, loop nodes (`isLoopNode`), and switch nodes (`isSwitchNode`) are
  excluded from this check. Note that group instances (`subtree`) are **not**
  excluded here — only from the unexecuted-nodes check below.
- Nodes in the current graph were not covered by any step in the record (this
  check additionally skips group-instance nodes alongside standard / loop /
  switch nodes).

### Loading Process

If validation passes (`result.valid === true`):

1. Stop any in-flight execution (`shouldContinueRef = false`, abort controller,
   `terminateGenerator()`).
2. Call `finalizeRun(record)` to load the record as if it had just completed:
   - Sets `executionRecord` to the imported record (propagated to controlled
     parents via `onExecutionRecordChange`).
   - Sets `currentStepIndex` to the last step.
   - Extracts per-node errors.
   - Builds final visual states from step statuses.
   - Sets `runnerState` to `'errored'` when `record.status === 'cancelled'` or
     `record.errors.length > 0`, else `'completed'`.

> In `RunnerOverlay`, `loadRecord` is wrapped (via `loadRecordRef`) so that on a
> valid load it also restores `record.viewState` (selected step, edge-value
> animation, run mode, max loop iterations, etc.).

### Return Value

```typescript
type RecordValidationResult = {
  valid: boolean; // true if record can be loaded
  warnings: string[]; // non-fatal mismatches
  errors: string[]; // fatal errors (only when valid=false)
};
```

---

## Integration with FullGraph

### RunnerOverlay Component

`RunnerOverlay` (in `src/components/organisms/FullGraph/RunnerOverlay.tsx` ›
`RunnerOverlay`) is rendered by `FullGraph` only when `functionImplementations`
is provided (inside a `RecordingViewStateProvider` and an `ErrorBoundary`). It:

1. Reads the controlled record from `useRecordContext()`
   (`{ executionRecord, setExecutionRecord }`), which `FullGraph` populates from
   its own `executionRecord` / `onExecutionRecordChange` props.
2. Calls
   `useNodeRunner({ state, functionImplementations, executionRecord, onExecutionRecordChange })`.
3. Builds a merged `nodeRunnerStates` map from `runner.nodeVisualStates`,
   `runner.nodeWarnings`, and `runner.nodeErrors` using `useMemo`.
4. Provides a `RunnerContext.Provider` (value: `nodeRunnerStates`,
   `selectedStepRecord`, `edgeValuesAnimated`) so child nodes can read their
   visual state from context.
5. Renders `NodeRunnerPanel` with all runner state and callbacks.
6. Exposes a record getter via `onExecutionRecordRef` (merging the live
   `viewState`) and `loadRecord` via `loadRecordRef` for import/export.
7. Syncs the panel's `selectedStepIndex` (from `RecordingViewStateContext`) to
   `runner.replayTo` and clears the selection when a new run starts
   (`runnerState === 'compiling' | 'idle'`).

### RunnerContext nodeRunnerStates

```typescript
// src/components/organisms/FullGraph/FullGraphState.ts
type NodeRunnerState = {
  visualState: NodeVisualState;
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};

type RunnerContextValue = {
  nodeRunnerStates: ReadonlyMap<string, NodeRunnerState>;
  selectedStepRecord: ExecutionStepRecord | null;
  edgeValuesAnimated: boolean;
};
```

The `nodeRunnerStates` map is built by merging three sources:

1. **Visual states**: Each node gets its `visualState` from
   `runner.nodeVisualStates`.
2. **Warnings**: Nodes with warnings get `warnings` merged. If a node has
   warnings but no visual state yet, it gets `visualState: 'warning'`.
3. **Errors**: Nodes with errors get `errors` merged. If a node has errors but
   no visual state yet, it gets `visualState: 'errored'`.

This merged map flows through `RunnerContext` to
`ConfigurableNodeReactFlowWrapper`, which reads it and passes the appropriate
state to `NodeStatusIndicator` for rendering colored outline overlays.

> `NodeRunnerState` and `RunnerContextValue` are exported from
> `FullGraphState.ts`, which _is_ reachable from the package root barrel (via
> `components -> organisms -> FullGraph -> FullGraphState`). This is the one
> runner-adjacent type that is publicly importable, unlike the
> `src/utils/nodeRunner` exports.

---

## Warnings and Errors

### Compilation Warnings (Missing Implementations)

`detectWarnings()` runs as a `useEffect` whenever `state.nodes`,
`state.typeOfNodes`, or `functionImplementations` change. For each node in the
graph, it:

- Skips built-in standard node types (`isStandardNodeType` — the 7 types, in
  source order: `groupInput`, `groupOutput`, `loopStart`, `loopEnd`, `loopStop`,
  `switchStart`, `switchEnd`).
- Skips loop nodes (`isLoopNode`).
- Skips switch nodes (`isSwitchNode`).
- Skips group node instances (`typeOfNode?.subtree`; their subtrees are checked
  by the compiler).
- For remaining nodes: if `functionImplementations[nodeTypeId]` is missing (no
  key via `hasKey`, or a falsy value), it adds a warning:
  `"No function implementation for node type \"{name}\""` (where `{name}` is the
  type's display name, falling back to the type id).

Warnings are stored in `nodeWarnings: Map<nodeId, string[]>` and appear as
orange `'warning'` overlays on nodes **before** any execution occurs.

### Runtime Errors (Per-Node)

`extractNodeErrors()` processes `record.errors` (an array of `GraphError`
objects) after execution completes, grouping them by `nodeId` into
`nodeErrors: Map<nodeId, GraphError[]>`.

Each `GraphError` (see `src/utils/nodeRunner/types.ts` › `GraphError`) contains:

- `message`: Human-readable description.
- `nodeId`, `nodeTypeId`, `nodeTypeName`: Identity of the errored node.
- `customName?`: User custom name (standard nodes only); error strings render
  `Custom : Type` when set.
- `handleId?`: Handle where the error manifested, if applicable.
- `path`: Ordered list of `GraphErrorPathEntry` (nodes in the execution path
  leading to the error).
- `loopContext?`: `{ loopStructureId, iteration, maxIterations }` if inside a
  loop.
- `groupContext?`: `{ groupNodeId, groupNodeTypeId, depth }` if inside a group.
- `timestamp`, `duration`: Timing information (ms, relative to run start).
- `originalError`: The original thrown error value.

---

## Limitations and Deprecated Patterns

- **Runner not exported from package root**: `useNodeRunner` and the rest of
  `src/utils/nodeRunner` are not re-exported by `src/utils/index.ts`, so they
  cannot be imported from `'react-blender-nodes'`. Consume the runner through
  `FullGraph`'s `functionImplementations` prop (and `executionRecord` /
  `onExecutionRecordChange` for the controlled record).
- **No breakpoint support**: The step-by-step mode pauses after every step.
  There is no mechanism to set breakpoints on specific nodes and run until a
  breakpoint is hit.
- **No partial replay values**: `replayTo()` reconstructs visual states only. It
  does not reconstruct the `ValueStore` at the target step; the full
  `finalValues` snapshot is only available for the end state.
- **No switch override during replay**: unlike loops and groups,
  `computeVisualStatesAtStep` has no phase that forces SwitchStart/SwitchEnd to
  `'running'` while a switch body replays.
- **Single execution**: Only one execution can be active at a time. Starting a
  new `run()` clears the previous record.
- **No distinct cancelled state**: `stop()` and a `'cancelled'` record status
  both surface as `runnerState === 'errored'`; there is no separate
  `'cancelled'` / `'stopped'` UI state.
- **Mutable ref pattern**: `liveVisualStatesRef` is a mutable `Map` outside of
  React's state management. This is intentional for performance but means visual
  states during execution are not captured in React DevTools until flushed.
- **Deprecated step fields**: `ExecutionStepRecord.parentLoopStructureId` and
  `parentLoopIteration` are marked `@deprecated` in favor of hierarchical
  `LoopIterationRecord.nestedLoopRecords`; the hook itself does not read them.

---

## Examples

> The imports below use the internal source path `src/utils/nodeRunner` to
> reflect that `useNodeRunner` is **not** re-exported from the package root
> (`src/utils/index.ts` does not re-export `./nodeRunner`). In an application
> you would normally pass `functionImplementations` to `FullGraph` and let it
> mount the runner; these examples show the hook directly only for illustration.

### Basic Usage (Instant Mode)

```tsx
import { useNodeRunner } from 'src/utils/nodeRunner';

function MyRunner({ state, implementations }) {
  const runner = useNodeRunner({
    state,
    functionImplementations: implementations,
  });

  return (
    <div>
      <button onClick={runner.run} disabled={runner.runnerState === 'running'}>
        Run
      </button>
      <button onClick={runner.reset}>Reset</button>
      <p>Status: {runner.runnerState}</p>
      <p>Steps: {runner.executionRecord?.steps.length ?? 0}</p>
    </div>
  );
}
```

### Step-by-Step Mode with Replay

```tsx
function DebugRunner({ state, implementations }) {
  const runner = useNodeRunner({
    state,
    functionImplementations: implementations,
  });

  // Switch to step-by-step mode
  useEffect(() => runner.setMode('stepByStep'), []);

  return (
    <div>
      <button onClick={runner.step}>Step</button>
      <button onClick={runner.resume}>Resume</button>
      <button onClick={runner.pause}>Pause</button>
      <button onClick={runner.reset}>Reset</button>

      {/* Timeline scrubber */}
      {runner.executionRecord && (
        <input
          type='range'
          min={0}
          max={runner.executionRecord.steps.length - 1}
          value={runner.currentStepIndex}
          onChange={(e) => runner.replayTo(Number(e.target.value))}
        />
      )}
    </div>
  );
}
```

### Controlled Execution Record

```tsx
function ControlledRunner({ state, implementations }) {
  const [record, setRecord] = useState<ExecutionRecord | null>(null);

  const runner = useNodeRunner({
    state,
    functionImplementations: implementations,
    executionRecord: record, // controlled
    onExecutionRecordChange: setRecord, // hook reports every change up
  });

  // `record` now mirrors runner.executionRecord and can be persisted/exported.
  return <button onClick={runner.run}>Run</button>;
}
```

### Loading an Imported Record

```tsx
function ImportPanel({ runner }) {
  const handleImport = (json: string) => {
    const record = JSON.parse(json); // (simplified; use importExecutionRecord)
    const result = runner.loadRecord(record);

    if (!result.valid) {
      console.error('Cannot load:', result.errors);
    } else if (result.warnings.length > 0) {
      console.warn('Loaded with warnings:', result.warnings);
    }
    // Record is now loaded; runner.executionRecord is set
  };

  return <button onClick={() => handleImport(clipboardText)}>Import</button>;
}
```

---

## Relationships with Other Features

### -> [Runner Compiler](runnerCompilerDoc.md)

`useNodeRunner` calls
`compile(state, functionImplementations, { maxLoopIterations })` via its
`compileGraph()` helper. The compiler produces an `ExecutionPlan` (the
intermediate representation). If compilation throws, `compileGraph()` returns
`null` and the hook transitions to `'errored'`.

### -> [Runner Executor](runnerExecutorDoc.md)

The hook uses two executor entry points:

- `execute(plan, ...)`: Returns `Promise<ExecutionRecord>`. Used in instant
  mode.
- `executeStepByStep(plan, ...)`: Returns
  `AsyncGenerator<{ stepRecord, partialRecord }, ExecutionRecord>`. Used in
  step-by-step mode. Yields after each step for manual advancement. The hook
  terminates an in-flight generator via `generator.return(undefined)`
  (`terminateGenerator()`).

### -> [Execution Recording](executionRecordingDoc.md)

The executor produces an `ExecutionRecord` containing all step records, timing
data (including `warmupDuration` and `totalPauseDuration`), errors, and
`loopRecords` / `switchRecords` / `groupRecords` maps. The hook stores this in
`executionRecord` state (controlled or internal) and uses it for replay via
`replayTo()` and for exporting via `RunnerOverlay`'s `onExecutionRecordRef`.

### -> [FullGraph Component](../ui/fullGraphDoc.md)

`FullGraph` conditionally renders `RunnerOverlay` when `functionImplementations`
is provided, wraps it in a `RecordContext.Provider` (controlled record) and a
`RecordingViewStateProvider`, and exposes the record via its own
`executionRecord` / `onExecutionRecordChange` props.

### -> [NodeRunnerPanel](../ui/nodeRunnerPanelDoc.md)

The `NodeRunnerPanel` organism receives all runner state and callbacks as props
from `RunnerOverlay`:

- `runnerState` -> enables/disables control buttons.
- `record` + `currentStepIndex` -> drives the `ExecutionTimeline`.
- `onRun` (wrapped `handleRun`), `onPause`, `onStep`, `onStop`, `onReset` ->
  `RunControls` buttons.
- `onScrubTo` -> wired to `runner.replayTo`.
- `onNavigateToNode` -> centers the canvas on a node.
- `mode`, `onModeChange` -> mode toggle.
- `maxLoopIterations`, `onMaxLoopIterationsChange` -> settings.

### -> [NodeStatusIndicator](../ui/nodeStatusIndicatorDoc.md)

`ConfigurableNodeReactFlowWrapper` reads `nodeRunnerStates` from `RunnerContext`
(via `useContext`) and forwards the per-node `visualState` / `errors` /
`warnings` as `runnerVisualState` / `runnerErrors` / `runnerWarnings` props to
`ConfigurableNode`, which is what actually renders `NodeStatusIndicator`. Each
node's `visualState` determines its outline color overlay (green = completed,
red = errored, blue = running, orange = warning, gray = skipped).

### -> [State Management](../core/stateManagementDoc.md)

The hook reads `State` (nodes, edges, typeOfNodes) but never writes to it. State
mutations only happen through the graph store's `dispatch` in `FullGraph`. The
hook's `detectWarnings` effect re-runs when `state.nodes` / `state.typeOfNodes`
change, keeping warnings in sync.
