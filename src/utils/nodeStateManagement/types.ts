import { z } from 'zod';
import type { Nodes, Edges } from '@/components/organisms/FullGraph/types';

/**
 * Array of supported underlying data types
 */
const supportedUnderlyingTypes = [
  'string',
  'number',
  'complex',
  'noEquivalent',
  'inferFromConnection',
] as const;

/**
 * Union type of all supported underlying data types
 */
type SupportedUnderlyingTypes = (typeof supportedUnderlyingTypes)[number];

/**
 * Map of supported underlying types for type checking
 */
const supportedUnderlyingTypesMap = {
  [supportedUnderlyingTypes[0]]: supportedUnderlyingTypes[0],
  [supportedUnderlyingTypes[1]]: supportedUnderlyingTypes[1],
  [supportedUnderlyingTypes[2]]: supportedUnderlyingTypes[2],
  [supportedUnderlyingTypes[3]]: supportedUnderlyingTypes[3],
  [supportedUnderlyingTypes[4]]: supportedUnderlyingTypes[4],
} as const;

/**
 * Type guard to check if a string is a supported underlying type
 *
 * @param type - The string to check
 * @returns True if the string is a supported underlying type
 *
 * @example
 * ```tsx
 * if (isSupportedUnderlyingType('string')) {
 *   // type is now 'string'
 * }
 * ```
 */
function isSupportedUnderlyingType(
  type: string,
): type is SupportedUnderlyingTypes {
  return Boolean(supportedUnderlyingTypesMap[type as SupportedUnderlyingTypes]);
}

/**
 * Definition of a data type in the graph system
 *
 * @template UnderlyingType - The underlying type of the data
 * @template ComplexSchemaType - Zod schema type for complex data types
 */
type DataType<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = UnderlyingType extends 'complex'
  ? {
      /** Display name of the data type */
      name: string;
      /** The underlying type of the data */
      underlyingType: UnderlyingType;
      /** Zod schema for complex data validation */
      complexSchema: ComplexSchemaType;
      /** Color used for visual representation */
      color: string;
    }
  : {
      /** Display name of the data type */
      name: string;
      /** The underlying type of the data */
      underlyingType: UnderlyingType;
      /** Complex schema is not used for non-complex types */
      complexSchema?: undefined;
      /** Color used for visual representation */
      color: string;
    };

/**
 * Helper function to create a data type with automatic type inference
 *
 * This function is essential for type safety when defining data types. It ensures
 * that TypeScript can properly infer and validate the types throughout your graph
 * system, preventing runtime errors and providing better IDE support.
 *
 * @template UnderlyingType - The underlying type of the data
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param input - The data type definition
 * @returns The data type definition with proper typing
 *
 * @example
 * ```tsx
 * // ✅ Type-safe - TypeScript will validate dataType references
 * const stringType = makeDataTypeWithAutoInfer({
 *   name: 'String',
 *   underlyingType: 'string',
 *   color: '#4A90E2',
 * });
 *
 * // ❌ Without auto-infer - TypeScript can't validate references
 * const stringType = {
 *   name: 'String',
 *   underlyingType: 'string',
 *   color: '#4A90E2',
 * };
 * ```
 */
function makeDataTypeWithAutoInfer<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(input: DataType<UnderlyingType, ComplexSchemaType>) {
  return input;
}

/**
 * Definition of an input type in a node
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 */
type TypeOfInput<DataTypeUniqueId extends string = string> = {
  /** Display name of the input */
  name: string;
  /** The data type identifier this input uses */
  dataType: DataTypeUniqueId;
  /** Whether this input allows direct user input */
  allowInput?: boolean;
};

/**
 * Definition of an input panel type in a node
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 */
type TypeOfInputPanel<DataTypeUniqueId extends string = string> = {
  /** Display name of the input panel */
  name: string;
  /** Array of inputs within this panel */
  inputs: TypeOfInput<DataTypeUniqueId>[];
};

/**
 * Definition of a node type in the graph system
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 */
type TypeOfNode<DataTypeUniqueId extends string = string> = {
  /** Display name of the node type */
  name: string;
  /** Color used for the node header */
  headerColor?: string;
  /** Array of inputs (can be regular inputs or input panels) */
  inputs: (
    | TypeOfInput<DataTypeUniqueId>
    | TypeOfInputPanel<DataTypeUniqueId>
  )[];
  /** Array of outputs */
  outputs: TypeOfInput<DataTypeUniqueId>[];
};

/**
 * Helper function to create a node type with automatic type inference
 *
 * This function is essential for type safety when defining node types. It ensures
 * that TypeScript can properly validate dataType references in inputs and outputs,
 * preventing runtime errors when creating nodes and providing better IDE support.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @param input - The node type definition
 * @returns The node type definition with proper typing
 *
 * @example
 * ```tsx
 * // ✅ Type-safe - TypeScript will validate dataType references
 * const inputNodeType = makeTypeOfNodeWithAutoInfer({
 *   name: 'Input Node',
 *   headerColor: '#C44536',
 *   inputs: [{ name: 'Input', dataType: 'stringType', allowInput: true }],
 *   outputs: [{ name: 'Output', dataType: 'stringType' }],
 * });
 *
 * // ❌ Without auto-infer - TypeScript can't validate dataType references
 * const inputNodeType = {
 *   name: 'Input Node',
 *   headerColor: '#C44536',
 *   inputs: [{ name: 'Input', dataType: 'stringType', allowInput: true }],
 *   outputs: [{ name: 'Output', dataType: 'stringType' }],
 * };
 * ```
 */
function makeTypeOfNodeWithAutoInfer<DataTypeUniqueId extends string = string>(
  input: TypeOfNode<DataTypeUniqueId>,
) {
  return input;
}

/**
 * Mapping from node IDs to their node types
 *
 * @template NodeTypeUniqueId - Unique identifier type for node types
 */
type NodeIdToNodeType<NodeTypeUniqueId extends string = string> = Record<
  string,
  NodeTypeUniqueId
>;

/**
 * Helper function to create a node ID to node type mapping with automatic type inference
 *
 * This function is essential for type safety when mapping node IDs to their types.
 * It ensures that TypeScript can validate that all node type references are valid,
 * preventing runtime errors when dispatching actions and providing better IDE support.
 *
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @param input - The node ID to node type mapping
 * @returns The mapping with proper typing
 *
 * @example
 * ```tsx
 * // ✅ Type-safe - TypeScript will validate node type references
 * const nodeIdToNodeType = makeNodeIdToNodeTypeWithAutoInfer({
 *   'node-1': 'inputNode',
 *   'node-2': 'outputNode',
 * });
 *
 * // ❌ Without auto-infer - TypeScript can't validate node type references
 * const nodeIdToNodeType = {
 *   'node-1': 'inputNode',
 *   'node-2': 'outputNode',
 * };
 * ```
 */
function makeNodeIdToNodeTypeWithAutoInfer<
  NodeTypeUniqueId extends string = string,
>(input: NodeIdToNodeType<NodeTypeUniqueId>) {
  return input;
}

/**
 * Complete state definition for the graph system
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 */
type State<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /** Map of data type definitions */
  dataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >;
  /** Map of node type definitions */
  typeOfNodes: Record<NodeTypeUniqueId, TypeOfNode<DataTypeUniqueId>>;
  /** Array of nodes in the graph */
  nodes: Nodes;
  /** Mapping from node IDs to their types */
  nodeIdToNodeType: NodeIdToNodeType<NodeTypeUniqueId>;
  /** Array of edges in the graph */
  edges: Edges;
};

/**
 * Helper function to create a state with automatic type inference
 *
 * This function is essential for complete type safety when creating the graph state.
 * It ensures that TypeScript can properly infer and validate all type relationships
 * throughout your graph system, providing compile-time type checking and better IDE support.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param input - The state definition
 * @returns The state with proper typing
 *
 * @example
 * ```tsx
 * // ✅ Type-safe - Complete type inference and validation
 * const state = makeStateWithAutoInfer({
 *   dataTypes: {
 *     stringType: makeDataTypeWithAutoInfer({
 *       name: 'String',
 *       underlyingType: 'string',
 *       color: '#4A90E2'
 *     })
 *   },
 *   typeOfNodes: {
 *     inputNode: makeTypeOfNodeWithAutoInfer({
 *       name: 'Input',
 *       inputs: [],
 *       outputs: []
 *     })
 *   },
 *   nodeIdToNodeType: makeNodeIdToNodeTypeWithAutoInfer({}),
 *   nodes: [],
 *   edges: [],
 * });
 *
 * // ❌ Without auto-infer - No type validation
 * const state = {
 *   dataTypes: { stringType: { name: 'String', underlyingType: 'string', color: '#4A90E2' } },
 *   typeOfNodes: { inputNode: { name: 'Input', inputs: [], outputs: [] } },
 *   nodes: [],
 *   nodeIdToNodeType: {},
 *   edges: [],
 * };
 * ```
 */
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
