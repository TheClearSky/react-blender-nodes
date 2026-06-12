# Testing Integrity & Coverage Review — react-blender-nodes

## Domain summary

The project has two test layers: a Vitest unit suite under `src/__tests__` (8
files, 110 tests, all green) and a Playwright e2e suite under `e2e/` (5 feature
projects). The unit suite has genuinely good depth in three areas —
`mainReducer` node/group/edge actions (38 tests), edge validation + cycle
detection (24 tests), and validate→apply plan round-trips (29 tests). However,
the coverage is dangerously uneven: **4 of the 8 unit-test files are pure
`typeof === 'function'` export checks** that assert nothing about behavior, and
several of the highest-risk subsystems have **no behavioral unit tests at all**
— the undo/redo history engine (`applyWithHistory.ts` + `historyTypes.ts`), the
entire `nodeRunner` compiler/executor/recorder layer (`topologicalSort`,
`loopCompiler`, `switchCompiler`, `groupCompiler`, `executionRecorder` 882 LOC),
the import/export serialization round-trip (`serialization.ts`,
`stateImport.ts`, `recordImport.ts` — the code that parses untrusted JSON), and
the zones reducer logic (loops/switches/groups discovery & lifecycle). Worst of
all, **CI runs zero tests** — both GitHub workflows only run `npm run build` /
`build-storybook`, so nothing prevents a PR that breaks the entire suite from
merging to `main` and auto-publishing to npm. While reviewing serialization I
also found a concrete latent bug that a round-trip test would have caught
immediately: `deserializeExecutionRecord` discards all `switchRecords` on
import.

---

## CRITICAL

### T1 — CI runs no tests; broken tests cannot block merge or npm publish

- **Severity:** CRITICAL **Confidence:** high **Category:** CI / test-execution
  gap
- **Files:** `.github/workflows/library-deploy.yml`,
  `.github/workflows/storybook-deploy.yml`; `package.json` (scripts `test`,
  `test:unit`, `_e2e`)
- **Current vs expected:** The only two workflows run `npm ci` then
  `npm run build` (library) and `npm run build-storybook` (storybook). Neither
  invokes `npm test`, `vitest`, or any `test:e2e:*` script. Expected: the unit
  suite (and ideally e2e) gates every PR to `main`. `library-deploy.yml` runs on
  `pull_request` to `main` and, on push to `main`, **publishes to npm**
  (`npm publish --provenance`).
- **Root cause:** Test steps were never added to the deploy pipelines; the suite
  is a local-only / manual gate.
- **Impact:** A PR that breaks every unit test (or introduces a regression the
  tests catch) still goes green and merges, and is then auto-published to npm.
  All the test investment below provides zero automated protection. This single
  gap amplifies every other finding in this report.
- **Evidence:** `library-deploy.yml` `build-library` job:
  `- name: Build Library / run: npm run build` (no test step).
  `storybook-deploy.yml`: only `npm run build-storybook`. `grep` for
  `vitest|playwright|test:` across `.github/workflows` returns nothing.

### T2 — Undo/redo history engine has zero unit and zero e2e tests

- **Severity:** CRITICAL **Confidence:** high **Category:** untested critical
  path
- **Files:** `src/utils/nodeStateManagement/applyWithHistory.ts` (whole file),
  `src/components/organisms/FullGraph/historyTypes.ts` (whole file)
- **Current vs expected:** `applyValidatedAction` is documented as "the single
  function that owns the 3-path routing" for undo/redo and is delegated to by
  both `mainReducer` and `graphStore`. `historyTypes.ts` contains the subtle
  logic: `isUndoable` (with conditional `UPDATE_NODES_RF`/`UPDATE_EDGES_RF`
  branches), `filterHistoryPatches`, `recordInHistory` (batch accumulation with
  **inverse-patch `unshift` ordering**, line 284, and `maxSize` trimming, lines
  295–298), and `applyPatchesToDraft` (a hand-rolled Immer-patch tree-walk with
  add/remove/replace on arrays vs objects). No test file imports
  `applyValidatedAction`, `recordInHistory`, `applyPatchesToDraft`,
  `isUndoable`, or `filterHistoryPatches`. Grep for
  `UNDO|REDO|undo|redo|history` across `e2e/` returns **no files**.
- **Root cause:** Subsystem was recently rebuilt (per project memory:
  "useFullGraph rebuilt: pure validateAction + createGraphStore") without
  accompanying tests.
- **Impact:** The most regression-prone state code in the app — patch capture,
  batch undo ordering, history-size capping, manual patch application — is
  completely unverified. A bug here corrupts user state on undo/redo with no
  test to catch it. The `unshift`-vs-`push` ordering in `recordInHistory` and
  the array-`splice` index handling in `applyPatchesToDraft` are exactly the
  kind of logic that silently breaks.
- **Reproduction:** N/A (gap). A unit test doing produceWithPatches →
  recordInHistory → applyPatchesToDraft(inverse) and asserting state equals the
  pre-action snapshot would directly exercise it.
- **Evidence:** `applyWithHistory.ts:121`
  `recordInHistory(d.history, dataPatches, dataInversePatches, action.type);`;
  `historyTypes.ts:284`
  `history.activeBatch.inversePatches.unshift(...dataInversePatches);`. No
  importing test found.

---

## HIGH

### T3 — Four unit-test files assert nothing but "is a function" (false confidence)

- **Severity:** HIGH **Confidence:** high **Category:** tests that assert
  nothing meaningful
- **Files:** `src/__tests__/utils/importExport/stateImport.test.ts` (1 test),
  `src/__tests__/utils/importExport/recordImport.test.ts` (1 test),
  `src/__tests__/utils/nodeStateManagement/loops.test.ts` (1 test),
  `src/__tests__/utils/nodeRunner/executor.test.ts` (export check is 1 of its 2
  tests)
- **Current vs expected:** Each of these files contains only
  `expect(typeof fn).toBe('function')`. They exercise none of the function
  bodies. Yet they produce green "✓ N tests" lines that make the modules
  _appear_ covered in the suite output (`8 passed (8) / 110 passed`). Expected:
  behavioral assertions over inputs/outputs.
- **Root cause:** Stub/placeholder tests committed as scaffolding and never
  filled in.
- **Impact:** False confidence. A reader scanning the suite sees
  `loops.test.ts`, `stateImport.test.ts`, `recordImport.test.ts` and assumes
  those modules are tested; in reality loop validation/region logic,
  untrusted-JSON state import, and execution-record import are entirely
  unverified. Any regression in those modules passes the suite.
- **Evidence:** `loops.test.ts:10-15` — the only assertions are four
  `expect(typeof ...).toBe('function')`. `stateImport.test.ts:6-7` and
  `recordImport.test.ts:6-7` are identical patterns. `grep "toBe('function')"`
  matches exactly these four files.

### T4 — `serialization.ts` Map↔Record round-trip is untested AND drops `switchRecords` on import

- **Severity:** HIGH **Confidence:** high **Category:** untested path + latent
  serialization bug
- **Files:** `src/utils/importExport/serialization.ts` (notably
  `deserializeExecutionRecord` line 436 vs `serializeExecutionRecord` line 382);
  consumer
  `src/components/molecules/ExecutionTimeline/ExecutionTimeline.tsx:109`
- **Current vs expected:** `serializeExecutionRecord` writes switch records:
  `switchRecords: Object.fromEntries([...(record.switchRecords ?? new Map())])`
  (line 382). But `deserializeExecutionRecord` **hardcodes**
  `switchRecords: new Map()` (line 436), unconditionally discarding whatever was
  exported. `ExecutionTimeline` consumes `record.switchRecords` via
  `buildSegments(...)` (line 109) to render switch segments. So a round-trip
  (export → import) of a record containing switches silently loses all switch
  timeline data. The entire recursive serializer (steps, nested loop records,
  group records, errors, patches — ~630 LOC) has **no unit test** (grep for
  `serialization|serializeExecutionRecord|deserialize` in `src/__tests__`
  returns nothing).
- **Root cause:** Deserialization for `switchRecords` was stubbed (likely
  because switch records were added after loops) and never wired; absence of any
  round-trip test let the asymmetry persist.
- **Impact:** Imported execution recordings render with switch segments
  missing/broken — a real data-loss bug on a user-facing path. More broadly, the
  whole serialize/deserialize layer (the persistence boundary) is unverified, so
  other Map-loss or value-stripping regressions would also go unnoticed.
- **Reproduction:** Build a record with one switch, `serializeExecutionRecord`
  then `deserializeExecutionRecord`; observe `result.switchRecords.size === 0`
  despite the serialized form containing the entries.
- **Evidence:** `serialization.ts:382` (serialize writes) vs
  `serialization.ts:436` `switchRecords: new Map(),` (deserialize drops);
  `ExecutionTimeline.tsx:109` `record.switchRecords,`.

### T5 — Entire nodeRunner compiler/executor/recorder layer lacks unit tests

- **Severity:** HIGH **Confidence:** high **Category:** untested critical path
- **Files (no unit test for any):** `src/utils/nodeRunner/topologicalSort.ts`,
  `loopCompiler.ts`, `switchCompiler.ts`, `switchCompilerHelpers.ts`,
  `groupCompiler.ts`, `compiler.ts`, `valueStore.ts`, `executionRecorder.ts`
  (882 LOC), `executor/executeLoopBlock.ts`, `executor/executeSwitchBlock.ts`,
  `executor/executeGroupScope.ts`
- **Current vs expected:** The only runner unit test, `executor.test.ts`, has 2
  tests: one export check and one minimal 2-node error-propagation path (A
  throws → B skipped). `topologicalSortWithLevels` is pure, deterministic, and
  trivially unit-testable (it even throws on cycles, line 77–81) yet has no
  direct test — it is exercised only indirectly through Playwright.
  `executionRecorder.ts` (the recording engine that produces every
  `ExecutionRecord` the timeline renders) is 882 lines with no unit test.
- **Root cause:** Runner correctness was validated through e2e/manual runner UI
  rather than unit tests.
- **Impact:** Execution ordering, concurrency-level computation, cycle
  detection, loop/switch/group compilation, value propagation, and record
  construction all depend solely on e2e — which (per T1) is not in CI and (per
  T6/T7) is flaky in spots. A regression in topo-sort levels or recorder output
  would not be caught by any fast, deterministic test.
- **Evidence:** `executor.test.ts` total = 2 `it()` blocks;
  `topologicalSort.ts:77`
  `throw new Error('Topological sort detected cycle ...')` (untested branch);
  `grep topologicalSort|valueStore|loopCompiler|executionRecorder` in
  `src/__tests__` returns nothing.

### T6 — Zones reducer logic (loops/switches/groups) has no unit tests; only e2e covers it

- **Severity:** HIGH **Confidence:** high **Category:** untested critical path
- **Files (no unit test for any):**
  `src/utils/nodeStateManagement/zones/discoverZoneNodes.ts`,
  `zones/zoneLifecycle.ts`, `nodes/switches/switchRegion.ts`,
  `nodes/switches/switchValidation.ts`, `nodes/switches/switchStructure.ts`,
  `nodes/loops/loopValidation.ts`, `nodes/loops/loopRegion.ts`; reducer actions
  `ADD_LOOP`/`ADD_SWITCH`/zone deletion guards
- **Current vs expected:** `mainReducer.test.ts` and `planApply.test.ts` cover
  ADD_NODE/edge/group/viewport/UPDATE_NODE_TYPE, but **never** dispatch a
  loop/switch action or assert zone discovery/lifecycle/region-crossing
  validation. `loops.test.ts` is export-only (T3). All zone behavior is verified
  only by the Playwright `loops` and `nodeGroups` projects (e.g.
  `constructionMatrix.spec.ts`). Per project memory, zones are "action-created
  (not derived)" and are a recently-added, intricate subsystem.
- **Root cause:** Zone validation is complex and was driven by e2e matrices; the
  reducer-level units were not added.
- **Impact:** The validators that decide whether an edge crosses loop/switch
  regions, whether a structured pair can be deleted, and how zone membership is
  discovered are unverified by any fast test. Given T1 (e2e not in CI), these
  paths effectively have no automated regression protection at all.
- **Evidence:**
  `grep "discoverZoneNodes|zoneLifecycle|switchRegion|ADD_LOOP|ADD_SWITCH"` in
  `src/__tests__` returns nothing; zone coverage lives only in
  `e2e/tests/loops/**` and `e2e/tests/nodeGroups/**`.

### T7 — `switchExecution.spec.ts` SE3 is flaky-by-construction (hard 3 s sleep + terminal-state assert) despite an auto-retrying helper existing

- **Severity:** HIGH **Confidence:** high **Category:** flaky e2e (timing
  assumption)
- **Files:** `e2e/tests/nodeGroups/switchExecution.spec.ts:209-233`; correct
  pattern in `e2e/actions/runnerPanel/runnerPanel.actions.ts:81-87`
  (`waitForRunnerState`)
- **Current vs expected:** SE3 does
  `await clickRun(page); await page.waitForTimeout(3000); const runnerState = ... textContent(); expect(runnerState).toBe('Completed');`.
  This reads the state label exactly once after a fixed 3 s. The codebase
  already provides `waitForRunnerState(page, 'Completed')` which polls via
  auto-retrying
  `expect(...).toHaveText(expected, { timeout: T_RUNNER_COMPLETION=30000 })` —
  and SC1 in the sibling `switchCondition.spec.ts:97` uses it correctly. The
  `nodeGroups` project runs with `workers: 8` (playwright.config.ts) where CPU
  contention can push run completion past 3 s.
- **Root cause:** Hand-rolled fixed-delay wait left in place instead of the
  shared poll helper.
- **Impact:** Non-deterministic failures under parallel load: if the run isn't
  terminal at exactly 3 s, the single read returns `Compiling`/`Running` and the
  test fails spuriously; conversely it wastes ~3 s when the run finishes early.
  The test is also cluttered with debug `console.log` of console messages (lines
  153–231), indicating it was left in a debugging state.
- **Reproduction:** Run `nodeGroups` project headless with high worker count /
  loaded CPU; SE3 intermittently reads a non-`Completed` label.
- **Evidence:** `switchExecution.spec.ts:209-233`; contrast
  `runnerPanel.actions.ts:86`
  `await expect(getRunnerStateLabel(page)).toHaveText(expected, { timeout });`.

---

## MEDIUM

### T8 — `stateImport.ts` repair/rehydration logic is entirely untested (untrusted-JSON boundary)

- **Severity:** MEDIUM **Confidence:** high **Category:** untested path
  (overlaps T3, called out for risk)
- **Files:** `src/utils/importExport/stateImport.ts` (whole file, ~347 LOC); its
  only test is export-only.
- **Current vs expected:** `importGraphState` parses arbitrary JSON and runs
  structural validation, four repair strategies (`removeDuplicateNodeIds`,
  `removeDuplicateEdgeIds`, `removeOrphanEdges`, `fillMissingDefaults`),
  complexSchema rehydration, handle `dataTypeObject` rehydration, and
  subtree-node rehydration — then a post-repair `remainingErrors` filter that
  matches on error **message substrings** (`'Duplicate node ID'`, `'not found'`,
  etc., lines 295–311). None of this is exercised. The message-substring
  matching (line 300/307) is fragile: if a validation message text changes,
  repaired errors stop being filtered and import fails — with no test to catch
  it.
- **Root cause:** Placeholder export-only test never replaced.
- **Impact:** The function most exposed to malformed/hostile input has no
  behavioral coverage. Repair correctness, rehydration correctness, and the
  brittle error-message coupling are unverified.
- **Evidence:** `stateImport.ts:300`
  `if (... e.message.includes('Duplicate node ID')) return false;`;
  `stateImport.test.ts` asserts only `typeof importGraphState === 'function'`.

### T9 — `recordImport.ts` has a dead/no-op repair branch and no behavioral test

- **Severity:** MEDIUM **Confidence:** high **Category:** untested path +
  misleading no-op code
- **Files:** `src/utils/importExport/recordImport.ts:120-124` (and whole-file
  lack of test)
- **Current vs expected:** `importExecutionRecord` advertises a
  `sanitizeNonSerializableValues` repair strategy, but its implementation is an
  empty block with a comment: "Values are already JSON ... so non-serializable
  values can't actually exist here. This repair is more about ensuring
  consistency." So enabling the strategy does nothing, yet it counts toward
  `hasRepairStrategies` (line 71) and thus changes control flow (it lets
  structurally-invalid records bypass the early `errors.length > 0` return). The
  `removeOrphanSteps` repair and `deserializeExecutionRecord` call are also
  untested (export-only test).
- **Root cause:** A repair option retained for API symmetry with no
  implementation; no tests assert its (non-)effect.
- **Impact:** Callers may believe enabling `sanitizeNonSerializableValues`
  cleans data when it does nothing — and as a side effect it suppresses the
  no-repair early-exit. Behavior of the import path is unverified.
- **Evidence:** `recordImport.ts:120-124` empty
  `if (repair.sanitizeNonSerializableValues && ...) { /* comment only */ }`;
  `recordImport.test.ts` asserts only the export.

### T10 — `switchCondition.spec.ts` SC2 uses fixed sleeps to assert a non-event (deletion blocked)

- **Severity:** MEDIUM **Confidence:** medium **Category:** flaky e2e (timing
  assumption)
- **Files:** `e2e/tests/nodeGroups/switchCondition.spec.ts:110-123`
- **Current vs expected:** SC2 selects the bind edge,
  `await page.waitForTimeout(200)`, presses Backspace,
  `await page.waitForTimeout(500)`, then asserts the edge/nodes still exist.
  Asserting that _nothing_ happened (deletion was blocked) via fixed sleeps is
  inherently fragile: the 500 ms is a guess at how long a delete attempt would
  take to (not) mutate state. The repo provides
  `captureNextEvent`/`ui:delete:attempted` event hooks
  (`e2e/actions/events/events.actions.ts`) designed precisely to await the
  delete-attempt outcome deterministically rather than sleeping.
- **Root cause:** Fixed-delay waits instead of the event-driven delete-attempt
  signal.
- **Impact:** Under load the 500 ms may elapse before the (blocked) delete is
  processed, or the select may not have registered after 200 ms, producing flaky
  pass/fail. Confidence is medium because the final assertions are auto-retrying
  `toHaveCount`, which mitigates—but the gating sleeps still introduce
  nondeterminism in _when_ the assertion runs.
- **Evidence:** `switchCondition.spec.ts:113` `await page.waitForTimeout(200);`
  and `:117`
  `await page.keyboard.press('Backspace'); await page.waitForTimeout(500);`.

---

## Notes / things checked that are NOT issues

- The existing `mainReducer.test.ts` (38), `edgeValidation.test.ts` (24),
  `planApply.test.ts` (29), and `nodeCountConstraints.test.ts` (14) are
  substantive, behavioral, and well-targeted (validator purity, trial-rollback,
  3-tier UPDATE_NODE_TYPE propagation, cycle detection). No false-confidence
  problem there.
- The e2e event-stream infra (`events.actions.ts`
  `captureEventsAround`/`captureNextEvent`, ring-buffered `e2e-event-log`) is
  well-designed and mostly avoids arbitrary sleeps; the `describe.serial` blocks
  (`eventStream`, `constructionMatrix`, `deletionMatrix`, `complexTopologies`)
  re-`navigateToStory` per test, so they are not sharing mutable cross-test
  state — `.serial` is for worker-contention/timeout budgeting, which is
  acceptable, not a correctness bug.
- The `T_REDUCER_TICK = 100` settle in drag/keyboard actions is a documented
  floor before auto-retrying assertions, not a hard upper bound; lower risk than
  the runner-completion sleeps above.
- Unit suite is currently green (`110 passed (8 files)`), confirmed by running
  `npx vitest run`.
