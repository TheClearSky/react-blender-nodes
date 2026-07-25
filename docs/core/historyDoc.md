# Undo/Redo History

## Overview

The history subsystem gives `react-blender-nodes` undo and redo over graph
mutations. It is built on **Immer patches**: every undoable dispatch is run
through Immer's `produceWithPatches`, which yields the forward patches (apply on
redo) and inverse patches (apply on undo) describing the exact JSON-path-level
diff. Those patch pairs are stored in `state.history`, so undo/redo is a matter
of replaying patches rather than snapshotting whole states.

History is **not a separate store**. It lives inside `State.history` as a normal
(optional) field, and it is mutated by the same **validate → apply with history
→ apply** pipeline that owns every other action (see
[State Management](stateManagementDoc.md)). The single function
`applyValidatedAction` (`src/utils/nodeStateManagement/applyWithHistory.ts` ›
`applyValidatedAction`) owns 3-path routing:

1. **Non-undoable** actions (viewport, navigation, drawers, and the history
   actions themselves) run through a plain Immer `produce`.
2. **Undoable** actions run through `produceWithPatches`; the captured patches
   are filtered and recorded into `state.history` by a second `produce`.
3. **`UNDO` / `REDO`** are themselves non-undoable, but their `applyPlan` cases
   replay stored patches onto the draft via `applyPatchesToDraft`.

Five actions drive history directly: **`UNDO`**, **`REDO`**, **`BEGIN_BATCH`**,
**`END_BATCH`**, and **`CLEAR_HISTORY`**. A keyboard layer in `FullGraph`
(Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y) and a drag-batching layer (wrapping a
node drag in `BEGIN_BATCH … END_BATCH`) sit on top.

History is **always stripped on export** — `StateSerializer.serialize` deletes
`state.history`, and `REPLACE_STATE`'s apply deletes any incoming `history`.

Key participants:

| Participant                                  | Location                                                                                            | Role                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `State.history`                              | `src/utils/nodeStateManagement/types.ts` › `State`                                                  | Optional field: `{ undoStack, redoStack, config, activeBatch }`          |
| `HistoryEntry`                               | `src/components/organisms/FullGraph/historyTypes.ts` › `HistoryEntry`                               | One undo/redo unit: `{ patches, inversePatches, actionType, timestamp }` |
| `HistoryConfig`                              | `src/components/organisms/FullGraph/historyTypes.ts` › `HistoryConfig`                              | `{ maxSize?: number }` — cap on undo-stack length                        |
| `isUndoable`                                 | `src/components/organisms/FullGraph/historyTypes.ts` › `isUndoable`                                 | Decides whether a dispatched action creates a history entry              |
| `recordInHistory`                            | `src/components/organisms/FullGraph/historyTypes.ts` › `recordInHistory`                            | Pushes an entry (or accumulates into the active batch)                   |
| `applyPatchesToDraft`                        | `src/components/organisms/FullGraph/historyTypes.ts` › `applyPatchesToDraft`                        | Manual patch walker — replays patches on an Immer draft in place         |
| `filterHistoryPatches`                       | `src/components/organisms/FullGraph/historyTypes.ts` › `filterHistoryPatches`                       | Drops patches whose `path[0] === 'history'` (no recursive recording)     |
| `createEmptyHistory`                         | `src/components/organisms/FullGraph/historyTypes.ts` › `createEmptyHistory`                         | Default empty history object                                             |
| `applyValidatedAction`                       | `src/utils/nodeStateManagement/applyWithHistory.ts` › `applyValidatedAction`                        | 3-path routing: patch capture + history recording                        |
| `validateAction`                             | `src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`                          | UNDO/REDO cases: `NOOP` when the relevant stack is empty                 |
| `applyPlan`                                  | `src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`                                | UNDO/REDO/BEGIN_BATCH/END_BATCH/CLEAR_HISTORY mutators                   |
| `SerializedHistoryEntry` / `SerializedPatch` | `src/components/organisms/FullGraph/historyTypes.ts` › `SerializedHistoryEntry` / `SerializedPatch` | JSON-safe patch types (defined; not wired to any exporter)               |
| FullGraph history layer                      | `src/components/organisms/FullGraph/FullGraph.tsx` › `FullGraphWithReactFlowProvider`               | Keyboard shortcuts + drag batching                                       |

---

## Entity-Relationship Diagram

```
+--------------------------------------------------------------------+
|                          State<D,N,U,C>                            |
|                                                                    |
|   history? ───────────────────────────────────────────────+       |
+--------------------------------------------------------------------+
                                                             |
                                                             v
+--------------------------------------------------------------------+
|                          State.history                             |
|--------------------------------------------------------------------|
|  undoStack:  HistoryEntry[]   ── most recent at the END (push/pop) |
|  redoStack:  HistoryEntry[]   ── cleared whenever a new entry is    |
|                                  recorded                           |
|  config:     HistoryConfig    ── { maxSize?: number }              |
|  activeBatch:                                                       |
|     | null                    ── no batch in progress              |
|     | {                                                            |
|         patches:        Patch[]      (forward, appended)           |
|         inversePatches: Patch[]      (backward, UNSHIFTED)         |
|         actionTypes:    string[]     (joined with '+' at END_BATCH)|
|         startTimestamp: number       (becomes the entry timestamp) |
|       }                                                            |
+--------------------------------------------------------------------+
                                |
                                v
+--------------------------------------------------------------------+
|                           HistoryEntry                             |
|--------------------------------------------------------------------|
|  patches:        Patch[]   ── apply on REDO  (forward)             |
|  inversePatches: Patch[]   ── apply on UNDO  (backward)            |
|  actionType:     string    ── e.g. 'ADD_NODE', or                 |
|                               'UPDATE_NODE_BY_REACT_FLOW           |
|                                +UPDATE_NODE_BY_REACT_FLOW'         |
|                               for a collapsed batch                |
|  timestamp:      number    ── Date.now() (or batch.startTimestamp) |
+--------------------------------------------------------------------+
        | (each Patch is an Immer Patch)
        v
+--------------------------------------------------------------------+
|                          Patch (from immer)                        |
|  op:    'add' | 'replace' | 'remove'                              |
|  path:  (string | number)[]   ── e.g. ['nodes', 5, 'position']    |
|  value?: unknown              ── absent for 'remove'              |
+--------------------------------------------------------------------+
```

`history` is a **UI-only field** in the same sense as `activeDrawer`, `zones`,
and `zoneIndex`: it is stripped on export and never round-trips through import.
See [Serialization & history stripping](#serialization--history-stripping).

---

## Data Flow Diagram (per dispatch)

```
  dispatch(action)            ── createGraphStore.dispatch or mainReducer
         |
         v
  validateAction(state, action)
         |   (UNDO/REDO: returns NOOP rejection if the relevant stack is empty)
         |
         +-- {ok:true, value: Plan}
                  |
                  v
  applyValidatedAction(state, action, plan)
                  |
                  v
        isUndoable(action, plan)?
         |                          |
        NO (non-undoable)          YES (undoable)
         |                          |
         v                          v
  produce(state, draft =>     produceWithPatches(state, draft =>
    applyPlan(draft, plan))       applyPlan(draft, plan))
         |                          |  -> [next, patches, inversePatches]
         |                          |
         |                    next === state ? short-circuit, return state
         |                          |
         |                    filterHistoryPatches(patches)        (drop history paths)
         |                    filterHistoryPatches(inversePatches)
         |                          |
         |                    produce(next, draft => {             (SECOND produce)
         |                      draft.history ??= createEmptyHistory()
         |                      recordInHistory(draft.history, ...) })
         |                          |
         |                    activeBatch ? accumulate into batch
         |                                : push HistoryEntry, clear redoStack,
         |                                  trim to config.maxSize
         v                          v
  next state  ────────────────────────────────────────> store sets state, emits
                                                          action:applied, notifies

  ── UNDO path (non-undoable, but mutates data) ──
  applyPlan(draft, { kind:'UNDO' }):
     entry = draft.history.undoStack.pop()
     applyPatchesToDraft(draft, entry.inversePatches)   (replay in place)
     draft.history.redoStack.push(entry)

  ── REDO path ──
  applyPlan(draft, { kind:'REDO' }):
     entry = draft.history.redoStack.pop()
     applyPatchesToDraft(draft, entry.patches)
     draft.history.undoStack.push(entry)
```

---

## System Diagram

```
+──────────────────────────────────────────────────────────────────+
|                        FullGraph Component                        |
|                                                                   |
|  document keydown  (gated by enableUndoRedoShortcuts, default true)|
|    Ctrl/Cmd+Z              -> dispatch UNDO                        |
|    Ctrl/Cmd+Shift+Z        -> dispatch REDO                        |
|    Ctrl/Cmd+Y              -> dispatch REDO                        |
|                                                                   |
|  onNodesChange  (drag batching, via isDraggingRef)                |
|    first 'position' change with dragging:true  -> BEGIN_BATCH      |
|    UPDATE_NODE_BY_REACT_FLOW (always)                             |
|    'position' change with dragging:false       -> END_BATCH        |
+──────────────────────────────────────────────────────────────────+
            |                                       |
            v                                       v
+──────────────────────────────────────────────────────────────────+
|              validate → apply with history → apply                |
|                                                                   |
|  validateAction        UNDO/REDO -> NOOP when stack empty          |
|  applyValidatedAction  3-path routing (isUndoable), patch capture  |
|  applyPlan             UNDO/REDO/BEGIN_BATCH/END_BATCH/CLEAR        |
+──────────────────────────────────────────────────────────────────+

History helpers (historyTypes.ts):
  isUndoable()           -> should this action create a history entry?
  filterHistoryPatches() -> drop patches under draft.history
  recordInHistory()      -> push entry OR accumulate into activeBatch
  applyPatchesToDraft()  -> replay stored patches on the Immer draft
  createEmptyHistory()   -> { undoStack:[], redoStack:[], config:{}, activeBatch:null }
```

---

## Type Definitions

### State.history

Defined in `src/utils/nodeStateManagement/types.ts` › `State`. Optional;
`undefined` until the first history action (or until provided in the initial
state).

```ts
history?: {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  config: HistoryConfig;
  activeBatch: {
    patches: Patch[];        // forward patches accumulated this batch
    inversePatches: Patch[]; // inverse patches (prepended — see recordInHistory)
    actionTypes: string[];   // per-frame action types, joined with '+' on END_BATCH
    startTimestamp: number;  // batch start time; becomes the entry timestamp
  } | null;
};
```

### HistoryEntry

Defined in `src/components/organisms/FullGraph/historyTypes.ts` ›
`HistoryEntry`.

```ts
type HistoryEntry = {
  /** Patches to move state forward (apply on redo). */
  patches: Patch[];
  /** Patches to move state backward (apply on undo). */
  inversePatches: Patch[];
  /** The action type(s) that produced this entry, for debugging/display. */
  actionType: string;
  /** Timestamp of when this entry was created. */
  timestamp: number;
};
```

`actionType` is the dispatched action's `type` for single entries (e.g.
`'ADD_NODE'`), or `actionTypes.join('+')` for a collapsed batch (e.g.
`'UPDATE_NODE_BY_REACT_FLOW+UPDATE_NODE_BY_REACT_FLOW'`). It is for debugging/UI
labeling only (e.g. an "Undo Add Node" tooltip) and does not affect replay.

### HistoryConfig

Defined in `src/components/organisms/FullGraph/historyTypes.ts` ›
`HistoryConfig`.

```ts
type HistoryConfig = {
  /** Maximum number of undo entries. Undefined means unlimited. */
  maxSize?: number;
};
```

When `maxSize` is set, the undo stack is trimmed with `slice(-maxSize)` after
each new entry (oldest entries drop off the front). `createEmptyHistory` starts
with `config: {}` (unlimited).

### SerializedHistoryEntry / SerializedPatch

Defined in `src/components/organisms/FullGraph/historyTypes.ts` ›
`SerializedHistoryEntry` and
`src/components/organisms/FullGraph/historyTypes.ts` › `SerializedPatch`.
JSON-safe mirrors of `HistoryEntry` and `Patch`, intended for an "export with
history" feature.

```ts
type SerializedPatch = {
  op: 'replace' | 'remove' | 'add';
  path: (string | number)[];
  value?: unknown; // guaranteed JSON-serializable (Zod schemas / callbacks stripped)
};

type SerializedHistoryEntry = {
  patches: SerializedPatch[];
  inversePatches: SerializedPatch[];
  actionType: string;
  timestamp: number;
};
```

> These types and their serializers (`serializePatch` / `serializeHistoryEntry`
> in `src/utils/importExport/serialization.ts` › `serializePatch` /
> `src/utils/importExport/serialization.ts` › `serializeHistoryEntry`) exist but
> are **not wired to any exporter** — see
> [Serialization & history stripping](#serialization--history-stripping).

### The history actions and plans

The five history-driving action types live at the end of the `actionTypes` array
(`src/utils/nodeStateManagement/mainReducer.ts` › `actionTypes`, indices 18–22)
and the matching plan kinds are in `planApply/types.ts`:

| Action          | Plan type                                                                                    | Plan shape                              | Undoable? |
| --------------- | -------------------------------------------------------------------------------------------- | --------------------------------------- | --------- |
| `UNDO`          | `UndoPlan` (`src/utils/nodeStateManagement/planApply/types.ts` › `UndoPlan`)                 | `{ kind: 'UNDO'; entry: HistoryEntry }` | No        |
| `REDO`          | `RedoPlan` (`src/utils/nodeStateManagement/planApply/types.ts` › `RedoPlan`)                 | `{ kind: 'REDO'; entry: HistoryEntry }` | No        |
| `BEGIN_BATCH`   | `BeginBatchPlan` (`src/utils/nodeStateManagement/planApply/types.ts` › `BeginBatchPlan`)     | `{ kind: 'BEGIN_BATCH' }`               | No        |
| `END_BATCH`     | `EndBatchPlan` (`src/utils/nodeStateManagement/planApply/types.ts` › `EndBatchPlan`)         | `{ kind: 'END_BATCH' }`                 | No        |
| `CLEAR_HISTORY` | `ClearHistoryPlan` (`src/utils/nodeStateManagement/planApply/types.ts` › `ClearHistoryPlan`) | `{ kind: 'CLEAR_HISTORY' }`             | No        |

All five carry **no payload** when dispatched. `UndoPlan`/`RedoPlan` carry the
top-of-stack `entry` snapshot (read during validation), but note that
`applyPlan`'s UNDO/REDO cases re-`pop()` from the draft stacks rather than
consuming `plan.entry` (the field is informational/diagnostic).

---

## `isUndoable` — which actions create history

`src/components/organisms/FullGraph/historyTypes.ts` › `isUndoable`. Called by
`applyValidatedAction` to choose the routing path. Logic:

```ts
function isUndoable(action, plan): boolean {
  if (NON_UNDOABLE_PLAN_KINDS.has(plan.kind)) return false;
  if (plan.kind === 'UPDATE_NODES_RF')
    return hasNonSelectionChanges(action.payload);
  if (plan.kind === 'UPDATE_EDGES_RF') return hasRemovalStep(plan);
  return true;
}
```

### Statically non-undoable plan kinds (12)

`NON_UNDOABLE_PLAN_KINDS` (`src/components/organisms/FullGraph/historyTypes.ts`
› `NON_UNDOABLE_PLAN_KINDS`):

`SET_VIEWPORT`, `REPLACE_STATE`, `OPEN_DRAWER`, `CLOSE_DRAWER`,
`UPDATE_RUNNER_VIEW_PREFERENCE`, `OPEN_NODE_GROUP`, `CLOSE_NODE_GROUP`, `UNDO`,
`REDO`, `BEGIN_BATCH`, `END_BATCH`, `CLEAR_HISTORY`.

Viewport panning, full-state import, drawer open/close, group navigation,
runner-view-preference toggles, and the history actions themselves never produce
undo entries. (The history actions being non-undoable is what keeps UNDO/REDO
out of the history they manage.)

### Conditional: `UPDATE_NODES_RF` (`hasNonSelectionChanges`)

`src/components/organisms/FullGraph/historyTypes.ts` › `hasNonSelectionChanges`.
Undoable **only** if the action payload's `changes` array contains at least one
change of type `position` or `remove` (`UNDOABLE_NODE_CHANGE_TYPES`,
`src/components/organisms/FullGraph/historyTypes.ts` ›
`UNDOABLE_NODE_CHANGE_TYPES`). ReactFlow's internal `select`, `dimensions`,
`replace`, `add`, and `reset` changes are bookkeeping and are **excluded**, so
merely selecting a node or letting ReactFlow measure it does not pollute the
undo stack.

### Conditional: `UPDATE_EDGES_RF` (`hasRemovalStep`)

`src/components/organisms/FullGraph/historyTypes.ts` › `hasRemovalStep`.
Undoable **only** if the plan contains at least one step with
`kind === 'removal'`. A `UPDATE_EDGES_RF` plan that is entirely `passthrough`
steps (e.g. edge selection toggles) is a no-op for undo purposes.

> Edge _additions_ go through the `ADD_EDGE` plan (not `UPDATE_EDGES_RF`), which
> is not in the non-undoable set and has no conditional, so adding an edge is
> always undoable.

---

## `applyValidatedAction` — patch capture & recording

`src/utils/nodeStateManagement/applyWithHistory.ts` › `applyValidatedAction`.
The single function both `mainReducer`
(`src/utils/nodeStateManagement/mainReducer.ts` › `mainReducer`) and
`createGraphStore.dispatch` (`src/components/organisms/FullGraph/graphStore.ts`
› `createGraphStore`) call after validation, so history is handled in exactly
one place. `enablePatches()` is called once at module load
(`src/utils/nodeStateManagement/applyWithHistory.ts` › `enablePatches`) so Immer
emits patches.

### Non-undoable path

```ts
const next = produce(state, (draft) => {
  const returnValue = applyPlan(draft, plan);
  if (returnValue !== undefined) return returnValue; // e.g. REPLACE_STATE
});
return next;
```

A plain `produce`. No patch capture. `UNDO`/`REDO` mutate via
`applyPatchesToDraft` inside `applyPlan`; `BEGIN_BATCH`/`END_BATCH`/
`CLEAR_HISTORY` mutate `draft.history` directly.

### Undoable path

```ts
const [next, patches, inversePatches] = produceWithPatches(state, (draft) => {
  const returnValue = applyPlan(draft, plan);
  if (returnValue !== undefined) return returnValue;
});

if (next === state) return state; // identity short-circuit

const dataPatches = filterHistoryPatches(patches);
const dataInversePatches = filterHistoryPatches(inversePatches);

return produce(next, (draft) => {
  // SECOND produce
  if (!draft.history) draft.history = createEmptyHistory();
  recordInHistory(draft.history, dataPatches, dataInversePatches, action.type);
});
```

Three subtleties:

- **Identity short-circuit**: if `produceWithPatches` returns the same reference
  (`next === state`), nothing changed, so no entry is recorded and `state` is
  returned unchanged. The store's own `next === prev` check then suppresses the
  re-render and event.
- **`filterHistoryPatches`**
  (`src/components/organisms/FullGraph/historyTypes.ts` ›
  `filterHistoryPatches`) drops every patch whose `path[0] === 'history'`.
  Without this, recording an entry would itself appear in the next entry's
  patches — an infinite-growth feedback loop.
- **Two-step `produce`**: patches are not available until `produceWithPatches`
  _returns_, so they cannot be recorded in the same producer that generates
  them. The second `produce` writes the entry. Because it only touches
  `draft.history` (which is filtered out anyway), it does not corrupt the
  recorded patches.

---

## `recordInHistory` — push or accumulate

`src/components/organisms/FullGraph/historyTypes.ts` › `recordInHistory`.
Mutates `draft.history` with the filtered patches.

```ts
function recordInHistory(history, dataPatches, dataInversePatches, actionType) {
  if (history.activeBatch) {
    history.activeBatch.patches.push(...dataPatches);
    history.activeBatch.inversePatches.unshift(...dataInversePatches); // PREPEND
    history.activeBatch.actionTypes.push(actionType);
  } else if (dataPatches.length > 0) {
    history.undoStack.push({
      patches: dataPatches,
      inversePatches: dataInversePatches,
      actionType,
      timestamp: Date.now(),
    });
    history.redoStack = []; // clear redo
    const maxSize = history.config.maxSize;
    if (maxSize !== undefined && history.undoStack.length > maxSize) {
      history.undoStack = history.undoStack.slice(-maxSize);
    }
  }
}
```

- **Batch case** (`activeBatch != null`): forward patches are **appended**;
  inverse patches are **`unshift`ed (prepended)**; the action type is appended.
  Prepending the inverse patches is essential: when the whole batch is later
  undone, the _last_ frame's inverse must be applied _first_ to correctly walk
  the state back. For a drag that emits frames f1, f2, f3, the batch's
  `inversePatches` end up ordered `[inv(f3), inv(f2), inv(f1)]`.
- **Non-batch case**: a new `HistoryEntry` is pushed **only when there are data
  patches**, the `redoStack` is cleared (a new branch invalidates the redo
  future), and the undo stack is trimmed to `config.maxSize` if configured.

---

## `applyPatchesToDraft` — replaying patches in place

`src/components/organisms/FullGraph/historyTypes.ts` › `applyPatchesToDraft`. A
manual patch walker. Immer's built-in `applyPatches` returns a _new_ immutable
object and cannot operate on a draft proxy, so UNDO/ REDO need this in-place
variant to stay inside the surrounding `produce`.

```ts
function applyPatchesToDraft(draft, patches) {
  for (const patch of patches) {
    let target = draft;
    for (let i = 0; i < patch.path.length - 1; i++)
      target = target[patch.path[i]];
    const key = patch.path[patch.path.length - 1];
    switch (patch.op) {
      case 'replace':
        target[key] = patch.value;
        break;
      case 'add':
        Array.isArray(target)
          ? target.splice(key, 0, patch.value)
          : (target[key] = patch.value);
        break;
      case 'remove':
        Array.isArray(target) ? target.splice(key, 1) : delete target[key];
        break;
    }
  }
}
```

It navigates to the parent of the target path, then applies `op` to the final
key. Array `add`/`remove` use `splice` (insert/delete by index); object
`add`/`remove` use assignment/`delete`.

---

## UNDO / REDO

### Validation (`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`)

```ts
case actionTypesMap.UNDO: {
  const history = state.history;
  if (!history || history.undoStack.length === 0)
    return err({ code: 'NOOP', reason: 'Nothing to undo' });
  return ok({ kind: 'UNDO', entry: history.undoStack[history.undoStack.length - 1] });
}
```

`REDO` is symmetric over `redoStack`. When the relevant stack is empty (or
`history` is absent), validation returns a **`NOOP`** `ValidationError`. The
store then emits an `action:rejected` event carrying that error and leaves state
untouched; `mainReducer` simply returns `oldState`.

### Apply (`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`)

```ts
case 'UNDO': {
  if (!draft.history) return;
  const undoEntry = draft.history.undoStack.pop();
  if (!undoEntry) return;
  applyPatchesToDraft(draft, undoEntry.inversePatches);
  draft.history.redoStack.push(undoEntry);
  return;
}
case 'REDO': {
  if (!draft.history) return;
  const redoEntry = draft.history.redoStack.pop();
  if (!redoEntry) return;
  applyPatchesToDraft(draft, redoEntry.patches);
  draft.history.undoStack.push(redoEntry);
  return;
}
```

UNDO pops the newest undo entry, replays its **inverse** patches onto the draft,
and pushes the entry onto the redo stack. REDO pops the newest redo entry,
replays its **forward** patches, and pushes it back onto the undo stack. Because
these plans are non-undoable, `applyValidatedAction` runs them through a plain
`produce` and never captures patches for them — the only mutation to `history`
is the explicit stack move above.

> Note: the patch mutations under `applyPatchesToDraft` are the _data_ changes
> (e.g. node positions, edges). They are applied with Immer recording disabled
> for this plan (plain `produce`), so they never re-enter the undo stack.

---

## Batching (`BEGIN_BATCH` / `END_BATCH`)

Batching collapses several consecutive undoable dispatches into a **single**
undo entry — used so that a continuous node drag (which emits many
`UPDATE_NODE_BY_REACT_FLOW` frames) undoes in one step rather than frame by
frame.

### Apply (`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`)

```ts
case 'BEGIN_BATCH': {
  if (!draft.history) draft.history = { undoStack: [], redoStack: [], config: {}, activeBatch: null };
  if (draft.history.activeBatch) return;                 // idempotent: ignore nested begin
  draft.history.activeBatch = { patches: [], inversePatches: [], actionTypes: [], startTimestamp: Date.now() };
  return;
}
case 'END_BATCH': {
  if (!draft.history?.activeBatch) return;               // no-op if no batch open
  const batch = draft.history.activeBatch;
  draft.history.activeBatch = null;
  if (batch.patches.length === 0) return;                // empty batch -> no entry
  draft.history.undoStack.push({
    patches: batch.patches,
    inversePatches: batch.inversePatches,
    actionType: batch.actionTypes.join('+'),
    timestamp: batch.startTimestamp,
  });
  draft.history.redoStack = [];
  const maxSize = draft.history.config.maxSize;
  if (maxSize !== undefined && draft.history.undoStack.length > maxSize)
    draft.history.undoStack = draft.history.undoStack.slice(-maxSize);
  return;
}
```

While a batch is open, every undoable dispatch routes through `recordInHistory`,
which sees `activeBatch != null` and accumulates into it instead of pushing a
standalone entry. `END_BATCH` then:

- discards the batch if it captured no patches (empty drag),
- otherwise pushes one `HistoryEntry` whose `patches`/`inversePatches` are the
  accumulated buffers, whose `actionType` is the per-frame types joined with
  `'+'`, and whose `timestamp` is the **batch start** time,
- clears the redo stack and applies the `maxSize` trim (same as a normal entry).

`BEGIN_BATCH` is idempotent — a second begin while a batch is open is ignored,
so the first wins.

### Drag wiring (`src/components/organisms/FullGraph/FullGraph.tsx` › `FullGraphWithReactFlowProvider`)

`FullGraph` tracks an `isDraggingRef`. In `onNodesChange`:

```tsx
const hasDragStart = changes.some(
  (c) => c.type === 'position' && 'dragging' in c && c.dragging === true,
);
const hasDragEnd = changes.some(
  (c) => c.type === 'position' && 'dragging' in c && c.dragging === false,
);

if (hasDragStart && !isDraggingRef.current) {
  isDraggingRef.current = true;
  dispatch({ type: actionTypesMap.BEGIN_BATCH });
}
dispatch({
  type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
  payload: { changes },
});
if (hasDragEnd && isDraggingRef.current) {
  isDraggingRef.current = false;
  dispatch({ type: actionTypesMap.END_BATCH });
}
```

So one drag = `BEGIN_BATCH` (on the first `dragging:true`) → many
`UPDATE_NODE_BY_REACT_FLOW` → `END_BATCH` (on `dragging:false`) = one undo
entry. Batching is a general mechanism, though — any consumer can wrap a
sequence of undoable dispatches in `BEGIN_BATCH … END_BATCH`.

---

## `CLEAR_HISTORY`

`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`. Empties
both stacks and discards any active batch:

```ts
case 'CLEAR_HISTORY': {
  if (!draft.history) return;
  draft.history.undoStack = [];
  draft.history.redoStack = [];
  draft.history.activeBatch = null;
  return;
}
```

Validation (`src/utils/nodeStateManagement/planApply/validators.ts` ›
`validateAction`) always returns `ok({ kind: 'CLEAR_HISTORY' })`. If there is no
`history` field, apply is a no-op. Like the other history actions, it is
non-undoable (you cannot undo a clear).

---

## Keyboard shortcuts

`src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`. A document-level `keydown` listener, gated by
the `enableUndoRedoShortcuts` prop (**default `true`**,
`src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`):

| Keys                    | Action |
| ----------------------- | ------ |
| Ctrl/Cmd + Z (no Shift) | `UNDO` |
| Ctrl/Cmd + Shift + Z    | `REDO` |
| Ctrl/Cmd + Y            | `REDO` |

The handler requires a `metaKey` or `ctrlKey` modifier, lowercases `event.key`,
and calls `event.preventDefault()` before dispatching. When
`enableUndoRedoShortcuts={false}`, the listener is not registered at all
(consumers can still dispatch `UNDO`/`REDO` manually).

---

## Serialization & history stripping

History is **always stripped on export**. `StateSerializer.serialize`
(`src/utils/importExport/stateSerializer.ts` › `StateSerializer.serialize`)
deep-clones the state and deletes the UI-only fields before stripping
non-serializable handle data:

```ts
delete cloned.activeDrawer;
delete cloned.zones;
delete cloned.zoneIndex;
delete cloned.history; // history is ALWAYS stripped on export
```

On **import**, `REPLACE_STATE`'s apply
(`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`) does
`delete imported.history`, so an imported state never carries a foreign history
either. A freshly imported graph therefore starts with no undo/redo history.

### Unused serialization helpers

`serializePatch` (`src/utils/importExport/serialization.ts` › `serializePatch`)
and `serializeHistoryEntry` (`src/utils/importExport/serialization.ts` ›
`serializeHistoryEntry`) produce the JSON-safe `SerializedPatch` /
`SerializedHistoryEntry` shapes, running patch `value`s through
`safeSerializeValue` to strip Zod schemas and callbacks. They are intended for a
future "Export with History" path (referenced in the `State.history` JSDoc at
`src/utils/nodeStateManagement/types.ts` › `State`), but:

- they are **only referenced within `serialization.ts` itself** — no exporter
  calls them;
- there is **no `deserializeHistoryEntry`** counterpart;
- of the serialized types, only `SerializedHistoryEntry` is re-exported from
  `FullGraph/index.ts` (`src/components/organisms/FullGraph/index.ts` ›
  `SerializedHistoryEntry`); `SerializedPatch` is not.

Do not assume history survives a serialize → deserialize round-trip; it does
not.

---

## History events (declared, not emitted)

`src/utils/nodeStateManagement/graphEvent.ts` › `GraphEvent` declares three
history event kinds in the `GraphEvent` union:

```ts
| { kind: 'history:undo';    entriesRemaining: number }
| { kind: 'history:redo';    entriesRemaining: number }
| { kind: 'history:cleared' }
```

**These have no emitter anywhere in the codebase.** `createGraphStore.dispatch`
emits only `action:applied` and `action:rejected`
(`src/components/organisms/FullGraph/graphStore.ts` › `createGraphStore`); it
does not special-case the history actions to fire `history:*` events.
Consequently:

- an applied `UNDO`/`REDO`/`CLEAR_HISTORY` surfaces as an ordinary
  **`action:applied`** event (with `actionType` `'UNDO'` etc. and
  `detail: undefined` — `planToDetail` returns `undefined` for all history
  plans, `src/utils/nodeStateManagement/graphEvent.ts` › `planToDetail`);
- a rejected `UNDO`/`REDO` (empty stack) surfaces as an **`action:rejected`**
  event with `error.code === 'NOOP'`.

Do not rely on `history:undo` / `history:redo` / `history:cleared` firing. To
observe undo/redo today, listen for `action:applied` and inspect `actionType`,
or read `state.history.undoStack.length` / `redoStack.length` after the commit.

---

## Limitations and gotchas

1. **History is ephemeral**: it is stripped on both export and import. There is
   no persistence or round-trip; reloading a graph from JSON starts with an
   empty history.
2. **`history:*` events never fire**: they are declared in the `GraphEvent`
   union but have no emitter (see above).
3. **Selection and measurement are not undoable**: `select`, `dimensions`,
   `replace`, `add`, and `reset` node changes — and pure-`passthrough` edge
   changes — never create entries (`isUndoable` conditionals).
4. **`UndoPlan.entry` / `RedoPlan.entry` are not consumed by apply**: validation
   stores the top-of-stack entry on the plan, but `applyPlan` re-`pop()`s from
   the draft. The field is diagnostic.
5. **Drag batching depends on ReactFlow `dragging` flags**: if a drag never
   emits a `position` change with `dragging:true`/`false` (or a custom consumer
   forgets `END_BATCH`), the batch can stay open; the next undoable dispatch
   then accumulates into it rather than creating its own entry.
6. **No infer-handle rollback semantics beyond patches**: undo replays the
   recorded patches verbatim. Side effects that are themselves expressed as
   state patches (e.g. inference-driven handle duplication) are reverted by the
   patches; nothing outside the patch set is restored.
7. **`maxSize` trims silently**: when the undo stack exceeds `config.maxSize`,
   the oldest entries are dropped (`slice(-maxSize)`) with no event or warning.

---

## Examples

### Configuring history in the initial state

```tsx
import { makeStateWithAutoInfer } from 'react-blender-nodes';

const initialState = makeStateWithAutoInfer({
  dataTypes,
  typeOfNodes,
  nodes: [],
  edges: [],
  history: {
    undoStack: [],
    redoStack: [],
    config: { maxSize: 100 }, // cap undo history at 100 entries
    activeBatch: null,
  },
});
```

History is optional — omit the field entirely and it is created lazily
(unlimited) the first time an undoable action is recorded.

### Dispatching undo / redo

```tsx
import { actionTypesMap } from 'react-blender-nodes';

dispatch({ type: actionTypesMap.UNDO }); // NOOP-rejected if undoStack is empty
dispatch({ type: actionTypesMap.REDO }); // NOOP-rejected if redoStack is empty
dispatch({ type: actionTypesMap.CLEAR_HISTORY });
```

### Collapsing several mutations into one undo step

```tsx
dispatch({ type: actionTypesMap.BEGIN_BATCH });
dispatch({
  type: actionTypesMap.ADD_NODE,
  payload: { type: 'mathAdd', position: { x: 0, y: 0 } },
});
dispatch({
  type: actionTypesMap.ADD_NODE,
  payload: { type: 'mathAdd', position: { x: 200, y: 0 } },
});
dispatch({ type: actionTypesMap.END_BATCH });
// A single UNDO now removes BOTH nodes; actionType === 'ADD_NODE+ADD_NODE'.
```

### Observing undo/redo via events (today's reality)

```tsx
const { state, dispatch } = useFullGraph(initialState, {
  onGraphEvent: (event) => {
    // history:undo / history:redo are NOT emitted — narrow on action:* instead.
    if (event.kind === 'action:applied' && event.actionType === 'UNDO') {
      console.log(
        'undid; remaining undo entries:',
        state.history?.undoStack.length ?? 0,
      );
    }
    if (event.kind === 'action:rejected' && event.error.code === 'NOOP') {
      console.log('nothing to undo/redo:', event.error.reason);
    }
  },
});
```

### Enabling / disabling keyboard shortcuts

```tsx
// Shortcuts on by default:
<FullGraph state={state} dispatch={dispatch} />

// Opt out (e.g. to provide your own undo UI):
<FullGraph state={state} dispatch={dispatch} enableUndoRedoShortcuts={false} />
```

---

## Relationships with Other Features

### -> [State Management](stateManagementDoc.md)

History is a field on `State` and is recorded by the same validate →
`applyValidatedAction` → `applyPlan` pipeline that handles every other action.
`applyValidatedAction` is the only place history is read or written; both
`mainReducer` and `createGraphStore` delegate to it.

### -> [Immer](../external/immerDoc.md)

The entire subsystem is built on Immer patches. Undoable actions use
`produceWithPatches` to capture forward/inverse patches; `applyPatchesToDraft`
replays them in place (Immer's own `applyPatches` cannot mutate a draft).
`enablePatches()` is required and is called once in `applyWithHistory.ts`.

### -> [Edges](edgesDoc.md)

Edge additions (`ADD_EDGE`) are always undoable. Edge changes
(`UPDATE_EDGES_RF`) are undoable only when they contain a `removal` step; pure
selection passthroughs are skipped.

### -> [Nodes](nodesDoc.md)

Node drags emit `UPDATE_NODE_BY_REACT_FLOW` and are undoable only for `position`
/ `remove` changes. `FullGraph` wraps a whole drag in `BEGIN_BATCH … END_BATCH`
so the drag collapses into a single undo entry.

### -> [FullGraph Component](../ui/fullGraphDoc.md)

`FullGraph` hosts the two history-facing UI layers: the `keydown` shortcut
listener (gated by `enableUndoRedoShortcuts`) and the `onNodesChange` drag
batching. Both only dispatch the relevant actions; all history logic lives in
the pipeline.

### -> [Import/Export](../importExport/importExportDoc.md)

`StateSerializer.serialize` deletes `history` (along with `activeDrawer`,
`zones`, `zoneIndex`), and `REPLACE_STATE` deletes any incoming `history`. The
`serializePatch` / `serializeHistoryEntry` helpers exist for a future "export
with history" feature but are not wired to any exporter.

### -> [Graph Events](stateManagementDoc.md#graphevent-stream)

The `GraphEvent` union declares `history:undo` / `history:redo` /
`history:cleared`, but no code emits them. Applied/rejected history actions
surface through the ordinary `action:applied` / `action:rejected` events.
