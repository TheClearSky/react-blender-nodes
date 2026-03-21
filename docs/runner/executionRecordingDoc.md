# Execution Recording

## Overview

The execution recording system captures every step of a graph execution run for
replay, inspection, and export. When the runner executor processes nodes, an
`ExecutionRecorder` instance builds an `ExecutionRecord` incrementally --
recording timing, input/output value snapshots, errors, loop iterations, and
group inner executions. The resulting record powers the ExecutionTimeline
(visual block-based replay), the ExecutionStepInspector (per-step detail view),
and the import/export system (JSON serialization for sharing or archival).

Recording works in both execution modes:

- **Performance mode**: The executor runs to completion, then the finalized
  `ExecutionRecord` is available for post-hoc replay via the timeline scrubber.
- **Debug (step-by-step) mode**: The recorder produces snapshots after each
  step, enabling live inspection of partial results. Pause/resume tracking
  ensures timing accuracy by subtracting user idle time.

## Entity-Relationship Diagram

```
ExecutionRecord
|
|-- id: string
|-- startTime / endTime / totalDuration / totalPauseDuration
|-- status: 'completed' | 'errored' | 'cancelled'
|
|-- steps[]: ExecutionStepRecord
|   |-- stepIndex, nodeId, nodeTypeId, nodeTypeName
|   |-- startTime, endTime, duration, pauseAdjustment
|   |-- status: 'completed' | 'errored' | 'skipped'
|   |-- inputValues: Map<handleName, RecordedInputHandleValue>
|   |   |-- connections[]: RecordedInputConnection
|   |   |   |-- value, sourceNodeId, sourceNodeName
|   |   |   |-- sourceHandleId, sourceHandleName, sourceDataTypeId
|   |   |-- dataTypeId, isDefault, defaultValue?
|   |-- outputValues: Map<handleName, RecordedOutputHandleValue>
|   |   |-- value, dataTypeId, targetCount
|   |-- error?: GraphError
|   |-- loopIteration?, loopStructureId?
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
         +----> RunSession  (wraps record for panel state)
```

## Data Flow Diagram

```
                     Executor begins run
                            |
                            v
                  ExecutionRecorder.start()
                  (sets reference startTime)
                            |
         +------------------+------------------+
         |                  |                  |
         v                  v                  v
   Standard Node       Loop Block        Group Scope
         |                  |                  |
   beginStep()        beginLoopStructure()   beginScope()
   [resolve inputs]   beginLoopIteration()   [execute inner plan]
   [call impl]             |                  endScope() -> inner record
   completeStep()     Per iteration:          completeGroup()
   or errorStep()       beginStep()
   or skipStep()        completeStep()
                        completeLoopIteration()
                      completeLoopStructure()
         |                  |                  |
         +------------------+------------------+
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
|  | (valueStore.ts)   |    | (executor.ts)    |                  |
|  +-------------------+    +--------+---------+                  |
|                                    |                            |
|                            uses    |                            |
|                                    v                            |
|                           +------------------+                  |
|                           | ExecutionRecorder|                  |
|                           | (recorder.ts)    |                  |
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

| Field                | Type                                    | Description                                                                                                                                                                                                |
| -------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | `string`                                | Unique identifier for this execution run. Generated via `crypto.randomUUID()` with a fallback to `run-{timestamp}-{random}`. Scoped records (from group inner execution) append `-scope-{startStepIndex}`. |
| `startTime`          | `number`                                | Absolute start time from `performance.now()`. Used as the reference point for all relative timestamps within the record.                                                                                   |
| `endTime`            | `number`                                | Absolute end time from `performance.now()`. Set when `finalize()` or `endScope()` is called.                                                                                                               |
| `totalDuration`      | `number`                                | Wall-clock duration in milliseconds (`endTime - startTime`). Includes any pause time in debug mode.                                                                                                        |
| `totalPauseDuration` | `number`                                | Total accumulated pause time in milliseconds. Only non-zero in step-by-step (debug) mode. Subtract from `totalDuration` to get execution-only duration.                                                    |
| `status`             | `ExecutionRecordStatus`                 | Terminal status: `'completed'`, `'errored'`, or `'cancelled'`.                                                                                                                                             |
| `steps`              | `ReadonlyArray<ExecutionStepRecord>`    | All step records in execution order. Each entry represents one node execution.                                                                                                                             |
| `errors`             | `ReadonlyArray<GraphError>`             | All errors that occurred during execution, in order.                                                                                                                                                       |
| `concurrencyLevels`  | `ReadonlyArray<ConcurrencyLevelRecord>` | Per-level timing data. Not tracked for scoped (group inner) records.                                                                                                                                       |
| `loopRecords`        | `ReadonlyMap<string, LoopRecord>`       | Loop execution recordings, keyed by loop structure ID.                                                                                                                                                     |
| `groupRecords`       | `ReadonlyMap<string, GroupRecord>`      | Group execution recordings, keyed by group node instance ID. Contains recursive `ExecutionRecord` for inner execution.                                                                                     |
| `finalValues`        | `ReadonlyMap<string, unknown>`          | Complete ValueStore snapshot at end of execution. Keys are qualified handle IDs (`"nodeId:handleId"`).                                                                                                     |

### ExecutionRecordStatus

```typescript
const executionRecordStatuses = ['completed', 'errored', 'cancelled'] as const;
type ExecutionRecordStatus = (typeof executionRecordStatuses)[number];
```

## ExecutionStepRecord Type

Recording of a single node's execution step.

| Field              | Type                                             | Description                                                                                                                                                         |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stepIndex`        | `number`                                         | Zero-based index in the `steps` array. Assigned at `beginStep()` time.                                                                                              |
| `nodeId`           | `string`                                         | Runtime node instance ID.                                                                                                                                           |
| `nodeTypeId`       | `string`                                         | Node type ID from the type definitions.                                                                                                                             |
| `nodeTypeName`     | `string`                                         | Display name of the node type.                                                                                                                                      |
| `concurrencyLevel` | `number`                                         | Which concurrency level this step belongs to.                                                                                                                       |
| `startTime`        | `number`                                         | Time relative to execution start (ms). Computed as `performance.now() - recorder.startTime`.                                                                        |
| `endTime`          | `number`                                         | Time relative to execution start (ms). Set on completion/error/skip.                                                                                                |
| `duration`         | `number`                                         | Duration of this step in ms (`endTime - startTime`). Set to 0 for skipped steps.                                                                                    |
| `pauseAdjustment`  | `number`                                         | Cumulative pause duration (ms) at the moment this step started. Subtract from `startTime`/`endTime` to get execution-only timestamps. Always 0 in performance mode. |
| `status`           | `ExecutionStepRecordStatus`                      | `'completed'`, `'errored'`, or `'skipped'`.                                                                                                                         |
| `inputValues`      | `ReadonlyMap<string, RecordedInputHandleValue>`  | Snapshot of resolved input values at execution time. Keyed by handle **name**.                                                                                      |
| `outputValues`     | `ReadonlyMap<string, RecordedOutputHandleValue>` | Snapshot of computed output values. Keyed by handle **name**. Empty for errored/skipped steps.                                                                      |
| `error`            | `GraphError \| undefined`                        | Error details, only present when `status === 'errored'`.                                                                                                            |
| `loopIteration`    | `number \| undefined`                            | Loop iteration number, only set when executing inside a loop body.                                                                                                  |
| `loopStructureId`  | `string \| undefined`                            | Loop structure identifier, only set when inside a loop body. Used to associate steps with their `LoopRecord`.                                                       |
| `groupNodeId`      | `string \| undefined`                            | Group node instance ID, only set when executing inside a group scope.                                                                                               |
| `groupDepth`       | `number \| undefined`                            | Group nesting depth, only set inside a group scope.                                                                                                                 |

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

| Field            | Type                                 | Description                                                                                                                                                 |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iteration`      | `number`                             | Zero-based iteration index.                                                                                                                                 |
| `startTime`      | `number`                             | Time relative to execution start (ms).                                                                                                                      |
| `endTime`        | `number`                             | Time relative to execution start (ms).                                                                                                                      |
| `duration`       | `number`                             | Duration of this iteration (ms).                                                                                                                            |
| `conditionValue` | `boolean`                            | The boolean condition value evaluated at the end of this iteration. `true` means the loop continues; `false` means the loop exits.                          |
| `stepRecords`    | `ReadonlyArray<ExecutionStepRecord>` | Step records for all body nodes executed in this iteration. Steps are added to this array as they complete via `completeStep()`/`errorStep()`/`skipStep()`. |

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

The `ExecutionRecorder` class (defined in `executionRecorder.ts`) is the
stateful recorder that builds an `ExecutionRecord` incrementally during
execution.

### Construction

```typescript
const recorder = new ExecutionRecorder();
```

Generates a unique ID via `crypto.randomUUID()` (with fallback).

### Lifecycle Methods

| Method                            | Description                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start()`                         | Sets the reference time (`performance.now()`). All subsequent timestamps are relative to this.                                                   |
| `finalize(status, finalValues)`   | Returns the complete, final `ExecutionRecord`. Called once at the end of execution.                                                              |
| `snapshot(status, currentValues)` | Returns a shallow-copy snapshot of the current state without mutating the recorder. Used in debug mode to yield partial records after each step. |

### Step Recording Methods

| Method                                               | Description                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `beginStep(params)`                                  | Records a step beginning. Sets `startTime`, initial `pauseAdjustment`, and metadata. Returns the step index for later completion. |
| `completeStep(stepIndex, inputValues, outputValues)` | Records successful step completion. Sets `endTime`, `duration`, `status='completed'`, and value snapshots.                        |
| `errorStep(stepIndex, error, inputValues)`           | Records a step failure. Sets `endTime`, `duration`, `status='errored'`, the error, and pushes to the errors array.                |
| `skipStep(stepIndex)`                                | Records a step being skipped (upstream errored). Sets `duration=0`, `status='skipped'`.                                           |

### Concurrency Level Methods

| Method                       | Description                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `beginLevel(level, nodeIds)` | Records the start of a concurrency level's execution.                             |
| `completeLevel(level)`       | Records the completion of a concurrency level. Pushes a `ConcurrencyLevelRecord`. |

### Loop Recording Methods

| Method                                                              | Description                                                                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `beginLoopStructure(loopStructureId, startId, stopId, endId)`       | Initializes tracking for a loop structure before iterations begin.                                                            |
| `beginLoopIteration(loopStructureId, iteration)`                    | Starts recording a loop iteration. Step records within the loop are automatically associated.                                 |
| `completeLoopIteration(loopStructureId, iteration, conditionValue)` | Finalizes an iteration record with timing and the condition boolean. Pushes a `LoopIterationRecord` to the pending structure. |
| `completeLoopStructure(loopStructureId)`                            | Finalizes the loop recording. Computes total timing and pushes the completed `LoopRecord` to `loopRecords`.                   |

### Group Recording Methods

| Method                                                                                  | Description                                                                                                |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `beginGroup(groupNodeId, groupNodeTypeId)`                                              | Placeholder (no-op). Group state is managed via scopes.                                                    |
| `completeGroup(groupNodeId, groupNodeTypeId, innerRecord, inputMapping, outputMapping)` | Records the completed group execution. Pushes a `GroupRecord` with the recursively captured `innerRecord`. |

### Scope Methods (for Group Inner Execution)

| Method                           | Description                                                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginScope()`                   | Pushes a snapshot of current array lengths and map keys onto the scope stack. All subsequent recordings belong to this scope.                                                                 |
| `endScope(status, scopedValues)` | Pops the scope and returns an `ExecutionRecord` containing only steps, errors, loop records, and group records created within the scope. Used to produce the `innerRecord` for `GroupRecord`. |

Scopes nest correctly for recursive group execution -- each `beginScope()`
pushes onto a stack, and `endScope()` pops the most recent.

### Pause Methods (for Debug Mode)

| Method                        | Description                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pause()`                     | Marks the recorder as paused. Records the pause start time.                                                    |
| `resume()`                    | Resumes timing. Accumulates the elapsed pause time into `totalPauseDuration`.                                  |
| `getEffectivePauseDuration()` | (private) Returns `totalPauseDuration` plus any in-progress pause time. Used by `snapshot()` and `finalize()`. |

### Utility Methods

| Method            | Description                                                                        |
| ----------------- | ---------------------------------------------------------------------------------- |
| `getLatestStep()` | Returns the most recently added `ExecutionStepRecord`. Used for debug mode yields. |

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

### startTime, endTime, duration

All timing in the recording system uses `performance.now()` for high-resolution
timestamps.

- **ExecutionRecord**: `startTime` and `endTime` are absolute
  `performance.now()` values. `totalDuration = endTime - startTime`.
- **ExecutionStepRecord**: `startTime` and `endTime` are **relative** to the
  execution start (i.e., `performance.now() - recorder.startTime`).
  `duration = endTime - startTime`.
- **LoopRecord / LoopIterationRecord**: Times are relative to execution start,
  same as step records.
- **ConcurrencyLevelRecord**: Times are relative to execution start.

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

1. `pause()` -- called before yielding in step-by-step mode. Records
   `pausedAt = performance.now()`.
2. `resume()` -- called when execution resumes. Adds
   `performance.now() - pausedAt` to `totalPauseDuration`.
3. Each `beginStep()` call captures the current `totalPauseDuration` as the
   step's `pauseAdjustment`.

### totalPauseDuration

Available on the `ExecutionRecord` itself. Represents the total accumulated
pause time across all yields. In performance mode this is always 0. Useful for
computing effective execution duration:

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

2. **Scoped records omit concurrency levels**: When `endScope()` produces an
   `ExecutionRecord` for a group's inner execution, the `concurrencyLevels`
   array is always empty. This is because concurrency level tracking is done at
   the top-level executor loop, not per-scope.

3. **originalError is not round-trippable**: When exporting,
   `GraphError.originalError` (which can be an Error instance or any thrown
   value) is serialized via `safeSerializeValue()`. The original Error instance
   cannot be reconstructed on import -- it remains in its serialized form (an
   object with `name`, `message`, `stack` fields).

4. **NODE_RUNNER_DATA_FLOW.md references `plan` field**: The data flow doc shows
   `ExecutionRecord` with a `plan: ExecutionPlan` field. The actual type
   definition does not include this field. The execution plan is kept separate
   from the recording.

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

### -> [Runner Executor (`executor.ts`)](runnerExecutorDoc.md)

The executor is the primary consumer of `ExecutionRecorder`. It creates a
recorder instance at the start of each run and calls its methods throughout
execution:

- `beginStep()` / `completeStep()` / `errorStep()` / `skipStep()` for every node
- `beginLevel()` / `completeLevel()` for each concurrency level
- `beginLoopStructure()` / `beginLoopIteration()` / `completeLoopIteration()` /
  `completeLoopStructure()` for loop blocks
- `beginScope()` / `endScope()` / `completeGroup()` for group scopes
- `pause()` / `resume()` for debug mode yields
- `snapshot()` for debug mode partial records
- `finalize()` at the end of execution

Helper functions `recordInputValues()` and `recordOutputValues()` in the
executor convert runtime `InputHandleValue` / output maps to the recorded
snapshot types.

### -> [Runner Hook (`useNodeRunner.ts`)](runnerHookDoc.md)

The `useNodeRunner` hook exposes `executionRecord` as part of the `RunSession`
state. The hook receives the record from the executor callback and stores it in
the active session, making it available to all panel components.

### -> [ExecutionTimeline (`ExecutionTimeline.tsx`)](../ui/executionTimelineDoc.md)

The timeline component renders `record.steps` as visual blocks. Each block's
horizontal position and width are derived from `step.startTime` and
`step.duration` (with `pauseAdjustment` applied for debug mode). The scrubber
position maps to `interactionState.currentStepIndex`, which drives the replay
visual states on the graph canvas.

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
  `Record` objects for JSON compatibility. Handles recursive `GroupRecord`
  serialization. Uses `safeSerializeValue()` to handle non-serializable values
  (functions -> `"[Function]"`, symbols -> `"[Symbol: ...]"`, etc.).

### -> [NodeRunnerPanel (`NodeRunnerPanel.tsx`)](../ui/nodeRunnerPanelDoc.md)

The panel organism wraps the `RunSession` (which contains the `ExecutionRecord`)
and orchestrates the Timeline, Inspector, and RunControls. It manages the
`interactionState` that controls which step is selected and where the scrubber
is positioned.
