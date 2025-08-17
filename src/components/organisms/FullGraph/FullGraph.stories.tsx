import type { Meta, StoryObj } from '@storybook/react-vite';

import { FullGraph } from './FullGraph';
import { Position } from '@xyflow/react';
import { fn } from 'storybook/test';
import { type Nodes, type Edges } from './FullGraph';
import { useArgs, useState } from 'storybook/preview-api';
import { Button } from '@/components/atoms';

const meta = {
  component: FullGraph,
} satisfies Meta<typeof FullGraph>;

export default meta;

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
        { name: 'Output 1', id: 'output1node1' },
        { name: 'Output 2', id: 'output2node1' },
      ],
      inputs: [
        { name: 'Input 1', id: 'input1node1' },
        { name: 'Input 2', id: 'input2node1' },
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
        { name: 'Input 1', id: 'input1node2' },
        { name: 'Input 2', id: 'input2node2' },
      ],
      outputs: [
        { name: 'Output 1', id: 'output1node2' },
        { name: 'Output 2', id: 'output2node2' },
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
        { name: 'Input 1', id: 'input1node3' },
        { name: 'Input 2', id: 'input2node3' },
      ],
      outputs: [
        { name: 'Output 1', id: 'output1node3' },
        { name: 'Output 2', id: 'output2node3' },
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
    type: 'configurabledge',
  },
];

export const Playground: StoryObj<typeof FullGraph> = {
  args: {
    nodes: nodesExample1Data,
    edges: edgesExample1Data,
    setNodes: fn(),
    setEdges: fn(),
    setNodesWithNoAsyncCheck: fn(),
    setEdgesWithNoAsyncCheck: fn(),
  },
  render: (args) => {
    const {
      setNodes,
      setEdges,
      setNodesWithNoAsyncCheck,
      setEdgesWithNoAsyncCheck,
      nodes,
      edges,
      ...rest
    } = args;
    const [___, setArgs] = useArgs();
    const [nodesInner, setNodesInner] = useState<Nodes>(nodes ?? []);
    const [edgesInner, setEdgesInner] = useState<Edges>(edges ?? []);

    return (
      <>
        <FullGraph
          {...rest}
          nodes={nodesInner}
          edges={edgesInner}
          setNodes={setNodesInner}
          setEdges={setEdgesInner}
          setNodesWithNoAsyncCheck={setNodesWithNoAsyncCheck}
          setEdgesWithNoAsyncCheck={setEdgesWithNoAsyncCheck}
        />
        <div className='absolute top-0 left-0 p-1 flex gap-1 items-center'>
          <Button
            onClick={() => setArgs({ nodes: nodesInner, edges: edgesInner })}
            className='text-[15px] leading-[15px]'
          >
            Update args from graph
          </Button>
          <Button
            onClick={() => {
              setNodesInner(nodes ?? []);
              setEdgesInner(edges ?? []);
            }}
            className='text-[15px] leading-[15px]'
          >
            Update graph from args
          </Button>
          <div className='text-primary-white'>
            {'<- Note: These are part of the story, not the component'}
          </div>
        </div>
      </>
    );
  },
};
