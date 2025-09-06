import { z } from 'zod';
import {
  type State,
  type SupportedUnderlyingTypes,
  type TypeOfNode,
  type TypeOfInput,
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
    | TypeOfInput<DataTypeUniqueId>
    | TypeOfNode<DataTypeUniqueId>['outputs'][number],
  dataTypes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dataTypes'],
): {
  id: string;
  name: string;
  type: 'number' | 'string';
  handleColor: string;
} {
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
): {
  id: string;
  name: string;
  inputs: {
    id: string;
    name: string;
    type: 'number' | 'string';
    handleColor: string;
  }[];
} {
  const panelId = generateRandomString(lengthOfIds);
  const inputs = typeOfPanel.inputs.map((input) =>
    constructInputOrOutputOfType(input, dataTypes),
  );

  return {
    id: panelId,
    name: typeOfPanel.name,
    inputs,
  };
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
