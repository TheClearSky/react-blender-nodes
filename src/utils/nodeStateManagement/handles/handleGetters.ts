import { type State, type SupportedUnderlyingTypes } from '@/utils';
import type { z } from 'zod';
import { handleIteratorIncludingIndices } from './handleIterators';
import type {
  HandleAndRelatedInformation,
  HandleAndRelatedInformationWhenNotFound,
  HandleIndices,
} from './types';
import type { AllTypesOfNodeData } from '../nodes/types';

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
 * const indices = getHandleFromNodeDataMatchingHandleId('input-123', nodeData);
 * if (indices) {
 *   // Do something with the indices
 * }
 * ```
 */
function getHandleFromNodeDataMatchingHandleId<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  handleId: string,
  nodeData: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number]['data'],
  runForInputs = true,
  runForOutputs = true,
) {
  if (runForInputs) {
    const inputs = nodeData?.inputs instanceof Array ? nodeData?.inputs : [];
    const inputsIterator = handleIteratorIncludingIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof inputs
    >(inputs, 'input');
    const foundInput = inputsIterator.find(
      ({ value }) => value?.id === handleId,
    );
    if (foundInput) {
      return foundInput;
    }
  }

  if (runForOutputs) {
    const outputs = nodeData?.outputs instanceof Array ? nodeData?.outputs : [];

    const outputsIterator = handleIteratorIncludingIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof outputs
    >(outputs, 'output');

    const foundOutput = outputsIterator.find(
      ({ value }) => value?.id === handleId,
    );
    if (foundOutput) {
      return foundOutput;
    }
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
 * const handle = getHandleFromNodeDataFromIndices(indices, nodeData);
 * if (handle) {
 *   // Do something with the handle
 * }
 * ```
 */
function getHandleFromNodeDataFromIndices<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  TypeSupplied extends AllTypesOfNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = AllTypesOfNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  Indices extends HandleIndices = HandleIndices,
>(
  indices: Indices | undefined,
  nodeData: TypeSupplied,
):
  | HandleAndRelatedInformation<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      NonNullable<TypeSupplied['inputs'] | TypeSupplied['outputs']>
    >
  | HandleAndRelatedInformationWhenNotFound<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      NonNullable<TypeSupplied['inputs'] | TypeSupplied['outputs']>
    >
  | undefined {
  if (!indices) {
    return undefined;
  }

  const inputsOrOutputs =
    indices.type === 'input' ? nodeData.inputs : nodeData.outputs;

  if (!inputsOrOutputs) {
    return undefined;
  }
  const handleIterator = handleIteratorIncludingIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    NonNullable<TypeSupplied['inputs'] | TypeSupplied['outputs']>
  >(inputsOrOutputs, indices.type, {
    index1: indices.index1,
    index2: indices.index2,
  });

  const found = handleIterator.next();
  if (
    found.value &&
    found.value.handleIndices.index1 === indices.index1 &&
    found.value.handleIndices.index2 === indices.index2
  ) {
    return found.value;
  }
  return {
    value: undefined,
    handleIndices: indices,
    parentArray: inputsOrOutputs,
    parentArrayIndex: found.value.parentArrayIndex,
  };
}

function getAllHandlesFromNodeData<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  TypeSupplied extends AllTypesOfNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = AllTypesOfNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
>(
  nodeData: TypeSupplied,
  runForInputs = true,
  runForOutputs = true,
): {
  inputsAndIndices: HandleAndRelatedInformation<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    NonNullable<TypeSupplied['inputs']>
  >[];
  outputsAndIndices: HandleAndRelatedInformation<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    NonNullable<TypeSupplied['outputs']>
  >[];
} {
  let inputsAndIndices: HandleAndRelatedInformation<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    NonNullable<TypeSupplied['inputs']>
  >[] = [];
  let outputsAndIndices: HandleAndRelatedInformation<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    NonNullable<TypeSupplied['outputs']>
  >[] = [];
  if (runForInputs && nodeData.inputs) {
    inputsAndIndices = Array.from(
      handleIteratorIncludingIndices<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType,
        NonNullable<TypeSupplied['inputs']>
      >(nodeData.inputs, 'input'),
    );
  }
  if (runForOutputs && nodeData.outputs) {
    outputsAndIndices = Array.from(
      handleIteratorIncludingIndices<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType,
        NonNullable<TypeSupplied['outputs']>
      >(nodeData.outputs, 'output'),
    );
  }
  return {
    inputsAndIndices,
    outputsAndIndices,
  };
}
export {
  getHandleFromNodeDataMatchingHandleId,
  getHandleFromNodeDataFromIndices,
  getAllHandlesFromNodeData,
};
