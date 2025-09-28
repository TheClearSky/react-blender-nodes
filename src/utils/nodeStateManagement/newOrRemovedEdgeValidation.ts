import type { State, SupportedUnderlyingTypes } from './types';
import type { z } from 'zod';
import {
  type HandleIndices,
  getAllInputsAndOutputsFromNodeData,
  getInputOrOutputFromNodeDataFromIndices,
  inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating,
} from '@/components/organisms/ConfigurableNode/nodeDataManipulation';
import { getConnectedEdges } from '@xyflow/react';
import { getResultantDataTypeOfHandleConsideringInferredType } from './constructAndModifyHandles';

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
): {
  updatedNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'];
  validation: ConnectionValidationResult;
} {
  if (!newEdge.sourceHandle || !newEdge.targetHandle) {
    return {
      updatedNodes: state.nodes,
      validation: {
        isValid: false,
        reason: 'Source or target handle not found',
      },
    };
  }

  const sourceHandle = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(sourceHandleIndex, state.nodes[sourceNodeIndex].data);
  const targetHandle = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(targetHandleIndex, state.nodes[targetNodeIndex].data);

  const sourceHandleDataType = sourceHandle?.dataType;
  const targetHandleDataType = targetHandle?.dataType;
  const sourceHandleInferredDataType = sourceHandle?.inferredDataType;
  const targetHandleInferredDataType = targetHandle?.inferredDataType;

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

  //Both are infer types
  if (
    sourceHandleDataType.dataTypeObject.underlyingType ===
      'inferFromConnection' &&
    targetHandleDataType.dataTypeObject.underlyingType === 'inferFromConnection'
  ) {
    //None of the handles are inferred, impossible to infer
    if (!sourceHandleInferredDataType && !targetHandleInferredDataType) {
      return {
        updatedNodes: state.nodes,
        validation: {
          isValid: false,
          reason:
            'None of the handles are inferred, inference has no information to work with',
        },
      };
    }
    //Both of the handles are inferred, no inference needed
    //(checking type compatibility is not job of inference, will be done in a separate step)
    if (sourceHandleInferredDataType && targetHandleInferredDataType) {
      return {
        updatedNodes: state.nodes,
        validation: { isValid: true },
      };
    }
    //One of the handles is inferred, infer the other type
    if (sourceHandleInferredDataType) {
      const updatedNodes = [...state.nodes];
      updatedNodes[targetNodeIndex] = {
        ...state.nodes[targetNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          state.nodes[targetNodeIndex].data,
          sourceHandleIndex,
          sourceHandleDataType.dataTypeUniqueId,
          //Infer as connected node's type + connected handle's INFERRED type
          {
            dataTypeToInferAs: sourceHandleInferredDataType.dataTypeUniqueId,
            connectedNodeType: state.nodes[sourceNodeIndex].data
              .nodeTypeUniqueId as NodeTypeUniqueId,
            resetInferredType: false,
          },
          state.dataTypes,
          state.typeOfNodes,
        ),
      };
      return {
        updatedNodes,
        validation: { isValid: true },
      };
    }
    if (targetHandleInferredDataType) {
      const updatedNodes = [...state.nodes];
      updatedNodes[sourceNodeIndex] = {
        ...state.nodes[sourceNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          state.nodes[sourceNodeIndex].data,
          targetHandleIndex,
          targetHandleDataType.dataTypeUniqueId,
          //Infer as connected node's type + connected handle's INFERRED type
          {
            dataTypeToInferAs: targetHandleInferredDataType.dataTypeUniqueId,
            connectedNodeType: state.nodes[targetNodeIndex].data
              .nodeTypeUniqueId as NodeTypeUniqueId,
            resetInferredType: false,
          },
          state.dataTypes,
          state.typeOfNodes,
        ),
      };
      return {
        updatedNodes,
        validation: { isValid: true },
      };
    }
  }
  //One of the handles is infer type, infer if needed
  if (
    sourceHandleDataType.dataTypeObject.underlyingType === 'inferFromConnection'
  ) {
    //Already inferred
    if (sourceHandleInferredDataType) {
      return {
        updatedNodes: state.nodes,
        validation: { isValid: true },
      };
    }
    //Not inferred, infer
    const updatedNodes = [...state.nodes];
    updatedNodes[sourceNodeIndex] = {
      ...state.nodes[sourceNodeIndex],
      data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(
        state.nodes[sourceNodeIndex].data,
        targetHandleIndex,
        sourceHandleDataType.dataTypeUniqueId,
        //Infer as connected node's type + connected handle's NON-INFERRED type
        {
          dataTypeToInferAs: targetHandleDataType.dataTypeUniqueId,
          connectedNodeType: state.nodes[targetNodeIndex].data
            .nodeTypeUniqueId as NodeTypeUniqueId,
          resetInferredType: false,
        },
        state.dataTypes,
        state.typeOfNodes,
      ),
    };
    return {
      updatedNodes,
      validation: { isValid: true },
    };
  }
  if (
    targetHandleDataType.dataTypeObject.underlyingType === 'inferFromConnection'
  ) {
    //Already inferred
    if (targetHandleInferredDataType) {
      return {
        updatedNodes: state.nodes,
        validation: { isValid: true },
      };
    }
    //Not inferred, infer
    const updatedNodes = [...state.nodes];
    updatedNodes[targetNodeIndex] = {
      ...state.nodes[targetNodeIndex],
      data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(
        state.nodes[targetNodeIndex].data,
        sourceHandleIndex,
        targetHandleDataType.dataTypeUniqueId,
        //Infer as connected node's type + connected handle's NON-INFERRED type
        {
          dataTypeToInferAs: sourceHandleDataType.dataTypeUniqueId,
          connectedNodeType: state.nodes[sourceNodeIndex].data
            .nodeTypeUniqueId as NodeTypeUniqueId,
          resetInferredType: false,
        },
        state.dataTypes,
        state.typeOfNodes,
      ),
    };
    return {
      updatedNodes,
      validation: { isValid: true },
    };
  }

  return {
    updatedNodes: state.nodes,
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

  const sourceHandle = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(sourceHandleIndex, state.nodes[sourceNodeIndex].data);
  const targetHandle = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(targetHandleIndex, state.nodes[targetNodeIndex].data);

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

  const sourceHandle = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(sourceHandleIndex, state.nodes[sourceNodeIndex].data);
  const targetHandle = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(targetHandleIndex, state.nodes[targetNodeIndex].data);

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

  const sourceHandle = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(sourceHandleIndex, sourceNode.data);
  const targetHandle = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(targetHandleIndex, targetNode.data);

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
    const { inputsAndIndices, outputsAndIndices } =
      getAllInputsAndOutputsFromNodeData(sourceNode.data);
    const mapOfHandlesOfThisDataType: Record<string, boolean> = {};
    for (const inputAndIndex of inputsAndIndices) {
      if (
        inputAndIndex.input.dataType?.dataTypeUniqueId ===
        sourceHandleDataType.dataTypeUniqueId
      ) {
        mapOfHandlesOfThisDataType[inputAndIndex.input.id] = true;
      }
    }
    for (const outputAndIndex of outputsAndIndices) {
      if (
        outputAndIndex.output.dataType?.dataTypeUniqueId ===
        sourceHandleDataType.dataTypeUniqueId
      ) {
        mapOfHandlesOfThisDataType[outputAndIndex.output.id] = true;
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
      updatedNodes = [...state.nodes];
      updatedNodes[sourceNodeIndex] = {
        ...state.nodes[sourceNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          state.nodes[sourceNodeIndex].data,
          sourceHandleIndex,
          sourceHandleDataType.dataTypeUniqueId,
          //RESET INFERRED TYPE
          {
            dataTypeToInferAs: sourceHandleDataType.dataTypeUniqueId,
            connectedNodeType: state.nodes[sourceNodeIndex].data
              .nodeTypeUniqueId as NodeTypeUniqueId,
            resetInferredType: true,
          },
          state.dataTypes,
          state.typeOfNodes,
        ),
      };
    }
  }
  if (
    targetHandleDataType.dataTypeObject.underlyingType === 'inferFromConnection'
  ) {
    const connectedTargetEdges = getConnectedEdges([targetNode], state.edges);
    const { inputsAndIndices, outputsAndIndices } =
      getAllInputsAndOutputsFromNodeData(targetNode.data);
    const mapOfHandlesOfThisDataType: Record<string, boolean> = {};
    for (const inputAndIndex of inputsAndIndices) {
      if (
        inputAndIndex.input.dataType?.dataTypeUniqueId ===
        targetHandleDataType.dataTypeUniqueId
      ) {
        mapOfHandlesOfThisDataType[inputAndIndex.input.id] = true;
      }
    }
    for (const outputAndIndex of outputsAndIndices) {
      if (
        outputAndIndex.output.dataType?.dataTypeUniqueId ===
        targetHandleDataType.dataTypeUniqueId
      ) {
        mapOfHandlesOfThisDataType[outputAndIndex.output.id] = true;
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
      updatedNodes = [...state.nodes];
      updatedNodes[targetNodeIndex] = {
        ...state.nodes[targetNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          state.nodes[targetNodeIndex].data,
          targetHandleIndex,
          targetHandleDataType.dataTypeUniqueId,
          //RESET INFERRED TYPE
          {
            dataTypeToInferAs: targetHandleDataType.dataTypeUniqueId,
            connectedNodeType: state.nodes[targetNodeIndex].data
              .nodeTypeUniqueId as NodeTypeUniqueId,
            resetInferredType: true,
          },
          state.dataTypes,
          state.typeOfNodes,
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
