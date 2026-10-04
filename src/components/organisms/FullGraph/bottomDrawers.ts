import type { ReactNode, SetStateAction } from 'react';

/**
 * Bottom drawers — the runner panel's drawer chrome, generalised so a consumer
 * can register drawers of its own that sit BESIDE the runner (one floating
 * open button each, bottom-centre) and share one rule: at most ONE bottom
 * drawer is open at a time. Opening any drawer closes whichever was open;
 * an open drawer's header carries a switcher button for each of the others.
 *
 * This module is a pure leaf (types + helpers, no React runtime) so the
 * provider, `RecordingViewStateProvider`, the tests and the public barrel can
 * all import it without a cycle. The shell (`molecules/BottomDrawerShell`) is
 * drawer-agnostic and does not import it.
 */

/**
 * The reserved id of the built-in runner drawer. It is registered by
 * `FullGraph` whenever `functionImplementations` is provided; a consumer
 * drawer may not use it.
 */
export const RUNNER_DRAWER_ID = 'runner';

/**
 * A consumer-registered bottom drawer (`FullGraphProps.bottomDrawers`).
 *
 * Rendered with the SAME chrome as the runner panel — slide-up animation,
 * three-dot resize handle, header row with a close `X` — and themed by the
 * same `runnerPanel.*` / `runnerToggleButton` slots.
 */
type GraphBottomDrawer = {
  /** Stable, unique id. `'runner'` is reserved for the built-in runner drawer. */
  id: string;
  /**
   * Text on the floating open button, in the drawer's header, and on the
   * switcher button other drawers show for it. Keep it short: switchers sit
   * in the runner's header beside `RunControls`.
   */
  label: string;
  /** Optional icon rendered before the label; the host sizes an SVG to 14px. */
  icon?: ReactNode;
  /** Tooltip of the floating open button. Defaults to `Open <label>`. */
  title?: string;
  /** The drawer body. Rendered inside the host's shell, in a scrollable box. */
  content: ReactNode;
  /**
   * Keep `content` MOUNTED while the drawer is closed (hidden with
   * `display: none`) so its local UI state — zoom, scroll position, selection,
   * a half-typed field — survives closing and reopening, and switching to the
   * runner and back. Defaults to `true`: a user expects a panel to be as they
   * left it. Set `false` for heavy content that should release its resources
   * when closed; it then mounts on open and unmounts after the close
   * animation, like the runner's own timeline.
   * @default true
   */
  keepMounted?: boolean;
  /**
   * Initial height of the drawer body in CSS pixels (the user can still drag
   * the handle; clamped to the shell's 80–600 range). The runner uses 220.
   * @default 220
   */
  defaultHeight?: number;
};

/**
 * What the drawer CHROME needs to know about a drawer (the runner included):
 * identity and labelling, never content.
 */
type BottomDrawerDescriptor = Pick<
  GraphBottomDrawer,
  'id' | 'label' | 'icon' | 'title'
>;

/**
 * Resolve the stored open id against the drawers that are registered RIGHT
 * NOW. An id that is no longer registered — the consumer removed that drawer,
 * or the runner unmounted because `functionImplementations` went away — reads
 * as "nothing open" instead of leaving the chrome in a state no button can
 * reach. (`BottomDrawerProvider` also writes the stored id back to `null` in
 * that case, so a re-registered drawer does not pop open by itself.)
 */
function resolveOpenDrawerId(
  openDrawerId: string | null,
  drawers: ReadonlyArray<BottomDrawerDescriptor>,
): string | null {
  if (openDrawerId === null) return null;
  return drawers.some((drawer) => drawer.id === openDrawerId)
    ? openDrawerId
    : null;
}

/**
 * The runner panel's legacy boolean setter (`setIsRunnerPanelOpen`) mapped onto
 * the single open id. Opening the runner takes over from whatever was open;
 * CLOSING the runner while a DIFFERENT drawer is open leaves that drawer alone
 * (the runner's own close button can only ever close the runner).
 */
function nextOpenDrawerIdForRunner(
  previousOpenDrawerId: string | null,
  runnerOpen: boolean,
): string | null {
  if (runnerOpen) return RUNNER_DRAWER_ID;
  return previousOpenDrawerId === RUNNER_DRAWER_ID
    ? null
    : previousOpenDrawerId;
}

/**
 * `setIsRunnerPanelOpen` accepts React's `SetStateAction<boolean>` — a boolean
 * or an updater. Resolve the updater against "is the runner the open drawer"
 * derived from the previous stored id, then map the boolean onto the next id.
 * Pure, so the one place that answers "what does the updater see?" is testable.
 */
function resolveRunnerOpenAction(
  previousOpenDrawerId: string | null,
  action: SetStateAction<boolean>,
): string | null {
  const runnerOpen =
    typeof action === 'function'
      ? action(previousOpenDrawerId === RUNNER_DRAWER_ID)
      : action;
  return nextOpenDrawerIdForRunner(previousOpenDrawerId, runnerOpen);
}

/**
 * Enforce the id contract on consumer drawers: the reserved runner id is
 * dropped, and only the FIRST drawer of a duplicated id is kept (a duplicate
 * would let two drawers open together, defeating the one-at-a-time rule).
 * Problems are returned as messages for a dev-time `console.error`; the
 * drawers that remain are always safe to render.
 */
function sanitizeBottomDrawers<Drawer extends BottomDrawerDescriptor>(
  drawers: ReadonlyArray<Drawer> | undefined,
): { drawers: Drawer[]; problems: string[] } {
  const kept: Drawer[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const drawer of drawers ?? []) {
    if (drawer.id === RUNNER_DRAWER_ID) {
      problems.push(
        `[FullGraph] bottomDrawers: the id '${RUNNER_DRAWER_ID}' is reserved for the built-in runner drawer; the drawer labelled '${drawer.label}' was dropped.`,
      );
      continue;
    }
    if (seen.has(drawer.id)) {
      problems.push(
        `[FullGraph] bottomDrawers: duplicate id '${drawer.id}'; only the first drawer with that id is rendered.`,
      );
      continue;
    }
    seen.add(drawer.id);
    kept.push(drawer);
  }
  return { drawers: kept, problems };
}

export {
  resolveOpenDrawerId,
  nextOpenDrawerIdForRunner,
  resolveRunnerOpenAction,
  sanitizeBottomDrawers,
};
export type { GraphBottomDrawer, BottomDrawerDescriptor };
