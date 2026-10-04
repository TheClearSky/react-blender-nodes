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
      <div className='rbn:flex rbn:justify-center rbn:items-center rbn:min-h-screen rbn:p-8'>
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
    <div className='rbn:flex rbn:flex-col rbn:gap-0 rbn:rounded-md rbn:w-max rbn:border-[1.5px] rbn:border-transparent'>
      <div className='rbn:text-primary-white rbn:text-left rbn:text-[27px] rbn:leading-[27px] rbn:font-main rbn:px-4 rbn:py-2 rbn:rounded-t-md rbn:bg-[#C44536]'>
        {label}
      </div>
      <div className='rbn:min-h-[50px] rbn:rounded-b-md rbn:bg-primary-dark-gray rbn:px-6 rbn:py-4'>
        <div className='rbn:text-primary-white rbn:text-[27px] rbn:leading-[27px] rbn:font-main'>
          Bit 1
        </div>
        <div className='rbn:text-primary-white rbn:text-[27px] rbn:leading-[27px] rbn:font-main'>
          Bit 2
        </div>
        <div className='rbn:text-primary-white rbn:text-[27px] rbn:leading-[27px] rbn:font-main rbn:text-right'>
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
      <div className='rbn:flex rbn:flex-wrap rbn:gap-8'>
        {states.map((state) => (
          <div
            key={state}
            className='rbn:flex rbn:flex-col rbn:items-center rbn:gap-2'
          >
            <span className='rbn:text-primary-white rbn:text-[14px] rbn:font-main rbn:uppercase rbn:tracking-wider'>
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
      <div className='rbn:flex rbn:flex-col rbn:items-center rbn:gap-4'>
        <span className='rbn:text-primary-white rbn:text-[18px] rbn:font-main'>
          Current state:{' '}
          <span className='rbn:text-primary-blue rbn:font-semibold'>
            {currentState}
          </span>
        </span>
        <button
          onClick={() => setIndex((prev) => (prev + 1) % states.length)}
          className='rbn:px-4 rbn:py-2 rbn:bg-primary-blue rbn:text-primary-white rbn:rounded-md rbn:cursor-pointer rbn:text-[14px] rbn:font-main'
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
