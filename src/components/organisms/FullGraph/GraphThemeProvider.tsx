import { useRef } from 'react';
import type { ReactNode } from 'react';
import { defaultGraphThemePresetName, resolveGraphTheme } from '@/utils/theme';
import type { GraphTheme, GraphThemePresetName } from '@/utils/theme';
import { GraphThemeContext } from '@/utils/theme/GraphThemeContext';

type GraphThemeProviderProps = {
  /** Named preset to start from. Defaults to `blenderDark` (the current look). */
  preset?: GraphThemePresetName;
  /**
   * Partial theme deep-merged over the preset; overrides win. Inline object
   * literals are safe: resolution is memoized structurally, so the published
   * context identity only changes when the theme's CONTENT changes.
   */
  theme?: GraphTheme;
  children: ReactNode;
};

/**
 * Wrap this around `<FullGraph>` (or any subtree containing one) to theme it.
 * Without this provider the graph keeps its default blenderDark look.
 * Scope note: standalone Tooltip/DragList anywhere under the provider also
 * read the theme context — mount it directly around the graph to scope it.
 * Nesting note: providers do not inherit from outer providers; the innermost
 * one wins wholesale.
 */
function GraphThemeProvider({
  preset,
  theme,
  children,
}: GraphThemeProviderProps) {
  // Structural memo. An identity-keyed useMemo would miss on every render for
  // inline `theme={{...}}` literals — the host re-renders on every store
  // dispatch (drag ticks), and each fresh context value re-renders every
  // useGraphTheme consumer (nodes, handles, edges). Themes are small JSON-ish
  // data, so a stringify key is cheap; the render-phase ref write is the
  // derive-during-render pattern (no effects involved).
  const lastResolvedRef = useRef<{
    cacheKey: string;
    resolvedTheme: GraphTheme;
  } | null>(null);
  const cacheKey = `${preset ?? defaultGraphThemePresetName}|${
    theme === undefined ? '' : JSON.stringify(theme)
  }`;
  if (lastResolvedRef.current?.cacheKey !== cacheKey) {
    lastResolvedRef.current = {
      cacheKey,
      resolvedTheme: resolveGraphTheme(preset, theme),
    };
  }

  return (
    <GraphThemeContext.Provider value={lastResolvedRef.current.resolvedTheme}>
      {children}
    </GraphThemeContext.Provider>
  );
}

export { GraphThemeProvider };
export type { GraphThemeProviderProps };
