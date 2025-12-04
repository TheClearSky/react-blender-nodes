import type { SupportedUnderlyingTypes } from '@/utils';
import type { z } from 'zod';
import {
  getResultantIndexIncludingNegativeIndices,
  handleIteratorIncludingIndices,
} from './handleIterators';
import {
  getHandleFromNodeDataMatchingHandleId,
  getHandleFromNodeDataFromIndices,
} from './handleGetters';
import { produce } from 'immer';
import type { AllTypesOfNodeData, InstantiatedNodeData } from '../nodes/types';
import type { HandleIndices, NonPanelTypesOfHandles } from './types';

function transformHandlesInNodeDataInPlace<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
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
  inPlaceTransformFunction: (
    value:
      | NonPanelTypesOfHandles<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType,
          NonNullable<TypeSupplied['inputs']>
        >
      | NonPanelTypesOfHandles<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType,
          NonNullable<TypeSupplied['outputs']>
        >,
    handleIndices: HandleIndices,
  ) => boolean | void,
  runForInputs = true,
  runForOutputs = true,
) {
  if (runForInputs) {
    const inputs: NonNullable<TypeSupplied['inputs']> =
      nodeData?.inputs instanceof Array ? nodeData?.inputs : [];
    const inputsIterator = handleIteratorIncludingIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof inputs
    >(inputs, 'input');
    inputsIterator.every(({ value, handleIndices }) => {
      if (inPlaceTransformFunction(value, handleIndices) === false) {
        return false;
      }
      return true;
    });
  }
  if (runForOutputs) {
    const outputs: NonNullable<TypeSupplied['outputs']> =
      nodeData?.outputs instanceof Array ? nodeData?.outputs : [];
    const outputsIterator = handleIteratorIncludingIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof outputs
    >(outputs, 'output');
    outputsIterator.forEach(({ value, handleIndices }) => {
      inPlaceTransformFunction(value, handleIndices);
    });
  }
  return nodeData;
}

function updateHandleInNodeDataMatchingHandleId<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
  TypeSupplied extends InstantiatedNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = NonNullable<
    InstantiatedNodeData<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >,
>(
  nodeData: TypeSupplied,
  handleId: string,
  updates: Partial<
    | NonNullable<TypeSupplied['inputs']>[number]
    | NonNullable<TypeSupplied['outputs']>[number]
  >,
  runForInputs = true,
  runForOutputs = true,
  mutate = true,
): TypeSupplied {
  if (mutate) {
    const handle = getHandleFromNodeDataMatchingHandleId<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >(handleId, nodeData, runForInputs, runForOutputs)?.value;
    if (handle) {
      Object.assign(handle, updates);
    }
    return nodeData;
  } else {
    return produce(nodeData, (draft) => {
      const handle = getHandleFromNodeDataMatchingHandleId<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(handleId, draft as TypeSupplied, runForInputs, runForOutputs)?.value;
      if (handle) {
        Object.assign(handle, updates);
      }
      return draft;
    });
  }
}

function updateHandleInNodeDataUsingHandleIndices<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
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
  handleIndices: HandleIndices,
  updates: Partial<
    | NonNullable<TypeSupplied['inputs']>[number]
    | NonNullable<TypeSupplied['outputs']>[number]
  >,
  mutate = true,
) {
  if (mutate) {
    const handle = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      TypeSupplied,
      typeof handleIndices
    >(handleIndices, nodeData)?.value;
    if (handle) {
      Object.assign(handle, updates);
    }

    return nodeData;
  } else {
    return produce(nodeData, (draft) => {
      const handle = getHandleFromNodeDataFromIndices<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType,
        TypeSupplied,
        typeof handleIndices
      >(handleIndices, draft as TypeSupplied)?.value;
      if (handle) {
        Object.assign(handle, updates);
      }
      return draft;
    });
  }
}

function insertOrDeleteHandleInNodeDataUsingHandleIndices<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
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
  handleIndices: HandleIndices,
  deleteCount: number = 0,
  handleToInsert:
    | NonNullable<TypeSupplied['inputs']>[number]
    | NonNullable<TypeSupplied['outputs']>[number],
  mutate = true,
  beforeOrAfterIndex: 'before' | 'after' = 'before',
) {
  if (mutate) {
    const handle = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      TypeSupplied,
      typeof handleIndices
    >(handleIndices, nodeData);
    if (handle) {
      const parentArray: (typeof handleToInsert)[] = handle.parentArray;
      const indexToInsertAt =
        beforeOrAfterIndex === 'before'
          ? getResultantIndexIncludingNegativeIndices(
              handle.parentArrayIndex,
              parentArray.length,
            )
          : getResultantIndexIncludingNegativeIndices(
              handle.parentArrayIndex,
              parentArray.length,
            ) + 1;
      parentArray.splice(indexToInsertAt, deleteCount, handleToInsert);
    }
    return nodeData;
  } else {
    return produce(nodeData, (draft) => {
      const handle = getHandleFromNodeDataFromIndices<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType,
        TypeSupplied,
        typeof handleIndices
      >(handleIndices, draft as TypeSupplied);
      if (handle) {
        const parentArray: (typeof handleToInsert)[] = handle.parentArray;
        const indexToInsertAt =
          beforeOrAfterIndex === 'before'
            ? getResultantIndexIncludingNegativeIndices(
                handle.parentArrayIndex,
                parentArray.length,
              )
            : getResultantIndexIncludingNegativeIndices(
                handle.parentArrayIndex,
                parentArray.length,
              ) + 1;
        parentArray.splice(indexToInsertAt, deleteCount, handleToInsert);
      }
      return draft;
    });
  }
}

export {
  transformHandlesInNodeDataInPlace,
  updateHandleInNodeDataMatchingHandleId,
  updateHandleInNodeDataUsingHandleIndices,
  insertOrDeleteHandleInNodeDataUsingHandleIndices,
};
