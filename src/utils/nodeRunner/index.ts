// Types
export * from './types';

// Error utilities
export {
  extractErrorMessage,
  createGraphError,
  buildErrorPath,
  formatGraphError,
} from './errors';

// Compiler
export { compile, DEFAULT_MAX_LOOP_ITERATIONS } from './compiler';
export { topologicalSortWithLevels } from './topologicalSort';
export { compileLoopStructures } from './loopCompiler';
export { compileGroupScopes } from './groupCompiler';

// Executor
export { execute, executeStepByStep } from './executor';
export { ValueStore, qualifiedId } from './valueStore';
export { ExecutionRecorder } from './executionRecorder';

// Recommended input reader for node implementations (enables codegen auto-emit).
export { readInput } from './readInput';
export type { ReadableInputHandle } from './readInput';

// React hook
export { useNodeRunner, computeVisualStatesAtStep } from './useNodeRunner';
// Per-node preview values — the entry type appears on the barrel-exported
// `RunnerContextValue.nodePreviewValues`, so it must be importable by name for
// consumers reading the context to annotate their own preview code.
export {
  computeNodePreviewValues,
  EMPTY_NODE_PREVIEW_VALUES,
} from './computeNodePreviewValues';
export type { NodePreviewValueEntry } from './computeNodePreviewValues';
// Group-aware replay navigation over `record.steps` (instancePath depth) —
// the same helpers the timeline's step-over/step-out buttons use, exported so
// consumers building custom timelines can reuse them.
export {
  findStepOverTarget,
  findStepOutTarget,
  stepDepth,
} from './stepNavigation';
export type {
  UseNodeRunnerParams,
  UseNodeRunnerReturn,
  UseNodeRunnerMode,
} from './useNodeRunner';
