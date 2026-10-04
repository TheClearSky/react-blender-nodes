import type { GraphTheme } from '../graphThemeTypes';

/**
 * Full-coverage light preset.
 *
 * Three mechanisms compose here, all className-driven:
 * 1. Plain slot classes appended after the dark defaults (tailwind-merge
 *    resolves the conflicts in the theme's favor).
 * 2. CSS-variable overrides via arbitrary-property classes on `root` — these
 *    retheme the var-driven surfaces (scrollbars, glows, edge value pills,
 *    timeline accents, resize handle). They reach IN-TREE consumers only;
 *    portaled surfaces (menus, modals, selects, tooltips, drag previews) are
 *    themed through their dedicated slots instead.
 * 3. Descendant-targeted variants like `[&_.rbn\\:text-primary-white]:text-zinc-900`
 *    on container slots — they out-specify the token utility on every nested
 *    text node without needing a slot per span.
 */
const LIGHT_TEXT_OVERRIDES =
  'rbn:[&_.rbn\\:text-primary-white]:text-zinc-900 rbn:[&_[class*="rbn:text-primary-white/"]]:text-zinc-600 rbn:[&_.rbn\\:text-secondary-light-gray]:text-zinc-500 rbn:[&_.rbn\\:text-secondary-dark-gray]:text-zinc-400';

const lightGraphTheme: GraphTheme = {
  root: [
    'rbn:[--color-graph-scrollbar-thumb:#b8b8b8]',
    'rbn:[--color-timeline-scrollbar-thumb:#b0b0b0]',
    'rbn:[--color-timeline-scrollbar-track:#e8e8e8]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#e0e0e0]',
    'rbn:[--color-timeline-ruler-border:#d4d4d4]',
    'rbn:[--color-timeline-tick:#9a9a9a]',
    'rbn:[--color-edge-value-pill-bg:#ffffff]',
    'rbn:[--color-edge-value-pill-border:#c8c8c8]',
    'rbn:[--color-edge-value-pill-text:#27272a]',
    'rbn:[--color-runner-muted-text:#6b7280]',
    'rbn:[--color-timeline-hover-text:#18181b]',
    'rbn:[--color-inspector-progress-track:#d4d4d8]',
    'rbn:[--color-inspector-skipped:#6b7280]',
    'rbn:[--color-runner-resize-handle-bg:#e4e4e7]',
    'rbn:[--color-runner-resize-handle-hover-bg:#d4d4d8]',
    'rbn:[--color-graph-node-panel-content-bg:#ededed]',
    'rbn:[--color-graph-toggle-track-bg:#e4e4e7]',
    'rbn:[--color-drag-list-ghost-accent:#71717a]',
    'rbn:[--color-drag-list-item-hover-bg:#d4d4d8]',
    'rbn:[--color-graph-menu-bg:#ffffff]',
    'rbn:[--color-graph-elevated-surface-bg:#fafafa]',
    'rbn:[--color-graph-input-placeholder:#9ca3af]',
    // in-tree tooltip arrows (NodeStatusIndicator) read this var
    'rbn:[--color-tooltip-bg:#ffffff]',
    // light-button surfaces + SliderNumberInput gradient remainder
    'rbn:[--color-primary-gray:#d4d4d8]',
  ].join(' '),
  reactFlow: {
    colorMode: 'light',
    background: { color: '#d4d4d4', bgColor: '#f5f5f5' },
    miniMap: {
      bgColor: '#ffffff',
      maskColor: 'rgba(228, 228, 231, 0.6)',
      nodeColor: '#d4d4d8',
      nodeStrokeColor: '#a1a1aa',
    },
  },
  node: {
    // A resting border + soft shadow so nodes read as raised cards against
    // the near-white canvas — without it, a light body (≈ the canvas color)
    // has no visible boundary (the light-on-light mirror of dark-on-dark).
    container:
      'rbn:border-zinc-300 rbn:shadow-md rbn:shadow-zinc-400/20 rbn:focus:border-zinc-900 rbn:in-[.selected]:border-zinc-900',
    body: 'rbn:bg-white',
    outputRow: 'rbn:text-zinc-900',
    inputRow: 'rbn:text-zinc-900',
    panelHeader: 'rbn:text-zinc-900 rbn:hover:bg-zinc-300',
    inputField:
      'rbn:bg-white rbn:text-zinc-900 rbn:border-zinc-300 rbn:placeholder:text-zinc-400',
    // The fan-in reorder popover is PORTALED, so root var overrides + the node
    // subtree's text recolors can't reach it — set the surface's light bg/border
    // + text overrides here (mirrors select.content / tooltip.content), plus
    // re-anchor the drag-list vars the portaled DragList can't otherwise see.
    inputOrderPopover: `rbn:bg-white rbn:border-zinc-300 ${LIGHT_TEXT_OVERRIDES} rbn:[&_.rbn\\:border-secondary-dark-gray]:border-zinc-300 rbn:[--color-drag-list-item-hover-bg:#d4d4d8] rbn:[--color-drag-list-ghost-accent:#71717a]`,
    // The preview panel sits ON TOP of the node; on light it needs a light
    // surface + border + text recolors (its dark default is `bg-primary-dark-gray`).
    // The fallback error card's `hover:text-primary-white` is a hover VARIANT (not
    // a static class), so it escapes LIGHT_TEXT_OVERRIDES — recolor button hovers
    // here too.
    previewPanel: `rbn:bg-zinc-100 rbn:border rbn:border-zinc-300 ${LIGHT_TEXT_OVERRIDES} rbn:[&_button:hover]:text-zinc-900`,
  },
  statusIndicator: {
    // The arrow SVG reads vars; re-anchoring them on the slot keeps the
    // arrow matched to the panel (slot scope beats the root override).
    tooltip:
      'rbn:bg-zinc-50 rbn:border-zinc-300 rbn:text-zinc-900 rbn:[--color-tooltip-bg:#fafafa] rbn:[--color-secondary-dark-gray:#d4d4d8]',
  },
  contextMenu: {
    list: 'rbn:bg-white rbn:border-zinc-200 rbn:shadow-zinc-400/30',
    item: 'rbn:hover:bg-zinc-200',
    itemLabel: 'rbn:text-zinc-900',
    shortcut: 'rbn:text-zinc-500',
    separator: 'rbn:border-zinc-300',
    submenuPanel: 'rbn:bg-white rbn:shadow-zinc-400/30',
  },
  breadcrumbs: {
    backButton:
      'rbn:bg-zinc-100 rbn:border-zinc-300 rbn:text-zinc-900 rbn:hover:bg-zinc-200',
    selectTrigger:
      'rbn:bg-zinc-100 rbn:text-zinc-900 rbn:border-zinc-300 rbn:hover:bg-zinc-200',
    list: 'rbn:text-zinc-900',
    editButton: 'rbn:text-zinc-900 rbn:hover:bg-zinc-300',
  },
  errorBoundary: {
    container: 'rbn:bg-zinc-100 rbn:text-zinc-700',
    retryButton:
      'rbn:border-zinc-300 rbn:bg-white rbn:text-zinc-700 rbn:hover:bg-zinc-200',
  },
  runnerToggleButton:
    'rbn:border-zinc-300 rbn:bg-white/90 rbn:text-zinc-900 rbn:hover:bg-zinc-200',
  runnerPanel: {
    container: `rbn:bg-zinc-50 rbn:border-zinc-300 ${LIGHT_TEXT_OVERRIDES}`,
    closeButton:
      'rbn:text-zinc-500 rbn:hover:bg-zinc-200 rbn:hover:text-zinc-900',
    // Portaled ⋯ menu: explicit light bg/border + text overrides, plus
    // re-anchored control vars (toggle track, slider gradient) — none of which
    // the root var overrides can reach inside the portal. The interactive
    // hover/selected states are themed per-element via the `overflowMenuItem`
    // slots below (a surface descendant override can't reach an inlined
    // `hover:` variant).
    overflowMenu: `rbn:bg-white rbn:border-zinc-300 ${LIGHT_TEXT_OVERRIDES} rbn:[--color-graph-toggle-track-bg:#e4e4e7] rbn:[--color-primary-gray:#d4d4d8] rbn:[&_.rbn\\:border-secondary-dark-gray]:border-zinc-300`,
    overflowMenuItem: 'rbn:hover:bg-zinc-200 rbn:hover:text-zinc-900',
    overflowMenuItemActive: 'rbn:bg-blue-100 rbn:text-zinc-900',
  },
  runControls: {
    container: 'rbn:bg-zinc-100 rbn:border-zinc-300',
    statusLabel: 'rbn:text-zinc-900',
    divider: 'rbn:bg-zinc-300',
    actionButton:
      'rbn:text-zinc-700 rbn:hover:bg-zinc-200 rbn:hover:text-zinc-900',
  },
  timeline: {
    container: `rbn:bg-zinc-100 ${LIGHT_TEXT_OVERRIDES}`,
    toolbar: 'rbn:bg-zinc-100',
    toolbarButton:
      'rbn:text-zinc-900 rbn:hover:bg-zinc-200 rbn:hover:text-primary-blue',
    navButton:
      'rbn:border-zinc-300 rbn:bg-white rbn:text-zinc-700 rbn:hover:bg-blue-200',
    ruler: 'rbn:bg-zinc-200',
    trackArea: 'rbn:bg-zinc-50 rbn:border-zinc-300',
    loopHeader: 'rbn:bg-zinc-100',
    switchHeader: 'rbn:bg-zinc-100',
    detailBox: 'rbn:bg-zinc-200/50',
  },
  inspector: {
    container: `rbn:bg-zinc-50 ${LIGHT_TEXT_OVERRIDES}`,
    header: 'rbn:border-zinc-300',
    sectionHeader: 'rbn:bg-zinc-200 rbn:text-zinc-900 rbn:border-zinc-300',
    timelineBox: 'rbn:bg-zinc-100 rbn:border-zinc-300',
    valueBox: 'rbn:bg-white rbn:border-zinc-300 rbn:text-zinc-900',
    contextBox: 'rbn:border-zinc-300',
    errorBox: 'rbn:border-red-300 rbn:bg-red-100/60',
  },
  drawer: {
    container: `rbn:bg-zinc-50 rbn:border-zinc-300 ${LIGHT_TEXT_OVERRIDES}`,
    header: 'rbn:border-zinc-300',
    title: 'rbn:text-zinc-900',
    closeButton: 'rbn:hover:bg-zinc-200',
    footer: 'rbn:border-zinc-300',
    label: 'rbn:text-zinc-900',
    emptyState: 'rbn:text-zinc-500',
    footerButton:
      'rbn:bg-zinc-200 rbn:text-zinc-900 rbn:border-zinc-300 rbn:hover:bg-zinc-300',
  },
  modal: {
    overlay: 'rbn:bg-black/30',
    content: `rbn:bg-zinc-50 rbn:border-zinc-300 ${LIGHT_TEXT_OVERRIDES}`,
    title: 'rbn:text-zinc-900',
  },
  connectionMiniMap: {
    // Always rendered inside portaled modals, so the bg must live in the
    // slot — root var overrides can't reach it.
    container: 'rbn:bg-zinc-100 rbn:border-zinc-300',
  },
  dragList: {
    row: 'rbn:bg-zinc-200 rbn:text-zinc-900 rbn:hover:bg-zinc-300',
    preview:
      'rbn:bg-zinc-200 rbn:border-zinc-300 rbn:text-zinc-900 rbn:[&_.rbn\\:text-primary-white]:text-zinc-900',
  },
  select: {
    trigger:
      'rbn:bg-white rbn:text-zinc-900 rbn:border-zinc-300 rbn:hover:bg-zinc-100',
    content: `rbn:bg-white rbn:border-zinc-300 rbn:text-zinc-900 ${LIGHT_TEXT_OVERRIDES}`,
    item: 'rbn:hover:bg-zinc-200',
  },
  tooltip: {
    // Arrow fill/stroke are var-driven SVG attributes on a PORTALED surface;
    // re-anchor the vars on the slot so the arrow follows the panel.
    content: `rbn:bg-white rbn:border-zinc-400/60 rbn:text-zinc-900 rbn:[--color-tooltip-bg:#ffffff] rbn:[--color-secondary-dark-gray:#d4d4d8] ${LIGHT_TEXT_OVERRIDES}`,
  },
  colorPicker: {
    popover: 'rbn:bg-zinc-50 rbn:border-zinc-300',
  },
};

export { lightGraphTheme };
