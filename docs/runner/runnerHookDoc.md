# Runner Hook (useNodeRunner)

## Overview

`useNodeRunner` is the React hook that integrates the runner system (compiler +
executor) into the component tree. It is the sole bridge between the pure-logic
runner pipeline and the React rendering lifecycle. The hook manages a state
machine (`idle -> compiling -> running -> completed/errored`, with `paused` for
step-by-step mode), exposes control actions (`run`, `pause`, `resume`, `step`,
`stop`, `reset`), maintains per-node visual states for graph overlays, and
provides replay capabilities via `replayTo` and record loading via `loadRecord`.

The hook is consumed by the `RunnerOverlay` component inside `FullGraph`, which
provides the visual states to `FullGraphContext` so that `ConfigurableNode`
instances can render `NodeStatusIndicator` overlays without prop drilling.

**Source file:** `src/utils/nodeRunner/useNodeRunner.ts`

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
│ - currentStepIndex   │        │ FunctionImpl's      │
│ - mode               │        │ (user-provided      │
│ - maxLoopIterations  │        │  per node type)     │
└──────┬───────────────┘        └─────────────────────┘
       │                                 │
       │ calls                           │ passed to
       v                                 v
┌──────────────────┐           ┌──────────────────────┐
│    Compiler      │──────────>│    Executor          │
│    compile()     │  produces │    execute()         │
│                  │  Exec.    │    executeStepByStep()│
│  Produces:       │  Plan     │                      │
│  ExecutionPlan   │           │  Produces:           │
│  (IR with levels)│           │  ExecutionRecord     │
└──────────────────┘           │  (steps, errors,     │
                               │   timing, values)    │
                               └──────────┬───────────┘
                                          │
                                          │ consumed by
                                          v
                               ┌──────────────────────┐
                               │ RunnerOverlay        │
                               │ (FullGraph child)    │
                               │                      │
                               │ Merges into:         │
                               │ FullGraphContext     │
                               │   .nodeRunnerStates  │
                               └──────────┬───────────┘
                                          │
                                          v
                               ┌──────────────────────┐
                               │ ConfigurableNode     │
                               │   NodeStatusIndicator│
                               │   (border overlay)   │
                               └──────────────────────┘
```

---

## Functional Dependency Diagram

```
useNodeRunner(state, functionImplementations, options)
│
├── detectWarnings(state, functionImplementations)
│   └── Runs on every state/impl change (useEffect)
│   └── Produces: nodeWarnings Map<nodeId, string[]>
│
├── compileGraph()
│   └── compile(state, functionImplementations, { maxLoopIterations })
│   └── Produces: ExecutionPlan | null
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
├── pause() ──> shouldContinueRef = false          │
│                                                  │
├── resume() ──> drain generator until done/paused │
│                                                  │
├── stop() ──> abort + clear generator             │
│                                                  │
├── reset() ──> abort + clear all state to idle    │
│                                                  │
├── replayTo(stepIndex) ──────────────────────────┤
│   └── computeVisualStatesAtStep(record, index)   │
│                                                  │
├── loadRecord(record)                             │
│   ├── validateRecordAgainstGraph(record, state)  │
│   └── finalizeRun(record)                        │
│                                                  │
├── finalizeRun(record) ──────────────────────────┤
│   ├── extractNodeErrors(record)                  │
│   ├── Build final visual states from steps       │
│   └── Set runnerState to completed/errored       │
│                                                  │
├── handleNodeStateChange(nodeId, vs)              │
│   └── Updates liveVisualStatesRef (mutable map)  │
│                                                  │
└── flushVisualStates()                            │
    └── Copies liveVisualStatesRef to React state  │
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
                  │  ┌──────────┐   ┌──────────────┐
                  │  │ liveVis. │   │ finalizeRun  │
                  │  │ StatesRef│   │ / replayTo   │
                  │  └────┬─────┘   └──────┬───────┘
                  │       │                │
                  v       v                v
            ┌──────────────────────────────────────┐
            │     nodeVisualStates (React state)    │
            │     nodeWarnings    (React state)     │
            │     nodeErrors      (React state)     │
            └──────────────────┬───────────────────┘
                               │
                               v
            ┌──────────────────────────────────────┐
            │ RunnerOverlay merges into             │
            │ FullGraphContext.nodeRunnerStates      │
            └──────────────────┬───────────────────┘
                               │
                               v
            ┌──────────────────────────────────────┐
            │ ConfigurableNodeReactFlowWrapper      │
            │   reads context -> NodeStatusIndicator│
            │   (border color overlay per node)     │
            └──────────────────────────────────────┘
```

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ FullGraph Component                                                  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ RunnerOverlay (rendered when functionImplementations exists)   │   │
│  │                                                               │   │
│  │  ┌─────────────────────────────────────┐                      │   │
│  │  │       useNodeRunner Hook            │                      │   │
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
│  │  │ FullGraphContext.Provider    │  │ NodeRunnerPanel        │  │   │
│  │  │  .nodeRunnerStates (merged   │  │  RunControls          │  │   │
│  │  │   visual + warnings + errs)  │  │  ExecutionTimeline    │  │   │
│  │  └──────────────┬───────────────┘  │  ExecutionStepInsp.   │  │   │
│  │                 │                  └───────────────────────┘  │   │
│  │                 v                                             │   │
│  │  ┌──────────────────────────────┐                             │   │
│  │  │ ConfigurableNode instances   │                             │   │
│  │  │   NodeStatusIndicator        │                             │   │
│  │  │   (colored border overlay)   │                             │   │
│  │  └──────────────────────────────┘                             │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## State Machine

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

| From        | To          | Trigger                                    |
| ----------- | ----------- | ------------------------------------------ |
| `idle`      | `compiling` | `run()` or `step()` called                 |
| `compiling` | `running`   | Compilation succeeds                       |
| `compiling` | `errored`   | Compilation throws                         |
| `running`   | `paused`    | `pause()` called during step-by-step drain |
| `running`   | `paused`    | Step completes in step-by-step mode        |
| `running`   | `completed` | All steps finish without errors            |
| `running`   | `errored`   | Execution throws or record has errors      |
| `running`   | `errored`   | `stop()` called (aborts execution)         |
| `paused`    | `running`   | `resume()` or `step()` called              |
| `paused`    | `errored`   | Error during step or stop() called         |
| `completed` | `idle`      | `reset()` called                           |
| `errored`   | `idle`      | `reset()` called                           |
| _any_       | `idle`      | `reset()` called                           |
| _any_       | `errored`   | `stop()` called                            |

---

## UseNodeRunnerReturn Interface

```typescript
type UseNodeRunnerReturn = {
  // ── State ──────────────────────────────────
  runnerState: RunnerState; // 'idle' | 'compiling' | 'running' | 'paused' | 'completed' | 'errored'
  nodeVisualStates: ReadonlyMap<string, NodeVisualState>; // Per-node: 'idle' | 'running' | 'completed' | 'errored' | 'skipped' | 'warning'
  nodeWarnings: ReadonlyMap<string, ReadonlyArray<string>>; // Per-node compilation warnings
  nodeErrors: ReadonlyMap<string, ReadonlyArray<GraphError>>; // Per-node runtime errors
  executionRecord: ExecutionRecord | null; // Full record after execution
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
  maxLoopIterations: number; // Default: 100
  setMaxLoopIterations: (max: number) => void;
};
```

---

## Execution Modes

### Instant Mode

In instant mode (`mode === 'instant'`), `run()` delegates to `runInstant()`:

1. Clear all previous state (visual states, errors, record).
2. Create a fresh `AbortController`.
3. Set `runnerState` to `'compiling'` and call `compileGraph()`.
4. If compilation succeeds, set `runnerState` to `'running'`.
5. Call `execute(plan, ...)` which runs all steps to completion asynchronously.
6. On completion, call `finalizeRun(record)` which sets the final visual states,
   extracts per-node errors, and transitions to `'completed'` or `'errored'`.

The user sees the graph go from idle to running to completed in one shot.
Post-execution replay is available via the timeline scrubber calling
`replayTo()`.

### Step-by-Step Mode

In step-by-step mode (`mode === 'stepByStep'`), `run()` delegates to
`runStepByStep()`:

1. Clear all previous state and create a fresh `AbortController`.
2. Set `runnerState` to `'compiling'` and call `compileGraph()`.
3. If compilation succeeds, set `runnerState` to `'running'`.
4. Call `executeStepByStep(plan, ...)` which returns an `AsyncGenerator`.
5. Advance the generator by one step (`gen.next()`).
6. If the step yields (not done), flush visual states and transition to
   `'paused'`.
7. The user can then call `step()` to advance one more step, `resume()` to
   auto-drain all remaining steps, or `pause()` to interrupt a drain.

The `AsyncGenerator` yields `{ stepRecord, partialRecord }` after each step,
giving the hook access to the in-progress record.

---

## Control Actions

### run()

```
run() ──> if mode === 'instant':    runInstant()
          if mode === 'stepByStep': runStepByStep()
```

Starts a new execution from scratch. Clears all prior state. In the
`RunnerOverlay`, when the runner is already `'paused'`, the UI's "Run" button
calls `resume()` instead of `run()` to continue the current execution rather
than starting over.

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
resume() ──> shouldContinueRef = true
             setRunnerState('running')
             while (shouldContinueRef):
               gen.next()
               flush visual states
               if done: finalizeRun(record); return
             if loop exits: setRunnerState('paused')  // pause() was called
```

Auto-drains the remaining steps from the `AsyncGenerator`. On each step, updates
the execution record, step index, and flushes visual states to React. The drain
stops when:

- The generator completes (all steps done) -> `finalizeRun()`
- `pause()` sets `shouldContinueRef` to `false` -> transitions back to
  `'paused'`
- An error occurs -> transitions to `'errored'`

### step()

```
step() ──> if no active generator:
             runStepByStep()  // start new execution
           else:
             setRunnerState('running')
             gen.next()
             if not done: setRunnerState('paused')
             if done: finalizeRun(record)
```

Advances the execution by exactly one step. If no generator exists (first call
or after reset), starts a fresh step-by-step run. Otherwise, calls `gen.next()`
once and returns to `'paused'`.

### stop()

```
stop() ──> shouldContinueRef = false
           abortController.abort()
           generatorRef = null
           flushVisualStates()
           setRunnerState('errored')
```

Immediately aborts any in-flight execution. The `AbortSignal` propagates to the
executor, which checks it between steps. The state transitions to `'errored'`
(not `'idle'`) so that the user can see which nodes completed before the abort.
Call `reset()` to return to `'idle'`.

### reset()

```
reset() ──> shouldContinueRef = false
            abortController.abort()
            generatorRef = null
            liveVisualStatesRef = new Map()
            setRunnerState('idle')
            setNodeVisualStates(EMPTY)
            setNodeErrors(EMPTY)
            setExecutionRecord(null)
            setCurrentStepIndex(0)
```

Returns the hook to its initial state. Clears all visual states, errors, the
execution record, and the step index. Can be called from any state.

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
   `setNodeVisualStates()`, triggering a React re-render.
4. Flush points:
   - In step-by-step mode: after each step yields (before pausing).
   - In instant mode: only on error (before setting `'errored'`).
   - On `stop()`: before setting `'errored'`.
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

### Algorithm: `computeVisualStatesAtStep(record, stepIndex)`

The function processes the execution record in three phases:

**Phase 1: Regular Step Records**

For each step in `record.steps`:

- `step.stepIndex < targetIndex` -> node is `'completed'` (or
  `'errored'`/`'skipped'` based on step status)
- `step.stepIndex === targetIndex` -> node is `'running'`
- `step.stepIndex > targetIndex` -> node is `'idle'` (only if not already set by
  an earlier step, since a node can appear multiple times in loop iterations)

**Phase 2: Loop Structural Node Overrides**

Loop triplet step records (LoopStart, LoopStop, LoopEnd) are appended AFTER body
steps in the record (they have high stepIndex values). Without correction,
they'd show as `'idle'` while the body replays. This phase:

- Collects all body step indices for each loop record.
- If `targetIndex` falls within `[minBodyIndex, maxBodyIndex]`, sets LoopStart
  and LoopStop to `'running'`.
- LoopEnd stays `'idle'` (it represents the final output after the loop).

**Phase 3: Group Structural Node Overrides**

Same logic as loops: group node step records are appended after inner steps. If
`targetIndex` falls within the range of inner step indices, the group node shows
as `'running'`.

### Clamping

The step index is clamped to `[0, record.steps.length - 1]` to prevent
out-of-bounds access.

### State Updates

`replayTo` updates both:

- `liveVisualStatesRef.current` (for consistency if execution resumes)
- `nodeVisualStates` React state (triggers re-render)
- `currentStepIndex` (drives the timeline scrubber position)

---

## Record Loading (loadRecord)

```typescript
loadRecord(record: ExecutionRecord) => RecordValidationResult
```

`loadRecord` validates an imported execution record against the current graph
state and, if valid, loads it into the runner.

### Validation: `validateRecordAgainstGraph(record, state)`

**Fatal errors** (prevent loading):

- Record has zero steps (`record.steps.length === 0`)

**Warnings** (loading proceeds but issues are surfaced):

- Steps reference node IDs not present in the current graph
- Steps reference node type IDs not registered in `state.typeOfNodes`
- Nodes in the current graph were not covered by any step in the record

### Loading Process

If validation passes (`result.valid === true`):

1. Stop any in-flight execution (abort controller, clear generator).
2. Call `finalizeRun(record)` to load the record as if it had just completed:
   - Sets `executionRecord` to the imported record.
   - Sets `currentStepIndex` to the last step.
   - Extracts per-node errors.
   - Builds final visual states from step statuses.
   - Sets `runnerState` to `'completed'` or `'errored'` based on record status.

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

`RunnerOverlay` (in `FullGraph.tsx`) is rendered only when
`functionImplementations` is provided to `FullGraph`. It:

1. Calls `useNodeRunner({ state, functionImplementations })`.
2. Builds a merged `nodeRunnerStates` map from `runner.nodeVisualStates`,
   `runner.nodeWarnings`, and `runner.nodeErrors` using `useMemo`.
3. Provides a nested `FullGraphContext.Provider` with `nodeRunnerStates` so that
   all child nodes can read their visual state from context.
4. Renders `NodeRunnerPanel` with all runner state and callbacks.
5. Exposes `executionRecord` and `loadRecord` to the parent via refs for
   import/export.

### FullGraphContext nodeRunnerStates

```typescript
type NodeRunnerState = {
  visualState: NodeVisualState;
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};
```

The `nodeRunnerStates` map (`Map<string, NodeRunnerState>`) is built by merging
three sources:

1. **Visual states**: Each node gets its `visualState` from
   `runner.nodeVisualStates`.
2. **Warnings**: Nodes with warnings get `warnings` merged. If a node has
   warnings but no visual state yet, it gets `visualState: 'warning'`.
3. **Errors**: Nodes with errors get `errors` merged. If a node has errors but
   no visual state yet, it gets `visualState: 'errored'`.

This merged map flows through context to `ConfigurableNodeReactFlowWrapper`,
which reads it and passes the appropriate state to `NodeStatusIndicator` for
rendering colored border overlays.

---

## Warnings and Errors

### Compilation Warnings (Missing Implementations)

`detectWarnings()` runs as a `useEffect` whenever `state.nodes`,
`state.typeOfNodes`, or `functionImplementations` change. For each node in the
graph, it checks:

- Skip built-in types (standard nodes like `loopStart`, `loopStop`, etc.)
- Skip loop nodes (`isLoopNode`)
- Skip group node instances (their subtrees are checked by the compiler)
- For remaining nodes: if `functionImplementations[nodeTypeId]` is missing, add
  a warning: `"No function implementation for node type \"{name}\""`

Warnings are stored in `nodeWarnings: Map<nodeId, string[]>` and appear as
orange `'warning'` overlays on nodes **before** any execution occurs.

### Runtime Errors (Per-Node)

`extractNodeErrors()` processes `record.errors` (an array of `GraphError`
objects) after execution completes, grouping them by `nodeId` into
`nodeErrors: Map<nodeId, GraphError[]>`.

Each `GraphError` contains:

- `message`: Human-readable description
- `nodeId`, `nodeTypeId`, `nodeTypeName`: Identity of the errored node
- `path`: Ordered list of nodes in the execution path leading to the error
- `loopContext`: Loop iteration details (if inside a loop)
- `groupContext`: Group nesting details (if inside a group)
- `timestamp`, `duration`: Timing information
- `originalError`: The original thrown error value

---

## Limitations and Deprecated Patterns

- **No breakpoint support**: The step-by-step mode pauses after every step.
  There is no mechanism to set breakpoints on specific nodes and run until a
  breakpoint is hit.
- **No partial replay values**: `replayTo()` reconstructs visual states only. It
  does not reconstruct the `ValueStore` at the target step; the full
  `finalValues` snapshot is only available for the end state.
- **Single execution**: Only one execution can be active at a time. Starting a
  new `run()` clears the previous record.
- **Mutable ref pattern**: `liveVisualStatesRef` is a mutable `Map` outside of
  React's state management. This is intentional for performance but means visual
  states during execution are not captured in React DevTools until flushed.

---

## Examples

### Basic Usage (Instant Mode)

```tsx
import { useNodeRunner } from 'react-blender-nodes';

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
intermediate representation). If compilation throws, the hook transitions to
`'errored'`.

### -> [Runner Executor](runnerExecutorDoc.md)

The hook uses two executor entry points:

- `execute(plan, ...)`: Returns `Promise<ExecutionRecord>`. Used in instant
  mode.
- `executeStepByStep(plan, ...)`: Returns
  `AsyncGenerator<{ stepRecord, partialRecord }, ExecutionRecord>`. Used in
  step-by-step mode. Yields after each step for manual advancement.

### -> [Execution Recording](executionRecordingDoc.md)

The executor produces an `ExecutionRecord` containing all step records, timing
data, errors, loop records, and group records. The hook stores this in
`executionRecord` state and uses it for replay via `replayTo()` and for
exporting via the `RunnerOverlay`'s ref mechanism.

### -> [FullGraph Component](../ui/fullGraphDoc.md)

`FullGraph` conditionally renders `RunnerOverlay` when `functionImplementations`
is provided. `RunnerOverlay` calls `useNodeRunner` and wires the results into
`FullGraphContext` and `NodeRunnerPanel`.

### -> [NodeRunnerPanel](../ui/nodeRunnerPanelDoc.md)

The `NodeRunnerPanel` organism receives all runner state and callbacks as props
from `RunnerOverlay`:

- `runnerState` -> enables/disables control buttons
- `record` + `currentStepIndex` -> drives the `ExecutionTimeline`
- `onRun`, `onPause`, `onStep`, `onStop`, `onReset` -> `RunControls` buttons
- `onScrubTo` -> wired to `runner.replayTo`
- `mode`, `onModeChange` -> mode toggle
- `maxLoopIterations`, `onMaxLoopIterationsChange` -> settings

### -> [NodeStatusIndicator](../ui/nodeStatusIndicatorDoc.md)

`NodeStatusIndicator` is rendered by `ConfigurableNodeReactFlowWrapper`, which
reads `nodeRunnerStates` from `FullGraphContext`. Each node's `visualState`
determines its border color overlay (green = completed, red = errored, blue =
running, orange = warning, gray = skipped).

### -> [State Management](../core/stateManagementDoc.md)

The hook reads `State` (nodes, edges, typeOfNodes) but never writes to it. State
mutations only happen through the `dispatch` function in `FullGraph`. The hook's
`detectWarnings` effect re-runs when state changes, keeping warnings in sync.
