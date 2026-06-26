import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import type { Connection } from '@xyflow/react';
import type {
  AddEdgePlan,
  InferencePlan,
  InferenceScope,
  Result,
  ValidationError,
} from './types';
import { ok, err } from './types';
import { addEdge } from '@xyflow/react';
import { willAddingEdgeCreateCycle } from '../constructAndModifyHandles';
import { getCurrentNodesAndEdgesFromState } from '../nodes/constructAndModifyNodes';
import { standardNodeTypeNamesMap } from '../standardNodes';
import { getHandleFromNodeDataMatchingHandleId } from '../handles/handleGetters';
import { isLoopConnectionValid } from '../nodes/loops';
import { isSwitchConnectionValid } from '../nodes/switches';
import {
  checkComplexTypeCompatibilityAfterEdgeAddition,
  checkTypeConversionCompatibilityAfterEdgeAddition,
} from '../newOrRemovedEdgeValidation';
import {
  planInferenceForEdgeAddition,
  applyInferencePlanToProjection,
} from './planInference';
import type { Edges } from '@/components/organisms/FullGraph/types';

function validateAddEdge<
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
  action: {
    payload: {
      edge: Connection;
      allowRootIORename?: boolean;
      allowRootIOStructureEdit?: boolean;
    };
  },
): Result<AddEdgePlan, ValidationError> {
  const { source, target, sourceHandle, targetHandle } = action.payload.edge;

  // 1. Null checks
  if (!source) {
    return err({
      code: 'MISSING_ENDPOINT',
      which: 'source',
      detail: 'source is missing',
    });
  }
  if (!target) {
    return err({
      code: 'MISSING_ENDPOINT',
      which: 'target',
      detail: 'target is missing',
    });
  }
  if (!sourceHandle) {
    return err({
      code: 'MISSING_ENDPOINT',
      which: 'sourceHandle',
      detail: 'sourceHandle is missing',
    });
  }
  if (!targetHandle) {
    return err({
      code: 'MISSING_ENDPOINT',
      which: 'targetHandle',
      detail: 'targetHandle is missing',
    });
  }

  // 2. Cycle check
  if (state.enableCycleChecking) {
    const view = getCurrentNodesAndEdgesFromState(state);
    if (
      willAddingEdgeCreateCycle(
        { ...state, nodes: view.nodes, edges: view.edges },
        source,
        target,
      )
    ) {
      return err({
        code: 'CYCLE_DETECTED',
        sourceNodeId: source,
        targetNodeId: target,
      });
    }
  }

  // 3. Get current view
  const view = getCurrentNodesAndEdgesFromState(state);

  // 3b. Resolve the inference scope and the boundary node ids the inference
  // plan grows on. In an open group the view already provides the subtree
  // boundary ids; at root the view omits them, so resolve them as the
  // FIRST-match groupInput/groupOutput node — the SAME first-match the
  // compiler/executor use (`rootIo.ts`, `lower.ts`) — and carry the root edit
  // policy from the action. `inferenceScope` rides the plan to `applyPlan`'s
  // grow step, which only sees the Plan.
  let groupInputNodeId = view.inputNodeId;
  let groupOutputNodeId = view.outputNodeId;
  let inferenceScope: InferenceScope;
  if (groupInputNodeId === undefined && groupOutputNodeId === undefined) {
    groupInputNodeId = view.nodes.find(
      (node) =>
        node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.groupInput,
    )?.id;
    groupOutputNodeId = view.nodes.find(
      (node) =>
        node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.groupOutput,
    )?.id;
    inferenceScope = {
      kind: 'root',
      allowNameOverride: action.payload.allowRootIORename ?? true,
      allowStructureGrow: action.payload.allowRootIOStructureEdit ?? true,
    };
  } else {
    inferenceScope = { kind: 'group' };
  }

  // 4. Duplicate check
  const candidateEdge = {
    id: '__dup_check__',
    source,
    target,
    sourceHandle,
    targetHandle,
  };
  if (addEdge<Edges[number]>(candidateEdge, view.edges) === view.edges) {
    return err({
      code: 'DUPLICATE_EDGE',
      sourceHandle,
      targetHandle,
    });
  }

  // 5. Build a placeholder edge object for downstream validation calls.
  // The `id` is intentionally a placeholder — `applyPlan` mints the real
  // id when the plan is committed. Downstream readers
  // (`planInferenceForEdgeAddition`, complex-type checks, etc.) only
  // touch source/target/sourceHandle/targetHandle, never the id.
  const newEdge = {
    id: '__pending__',
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'configurableEdge' as const,
  };

  // 6. Find nodes and handles
  const sourceNodeIndex = view.nodes.findIndex((n) => n.id === source);
  const targetNodeIndex = view.nodes.findIndex((n) => n.id === target);

  if (sourceNodeIndex === -1) {
    return err({
      code: 'MISSING_ENDPOINT',
      which: 'source',
      detail: 'Source node not found',
    });
  }
  if (targetNodeIndex === -1) {
    return err({
      code: 'MISSING_ENDPOINT',
      which: 'target',
      detail: 'Target node not found',
    });
  }

  const sourceNode = view.nodes[sourceNodeIndex];
  const targetNode = view.nodes[targetNodeIndex];

  const sourceHandleResult = getHandleFromNodeDataMatchingHandleId(
    sourceHandle,
    sourceNode.data,
  );
  const targetHandleResult = getHandleFromNodeDataMatchingHandleId(
    targetHandle,
    targetNode.data,
  );

  if (!sourceHandleResult?.handleIndices) {
    return err({
      code: 'MISSING_ENDPOINT',
      which: 'sourceHandle',
      detail: 'Source handle not found on node',
    });
  }
  if (!targetHandleResult?.handleIndices) {
    return err({
      code: 'MISSING_ENDPOINT',
      which: 'targetHandle',
      detail: 'Target handle not found on node',
    });
  }

  const sourceHandleIndex = sourceHandleResult.handleIndices;
  const targetHandleIndex = targetHandleResult.handleIndices;

  // Build a view-scoped state for structural validation.
  // When inside a node group, state.nodes/edges are root-level but
  // the connecting nodes live in the subtree. Validation must see
  // the subtree's nodes/edges to find structures and run BFS correctly.
  const viewScopedState: typeof state = {
    ...state,
    nodes: view.nodes,
    edges: view.edges,
    ...(view.zones !== undefined && { zones: view.zones }),
    ...(view.zoneIndex !== undefined && { zoneIndex: view.zoneIndex }),
  };

  // 7. Loop validation
  const loopValidation = isLoopConnectionValid(
    viewScopedState,
    sourceNode,
    targetNode,
    sourceHandleIndex,
    targetHandleIndex,
  );

  if (!loopValidation.validation.isValid) {
    return err({
      code: 'LOOP_PATH_INVALID',
      reason: loopValidation.validation.reason ?? 'Loop connection invalid',
    });
  }

  // 7b. Switch validation
  const switchValidation = isSwitchConnectionValid(
    viewScopedState,
    sourceNode,
    targetNode,
    sourceHandleIndex,
    targetHandleIndex,
  );

  if (!switchValidation.validation.isValid) {
    return err({
      code: 'SWITCH_PATH_INVALID',
      reason: switchValidation.validation.reason ?? 'Switch connection invalid',
    });
  }

  // 8. Early return if no validation flags enabled
  const isValidationNeeded =
    state.enableTypeInference ||
    state.enableComplexTypeChecking ||
    state.allowedConversionsBetweenDataTypes;

  if (!isValidationNeeded) {
    return ok({
      kind: 'ADD_EDGE',
      connection: { source, target, sourceHandle, targetHandle },
      inference: { nodeDataReplacements: [] },
      handleInsertions: [],
      inferenceScope,
    });
  }

  // 9. Inference plan
  let inferencePlan: InferencePlan = {
    nodeDataReplacements: [],
  };

  if (state.enableTypeInference) {
    const stateForView = {
      ...state,
      nodes: view.nodes,
      edges: view.edges,
    };

    const inferenceResult = planInferenceForEdgeAddition(
      stateForView,
      sourceNodeIndex,
      targetNodeIndex,
      sourceHandleIndex,
      targetHandleIndex,
      newEdge,
      groupInputNodeId,
      groupOutputNodeId,
      state,
      inferenceScope,
    );

    if (!inferenceResult.ok) {
      return inferenceResult;
    }

    inferencePlan = inferenceResult.value.inference;
  }

  // 10. Build projection for downstream checks
  const stateForView = {
    ...state,
    nodes: view.nodes,
    edges: view.edges,
  };

  const projectedState = applyInferencePlanToProjection(
    stateForView,
    inferencePlan,
  );

  // Re-find node indices in projected state (same indices, but projected data)
  const projectedSourceNodeIndex = projectedState.nodes.findIndex(
    (n) => n.id === source,
  );
  const projectedTargetNodeIndex = projectedState.nodes.findIndex(
    (n) => n.id === target,
  );

  // 11. Complex type check
  if (state.enableComplexTypeChecking) {
    const complexResult = checkComplexTypeCompatibilityAfterEdgeAddition(
      projectedState,
      projectedSourceNodeIndex,
      projectedTargetNodeIndex,
      sourceHandleIndex,
      targetHandleIndex,
      newEdge,
    );

    if (!complexResult.validation.isValid) {
      return err({
        code: 'COMPLEX_TYPE_MISMATCH',
        sourceTypeId: sourceHandle,
        targetTypeId: targetHandle,
      });
    }
  }

  // 12. Conversion check
  if (state.allowedConversionsBetweenDataTypes) {
    const conversionResult = checkTypeConversionCompatibilityAfterEdgeAddition(
      projectedState,
      projectedSourceNodeIndex,
      projectedTargetNodeIndex,
      sourceHandleIndex,
      targetHandleIndex,
      newEdge,
    );

    if (!conversionResult.validation.isValid) {
      return err({
        code: 'CONVERSION_NOT_ALLOWED',
        from: sourceHandle,
        to: targetHandle,
      });
    }
  }

  // 13. Success
  return ok({
    kind: 'ADD_EDGE',
    connection: { source, target, sourceHandle, targetHandle },
    inference: inferencePlan,
    handleInsertions: [],
    inferenceScope,
  });
}

export { validateAddEdge };
