import type { Meta, StoryObj } from '@storybook/react-vite';

import { Checkbox, type CheckboxProps } from './Checkbox';
import { fn } from 'storybook/test';
import { useArgs } from 'storybook/internal/preview-api';
import type { CheckedState } from '@radix-ui/react-checkbox';

const meta = {
  component: Checkbox,
  argTypes: {},
  tags: ['autodocs'],
} satisfies Meta<CheckboxProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground = {} satisfies Story;

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const Controlled: Story = {
  args: {
    checked: true,
    onCheckedChange: fn(),
  },
  render: (args) => {
    const [, setArgs] = useArgs();
    function onChangeWrapper(value: CheckedState) {
      setArgs({ ...args, checked: value });
      args.onCheckedChange?.(value);
    }
    return <Checkbox {...args} onCheckedChange={onChangeWrapper} />;
  },
};
