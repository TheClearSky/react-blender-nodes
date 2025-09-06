import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  ConfigurableNode,
  type ConfigurableNodeProps,
} from './ConfigurableNode';
import { cn } from '@/utils/cnHelper';

const meta = {
  component: ConfigurableNode,
  argTypes: {},
  tags: ['autodocs'],
} satisfies Meta<ConfigurableNodeProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground = {} satisfies Story;

export const WithInputsAndOutputs = {
  args: {
    name: 'Some Node With Inputs and Outputs',
    headerColor: '#2A4370',
    inputs: [
      { id: 'input1', name: 'Input 1', type: 'string' },
      { id: 'input2', name: 'Input 2', type: 'number' },
    ],
    outputs: [
      { id: 'output1', name: 'Output 1', type: 'string' },
      { id: 'output2', name: 'Output 2', type: 'number' },
    ],
  },
} satisfies Story;

export const WithCollapsiblePanels = {
  args: {
    name: 'Node With Collapsible Panels',
    headerColor: '#8B4513',
    inputs: [
      { id: 'input1', name: 'Direct Input', type: 'string' },
      {
        id: 'panel1',
        name: 'Advanced Settings',
        inputs: [
          { id: 'panel1_input1', name: 'Setting 1', type: 'number' },
          { id: 'panel1_input2', name: 'Setting 2', type: 'string' },
          { id: 'panel1_input3', name: 'Setting 3', type: 'number' },
        ],
      },
      {
        id: 'panel2',
        name: 'Debug Options',
        inputs: [
          { id: 'panel2_input1', name: 'Debug Mode', type: 'string' },
          { id: 'panel2_input2', name: 'Verbose Logging', type: 'string' },
        ],
      },
      { id: 'input2', name: 'Another Direct Input', type: 'number' },
    ],
    outputs: [{ id: 'output1', name: 'Result', type: 'string' }],
  },
} satisfies Story;

export const AdjustableParentWidthWithFullWidth = {
  argTypes: {
    parentWidth: { control: { type: 'range', min: 1, max: 1000, step: 30 } },
    parentBorder: { control: { type: 'boolean' } },
  },
  args: {
    parentWidth: 300,
    parentBorder: true,

    name: 'Some Node With Inputs and Outputs',
    headerColor: '#2A4370',
    inputs: [
      { id: 'input1', name: 'Input 1', type: 'string' },
      { id: 'input2', name: 'Input 2', type: 'number' },
    ],
    outputs: [
      { id: 'output1', name: 'Output 1', type: 'string' },
      { id: 'output2', name: 'Output 2', type: 'number' },
    ],
  },
  render: ({ parentWidth, parentBorder, ...args }) => {
    return (
      <div
        className={cn(
          'flex flex-col gap-2 border-5',
          parentBorder ? 'border-red-900' : 'border-transparent',
        )}
        style={{ width: parentWidth }}
      >
        <ConfigurableNode className='w-full' {...args} />
      </div>
    );
  },
} satisfies StoryObj<
  Meta<ConfigurableNodeProps & { parentWidth: number; parentBorder: boolean }>
>;
