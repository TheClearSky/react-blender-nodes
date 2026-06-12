# Architecture & Duplication Review — react-blender-nodes

## Domain summary

This pass focused on architecture and code duplication across
`src/utils/nodeStateManagement` (immer reducer / planApply / zones / loop+switch
structures), `src/utils/nodeRunner` (compiler + executor),
`src/utils/importExport`, and the React UI under `src/components`. The good
news: several recent consolidations are genuinely well done —
`RegionChannelEditDrawer` + `HandleLevelRowShell` cleanly unify the loop/switch
edit drawers via injected render props; `zones/discoverZoneNodesFromHandles` is
a single unified zone-membership BFS; the `geometry.ts` math helper
(`isNumberInRange`/`isCoordinateInBox`) is fully consolidated with no remaining
duplicate range-checks; and the `lengthOfIds` constant exists. The bad news:
significant duplication and layering problems remain. The most material are (1)
a **utils ↔ components runtime circular dependency** caused by
`historyTypes.ts` (pure logic) living in the UI folder yet being imported as a
value by core `applyPlan.ts`; (2) **four parallel copies of the
per-concurrency-level execution loop** in the runner; (3) **three+ parallel BFS
region-discovery implementations** plus a duplicated
"zones-preferred-else-BFS-fallback" block copy-pasted across 6 call sites; (4)
**byte-identical helper duplication** between `loopLevelConversion.ts` and
`switchLevelConversion.ts`; and (5) **god-modules** (`applyPlan.ts` 1697 lines,
`loopValidation.ts` 1214 lines). madge reports 19 circular dependencies and knip
reports 42 unused exports + 77 unused exported types. Detailed findings below,
grouped by severity.

---

## HIGH

### ARCH-01 — utils → components runtime circular dependency via misplaced `historyTypes.ts`

- **Severity:** HIGH · **Confidence:** high · **Category:** Layering / circular
  dependency / wrong abstraction
- **Files:**
  - `src/utils/nodeStateManagement/planApply/applyPlan.ts:5` —
    `import { applyPatchesToDraft } from '@/components/organisms/FullGraph/historyTypes';`
  - `src/components/organisms/FullGraph/historyTypes.ts:2-5` —
    `import type { Plan, UpdateEdgesByReactFlowPlan } from '@/utils/nodeStateManagement/planApply/types';`
  - `src/components/organisms/FullGraph/historyTypes.ts:189`
    (`applyPatchesToDraft`), `:241` (`filterHistoryPatches`), `:273`
    (`recordInHistory`), `:306` (`createEmptyHistory`), `:113` (`isUndoable`)
  - Also value/type imports from this UI path in core utils:
    `applyWithHistory.ts:16`, `serialization.ts:586`, `planApply/types.ts:2`.
- **Current vs expected:** `historyTypes.ts` is a pure, framework-free logic
  module (Immer patch application, undo/redo recording, undoability rules — no
  React/JSX) but it physically lives under `components/organisms/FullGraph/`.
  Core util `applyPlan.ts` imports a **runtime value** (`applyPatchesToDraft`)
  from it, while `historyTypes.ts` imports back from
  `utils/.../planApply/types`. Expected: history logic belongs in
  `src/utils/nodeStateManagement/` (e.g. `history/`), with utils depending only
  on utils.
- **Root cause:** Module placed by feature area (FullGraph owns undo/redo UX)
  rather than by layer (it is reducer logic). Because it is imported as a value
  (not just a type), the cycle is real at runtime, not erased by
  `isolatedModules`.
- **Impact:** Genuine import cycle between the lowest layer (state reducer) and
  the UI layer; brittle module-init ordering, harder tree-shaking, and a
  conceptual inversion that makes the reducer non-portable without the UI tree.
  madge lists FullGraph cycles (#4–#6) and the reducer cycle (#16).
- **Recommendation:** Move `historyTypes.ts` to
  `src/utils/nodeStateManagement/history.ts` (or `history/`). Re-export the 3
  UI-facing **types** from `components/organisms/FullGraph/index.ts` for
  backward compat. Cost: low (one file move + import path updates). Benefit:
  removes the worst layering inversion and several cycles.

### ARCH-02 — Core reducer imports the entire component barrel (`@/components`)

- **Severity:** HIGH · **Confidence:** high · **Category:** Leaky abstraction /
  dependency direction
- **Files:**
  - `src/utils/nodeStateManagement/mainReducer.ts:8` —
    `import type { EdgeChanges, NodeChanges } from '@/components';`
  - `src/utils/nodeStateManagement/planApply/applyPlan.ts:6` —
    `import type { NodeChanges } from '@/components';`
  - `src/components/index.ts:1-3` —
    `export * from './atoms'; export * from './molecules'; export * from './organisms';`
- **Current vs expected:** The reducer imports two narrow types from the
  **top-level barrel** that re-exports every atom/molecule/organism. These types
  actually live in `components/organisms/FullGraph/types.ts`. Expected: import
  from the specific module path (as other util files already do, e.g.
  `types.ts:2`), not the god-barrel.
- **Root cause:** Convenience barrel import; `import type` masks the smell
  because it is erased at emit.
- **Impact:** Couples the core reducer's module graph to the full component tree
  for tooling/bundler/circular-analysis purposes (madge #16); any reorganization
  of the barrel ripples into core state code. It also undermines the "utils is a
  lower layer" boundary.
- **Recommendation:** Change both imports to
  `@/components/organisms/FullGraph/types`. Better still, relocate
  `NodeChanges`/`EdgeChanges` type aliases into `nodeStateManagement` since they
  are reducer-domain types. Cost: trivial. Benefit: removes a layer-violating
  import.

### ARCH-03 — Four parallel implementations of the per-concurrency-level execution loop

- **Severity:** HIGH · **Confidence:** high · **Category:** Duplication
  (divergence risk in the runtime hot path)
- **Files:**
  - `src/utils/nodeRunner/executor/runAll.ts:107-169` (top-level levels)
  - `src/utils/nodeRunner/executor/stepByStep.ts` (step-by-step top-level loop)
  - `src/utils/nodeRunner/executor/executeLoopBlock.ts:228-330`
    (`executeBodyLevels`)
  - `src/utils/nodeRunner/executor/executeSwitchBlock.ts:219-end` (inline branch
    loop)
- **Current vs expected:** Each re-implements the identical orchestration: group
  steps by `concurrencyLevel`, partition into `toExecute`/`toSkip` via
  `shouldSkipNode`, mark/record skips, then either run sequentially (`afterStep`
  present) or `Promise.allSettled` concurrently, then funnel rejects to
  `handleCatchError`. Expected: one shared `executeLevels(...)` helper
  parameterized by the recording-context fields that legitimately differ
  (loopIteration/loopPhase/switchPhase/parentFields).
- **Root cause:** Each block grew its own copy as loop/switch/group features
  were added; the common skeleton was never extracted.
- **Impact:** High divergence risk in the most correctness-sensitive code.
  Example of existing drift: `runAll`/`stepByStep` check `abortSignal` once per
  level, but the inner loops also break mid-`toExecute`; skip-propagation
  semantics (`erroredNodes.add(stepNodeId)`) are re-coded in each copy. A bug
  fix to skip/abort/error handling must be applied in 4 places and can be
  missed.
- **Recommendation:** Extract
  `async function executeLevels(sortedLevels, env, valueStore, erroredNodes, ctx, afterStep?)`
  into `executionHelpers.ts`, where `ctx` supplies the per-step recording
  fields. Have all four call sites use it. Cost: medium (careful refactor +
  rerun runner e2e/recordings). Benefit: single source of truth for the
  execution loop.

### ARCH-04 — Parallel branch/region compilation in loop vs switch compilers, with a real divergence

- **Severity:** HIGH · **Confidence:** high · **Category:** Duplication + latent
  bug
- **Files:**
  - `src/utils/nodeRunner/loopCompiler.ts:167-289` (`compileBodyRegion`)
  - `src/utils/nodeRunner/switchCompiler.ts:101-174` (`compileBranch`)
- **Current vs expected:** Both build adjacency/reverse-adjacency lists
  (skipping bind edges + self loops), call `topologicalSortWithLevels`, run
  `compileGroupScopes`, and convert levels → `ExecutionStep[]` with identical
  group/standard step shaping. **Divergence:** `loopCompiler` passes the real
  `maxIterations` into `compileGroupScopes` (`loopCompiler.ts:244`), but
  `switchCompiler` hardcodes `100` (`switchCompiler.ts:140`). So a group nested
  inside a switch branch silently uses a different `maxLoopIterations` cap than
  the same group elsewhere.
- **Root cause:** Copy-paste of the region-compile routine; the hardcoded `100`
  is a stale literal that wasn't parameterized.
- **Impact:** Inconsistent loop-iteration limits for groups inside switches
  (functional bug, not just style). Future edits must touch both copies.
- **Recommendation:** Extract a shared
  `compileRegionSteps(regionNodeIds, { edges, nodes, state, isStructuralEdge, maxIterations, ... }) → ExecutionStep[]`
  used by both compilers (loop adds its inner-loop proxy handling on top). At
  minimum, thread the real `maxIterations` into the switch path now. Cost:
  medium. Benefit: removes duplication and fixes the `100` divergence.

### ARCH-05 — Duplicated "zones-preferred-else-BFS-fallback" block across 6 call sites

- **Severity:** HIGH · **Confidence:** high · **Category:** Duplication /
  missing single source of truth
- **Files (same shape in each):**
  - `src/utils/nodeRunner/loopCompiler.ts:113-127`,
    `src/utils/nodeRunner/switchCompiler.ts:81-94`
  - `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts:748-`, `:854-`
  - `src/utils/nodeStateManagement/nodes/switches/switchValidation.ts:71-92`,
    `:264-`
- **Current vs expected:** Every site repeats
  `const z = state.zones ? findZoneByStructure(state.zones, anchorId, role) : undefined; … if (trueZone && falseZone) { new Set(zone.nodeIds) } else { getNodesInXRegion(...) }`.
  Expected: one helper per structure kind, e.g.
  `getLoopRegions(state, loopStructure)` /
  `getSwitchRegions(state, switchStructure)`, that encapsulates "prefer zones,
  fall back to BFS."
- **Root cause:** The zones-first-class migration added the preference logic
  inline at each existing BFS call site instead of centralizing it.
- **Impact:** Six places must stay in lockstep about how a structure's regions
  are resolved; a change to fallback semantics (or to which zone roles exist)
  risks partial updates and runner/validator disagreement about region
  membership.
- **Recommendation:** Add `getSwitchRegions`/`getLoopRegions` (likely in
  `zones/` or alongside the region files) returning the two node-id sets, and
  replace all six blocks. Cost: low–medium. Benefit: one definition of "region
  membership," removes ~6 copies.

---

## MEDIUM

### ARCH-06 — Byte-identical helpers duplicated between loop and switch level-conversion

- **Severity:** MEDIUM · **Confidence:** high · **Category:** Duplication
- **Files:**
  - `src/components/molecules/LoopEditDrawer/loopLevelConversion.ts:41-59` and
    `src/components/molecules/SwitchEditDrawer/switchLevelConversion.ts:22-40`
- **Current vs expected:** `extractHandleInfo` and `extractDataTypeInfo` are
  character-for-character identical in both files, as are the `HandleInfo` and
  `NodeData` types and the `'#666666'` default-color literal. `getCommonName`
  differs only by an optional `stripZonePrefix` mapping. Expected: a shared
  `regionLevelConversion.ts` (or extend `RegionChannelEditDrawer`) exporting
  `extractHandleInfo`, `extractDataTypeInfo`, `HandleInfo`, and a
  `getCommonName(level, normalize?)` helper.
- **Root cause:** The drawers were consolidated (`RegionChannelEditDrawer`) but
  their data-extraction layer was not.
- **Impact:** Two copies of the handle/data-type extraction that must stay in
  sync (e.g., if the default color or `dataTypeObject` shape changes). Low
  runtime risk; real maintenance cost.
- **Recommendation:** Extract the shared extractors + `HandleInfo` type to one
  module imported by both conversions. Cost: low. Benefit: removes the last
  duplication the drawer consolidation left behind.

### ARCH-07 — Three divergent "is this a region data handle?" filters

- **Severity:** MEDIUM · **Confidence:** high · **Category:** Inconsistent
  patterns / divergence risk
- **Files:**
  - `src/utils/nodeRunner/executor/executionHelpers.ts:429-463` —
    `STRUCTURAL_HANDLE_TYPES` set + `getDataHandleIds` (excludes bindLoopNodes,
    loopInfer, bindSwitchNodes, switchInfer, condition; considers inferred type)
  - `src/utils/nodeStateManagement/zones/zoneLifecycle.ts:118-142` —
    `getDataHandleIdsFromNode` (excludes bindLoopNodes, loopInfer, condition,
    `noEquivalent`, `inferFromConnection`)
  - `src/utils/nodeStateManagement/nodes/switches/switchRegion.ts:15-30` —
    `isDataHandle` (keeps `switchInfer`; drops bindSwitchNodes + `noEquivalent`)
  - plus
    `src/components/molecules/SwitchEditDrawer/switchLevelConversion.ts:42-75` —
    `getDataHandles`/`isConditionHandle`
- **Current vs expected:** Four functions answer "which handles are real user
  data channels for a region," each with a _different_ exclusion set and
  different treatment of infer/`noEquivalent`. Expected: one canonical predicate
  (parameterized for loop vs switch infer types) reused by the runner, zones,
  region BFS, and the drawer.
- **Root cause:** Each subsystem (executor, zones, switch region, drawer)
  authored its own filter against the raw handle shape.
- **Impact:** The runner, the zone-membership computation, and the editor can
  disagree about which handles count as data channels — a subtle correctness
  hazard (e.g., an infer/`noEquivalent` handle counted in one place but not
  another shifts positional pairing). At minimum it is a maintenance trap.
- **Recommendation:** Define one `isRegionDataHandle(handle, { structureKind })`
  in a shared module and have all four consumers use it. Cost: medium (must
  reconcile the exclusion sets carefully and verify with tests). Benefit:
  removes a real divergence-class risk. Confidence on the _duplication_ is high;
  confidence that the differing sets currently cause a visible bug is medium
  (the structures' handle layouts may keep them aligned in practice).

### ARCH-08 — God-modules: `applyPlan.ts` (1697 lines) and `loopValidation.ts` (1214 lines)

- **Severity:** MEDIUM · **Confidence:** high · **Category:** God-module /
  maintainability
- **Files:** `src/utils/nodeStateManagement/planApply/applyPlan.ts` (1697),
  `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts` (1214),
  `src/utils/nodeStateManagement/planApply/validators.ts` (846),
  `src/components/organisms/FullGraph/FullGraph.tsx` (1073).
- **Current vs expected:** `applyPlan.ts` handles every plan kind (add node, add
  edge, group create/open/close, add loop, add switch, undo/redo, replace-state,
  …) in one file, minting ids inline for nodes/handles/loops/switches/groups.
  `loopValidation.ts` packs identification, region classification, and multiple
  delete/connection validators. The repo's own guideline (per MEMORY) is to
  extract components >150 lines; the same spirit applies to these util
  god-modules. Expected: split by plan-kind / concern (e.g.
  `applyPlan/loops.ts`, `applyPlan/groups.ts`, `applyPlan/history.ts`).
- **Root cause:** Organic growth as loop/group/switch/zone features landed
  without splitting.
- **Impact:** Hard to navigate/review; high merge-conflict surface; the single
  file is implicated in several circular-dependency chains (madge #8–#16 route
  through this area).
- **Recommendation:** Split `applyPlan.ts` into per-plan-kind submodules sharing
  a small id-minting helper; split `loopValidation.ts` into identification /
  region / deletion-guard / connection-validation. Cost: medium–high. Benefit:
  readability, reviewability, and untangling cycles. (Lower severity because it
  is not itself a behavioral bug.)

### ARCH-09 — `generateRandomString(20)` magic number scattered; constant not adopted everywhere

- **Severity:** MEDIUM · **Confidence:** high · **Category:** Magic number /
  missing single source of truth
- **Files (hardcoded `20` instead of importing `lengthOfIds`):**
  - `src/components/molecules/NodeTypeEditDrawer/InputOutputReorderSection.tsx:84`
  - `src/components/molecules/NodeTypeEditDrawer/inputOutputConversion.ts:20,23,34,81`
  - separate ad-hoc id lengths:
    `src/utils/nodeStateManagement/zones/zoneLifecycle.ts:15`
    (`ZONE_ID_LENGTH = 16`), `src/utils/nodeRunner/groupCompiler.ts:25`
    (`MAX_GROUP_DEPTH = 20`), `FullGraphNodeGroupSelector.tsx:23`
    (`generateRandomString(10)`).
- **Current vs expected:** `src/utils/nodeStateManagement/constants.ts` exists
  and documents `lengthOfIds = 20` as "the single source of truth," and the core
  minting sites (`applyPlan.ts`, `constructAndModifyNodes.ts`,
  `constructAndModifyHandles.ts`) use it. But the NodeTypeEditDrawer conversion
  code re-hardcodes the literal `20`, so the "single source of truth" is not
  actually single. (`ZONE_ID_LENGTH = 16` is a deliberately different length,
  but lives as an isolated local constant.)
- **Root cause:** Constant introduced after the drawer code; new minting sites
  kept the literal.
- **Impact:** Changing id length would not propagate to handle ids minted by the
  editor; the constant module's stated guarantee is false. Low runtime risk,
  real consistency cost.
- **Recommendation:** Import `lengthOfIds` in `InputOutputReorderSection.tsx` /
  `inputOutputConversion.ts`. Consider centralizing the other id/limit constants
  (`ZONE_ID_LENGTH`, `MAX_GROUP_DEPTH`) into the constants module for
  discoverability. Cost: trivial. Benefit: makes the single-source-of-truth
  real.

### ARCH-10 — `getAllReachableNodes` is a 4th BFS variant living next to two others

- **Severity:** MEDIUM · **Confidence:** medium · **Category:** Parallel
  implementations / consolidation candidate
- **Files:** `src/utils/nodeStateManagement/nodes/loops/loopRegion.ts:18-68`
  (`getAllReachableNodes`, plain undirected BFS, used by
  `loopValidation.ts:758,864`); compare `discoverZoneNodes.ts:116-155`
  (`isNodeReachableToBoundary`, also undirected BFS), `loopRegion.ts:83`
  (`getNodesInLoopRegion`), `switchRegion.ts:95` (`getNodesInSwitchRegion`, with
  extracted `bfsRegion`).
- **Current vs expected:** Four bidirectional/undirected graph-traversal
  routines coexist with near-identical queue/visited/`getOutgoers`+`getIncomers`
  scaffolding. `getAllReachableNodes` (full reachable set) and
  `isNodeReachableToBoundary` (early-exit when a boundary is hit) are the same
  traversal with different stop conditions; `getNodesInLoopRegion` inlines
  boundary checks while `getNodesInSwitchRegion` factored a `bfsRegion` helper.
  Expected: one small `bfsBidirectional(state, seeds, { stopAt, onVisit })`
  primitive these build on.
- **Root cause:** Each traversal was written independently as features landed;
  only switch/zone got partial factoring.
- **Impact:** Mostly maintainability — four copies of graph-walk scaffolding to
  keep correct (cycle handling, missing-node guards). The BFS-fallbacks are
  still live (used when zones are absent / during validation), so this is not
  dead code, just unconsolidated.
- **Recommendation:** Introduce a shared bidirectional-BFS primitive and express
  the four functions as thin wrappers (seed set + stop predicate + visit
  callback). Cost: medium. Benefit: removes scaffolding duplication. Confidence
  medium because the variants have genuinely different stop semantics, so the
  shared primitive must be carefully generic.

### ARCH-11 — `extractInputHandleIds` (groupCompiler) re-implements panel-flattening instead of reusing `flattenInputs`

- **Severity:** MEDIUM · **Confidence:** medium · **Category:** Duplication
- **Files:** `src/utils/nodeRunner/groupCompiler.ts:31-63`
  (`extractInputHandleIds`/`extractOutputHandleIds`) vs
  `src/utils/nodeRunner/valueStore.ts` (`flattenInputs`, imported by both
  executor blocks). The `'inputs' in item` panel check is independently re-coded
  in `applyPlan.ts:153,170,189,244`, `validators.ts:39,56`,
  `handleIterators.ts:194,271`, `handleDeletionAnalysis.ts:164,559`,
  `ConfigurableNode.tsx:608`.
- **Current vs expected:** The runner already has a canonical `flattenInputs`
  for "flatten panel inputs to leaf handles," but `groupCompiler` rolls its own
  loop over `'inputs' in item`. Expected: `extractInputHandleIds` should be
  `flattenInputs(inputs).map(h => h.id)`-style, reusing the one flattener.
- **Root cause:** No shared "flatten panels then map ids" utility; each site
  reimplements the structural panel test.
- **Impact:** If the panel representation changes (e.g., nested panels, or the
  discriminant key), every ad-hoc `'inputs' in item` site is a separate fix. The
  runner's two flatteners could drift in edge cases (empty panel, missing id).
- **Recommendation:** Reuse `flattenInputs` inside
  `groupCompiler.extractInputHandleIds`; consider exporting a tiny
  `isInputPanel(x)` guard for the many `'inputs' in x` checks. Cost: low.
  Benefit: one panel-flattening definition. (Confidence medium: many of the
  `'inputs' in item` sites are legitimately local and may not all want the
  shared guard.)

---

## LOW

### ARCH-12 — Redundant re-exports of zone helpers (3× `findZoneByStructure`, double `getZoneHandleIds`/`removeStructureZones`)

- **Severity:** LOW · **Confidence:** high · **Category:** Dead/redundant
  exports / barrel hygiene
- **Files:**
  - `findZoneByStructure` exported from `zones/types.ts:137`, re-exported by
    `zones/index.ts:10`, **and re-exported again** by
    `zones/zoneLifecycle.ts:438` (knip flags `zoneLifecycle.ts:438` and the
    barrel copy as unused).
  - `removeStructureZones` exported from both `zoneLifecycle.ts:435` and
    `zones/index.ts:19` (knip: both unused at those surfaces).
  - `getZoneHandleIds` exported from `switchRegion.ts:175` and re-exported by
    `nodes/switches/index.ts:7` (knip: barrel copy unused — the only real
    consumer, `zoneLifecycle.ts:11`, imports the direct path).
- **Current vs expected:** Functions are exported through multiple paths;
  consumers import the direct module path, leaving barrel/secondary re-exports
  unused. Expected: one canonical export site (the defining module or the
  package barrel), not both.
- **Root cause:** Barrels (`index.ts`) and `zoneLifecycle.ts` re-export for
  convenience that nobody uses.
- **Impact:** API-surface noise; knip false-positive churn; ambiguity about the
  "right" import. No runtime effect.
- **Recommendation:** Drop the redundant re-exports (especially the
  `findZoneByStructure`/`removeStructureZones` copies in
  `zoneLifecycle.ts:435-438`, which duplicate `zones/index.ts`). Cost: trivial.

### ARCH-13 — Large unused-export surface (knip: 42 exports + 77 exported types)

- **Severity:** LOW · **Confidence:** medium · **Category:** Dead code / unused
  exports
- **Files (sampling):** `nodeRunner/types.ts:932-934`
  (`executionStepRecordStatuses`, `executionRecordStatuses`, `runModes`),
  `handles/handleSetters.ts:392-393`, `handles/handleIterators.ts:407-411`,
  `ExecutionTimeline/SupportingSubcomponents/types.ts:145-224`
  (`compareByPhase`, `buildLoopSegment`, `buildSwitchSegment`),
  `ZoneFrameOverlay/convexHull.ts:64` (`convexHull`), `groupCompiler.ts:294`
  (`MAX_GROUP_DEPTH`), plus many `*Props` types exported but never imported.
- **Current vs expected:** knip reports a broad set of exports/types with no
  importers. Some are intentional public-API surface (library `index.ts`
  re-exports) or test-only; others are genuinely dead. Expected: prune or
  explicitly mark public API.
- **Root cause:** Exports added "just in case," story/test scaffolding, and
  barrel passthroughs.
- **Impact:** Larger public surface than intended, slower comprehension, and
  noise that hides truly-dead code. Confidence is medium because knip cannot
  always see Storybook/`.mdx`/test usage and some are deliberate library
  exports.
- **Recommendation:** Triage the knip list; delete clearly-dead internal exports
  (e.g. `compareByPhase`/`buildLoopSegment`/`buildSwitchSegment` if the timeline
  no longer uses them) and downgrade "just in case" `*Props` exports to local.
  Run `npm run ded` (knip) in CI to prevent regrowth. Cost: low per item; do
  incrementally.

### ARCH-14 — `NodeData` structural type re-declared in many drawer/zone modules

- **Severity:** LOW · **Confidence:** high · **Category:** Duplicated type
  definitions
- **Files:** `LoopEditDrawer.tsx:12-15`, `SwitchEditDrawer.tsx:12-15`,
  `loopLevelConversion.ts:20-23`, `switchLevelConversion.ts:17-20`, plus
  `HandleLikeForZone`/`NodeDataForZone` in `zoneLifecycle.ts:102-148`.
- **Current vs expected:** The same
  `{ inputs?: ReadonlyArray<Record<string, unknown>>; outputs?: ... }` shape is
  hand-declared in 4+ files (and a parallel `HandleLikeForZone` shape in zones).
  Expected: one shared minimal `NodeDataLike` type imported where needed.
- **Root cause:** Each module declared a local structural type to avoid
  importing the full generic `ConfigurableNodeData`.
- **Impact:** Minor maintenance cost; if the minimal shape needs a field,
  several copies change. No runtime effect.
- **Recommendation:** Export a single `NodeDataLike` (and `HandleLike`) from a
  shared types module for these consumers. Cost: trivial.

---

## Notes on things that are NOT problems (verified)

- **`RegionChannelEditDrawer` + `HandleLevelRowShell`**: genuinely good
  consolidation; loop/switch drawers are thin adapters injecting
  `renderRow`/labels (`RegionChannelEditDrawer.tsx`, `LoopEditDrawer.tsx`,
  `SwitchEditDrawer.tsx`). No duplication remains at the drawer/shell level.
- **`geometry.ts` math helper**: fully consolidated and used by
  `useClickedOutside.ts:85` only; no competing range-check implementation found.
  The "math helper" consolidation is complete.
- **`discoverZoneNodesFromHandles`**: a single unified zone-membership BFS used
  by `recomputeAllZoneMemberships`; the loop/switch region BFS functions remain
  only as documented fallbacks when zones are absent (still live, not dead).
- **`flattenInputs` (valueStore)**: correctly shared by both `executeLoopBlock`
  and `executeSwitchBlock`.
