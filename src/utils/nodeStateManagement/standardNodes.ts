import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from './types';

const standardDataTypeNames = [
  'groupInfer',
  'loopInfer',
  'condition',
  'bindLoopNodes',
] as const;

const standardDataTypeNamesMap = {
  [standardDataTypeNames[0]]: standardDataTypeNames[0],
  [standardDataTypeNames[1]]: standardDataTypeNames[1],
  [standardDataTypeNames[2]]: standardDataTypeNames[2],
  [standardDataTypeNames[3]]: standardDataTypeNames[3],
} as const;

const standardNodeTypeNames = [
  'groupInput',
  'groupOutput',
  'loopStart',
  'loopEnd',
  'loopStop',
] as const;

const standardNodeTypeNamesMap = {
  [standardNodeTypeNames[0]]: standardNodeTypeNames[0],
  [standardNodeTypeNames[1]]: standardNodeTypeNames[1],
  [standardNodeTypeNames[2]]: standardNodeTypeNames[2],
  [standardNodeTypeNames[3]]: standardNodeTypeNames[3],
  [standardNodeTypeNames[4]]: standardNodeTypeNames[4],
} as const;

const standardDataTypes = {
  [standardDataTypeNamesMap.groupInfer]: makeDataTypeWithAutoInfer({
    name: 'Group Infer',
    underlyingType: 'inferFromConnection',
    color: '#333333',
  }),
  [standardDataTypeNamesMap.loopInfer]: makeDataTypeWithAutoInfer({
    name: 'Loop Infer',
    underlyingType: 'inferFromConnection',
    color: '#333333',
  }),
  [standardDataTypeNamesMap.condition]: makeDataTypeWithAutoInfer({
    name: 'Condition',
    underlyingType: 'inferFromConnection',
    color: '#cca6d6',
  }),
  [standardDataTypeNamesMap.bindLoopNodes]: makeDataTypeWithAutoInfer({
    name: 'Bind Loop Nodes',
    underlyingType: 'noEquivalent',
    color: '#8c52d1',
    maxConnections: 1,
  }),
} as const;

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
        dataType: standardDataTypeNamesMap.groupInfer,
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
        dataType: standardDataTypeNamesMap.groupInfer,
      },
    ],
    outputs: [],
  }),
  [standardNodeTypeNamesMap.loopStart]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes
  >({
    name: 'Loop Start',
    headerColor: '#1d1d1d',
    inputs: [
      {
        name: '',
        dataType: standardDataTypeNamesMap.loopInfer,
      },
    ],
    outputs: [
      {
        name: 'Bind Loop Nodes',
        dataType: standardDataTypeNamesMap.bindLoopNodes,
      },
      {
        name: '',
        dataType: standardDataTypeNamesMap.loopInfer,
      },
    ],
  }),
  [standardNodeTypeNamesMap.loopStop]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes
  >({
    name: 'Loop Stop',
    headerColor: '#1d1d1d',
    inputs: [
      {
        name: 'Bind Loop Nodes',
        dataType: standardDataTypeNamesMap.bindLoopNodes,
      },
      {
        name: 'Continue If Condition Is True',
        dataType: standardDataTypeNamesMap.condition,
      },
      {
        name: '',
        dataType: standardDataTypeNamesMap.loopInfer,
      },
    ],
    outputs: [
      {
        name: 'Bind Loop Nodes',
        dataType: standardDataTypeNamesMap.bindLoopNodes,
      },
      {
        name: '',
        dataType: standardDataTypeNamesMap.loopInfer,
      },
    ],
  }),
  [standardNodeTypeNamesMap.loopEnd]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes
  >({
    name: 'Loop End',
    headerColor: '#1d1d1d',
    inputs: [
      {
        name: 'Bind Loop Nodes',
        dataType: standardDataTypeNamesMap.bindLoopNodes,
      },
      {
        name: '',
        dataType: standardDataTypeNamesMap.loopInfer,
      },
    ],
    outputs: [
      {
        name: '',
        dataType: standardDataTypeNamesMap.loopInfer,
      },
    ],
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
