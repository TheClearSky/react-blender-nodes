import type { ConfigurableNodeInputPanel } from '@/components/organisms/ConfigurableNode/ConfigurableNode';
import type {
  State,
  SupportedUnderlyingTypes,
  TypeOfInputPanel,
} from '../types';
import type { z } from 'zod';

type HandleIndices =
  | { type: 'input'; index1: number; index2: number | undefined }
  | { type: 'output'; index1: number; index2: undefined };

type AllTypesOfHandles<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> =
  | NonNullable<
      State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['nodes'][number]['data']['inputs']
    >
  | NonNullable<
      State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['nodes'][number]['data']['outputs']
    >
  | NonNullable<
      State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['typeOfNodes'][NodeTypeUniqueId]['inputs']
    >
  | NonNullable<
      State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['typeOfNodes'][NodeTypeUniqueId]['outputs']
    >;

type InstantiatedTypesOfHandles<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> =
  | NonNullable<
      State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['nodes'][number]['data']['inputs']
    >
  | NonNullable<
      State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['nodes'][number]['data']['outputs']
    >;

type NonPanelTypesOfHandles<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  TypeSupplied extends AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
> = Exclude<
  TypeSupplied[number],
  | ConfigurableNodeInputPanel<
      UnderlyingType,
      ComplexSchemaType,
      DataTypeUniqueId
    >
  | TypeOfInputPanel<DataTypeUniqueId>
>;

type InstantiatedNonPanelTypesOfHandles<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  TypeSupplied extends InstantiatedTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = InstantiatedTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
> = Exclude<
  TypeSupplied[number],
  ConfigurableNodeInputPanel<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >
>;

type HandleAndRelatedInformation<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  TypeSupplied extends AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
> = {
  value: NonPanelTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    TypeSupplied
  >;
  handleIndices: HandleIndices;
  parentArray: TypeSupplied;
  parentArrayIndex: number;
};

type HandleAndRelatedInformationWhenNotFound<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  TypeSupplied extends AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
> = {
  value: undefined;
  handleIndices: HandleIndices;
  parentArray: TypeSupplied;
  parentArrayIndex: number;
};

export type {
  HandleIndices,
  NonPanelTypesOfHandles,
  HandleAndRelatedInformation,
  AllTypesOfHandles,
  HandleAndRelatedInformationWhenNotFound,
  InstantiatedNonPanelTypesOfHandles,
  InstantiatedTypesOfHandles,
};
