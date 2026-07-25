/**
 * Runner-panel view preferences — document-level, PERSISTED runner UI preferences
 * that live on the graph `State` (distinct from the per-recording
 * `RecordingViewState`).
 *
 * - `autoScroll` — auto-scroll the timeline and canvas to follow the selected step.
 * - `followIntoGroups` — open/close group scopes so the canvas follows the scrub
 *   head into the executing group instance.
 *
 * Both are toggled through the `UPDATE_RUNNER_VIEW_PREFERENCE` reducer action,
 * persisted on state export (like `userZones`), and defaulted per-field on read.
 *
 * This module imports NOTHING (a pure leaf) so it can be imported from anywhere
 * without a cycle; the accessor takes a STRUCTURAL parameter (not `State<…>`), which
 * also sidesteps the 4-parameter generic-widening trap at concretely-typed call
 * sites.
 */

export type RunnerViewPreferences = {
  autoScroll: boolean;
  followIntoGroups: boolean;
};

/** The runner view-preference keys (`'autoScroll' | 'followIntoGroups'`). */
export type RunnerViewPreferenceKey = keyof RunnerViewPreferences;

/**
 * Canonical defaults (both ON). Frozen: the accessor never returns this by reference
 * (it builds a fresh object), but freezing makes any accidental mutation throw and
 * keeps a stable identity should it ever be read directly.
 */
export const DEFAULT_RUNNER_VIEW_PREFERENCES: Readonly<RunnerViewPreferences> =
  Object.freeze({ autoScroll: true, followIntoGroups: true });

/**
 * Read the runner view preferences with a PER-FIELD default. A missing, partial, or
 * malformed field (via import, a raw `REPLACE_STATE`, or untyped JS) still yields the
 * correct per-field default, and the return type never lies.
 *
 * CAVEAT: this returns a FRESH object on every call. Consume a boolean field
 * immediately at the call site (`getRunnerViewPreferences(state).autoScroll`); never
 * place the returned object itself in a memo/effect dependency array.
 */
export function getRunnerViewPreferences(state: {
  runnerViewPreferences?: Partial<RunnerViewPreferences>;
}): RunnerViewPreferences {
  const preferences = state.runnerViewPreferences;
  return {
    autoScroll:
      typeof preferences?.autoScroll === 'boolean'
        ? preferences.autoScroll
        : true,
    followIntoGroups:
      typeof preferences?.followIntoGroups === 'boolean'
        ? preferences.followIntoGroups
        : true,
  };
}
