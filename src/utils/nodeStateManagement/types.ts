import { z } from 'zod';
import type { Nodes, Edges } from '@/components/organisms/FullGraph/types';
import type { HandleShape } from '@/components/organisms/ConfigurableNode/ContextAwareHandle';
import type { Viewport } from '@xyflow/react';

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
      /** Shape of the handle */
      shape?: HandleShape;
      /** Whether this input allows direct user input */
      allowInput?: boolean;
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
      /** Shape of the handle */
      shape?: HandleShape;
      /** Whether this input allows direct user input */
      allowInput?: boolean;
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
 * Type guard to check if a string is a valid DataTypeUniqueId
 */
function isValidDataTypeId<
  DataTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  id: string,
  dataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >,
): id is DataTypeUniqueId {
  return id in dataTypes;
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
type TypeOfNode<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
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
  /** Subtree of the node type (if this exists, this is a node group) */
  subtree?: {
    nodes: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >['nodes'];
    edges: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >['edges'];
    /**
     * Number of references to this node group
     * This subtree can only be edited or deleted if there are no references to it
     */
    numberOfReferences: number;
    /**
     * Input node id of the node group
     * - It is used to connect the node group to the rest of the graph
     * - Not allowed to be deleted or duplicated, must always be one
     */
    inputNodeId: string;
    /**
     * Output node id of the node group
     * - It is used to connect the node group to the rest of the graph
     * - Not allowed to be deleted or duplicated, must always be one
     */
    outputNodeId: string;
  };
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
function makeTypeOfNodeWithAutoInfer<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  input: TypeOfNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
) {
  return input;
}

/**
 * Mapping of allowed conversions between data types
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 */
type AllowedConversionsBetweenDataTypes<
  DataTypeUniqueId extends string = string,
> = Partial<
  Record<DataTypeUniqueId, Partial<Record<DataTypeUniqueId, boolean>>>
>;

/**
 * Helper function to create a mapping of allowed conversions between data types with automatic type inference
 *
 * This function is essential for type safety when creating a mapping of allowed conversions between data types.
 * It ensures that TypeScript can properly infer and validate the types throughout your graph system,
 * preventing runtime errors and providing better IDE support.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @param input - The mapping of allowed conversions between data types
 * @returns The mapping with proper typing
 *
 * @example
 * ```tsx
 * // ✅ Type-safe - TypeScript will validate node type references
 * const allowedConversionsBetweenDataTypes = makeAllowedConversionsBetweenDataTypesWithAutoInfer({
 *   'inputDataType': {
 *     'outputDataType': true,
 *   },
 * });
 *
 * // ❌ Without auto-infer - TypeScript can't validate node type references
 * const allowedConversionsBetweenDataTypes = {
 *   'inputDataType': {
 *     'outputDataType': true,
 *   },
 * };
 * ```
 */
function makeAllowedConversionsBetweenDataTypesWithAutoInfer<
  DataTypeUniqueId extends string = string,
>(input: AllowedConversionsBetweenDataTypes<DataTypeUniqueId>) {
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
  openedNodeGroupStack?: //Opening the original node group case
  (
    | {
        nodeType: NodeTypeUniqueId;
      }
    //Opening the instance of the node group case
    | {
        nodeType: NodeTypeUniqueId;
        /**
         * If not provided, it means that this node group isn't instantiated yet and we are editing the original node group
         */
        nodeId: string;
        previousViewport: Viewport;
      }
  )[];
  /** Map of data type definitions */
  dataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >;
  /** Current viewport of the graph */
  viewport?: Viewport;
  /** Map of node type definitions */
  typeOfNodes: Record<
    NodeTypeUniqueId,
    TypeOfNode<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >;
  /** Array of nodes in the graph */
  nodes: Nodes<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >;
  /** Array of edges in the graph */
  edges: Edges;
  /**
   * Optional mapping of allowed conversions between data types
   * - When not provided, all conversions are allowed
   * - If provided, only the conversions that are explicitly allowed will be allowed (happens even with empty object)
   * - By default, it will not allow conversion between complex types unless explicitly allowed here (even if complex type checking is enabled)
   * - If you want to allow conversion between complex types unless disallowed by complex type checking, you can set `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` to true
   *
   * @default undefined
   */
  allowedConversionsBetweenDataTypes?: AllowedConversionsBetweenDataTypes<DataTypeUniqueId>;
  /**
   * Whether to allow conversion between complex types unless disallowed by complex type checking
   * - If not provided, is considered disabled
   * - Only takes effect if complex type checking is enabled (`allowedConversionsBetweenDataTypes` is provided)
   * - If enabled, it will allow conversion between complex types unless disallowed by complex type checking
   * - If disabled, it will not allow conversion between complex types unless explicitly allowed by `allowedConversionsBetweenDataTypes`, even if complex type checking is enabled
   *
   * @default undefined
   */
  allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking?: boolean;
  /**
   * Whether to enable type inference
   * - If not provided, is considered disabled
   * - When disabled, the types of the nodes are not inferred from the connections
   * - When enabled, the types of the nodes are inferred from the connections and reset when edges are removed
   *
   * @default undefined
   */
  enableTypeInference?: boolean;
  /**
   * Whether to enable complex type checking
   * - If not provided, is considered disabled
   * - When disabled, the complex types are not checked for compatibility, all connections are allowed
   * - When enabled, the complex types are checked for compatibility, and connections are not allowed if the complex types are not compatible
   * - Complex types are compatible if they are the same type or if they have exactly the same schema
   *
   * @default undefined
   */
  enableComplexTypeChecking?: boolean;
  /**
   * Whether to enable cycle checking
   * - If not provided, is considered disabled
   * - When disabled, the cycles are not checked, all connections are allowed
   * - When enabled, the cycles are checked, and connections are not allowed if they create a cycle
   *
   * @default undefined
   */
  enableCycleChecking?: boolean;
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
 *   nodes: [],
 *   edges: [],
 * });
 *
 * // ❌ Without auto-infer - No type validation
 * const state = {
 *   dataTypes: { stringType: { name: 'String', underlyingType: 'string', color: '#4A90E2' } },
 *   typeOfNodes: { inputNode: { name: 'Input', inputs: [], outputs: [] } },
 *   nodes: [],
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

export {
  isSupportedUnderlyingType,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
  makeAllowedConversionsBetweenDataTypesWithAutoInfer,
  makeStateWithAutoInfer,
  supportedUnderlyingTypesMap,
  isValidDataTypeId,
};
export type {
  SupportedUnderlyingTypes,
  DataType,
  TypeOfNode,
  TypeOfInput,
  TypeOfInputPanel,
  State,
};
