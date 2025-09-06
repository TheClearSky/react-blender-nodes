import type { Meta, StoryObj } from '@storybook/react-vite';

import { FullGraph, useFullGraph } from './FullGraph';
import { Position } from '@xyflow/react';
import { type Nodes, type Edges } from './types';
import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { Button } from '@/components/atoms';

const meta = {
  component: FullGraph,
} satisfies Meta<typeof FullGraph>;

export default meta;

const dataTypesExample1Data = {
  dataType1: makeDataTypeWithAutoInfer({
    name: 'String Data',
    underlyingType: 'string',
    color: '#4A90E2',
  }),
  dataType2: makeDataTypeWithAutoInfer({
    name: 'Number Data',
    underlyingType: 'number',
    color: '#7ED321',
  }),
};

const typeOfNodesExample1Data = {
  nodeType1: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypesExample1Data>({
    name: 'Data Processor',
    headerColor: '#C44536',
    inputs: [
      { name: 'Text Input', dataType: 'dataType1' },
      { name: 'Numeric Input', dataType: 'dataType2' },
    ],
    outputs: [{ name: 'Processed Output', dataType: 'dataType1' }],
  }),
  nodeType2: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypesExample1Data>({
    name: 'String Transformer',
    headerColor: '#2D5A87',
    inputs: [{ name: 'Input String', dataType: 'dataType1' }],
    outputs: [{ name: 'Transformed String', dataType: 'dataType1' }],
  }),
  nodeTypeWithPanels: makeTypeOfNodeWithAutoInfer<
    keyof typeof dataTypesExample1Data
  >({
    name: 'Advanced Node',
    headerColor: '#B8860B',
    inputs: [
      { name: 'Direct Input', dataType: 'dataType1' },
      {
        name: 'Advanced Settings',
        inputs: [
          { name: 'Setting One', dataType: 'dataType2' },
          { name: 'Setting Two', dataType: 'dataType1' },
        ],
      },
      {
        name: 'Debug Options',
        inputs: [{ name: 'Debug Mode', dataType: 'dataType1' }],
      },
    ],
    outputs: [{ name: 'Final Result', dataType: 'dataType1' }],
  }),
};

const nodesExample1Data: Nodes = [
  {
    id: 'n5',
    position: { x: -150, y: 440 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Input Validator',
      headerColor: '#C44536',
      inputs: [
        {
          name: 'Raw Data',
          id: 'input1node5',
          type: 'string',
          handleColor: '#45B7D1',
        },
        {
          name: 'Validation Rules',
          id: 'input2node5',
          type: 'string',
          handleColor: '#96CEB4',
        },
      ],
      outputs: [
        {
          name: 'Validated Data',
          id: 'output1node5',
          type: 'string',
          handleColor: '#4ECDC4',
        },
        {
          name: 'Validation Status',
          id: 'output2node5',
          type: 'string',
          handleColor: '#FECA57',
        },
        {
          name: 'Error Messages',
          id: 'output3node5',
          type: 'string',
          handleColor: '#FF6B6B',
        },
      ],
    },
  },
  {
    id: 'n1',
    position: { x: 400, y: -20 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Data Source',
      headerColor: '#C44536',
      outputs: [
        {
          name: 'Primary Output',
          id: 'output1node1',
          type: 'number',
          handleColor: '#FF6B6B',
        },
        {
          name: 'Secondary Output',
          id: 'output2node1',
          type: 'number',
          handleColor: '#4ECDC4',
        },
        {
          name: 'Metadata Output',
          id: 'output3node1',
          type: 'string',
          handleColor: '#FECA57',
        },
      ],
      inputs: [
        {
          name: 'Text Input',
          id: 'input1node1',
          type: 'string',
          handleColor: '#45B7D1',
        },
        {
          name: 'Numeric Input',
          id: 'input2node1',
          type: 'number',
          handleColor: '#96CEB4',
        },
      ],
    },
  },
  {
    id: 'n2',
    position: { x: 1000, y: 200 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Data Transformer',
      headerColor: '#2D5A87',
      inputs: [
        {
          name: 'Input String',
          id: 'input1node2',
          type: 'string',
          handleColor: '#45B7D1',
        },
        {
          name: 'Input Number',
          id: 'input2node2',
          type: 'number',
          handleColor: '#96CEB4',
        },
        {
          name: 'Config Input',
          id: 'input3node2',
          type: 'string',
          handleColor: '#4ECDC4',
        },
      ],
      outputs: [
        {
          name: 'Transformed String',
          id: 'output1node2',
          type: 'string',
          handleColor: '#FECA57',
        },
        {
          name: 'Transformed Number',
          id: 'output2node2',
          type: 'number',
          handleColor: '#FF9FF3',
        },
        {
          name: 'Status Output',
          id: 'output3node2',
          type: 'string',
          handleColor: '#A8E6CF',
        },
      ],
    },
  },
  {
    id: 'n4',
    position: {x: 1660, y: 588},
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Advanced Processor',
      headerColor: '#B8860B',
      inputs: [
        {
          name: 'Primary Input',
          id: 'input1node4',
          type: 'string',
          handleColor: '#45B7D1',
        },
        {
          id: 'panel1',
          name: 'Advanced Settings',
          inputs: [
            {
              id: 'panel1_input1',
              name: 'Threshold Value',
              type: 'number',
              handleColor: '#96CEB4',
            },
            {
              id: 'panel1_input2',
              name: 'Configuration String',
              type: 'string',
              handleColor: '#4ECDC4',
            },
            {
              id: 'panel1_input3',
              name: 'Max Iterations',
              type: 'number',
              handleColor: '#FF6B6B',
            },
          ],
        },
        {
          id: 'panel2',
          name: 'Debug Options',
          inputs: [
            {
              id: 'panel2_input1',
              name: 'Debug Mode',
              type: 'string',
              handleColor: '#FECA57',
            },
            {
              id: 'panel2_input2',
              name: 'Verbose Logging',
              type: 'string',
              handleColor: '#FF9FF3',
            },
          ],
        },
        {
          id: 'input2',
          name: 'Secondary Input',
          type: 'number',
          handleColor: '#A8E6CF',
        },
      ],
      outputs: [
        {
          id: 'output1',
          name: 'Final Result',
          type: 'string',
          handleColor: '#FFD93D',
        },
        {
          id: 'output2',
          name: 'Debug Output',
          type: 'string',
          handleColor: '#FF6B6B',
        },
      ],
    },
  },
  {
    id: 'n3',
    position: {x: 2000, y: 70},
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Data Sink',
      headerColor: '#B8860B',
      inputs: [
        {
          name: 'Final Input',
          id: 'input1node3',
          type: 'string',
          handleColor: '#FECA57',
        },
        {
          name: 'Result Input',
          id: 'input2node3',
          type: 'number',
          handleColor: '#FF9FF3',
        },
        {
          name: 'Status Input',
          id: 'input3node3',
          type: 'string',
          handleColor: '#A8E6CF',
        },
      ],
      outputs: [
        {
          name: 'Final Output',
          id: 'output1node3',
          type: 'string',
          handleColor: '#A8E6CF',
        },
        {
          name: 'Result Output',
          id: 'output2node3',
          type: 'number',
          handleColor: '#FFD93D',
        },
      ],
    },
  },
];

const edgesExample1Data: Edges = [
  {
    id: 'n1-n2',
    source: 'n1',
    sourceHandle: 'output2node1',
    target: 'n2',
    targetHandle: 'input1node2',
    type: 'configurableEdge',
  },
  {
    id: 'n2-n3',
    source: 'n2',
    sourceHandle: 'output1node2',
    target: 'n3',
    targetHandle: 'input1node3',
    type: 'configurableEdge',
  },
  {
    id: 'n2-n3-2',
    source: 'n2',
    sourceHandle: 'output2node2',
    target: 'n3',
    targetHandle: 'input2node3',
    type: 'configurableEdge',
  },
  {
    id: 'n2-n4',
    source: 'n2',
    sourceHandle: 'output3node2',
    target: 'n4',
    targetHandle: 'input1node4',
    type: 'configurableEdge',
  },
  {
    id: 'n5-n1',
    source: 'n5',
    sourceHandle: 'output1node5',
    target: 'n1',
    targetHandle: 'input1node1',
    type: 'configurableEdge',
  },
  {
    id: 'n5-n2',
    source: 'n5',
    sourceHandle: 'output2node5',
    target: 'n2',
    targetHandle: 'input3node2',
    type: 'configurableEdge',
  },
];

export const Playground: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: dataTypesExample1Data,
      typeOfNodes: typeOfNodesExample1Data,
      nodes: nodesExample1Data,
      edges: edgesExample1Data,
      nodeIdToNodeType: {},
    });
    console.log(state);

    return (
      <>
        <FullGraph state={state} dispatch={dispatch} />
        <div className='absolute top-0 left-0 p-1 flex gap-1 items-center'>
          <Button
            onClick={() => {
              dispatch({
                type: 'ADD_NODE',
                payload: { type: 'nodeType1', position: { x: 0, y: 0 } },
              });
            }}
            className='text-[15px] leading-[15px]'
          >
            Add Data Processor
          </Button>
          <Button
            onClick={() => {
              dispatch({
                type: 'ADD_NODE',
                payload: {
                  type: 'nodeTypeWithPanels',
                  position: { x: 200, y: 0 },
                },
              });
            }}
            className='text-[15px] leading-[15px]'
          >
            Add Advanced Node
          </Button>
          {/* <Button
            onClick={() => {
              setNodesInner(nodes ?? []);
              setEdgesInner(edges ?? []);
            }}
            className='text-[15px] leading-[15px]'
          >
            Update graph from args
          </Button> */}
          <div className='text-primary-white'>
            {'<- Note: These are part of the story, not the component'}
          </div>
        </div>
      </>
    );
  },
};
