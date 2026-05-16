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
import type {
  HandleIndices,
  AllTypesOfHandles,
  NonPanelTypesOfHandles,
} from './types';
import { ensureUniqueHandleName } from './ensureUniqueHandleName';

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
    return produce(nodeData, (draft: typeof nodeData) => {
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
    return produce(nodeData, (draft: typeof nodeData) => {
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

/**
 * Collects all existing handle names for a given direction ('input' or 'output')
 * from a node's data, flattening panels via the handle iterator.
 */
function collectExistingHandleNames<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  nodeData: AllTypesOfNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  direction: 'input' | 'output',
): string[] {
  const handlesArray =
    direction === 'input' ? nodeData.inputs : nodeData.outputs;
  if (!handlesArray) return [];
  const iterator = handleIteratorIncludingIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    AllTypesOfHandles<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >(
    handlesArray as AllTypesOfHandles<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    direction,
  );
  const names: string[] = [];
  for (const { value } of iterator) {
    if (value && 'name' in value && typeof value.name === 'string') {
      names.push(value.name);
    }
  }
  return names;
}

/**
 * Inserts or deletes a handle at a specific position in a node's inputs or outputs.
 *
 * By default, ensures the inserted handle's name is unique among its siblings
 * (all inputs or all outputs on the same node). If the name collides, a numeric
 * suffix is appended: "Name 2", "Name 3", etc. Callers can disable this by
 * passing `ensureUniqueName: false`.
 */
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
  ensureUniqueName = true,
) {
  if (mutate) {
    if (
      ensureUniqueName &&
      'name' in handleToInsert &&
      typeof (handleToInsert as { name?: unknown }).name === 'string'
    ) {
      const existingNames = collectExistingHandleNames<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(nodeData, handleIndices.type);
      const namedHandle = handleToInsert as { name: string };
      namedHandle.name = ensureUniqueHandleName(
        namedHandle.name,
        existingNames,
      );
    }
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
    return produce(nodeData, (draft: typeof nodeData) => {
      if (
        ensureUniqueName &&
        'name' in handleToInsert &&
        typeof (handleToInsert as { name?: unknown }).name === 'string'
      ) {
        const existingNames = collectExistingHandleNames<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(draft as TypeSupplied, handleIndices.type);
        handleToInsert = {
          ...handleToInsert,
          name: ensureUniqueHandleName(
            (handleToInsert as { name: string }).name,
            existingNames,
          ),
        };
      }
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
