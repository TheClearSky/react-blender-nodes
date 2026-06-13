import { cn } from '@/utils/cnHelper';
import { Plus } from 'lucide-react';
import { useColorPickerContext } from '../ColorPickerContext';
import { formatColor, parseColor } from '../lib/color';
import type { OklchColor } from '../lib/types';

type ColorPickerSwatchesProps = {
  presets?: string[];
  onAdd?: (color: OklchColor, hex: string) => void;
  className?: string;
};

const CHECKERBOARD =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'><rect width='4' height='4' fill='%23ccc'/><rect x='4' y='4' width='4' height='4' fill='%23ccc'/></svg>\")";

const DEFAULT_PRESETS = [
  'oklch(0.95 0 0)',
  'oklch(0.75 0 0)',
  'oklch(0.5 0 0)',
  'oklch(0.25 0 0)',
  'oklch(0.05 0 0)',
  'oklch(0.7 0.18 30)',
  'oklch(0.7 0.18 90)',
  'oklch(0.7 0.18 150)',
  'oklch(0.7 0.18 210)',
  'oklch(0.7 0.18 270)',
];

function ColorPickerSwatches({
  presets = DEFAULT_PRESETS,
  onAdd,
  className,
}: ColorPickerSwatchesProps) {
  const { color, setColor, formatted } = useColorPickerContext();

  return (
    <div className={cn('grid grid-cols-10 gap-1.5', className)}>
      {presets.map((preset, index) => {
        const parsed = parseColor(preset);
        const isActive = parsed
          ? formatColor(parsed, 'hex') === formatted
          : false;

        return (
          <button
            key={`${preset}-${index}`}
            type='button'
            onClick={() => setColor(preset)}
            className={cn(
              'relative w-6 h-6 cursor-pointer overflow-hidden rounded-sm border outline-none transition-transform',
              'hover:scale-110',
              isActive
                ? 'border-white ring-1 ring-white'
                : 'border-secondary-dark-gray',
            )}
            style={{
              backgroundImage: CHECKERBOARD,
              backgroundSize: '8px 8px',
            }}
          >
            <span className='absolute inset-0' style={{ background: preset }} />
          </button>
        );
      })}
      {onAdd && (
        <button
          type='button'
          onClick={() => onAdd(color, formatColor(color, 'hex'))}
          className='inline-flex w-6 h-6 cursor-pointer items-center justify-center rounded-sm border border-dashed border-secondary-dark-gray text-graph-input-placeholder outline-none transition-colors hover:border-white hover:text-white'
        >
          <Plus className='w-3 h-3' />
        </button>
      )}
    </div>
  );
}

export { ColorPickerSwatches };
export type { ColorPickerSwatchesProps };
