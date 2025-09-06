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
    name: 'dataType1',
    underlyingType: 'string',
    color: 'red',
  }),
  dataType2: makeDataTypeWithAutoInfer({
    name: 'dataType2',
    underlyingType: 'number',
    color: 'blue',
  }),
};

const typeOfNodesExample1Data = {
  nodeType1: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypesExample1Data>({
    name: 'nodeType1',
    inputs: [
      { name: 'input1', dataType: 'dataType1' },
      { name: 'input2', dataType: 'dataType2' },
    ],
    outputs: [{ name: 'output1', dataType: 'dataType1' }],
  }),
  nodeType2: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypesExample1Data>({
    name: 'nodeType2',
    inputs: [{ name: 'input1', dataType: 'dataType1' }],
    outputs: [{ name: 'output1', dataType: 'dataType1' }],
  }),
};

const nodesExample1Data: Nodes = [
  {
    id: 'n1',
    position: { x: -856, y: 274 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Node 1',
      outputs: [
        { name: 'Output 1', id: 'output1node1', type: 'number' },
        { name: 'Output 2', id: 'output2node1', type: 'number' },
      ],
      inputs: [
        { name: 'Input 1', id: 'input1node1', type: 'string' },
        { name: 'Input 2', id: 'input2node1', type: 'number' },
      ],
    },
  },
  {
    id: 'n2',
    position: { x: 274, y: 154 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Node 2',
      inputs: [
        { name: 'Input 1', id: 'input1node2', type: 'string' },
        { name: 'Input 2', id: 'input2node2', type: 'number' },
      ],
      outputs: [
        { name: 'Output 1', id: 'output1node2', type: 'string' },
        { name: 'Output 2', id: 'output2node2', type: 'number' },
      ],
    },
  },
  {
    id: 'n3',
    position: { x: -100, y: 586 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Node 3',
      inputs: [
        { name: 'Input 1', id: 'input1node3', type: 'string' },
        { name: 'Input 2', id: 'input2node3', type: 'number' },
      ],
      outputs: [
        { name: 'Output 1', id: 'output1node3', type: 'string' },
        { name: 'Output 2', id: 'output2node3', type: 'number' },
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
            Add node
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
