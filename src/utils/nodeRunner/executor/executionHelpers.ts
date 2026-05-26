import type {
  State,
  SupportedUnderlyingTypes,
  TypeOfNode,
} from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  ExecutionPlan,
  ExecutionStep,
  RecordedInputHandleValue,
  RecordedInputConnection,
  RecordedOutputHandleValue,
  InputHandleValue,
  GraphError,
  NodeVisualState,
  FunctionImplementations,
} from '../types';
import { createGraphError } from '../errors';
import type { MinimalNodeData } from '../valueStore';
import { qualifiedId } from '../valueStore';
import type { ValueStore } from '../valueStore';
import { ExecutionRecorder } from '../executionRecorder';
import { standardDataTypeNamesMap } from '../../nodeStateManagement/standardNodes';

// ─────────────────────────────────────────────────────
// Execution environment — immutable context for a run
// ─────────────────────────────────────────────────────

/**
 * Immutable execution environment shared across all steps within a single run.
 * Created once by execute()/executeStepByStep() and passed to all sub-executors.
 */
type ExecutionEnv<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  readonly recorder: ExecutionRecorder;
  readonly abortSignal: AbortSignal;
  readonly onNodeStateChange: (nodeId: string, state: NodeVisualState) => void;
  readonly plan: ExecutionPlan;
  readonly state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
  readonly functionImplementations: FunctionImplementations<NodeTypeUniqueId>;
  readonly nodeInfoMap: ReadonlyMap<string, NodeInfo>;
};

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
      } else if (step.kind === 'switch') {
        for (const switchNodeId of [
          step.switchStartNodeId,
          step.switchEndNodeId,
        ]) {
          const node = state.nodes.find((n) => n.id === switchNodeId);
          if (!node) continue;
          const nodeTypeId = node.data.nodeTypeUniqueId;
          if (!nodeTypeId) continue;
          const typeOfNode = state.typeOfNodes[nodeTypeId];
          map.set(switchNodeId, {
            data: node.data,
            typeOfNode,
            nodeTypeId,
            nodeTypeName: typeOfNode?.name ?? nodeTypeId,
            concurrencyLevel: step.concurrencyLevel,
          });
        }
        processSteps(step.trueBranchSteps);
        processSteps(step.falseBranchSteps);
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
    } else if (step.kind === 'switch') {
      ids.push(step.switchStartNodeId);
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
  } else if (outcome.status === 'completed') {
    recorder.completeStep(stepIdx, new Map(), new Map());
  } else {
    throw new Error('Unreachable');
  }
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
    case 'switch':
      return step.switchStartNodeId;
    case 'group':
      return step.groupNodeId;
    default:
      throw new Error('Unreachable');
  }
}

function getStepTypeId(step: ExecutionStep): string {
  switch (step.kind) {
    case 'standard':
      return step.nodeTypeId;
    case 'loop':
      return 'loop';
    case 'switch':
      return 'switch';
    case 'group':
      return step.groupNodeTypeId;
    default:
      throw new Error('Unreachable');
  }
}

function getStepTypeName(step: ExecutionStep): string {
  switch (step.kind) {
    case 'standard':
      return step.nodeTypeName;
    case 'loop':
      return 'Loop';
    case 'switch':
      return 'Switch';
    case 'group':
      return step.groupNodeTypeName;
    default:
      throw new Error('Unreachable');
  }
}

/**
 * Handles errors caught in orchestration-level catch blocks.
 *
 * If the error is a GraphError (already recorded by executeStandardNode),
 * we just ensure the visual state is set. Otherwise, we record a new
 * error step so the error isn't silently swallowed.
 */
function handleCatchError(
  e: unknown,
  step: ExecutionStep,
  env: Pick<ExecutionEnv, 'recorder' | 'onNodeStateChange'>,
): void {
  const { recorder, onNodeStateChange } = env;
  const isGraphError =
    typeof e === 'object' &&
    e !== null &&
    'nodeId' in e &&
    'message' in e &&
    'timestamp' in e;
  if (isGraphError) {
    // Already recorded by executeStandardNode — just ensure visual state
    onNodeStateChange(getStepNodeId(step), 'errored');
    return;
  }
  // Unexpected error — record it properly
  const nodeId = getStepNodeId(step);
  onNodeStateChange(nodeId, 'errored');
  const stepIndex = recorder.beginStep({
    nodeId,
    nodeTypeId: getStepTypeId(step),
    nodeTypeName: getStepTypeName(step),
    concurrencyLevel: step.concurrencyLevel,
  });
  const error = createGraphError({
    error: e,
    nodeId,
    nodeTypeId: getStepTypeId(step),
    nodeTypeName: getStepTypeName(step),
    path: [],
    timestamp: performance.now(),
    duration: 0,
  });
  recorder.errorStep(stepIndex, error, new Map());
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
  _valueStore: import('../valueStore').ValueStore,
  _nodeInfoMap: ReadonlyMap<string, NodeInfo>,
): void {
  // No pre-initialization needed — ValueStore.resolveInputs handles
  // defaultValue/allowInput at resolution time. The initial values
  // from the UI are read directly from node.data when resolving inputs.
}

// ─────────────────────────────────────────────────────
// Loop-specific helpers
// ─────────────────────────────────────────────────────

/** Data type IDs that are structural (not user data) on structural nodes. */
const STRUCTURAL_HANDLE_TYPES: ReadonlySet<string> = new Set([
  standardDataTypeNamesMap.bindLoopNodes,
  standardDataTypeNamesMap.loopInfer,
  standardDataTypeNamesMap.bindSwitchNodes,
  standardDataTypeNamesMap.switchInfer,
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
      return h.id && dtId && !STRUCTURAL_HANDLE_TYPES.has(dtId);
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

function resolveConditionValue(
  nodeId: string,
  conditionInputId: string,
  flatInputs: ReadonlyArray<{
    id?: string;
    allowInput?: boolean;
    value?: unknown;
  }>,
  inputResolutionMap: ExecutionPlan['inputResolutionMap'],
  valueStore: ValueStore,
  erroredSourceNodes?: ReadonlySet<string>,
): boolean {
  const key = qualifiedId(nodeId, conditionInputId);
  const entries = inputResolutionMap.get(key);
  if (entries && entries.length > 0) {
    if (erroredSourceNodes) {
      const allErrored = entries.every((e) =>
        erroredSourceNodes.has(e.sourceNodeId),
      );
      if (allErrored) return false;
    }
    return Boolean(
      valueStore.get(entries[0].sourceNodeId, entries[0].sourceHandleId),
    );
  }
  const handle = flatInputs.find((h) => h.id === conditionInputId);
  if (handle?.allowInput && handle.value !== undefined) {
    return Boolean(handle.value);
  }
  return false;
}

// ─────────────────────────────────────────────────────
// Group-specific helpers
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

export {
  buildNodeInfoMap,
  recordInputValues,
  recordOutputValues,
  shouldSkipNode,
  collectNodeIds,
  recordStructuralNodeCompletion,
  getStepNodeId,
  getStepTypeId,
  getStepTypeName,
  handleCatchError,
  initializeDefaultValues,
  getDataHandleIds,
  findConditionInputId,
  resolveConditionValue,
  buildInnerState,
};
export type { ExecutionEnv, NodeInfo, Subtree };
