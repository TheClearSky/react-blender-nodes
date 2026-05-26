import type { SupportedUnderlyingTypes } from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  ExecutionStep,
  LoopExecutionBlock,
  InputHandleValue,
  LoopPhase,
} from '../types';
import { createGraphError } from '../errors';
import { ValueStore, qualifiedId, flattenInputs } from '../valueStore';
import type { ExecutionEnv } from './executionHelpers';
import {
  recordInputValues,
  recordOutputValues,
  shouldSkipNode,
  recordStructuralNodeCompletion,
  getStepNodeId,
  getStepTypeId,
  getStepTypeName,
  handleCatchError,
  getDataHandleIds,
  findConditionInputId,
  resolveConditionValue,
} from './executionHelpers';
import { executeStandardNode } from './executeStandardNode';
import { executeOneStep } from './executeOneStep';

// ─────────────────────────────────────────────────────
// Execute a loop block
// ─────────────────────────────────────────────────────

async function executeLoopBlock<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  block: LoopExecutionBlock,
  env: ExecutionEnv<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  valueStore: ValueStore,
  erroredNodes: Set<string>,
  parentLoopContext?: {
    loopIteration: number;
    loopStructureId: string;
  },
  afterStep?: () => Promise<void>,
): Promise<void> {
  const { recorder, plan, nodeInfoMap, onNodeStateChange, abortSignal } = env;

  const {
    loopStartNodeId,
    loopStopNodeId,
    loopEndNodeId,
    preStopSteps,
    postStopSteps,
    maxIterations,
  } = block;

  const loopStructureId = loopStartNodeId;

  // ── Get node info for loop triplet ─────────────────
  const loopStartInfo = nodeInfoMap.get(loopStartNodeId);
  const loopStopInfo = nodeInfoMap.get(loopStopNodeId);
  const loopEndInfo = nodeInfoMap.get(loopEndNodeId);

  if (!loopStartInfo || !loopStopInfo || !loopEndInfo) {
    const error = createGraphError({
      error: new Error('Loop structure nodes not found in state'),
      nodeId: loopStartNodeId,
      nodeTypeId: 'loop',
      nodeTypeName: 'Loop',
      path: [],
      timestamp: 0,
      duration: 0,
      loopContext: { loopStructureId, iteration: 0, maxIterations },
    });
    const errIdx = recorder.beginStep({
      nodeId: loopStartNodeId,
      nodeTypeId: 'loop',
      nodeTypeName: 'Loop',
      concurrencyLevel: block.concurrencyLevel,
    });
    recorder.errorStep(errIdx, error, new Map());
    onNodeStateChange(loopStartNodeId, 'errored');
    onNodeStateChange(loopStopNodeId, 'errored');
    onNodeStateChange(loopEndNodeId, 'errored');
    erroredNodes.add(loopStartNodeId);
    erroredNodes.add(loopStopNodeId);
    erroredNodes.add(loopEndNodeId);
    throw error;
  }

  // ── Resolve handle IDs from node data ──────────────
  // Discover ALL user data handles (everything except bindLoopNodes, loopInfer, condition).
  // These are paired positionally: startDataInputIds[i] ↔ startDataOutputIds[i], etc.
  const startInputs = flattenInputs(loopStartInfo.data.inputs);
  const startOutputs = loopStartInfo.data.outputs ?? [];
  const stopInputs = flattenInputs(loopStopInfo.data.inputs);
  const stopOutputs = loopStopInfo.data.outputs ?? [];
  const endInputs = flattenInputs(loopEndInfo.data.inputs);
  const endOutputs = loopEndInfo.data.outputs ?? [];

  const startDataInputIds = getDataHandleIds(startInputs);
  const startDataOutputIds = getDataHandleIds(startOutputs);
  const stopDataInputIds = getDataHandleIds(stopInputs);
  const stopDataOutputIds = getDataHandleIds(stopOutputs);
  const endDataInputIds = getDataHandleIds(endInputs);
  const endDataOutputIds = getDataHandleIds(endOutputs);

  const stopConditionInputId = findConditionInputId(stopInputs);

  const dataHandleCount = startDataInputIds.length;

  if (
    dataHandleCount === 0 ||
    startDataOutputIds.length !== dataHandleCount ||
    stopDataInputIds.length !== dataHandleCount ||
    stopDataOutputIds.length !== dataHandleCount ||
    endDataInputIds.length !== dataHandleCount ||
    endDataOutputIds.length !== dataHandleCount ||
    !stopConditionInputId
  ) {
    const error = createGraphError({
      error: new Error(
        `Loop structure has mismatched data handle counts ` +
          `(start in=${startDataInputIds.length}, start out=${startDataOutputIds.length}, ` +
          `stop in=${stopDataInputIds.length}, stop out=${stopDataOutputIds.length}, ` +
          `end in=${endDataInputIds.length}, end out=${endDataOutputIds.length})`,
      ),
      nodeId: loopStartNodeId,
      nodeTypeId: loopStartInfo.nodeTypeId,
      nodeTypeName: loopStartInfo.nodeTypeName,
      path: [],
      timestamp: 0,
      duration: 0,
      loopContext: { loopStructureId, iteration: 0, maxIterations },
    });
    const errIdx = recorder.beginStep({
      nodeId: loopStartNodeId,
      nodeTypeId: loopStartInfo.nodeTypeId,
      nodeTypeName: loopStartInfo.nodeTypeName,
      concurrencyLevel: block.concurrencyLevel,
    });
    recorder.errorStep(errIdx, error, new Map());
    onNodeStateChange(loopStartNodeId, 'errored');
    erroredNodes.add(loopStartNodeId);
    erroredNodes.add(loopStopNodeId);
    erroredNodes.add(loopEndNodeId);
    throw error;
  }

  // ── Resolve initial inputs from upstream ────────────
  // For each data handle, find the upstream value (filtering out feedback edges from LoopStop).
  const currentValues: unknown[] = new Array(dataHandleCount);
  for (let i = 0; i < dataHandleCount; i++) {
    const startInputKey = qualifiedId(loopStartNodeId, startDataInputIds[i]);
    const allStartEntries = plan.inputResolutionMap.get(startInputKey) ?? [];
    const upstreamEntries = allStartEntries.filter(
      (e) => e.sourceNodeId !== loopStopNodeId,
    );
    if (upstreamEntries.length > 0) {
      currentValues[i] = valueStore.get(
        upstreamEntries[0].sourceNodeId,
        upstreamEntries[0].sourceHandleId,
      );
    }
  }

  // ── Begin loop recording ───────────────────────────
  recorder.beginLoopStructure(
    loopStructureId,
    loopStartNodeId,
    loopStopNodeId,
    loopEndNodeId,
  );

  // Build parent context fields for structural/body step recordings
  const parentFields = parentLoopContext
    ? {
        parentLoopStructureId: parentLoopContext.loopStructureId,
        parentLoopIteration: parentLoopContext.loopIteration,
      }
    : {};

  // Pre-compute output info (doesn't change per iteration)
  const startOutputInfo = valueStore.buildOutputInfo(
    loopStartNodeId,
    loopStartInfo.data,
    plan.outputDistributionMap,
  );
  const stopOutputInfo = valueStore.buildOutputInfo(
    loopStopNodeId,
    loopStopInfo.data,
    plan.outputDistributionMap,
  );

  onNodeStateChange(loopStartNodeId, 'running');
  onNodeStateChange(loopStopNodeId, 'running');

  // ── Group body steps by concurrency level ──────────
  function groupByLevel(steps: ReadonlyArray<ExecutionStep>) {
    const map = new Map<number, ExecutionStep[]>();
    for (const step of steps) {
      const group = map.get(step.concurrencyLevel);
      if (group) group.push(step);
      else map.set(step.concurrencyLevel, [step]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }
  const sortedPreStopLevels = groupByLevel(preStopSteps);
  const sortedPostStopLevels = groupByLevel(postStopSteps);

  // Pre-compute LoopEnd output info (doesn't change per iteration)
  const endOutputInfo = valueStore.buildOutputInfo(
    loopEndNodeId,
    loopEndInfo.data,
    plan.outputDistributionMap,
  );

  /** Execute a set of grouped body levels (shared by pre-stop and post-stop). */
  async function executeBodyLevels(
    sortedLevels: [number, ExecutionStep[]][],
    bodyErroredNodes: Set<string>,
    iteration: number,
    loopPhase: LoopPhase,
  ) {
    for (const [, levelSteps] of sortedLevels) {
      if (abortSignal.aborted) break;

      const toExecute: ExecutionStep[] = [];
      const toSkip: ExecutionStep[] = [];

      for (const step of levelSteps) {
        const stepNodeId = getStepNodeId(step);
        if (
          shouldSkipNode(stepNodeId, plan.inputResolutionMap, bodyErroredNodes)
        ) {
          toSkip.push(step);
        } else {
          toExecute.push(step);
        }
      }

      for (const step of toSkip) {
        const stepNodeId = getStepNodeId(step);
        onNodeStateChange(stepNodeId, 'skipped');
        bodyErroredNodes.add(stepNodeId);
        const skipIdx = recorder.beginStep({
          nodeId: stepNodeId,
          nodeTypeId: getStepTypeId(step),
          nodeTypeName: getStepTypeName(step),
          concurrencyLevel: step.concurrencyLevel,
          loopIteration: iteration,
          loopStructureId,
          loopPhase,
          ...parentFields,
        });
        recorder.skipStep(skipIdx);
        await afterStep?.();
      }

      // In step-by-step mode (afterStep present), execute nodes sequentially
      // so we can pause after each. In performance mode, use Promise.allSettled
      // for concurrent execution within the level.
      if (afterStep) {
        for (const step of toExecute) {
          if (abortSignal.aborted) break;
          try {
            if (step.kind === 'standard') {
              await executeStandardNode(step, env, valueStore, {
                loopContext: {
                  loopIteration: iteration,
                  loopStructureId,
                  maxIterations,
                },
                loopPhase,
              });
              await afterStep();
            } else {
              await executeOneStep(
                step,
                env,
                valueStore,
                bodyErroredNodes,
                { loopIteration: iteration, loopStructureId },
                afterStep,
              );
            }
          } catch (e) {
            bodyErroredNodes.add(getStepNodeId(step));
            handleCatchError(e, step, env);
          }
        }
      } else {
        const results = await Promise.allSettled(
          toExecute.map((step) => {
            if (step.kind === 'standard') {
              return executeStandardNode(step, env, valueStore, {
                loopContext: {
                  loopIteration: iteration,
                  loopStructureId,
                  maxIterations,
                },
                loopPhase,
              });
            }
            return executeOneStep(step, env, valueStore, bodyErroredNodes, {
              loopIteration: iteration,
              loopStructureId,
            });
          }),
        );

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'rejected') {
            bodyErroredNodes.add(getStepNodeId(toExecute[i]));
            handleCatchError(result.reason, toExecute[i], env);
          }
        }
      }
    }
  }

  // ── Iterate ────────────────────────────────────────
  let lastConditionValue = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (abortSignal.aborted) break;

    recorder.beginLoopIteration(loopStructureId, iteration);

    // ── PHASE: loopStart ──────────────────────────────
    // Set all LoopStart data outputs (data into the body)
    for (let i = 0; i < dataHandleCount; i++) {
      valueStore.set(loopStartNodeId, startDataOutputIds[i], currentValues[i]);
    }

    const inputSource: 'upstream' | 'feedback' =
      iteration === 0 ? 'upstream' : 'feedback';

    {
      const startIdx = recorder.beginStep({
        nodeId: loopStartNodeId,
        nodeTypeId: loopStartInfo.nodeTypeId,
        nodeTypeName: loopStartInfo.nodeTypeName,
        concurrencyLevel: block.concurrencyLevel,
        loopIteration: iteration,
        loopStructureId,
        loopPhase: 'loopStart',
        inputSource,
        ...parentFields,
      });

      // Resolve inputs, filtering based on iteration for recording purposes
      const fullInputMap = valueStore.resolveInputs(
        loopStartNodeId,
        loopStartInfo.data,
        plan.inputResolutionMap,
        nodeInfoMap,
      );

      // Filter the input map for recording: show only relevant sources
      const filteredInputMap = new Map<string, InputHandleValue>();
      for (const [handleName, handleValue] of fullInputMap) {
        if (inputSource === 'upstream') {
          // Iteration 0: filter OUT LoopStop feedback
          const filtered = handleValue.connections.filter(
            (c) => c.sourceNodeId !== loopStopNodeId,
          );
          filteredInputMap.set(handleName, {
            ...handleValue,
            connections: filtered,
          });
        } else {
          // Iteration N>0: filter OUT upstream, show feedback only
          const filtered = handleValue.connections.filter(
            (c) => c.sourceNodeId === loopStopNodeId,
          );
          filteredInputMap.set(handleName, {
            ...handleValue,
            connections: filtered,
          });
        }
      }

      const startOutputMap = new Map<string, unknown>();
      for (const [handleName, info] of startOutputInfo) {
        const idx = startDataOutputIds.indexOf(info.handleId);
        if (idx >= 0) startOutputMap.set(handleName, currentValues[idx]);
      }
      recorder.completeStep(
        startIdx,
        recordInputValues(filteredInputMap),
        recordOutputValues(startOutputMap, startOutputInfo),
      );
      await afterStep?.();
    }

    // ── PHASE: preStop ──────────────────────────────
    const bodyErroredNodes = new Set<string>();
    await executeBodyLevels(
      sortedPreStopLevels,
      bodyErroredNodes,
      iteration,
      'preStop',
    );

    // ── PHASE: loopStop ──────────────────────────────
    const conditionValue = resolveConditionValue(
      loopStopNodeId,
      stopConditionInputId,
      flattenInputs(loopStopInfo.data.inputs),
      plan.inputResolutionMap,
      valueStore,
      bodyErroredNodes,
    );

    // Resolve all LoopStop data values (pass-through)
    for (let i = 0; i < dataHandleCount; i++) {
      const stopDataKey = qualifiedId(loopStopNodeId, stopDataInputIds[i]);
      const stopDataEntries = plan.inputResolutionMap.get(stopDataKey);
      let stopDataValue: unknown;

      if (stopDataEntries && stopDataEntries.length > 0) {
        stopDataValue = valueStore.get(
          stopDataEntries[0].sourceNodeId,
          stopDataEntries[0].sourceHandleId,
        );
      }

      valueStore.set(loopStopNodeId, stopDataOutputIds[i], stopDataValue);
      currentValues[i] = stopDataValue;
    }

    // Record LoopStop
    {
      const stopIdx = recorder.beginStep({
        nodeId: loopStopNodeId,
        nodeTypeId: loopStopInfo.nodeTypeId,
        nodeTypeName: loopStopInfo.nodeTypeName,
        concurrencyLevel: block.concurrencyLevel,
        loopIteration: iteration,
        loopStructureId,
        loopPhase: 'loopStop',
        ...parentFields,
      });
      const stopInputMap = valueStore.resolveInputs(
        loopStopNodeId,
        loopStopInfo.data,
        plan.inputResolutionMap,
        nodeInfoMap,
      );
      const stopOutputMap = new Map<string, unknown>();
      for (const [handleName, info] of stopOutputInfo) {
        const idx = stopDataOutputIds.indexOf(info.handleId);
        if (idx >= 0) stopOutputMap.set(handleName, currentValues[idx]);
      }
      recorder.completeStep(
        stopIdx,
        recordInputValues(stopInputMap),
        recordOutputValues(stopOutputMap, stopOutputInfo),
      );
      await afterStep?.();
    }

    // ── PHASE: postStop (only if condition is TRUE) ──
    if (conditionValue && sortedPostStopLevels.length > 0) {
      await executeBodyLevels(
        sortedPostStopLevels,
        bodyErroredNodes,
        iteration,
        'postStop',
      );

      // Update currentValues from LoopEnd's resolved data inputs so
      // post-stop transformations feed back into the next iteration.
      for (let i = 0; i < dataHandleCount; i++) {
        const endDataKey = qualifiedId(loopEndNodeId, endDataInputIds[i]);
        const endDataEntries = plan.inputResolutionMap.get(endDataKey);
        if (endDataEntries && endDataEntries.length > 0) {
          currentValues[i] = valueStore.get(
            endDataEntries[0].sourceNodeId,
            endDataEntries[0].sourceHandleId,
          );
        }
      }
    }

    // ── PHASE: loopEnd ──────────────────────────────────
    // Record LoopEnd on EVERY iteration for timeline visibility.
    // Set ValueStore outputs only on the exit iteration so downstream
    // nodes receive final values. Record outputs only on exit so
    // edge animation naturally only shows on the last iteration.
    {
      const isExitIteration = !conditionValue;

      if (isExitIteration) {
        // Set all LoopEnd outputs for downstream consumption
        for (let i = 0; i < dataHandleCount; i++) {
          valueStore.set(loopEndNodeId, endDataOutputIds[i], currentValues[i]);
        }
      }

      const endIdx = recorder.beginStep({
        nodeId: loopEndNodeId,
        nodeTypeId: loopEndInfo.nodeTypeId,
        nodeTypeName: loopEndInfo.nodeTypeName,
        concurrencyLevel: block.concurrencyLevel,
        loopIteration: iteration,
        loopStructureId,
        loopPhase: 'loopEnd',
        ...parentFields,
      });
      const endInputMap = valueStore.resolveInputs(
        loopEndNodeId,
        loopEndInfo.data,
        plan.inputResolutionMap,
        nodeInfoMap,
      );

      // Only record outputs on exit iteration — empty outputs on continue
      // iterations means edge animation naturally won't show.
      const endOutputMap = new Map<string, unknown>();
      if (isExitIteration) {
        for (const [handleName, info] of endOutputInfo) {
          const idx = endDataOutputIds.indexOf(info.handleId);
          if (idx >= 0) endOutputMap.set(handleName, currentValues[idx]);
        }
      }
      recorder.completeStep(
        endIdx,
        recordInputValues(endInputMap),
        recordOutputValues(endOutputMap, endOutputInfo),
      );
      await afterStep?.();
    }

    lastConditionValue = conditionValue;
    recorder.completeLoopIteration(loopStructureId, iteration, conditionValue);

    if (!conditionValue) {
      break;
    }
  }

  // ── Finalize loop ──────────────────────────────────

  // Check if max iterations was exceeded (condition still true after all iterations)
  if (lastConditionValue && maxIterations > 0) {
    const error = createGraphError({
      error: new Error(`Loop exceeded maximum iterations (${maxIterations})`),
      nodeId: loopStopNodeId,
      nodeTypeId: loopStopInfo.nodeTypeId,
      nodeTypeName: loopStopInfo.nodeTypeName,
      path: [],
      timestamp: 0,
      duration: 0,
      loopContext: {
        loopStructureId,
        iteration: maxIterations - 1,
        maxIterations,
      },
    });
    const errIdx = recorder.beginStep({
      nodeId: loopStopNodeId,
      nodeTypeId: loopStopInfo.nodeTypeId,
      nodeTypeName: loopStopInfo.nodeTypeName,
      concurrencyLevel: block.concurrencyLevel,
      loopStructureId,
      loopIteration: maxIterations - 1,
      ...parentFields,
    });
    recorder.errorStep(errIdx, error, new Map());
    recordStructuralNodeCompletion(
      recorder,
      {
        nodeId: loopEndNodeId,
        nodeTypeId: loopEndInfo.nodeTypeId,
        nodeTypeName: loopEndInfo.nodeTypeName,
        concurrencyLevel: block.concurrencyLevel,
        loopStructureId,
        ...parentFields,
      },
      { status: 'errored', error },
    );
    onNodeStateChange(loopStopNodeId, 'errored');
    onNodeStateChange(loopEndNodeId, 'errored');
    erroredNodes.add(loopStartNodeId);
    erroredNodes.add(loopStopNodeId);
    erroredNodes.add(loopEndNodeId);
    recorder.completeLoopStructure(loopStructureId);
    throw error;
  }

  // Mark loop nodes as completed
  onNodeStateChange(loopStartNodeId, 'completed');
  onNodeStateChange(loopStopNodeId, 'completed');
  onNodeStateChange(loopEndNodeId, 'completed');

  recorder.completeLoopStructure(loopStructureId);
}

export { executeLoopBlock };
