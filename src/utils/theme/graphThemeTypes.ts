/**
 * Options forwarded to ReactFlow's theming surface. Narrow, library-owned
 * types (not re-exported xyflow prop types — including these literal unions
 * instead of xyflow's enums) so the public theme API stays stable across
 * xyflow upgrades and consumers can author plain string literals without
 * depending on xyflow themselves.
 */
type GraphThemeBackgroundVariant = 'lines' | 'dots' | 'cross';

type GraphThemeColorMode = 'light' | 'dark' | 'system';

type GraphThemeBackgroundOptions = {
  variant?: GraphThemeBackgroundVariant;
  color?: string;
  bgColor?: string;
  gap?: number | [number, number];
  size?: number;
  lineWidth?: number;
  className?: string;
};

type GraphThemeMiniMapOptions = {
  bgColor?: string;
  maskColor?: string;
  maskStrokeColor?: string;
  nodeColor?: string;
  nodeStrokeColor?: string;
  nodeBorderRadius?: number;
  className?: string;
};

type GraphThemeControlsOptions = {
  className?: string;
};

type GraphThemeConnectionLineOptions = {
  /** Stroke used while dragging a connection from a handle without a color. */
  fallbackStrokeColor?: string;
};

type GraphThemeReactFlowOptions = {
  colorMode?: GraphThemeColorMode;
  background?: GraphThemeBackgroundOptions;
  miniMap?: GraphThemeMiniMapOptions;
  controls?: GraphThemeControlsOptions;
  connectionLine?: GraphThemeConnectionLineOptions;
};

type GraphThemeNodeSlots = {
  container?: string;
  header?: string;
  headerTitle?: string;
  headerActionIcon?: string;
  body?: string;
  outputsSection?: string;
  outputRow?: string;
  inputsSection?: string;
  inputRow?: string;
  panelHeader?: string;
  panelContent?: string;
  inputField?: string;
  handleShape?: string;
  /**
   * The fan-in connection-reorder trigger — the accent-colored count badge shown
   * on a multi-connection input handle. Merged onto the popover trigger button.
   */
  inputOrderBadge?: string;
  /**
   * Reorder-popover-SPECIFIC overrides, layered ON TOP of the shared
   * `popover.surface` slot. Prefer `popover.surface` for the surface bg/border/
   * text (it themes every portaled popover at once — see the `neonHeist` demo);
   * use this slot only for tweaks unique to the connection-reorder popover.
   * Portaled, so root var overrides can't reach it.
   */
  inputOrderPopover?: string;
};

type GraphThemeEdgeSlots = {
  valuePillBox?: string;
  valuePillText?: string;
};

type GraphThemeStatusIndicatorSlots = {
  tooltip?: string;
};

type GraphThemeContextMenuSlots = {
  list?: string;
  item?: string;
  itemLabel?: string;
  shortcut?: string;
  separator?: string;
  submenuPanel?: string;
};

type GraphThemeBreadcrumbsSlots = {
  container?: string;
  backButton?: string;
  selectTrigger?: string;
  selectContent?: string;
  list?: string;
  item?: string;
  editButton?: string;
};

type GraphThemeErrorBoundarySlots = {
  container?: string;
  retryButton?: string;
};

type GraphThemeRunnerPanelSlots = {
  container?: string;
  resizeHandle?: string;
  /**
   * The panel's `X` close button — AND the `⋯` overflow-menu triggers
   * (RunControls + Timeline), which share its default hover styling (they differ
   * only in layout utilities). Styling this slot themes all three.
   */
  closeButton?: string;
  /**
   * The `⋯` overflow-menu popover surface (shared by the RunControls and
   * Timeline toolbars when they collapse on a narrow container). It is PORTALED
   * (`FloatingPortal` → `document.body`), so the `root` slot's CSS-var overrides
   * cannot reach it. Set EVERYTHING the menu needs in this one string: bg/border,
   * resting text (via descendant `[&_.text-*]` re-anchors), and control vars
   * (`--color-graph-toggle-track-bg`, slider `--color-primary-gray`) — see the
   * light preset. Per-state hover/selected use the two slots below.
   */
  overflowMenu?: string;
  /**
   * Hover state of an interactive row inside the `⋯` menu. Applied directly to
   * the run-target rows / zoom buttons and forwarded as `ButtonToggle`'s
   * `inactiveClassName`, so it themes the inlined `hover:` state a container-slot
   * descendant override cannot reach. Provide a hover class, e.g.
   * `hover:bg-zinc-200`.
   */
  overflowMenuItem?: string;
  /**
   * The SELECTED state inside the `⋯` menu (active run-target row, active
   * `ButtonToggle` segment). Provide bg AND text — the active segment's default
   * `text-white` is intentionally NOT reachable by descendant text overrides, so
   * you MUST set a text color here for light backgrounds, e.g.
   * `bg-blue-100 text-zinc-900`.
   */
  overflowMenuItemActive?: string;
};

type GraphThemeRunControlsSlots = {
  container?: string;
  statusDot?: string;
  statusLabel?: string;
  divider?: string;
  actionButton?: string;
  playButton?: string;
};

type GraphThemeTimelineSlots = {
  container?: string;
  toolbar?: string;
  toolbarButton?: string;
  navButton?: string;
  ruler?: string;
  block?: string;
  loopHeader?: string;
  switchHeader?: string;
  /** Expanded loop-iteration / switch-branch detail wrapper box. */
  detailBox?: string;
  trackArea?: string;
};

type GraphThemeInspectorSlots = {
  container?: string;
  header?: string;
  sectionHeader?: string;
  statusBadge?: string;
  timelineBox?: string;
  valueBox?: string;
  contextBox?: string;
  errorBox?: string;
};

type GraphThemeDrawerSlots = {
  container?: string;
  header?: string;
  title?: string;
  closeButton?: string;
  content?: string;
  footer?: string;
  label?: string;
  emptyState?: string;
  footerButton?: string;
};

type GraphThemeModalSlots = {
  overlay?: string;
  content?: string;
  header?: string;
  title?: string;
  body?: string;
  footer?: string;
};

type GraphThemeConnectionMiniMapSlots = {
  container?: string;
};

type GraphThemeDragListSlots = {
  row?: string;
  ghost?: string;
  preview?: string;
};

type GraphThemeSelectSlots = {
  trigger?: string;
  content?: string;
  item?: string;
};

type GraphThemeTooltipSlots = {
  content?: string;
};

type GraphThemeColorPickerSlots = {
  /** Floating panel of the header-color picker (portaled — root vars don't reach it). */
  popover?: string;
};

/**
 * The shared `atoms/Popover` surface (portaled — root vars don't reach it). Read
 * by EVERY internal popover built on that atom: the runner toolbars' `⋯` overflow
 * menus and the node connection-order badge. A theme can re-anchor the surface
 * bg/border/text ONCE here instead of per consumer; the per-consumer slots
 * (`runnerPanel.overflowMenu`, `node.inputOrderPopover`) still layer ON TOP for
 * popover-specific extras. Set this whenever you theme any portaled popover so a
 * forgotten consumer doesn't stay default-dark while the rest of the theme changes.
 */
type GraphThemePopoverSlots = {
  surface?: string;
};

/**
 * A theme is a map of per-component/per-slot Tailwind className overrides.
 * Every slot is appended LAST at its consumption site via `cn()`, so
 * tailwind-merge resolves conflicts in the theme's favor while non-conflicting
 * default classes are kept. The `root` slot is also the place for
 * CSS-variable overrides via arbitrary-property classes (e.g.
 * `[--color-graph-menu-bg:#f5f5f5]`) which restyle the var-driven surfaces
 * (scrollbars, glows, timeline accents, edge value pills).
 *
 * NOTE: portaled surfaces (modals, context menus, selects rendered without
 * `renderInline`, tooltips, drag previews, the color-picker popover) render
 * outside the FullGraph DOM subtree, so `root` var overrides do NOT reach
 * them — style those through their dedicated className slots (which may
 * themselves re-anchor vars, e.g. `[--color-tooltip-bg:#ffffff]`).
 */
type GraphTheme = {
  root?: string;
  reactFlow?: GraphThemeReactFlowOptions;
  node?: GraphThemeNodeSlots;
  edge?: GraphThemeEdgeSlots;
  statusIndicator?: GraphThemeStatusIndicatorSlots;
  contextMenu?: GraphThemeContextMenuSlots;
  breadcrumbs?: GraphThemeBreadcrumbsSlots;
  errorBoundary?: GraphThemeErrorBoundarySlots;
  runnerToggleButton?: string;
  runnerPanel?: GraphThemeRunnerPanelSlots;
  runControls?: GraphThemeRunControlsSlots;
  timeline?: GraphThemeTimelineSlots;
  inspector?: GraphThemeInspectorSlots;
  drawer?: GraphThemeDrawerSlots;
  modal?: GraphThemeModalSlots;
  connectionMiniMap?: GraphThemeConnectionMiniMapSlots;
  dragList?: GraphThemeDragListSlots;
  select?: GraphThemeSelectSlots;
  tooltip?: GraphThemeTooltipSlots;
  colorPicker?: GraphThemeColorPickerSlots;
  popover?: GraphThemePopoverSlots;
};

export type {
  GraphTheme,
  GraphThemeBackgroundVariant,
  GraphThemeColorMode,
  GraphThemeReactFlowOptions,
  GraphThemeBackgroundOptions,
  GraphThemeMiniMapOptions,
  GraphThemeControlsOptions,
  GraphThemeConnectionLineOptions,
  GraphThemeNodeSlots,
  GraphThemeEdgeSlots,
  GraphThemeStatusIndicatorSlots,
  GraphThemeContextMenuSlots,
  GraphThemeBreadcrumbsSlots,
  GraphThemeErrorBoundarySlots,
  GraphThemeRunnerPanelSlots,
  GraphThemeRunControlsSlots,
  GraphThemeTimelineSlots,
  GraphThemeInspectorSlots,
  GraphThemeDrawerSlots,
  GraphThemeModalSlots,
  GraphThemeConnectionMiniMapSlots,
  GraphThemeDragListSlots,
  GraphThemeSelectSlots,
  GraphThemeTooltipSlots,
  GraphThemeColorPickerSlots,
  GraphThemePopoverSlots,
};
