import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  NodeIdentityLabel,
  type NodeIdentityLabelProps,
} from './NodeIdentityLabel';

const meta = {
  title: 'Atoms/NodeIdentityLabel',
  component: NodeIdentityLabel,
  argTypes: {
    protect: { control: { type: 'inline-radio' }, options: ['type', 'custom'] },
  },
  tags: ['autodocs'],
  // A narrow fixed-width frame so the flex-shrink overflow priority is visible at a
  // glance (the component fills its container, so width is what makes overflow happen).
  decorators: [
    (Story) => (
      <div
        className='flex bg-primary-dark-gray p-2 text-[13px] text-primary-white'
        style={{ width: 180 }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<NodeIdentityLabelProps>;

export default meta;

type Story = StoryObj<typeof meta>;

/** No custom name — renders the type name alone. */
export const TypeOnly: Story = {
  args: { typeName: 'AND Gate', className: 'min-w-0' },
};

/** Short custom name fits fully alongside the dimmed type name. */
export const ShortCustomName: Story = {
  args: { typeName: 'AND Gate', customName: 'Summer', className: 'min-w-0' },
};

/**
 * `protect='type'` (default — canvas / wide surfaces): when too narrow for both, the
 * CUSTOM name ellipsizes first and `: AND Gate` stays whole (the type is the stable
 * identity).
 */
export const LongName_ProtectType: Story = {
  args: {
    typeName: 'AND Gate',
    customName: 'The Great Summer Adder Of Many Long Words',
    protect: 'type',
    className: 'min-w-0',
  },
};

/**
 * `protect='custom'` (timeline block): the TYPE ellipsizes first and the user's custom
 * name (the disambiguator) is kept whole — the opposite priority, for hard-capped
 * widths.
 */
export const LongName_ProtectCustom: Story = {
  args: {
    typeName: 'A Very Long Node Type Name Goes Here',
    customName: 'Summer',
    protect: 'custom',
    className: 'min-w-0',
  },
};
