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
export type {
  UseNodeRunnerParams,
  UseNodeRunnerReturn,
  UseNodeRunnerMode,
} from './useNodeRunner';
