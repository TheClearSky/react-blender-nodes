import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input, type InputProps } from './Input';
import { fn } from 'storybook/test';
import { useArgs } from 'storybook/internal/preview-api';
import { cn } from '@/utils/cnHelper';

const meta = {
  component: Input,
  argTypes: {},
  tags: ['autodocs'],
} satisfies Meta<InputProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground = {} satisfies Story;

export const AllowOnlyNumbers: Story = {
  args: {
    allowOnlyNumbers: true,
  },
};

export const Controlled: Story = {
  args: {
    value: 'Hello',
    onChange: fn(),
  },
  render: (args) => {
    const [, setArgs] = useArgs();
    function onChangeWrapper(value: string | number) {
      setArgs({ ...args, value });
      if (args.allowOnlyNumbers) {
        args.onChange?.(value as number);
      } else {
        args.onChange?.(value as string);
      }
    }
    return <Input {...args} onChange={onChangeWrapper} />;
  },
};

export const ControlledAllowOnlyNumbers: Story = {
  args: {
    value: 10,
    allowOnlyNumbers: true,
    onChange: fn(),
  },
  render: (args) => {
    const [, setArgs] = useArgs();
    function onChangeWrapper(value: string | number) {
      setArgs({ ...args, value });
      if (args.allowOnlyNumbers) {
        args.onChange?.(value as number);
      } else {
        args.onChange?.(value as string);
      }
    }
    return <Input {...args} onChange={onChangeWrapper} />;
  },
};

export const AdjustableParentWidthWithFullWidth = {
  argTypes: {
    parentWidth: { control: { type: 'range', min: 1, max: 1000, step: 30 } },
    parentBorder: { control: { type: 'boolean' } },
  },
  args: {
    parentWidth: 300,
    parentBorder: true,
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
        <Input className='w-full' {...args} />
      </div>
    );
  },
} satisfies StoryObj<Meta<{ parentWidth: number; parentBorder: boolean }>>;
