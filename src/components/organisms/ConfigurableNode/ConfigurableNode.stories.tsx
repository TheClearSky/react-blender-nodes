import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  ConfigurableNode,
  type ConfigurableNodeProps,
} from './ConfigurableNode';

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
