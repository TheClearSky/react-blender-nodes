import {
  constructTypeOfHandleFromIndices,
  type DataType,
  type State,
  type SupportedUnderlyingTypes,
} from '@/utils';
import type {
  ConfigurableNodeProps,
  ConfigurableNodeInput,
  ConfigurableNodeInputPanel,
  ConfigurableNodeOutput,
} from './ConfigurableNode';
import type { z } from 'zod';

type HandleIndices =
  | { type: 'input'; index1: number; index2: number | undefined }
  | { type: 'output'; index1: number; index2: undefined };

/**
 * Get the indices of a handle in the node data
 *
 * This function searches through all inputs (including those within panels) and outputs
 * to find the handle with the specified ID. It returns the indices of the handle in the
 * inputs and outputs arrays.
 *
 * @param handleId - The ID of the handle to get the indices for
 * @param nodeData - The node data to get the indices for
 * @returns The indices of the handle in the inputs and outputs arrays
 *
 * @example
 * ```tsx
 * const indices = getHandleIndicesFromNodeData('input-123', nodeData);
 * if (indices) {
 *   // Do something with the indices
 * }
 * ```
 */
function getHandleIndicesFromNodeData<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleId: string,
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
): HandleIndices | undefined {
  const inputs = nodeData?.inputs instanceof Array ? nodeData?.inputs : [];
  const outputs = nodeData?.outputs instanceof Array ? nodeData?.outputs : [];

  const outputIndex = outputs.findIndex((output) => output.id === handleId);
  if (outputIndex !== -1) {
    return { type: 'output', index1: outputIndex, index2: undefined };
  }

  let index2: number | undefined = undefined;
  const inputIndex = inputs.findIndex((input) => {
    //This is an input panel
    if ('inputs' in input) {
      const inPanelIndex = input.inputs.findIndex(
        (input) => input.id === handleId,
      );
      //Found in panel
      if (inPanelIndex !== -1) {
        index2 = inPanelIndex;
        return true;
      }
      return false;
    } else {
      //This is a regular input, normal search continues
      return input.id === handleId;
    }
  });
  if (inputIndex !== -1) {
    return { type: 'input', index1: inputIndex, index2: index2 };
  }

  return undefined;
}

/**
 * Get the input or output for a given handle id from the indices
 *
 * This function searches through all inputs (including those within panels) and outputs
 * to find the handle with the specified ID. It handles both regular inputs and inputs
 * within collapsible panels.
 *
 * @param indices - The indices of the handle to get the input or output for
 * @param nodeData - The data of the node to get the input or output for
 * @returns The input or output for the given handle id, or undefined if not found
 *
 * @example
 * ```tsx
 * const handle = getInputOrOutputFromNodeDataFromIndices(indices, nodeData);
 * if (handle) {
 *   // Do something with the handle
 * }
 * ```
 */
function getInputOrOutputFromNodeDataFromIndices<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  indices: HandleIndices | undefined,
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
):
  | ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  | ConfigurableNodeOutput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  | undefined {
  if (!indices) {
    return undefined;
  }
  if (indices.type === 'input') {
    const inputOrPanel = nodeData?.inputs?.[indices.index1];
    if (!inputOrPanel) {
      return undefined;
    }
    if (indices.index2 !== undefined && 'inputs' in inputOrPanel) {
      return inputOrPanel.inputs?.[indices.index2];
    } else if (indices.index2 === undefined && !('inputs' in inputOrPanel)) {
      return inputOrPanel;
    }
  } else {
    return nodeData?.outputs?.[indices.index1];
  }
  return undefined;
}

/**
 * Get the input or output for a given handle id
 *
 * This function searches through all inputs (including those within panels) and outputs
 * to find the handle with the specified ID. It handles both regular inputs and inputs
 * within collapsible panels.
 *
 * @param handleId - The id of the handle to get the input or output for
 * @param nodeData - The data of the node to get the input or output for
 * @returns The input or output for the given handle id, or undefined if not found
 *
 * @example
 * ```tsx
 * const handle = getInputOrOutputFromNodeData('input-123', nodeData);
 * if (handle) {
 *   // Do something with the handle
 * }
 * ```
 */
function getInputOrOutputFromNodeData<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleId: string,
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
) {
  const indices = getHandleIndicesFromNodeData(handleId, nodeData);
  return getInputOrOutputFromNodeDataFromIndices(indices, nodeData);
}

/**
 * Modifies an array of inputs without mutating the original array
 *
 * This function creates a new array with the specified input updated to have
 * the new value. It preserves immutability by creating new objects for the
 * modified input while keeping other inputs unchanged.
 *
 * @param handleId - The ID of the handle to update
 * @param inputs - Array of inputs to modify
 * @param newValue - The new value to set for the specified input
 * @returns New array with the updated input
 *
 * @example
 * ```tsx
 * const updatedInputs = modifyInputsArrayWithoutMutating(
 *   'input-123',
 *   inputs,
 *   'new value'
 * );
 * ```
 */
function modifyInputsArrayWithoutMutating<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleId: string,
  inputs: ConfigurableNodeInput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >[],
  updates: Partial<
    ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  >,
) {
  return inputs.map((input) => {
    if (input.id === handleId) {
      return { ...input, ...updates };
    }
    return input;
  });
}
/**
 * Modifies an array of outputs without mutating the original array
 *
 * This function creates a new array with the specified output updated to have
 * the new value. It preserves immutability by creating new objects for the
 * modified output while keeping other outputs unchanged.
 *
 * @param handleId - The ID of the handle to update
 * @param outputs - Array of outputs to modify
 * @param updates - The new value to set for the specified output
 * @returns New array with the updated output
 *
 * @example
 * ```tsx
 * const updatedOutputs = modifyOutputsArrayWithoutMutating(
 *   'output-123',
 *   outputs,
 *   'new value'
 * );
 * ```
 */
function modifyOutputsArrayWithoutMutating<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleId: string,
  outputs: ConfigurableNodeOutput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >[],
  updates: Partial<
    ConfigurableNodeOutput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  >,
) {
  return outputs.map((output) => {
    if (output.id === handleId) {
      return { ...output, ...updates };
    }
    return output;
  });
}
/**
 * Modifies either a single input or a panel of inputs without mutating the original
 *
 * This function handles both regular inputs and input panels. For panels, it recursively
 * calls modifyInputsArrayWithoutMutating to update the specific input within the panel.
 * For regular inputs, it directly updates the input if the ID matches.
 *
 * @param handleId - The ID of the handle to update
 * @param inputOrPanel - Either a single input or an input panel
 * @param newValue - The new value to set for the specified input
 * @returns New input or panel with the updated value
 *
 * @example
 * ```tsx
 * const updated = modifyInputsOrPanelWithoutMutating(
 *   'input-123',
 *   inputOrPanel,
 *   'new value'
 * );
 * ```
 */
function modifyInputsOrPanelWithoutMutating<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleId: string,
  inputOrPanel:
    | ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
    | ConfigurableNodeInputPanel<
        UnderlyingType,
        ComplexSchemaType,
        DataTypeUniqueId
      >,
  updates: Partial<
    ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  >,
) {
  return 'inputs' in inputOrPanel
    ? {
        ...inputOrPanel,
        inputs: modifyInputsArrayWithoutMutating(
          handleId,
          inputOrPanel.inputs,
          updates,
        ),
      }
    : inputOrPanel.id === handleId
      ? { ...inputOrPanel, ...updates }
      : inputOrPanel;
}

/**
 * Modifies an input value in node data without mutating the original data
 *
 * This function creates a new node data object with the specified input updated
 * to have the new value. It handles both regular inputs and inputs within panels,
 * preserving immutability throughout the data structure.
 *
 * @param handleId - The ID of the handle to update
 * @param nodeData - The node data to modify
 * @param newValue - The new value to set for the specified input
 * @returns New node data with the updated input value
 *
 * @example
 * ```tsx
 * const updatedNodeData = modifyInputsInNodeDataWithoutMutating(
 *   'input-123',
 *   nodeData,
 *   'new value'
 * );
 * ```
 */
function modifyInputsInNodeDataWithoutMutating<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleId: string,
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
  updates: Partial<
    ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  >,
) {
  const newNodeData = {
    ...nodeData,
    inputs: (nodeData.inputs || []).map((inputOrPanel) => {
      return modifyInputsOrPanelWithoutMutating(
        handleId,
        inputOrPanel,
        updates,
      );
    }),
  };
  return newNodeData;
}

function modifyInputsInNodeDataWithoutMutatingUsingHandleIndices<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleIndices: HandleIndices,
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
  updates: Partial<
    ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  >,
): ConfigurableNodeProps<
  UnderlyingType,
  NodeTypeUniqueId,
  ComplexSchemaType,
  DataTypeUniqueId
> {
  if (handleIndices.type != 'input') {
    return nodeData;
  }

  const existingInput:
    | ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
    | undefined = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(handleIndices, nodeData);
  if (!existingInput) {
    return nodeData;
  }
  const newInput: ConfigurableNodeInput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
    //This holds true as long as a partial update isn't an invalid state
  > = { ...existingInput, ...updates } as ConfigurableNodeInput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >;
  const newInputsArray = [...(nodeData.inputs || [])];

  const inputOrPanel = nodeData?.inputs?.[handleIndices.index1];
  if (!inputOrPanel) {
    return nodeData;
  }
  if (handleIndices.index2 !== undefined && 'inputs' in inputOrPanel) {
    const newInputsSubArray = [...(inputOrPanel.inputs || [])];
    newInputsSubArray[handleIndices.index2] = newInput;
    newInputsArray[handleIndices.index1] = {
      ...inputOrPanel,
      inputs: newInputsSubArray,
    };
  } else if (
    handleIndices.index2 === undefined &&
    !('inputs' in inputOrPanel)
  ) {
    newInputsArray[handleIndices.index1] = newInput;
  }

  const newNodeData = {
    ...nodeData,
    inputs: newInputsArray,
  };
  return newNodeData;
}

/**
 * Modifies an output value in node data without mutating the original data
 *
 * This function creates a new node data object with the specified output updated
 * to have the new value. It handles both regular outputs and outputs within panels,
 * preserving immutability throughout the data structure.
 *
 * @param handleIndices - The indices of the handle to update
 * @param nodeData - The node data to modify
 * @param updates - The new value to set for the specified output
 * @returns New node data with the updated output value
 *
 * @example
 * ```tsx
 * const updatedNodeData = modifyOutputsInNodeDataWithoutMutatingUsingHandleIndices(
 *   handleIndices,
 *   nodeData,
 *   'new value'
 * );
 * ```
 */
function modifyOutputsInNodeDataWithoutMutatingUsingHandleIndices<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleIndices: HandleIndices,
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
  updates: Partial<
    ConfigurableNodeOutput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  >,
): ConfigurableNodeProps<
  UnderlyingType,
  NodeTypeUniqueId,
  ComplexSchemaType,
  DataTypeUniqueId
> {
  if (handleIndices.type != 'output') {
    return nodeData;
  }
  const existingOutput:
    | ConfigurableNodeOutput<
        UnderlyingType,
        ComplexSchemaType,
        DataTypeUniqueId
      >
    | undefined = getInputOrOutputFromNodeDataFromIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(handleIndices, nodeData);
  if (!existingOutput) {
    return nodeData;
  }
  const newOutput: ConfigurableNodeOutput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  > = { ...existingOutput, ...updates };
  const newOutputsArray = [...(nodeData.outputs || [])];
  newOutputsArray[handleIndices.index1] = newOutput;
  const newNodeData = {
    ...nodeData,
    outputs: newOutputsArray,
  };
  return newNodeData;
}

/**
 * Modifies an output value in node data without mutating the original data
 *
 * This function creates a new node data object with the specified output updated
 * to have the new value. It handles both regular outputs and outputs within panels,
 * preserving immutability throughout the data structure.
 */
function modifyOutputsInNodeDataWithoutMutating<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleId: string,
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
  updates: Partial<
    ConfigurableNodeOutput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  >,
) {
  const newNodeData = {
    ...nodeData,
    outputs: modifyOutputsArrayWithoutMutating(
      handleId,
      nodeData.outputs || [],
      updates,
    ),
  };
  return newNodeData;
}
/**
 * Get all inputs from the node data
 *
 * This function returns an array of all inputs from the node data, including those within panels.
 *
 * @param nodeData - The node data to get the inputs from
 * @returns An array of all inputs from the node data and their handle indices
 */
function getAllInputsFromNodeData<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
): {
  input: ConfigurableNodeInput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >;
  handleIndices: HandleIndices;
}[] {
  let returnArray: {
    input: ConfigurableNodeInput<
      UnderlyingType,
      ComplexSchemaType,
      DataTypeUniqueId
    >;
    handleIndices: HandleIndices;
  }[] = [];
  nodeData.inputs?.forEach((input, index) => {
    if ('inputs' in input) {
      input.inputs.forEach((subInput, subIndex) => {
        returnArray.push({
          input: subInput,
          handleIndices: { type: 'input', index1: index, index2: subIndex },
        });
      });
    } else {
      returnArray.push({
        input: input,
        handleIndices: { type: 'input', index1: index, index2: undefined },
      });
    }
  });
  return returnArray;
}

/**
 * Get all outputs from the node data
 *
 * This function returns an array of all outputs from the node data.
 *
 * @param nodeData - The node data to get the outputs from
 * @returns An array of all outputs from the node data and their handle indices
 */
function getAllOutputsFromNodeData<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
): {
  output: ConfigurableNodeOutput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >;
  handleIndices: HandleIndices;
}[] {
  let returnArray: {
    output: ConfigurableNodeOutput<
      UnderlyingType,
      ComplexSchemaType,
      DataTypeUniqueId
    >;
    handleIndices: HandleIndices;
  }[] = [];
  nodeData.outputs?.forEach((output, index) => {
    returnArray.push({
      output: output,
      handleIndices: { type: 'output', index1: index, index2: undefined },
    });
  });
  return returnArray;
}

/**
 * Get all inputs and outputs from the node data
 *
 * This function returns an array of all inputs and outputs from the node data.
 *
 * @param nodeData - The node data to get the inputs and outputs from
 * @returns An object with all inputs and outputs from the node data and their handle indices
 */
function getAllInputsAndOutputsFromNodeData<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
): {
  inputsAndIndices: {
    input: ConfigurableNodeInput<
      UnderlyingType,
      ComplexSchemaType,
      DataTypeUniqueId
    >;
    handleIndices: HandleIndices;
  }[];
  outputsAndIndices: {
    output: ConfigurableNodeOutput<
      UnderlyingType,
      ComplexSchemaType,
      DataTypeUniqueId
    >;
    handleIndices: HandleIndices;
  }[];
} {
  return {
    inputsAndIndices: getAllInputsFromNodeData(nodeData),
    outputsAndIndices: getAllOutputsFromNodeData(nodeData),
  };
}

/**
 * Infer a data type on a handle of indices without mutating the original data
 *
 * This function modifies the node data to have the specified data type on the specified handle.
 * It handles both regular inputs and inputs within panels, preserving immutability throughout the data structure.
 *
 * @param nodeData - The node data to modify
 * @param handleIndices - The handle indices to modify
 * @param dataTypeToInferAs - The data type to infer as
 * @param allDataTypes - The all data types
 * @returns The modified node data
 */
function inferTypeOnHandleOfIndicesWithoutMutating<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
  handleIndices: HandleIndices,
  connectedHandleIndices: HandleIndices,
  dataTypeToInferAsAndTypeOfConnectedNode:
    | {
        dataTypeToInferAs: DataTypeUniqueId;
        connectedNodeType: NodeTypeUniqueId;
        resetInferredType: boolean;
      }
    | undefined,
  allDataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >,
  typeOfNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['typeOfNodes'],
): ConfigurableNodeProps<
  UnderlyingType,
  NodeTypeUniqueId,
  ComplexSchemaType,
  DataTypeUniqueId
> {
  const constructedHandle = dataTypeToInferAsAndTypeOfConnectedNode
    ? constructTypeOfHandleFromIndices(
        allDataTypes,
        dataTypeToInferAsAndTypeOfConnectedNode.connectedNodeType,
        typeOfNodes,
        connectedHandleIndices,
      )
    : undefined;
  let constructedHandleWithoutNameIdAndDataType:
    | Omit<typeof constructedHandle, 'id'>
    | undefined;
  if (constructedHandle) {
    const { id, name, dataType, ...constructedHandleWithoutIdTemp } =
      constructedHandle;
    constructedHandleWithoutNameIdAndDataType = constructedHandleWithoutIdTemp;
  }
  if (handleIndices.type === 'input') {
    return modifyInputsInNodeDataWithoutMutatingUsingHandleIndices<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >(handleIndices, nodeData, {
      inferredDataType:
        dataTypeToInferAsAndTypeOfConnectedNode?.dataTypeToInferAs &&
        !dataTypeToInferAsAndTypeOfConnectedNode.resetInferredType
          ? {
              dataTypeObject:
                allDataTypes[
                  dataTypeToInferAsAndTypeOfConnectedNode.dataTypeToInferAs
                ],
              dataTypeUniqueId:
                dataTypeToInferAsAndTypeOfConnectedNode.dataTypeToInferAs,
            }
          : undefined,
      ...(dataTypeToInferAsAndTypeOfConnectedNode?.dataTypeToInferAs &&
      constructedHandleWithoutNameIdAndDataType
        ? constructedHandleWithoutNameIdAndDataType
        : {}),
    });
  } else {
    return modifyOutputsInNodeDataWithoutMutatingUsingHandleIndices<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >(handleIndices, nodeData, {
      inferredDataType:
        dataTypeToInferAsAndTypeOfConnectedNode?.dataTypeToInferAs &&
        !dataTypeToInferAsAndTypeOfConnectedNode.resetInferredType
          ? {
              dataTypeObject:
                allDataTypes[
                  dataTypeToInferAsAndTypeOfConnectedNode.dataTypeToInferAs
                ],
              dataTypeUniqueId:
                dataTypeToInferAsAndTypeOfConnectedNode.dataTypeToInferAs,
            }
          : undefined,
      ...(dataTypeToInferAsAndTypeOfConnectedNode?.dataTypeToInferAs &&
      constructedHandleWithoutNameIdAndDataType
        ? constructedHandleWithoutNameIdAndDataType
        : {}),
    });
  }
}

function inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  nodeData: ConfigurableNodeProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
  connectedHandleIndices: HandleIndices,
  dataTypeToInferFor: DataTypeUniqueId,
  dataTypeToInferAsAndTypeOfConnectedNode:
    | {
        dataTypeToInferAs: DataTypeUniqueId;
        connectedNodeType: NodeTypeUniqueId;
        resetInferredType: boolean;
      }
    | undefined,
  allDataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >,
  typeOfNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['typeOfNodes'],
): ConfigurableNodeProps<
  UnderlyingType,
  NodeTypeUniqueId,
  ComplexSchemaType,
  DataTypeUniqueId
> {
  const { inputsAndIndices, outputsAndIndices } =
    getAllInputsAndOutputsFromNodeData(nodeData);

  let newNodeData = nodeData;
  for (const inputAndIndex of inputsAndIndices) {
    if (inputAndIndex.input.dataType?.dataTypeUniqueId === dataTypeToInferFor) {
      newNodeData = inferTypeOnHandleOfIndicesWithoutMutating<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(
        newNodeData,
        inputAndIndex.handleIndices,
        connectedHandleIndices,
        dataTypeToInferAsAndTypeOfConnectedNode,
        allDataTypes,
        typeOfNodes,
      );
    }
  }
  for (const outputAndIndex of outputsAndIndices) {
    if (
      outputAndIndex.output.dataType?.dataTypeUniqueId === dataTypeToInferFor
    ) {
      newNodeData = inferTypeOnHandleOfIndicesWithoutMutating<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(
        newNodeData,
        outputAndIndex.handleIndices,
        connectedHandleIndices,
        dataTypeToInferAsAndTypeOfConnectedNode,
        allDataTypes,
        typeOfNodes,
      );
    }
  }
  return newNodeData;
}

export {
  getInputOrOutputFromNodeData,
  modifyInputsInNodeDataWithoutMutating,
  getHandleIndicesFromNodeData,
  getInputOrOutputFromNodeDataFromIndices,
  getAllInputsFromNodeData,
  getAllOutputsFromNodeData,
  getAllInputsAndOutputsFromNodeData,
  inferTypeOnHandleOfIndicesWithoutMutating,
  modifyOutputsInNodeDataWithoutMutating,
  modifyOutputsInNodeDataWithoutMutatingUsingHandleIndices,
  modifyInputsInNodeDataWithoutMutatingUsingHandleIndices,
  inferTypeAcrossTheNodeForHandleOfDataTypeWithoutMutating,
};

export type { HandleIndices };
