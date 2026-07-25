// Run targets — the pluggable execution strategy surface. This barrel is the
// curated PUBLIC entry point: it exposes the RunTarget contract + factory and
// re-exports the stable supporting runner types the contract names. Executor /
// compiler internals (ValueStore, compile, execute, the sub-compilers,
// topologicalSortWithLevels) are deliberately NOT re-exported here.

export { runTargetModes, makeRunTargetWithAutoInfer } from './types';
export { inProcessRunTarget } from './inProcessRunTarget';
export { jsonIrRunTarget } from './jsonIrRunTarget';
export {
  makeCodegenRunTarget,
  codegenJsRunTarget,
  codegenTsRunTarget,
} from './codegenJsRunTarget';
export { downloadTextArtifact } from './downloadTextArtifact';
export type { CodegenRunTargetOptions } from './codegenJsRunTarget';
// `readInput` is the recommended intrinsic for node implementations to read an
// input (and the keystone of codegen auto-emit); `emitJs` is the low-level
// codegen entry point. Both are documented as consumer-facing, so they are
// surfaced through this — the one public runner barrel.
export { readInput } from '../readInput';
export type { ReadableInputHandle } from '../readInput';
export { emitJs } from './codegen/emitJs';
export type { EmitJsOptions } from './codegen/emitJs';
// Codegen metadata (Decision 6) — authored by consumers and passed to the codegen
// factory / `emitJs`, replacing the removed `TypeOfNode.codegen` / `DataType.codegenTypes`.
export type {
  CodegenMetadata,
  NodeCodegenMetadata,
  CodegenEmitContext,
} from './codegen/contract';
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
