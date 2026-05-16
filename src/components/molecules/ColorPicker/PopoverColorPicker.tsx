import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useFloating,
  useClick,
  useDismiss,
  useInteractions,
  useTransitionStyles,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';
import { cn } from '@/utils/cnHelper';
import { ColorPickerRoot } from './parts/Root';
import { ColorPickerArea } from './parts/Area';
import { ColorPickerHue } from './parts/Hue';
import { ColorPickerAlpha } from './parts/Alpha';
import { ColorPickerPreview } from './parts/Preview';
import { ColorPickerCssInput } from './parts/CssInput';
import { ColorPickerSwatches } from './parts/Swatches';
import { ColorPickerEyeDropper } from './parts/EyeDropper';
import { ColorPickerChannelInput } from './parts/ChannelInput';
import { formatColor, parseColor } from './lib/color';
import type { OklchColor, ColorFormat } from './lib/types';

type PopoverColorPickerProps = {
  value: string;
  onChange: (hex: string) => void;
  defaultFormat?: ColorFormat;
  showAlpha?: boolean;
  showSwatches?: boolean;
  swatchPresets?: string[];
  placement?: Placement;
  renderInline?: boolean;
  className?: string;
  size?: 'normal' | 'small';
};

function PopoverColorPicker({
  value,
  onChange,
  defaultFormat = 'hex',
  showAlpha = false,
  showSwatches = false,
  swatchPresets,
  placement = 'bottom-start',
  renderInline = false,
  className,
  size = 'small',
}: PopoverColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Internal OklchColor state avoids hex round-trip precision loss.
  // Only re-sync from the external `value` prop when the change is truly
  // external (parent reset, initial load). Self-originated changes (from
  // the picker's own sliders/area) set `selfSetRef` to skip the sync.
  const [internalColor, setInternalColor] = useState<OklchColor>(() => {
    return parseColor(value) ?? { l: 0, c: 0, h: 0, alpha: 1 };
  });
  const selfSetRef = useRef(false);

  useEffect(() => {
    if (selfSetRef.current) {
      selfSetRef.current = false;
      return;
    }
    const parsed = parseColor(value);
    if (parsed) setInternalColor(parsed);
  }, [value]);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ]);

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: 150,
    initial: { opacity: 0, transform: 'scale(0.95)' },
    common: { transformOrigin: 'top' },
  });

  const handleValueChange = useCallback(
    (color: OklchColor, formatted: string) => {
      setInternalColor(color);
      selfSetRef.current = true;
      onChange(formatted);
    },
    [onChange],
  );

  const previewColor = formatColor(internalColor, 'rgb');

  const isSmall = size === 'small';
  const triggerSize = isSmall ? 'w-6 h-6' : 'w-10 h-10';
  const pickerWidth = isSmall ? 'w-[220px]' : 'w-[280px]';

  const popoverContent = (
    <div
      ref={refs.setFloating}
      style={
        renderInline
          ? { position: 'absolute' as const, zIndex: 50 }
          : { ...floatingStyles, zIndex: 50 }
      }
      {...getFloatingProps()}
    >
      <div
        style={transitionStyles}
        className={cn(
          pickerWidth,
          'rounded-lg border border-secondary-dark-gray bg-[#222222] p-2 shadow-lg',
        )}
      >
        <ColorPickerRoot
          value={internalColor}
          onValueChange={handleValueChange}
          defaultFormat={defaultFormat}
        >
          <ColorPickerArea className='w-full aspect-square' />
          <ColorPickerHue />
          {showAlpha && <ColorPickerAlpha />}
          <div className='flex items-center gap-1.5'>
            <ColorPickerPreview className={isSmall ? 'w-5 h-5' : 'w-8 h-8'} />
            <ColorPickerCssInput size={size} />
            <ColorPickerEyeDropper size={size} />
          </div>
          <ColorPickerChannelInput size={size} />
          {showSwatches && <ColorPickerSwatches presets={swatchPresets} />}
        </ColorPickerRoot>
      </div>
    </div>
  );

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        ref={refs.setReference}
        type='button'
        {...getReferenceProps()}
        className={cn(
          triggerSize,
          'rounded-md border border-secondary-dark-gray cursor-pointer',
          'outline-none focus-visible:ring-1 focus-visible:ring-white',
          'overflow-hidden transition-shadow hover:shadow-md',
        )}
        style={{ backgroundColor: previewColor }}
        aria-label='Pick color'
      />
      {isMounted &&
        (renderInline ? (
          popoverContent
        ) : (
          <FloatingPortal>{popoverContent}</FloatingPortal>
        ))}
    </div>
  );
}

export { PopoverColorPicker };
export type { PopoverColorPickerProps };
