import {
  useRef,
  useEffect,
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from '@/utils/cnHelper';
import { useColorPickerContext } from '../ColorPickerContext';
import {
  findMaxChroma,
  formatColor,
  mapToGamut,
  oklchToLinearSrgb,
  srgbEncode,
  clampByte,
} from '../lib/color';
import type { Gamut, OklchColor } from '../lib/types';

type ColorPickerAreaProps = {
  className?: string;
  resolution?: number;
};

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function positionFor(color: OklchColor, gamut: Gamut): [number, number] {
  const maxChroma = findMaxChroma(color.l, color.h, gamut);
  const safeMaxChroma = maxChroma > 1e-6 ? maxChroma : 1e-6;
  return [clamp01(color.c / safeMaxChroma), clamp01(1 - color.l)];
}

function sampleAt(
  base: OklchColor,
  gamut: Gamut,
  xNormalized: number,
  yNormalized: number,
): OklchColor {
  const lightness = 1 - yNormalized;
  const maxChroma = findMaxChroma(lightness, base.h, gamut);
  return { ...base, l: lightness, c: xNormalized * maxChroma };
}

function ColorPickerArea({
  className,
  resolution = 128,
}: ColorPickerAreaProps) {
  const { color, setColor, format } = useColorPickerContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const gamut: Gamut =
    format === 'p3'
      ? 'p3'
      : format === 'oklch' || format === 'oklab'
        ? 'rec2020'
        : 'srgb';

  // Track bead position separately from derived color position.
  // At gamut poles (l=0 or l=1), every X collapses to chroma 0, so
  // deriving the bead from the color would snap X to 0. We keep the
  // user's picked position and only clear it on external color changes.
  const [pickPos, setPickPos] = useState<[number, number] | null>(null);
  const selfSetRef = useRef(false);

  useEffect(() => {
    if (selfSetRef.current) {
      selfSetRef.current = false;
      return;
    }
    setPickPos(null);
  }, [color]);

  // Paint the gradient canvas. Depends only on hue (the fixed axis in
  // oklch-cl mode). Precomputes a max-chroma LUT per row so the per-pixel
  // cost is a single multiply, not a bisection search.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = resolution;
    const height = resolution;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const chromaLut = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      chromaLut[y] = findMaxChroma(1 - y / (height - 1), color.h, gamut);
    }

    for (let y = 0; y < height; y++) {
      const lightness = 1 - y / (height - 1);
      const maxChroma = chromaLut[y];

      for (let x = 0; x < width; x++) {
        const chroma = (x / (width - 1)) * maxChroma;
        const lin = oklchToLinearSrgb(lightness, chroma, color.h);
        const idx = (y * width + x) * 4;
        data[idx] = clampByte(srgbEncode(lin.r) * 255);
        data[idx + 1] = clampByte(srgbEncode(lin.g) * 255);
        data[idx + 2] = clampByte(srgbEncode(lin.b) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [color.h, gamut, resolution]);

  const moveTo = useCallback(
    (xNormalized: number, yNormalized: number) => {
      const xClamped = clamp01(xNormalized);
      const yClamped = clamp01(yNormalized);
      const next = sampleAt(color, gamut, xClamped, yClamped);
      setPickPos([xClamped, yClamped]);
      selfSetRef.current = true;
      const targetHue = next.h;
      const clamped = mapToGamut(next, gamut);
      setColor({ ...clamped, h: targetHue });
    },
    [color, gamut, setColor],
  );

  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      moveTo(
        (clientX - rect.left) / rect.width,
        (clientY - rect.top) / rect.height,
      );
    },
    [moveTo],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    handlePointer(e.clientX, e.clientY);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.buttons !== 1) return;
    handlePointer(e.clientX, e.clientY);
  };

  const [derivedX, derivedY] = positionFor(color, gamut);
  const [beadX, beadY] = pickPos ?? [derivedX, derivedY];

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative cursor-crosshair select-none touch-none overflow-hidden rounded-sm',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <canvas ref={canvasRef} className='block w-full h-full' />
      <div
        className='absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.6)] pointer-events-none -translate-x-1/2 -translate-y-1/2'
        style={{
          left: `${beadX * 100}%`,
          top: `${beadY * 100}%`,
          background: formatColor({ ...color, alpha: 1 }, 'oklch'),
        }}
      />
    </div>
  );
}

export { ColorPickerArea };
export type { ColorPickerAreaProps };
