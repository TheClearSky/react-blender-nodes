import type { State, SupportedUnderlyingTypes } from './types';
import type { z } from 'zod';
import type {
  HandleIndices,
  InstantiatedNonPanelTypesOfHandles,
} from './handles/types';
import { getConnectedEdges } from '@xyflow/react';
import {
  addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees,
  getResultantDataTypeOfHandleConsideringInferredType,
} from './constructAndModifyHandles';
import { constructTypeOfHandleFromIndices } from './nodes/constructAndModifyNodes';
import {
  getAllHandlesFromNodeData,
  getHandleFromNodeDataFromIndices,
} from './handles/handleGetters';
import { inferTypeAcrossTheNodeForHandleOfDataType } from './edges/typeInference';
import { insertOrDeleteHandleInNodeDataUsingHandleIndices } from './handles/handleSetters';

/**
 * Type for connection validation result
 */
export type ConnectionValidationResult = {
  isValid: boolean;
  reason?: string;
};

function inferTypesAfterEdgeAddition<
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
  unmodifiedState: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): {
  validation: ConnectionValidationResult;
} {
  if (!newEdge.sourceHandle || !newEdge.targetHandle) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target handle not found',
      },
    };
  }

  const sourceNodeData = state.nodes[sourceNodeIndex].data;
  const targetNodeData = state.nodes[targetNodeIndex].data;

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
    return {
      validation: {
        isValid: false,
        reason: 'Source or target handle data type not found',
      },
    };
  }

  const isSourceNodeGroupInput =
    Boolean(groupInputNodeId) && newEdge.source === groupInputNodeId;
  const isTargetNodeGroupOutput =
    Boolean(groupOutputNodeId) && newEdge.target === groupOutputNodeId;
  const nodeGroup =
    state.openedNodeGroupStack?.[state.openedNodeGroupStack.length - 1];

  //No inference needed, none are infer types
  if (
    !isSourceHandleInferredFromConnection &&
    !isTargetHandleInferredFromConnection
  ) {
    return {
      validation: { isValid: true },
    };
  }

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
  let resetInferredType: boolean = false;
  let overrideDataType: boolean = false;
  let overrideName: boolean = false;

  //Both are infer types
  if (
    isSourceHandleInferredFromConnection &&
    isTargetHandleInferredFromConnection
  ) {
    //None of the handles are inferred, impossible to infer
    if (!sourceHandleInferredDataType && !targetHandleInferredDataType) {
      return {
        validation: {
          isValid: false,
          reason:
            'None of the handles are inferred, inference has no information to work with',
        },
      };
    }
    //Both of the handles are inferred, no inference needed
    //(checking type compatibility is not job of inference, will be done in a separate step)
    else if (sourceHandleInferredDataType && targetHandleInferredDataType) {
      return {
        validation: { isValid: true },
      };
    }
    //One of the handles is inferred, infer the other type
    else if (sourceHandleInferredDataType) {
      indexOfNodeToUpdate = targetNodeIndex;
      dataTypeToInferFor = targetHandleDataType.dataTypeUniqueId;
      connectedHandle = sourceHandle;
      resetInferredType = false;
      overrideDataType = isTargetNodeGroupOutput;
      overrideName = isTargetNodeGroupOutput;
    } else if (targetHandleInferredDataType) {
      indexOfNodeToUpdate = sourceNodeIndex;
      dataTypeToInferFor = sourceHandleDataType.dataTypeUniqueId;
      connectedHandle = targetHandle;
      resetInferredType = false;
      overrideDataType = isSourceNodeGroupInput;
      overrideName = isSourceNodeGroupInput;
    }
  }
  //One of the handles is infer type, infer if needed
  else if (isSourceHandleInferredFromConnection) {
    //Already inferred
    if (sourceHandleInferredDataType) {
      return {
        validation: { isValid: true },
      };
    }
    //Not inferred, infer
    indexOfNodeToUpdate = sourceNodeIndex;
    dataTypeToInferFor = sourceHandleDataType.dataTypeUniqueId;
    connectedHandle = targetHandle;
    resetInferredType = false;
    overrideDataType = isSourceNodeGroupInput;
    overrideName = isSourceNodeGroupInput;
  } else if (isTargetHandleInferredFromConnection) {
    //Already inferred
    if (targetHandleInferredDataType) {
      return {
        validation: { isValid: true },
      };
    }
    //Not inferred, infer
    indexOfNodeToUpdate = targetNodeIndex;
    dataTypeToInferFor = targetHandleDataType.dataTypeUniqueId;
    connectedHandle = sourceHandle;
    resetInferredType = false;
    overrideDataType = isTargetNodeGroupOutput;
    overrideName = isTargetNodeGroupOutput;
  }

  if (
    indexOfNodeToUpdate === undefined ||
    dataTypeToInferFor === undefined ||
    connectedHandle === undefined
  ) {
    return {
      validation: {
        isValid: false,
        reason:
          'Index of node to update, data type to infer for, or connected handle not found',
      },
    };
  }

  inferTypeAcrossTheNodeForHandleOfDataType<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >(state.nodes[indexOfNodeToUpdate].data, dataTypeToInferFor, {
    //Infer as connected node's type + connected handle's NON-INFERRED type
    handle: connectedHandle,
    resetInferredType: resetInferredType,
    overrideDataType: overrideDataType,
    overrideName: overrideName,
  });
  //!== is basically xor for boolean, we are checking if one is true and the other is false
  //Since we should only do this if one of them is an end connection
  //There can never be an infer connection straight from group input to group output, because information is missing
  if (
    nodeGroup &&
    (isSourceHandleInferredFromConnection && isSourceNodeGroupInput) !==
      (isTargetHandleInferredFromConnection && isTargetNodeGroupOutput)
  ) {
    const indexOfNodeToUpdateInGroup = isTargetNodeGroupOutput
      ? targetNodeIndex
      : sourceNodeIndex;
    const inputOrOutputType = isTargetNodeGroupOutput ? 'input' : 'output';
    //If an output or input node group's output or input got inferred, we need to create a duplicate output or input handle for further connections
    const newDuplicateHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      state.nodes[indexOfNodeToUpdateInGroup].data
        .nodeTypeUniqueId as NodeTypeUniqueId,
      state.typeOfNodes,
      { type: inputOrOutputType, index1: 0, index2: undefined },
    );
    const handleToAddName = isTargetNodeGroupOutput
      ? targetHandle.name
      : sourceHandle.name;
    const handleToAddDataType = isTargetNodeGroupOutput
      ? targetHandle.inferredDataType?.dataTypeUniqueId
      : sourceHandle.inferredDataType?.dataTypeUniqueId;
    const handleToAddAllowInput = isTargetNodeGroupOutput
      ? targetHandle.inferredDataType?.dataTypeObject.allowInput
      : sourceHandle.inferredDataType?.dataTypeObject.allowInput;
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
      },
      {
        type: isTargetNodeGroupOutput ? 'output' : 'input',
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

function checkComplexTypeCompatibilityAfterEdgeAddition<
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
  sourceHandleIndex: HandleIndices,
  targetHandleIndex: HandleIndices,
  newEdge: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'][number],
): {
  validation: ConnectionValidationResult;
} {
  if (!newEdge.sourceHandle || !newEdge.targetHandle) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target handle not found',
      },
    };
  }

  const sourceNodeData = state.nodes[sourceNodeIndex].data;
  const targetNodeData = state.nodes[targetNodeIndex].data;

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

  const resultantSourceHandleDataType =
    getResultantDataTypeOfHandleConsideringInferredType(sourceHandle);
  const resultantTargetHandleDataType =
    getResultantDataTypeOfHandleConsideringInferredType(targetHandle);

  if (!resultantSourceHandleDataType || !resultantTargetHandleDataType) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target handle data type not found',
      },
    };
  }

  const isSourceHandleComplex =
    resultantSourceHandleDataType?.dataTypeObject.underlyingType === 'complex';
  const isTargetHandleComplex =
    resultantTargetHandleDataType?.dataTypeObject.underlyingType === 'complex';

  //No compatibility check needed, none are complex types
  if (!isSourceHandleComplex && !isTargetHandleComplex) {
    return {
      validation: { isValid: true },
    };
  }

  //One of them is complex, one is not
  if (
    //!== is basically xor for boolean
    isSourceHandleComplex !== isTargetHandleComplex
  ) {
    return {
      validation: {
        isValid: false,
        reason: "Can't connect complex types with non-complex types",
      },
    };
  }

  //Both are complex
  if (isSourceHandleComplex && isTargetHandleComplex) {
    //Check if they are the same type
    //Either the data types are exactly the same, or the complex schemas are exactly the same
    const areTheComplexTypesSame =
      resultantSourceHandleDataType.dataTypeUniqueId ===
        resultantTargetHandleDataType.dataTypeUniqueId ||
      JSON.stringify(
        resultantSourceHandleDataType.dataTypeObject.complexSchema,
      ) ===
        JSON.stringify(
          resultantTargetHandleDataType.dataTypeObject.complexSchema,
        );
    if (!areTheComplexTypesSame) {
      return {
        validation: {
          isValid: false,
          reason: "Can't connect complex types with different types",
        },
      };
    }
    return {
      validation: { isValid: true },
    };
  }

  return {
    validation: { isValid: true },
  };
}

function checkTypeConversionCompatibilityAfterEdgeAddition<
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
  sourceHandleIndex: HandleIndices,
  targetHandleIndex: HandleIndices,
  newEdge: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'][number],
): {
  validation: ConnectionValidationResult;
} {
  if (!newEdge.sourceHandle || !newEdge.targetHandle) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target handle not found',
      },
    };
  }

  const sourceNodeData = state.nodes[sourceNodeIndex].data;
  const targetNodeData = state.nodes[targetNodeIndex].data;

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

  const resultantSourceHandleDataType =
    getResultantDataTypeOfHandleConsideringInferredType(sourceHandle);
  const resultantTargetHandleDataType =
    getResultantDataTypeOfHandleConsideringInferredType(targetHandle);

  if (!resultantSourceHandleDataType || !resultantTargetHandleDataType) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target handle data type not found',
      },
    };
  }

  const areTheTypesTheSame =
    resultantSourceHandleDataType.dataTypeUniqueId ===
    resultantTargetHandleDataType.dataTypeUniqueId;

  if (areTheTypesTheSame) {
    return {
      validation: { isValid: true },
    };
  }

  const isConversionExplicitlyAllowed =
    state.allowedConversionsBetweenDataTypes?.[
      resultantSourceHandleDataType.dataTypeUniqueId
    ]?.[resultantTargetHandleDataType.dataTypeUniqueId];

  const areBothComplex =
    resultantSourceHandleDataType.dataTypeObject.underlyingType === 'complex' &&
    resultantTargetHandleDataType.dataTypeObject.underlyingType === 'complex';

  const isConversionSupported =
    isConversionExplicitlyAllowed ||
    (areBothComplex &&
      state.allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking);

  if (!isConversionSupported) {
    return {
      validation: {
        isValid: false,
        reason: `${resultantSourceHandleDataType.dataTypeUniqueId} to ${resultantTargetHandleDataType.dataTypeUniqueId} conversion is not allowed`,
      },
    };
  }

  return {
    validation: { isValid: true },
  };
}

function inferTypesAfterEdgeRemoval<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: Pick<
    State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    'nodes' | 'edges' | 'dataTypes' | 'typeOfNodes'
  >,
  sourceNodeIndex: number,
  targetNodeIndex: number,
  sourceHandleIndex: HandleIndices,
  targetHandleIndex: HandleIndices,
  removedEdge: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'][number],
): {
  updatedNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'];
  validation: ConnectionValidationResult;
} {
  const sourceNode = state.nodes[sourceNodeIndex];
  const targetNode = state.nodes[targetNodeIndex];

  const sourceHandle = getHandleFromNodeDataFromIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof sourceNode.data,
    typeof sourceHandleIndex
  >(sourceHandleIndex, sourceNode.data)?.value;
  const targetHandle = getHandleFromNodeDataFromIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof targetNode.data,
    typeof targetHandleIndex
  >(targetHandleIndex, targetNode.data)?.value;

  const sourceHandleDataType = sourceHandle?.dataType;
  const targetHandleDataType = targetHandle?.dataType;

  if (!sourceHandleDataType || !targetHandleDataType) {
    return {
      updatedNodes: state.nodes,
      validation: {
        isValid: false,
        reason: 'Source or target handle data type not found',
      },
    };
  }

  //No inference needed, none are infer types
  if (
    sourceHandleDataType.dataTypeObject.underlyingType !==
      'inferFromConnection' &&
    targetHandleDataType.dataTypeObject.underlyingType !== 'inferFromConnection'
  ) {
    return {
      updatedNodes: state.nodes,
      validation: { isValid: true },
    };
  }

  let updatedNodes = state.nodes;

  if (
    sourceHandleDataType.dataTypeObject.underlyingType === 'inferFromConnection'
  ) {
    const connectedSourceEdges = getConnectedEdges([sourceNode], state.edges);
    const { inputsAndIndices, outputsAndIndices } = getAllHandlesFromNodeData<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof sourceNode.data
    >(sourceNode.data);
    const mapOfHandlesOfThisDataType: Record<string, boolean> = {};
    for (const inputAndIndex of inputsAndIndices) {
      if (
        inputAndIndex.value.dataType?.dataTypeUniqueId ===
        sourceHandleDataType.dataTypeUniqueId
      ) {
        mapOfHandlesOfThisDataType[inputAndIndex.value.id] = true;
      }
    }
    for (const outputAndIndex of outputsAndIndices) {
      if (
        outputAndIndex.value.dataType?.dataTypeUniqueId ===
        sourceHandleDataType.dataTypeUniqueId
      ) {
        mapOfHandlesOfThisDataType[outputAndIndex.value.id] = true;
      }
    }

    let isAnyOneOfThemConnected = false;

    for (const connectedEdge of connectedSourceEdges) {
      if (connectedEdge.id === removedEdge.id) {
        continue;
      }
      if (!connectedEdge.sourceHandle || !connectedEdge.targetHandle) {
        continue;
      }
      if (mapOfHandlesOfThisDataType[connectedEdge.sourceHandle]) {
        isAnyOneOfThemConnected = true;
        break;
      }
      if (mapOfHandlesOfThisDataType[connectedEdge.targetHandle]) {
        isAnyOneOfThemConnected = true;
        break;
      }
    }

    if (!isAnyOneOfThemConnected) {
      //Reset inferred type
      updatedNodes = [...updatedNodes];
      updatedNodes[sourceNodeIndex] = {
        ...updatedNodes[sourceNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataType<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          updatedNodes[sourceNodeIndex].data,
          sourceHandleDataType.dataTypeUniqueId,
          {
            //RESET INFERRED TYPE as original handle
            handle: constructTypeOfHandleFromIndices(
              state.dataTypes,
              updatedNodes[sourceNodeIndex].data
                .nodeTypeUniqueId as NodeTypeUniqueId,
              state.typeOfNodes,
              sourceHandleIndex,
            ),
            resetInferredType: true,
          },
        ),
      };
    }
  }
  if (
    targetHandleDataType.dataTypeObject.underlyingType === 'inferFromConnection'
  ) {
    const connectedTargetEdges = getConnectedEdges([targetNode], state.edges);
    const { inputsAndIndices, outputsAndIndices } = getAllHandlesFromNodeData<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof targetNode.data
    >(targetNode.data);
    const mapOfHandlesOfThisDataType: Record<string, boolean> = {};
    for (const inputAndIndex of inputsAndIndices) {
      if (
        inputAndIndex.value.dataType?.dataTypeUniqueId ===
        targetHandleDataType.dataTypeUniqueId
      ) {
        mapOfHandlesOfThisDataType[inputAndIndex.value.id] = true;
      }
    }
    for (const outputAndIndex of outputsAndIndices) {
      if (
        outputAndIndex.value.dataType?.dataTypeUniqueId ===
        targetHandleDataType.dataTypeUniqueId
      ) {
        mapOfHandlesOfThisDataType[outputAndIndex.value.id] = true;
      }
    }

    let isAnyOneOfThemConnected = false;

    for (const connectedEdge of connectedTargetEdges) {
      if (connectedEdge.id === removedEdge.id) {
        continue;
      }
      if (!connectedEdge.sourceHandle || !connectedEdge.targetHandle) {
        continue;
      }
      if (mapOfHandlesOfThisDataType[connectedEdge.sourceHandle]) {
        isAnyOneOfThemConnected = true;
        break;
      }
      if (mapOfHandlesOfThisDataType[connectedEdge.targetHandle]) {
        isAnyOneOfThemConnected = true;
        break;
      }
    }

    if (!isAnyOneOfThemConnected) {
      //Reset inferred type
      updatedNodes = [...updatedNodes];
      updatedNodes[targetNodeIndex] = {
        ...updatedNodes[targetNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataType<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          updatedNodes[targetNodeIndex].data,
          targetHandleDataType.dataTypeUniqueId,
          {
            //RESET INFERRED TYPE as original handle
            handle: constructTypeOfHandleFromIndices(
              state.dataTypes,
              updatedNodes[targetNodeIndex].data
                .nodeTypeUniqueId as NodeTypeUniqueId,
              state.typeOfNodes,
              targetHandleIndex,
            ),
            resetInferredType: true,
          },
        ),
      };
    }
  }
  return {
    updatedNodes,
    validation: { isValid: true },
  };
}

export {
  inferTypesAfterEdgeAddition,
  inferTypesAfterEdgeRemoval,
  checkComplexTypeCompatibilityAfterEdgeAddition,
  checkTypeConversionCompatibilityAfterEdgeAddition,
};
