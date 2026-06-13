import type { GraphTheme } from './graphThemeTypes';

// Assigning these own keys on a plain object goes through Object.prototype
// machinery (swapping the result's prototype instead of creating a
// property), which would let a JSON-sourced theme smuggle slots invisible
// to Object.keys/JSON.stringify.
const dangerousMergeKeys = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function mergeRecords(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
  ancestorOverrides: WeakSet<object>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, overrideValue] of Object.entries(overrides)) {
    if (dangerousMergeKeys.has(key)) continue;
    if (overrideValue === undefined) continue;
    const baseValue = merged[key];
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      if (ancestorOverrides.has(overrideValue)) {
        throw new Error(
          `mergeGraphThemes: circular reference in theme overrides at key '${key}'`,
        );
      }
      ancestorOverrides.add(overrideValue);
      merged[key] = mergeRecords(baseValue, overrideValue, ancestorOverrides);
      ancestorOverrides.delete(overrideValue);
    } else {
      merged[key] = overrideValue;
    }
  }
  return merged;
}

/**
 * Deep-merges two themes: nested plain objects merge recursively; strings,
 * numbers, and arrays (e.g. Background `gap: [x, y]` tuples) REPLACE the base
 * value; `undefined` override values keep the base; `null` REPLACES it.
 * Neither input is mutated, but the RESULT shares untouched sections with
 * `base` by reference — treat resolved themes as immutable (the built-in
 * presets are deep-frozen, so mutating them throws in strict mode). Non-plain
 * objects (Map, Date, class instances) REPLACE rather than merge;
 * `__proto__`/`constructor`/`prototype` override keys are ignored; circular
 * override structures throw instead of overflowing the stack.
 */
function mergeGraphThemes(
  base: GraphTheme,
  overrides?: GraphTheme,
): GraphTheme {
  if (overrides === undefined) return { ...base };
  return mergeRecords(
    base as Record<string, unknown>,
    overrides as Record<string, unknown>,
    new WeakSet(),
  ) as GraphTheme;
}

export { mergeGraphThemes };
