import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';

type AllTypesOfNodeData<
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
      >['nodes'][number]['data']
    >
  | NonNullable<
      State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['typeOfNodes'][NodeTypeUniqueId]
    >;

type InstantiatedNodeData<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = NonNullable<
  State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number]['data']
>;

export type { AllTypesOfNodeData, InstantiatedNodeData };
