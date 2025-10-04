import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from './types';

const standardDataTypeNames = ['newGroupInput', 'newGroupOutput'] as const;

const standardDataTypeNamesMap = {
  [standardDataTypeNames[0]]: standardDataTypeNames[0],
  [standardDataTypeNames[1]]: standardDataTypeNames[1],
} as const;

const standardNodeTypeNames = ['groupInput', 'groupOutput'] as const;

const standardNodeTypeNamesMap = {
  [standardNodeTypeNames[0]]: standardNodeTypeNames[0],
  [standardNodeTypeNames[1]]: standardNodeTypeNames[1],
} as const;

const standardDataTypes = {
  [standardDataTypeNamesMap.newGroupInput]: makeDataTypeWithAutoInfer({
    name: 'New Group Input',
    underlyingType: 'inferFromConnection',
    color: '#333333',
  }),
  [standardDataTypeNamesMap.newGroupOutput]: makeDataTypeWithAutoInfer({
    name: 'New Group Output',
    underlyingType: 'inferFromConnection',
    color: '#333333',
  }),
};

const standardNodeTypes = {
  [standardNodeTypeNamesMap.groupInput]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes
  >({
    name: 'Group Input',
    headerColor: '#1d1d1d',
    inputs: [],
    outputs: [
      {
        name: '',
        dataType: standardDataTypeNamesMap.newGroupInput,
      },
    ],
  }),
  [standardNodeTypeNamesMap.groupOutput]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes
  >({
    name: 'Group Output',
    headerColor: '#1d1d1d',
    inputs: [
      {
        name: '',
        dataType: standardDataTypeNamesMap.newGroupOutput,
      },
    ],
    outputs: [],
  }),
};

export {
  standardDataTypes,
  standardNodeTypes,
  standardDataTypeNames,
  standardNodeTypeNames,
  standardDataTypeNamesMap,
  standardNodeTypeNamesMap,
};
