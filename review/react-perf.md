# React correctness & performance review — react-blender-nodes

## Domain summary

I audited the React hooks/rendering surface of the editor: the main `FullGraph`
organism and its context plumbing (`FullGraphState.ts`, `graphStore.ts`,
`RunnerOverlay`, `RecordingViewStateContext`), the node/edge renderers
(`ConfigurableNode`, `ConfigurableNodeReactFlowWrapper`, `ContextAwareHandle`,
`ContextAwareInput`, `ConfigurableEdge`), the overlays (`ZoneFrameOverlay`,
`ConnectionMiniMap`), the execution timeline (`ExecutionTimeline` +
`useTimelineZoomPan`/`useTimelineScrub`/`useTimelineAutoplay`), the edit
drawers, and the shared hooks (`useDrag`, `useSlideAnimation`,
`useColorPicker` + ColorPicker parts). The codebase is, on the whole, unusually
disciplined about effect lifecycles: subscriptions (IntersectionObserver,
ResizeObserver, Web Animations, document listeners) are consistently cleaned up,
and the authors deliberately use refs to keep effect dependency arrays narrow.
The store/`useSyncExternalStore` architecture is sound. The genuine issues I
found are concentrated in two places: (1) **context-value identity** — the
top-level `FullGraphContext` provider value is rebuilt on every render,
defeating per-node memoization across the whole canvas; and (2) a couple of
xyflow-`useStore`/Rules-of-Hooks foot-guns. Most other candidates I chased
(drawer reset effects wiping edits, the `currentNodesAndEdges` memo's missing
`state.zones` dep, the `ConfigurableEdge` IntersectionObserver dep) turned out
to be safe on closer inspection, and I note why below so they aren't re-flagged.

---

## HIGH

### R1 — `FullGraphContext` provider value is a fresh object every render → every node re-renders on every dispatch

- **Severity:** HIGH · **Confidence:** high · **Category:** performance /
  context identity
- **Files:** `src/components/organisms/FullGraph/FullGraph.tsx:1050-1052`;
  `src/components/organisms/FullGraph/FullGraphState.ts:262-268`; consumers:
  `src/components/organisms/ConfigurableNode/ConfigurableNode.tsx:494`,
  `src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareInput.tsx:57`,
  `src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareNodeHeaderActions.tsx:22`.
- **Current vs expected:** The outer `FullGraph` receives `state` from
  `useFullGraph`'s `useSyncExternalStore`, so it re-renders on every committed
  action (including every drag-frame `UPDATE_NODE_BY_REACT_FLOW`). On each of
  those renders it computes `value={createContextValue({ state, dispatch })}`,
  and `createContextValue` returns a brand-new `{ allProps }` object
  (`return { allProps }`). React compares context values by `Object.is`; a new
  object every render means **every** `FullGraphContext` consumer re-renders.
  Since `ConfigurableNode` (the body of every node on the canvas) is a consumer,
  _all_ nodes re-render on _every_ state change — even one that only touched an
  unrelated node's position. Expected: the provider value is memoized so
  untouched nodes can bail out.
- **Root cause:** Inline object construction in the Provider `value` prop, with
  no `useMemo`. (`createContextValue` exists only as a generics-variance bridge;
  it does not stabilize identity.)
- **Impact:** Defeats memoization for the entire node tree. Each re-rendered
  `ConfigurableNode` re-runs `useNodeConnections` for every input
  (`RenderInput`) and every handle (`ContextAwareHandle`), so the cost scales
  with (nodes × handles) on every dispatch and every drag frame. On medium/large
  graphs this is the dominant render cost during interaction.
- **Evidence:** `FullGraph.tsx:1050`
  `value={createContextValue({ state, dispatch })}`; `FullGraphState.ts:267`
  `return { allProps };`; `ConfigurableNode.tsx:494`
  `const fullGraphContext = useContext(FullGraphContext);`.
- **Fix sketch:**
  `const ctxValue = useMemo(() => createContextValue({ state, dispatch }), [state, dispatch]);`
  (value still changes when `state` changes, but at least collapses to one
  identity per commit; better still, split the rarely-changing `dispatch`/config
  out of the hot `state` so node bodies don't subscribe to `state` at all).

---

## MEDIUM

### R2 — `ZoneFrameOverlay` `useStore` selector returns a new object literal with no equality fn → re-renders on every store tick

- **Severity:** MEDIUM · **Confidence:** high · **Category:** performance /
  xyflow store
- **File:**
  `src/components/molecules/ZoneFrameOverlay/ZoneFrameOverlay.tsx:18-22`
- **Current vs expected:**
  `const viewport = useStore((s) => ({ x: s.transform[0], y: s.transform[1], zoom: s.transform[2] }));`
  — the selector builds a fresh object every call and **no second `equalityFn`
  argument is passed**. xyflow's `useStore` forwards to zustand's
  `useStoreWithEqualityFn`, which (verified in
  `node_modules/zustand/esm/traditional.mjs`) falls back to `Object.is` when
  `equalityFn` is `undefined`. `Object.is(prevObj, newObj)` is always `false`
  for two distinct literals, so this component re-renders on **every** ReactFlow
  store update (node drag, selection, hover, dimension changes, viewport
  pan/zoom), not only when the transform changes. Expected: re-render only when
  `x`/`y`/`zoom` actually change.
- **Root cause:** Object-literal selector without `shallow` (or three scalar
  selectors).
- **Impact:** The whole overlay (and its `zoneFrames` `useMemo` comparison) is
  reconsidered on every store mutation. The `useMemo([zones, nodes])` guards the
  expensive hull math, so the convex-hull cost is not repaid each time, but the
  component still reconciles its SVG subtree on every tick. Moderate, and it
  compounds with R1 during drags.
- **Evidence:** `ZoneFrameOverlay.tsx:18`; zustand default:
  `useStoreWithEqualityFn(api, selector = identity, equalityFn)` →
  `useSyncExternalStoreWithSelector(..., selector, equalityFn)` with
  `equalityFn` undefined ⇒ `Object.is`.
- **Fix sketch:** import `shallow` from `@xyflow/react`/`zustand` and pass it as
  the 2nd arg, or select three scalars:
  `const x = useStore(s => s.transform[0])`, etc.

### R3 — Conditional `useNodeConnections` call violates the Rules of Hooks (`ConfigurableNode` / `ContextAwareHandle`)

- **Severity:** MEDIUM · **Confidence:** high (it IS a violation) / medium
  (current runtime impact) · **Category:** correctness / hooks
- **Files:**
  `src/components/organisms/ConfigurableNode/ConfigurableNode.tsx:246-250`
  (`RenderInput`);
  `src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareHandle.tsx:298-303`
- **Current vs expected:** Both components call a hook conditionally:
  ```tsx
  const connections = isCurrentlyInsideReactFlow
    ? useNodeConnections({ handleId: input.id })
    : [];
  ```
  This breaks the Rules of Hooks (hooks must be called unconditionally, same
  order every render). It does not crash **today** only because
  `isCurrentlyInsideReactFlow` is fixed per render-tree (the ReactFlow wrapper
  always passes `true`; standalone/story usage always `false`), so within a
  single mounted instance the branch never flips and the hook order is stable.
  It is nonetheless fragile and would be flagged by `eslint-plugin-react-hooks`;
  any future code path that toggles the prop on a live instance, or React's
  dev-mode hook-order checks, will throw "Rendered more hooks than during the
  previous render."
- **Root cause:** Using a prop as a render-time gate around a hook instead of
  splitting into two components (one that always calls the hook, one that never
  does).
- **Impact:** Latent crash risk + lint failure + blocks safe refactors. Low
  probability given current call sites, hence MEDIUM not HIGH.
- **Evidence:** `ConfigurableNode.tsx:246`; `ContextAwareHandle.tsx:298`. Same
  pattern in `ContextAwareInput.tsx:164` is safe there because it conditionally
  renders a _child component_ (`ReactFlowAwareInput`) rather than calling a
  hook.
- **Fix sketch:** Extract a `ConnectedRenderInput` that always calls
  `useNodeConnections`, and a `PlainRenderInput` that doesn't; pick the
  component (not the hook) based on `isCurrentlyInsideReactFlow`.

### R4 — `useTimelineZoomPan`: two effects with no dependency array run on every render

- **Severity:** MEDIUM · **Confidence:** high · **Category:** performance /
  effect lifecycle
- **File:**
  `src/components/molecules/ExecutionTimeline/useTimelineZoomPan.ts:61-82`
  (ResizeObserver attach) and `:197-216` (wheel-listener attach)
- **Current vs expected:** Both `useEffect`s are written **without a dependency
  array**, so their bodies execute after _every_ render of the timeline. They
  self-guard with `observedElRef`/`wheelAttachedRef` "did the element change?"
  checks and return early, so they don't actually re-attach the
  observer/listener each time — but the effect closures are still created and
  run on every render, and crucially the **cleanup** functions returned here
  only run on unmount (a no-arg effect's cleanup runs once on unmount), which is
  the intended attach-once semantics. The smell: the intent ("re-attach only
  when `scrollContainerRef.current` changes") is expressed via a manual
  ref-compare instead of a proper dependency, which is the classic "effect
  without deps + manual diffing" anti-pattern and easy to break during edits.
- **Root cause:** The scroll container is conditionally mounted, so the ref
  isn't stable at mount; the author chose a no-deps effect + manual
  `=== ref.current` comparison instead of a callback ref. It works but runs
  every render and obscures the lifecycle.
- **Impact:** Minor per-render overhead and maintenance fragility (the
  early-return guard is the only thing preventing observer churn; remove/alter
  it and you get add/remove-observer thrash every render). Functionally correct
  as written.
- **Evidence:** `useTimelineZoomPan.ts:61` `useEffect(() => { ... });` (no deps)
  closing at `:82`; `:197` `useEffect(() => { ... });` (no deps) closing at
  `:216`. Contrast with the properly-scoped effects elsewhere in the same file
  (`:109`, `:120`).
- **Fix sketch:** Convert `scrollContainerRef` to a callback ref (or a
  `useCallback` ref setter) that attaches/detaches the ResizeObserver + wheel
  listener on element change; the manual ref bookkeeping then disappears and the
  effect runs only when the element changes.

### R5 — `useColorPicker` returns an unmemoized object → `ColorPickerContext` re-renders all picker parts every render

- **Severity:** MEDIUM · **Confidence:** medium · **Category:** performance /
  context identity
- **Files:**
  `src/components/molecules/ColorPicker/hooks/useColorPicker.ts:224-238`;
  provided at `src/components/molecules/ColorPicker/parts/Root.tsx:19-21`
- **Current vs expected:** `useColorPicker` ends with
  `return { color, format, ..., setColor, ... }` — a new object literal every
  render — and `ColorPickerRoot` feeds it straight into
  `<ColorPickerContext.Provider value={state}>`. Every render of the picker root
  therefore re-renders every consumer (`Area`, `Hue`, `Alpha`, `Preview`,
  `CssInput`, `ChannelInput`, `Swatches`, `ContrastReadout`, `EyeDropper`). The
  individual `setColor`/`setComponent` callbacks ARE `useCallback`-stabilized
  and the derived values are `useMemo`'d, but the **container object** is not,
  so that work is wasted at the context boundary.
- **Root cause:** No `useMemo` wrapping the returned state object.
- **Impact:** Bounded — the color picker is a small, localized popover and only
  mounts on demand. Re-renders track real color changes most of the time. Still,
  dragging the Area canvas re-renders the whole picker subtree each
  pointer-move. MEDIUM-leaning-LOW.
- **Evidence:** `useColorPicker.ts:224` `return { color, ... };` (no `useMemo`);
  `Root.tsx:21` `<ColorPickerContext.Provider value={state}>`.
- **Fix sketch:**
  `return useMemo(() => ({ ... }), [color, format, formatStrings, gamutResult, contrastResult, background, setColor, setComponent, adjustComponent, setFormat, setFromString, formats, formatted]);`.

---

## LOW

### R6 — `ConfigurableNodeReactFlowWrapper` recomputes `JSON.stringify(data)` on every node render for `ErrorBoundary resetKey`

- **Severity:** LOW · **Confidence:** high · **Category:** performance /
  render-path work
- **File:**
  `src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx:105`
- **Current vs expected:** `resetKey={JSON.stringify(data)}` serializes the
  node's entire `data` object (inputs, outputs, handle configs, values) to a
  string on **every** render of every node. `data` can be large for nodes with
  many handles. Combined with R1 (all nodes re-render on every dispatch), this
  runs a full `JSON.stringify` per node per frame during drags. Expected: a
  cheap, stable reset key.
- **Root cause:** Using full serialization as a change-detection key on the hot
  path.
- **Impact:** CPU on large graphs during interaction; also `JSON.stringify`
  throws on cyclic/`Map`/`BigInt` data (node `data` is generally plain, so low
  risk, but `unsupportedDirectly` values are `unknown`).
- **Evidence:** `ConfigurableNodeReactFlowWrapper.tsx:105`
  `resetKey={JSON.stringify(data)}`.
- **Fix sketch:** Reset on a cheap signal instead — e.g. `resetKey={id}` plus a
  structural version counter, or memoize the stringify with `useMemo([data])` so
  it only recomputes when `data` identity changes.

### R7 — `currentNodesAndEdges` memo omits `state.zones`/`state.zoneIndex` from deps (latent, currently masked)

- **Severity:** LOW · **Confidence:** medium · **Category:** correctness
  (latent) / hooks deps
- **File:** `src/components/organisms/FullGraph/FullGraph.tsx:604-606`
- **Current vs expected:**
  `useMemo(() => getCurrentNodesAndEdgesFromState(state), [state.nodes, state.edges, state.openedNodeGroupStack, state.typeOfNodes])`.
  The callee also returns `state.zones`/`state.zoneIndex`
  (`constructAndModifyNodes.ts:454-457`), which are then fed to
  `<ZoneFrameOverlay zones={currentNodesAndEdges.zones} ...>`. `zones` is not in
  the dep array. Today this is masked because every zone recompute happens
  inside actions that also mutate `state.nodes` (e.g. node-move recomputes
  memberships at `applyPlan.ts:1552-1567`, so `state.nodes` always co-changes
  and the memo re-runs). But the dep list is not honest about what the memo
  reads; a future action that mutates only `state.zones` (e.g. a pure
  rename/recolor) would serve a stale overlay.
- **Root cause:** Hand-maintained dep list narrower than the function's actual
  reads.
- **Impact:** None observed currently; a correctness trap for future zone-only
  mutations.
- **Evidence:** `FullGraph.tsx:605` reads full `state`; deps at `:606` list only
  4 slices; overlay consumes `.zones` at `:747`.
- **Fix sketch:** Add `state.zones, state.zoneIndex` to the dep array (or
  memoize on `state` itself, since `getCurrentNodesAndEdgesFromState` is cheap
  when no group is open).

---

## Checked and found NOT to be bugs (so they aren't re-flagged)

- **Drawer reset effects wiping in-progress edits** —
  `RegionChannelEditDrawer.tsx:91-98` and `NodeTypeEditDrawer.tsx:111-132` reset
  local edit state whenever the source props change while `isOpen`. I traced the
  identity chain: `getCurrentNodesAndEdgesFromState` returns `state.nodes` by
  reference and `.find()` returns the same node object when untouched, so
  `node.data` (the `loopStartData`/`nodeTypeInputs` feeding `initialLevels`)
  keeps a stable reference across unrelated dispatches (including dragging the
  very node being edited, since drag mutates `position`, not `data`). The reset
  effects therefore do **not** fire on unrelated state changes. Safe.
- **`ConfigurableEdge` IntersectionObserver effect dep
  `[store.getState().domNode]`** (`ConfigurableEdge.tsx:152`) —
  `store.getState()` returns a fresh snapshot object, but the dep is the
  **`.domNode` field**, a stable DOM reference, so the effect does not thrash.
  The observer is disconnected on cleanup. Safe. The animated-edge WAA effect
  (`:163-181`) also cleans up correctly.
- **`useTimelineAutoplay` interval effect recreating each step**
  (`useTimelineAutoplay.ts:260-273`) — depends on `goToNextStep`, which changes
  as `navigableStepIndex` advances, so the interval is cleared+recreated per
  step. This is intentional and correct (the callback must close over the latest
  index); cleanup is present.
- **`useDrag`** (`src/hooks/useDrag.ts`) — exemplary: callbacks kept in
  `optionsRef`, effect deps narrowed to `[dragElement, enabled]`, document
  listeners removed on both mouseup and unmount.
- **`graphStore`/`useFullGraph`** (`graphStore.ts`, `FullGraphState.ts:166-246`)
  — `useSyncExternalStore` usage is correct; store created once via lazy
  `useRef`; `onGraphEvent` captured via getter ref; the `state:committed` effect
  deps (`[state.nodes.length, state.edges.length]`) are appropriate.
- **`RecordingViewStateContext` provider value**
  (`RecordingViewStateContext.tsx:118-151`) — properly `useMemo`'d with a
  correct dep list; setters are stable.
