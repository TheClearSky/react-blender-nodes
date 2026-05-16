import { useRef, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/utils/cnHelper';
import { useColorPickerContext } from '../ColorPickerContext';
import { formatColor } from '../lib/color';

type ColorPickerLightnessProps = {
  className?: string;
};

function ColorPickerLightness({ className }: ColorPickerLightnessProps) {
  const { color, setComponent } = useColorPickerContext();
  const trackRef = useRef<HTMLDivElement>(null);

  const moveTo = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
    setComponent('l', ratio);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.buttons !== 1) return;
    moveTo(e.clientX);
  };

  const gradientStops = useMemo(() => {
    const samples = 8;
    const stops: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const lightness = i / samples;
      stops.push(formatColor({ ...color, l: lightness, alpha: 1 }, 'oklch'));
    }
    return stops.join(', ');
  }, [color.h, color.c]);

  return (
    <div
      ref={trackRef}
      className={cn(
        'relative h-3 w-full cursor-pointer rounded-full select-none touch-none',
        className,
      )}
      style={{
        background: `linear-gradient(to right, ${gradientStops})`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <div
        className='absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.6)] pointer-events-none -translate-x-1/2 -translate-y-1/2'
        style={{
          left: `calc(${color.l} * (100% - 16px) + 8px)`,
          top: '50%',
          background: formatColor({ ...color, alpha: 1 }, 'oklch'),
        }}
      />
    </div>
  );
}

export { ColorPickerLightness };
export type { ColorPickerLightnessProps };
