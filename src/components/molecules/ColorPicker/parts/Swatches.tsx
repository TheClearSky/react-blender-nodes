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
    <div className={cn('rbn:grid rbn:grid-cols-10 rbn:gap-1.5', className)}>
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
              'rbn:relative rbn:w-6 rbn:h-6 rbn:cursor-pointer rbn:overflow-hidden rbn:rounded-sm rbn:border rbn:outline-none rbn:transition-transform',
              'rbn:hover:scale-110',
              isActive
                ? 'rbn:border-white rbn:ring-1 rbn:ring-white'
                : 'rbn:border-secondary-dark-gray',
            )}
            style={{
              backgroundImage: CHECKERBOARD,
              backgroundSize: '8px 8px',
            }}
          >
            <span
              className='rbn:absolute rbn:inset-0'
              style={{ background: preset }}
            />
          </button>
        );
      })}
      {onAdd && (
        <button
          type='button'
          onClick={() => onAdd(color, formatColor(color, 'hex'))}
          className='rbn:inline-flex rbn:w-6 rbn:h-6 rbn:cursor-pointer rbn:items-center rbn:justify-center rbn:rounded-sm rbn:border rbn:border-dashed rbn:border-secondary-dark-gray rbn:text-graph-input-placeholder rbn:outline-none rbn:transition-colors rbn:hover:border-white rbn:hover:text-white'
        >
          <Plus className='rbn:w-3 rbn:h-3' />
        </button>
      )}
    </div>
  );
}

export { ColorPickerSwatches };
export type { ColorPickerSwatchesProps };
