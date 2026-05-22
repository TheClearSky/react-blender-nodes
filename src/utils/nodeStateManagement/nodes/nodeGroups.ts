import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import type { InstantiatedNonPanelTypesOfHandles } from '../handles/types';
import { addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees } from '../constructAndModifyHandles';
import { constructTypeOfHandleFromIndices } from './constructAndModifyNodes';
import { insertOrDeleteHandleInNodeDataUsingHandleIndices } from '../handles/handleSetters';
import type { ConnectionValidationResult } from '../newOrRemovedEdgeValidation';
import { standardNodeTypeNamesMap } from '../standardNodes';

/**
 * Adds a duplicate handle to a node group when a groupInput or groupOutput handle gets inferred
 *
 * When inside a node group, if we connect a handle to the groupInput or groupOutput,
 * that node group's type gets inferred across the entire tree and a new duplicate
 * handle is added for further inference.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param sourceNodeIndex - Index of the source node
 * @param targetNodeIndex - Index of the target node
 * @param sourceHandle - The source handle
 * @param targetHandle - The target handle
 * @param unmodifiedState - The unmodified state before edge addition
 * @param isSourceHandleInferredFromConnection - Whether source handle is inferred from connection
 * @param isTargetHandleInferredFromConnection - Whether target handle is inferred from connection
 * @param isSourceNodeGroupInput - Whether source node is group input
 * @param isTargetNodeGroupOutput - Whether target node is group output
 * @param nodeGroup - The current node group
 * @returns Validation result indicating success or failure
 */
function addDuplicateHandleToNodeGroupAfterInference<
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
  sourceHandle: InstantiatedNonPanelTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  targetHandle: InstantiatedNonPanelTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  unmodifiedState: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  isSourceHandleInferredFromConnection: boolean,
  isTargetHandleInferredFromConnection: boolean,
  isSourceNodeGroupInput: boolean,
  isTargetNodeGroupOutput: boolean,
  nodeGroup:
    | NonNullable<
        State<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >['openedNodeGroupStack']
      >[number]
    | undefined,
): {
  validation: ConnectionValidationResult;
} {
  // XOR gate: exactly one side must be (inferFromConnection AND group boundary).
  // Both sides infer+group (first direct GroupInput→GroupOutput) is blocked — no
  // type information exists. After overrideDataType converts one side to concrete,
  // the XOR opens and the infer side gets a new template handle.
  if (
    nodeGroup &&
    (isSourceHandleInferredFromConnection && isSourceNodeGroupInput) !==
      (isTargetHandleInferredFromConnection && isTargetNodeGroupOutput)
  ) {
    // The node that was inferFromConnection is the one whose template was consumed
    // and needs a replacement. This is NOT always the group boundary target —
    // after overrideDataType, either side could be the infer side.
    const indexOfNodeToUpdateInGroup = isSourceHandleInferredFromConnection
      ? sourceNodeIndex
      : targetNodeIndex;
    const inputOrOutputType = isSourceHandleInferredFromConnection
      ? 'output'
      : 'input';
    const newDuplicateHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      state.nodes[indexOfNodeToUpdateInGroup].data
        .nodeTypeUniqueId as NodeTypeUniqueId,
      state.typeOfNodes,
      { type: inputOrOutputType, index1: 0, index2: undefined },
    );
    const inferredHandle = isSourceHandleInferredFromConnection
      ? sourceHandle
      : targetHandle;
    const handleToAddName = inferredHandle.name;
    const handleToAddDataType =
      inferredHandle.inferredDataType?.dataTypeUniqueId;
    const handleToAddAllowInput =
      inferredHandle.inferredDataType?.dataTypeObject.allowInput;
    const handleToAddMaxConnections =
      inferredHandle.inferredDataType?.dataTypeObject.maxConnections;
    if (!handleToAddName || !handleToAddDataType) {
      return {
        validation: {
          isValid: false,
          reason: 'Handle to add name, data type, or allow input not found',
        },
      };
    }
    if (!newDuplicateHandle) {
      return {
        validation: {
          isValid: false,
          reason: 'New duplicate handle not found',
        },
      };
    }
    insertOrDeleteHandleInNodeDataUsingHandleIndices<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >(
      state.nodes[indexOfNodeToUpdateInGroup].data,
      {
        type: inputOrOutputType,
        index1: -1,
        index2: undefined,
      },
      0,
      newDuplicateHandle,
      true,
      'after',
    );

    addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees(
      unmodifiedState,
      nodeGroup.nodeType,
      {
        name: handleToAddName,
        dataType: handleToAddDataType,
        allowInput: handleToAddAllowInput,
        maxConnections: handleToAddMaxConnections,
      },
      {
        type: isSourceHandleInferredFromConnection ? 'input' : 'output',
        index1: -1,
        index2: undefined,
      },
      'after',
    );
  }

  return {
    validation: { isValid: true },
  };
}

/**
 * Checks if a node is a group input or output node (groupInput or groupOutput)
 *
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @param nodeTypeUniqueId - The node type unique ID to check
 * @returns True if the node is a group input or output node
 */
function isGroupInputOrOutputNode<NodeTypeUniqueId extends string = string>(
  nodeTypeUniqueId: NodeTypeUniqueId,
): boolean {
  return (
    nodeTypeUniqueId === standardNodeTypeNamesMap.groupInput ||
    nodeTypeUniqueId === standardNodeTypeNamesMap.groupOutput
  );
}

export {
  addDuplicateHandleToNodeGroupAfterInference,
  isGroupInputOrOutputNode,
};
