import type {
  State,
  SupportedUnderlyingTypes,
} from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  ExecutionPlan,
  ExecutionRecord,
  ExecutionStep,
  FunctionImplementations,
  NodeVisualState,
} from '../types';
import { ValueStore } from '../valueStore';
import { ExecutionRecorder } from '../executionRecorder';
import type { RecorderWarning } from '../executionRecorder';
import {
  buildNodeInfoMap,
  shouldSkipNode,
  collectNodeIds,
  getStepNodeId,
  getStepTypeId,
  getStepTypeName,
  getStepCustomName,
  handleCatchError,
  initializeDefaultValues,
} from './executionHelpers';
import type { ExecutionEnv } from './executionHelpers';
import { executeOneStep } from './executeOneStep';
import { seedRootInputs, collectRootOutputs } from './rootIo';

// ─────────────────────────────────────────────────────
// Main execute function (instant / performance mode)
// ─────────────────────────────────────────────────────

/**
 * Execute an ExecutionPlan in "performance" mode — runs all levels
 * sequentially, each level's steps concurrently via Promise.allSettled.
 *
 * Returns the complete ExecutionRecord when done.
 */
async function execute<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  plan: ExecutionPlan,
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  options: {
    onNodeStateChange: (nodeId: string, state: NodeVisualState) => void;
    abortSignal: AbortSignal;
    /** Values for the graph's declared inputs, keyed by Graph Input handle NAME.
     *  Fed into the root Graph Input node's output handles (mirrors codegen's
     *  `runGraph` parameters). Ignored when the graph has no root Graph Input. */
    rootInputs?: Record<string, unknown>;
    /** Structured recorder-anomaly channel (orphan promotion, key
     *  collisions, unclosed scopes). Unregistered ⇒ dev-only console.warn. */
    onRecorderWarning?: (warning: RecorderWarning) => void;
  },
): Promise<ExecutionRecord> {
  const { onNodeStateChange, abortSignal, rootInputs } = options;
  const valueStore = new ValueStore();
  const recorder = new ExecutionRecorder({
    onRecorderWarning: options.onRecorderWarning,
  });
  const erroredNodes = new Set<string>();
  const nodeInfoMap = buildNodeInfoMap(plan, state);

  // ── Build ExecutionEnv ────────────────────────────
  const env: ExecutionEnv<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = {
    recorder,
    abortSignal,
    onNodeStateChange,
    plan,
    state,
    functionImplementations,
    nodeInfoMap,
  };

  // ── JIT warmup ────────────────────────────────────
  // Exercise the hot code paths (ValueStore, Map, async pipeline) so
  // V8 compiles them before real execution starts. Without this, the
  // first nodes pay a 20-30ms JIT cost that dwarfs their real runtime.
  const warmupStart = performance.now();
  {
    const w = '__jit_warmup__';
    valueStore.set(w, w, 0);
    valueStore.get(w, w);
    const m = new Map<string, unknown>();
    m.set(w, 0);
    m.get(w);
    m.delete(w);
    await Promise.allSettled([Promise.resolve(0)]);
    valueStore.set(w, w, undefined);
  }
  const warmupDuration = performance.now() - warmupStart;

  recorder.start();

  // Initialize ValueStore with user-entered default values
  // (inputs with allowInput and a value, but no incoming edges)
  initializeDefaultValues(plan, state, valueStore, nodeInfoMap);

  // Seed the graph's declared inputs (shared with executeStepByStep, see rootIo.ts).
  seedRootInputs(plan, state, valueStore, rootInputs);

  let hasErrors = false;

  for (let levelIdx = 0; levelIdx < plan.levels.length; levelIdx++) {
    // Check abort signal
    if (abortSignal.aborted) {
      return recorder.finalize(
        'cancelled',
        valueStore.snapshot(),
        warmupDuration,
      );
    }

    const level = plan.levels[levelIdx];
    const nodeIds = collectNodeIds(level);

    recorder.beginLevel(levelIdx, nodeIds);

    // Determine which steps to skip and which to execute
    const toExecute: ExecutionStep[] = [];
    const toSkip: ExecutionStep[] = [];

    for (const step of level) {
      const stepNodeId = getStepNodeId(step);
      if (shouldSkipNode(stepNodeId, plan.inputResolutionMap, erroredNodes)) {
        toSkip.push(step);
      } else {
        toExecute.push(step);
      }
    }

    // Mark skipped steps and record them
    for (const step of toSkip) {
      const stepNodeId = getStepNodeId(step);
      onNodeStateChange(stepNodeId, 'skipped');
      erroredNodes.add(stepNodeId); // Propagate skip downstream

      const skipIndex = recorder.beginStep({
        nodeId: stepNodeId,
        nodeTypeId: getStepTypeId(step),
        nodeTypeName: getStepTypeName(step),
        customName: getStepCustomName(step),
        concurrencyLevel: step.concurrencyLevel,
      });
      recorder.skipStep(skipIndex);
    }

    // Execute non-skipped steps concurrently
    const results = await Promise.allSettled(
      toExecute.map((step) =>
        executeOneStep(step, env, valueStore, erroredNodes),
      ),
    );

    // Process results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        hasErrors = true;
        const stepNodeId = getStepNodeId(toExecute[i]);
        erroredNodes.add(stepNodeId);
        handleCatchError(result.reason, toExecute[i], env);
      }
    }

    recorder.completeLevel(levelIdx);
  }

  const status = abortSignal.aborted
    ? 'cancelled'
    : hasErrors
      ? 'errored'
      : 'completed';

  // Collect the graph's declared outputs (shared with executeStepByStep, see rootIo.ts).
  const rootOutputs = collectRootOutputs(plan, state, valueStore, nodeInfoMap);

  const record = recorder.finalize(
    status,
    valueStore.snapshot(),
    warmupDuration,
  );
  return rootOutputs ? { ...record, rootOutputs } : record;
}

export { execute };
