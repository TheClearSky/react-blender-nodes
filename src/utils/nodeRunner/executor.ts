import type {
  State,
  SupportedUnderlyingTypes,
  TypeOfNode,
} from '../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  ExecutionPlan,
  ExecutionStep,
  ExecutionRecord,
  ExecutionStepRecord,
  FunctionImplementations,
  NodeVisualState,
  RecordedInputHandleValue,
  RecordedInputConnection,
  RecordedOutputHandleValue,
  StandardExecutionStep,
  LoopExecutionBlock,
  GroupExecutionScope,
  InputHandleValue,
  GraphError,
} from './types';
import { createGraphError, buildErrorPath } from './errors';
import { ValueStore, qualifiedId, flattenInputs } from './valueStore';
import type { MinimalNodeData } from './valueStore';
import { ExecutionRecorder } from './executionRecorder';
import {
  loopStartInputInferHandleIndex,
  loopStartOutputInferHandleIndex,
  loopStopInputInferHandleIndex,
  loopStopOutputInferHandleIndex,
  loopEndInputInferHandleIndex,
  loopEndOutputInferHandleIndex,
} from '../nodeStateManagement/standardNodes';
import { isStandardNodeType, hasKey } from './groupCompiler';

// ─────────────────────────────────────────────────────
// Node Info Map — built once for error path tracing
// ─────────────────────────────────────────────────────

type NodeInfo = {
  data: MinimalNodeData;
  typeOfNode?: { name?: string };
  nodeTypeId: string;
  nodeTypeName: string;
  concurrencyLevel: number;
};

/**
 * Build a lookup map of node info from the execution plan and state.
 * Used for error path building and input resolution.
 */
function buildNodeInfoMap<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  plan: ExecutionPlan,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): Map<string, NodeInfo> {
  const map = new Map<string, NodeInfo>();

  function processSteps(steps: ReadonlyArray<ExecutionStep>) {
    for (const step of steps) {
      if (step.kind === 'standard') {
        const node = state.nodes.find((n) => n.id === step.nodeId);
        if (!node) continue;
        const nodeTypeId = node.data.nodeTypeUniqueId;
        if (!nodeTypeId) continue;
        const typeOfNode = state.typeOfNodes[nodeTypeId];
        map.set(step.nodeId, {
          data: node.data,
          typeOfNode,
          nodeTypeId: step.nodeTypeId,
          nodeTypeName: step.nodeTypeName,
          concurrencyLevel: step.concurrencyLevel,
        });
      } else if (step.kind === 'loop') {
        // Add loop triplet nodes
        for (const loopNodeId of [
          step.loopStartNodeId,
          step.loopStopNodeId,
          step.loopEndNodeId,
        ]) {
          const node = state.nodes.find((n) => n.id === loopNodeId);
          if (!node) continue;
          const nodeTypeId = node.data.nodeTypeUniqueId;
          if (!nodeTypeId) continue;
          const typeOfNode = state.typeOfNodes[nodeTypeId];
          map.set(loopNodeId, {
            data: node.data,
            typeOfNode,
            nodeTypeId,
            nodeTypeName: typeOfNode?.name ?? nodeTypeId,
            concurrencyLevel: step.concurrencyLevel,
          });
        }
        processSteps(step.bodySteps);
      } else if (step.kind === 'group') {
        const node = state.nodes.find((n) => n.id === step.groupNodeId);
        if (!node) continue;
        const nodeTypeId = node.data.nodeTypeUniqueId;
        if (!nodeTypeId) continue;
        const typeOfNode = state.typeOfNodes[nodeTypeId];
        map.set(step.groupNodeId, {
          data: node.data,
          typeOfNode,
          nodeTypeId: step.groupNodeTypeId,
          nodeTypeName: step.groupNodeTypeName,
          concurrencyLevel: step.concurrencyLevel,
        });
      }
    }
  }

  for (const level of plan.levels) {
    processSteps(level);
  }

  return map;
}

/**
 * Convert a Map<string, InputHandleValue> to RecordedInputHandleValue map
 * for the execution record.
 */
function recordInputValues(
  inputMap: ReadonlyMap<string, InputHandleValue>,
): ReadonlyMap<string, RecordedInputHandleValue> {
  const recorded = new Map<string, RecordedInputHandleValue>();

  for (const [handleName, handleValue] of inputMap) {
    const connections: RecordedInputConnection[] = handleValue.connections.map(
      (conn) => ({
        value: conn.value,
        sourceNodeId: conn.sourceNodeId,
        sourceNodeName: conn.sourceNodeName,
        sourceHandleId: conn.sourceHandleId,
        sourceHandleName: conn.sourceHandleName,
        sourceDataTypeId: conn.sourceDataTypeId,
      }),
    );

    recorded.set(handleName, {
      connections,
      dataTypeId: handleValue.dataTypeId,
      isDefault: handleValue.isDefault,
      defaultValue: handleValue.defaultValue,
    });
  }

  return recorded;
}

/**
 * Convert the output Map<string, unknown> from a function implementation
 * to RecordedOutputHandleValue map for the execution record.
 */
function recordOutputValues(
  outputMap: Map<string, unknown>,
  outputInfo: ReadonlyMap<
    string,
    { dataTypeId: string; connections: ReadonlyArray<unknown> }
  >,
): ReadonlyMap<string, RecordedOutputHandleValue> {
  const recorded = new Map<string, RecordedOutputHandleValue>();

  for (const [handleName, value] of outputMap) {
    const info = outputInfo.get(handleName);
    recorded.set(handleName, {
      value,
      dataTypeId: info?.dataTypeId ?? '',
      targetCount: info?.connections.length ?? 0,
    });
  }

  return recorded;
}

// ─────────────────────────────────────────────────────
// Check if upstream nodes have errored (for skipping)
// ─────────────────────────────────────────────────────

function shouldSkipNode(
  nodeId: string,
  inputResolutionMap: ExecutionPlan['inputResolutionMap'],
  erroredNodes: ReadonlySet<string>,
): boolean {
  for (const [key, entries] of inputResolutionMap) {
    const colonIdx = key.indexOf(':');
    if (colonIdx === -1) continue;
    const targetNodeId = key.substring(0, colonIdx);
    if (targetNodeId !== nodeId) continue;

    for (const entry of entries) {
      if (erroredNodes.has(entry.sourceNodeId)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Collect all node IDs from an array of execution steps (for level tracking).
 */
function collectNodeIds(steps: ReadonlyArray<ExecutionStep>): string[] {
  const ids: string[] = [];
  for (const step of steps) {
    if (step.kind === 'standard') {
      ids.push(step.nodeId);
    } else if (step.kind === 'loop') {
      ids.push(step.loopStartNodeId);
    } else if (step.kind === 'group') {
      ids.push(step.groupNodeId);
    }
  }
  return ids;
}

// ─────────────────────────────────────────────────────
// Record a structural node completion (loop triplet, group wrapper)
// ─────────────────────────────────────────────────────

/**
 * Record a step completion or error for a structural node (loop triplet,
 * group wrapper). Structural nodes don't have function implementations —
 * they're orchestration points. This helper creates a minimal step record
 * so they appear in record.steps for replay/timeline visibility.
 */
function recordStructuralNodeCompletion(
  recorder: ExecutionRecorder,
  params: {
    nodeId: string;
    nodeTypeId: string;
    nodeTypeName: string;
    concurrencyLevel: number;
    loopStructureId?: string;
    groupNodeId?: string;
    groupDepth?: number;
  },
  outcome: { status: 'completed' } | { status: 'errored'; error: GraphError },
): void {
  const stepIdx = recorder.beginStep(params);
  if (outcome.status === 'errored') {
    recorder.errorStep(stepIdx, outcome.error, new Map());
  } else {
    recorder.completeStep(stepIdx, new Map(), new Map());
  }
}

// ─────────────────────────────────────────────────────
// Execute a single standard node
// ─────────────────────────────────────────────────────

async function executeStandardNode<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  step: StandardExecutionStep,
  valueStore: ValueStore,
  recorder: ExecutionRecorder,
  plan: ExecutionPlan,
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  nodeInfoMap: ReadonlyMap<string, NodeInfo>,
  onNodeStateChange: (nodeId: string, state: NodeVisualState) => void,
  abortSignal: AbortSignal,
  loopContext?: {
    loopIteration: number;
    loopStructureId: string;
    maxIterations: number;
  },
  groupContext?: {
    groupNodeId: string;
    groupNodeTypeId: string;
    groupDepth: number;
  },
): Promise<void> {
  const { nodeId, nodeTypeId, nodeTypeName, concurrencyLevel } = step;

  onNodeStateChange(nodeId, 'running');

  const stepIndex = recorder.beginStep({
    nodeId,
    nodeTypeId,
    nodeTypeName,
    concurrencyLevel,
    loopIteration: loopContext?.loopIteration,
    loopStructureId: loopContext?.loopStructureId,
    groupNodeId: groupContext?.groupNodeId,
    groupDepth: groupContext?.groupDepth,
  });

  const stepStartTime = performance.now();

  const nodeInfo = nodeInfoMap.get(nodeId);
  if (!nodeInfo) {
    const error = createGraphError({
      error: new Error(`Node "${nodeId}" not found in state`),
      nodeId,
      nodeTypeId,
      nodeTypeName,
      path: [],
      timestamp: performance.now() - stepStartTime,
      duration: 0,
    });
    recorder.errorStep(stepIndex, error, new Map());
    onNodeStateChange(nodeId, 'errored');
    throw error;
  }

  // Resolve inputs
  const inputMap = valueStore.resolveInputs(
    nodeId,
    nodeInfo.data,
    plan.inputResolutionMap,
    nodeInfoMap,
  );

  // Build output info
  const outputInfo = valueStore.buildOutputInfo(
    nodeId,
    nodeInfo.data,
    plan.outputDistributionMap,
  );

  // Get function implementation — standard nodes have built-in logic, skip them.
  // step.nodeTypeId is typed as string but was built from a NodeTypeUniqueId;
  // after the isStandardNodeType guard, we know it's a non-standard key.
  if (isStandardNodeType(nodeTypeId)) {
    // Standard nodes should never reach executeStandardNode, but guard anyway
    recorder.completeStep(stepIndex, recordInputValues(inputMap), new Map());
    onNodeStateChange(nodeId, 'completed');
    return;
  }
  if (!hasKey(functionImplementations, nodeTypeId)) {
    const error = createGraphError({
      error: new Error(
        `No function implementation for node type "${nodeTypeName}" (${nodeTypeId})`,
      ),
      nodeId,
      nodeTypeId,
      nodeTypeName,
      path: buildErrorPath(nodeId, plan.inputResolutionMap, nodeInfoMap),
      timestamp: performance.now() - stepStartTime,
      duration: performance.now() - stepStartTime,
      loopContext: loopContext
        ? {
            loopStructureId: loopContext.loopStructureId,
            iteration: loopContext.loopIteration,
            maxIterations: loopContext.maxIterations,
          }
        : undefined,
      groupContext: groupContext
        ? {
            groupNodeId: groupContext.groupNodeId,
            groupNodeTypeId: groupContext.groupNodeTypeId,
            depth: groupContext.groupDepth,
          }
        : undefined,
    });
    recorder.errorStep(stepIndex, error, recordInputValues(inputMap));
    onNodeStateChange(nodeId, 'errored');
    throw error;
  }
  const impl = functionImplementations[nodeTypeId];

  if (!impl) {
    const error = createGraphError({
      error: new Error(
        `No function implementation for node type "${nodeTypeName}" (${nodeTypeId})`,
      ),
      nodeId,
      nodeTypeId,
      nodeTypeName,
      path: buildErrorPath(nodeId, plan.inputResolutionMap, nodeInfoMap),
      timestamp: performance.now() - stepStartTime,
      duration: performance.now() - stepStartTime,
      loopContext: loopContext
        ? {
            loopStructureId: loopContext.loopStructureId,
            iteration: loopContext.loopIteration,
            maxIterations: loopContext.maxIterations,
          }
        : undefined,
      groupContext: groupContext
        ? {
            groupNodeId: groupContext.groupNodeId,
            groupNodeTypeId: groupContext.groupNodeTypeId,
            depth: groupContext.groupDepth,
          }
        : undefined,
    });
    recorder.errorStep(stepIndex, error, recordInputValues(inputMap));
    onNodeStateChange(nodeId, 'errored');
    throw error;
  }

  // Build execution context
  const context = {
    nodeId,
    nodeTypeId,
    nodeTypeName,
    state,
    loopIteration: loopContext?.loopIteration,
    groupDepth: groupContext?.groupDepth,
    abortSignal,
  };

  try {
    // Call the function implementation (may be sync or async)
    const result = await impl(inputMap, outputInfo, context);

    // Validate result is a Map
    if (!(result instanceof Map)) {
      throw new Error(
        `Function implementation for "${nodeTypeName}" must return a Map, got ${typeof result}`,
      );
    }

    // Store outputs in ValueStore
    for (const [handleName, value] of result) {
      // Find the handle ID for this handle name
      const info = outputInfo.get(handleName);
      if (info) {
        valueStore.set(nodeId, info.handleId, value);
      }
    }

    // Record completion
    recorder.completeStep(
      stepIndex,
      recordInputValues(inputMap),
      recordOutputValues(result, outputInfo),
    );

    onNodeStateChange(nodeId, 'completed');
  } catch (thrown) {
    const duration = performance.now() - stepStartTime;
    const error = createGraphError({
      error: thrown,
      nodeId,
      nodeTypeId,
      nodeTypeName,
      path: buildErrorPath(nodeId, plan.inputResolutionMap, nodeInfoMap),
      timestamp: duration,
      duration,
      loopContext: loopContext
        ? {
            loopStructureId: loopContext.loopStructureId,
            iteration: loopContext.loopIteration,
            maxIterations: loopContext.maxIterations,
          }
        : undefined,
      groupContext: groupContext
        ? {
            groupNodeId: groupContext.groupNodeId,
            groupNodeTypeId: groupContext.groupNodeTypeId,
            depth: groupContext.groupDepth,
          }
        : undefined,
    });
    recorder.errorStep(stepIndex, error, recordInputValues(inputMap));
    onNodeStateChange(nodeId, 'errored');
    throw error;
  }
}

// ─────────────────────────────────────────────────────
// Execute a loop block
// ─────────────────────────────────────────────────────

/** Condition input is at index 1 in LoopStop's flattened inputs. */
const LOOP_STOP_CONDITION_INPUT_INDEX = 1;

async function executeLoopBlock<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  block: LoopExecutionBlock,
  valueStore: ValueStore,
  recorder: ExecutionRecorder,
  plan: ExecutionPlan,
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  nodeInfoMap: ReadonlyMap<string, NodeInfo>,
  erroredNodes: Set<string>,
  onNodeStateChange: (nodeId: string, state: NodeVisualState) => void,
  abortSignal: AbortSignal,
): Promise<void> {
  const {
    loopStartNodeId,
    loopStopNodeId,
    loopEndNodeId,
    bodySteps,
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
  const startInputs = flattenInputs(loopStartInfo.data.inputs);
  const startOutputs = loopStartInfo.data.outputs ?? [];
  const stopInputs = flattenInputs(loopStopInfo.data.inputs);
  const stopOutputs = loopStopInfo.data.outputs ?? [];
  const endInputs = flattenInputs(loopEndInfo.data.inputs);
  const endOutputs = loopEndInfo.data.outputs ?? [];

  const startInferInputId = startInputs[loopStartInputInferHandleIndex]?.id;
  const startInferOutputId = startOutputs[loopStartOutputInferHandleIndex]?.id;
  const stopConditionInputId = stopInputs[LOOP_STOP_CONDITION_INPUT_INDEX]?.id;
  const stopInferInputId = stopInputs[loopStopInputInferHandleIndex]?.id;
  const stopInferOutputId = stopOutputs[loopStopOutputInferHandleIndex]?.id;
  const endInferInputId = endInputs[loopEndInputInferHandleIndex]?.id;
  const endInferOutputId = endOutputs[loopEndOutputInferHandleIndex]?.id;

  if (
    !startInferInputId ||
    !startInferOutputId ||
    !stopConditionInputId ||
    !stopInferInputId ||
    !stopInferOutputId ||
    !endInferInputId ||
    !endInferOutputId
  ) {
    const error = createGraphError({
      error: new Error('Loop structure has missing handle IDs'),
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

  // ── Resolve initial input from upstream ────────────
  // Filter out the feedback edge from LoopStop → LoopStart
  const startInputKey = qualifiedId(loopStartNodeId, startInferInputId);
  const allStartEntries = plan.inputResolutionMap.get(startInputKey) ?? [];
  const upstreamEntries = allStartEntries.filter(
    (e) => e.sourceNodeId !== loopStopNodeId,
  );

  let currentValue: unknown;
  if (upstreamEntries.length > 0) {
    currentValue = valueStore.get(
      upstreamEntries[0].sourceNodeId,
      upstreamEntries[0].sourceHandleId,
    );
  }

  // ── Begin loop recording ───────────────────────────
  recorder.beginLoopStructure(
    loopStructureId,
    loopStartNodeId,
    loopStopNodeId,
    loopEndNodeId,
  );
  onNodeStateChange(loopStartNodeId, 'running');
  onNodeStateChange(loopStopNodeId, 'running');

  // ── Group body steps by concurrency level ──────────
  const bodyLevelMap = new Map<number, ExecutionStep[]>();
  for (const step of bodySteps) {
    const group = bodyLevelMap.get(step.concurrencyLevel);
    if (group) group.push(step);
    else bodyLevelMap.set(step.concurrencyLevel, [step]);
  }
  const sortedBodyLevels = [...bodyLevelMap.entries()].sort(
    (a, b) => a[0] - b[0],
  );

  // ── Iterate ────────────────────────────────────────
  let lastConditionValue = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (abortSignal.aborted) break;

    recorder.beginLoopIteration(loopStructureId, iteration);

    // Set LoopStart's infer output (data into the body)
    valueStore.set(loopStartNodeId, startInferOutputId, currentValue);

    // Execute body steps grouped by level
    const bodyErroredNodes = new Set<string>();

    for (const [, levelSteps] of sortedBodyLevels) {
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

      // Record skipped body steps
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
        });
        recorder.skipStep(skipIdx);
      }

      // Execute non-skipped body steps concurrently within level
      const results = await Promise.allSettled(
        toExecute.map((step) => {
          if (step.kind === 'standard') {
            return executeStandardNode(
              step,
              valueStore,
              recorder,
              plan,
              functionImplementations,
              state,
              nodeInfoMap,
              onNodeStateChange,
              abortSignal,
              { loopIteration: iteration, loopStructureId, maxIterations },
            );
          }
          // Future: nested loops/groups inside loop body
          return executeOneStep(
            step,
            valueStore,
            recorder,
            plan,
            functionImplementations,
            state,
            nodeInfoMap,
            bodyErroredNodes,
            onNodeStateChange,
            abortSignal,
          );
        }),
      );

      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          bodyErroredNodes.add(getStepNodeId(toExecute[i]));
        }
      }
    }

    // ── Resolve LoopStop condition ──────────────────
    const conditionKey = qualifiedId(loopStopNodeId, stopConditionInputId);
    const conditionEntries = plan.inputResolutionMap.get(conditionKey);
    let conditionValue = false;

    if (conditionEntries && conditionEntries.length > 0) {
      // Check if the condition source errored
      const conditionSourceErrored = conditionEntries.some((e) =>
        bodyErroredNodes.has(e.sourceNodeId),
      );
      if (!conditionSourceErrored) {
        const raw = valueStore.get(
          conditionEntries[0].sourceNodeId,
          conditionEntries[0].sourceHandleId,
        );
        conditionValue = Boolean(raw);
      }
    }

    // ── Resolve LoopStop infer value (pass-through) ──
    const stopInferKey = qualifiedId(loopStopNodeId, stopInferInputId);
    const stopInferEntries = plan.inputResolutionMap.get(stopInferKey);
    let stopInferValue: unknown;

    if (stopInferEntries && stopInferEntries.length > 0) {
      stopInferValue = valueStore.get(
        stopInferEntries[0].sourceNodeId,
        stopInferEntries[0].sourceHandleId,
      );
    }

    // LoopStop passes data through
    valueStore.set(loopStopNodeId, stopInferOutputId, stopInferValue);

    lastConditionValue = conditionValue;
    currentValue = stopInferValue;

    recorder.completeLoopIteration(loopStructureId, iteration, conditionValue);

    if (!conditionValue) {
      // Condition false → exit loop normally
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
    });
    recorder.errorStep(errIdx, error, new Map());
    onNodeStateChange(loopStopNodeId, 'errored');
    erroredNodes.add(loopStartNodeId);
    erroredNodes.add(loopStopNodeId);
    erroredNodes.add(loopEndNodeId);
    recorder.completeLoopStructure(loopStructureId);
    throw error;
  }

  // Set LoopEnd output for downstream consumption
  valueStore.set(loopEndNodeId, endInferOutputId, currentValue);

  // Record structural step records for loop triplet (replay/timeline visibility).
  // These must be recorded AFTER the loop body so they don't interleave with
  // body step records.
  const tripletBase = {
    concurrencyLevel: block.concurrencyLevel,
    loopStructureId,
  };
  recordStructuralNodeCompletion(
    recorder,
    {
      nodeId: loopStartNodeId,
      nodeTypeId: loopStartInfo.nodeTypeId,
      nodeTypeName: loopStartInfo.nodeTypeName,
      ...tripletBase,
    },
    { status: 'completed' },
  );
  recordStructuralNodeCompletion(
    recorder,
    {
      nodeId: loopStopNodeId,
      nodeTypeId: loopStopInfo.nodeTypeId,
      nodeTypeName: loopStopInfo.nodeTypeName,
      ...tripletBase,
    },
    { status: 'completed' },
  );
  recordStructuralNodeCompletion(
    recorder,
    {
      nodeId: loopEndNodeId,
      nodeTypeId: loopEndInfo.nodeTypeId,
      nodeTypeName: loopEndInfo.nodeTypeName,
      ...tripletBase,
    },
    { status: 'completed' },
  );

  // Mark loop nodes as completed
  onNodeStateChange(loopStartNodeId, 'completed');
  onNodeStateChange(loopStopNodeId, 'completed');
  onNodeStateChange(loopEndNodeId, 'completed');

  recorder.completeLoopStructure(loopStructureId);
}

// ─────────────────────────────────────────────────────
// Execute a group scope
// ─────────────────────────────────────────────────────

/** The subtree type from a TypeOfNode definition (properly typed with full generics). */
type Subtree<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = NonNullable<
  TypeOfNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['subtree']
>;

/**
 * Build a scoped state object for group inner execution.
 *
 * Replaces nodes/edges with the subtree's nodes/edges so that function
 * implementations introspecting context.state see the correct inner graph.
 * Shared definitions (typeOfNodes, dataTypes, etc.) remain from the outer
 * state since type definitions are global.
 */
function buildInnerState<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  outerState: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  subtree: Subtree<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  return {
    ...outerState,
    nodes: subtree.nodes,
    edges: subtree.edges,
    openedNodeGroupStack: undefined,
  };
}

async function executeGroupScope<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  scope: GroupExecutionScope,
  valueStore: ValueStore,
  recorder: ExecutionRecorder,
  plan: ExecutionPlan,
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  _nodeInfoMap: ReadonlyMap<string, NodeInfo>,
  erroredNodes: Set<string>,
  onNodeStateChange: (nodeId: string, state: NodeVisualState) => void,
  abortSignal: AbortSignal,
  groupDepth: number = 1,
): Promise<void> {
  const { groupNodeId, groupNodeTypeId, groupNodeTypeName, innerPlan } = scope;

  onNodeStateChange(groupNodeId, 'running');

  // ── Get subtree from the group's type definition ───
  if (!hasKey(state.typeOfNodes, groupNodeTypeId)) {
    const error = createGraphError({
      error: new Error(
        `Group node type "${groupNodeTypeName}" not found in type definitions`,
      ),
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      path: [],
      timestamp: 0,
      duration: 0,
      groupContext: { groupNodeId, groupNodeTypeId, depth: groupDepth },
    });
    const errIdx = recorder.beginStep({
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      concurrencyLevel: scope.concurrencyLevel,
      groupNodeId,
      groupDepth,
    });
    recorder.errorStep(errIdx, error, new Map());
    onNodeStateChange(groupNodeId, 'errored');
    erroredNodes.add(groupNodeId);
    throw error;
  }
  const typeOfNode = state.typeOfNodes[groupNodeTypeId];

  const subtree = typeOfNode.subtree;
  if (!subtree) {
    const error = createGraphError({
      error: new Error(
        `Group node type "${groupNodeTypeName}" has no subtree definition`,
      ),
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      path: [],
      timestamp: 0,
      duration: 0,
      groupContext: { groupNodeId, groupNodeTypeId, depth: groupDepth },
    });
    const errIdx = recorder.beginStep({
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      concurrencyLevel: scope.concurrencyLevel,
      groupNodeId,
      groupDepth,
    });
    recorder.errorStep(errIdx, error, new Map());
    onNodeStateChange(groupNodeId, 'errored');
    erroredNodes.add(groupNodeId);
    throw error;
  }

  // ── Build scoped state for inner function implementations (DC-3 fix) ──
  const innerState = buildInnerState(state, subtree);

  // ── Build inner nodeInfoMap from subtree nodes ─────
  const innerNodeInfoMap = new Map<string, NodeInfo>();

  // Add all subtree nodes (including GroupInput/GroupOutput for source resolution)
  for (const node of subtree.nodes) {
    const nodeTypeId = node.data.nodeTypeUniqueId;
    if (!nodeTypeId) continue;
    const innerTypeOfNode = hasKey(state.typeOfNodes, nodeTypeId)
      ? state.typeOfNodes[nodeTypeId]
      : undefined;
    innerNodeInfoMap.set(node.id, {
      data: node.data,
      typeOfNode: innerTypeOfNode,
      nodeTypeId,
      nodeTypeName: innerTypeOfNode?.name ?? nodeTypeId,
      concurrencyLevel: -1, // Will be set from plan steps
    });
  }

  // Update concurrency levels from the inner plan's steps
  for (const level of innerPlan.levels) {
    for (const step of level) {
      if (step.kind === 'standard') {
        const info = innerNodeInfoMap.get(step.nodeId);
        if (info) info.concurrencyLevel = step.concurrencyLevel;
      }
    }
  }

  // ── Create scoped ValueStore ───────────────────────
  const scopedStore = valueStore.createScope(groupNodeId);

  // ── Map outer inputs → GroupInput outputs ──────────
  const groupInputNodeId = subtree.inputNodeId;
  if (groupInputNodeId) {
    for (const [outerHandleId, innerHandleId] of scope.inputMapping) {
      // Find what feeds into the outer group node's input handle
      const outerKey = qualifiedId(groupNodeId, outerHandleId);
      const outerEntries = plan.inputResolutionMap.get(outerKey);

      if (outerEntries && outerEntries.length > 0) {
        // Get the value from the parent store
        const value = valueStore.get(
          outerEntries[0].sourceNodeId,
          outerEntries[0].sourceHandleId,
        );
        // Set as GroupInput's output in the scoped store
        scopedStore.set(groupInputNodeId, innerHandleId, value);
      }
    }
  }

  // ── Execute inner plan levels ──────────────────────
  recorder.beginGroup(groupNodeId, groupNodeTypeId);
  recorder.beginScope();

  let innerHasErrors = false;
  const innerErroredNodes = new Set<string>();

  for (let levelIdx = 0; levelIdx < innerPlan.levels.length; levelIdx++) {
    if (abortSignal.aborted) break;

    const level = innerPlan.levels[levelIdx];

    const toExecute: ExecutionStep[] = [];
    const toSkip: ExecutionStep[] = [];

    for (const step of level) {
      const stepNodeId = getStepNodeId(step);
      if (
        shouldSkipNode(
          stepNodeId,
          innerPlan.inputResolutionMap,
          innerErroredNodes,
        )
      ) {
        toSkip.push(step);
      } else {
        toExecute.push(step);
      }
    }

    // Record skipped inner steps
    for (const step of toSkip) {
      const stepNodeId = getStepNodeId(step);
      onNodeStateChange(stepNodeId, 'skipped');
      innerErroredNodes.add(stepNodeId);
      const skipIdx = recorder.beginStep({
        nodeId: stepNodeId,
        nodeTypeId: getStepTypeId(step),
        nodeTypeName: getStepTypeName(step),
        concurrencyLevel: step.concurrencyLevel,
        groupNodeId,
        groupDepth,
      });
      recorder.skipStep(skipIdx);
    }

    // Execute non-skipped inner steps concurrently.
    // Uses innerState (not outer state) so function implementations
    // see the subtree's nodes/edges in context.state (DC-3 fix).
    const results = await Promise.allSettled(
      toExecute.map((step) => {
        if (step.kind === 'standard') {
          return executeStandardNode(
            step,
            scopedStore,
            recorder,
            innerPlan,
            functionImplementations,
            innerState,
            innerNodeInfoMap,
            onNodeStateChange,
            abortSignal,
            undefined, // no loopContext
            { groupNodeId, groupNodeTypeId, groupDepth },
          );
        }
        // Nested groups inside this group
        if (step.kind === 'group') {
          return executeGroupScope(
            step,
            scopedStore,
            recorder,
            innerPlan,
            functionImplementations,
            innerState,
            innerNodeInfoMap,
            innerErroredNodes,
            onNodeStateChange,
            abortSignal,
            groupDepth + 1,
          );
        }
        // Nested loops inside this group
        return executeLoopBlock(
          step,
          scopedStore,
          recorder,
          innerPlan,
          functionImplementations,
          innerState,
          innerNodeInfoMap,
          innerErroredNodes,
          onNodeStateChange,
          abortSignal,
        );
      }),
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        innerHasErrors = true;
        innerErroredNodes.add(getStepNodeId(toExecute[i]));
      }
    }
  }

  // ── Map GroupOutput inputs → outer outputs ─────────
  const groupOutputNodeId = subtree.outputNodeId;
  if (groupOutputNodeId) {
    for (const [innerHandleId, outerHandleId] of scope.outputMapping) {
      // Find what feeds into GroupOutput's input handle in the inner graph
      const innerKey = qualifiedId(groupOutputNodeId, innerHandleId);
      const innerEntries = innerPlan.inputResolutionMap.get(innerKey);

      if (innerEntries && innerEntries.length > 0) {
        const value = scopedStore.get(
          innerEntries[0].sourceNodeId,
          innerEntries[0].sourceHandleId,
        );
        // Set in the parent store as the group node's output
        valueStore.set(groupNodeId, outerHandleId, value);
      }
    }
  }

  // ── Build inner record snapshot for group recording ─
  // endScope() returns only the steps/errors recorded within this scope,
  // not the entire recorder history (fixes BUG #3 / DC-2).
  const innerSnapshot = recorder.endScope(
    innerHasErrors ? 'errored' : 'completed',
    scopedStore.snapshot(),
  );
  recorder.completeGroup(
    groupNodeId,
    groupNodeTypeId,
    innerSnapshot,
    scope.inputMapping,
    scope.outputMapping,
  );

  // ── Record structural step for the group node (replay/timeline visibility) ──
  // This is recorded AFTER endScope() so it belongs to the outer scope.
  const groupStepBase = {
    nodeId: groupNodeId,
    nodeTypeId: groupNodeTypeId,
    nodeTypeName: groupNodeTypeName,
    concurrencyLevel: scope.concurrencyLevel,
    groupNodeId,
    groupDepth,
  };

  if (innerHasErrors) {
    const groupError = createGraphError({
      error: new Error(
        `Group "${groupNodeTypeName}" inner execution had errors`,
      ),
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      path: [],
      timestamp: 0,
      duration: 0,
      groupContext: { groupNodeId, groupNodeTypeId, depth: groupDepth },
    });
    recordStructuralNodeCompletion(recorder, groupStepBase, {
      status: 'errored',
      error: groupError,
    });
    onNodeStateChange(groupNodeId, 'errored');
    erroredNodes.add(groupNodeId);
  } else {
    recordStructuralNodeCompletion(recorder, groupStepBase, {
      status: 'completed',
    });
    onNodeStateChange(groupNodeId, 'completed');
  }
}

// ─────────────────────────────────────────────────────
// Execute one step (dispatcher)
// ─────────────────────────────────────────────────────

async function executeOneStep<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  step: ExecutionStep,
  valueStore: ValueStore,
  recorder: ExecutionRecorder,
  plan: ExecutionPlan,
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  nodeInfoMap: ReadonlyMap<string, NodeInfo>,
  erroredNodes: Set<string>,
  onNodeStateChange: (nodeId: string, state: NodeVisualState) => void,
  abortSignal: AbortSignal,
): Promise<void> {
  switch (step.kind) {
    case 'standard':
      return executeStandardNode(
        step,
        valueStore,
        recorder,
        plan,
        functionImplementations,
        state,
        nodeInfoMap,
        onNodeStateChange,
        abortSignal,
      );

    case 'loop':
      return executeLoopBlock(
        step,
        valueStore,
        recorder,
        plan,
        functionImplementations,
        state,
        nodeInfoMap,
        erroredNodes,
        onNodeStateChange,
        abortSignal,
      );

    case 'group':
      return executeGroupScope(
        step,
        valueStore,
        recorder,
        plan,
        functionImplementations,
        state,
        nodeInfoMap,
        erroredNodes,
        onNodeStateChange,
        abortSignal,
      );
  }
}

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
  },
): Promise<ExecutionRecord> {
  const { onNodeStateChange, abortSignal } = options;
  const valueStore = new ValueStore();
  const recorder = new ExecutionRecorder();
  const erroredNodes = new Set<string>();
  const nodeInfoMap = buildNodeInfoMap(plan, state);

  recorder.start();

  // Initialize ValueStore with user-entered default values
  // (inputs with allowInput and a value, but no incoming edges)
  initializeDefaultValues(plan, state, valueStore, nodeInfoMap);

  let hasErrors = false;

  for (let levelIdx = 0; levelIdx < plan.levels.length; levelIdx++) {
    // Check abort signal
    if (abortSignal.aborted) {
      return recorder.finalize('cancelled', valueStore.snapshot());
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
        concurrencyLevel: step.concurrencyLevel,
      });
      recorder.skipStep(skipIndex);
    }

    // Execute non-skipped steps concurrently
    const results = await Promise.allSettled(
      toExecute.map((step) =>
        executeOneStep(
          step,
          valueStore,
          recorder,
          plan,
          functionImplementations,
          state,
          nodeInfoMap,
          erroredNodes,
          onNodeStateChange,
          abortSignal,
        ),
      ),
    );

    // Process results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        hasErrors = true;
        const stepNodeId = getStepNodeId(toExecute[i]);
        erroredNodes.add(stepNodeId);
      }
    }

    recorder.completeLevel(levelIdx);
  }

  const status = abortSignal.aborted
    ? 'cancelled'
    : hasErrors
      ? 'errored'
      : 'completed';

  return recorder.finalize(status, valueStore.snapshot());
}

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
  },
): AsyncGenerator<
  {
    stepRecord: ExecutionStepRecord;
    partialRecord: ExecutionRecord;
  },
  ExecutionRecord
> {
  const { onNodeStateChange, abortSignal } = options;
  const valueStore = new ValueStore();
  const recorder = new ExecutionRecorder();
  const erroredNodes = new Set<string>();
  const nodeInfoMap = buildNodeInfoMap(plan, state);

  recorder.start();

  initializeDefaultValues(plan, state, valueStore, nodeInfoMap);

  let hasErrors = false;

  for (let levelIdx = 0; levelIdx < plan.levels.length; levelIdx++) {
    if (abortSignal.aborted) {
      return recorder.finalize('cancelled', valueStore.snapshot());
    }

    const level = plan.levels[levelIdx];
    const nodeIds = collectNodeIds(level);

    recorder.beginLevel(levelIdx, nodeIds);

    for (const step of level) {
      if (abortSignal.aborted) {
        return recorder.finalize('cancelled', valueStore.snapshot());
      }

      const stepNodeId = getStepNodeId(step);

      if (shouldSkipNode(stepNodeId, plan.inputResolutionMap, erroredNodes)) {
        onNodeStateChange(stepNodeId, 'skipped');
        erroredNodes.add(stepNodeId);

        const skipIndex = recorder.beginStep({
          nodeId: stepNodeId,
          nodeTypeId: getStepTypeId(step),
          nodeTypeName: getStepTypeName(step),
          concurrencyLevel: step.concurrencyLevel,
        });
        recorder.skipStep(skipIndex);

        continue;
      }

      try {
        await executeOneStep(
          step,
          valueStore,
          recorder,
          plan,
          functionImplementations,
          state,
          nodeInfoMap,
          erroredNodes,
          onNodeStateChange,
          abortSignal,
        );
      } catch {
        hasErrors = true;
        erroredNodes.add(stepNodeId);
      }

      // Yield after each step for debug inspection
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
        recorder.resume();
      }
    }

    recorder.completeLevel(levelIdx);
  }

  const status = abortSignal.aborted
    ? 'cancelled'
    : hasErrors
      ? 'errored'
      : 'completed';

  return recorder.finalize(status, valueStore.snapshot());
}

// ─────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────

function getStepNodeId(step: ExecutionStep): string {
  switch (step.kind) {
    case 'standard':
      return step.nodeId;
    case 'loop':
      return step.loopStartNodeId;
    case 'group':
      return step.groupNodeId;
  }
}

function getStepTypeId(step: ExecutionStep): string {
  switch (step.kind) {
    case 'standard':
      return step.nodeTypeId;
    case 'loop':
      return 'loop';
    case 'group':
      return step.groupNodeTypeId;
  }
}

function getStepTypeName(step: ExecutionStep): string {
  switch (step.kind) {
    case 'standard':
      return step.nodeTypeName;
    case 'loop':
      return 'Loop';
    case 'group':
      return step.groupNodeTypeName;
  }
}

/**
 * Initialize ValueStore with default values from unconnected allowInput handles.
 */
function initializeDefaultValues<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  _plan: ExecutionPlan,
  _state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  _valueStore: ValueStore,
  _nodeInfoMap: ReadonlyMap<string, NodeInfo>,
): void {
  // No pre-initialization needed — ValueStore.resolveInputs handles
  // defaultValue/allowInput at resolution time. The initial values
  // from the UI are read directly from node.data when resolving inputs.
}

export { execute, executeStepByStep, buildNodeInfoMap };
export type { NodeInfo };
