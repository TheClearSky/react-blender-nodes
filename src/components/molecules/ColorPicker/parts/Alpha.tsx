import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/utils/cnHelper';
import { useColorPickerContext } from '../ColorPickerContext';
import { formatColor } from '../lib/color';

type ColorPickerAlphaProps = {
  className?: string;
};

const CHECKERBOARD =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><rect width='6' height='6' fill='%23ccc'/><rect x='6' y='6' width='6' height='6' fill='%23ccc'/></svg>\")";

function ColorPickerAlpha({ className }: ColorPickerAlphaProps) {
  const { color, setComponent } = useColorPickerContext();
  const trackRef = useRef<HTMLDivElement>(null);

  const moveTo = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
    setComponent('alpha', ratio);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.buttons !== 1) return;
    moveTo(e.clientX);
  };

  const opaqueColor = formatColor({ ...color, alpha: 1 }, 'rgb');
  const transparentColor = formatColor({ ...color, alpha: 0 }, 'rgb');

  return (
    <div
      ref={trackRef}
      className={cn(
        'rbn:relative rbn:h-3 rbn:w-full rbn:cursor-pointer rbn:rounded-full rbn:select-none rbn:touch-none',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <div
        className='rbn:absolute rbn:inset-0 rbn:overflow-hidden rbn:rounded-full'
        style={{
          backgroundImage: CHECKERBOARD,
          backgroundSize: '12px 12px',
        }}
      >
        <div
          className='rbn:absolute rbn:inset-0'
          style={{
            background: `linear-gradient(to right, ${transparentColor}, ${opaqueColor})`,
          }}
        />
      </div>
      <div
        className='rbn:absolute rbn:w-4 rbn:h-4 rbn:rounded-full rbn:border-2 rbn:border-white rbn:shadow-[0_0_0_1.5px_rgba(0,0,0,0.6)] rbn:pointer-events-none rbn:-translate-x-1/2 rbn:-translate-y-1/2'
        style={{
          left: `calc(${color.alpha} * (100% - 16px) + 8px)`,
          top: '50%',
          background: opaqueColor,
        }}
      />
    </div>
  );
}

export { ColorPickerAlpha };
export type { ColorPickerAlphaProps };
