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
|   |-- parentLoopStructureId?, parentLoopIteration?   (parent routing)
|   |-- switchPhase?, switchStructureId?, branchTaken?
|   |-- groupNodeId?, groupDepth?
|   |-- instancePath?   (chain of group-INSTANCE ids, outermost first; absent
|   |                    at root. Unlike groupNodeId — a shared TEMPLATE id
|   |                    below depth 1 — the chain uniquely identifies which
|   |                    instance path executed the step. A group's OWN
|   |                    structural step carries its PARENT scope's path.)
|
|-- errors[]: GraphError
|
|-- concurrencyLevels[]: ConcurrencyLevelRecord
|   |-- level, startTime, endTime, duration, nodeIds[]
|
|-- loopRecords: Map<identityKey, LoopRecord>
|   |                 (identityKey = JSON.stringify([...ownerInstancePath,
|   |                  loopStructureId]) — e.g. ["L"], ["g2","L"],
|   |                  ["g2","s1","L"]. OPAQUE: build with structureRecordKey,
|   |                  read with resolveStructureRecord, never parse.)
|   |-- loopStructureId, ownerInstancePath   (the same identity, structurally)
|   |-- loopStartNodeId, loopStopNodeId, loopEndNodeId
|   |-- totalIterations, startTime, endTime, duration
|   |-- iterations[]: LoopIterationRecord
|       |-- iteration, startTime, endTime, duration
|       |-- conditionValue: boolean
|       |-- stepRecords[]: ExecutionStepRecord
|       |-- nestedLoopRecords: Map<identityKey, LoopRecord>   (hierarchical)
|       |-- nestedSwitchRecords: Map<...>   (always empty — see note)
|
|-- switchRecords: Map<identityKey, SwitchRecord>
|   |-- switchStructureId, ownerInstancePath
|   |-- switchStartNodeId, switchEndNodeId
|   |-- branchTaken: boolean, startTime, endTime, duration
|   |-- stepRecords[]: ExecutionStepRecord  (only the taken branch)
|   |-- nestedLoopRecords / nestedSwitchRecords   (always empty)
|
|-- groupRecords: Map<identityKey, GroupRecord>
|   |-- groupNodeId, ownerInstancePath   (the PARENT path; append groupNodeId
|   |                                     for this instance's own path)
|   |-- groupNodeTypeId
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
 beginStep()    beginLoop-     beginSwitch-   beginScope(path)
 [resolve         Structure()    Structure()   -> scope token
  inputs]       beginLoop-     [resolve      [execute inner plan]
 [call impl]      Iteration()    condition]    endScope(token)
                                               -> inner record
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
| `id`                 | `string`                                | Unique identifier for this execution run. Generated via `crypto.randomUUID()` with a fallback to `run-{timestamp}-{random}`. Scoped records (from group inner execution) append `-scope-{tokenSerial}` (the scope token's serial — unique even when concurrent sibling scopes start at the same step index).                                                                                                                                                        |
| `startTime`          | `number`                                | Absolute start time from the monotonic timer (set by `start()`). Used as the reference point for all relative timestamps within the record.                                                                                                                                                                                                                                                                                                                         |
| `endTime`            | `number`                                | Absolute end time from the monotonic timer. Set when `finalize()`, `snapshot()`, or `endScope()` is called.                                                                                                                                                                                                                                                                                                                                                         |
| `totalDuration`      | `number`                                | Wall-clock duration in milliseconds (`endTime - startTime`). Includes any pause time in debug mode.                                                                                                                                                                                                                                                                                                                                                                 |
| `warmupDuration`     | `number`                                | Time (ms) spent warming up the JS engine (JIT compilation) before the timed execution begins. Set by the executor when calling `finalize(status, finalValues, warmupDuration)`. Always 0 for scoped/snapshot records.                                                                                                                                                                                                                                               |
| `totalPauseDuration` | `number`                                | Total accumulated pause time in milliseconds. Only non-zero in step-by-step (debug) mode. Subtract from `totalDuration` to get execution-only duration.                                                                                                                                                                                                                                                                                                             |
| `status`             | `ExecutionRecordStatus`                 | Terminal status: `'completed'`, `'errored'`, or `'cancelled'`. `runAll.ts`/`stepByStep.ts` compute the final status as `abortSignal.aborted ? 'cancelled' : hasErrors ? 'errored' : 'completed'` and additionally call `finalize('cancelled', …)` from abort early-returns: `runAll.ts` has a per-level abort return only, while `stepByStep.ts` has both a per-level and a per-step abort return. Either way, `'cancelled'` **is** produced when a run is aborted. |
| `steps`              | `ReadonlyArray<ExecutionStepRecord>`    | All step records in execution order. Each entry represents one node (or structural triplet) execution.                                                                                                                                                                                                                                                                                                                                                              |
| `errors`             | `ReadonlyArray<GraphError>`             | All errors that occurred during execution, in order.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `concurrencyLevels`  | `ReadonlyArray<ConcurrencyLevelRecord>` | Per-level timing data. Not tracked for scoped (group inner) records (always empty there).                                                                                                                                                                                                                                                                                                                                                                           |
| `loopRecords`        | `ReadonlyMap<string, LoopRecord>`       | Loop execution recordings, keyed by IDENTITY — `structureRecordKey(ownerInstancePath, loopStructureId)` — see [Record keys](#record-keys-identity-not-id). On a healthy run only **top-level** loops appear here and nested loops live under their parent `LoopIterationRecord.nestedLoopRecords` (keyed identically); a finalize salvage can additionally surface an uncollected NESTED loop here, flagged by an `orphan-promoted` warning.                        |
| `switchRecords`      | `ReadonlyMap<string, SwitchRecord>`     | Switch execution recordings, keyed by identity exactly like `loopRecords`.                                                                                                                                                                                                                                                                                                                                                                                          |
| `groupRecords`       | `ReadonlyMap<string, GroupRecord>`      | Group execution recordings, keyed by identity — `structureRecordKey(ownerInstancePath, groupNodeId)`, i.e. the instance's own full path. Contains a recursive `ExecutionRecord` for the inner execution. Note: because `endScope` COPIES (never deletes), a group-inner structure's record ALSO appears in the top-level final maps under the same key.                                                                                                             |
| `finalValues`        | `ReadonlyMap<string, unknown>`          | Complete ValueStore snapshot at end of execution. Keys are qualified handle IDs (`"nodeId:handleId"`).                                                                                                                                                                                                                                                                                                                                                              |
| `viewState`          | `RecordingViewState \| undefined`       | Optional UI preferences (selected step, run mode, time mode, expanded iterations, etc.) captured when the recording is saved. Not set by the recorder itself; attached by the panel/export layer.                                                                                                                                                                                                                                                                   |

### Record keys: identity, not id

A structure's id is a NODE id — for a loop, its LoopStart node. Every instance
of a node group shares its template's node ids, so two instances of one group
running the same template loop produce the **same** structure id. Keying a
record map by that id makes the two instances collide.

The key is therefore the structure's **full path**: the owning group-instance
path followed by the structure's own id, serialized as a JSON array by
`src/utils/nodeRunner/executionRecorder.ts` › `structureRecordKey`.

```
identity = [...ownerInstancePath, structureId]

  root loop L                       →  ["L"]
  loop L inside instance g2         →  ["g2","L"]
  loop L inside g2 → subgroup s1    →  ["g2","s1","L"]     (any depth)
  group instance g2 itself          →  ["g2"]
```

One format, every map, every depth — top-level and scoped copies alike.
`endScope` copies keys verbatim, so a nested record is addressed identically
from its own scope and from every ancestor scope.

**Why a JSON array rather than a delimited string.** A string key is unavoidable
at this boundary for two independent reasons: `Map` compares keys with
SameValueZero, so an array would compare by REFERENCE and could never be used
for value lookup; and the maps must serialize to JSON objects, whose keys are
strings by definition. Among string encodings, JSON is _injective_ over string
arrays — every quote, backslash and delimiter inside an id is escaped — so two
different identities can never collapse onto one key. A `join('/') + '|'` scheme
cannot promise that: `(['a'], 'b|c')` and `(['a|b'], 'c')` both produce `a|b|c`.
The recorder's INTERNAL bookkeeping composes no strings at all; it keys by plain
structure id into short lists of entries carrying structured `ownerInstancePath`
values compared by value.

**Keys are OPAQUE.** Build them with `structureRecordKey`, resolve them with
`resolveStructureRecord`, and never parse one. Identity is available
structurally on every record as `ownerInstancePath` (alongside `loopStructureId`
/ `switchStructureId` / `groupNodeId`), and that is what survives export/import
— the recorder's ownership bookkeeping is private and is not serialized.

```typescript
import {
  structureRecordKey,
  resolveStructureRecord,
} from '@theclearsky/react-blender-nodes';

// Build:
record.loopRecords.get(structureRecordKey(step.instancePath ?? [], loopId));

// Resolve (preferred — also reaches salvage duplicates and pre-v3 exports):
const hit = resolveStructureRecord(
  record.loopRecords,
  step.loopStructureId,
  step.instancePath,
);
hit?.record.totalIterations; // the OWNING instance's loop, not a namesake's
```

`resolveStructureRecord` tries the exact identity first, then the numeric
salvage ordinal — when the finalize backstop promotes residue whose identity key
is already taken it appends an ordinal, `["g2","L",1]`, so a salvaged record
never overwrites a healthy one (see [Recorder warnings](#recorder-warnings)) —
then, only for records filed under a PRE-identity key, a compatibility scan by
bare id. A record under a real identity key is never returned for a different
identity, which is exactly the aliasing this format exists to remove.

**Recordings exported before this format** carry bare (or `owner|id`) keys and
no `ownerInstancePath`. They still import and still resolve through that final
scan; import validation reports them once per map as a `warning`-severity issue
telling you to re-export. Because the deserializers default a missing
`ownerInstancePath` to `[]` (so an imported record is not a type lie), the
compatibility test is on the KEY's shape, not on the record's fields.

### ExecutionRecordStatus

```typescript
const executionRecordStatuses = ['completed', 'errored', 'cancelled'] as const;
type ExecutionRecordStatus = (typeof executionRecordStatuses)[number];
```

Defined in `src/utils/nodeRunner/types.ts` › `ExecutionRecordStatus`.

## ExecutionStepRecord Type

Recording of a single node's execution step.

| Field                   | Type                                             | Description                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stepIndex`             | `number`                                         | Zero-based index in the `steps` array. Assigned at `beginStep()` time.                                                                                                                                                                                                                                           |
| `nodeId`                | `string`                                         | Runtime node instance ID.                                                                                                                                                                                                                                                                                        |
| `nodeTypeId`            | `string`                                         | Node type ID from the type definitions.                                                                                                                                                                                                                                                                          |
| `nodeTypeName`          | `string`                                         | Display name of the node type.                                                                                                                                                                                                                                                                                   |
| `customName`            | `string \| undefined`                            | Optional user custom name (standard nodes only); rendered `Custom : Type` in the timeline / inspector / errors. Read from `node.data.customName` at compile time.                                                                                                                                                |
| `concurrencyLevel`      | `number`                                         | Which concurrency level this step belongs to.                                                                                                                                                                                                                                                                    |
| `startTime`             | `number`                                         | Time relative to execution start (ms). Computed as `timer.now() - recorder.startTime` (monotonic timer, not raw `performance.now()`).                                                                                                                                                                            |
| `endTime`               | `number`                                         | Time relative to execution start (ms). Set on completion/error/skip.                                                                                                                                                                                                                                             |
| `duration`              | `number`                                         | Duration of this step in ms (`endTime - startTime`). Set to 0 for skipped steps.                                                                                                                                                                                                                                 |
| `pauseAdjustment`       | `number`                                         | Cumulative pause duration (ms) at the moment this step started. Subtract from `startTime`/`endTime` to get execution-only timestamps. Always 0 in instant (performance) mode.                                                                                                                                    |
| `status`                | `ExecutionStepRecordStatus`                      | `'completed'`, `'errored'`, or `'skipped'`.                                                                                                                                                                                                                                                                      |
| `inputValues`           | `ReadonlyMap<string, RecordedInputHandleValue>`  | Snapshot of resolved input values at execution time. Keyed by handle **name**.                                                                                                                                                                                                                                   |
| `outputValues`          | `ReadonlyMap<string, RecordedOutputHandleValue>` | Snapshot of computed output values. Keyed by handle **name**. Empty for errored/skipped steps.                                                                                                                                                                                                                   |
| `error`                 | `GraphError \| undefined`                        | Error details, only present when `status === 'errored'`.                                                                                                                                                                                                                                                         |
| `estimatedTiming`       | `boolean \| undefined`                           | `true` when the step's real duration was below timer resolution (raw `performance.now()` returned the same value at begin and end). Rendered as "< 0.1ms" in the UI. Set in `completeStep`/`errorStep`.                                                                                                          |
| `loopIteration`         | `number \| undefined`                            | Loop iteration number, only set when executing inside a loop body.                                                                                                                                                                                                                                               |
| `loopStructureId`       | `string \| undefined`                            | Loop structure identifier, only set when inside a loop body. Used to associate steps with their `LoopRecord`/`LoopIterationRecord`.                                                                                                                                                                              |
| `loopPhase`             | `LoopPhase \| undefined`                         | Position within the loop iteration lifecycle (`'loopStart'`, `'preStop'`, `'loopStop'`, `'postStop'`, `'loopEnd'`). Drives vertical ordering and edge animation in the timeline.                                                                                                                                 |
| `inputSource`           | `'upstream' \| 'feedback' \| undefined`          | For LoopStart steps: whether inputs came from upstream nodes (iteration 0) or from LoopStop feedback (iteration N > 0). Controls which edges animate.                                                                                                                                                            |
| `parentLoopStructureId` | `string \| undefined`                            | **Load-bearing routing field** — the enclosing loop's structure id, set on steps recorded inside a nested structure (by `executeLoopBlock` via `parentFields`, and by `executeGroupScope` for group-in-loop wrapper steps). `addStepToPendingIteration` uses it as the fallback route into the parent iteration. |
| `parentLoopIteration`   | `number \| undefined`                            | **Load-bearing routing field** — the enclosing loop's iteration number, paired with `parentLoopStructureId` for the same fallback routing.                                                                                                                                                                       |
| `switchPhase`           | `SwitchPhase \| undefined`                       | Position within the switch lifecycle (`'switchStart'`, `'trueBranch'`, `'falseBranch'`, `'switchEnd'`).                                                                                                                                                                                                          |
| `switchStructureId`     | `string \| undefined`                            | Switch structure identifier (the `switchStartNodeId`), only set inside a switch. Associates the step with its `SwitchRecord`.                                                                                                                                                                                    |
| `branchTaken`           | `boolean \| undefined`                           | Which branch the switch took (`true` = condition was true). Set on switch-phase steps.                                                                                                                                                                                                                           |
| `groupNodeId`           | `string \| undefined`                            | Group node instance ID, only set when executing inside a group scope.                                                                                                                                                                                                                                            |
| `groupDepth`            | `number \| undefined`                            | Group nesting depth, only set inside a group scope.                                                                                                                                                                                                                                                              |

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

| Field               | Type                                 | Description                                                                                                                                                                                           |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loopStructureId`   | `string`                             | Unique identifier for this loop structure (matches the loop compilation block). A TEMPLATE id when the loop lives inside a node group — shared by every instance.                                     |
| `ownerInstancePath` | `readonly string[]`                  | Instance path of the group instance that OWNS this loop (`[]` at root). With `loopStructureId` this is the record's full identity; unlike the map key it survives export/import and needs no parsing. |
| `loopStartNodeId`   | `string`                             | Node instance ID of the LoopStart node.                                                                                                                                                               |
| `loopStopNodeId`    | `string`                             | Node instance ID of the LoopStop node.                                                                                                                                                                |
| `loopEndNodeId`     | `string`                             | Node instance ID of the LoopEnd node.                                                                                                                                                                 |
| `iterations`        | `ReadonlyArray<LoopIterationRecord>` | Per-iteration recordings in execution order.                                                                                                                                                          |
| `totalIterations`   | `number`                             | Total number of iterations executed (`iterations.length`).                                                                                                                                            |
| `startTime`         | `number`                             | Time relative to execution start when the loop began (ms).                                                                                                                                            |
| `endTime`           | `number`                             | Time relative to execution start when the loop completed (ms).                                                                                                                                        |
| `duration`          | `number`                             | Total wall-clock time for all iterations (ms).                                                                                                                                                        |

### LoopIterationRecord

Recording of a single loop iteration.

| Field                 | Type                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `iteration`           | `number`                             | Zero-based iteration index.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `startTime`           | `number`                             | Time relative to execution start (ms).                                                                                                                                                                                                                                                                                                                                                                                                           |
| `endTime`             | `number`                             | Time relative to execution start (ms).                                                                                                                                                                                                                                                                                                                                                                                                           |
| `duration`            | `number`                             | Duration of this iteration (ms).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `conditionValue`      | `boolean`                            | The boolean condition value evaluated at the end of this iteration. `true` means the loop continues; `false` means the loop exits.                                                                                                                                                                                                                                                                                                               |
| `stepRecords`         | `ReadonlyArray<ExecutionStepRecord>` | Step records for all body nodes executed in this iteration. Steps are added to this array as they complete via `completeStep()`/`errorStep()`/`skipStep()`.                                                                                                                                                                                                                                                                                      |
| `nestedLoopRecords`   | `ReadonlyMap<string, LoopRecord>`    | Loop records for child loops that executed within this iteration, keyed by the child's IDENTITY (`structureRecordKey(ownerInstancePath, loopStructureId)`) exactly like the top-level maps — resolve with `resolveStructureRecord`, never with a bare `.get(step.loopStructureId)`. Populated by `completeLoopIteration()` from `completedNestedLoopRecords`. This is the hierarchical replacement for the deprecated `parentLoop*` step fields. |
| `nestedSwitchRecords` | `ReadonlyMap<string, SwitchRecord>`  | Always an empty `Map` in the current implementation -- switch records are not nested into loop iterations. (Latent today: the compiler does not currently emit switch steps into loop bodies, so no switch executes "inside" a loop iteration at all.)                                                                                                                                                                                           |

#### Nested loop hierarchy

Loops nest by **explicit, caller-declared parentage** — never by ambient
recorder state. A nested loop's executor passes its enclosing loop's context (a
`StructureParentContext`: parent loop structure id + iteration) to
`beginLoopStructure()`; sibling loops pass none and stay top-level no matter
what else is executing concurrently. Every pending entry also carries its OWNING
group instance path, because instances of one group type share their template's
node ids — the owner path is what keeps two instances' identically- named
structures apart, concurrently and sequentially. When a child finishes,
`completeLoopStructure()` parks its record (tagged with the declared parent);
the parent's `completeLoopIteration()` collects every parked child whose
declared parent id + iteration + owner path match — a truly-nested child has
always completed by then, because the parent awaits its body levels before
completing the iteration. Therefore `record.loopRecords` contains only the
outermost loops; deeper loops are reachable by walking
`iteration.nestedLoopRecords` recursively.

## Switch Recording Types

### SwitchRecord

Complete recording of a switch structure's execution. A switch resolves a
boolean condition, runs **only** the chosen branch, then maps that branch's
SwitchEnd inputs to SwitchEnd outputs. Built by `beginSwitchStructure()` /
`completeSwitchStructure()`.

| Field                 | Type                                 | Description                                                                                                                                                                           |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `switchStructureId`   | `string`                             | Unique identifier for this switch structure (the `switchStartNodeId`). A TEMPLATE id when the switch lives inside a node group.                                                       |
| `ownerInstancePath`   | `readonly string[]`                  | Instance path of the group instance that OWNS this switch (`[]` at root) — the record's identity, structurally readable and export-safe.                                              |
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
> `completeSwitchStructure()`; scope membership for switch records is decided by
> the same store-serial watermark as loops and groups (the token's key-set
> snapshots are gone); and `snapshot()`/`endScope()` also surface switch
> records. Switch records round-trip through export/import via dedicated
> recursive (de)serializers (`src/utils/importExport/serialization.ts`).

## Group Recording Types

### GroupRecord

Recording of a node group's execution. Contains a recursive `ExecutionRecord`
representing the inner subtree's execution.

| Field               | Type                           | Description                                                                                                                                                                               |
| ------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groupNodeId`       | `string`                       | The group node's instance ID in the outer graph. Below depth 1 this is itself a TEMPLATE id, shared by every instance of the enclosing group.                                             |
| `ownerInstancePath` | `readonly string[]`            | Instance path of the group instance that CONTAINS this one (`[]` at root) — the PARENT path, matching the group's own wrapper step. Append `groupNodeId` to get this instance's own path. |
| `groupNodeTypeId`   | `string`                       | The group's node type ID (key in `typeOfNodes`).                                                                                                                                          |
| `innerRecord`       | `ExecutionRecord`              | Recursively captured execution record for the group's inner subtree. Built via `beginScope()`/`endScope()` on the same recorder instance.                                                 |
| `inputMapping`      | `ReadonlyMap<string, unknown>` | Map of outer input handle IDs to the values that were injected into the group's `GroupInput` node.                                                                                        |
| `outputMapping`     | `ReadonlyMap<string, unknown>` | Map of inner `GroupOutput` input handle IDs to the values extracted as the group's outputs.                                                                                               |

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
`groupRecords` Maps. Each published map has a parallel ownership-metadata map
recording the plain structure id, the owning instance path, and a monotonic
**store serial** stamped on every write — the serial is what lets `endScope`
tell "this scope wrote that record" from "that key already existed", which a
snapshot of key NAMES cannot do when an instance re-executes and rewrites its
own record under the same identity.

Pending / in-progress structures are tracked so they can be materialized into
snapshots or attached to parents on completion: `pendingLoopStructures`
(top-level AND nested entries in one map — each entry carries its owner instance
path, structure id, and declared parent context), `pendingLoopIterations`,
`completedNestedLoopRecords`, and `pendingSwitchStructures`.

**Internal bookkeeping composes no strings.** Each pending map is keyed by the
PLAIN structure id into a short list of entries — one per concurrently-live
instance of that template — and every lookup filters by the entry's identity
FIELDS (`ownerInstancePath` compared element-wise, declared parent context),
never by parsing a key. With no composed key there is no delimiter, and with no
delimiter there is no way for two identities to alias.

Active recording scopes live in a SET of branded single-use tokens
(`activeScopeTokens`) — there is no stack and no ambient nesting state of any
kind. A private `MonotonicTimer` provides all relative timing, and a
`rawStartTimes` map of raw `performance.now()` values feeds `estimatedTiming`
detection.

### Construction

```typescript
const recorder = new ExecutionRecorder({
  // Optional: the structured warning channel. Unregistered ⇒ dev-only
  // console.warn; registering it takes ownership and silences that fallback.
  onRecorderWarning: (warning) =>
    console.log(warning.kind, warning.key, warning.recordId),
});
```

Generates a unique ID via `crypto.randomUUID()` (with a
`run-{timestamp}-{random}` fallback when `crypto.randomUUID` is unavailable).

#### Recorder warnings

A warning means the recorder observed an anomaly it could compensate for.
Warnings are BOOKKEEPING diagnostics: they never enter `record.errors` (status
is executor-computed before finalize, and a salvage has no step of its own), and
a run that emits them still produces a usable record. On a healthy run the
stream is empty.

`recorderWarningKinds` is exported, and `RecorderWarningKind` is derived from
it, so a consumer can exhaustively switch without hardcoding strings:

| Kind              | Meaning                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orphan-promoted` | Residue was salvaged INTO the record (a structure that never completed, a parked nested record nobody collected, a step begun but never finished). |
| `orphan-dropped`  | Residue could not be attached to anything and was discarded — its steps remain in the flat `steps` list.                                           |
| `unclosed-scope`  | A scope was never ended, so its inner record was not built.                                                                                        |
| `key-collision`   | A begin call superseded a still-pending entry of the same identity.                                                                                |

Every warning carries `recordId` (the `ExecutionRecord.id` it belongs to), so a
consumer accumulating warnings across runs can attribute each one even when a
superseded run finalizes after a new one has started, plus an OPAQUE `key` whose
shape varies by kind (a `structureRecordKey` string, or a step index) and which
must never be parsed.

The callback is consumer code called from inside the recorder's own bookkeeping,
so it is isolated: a throw from it is caught, reported once via `console.error`
in development, and the recording continues.

Separately, in development only, `endScope` prints a `[ExecutionRecorder:dev]`
consistency assertion when a scope closes while a structure it owns is still
pending. That is an internal invariant probe for library developers, not part of
the four-kind consumer contract, and it never reaches `onRecorderWarning`.

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
`loopPhase`, `inputSource`, `switchPhase`, `switchStructureId`, `branchTaken`,
and — load-bearing for identity — `instancePath`, the chain of group-INSTANCE
ids the step executed under. Any step inside a group scope must carry it: it is
what separates two instances of one group template, whose inner nodes share the
template's node ids.

### Concurrency Level Methods

| Method                       | Description                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `beginLevel(level, nodeIds)` | Records the start of a concurrency level's execution.                             |
| `completeLevel(level)`       | Records the completion of a concurrency level. Pushes a `ConcurrencyLevelRecord`. |

### Loop Recording Methods

| Method                                                                                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginLoopStructure(loopStructureId, startId, stopId, endId, ownerInstancePath, parentContext?)` | Initializes tracking for a loop structure. `ownerInstancePath` is the owning group instance path (`[]` at root); `parentContext` (a `StructureParentContext`) declares the enclosing loop for NESTED loops — passed explicitly by the executor, never inferred from ambient state.                                                                                                                                                                                                          |
| `beginLoopIteration(loopStructureId, iteration, ownerInstancePath)`                              | Starts recording a loop iteration for that identity. Steps associate via their own `loopStructureId` + `instancePath` fields. If an iteration of the same identity is somehow still pending, it is CLOSED as its own iteration record (not folded into the new one, which would move steps stamped `loopIteration: N` into the record for `N+1` and outside its time window) and a `key-collision` warning fires.                                                                           |
| `completeLoopIteration(loopStructureId, iteration, conditionValue, ownerInstancePath)`           | Collects every parked nested child whose DECLARED parent id + iteration + owner path match into this iteration's `nestedLoopRecords`, then finalizes a `LoopIterationRecord` (timing + condition boolean) and pushes it to the pending structure.                                                                                                                                                                                                                                           |
| `completeLoopStructure(loopStructureId, ownerInstancePath)`                                      | Finalizes the loop recording. A **top-level** loop stores into `loopRecords` under its identity key; because the key IS the identity, two different structures can never contest one key and no collision handling is needed (re-completing the SAME identity — a group re-executed per enclosing iteration — legitimately replaces its own earlier record). A **nested** loop (entry carries a declared parent) parks in `completedNestedLoopRecords` for the parent iteration to collect. |

Parentage and ownership are wholly explicit (see
[Nested loop hierarchy](#nested-loop-hierarchy)); the recorder holds no ambient
nesting state of any kind.

### Switch Recording Methods

| Method                                                                       | Description                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginSwitchStructure(switchStructureId, startId, endId, ownerInstancePath)` | Initializes a pending switch structure for that identity (records start time and an empty `stepRecords` buffer). Called once before the chosen branch runs.                                          |
| `completeSwitchStructure(switchStructureId, branchTaken, ownerInstancePath)` | Finalizes the switch recording. Computes timing and stores the completed `SwitchRecord` (with `branchTaken` and collected `stepRecords`) into `switchRecords` (same collision-safe keying as loops). |

### Group Recording Methods

| Method                                                                                                     | Description                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginGroup(groupNodeId, groupNodeTypeId)`                                                                 | Placeholder (no-op). Group state is managed via scopes.                                                                                                                                                                                  |
| `completeGroup(groupNodeId, groupNodeTypeId, innerRecord, inputMapping, outputMapping, ownerInstancePath)` | Records the completed group execution. Stores a `GroupRecord` with the recursively captured `innerRecord` (collision-safe keying: nested template subgroups of concurrently-executing sibling instances no longer overwrite each other). |

### Scope Methods (for Group Inner Execution)

| Method                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginScope(ownerInstancePath)`         | Returns a branded, single-use `RecorderScopeToken` capturing the owner's instance path, the current `steps`/`errors` lengths, the recorder's STORE SERIAL (a watermark: membership is decided by write order, not by key novelty, so an instance that re-executes and rewrites its own record under an unchanged key still counts as this scope's), the committed pause duration, and a start time. Tokens live in a SET — concurrent sibling scopes may end in any order.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `endScope(token, status, scopedValues)` | Consumes the token and returns an `ExecutionRecord` containing only the entries the scope's OWNER created: steps recorded since scope start whose `instancePath` sits under the owner path (the window alone is not ownership — concurrent siblings interleave in the shared arrays); errors identity-joined to those steps (`step.error === error`; the outer `record.errors` array is never mutated); loop/switch/group records STORED since the scope opened (by store serial, so an instance rewriting its own record under an unchanged key still counts) and owned at/under the owner path, with keys copied VERBATIM — a scoped record uses the same absolute identity keys as the top-level maps, so one `resolveStructureRecord` call works at every depth. `concurrencyLevels` is empty and `warmupDuration` is 0. Throws on an unknown or already-consumed token. |

Scopes nest correctly for recursive group execution — ownership is decided by
instance-path prefixes, not stack position, so sibling scopes ending in any
order can never absorb each other's entries. The executor passes
`status: 'errored'` when the inner subtree had errors, otherwise `'completed'`.

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

4. **nestedSwitchRecords is never populated**: Both `LoopIterationRecord` and
   `SwitchRecord` expose a `nestedSwitchRecords` map, but the recorder always
   assigns it `new Map()`. A switch executed inside a loop body is recorded as a
   top-level `switchRecords` entry, not nested under the loop iteration.
   Likewise, `snapshot()`'s in-progress materialization surfaces pending
   **loop** structures only -- there is no in-progress materialization for
   switches.

5. **ExecutionRecord has no `plan` field**: The execution plan (`ExecutionPlan`)
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
  `switchRecords` round-trip FULLY — dedicated recursive (de)serializers carry
  their `stepRecords` and nested maps in both directions. The only
  switch-related gap is `nestedSwitchRecords`, which is never populated in the
  first place (see [Limitations](#limitations-and-deprecated-patterns)).

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
