# Immer

## Overview

Immer is an immutable state management library that allows writing code with
direct mutation syntax while producing structurally shared, immutable state
objects. Its core API is the `produce()` function:

```
produce(currentState, (draft) => {
  // mutate draft freely - Immer produces a new immutable object
  draft.someField = newValue;
})
// returns a new state object; currentState is unchanged
```

This project uses Immer to keep the graph state mutations simple and readable.
Without Immer, every nested update (e.g., modifying a handle inside a node
inside a subtree) would require manual spread operators at every level. Immer
eliminates that boilerplate while guaranteeing immutability for React's change
detection. Immer's **patches** feature (`produceWithPatches` + `enablePatches`)
additionally powers the undo/redo history.

## How This Project Uses Immer

### `applyValidatedAction` produce() pattern (NOT inside `mainReducer`)

The single `produce()`/`produceWithPatches()` call no longer lives in
`mainReducer`. State transitions are split into a Validate → Plan → Apply
pipeline:

```
  dispatch(action)
       │
       ▼
  validateAction(state, action)  ──▶  Result<Plan, ValidationError> | null   (pure, no Immer)
       │  ok
       ▼
  applyValidatedAction(state, action, plan)        ← the ONLY produce() caller
       │
       ├─ isUndoable? ── no ──▶ produce(state, draft => applyPlan(draft, plan))
       │
       └─ isUndoable? ── yes ─▶ produceWithPatches(state, draft => applyPlan(draft, plan))
                                       │
                                       ▼  [next, patches, inversePatches]
                                 record patches in state.history (2nd produce)
```

`mainReducer` is now a thin delegator:

```typescript
function mainReducer(oldState, action) {
  const planResult = validateAction(oldState, action);
  if (planResult === null || !planResult.ok) return oldState;
  return applyValidatedAction(oldState, action, planResult.value);
}
```

`applyValidatedAction` (in `src/utils/nodeStateManagement/applyWithHistory.ts`)
owns the producer:

```typescript
enablePatches(); // called once at module load

function applyValidatedAction(state, action, plan) {
  if (!isUndoable(action, plan)) {
    // Non-undoable (SET_VIEWPORT, REPLACE_STATE, UNDO/REDO, batch ops):
    // plain produce, no patch capture.
    return produce(state, (draft) => {
      const returnValue = applyPlan(draft, plan);
      if (returnValue !== undefined) return returnValue; // replace-mode
    });
  }
  // Undoable (ADD_NODE, ADD_EDGE, position drags, ...): capture patches.
  const [next, patches, inversePatches] = produceWithPatches(state, (draft) => {
    const returnValue = applyPlan(draft, plan);
    if (returnValue !== undefined) return returnValue;
  });
  // ...filter out history-path patches, then record them in a 2nd produce
}
```

The mutation logic itself lives in `applyPlan`
(`src/utils/nodeStateManagement/planApply/applyPlan.ts`), a `switch (plan.kind)`
that mutates the draft. All id minting (`generateRandomString`) happens here,
inside the producer, so it runs exactly once per dispatch.

The draft parameter is typed `Draft<State<...>>` and re-asserted as `State<...>`
(a compile-time no-op cast — `State` has no `readonly` fields) so mutations stay
type-safe.

### Why direct mutation is safe inside produce()

Inside a `produce()` callback, Immer intercepts all property assignments using a
Proxy-based draft. The draft looks and acts like a mutable object, but Immer
tracks every change and uses it to construct a new immutable result:

```
  +------------------+
  | Original State   |  (never modified)
  +------------------+
       |
       | produce() creates
       v
  +------------------+
  | Proxy Draft      |  <-- code mutates this freely
  +------------------+
       |
       | Immer reads changes
       v
  +------------------+
  | New State        |  (structurally shared with original
  +------------------+   where no changes occurred)
```

Key guarantees:

- The original state object is never modified
- Only changed parts of the tree are copied (structural sharing)
- The returned state is deeply frozen in development mode
- React detects changes via reference equality (`oldState !== newState`)

### setCurrentNodesAndEdgesToStateWithMutatingState pattern

The function `setCurrentNodesAndEdgesToStateWithMutatingState` in
`src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` exists because
the graph has a two-level structure: root nodes/edges and subtree nodes/edges
inside node groups.

When the user is viewing the _original_ (unreferenced) node group (i.e.,
`openedNodeGroupStack` is non-empty **and** that group's subtree has
`numberOfReferences === 0`), mutations target the subtree rather than the root:

```
  State
  +-- nodes          <-- root level
  +-- edges          <-- root level
  +-- typeOfNodes
       +-- someGroup
            +-- subtree
                 +-- numberOfReferences
                 +-- nodes   <-- group level
                 +-- edges   <-- group level

  openedNodeGroupStack = []                              --> mutate root nodes/edges
  openedNodeGroupStack = [group1], references === 0      --> mutate group1's subtree
  openedNodeGroupStack = [group1], references !== 0      --> mutate root nodes/edges
```

The function routes the mutation to the correct location. Note that each of
`nodes`/`edges` is optional and only written when provided (so callers can
update just one side), and the subtree branch is gated on
`numberOfReferences === 0`:

```typescript
function setCurrentNodesAndEdgesToStateWithMutatingState(
  state,
  nodes?,
  edges?,
) {
  const topGroup = state.openedNodeGroupStack?.[last];
  const subtree = topGroup
    ? state.typeOfNodes[topGroup.nodeType].subtree
    : undefined;
  const references = subtree?.numberOfReferences;
  // Mutate root when no group is open, OR the group has no subtree, OR the
  // opened group is an *instance* (references !== 0) rather than the original.
  if (!topGroup || !subtree || references !== 0) {
    if (nodes) state.nodes = [...nodes];
    if (edges) state.edges = [...edges];
    return state;
  }
  // Original group open (references === 0): mutate the subtree.
  if (nodes) subtree.nodes = [...nodes];
  if (edges) subtree.edges = [...edges];
  return state;
}
```

This function is designed to be called **inside** an Immer producer. It directly
assigns to `state.nodes` or `subtree.nodes`, which is safe because the `state`
it receives is the Immer draft. The companion getter
`getCurrentNodesAndEdgesFromState` reads from root vs. subtree using the same
`openedNodeGroupStack`/`subtree` routing, **except** it does not gate on
`numberOfReferences` — the getter returns the subtree view whenever a group with
a subtree is open, whereas the setter falls back to root when the opened group
is an instance (`numberOfReferences !== 0`).

### Patches for Undo/Redo (`produceWithPatches` + `enablePatches`)

The undo/redo system is built entirely on Immer patches. `enablePatches()` is
called once at module load in `applyWithHistory.ts` (Immer's patch recording is
opt-in). For undoable actions, `produceWithPatches` returns the forward
`patches` and the `inversePatches` alongside the next state:

```typescript
const [next, patches, inversePatches] = produceWithPatches(state, (draft) => {
  applyPlan(draft, plan);
});
```

These are stored as a `HistoryEntry` on `state.history` (undoStack / redoStack):

```
  produceWithPatches(state, draft => applyPlan(draft, plan))
        │
        ▼  [next, patches, inversePatches]
  filterHistoryPatches(...)          ← drop patches whose path[0] === 'history'
        │                              (history must not record itself)
        ▼
  recordInHistory(draft.history, ...) ← push { patches, inversePatches, actionType, timestamp }
                                         onto undoStack, clear redoStack
```

Two Immer-specific rules apply here:

1. **History patches are filtered out** (`filterHistoryPatches`) so recording a
   change never records its own history mutation — otherwise the patch arrays
   would grow recursively. This is also why patches are recorded in a _separate_
   second `produce()` after `produceWithPatches` returns: the patches aren't
   available until the first producer finishes.

2. **Immer's `applyPatches` cannot operate on a draft.** It returns a new
   immutable object, but UNDO/REDO need to mutate the current draft in place
   (inside `applyPlan`'s producer). The project therefore uses a hand-rolled
   `applyPatchesToDraft(draft, patches)` (in `historyTypes.ts`) that walks each
   patch path and mutates the draft directly (`replace`/`add`/`remove`).
   `BEGIN_BATCH`/`END_BATCH` coalesce multiple dispatches' patches into a single
   `HistoryEntry`, `unshift`-ing inverse patches so a batch undoes in reverse.

**Source:** `src/utils/nodeStateManagement/applyWithHistory.ts`,
`src/components/organisms/FullGraph/historyTypes.ts`,
`src/utils/nodeStateManagement/planApply/applyPlan.ts` (UNDO/REDO/batch cases)

## Anti-Patterns and Limitations

### Do not return AND mutate in the same producer

Immer allows two modes inside `produce()`:

1. Mutate the draft (do not return anything)
2. Return a completely new value (do not mutate the draft)

Mixing both causes undefined behavior:

```typescript
// BAD - do not do this
produce(state, (draft) => {
  draft.nodes = [...newNodes]; // mutation
  return draft; // also returning - ambiguous!
});
```

Note: The `REPLACE_STATE` plan correctly uses the return-only pattern (its
`applyPlan` case returns the rehydrated imported state) without mutating the
draft. The `typeInference.ts` file does `return draft` after mutations - this
works because returning the draft itself is treated as a no-op by Immer, but it
is still better avoided for clarity.

### Do not use produce outside `applyValidatedAction` for state updates

All full-state transitions go through `dispatch()` → `validateAction` →
`applyValidatedAction`, which is the single `produce()`/`produceWithPatches()`
caller for the graph state. Calling `produce()` on the whole state elsewhere
would bypass the external store (`createGraphStore` / `useSyncExternalStore`)
and the undo/redo patch capture, breaking the single-source-of-truth pattern.
The exceptions are the handle setter functions and type inference utilities,
which use `produce()` to create immutable copies of sub-objects (node data,
handles) rather than the full state.

### Draft objects cannot escape the producer

Immer drafts are revoked after the producer finishes. Storing a reference to the
draft and using it later will throw:

```typescript
let savedDraft;
produce(state, (draft) => {
  savedDraft = draft; // BAD - draft revoked after produce()
});
savedDraft.nodes; // Error: cannot use a revoked proxy
```

### Do not nest produce() calls on the same state

`applyValidatedAction` already wraps `applyPlan` in `produce()` /
`produceWithPatches()`. Calling `produce()` again on the draft inside
`applyPlan` would create a nested producer, which is unnecessary overhead and
can cause confusing behavior. (The history recording is a deliberate _separate_
second `produce()` on the already-committed `next` state — not a nested one —
because patches are only available after `produceWithPatches` returns.)

## Key Patterns

### Dual-mode functions (mutate flag)

Several functions in `handleSetters.ts` and `typeInference.ts` accept a `mutate`
boolean parameter:

```
  mutate = true                    mutate = false
  (inside Immer producer)          (standalone immutable copy)
  +------------------------+       +------------------------+
  | Object.assign(handle,  |       | produce(handle, draft  |
  |   updates)             |       |   => Object.assign(    |
  | return handle           |       |     draft, updates))   |
  +------------------------+       +------------------------+
```

Functions using this pattern:

- `inferTypeOnHandleAfterConnectingWithAnotherHandle` (`typeInference.ts`)
- `inferTypeAcrossTheNodeForHandleOfDataType` (`typeInference.ts`)
- `updateHandleInNodeDataMatchingHandleId` (`handleSetters.ts`)
- `updateHandleInNodeDataUsingHandleIndices` (`handleSetters.ts`)
- `insertOrDeleteHandleInNodeDataUsingHandleIndices` (`handleSetters.ts`)

When called inside the apply producer in `applyPlan` (where the data is already
an Immer draft), `mutate=true` avoids the overhead of a nested `produce()`. When
called outside a producer, `mutate=false` uses `produce()` to return a new
immutable object.

### Structural sharing with spread

Inside the producer, the code often uses spreads like `[...nodes]` when
assigning to `state.nodes`. This creates new array references so that React's
shallow comparison detects the change. Without this, Immer might reuse the same
array reference if only elements changed, which could cause missed re-renders in
components that check array identity.

## Relationships with Project Features

### -> [State Management (applyValidatedAction)](../core/stateManagementDoc.md)

Immer is the backbone of `applyValidatedAction`. Every action dispatched flows
through the single `produce()` / `produceWithPatches()` call there. The entire
state tree (nodes, edges, typeOfNodes, openedNodeGroupStack, viewport, zones,
history) is managed immutably through Immer drafts. The recommended path uses an
external store (`createGraphStore` + `useSyncExternalStore`);
`useReducer(mainReducer, ...)` remains supported for direct consumers.

```
  React Component
       |
       | dispatch({ type: 'ADD_NODE', payload: {...} })
       v
  createGraphStore.dispatch   (or useReducer(mainReducer, ...))
       |
       v
  validateAction(state, action) --> Plan | reject | null   (pure, no Immer)
       |
       v
  applyValidatedAction(state, action, plan)
       |
       v
  produce / produceWithPatches (oldState, (draft) => applyPlan(draft, plan))
       |
       v
  new immutable state --> notifies subscribers --> re-render
```

### -> [Type Inference (immutable inference operations)](../core/typeInferenceDoc.md)

The type inference system in
`src/utils/nodeStateManagement/edges/typeInference.ts` uses Immer in
`mutate=false` mode to produce immutable copies of node data after inferring
types from connected handles. When an edge is connected, the system propagates
data type information across compatible handles - Immer ensures these inference
results are new immutable objects that can safely replace existing node data in
the state tree.

### -> [Handle Setters (dual-mode mutations)](../core/handlesDoc.md)

The handle setter utilities in
`src/utils/nodeStateManagement/handles/handleSetters.ts` use Immer for their
`mutate=false` code paths. These functions update, insert, or delete handles
within node data. When operating inside the producer (on the Immer draft passed
to `applyPlan`), they mutate directly. When operating standalone, they use
`produce()` to return clean immutable copies.
