import { cn } from '@/utils/cnHelper';
import { useColorPickerContext } from '../ColorPickerContext';
import { formatColor } from '../lib/color';

type ColorPickerPreviewProps = {
  className?: string;
};

const CHECKERBOARD =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><rect width='6' height='6' fill='%23ccc'/><rect x='6' y='6' width='6' height='6' fill='%23ccc'/></svg>\")";

function ColorPickerPreview({ className }: ColorPickerPreviewProps) {
  const { color, background } = useColorPickerContext();
  const foregroundColor = formatColor(color, 'rgb');
  const backgroundColor = formatColor(background, 'rgb');

  return (
    <div
      className={cn(
        'rbn:relative rbn:shrink-0 rbn:overflow-hidden rbn:rounded-sm rbn:border rbn:border-secondary-dark-gray',
        className,
      )}
      style={{
        backgroundImage: CHECKERBOARD,
        backgroundSize: '12px 12px',
      }}
    >
      <div
        className='rbn:absolute rbn:inset-0'
        style={{ background: backgroundColor }}
      />
      <div
        className='rbn:absolute rbn:inset-0'
        style={{ background: foregroundColor }}
      />
    </div>
  );
}

export { ColorPickerPreview };
export type { ColorPickerPreviewProps };
