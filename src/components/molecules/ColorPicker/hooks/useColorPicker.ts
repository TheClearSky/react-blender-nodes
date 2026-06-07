import { useState, useMemo, useCallback, useRef } from 'react';
import {
  parseColor,
  formatAll,
  gamutFromFormat,
  gamutInfo,
  contrast,
  mapToGamut,
} from '../lib/color';
import type {
  ColorFormat,
  ContrastResult,
  GamutInfo,
  OklchColor,
} from '../lib/types';
import { clamp } from '../lib/math';

type ColorComponent = 'l' | 'c' | 'h' | 'alpha';

type UseColorPickerProps = {
  value?: string | OklchColor;
  defaultValue?: string | OklchColor;
  onValueChange?: (
    color: OklchColor,
    formatted: string,
    formats: Record<ColorFormat, string>,
  ) => void;
  format?: ColorFormat;
  defaultFormat?: ColorFormat;
  onFormatChange?: (format: ColorFormat) => void;
  formats?: ColorFormat[];
  backgroundColor?: string | OklchColor;
};

type ColorPickerState = {
  color: OklchColor;
  format: ColorFormat;
  formatted: string;
  formats: ColorFormat[];
  formatStrings: Record<ColorFormat, string>;
  setColor: (next: string | OklchColor) => void;
  setComponent: (key: ColorComponent, value: number) => void;
  adjustComponent: (key: ColorComponent, delta: number) => void;
  setFormat: (f: ColorFormat) => void;
  setFromString: (s: string) => boolean;
  gamut: GamutInfo;
  contrast: ContrastResult;
  background: OklchColor;
};

const ALL_FORMATS: ColorFormat[] = [
  'hex',
  'rgb',
  'hsl',
  'hsb',
  'oklch',
  'oklab',
  'p3',
];
const BLACK: OklchColor = { l: 0, c: 0, h: 0, alpha: 1 };
const WHITE: OklchColor = { l: 1, c: 0, h: 0, alpha: 1 };

function coerce(
  input: string | OklchColor | undefined,
  fallback: OklchColor,
): OklchColor {
  if (!input) return fallback;
  if (typeof input === 'string') return parseColor(input) ?? fallback;
  return input;
}

function wrapHue(h: number) {
  const m = h % 360;
  return m < 0 ? m + 360 : m;
}

const HUE_EPS = 1e-4;
function isAchromatic(c: OklchColor): boolean {
  return c.c <= HUE_EPS || c.l <= HUE_EPS || c.l >= 1 - HUE_EPS;
}

function applyComponent(
  c: OklchColor,
  key: ColorComponent,
  raw: number,
): OklchColor {
  switch (key) {
    case 'l':
      return { ...c, l: clamp(raw, 0, 1) };
    case 'c':
      return { ...c, c: Math.max(raw, 0) };
    case 'h':
      return { ...c, h: wrapHue(raw) };
    case 'alpha':
      return { ...c, alpha: clamp(raw, 0, 1) };
  }
}

function useColorPicker(props: UseColorPickerProps = {}): ColorPickerState {
  const {
    value: controlledValue,
    defaultValue,
    onValueChange,
    format: controlledFormat,
    defaultFormat = 'hex',
    onFormatChange,
    formats: formatsProp,
    backgroundColor,
  } = props;

  const formats = useMemo<ColorFormat[]>(
    () => (formatsProp && formatsProp.length > 0 ? formatsProp : ALL_FORMATS),
    [formatsProp],
  );
  const initialFormat = formats.includes(defaultFormat)
    ? defaultFormat
    : formats[0];

  const [internalColor, setInternalColor] = useState<OklchColor>(() =>
    coerce(defaultValue, BLACK),
  );
  const [internalFormat, setInternalFormat] =
    useState<ColorFormat>(initialFormat);

  const isControlledColor = controlledValue !== undefined;
  const isControlledFormat = controlledFormat !== undefined;

  const initialHue = coerce(defaultValue, BLACK).h || 0;
  const lastGoodHueRef = useRef<number>(initialHue);

  const isControlledStringInput =
    isControlledColor && typeof controlledValue === 'string';
  const rawColor = isControlledColor
    ? coerce(controlledValue, BLACK)
    : internalColor;
  if (!isAchromatic(rawColor)) lastGoodHueRef.current = rawColor.h;

  const color: OklchColor =
    isControlledStringInput && isAchromatic(rawColor)
      ? { ...rawColor, h: lastGoodHueRef.current }
      : rawColor;
  const format = isControlledFormat ? controlledFormat! : internalFormat;
  const background = coerce(backgroundColor, WHITE);

  const formatStrings = useMemo(() => formatAll(color), [color]);
  const formatted = formatStrings[format];
  const gamutResult = useMemo(() => gamutInfo(color), [color]);
  const contrastResult = useMemo(
    () => contrast(color, background),
    [color, background],
  );

  const commitColor = useCallback(
    (next: OklchColor) => {
      if (!isControlledColor) setInternalColor(next);
      if (onValueChange) {
        const all = formatAll(next);
        onValueChange(next, all[format], all);
      }
    },
    [format, isControlledColor, onValueChange],
  );

  const setColor = useCallback(
    (next: string | OklchColor) => {
      commitColor(coerce(next, color));
    },
    [color, commitColor],
  );

  const setComponent = useCallback(
    (key: ColorComponent, val: number) => {
      commitColor(applyComponent(color, key, val));
    },
    [color, commitColor],
  );

  const adjustComponent = useCallback(
    (key: ColorComponent, delta: number) => {
      const current =
        key === 'l'
          ? color.l
          : key === 'c'
            ? color.c
            : key === 'h'
              ? color.h
              : color.alpha;
      commitColor(applyComponent(color, key, current + delta));
    },
    [color, commitColor],
  );

  const setFormat = useCallback(
    (f: ColorFormat) => {
      const targetGamut = gamutFromFormat(f);
      const info = gamutInfo(color);
      const alreadyIn =
        targetGamut === 'srgb'
          ? info.inSrgb
          : targetGamut === 'p3'
            ? info.inP3
            : info.inRec2020;
      if (!alreadyIn) {
        const targetHue = color.h;
        const clamped = mapToGamut(color, targetGamut);
        commitColor({ ...clamped, h: targetHue });
      }
      if (!isControlledFormat) setInternalFormat(f);
      onFormatChange?.(f);
    },
    [color, commitColor, isControlledFormat, onFormatChange],
  );

  const setFromString = useCallback(
    (s: string) => {
      const parsed = parseColor(s);
      if (!parsed) return false;
      commitColor(parsed);
      return true;
    },
    [commitColor],
  );

  return {
    color,
    format,
    formatted,
    formats,
    formatStrings,
    setColor,
    setComponent,
    adjustComponent,
    setFormat,
    setFromString,
    gamut: gamutResult,
    contrast: contrastResult,
    background,
  };
}

export { useColorPicker };
export type { UseColorPickerProps, ColorPickerState, ColorComponent };
