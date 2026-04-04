import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  SliderNumberInput,
  type SliderNumberInputProps,
} from './SliderNumberInput';
import { cn } from '@/utils/cnHelper';
import { fn } from 'storybook/test';
import { useArgs } from 'storybook/preview-api';

const meta = {
  title: 'Molecules/SliderNumberInput',
  component: SliderNumberInput,
  argTypes: {
    name: { control: 'text' },
    value: { control: 'number' },
    min: { control: 'number' },
    max: { control: 'number' },
    step: { control: 'number' },
    size: { control: 'select', options: ['normal', 'small'] },
    decimals: { control: 'number' },
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

// ═══════════════════════════════════════════════════════
// Basic stories
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// Size comparison
// ═══════════════════════════════════════════════════════

/** Side-by-side comparison of normal and small size variants. */
export const SizeComparison: Story = {
  render: () => {
    const [normalVal, setNormalVal] = useState(42.5);
    const [smallVal, setSmallVal] = useState(42.5);

    return (
      <div className='flex flex-col gap-6 p-4'>
        <div>
          <div className='mb-2 text-sm text-secondary-light-gray'>
            Normal (canvas-sized)
          </div>
          <SliderNumberInput
            name='Temperature'
            value={normalVal}
            onChange={setNormalVal}
            min={0}
            max={100}
          />
        </div>
        <div>
          <div className='mb-2 text-sm text-secondary-light-gray'>
            Small (toolbar-sized)
          </div>
          <SliderNumberInput
            name='Temperature'
            value={smallVal}
            onChange={setSmallVal}
            min={0}
            max={100}
            size='small'
          />
        </div>
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Small variant stories
// ═══════════════════════════════════════════════════════

/** Small variant used as an integer input (e.g. Max Loops). */
export const SmallInteger: Story = {
  render: () => {
    const [val, setVal] = useState(100);
    return (
      <div className='flex items-center gap-3 p-4'>
        <SliderNumberInput
          name='Max Loops'
          value={val}
          onChange={(v) => setVal(Math.max(1, Math.round(v)))}
          size='small'
          decimals={0}
        />
        <span className='font-mono text-xs text-secondary-light-gray'>
          value: {val}
        </span>
      </div>
    );
  },
};

/** Small variant used as a float input (e.g. autoplay interval). */
export const SmallFloat: Story = {
  render: () => {
    const [val, setVal] = useState(1.0);
    return (
      <div className='flex items-center gap-3 p-4'>
        <SliderNumberInput
          name='Interval'
          value={val}
          onChange={(v) => setVal(Math.max(0.5, v))}
          min={0.5}
          max={30}
          size='small'
        />
        <span className='font-mono text-xs text-secondary-light-gray'>
          value: {val.toFixed(1)}s
        </span>
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════

/** Dragging should work even at value=1 with decimals=0 (integer mode). */
export const EdgeCaseSmallValue: Story = {
  render: () => {
    const [val, setVal] = useState(1);
    return (
      <div className='flex flex-col gap-4 p-4'>
        <div className='text-xs text-secondary-light-gray'>
          Drag test: value starts at 1 with decimals=0, step=1. Drag should
          change value by whole integers.
        </div>
        <div className='flex items-center gap-3'>
          <SliderNumberInput
            name='Count'
            value={val}
            onChange={(v) => setVal(Math.max(1, Math.round(v)))}
            size='small'
            decimals={0}
            step={1}
          />
          <span className='font-mono text-xs text-secondary-light-gray'>
            value: {val}
          </span>
        </div>
      </div>
    );
  },
};

/** Value at zero should still allow dragging. */
export const EdgeCaseZeroValue: Story = {
  render: () => {
    const [val, setVal] = useState(0);
    return (
      <div className='flex flex-col gap-4 p-4'>
        <div className='text-xs text-secondary-light-gray'>
          Value starts at 0 with no min/max. Step is inferred from display
          precision.
        </div>
        <div className='flex items-center gap-3'>
          <SliderNumberInput
            name='Offset'
            value={val}
            onChange={setVal}
            size='small'
          />
          <span className='font-mono text-xs text-secondary-light-gray'>
            value: {val.toFixed(1)}
          </span>
        </div>
      </div>
    );
  },
};

/** No min/max/step — proportional drag based on current value. */
export const NoConstraints: Story = {
  render: () => {
    const [val, setVal] = useState(500);
    return (
      <div className='flex flex-col gap-4 p-4'>
        <div className='text-xs text-secondary-light-gray'>
          No min/max/step. Step scales proportionally with value.
        </div>
        <div className='flex items-center gap-3'>
          <SliderNumberInput name='Amount' value={val} onChange={setVal} />
          <span className='font-mono text-xs text-secondary-light-gray'>
            value: {val.toFixed(4)}
          </span>
        </div>
      </div>
    );
  },
};

/** With min/max and gradient fill. */
export const WithRange: Story = {
  render: () => {
    const [val, setVal] = useState(25);
    return (
      <div className='flex flex-col gap-4 p-4'>
        <div className='text-xs text-secondary-light-gray'>
          min=0, max=100, step=1 — shows gradient fill.
        </div>
        <div className='flex items-center gap-3'>
          <SliderNumberInput
            name='Progress'
            value={val}
            onChange={(v) => setVal(Math.round(v))}
            min={0}
            max={100}
            step={5}
            decimals={0}
          />
          <span className='font-mono text-xs text-secondary-light-gray'>
            {val}%
          </span>
        </div>
      </div>
    );
  },
};

/** Small variant with gradient fill. */
export const SmallWithRange: Story = {
  render: () => {
    const [val, setVal] = useState(60);
    return (
      <div className='flex items-center gap-3 p-4'>
        <SliderNumberInput
          name='Volume'
          value={val}
          onChange={(v) => setVal(Math.round(v))}
          min={0}
          max={100}
          size='small'
          decimals={0}
        />
        <span className='font-mono text-xs text-secondary-light-gray'>
          {val}%
        </span>
      </div>
    );
  },
};
