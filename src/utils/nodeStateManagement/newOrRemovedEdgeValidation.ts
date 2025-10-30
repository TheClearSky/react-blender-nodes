import type { State, SupportedUnderlyingTypes } from './types';
import type { z } from 'zod';
import {
  type HandleIndices,
  getAllInputsAndOutputsFromNodeData,
  getInputOrOutputFromNodeDataFromIndices,
  inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating,
} from '@/components/organisms/ConfigurableNode/nodeDataManipulation';
import { getConnectedEdges } from '@xyflow/react';
import {
  addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees,
  getResultantDataTypeOfHandleConsideringInferredType,
} from './constructAndModifyHandles';
import { constructTypeOfHandleFromIndices } from './constructAndModifyNodes';

function updateNodeDataWithNewDuplicateOutputHandleWithMutatingState<
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
  nodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'],
) {
  const newDuplicateHandle = constructTypeOfHandleFromIndices(
    state.dataTypes,
    nodes[sourceNodeIndex].data.nodeTypeUniqueId as NodeTypeUniqueId,
    state.typeOfNodes,
    { type: 'output', index1: 0, index2: undefined },
  );
  nodes[sourceNodeIndex] = {
    ...nodes[sourceNodeIndex],
    data: {
      ...nodes[sourceNodeIndex].data,
      outputs: [
        ...(nodes[sourceNodeIndex].data.outputs || []),
        ...(newDuplicateHandle ? [newDuplicateHandle] : []),
      ],
    },
  };
}

function updateNodeDataWithNewDuplicateInputHandleWithMutatingState<
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
  targetNodeIndex: number,
  nodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'],
) {
  const newDuplicateHandle = constructTypeOfHandleFromIndices(
    state.dataTypes,
    nodes[targetNodeIndex].data.nodeTypeUniqueId as NodeTypeUniqueId,
    state.typeOfNodes,
    { type: 'input', index1: 0, index2: undefined },
  );
  nodes[targetNodeIndex] = {
    ...nodes[targetNodeIndex],
    data: {
      ...nodes[targetNodeIndex].data,
      inputs: [
        ...(nodes[targetNodeIndex].data.inputs || []),
        ...(newDuplicateHandle ? [newDuplicateHandle] : []),
      ],
    },
  };
}

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
  groupInputNodeId?: string,
  groupOutputNodeId?: string,
): {
  updatedNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'];
  updatedTypeOfNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['typeOfNodes'];
  validation: ConnectionValidationResult;
} {
  if (!newEdge.sourceHandle || !newEdge.targetHandle) {
    return {
      updatedNodes: state.nodes,
      updatedTypeOfNodes: state.typeOfNodes,
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
      updatedTypeOfNodes: state.typeOfNodes,
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
    sourceHandleDataType.dataTypeObject.underlyingType !==
      'inferFromConnection' &&
    targetHandleDataType.dataTypeObject.underlyingType !== 'inferFromConnection'
  ) {
    return {
      updatedNodes: state.nodes,
      updatedTypeOfNodes: state.typeOfNodes,
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
        updatedTypeOfNodes: state.typeOfNodes,
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
        updatedTypeOfNodes: state.typeOfNodes,
        validation: { isValid: true },
      };
    }
    //One of the handles is inferred, infer the other type
    if (sourceHandleInferredDataType) {
      const updatedNodes = [...state.nodes];
      let updatedTypeOfNodes = { ...state.typeOfNodes };
      updatedNodes[targetNodeIndex] = {
        ...state.nodes[targetNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          state.nodes[targetNodeIndex].data,
          targetHandleDataType.dataTypeUniqueId,
          {
            //Infer as connected node's type + connected handle's INFERRED type
            handle: sourceHandle,
            resetInferredType: false,
            overrideDataType: isTargetNodeGroupOutput,
            overrideName: isTargetNodeGroupOutput,
          },
        ),
      };
      if (isTargetNodeGroupOutput && nodeGroup) {
        //If a target node group's input got inferred, we need to create a duplicate input handle for further connections
        updateNodeDataWithNewDuplicateInputHandleWithMutatingState(
          state,
          targetNodeIndex,
          updatedNodes,
        );
        updatedTypeOfNodes =
          addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees(
            state,
            nodeGroup.nodeType,
            {
              name: sourceHandle.name,
              dataType: sourceHandleInferredDataType.dataTypeUniqueId,
              allowInput:
                sourceHandle.inferredDataType?.dataTypeObject.allowInput,
            },
            {
              type: 'output',
              index1: targetHandleIndex.index1,
              index2: undefined,
            },
          ).typeOfNodes;
      }
      return {
        updatedNodes,
        updatedTypeOfNodes,
        validation: { isValid: true },
      };
    }
    if (targetHandleInferredDataType) {
      const updatedNodes = [...state.nodes];
      let updatedTypeOfNodes = { ...state.typeOfNodes };
      updatedNodes[sourceNodeIndex] = {
        ...state.nodes[sourceNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          state.nodes[sourceNodeIndex].data,
          sourceHandleDataType.dataTypeUniqueId,
          {
            //Infer as connected node's type + connected handle's INFERRED type
            handle: targetHandle,
            resetInferredType: false,
            overrideDataType: isSourceNodeGroupInput,
            overrideName: isSourceNodeGroupInput,
          },
        ),
      };
      if (isSourceNodeGroupInput && nodeGroup) {
        //If a source node group's output got inferred, we need to create a duplicate output handle for further connections
        updateNodeDataWithNewDuplicateOutputHandleWithMutatingState(
          state,
          sourceNodeIndex,
          updatedNodes,
        );
        updatedTypeOfNodes =
          addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees(
            state,
            nodeGroup.nodeType,
            {
              name: targetHandle.name,
              dataType: targetHandleInferredDataType.dataTypeUniqueId,
              allowInput:
                targetHandle.inferredDataType?.dataTypeObject.allowInput,
            },
            {
              type: 'input',
              index1: sourceHandleIndex.index1,
              index2: undefined,
            },
          ).typeOfNodes;
      }
      return {
        updatedNodes,
        updatedTypeOfNodes: updatedTypeOfNodes,
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
        updatedTypeOfNodes: state.typeOfNodes,
        validation: { isValid: true },
      };
    }
    //Not inferred, infer
    const updatedNodes = [...state.nodes];
    let updatedTypeOfNodes = { ...state.typeOfNodes };
    updatedNodes[sourceNodeIndex] = {
      ...state.nodes[sourceNodeIndex],
      data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(
        state.nodes[sourceNodeIndex].data,
        sourceHandleDataType.dataTypeUniqueId,
        //Infer as connected node's type + connected handle's NON-INFERRED type
        {
          handle: targetHandle,
          resetInferredType: false,
          overrideDataType: isSourceNodeGroupInput,
          overrideName: isSourceNodeGroupInput,
        },
      ),
    };
    if (isSourceNodeGroupInput && nodeGroup) {
      //If a source node group's output got inferred, we need to create a duplicate output handle for further connections
      updateNodeDataWithNewDuplicateOutputHandleWithMutatingState(
        state,
        sourceNodeIndex,
        updatedNodes,
      );
      updatedTypeOfNodes =
        addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees(
          state,
          nodeGroup.nodeType,
          {
            name: targetHandle.name,
            dataType: targetHandleDataType.dataTypeUniqueId,
            allowInput: targetHandleDataType.dataTypeObject.allowInput,
          },
          {
            type: 'input',
            index1: sourceHandleIndex.index1,
            index2: undefined,
          },
        ).typeOfNodes;
    }
    return {
      updatedNodes,
      updatedTypeOfNodes: updatedTypeOfNodes,
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
        updatedTypeOfNodes: state.typeOfNodes,
        validation: { isValid: true },
      };
    }
    //Not inferred, infer
    const updatedNodes = [...state.nodes];
    let updatedTypeOfNodes = { ...state.typeOfNodes };
    updatedNodes[targetNodeIndex] = {
      ...state.nodes[targetNodeIndex],
      data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(
        state.nodes[targetNodeIndex].data,
        targetHandleDataType.dataTypeUniqueId,
        {
          //Infer as connected node's type + connected handle's NON-INFERRED type
          handle: sourceHandle,
          resetInferredType: false,
          overrideDataType: isTargetNodeGroupOutput,
          overrideName: isTargetNodeGroupOutput,
        },
      ),
    };
    if (isTargetNodeGroupOutput && nodeGroup) {
      //If a target node group's input got inferred, we need to create a duplicate input handle for further connections
      updateNodeDataWithNewDuplicateInputHandleWithMutatingState(
        state,
        targetNodeIndex,
        updatedNodes,
      );
      updatedTypeOfNodes =
        addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees(
          state,
          nodeGroup.nodeType,
          {
            name: sourceHandle.name,
            dataType: sourceHandleDataType.dataTypeUniqueId,
            allowInput: sourceHandleDataType.dataTypeObject.allowInput,
          },
          {
            type: 'output',
            index1: targetHandleIndex.index1,
            index2: undefined,
          },
        ).typeOfNodes;
    }
    return {
      updatedNodes,
      updatedTypeOfNodes: updatedTypeOfNodes,
      validation: { isValid: true },
    };
  }

  return {
    updatedNodes: state.nodes,
    updatedTypeOfNodes: state.typeOfNodes,
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
      updatedNodes = [...updatedNodes];
      updatedNodes[sourceNodeIndex] = {
        ...updatedNodes[sourceNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
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
      updatedNodes = [...updatedNodes];
      updatedNodes[targetNodeIndex] = {
        ...updatedNodes[targetNodeIndex],
        data: inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
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
