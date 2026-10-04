import { cn } from '@/utils/cnHelper';
import { useColorPickerContext } from '../ColorPickerContext';

type ColorPickerGamutBadgeProps = {
  showLabel?: boolean;
  className?: string;
};

function ColorPickerGamutBadge({
  showLabel = true,
  className,
}: ColorPickerGamutBadgeProps) {
  const { gamut } = useColorPickerContext();

  let label = 'sRGB';
  if (!gamut.inSrgb && gamut.inP3) label = 'P3';
  else if (!gamut.inP3 && gamut.inRec2020) label = 'Rec.2020';
  else if (!gamut.inRec2020) label = 'Out of gamut';

  return (
    <div
      title={`Color in ${label} color space`}
      className={cn(
        'rbn:inline-flex rbn:cursor-default rbn:items-center rbn:gap-1.5 rbn:rounded-md rbn:border rbn:border-secondary-dark-gray rbn:px-2 rbn:py-1 rbn:text-[13px]',
        className,
      )}
    >
      {showLabel && (
        <span className='rbn:text-graph-input-placeholder'>Gamut</span>
      )}
      <span className='rbn:font-mono rbn:font-medium rbn:text-primary-white'>
        {label}
      </span>
    </div>
  );
}

export { ColorPickerGamutBadge };
export type { ColorPickerGamutBadgeProps };
