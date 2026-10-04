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
    <div className='rbn:p-4 rbn:bg-[#1a1a1a]'>
      <ColorPicker.Root
        value={color}
        onValueChange={handleChange}
        defaultFormat={defaultFormat}
        className='rbn:w-[260px]'
      >
        {children}
      </ColorPicker.Root>
      <div className='rbn:text-primary-white rbn:text-xs rbn:font-mono rbn:mt-3'>
        {color}
      </div>
    </div>
  );
}

export const Popover: Story = {
  name: 'Popover (recommended)',
  render: () => {
    const [color, setColor] = useState('#E91E63');
    return (
      <div className='rbn:flex rbn:flex-col rbn:gap-4 rbn:p-6 rbn:bg-[#1a1a1a]'>
        <div className='rbn:text-primary-white rbn:text-sm rbn:font-main'>
          Click the swatch to open the picker:
        </div>
        <PopoverColorPicker value={color} onChange={setColor} size='small' />
        <div className='rbn:text-primary-white rbn:text-xs rbn:font-mono'>
          {color}
        </div>
      </div>
    );
  },
};

export const PopoverWithAlphaAndSwatches: Story = {
  render: () => {
    const [color, setColor] = useState('#3366CC');
    return (
      <div className='rbn:flex rbn:flex-col rbn:gap-4 rbn:p-6 rbn:bg-[#1a1a1a]'>
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
        <div className='rbn:text-primary-white rbn:text-xs rbn:font-mono'>
          {color}
        </div>
      </div>
    );
  },
};

export const Canonical: Story = {
  render: () => (
    <InlinePickerShell>
      <div className='rbn:flex rbn:items-stretch rbn:gap-1.5'>
        <ColorPicker.GamutBadge
          showLabel={false}
          className='rbn:flex-1 rbn:justify-center'
        />
        <ColorPicker.ContrastReadout
          metrics={['wcag', 'apca']}
          showLabel={false}
          showValue={false}
          className='rbn:flex-1 rbn:justify-center'
        />
      </div>
      <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
      <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Alpha />
      </div>
      <div className='rbn:flex rbn:items-center rbn:gap-1.5'>
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
      <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
      <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
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
      <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
      <ColorPicker.Hue />
    </InlinePickerShell>
  ),
};

export const SlidersOnly: Story = {
  render: () => (
    <InlinePickerShell>
      <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
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
      <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
    </InlinePickerShell>
  ),
};

export const Framer: Story = {
  render: () => (
    <InlinePickerShell>
      <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
      <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Alpha />
      </div>
      <div className='rbn:flex rbn:items-center rbn:gap-1.5'>
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
      <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
      <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Alpha />
      </div>
      <ColorPicker.ChannelInput size='small' />
      <div className='rbn:flex rbn:items-center rbn:gap-1.5'>
        <ColorPicker.ContrastReadout className='rbn:flex-1' />
        <ColorPicker.EyeDropper size='small' />
      </div>
    </InlinePickerShell>
  ),
};

export const A11yReview: Story = {
  render: () => (
    <InlinePickerShell initialColor='#3366CC'>
      <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
      <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Alpha />
      </div>
      <div className='rbn:flex rbn:items-stretch rbn:gap-1.5'>
        <ColorPicker.GamutBadge className='rbn:flex-1 rbn:justify-center' />
        <ColorPicker.ContrastReadout
          metrics={['wcag', 'apca']}
          className='rbn:flex-1'
        />
      </div>
    </InlinePickerShell>
  ),
};

export const WithPreview: Story = {
  render: () => (
    <InlinePickerShell>
      <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
      <ColorPicker.Hue />
      <div className='rbn:flex rbn:items-center rbn:gap-1.5'>
        <ColorPicker.Preview className='rbn:w-5 rbn:h-5' />
        <ColorPicker.CssInput size='small' />
      </div>
    </InlinePickerShell>
  ),
};

export const AllParts: Story = {
  render: () => (
    <InlinePickerShell>
      <div className='rbn:flex rbn:items-stretch rbn:gap-1.5'>
        <ColorPicker.GamutBadge className='rbn:flex-1 rbn:justify-center' />
        <ColorPicker.ContrastReadout
          metrics={['wcag', 'apca']}
          className='rbn:flex-1'
        />
      </div>
      <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
      <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
        <ColorPicker.Hue />
        <ColorPicker.Lightness />
        <ColorPicker.Alpha />
      </div>
      <div className='rbn:flex rbn:items-center rbn:gap-1.5'>
        <ColorPicker.Preview className='rbn:w-5 rbn:h-5' />
        <ColorPicker.CssInput size='small' />
      </div>
      <div className='rbn:flex rbn:items-center rbn:gap-1.5'>
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
