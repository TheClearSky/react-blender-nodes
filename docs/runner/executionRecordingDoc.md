# Execution Recording

## Overview

The execution recording system captures every step of a graph execution run for
replay, inspection, and export. When the runner executor processes nodes, an
`ExecutionRecorder` instance (`src/utils/nodeRunner/executionRecorder.ts` ›
`ExecutionRecorder`) builds an `ExecutionRecord` incrementally -- recording
timing, input/output value snapshots, errors, loop iterations (including nested
loops), switch branches, and group inner executions. The resulting record powers
the ExecutionTimeline (visual block-based replay), the ExecutionStepInspector
(per-step detail view), and the import/export system (JSON serialization for
sharing or archival).

All relative timing is produced by an internal `MonotonicTimer` that wraps
`performance.now()` and guarantees strictly-increasing timestamps (so
sub-millisecond synchronous node functions never record a `duration` of 0). The
recorder also samples raw `performance.now()` separately to flag steps whose
true duration was below timer resolution (`estimatedTiming`).

Recording works in both execution modes:

- **Performance / instant mode**: The executor runs to completion, then the
  finalized `ExecutionRecord` is available for post-hoc replay via the timeline
  scrubber. `totalPauseDuration` is 0.
- **Debug (step-by-step) mode**: The recorder produces snapshots after each step
  (via `snapshot()`), enabling live inspection of partial results. In-progress
  loop structures are materialized into temporary `LoopRecord`s so live stepping
  renders identically to post-completion replay. Pause/resume tracking ensures
  timing accuracy by subtracting user idle time.

## Entity-Relationship Diagram

```
ExecutionRecord
|
|-- id: string
|-- startTime / endTime / totalDuration
|-- warmupDuration            (JIT warmup time before execution)
|-- totalPauseDuration        (debug idle time; 0 in instant mode)
|-- status: 'completed' | 'errored' | 'cancelled'
|-- viewState?: RecordingViewState   (UI prefs persisted with the record)
|
|-- steps[]: ExecutionStepRecord
|   |-- stepIndex, nodeId, nodeTypeId, nodeTypeName, concurrencyLevel
|   |-- startTime, endTime, duration, pauseAdjustment
|   |-- estimatedTiming?       (true when below timer resolution)
|   |-- status: 'completed' | 'errored' | 'skipped'
|   |-- inputValues: Map<handleName, RecordedInputHandleValue>
|   |   |-- connections[]: RecordedInputConnection
|   |   |   |-- value, sourceNodeId, sourceNodeName
|   |   |   |-- sourceHandleId, sourceHandleName, sourceDataTypeId
|   |   |-- dataTypeId, isDefault, defaultValue?
|   |-- outputValues: Map<handleName, RecordedOutputHandleValue>
|   |   |-- value, dataTypeId, targetCount
|   |-- error?: GraphError
|   |-- loopIteration?, loopStructureId?, loopPhase?, inputSource?
|   |-- parentLoopStructureId?, parentLoopIteration?   (@deprecated)
|   |-- switchPhase?, switchStructureId?, branchTaken?
|   |-- groupNodeId?, groupDepth?
|
|-- errors[]: GraphError
|
|-- concurrencyLevels[]: ConcurrencyLevelRecord
|   |-- level, startTime, endTime, duration, nodeIds[]
|
|-- loopRecords: Map<loopStructureId, LoopRecord>
|   |-- loopStructureId, loopStartNodeId, loopStopNodeId, loopEndNodeId
|   |-- totalIterations, startTime, endTime, duration
|   |-- iterations[]: LoopIterationRecord
|       |-- iteration, startTime, endTime, duration
|       |-- conditionValue: boolean
|       |-- stepRecords[]: ExecutionStepRecord
|       |-- nestedLoopRecords: Map<childLoopId, LoopRecord>   (hierarchical)
|       |-- nestedSwitchRecords: Map<...>   (always empty — see note)
|
|-- switchRecords: Map<switchStructureId, SwitchRecord>
|   |-- switchStructureId, switchStartNodeId, switchEndNodeId
|   |-- branchTaken: boolean, startTime, endTime, duration
|   |-- stepRecords[]: ExecutionStepRecord  (only the taken branch)
|   |-- nestedLoopRecords / nestedSwitchRecords   (always empty)
|
|-- groupRecords: Map<groupNodeId, GroupRecord>
|   |-- groupNodeId, groupNodeTypeId
|   |-- innerRecord: ExecutionRecord  (recursive!)
|   |-- inputMapping: Map<string, unknown>
|   |-- outputMapping: Map<string, unknown>
|
|-- finalValues: Map<"nodeId:handleId", unknown>
```

## Functional Dependency Diagram

```
+---------------------+       +-------------------+
| ExecutionRecorder   |       | Executor          |
| (builds the record) | <---- | (drives recording)|
+---------------------+       +-------------------+
         |                           |
         | produces                  | calls recorder methods
         v                           |
+---------------------+       +-------------------+
| ExecutionRecord     |       | ValueStore        |
| (immutable output)  |       | (supplies values) |
+---------------------+       +-------------------+
         |
         +----> ExecutionTimeline  (renders blocks)
         +----> ExecutionStepInspector  (renders detail)
         +----> recordExport / recordImport  (serialization)
         +----> useNodeRunner  (holds record in useState; exposes flat props)
```

## Data Flow Diagram

```
                     Executor begins run
                            |
                            v
                  ExecutionRecorder.start()
                  (sets reference startTime)
                            |
    +--------------+--------------+--------------+--------------+
    |              |              |              |              |
    v              v              v              v              v
 Standard       Loop Block     Switch Block   Group Scope
 Node              |              |              |
 beginStep()    beginLoop-     beginSwitch-   beginScope()
 [resolve         Structure()    Structure()  [execute inner plan]
  inputs]       beginLoop-     [resolve        endScope()
 [call impl]      Iteration()    condition]    -> inner record
 completeStep()    |            [run taken     completeGroup()
  or errorStep() Per iteration:   branch only]
  or skipStep()   beginStep()   completeSwitch-
                  completeStep()  Structure()
                  completeLoop-
                   Iteration()
                  completeLoop-
                   Structure()
    |              |              |              |
    +--------------+--------------+--------------+--------------+
                            |
                            v
                  ExecutionRecorder.finalize()
                  or .snapshot() (debug mode)
                            |
                            v
                     ExecutionRecord
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
         Timeline UI   Inspector UI   Export JSON
```

## System Diagram

```
+-----------------------------------------------------------------+
|                    react-blender-nodes                          |
|                                                                 |
|  +-------------------+    +------------------+                  |
|  | Compiler          |--->| ExecutionPlan    |                  |
|  | (compiler.ts)     |    | (compiled IR)    |                  |
|  +-------------------+    +--------+---------+                  |
|                                    |                            |
|                                    v                            |
|  +-------------------+    +------------------+                  |
|  | ValueStore        |<-->| Executor         |                  |
|  | (valueStore.ts)   |    | (executor/)      |                  |
|  +-------------------+    +--------+---------+                  |
|                                    |                            |
|                            uses    |                            |
|                                    v                            |
|                           +-------------------------+         |
|                           | ExecutionRecorder       |         |
|                           | (executionRecorder.ts)  |         |
|                           +--------+---------+                  |
|                                    |                            |
|                             produces                            |
|                                    v                            |
|                           +------------------+                  |
|                           | ExecutionRecord  |                  |
|                           | (types.ts)       |                  |
|                           +--------+---------+                  |
|                                    |                            |
|            +-----------+-----------+-----------+                |
|            |           |           |           |                |
|            v           v           v           v                |
|     +-----------+ +---------+ +--------+ +----------+          |
|     | Timeline  | |Inspector| | Export | | Runner   |          |
|     | Component | |Component| | System | | Hook     |          |
|     +-----------+ +---------+ +--------+ +----------+          |
+-----------------------------------------------------------------+
```

## ExecutionRecord Type

The top-level type representing a complete execution run recording.

| Field                | Type                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | `string`                                | Unique identifier for this execution run. Generated via `crypto.randomUUID()` with a fallback to `run-{timestamp}-{random}`. Scoped records (from group inner execution) append `-scope-{startStepIndex}`.                                                                                                                                                                                                                                                          |
| `startTime`          | `number`                                | Absolute start time from the monotonic timer (set by `start()`). Used as the reference point for all relative timestamps within the record.                                                                                                                                                                                                                                                                                                                         |
| `endTime`            | `number`                                | Absolute end time from the monotonic timer. Set when `finalize()`, `snapshot()`, or `endScope()` is called.                                                                                                                                                                                                                                                                                                                                                         |
| `totalDuration`      | `number`                                | Wall-clock duration in milliseconds (`endTime - startTime`). Includes any pause time in debug mode.                                                                                                                                                                                                                                                                                                                                                                 |
| `warmupDuration`     | `number`                                | Time (ms) spent warming up the JS engine (JIT compilation) before the timed execution begins. Set by the executor when calling `finalize(status, finalValues, warmupDuration)`. Always 0 for scoped/snapshot records.                                                                                                                                                                                                                                               |
| `totalPauseDuration` | `number`                                | Total accumulated pause time in milliseconds. Only non-zero in step-by-step (debug) mode. Subtract from `totalDuration` to get execution-only duration.                                                                                                                                                                                                                                                                                                             |
| `status`             | `ExecutionRecordStatus`                 | Terminal status: `'completed'`, `'errored'`, or `'cancelled'`. `runAll.ts`/`stepByStep.ts` compute the final status as `abortSignal.aborted ? 'cancelled' : hasErrors ? 'errored' : 'completed'` and additionally call `finalize('cancelled', …)` from abort early-returns: `runAll.ts` has a per-level abort return only, while `stepByStep.ts` has both a per-level and a per-step abort return. Either way, `'cancelled'` **is** produced when a run is aborted. |
| `steps`              | `ReadonlyArray<ExecutionStepRecord>`    | All step records in execution order. Each entry represents one node (or structural triplet) execution.                                                                                                                                                                                                                                                                                                                                                              |
| `errors`             | `ReadonlyArray<GraphError>`             | All errors that occurred during execution, in order.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `concurrencyLevels`  | `ReadonlyArray<ConcurrencyLevelRecord>` | Per-level timing data. Not tracked for scoped (group inner) records (always empty there).                                                                                                                                                                                                                                                                                                                                                                           |
| `loopRecords`        | `ReadonlyMap<string, LoopRecord>`       | Loop execution recordings, keyed by loop structure ID (the `loopStartNodeId`). Only **top-level** loops appear here — nested loops live under their parent `LoopIterationRecord.nestedLoopRecords`.                                                                                                                                                                                                                                                                 |
| `switchRecords`      | `ReadonlyMap<string, SwitchRecord>`     | Switch execution recordings, keyed by switch structure ID (the `switchStartNodeId`).                                                                                                                                                                                                                                                                                                                                                                                |
| `groupRecords`       | `ReadonlyMap<string, GroupRecord>`      | Group execution recordings, keyed by group node instance ID. Contains recursive `ExecutionRecord` for inner execution.                                                                                                                                                                                                                                                                                                                                              |
| `finalValues`        | `ReadonlyMap<string, unknown>`          | Complete ValueStore snapshot at end of execution. Keys are qualified handle IDs (`"nodeId:handleId"`).                                                                                                                                                                                                                                                                                                                                                              |
| `viewState`          | `RecordingViewState \| undefined`       | Optional UI preferences (selected step, run mode, time mode, expanded iterations, etc.) captured when the recording is saved. Not set by the recorder itself; attached by the panel/export layer.                                                                                                                                                                                                                                                                   |

### ExecutionRecordStatus

```typescript
const executionRecordStatuses = ['completed', 'errored', 'cancelled'] as const;
type ExecutionRecordStatus = (typeof executionRecordStatuses)[number];
```

Defined in `src/utils/nodeRunner/types.ts` › `ExecutionRecordStatus`.

## ExecutionStepRecord Type

Recording of a single node's execution step.

| Field                   | Type                                             | Description                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stepIndex`             | `number`                                         | Zero-based index in the `steps` array. Assigned at `beginStep()` time.                                                                                                                                  |
| `nodeId`                | `string`                                         | Runtime node instance ID.                                                                                                                                                                               |
| `nodeTypeId`            | `string`                                         | Node type ID from the type definitions.                                                                                                                                                                 |
| `nodeTypeName`          | `string`                                         | Display name of the node type.                                                                                                                                                                          |
| `customName`            | `string \| undefined`                            | Optional user custom name (standard nodes only); rendered `Custom : Type` in the timeline / inspector / errors. Read from `node.data.customName` at compile time.                                       |
| `concurrencyLevel`      | `number`                                         | Which concurrency level this step belongs to.                                                                                                                                                           |
| `startTime`             | `number`                                         | Time relative to execution start (ms). Computed as `timer.now() - recorder.startTime` (monotonic timer, not raw `performance.now()`).                                                                   |
| `endTime`               | `number`                                         | Time relative to execution start (ms). Set on completion/error/skip.                                                                                                                                    |
| `duration`              | `number`                                         | Duration of this step in ms (`endTime - startTime`). Set to 0 for skipped steps.                                                                                                                        |
| `pauseAdjustment`       | `number`                                         | Cumulative pause duration (ms) at the moment this step started. Subtract from `startTime`/`endTime` to get execution-only timestamps. Always 0 in instant (performance) mode.                           |
| `status`                | `ExecutionStepRecordStatus`                      | `'completed'`, `'errored'`, or `'skipped'`.                                                                                                                                                             |
| `inputValues`           | `ReadonlyMap<string, RecordedInputHandleValue>`  | Snapshot of resolved input values at execution time. Keyed by handle **name**.                                                                                                                          |
| `outputValues`          | `ReadonlyMap<string, RecordedOutputHandleValue>` | Snapshot of computed output values. Keyed by handle **name**. Empty for errored/skipped steps.                                                                                                          |
| `error`                 | `GraphError \| undefined`                        | Error details, only present when `status === 'errored'`.                                                                                                                                                |
| `estimatedTiming`       | `boolean \| undefined`                           | `true` when the step's real duration was below timer resolution (raw `performance.now()` returned the same value at begin and end). Rendered as "< 0.1ms" in the UI. Set in `completeStep`/`errorStep`. |
| `loopIteration`         | `number \| undefined`                            | Loop iteration number, only set when executing inside a loop body.                                                                                                                                      |
| `loopStructureId`       | `string \| undefined`                            | Loop structure identifier, only set when inside a loop body. Used to associate steps with their `LoopRecord`/`LoopIterationRecord`.                                                                     |
| `loopPhase`             | `LoopPhase \| undefined`                         | Position within the loop iteration lifecycle (`'loopStart'`, `'preStop'`, `'loopStop'`, `'postStop'`, `'loopEnd'`). Drives vertical ordering and edge animation in the timeline.                        |
| `inputSource`           | `'upstream' \| 'feedback' \| undefined`          | For LoopStart steps: whether inputs came from upstream nodes (iteration 0) or from LoopStop feedback (iteration N > 0). Controls which edges animate.                                                   |
| `parentLoopStructureId` | `string \| undefined`                            | **@deprecated** — superseded by hierarchical `LoopIterationRecord.nestedLoopRecords`. Still populated by `executeLoopBlock` (via `parentFields`) for nested-loop steps.                                 |
| `parentLoopIteration`   | `number \| undefined`                            | **@deprecated** — superseded by `LoopIterationRecord.nestedLoopRecords`. Still populated for nested-loop steps.                                                                                         |
| `switchPhase`           | `SwitchPhase \| undefined`                       | Position within the switch lifecycle (`'switchStart'`, `'trueBranch'`, `'falseBranch'`, `'switchEnd'`).                                                                                                 |
| `switchStructureId`     | `string \| undefined`                            | Switch structure identifier (the `switchStartNodeId`), only set inside a switch. Associates the step with its `SwitchRecord`.                                                                           |
| `branchTaken`           | `boolean \| undefined`                           | Which branch the switch took (`true` = condition was true). Set on switch-phase steps.                                                                                                                  |
| `groupNodeId`           | `string \| undefined`                            | Group node instance ID, only set when executing inside a group scope.                                                                                                                                   |
| `groupDepth`            | `number \| undefined`                            | Group nesting depth, only set inside a group scope.                                                                                                                                                     |

### ExecutionStepRecordStatus

```typescript
const executionStepRecordStatuses = [
  'completed',
  'errored',
  'skipped',
] as const;
type ExecutionStepRecordStatus = (typeof executionStepRecordStatuses)[number];
```

A step is `'skipped'` when an upstream node has errored, preventing this node
from executing.

## Loop Recording Types

### LoopRecord

Complete recording of a loop structure's entire execution across all iterations.

| Field             | Type                                 | Description                                                                     |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `loopStructureId` | `string`                             | Unique identifier for this loop structure (matches the loop compilation block). |
| `loopStartNodeId` | `string`                             | Node instance ID of the LoopStart node.                                         |
| `loopStopNodeId`  | `string`                             | Node instance ID of the LoopStop node.                                          |
| `loopEndNodeId`   | `string`                             | Node instance ID of the LoopEnd node.                                           |
| `iterations`      | `ReadonlyArray<LoopIterationRecord>` | Per-iteration recordings in execution order.                                    |
| `totalIterations` | `number`                             | Total number of iterations executed (`iterations.length`).                      |
| `startTime`       | `number`                             | Time relative to execution start when the loop began (ms).                      |
| `endTime`         | `number`                             | Time relative to execution start when the loop completed (ms).                  |
| `duration`        | `number`                             | Total wall-clock time for all iterations (ms).                                  |

### LoopIterationRecord

Recording of a single loop iteration.

| Field                 | Type                                 | Description                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iteration`           | `number`                             | Zero-based iteration index.                                                                                                                                                                                                                                      |
| `startTime`           | `number`                             | Time relative to execution start (ms).                                                                                                                                                                                                                           |
| `endTime`             | `number`                             | Time relative to execution start (ms).                                                                                                                                                                                                                           |
| `duration`            | `number`                             | Duration of this iteration (ms).                                                                                                                                                                                                                                 |
| `conditionValue`      | `boolean`                            | The boolean condition value evaluated at the end of this iteration. `true` means the loop continues; `false` means the loop exits.                                                                                                                               |
| `stepRecords`         | `ReadonlyArray<ExecutionStepRecord>` | Step records for all body nodes executed in this iteration. Steps are added to this array as they complete via `completeStep()`/`errorStep()`/`skipStep()`.                                                                                                      |
| `nestedLoopRecords`   | `ReadonlyMap<string, LoopRecord>`    | Loop records for child loops that executed within this iteration, keyed by child loop structure ID. Populated by `completeLoopIteration()` from `completedNestedLoopRecords`. This is the hierarchical replacement for the deprecated `parentLoop*` step fields. |
| `nestedSwitchRecords` | `ReadonlyMap<string, SwitchRecord>`  | Always an empty `Map` in the current implementation -- switch records are not nested into loop iterations (a switch executed inside a loop body is recorded as a top-level `switchRecords` entry, not here).                                                     |

#### Nested loop hierarchy

Loops nest correctly. The recorder maintains a `loopNestingStack` (top =
innermost active iteration). When `beginLoopStructure()` is called while that
stack is non-empty, the structure is stored under a composite key
`` `${parentLoopId}:${parentIter}:${childLoopId}` `` in
`pendingNestedLoopStructures` rather than at top level. When the child finishes,
`completeLoopStructure()` moves it to `completedNestedLoopRecords`; the parent's
`completeLoopIteration()` then sweeps all completed children whose key matches
its prefix into that iteration's `nestedLoopRecords`. Therefore
`record.loopRecords` contains only the outermost loops; deeper loops are
reachable by walking `iteration.nestedLoopRecords` recursively.

## Switch Recording Types

### SwitchRecord

Complete recording of a switch structure's execution. A switch resolves a
boolean condition, runs **only** the chosen branch, then maps that branch's
SwitchEnd inputs to SwitchEnd outputs. Built by `beginSwitchStructure()` /
`completeSwitchStructure()`.

| Field                 | Type                                 | Description                                                                                                                                                                           |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `switchStructureId`   | `string`                             | Unique identifier for this switch structure (the `switchStartNodeId`).                                                                                                                |
| `switchStartNodeId`   | `string`                             | Node instance ID of the SwitchStart node.                                                                                                                                             |
| `switchEndNodeId`     | `string`                             | Node instance ID of the SwitchEnd node.                                                                                                                                               |
| `branchTaken`         | `boolean`                            | Which branch executed (`true` = the condition resolved truthy / true branch).                                                                                                         |
| `startTime`           | `number`                             | Time relative to execution start when the switch began (ms).                                                                                                                          |
| `endTime`             | `number`                             | Time relative to execution start when the switch completed (ms).                                                                                                                      |
| `duration`            | `number`                             | Total wall-clock time for the switch (ms).                                                                                                                                            |
| `stepRecords`         | `ReadonlyArray<ExecutionStepRecord>` | Step records for the SwitchStart, the **taken** branch's body nodes, and SwitchEnd. Steps are collected via `addStepToPendingIteration()` while a pending switch structure is active. |
| `nestedLoopRecords`   | `ReadonlyMap<string, LoopRecord>`    | Always an empty `Map` in the current implementation.                                                                                                                                  |
| `nestedSwitchRecords` | `ReadonlyMap<string, SwitchRecord>`  | Always an empty `Map` in the current implementation.                                                                                                                                  |

> Switch is the most recent runner feature (commit
> `183a098 "Zones first class support"`). The recorder gained `switchRecords`,
> `pendingSwitchStructures`, `beginSwitchStructure()`, and
> `completeSwitchStructure()`; `RecorderScope` gained `startSwitchRecordKeys`;
> and `snapshot()`/`endScope()` now also surface switch records. See
> [Limitations](#limitations-and-deprecated-patterns) for the serialization
> caveat.

## Group Recording Types

### GroupRecord

Recording of a node group's execution. Contains a recursive `ExecutionRecord`
representing the inner subtree's execution.

| Field             | Type                           | Description                                                                                                                               |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `groupNodeId`     | `string`                       | The group node's instance ID in the outer graph.                                                                                          |
| `groupNodeTypeId` | `string`                       | The group's node type ID (key in `typeOfNodes`).                                                                                          |
| `innerRecord`     | `ExecutionRecord`              | Recursively captured execution record for the group's inner subtree. Built via `beginScope()`/`endScope()` on the same recorder instance. |
| `inputMapping`    | `ReadonlyMap<string, unknown>` | Map of outer input handle IDs to the values that were injected into the group's `GroupInput` node.                                        |
| `outputMapping`   | `ReadonlyMap<string, unknown>` | Map of inner `GroupOutput` input handle IDs to the values extracted as the group's outputs.                                               |

The recursive `innerRecord` structure means groups can nest arbitrarily deep,
and each level has its own complete execution record with its own steps, errors,
loop records, and group records.

## ExecutionRecorder Class

The `ExecutionRecorder` class (defined in
`src/utils/nodeRunner/executionRecorder.ts` › `ExecutionRecorder`) is the
stateful recorder that builds an `ExecutionRecord` incrementally during
execution.

### Internal state

The recorder holds private arrays/maps that back the final record: `steps[]`,
`errors[]`, `concurrencyLevels[]`, plus `loopRecords`, `switchRecords`, and
`groupRecords` Maps. Pending/in-progress structures are tracked separately so
they can be materialized into snapshots or attached to parents on completion:
`pendingLoopStructures`, `pendingLoopIterations`, `pendingNestedLoopStructures`,
`completedNestedLoopRecords`, `pendingSwitchStructures`, the `loopNestingStack`,
and the `scopeStack`. A private `MonotonicTimer` provides all relative timing,
and a `rawStartTimes` map of raw `performance.now()` values feeds
`estimatedTiming` detection.

### Construction

```typescript
const recorder = new ExecutionRecorder();
```

Generates a unique ID via `crypto.randomUUID()` (with a
`run-{timestamp}-{random}` fallback when `crypto.randomUUID` is unavailable).

### Lifecycle Methods

| Method                                              | Description                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start()`                                           | Sets the reference time via the monotonic timer. All subsequent relative timestamps are computed against this.                                                                                                                                                                                                      |
| `finalize(status, finalValues, warmupDuration = 0)` | Returns the complete, final `ExecutionRecord`. Called once at the end of execution. The optional third argument records the executor's JIT warmup time on the record.                                                                                                                                               |
| `snapshot(status, currentValues)`                   | Returns a snapshot `ExecutionRecord` (copies of the arrays/maps) without mutating the recorder. In-progress loop structures are materialized via `snapshotPendingLoopRecords()` so live stepping and replay render identically. `warmupDuration` is 0. Used in debug mode to yield partial records after each step. |

### Step Recording Methods

| Method                                               | Description                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginStep(params)`                                  | Records a step beginning. First **commits any pending pause** via `resume()` (so inter-step idle/microtask time in debug mode is captured as pause), then sets `startTime`, captures the current `totalPauseDuration` as `pauseAdjustment`, samples raw `performance.now()` for `estimatedTiming`, and stores all step metadata (loop/switch/group/phase fields). Returns the step index. |
| `completeStep(stepIndex, inputValues, outputValues)` | Records successful completion. Sets `endTime`, `duration`, `status='completed'`, value snapshots, sets `estimatedTiming` if raw start == raw end, then routes the step into any active pending loop iteration / switch structure via `addStepToPendingIteration()`.                                                                                                                       |
| `errorStep(stepIndex, error, inputValues)`           | Records a failure. Sets `endTime`, `duration`, `status='errored'`, the error, sets `estimatedTiming`, pushes to the errors array, and routes the step into pending structures.                                                                                                                                                                                                            |
| `skipStep(stepIndex)`                                | Records a step being skipped (upstream errored). Sets `duration=0`, `status='skipped'`, and routes it into pending structures.                                                                                                                                                                                                                                                            |

`params` for `beginStep` accepts: `nodeId`, `nodeTypeId`, `nodeTypeName`,
`concurrencyLevel`, the optional `customName` (standard nodes only), plus the
optional context fields `loopIteration`, `loopStructureId`,
`parentLoopStructureId`, `parentLoopIteration`, `groupNodeId`, `groupDepth`,
`loopPhase`, `inputSource`, `switchPhase`, `switchStructureId`, and
`branchTaken`.

### Concurrency Level Methods

| Method                       | Description                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `beginLevel(level, nodeIds)` | Records the start of a concurrency level's execution.                             |
| `completeLevel(level)`       | Records the completion of a concurrency level. Pushes a `ConcurrencyLevelRecord`. |

### Loop Recording Methods

| Method                                                              | Description                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `beginLoopStructure(loopStructureId, startId, stopId, endId)`       | Initializes tracking for a loop structure before iterations begin.                                                                                                                                                                               |
| `beginLoopIteration(loopStructureId, iteration)`                    | Starts recording a loop iteration. Step records within the loop are automatically associated.                                                                                                                                                    |
| `completeLoopIteration(loopStructureId, iteration, conditionValue)` | Pops the nesting stack, sweeps any nested child loops that completed within this iteration into the iteration's `nestedLoopRecords`, then finalizes a `LoopIterationRecord` (timing + condition boolean) and pushes it to the pending structure. |
| `completeLoopStructure(loopStructureId)`                            | Finalizes the loop recording. For a **top-level** loop, pushes the completed `LoopRecord` into `loopRecords`. For a **nested** loop, stores it in `completedNestedLoopRecords` for the parent iteration to collect.                              |

`beginLoopStructure()` and `beginLoopIteration()` push onto the
`loopNestingStack`; if a parent iteration is active when `beginLoopStructure()`
runs, the new structure is tracked as nested rather than top-level (see
[Nested loop hierarchy](#nested-loop-hierarchy)).

### Switch Recording Methods

| Method                                                    | Description                                                                                                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginSwitchStructure(switchStructureId, startId, endId)` | Initializes a pending switch structure (records start time and an empty `stepRecords` buffer). Called once before the chosen branch runs.                      |
| `completeSwitchStructure(switchStructureId, branchTaken)` | Finalizes the switch recording. Computes timing and pushes the completed `SwitchRecord` (with `branchTaken` and collected `stepRecords`) into `switchRecords`. |

### Group Recording Methods

| Method                                                                                  | Description                                                                                                |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `beginGroup(groupNodeId, groupNodeTypeId)`                                              | Placeholder (no-op). Group state is managed via scopes.                                                    |
| `completeGroup(groupNodeId, groupNodeTypeId, innerRecord, inputMapping, outputMapping)` | Records the completed group execution. Pushes a `GroupRecord` with the recursively captured `innerRecord`. |

### Scope Methods (for Group Inner Execution)

| Method                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginScope()`                   | Saves & clears the `loopNestingStack` (so the group's inner execution has an isolated nesting context), then pushes a `RecorderScope` capturing the current `steps`/`errors` lengths and the current key sets of `loopRecords`, `switchRecords`, `groupRecords`, and `completedNestedLoopRecords`, plus the saved nesting stack and a start time. All subsequent recordings belong to this scope.                                      |
| `endScope(status, scopedValues)` | Pops the scope, restores the saved `loopNestingStack`, and returns an `ExecutionRecord` containing only the steps, errors, loop records, switch records, and group records created within the scope (sliced by index / filtered by "key not present at scope start"). `concurrencyLevels` is empty and `warmupDuration` is 0. Used to produce the `innerRecord` for `GroupRecord`. Throws if called without a matching `beginScope()`. |

Scopes nest correctly for recursive group execution -- each `beginScope()`
pushes onto the stack, and `endScope()` pops the most recent. The executor
passes `status: 'errored'` when the inner subtree had errors, otherwise
`'completed'`.

### Pause Methods (for Debug Mode)

| Method                        | Description                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pause()`                     | Marks the recorder as paused. Records the pause start time.                                                    |
| `resume()`                    | Resumes timing. Accumulates the elapsed pause time into `totalPauseDuration`.                                  |
| `getEffectivePauseDuration()` | (private) Returns `totalPauseDuration` plus any in-progress pause time. Used by `snapshot()` and `finalize()`. |

### Utility Methods

| Method            | Description                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `getLatestStep()` | Returns the most recently added `ExecutionStepRecord` (or `undefined`). Used for debug mode yields. |
| `stepCount()`     | Returns the current number of recorded steps.                                                       |
| `getStep(index)`  | Returns the step record at `index` (or `undefined`).                                                |

## Value Snapshots

### RecordedInputHandleValue

Snapshot of an input handle's resolved state at the time of step execution.

| Field          | Type                                     | Description                                                                                     |
| -------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `connections`  | `ReadonlyArray<RecordedInputConnection>` | All incoming connections. Always an array (one entry per edge). Empty when `isDefault` is true. |
| `dataTypeId`   | `string`                                 | Data type unique ID for this input handle.                                                      |
| `isDefault`    | `boolean`                                | `true` when no edges exist -- the value came from a user-entered default.                       |
| `defaultValue` | `unknown \| undefined`                   | The user-entered default value. Only meaningful when `isDefault` is true.                       |

### RecordedInputConnection

Snapshot of a single incoming connection to an input handle.

| Field              | Type      | Description                                     |
| ------------------ | --------- | ----------------------------------------------- |
| `value`            | `unknown` | The value that arrived through this connection. |
| `sourceNodeId`     | `string`  | Source node instance ID.                        |
| `sourceNodeName`   | `string`  | Source node display name.                       |
| `sourceHandleId`   | `string`  | Source output handle ID.                        |
| `sourceHandleName` | `string`  | Source output handle display name.              |
| `sourceDataTypeId` | `string`  | Source output handle data type ID.              |

Note: Unlike the runtime `InputConnectionValue`, the recorded version omits
`edgeId` and `sourceNodeTypeId` since those are not needed for display in the
inspector.

### RecordedOutputHandleValue

Snapshot of an output handle's computed value.

| Field         | Type      | Description                                                   |
| ------------- | --------- | ------------------------------------------------------------- |
| `value`       | `unknown` | The computed value for this output handle.                    |
| `dataTypeId`  | `string`  | Data type unique ID for this output handle.                   |
| `targetCount` | `number`  | Number of target nodes consuming this output (fan-out count). |

## Timing

### MonotonicTimer

All timing in the recording system flows through a private `MonotonicTimer`
(`executionRecorder.ts`), **not** raw `performance.now()`. `performance.now()`
is quantized (~5µs in Chrome, ~1ms in Firefox) for Spectre mitigation, so
consecutive calls around a synchronous node function often return the same value
-- which would produce `duration = 0` and ambiguous ordering.
`MonotonicTimer.now()` returns
`Math.max(performance.now(), lastTimestamp + minIncrement)` with
`minIncrement = 0.001ms`, guaranteeing strictly-increasing timestamps while
preserving real time whenever the underlying clock has enough resolution.

The recorder additionally samples **raw** `performance.now()` at `beginStep`
(into `rawStartTimes`) and again at completion; if the two raw values are
identical the step's real duration was below timer resolution and
`estimatedTiming` is set to `true` (the UI shows "< 0.1ms").

### startTime, endTime, duration

- **ExecutionRecord**: `startTime` and `endTime` are absolute monotonic-timer
  values. `totalDuration = endTime - startTime`.
- **ExecutionStepRecord**: `startTime` and `endTime` are **relative** to the
  execution start (i.e., `timer.now() - recorder.startTime`).
  `duration = endTime - startTime`.
- **LoopRecord / LoopIterationRecord / SwitchRecord**: Times are relative to
  execution start, same as step records.
- **ConcurrencyLevelRecord**: Times are relative to execution start.

### warmupDuration

Before the timed run, the executor performs a JIT warmup pass and passes the
elapsed warmup time to `finalize(status, finalValues, warmupDuration)`, where it
is stored on `ExecutionRecord.warmupDuration`. Snapshot and scoped (group inner)
records always report `warmupDuration = 0`.

### pauseAdjustment for Step-by-Step Mode

In debug (step-by-step) mode, the executor pauses between steps to let the user
inspect state. Without adjustment, the pause time would inflate step timestamps
and make the timeline inaccurate.

The `pauseAdjustment` field on each `ExecutionStepRecord` captures the
**cumulative pause duration at the moment the step started**. To compute an
execution-only timestamp:

```
executionOnlyStartTime = step.startTime - step.pauseAdjustment
executionOnlyEndTime = step.endTime - step.pauseAdjustment
```

The recorder tracks pauses via:

1. `pause()` -- called after each step in step-by-step mode (it is idempotent:
   only records `pausedAt = timer.now()` if not already paused).
2. `resume()` -- adds `timer.now() - pausedAt` to `totalPauseDuration` and
   clears `pausedAt`. In practice the executor never calls `resume()` _between_
   steps; instead the **next** `beginStep()` calls `resume()` first, so all
   inter-step overhead (microtasks, channel teardown, event-loop yields) is
   folded into pause time. The one place the executor calls `resume()`
   explicitly is in `stepByStep.ts` immediately before each `finalize()` (both
   the terminal return and the abort early-returns), to commit a still-open
   pause before the record is built.
3. Each `beginStep()` then captures the (now updated) `totalPauseDuration` as
   the step's `pauseAdjustment`.
4. `getEffectivePauseDuration()` (private) returns `totalPauseDuration` plus any
   still-in-progress pause; it is used by `snapshot()` and `finalize()` so a
   record captured mid-pause is still accurate.

### totalPauseDuration

Available on the `ExecutionRecord` itself. Represents the total accumulated
pause time across all yields. In instant (performance) mode this is always 0.
Useful for computing effective execution duration:

```
effectiveDuration = record.totalDuration - record.totalPauseDuration
```

## ConcurrencyLevelRecord

Records timing for a single concurrency level's execution.

| Field       | Type                    | Description                              |
| ----------- | ----------------------- | ---------------------------------------- |
| `level`     | `number`                | The concurrency level index (0-based).   |
| `startTime` | `number`                | Time relative to execution start (ms).   |
| `endTime`   | `number`                | Time relative to execution start (ms).   |
| `duration`  | `number`                | Wall-clock duration for this level (ms). |
| `nodeIds`   | `ReadonlyArray<string>` | Node IDs executed in this level.         |

## Limitations and Deprecated Patterns

1. **Value snapshots are shallow**: The recorded `value` fields in
   `RecordedInputConnection` and `RecordedOutputHandleValue` hold direct
   references to the values at execution time. If a function implementation
   mutates an object after returning it, the snapshot reflects the mutated
   state. The export system mitigates this via `safeSerializeValue()` which
   deep-copies at serialization time.

2. **Scoped records omit concurrency levels and warmup**: When `endScope()`
   produces an `ExecutionRecord` for a group's inner execution,
   `concurrencyLevels` is always empty and `warmupDuration` is 0. Concurrency
   tracking and warmup happen at the top-level executor loop, not per-scope.

3. **originalError is not round-trippable**: When exporting,
   `GraphError.originalError` (which can be an Error instance or any thrown
   value) is serialized via `safeSerializeValue()`. The original Error instance
   cannot be reconstructed on import -- it remains in its serialized form (an
   object with `name`, `message`, `stack` fields).

4. **Switch records do not survive export/import**: `serializeExecutionRecord()`
   writes `switchRecords` as a raw `Object.fromEntries([...switchRecords])` --
   the inner `stepRecords` values are **not** run through `safeSerializeValue()`
   (so non-serializable inner values can break JSON), and
   `deserializeExecutionRecord()` hard-codes `switchRecords: new Map()`. Switch
   recordings are therefore dropped on import. Loop and group records, by
   contrast, have dedicated recursive (de)serializers. See the "Import/Export
   System" relationship below and `src/utils/importExport/serialization.ts` ›
   `serializeExecutionRecord`.

5. **nestedSwitchRecords is never populated**: Both `LoopIterationRecord` and
   `SwitchRecord` expose a `nestedSwitchRecords` map, but the recorder always
   assigns it `new Map()`. A switch executed inside a loop body is recorded as a
   top-level `switchRecords` entry, not nested under the loop iteration.
   Likewise, `snapshot()`'s in-progress materialization surfaces pending
   **loop** structures only -- there is no in-progress materialization for
   switches.

6. **ExecutionRecord has no `plan` field**: The execution plan (`ExecutionPlan`)
   is kept entirely separate from the recording; do not expect to read the
   compiled IR back off an `ExecutionRecord`.

## Examples

### Accessing step timing with pause adjustment

```typescript
const step = record.steps[5];

// Wall-clock times (includes user idle time in debug mode)
console.log(`Wall-clock: ${step.startTime}ms to ${step.endTime}ms`);

// Execution-only times (user idle time removed)
const adjStart = step.startTime - step.pauseAdjustment;
const adjEnd = step.endTime - step.pauseAdjustment;
console.log(`Execution-only: ${adjStart}ms to ${adjEnd}ms`);
```

### Inspecting a step's input values

```typescript
const step = record.steps[0];
for (const [handleName, input] of step.inputValues) {
  if (input.isDefault) {
    console.log(`${handleName}: default = ${input.defaultValue}`);
  } else {
    for (const conn of input.connections) {
      console.log(
        `${handleName}: ${conn.value} from ${conn.sourceNodeName}.${conn.sourceHandleName}`,
      );
    }
  }
}
```

### Iterating loop records

```typescript
for (const [loopId, loopRecord] of record.loopRecords) {
  console.log(`Loop ${loopId}: ${loopRecord.totalIterations} iterations`);
  for (const iter of loopRecord.iterations) {
    console.log(
      `  Iteration ${iter.iteration}: ${iter.duration}ms, ` +
        `condition=${iter.conditionValue}, ${iter.stepRecords.length} steps`,
    );
  }
}
```

### Iterating switch records

```typescript
for (const [switchId, switchRecord] of record.switchRecords) {
  console.log(
    `Switch ${switchId}: branch=${switchRecord.branchTaken}, ` +
      `${switchRecord.stepRecords.length} steps in the taken branch`,
  );
}
```

### Walking nested loop records

```typescript
function walkLoop(loopRecord, depth = 0) {
  console.log(`${'  '.repeat(depth)}Loop ${loopRecord.loopStructureId}`);
  for (const iter of loopRecord.iterations) {
    for (const [, child] of iter.nestedLoopRecords) {
      walkLoop(child, depth + 1); // nested loops live here, not in record.loopRecords
    }
  }
}
for (const [, loop] of record.loopRecords) walkLoop(loop);
```

### Accessing group inner records

```typescript
for (const [groupId, groupRecord] of record.groupRecords) {
  const inner = groupRecord.innerRecord;
  console.log(
    `Group ${groupId} (${groupRecord.groupNodeTypeId}): ` +
      `${inner.steps.length} inner steps, status=${inner.status}`,
  );
}
```

### Exporting and importing a record

```typescript
import { exportExecutionRecord } from './utils/importExport/recordExport';
import { importExecutionRecord } from './utils/importExport/recordImport';

// Export
const json = exportExecutionRecord(record, { pretty: true });

// Import
const result = importExecutionRecord(json);
if (result.success) {
  const restoredRecord: ExecutionRecord = result.data;
}
```

## Relationships with Other Features

### -> [Runner Executor (`executor/`)](runnerExecutorDoc.md)

The executor is the primary consumer of `ExecutionRecorder`. It creates a
recorder instance at the start of each run and calls its methods throughout
execution:

- `beginStep()` / `completeStep()` / `errorStep()` / `skipStep()` for every node
- `beginLevel()` / `completeLevel()` for each concurrency level
- `beginLoopStructure()` / `beginLoopIteration()` / `completeLoopIteration()` /
  `completeLoopStructure()` for loop blocks (`executeLoopBlock.ts`)
- `beginSwitchStructure()` / `completeSwitchStructure()` for switch blocks
  (`executeSwitchBlock.ts`)
- `beginScope()` / `endScope()` / `completeGroup()` for group scopes
  (`executeGroupScope.ts`)
- `pause()` for debug-mode yields (`resume()` is auto-committed by the next
  `beginStep()`)
- `snapshot()` for debug mode partial records
- `finalize(status, finalValues, warmupDuration)` at the end of execution

Helper functions `recordInputValues()` and `recordOutputValues()` (in
`executor/executionHelpers.ts`) convert runtime `InputHandleValue` / output maps
to the recorded snapshot types. `recordStructuralNodeCompletion()` records
minimal step records for structural wrapper nodes -- which have no function
implementation -- so they still appear in `record.steps` for timeline/replay
visibility. It is called only from `executeGroupScope.ts` (the group node, after
`endScope()`) and from `executeLoopBlock.ts` (the LoopEnd node on the
max-iterations error path). Loop triplet and switch start/end steps are
otherwise recorded directly via `beginStep()` + `completeStep()`/`errorStep()`
inside `executeLoopBlock`/`executeSwitchBlock`, not through this helper. Because
the group structural step is appended **after** its body steps, the hook's
`computeVisualStatesAtStep()` applies phase-2/3 overrides to keep
loop-start/stop and group nodes shown as `'running'` while their bodies replay.

### -> [Runner Hook (`useNodeRunner.ts`)](runnerHookDoc.md)

The `useNodeRunner` hook exposes the record as a top-level `executionRecord`
value (`src/utils/nodeRunner/useNodeRunner.ts` ›
`UseNodeRunnerReturn.executionRecord`). The hook receives the record from the
executor callback and stores it in plain React state --
`setExecutionRecord(record)` writes into the `internalRecord` `useState` slot
(`src/utils/nodeRunner/useNodeRunner.ts` › `finalizeRun`) -- making it available
to all panel components as a flat prop. There is no "session" wrapper in the
hook; the record, `currentStepIndex` (its own `useState`), and the action
callbacks are returned as independent flat values.

> Note: `types.ts` declares a `RunSession` type (with a `record` field, a
> `currentStepIndex`, and an `interactionState`) plus `NodeRunnerPanelState`,
> documented in source as "the primary data model consumed by the
> NodeRunnerPanel organism." These types are **defined-but-unused** -- no hook
> or component imports them. The live wiring uses the flat props described
> above, not a `RunSession`.

### -> [ExecutionTimeline (`ExecutionTimeline.tsx`)](../ui/executionTimelineDoc.md)

The timeline component renders `record.steps` as visual blocks. Each block's
horizontal position and width are derived from `step.startTime` and
`step.duration` (with `pauseAdjustment` applied for debug mode). The scrubber
position arrives as the flat `currentStepIndex` prop (passed straight through
from the hook via `NodeRunnerPanel`), and scrub gestures call back through
`onScrubTo`; that index drives the replay visual states on the graph canvas.

### -> [ExecutionStepInspector (`ExecutionStepInspector.tsx`)](../ui/executionStepInspectorDoc.md)

The inspector displays detail for `record.steps[selectedStepIndex]`. It renders:

- Input values with per-connection detail (source node/handle names, values)
- Output values with data types and fan-out counts
- Error details when `step.status === 'errored'`
- Loop/group context metadata

### -> [Import/Export System](../importExport/importExportDoc.md)

The import/export system handles JSON serialization of `ExecutionRecord`:

- **Export** (`recordExport.ts`): Wraps the serialized record in an envelope
  with version and timestamp. Uses `serializeExecutionRecord()` from
  `serialization.ts`.
- **Import** (`recordImport.ts`): Parses JSON, validates structure, applies
  optional repair strategies (e.g., removing malformed steps), and deserializes
  back to `ExecutionRecord` with proper `Map` fields.
- **Serialization** (`serialization.ts`): Converts `ReadonlyMap` fields to plain
  `Record` objects for JSON compatibility. Handles recursive `GroupRecord` and
  `LoopRecord` (including `nestedLoopRecords`) serialization, and round-trips
  `warmupDuration` (defaulting to 0 on older records). Uses
  `safeSerializeValue()` to handle non-serializable values (functions ->
  `"[Function]"`, symbols -> `"[Symbol: ...]"`, etc.). **Caveat:**
  `switchRecords` are serialized shallowly and dropped on import (see
  [Limitations](#limitations-and-deprecated-patterns)).

### -> [NodeRunnerPanel (`NodeRunnerPanel.tsx`)](../ui/nodeRunnerPanelDoc.md)

The panel organism receives the `ExecutionRecord` directly as a flat `record`
prop (`src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx` ›
`NodeRunnerPanelProps.record`: `ExecutionRecord | null`) -- it does **not** wrap
a `RunSession` -- and orchestrates the Timeline, Inspector, and RunControls. The
scrubber position likewise arrives as a flat `currentStepIndex` prop with an
`onScrubTo` callback; there is no `interactionState`. Per-run UI preferences
(which step's detail is open in the inspector, edge-value animation, panel
open/closed) are read from `RecordingViewState` via the
`useRecordingViewState()` context hook --
`selectedStepIndex`/`setSelectedStepIndex` drive the inspector selection, not a
session object.
