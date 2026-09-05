// Run targets — the pluggable execution strategy surface. This barrel is the
// curated PUBLIC entry point: it exposes the RunTarget contract + factory and
// re-exports the stable supporting runner types the contract names. Executor /
// compiler internals (ValueStore, compile, execute, the sub-compilers,
// topologicalSortWithLevels) are deliberately NOT re-exported here.

export { runTargetModes, makeRunTargetWithAutoInfer } from './types';
export { inProcessRunTarget } from './inProcessRunTarget';
export { jsonIrRunTarget } from './jsonIrRunTarget';
export { downloadTextArtifact } from './downloadTextArtifact';
// Codegen (`emitJs` / `emitGraph` / `makeCodegenRunTarget` / `CodegenMetadata` /
// the codegen run targets) now lives in the separate
// `@theclearsky/react-blender-nodes-codegen` package, which consumes this
// library's React-free `@theclearsky/react-blender-nodes/contract` subpath.
// `readInput` is the recommended intrinsic for node implementations to read an
// input (and the keystone of codegen auto-emit); it stays here as an
// impl-authoring helper used under the in-process executor.
export { readInput } from '../readInput';
export type { ReadableInputHandle } from '../readInput';
export type {
  RunTargetMode,
  ExecuteRunContext,
  ArtifactRunContext,
  ExecuteRunTarget,
  ArtifactRunTarget,
  RunTarget,
} from './types';

// Pluggable run targets make the runner IR + records part of the public API (a
// stability commitment, since targets consume them). Basic authoring needs none
// of these — `makeRunTargetWithAutoInfer` infers them — they are for advanced /
// hand-authored targets.
export type {
  ExecutionPlan,
  ExecutionRecord,
  ExecutionStepRecord,
  NodeVisualState,
  FunctionImplementations,
  ExecutionContext,
} from '../types';
// Recorded value + error types named by `ExecutionStepRecord.inputValues` /
// `outputValues` / `error` — surfaced so consumers can annotate helpers against the
// recorded IR (e.g. per-node-type preview components, `NodePreviewProps`).
export type {
  RecordedInputHandleValue,
  RecordedInputConnection,
  RecordedOutputHandleValue,
  ExecutionStepRecordStatus,
  GraphError,
  GraphErrorPathEntry,
} from '../types';
// `NodePreviewValueEntry` — the per-node `{ live, atStep }` snapshot pair that
// `RunnerContextValue.nodePreviewValues` maps by node id (consumed by
// `nodePreviews` components). Surfaced so consumers typing against that context
// slice can name the entry type.
export type { NodePreviewValueEntry } from '../computeNodePreviewValues';
export { formatGraphError } from '../errors';
export { ExecutionRecorder } from '../executionRecorder';
// Structure-record identity: `ExecutionRecord.loopRecords` / `switchRecords` /
// `groupRecords` are keyed by an OPAQUE full-path identity key. Consumers must
// never build or parse that string by hand — `structureRecordKey` mints one and
// `resolveStructureRecord` looks a record up from a step's
// `(structureId, instancePath)` pair. Both are part of the published surface
// precisely because the key format is opaque.
export {
  structureRecordKey,
  resolveStructureRecord,
  recorderWarningKinds,
} from '../executionRecorder';
// Named by the public `ExecutionRecorder` method signatures (`beginScope`
// returns a `RecorderScopeToken`; `beginLoopStructure` takes a
// `StructureParentContext`; the executors' `onRecorderWarning` option takes a
// `RecorderWarning`) — surfaced so advanced authors hand-driving a recorder
// can annotate the values they hold.
export type {
  RecorderScopeToken,
  StructureParentContext,
  RecorderWarning,
  RecorderWarningKind,
  ExecutionRecorderOptions,
} from '../executionRecorder';
