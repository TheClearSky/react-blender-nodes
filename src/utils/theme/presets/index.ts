import type { GraphTheme } from '../graphThemeTypes';
import { blenderDarkGraphTheme } from './blenderDarkGraphTheme';
import { lightGraphTheme } from './lightGraphTheme';

const graphThemePresetNames = ['blenderDark', 'light'] as const;

type GraphThemePresetName = (typeof graphThemePresetNames)[number];

const defaultGraphThemePresetName: GraphThemePresetName = 'blenderDark';

// Presets are exported module singletons, and resolved themes alias their
// untouched sections by reference (mergeGraphThemes copies only what an
// override touches). Freezing turns any accidental mutation of a resolved
// theme into a loud TypeError instead of silent global preset corruption.
function deepFreezeGraphTheme<ValueType>(value: ValueType): ValueType {
  if (value !== null && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      deepFreezeGraphTheme(nestedValue);
    }
    Object.freeze(value);
  }
  return value;
}

const graphThemePresets: Record<GraphThemePresetName, GraphTheme> = {
  blenderDark: deepFreezeGraphTheme(blenderDarkGraphTheme),
  light: deepFreezeGraphTheme(lightGraphTheme),
};

export {
  graphThemePresetNames,
  defaultGraphThemePresetName,
  graphThemePresets,
  blenderDarkGraphTheme,
  lightGraphTheme,
};
export type { GraphThemePresetName };
