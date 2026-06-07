import {
  parse as culoriParse,
  converter,
  formatHex,
  formatHex8,
  formatRgb,
  formatCss,
  toGamut as culoriToGamut,
  wcagContrast,
  type Color,
} from 'culori';
import type {
  ColorFormat,
  ContrastResult,
  Gamut,
  GamutInfo,
  OklchColor,
} from './types';
import { clamp, round } from './math';

const toOklch = converter('oklch');
const toRgb = converter('rgb');
const toHsl = converter('hsl');
const toHsv = converter('hsv');
const toOklab = converter('oklab');
const toP3 = converter('p3');
const toRec2020 = converter('rec2020');

const GAMUT_EPSILON = 1e-4;

function channelsInRange(c: { r?: number; g?: number; b?: number }): boolean {
  const r = c.r ?? 0;
  const g = c.g ?? 0;
  const b = c.b ?? 0;
  return (
    r >= -GAMUT_EPSILON &&
    r <= 1 + GAMUT_EPSILON &&
    g >= -GAMUT_EPSILON &&
    g <= 1 + GAMUT_EPSILON &&
    b >= -GAMUT_EPSILON &&
    b <= 1 + GAMUT_EPSILON
  );
}

function oklchObj(c: OklchColor) {
  return { l: c.l, c: c.c, h: c.h, alpha: c.alpha };
}

function parseColor(input: string): OklchColor | null {
  if (!input || typeof input !== 'string') return null;
  const parsed = culoriParse(input.trim());
  if (!parsed) return null;
  const oklch = toOklch(parsed);
  if (!oklch) return null;
  return {
    l: clamp(oklch.l ?? 0, 0, 1),
    c: Math.max(oklch.c ?? 0, 0),
    h: Number.isFinite(oklch.h) ? (oklch.h as number) : 0,
    alpha: oklch.alpha ?? 1,
  };
}

function isValidColor(input: string): boolean {
  return parseColor(input) !== null;
}

function formatColor(color: OklchColor, format: ColorFormat): string {
  switch (format) {
    case 'hex': {
      const mapped = mapToGamut(color, 'srgb');
      const rgb = toRgb({ mode: 'oklch', ...oklchObj(mapped) });
      if (!rgb) return '#000000';
      return (color.alpha < 1 ? formatHex8(rgb) : formatHex(rgb)).toUpperCase();
    }
    case 'rgb': {
      const mapped = mapToGamut(color, 'srgb');
      const rgb = toRgb({ mode: 'oklch', ...oklchObj(mapped) });
      return rgb ? formatRgb(rgb) : 'rgb(0 0 0)';
    }
    case 'hsl': {
      const mapped = mapToGamut(color, 'srgb');
      const hsl = toHsl({ mode: 'oklch', ...oklchObj(mapped) });
      return hsl ? formatCss(hsl) : 'hsl(0 0% 0%)';
    }
    case 'hsb': {
      const mapped = mapToGamut(color, 'srgb');
      const hsv = toHsv({ mode: 'oklch', ...oklchObj(mapped) });
      if (!hsv) return 'hsv(0 0% 0%)';
      return formatCss(hsv);
    }
    case 'oklch': {
      const { l, c, h, alpha } = color;
      return alpha < 1
        ? `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)} / ${round(alpha, 3)})`
        : `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)})`;
    }
    case 'oklab': {
      const lab = toOklab({ mode: 'oklch', ...oklchObj(color) });
      return lab ? formatCss(lab) : 'oklab(0 0 0)';
    }
    case 'p3': {
      const mapped = mapToGamut(color, 'p3');
      const p3 = toP3({ mode: 'oklch', ...oklchObj(mapped) });
      return p3 ? formatCss(p3) : 'color(display-p3 0 0 0)';
    }
  }
}

const ALL_FORMATS: ColorFormat[] = [
  'hex',
  'rgb',
  'hsl',
  'hsb',
  'oklch',
  'oklab',
  'p3',
];

function formatAll(color: OklchColor): Record<ColorFormat, string> {
  const out = {} as Record<ColorFormat, string>;
  for (const f of ALL_FORMATS) out[f] = formatColor(color, f);
  return out;
}

function gamutInfo(color: OklchColor): GamutInfo {
  const ok = { mode: 'oklch' as const, ...oklchObj(color) };
  return {
    inSrgb: channelsInRange(toRgb(ok) ?? {}),
    inP3: channelsInRange(toP3(ok) ?? {}),
    inRec2020: channelsInRange(toRec2020(ok) ?? {}),
  };
}

function mapToGamut(color: OklchColor, gamut: Gamut): OklchColor {
  const ok = { mode: 'oklch' as const, ...oklchObj(color) };
  const targetMode =
    gamut === 'srgb' ? 'rgb' : gamut === 'p3' ? 'p3' : 'rec2020';
  const mapper = culoriToGamut(targetMode, 'oklch');
  const mapped = mapper(ok) as Color | undefined;
  if (!mapped) return color;
  const back = toOklch(mapped);
  if (!back) return color;
  return {
    l: back.l ?? color.l,
    c: Math.max(back.c ?? 0, 0),
    h: Number.isFinite(back.h) ? (back.h as number) : color.h,
    alpha: color.alpha,
  };
}

function findMaxChroma(
  lightness: number,
  hueDeg: number,
  gamut: Gamut,
): number {
  if (lightness <= 0 || lightness >= 1) return 0;

  const inGamut = (chroma: number): boolean => {
    const ok = {
      mode: 'oklch' as const,
      l: lightness,
      c: chroma,
      h: hueDeg,
      alpha: 1,
    };
    const targetMode =
      gamut === 'srgb' ? 'rgb' : gamut === 'p3' ? 'p3' : 'rec2020';
    const converted =
      targetMode === 'rgb'
        ? toRgb(ok)
        : targetMode === 'p3'
          ? toP3(ok)
          : toRec2020(ok);
    return converted ? channelsInRange(converted) : false;
  };

  let hi = 0.5;
  while (inGamut(hi) && hi < 2) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(mid)) lo = mid;
    else hi = mid;
  }
  return Math.max(0, lo - 1e-3);
}

function gamutFromFormat(format: ColorFormat): Gamut {
  switch (format) {
    case 'hex':
    case 'rgb':
    case 'hsl':
    case 'hsb':
      return 'srgb';
    case 'p3':
      return 'p3';
    case 'oklch':
    case 'oklab':
      return 'rec2020';
  }
}

function contrast(fg: OklchColor, bg: OklchColor): ContrastResult {
  const composedFg = fg.alpha >= 1 ? fg : compositeOnBg(fg, bg);
  const fgRgb = toRgb({ mode: 'oklch', ...oklchObj(composedFg) });
  const bgRgb = toRgb({ mode: 'oklch', ...oklchObj({ ...bg, alpha: 1 }) });
  const ratio = fgRgb && bgRgb ? wcagContrast(fgRgb, bgRgb) : 1;
  const safe = Number.isFinite(ratio) ? ratio : 1;
  return {
    wcag: round(safe, 2),
    wcagLevel: {
      aaNormal: safe >= 4.5,
      aaLarge: safe >= 3,
      aaaNormal: safe >= 7,
      aaaLarge: safe >= 4.5,
    },
    apca: 0,
  };
}

function compositeOnBg(fg: OklchColor, bg: OklchColor): OklchColor {
  const fgRgb = toRgb({ mode: 'oklch', ...oklchObj(fg) });
  const bgRgb = toRgb({ mode: 'oklch', ...oklchObj({ ...bg, alpha: 1 }) });
  if (!fgRgb || !bgRgb) return fg;
  const a = fg.alpha;
  const out = {
    mode: 'rgb' as const,
    r: (fgRgb.r ?? 0) * a + (bgRgb.r ?? 0) * (1 - a),
    g: (fgRgb.g ?? 0) * a + (bgRgb.g ?? 0) * (1 - a),
    b: (fgRgb.b ?? 0) * a + (bgRgb.b ?? 0) * (1 - a),
    alpha: 1,
  };
  const oklch = toOklch(out)!;
  return {
    l: oklch.l ?? 0,
    c: Math.max(oklch.c ?? 0, 0),
    h: Number.isFinite(oklch.h) ? (oklch.h as number) : 0,
    alpha: 1,
  };
}

function oklchToLinearSrgb(
  l: number,
  c: number,
  hDeg: number,
): { r: number; g: number; b: number } {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;
  const L = lp * lp * lp;
  const M = mp * mp * mp;
  const S = sp * sp * sp;
  return {
    r: 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    g: -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    b: -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  };
}

function srgbEncode(v: number) {
  const x = v < 0 ? 0 : v > 1 ? 1 : v;
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function clampByte(x: number) {
  return x < 0 ? 0 : x > 255 ? 255 : Math.round(x);
}

export {
  parseColor,
  isValidColor,
  formatColor,
  formatAll,
  gamutInfo,
  mapToGamut,
  findMaxChroma,
  gamutFromFormat,
  contrast,
  oklchToLinearSrgb,
  srgbEncode,
  clampByte,
};
