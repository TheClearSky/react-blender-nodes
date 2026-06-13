import { createContext, useContext } from 'react';
import type { GraphTheme } from './graphThemeTypes';

/**
 * Optional theme context for the FullGraph tree. No provider means
 * `undefined`, and every consumption site falls back to the default
 * (blenderDark) classes — zero behavior change without a provider.
 *
 * Layer note: this module is a deliberate leaf (react + theme types only) so
 * atoms/molecules can read it without importing organism code. Do not add
 * component imports here.
 *
 * Advanced surface: providing `GraphThemeContext.Provider` directly bypasses
 * `resolveGraphTheme` — the value MUST already be a resolved theme. Prefer
 * `GraphThemeProvider`.
 */
const GraphThemeContext = createContext<GraphTheme | undefined>(undefined);

function useGraphTheme(): GraphTheme | undefined {
  return useContext(GraphThemeContext);
}

export { GraphThemeContext, useGraphTheme };
