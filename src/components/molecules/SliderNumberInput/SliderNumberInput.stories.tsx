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
          'rbn:flex rbn:flex-col rbn:gap-2 rbn:border-5',
          parentBorder ? 'rbn:border-red-900' : 'rbn:border-transparent',
        )}
        style={{ width: parentWidth }}
      >
        <SliderNumberInput className='rbn:w-full' {...args} />
        <SliderNumberInput
          className='rbn:w-full'
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
      <div className='rbn:flex rbn:flex-col rbn:gap-6 rbn:p-4'>
        <div>
          <div className='rbn:mb-2 rbn:text-sm rbn:text-secondary-light-gray'>
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
          <div className='rbn:mb-2 rbn:text-sm rbn:text-secondary-light-gray'>
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
      <div className='rbn:flex rbn:items-center rbn:gap-3 rbn:p-4'>
        <SliderNumberInput
          name='Max Loops'
          value={val}
          onChange={(v) => setVal(Math.max(1, Math.round(v)))}
          size='small'
          decimals={0}
        />
        <span className='rbn:font-mono rbn:text-xs rbn:text-secondary-light-gray'>
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
      <div className='rbn:flex rbn:items-center rbn:gap-3 rbn:p-4'>
        <SliderNumberInput
          name='Interval'
          value={val}
          onChange={(v) => setVal(Math.max(0.5, v))}
          min={0.5}
          max={30}
          size='small'
        />
        <span className='rbn:font-mono rbn:text-xs rbn:text-secondary-light-gray'>
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
      <div className='rbn:flex rbn:flex-col rbn:gap-4 rbn:p-4'>
        <div className='rbn:text-xs rbn:text-secondary-light-gray'>
          Drag test: value starts at 1 with decimals=0, step=1. Drag should
          change value by whole integers.
        </div>
        <div className='rbn:flex rbn:items-center rbn:gap-3'>
          <SliderNumberInput
            name='Count'
            value={val}
            onChange={(v) => setVal(Math.max(1, Math.round(v)))}
            size='small'
            decimals={0}
            step={1}
          />
          <span className='rbn:font-mono rbn:text-xs rbn:text-secondary-light-gray'>
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
      <div className='rbn:flex rbn:flex-col rbn:gap-4 rbn:p-4'>
        <div className='rbn:text-xs rbn:text-secondary-light-gray'>
          Value starts at 0 with no min/max. Step is inferred from display
          precision.
        </div>
        <div className='rbn:flex rbn:items-center rbn:gap-3'>
          <SliderNumberInput
            name='Offset'
            value={val}
            onChange={setVal}
            size='small'
          />
          <span className='rbn:font-mono rbn:text-xs rbn:text-secondary-light-gray'>
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
      <div className='rbn:flex rbn:flex-col rbn:gap-4 rbn:p-4'>
        <div className='rbn:text-xs rbn:text-secondary-light-gray'>
          No min/max/step. Step scales proportionally with value.
        </div>
        <div className='rbn:flex rbn:items-center rbn:gap-3'>
          <SliderNumberInput name='Amount' value={val} onChange={setVal} />
          <span className='rbn:font-mono rbn:text-xs rbn:text-secondary-light-gray'>
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
      <div className='rbn:flex rbn:flex-col rbn:gap-4 rbn:p-4'>
        <div className='rbn:text-xs rbn:text-secondary-light-gray'>
          min=0, max=100, step=1 — shows gradient fill.
        </div>
        <div className='rbn:flex rbn:items-center rbn:gap-3'>
          <SliderNumberInput
            name='Progress'
            value={val}
            onChange={(v) => setVal(Math.round(v))}
            min={0}
            max={100}
            step={5}
            decimals={0}
          />
          <span className='rbn:font-mono rbn:text-xs rbn:text-secondary-light-gray'>
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
      <div className='rbn:flex rbn:items-center rbn:gap-3 rbn:p-4'>
        <SliderNumberInput
          name='Volume'
          value={val}
          onChange={(v) => setVal(Math.round(v))}
          min={0}
          max={100}
          size='small'
          decimals={0}
        />
        <span className='rbn:font-mono rbn:text-xs rbn:text-secondary-light-gray'>
          {val}%
        </span>
      </div>
    );
  },
};

/**
 * `ariaLabel` gives the control its full spoken name while `name` stays the
 * short on-screen label that keeps it narrow.
 *
 * It applies to BOTH branches: the `role='group'` wrapper while this is a
 * slider, and the text field once you click the middle. Click in, then inspect
 * the field in the a11y pane — it should read "Duration in seconds", not "dur".
 *
 * Callers must NOT wrap this control in a `<label>` to supply that name. A
 * `<label>` binds to its first labelable descendant, which is the decrement
 * chevron, and the browser then propagates `:hover` to that chevron from
 * anywhere inside the label — the left chevron lights up while you hover the
 * middle. Hover the two below and compare.
 */
export const WithAccessibleName: Story = {
  render: () => {
    const [named, setNamed] = useState(16);
    const [wrapped, setWrapped] = useState(16);
    return (
      <div className='rbn:flex rbn:flex-col rbn:gap-6 rbn:p-4'>
        <div className='rbn:flex rbn:flex-col rbn:gap-1'>
          <span className='rbn:text-xs rbn:text-secondary-light-gray'>
            correct — ariaLabel, no label element
          </span>
          <SliderNumberInput
            name='dur s'
            ariaLabel='Duration in seconds'
            value={named}
            onChange={setNamed}
            size='small'
            decimals={2}
          />
        </div>
        <div className='rbn:flex rbn:flex-col rbn:gap-1'>
          <span className='rbn:text-xs rbn:text-secondary-light-gray'>
            wrong — wrapped in a label: hovering the middle also lights the left
            chevron
          </span>
          <label className='rbn:inline-flex rbn:w-max rbn:items-center'>
            <span className='rbn:sr-only'>Duration in seconds</span>
            <SliderNumberInput
              name='dur s'
              value={wrapped}
              onChange={setWrapped}
              size='small'
              decimals={2}
            />
          </label>
        </div>
      </div>
    );
  },
};
