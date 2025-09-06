import { z } from 'zod';
import type { Nodes, Edges } from '@/components/organisms/FullGraph/types';

const supportedUnderlyingTypes = [
  'string',
  'number',
  'complex',
  'noEquivalent',
  'inferFromConnection',
] as const;

type SupportedUnderlyingTypes = (typeof supportedUnderlyingTypes)[number];

const supportedUnderlyingTypesMap = {
  [supportedUnderlyingTypes[0]]: supportedUnderlyingTypes[0],
  [supportedUnderlyingTypes[1]]: supportedUnderlyingTypes[1],
  [supportedUnderlyingTypes[2]]: supportedUnderlyingTypes[2],
  [supportedUnderlyingTypes[3]]: supportedUnderlyingTypes[3],
  [supportedUnderlyingTypes[4]]: supportedUnderlyingTypes[4],
} as const;

function isSupportedUnderlyingType(
  type: string,
): type is SupportedUnderlyingTypes {
  return Boolean(supportedUnderlyingTypesMap[type as SupportedUnderlyingTypes]);
}

type DataType<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = UnderlyingType extends 'complex'
  ? {
      name: string;
      underlyingType: UnderlyingType;
      complexSchema: ComplexSchemaType;
      color: string;
    }
  : {
      name: string;
      underlyingType: UnderlyingType;
      complexSchema?: undefined;
      color: string;
    };

function makeDataTypeWithAutoInfer<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(input: DataType<UnderlyingType, ComplexSchemaType>) {
  return input;
}

type TypeOfInput<DataTypeUniqueId extends string = string> = {
  name: string;
  dataType: DataTypeUniqueId;
  allowInput?: boolean;
};

type TypeOfInputPanel<DataTypeUniqueId extends string = string> = {
  name: string;
  inputs: TypeOfInput<DataTypeUniqueId>[];
};

type TypeOfNode<DataTypeUniqueId extends string = string> = {
  name: string;
  headerColor?: string;
  inputs: (
    | TypeOfInput<DataTypeUniqueId>
    | TypeOfInputPanel<DataTypeUniqueId>
  )[];
  outputs: TypeOfInput<DataTypeUniqueId>[];
};

function makeTypeOfNodeWithAutoInfer<DataTypeUniqueId extends string = string>(
  input: TypeOfNode<DataTypeUniqueId>,
) {
  return input;
}

type NodeIdToNodeType<NodeTypeUniqueId extends string = string> = Record<
  string,
  NodeTypeUniqueId
>;

function makeNodeIdToNodeTypeWithAutoInfer<
  NodeTypeUniqueId extends string = string,
>(input: NodeIdToNodeType<NodeTypeUniqueId>) {
  return input;
}

type State<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  dataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >;
  typeOfNodes: Record<NodeTypeUniqueId, TypeOfNode<DataTypeUniqueId>>;
  nodes: Nodes;
  nodeIdToNodeType: NodeIdToNodeType<NodeTypeUniqueId>;
  edges: Edges;
};

function makeStateWithAutoInfer<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  input: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
) {
  return input;
}

// example usage
// const dataTypes = {
//   dataType1: makeDataTypeWithAutoInfer({
//     name: 'string',
//     underlyingType: 'complex',
//     complexSchema: z.string(),
//     color: 'red',
//   }),
//   dataType2: makeDataTypeWithAutoInfer({
//     name: 'number',
//     underlyingType: 'inferFromConnection',
//     color: 'blue',
//   }),
// };

// const typeOfNodes = {
//   nodeType1: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypes>({
//     name: 'string',
//     inputs: [
//       { name: 'input1', dataType: 'dataType1' },
//       { name: 'input2', dataType: 'dataType2' },
//     ],
//     outputs: [{ name: 'output1', dataType: 'dataType1' }],
//   }),
//   nodeType2: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypes>({
//     name: 'number',
//     inputs: [{ name: 'input1', dataType: 'dataType2' }],
//     outputs: [{ name: 'output1', dataType: 'dataType1' }],
//   }),
// };

// const nodeIdToNodeType = makeNodeIdToNodeTypeWithAutoInfer<
//   keyof typeof typeOfNodes
// >({
//   node1: 'nodeType1',
//   nodeTypeLol: 'nodeType2',
//   nodeTypeLol2: 'nodeType2',
// });

// const state = makeStateWithAutoInfer({
//   dataTypes,
//   typeOfNodes,
//   nodeIdToNodeType,
//   nodes: [],
//   edges: [],
// });

export {
  isSupportedUnderlyingType,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
  makeNodeIdToNodeTypeWithAutoInfer,
  makeStateWithAutoInfer,
  supportedUnderlyingTypesMap,
};
export type {
  SupportedUnderlyingTypes,
  DataType,
  TypeOfNode,
  TypeOfInput,
  TypeOfInputPanel,
  NodeIdToNodeType,
  State,
};
