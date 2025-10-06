import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollableButtonContainer } from './ScrollableButtonContainer';
import { cn } from '@/utils/cnHelper';

const meta = {
  component: ScrollableButtonContainer,
  args: {
    orientation: 'horizontal',
    showArrows: true,
    disabled: false,
    observeChildren: true,
    className: 'text-[27px] leading-[27px] font-main text-primary-white',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ScrollableButtonContainer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {},
  render: (args) => (
    <div
      className={cn(
        'border border-red-600',
        args.orientation === 'horizontal' ? 'w-[400px]' : 'h-[200px] w-fit',
      )}
    >
      <ScrollableButtonContainer {...args}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className='px-3 py-2 rounded-md border border-secondary-dark-gray bg-primary-black'
          >
            Item {i + 1}
          </div>
        ))}
      </ScrollableButtonContainer>
    </div>
  ),
};

export const HorizontalAdjustableWidth = {
  argTypes: {
    parentWidth: { control: { type: 'range', min: 200, max: 800, step: 50 } },
    parentBorder: { control: { type: 'boolean' } },
  },
  args: {
    parentWidth: 400,
    parentBorder: true,
  },
  render: ({ parentWidth, parentBorder, ...args }: any) => (
    <div
      className={cn(
        'border-2',
        parentBorder ? 'border-red-900' : 'border-transparent',
      )}
      style={{ width: parentWidth }}
    >
      <ScrollableButtonContainer orientation='horizontal' {...args}>
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className='px-3 py-2 rounded-md border border-secondary-dark-gray bg-primary-black'
          >
            Long label item {i + 1}
          </div>
        ))}
      </ScrollableButtonContainer>
    </div>
  ),
} satisfies StoryObj<Meta<{ parentWidth: number; parentBorder: boolean }>>;

export const Vertical: Story = {
  args: {
    orientation: 'vertical',
  },
  render: (args) => (
    <div
      className={cn(
        'border border-red-600',
        args.orientation === 'horizontal' ? 'w-[400px]' : 'h-[200px] w-fit',
      )}
    >
      <ScrollableButtonContainer {...args}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className='px-3 py-2 rounded-md border border-secondary-dark-gray bg-primary-black w-full'
          >
            Row {i + 1}
          </div>
        ))}
      </ScrollableButtonContainer>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  render: (args) => (
    <div
      className={cn(
        'border border-red-600',
        args.orientation === 'horizontal' ? 'w-[400px]' : 'h-[200px] w-fit',
      )}
    >
      <ScrollableButtonContainer {...args}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className='px-3 py-2 rounded-md border border-secondary-dark-gray bg-primary-black'
          >
            Disabled {i + 1}
          </div>
        ))}
      </ScrollableButtonContainer>
    </div>
  ),
};
