# Theming the Graph

The graph ships with an optional, fully className-driven theme system. A theme
is a typed map of per-component/per-slot Tailwind className overrides plus a
`reactFlow` section for ReactFlow's own theming props. Without a provider the
graph keeps its default Blender-style dark look — providing a theme is purely
additive and non-breaking.

## Quick start

```tsx
import {
  FullGraph,
  GraphThemeProvider,
} from '@theclearsky/react-blender-nodes';

<GraphThemeProvider preset='light' theme={{ node: { header: 'rounded-none' } }}>
  <FullGraph state={state} dispatch={dispatch} />
</GraphThemeProvider>;
```

- `preset` picks a built-in look: `'blenderDark'` (the default — identical to no
  provider) or `'light'`.
- `theme` is a partial `GraphTheme` deep-merged over the preset; overrides win
  per slot, nested objects merge recursively, arrays/strings replace.
- Inline `theme={{ ... }}` literals are safe: the provider memoizes resolution
  structurally (content-keyed), so the published context identity is stable
  across host re-renders and themed nodes/edges do not re-render on dispatches.
- Nesting: providers do NOT inherit from outer providers — the innermost one
  wins wholesale.

Key symbols:

- `src/components/organisms/FullGraph/GraphThemeProvider.tsx` ›
  `GraphThemeProvider` — the single optional provider. Mounted by the consumer
  AROUND `FullGraph` (FullGraph does not render it itself).
- `src/utils/theme/GraphThemeContext.ts` › `useGraphTheme` — non-throwing
  context read; `undefined` without a provider. The raw `GraphThemeContext`
  object is exported as an ADVANCED surface: providing it directly bypasses
  `resolveGraphTheme`, so its `value` must already be a resolved theme — prefer
  `GraphThemeProvider`.
- `src/utils/theme/graphThemeTypes.ts` › `GraphTheme` — the slot map type. The
  `reactFlow` option types are library-owned literal unions
  (`variant: 'lines' | 'dots' | 'cross'`,
  `colorMode: 'light' | 'dark' | 'system'`) — no xyflow import needed to author
  a theme.
- `src/utils/theme/resolveGraphTheme.ts` › `resolveGraphTheme` — pure
  `preset + overrides → resolved theme` (what the provider memoizes). Unknown
  preset names warn and fall back to the default.
- `src/utils/theme/mergeGraphThemes.ts` › `mergeGraphThemes` — the deep-merge:
  plain objects merge recursively; strings, numbers, and arrays (e.g. Background
  `gap: [x, y]`) REPLACE; `undefined` keeps the base; `null` replaces it.
  Neither input is mutated, but the RESULT aliases untouched sections of the
  base — treat resolved themes as immutable (the built-in presets are
  deep-frozen, so mutating them throws).
- `src/utils/theme/presets/index.ts` › `graphThemePresets` — the named presets
  (`graphThemePresetNames` is the as-const name list,
  `defaultGraphThemePresetName` the default).
- `src/utils/theme/presets/blenderDarkGraphTheme.ts` › `blenderDarkGraphTheme` —
  intentionally empty: the components' default classes ARE this preset.
- `src/utils/theme/presets/lightGraphTheme.ts` › `lightGraphTheme` — the
  full-coverage light preset and the reference for writing your own.

## How a slot is consumed

Every themed component reads the context and appends its slot LAST:

```tsx
const theme = useGraphTheme();
<div className={cn('<defaults>', theme?.node?.body, className)} />;
```

Order is always: defaults → theme slot → per-instance `className` prop. `cn()`
(clsx + tailwind-merge) resolves conflicts so the later class wins per CSS
property while non-conflicting defaults survive. This conflict resolution over
the project's custom token utilities is pinned by
`src/__tests__/utils/theme/cnTokenMerge.test.ts` ›
`theme/cn token-conflict resolution`.

## The three theming mechanisms

1. **Slot classes** — the bread and butter. See the slot map below.
2. **CSS-variable overrides on `root`** — the themeable component tokens
   (declared in the plain `@theme static` block of `src/index.css`) generate
   utilities that reference `var()`, so an arbitrary-property class like
   `[--color-graph-menu-bg:#f5f5f5]` in the `root` slot recolors every IN-TREE
   consumer of that token (scrollbars, glows, timeline accents, edge value
   pills, resize handle, slider tracks). The library namespaces its generic
   surface tokens as `--color-graph-*` so they can't collide with your app's own
   Tailwind theme tokens.
3. **Descendant-targeted variants** — classes like
   `[&_.text-primary-white]:text-zinc-900` on a container slot out-specify the
   token utility on every nested text node (the light preset adds
   `[&_[class*="text-primary-white/"]]:text-zinc-600` for the opacity-suffixed
   variants). The light preset uses this to recolor the runner panel, inspector,
   drawers, and modals wholesale.

**Portal caveat:** context menus, modals, tooltips, drag previews, the
color-picker popover, and selects rendered WITHOUT `renderInline` portal OUTSIDE
the FullGraph DOM subtree. React context still reaches them (so their slots
work), but `root` var overrides do NOT — style portaled surfaces through their
dedicated slots. The node-input and breadcrumb selects use `renderInline`, so
root var overrides DO reach them. A slot can also re-anchor a var for its own
descendants — the light preset sets `[--color-tooltip-bg:#ffffff]` inside
`tooltip.content` so the var-driven SVG arrow follows the themed panel.

**Conditional-state caveat:** a slot class is appended in every state of its
element. For elements whose defaults differ per state (e.g. timeline `navButton`
enabled/disabled), a theme override applies to all states — themes trade that
state distinction for simplicity. The one deliberate exception is the portaled
`⋯` menu: `runnerPanel.overflowMenuItem` (inactive-hover) and
`overflowMenuItemActive` (selected) are split into two slots because a single
class can't express both, and the surface slot can't reach an inlined `hover:`.

## Slot map

| Section              | Slots                                                                                                                                                                                                                            | Consumed in                                                                                                                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root`               | (string)                                                                                                                                                                                                                         | FullGraph root wrapper — surface bg + var-override host                                                                                                                                                                                                                                                               |
| `reactFlow`          | `colorMode`, `background`, `miniMap`, `controls`, `connectionLine`                                                                                                                                                               | `<ReactFlow>` + `<Background>`/`<MiniMap>`/`<Controls>` in FullGraph; ConnectionMiniMap follows `colorMode`. The `background.className`/`miniMap.className` strings land on xyflow's OWN elements — their class contract belongs to xyflow, and interaction-affecting utilities are the theme author's responsibility |
| `node`               | `container`, `header`, `headerTitle`, `headerActionIcon`, `body`, `outputsSection`, `outputRow`, `inputsSection`, `inputRow`, `panelHeader`, `panelContent`, `inputField`, `handleShape`, `inputOrderBadge`, `inputOrderPopover` | ConfigurableNode + handles + inputs; `inputField` also reaches drawer fields and runner sliders; `inputOrderBadge` is the fan-in connection-reorder trigger, `inputOrderPopover` its portaled reorder popover surface (root vars can't reach the portal)                                                              |
| `edge`               | `valuePillBox`, `valuePillText`                                                                                                                                                                                                  | ConfigurableEdge runner value pills                                                                                                                                                                                                                                                                                   |
| `statusIndicator`    | `tooltip`                                                                                                                                                                                                                        | NodeStatusIndicator error/warning tooltip                                                                                                                                                                                                                                                                             |
| `contextMenu`        | `list`, `item`, `itemLabel`, `shortcut`, `separator`, `submenuPanel`                                                                                                                                                             | ContextMenu via its `classNames` prop (wired by FullGraphContextMenu)                                                                                                                                                                                                                                                 |
| `breadcrumbs`        | `container`, `backButton`, `selectTrigger`, `selectContent`, `list`, `item`, `editButton`                                                                                                                                        | FullGraphNodeGroupSelector                                                                                                                                                                                                                                                                                            |
| `errorBoundary`      | `container`, `retryButton`                                                                                                                                                                                                       | FullGraph error fallbacks                                                                                                                                                                                                                                                                                             |
| `runnerToggleButton` | (string)                                                                                                                                                                                                                         | RunnerOverlay reopen button                                                                                                                                                                                                                                                                                           |
| `runnerPanel`        | `container`, `resizeHandle`, `closeButton` (panel X + ⋯ triggers), `overflowMenu` (portaled ⋯ menu), `overflowMenuItem` (per-item hover), `overflowMenuItemActive` (selected item)                                               | NodeRunnerPanel; ⋯ menus read it in RunControlsOverflowMenu / TimelineToolbarOverflowMenu                                                                                                                                                                                                                             |
| `runControls`        | `container`, `statusDot`, `statusLabel`, `divider`, `actionButton`, `playButton`                                                                                                                                                 | RunControls                                                                                                                                                                                                                                                                                                           |
| `timeline`           | `container`, `toolbar`, `toolbarButton`, `navButton`, `ruler`, `block`, `loopHeader`, `switchHeader`, `detailBox`, `trackArea`                                                                                                   | ExecutionTimeline + subcomponents (`detailBox` = expanded loop-iteration / switch-branch wrapper)                                                                                                                                                                                                                     |
| `inspector`          | `container`, `header`, `sectionHeader`, `statusBadge`, `timelineBox`, `valueBox`, `contextBox`, `errorBox`                                                                                                                       | ExecutionStepInspector                                                                                                                                                                                                                                                                                                |
| `drawer`             | `container`, `header`, `title`, `closeButton`, `content`, `footer`, `label`, `emptyState`, `footerButton`                                                                                                                        | RegionChannelEditDrawer (loop/switch) + NodeTypeEditDrawer                                                                                                                                                                                                                                                            |
| `modal`              | `overlay`, `content`, `header`, `title`, `body`, `footer`                                                                                                                                                                        | HandleSummaryModal / DeletionReviewModal / ExpandableConnectionMiniMap via Modal part className props (`overlay` via `ModalContent`'s `overlayClassName`)                                                                                                                                                             |
| `connectionMiniMap`  | `container`                                                                                                                                                                                                                      | ConnectionMiniMap — always rendered inside portaled modals, so background changes belong in this slot (root vars can't reach it)                                                                                                                                                                                      |
| `dragList`           | `row`, `ghost`, `preview`                                                                                                                                                                                                        | DragList rows, inline ghost, floating drag preview                                                                                                                                                                                                                                                                    |
| `select`             | `trigger`, `content`, `item`                                                                                                                                                                                                     | Select usages inside the graph tree (node inputs — both in-canvas and drawer-preview branches — and breadcrumbs)                                                                                                                                                                                                      |
| `tooltip`            | `content`                                                                                                                                                                                                                        | Tooltip floating panel (see context-fallback note)                                                                                                                                                                                                                                                                    |
| `colorPicker`        | `popover`                                                                                                                                                                                                                        | PopoverColorPicker floating panel (portaled; context-fallback consumer)                                                                                                                                                                                                                                               |

Data-driven colors are deliberately NOT themed: node `headerColor`, handle
colors/shapes, edge gradients (from handle colors), and zone colors come from
consumer data.

## Who reads the context

Graph-bound components call `useGraphTheme()` directly. Generic reusable atoms
(Button, Input, Modal, Accordion, Checkbox, ScrollableButtonContainer) stay
theme-agnostic and receive theme classes through their existing `className`
props from graph parents. Three reusable components are **context-fallback**
consumers — they read the optional context themselves because they render their
parts internally (or in portals) across many call sites: `Tooltip`
(`tooltip.content`), `DragList` (`dragList.*`), and `PopoverColorPicker`
(`colorPicker.popover`). `ContextMenu` stays context-agnostic — it receives the
`contextMenu` section through its `classNames` prop (type
`ContextMenuClassNames` in
`src/components/molecules/ContextMenu/ContextMenu.tsx` › `ContextMenu`), wired
by FullGraphContextMenu; the two shapes are pinned together by
`src/__tests__/utils/theme/contextMenuSlotParity.test.ts` ›
`theme/contextMenu slot parity`. Without a provider all of them keep their
defaults.

Scoping note: because the fallback consumers read React context, mounting the
provider at the app root also themes standalone `Tooltip`/`DragList` usages
anywhere under it — mount the provider directly around the graph to scope
theming to the graph.

## How theme classes become CSS

Theme slot values are class NAMES — a class renders only if some stylesheet
defines it:

- The **built-in presets work out of the box**: their classes are compiled into
  the shipped `style.css` at library build time.
- **Custom theme classes need your own Tailwind (v4) build**, with the files
  containing the theme strings inside its source scope — otherwise the class
  matches no rule and silently does nothing.
- The **`root` var-override mechanism is the no-Tailwind escape hatch**: the
  arbitrary-property classes used by the built-in presets
  (`[--color-graph-menu-bg:...]` style) are compiled in, and you can also set
  those CSS variables from your own stylesheet.
- The library stylesheet scopes its Tailwind source scanning to `src/` (the
  `source('../src')` argument in `src/index.css`), so non-source artifacts
  (review notes, e2e spec titles) never leak classes into the shipped CSS. Story
  files are NOT excluded — `@source not` is global to every consumer of the
  stylesheet, so excluding them would also strip the demo gallery's one-off
  classes from the Storybook build and leave the ThemedPlayground unstyled.

## Live demo

`src/components/organisms/FullGraph/FullGraph.stories.tsx` › `ThemedPlayground`
switches presets at runtime and applies a consumer override on top.
