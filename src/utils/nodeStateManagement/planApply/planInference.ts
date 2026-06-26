import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import type {
  HandleIndices,
  InstantiatedNonPanelTypesOfHandles,
} from '../handles/types';
import type { InstantiatedNodeData } from '../nodes/types';
import type {
  InferencePlan,
  HandleInsertion,
  InferenceScope,
  Result,
  ValidationError,
} from './types';
import { ok, err } from './types';
import { getHandleFromNodeDataFromIndices } from '../handles/handleGetters';
import { inferTypeAcrossTheNodeForHandleOfDataType } from '../edges/typeInference';
import { isLoopNode } from '../nodes/loops';
import { isSwitchNode } from '../nodes/switches';

// ---------------------------------------------------------------------------
// planInferenceForEdgeAddition
//
// Mirrors the control flow of `inferTypesAfterEdgeAddition` in
// newOrRemovedEdgeValidation.ts but collects node-data replacements into an
// InferencePlan instead of mutating state.  Each successive inference call
// reads from a *projection* so it sees results of prior dry-run changes.
// ---------------------------------------------------------------------------

/**
 * Build an {@link InferencePlan} for a new edge WITHOUT mutating state.
 *
 * Handle-duplication (loop nodes, node groups) is NOT planned here — it will
 * be applied by the applier on the Immer draft after the inference
 * replacements have been written (Option A from the master plan).
 */
function planInferenceForEdgeAddition<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
  sourceNodeIndex: number,
  targetNodeIndex: number,
  sourceHandleIndex: HandleIndices,
  targetHandleIndex: HandleIndices,
  newEdge: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'][number],
  groupInputNodeId: string | undefined,
  groupOutputNodeId: string | undefined,
  _unmodifiedState: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
  scope: InferenceScope,
): Result<
  {
    inference: InferencePlan;
    handleInsertions: HandleInsertion[];
    validation: { isValid: boolean; reason?: string };
  },
  ValidationError
> {
  // ------------------------------------------------------------------
  // 0. Guard: handles must exist on the edge
  // ------------------------------------------------------------------
  if (!newEdge.sourceHandle || !newEdge.targetHandle) {
    return err({
      code: 'TYPE_INFERENCE_FAILED',
      reason: 'Source or target handle not found',
    });
  }

  // ------------------------------------------------------------------
  // Projection map — accumulates dry-run node data replacements so that
  // each subsequent inference call sees the results of prior ones.
  // ------------------------------------------------------------------
  const replacements = new Map<
    string,
    InstantiatedNodeData<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >();

  function getProjectedNodeData(
    nodeIndex: number,
  ): InstantiatedNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > {
    const nodeId = state.nodes[nodeIndex].id;
    return replacements.get(nodeId) ?? state.nodes[nodeIndex].data;
  }

  // ------------------------------------------------------------------
  // 1. Read source / target handles and their data types
  // ------------------------------------------------------------------
  const sourceNodeData = getProjectedNodeData(sourceNodeIndex);
  const targetNodeData = getProjectedNodeData(targetNodeIndex);

  const sourceHandle = getHandleFromNodeDataFromIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof sourceNodeData,
    typeof sourceHandleIndex
  >(sourceHandleIndex, sourceNodeData)?.value;

  const targetHandle = getHandleFromNodeDataFromIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof targetNodeData,
    typeof targetHandleIndex
  >(targetHandleIndex, targetNodeData)?.value;

  const sourceHandleDataType = sourceHandle?.dataType;
  const targetHandleDataType = targetHandle?.dataType;
  const sourceHandleInferredDataType = sourceHandle?.inferredDataType;
  const targetHandleInferredDataType = targetHandle?.inferredDataType;

  const isSourceHandleInferredFromConnection =
    sourceHandleDataType?.dataTypeObject.underlyingType ===
    'inferFromConnection';
  const isTargetHandleInferredFromConnection =
    targetHandleDataType?.dataTypeObject.underlyingType ===
    'inferFromConnection';

  if (!sourceHandleDataType || !targetHandleDataType) {
    return err({
      code: 'TYPE_INFERENCE_FAILED',
      reason: 'Source or target handle data type not found',
    });
  }

  // ------------------------------------------------------------------
  // 2. Contextual flags (group boundary / loop)
  // ------------------------------------------------------------------
  const isSourceNodeGroupInput =
    Boolean(groupInputNodeId) && newEdge.source === groupInputNodeId;
  const isTargetNodeGroupOutput =
    Boolean(groupOutputNodeId) && newEdge.target === groupOutputNodeId;

  if (!sourceNodeData.nodeTypeUniqueId || !targetNodeData.nodeTypeUniqueId) {
    return err({
      code: 'TYPE_INFERENCE_FAILED',
      reason: 'Source or target node type not found',
    });
  }

  const isSourceNodeLoopNode = isLoopNode(sourceNodeData.nodeTypeUniqueId);
  const isTargetNodeLoopNode = isLoopNode(targetNodeData.nodeTypeUniqueId);
  const isSourceNodeSwitchNode = isSwitchNode(sourceNodeData.nodeTypeUniqueId);
  const isTargetNodeSwitchNode = isSwitchNode(targetNodeData.nodeTypeUniqueId);

  // Group boundaries always rename on connect; a root boundary renames only
  // when `allowRootIORename` is set (default). This gates ONLY the
  // group-boundary term of `overrideName` below — loop/switch renames are
  // independent of the root-I/O policy and must keep firing at root scope.
  const isBoundaryNameOverrideAllowed =
    scope.kind === 'group' || scope.allowNameOverride;

  // ------------------------------------------------------------------
  // 3. No inference needed — neither side is inferFromConnection
  // ------------------------------------------------------------------
  if (
    !isSourceHandleInferredFromConnection &&
    !isTargetHandleInferredFromConnection
  ) {
    return ok({
      inference: { nodeDataReplacements: [] },
      handleInsertions: [],
      validation: { isValid: true },
    });
  }

  // ------------------------------------------------------------------
  // 4. Determine which node to update and the inference parameters
  // ------------------------------------------------------------------
  let indexOfNodeToUpdate: number | undefined;
  let dataTypeToInferFor: DataTypeUniqueId | undefined;
  let connectedHandle:
    | InstantiatedNonPanelTypesOfHandles<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >
    | undefined;
  let resetInferredType = false;
  let overrideDataType = false;
  let overrideName = false;

  // Both sides are inferFromConnection
  if (
    isSourceHandleInferredFromConnection &&
    isTargetHandleInferredFromConnection
  ) {
    // Neither handle has been inferred yet — impossible to infer
    if (!sourceHandleInferredDataType && !targetHandleInferredDataType) {
      return err({
        code: 'TYPE_INFERENCE_FAILED',
        reason:
          'None of the handles are inferred, inference has no information to work with',
      });
    }
    // Both already inferred — nothing to do
    if (sourceHandleInferredDataType && targetHandleInferredDataType) {
      return ok({
        inference: { nodeDataReplacements: [] },
        handleInsertions: [],
        validation: { isValid: true },
      });
    }
    // One inferred, infer the other
    if (sourceHandleInferredDataType) {
      indexOfNodeToUpdate = targetNodeIndex;
      dataTypeToInferFor = targetHandleDataType.dataTypeUniqueId;
      connectedHandle = sourceHandle;
      resetInferredType = false;
      overrideDataType =
        isTargetNodeGroupOutput ||
        isTargetNodeLoopNode ||
        isTargetNodeSwitchNode;
      overrideName =
        (isTargetNodeGroupOutput && isBoundaryNameOverrideAllowed) ||
        isTargetNodeLoopNode ||
        isTargetNodeSwitchNode;
    } else if (targetHandleInferredDataType) {
      indexOfNodeToUpdate = sourceNodeIndex;
      dataTypeToInferFor = sourceHandleDataType.dataTypeUniqueId;
      connectedHandle = targetHandle;
      resetInferredType = false;
      overrideDataType =
        isSourceNodeGroupInput ||
        isSourceNodeLoopNode ||
        isSourceNodeSwitchNode;
      overrideName =
        (isSourceNodeGroupInput && isBoundaryNameOverrideAllowed) ||
        isSourceNodeLoopNode ||
        isSourceNodeSwitchNode;
    }
  }
  // Only source is inferFromConnection
  else if (isSourceHandleInferredFromConnection) {
    if (sourceHandleInferredDataType) {
      // Already inferred
      return ok({
        inference: { nodeDataReplacements: [] },
        handleInsertions: [],
        validation: { isValid: true },
      });
    }
    indexOfNodeToUpdate = sourceNodeIndex;
    dataTypeToInferFor = sourceHandleDataType.dataTypeUniqueId;
    connectedHandle = targetHandle;
    resetInferredType = false;
    overrideDataType =
      isSourceNodeGroupInput || isSourceNodeLoopNode || isSourceNodeSwitchNode;
    overrideName =
      (isSourceNodeGroupInput && isBoundaryNameOverrideAllowed) ||
      isSourceNodeLoopNode ||
      isSourceNodeSwitchNode;
  }
  // Only target is inferFromConnection
  else if (isTargetHandleInferredFromConnection) {
    if (targetHandleInferredDataType) {
      // Already inferred
      return ok({
        inference: { nodeDataReplacements: [] },
        handleInsertions: [],
        validation: { isValid: true },
      });
    }
    indexOfNodeToUpdate = targetNodeIndex;
    dataTypeToInferFor = targetHandleDataType.dataTypeUniqueId;
    connectedHandle = sourceHandle;
    resetInferredType = false;
    overrideDataType =
      isTargetNodeGroupOutput || isTargetNodeLoopNode || isTargetNodeSwitchNode;
    overrideName =
      (isTargetNodeGroupOutput && isBoundaryNameOverrideAllowed) ||
      isTargetNodeLoopNode ||
      isTargetNodeSwitchNode;
  }

  // ------------------------------------------------------------------
  // 5. Sanity check — we must have resolved who/what to infer
  // ------------------------------------------------------------------
  if (
    indexOfNodeToUpdate === undefined ||
    dataTypeToInferFor === undefined ||
    connectedHandle === undefined
  ) {
    return err({
      code: 'TYPE_INFERENCE_FAILED',
      reason:
        'Index of node to update, data type to infer for, or connected handle not found',
    });
  }

  // ------------------------------------------------------------------
  // 6. Run inference in dry-run mode (mutate = false)
  // ------------------------------------------------------------------
  const oldData = getProjectedNodeData(indexOfNodeToUpdate);
  const newData = inferTypeAcrossTheNodeForHandleOfDataType<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >(
    oldData,
    dataTypeToInferFor,
    {
      handle: connectedHandle,
      resetInferredType,
      overrideDataType,
      overrideName,
    },
    /* mutate */ false,
  );

  replacements.set(state.nodes[indexOfNodeToUpdate].id, newData);

  // ------------------------------------------------------------------
  // 7. Build the plan
  // ------------------------------------------------------------------
  const nodeDataReplacements: InferencePlan['nodeDataReplacements'] = [];
  for (const [nodeId, data] of replacements) {
    nodeDataReplacements.push({ nodeId, newData: data });
  }

  return ok({
    inference: { nodeDataReplacements },
    handleInsertions: [], // Option A: duplication runs during applyPlan
    validation: { isValid: true },
  });
}

// ---------------------------------------------------------------------------
// applyInferencePlanToProjection
//
// Returns a shallow copy of state with node data replacements applied.
// Used by downstream validators (e.g. complex-type and conversion checks)
// to see post-inference state without mutating the original.
// ---------------------------------------------------------------------------

function applyInferencePlanToProjection<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
  plan: InferencePlan,
): State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  if (plan.nodeDataReplacements.length === 0) {
    return state as State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >;
  }

  // Build a lookup map for O(1) access
  const replacementMap = new Map<string, unknown>();
  for (const r of plan.nodeDataReplacements) {
    replacementMap.set(r.nodeId, r.newData);
  }

  const nodes = state.nodes.map((n) => {
    const replacement = replacementMap.get(n.id);
    return replacement ? { ...n, data: replacement as typeof n.data } : n;
  });

  return { ...state, nodes } as State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
}

export { planInferenceForEdgeAddition, applyInferencePlanToProjection };
