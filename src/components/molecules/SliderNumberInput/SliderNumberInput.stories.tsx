import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  SliderNumberInput,
  type SliderNumberInputProps,
} from './SliderNumberInput';
import { cn } from '@/utils/cnHelper';
import { fn } from 'storybook/test';
import { useArgs } from 'storybook/preview-api';

const meta = {
  component: SliderNumberInput,
  argTypes: {
    name: {
      control: 'text',
    },
    value: {
      control: 'number',
    },
    min: {
      control: 'number',
    },
    max: {
      control: 'number',
    },
    step: {
      control: 'number',
    },
  },
  args: {
    name: 'Price',
    value: 7.2,
    onChange: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SliderNumberInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground = {
  render: (args) => {
    const [_, updateArgs] = useArgs();
    function onChangeWrapper(value: number) {
      updateArgs({ value });
      args.onChange?.(value);
    }

    return <SliderNumberInput {...args} onChange={onChangeWrapper} />;
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
    value: undefined,
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
        <SliderNumberInput className='w-full' {...args} />
        <SliderNumberInput
          className='w-full'
          {...args}
          name={`A ${'really '.repeat(5)} long name`}
        />
      </div>
    );
  },
} satisfies StoryObj<
  Meta<SliderNumberInputProps & { parentWidth: number; parentBorder: boolean }>
>;
