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
  LoopPhase,
} from './types';
import { createGraphError, buildErrorPath } from './errors';
import { ValueStore, qualifiedId, flattenInputs } from './valueStore';
import type { MinimalNodeData } from './valueStore';
import { ExecutionRecorder } from './executionRecorder';
import { standardDataTypeNamesMap } from '../nodeStateManagement/standardNodes';
import { StepChannel } from './stepChannel';
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
        processSteps(step.preStopSteps);
        processSteps(step.postStopSteps);
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
    parentLoopStructureId?: string;
    parentLoopIteration?: number;
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
  loopPhase?: LoopPhase,
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
    loopPhase,
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

/** Data type IDs that are structural (not user data) on loop nodes. */
const LOOP_STRUCTURAL_TYPES: ReadonlySet<string> = new Set([
  standardDataTypeNamesMap.bindLoopNodes,
  standardDataTypeNamesMap.loopInfer,
  standardDataTypeNamesMap.condition,
]);

/** Get the resolved dataTypeUniqueId from a handle, considering inferred types. */
function resolveHandleDataTypeId(handle: {
  dataType?: { dataTypeUniqueId?: string };
  inferredDataType?: { dataTypeUniqueId?: string } | null;
}): string | undefined {
  return (
    handle.inferredDataType?.dataTypeUniqueId ??
    handle.dataType?.dataTypeUniqueId
  );
}

/** Extract handle IDs for user data handles (not bindLoopNodes, loopInfer, or condition). */
function getDataHandleIds(
  handles: ReadonlyArray<{
    id?: string;
    dataType?: { dataTypeUniqueId?: string };
    inferredDataType?: { dataTypeUniqueId?: string } | null;
  }>,
): string[] {
  return handles
    .filter((h) => {
      const dtId = resolveHandleDataTypeId(h);
      return h.id && dtId && !LOOP_STRUCTURAL_TYPES.has(dtId);
    })
    .map((h) => h.id!);
}

/** Find the condition input handle on Loop Stop (the one with dataType 'condition'). */
function findConditionInputId(
  handles: ReadonlyArray<{
    id?: string;
    dataType?: { dataTypeUniqueId?: string };
    inferredDataType?: { dataTypeUniqueId?: string } | null;
  }>,
): string | undefined {
  return handles.find(
    (h) => resolveHandleDataTypeId(h) === standardDataTypeNamesMap.condition,
  )?.id;
}

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
  parentLoopContext?: {
    loopIteration: number;
    loopStructureId: string;
  },
  afterStep?: () => Promise<void>,
): Promise<void> {
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
              await executeStandardNode(
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
                undefined, // groupContext
                loopPhase,
              );
              await afterStep();
            } else {
              await executeOneStep(
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
                { loopIteration: iteration, loopStructureId },
                afterStep,
              );
            }
          } catch {
            bodyErroredNodes.add(getStepNodeId(step));
          }
        }
      } else {
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
                undefined, // groupContext
                loopPhase,
              );
            }
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
              { loopIteration: iteration, loopStructureId },
            );
          }),
        );

        for (let i = 0; i < results.length; i++) {
          if (results[i].status === 'rejected') {
            bodyErroredNodes.add(getStepNodeId(toExecute[i]));
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
        loopPhase: 'loopStart' as LoopPhase,
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
    const conditionKey = qualifiedId(loopStopNodeId, stopConditionInputId);
    const conditionEntries = plan.inputResolutionMap.get(conditionKey);
    let conditionValue = false;

    if (conditionEntries && conditionEntries.length > 0) {
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
        loopPhase: 'loopStop' as LoopPhase,
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
        loopPhase: 'loopEnd' as LoopPhase,
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
  afterStep?: () => Promise<void>,
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
      await afterStep?.();
    }

    // Execute non-skipped inner steps.
    // Uses innerState (not outer state) so function implementations
    // see the subtree's nodes/edges in context.state (DC-3 fix).
    // In step-by-step mode (afterStep present), execute sequentially.
    // In performance mode, use Promise.allSettled for concurrency.
    if (afterStep) {
      for (const step of toExecute) {
        if (abortSignal.aborted) break;
        try {
          if (step.kind === 'standard') {
            await executeStandardNode(
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
            await afterStep();
          } else if (step.kind === 'group') {
            await executeGroupScope(
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
              afterStep,
            );
          } else {
            await executeLoopBlock(
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
              undefined, // parentLoopContext
              afterStep,
            );
          }
        } catch {
          innerErroredNodes.add(getStepNodeId(step));
        }
      }
    } else {
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
  parentLoopContext?: {
    loopIteration: number;
    loopStructureId: string;
  },
  afterStep?: () => Promise<void>,
): Promise<void> {
  switch (step.kind) {
    case 'standard':
      await executeStandardNode(
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
      await afterStep?.();
      return;

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
        parentLoopContext,
        afterStep,
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
        undefined, // groupDepth
        afterStep,
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
  const compilationDuration = performance.now() - warmupStart;

  recorder.start();

  // Initialize ValueStore with user-entered default values
  // (inputs with allowInput and a value, but no incoming edges)
  initializeDefaultValues(plan, state, valueStore, nodeInfoMap);

  let hasErrors = false;

  for (let levelIdx = 0; levelIdx < plan.levels.length; levelIdx++) {
    // Check abort signal
    if (abortSignal.aborted) {
      return recorder.finalize(
        'cancelled',
        valueStore.snapshot(),
        compilationDuration,
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

  return recorder.finalize(status, valueStore.snapshot(), compilationDuration);
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

  // JIT warmup (same as execute())
  const warmupStart = performance.now();
  {
    const w = '__jit_warmup__';
    valueStore.set(w, w, 0);
    valueStore.get(w, w);
    await Promise.allSettled([Promise.resolve(0)]);
    valueStore.set(w, w, undefined);
  }
  const compilationDuration = performance.now() - warmupStart;

  recorder.start();

  initializeDefaultValues(plan, state, valueStore, nodeInfoMap);

  let hasErrors = false;

  for (let levelIdx = 0; levelIdx < plan.levels.length; levelIdx++) {
    if (abortSignal.aborted) {
      recorder.resume(); // ensure pause is closed before finalize
      return recorder.finalize(
        'cancelled',
        valueStore.snapshot(),
        compilationDuration,
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
          compilationDuration,
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
          concurrencyLevel: step.concurrencyLevel,
        });
        recorder.skipStep(skipIndex);

        continue;
      }

      if (step.kind === 'standard') {
        // Standard nodes: execute, then yield once
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
          valueStore,
          recorder,
          plan,
          functionImplementations,
          state,
          nodeInfoMap,
          erroredNodes,
          onNodeStateChange,
          abortSignal,
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
        } catch {
          hasErrors = true;
          erroredNodes.add(stepNodeId);
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

  return recorder.finalize(status, valueStore.snapshot(), compilationDuration);
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
