# Changelog

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
