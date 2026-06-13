import type { GraphTheme } from './graphThemeTypes';
import { mergeGraphThemes } from './mergeGraphThemes';
import { defaultGraphThemePresetName, graphThemePresets } from './presets';
import type { GraphThemePresetName } from './presets';

/**
 * Resolves the effective theme: the named preset (default `blenderDark`)
 * deep-merged with the consumer's partial overrides, overrides winning.
 * Unknown preset names (reachable for untyped JS consumers or config-driven
 * strings) warn and fall back to the default preset instead of silently
 * resolving from `undefined`.
 */
function resolveGraphTheme(
  presetName?: GraphThemePresetName,
  overrides?: GraphTheme,
): GraphTheme {
  const requestedPresetName = presetName ?? defaultGraphThemePresetName;
  const preset = graphThemePresets[requestedPresetName];
  if (preset === undefined) {
    console.warn(
      `[react-blender-nodes] Unknown theme preset '${String(requestedPresetName)}' — falling back to '${defaultGraphThemePresetName}'.`,
    );
    return mergeGraphThemes(
      graphThemePresets[defaultGraphThemePresetName],
      overrides,
    );
  }
  return mergeGraphThemes(preset, overrides);
}

export { resolveGraphTheme };
