# State management & correctness — review

## Domain summary

I reviewed the immer reducer pipeline (`mainReducer` → `validateAction` →
`applyValidatedAction`/`applyPlan`), the undo/redo history subsystem
(`applyWithHistory.ts`, `historyTypes.ts`), the zone lifecycle for
loops/switches (`zones/zoneLifecycle.ts`, `discoverZoneNodes.ts`,
`switchRegion.ts`), the connection/edge validators (`validateAddEdge.ts`,
`validators.ts`, `loopValidation.ts`), the atomic delete guard
(`canRemoveStructuredNodesAndEdges`), the runner/executor async coordination
(`useNodeRunner.ts`, `runAll.ts`, `stepByStep.ts`, `executeLoopBlock.ts`), and
import/export serialization (`stateSerializer.ts`, `serialization.ts`). The core
Plan/Apply architecture is well-built: `validateAction` is pure, id-minting is
correctly deferred into `applyPlan` inside `produce`, the store calls
`validateAction` exactly once, and the loop executor correctly checks
`abortSignal` and `await`s between phases (no tight sync loops).
`npx tsc --noEmit` passes clean. The real issues I found cluster around (a)
`REPLACE_STATE` mutating the action payload and returning a non-tracked tree
that immer then deep-freezes (freezing live shared definition objects), (b) lost
`switchRecords` on recording round-trip, (c) undo atomicity for connected-node
deletion, (d) stale closures in `useNodeRunner`, and (e) the atomic
structure-delete guard living only at the ReactFlow UI layer, not in the
reducer.

---

## HIGH

### S1 — `REPLACE_STATE` mutates the action payload and returns an immer-untracked tree that gets deep-frozen, freezing shared live `dataTypes`/`typeOfNodes` (incl. Zod schemas)

- **Severity:** HIGH · **Confidence:** medium · **Category:** immer correctness
  / shared-reference freeze
- **Files:** `src/utils/nodeStateManagement/planApply/applyPlan.ts:442-454`;
  payload source
  `src/components/organisms/FullGraph/useGraphImportExport.tsx:169-178`;
  validator `src/utils/nodeStateManagement/planApply/validators.ts:203-204`
- **Current behavior:** `applyPlan`'s `REPLACE_STATE` does:
  ```ts
  const imported = plan.state as State<...>;
  const rehydrated = rehydrateAllZones(imported);
  imported.zones = rehydrated.zones;       // mutates action.payload.state
  imported.zoneIndex = rehydrated.zoneIndex; // mutates action.payload.state
  delete imported.history;                 // mutates action.payload.state
  return imported;                          // returned from inside produce()
  ```
  `imported` is `plan.state` which is `action.payload.state` (passed straight
  through by `validateAction`). Two problems: (1) the producer **mutates the
  action payload** directly (reducer impurity — the dispatched action object is
  changed). (2) Returning `imported` from inside `produce()` makes immer use it
  as the new state and, with auto-freeze ON (never disabled — no
  `setAutoFreeze(false)` anywhere in the repo), **deep-freezes the entire
  returned tree**. The imported state is built in `useGraphImportExport` as
  `{ ...result.data, dataTypes: { ...result.data.dataTypes, ...state.dataTypes }, typeOfNodes: { ...result.data.typeOfNodes, ...state.typeOfNodes } }`.
  The _values_ of `state.dataTypes` / `state.typeOfNodes` are the **same object
  references** as the live (pre-import) state's definition objects, including
  `dataTypeObject.complexSchema` (Zod schema instances). Deep-freezing
  `imported` therefore freezes those shared live definition objects.
- **Expected behavior:** A reducer should not mutate its action payload, and
  state replacement should hand immer a tree it can own without freezing objects
  that are aliased from the previous live state.
- **Impact:** Freezing shared Zod schema instances is risky — Zod schemas keep
  internal mutable caches (`_cached`, parse memoization), and calling `.parse()`
  on a frozen schema can throw `Cannot assign to read only property`.
  Complex-type validation and the runner both exercise these schemas after an
  import. Also, any consumer using the public `mainReducer` directly and reusing
  the action payload will observe it mutated (history stripped, zones injected).
- **Repro:** Import a graph whose `dataTypes` include a `complex` type with a
  Zod `complexSchema`, then add an edge that triggers
  `enableComplexTypeChecking` parsing on that schema.
- **Evidence:** see snippet above; auto-freeze default confirmed by absence of
  any `setAutoFreeze`/`autoFreeze` call (grep returned no matches).
- **Suggested fix:** clone the imported tree before returning
  (`return structuredClone(imported)` after computing zones), or build a fresh
  object instead of mutating `plan.state`; ideally compute zones into locals and
  return a new object literal so live shared definitions are not frozen.

---

## MEDIUM

### S2 — Recording export/import silently drops all `switchRecords` (timeline data loss for switches)

- **Severity:** MEDIUM · **Confidence:** high · **Category:** serialization
  round-trip / data loss
- **Files:** `src/utils/importExport/serialization.ts:382` (serialize) and
  `:436` (deserialize); producer
  `src/utils/nodeRunner/executionRecorder.ts:586`; consumer
  `src/components/molecules/ExecutionTimeline/SupportingSubcomponents/types.ts:308`
- **Current behavior:** `serializeExecutionRecord` writes
  `switchRecords: Object.fromEntries([...(record.switchRecords ?? new Map())])`
  — it does NOT recurse through `serializeSwitchRecord` (unlike
  `loopRecords`/`groupRecords`), so nested non-JSON values are not sanitized.
  Worse, `deserializeExecutionRecord` hardcodes `switchRecords: new Map()` —
  every imported recording comes back with an **empty** switch-records map.
- **Expected behavior:** `switchRecords` are populated by
  `recorder.beginSwitchStructure(...)` (`executionRecorder.ts:586`) and consumed
  by the timeline (`ExecutionTimeline` reads `switchRecords.get(switchId)`), so
  they must survive an export→import round-trip like loop/group records do.
- **Impact:** A recording that contains switch structures, once exported and
  re-imported, loses all switch timeline grouping/inspection data. The graph
  still replays node steps, but switch branch records are gone.
- **Evidence:** `deserializeExecutionRecord` → `switchRecords: new Map(),`
  (`serialization.ts:436`); serialize side never deep-serializes them
  (`serialization.ts:382`).

### S3 — Deleting a connected node is not atomic in undo history (node removal and edge removal are separate undo entries)

- **Severity:** MEDIUM · **Confidence:** medium · **Category:** undo/redo
  correctness / atomicity
- **Files:** `src/components/organisms/FullGraph/FullGraph.tsx:659-683`
  (`onNodesChange`) and `:684-689` (`onEdgesChange`); recording logic
  `src/components/organisms/FullGraph/historyTypes.ts:113-169`
- **Current behavior:** Drags are wrapped in `BEGIN_BATCH … END_BATCH` (line
  669-682), but **deletes are not**. When a connected node is deleted, ReactFlow
  emits a node `remove` change (→ `UPDATE_NODE_BY_REACT_FLOW`, one undoable
  entry) and separately edge `remove` changes (→ `UPDATE_EDGES_BY_REACT_FLOW`, a
  second undoable entry — `hasRemovalStep` makes it undoable). These become two
  distinct `undoStack` entries.
- **Expected behavior:** A single user "delete" gesture should undo/redo as one
  step, the way drags do.
- **Impact:** One Ctrl+Z restores only the edges OR only the node, leaving a
  transiently inconsistent graph (e.g. node restored without its edges, or edges
  briefly referencing a not-yet-restored node). A second undo is required to
  fully revert. Recoverable, but the intermediate state is inconsistent and
  surprising.
- **Evidence:** `onNodesChange` only calls `BEGIN_BATCH`/`END_BATCH` for
  `position`/`dragging` changes; no batch around `remove`. `isUndoable` returns
  true for both `UPDATE_NODES_RF` with a `remove` and `UPDATE_EDGES_RF` with a
  removal step (`historyTypes.ts:119-126,167-169`).
- **Suggested fix:** when the change set contains `remove` changes, bracket the
  node+edge dispatches in `BEGIN_BATCH … END_BATCH` (e.g. via ReactFlow
  `onBeforeDelete`/`onDelete` or by detecting `remove` in `onNodesChange`).

### S4 — Stale closures in `useNodeRunner`: `finalizeRun` (and `runInstant`/`runStepByStep`/`step`/`resume`) omit `setExecutionRecord` from deps and capture a stale `onExecutionRecordChange`

- **Severity:** MEDIUM · **Confidence:** medium · **Category:** React stale
  closure
- **Files:** `src/utils/nodeRunner/useNodeRunner.ts:379-386`
  (`setExecutionRecord`), `:525-558` (`finalizeRun`, dep array `[]`), `:561-607`
  (`runInstant`), `:610-672` (`runStepByStep`); provider
  `src/components/organisms/FullGraph/FullGraph.tsx:1040-1046`
- **Current behavior:** `setExecutionRecord` is a `useCallback` with deps
  `[isControlled, onExecutionRecordChange]`, so its identity changes whenever
  the consumer's `onExecutionRecordChange` changes. But `finalizeRun` has dep
  array `[]` and closes over the **first render's** `setExecutionRecord`.
  `runInstant`/`runStepByStep`/`step`/`resume` also call
  `setExecutionRecord`/`finalizeRun` but do not list `setExecutionRecord` in
  their deps. There is no `eslint-disable` (grep found none), so these are
  genuine omissions.
- **Expected behavior:** Finalizing a run should call the _current_
  record-change callback.
- **Impact:** When the consumer passes an inline `onExecutionRecordChange` (very
  common — `FullGraph` builds `recordContextValue` from the
  `onExecutionRecordChange` prop in a `useMemo`, so an inline prop changes
  identity every parent render), a completed/loaded run notifies the **stale**
  callback. A parent whose handler closes over stale state can clobber newer
  state or drop the finalized record.
- **Evidence:**
  `finalizeRun = useCallback((record) => { … setExecutionRecord(record) … }, [])`
  (`useNodeRunner.ts:525-558`); `setExecutionRecord` deps include
  `onExecutionRecordChange` (`:379-386`).

### S5 — Atomic structure-delete guard (`canRemoveStructuredNodesAndEdges`) is enforced only at the ReactFlow UI layer, not in `validateAction`

- **Severity:** MEDIUM · **Confidence:** high · **Category:** missing reducer
  invariant
- **Files:** guard call site
  `src/components/organisms/FullGraph/FullGraph.tsx:725-742` (`onBeforeDelete`);
  guard impl
  `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts:966-1202`;
  reducer path `src/utils/nodeStateManagement/planApply/validators.ts:347-426`
  (`UPDATE_NODE_BY_REACT_FLOW`)
- **Current behavior:** The "loop triplet / switch pair must be removed
  atomically" invariant is checked only inside ReactFlow's `onBeforeDelete`. The
  reducer's `validateAction` handler for `UPDATE_NODE_BY_REACT_FLOW` checks only
  `nodeCountConstraints`; it does NOT call `canRemoveStructuredNodesAndEdges`.
  So a `{ type: 'remove', id: loopStartId }` change that removes only part of a
  loop triplet (or only one of a switch pair) — dispatched directly
  (programmatically, in tests, or by any path that bypasses `onBeforeDelete`) —
  is accepted and applied.
- **Expected behavior:** Partial structure removal should be rejected by the
  reducer itself, so the guarantee holds regardless of the dispatch source.
- **Impact:** A directly dispatched partial remove leaves a dangling loop/switch
  (e.g. `loopStop`+`loopEnd` with no `loopStart`, bind edges referencing a
  missing node, and the structure's zones orphaned).
  `getLoopStructureFromNode`/`getSwitchStructureFromNode` then return undefined
  for the survivors, breaking validation and the runner for that region.
- **Evidence:** `validateAction` `UPDATE_NODE_BY_REACT_FLOW` returns
  `ok({ kind: 'UPDATE_NODES_RF', changes })` with no structural-atomicity check
  (`validators.ts:422-425`); the only guard is the UI `onBeforeDelete`
  (`FullGraph.tsx:728`).

---

## LOW

### S6 — `history:undo` / `history:redo` / `history:cleared` events are defined but never emitted by the store

- **Severity:** LOW · **Confidence:** high · **Category:** observability gap
  (not a state bug)
- **Files:** event kinds `src/utils/nodeStateManagement/graphEvent.ts:276-289`;
  store dispatch `src/components/organisms/FullGraph/graphStore.ts:131-168`
- **Current behavior:** `graphStore.dispatch` emits only
  `deriveAppliedEvent`/`deriveRejectedEvent`. For UNDO/REDO/CLEAR_HISTORY the
  plan is `ok`, so an `action:applied` event fires, but the dedicated
  `history:undo`/`history:redo`/`history:cleared` events (with
  `entriesRemaining`) are never produced anywhere in the codebase.
- **Impact:** Telemetry/devtools subscribers that switch on
  `kind: 'history:undo'` (as the type taxonomy invites) will never receive those
  events. No state corruption — purely an unused event contract.
- **Evidence:** grep for `history:undo`/`entriesRemaining` finds only the type
  definition, no emitter.

---

## Notes / verified-NOT-bugs (paranoia trail)

- **Empty `{ handleToZone: {} }` zoneIndex right after `ADD_LOOP`/`ADD_SWITCH`**
  (`applyPlan.ts:1096,1257`): not a bug — validators use `findZoneByStructure` +
  `zone.nodeIds` (BFS), not the reverse index; docs (`zonesDoc.md:492`) confirm
  the index is rebuilt by later zone maintenance and reserved for future O(1)
  enforcement.
- **Loop executor sync-loop / pause-resume:** `executeLoopBlock` checks
  `abortSignal.aborted` before every level/iteration and `await`s
  `afterStep`/Promise.allSettled between phases — no starvation; `maxIterations`
  guard present (`executeLoopBlock.ts:335,557`).
- **Batch inverse-patch ordering** (`historyTypes.ts:279-285`): `unshift` of
  each frame's inverse patches correctly reverses inter-frame order while
  preserving intra-frame order — correct for undo.
- **`UPDATE_NODES_RF` zone cleanup** (`applyPlan.ts:523-550`): both zones of a
  deleted structure share `structureLink.structureId` and are both dropped;
  membership recompute follows. Correct (though it recomputes on every node
  change incl. pure drags — a perf cost, not a correctness bug).
- **Node removal leaving orphan edges:** ReactFlow v12 emits connected-edge
  `remove` changes alongside node removal, routed through
  `removeEdgeWithTypeChecking` (inference revert). Handled (the only gap is the
  undo-atomicity in S3).
