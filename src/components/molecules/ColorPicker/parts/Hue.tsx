import {
  useRef,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from '@/utils/cnHelper';
import { useColorPickerContext } from '../ColorPickerContext';
import { findMaxChroma, gamutFromFormat } from '../lib/color';
import type { Gamut } from '../lib/types';

type ColorPickerHueProps = {
  className?: string;
};

function ColorPickerHue({ className }: ColorPickerHueProps) {
  const { color, setColor, format } = useColorPickerContext();
  const trackRef = useRef<HTMLDivElement>(null);

  const gamut: Gamut = gamutFromFormat(format);

  const commitHue = useCallback(
    (newHue: number) => {
      const wrapped = ((newHue % 360) + 360) % 360;
      const oldMaxChroma = findMaxChroma(color.l, color.h, gamut);
      const newMaxChroma = findMaxChroma(color.l, wrapped, gamut);
      const saturation = oldMaxChroma > 1e-6 ? color.c / oldMaxChroma : 0;
      const nextChroma = saturation * newMaxChroma;
      setColor({ ...color, h: wrapped, c: nextChroma });
    },
    [color, gamut, setColor],
  );

  const moveTo = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min((clientX - rect.left) / rect.width, 1),
      );
      commitHue(ratio * 360);
    },
    [commitHue],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.buttons !== 1) return;
    moveTo(e.clientX);
  };

  const huePosition = (((color.h % 360) + 360) % 360) / 360;

  return (
    <div
      ref={trackRef}
      className={cn(
        'relative h-3 w-full cursor-pointer rounded-full select-none touch-none',
        className,
      )}
      style={{
        background:
          'linear-gradient(to right, oklch(0.7 0.25 0), oklch(0.7 0.25 60), oklch(0.7 0.25 120), oklch(0.7 0.25 180), oklch(0.7 0.25 240), oklch(0.7 0.25 300), oklch(0.7 0.25 360))',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <div
        className='absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.6)] pointer-events-none -translate-x-1/2 -translate-y-1/2'
        style={{
          left: `calc(${huePosition} * (100% - 16px) + 8px)`,
          top: '50%',
          background: `oklch(0.7 0.25 ${color.h})`,
        }}
      />
    </div>
  );
}

export { ColorPickerHue };
export type { ColorPickerHueProps };
