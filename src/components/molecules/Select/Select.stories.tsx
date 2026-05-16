import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
  SelectUnsupportedItem,
} from './Select';
import { cn } from '@/utils/cnHelper';

const meta = {
  title: 'Molecules/Select',
  component: Select,
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<{
  onValueChange?: (value: string | undefined) => void;
  disabled?: boolean;
  defaultValue?: string;
}>;

export const Playground: Story = {
  args: {
    onValueChange: fn(),
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className='w-[330px]'>
        <SelectValue placeholder='Select a fruit' />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Fruits</SelectLabel>
          <SelectItem value='apple'>Apple</SelectItem>
          <SelectItem value='banana'>Banana</SelectItem>
          <SelectItem value='blueberry'>Blueberry</SelectItem>
          <SelectItem value='grapes'>Grapes</SelectItem>
          <SelectItem value='pineapple'>Pineapple</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const Controlled: Story = {
  args: {
    onValueChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState<string | undefined>(undefined);

    const handleValueChange = (newValue: string | undefined) => {
      setValue(newValue);
      args.onValueChange?.(newValue);
    };

    return (
      <div className='space-y-4'>
        <div className='text-primary-white text-sm'>
          Selected value:{' '}
          <span className='font-semibold'>{value || 'None'}</span>
        </div>
        <Select value={value ?? ''} onValueChange={handleValueChange}>
          <SelectTrigger className='w-[200px]'>
            <SelectValue placeholder='Select a theme' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='light'>Light</SelectItem>
            <SelectItem value='dark'>Dark</SelectItem>
            <SelectItem value='system'>System</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  },
};

export const WithDeselect: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState<string | undefined>(undefined);

    return (
      <div className='space-y-4'>
        <div className='text-primary-white text-sm'>
          Selected value:{' '}
          <span className='font-semibold'>{value || 'None'}</span>
          <span className='ml-2 text-[#6B6B6B]'>
            (click the selected item to deselect)
          </span>
        </div>
        <Select value={value ?? ''} onValueChange={setValue} allowDeselect>
          <SelectTrigger className='w-[250px]'>
            <SelectValue placeholder='Select a gate mode' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='AND'>AND</SelectItem>
            <SelectItem value='OR'>OR</SelectItem>
            <SelectItem value='XOR'>XOR</SelectItem>
            <SelectItem value='NAND'>NAND</SelectItem>
            <SelectItem value='NOR'>NOR</SelectItem>
            <SelectItem value='XNOR'>XNOR</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  },
};

export const WithUnsupportedValue: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState<string | undefined>('INVALID_MODE');

    return (
      <div className='space-y-4'>
        <div className='text-primary-white text-sm'>
          Selected value:{' '}
          <span className='font-semibold'>{value || 'None'}</span>
          <span className='ml-2 text-[#6B6B6B]'>
            (value is not in the allowed list — shows red unsupported state)
          </span>
        </div>
        <Select value={value ?? ''} onValueChange={setValue} allowDeselect>
          <SelectTrigger className='w-[300px]'>
            <SelectValue
              placeholder='Select a mode'
              unsupportedLabel='unsupported'
            />
          </SelectTrigger>
          <SelectContent>
            <SelectUnsupportedItem />
            <SelectItem value='AND'>AND</SelectItem>
            <SelectItem value='OR'>OR</SelectItem>
            <SelectItem value='XOR'>XOR</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  },
};

export const WithGroups: Story = {
  args: {
    onValueChange: fn(),
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className='w-[280px]'>
        <SelectValue placeholder='Select a timezone' />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>North America</SelectLabel>
          <SelectItem value='est'>Eastern Standard Time (EST)</SelectItem>
          <SelectItem value='cst'>Central Standard Time (CST)</SelectItem>
          <SelectItem value='mst'>Mountain Standard Time (MST)</SelectItem>
          <SelectItem value='pst'>Pacific Standard Time (PST)</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Europe</SelectLabel>
          <SelectItem value='gmt'>Greenwich Mean Time (GMT)</SelectItem>
          <SelectItem value='cet'>Central European Time (CET)</SelectItem>
          <SelectItem value='eet'>Eastern European Time (EET)</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Asia</SelectLabel>
          <SelectItem value='ist'>India Standard Time (IST)</SelectItem>
          <SelectItem value='jst'>Japan Standard Time (JST)</SelectItem>
          <SelectItem value='kst'>Korea Standard Time (KST)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const WithSeparators: Story = {
  args: {
    onValueChange: fn(),
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className='w-[200px]'>
        <SelectValue placeholder='Select an action' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='copy'>Copy</SelectItem>
        <SelectItem value='paste'>Paste</SelectItem>
        <SelectItem value='cut'>Cut</SelectItem>
        <SelectSeparator />
        <SelectItem value='undo'>Undo</SelectItem>
        <SelectItem value='redo'>Redo</SelectItem>
        <SelectSeparator />
        <SelectItem value='delete'>Delete</SelectItem>
        <SelectItem value='select-all'>Select All</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  args: {
    onValueChange: fn(),
    disabled: true,
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className='w-[180px]'>
        <SelectValue placeholder='Disabled select' />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Options</SelectLabel>
          <SelectItem value='option1'>Option 1</SelectItem>
          <SelectItem value='option2'>Option 2</SelectItem>
          <SelectItem value='option3'>Option 3</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const WithDefaultValue: Story = {
  args: {
    onValueChange: fn(),
    defaultValue: 'banana',
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className='w-[180px]'>
        <SelectValue placeholder='Select a fruit' />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Fruits</SelectLabel>
          <SelectItem value='apple'>Apple</SelectItem>
          <SelectItem value='banana'>Banana</SelectItem>
          <SelectItem value='blueberry'>Blueberry</SelectItem>
          <SelectItem value='grapes'>Grapes</SelectItem>
          <SelectItem value='pineapple'>Pineapple</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const AdjustableParentWidth = {
  argTypes: {
    parentWidth: { control: { type: 'range', min: 200, max: 600, step: 50 } },
    parentBorder: { control: { type: 'boolean' } },
  },
  args: {
    parentWidth: 400,
    parentBorder: true,
  },
  render: ({
    parentWidth,
    parentBorder,
  }: {
    parentWidth: number;
    parentBorder: boolean;
  }) => {
    return (
      <div
        className={cn(
          'flex flex-col gap-4 border-2',
          parentBorder ? 'border-red-900' : 'border-transparent',
        )}
        style={{ width: parentWidth }}
      >
        <div className='text-primary-white text-sm'>
          Parent width: <span className='font-semibold'>{parentWidth}px</span>
        </div>
        <Select onValueChange={fn()}>
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Select with full width' />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Options</SelectLabel>
              <SelectItem value='option1'>
                Option 1 with some longer text
              </SelectItem>
              <SelectItem value='option2'>Option 2</SelectItem>
              <SelectItem value='option3'>
                Option 3 with even longer text that might wrap
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    );
  },
} satisfies StoryObj<Meta<{ parentWidth: number; parentBorder: boolean }>>;
