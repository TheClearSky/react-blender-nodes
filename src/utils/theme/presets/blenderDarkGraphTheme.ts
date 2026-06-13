import type { GraphTheme } from '../graphThemeTypes';

/**
 * The built-in default look. Intentionally empty: the components' default
 * classes ARE the blenderDark preset, so applying it changes nothing — it
 * exists as a named base for overrides and an explicit way to opt into the
 * default look.
 */
const blenderDarkGraphTheme: GraphTheme = {};

export { blenderDarkGraphTheme };
