import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tooltip } from './Tooltip';
import { Timer, Layers, Zap, AlertTriangle } from 'lucide-react';

const meta = {
  title: 'Atoms/Tooltip',
  component: Tooltip,
  argTypes: {
    content: { control: 'text' },
    infoIcon: { control: 'boolean' },
    placement: {
      control: 'select',
      options: ['top', 'bottom', 'left', 'right'],
    },
    maxWidth: { control: 'number' },
  },
  args: {
    content: 'This is a tooltip',
    infoIcon: false,
    placement: 'bottom',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className='flex min-h-[200px] items-center justify-center p-12'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

// ═══════════════════════════════════════════════════════
// Basic
// ═══════════════════════════════════════════════════════

/** Default tooltip with info icon and text content. */
export const Default: Story = {
  args: {
    content:
      'Automatically scroll the timeline and canvas to follow the selected step',
    children: (
      <span className='text-[12px] text-primary-white'>Auto-scroll</span>
    ),
  },
};

/** Tooltip without the info icon. */
export const WithoutInfoIcon: Story = {
  args: {
    content: 'Total execution duration',
    infoIcon: false,
    children: (
      <span className='flex items-center gap-1 text-[12px] text-primary-white'>
        <Timer className='h-3.5 w-3.5' />
        42.50ms
      </span>
    ),
  },
};

// ═══════════════════════════════════════════════════════
// Placement
// ═══════════════════════════════════════════════════════

/** Tooltip appearing above the trigger. */
export const PlacementTop: Story = {
  args: {
    content: 'I appear on top',
    placement: 'top',
    children: (
      <span className='text-[12px] text-primary-white'>Hover me (top)</span>
    ),
  },
};

/** Tooltip appearing to the right. */
export const PlacementRight: Story = {
  args: {
    content: 'I appear on the right',
    placement: 'right',
    children: (
      <span className='text-[12px] text-primary-white'>Hover me (right)</span>
    ),
  },
};

// ═══════════════════════════════════════════════════════
// Rich content (ReactNode)
// ═══════════════════════════════════════════════════════

/** Tooltip with ReactNode content including icons and formatting. */
export const RichContent: Story = {
  args: {
    content: (
      <div className='space-y-1.5'>
        <div className='flex items-center gap-1.5 font-semibold'>
          <AlertTriangle className='h-3.5 w-3.5 text-status-warning' />
          Warning
        </div>
        <div className='text-[11px] text-secondary-light-gray'>
          This loop exceeded the maximum iteration count. Check your exit
          condition.
        </div>
      </div>
    ),
    maxWidth: 280,
    children: (
      <span className='text-[12px] text-status-warning'>Loop error</span>
    ),
  },
};

/** Tooltip with multi-line structured content. */
export const StructuredContent: Story = {
  args: {
    content: (
      <div className='space-y-1'>
        <div>
          <span className='font-semibold'>Execution</span> — Shows only
          computation time with pauses removed.
        </div>
        <div>
          <span className='font-semibold'>Wall Clock</span> — Shows real elapsed
          time including pauses.
        </div>
      </div>
    ),
    maxWidth: 260,
    infoIcon: true,
    children: <span className='text-[12px] text-primary-white'>Time mode</span>,
  },
};

// ═══════════════════════════════════════════════════════
// Icon triggers
// ═══════════════════════════════════════════════════════

/** Tooltip on an icon-only trigger (no info icon needed). */
export const IconTrigger: Story = {
  args: {
    content: 'Zoom in',
    infoIcon: false,
    children: <Zap className='h-4 w-4 text-primary-white' />,
  },
};

/** Tooltip on a compound icon + text trigger. */
export const IconWithText: Story = {
  args: {
    content: 'Total number of executed steps',
    infoIcon: false,
    children: (
      <span className='flex items-center gap-1 font-mono text-[12px] text-primary-white'>
        <Layers className='h-3.5 w-3.5' />
        48 steps
      </span>
    ),
  },
};

// ═══════════════════════════════════════════════════════
// Max width
// ═══════════════════════════════════════════════════════

/** Narrow tooltip with constrained width. */
export const NarrowWidth: Story = {
  args: {
    content:
      'JIT warmup time — absorbed before execution to ensure accurate step timings',
    maxWidth: 160,
    infoIcon: false,
    children: (
      <span className='flex items-center gap-1 font-mono text-[12px] text-primary-white'>
        <Zap className='h-3.5 w-3.5' />
        JIT 2.3ms
      </span>
    ),
  },
};

/** Wide tooltip for longer content. */
export const WideWidth: Story = {
  args: {
    content:
      'This is a much wider tooltip that can contain more detailed explanations without wrapping too aggressively. Useful for complex features that need more context.',
    maxWidth: 360,
    children: (
      <span className='text-[12px] text-primary-white'>Hover for details</span>
    ),
  },
};
