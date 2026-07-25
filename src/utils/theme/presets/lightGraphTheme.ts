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
 * 3. Descendant-targeted variants like `[&_.text-primary-white]:text-zinc-900`
 *    on container slots — they out-specify the token utility on every nested
 *    text node without needing a slot per span.
 */
const LIGHT_TEXT_OVERRIDES =
  '[&_.text-primary-white]:text-zinc-900 [&_[class*="text-primary-white/"]]:text-zinc-600 [&_.text-secondary-light-gray]:text-zinc-500 [&_.text-secondary-dark-gray]:text-zinc-400';

const lightGraphTheme: GraphTheme = {
  root: [
    '[--color-graph-scrollbar-thumb:#b8b8b8]',
    '[--color-timeline-scrollbar-thumb:#b0b0b0]',
    '[--color-timeline-scrollbar-track:#e8e8e8]',
    '[--color-timeline-scrollbar-track-webkit:#e0e0e0]',
    '[--color-timeline-ruler-border:#d4d4d4]',
    '[--color-timeline-tick:#9a9a9a]',
    '[--color-edge-value-pill-bg:#ffffff]',
    '[--color-edge-value-pill-border:#c8c8c8]',
    '[--color-edge-value-pill-text:#27272a]',
    '[--color-runner-muted-text:#6b7280]',
    '[--color-timeline-hover-text:#18181b]',
    '[--color-inspector-progress-track:#d4d4d8]',
    '[--color-inspector-skipped:#6b7280]',
    '[--color-runner-resize-handle-bg:#e4e4e7]',
    '[--color-runner-resize-handle-hover-bg:#d4d4d8]',
    '[--color-graph-node-panel-content-bg:#ededed]',
    '[--color-graph-toggle-track-bg:#e4e4e7]',
    '[--color-drag-list-ghost-accent:#71717a]',
    '[--color-drag-list-item-hover-bg:#d4d4d8]',
    '[--color-graph-menu-bg:#ffffff]',
    '[--color-graph-elevated-surface-bg:#fafafa]',
    '[--color-graph-input-placeholder:#9ca3af]',
    // in-tree tooltip arrows (NodeStatusIndicator) read this var
    '[--color-tooltip-bg:#ffffff]',
    // light-button surfaces + SliderNumberInput gradient remainder
    '[--color-primary-gray:#d4d4d8]',
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
      'border-zinc-300 shadow-md shadow-zinc-400/20 focus:border-zinc-900 in-[.selected]:border-zinc-900',
    body: 'bg-white',
    outputRow: 'text-zinc-900',
    inputRow: 'text-zinc-900',
    panelHeader: 'text-zinc-900 hover:bg-zinc-300',
    inputField:
      'bg-white text-zinc-900 border-zinc-300 placeholder:text-zinc-400',
    // The fan-in reorder popover is PORTALED, so root var overrides + the node
    // subtree's text recolors can't reach it — set the surface's light bg/border
    // + text overrides here (mirrors select.content / tooltip.content), plus
    // re-anchor the drag-list vars the portaled DragList can't otherwise see.
    inputOrderPopover: `bg-white border-zinc-300 ${LIGHT_TEXT_OVERRIDES} [&_.border-secondary-dark-gray]:border-zinc-300 [--color-drag-list-item-hover-bg:#d4d4d8] [--color-drag-list-ghost-accent:#71717a]`,
    // The preview panel sits ON TOP of the node; on light it needs a light
    // surface + border + text recolors (its dark default is `bg-primary-dark-gray`).
    // The fallback error card's `hover:text-primary-white` is a hover VARIANT (not
    // a static class), so it escapes LIGHT_TEXT_OVERRIDES — recolor button hovers
    // here too.
    previewPanel: `bg-zinc-100 border border-zinc-300 ${LIGHT_TEXT_OVERRIDES} [&_button:hover]:text-zinc-900`,
  },
  statusIndicator: {
    // The arrow SVG reads vars; re-anchoring them on the slot keeps the
    // arrow matched to the panel (slot scope beats the root override).
    tooltip:
      'bg-zinc-50 border-zinc-300 text-zinc-900 [--color-tooltip-bg:#fafafa] [--color-secondary-dark-gray:#d4d4d8]',
  },
  contextMenu: {
    list: 'bg-white border-zinc-200 shadow-zinc-400/30',
    item: 'hover:bg-zinc-200',
    itemLabel: 'text-zinc-900',
    shortcut: 'text-zinc-500',
    separator: 'border-zinc-300',
    submenuPanel: 'bg-white shadow-zinc-400/30',
  },
  breadcrumbs: {
    backButton: 'bg-zinc-100 border-zinc-300 text-zinc-900 hover:bg-zinc-200',
    selectTrigger:
      'bg-zinc-100 text-zinc-900 border-zinc-300 hover:bg-zinc-200',
    list: 'text-zinc-900',
    editButton: 'text-zinc-900 hover:bg-zinc-300',
  },
  errorBoundary: {
    container: 'bg-zinc-100 text-zinc-700',
    retryButton: 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-200',
  },
  runnerToggleButton:
    'border-zinc-300 bg-white/90 text-zinc-900 hover:bg-zinc-200',
  runnerPanel: {
    container: `bg-zinc-50 border-zinc-300 ${LIGHT_TEXT_OVERRIDES}`,
    closeButton: 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900',
    // Portaled ⋯ menu: explicit light bg/border + text overrides, plus
    // re-anchored control vars (toggle track, slider gradient) — none of which
    // the root var overrides can reach inside the portal. The interactive
    // hover/selected states are themed per-element via the `overflowMenuItem`
    // slots below (a surface descendant override can't reach an inlined
    // `hover:` variant).
    overflowMenu: `bg-white border-zinc-300 ${LIGHT_TEXT_OVERRIDES} [--color-graph-toggle-track-bg:#e4e4e7] [--color-primary-gray:#d4d4d8] [&_.border-secondary-dark-gray]:border-zinc-300`,
    overflowMenuItem: 'hover:bg-zinc-200 hover:text-zinc-900',
    overflowMenuItemActive: 'bg-blue-100 text-zinc-900',
  },
  runControls: {
    container: 'bg-zinc-100 border-zinc-300',
    statusLabel: 'text-zinc-900',
    divider: 'bg-zinc-300',
    actionButton: 'text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900',
  },
  timeline: {
    container: `bg-zinc-100 ${LIGHT_TEXT_OVERRIDES}`,
    toolbar: 'bg-zinc-100',
    toolbarButton: 'text-zinc-900 hover:bg-zinc-200 hover:text-primary-blue',
    navButton: 'border-zinc-300 bg-white text-zinc-700 hover:bg-blue-200',
    ruler: 'bg-zinc-200',
    trackArea: 'bg-zinc-50 border-zinc-300',
    loopHeader: 'bg-zinc-100',
    switchHeader: 'bg-zinc-100',
    detailBox: 'bg-zinc-200/50',
  },
  inspector: {
    container: `bg-zinc-50 ${LIGHT_TEXT_OVERRIDES}`,
    header: 'border-zinc-300',
    sectionHeader: 'bg-zinc-200 text-zinc-900 border-zinc-300',
    timelineBox: 'bg-zinc-100 border-zinc-300',
    valueBox: 'bg-white border-zinc-300 text-zinc-900',
    contextBox: 'border-zinc-300',
    errorBox: 'border-red-300 bg-red-100/60',
  },
  drawer: {
    container: `bg-zinc-50 border-zinc-300 ${LIGHT_TEXT_OVERRIDES}`,
    header: 'border-zinc-300',
    title: 'text-zinc-900',
    closeButton: 'hover:bg-zinc-200',
    footer: 'border-zinc-300',
    label: 'text-zinc-900',
    emptyState: 'text-zinc-500',
    footerButton: 'bg-zinc-200 text-zinc-900 border-zinc-300 hover:bg-zinc-300',
  },
  modal: {
    overlay: 'bg-black/30',
    content: `bg-zinc-50 border-zinc-300 ${LIGHT_TEXT_OVERRIDES}`,
    title: 'text-zinc-900',
  },
  connectionMiniMap: {
    // Always rendered inside portaled modals, so the bg must live in the
    // slot — root var overrides can't reach it.
    container: 'bg-zinc-100 border-zinc-300',
  },
  dragList: {
    row: 'bg-zinc-200 text-zinc-900 hover:bg-zinc-300',
    preview:
      'bg-zinc-200 border-zinc-300 text-zinc-900 [&_.text-primary-white]:text-zinc-900',
  },
  select: {
    trigger: 'bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-100',
    content: `bg-white border-zinc-300 text-zinc-900 ${LIGHT_TEXT_OVERRIDES}`,
    item: 'hover:bg-zinc-200',
  },
  tooltip: {
    // Arrow fill/stroke are var-driven SVG attributes on a PORTALED surface;
    // re-anchor the vars on the slot so the arrow follows the panel.
    content: `bg-white border-zinc-400/60 text-zinc-900 [--color-tooltip-bg:#ffffff] [--color-secondary-dark-gray:#d4d4d8] ${LIGHT_TEXT_OVERRIDES}`,
  },
  colorPicker: {
    popover: 'bg-zinc-50 border-zinc-300',
  },
};

export { lightGraphTheme };
