import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { PopoverColorPicker } from './PopoverColorPicker';
import type { OklchColor, ColorFormat } from './lib/types';

const meta = {
  title: 'Molecules/ColorPicker',
  tags: ['autodocs'],
} satisfies Meta;

export default meta;

type Story = StoryObj;

function InlinePickerShell({
  children,
  initialColor = '#E91E63',
  defaultFormat = 'hex' as ColorFormat,
}: {
  children: React.ReactNode;
  initialColor?: string;
  defaultFormat?: ColorFormat;
}) {
  const [color, setColor] = useState(initialColor);
  const handleChange = (_c: OklchColor, formatted: string) =>
    setColor(formatted);

  return (
    <div className='p-4 bg-[#1a1a1a]'>
      <ColorPicker.Root
        value={color}
        onValueChange={handleChange}
        defaultFormat={defaultFormat}
        className='w-[260px]'
      >
        {children}
      </ColorPicker.Root>
      <div className='text-primary-white text-xs font-mono mt-3'>{color}</div>
    </div>
  );
}

export const Popover: Story = {
  name: 'Popover (recommended)',
  render: () => {
    const [color, setColor] = useState('#E91E63');
    return (
      <div className='flex flex-col gap-4 p-6 bg-[#1a1a1a]'>
        <div className='text-primary-white text-sm font-main'>
          Click the swatch to open the picker:
        </div>
        <PopoverColorPicker value={color} onChange={setColor} size='small' />
        <div className='text-primary-white text-xs font-mono'>{color}</div>
      </div>
    );
  },
};

export const PopoverWithAlphaAndSwatches: Story = {
  render: () => {
    const [color, setColor] = useState('#3366CC');
    return (
      <div className='flex flex-col gap-4 p-6 bg-[#1a1a1a]'>
        <PopoverColorPicker
          value={color}
          onChange={setColor}
          showAlpha
          showSwatches
          swatchPresets={[
            '#FFFFFF',
            '#000000',
            '#FF0000',
            '#00FF00',
            '#0000FF',
            '#FFFF00',
            '#FF00FF',
            '#00FFFF',
          ]}
          size='small'
        />
        <div className='text-primary-white text-xs font-mono'>{color}</div>
      </div>
    );
  },
};

export const Canonical: Story = {
  render: () => (
    <InlinePickerShell>
      <div className='flex items-stretch gap-1.5'>
        <ColorPicker.GamutBadge
          showLabel={false}
          className='flex-1 justify-center'
        />
        <ColorPicker.ContrastReadout
          metrics={['wcag', 'apca']}
          showLabel={false}
          showValue={false}
          className='flex-1 justify-center'
        />
      </div>
      <ColorPicker.Area className='w-full aspect-square' />
      <div className='flex flex-col gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Alpha />
      </div>
      <div className='flex items-center gap-1.5'>
        <ColorPicker.FormatSwitcher size='small' />
        <ColorPicker.EyeDropper size='small' />
      </div>
      <ColorPicker.ChannelInput showFormat={false} size='small' />
      <ColorPicker.Swatches
        presets={[
          '#FFFFFF',
          '#000000',
          'oklch(0.7 0.18 30)',
          'oklch(0.7 0.18 90)',
          'oklch(0.7 0.18 150)',
          'oklch(0.7 0.18 210)',
          'oklch(0.7 0.18 270)',
          'oklch(0.7 0.18 330)',
        ]}
      />
    </InlinePickerShell>
  ),
};

export const Compact: Story = {
  render: () => (
    <InlinePickerShell>
      <ColorPicker.Area className='w-full aspect-square' />
      <div className='flex flex-col gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Alpha />
      </div>
      <ColorPicker.ChannelInput size='small' />
    </InlinePickerShell>
  ),
};

export const Minimal: Story = {
  render: () => (
    <InlinePickerShell>
      <ColorPicker.Area className='w-full aspect-square' />
      <ColorPicker.Hue />
    </InlinePickerShell>
  ),
};

export const SlidersOnly: Story = {
  render: () => (
    <InlinePickerShell>
      <div className='flex flex-col gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Lightness />
        <ColorPicker.Alpha />
      </div>
      <ColorPicker.ChannelInput size='small' />
    </InlinePickerShell>
  ),
};

export const AreaOnly: Story = {
  render: () => (
    <InlinePickerShell>
      <ColorPicker.Area className='w-full aspect-square' />
    </InlinePickerShell>
  ),
};

export const Framer: Story = {
  render: () => (
    <InlinePickerShell>
      <ColorPicker.Area className='w-full aspect-square' />
      <div className='flex flex-col gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Alpha />
      </div>
      <div className='flex items-center gap-1.5'>
        <ColorPicker.FormatSwitcher size='small' />
        <ColorPicker.EyeDropper size='small' />
      </div>
      <ColorPicker.ChannelInput showFormat={false} size='small' />
    </InlinePickerShell>
  ),
};

export const Figma: Story = {
  render: () => (
    <InlinePickerShell>
      <ColorPicker.Area className='w-full aspect-square' />
      <div className='flex flex-col gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Alpha />
      </div>
      <ColorPicker.ChannelInput size='small' />
      <div className='flex items-center gap-1.5'>
        <ColorPicker.ContrastReadout className='flex-1' />
        <ColorPicker.EyeDropper size='small' />
      </div>
    </InlinePickerShell>
  ),
};

export const A11yReview: Story = {
  render: () => (
    <InlinePickerShell initialColor='#3366CC'>
      <ColorPicker.Area className='w-full aspect-square' />
      <div className='flex flex-col gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Alpha />
      </div>
      <div className='flex items-stretch gap-1.5'>
        <ColorPicker.GamutBadge className='flex-1 justify-center' />
        <ColorPicker.ContrastReadout
          metrics={['wcag', 'apca']}
          className='flex-1'
        />
      </div>
    </InlinePickerShell>
  ),
};

export const WithPreview: Story = {
  render: () => (
    <InlinePickerShell>
      <ColorPicker.Area className='w-full aspect-square' />
      <ColorPicker.Hue />
      <div className='flex items-center gap-1.5'>
        <ColorPicker.Preview className='w-5 h-5' />
        <ColorPicker.CssInput size='small' />
      </div>
    </InlinePickerShell>
  ),
};

export const AllParts: Story = {
  render: () => (
    <InlinePickerShell>
      <div className='flex items-stretch gap-1.5'>
        <ColorPicker.GamutBadge className='flex-1 justify-center' />
        <ColorPicker.ContrastReadout
          metrics={['wcag', 'apca']}
          className='flex-1'
        />
      </div>
      <ColorPicker.Area className='w-full aspect-square' />
      <div className='flex flex-col gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Lightness />
        <ColorPicker.Alpha />
      </div>
      <div className='flex items-center gap-1.5'>
        <ColorPicker.Preview className='w-5 h-5' />
        <ColorPicker.CssInput size='small' />
      </div>
      <div className='flex items-center gap-1.5'>
        <ColorPicker.FormatSwitcher size='small' />
        <ColorPicker.EyeDropper size='small' />
      </div>
      <ColorPicker.ChannelInput showFormat={false} size='small' />
      <ColorPicker.Swatches
        presets={[
          '#FFFFFF',
          '#000000',
          '#FF0000',
          '#00FF00',
          '#0000FF',
          '#FFFF00',
          '#FF00FF',
          '#00FFFF',
          'oklch(0.7 0.18 30)',
          'oklch(0.7 0.18 150)',
        ]}
      />
    </InlinePickerShell>
  ),
};
