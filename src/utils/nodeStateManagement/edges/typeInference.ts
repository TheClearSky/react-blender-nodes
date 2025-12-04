import { type SupportedUnderlyingTypes } from '@/utils';
import type { z } from 'zod';
import { transformHandlesInNodeDataInPlace } from '@/utils/nodeStateManagement/handles/handleSetters';
import type { InstantiatedNodeData } from '../nodes/types';
import type {
  HandleIndices,
  InstantiatedNonPanelTypesOfHandles,
} from '../handles/types';
import _ from 'lodash';
import { produce } from 'immer';

function inferTypeOnHandleAfterConnectingWithAnotherHandle<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  HandleType extends InstantiatedNonPanelTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = InstantiatedNonPanelTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
>(
  handle: HandleType,
  connectedHandle:
    | {
        handle:
          | InstantiatedNonPanelTypesOfHandles<
              DataTypeUniqueId,
              NodeTypeUniqueId,
              UnderlyingType,
              ComplexSchemaType
            >
          | undefined;
        resetInferredType: boolean;
        overrideDataType?: boolean;
        overrideName?: boolean;
      }
    | undefined,
  mutate: boolean = true,
): HandleType {
  let connectedHandleWithoutNameIdDataTypeAndInferredDataType:
    | Omit<
        NonNullable<typeof connectedHandle>['handle'],
        'id' | 'name' | 'dataType' | 'inferredDataType'
      >
    | undefined;
  if (connectedHandle?.handle) {
    const { id, name, dataType, inferredDataType, ...restHandle } =
      connectedHandle.handle;
    connectedHandleWithoutNameIdDataTypeAndInferredDataType = restHandle;
  }
  const inferredDataType =
    (connectedHandle?.handle?.inferredDataType ||
      connectedHandle?.handle?.dataType) &&
    !connectedHandle?.resetInferredType
      ? connectedHandle?.handle?.inferredDataType ||
        connectedHandle?.handle?.dataType
      : undefined;
  const updateValues = _.cloneDeep({
    inferredDataType: inferredDataType,
    ...(connectedHandle?.overrideDataType
      ? { dataType: inferredDataType }
      : {}),
    ...(connectedHandle?.handle?.dataType?.dataTypeObject &&
    connectedHandle?.handle?.dataType?.dataTypeUniqueId &&
    connectedHandleWithoutNameIdDataTypeAndInferredDataType
      ? connectedHandleWithoutNameIdDataTypeAndInferredDataType
      : {}),
    ...(connectedHandle?.overrideName && connectedHandle?.handle?.name
      ? { name: connectedHandle.handle.name }
      : {}),
  });
  if (mutate) {
    Object.assign(handle, updateValues);
    return handle;
  } else {
    return produce(handle, (draft) => {
      Object.assign(draft, updateValues);
      return draft;
    });
  }
}

function inferTypeAcrossTheNodeForHandleOfDataType<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  nodeData: InstantiatedNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  dataTypeToInferFor: DataTypeUniqueId,
  connectedHandle:
    | {
        handle:
          | InstantiatedNonPanelTypesOfHandles<
              DataTypeUniqueId,
              NodeTypeUniqueId,
              UnderlyingType,
              ComplexSchemaType
            >
          | undefined;
        resetInferredType: boolean;
        overrideDataType?: boolean;
        overrideName?: boolean;
      }
    | undefined,
  mutate: boolean = true,
): InstantiatedNodeData<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  if (mutate) {
    return transformHandlesInNodeDataInPlace<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId,
      typeof nodeData
    >(nodeData, (handle) => {
      if (handle.dataType?.dataTypeUniqueId === dataTypeToInferFor) {
        inferTypeOnHandleAfterConnectingWithAnotherHandle<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType,
          typeof handle
        >(handle, connectedHandle);
      }
    });
  } else {
    return produce(nodeData, (draft) => {
      transformHandlesInNodeDataInPlace<
        UnderlyingType,
        NodeTypeUniqueId,
        ComplexSchemaType,
        DataTypeUniqueId,
        InstantiatedNodeData<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >
      >(
        draft as InstantiatedNodeData<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >,
        (handle) => {
          if (handle.dataType?.dataTypeUniqueId === dataTypeToInferFor) {
            inferTypeOnHandleAfterConnectingWithAnotherHandle<
              DataTypeUniqueId,
              NodeTypeUniqueId,
              UnderlyingType,
              ComplexSchemaType,
              typeof handle
            >(handle, connectedHandle);
          }
        },
      );
      return draft;
    });
  }
}

export { inferTypeAcrossTheNodeForHandleOfDataType };

export type { HandleIndices };
