import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Button, type ButtonProps } from './Button';
import { cn } from '@/utils/cnHelper';

const meta = {
  title: 'Atoms/Button',
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

export const AdjustableParentWidthWithFullWidth = {
  argTypes: {
    parentWidth: { control: { type: 'range', min: 1, max: 1000, step: 30 } },
    parentBorder: { control: { type: 'boolean' } },
  },
  args: {
    parentWidth: 1000,
    parentBorder: true,
  },
  render: ({ parentWidth, parentBorder, ...args }) => {
    return (
      <div
        className={cn(
          'rbn:flex rbn:flex-col rbn:gap-2 rbn:border-5',
          parentBorder ? 'rbn:border-red-900' : 'rbn:border-transparent',
        )}
        style={{ width: parentWidth }}
      >
        <Button {...args}>
          <span className='rbn:truncate'>{`Some ${'really '.repeat(10)}long text`}</span>
        </Button>
        <Button {...args}>
          <span className='rbn:truncate'>
            Note that these buttons have a child span for flexbox to work
          </span>
        </Button>
      </div>
    );
  },
} satisfies StoryObj<
  Meta<ButtonProps & { parentWidth: number; parentBorder: boolean }>
>;
