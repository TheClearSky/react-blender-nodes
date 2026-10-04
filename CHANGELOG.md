# Changelog

## 0.0.15 — 2026-10-05

### Added: a node group's Add-menu path is editable, and groups are marked in the menu

- The node-group editor has a **Menu Path** field — new exported molecule
  `PathChipsInput`: one chip per folder (type + Enter, `/` or `›`; paste `A/B`
  for two; Backspace removes the last; double-click renames; drag reorders; ×
  removes). Typed names allow letters, digits and single spaces; "Existing here"
  suggests the live menu's folders at that depth, which are kept exactly as
  named (e.g. `Filter & EQ`). A preview shows `Add Node ▸ … ▸ <group name>`; an
  empty path = top level.
- `UPDATE_NODE_TYPE` takes `updates.locationInContextMenu` (names trimmed,
  blanks dropped; `[]` removes the key). `menuFolderSuggestions` is exported
  from the context-menu module.
- The Add Node menu marks node GROUPS with lucide's `SquaresExclude` (two
  overlapping squares); plain rows in the same folder get an aligned blank.
  `FullGraph` `addMenuGroupIcon` swaps the icon, or `false` turns the mark off.

### Added: in-app docs — optional descriptions behind an ⓘ

- **Node types** (`TypeOfNode.description`): hovering a node shows an ⓘ beside
  its title. Read live from the type, so editing it updates every instance. Node
  groups get a Description field in the node-type edit drawer
  (`UPDATE_NODE_TYPE` `updates.description`; `''` clears).
- **Node instances** (`node.data.description`, new action
  `UPDATE_NODE_DESCRIPTION { nodeIds, description }`, blank clears). An
  instance's own description wins over its type's. Loops use this: the Edit Loop
  drawer has a Description field that writes all three loop nodes.
- **User zones** (`Zone.description`, via `UPDATE_USER_ZONE { description }`;
  `''` clears): the ⓘ always shows beside the zone name, and the hovered label
  has a describe button (a popover, committed once on close). Import drops a
  non-string or blank zone description.
- **Sockets** (`TypeOfInput.description`): hovering a socket row shows an ⓘ
  beside its name. Editable per socket in the node-type edit drawer.
- `TypeOfInput` also takes `min` / `max` / `step`, used by a number socket's
  inline slider.
- Registered input components (`InputComponentProps`) also receive the socket's
  `min` / `max` / `step` when the node type declares them.
- New atom `InfoHint` — takes the colour of the text beside it, no hover style;
  the node/socket ⓘ are `display:none` until their parent is hovered (or focused
  within), so a hidden ⓘ takes no space. `Popover` (internal) takes
  `onOpenChange`; `RegionChannelEditDrawer` takes `initialDescription` and
  passes the description as `onSave`'s third argument.

### Fixed: `defaultValue` was dropped on complex data types

- `constructNodeOfType` copied `TypeOfInput.defaultValue` only for number,
  string and boolean data types, so a knob on a complex type (for example a
  numeric "signal" type) always started unset. It is now copied when the data
  type's `complexSchema` accepts it.

### Changed: a number slider with a whole-number `step` shows whole numbers

- A socket declaring `step: 1` (e.g. a 0–100 % knob) reads `40`, not `40.0000`.

### Fixed: a node group's typed input values never reached inside the group

- An outer group input with nothing wired to it passed nothing to the group's
  inside, so the value typed on the group node was ignored. The runner now
  passes the typed value through to the matching group-input handle (a wired
  input still wins).

### Fixed: saving in the node-type edit drawer dropped socket fields it did not list

- `defaultValue` (and now `description`, `min`, `max`, `step`) survive the
  editor round-trip.

### Changed: socket shapes and colours follow their data type live

- A handle's shape AND colour (and its edges' colour) are read from its data
  type at render (the copies saved on a node instance were used before), so
  changing a data type's `shape` or `color` updates saved graphs too. Helpers
  `liveHandleShape` / `liveHandleColor` in
  `utils/nodeStateManagement/handles/liveHandleVisual.ts`.

### Fixed: a new node group was numbered after the consumer's own groups

- `ADD_NODE_GROUP` counted every group type, so an app shipping 40 built-in
  groups named the first user group "Node Group 41". It now takes the first free
  "Node Group N".

### Added: `SliderNumberInput` `increment`

- The exact change for one chevron click. Without it the chevrons still move 10%
  of `step`.

### Added: `FullGraphContextMenu` is exported

- The graph's own right-click menu (floating-ui placement at a viewport point,
  outside-click/Escape dismissal, fade) can now be used outside the graph —
  `<FullGraphContextMenu isOpen position={{ x, y }} onClose items />` with the
  same `ContextMenuItem[]` the graph uses.

### Changed: `SliderNumberInput size='small'` text is 12px (was 10px, 11px while typing)

- The compact field sits in toolbars and menus beside 12–13px labels and
  buttons, and at 10px it read as a different, smaller control. Both branches
  (the slider face and the typed field) are now 12px; the height is unchanged.

### Fixed: edges vanished after a state replace that kept node ids but changed handle ids

- React Flow caches handle positions by node id and only re-measures on resize.
  Swapping in a graph whose nodes had the SAME ids but different handle ids (two
  independent builds of one demo — node ids fixed, handle ids random) left every
  edge unrenderable: all nodes shown, zero edges, and a console full of React
  Flow error #008. `FullGraph` now diffs each rendered node's handle ids and
  calls `updateNodeInternals` for exactly the nodes whose handles changed —
  which also covers undo/redo across a handle edit. React Flow still logs #008
  once for the frame before the re-measure; the edges draw on the next frame.

### Added: `REPLACE_STATE` can keep undo/redo — `payload.preserveHistory`

- `dispatch({ type: REPLACE_STATE, payload: { state, preserveHistory: true } })`
  keeps `state.history` instead of dropping it. It is for RESTORING a state this
  same editor produced earlier (a tabbed consumer switching back to a tab whose
  in-memory state it kept), where the history's patches describe that state
  exactly. The default stays `false`: an import never inherits a history that
  does not describe it.

### Changed — **BREAKING (CSS)**: every utility is namespaced `rbn:`, and preflight is no longer shipped

- **All classes this library renders now carry an `rbn:` prefix** — `rbn:flex`,
  `rbn:bg-primary-gray`, `rbn:hover:text-primary-white`.

  The problem this fixes is not cosmetic. A library and its consumer both ship a
  Tailwind stylesheet declaring the same class names, and which one wins is
  decided by the ORDER the sheets happen to load — not by specificity, and not
  by anything the consumer can control. Measured in a real consumer before the
  change: the app's own `.border` (emitted late in the app's sheet) beat this
  library's `.border-b-0`, putting a bottom border back on the runner drawer;
  and a `@min-[832px]/runnerpanel:hidden` / `@max-…` pair could both apply at
  once. Both are verified fixed.

  **What breaks:** anything that named one of our class names from outside — a
  consumer stylesheet targeting `.text-primary-white`, an e2e selector, a
  `GraphTheme` slot using a descendant variant. Descendant variants must now
  name the prefixed class WITH the colon escaped:
  `rbn:[&_.rbn\:text-primary-white]:text-zinc-900` (and in a TS string the
  backslash is doubled). Getting that wrong compiles cleanly and silently
  matches nothing.

  **What does NOT break: the theme VARIABLE names.** Every publicly nameable
  token was moved out of `@theme` into a plain `@layer theme` block first,
  precisely so `prefix()` could not rename it — a `@theme` variable becomes
  `--rbn-color-…` and would have broken `root`-slot overrides, `var()` in inline
  styles and SVG attributes, and consumer stylesheets, all silently.
  `--color-graph-menu-bg` is still `--color-graph-menu-bg`.

  `cn()` reconciles the namespaces, so a consumer's unprefixed `bg-red-500`
  still beats our `rbn:bg-primary-gray` — the prefixes are stripped before
  `tailwind-merge` sees them and restored afterwards.

  The timeline plugin uses `rbnt:` on purpose: a shared prefix would put
  `.rbn\:flex` in both sheets again and recreate the same bug. The two are
  provably disjoint, since `[class*='rbn:']` does not match `rbnt:flex`.

- **Preflight is no longer part of the shipped stylesheet.** The bundled
  `@import 'tailwindcss'` is split into `theme.css` + `utilities.css`, because
  `prefix()` cannot namespace preflight — its selectors are element names, not
  classes. Until now this stylesheet shipped `*,::before,::after{margin:0;…}`
  and `html{line-height:1.5;…}` into every page that loaded it, flattening the
  consumer's own headings, lists and links.

  The resets the library actually depends on are re-declared in an `@layer base`
  block scoped to `[class*='rbn:']`, which after the prefix migration matches
  every element the library styles by construction. Verified with both library
  sheets loaded: a plain `<h1>` is still 32 px bold, a `<ul>` keeps its disc and
  40 px indent, an `<a>` is still underlined UA blue.

  Deliberately NOT carried over, because the library does not render the
  element: `a`, `table`, `b/strong`, `code/kbd/pre`, `small`, `sub/sup`, `abbr`,
  `hr`, `progress`, `summary`, the `::-webkit-datetime-edit-*` family and
  `::file-selector-button`.

  Preflight is not only a courtesy reset, though — parts of it were load-bearing
  for this library's OWN markup, and dropping it took those away too. Three
  rules had to be re-declared scoped after measurement: `font-family` (without
  it every panel and button computed to `"Times New Roman"`), `line-height: 1.5`
  (56 elements per story — every `text-[…px]` span and every button — collapsed
  to `normal`), and the heading reset (`atoms/Accordion/Accordion.tsx` renders
  Radix's `Accordion.Header`, which emits an `<h3>`, so every accordion section
  header came back UA-bold at 1.17em). In the form-element block,
  `line-height: 1.5` must follow `font: inherit`, because `font` is a shorthand
  that resets line-height to `inherit` — which resolved to the root's 1.5 under
  real preflight and to `normal` without it.

  One site escaped the codemod: `ExecutionTimeline`'s overflow-menu trigger kept
  a bare `@min-[832px]/runnerpanel:hidden`. Under `prefix(rbn)` an unprefixed
  utility emits NO rule, so the timeline's ⋯ menu stayed visible at wide widths
  while its `RunControls` twin (correctly prefixed) hid — caught by e2e `G8`,
  invisible to type-checking and lint. An AST scan of every class-list position
  in both packages, with the Tailwind compiler as the oracle, confirms it was
  the only one; the four remaining unprefixed tokens (`btn-press`,
  `timeline-block`, `node-runner-scrollbar`, `timeline-scrollbar`) are vanilla
  CSS rules this library authors, not utilities.

  Completion was mechanically verified, not eyeballed, in two ways. The compiled
  rule set with the prefix (prefix stripped) is IDENTICAL to the rule set
  without it — 1085 selectors on both sides. And `npm run audit:preflight`
  (`scripts/audit-preflight-dependency.ts`) renders one story per component,
  injects the real `preflight.css`, and diffs computed styles, failing on any
  difference that lands on library markup: **27 components, 0 regressions.** Run
  it after touching the scoped `@layer base` block — it found all three of the
  misses above, none of which was visible in a consuming app, since an app ships
  its own preflight and masks them.

### Fixed — a finished run could overwrite a newer one, and `reset()` did not stay reset

- Nothing in `useNodeRunner` carried run identity past an `await`. Two
  consequences, both reachable without any exotic timing:
  - `finalizeRun` read the run id at call time, so a **superseded** run's
    completion was announced as the **live** run's `run:completed` — before that
    run had executed a step — and the live run's own completion was then
    swallowed. A consumer stamping "this graph has been run" on that event
    marked a graph fresh that had never run.
  - `stop()` and `reset()` only aborted a signal. The in-flight run kept going
    and its `finalizeRun` re-wrote the execution record, the node visual states
    and the runner state **after** the reset had cleared them — so a consumer
    that cancelled a run before swapping the graph got the old run's record
    back, painted over the new graph.

  Every writer that resumes after an `await` now carries the id of the run it
  belongs to and writes nothing once that run is no longer current — including
  inside the step-by-step drain loops, where the generator and the continue-flag
  are shared by the whole hook rather than by one run.

  One behaviour is deliberately preserved: a run ended by an explicit `stop()`
  still installs its final record when it drains, because `'errored'` exists so
  the user can see how far the run got. It changes neither the runner state nor
  the event stream. A `reset()` still discards it.

### Added — `run:aborted` gains `'failed'`, and both halt events gain `initiator`

- `RunAbortReason` is now `'stopped' | 'superseded' | 'failed'`. Previously a
  run that could not produce a record — the graph did not compile, or the run
  target threw — emitted **nothing at all**, so a consumer waiting for a
  terminal event waited forever. `'failed'` is distinct from `'stopped'` on
  purpose: a consumer that treats a halt as "stay halted" must not do that
  because someone mis-wired a node.
- `stop()` and `reset()` (and `GraphRunnerHandle.stop` / `.reset`) take an
  optional `{ initiator: 'user' | 'consumer' }`, surfaced on `run:aborted` and
  `run:reset`. An application that switches its own auto-run off when the user
  halts a run needs to not do that when IT halts the run — to replace the
  project, say. Both arrive on the same channel with the same reason, so the
  host has to say which. Defaults to `'user'`; every existing call site is
  unaffected.

### Added — `onRunEvent`: a run lifecycle channel distinct from the record setter

- `FullGraph` gains an `onRunEvent` prop (and `useNodeRunner` an
  `options.onRunEvent`) emitting `RunEvent`: `run:started` / `run:completed` /
  `run:aborted` / `run:reset`, the first three carrying a monotonic `runId`.

  `onExecutionRecordChange` is the controlled record SETTER. It fires with
  `null` when a run starts, when `reset()` clears the record, and when the
  consumer loads a different project — three unrelated events arriving as one
  indistinguishable callback. Anything that needs to know "which graph produced
  the record I am holding", or "did the user just press Reset", was guessing.

  `run:started` is emitted **synchronously before the run's first `await`**, so
  a consumer can snapshot its own fingerprint of the graph at exactly the
  instant the run consumes it and stamp it on the matching `run:completed`. That
  is deliberate: it means the library computes no hash of its own, and consumers
  that never subscribe pay nothing at all. Every started run terminates with
  exactly one `run:completed` or `run:aborted` for its `runId`; starting a run
  while one is still open first aborts the old id with `reason: 'superseded'`,
  so a consumer's pending map cannot leak.

### Fixed — `Input` wrote a value into every untouched field on any click

- `Input` committed its value from a `document`-level `mousedown` listener
  (`useClickedOutside`) **regardless of whether that input was ever focused**.
  Since every instance attaches its own listener, one click anywhere on the page
  made every mounted `Input` commit at once. For an EMPTY number field the
  committed value was `convertStringToNumber('') === 0`, so a click also turned
  "unset" into a real `0`.

  In a graph editor that is one `UPDATE_INPUT_VALUE` per unset numeric input per
  click. Measured in a consumer before the fix: a single click on an unrelated
  toolbar button wrote `null -> 0` into a node input, and 31 of 76 inputs were
  unset and therefore armed to do the same. Consumers that render an empty box
  as "auto" (use the implementation default) silently lost that state, and
  anything watching the graph for changes — autosave, a dirty flag, an auto-run
  trigger — fired on every click.

  Two guards, both narrow:
  - the outside-click commit now runs only while the input is actually focused
    (it is still needed there: a canvas that calls `preventDefault()` on
    mousedown suppresses the browser's focus change, so `onBlur` never fires and
    this is the only commit path);
  - an empty number field cancels instead of committing, which is what
    `handleSettingValueFromTemporaryValue`'s contract already said it did.

  Typing a value and clicking away still commits exactly as before.

### Changed — themeable tokens are declared in plain CSS, not in `@theme`

- The 40 themeable component tokens (`--color-graph-*`, `--color-timeline-*`,
  `--color-runner-*`, `--color-inspector-*`, `--color-edge-value-pill-*`,
  `--color-drag-list-*`, …) are now declared in a plain
  `@layer theme { :root, :host { … } }` block, with `@theme inline` holding an
  indirection (`--color-x: var(--color-x)`) that generates the utilities. Values
  are byte-identical and the public names are unchanged, so every documented
  theming mechanism behaves exactly as before — verified in a browser:
  `[--color-graph-menu-bg:#f5f5f5]` on an ancestor still retints a descendant's
  `bg-graph-menu-bg`.

  The reason is forward-looking: a Tailwind `prefix()` renames every `@theme`
  variable, which would have silently broken all three public mechanisms at once
  — `root`-slot variable overrides, `var(--color-…)` in JSX inline styles and
  SVG attributes, and a consumer setting the variable from their own stylesheet.
  Declaring them outside `@theme` makes the public names immune.

- **One behaviour change: opacity-modified utilities on these tokens lose their
  standalone alpha.** Because Tailwind no longer sees a literal value for an
  indirected token, it cannot precompute an 8-digit hex, so nine utilities move
  from e.g. `background-color:#54545466` to `background-color:var(--color-…)`
  plus a `color-mix(in oklab, … 40%, transparent)` declaration inside an
  `@supports` guard. Browsers with `color-mix` (Chrome 111 / Safari 16.2 /
  Firefox 113, all 2023) render them exactly as before; older ones render the
  colour fully opaque.

  The nine, across 13 call sites in 7 files: `bg-primary-gray/40` and `/80`,
  `bg-timeline-loop-accent/60` and `/80`, `border-timeline-loop-accent/30`,
  `bg-timeline-switch-accent/60` and `/80`, `border-timeline-switch-accent/30`,
  `bg-inspector-skipped/30`. Most are in the runner — the timeline's loop and
  switch blocks and the step inspector — plus the connection minimap and three
  edit drawers.

### Changed — Tailwind 4.1.13 → 4.3.3

- `tailwindcss` and `@tailwindcss/vite` both move to `^4.3.3` (they must move
  together: the Vite plugin pins the compiler exactly, so bumping only
  `tailwindcss` leaves a nested 4.1.13 doing the actual compiling). This aligns
  the host with the timeline plugin and the sound app, which were already there.

  Two of the changes are user-visible in the shipped `style.css`, because they
  are in Tailwind's preflight, which this stylesheet carries:
  - the global `font-family` fallback changes from
    `ui-sans-serif, system-ui, sans-serif, …` to
    `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`;
  - `:-moz-focusring` narrows to `:-moz-focusring:where(:not(iframe))`.

  Everything else is identical: the rule-header sequence is unchanged at 1635
  entries with that single `:-moz-focusring` difference.

### Added

- `FIRST_PARTY_PREFIXES` is exported from the package root: the Tailwind
  prefixes `cn` reconciles before merging, **longest-first**
  (`['rbnt', 'rbn']`). The ORDER is part of the contract — `rbnt` must be tried
  before `rbn` or a `rbnt:` class would be stripped to `t:`. Exported so a
  class-rewriting codemod and the stylesheet gate share one definition rather
  than re-declaring it.

- `SliderNumberInput` `ariaLabel?: string`: the full, spoken name for the
  control, applied to BOTH of its branches — as the name of a `role='group'`
  wrapper while it is a slider, and as the `aria-label` of the text field once
  it is clicked into. `name` stays the SHORT on-screen label (`dur`, `min`, `t`)
  that keeps the control narrow. Without this the text field — the one state
  where a screen-reader user is actually committing a value — named itself by
  its 3-character placeholder.

  Prefer it over wrapping the control in a `<label>`. A `<label>` binds to its
  first labelable descendant, which here is the DECREMENT CHEVRON, and Chromium
  then propagates `:hover` to that chevron from anywhere inside the label — so
  the left chevron lit up while the pointer was over the middle. Measured, and
  proved by reparenting: identical markup outside a `<label>` behaves correctly.

- `FullGraph` `bottomDrawers` prop (`GraphBottomDrawer[]`, type exported):
  consumer bottom drawers rendered with the runner panel's chrome (slide-up
  drawer, resize handle, header with a close `X`), each with a floating open
  button beside the runner's. At most ONE bottom drawer — the runner included —
  is open at a time; an open drawer's header carries a switcher button for each
  of the others. Works with or without `functionImplementations`. Ids are unique
  and `'runner'` is reserved (`RUNNER_DRAWER_ID` is exported). Per drawer:
  `keepMounted` (default `true` — content keeps its state while closed) and
  `defaultHeight` (initial body height, 80–600 px).
- `FullGraph` `onOpenDrawerChange?: (openDrawerId: string | null) => void`:
  fires whenever the open bottom drawer changes (`'runner'`, a consumer id, or
  `null` for all closed); not on mount.

- `FullGraph` `runnerRef?: RefObject<GraphRunnerHandle | null>` (type exported):
  an imperative handle on the runner — `run()` (resumes when paused, exactly
  what the panel's Run button does), `stop()`, `reset()`, `getRunnerState()`.
  Before this, nothing outside `FullGraph` could start a run: the Run button was
  the only entry point, and neither `execute` nor `useNodeRunner` is published.
  Populated only while a runner exists (`functionImplementations` given); `null`
  otherwise.
- `Input` now forwards a documented set of native `<input>` attributes to the
  element — `id`, `name`, `title`, `style`, `disabled`, `readOnly`, `autoFocus`,
  `tabIndex`, `autoComplete`, `spellCheck`, `inputMode`, the four `aria-*`
  naming/validity attributes and `data-testid` (type `ForwardedInputProps`).
  Consumers can now label and size the field; before, an `aria-label` was a type
  error. `value`/`onChange`/`size`/`type` and the focus/key handlers stay owned
  by the component.

### Changed

- The floating "Runner" reopen button is now rendered by the bottom-drawer
  chrome at the `FullGraph` root (`div[data-slot="bottom-drawer-buttons"]` → one
  button per drawer, `data-testid="bottom-drawer-open-runner"`), not by
  `RunnerOverlay`. Same text, icon, tooltip and `runnerToggleButton` theme slot;
  the icon is now wrapped in a sizing `<span>`.
- `runnerPanel.*` and `runnerToggleButton` theme slots style every bottom drawer
  and floating button, not only the runner's.
- Internal: `RecordingViewStateProvider` must be rendered inside a
  `BottomDrawerProvider` (its `isRunnerPanelOpen` is derived from the shared
  open-drawer id). Only `FullGraph` and the isolated stories render it.

## 0.0.14 — 2026-09-06

No code changes since 0.0.13.

### Changed

- Line endings are normalized to LF in the repository and in every working copy
  (`.gitattributes`: `* text=auto eol=lf`, binaries marked as such), so git,
  prettier and CI agree on the same bytes.
- README: friendlier framing of the project family; the sound application is
  described as an app (it is not published to npm, but it is not private).

## 0.0.13 — 2026-09-05

> Versions 0.0.9 through 0.0.11 throw an import-time `ReferenceError` in both
> bundles and are deprecated on the registry; 0.0.12 was never published. This
> release is the first working build since 0.0.8.

### Changed — ESM-only package (BREAKING for `require()` on Node < 20.19 / 22.12)

- The UMD/CommonJS bundle (`react-blender-nodes.umd.cjs`) is gone. `main`,
  `module` and `exports["."]` all name the ES module; the `default` export
  condition serves both `import` and `require`, so Node ≥ 20.19 / 22.12
  `require()`s the package natively and every bundler resolves it as before.
  Older Node fails fast with `ERR_REQUIRE_ESM`. No working consumer of the old
  CJS path existed (0.0.9–0.0.11 threw on import in both formats, and 0.0.11's
  manifest named a CJS file the build never emitted).
- The `/contract` subpath is now a second entry of the one `vite build` (ES
  only, `exports["./contract"].default`) instead of a separate build; the
  modules the two entries share are emitted as chunks. `check-dist-loads`
  asserts on every build that the contract entry and its chunks import no React.

### Added — public compiler surface

- `compile(state, functionImplementations, options?)` and
  `serializeExecutionPlan(plan)` are exported from the package root, together
  with the `SerializedExecutionPlan` / `SerializedExecutionStep` /
  `SerializedLoopExecutionBlock` / `SerializedSwitchExecutionBlock` /
  `SerializedGroupExecutionScope` types and `DEFAULT_MAX_LOOP_ITERATIONS`.
  Downstream tooling can compile a graph and inspect the resulting
  `ExecutionPlan` through public API. Call `compile` with three arguments: its
  trailing `depth` parameter is `@internal` (the recursion counter the
  sub-compilers thread) and must not be passed.
- `makeFunctionImplementationsWithAutoInfer` is exported from the root (the
  README documented it, but it was only reachable from an internal path).
- `Zone` and `ZoneIndex` are exported, so the parameters of
  `setCurrentZonesToState` / `setCurrentUserZonesToState` are nameable.

### Changed — this library no longer depends on the codegen plugin

- The `file:` devDependency on `@theclearsky/react-blender-nodes-codegen`, the
  CodegenStudio stories and the host-contract tests moved out of this repo to
  the plugin, which owns its own Storybook. The dependency is strictly one-way
  (plugin → this library); no AGPL code is bundled into this package or its
  Storybook.

### Changed — `Select` re-implemented without Radix (BREAKING)

- `SelectScrollUpButton`, `SelectScrollDownButton`, `ContextAwareOpenButton` and
  `ReactFlowAwareOpenButton` (with their `Props` types) were removed, and
  Radix-only props (`asChild`, `onOpenChange`, `side`, …) are no longer accepted
  by the `Select` family.

### Fixed — packaging

- `husky` and `lint-staged` moved from `dependencies` to `devDependencies`;
  consumers no longer install them.
- The `/contract` bundle no longer carries a runtime `import "zod"` (zod was
  only ever used there as types).
- `CHANGELOG.md` ships in the package.

### Changed — ExecutionRecorder scope/loop methods (BREAKING for hand-built records)

- The recorder's ambient loop-nesting stack and scope stack are GONE, replaced
  by explicit identity: every structure begin/complete call takes an
  `ownerInstancePath` (the owning group instance path, `[]` at root), nested
  loops declare their parent via an explicit `StructureParentContext`, and group
  scopes are handled through single-use branded `RecorderScopeToken`s. This
  fixes cross-contaminated group `innerRecord`s and vanishing sibling
  `LoopRecord`s under concurrent execution.

- **BREAKING — structure-record map keys changed shape.** `loopRecords`,
  `switchRecords`, `groupRecords`, `iterations[].nestedLoopRecords` and the
  scoped `innerRecord` copies are now keyed by the structure's full path,
  serialized as a JSON array:

  ```
  root loop L                     →  ["L"]
  loop L inside instance g2       →  ["g2","L"]
  loop L inside g2 → subgroup s1  →  ["g2","s1","L"]     (any depth)
  group instance g2 itself        →  ["g2"]
  ```

  A structure id is a NODE id, and every instance of a node group shares its
  template's node ids — so a bare-id key made two instances of one group
  collide. One format now applies at every depth, in every map, top-level and
  scoped alike.

  Do not build these by hand and never parse one:

  ```ts
  import {
    structureRecordKey,
    resolveStructureRecord,
  } from '@theclearsky/react-blender-nodes';

  // before
  record.loopRecords.get(step.loopStructureId);
  // after (preferred — also finds salvage duplicates and pre-v3 exports)
  resolveStructureRecord(
    record.loopRecords,
    step.loopStructureId,
    step.instancePath,
  )?.record;
  ```

  Recordings exported before this change still import and still resolve, and
  import validation now reports their key format once per map as a warning.

- **`LoopRecord`, `SwitchRecord` and `GroupRecord` gain a required
  `ownerInstancePath: readonly string[]`**, so identity is readable structurally
  rather than by parsing a key, and survives export/import. For a group record
  it is the PARENT path (matching the group's own wrapper step); append
  `groupNodeId` for that instance's own path.

- **BREAKING — `ownerInstancePath` is now REQUIRED** on `beginLoopStructure` /
  `beginLoopIteration` / `completeLoopIteration` / `completeLoopStructure` /
  `beginSwitchStructure` / `completeSwitchStructure` / `completeGroup`. It was
  briefly optional-with-a-default; omitting it silently filed the record at root
  scope, which is exactly the mis-attribution this release exists to remove, so
  omission is now a compile error.

- **Migration for run-target authors who hand-build records** (the audience
  documented in `docs/runner/runTargetsDoc.md`):

  ```ts
  // before
  recorder.beginScope();
  const inner = recorder.endScope('completed', values);
  // after
  const token = recorder.beginScope(ownerInstancePath); // [] at root
  const inner = recorder.endScope(token, 'completed', values);
  ```

- New: `finalize()` now runs a full-sweep salvage backstop — API misuse
  (unclosed structures/scopes, a step begun but never completed) is promoted
  into the record (never overwriting healthy data; a colliding salvage is filed
  under its identity plus a numeric ordinal) and reported via the new
  `onRecorderWarning` callback (`new ExecutionRecorder({ onRecorderWarning })`,
  threaded through the executor's `execute(..., { onRecorderWarning })` option,
  `useNodeRunner`'s `options`, and a new `<FullGraph onRecorderWarning={…} />`
  prop); without a callback it dev-`console.warn`s. Warnings are bookkeeping
  diagnostics — they never enter `record.errors`, and a healthy run emits none.
- New exports from the package root: `structureRecordKey`,
  `resolveStructureRecord`, `recorderWarningKinds` (values) and
  `RecorderScopeToken`, `StructureParentContext`, `RecorderWarning`,
  `RecorderWarningKind`, `ExecutionRecorderOptions` (types).

### Fixed — the package now actually loads (import-time crash + broken CJS entry)

- **`require('@theclearsky/react-blender-nodes')` resolves again** on Node ≥
  20.19 / 22.12. 0.0.11's manifest declared `main` / `exports["."].require` as
  `dist/react-blender-nodes.umd.cjs`, but the build emitted
  `react-blender-nodes.umd.js` — every CJS consumer got `ERR_MODULE_NOT_FOUND`.
  Rather than rename the file, the CJS bundle was dropped altogether (see
  "ESM-only package" above): `exports["."].default` points every resolver,
  `import` and `require` alike, at the one ES module, and `check-dist-loads` now
  fails the build if a manifest target does not exist.
- **Both bundles no longer throw at import time.** `ConnectionMiniMap` imported
  the ROOT components barrel from inside `src/components`, creating a module
  cycle that surfaced as
  `ReferenceError: Cannot access '<symbol>' before initialization` when
  evaluating either dist bundle. The import is now a deep sibling import, and
  lint rules make the pattern unwritable across all of `src/**`: a
  `no-restricted-imports` path + regex pair (covering `@/components`,
  `@/components/index` and the root `@/index` barrel, type-only imports still
  allowed) plus two `no-restricted-syntax` selectors for the forms
  `no-restricted-imports` cannot see — dynamic `import('@/components')` and
  `export … from '@/components'`.
- **New build gate: `scripts/check-dist-loads.ts`.** Every build now verifies
  the manifest's file targets exist, that `main`/`module` cohere with `exports`,
  and EXECUTES all four entry bundles (root + `/contract`, CJS + ESM) in
  isolated child processes with export sentinels — so both failure classes above
  can never ship silently again.
- For script-tag/CDN consumers loading `dist/` files by path: there is no UMD
  file any more (see "ESM-only package" above) — load
  `dist/react-blender-nodes.es.js` as a module. No working consumer of the old
  path existed — both previous bundles threw at import time (IN-41).

### Changed — codegen extracted to a separate plugin (BREAKING)

- The codegen subsystem moved OUT of this library into a new standalone package,
  `@theclearsky/react-blender-nodes-codegen`. This library no longer exports the
  codegen public API — `emitJs`, `makeCodegenRunTarget`, `codegenJsRunTarget`,
  `codegenTsRunTarget`, `CodegenRunTargetOptions`, `EmitJsOptions`,
  `CodegenMetadata`, `NodeCodegenMetadata`, or `CodegenEmitContext`.
  (`emitGraph`, previously an internal entry point the studio deep-imported, is
  now a public export of the plugin.) Install the plugin and pass its
  `codegenJsRunTarget` / `codegenTsRunTarget` to `<FullGraph runTargets={…} />`
  — see `docs/runner/runTargetsDoc.md`.
- `typescript` and `prettier` are no longer runtime `dependencies` (moved to
  `devDependencies`); they were used only by codegen, so consumers no longer
  pull the ~8 MB compiler.
- Added a SECOND, React-free entry point,
  `@theclearsky/react-blender-nodes/contract`, re-exporting the runner IR /
  graph-state types plus the pure executor helpers (`getDataHandleIds`,
  `findConditionInputId`, `qualifiedId`, `flattenInputs`, `readInput`,
  `downloadTextArtifact`). The codegen plugin consumes this subpath (peer
  dependency), so it carries no React at runtime.
- NOTE (net state): the other unreleased codegen entries below — "codegen v2"
  and "self-contained codegen artifact" — describe that subsystem's development
  earlier on this branch. It now lives in the plugin; those APIs
  (`emitJs`/`emitGraph`/`makeCodegenRunTarget`/…) are no longer exported here.

### Added — first-class input defaults (`TypeOfInput.defaultValue`)

- Node-type input definitions may now declare a `defaultValue`
  (`number`/`string`/`boolean`); `constructNodeOfType` seeds it onto a fresh
  node's input handle `value` at construction (when the runtime type matches),
  so a new node's inline inputs are populated immediately without the consumer
  dispatching `UPDATE_INPUT_VALUE` after every add. The SDF Shape Studio
  exemplar now uses this and drops its ~90-line post-add seeding scan.

### Fixed — custom names inside loop/switch bodies

- The loop/switch sub-compilers omitted `customName` from body/branch steps (the
  top-level path sets it), so a custom-named node inside a loop body or switch
  branch lost its name in records, errors, and codegen comments. Both sites now
  carry it.

### Fixed — pre-existing pipeline landmines (surfaced by a multi-agent review)

- **Multi-edge delete no longer resurrects edges.** `UPDATE_EDGES_BY_REACT_FLOW`
  built every removal step against the same original snapshot, and `applyPlan`
  applied them by per-step overwrite — so a ReactFlow batch of ≥2 `remove`
  changes (multi-select-delete, or deleting a node with several edges) removed
  only the last and resurrected the rest (leaving dangling edges). The validator
  now accumulates the view across removals.
- **Zone membership recompute is now scope-correct.** After an edge change,
  membership was gated on ROOT `draft.zones` but read/wrote the current scope,
  so a loop/switch inside an open group never recomputed `zone.nodeIds` (stale
  frames + wrong pre/post-stop and true/false attribution). Both apply sites now
  gate on the scoped view's zones.
- **Running while a node group is open now compiles AND executes the subtree.**
  The loop/switch structure resolvers and `buildNodeInfoMap` read root
  `state.nodes`/`state.edges` directly, so a subtree run silently dropped every
  loop/switch from the plan and then failed per-node with "node not found". The
  compiler now hands the sub-compilers a scope-projected state, and the executor
  reads the current scope.
- **`applyPlan` exceptions are now observable.** A throw during apply used to
  unwind through `produce`/`dispatch` with no event and no toast; the store now
  catches it, keeps state unchanged, and emits an `action:rejected` event with a
  new `APPLY_EXCEPTION` code.
- **Runner mode-switch guard.** Switching a `<FullGraph>` between controlled and
  uncontrolled `executionRecord` at runtime (e.g. `record ?? undefined`) leaves
  the runner's derived state incoherent; it now logs a dev `console.error`
  (React-controlled-input style). Loading an external record mid-run now aborts
  the in-flight execution first (it previously reported "completed" while still
  running, then silently overwrote the loaded record).
- **Complex-type sameness unified.** The complex-compatibility check and the
  conversion check answered "are these the same type?" differently, so merely
  supplying a conversion table (even `{}`) flipped an aliased complex pair (two
  ids sharing one schema) from valid to `CONVERSION_NOT_ALLOWED`. Both now share
  one `areComplexTypesSame` rule.
- **Imported group subtrees rehydrate their zones.** `REPLACE_STATE` rebuilt
  derived zones for the root only, so an imported group's inner loops/switches
  had no zones (no frames; zone-guarded validation fell back to BFS). Subtree
  zones are now rehydrated per group.

### Removed

- Dropped the unused `lodash` runtime dependency (and `@types/lodash`) — the
  last import was replaced by `cloneDeepPreservingNonPlainObjects`. It remains
  only as a transitive dev-tooling dependency; consumers no longer install it.

### Fixed — complex data types × loops/switches/groups (edge inference)

- **Connecting a complex-typed output into a loop/switch infer slot or a group
  boundary no longer dies silently.** ADD_EDGE's apply step deep-copied the
  inference node data with `structuredClone`, which throws `DataCloneError` on
  the first function it meets — and a zod `complexSchema`'s internals are
  functions. The dispatch died mid-`produce` (no toast: an exception is not a
  validation rejection), so the edge simply never landed. The clone is now
  `cloneDeepPreservingNonPlainObjects`: plain data is deep-copied (Immer gets
  its mutable subtree), while functions/class instances — schemas included —
  pass through **by reference**.
- **Inference no longer mints schema copies.** The same pipeline's update values
  were cloned with lodash `cloneDeep`, which rebuilds class instances — an
  equivalent-but-_different_ schema object on every materialized handle,
  silently breaking the reference-identity comparison edge validation relies on
  ("data types are immutable singletons"). Same fix, same helper; handle schemas
  now stay `===` to their data type's singleton across inference.
- **Edge validation's complex-type fallback no longer treats two ABSENT schemas
  as proof of sameness.** Export strips `complexSchema` from handle
  `dataTypeObject`s, so a state loaded via a raw `REPLACE_STATE` had
  `undefined === undefined` on every complex handle pair — cross-type wires
  between imported nodes validated. Ids remain the primary key; a schema
  reference only counts when it exists.

### Fixed — uncontrolled runner records (`<FullGraph>` without record props)

- Omitting the `executionRecord` prop made the runner **controlled with a noop
  sink**: runs completed but every record evaporated (timeline forever "No
  execution record", previews never fed). `FullGraph` now preserves the absent
  prop as `undefined` through `RecordContext`, selecting `useNodeRunner`'s real
  UNCONTROLLED mode — Run populates the timeline/previews with no parent state.
  The prop is tri-state and documented: omit = uncontrolled, `null` =
  controlled-empty, record = controlled-loaded.
- **Type change (barrel-exported):** `RecordContextValue.executionRecord`
  widened `ExecutionRecord | null` → `ExecutionRecord | null | undefined`.
  Consumers reading it off `useRecordContext()` must now handle `undefined`.
- Controlling `executionRecord` WITHOUT wiring `onExecutionRecordChange` now
  logs a dev-only `console.error` (React-controlled-input style) — that
  configuration is still a silent record sink, and the warning names the fix.

### Fixed — `SliderNumberInput` external value changes

- The slider's internal chaining state initialized from the `value` prop at
  MOUNT only, so after a programmatic `UPDATE_INPUT_VALUE` (seeded defaults,
  undo/redo) the first `‹`/`›` click chained off the stale mount-time value —
  `0.4` visibly became `0.04` instead of `0.44`. External controlled-value
  changes now re-sync the internal state (internal changes are unaffected — they
  already sync before `onChange` fires).

### Fixed — `enableDebugMode` node id badge

- The debug id in the node header rendered flush against the title; it now has
  its own left margin (visible only when `enableDebugMode` is on).

### Added — SDF Shape Studio (Storybook, `Advanced Graph Examples`)

- A new top-level Storybook section demonstrating closure-valued complex data
  types + the `nodePreviews` feature at full stretch: **31 SDF node types**
  (plus the standard structural set — groups, loops, and switches work inside
  the studio) build 2D vector art from signed distance fields — shapes (Circle,
  Box, Star, Rounded Box, Hexagon, Triangle, Vesica, Moon, Pie, Heart),
  boolean/smooth operators (Union, Subtract, Intersect, Xor, Smooth ×3), shape
  modifiers (Round, Onion), domain transforms (Translate, Rotate, Scale, Mirror
  X/Y, artifact-free grid Repeat, two-sector Radial Repeat), **threshold masks**
  (Less Than / Greater Than → binary black/white images), **measurement nodes**
  (Measure Mask, Measure Brightness) that turn images into plain numbers (pixel
  counts / ratios over a fixed 220² grid) which can drive any downstream
  parameter, and an output **Render** sink. Every formula is an IQ-exact port
  pinned by known-point unit tests (`src/advancedGraphExamples/sdfLib.ts`);
  definitions live in `src/advancedGraphExamples/sdfStudioDefinitions.ts` so
  tests consume the real tables.
- Previews render each node's RECORDED value at the CURRENT timeline position
  (strictly `atStep` — scrubbing before a node's first execution shows "Not
  reached at this step", never a stale final value): the IQ orange/blue debug
  field on compute nodes, strict black/white on masks, formatted numbers on
  measurement nodes, and an anti-aliased cosine-palette fill (+glow) on Render —
  all Canvas2D (no WebGL context pressure), values read by reference off the
  execution record.
- **Rendering is manual by design in the Playground**: press Run in the runner
  panel (no auto-run on edits; params seed their defaults on add, batched so one
  undo removes them). The `Showcase` story pre-loads a UI-authored fixture
  (`.storybook/static/graphStates/sdf-shape-studio-state.json` — a six-heart
  radial flower smooth-unioned onto a circle, split two ways: a glowing palette
  Render, and a Less-Than mask whose Measure Mask reports pixel coverage)
  through the REAL import pipeline (schemas rehydrated), then runs it ONCE so
  the story opens already rendered. Story chrome adds theme (dark/light) and
  frame (full/390px) toggles.
- New Playwright project `advancedGraphExamples` (4 tests: seeding +
  slider-sync + no-auto-run pins, render-on-Run, binary-mask + plausible-ratio
  oracle, Showcase preload/auto-run + Reset→Run cycle).

### Added — group execution-path / instance tracking

- **Every execution step now records an `instancePath`** — the chain of
  group-instance node ids down to the scope that executed it (absent at root).
  Unlike `groupNodeId` (a shared subtree TEMPLATE id below depth 1), the chain
  uniquely identifies which instance path produced a step; it mirrors the
  ValueStore's scoped-prefix chain and round-trips through recording
  export/import unchanged. The thread-through covers the FULL executor surface —
  including loops and switches nested inside groups, which previously recorded
  their steps with no group attribution at all.
- **Instance-aware previews and status borders.** Standing inside a group
  instance (opened via the node's open button), per-node previews and runner
  visual states now derive only from THAT instance's steps — two instances of
  one group type show their own values on the shared template node instead of
  last-instance-wins. Template opens (top-left selector) keep the aggregate
  view. Recordings exported before this feature lack paths and filter to empty
  inside instances — re-run to refresh.
- **Follow into groups.** A timeline-toolbar toggle (default ON, session-only)
  makes scrubbing, stepping, and autoplay open/close group scopes so the canvas
  follows the scrub head into the exact instance that executed, then centers the
  node. `OPEN_NODE_GROUP` / `CLOSE_NODE_GROUP` are now NON-undoable (view
  concerns, like `SET_VIEWPORT`) so navigation never pollutes Ctrl+Z.
- **Step over / step out.** Timeline replay buttons jump over a group's interior
  (or out of the enclosing scope) using instancePath depth — plus a live
  `stepOver()` on `useNodeRunner` (and an optional Step-over transport button)
  that drains step-by-step execution through a group's interior with pause/stop
  honored.

### Changed — runner stories consolidated (Storybook)

- The runner-family stories collapsed 9 → 3: `EmptyRunnerPlayground`
  (unchanged), `WithRunner` (new story-chrome control panel: preview-mode ×
  theme × frame — replaces WithNodePreviews / NodePreviewsStepThrough /
  NodePreviewsErrorHandling / NodePreviewsWithoutRunner / NodePreviewsThemed /
  WithRunnerNarrow), and `RunnerFixtureDemos` (fixture selector over real
  UI-exported graphs, including a two-instance group fixture that pins the
  instance-tracking behavior). Fixture conventions documented in
  `.storybook/static/graphStates/README.md`.

### Added — ordered fan-in connections

- **Multi-connection input handles now expose a user-orderable connection
  sequence.** When several wires feed one input handle (fan-in), a count badge
  on the input row opens a popover to drag the connections into the desired
  order. The order is persisted per edge as `edge.data.order` — the connection's
  contiguous `0..n-1` rank within its target handle's fan-in group — via the new
  `REORDER_INPUT_CONNECTIONS` action. The compiler fixes the order in one place,
  for the executor's `connections[]` AND every codegen target, so the on-screen
  order equals the runtime and generated-code order. Additive and
  back-compatible: edges never reordered carry no `order` and fall back to the
  `state.edges` array order. Import repair gained an opt-in
  `normalizeConnectionOrder` strategy that repacks out-of-contract imported
  orders back to `0..n-1`. The compiler fixes the order via an explicit
  `edgesArrayIndex` tiebreak, additively surfaced on the `json-ir` run target's
  `inputResolutionMap` entries.

### Added — self-contained codegen artifact (`emitImplementations: 'source'`)

- **The `codegen-js` / `codegen-ts` targets can now bake your node
  implementations into the emitted module**, so the generated `runGraph()` runs
  standalone with no `functionImplementations` argument. Opt in via
  `makeCodegenRunTarget({ emitImplementations: 'source', knownFunctions })` —
  one object whose keys matching a node-type id are that type's impl and whose
  other keys are helpers referenced by name. Codegen analyses each function (via
  `Function.prototype.toString()`), emits the covered ones plus the `readInput`
  intrinsic as real `const` definitions, calls them by name, and drops the
  `functionImplementations` parameter when EVERY node is covered. A REGISTERED
  node type it cannot prove behaves identically to the in-process executor — one
  reading executor-only state (`context.state`/`loopIteration`/`groupDepth`), a
  non-`.value` connection field, handle metadata, reading `this`, a generator,
  or referencing an unresolvable (e.g. bundler-namespaced) identifier —
  gracefully keeps its threaded call and emits a `// warning:` naming the
  reason. (Only node types you list in `knownFunctions` are analysed; a
  used-but-unregistered type simply stays threaded with no warning and needs its
  impl at run time.) The artifact is always runnable. The value-API surface
  guard is inter-procedural (passing `inputs` to a registered helper checks that
  helper too), so the common `firstVal(inputs, name)` value-extraction pattern
  is covered. Additive and back-compatible: with the option off, codegen output
  is byte-for-byte unchanged. New `CodegenRunTargetOptions`:
  `emitImplementations`, `knownFunctions`, `additionalGlobals`. See
  `docs/runner/runTargetsDoc.md`.

### Changed — root Graph I/O inference parity (behavior change)

- **Connecting a wire to a root Graph Input/Output now behaves like a group
  boundary by default:** the connected handle concretizes its type, **renames to
  the connected source's name**, and grows a fresh blank infer spare. Previously
  root boundary handles did NOT rename on connect. Because a root handle's name
  is its `runGraph` parameter and its `rootInputs` key, this is a behavior
  change for existing consumers — a user wiring the graph can move a
  `rootInputs` key on the next connect.
  - **Migration:** to keep stable root I/O names, set
    `allowRootIORename={false}` on `<FullGraph>` (and usually
    `allowRootIOStructureEdit={false}` to also freeze the handle count).
    Alternatively, key `rootInputs` by the stable handle **id** instead of the
    name — `seedRootInputs` now honors id keys as a fallback, so id-keyed inputs
    are immune to renames. (`record.rootOutputs` stays name-keyed, byte-for-byte
    matching codegen's `runGraph` return.)
- New optional `<FullGraph>` props: `allowRootIORename?: boolean` (default
  `true`) and `allowRootIOStructureEdit?: boolean` (default `true`). Setting
  them `false` opts out of root rename-on-connect and root add/grow/delete
  respectively, gating BOTH the inference path and the Graph I/O editor.

### Breaking — codegen v2

- Codegen metadata moved off the core types. `TypeOfNode.codegen` and
  `DataType.codegenTypes` are removed; per-node `emit` and the per-data-type
  TypeScript type are now supplied to the codegen factory
  (`makeCodegenRunTarget`) / `emitJs` via the `CodegenMetadata` registry
  (`nodeTypeMetadata`, `dataTypeToTsType`). This decouples the editor core from
  codegen. No migration shim.
- The `initialInputValues` runtime-override parameter is removed from the
  emitted `runGraph` signature (and from the `emitJs` / codegen-target API).
  Unconnected input handles bake their current state value INLINE instead.

### Added — codegen v2 (clean `runGraph`)

- The built-in **codegen run targets now route through `emitGraph` v2.**
  `codegenJsRunTarget` / `codegenTsRunTarget` (and `makeCodegenRunTarget`) call
  `emitGraph(plan, state, options)` (async): the proven string emit, then opt-in
  `ts.transform` optimization passes over the generated TypeScript AST, then
  Prettier. `typescript` is now a runtime dependency (externalized from the
  bundle, lazy-`import()`ed only on codegen use), used as the AST substrate for
  the passes. With no opt-in options the export is a faithful, threaded
  `runGraph`; the optimization passes are opt-in (see below).
- **Auto-emit** (`analyzeImplementations: true` + `impls`): a self-contained
  value-API implementation that reads inputs through the now-exported
  `readInput` intrinsic and returns `new Map([[name, pureExpr]])` is emitted
  INLINE (no manual `emit` hook, no threading). Recognition is AST-based and
  robust to Vite/esbuild transpilation; author `emit` hooks take precedence;
  anything not provably self-contained falls back to threading.
- **Dead-code elimination** (`optimize.deadCode`, needs
  `assumePureImplementations`): drops bindings/blocks no returned value depends
  on (including dead loop/switch/group blocks), then cleans the signature —
  removes unreferenced parameters and the `async` keyword when no `await`
  survives.
- **`readInput(inputs, name)` and `emitJs` are now exported** from the public
  run-targets barrel (`src/utils/nodeRunner/runTargets/index.ts`). `readInput`
  is the recommended way for node implementations to read an input (returns the
  value array; index `[0]` for the first) and is the auto-emit marker; `emitJs`
  is the low-level codegen string entry point.
- **Loops** now emit ONE named variable per loop variable (`let loopValue = …`)
  declared at function scope, instead of a `currentValues[i]` array (Masterplan
  §12).
- The CodegenStudio stories gain an **`optimize`** toggle (DCE + auto-emit), and
  a new `CodegenStudioWithGraphIO` story demonstrates the clean
  `runGraph(a, b)`.

### Added

- Root Graph I/O editing — build a graph's `runGraph(...)` signature in the
  studio. At root scope the canvas context menu gains single-instance **"Add
  Graph Input"** / **"Add Graph Output"** entries, the placed boundary nodes
  display as "Graph Input" / "Graph Output" and carry an edit Pencil, and a new
  `GraphIOEditDrawer` (reusing `InputOutputReorderSection` with its new optional
  `allowLeafRename` / `onAddItem` props) adds, renames, reorders, and deletes
  their handles by name. A new instance-scoped `UPDATE_GRAPH_IO_HANDLES` action
  cascades the root edges of deleted handles and mints new `groupInfer` handles
  that concretize on connect. The compiler/executor seed these as `rootInputs` /
  `rootOutputs`, and the JS codegen emits a clean `function runGraph(a, b)`
  whose parameters are the Graph Input handle names and whose return is keyed by
  the Graph Output handle names. See `docs/ui/editorsDoc.md`.
- `FullGraph` gains an optional `rootInputs?: Record<string, unknown>` prop that
  seeds the root Graph Input handle values for an in-editor run. Both instant
  and step-by-step execution now seed `rootInputs` and collect `rootOutputs`, so
  the in-editor run and the emitted `runGraph(...)` are value-equivalent.
- Optional graph theme system: `GraphThemeProvider`, `useGraphTheme`, the typed
  `GraphTheme` per-component/per-slot className map, `blenderDark` / `light`
  presets, and the `mergeGraphThemes` / `resolveGraphTheme` utilities. Without a
  provider the graph keeps its existing default look.
- Pluggable run targets: register named execution strategies via `FullGraph`'s
  additive `runTargets` / `defaultRunTargetId` props and pick one from the
  runner's split Run button. Two modes — `execute` (feeds the timeline like
  today) and `artifact` (downloads a file/string). Ships three built-ins: the
  in-process executor (default), `json-ir` (export the compiled plan as JSON),
  and `codegen-js` (emit a standalone, dependency-free, human-readable
  JavaScript `runGraph`). The run-targets module — `RunTarget`,
  `makeRunTargetWithAutoInfer`, the `inProcessRunTarget` / `jsonIrRunTarget` /
  `codegenJsRunTarget` values, `downloadTextArtifact`, and the runner IR/record
  types — is now part of the public API. Omitting `runTargets` keeps the
  existing single Run button. See `docs/runner/runTargetsDoc.md`.
- Code generation emits cleaner output and adds a TypeScript target. The
  JavaScript `runGraph` is value-API-trimmed via a one-time `makeInput` /
  `makeOutputs` / `makeContext` helper prelude (compact and dependency-free).
  New `codegenTsRunTarget` (`id: 'codegen-ts'`) and the `makeCodegenRunTarget`
  factory emit a typed `runGraph`, casting stored values from the
  `CodegenMetadata` registry's `dataTypeToTsType` map (data-type id → TS type
  string, e.g. `{ numberType: 'number' }`); both are public via the run-targets
  barrel. Opt-in `returnValues` narrows what `runGraph` returns, and
  `assumePureImplementations` additionally runs dead-code elimination, dropping
  pure nodes no returned value depends on.
- Generated code now reads like hand-written source: values are readable local
  variables (named from the node + handle, e.g. `bitInputOut`, deduped) declared
  inline (`const sum = (await …).get("Sum")`) or hoisted, instead of a
  `values["nodeId:handleId"]` map, and loops render as a natural `for` with a
  single `if (!condition) break`. A node type can opt into an `emit` template
  (supplied via the `CodegenMetadata` registry's per-node `emit` hook, see
  `CodegenEmitContext`) to render itself as an inline expression (e.g.
  `const gateOut = Boolean(a) && Boolean(b);`) instead of an implementation
  call. The returned object keys stay `nodeId:handleId`.

### Changed — type-level (no runtime change)

- `ConfigurableEdgeState['data']` is typed
  `{ order?: number } & Record<string, unknown>` (was `{}`). Object `data`
  payloads continue to compile, so this is a non-breaking, lint-clean
  replacement for the bare `{}`. The typed `order` is the connection's fan-in
  rank (see _Added — ordered fan-in connections_ above) and is the one edge
  field the library reads; all edge **visuals** remain derived from the
  connected handles at render time.
- `FullGraphContext`'s value type now matches its runtime shape:
  `allProps.state` is `Pick<State, 'typeOfNodes' | 'enableDebugMode'>` (the only
  slices the runtime value ever carried). Reading any other `state` field
  through this context returned `undefined` at runtime before; it is a compile
  error now. `allProps` additionally carries an `isAtRootScope` boolean (true
  when no node group is open) so nodes can tell a root Graph I/O boundary from a
  group-internal `groupInput` / `groupOutput`.

### Changed — DOM class strings (computed styles identical)

- Hardcoded hex utility classes were renamed to semantic token utilities (e.g.
  `bg-[#222222]` → `bg-graph-elevated-surface-bg`, including the string returned
  by the exported `modalContentVariants`). Rendered pixels are unchanged;
  consumers keying on literal class strings (CSS attribute selectors, DOM
  snapshots) must update.
- Library-emitted CSS variables use a `--color-graph-*` namespace for the
  generic surface tokens (menu, elevated surface, node panel, input placeholder,
  scrollbar thumb, toggle track) to avoid colliding with consumer-defined
  Tailwind theme tokens.

### Fixed

- **`Select`**: the option-list sync no longer calls `setState` during render,
  removing a React "Cannot update a component (`Select`) while rendering a
  different component (`SelectContent`)" console error that fired on every graph
  (the run-target picker and node-group breadcrumb use `Select`).
- **Codegen auto-emit**: hardened recognition so it cannot inline an
  implementation that is not actually self-contained — a `readInput(...)` call
  is only recognized when its first argument is the implementation's own input
  parameter, and placeholder substitution is index-keyed so handle names
  containing non-identifier characters (e.g. `"Color A"`) no longer corrupt the
  emitted expression.
- **Root Graph I/O serialization round-trip**: `serializeExecutionPlan` now
  preserves `rootInputNodeId` / `rootOutputNodeId`, and the execution-record
  serializer preserves `rootOutputs`, so the `json-ir` export and recording
  import/export no longer drop a graph's root I/O boundary.
- **Codegen ≡ executor on malformed structures**: the codegen loop/switch
  lowering now applies the same handle-count / condition validation the executor
  enforces, instead of silently emitting `<ref> = undefined` for a desynced
  structure.
- **Auto-emit scope tracking**: the `deriveAutoEmit` visitor no longer
  mis-recognizes a nested lambda parameter that shadows the implementation's
  `inputs` parameter as a node-input read.
- **Graph I/O editor deletion review**: deleting a Graph Input/Output handle
  that carries connections now opens the same blast-radius deletion review
  (preview of the connections that will break) as the node-type editor.
- **`Select`**: `selectedIndex` reports `null` (not a transient `-1`) for the
  commit before the option registry settles.
- **Topological-sort cycle**: a detected cycle now throws a structured
  `GraphError` at the engine boundary instead of a bare `Error`.
- **Import validation**: importing a graph with duplicate or empty root Graph
  I/O handle names, or extra root boundary nodes, is now validated rather than
  silently collapsing at runtime.
