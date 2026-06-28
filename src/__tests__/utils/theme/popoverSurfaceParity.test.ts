import { describe, it, expect } from 'vitest';
import {
  lightGraphTheme,
  blenderDarkGraphTheme,
  type GraphTheme,
} from '@/utils/theme';

// The shared `atoms/Popover` surface is themed by THREE cooperating slots that the
// atom merges (`Popover.tsx`: `cn(base, theme?.popover?.surface, contentClassName)`):
// the shared base `popover.surface`, plus the two per-consumer overrides
// `runnerPanel.overflowMenu` (the RunControls + Timeline `⋯` overflow menus) and
// `node.inputOrderPopover` (the fan-in connection-reorder badge). They are SIBLING
// levers on the same div, not a hierarchy — a consumer is themed by EITHER the
// shared base OR its own per-slot.
//
// The regression class this guards: a theme re-skins ONE portaled popover consumer
// and forgets another, so the forgotten one falls back to the default dark
// `--color-graph-elevated-surface-bg` (#222) — e.g. a dark reorder popover on a
// near-white canvas. Contract: if a theme themes ANY popover consumer it must theme
// them ALL, by whatever lever. We assert this on the SHIPPED presets (the themes
// users actually get); the demo gallery themes are covered by the `popover.surface`
// contract JSDoc + their visual stories.
//
// NOTE: this is a PRESENCE check, not a render check — a slot whose value fails to
// actually re-anchor the surface bg is the job of the visual stories
// (`WithFanInConnectionOrderThemed` / the Neon-Heist reorder story), not this test.

/** The connection-reorder popover surface is themed (shared base OR its per-slot). */
function reorderPopoverThemed(theme: GraphTheme): boolean {
  return Boolean(theme.popover?.surface || theme.node?.inputOrderPopover);
}

/** The runner `⋯` overflow-menu surface is themed (shared base OR its per-slot). */
function runnerMenusThemed(theme: GraphTheme): boolean {
  return Boolean(theme.popover?.surface || theme.runnerPanel?.overflowMenu);
}

function anyPopoverThemed(theme: GraphTheme): boolean {
  return reorderPopoverThemed(theme) || runnerMenusThemed(theme);
}

describe('shipped preset — Popover surface parity', () => {
  it('lightGraphTheme themes EVERY portaled Popover consumer', () => {
    // The light preset re-skins for a near-white canvas — neither popover may stay
    // on the dark default. It uses the per-consumer slots (`overflowMenu` +
    // `inputOrderPopover`), NOT `popover.surface`; both are valid levers, which is
    // exactly why the checks are disjunctions. If a future refactor drops
    // `node.inputOrderPopover` from this preset, the reorder check fails here — the
    // real, shipped D-5 regression.
    expect(anyPopoverThemed(lightGraphTheme)).toBe(true); // not vacuously empty
    expect(reorderPopoverThemed(lightGraphTheme)).toBe(true);
    expect(runnerMenusThemed(lightGraphTheme)).toBe(true);
  });

  it('blenderDark (default preset) themes no Popover surface, by design', () => {
    // The default preset is empty — the components' own dark classes ARE the theme,
    // so every popover correctly stays on the shared default surface.
    expect(anyPopoverThemed(blenderDarkGraphTheme)).toBe(false);
  });
});
