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
  closeButton?: string;
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
};
