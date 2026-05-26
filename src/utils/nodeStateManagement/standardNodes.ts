import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
  type NodeCountConstraints,
} from './types';

const standardNodeContextMenu = {
  locationInContextMenu: ['Standard Nodes'],
  priorityInContextMenu: 200,
};

const groupNodeContextMenu = {
  locationInContextMenu: ['Group Nodes'],
  priorityInContextMenu: 100,
};

const standardDataTypeNames = [
  'groupInfer',
  'loopInfer',
  'switchInfer',
  'condition',
  'bindLoopNodes',
  'bindSwitchNodes',
] as const;

const standardDataTypeNamesMap = {
  [standardDataTypeNames[0]]: standardDataTypeNames[0],
  [standardDataTypeNames[1]]: standardDataTypeNames[1],
  [standardDataTypeNames[2]]: standardDataTypeNames[2],
  [standardDataTypeNames[3]]: standardDataTypeNames[3],
  [standardDataTypeNames[4]]: standardDataTypeNames[4],
  [standardDataTypeNames[5]]: standardDataTypeNames[5],
} as const;

const standardNodeTypeNames = [
  'groupInput',
  'groupOutput',
  'loopStart',
  'loopEnd',
  'loopStop',
  'switchStart',
  'switchEnd',
] as const;

const standardNodeTypeNamesMap = {
  [standardNodeTypeNames[0]]: standardNodeTypeNames[0],
  [standardNodeTypeNames[1]]: standardNodeTypeNames[1],
  [standardNodeTypeNames[2]]: standardNodeTypeNames[2],
  [standardNodeTypeNames[3]]: standardNodeTypeNames[3],
  [standardNodeTypeNames[4]]: standardNodeTypeNames[4],
  [standardNodeTypeNames[5]]: standardNodeTypeNames[5],
  [standardNodeTypeNames[6]]: standardNodeTypeNames[6],
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
    underlyingType: 'boolean',
    color: '#cca6d6',
    allowInput: true,
  }),
  [standardDataTypeNamesMap.bindLoopNodes]: makeDataTypeWithAutoInfer({
    name: 'Bind Loop Nodes',
    underlyingType: 'noEquivalent',
    color: '#8c52d1',
    maxConnections: 1,
  }),
  [standardDataTypeNamesMap.switchInfer]: makeDataTypeWithAutoInfer({
    name: 'Switch Infer',
    underlyingType: 'inferFromConnection',
    color: '#333333',
  }),
  [standardDataTypeNamesMap.bindSwitchNodes]: makeDataTypeWithAutoInfer({
    name: 'Bind Switch Nodes',
    underlyingType: 'noEquivalent',
    color: '#8c52d1',
    maxConnections: 1,
  }),
} as const;

const standardNodeTypes = {
  [standardNodeTypeNamesMap.groupInput]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes,
    typeof standardNodeTypeNamesMap.groupInput
  >({
    name: 'Group Input',
    headerColor: '#1d1d1d',
    ...standardNodeContextMenu,
    inputs: [],
    outputs: [
      {
        name: '',
        dataType: standardDataTypeNamesMap.groupInfer,
      },
    ],
  }),
  [standardNodeTypeNamesMap.groupOutput]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes,
    typeof standardNodeTypeNamesMap.groupOutput
  >({
    name: 'Group Output',
    headerColor: '#1d1d1d',
    ...standardNodeContextMenu,
    inputs: [
      {
        name: '',
        dataType: standardDataTypeNamesMap.groupInfer,
      },
    ],
    outputs: [],
  }),
  [standardNodeTypeNamesMap.loopStart]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes,
    typeof standardNodeTypeNamesMap.loopStart
  >({
    name: 'Loop Start',
    headerColor: '#1d1d1d',
    ...standardNodeContextMenu,
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
    keyof typeof standardDataTypes,
    typeof standardNodeTypeNamesMap.loopStop
  >({
    name: 'Loop Stop',
    headerColor: '#1d1d1d',
    ...standardNodeContextMenu,
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
    keyof typeof standardDataTypes,
    typeof standardNodeTypeNamesMap.loopEnd
  >({
    name: 'Loop End',
    headerColor: '#1d1d1d',
    ...standardNodeContextMenu,
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
  [standardNodeTypeNamesMap.switchStart]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes,
    typeof standardNodeTypeNamesMap.switchStart
  >({
    name: 'Switch Start',
    headerColor: '#1d1d1d',
    ...standardNodeContextMenu,
    inputs: [
      {
        name: '',
        dataType: standardDataTypeNamesMap.switchInfer,
      },
      {
        name: 'Condition',
        dataType: standardDataTypeNamesMap.condition,
      },
    ],
    outputs: [
      {
        name: 'Bind Switch Nodes',
        dataType: standardDataTypeNamesMap.bindSwitchNodes,
      },
      {
        name: '',
        dataType: standardDataTypeNamesMap.switchInfer,
      },
      {
        name: '',
        dataType: standardDataTypeNamesMap.switchInfer,
      },
    ],
  }),
  [standardNodeTypeNamesMap.switchEnd]: makeTypeOfNodeWithAutoInfer<
    keyof typeof standardDataTypes,
    typeof standardNodeTypeNamesMap.switchEnd
  >({
    name: 'Switch End',
    headerColor: '#1d1d1d',
    ...standardNodeContextMenu,
    inputs: [
      {
        name: 'Bind Switch Nodes',
        dataType: standardDataTypeNamesMap.bindSwitchNodes,
      },
      {
        name: '',
        dataType: standardDataTypeNamesMap.switchInfer,
      },
      {
        name: '',
        dataType: standardDataTypeNamesMap.switchInfer,
      },
    ],
    outputs: [
      {
        name: '',
        dataType: standardDataTypeNamesMap.switchInfer,
      },
    ],
  }),
};

const standardHiddenNodeTypesInContextMenu: Partial<Record<string, true>> = {
  [standardNodeTypeNamesMap.groupInput]: true,
  [standardNodeTypeNamesMap.groupOutput]: true,
  [standardNodeTypeNamesMap.loopStart]: true,
  [standardNodeTypeNamesMap.loopStop]: true,
  [standardNodeTypeNamesMap.loopEnd]: true,
  [standardNodeTypeNamesMap.switchStart]: true,
  [standardNodeTypeNamesMap.switchEnd]: true,
};

const standardNodeCountConstraints: NodeCountConstraints = {
  [standardNodeTypeNamesMap.groupInput]: {
    maxInRoot: 0,
    minInRoot: 0,
    minWithinANodeGroup: 1,
    maxWithinANodeGroup: 1,
  },
  [standardNodeTypeNamesMap.groupOutput]: {
    maxInRoot: 0,
    minInRoot: 0,
    minWithinANodeGroup: 1,
    maxWithinANodeGroup: 1,
  },
};

const switchStartInputInferHandleIndex = 0;
const switchStartInputConditionHandleIndex = 1;
const switchStartOutputInferTrueHandleIndex = 1;
const switchStartOutputInferFalseHandleIndex = 2;
const switchEndInputInferTrueHandleIndex = 1;
const switchEndInputInferFalseHandleIndex = 2;
const switchEndOutputInferHandleIndex = 0;

const loopStartInputInferHandleIndex = 0;
const loopStartOutputInferHandleIndex = 1;
const loopStopInputInferHandleIndex = 2;
const loopStopOutputInferHandleIndex = 1;
const loopEndInputInferHandleIndex = 1;
const loopEndOutputInferHandleIndex = 0;

export {
  standardNodeContextMenu,
  groupNodeContextMenu,
  standardDataTypes,
  standardNodeTypes,
  standardHiddenNodeTypesInContextMenu,
  standardNodeCountConstraints,
  standardDataTypeNames,
  standardNodeTypeNames,
  standardDataTypeNamesMap,
  standardNodeTypeNamesMap,
  loopStartInputInferHandleIndex,
  loopStartOutputInferHandleIndex,
  loopStopInputInferHandleIndex,
  loopStopOutputInferHandleIndex,
  loopEndInputInferHandleIndex,
  loopEndOutputInferHandleIndex,
  switchStartInputInferHandleIndex,
  switchStartInputConditionHandleIndex,
  switchStartOutputInferTrueHandleIndex,
  switchStartOutputInferFalseHandleIndex,
  switchEndInputInferTrueHandleIndex,
  switchEndInputInferFalseHandleIndex,
  switchEndOutputInferHandleIndex,
};
