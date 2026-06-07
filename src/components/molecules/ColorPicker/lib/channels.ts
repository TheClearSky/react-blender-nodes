import { converter, type Color } from 'culori';
import type { ColorFormat, OklchColor } from './types';
import { mapToGamut } from './color';
import { clamp, round, wrap } from './math';

const toOklch = converter('oklch');
const toRgb = converter('rgb');
const toHsl = converter('hsl');
const toHsv = converter('hsv');
const toOklab = converter('oklab');
const toP3 = converter('p3');

type ChannelDescriptor = {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  bigStep: number;
  precision: number;
  suffix?: string;
};

function oklchObj(c: OklchColor) {
  return { l: c.l, c: c.c, h: c.h, alpha: c.alpha };
}

function intChannel(
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  suffix?: string,
): ChannelDescriptor {
  return {
    key,
    label,
    value,
    min,
    max,
    step: 1,
    bigStep: 10,
    precision: 0,
    suffix,
  };
}

function floatChannel(
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  bigStep: number,
  precision: number,
  suffix?: string,
): ChannelDescriptor {
  return { key, label, value, min, max, step, bigStep, precision, suffix };
}

const ALPHA_DESCRIPTOR = (alpha: number): ChannelDescriptor => ({
  key: 'alpha',
  label: 'α',
  value: round(alpha * 100, 0),
  min: 0,
  max: 100,
  step: 1,
  bigStep: 10,
  precision: 0,
  suffix: '%',
});

function colorChannels(
  color: OklchColor,
  format: ColorFormat,
): ChannelDescriptor[] {
  switch (format) {
    case 'hex':
      return [];
    case 'rgb': {
      const rgb = toRgb({
        mode: 'oklch',
        ...oklchObj(mapToGamut(color, 'srgb')),
      });
      return [
        intChannel('r', 'R', round((rgb?.r ?? 0) * 255, 0), 0, 255),
        intChannel('g', 'G', round((rgb?.g ?? 0) * 255, 0), 0, 255),
        intChannel('b', 'B', round((rgb?.b ?? 0) * 255, 0), 0, 255),
        ALPHA_DESCRIPTOR(color.alpha),
      ];
    }
    case 'hsl': {
      const hsl = toHsl({
        mode: 'oklch',
        ...oklchObj(mapToGamut(color, 'srgb')),
      });
      return [
        intChannel('h', 'H', round(hsl?.h ?? 0, 0), 0, 360),
        intChannel('s', 'S', round((hsl?.s ?? 0) * 100, 0), 0, 100, '%'),
        intChannel('l', 'L', round((hsl?.l ?? 0) * 100, 0), 0, 100, '%'),
        ALPHA_DESCRIPTOR(color.alpha),
      ];
    }
    case 'hsb': {
      const hsv = toHsv({
        mode: 'oklch',
        ...oklchObj(mapToGamut(color, 'srgb')),
      });
      return [
        intChannel('h', 'H', round(hsv?.h ?? 0, 0), 0, 360),
        intChannel('s', 'S', round((hsv?.s ?? 0) * 100, 0), 0, 100, '%'),
        intChannel('b', 'B', round((hsv?.v ?? 0) * 100, 0), 0, 100, '%'),
        ALPHA_DESCRIPTOR(color.alpha),
      ];
    }
    case 'oklch':
      return [
        intChannel('l', 'L', round(color.l * 100, 0), 0, 100, '%'),
        floatChannel('c', 'C', round(color.c, 3), 0, 0.4, 0.005, 0.05, 3),
        intChannel('h', 'H', round(color.h, 0), 0, 360),
        ALPHA_DESCRIPTOR(color.alpha),
      ];
    case 'oklab': {
      const lab = toOklab({ mode: 'oklch', ...oklchObj(color) });
      return [
        intChannel('l', 'L', round((lab?.l ?? color.l) * 100, 0), 0, 100, '%'),
        floatChannel(
          'a',
          'a',
          round(lab?.a ?? 0, 3),
          -0.4,
          0.4,
          0.005,
          0.05,
          3,
        ),
        floatChannel(
          'b',
          'b',
          round(lab?.b ?? 0, 3),
          -0.4,
          0.4,
          0.005,
          0.05,
          3,
        ),
        ALPHA_DESCRIPTOR(color.alpha),
      ];
    }
    case 'p3': {
      const p3 = toP3({ mode: 'oklch', ...oklchObj(mapToGamut(color, 'p3')) });
      return [
        floatChannel('r', 'R', round(p3?.r ?? 0, 3), 0, 1, 0.01, 0.1, 3),
        floatChannel('g', 'G', round(p3?.g ?? 0, 3), 0, 1, 0.01, 0.1, 3),
        floatChannel('b', 'B', round(p3?.b ?? 0, 3), 0, 1, 0.01, 0.1, 3),
        ALPHA_DESCRIPTOR(color.alpha),
      ];
    }
  }
}

function setColorChannel(
  color: OklchColor,
  format: ColorFormat,
  key: string,
  value: number,
): OklchColor {
  if (key === 'alpha') return { ...color, alpha: clamp(value / 100, 0, 1) };

  function fromCulori(c: Color, alpha: number): OklchColor {
    const ok = toOklch(c);
    if (!ok) return { l: 0, c: 0, h: 0, alpha };
    return { l: ok.l ?? 0, c: ok.c ?? 0, h: ok.h ?? 0, alpha };
  }

  switch (format) {
    case 'hex':
      return color;
    case 'rgb': {
      const rgb = toRgb({
        mode: 'oklch',
        ...oklchObj(mapToGamut(color, 'srgb')),
      }) ?? { r: 0, g: 0, b: 0 };
      return fromCulori(
        { ...rgb, [key]: clamp(value / 255, 0, 1), mode: 'rgb' as const },
        color.alpha,
      );
    }
    case 'hsl': {
      const hsl = toHsl({
        mode: 'oklch',
        ...oklchObj(mapToGamut(color, 'srgb')),
      }) ?? { h: 0, s: 0, l: 0 };
      const h = key === 'h' ? wrap(value, 360) : (hsl.h ?? 0);
      const s = key === 's' ? clamp(value / 100, 0, 1) : hsl.s;
      const l = key === 'l' ? clamp(value / 100, 0, 1) : hsl.l;
      return fromCulori({ mode: 'hsl' as const, h, s, l }, color.alpha);
    }
    case 'hsb': {
      const hsv = toHsv({
        mode: 'oklch',
        ...oklchObj(mapToGamut(color, 'srgb')),
      }) ?? { h: 0, s: 0, v: 0 };
      const h = key === 'h' ? wrap(value, 360) : (hsv.h ?? 0);
      const s = key === 's' ? clamp(value / 100, 0, 1) : hsv.s;
      const v = key === 'b' ? clamp(value / 100, 0, 1) : hsv.v;
      return fromCulori({ mode: 'hsv' as const, h, s, v }, color.alpha);
    }
    case 'oklch':
      switch (key) {
        case 'l':
          return { ...color, l: clamp(value / 100, 0, 1) };
        case 'c':
          return { ...color, c: clamp(value, 0, 0.5) };
        case 'h':
          return { ...color, h: wrap(value, 360) };
        default:
          return color;
      }
    case 'oklab': {
      const lab = toOklab({ mode: 'oklch', ...oklchObj(color) }) ?? {
        l: 0,
        a: 0,
        b: 0,
      };
      const l = key === 'l' ? clamp(value / 100, 0, 1) : (lab.l ?? 0);
      const a = key === 'a' ? clamp(value, -0.5, 0.5) : (lab.a ?? 0);
      const b = key === 'b' ? clamp(value, -0.5, 0.5) : (lab.b ?? 0);
      return fromCulori({ mode: 'oklab' as const, l, a, b }, color.alpha);
    }
    case 'p3': {
      const p3 = toP3({
        mode: 'oklch',
        ...oklchObj(mapToGamut(color, 'p3')),
      }) ?? { r: 0, g: 0, b: 0 };
      return fromCulori(
        { ...p3, [key]: clamp(value, 0, 1), mode: 'p3' as const },
        color.alpha,
      );
    }
  }
}

export { colorChannels, setColorChannel };
export type { ChannelDescriptor };
