import { z } from 'zod';
import {
  type State,
  type SupportedUnderlyingTypes,
  type TypeOfNode,
} from './types';
import { Position, type XYPosition } from '@xyflow/react';
import { generateRandomString } from '../randomGeneration';

const lengthOfIds = 20;

function constructInputOrOutputOfType<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  typeOfDataType:
    | TypeOfNode<DataTypeUniqueId>['inputs'][number]
    | TypeOfNode<DataTypeUniqueId>['outputs'][number],
  dataTypes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dataTypes'],
): NonNullable<
  State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number]['data']['inputs']
>[number] {
  const dataType = dataTypes[typeOfDataType.dataType as DataTypeUniqueId];
  const returnValue: {
    id: string;
    name: string;
    type: 'number' | 'string';
    handleColor: string;
  } = {
    id: generateRandomString(lengthOfIds),
    name: typeOfDataType.name,
    type: 'string',
    handleColor: dataType.color,
  };
  if (
    dataType.underlyingType === 'number' ||
    dataType.underlyingType === 'string'
  ) {
    returnValue.type = dataType.underlyingType;
  }
  return returnValue;
}

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
  const inputs = nodeTypeData.inputs.map((input) =>
    constructInputOrOutputOfType(input, dataTypes),
  );
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
      inputs,
      outputs,
    },
  };
}

export { constructNodeOfType, constructInputOrOutputOfType };
