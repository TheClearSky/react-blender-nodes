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
        'inline-flex cursor-default items-center gap-1.5 rounded-md border border-secondary-dark-gray px-2 py-1 text-[13px]',
        className,
      )}
    >
      {showLabel && <span className='text-graph-input-placeholder'>Gamut</span>}
      <span className='font-mono font-medium text-primary-white'>{label}</span>
    </div>
  );
}

export { ColorPickerGamutBadge };
export type { ColorPickerGamutBadgeProps };
