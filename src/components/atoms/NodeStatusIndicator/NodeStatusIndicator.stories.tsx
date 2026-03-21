import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import {
  NodeStatusIndicator,
  type NodeStatusIndicatorProps,
} from './NodeStatusIndicator';
import type { NodeVisualState, GraphError } from '@/utils/nodeRunner/types';
import { nodeVisualStates } from '@/utils/nodeRunner/types';

const meta = {
  title: 'Atoms/NodeStatusIndicator',
  component: NodeStatusIndicator,
  argTypes: {
    visualState: {
      control: 'select',
      options: [...nodeVisualStates],
    },
  },
  decorators: [
    (Story) => (
      <div className='flex justify-center items-center min-h-screen p-8'>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<NodeStatusIndicatorProps>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A mock node for wrapping inside the indicator */
function MockNode({ label = 'AND Gate' }: { label?: string }) {
  return (
    <div className='flex flex-col gap-0 rounded-md w-max border-[1.5px] border-transparent'>
      <div className='text-primary-white text-left text-[27px] leading-[27px] font-main px-4 py-2 rounded-t-md bg-[#C44536]'>
        {label}
      </div>
      <div className='min-h-[50px] rounded-b-md bg-primary-dark-gray px-6 py-4'>
        <div className='text-primary-white text-[27px] leading-[27px] font-main'>
          Bit 1
        </div>
        <div className='text-primary-white text-[27px] leading-[27px] font-main'>
          Bit 2
        </div>
        <div className='text-primary-white text-[27px] leading-[27px] font-main text-right'>
          Output
        </div>
      </div>
    </div>
  );
}

export const Playground: Story = {
  args: {
    visualState: 'idle',
    children: <MockNode />,
  },
};

export const Idle: Story = {
  args: {
    visualState: 'idle',
    children: <MockNode label='Idle Node' />,
  },
};

export const Running: Story = {
  args: {
    visualState: 'running',
    children: <MockNode label='Running Node' />,
  },
};

export const Completed: Story = {
  args: {
    visualState: 'completed',
    children: <MockNode label='Completed Node' />,
  },
};

export const Errored: Story = {
  args: {
    visualState: 'errored',
    errors: [
      {
        message: 'Cannot read property "value" of undefined',
        nodeId: 'node-123',
        nodeTypeId: 'andGate',
        nodeTypeName: 'AND Gate',
        path: [
          {
            nodeId: 'node-100',
            nodeTypeId: 'boolConst',
            nodeTypeName: 'Boolean Constant',
            concurrencyLevel: 0,
          },
          {
            nodeId: 'node-123',
            nodeTypeId: 'andGate',
            nodeTypeName: 'AND Gate',
            handleId: 'input-0',
            concurrencyLevel: 1,
          },
        ],
        timestamp: 15.2,
        duration: 0.3,
        originalError: new Error('Cannot read property "value" of undefined'),
      },
    ] satisfies ReadonlyArray<GraphError>,
    children: <MockNode label='Errored Node' />,
  },
};

export const Skipped: Story = {
  args: {
    visualState: 'skipped',
    children: <MockNode label='Skipped Node' />,
  },
};

export const Warning: Story = {
  args: {
    visualState: 'warning',
    warnings: [
      'No function implementation found for node type "customProcessor".',
      'This node will error if reached during execution.',
    ],
    children: <MockNode label='Warning Node' />,
  },
};

export const ErroredWithMultipleErrors: Story = {
  args: {
    visualState: 'errored',
    errors: [
      {
        message: 'Division by zero',
        nodeId: 'node-200',
        nodeTypeId: 'divider',
        nodeTypeName: 'Divider',
        path: [
          {
            nodeId: 'node-200',
            nodeTypeId: 'divider',
            nodeTypeName: 'Divider',
            concurrencyLevel: 2,
          },
        ],
        timestamp: 42.1,
        duration: 0.01,
        originalError: new Error('Division by zero'),
      },
      {
        message: 'Downstream failure: input value was NaN',
        nodeId: 'node-200',
        nodeTypeId: 'divider',
        nodeTypeName: 'Divider',
        path: [
          {
            nodeId: 'node-200',
            nodeTypeId: 'divider',
            nodeTypeName: 'Divider',
            concurrencyLevel: 2,
          },
        ],
        timestamp: 42.15,
        duration: 0.02,
        originalError: new Error('Downstream failure: input value was NaN'),
      },
    ] satisfies ReadonlyArray<GraphError>,
    children: <MockNode label='Multi-Error Node' />,
  },
};

/**
 * Shows all six visual states side by side for comparison.
 */
export const AllStates: Story = {
  args: { visualState: 'idle', children: null },
  render: () => {
    const states: NodeVisualState[] = [
      'idle',
      'running',
      'completed',
      'errored',
      'skipped',
      'warning',
    ];

    const mockErrors: ReadonlyArray<GraphError> = [
      {
        message: 'Something went wrong',
        nodeId: 'err-node',
        nodeTypeId: 'gate',
        nodeTypeName: 'Gate',
        path: [],
        timestamp: 10,
        duration: 0.5,
        originalError: new Error('Something went wrong'),
      },
    ];

    const mockWarnings = ['Missing function implementation for "customNode"'];

    return (
      <div className='flex flex-wrap gap-8'>
        {states.map((state) => (
          <div key={state} className='flex flex-col items-center gap-2'>
            <span className='text-primary-white text-[14px] font-main uppercase tracking-wider'>
              {state}
            </span>
            <NodeStatusIndicator
              visualState={state}
              errors={state === 'errored' ? mockErrors : undefined}
              warnings={state === 'warning' ? mockWarnings : undefined}
            >
              <MockNode label={`${state[0].toUpperCase()}${state.slice(1)}`} />
            </NodeStatusIndicator>
          </div>
        ))}
      </div>
    );
  },
};

/**
 * Interactive demo: cycle through states by clicking.
 */
export const InteractiveCycler: Story = {
  args: { visualState: 'idle', children: null },
  render: () => {
    const states: NodeVisualState[] = [
      'idle',
      'running',
      'completed',
      'errored',
      'skipped',
      'warning',
    ];
    const [index, setIndex] = useState(0);
    const currentState = states[index];

    const mockErrors: ReadonlyArray<GraphError> = [
      {
        message: 'Test error for interactive demo',
        nodeId: 'interactive-node',
        nodeTypeId: 'testGate',
        nodeTypeName: 'Test Gate',
        path: [],
        timestamp: 5,
        duration: 1.2,
        originalError: new Error('Test error for interactive demo'),
      },
    ];

    return (
      <div className='flex flex-col items-center gap-4'>
        <span className='text-primary-white text-[18px] font-main'>
          Current state:{' '}
          <span className='text-primary-blue font-semibold'>
            {currentState}
          </span>
        </span>
        <button
          onClick={() => setIndex((prev) => (prev + 1) % states.length)}
          className='px-4 py-2 bg-primary-blue text-primary-white rounded-md cursor-pointer text-[14px] font-main'
        >
          Next State &rarr;
        </button>
        <NodeStatusIndicator
          visualState={currentState}
          errors={currentState === 'errored' ? mockErrors : undefined}
          warnings={
            currentState === 'warning' ? ['Missing implementation'] : undefined
          }
        >
          <MockNode label='Click to Cycle' />
        </NodeStatusIndicator>
      </div>
    );
  },
};
