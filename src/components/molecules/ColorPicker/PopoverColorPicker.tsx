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
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
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
  /**
   * Called when the popover opens (`true`) or closes (`false`). Lets a consumer
   * commit the picked color ONCE on close (one history entry) instead of on every
   * `onChange` tick. Additive — existing consumers are unaffected.
   */
  onOpenChange?: (open: boolean) => void;
  /**
   * Extra classes merged onto the TRIGGER button (last-wins via `cn`), e.g. to
   * shrink the hardcoded `w-6 h-6` swatch. `className` lands on the wrapper and
   * cannot reach the trigger. Additive — existing consumers unaffected.
   */
  triggerClassName?: string;
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
  onOpenChange,
  triggerClassName,
}: PopoverColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Context-fallback consumer (like Tooltip/DragList): the popover is
  // portaled, so root var overrides can't reach it — the slot can.
  const theme = useGraphTheme();

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
    onOpenChange: (open) => {
      setIsOpen(open);
      onOpenChange?.(open);
    },
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
          'rounded-lg border border-secondary-dark-gray bg-graph-elevated-surface-bg p-2 shadow-lg',
          theme?.colorPicker?.popover,
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
          triggerClassName,
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
