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
} from './Select';
import { cn } from '@/utils/cnHelper';

const meta = {
  component: Select,
  argTypes: {
    onValueChange: {
      action: 'value changed',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground = {
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
} satisfies Story;

export const Controlled = {
  args: {
    onValueChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState<string>('');

    const handleValueChange = (newValue: string) => {
      setValue(newValue);
      args.onValueChange?.(newValue);
    };

    return (
      <div className='space-y-4'>
        <div className='text-primary-white text-sm'>
          Selected value:{' '}
          <span className='font-semibold'>{value || 'None'}</span>
        </div>
        <Select value={value} onValueChange={handleValueChange}>
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
} satisfies Story;

export const WithGroups = {
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
          <SelectItem value='akst'>Alaska Standard Time (AKST)</SelectItem>
          <SelectItem value='hst'>Hawaii Standard Time (HST)</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Europe & Africa</SelectLabel>
          <SelectItem value='gmt'>Greenwich Mean Time (GMT)</SelectItem>
          <SelectItem value='cet'>Central European Time (CET)</SelectItem>
          <SelectItem value='eet'>Eastern European Time (EET)</SelectItem>
          <SelectItem value='west'>
            Western European Summer Time (WEST)
          </SelectItem>
          <SelectItem value='cat'>Central Africa Time (CAT)</SelectItem>
          <SelectItem value='eat'>East Africa Time (EAT)</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Asia</SelectLabel>
          <SelectItem value='msk'>Moscow Time (MSK)</SelectItem>
          <SelectItem value='ist'>India Standard Time (IST)</SelectItem>
          <SelectItem value='cst_china'>China Standard Time (CST)</SelectItem>
          <SelectItem value='jst'>Japan Standard Time (JST)</SelectItem>
          <SelectItem value='kst'>Korea Standard Time (KST)</SelectItem>
          <SelectItem value='ist_indonesia'>
            Indonesia Central Standard Time (WITA)
          </SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Australia & Pacific</SelectLabel>
          <SelectItem value='awst'>
            Australian Western Standard Time (AWST)
          </SelectItem>
          <SelectItem value='acst'>
            Australian Central Standard Time (ACST)
          </SelectItem>
          <SelectItem value='aest'>
            Australian Eastern Standard Time (AEST)
          </SelectItem>
          <SelectItem value='nzst'>New Zealand Standard Time (NZST)</SelectItem>
          <SelectItem value='fjt'>Fiji Time (FJT)</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>South America</SelectLabel>
          <SelectItem value='art'>Argentina Time (ART)</SelectItem>
          <SelectItem value='bot'>Bolivia Time (BOT)</SelectItem>
          <SelectItem value='brt'>Brasilia Time (BRT)</SelectItem>
          <SelectItem value='clt'>Chile Standard Time (CLT)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
} satisfies Story;

export const WithSeparators = {
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
} satisfies Story;

export const Disabled = {
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
} satisfies Story;

export const WithDefaultValue = {
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
} satisfies Story;

export const CustomStyling = {
  args: {
    onValueChange: fn(),
  },
  render: (args) => (
    <div className='space-y-4'>
      <div className='text-primary-white text-sm font-semibold'>
        Custom Styled Select
      </div>
      <Select {...args}>
        <SelectTrigger className='w-[250px] border-primary-gray bg-primary-dark-gray hover:bg-[#3F3F3F]'>
          <SelectValue placeholder='Custom styled select' />
        </SelectTrigger>
        <SelectContent className='bg-[#2A2A2A] border-primary-gray'>
          <SelectGroup>
            <SelectLabel className='text-primary-light-gray'>
              Custom Group
            </SelectLabel>
            <SelectItem value='item1' className='hover:bg-[#4A4A4A]'>
              Custom Item 1
            </SelectItem>
            <SelectItem value='item2' className='hover:bg-[#4A4A4A]'>
              Custom Item 2
            </SelectItem>
            <SelectItem value='item3' className='hover:bg-[#4A4A4A]'>
              Custom Item 3
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  ),
} satisfies Story;

export const InteractiveExample = {
  args: {
    onValueChange: fn(),
  },
  render: () => {
    const [selectedFruit, setSelectedFruit] = useState<string>('');
    const [selectedColor, setSelectedColor] = useState<string>('');

    const fruits = [
      { value: 'apple', label: 'Apple', color: '#FF6B6B' },
      { value: 'banana', label: 'Banana', color: '#FFE66D' },
      { value: 'blueberry', label: 'Blueberry', color: '#4ECDC4' },
      { value: 'grapes', label: 'Grapes', color: '#A8E6CF' },
      { value: 'pineapple', label: 'Pineapple', color: '#FFD93D' },
    ];

    const selectedFruitData = fruits.find(
      (fruit) => fruit.value === selectedFruit,
    );

    return (
      <div className='space-y-6 max-w-md'>
        <div className='text-primary-white'>
          <h3 className='text-lg font-semibold mb-4'>
            Interactive Select Demo
          </h3>

          <div className='space-y-4'>
            <div>
              <label className='block text-sm font-medium mb-2'>
                Choose a fruit:
              </label>
              <Select value={selectedFruit} onValueChange={setSelectedFruit}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Select a fruit' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Fruits</SelectLabel>
                    {fruits.map((fruit) => (
                      <SelectItem key={fruit.value} value={fruit.value}>
                        <div className='flex items-center gap-2'>
                          <div
                            className='w-3 h-3 rounded-full'
                            style={{ backgroundColor: fruit.color }}
                          />
                          {fruit.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className='block text-sm font-medium mb-2'>
                Choose a color:
              </label>
              <Select value={selectedColor} onValueChange={setSelectedColor}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Select a color' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Colors</SelectLabel>
                    <SelectItem value='red'>Red</SelectItem>
                    <SelectItem value='green'>Green</SelectItem>
                    <SelectItem value='blue'>Blue</SelectItem>
                    <SelectItem value='yellow'>Yellow</SelectItem>
                    <SelectItem value='purple'>Purple</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(selectedFruit || selectedColor) && (
            <div className='mt-6 p-4 bg-[#2A2A2A] rounded-md border border-secondary-dark-gray'>
              <h4 className='text-sm font-semibold mb-2'>Selection Summary:</h4>
              {selectedFruitData && (
                <div className='flex items-center gap-2 mb-2'>
                  <span className='text-sm'>Selected fruit:</span>
                  <div className='flex items-center gap-2'>
                    <div
                      className='w-3 h-3 rounded-full'
                      style={{ backgroundColor: selectedFruitData.color }}
                    />
                    <span className='font-medium'>
                      {selectedFruitData.label}
                    </span>
                  </div>
                </div>
              )}
              {selectedColor && (
                <div className='text-sm'>
                  <span>Selected color: </span>
                  <span className='font-medium capitalize'>
                    {selectedColor}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
} satisfies Story;

export const AdjustableParentWidthWithFullWidth = {
  argTypes: {
    parentWidth: { control: { type: 'range', min: 200, max: 600, step: 50 } },
    parentBorder: { control: { type: 'boolean' } },
  },
  args: {
    parentWidth: 400,
    parentBorder: true,
  },
  render: ({ parentWidth, parentBorder }) => {
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
