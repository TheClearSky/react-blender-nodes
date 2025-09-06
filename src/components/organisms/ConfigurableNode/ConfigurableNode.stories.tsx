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
    name: 'Data Processing Node',
    headerColor: '#C44536',
    inputs: [
      { id: 'input1', name: 'Text Input', type: 'string', handleColor: '#45B7D1' },
      { id: 'input2', name: 'Numeric Input', type: 'number', handleColor: '#96CEB4' },
    ],
    outputs: [
      { id: 'output1', name: 'Processed Text', type: 'string', handleColor: '#FECA57' },
      { id: 'output2', name: 'Processed Number', type: 'number', handleColor: '#FF9FF3' },
    ],
  },
} satisfies Story;

export const WithCollapsiblePanels = {
  args: {
    name: 'Advanced Configuration Node',
    headerColor: '#2D5A87',
    inputs: [
      { id: 'input1', name: 'Primary Input', type: 'string', handleColor: '#45B7D1' },
      {
        id: 'panel1',
        name: 'Advanced Settings',
        inputs: [
          { id: 'panel1_input1', name: 'Threshold Value', type: 'number', handleColor: '#96CEB4' },
          { id: 'panel1_input2', name: 'Configuration String', type: 'string', handleColor: '#4ECDC4' },
          { id: 'panel1_input3', name: 'Max Iterations', type: 'number', handleColor: '#FF6B6B' },
        ],
      },
      {
        id: 'panel2',
        name: 'Debug Options',
        inputs: [
          { id: 'panel2_input1', name: 'Debug Mode', type: 'string', handleColor: '#FECA57' },
          { id: 'panel2_input2', name: 'Verbose Logging', type: 'string', handleColor: '#FF9FF3' },
        ],
      },
      { id: 'input2', name: 'Secondary Input', type: 'number', handleColor: '#A8E6CF' },
    ],
    outputs: [{ id: 'output1', name: 'Final Result', type: 'string', handleColor: '#FFD93D' }],
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

    name: 'Responsive Data Node',
    headerColor: '#B8860B',
    inputs: [
      { id: 'input1', name: 'Text Input', type: 'string', handleColor: '#45B7D1' },
      { id: 'input2', name: 'Numeric Input', type: 'number', handleColor: '#96CEB4' },
    ],
    outputs: [
      { id: 'output1', name: 'Processed Text', type: 'string', handleColor: '#FECA57' },
      { id: 'output2', name: 'Processed Number', type: 'number', handleColor: '#FF9FF3' },
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
