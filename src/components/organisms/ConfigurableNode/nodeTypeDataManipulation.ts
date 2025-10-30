import {
  type SupportedUnderlyingTypes,
  type TypeOfInput,
  type TypeOfNode,
} from '@/utils';
import type { z } from 'zod';
import type { HandleIndices } from './nodeDataManipulation';

/**
 * Get the input or output for a given handle id from the indices
 *
 * This function searches through all inputs (including those within panels) and outputs
 * to find the handle with the specified ID. It handles both regular inputs and inputs
 * within collapsible panels.
 *
 * @param indices - The indices of the handle to get the input or output for
 * @param nodeTypeData - The data of the node type to get the input or output for
 * @returns The input or output for the given handle id, or undefined if not found
 *
 * @example
 * ```tsx
 * const handle = getInputOrOutputFromNodeTypeDataFromIndices(indices, nodeTypeData);
 * if (handle) {
 *   // Do something with the handle
 * }
 * ```
 */
function getInputOrOutputFromNodeTypeDataFromIndices<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  indices: HandleIndices | undefined,
  nodeTypeData: TypeOfNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): TypeOfInput<DataTypeUniqueId> | undefined {
  if (!indices) {
    return undefined;
  }
  if (indices.type === 'input') {
    const inputOrPanel = nodeTypeData?.inputs?.[indices.index1];
    if (!inputOrPanel) {
      return undefined;
    }
    if (indices.index2 !== undefined && 'inputs' in inputOrPanel) {
      return inputOrPanel.inputs?.[indices.index2];
    } else if (indices.index2 === undefined && !('inputs' in inputOrPanel)) {
      return inputOrPanel;
    }
  } else {
    return nodeTypeData?.outputs?.[indices.index1];
  }
  return undefined;
}

function modifyInputsInNodeTypeDataWithoutMutatingUsingHandleIndices<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleIndices: HandleIndices,
  nodeTypeData: TypeOfNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  updates:
    | Partial<TypeOfInput<DataTypeUniqueId>>
    | {
        upsert: true;
        input: TypeOfInput<DataTypeUniqueId>;
      },
): TypeOfNode<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  if (handleIndices.type !== 'input') {
    return nodeTypeData;
  }

  const existingInput: TypeOfInput<DataTypeUniqueId> | undefined =
    getInputOrOutputFromNodeTypeDataFromIndices(handleIndices, nodeTypeData);
  if (!existingInput && !('upsert' in updates)) {
    return nodeTypeData;
  }
  const newInput: TypeOfInput<DataTypeUniqueId> =
    'upsert' in updates
      ? updates.input
      : ({ ...existingInput, ...updates } as TypeOfInput<DataTypeUniqueId>);
  const newInputsArray = [...(nodeTypeData.inputs || [])];

  const inputOrPanel = nodeTypeData?.inputs?.[handleIndices.index1];
  if (!inputOrPanel && !('upsert' in updates)) {
    return nodeTypeData;
  }
  if (
    handleIndices.index2 !== undefined &&
    inputOrPanel &&
    'inputs' in inputOrPanel
  ) {
    const newInputsSubArray = [...(inputOrPanel.inputs || [])];
    newInputsSubArray[handleIndices.index2] = newInput;
    newInputsArray[handleIndices.index1] = {
      ...inputOrPanel,
      inputs: newInputsSubArray,
    };
  } else if (
    handleIndices.index2 === undefined &&
    ('upsert' in updates || (inputOrPanel && !('inputs' in inputOrPanel)))
  ) {
    newInputsArray[handleIndices.index1] = newInput;
  }

  const newNodeTypeData = {
    ...nodeTypeData,
    inputs: newInputsArray,
  };
  return newNodeTypeData;
}

/**
 * Modifies an output value in node type data without mutating the original data
 *
 * This function creates a new node type data object with the specified output updated
 * to have the new value. It handles both regular outputs and outputs within panels,
 * preserving immutability throughout the data structure.
 *
 * @param handleIndices - The indices of the handle to update
 * @param nodeTypeData - The node type data to modify
 * @param updates - The new value to set for the specified output
 * @returns New node type data with the updated output value
 *
 * @example
 * ```tsx
 * const updatedNodeTypeData = modifyOutputsInNodeTypeDataWithoutMutatingUsingHandleIndices(
 *   handleIndices,
 *   nodeTypeData,
 *   'new value'
 * );
 * ```
 */
function modifyOutputsInNodeTypeDataWithoutMutatingUsingHandleIndices<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  handleIndices: HandleIndices,
  nodeTypeData: TypeOfNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  updates:
    | Partial<TypeOfInput<DataTypeUniqueId>>
    | {
        upsert: true;
        output: TypeOfInput<DataTypeUniqueId>;
      },
): TypeOfNode<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  if (handleIndices.type !== 'output') {
    return nodeTypeData;
  }
  const existingOutput: TypeOfInput<DataTypeUniqueId> | undefined =
    getInputOrOutputFromNodeTypeDataFromIndices(handleIndices, nodeTypeData);
  if (!existingOutput && !('upsert' in updates)) {
    return nodeTypeData;
  }
  const newOutput: TypeOfInput<DataTypeUniqueId> =
    'upsert' in updates
      ? updates.output
      : ({ ...existingOutput, ...updates } as TypeOfInput<DataTypeUniqueId>);
  const newOutputsArray = [...(nodeTypeData.outputs || [])];
  newOutputsArray[handleIndices.index1] = newOutput;
  const newNodeTypeData = {
    ...nodeTypeData,
    outputs: newOutputsArray,
  };
  return newNodeTypeData;
}

export {
  modifyInputsInNodeTypeDataWithoutMutatingUsingHandleIndices,
  modifyOutputsInNodeTypeDataWithoutMutatingUsingHandleIndices,
  getInputOrOutputFromNodeTypeDataFromIndices,
};
