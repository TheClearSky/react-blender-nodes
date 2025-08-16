import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Button, type ButtonProps } from './Button';

const meta = {
  component: Button,
  argTypes: {
    color: {
      control: 'select',
      options: ['dark', 'lightNonPriority', 'lightPriority'],
    },
  },
  args: {
    children: 'Button',
    onClick: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<ButtonProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground = {} satisfies Story;
