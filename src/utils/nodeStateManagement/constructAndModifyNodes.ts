import { z } from 'zod';
import {
  type State,
  type SupportedUnderlyingTypes,
  type TypeOfNode,
  type TypeOfInput,
} from './types';
import { Position, type XYPosition } from '@xyflow/react';
import { generateRandomString } from '../randomGeneration';
import type {
  ConfigurableNodeInput,
  ConfigurableNodeInputPanel,
  ConfigurableNodeOutput,
} from '@/components/organisms/ConfigurableNode/ConfigurableNode';

const lengthOfIds = 20;

/**
 * Constructs a ConfigurableNodeInput or ConfigurableNodeOutput from a type definition
 *
 * This function creates the appropriate input or output instance based on the data type's
 * underlying type (string or number). It generates a unique ID and applies the correct
 * configuration including handle color and input allowance.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param typeOfDataType - The type definition for the input or output
 * @param dataTypes - Map of data type definitions
 * @returns Constructed input or output instance
 *
 * @example
 * ```tsx
 * import {
 *   constructInputOrOutputOfType,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 *
 * // Define data types with auto-infer for type safety
 * const dataTypes = {
 *   stringType: makeDataTypeWithAutoInfer({
 *     name: 'String',
 *     underlyingType: 'string',
 *     color: '#4A90E2',
 *   }),
 * };
 *
 * // Construct input with type safety
 * const input = constructInputOrOutputOfType(
 *   { name: 'Value', dataType: 'stringType', allowInput: true },
 *   dataTypes
 * );
 * ```
 */
function constructInputOrOutputOfType<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  typeOfDataType:
    | TypeOfInput<DataTypeUniqueId>
    | TypeOfNode<DataTypeUniqueId>['outputs'][number],
  dataTypes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dataTypes'],
): ConfigurableNodeInput | ConfigurableNodeOutput {
  const dataType = dataTypes[typeOfDataType.dataType as DataTypeUniqueId];

  if (dataType.underlyingType === 'number') {
    return {
      id: generateRandomString(lengthOfIds),
      name: typeOfDataType.name,
      handleColor: dataType.color,
      allowInput: typeOfDataType.allowInput,
      type: 'number' as const,
    };
  } else {
    return {
      id: generateRandomString(lengthOfIds),
      name: typeOfDataType.name,
      handleColor: dataType.color,
      allowInput: typeOfDataType.allowInput,
      type: 'string' as const,
    };
  }
}

/**
 * Constructs a ConfigurableNodeInputPanel from a type definition
 *
 * This function creates an input panel with multiple inputs based on the panel type
 * definition. It generates a unique panel ID and constructs all the inputs within
 * the panel using the constructInputOrOutputOfType function.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param typeOfPanel - The type definition for the input panel
 * @param dataTypes - Map of data type definitions
 * @returns Constructed input panel instance
 *
 * @example
 * ```tsx
 * import {
 *   constructInputPanelOfType,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 *
 * // Define data types with auto-infer for type safety
 * const dataTypes = {
 *   numberType: makeDataTypeWithAutoInfer({
 *     name: 'Number',
 *     underlyingType: 'number',
 *     color: '#E74C3C',
 *   }),
 * };
 *
 * // Construct panel with type safety
 * const panel = constructInputPanelOfType(
 *   {
 *     name: 'Settings',
 *     inputs: [
 *       { name: 'Width', dataType: 'numberType' },
 *       { name: 'Height', dataType: 'numberType' }
 *     ]
 *   },
 *   dataTypes
 * );
 * ```
 */
function constructInputPanelOfType<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  typeOfPanel: {
    name: string;
    inputs: { name: string; dataType: DataTypeUniqueId }[];
  },
  dataTypes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dataTypes'],
): ConfigurableNodeInputPanel {
  const panelId = generateRandomString(lengthOfIds);
  const inputs = typeOfPanel.inputs.map((input) =>
    constructInputOrOutputOfType(input, dataTypes),
  ) as ConfigurableNodeInput[];

  return {
    id: panelId,
    name: typeOfPanel.name,
    inputs,
  };
}

/**
 * Constructs a complete node from a node type definition
 *
 * This function creates a fully configured ReactFlow node based on the node type
 * definition. It processes all inputs (including panels) and outputs, generates
 * unique IDs, and sets up the node with the correct position and configuration.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param dataTypes - Map of data type definitions
 * @param nodeType - The unique identifier of the node type
 * @param typeOfNodes - Map of node type definitions
 * @param nodeId - Unique identifier for the new node instance
 * @param position - Position where the node should be placed
 * @returns Complete ReactFlow node instance
 *
 * @example
 * ```tsx
 * import {
 *   constructNodeOfType,
 *   makeStateWithAutoInfer,
 *   makeNodeIdToNodeTypeWithAutoInfer,
 *   makeTypeOfNodeWithAutoInfer,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 *
 * // Define data types with auto-infer for type safety
 * const dataTypes = {
 *   stringType: makeDataTypeWithAutoInfer({
 *     name: 'String',
 *     underlyingType: 'string',
 *     color: '#4A90E2',
 *   }),
 * };
 *
 * // Define node types with auto-infer for type safety
 * const typeOfNodes = {
 *   inputNode: makeTypeOfNodeWithAutoInfer({
 *     name: 'Input Node',
 *     headerColor: '#C44536',
 *     inputs: [{ name: 'Input', dataType: 'stringType', allowInput: true }],
 *     outputs: [{ name: 'Output', dataType: 'stringType' }]
 *   }),
 * };
 *
 * // Construct node with type safety
 * const node = constructNodeOfType(
 *   dataTypes,
 *   'inputNode',
 *   typeOfNodes,
 *   'node-123',
 *   { x: 100, y: 100 }
 * );
 * ```
 */
function constructNodeOfType<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  dataTypes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dataTypes'],
  nodeType: NodeTypeUniqueId,
  typeOfNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['typeOfNodes'],
  nodeId: string,
  position: XYPosition,
): State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>['nodes'][number] {
  const nodeTypeData = typeOfNodes[nodeType as NodeTypeUniqueId];

  // Process inputs - can be either regular inputs or panels
  const inputs = nodeTypeData.inputs.map((input) => {
    if ('inputs' in input) {
      // This is a panel
      return constructInputPanelOfType(input, dataTypes);
    } else {
      // This is a regular input
      return constructInputOrOutputOfType(input, dataTypes);
    }
  });

  const outputs = nodeTypeData.outputs.map((output) =>
    constructInputOrOutputOfType(output, dataTypes),
  );
  return {
    id: nodeId,
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: nodeTypeData.name,
      headerColor: nodeTypeData.headerColor,
      inputs,
      outputs,
    },
  };
}

export {
  constructNodeOfType,
  constructInputOrOutputOfType,
  constructInputPanelOfType,
};
