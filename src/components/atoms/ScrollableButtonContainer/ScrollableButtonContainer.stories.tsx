import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollableButtonContainer } from './ScrollableButtonContainer';
import { cn } from '@/utils/cnHelper';

const meta = {
  title: 'Atoms/ScrollableButtonContainer',
  component: ScrollableButtonContainer,
  args: {
    orientation: 'horizontal',
    showArrows: true,
    disabled: false,
    observeChildren: true,
    className:
      'rbn:text-[27px] rbn:leading-[27px] rbn:font-main rbn:text-primary-white',
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
        'rbn:border rbn:border-red-600',
        args.orientation === 'horizontal'
          ? 'rbn:w-[400px]'
          : 'rbn:h-[200px] rbn:w-fit',
      )}
    >
      <ScrollableButtonContainer {...args}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className='rbn:px-3 rbn:py-2 rbn:rounded-md rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black'
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
  render: ({
    parentWidth,
    parentBorder,
    ...args
  }: {
    parentWidth: number;
    parentBorder: boolean;
  }) => (
    <div
      className={cn(
        'rbn:border-2',
        parentBorder ? 'rbn:border-red-900' : 'rbn:border-transparent',
      )}
      style={{ width: parentWidth }}
    >
      <ScrollableButtonContainer orientation='horizontal' {...args}>
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className='rbn:px-3 rbn:py-2 rbn:rounded-md rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black'
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
        'rbn:border rbn:border-red-600',
        args.orientation === 'horizontal'
          ? 'rbn:w-[400px]'
          : 'rbn:h-[200px] rbn:w-fit',
      )}
    >
      <ScrollableButtonContainer {...args}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className='rbn:px-3 rbn:py-2 rbn:rounded-md rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:w-full'
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
        'rbn:border rbn:border-red-600',
        args.orientation === 'horizontal'
          ? 'rbn:w-[400px]'
          : 'rbn:h-[200px] rbn:w-fit',
      )}
    >
      <ScrollableButtonContainer {...args}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className='rbn:px-3 rbn:py-2 rbn:rounded-md rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black'
          >
            Disabled {i + 1}
          </div>
        ))}
      </ScrollableButtonContainer>
    </div>
  ),
};
