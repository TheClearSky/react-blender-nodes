import type {
  State,
  SupportedUnderlyingTypes,
} from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  ExecutionPlan,
  ExecutionRecord,
  ExecutionStepRecord,
  FunctionImplementations,
  NodeVisualState,
} from '../types';
import { ValueStore } from '../valueStore';
import { ExecutionRecorder } from '../executionRecorder';
import { StepChannel } from '../stepChannel';
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
// Step-by-step execute function (debug mode)
// ─────────────────────────────────────────────────────

/**
 * Execute an ExecutionPlan in "debug" mode — yields after each step,
 * allowing the caller to inspect intermediate state and control execution.
 *
 * Returns the complete ExecutionRecord when done.
 */
async function* executeStepByStep<
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
     *  Seeded into the root Graph Input node's output handles, identically to
     *  `execute()` (mirrors codegen's `runGraph` parameters). */
    rootInputs?: Record<string, unknown>;
  },
): AsyncGenerator<
  {
    stepRecord: ExecutionStepRecord;
    partialRecord: ExecutionRecord;
  },
  ExecutionRecord
> {
  const { onNodeStateChange, abortSignal, rootInputs } = options;
  const valueStore = new ValueStore();
  const recorder = new ExecutionRecorder();
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

  // JIT warmup (same as execute())
  const warmupStart = performance.now();
  {
    const w = '__jit_warmup__';
    valueStore.set(w, w, 0);
    valueStore.get(w, w);
    await Promise.allSettled([Promise.resolve(0)]);
    valueStore.set(w, w, undefined);
  }
  const warmupDuration = performance.now() - warmupStart;

  recorder.start();

  initializeDefaultValues(plan, state, valueStore, nodeInfoMap);

  // Seed the graph's declared inputs (shared with execute, see rootIo.ts).
  seedRootInputs(plan, state, valueStore, rootInputs);

  let hasErrors = false;

  for (let levelIdx = 0; levelIdx < plan.levels.length; levelIdx++) {
    if (abortSignal.aborted) {
      recorder.resume(); // ensure pause is closed before finalize
      return recorder.finalize(
        'cancelled',
        valueStore.snapshot(),
        warmupDuration,
      );
    }

    const level = plan.levels[levelIdx];
    const nodeIds = collectNodeIds(level);

    recorder.beginLevel(levelIdx, nodeIds);

    for (const step of level) {
      if (abortSignal.aborted) {
        recorder.resume(); // commit pending pause before finalize
        return recorder.finalize(
          'cancelled',
          valueStore.snapshot(),
          warmupDuration,
        );
      }

      const stepNodeId = getStepNodeId(step);

      if (shouldSkipNode(stepNodeId, plan.inputResolutionMap, erroredNodes)) {
        onNodeStateChange(stepNodeId, 'skipped');
        erroredNodes.add(stepNodeId);

        const skipIndex = recorder.beginStep({
          nodeId: stepNodeId,
          nodeTypeId: getStepTypeId(step),
          nodeTypeName: getStepTypeName(step),
          customName: getStepCustomName(step),
          concurrencyLevel: step.concurrencyLevel,
        });
        recorder.skipStep(skipIndex);

        continue;
      }

      if (step.kind === 'standard') {
        // Standard nodes: execute, then yield once
        try {
          await executeOneStep(step, env, valueStore, erroredNodes);
        } catch (e) {
          hasErrors = true;
          erroredNodes.add(stepNodeId);
          handleCatchError(e, step, env);
        }

        const latestStep = recorder.getLatestStep();
        if (latestStep) {
          recorder.pause();
          yield {
            stepRecord: latestStep,
            partialRecord: recorder.snapshot(
              hasErrors ? 'errored' : 'completed',
              valueStore.snapshot(),
            ),
          };
          // No resume here — beginStep() of the next step commits the pause.
          // All inter-step time is automatically captured as pause.
        }
      } else {
        // Loop/group steps: use StepChannel for per-node stepping
        const channel = new StepChannel();

        const afterStep = async () => {
          const stepRec = recorder.getLatestStep();
          if (!stepRec) return;
          recorder.pause();
          await channel.push({
            stepRecord: stepRec,
            partialRecord: recorder.snapshot(
              hasErrors ? 'errored' : 'completed',
              valueStore.snapshot(),
            ),
          });
          // No resume here — beginStep() of the next step commits the pause.
          // This ensures ALL inter-step time (microtasks, channel teardown,
          // event loop yields) is captured as pause.
        };

        // Start execution in the background — it will block at each afterStep()
        const executionPromise = executeOneStep(
          step,
          env,
          valueStore,
          erroredNodes,
          undefined, // parentLoopContext
          afterStep,
        ).then(
          () => channel.close(),
          (err) => {
            hasErrors = true;
            erroredNodes.add(stepNodeId);
            channel.closeWithError(err);
          },
        );

        // Pull from channel and yield each step to the caller
        try {
          for (;;) {
            const payload = await channel.pull();
            if (payload === null) break; // channel closed — execution done
            yield payload;
          }
        } catch (e) {
          hasErrors = true;
          erroredNodes.add(stepNodeId);
          handleCatchError(e, step, env);
        }

        // Ensure the execution promise is settled.
        // The recorder is still paused from the last afterStep — beginStep()
        // of the next step will commit the pause, capturing all teardown
        // and event loop overhead.
        await executionPromise;
      }
    }

    recorder.completeLevel(levelIdx);
  }

  recorder.resume(); // commit any pending pause before finalize

  const status = abortSignal.aborted
    ? 'cancelled'
    : hasErrors
      ? 'errored'
      : 'completed';

  // Collect the graph's declared outputs (shared with execute, see rootIo.ts).
  const rootOutputs = collectRootOutputs(plan, state, valueStore, nodeInfoMap);

  const record = recorder.finalize(
    status,
    valueStore.snapshot(),
    warmupDuration,
  );
  return rootOutputs ? { ...record, rootOutputs } : record;
}

export { executeStepByStep };
