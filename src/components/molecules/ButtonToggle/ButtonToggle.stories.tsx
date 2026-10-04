import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useArgs } from 'storybook/preview-api';
import { ButtonToggle } from './ButtonToggle';

const twoOptions = [
  { value: 'instant', label: 'Instant' },
  { value: 'stepByStep', label: 'Step-by-Step' },
];

const threeOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const meta = {
  title: 'Molecules/ButtonToggle',
  component: ButtonToggle,
  argTypes: {
    size: { control: 'select', options: ['normal', 'small'] },
    disabled: { control: 'boolean' },
  },
  args: {
    options: twoOptions,
    value: 'instant',
    onChange: fn(),
    size: 'normal',
    disabled: false,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ButtonToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

// ═══════════════════════════════════════════════════════
// Basic stories
// ═══════════════════════════════════════════════════════

/** Interactive playground — synced with the Controls panel. */
export const Playground: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <ButtonToggle
        {...args}
        onChange={(v) => {
          updateArgs({ value: v });
          args.onChange?.(v);
        }}
      />
    );
  },
};

/** Small variant used in compact toolbars. */
export const Small: Story = {
  args: {
    options: [
      { value: 'execution', label: 'Execution' },
      { value: 'wallClock', label: 'Wall Clock' },
    ],
    value: 'execution',
    size: 'small',
  },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <ButtonToggle
        {...args}
        onChange={(v) => {
          updateArgs({ value: v });
          args.onChange?.(v);
        }}
      />
    );
  },
};

/** Three options in normal size. */
export const ThreeOptions: Story = {
  args: { options: threeOptions, value: 'medium' },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <ButtonToggle
        {...args}
        onChange={(v) => {
          updateArgs({ value: v });
          args.onChange?.(v);
        }}
      />
    );
  },
};

/** Disabled state — all buttons are non-interactive. */
export const Disabled: Story = {
  args: { disabled: true },
};

// ═══════════════════════════════════════════════════════
// Comparison
// ═══════════════════════════════════════════════════════

/** Side-by-side comparison of normal and small size variants. */
export const SizeComparison: Story = {
  render: () => {
    const [normalVal, setNormalVal] = useState('instant');
    const [smallVal, setSmallVal] = useState('execution');
    return (
      <div className='rbn:flex rbn:flex-col rbn:gap-6 rbn:p-4'>
        <div className='rbn:flex rbn:flex-col rbn:gap-1'>
          <span className='rbn:text-[11px] rbn:text-secondary-light-gray'>
            Normal
          </span>
          <ButtonToggle
            options={twoOptions}
            value={normalVal}
            onChange={setNormalVal}
          />
        </div>
        <div className='rbn:flex rbn:flex-col rbn:gap-1'>
          <span className='rbn:text-[11px] rbn:text-secondary-light-gray'>
            Small
          </span>
          <ButtonToggle
            options={[
              { value: 'execution', label: 'Execution' },
              { value: 'wallClock', label: 'Wall Clock' },
            ]}
            value={smallVal}
            onChange={setSmallVal}
            size='small'
          />
        </div>
        <div className='rbn:flex rbn:flex-col rbn:gap-1'>
          <span className='rbn:text-[11px] rbn:text-secondary-light-gray'>
            Three options (normal)
          </span>
          <ButtonToggle
            options={threeOptions}
            value='medium'
            onChange={() => {}}
          />
        </div>
        <div className='rbn:flex rbn:flex-col rbn:gap-1'>
          <span className='rbn:text-[11px] rbn:text-secondary-light-gray'>
            Three options (small)
          </span>
          <ButtonToggle
            options={threeOptions}
            value='medium'
            onChange={() => {}}
            size='small'
          />
        </div>
      </div>
    );
  },
};
