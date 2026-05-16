import type { State, SupportedUnderlyingTypes } from '../../types';
import type { z } from 'zod';
import { constructTypeOfHandleFromIndices } from '../constructAndModifyNodes';
import { insertOrDeleteHandleInNodeDataUsingHandleIndices } from '../../handles/handleSetters';
import { getHandleFromNodeDataFromIndices } from '../../handles/handleGetters';
import { inferTypeAcrossTheNodeForHandleOfDataType } from '../../edges/typeInference';
import type { ConnectionValidationResult } from '../../newOrRemovedEdgeValidation';
import { isLoopNode, getLoopNodeInferHandleIndex } from './loopIdentification';
import { getLoopStructureFromNode } from './loopStructure';
import { standardDataTypeNamesMap } from '../../standardNodes';

function addLoopInferDuplicateToNode<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  node: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number],
): boolean {
  const nodeType = node.data.nodeTypeUniqueId;
  if (!nodeType) return false;

  const newInputHandle = constructTypeOfHandleFromIndices(
    state.dataTypes,
    nodeType,
    state.typeOfNodes,
    {
      type: 'input',
      index1: getLoopNodeInferHandleIndex(nodeType, 'input'),
      index2: undefined,
    },
  );
  if (!newInputHandle) return false;

  insertOrDeleteHandleInNodeDataUsingHandleIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(
    node.data,
    { type: 'input', index1: -1, index2: undefined },
    0,
    newInputHandle,
    true,
    'after',
  );

  const newOutputHandle = constructTypeOfHandleFromIndices(
    state.dataTypes,
    nodeType,
    state.typeOfNodes,
    {
      type: 'output',
      index1: getLoopNodeInferHandleIndex(nodeType, 'output'),
      index2: undefined,
    },
  );
  if (!newOutputHandle) return false;

  insertOrDeleteHandleInNodeDataUsingHandleIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(
    node.data,
    { type: 'output', index1: -1, index2: undefined },
    0,
    newOutputHandle,
    true,
    'after',
  );

  return true;
}

/**
 * Adds duplicate handles to loop nodes when a loopInfer handle gets inferred.
 *
 * When a loopInfer handle gets inferred on any node in a loop triplet,
 * the inferred type is propagated to the corresponding handles on ALL THREE
 * nodes, and new loopInfer placeholder handles are added. This keeps the
 * triplet in sync so users don't have to manually connect to each node.
 */
function addDuplicateHandlesToLoopNodesAfterInference<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  sourceNodeIndex: number,
  targetNodeIndex: number,
  isSourceHandleInferredFromConnection: boolean,
  isTargetHandleInferredFromConnection: boolean,
): {
  validation: ConnectionValidationResult;
} {
  const sourceNode = state.nodes[sourceNodeIndex];
  const targetNode = state.nodes[targetNodeIndex];
  const sourceNodeType = sourceNode.data.nodeTypeUniqueId;
  const targetNodeType = targetNode.data.nodeTypeUniqueId;

  if (!sourceNodeType || !targetNodeType) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target node type not found',
      },
    };
  }

  const isSourceNodeLoopNode = isLoopNode(sourceNodeType);
  const isTargetNodeLoopNode = isLoopNode(targetNodeType);

  if (!isSourceNodeLoopNode && !isTargetNodeLoopNode) {
    return { validation: { isValid: true } };
  }

  const processedNodeIds = new Set<string>();

  if (isSourceNodeLoopNode && isSourceHandleInferredFromConnection) {
    if (addLoopInferDuplicateToNode(state, sourceNode)) {
      processedNodeIds.add(sourceNode.id);
    }
  }

  if (isTargetNodeLoopNode && isTargetHandleInferredFromConnection) {
    if (addLoopInferDuplicateToNode(state, targetNode)) {
      processedNodeIds.add(targetNode.id);
    }
  }

  if (processedNodeIds.size > 0) {
    const processedNode = processedNodeIds.has(sourceNode.id)
      ? sourceNode
      : targetNode;

    const inferIndices = {
      type: 'input' as const,
      index1: -2,
      index2: undefined,
    };
    const inferredHandleResult = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof processedNode.data,
      typeof inferIndices
    >(inferIndices, processedNode.data);
    if (!inferredHandleResult?.value) return { validation: { isValid: true } };

    const loopStructure = getLoopStructureFromNode(state, processedNode);
    if (loopStructure) {
      const siblings = [
        loopStructure.loopStart,
        loopStructure.loopStop,
        loopStructure.loopEnd,
      ];
      for (const sibling of siblings) {
        if (processedNodeIds.has(sibling.id)) continue;

        inferTypeAcrossTheNodeForHandleOfDataType<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          sibling.data,
          standardDataTypeNamesMap.loopInfer as DataTypeUniqueId,
          {
            handle: inferredHandleResult.value,
            resetInferredType: false,
            overrideDataType: true,
            overrideName: true,
          },
          true,
        );

        addLoopInferDuplicateToNode(state, sibling);
      }
    }
  }

  return { validation: { isValid: true } };
}

export { addDuplicateHandlesToLoopNodesAfterInference };
