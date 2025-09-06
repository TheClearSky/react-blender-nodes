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
  Input,
  InputPanel,
  Output,
} from '@/components/organisms/ConfigurableNode/ConfigurableNode';

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
): Input | Output {
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
): InputPanel {
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
