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

This project uses Immer to keep the graph state reducer simple and readable.
Without Immer, every nested update (e.g., modifying a handle inside a node
inside a subtree) would require manual spread operators at every level. Immer
eliminates that boilerplate while guaranteeing immutability for React's change
detection.

## How This Project Uses Immer

### mainReducer produce() pattern

The `mainReducer` in `src/utils/nodeStateManagement/mainReducer.ts` wraps the
entire action switch in a single `produce()` call:

```
function mainReducer(oldState, action) {
  const newState = produce(oldState, (newState) => {
    switch (action.type) {
      case 'ADD_NODE':
        // direct mutation of newState is safe here
        ...
      case 'REPLACE_STATE':
        return action.payload.state;  // returning replaces entirely
    }
  });
  return newState;
}
```

Data flow through the reducer:

```
  dispatch(action)
       |
       v
  +------------------+
  |  mainReducer()   |
  +------------------+
       |
       v
  +------------------+     +-------------------+
  |  produce(old,    | --> | Immer proxy draft  |
  |    (draft) => {  |     | (looks mutable)    |
  |      switch(...) |     +-------------------+
  |    }             |              |
  |  )               |              v
  +------------------+     +-------------------+
       |                   | Immer computes    |
       v                   | structural diff   |
  new immutable state      +-------------------+
  (shared structure
   where unchanged)
```

All 11 action types (`ADD_NODE`, `UPDATE_NODE_BY_REACT_FLOW`, `SET_VIEWPORT`,
etc.) execute inside this single producer. The draft parameter is typed as
`State<...>` so all mutations remain type-safe.

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

When the user is viewing a node group (i.e., `openedNodeGroupStack` is
non-empty), mutations need to target the subtree rather than the root:

```
  State
  +-- nodes          <-- root level
  +-- edges          <-- root level
  +-- typeOfNodes
       +-- someGroup
            +-- subtree
                 +-- nodes   <-- group level
                 +-- edges   <-- group level

  openedNodeGroupStack = []        --> mutate root nodes/edges
  openedNodeGroupStack = [group1]  --> mutate group1's subtree nodes/edges
```

The function routes the mutation to the correct location:

```typescript
function setCurrentNodesAndEdgesToStateWithMutatingState(
  state,
  nodes?,
  edges?,
) {
  const topGroup = state.openedNodeGroupStack?.[last];
  if (!topGroup) {
    // No group open: mutate root
    state.nodes = [...nodes];
    state.edges = [...edges];
  } else {
    const subtree = state.typeOfNodes[topGroup.nodeType].subtree;
    // Group open: mutate subtree
    subtree.nodes = [...nodes];
    subtree.edges = [...edges];
  }
  return state;
}
```

This function is designed to be called **inside** an Immer producer. It directly
assigns to `state.nodes` or `subtree.nodes`, which is safe because the `state`
it receives is the Immer draft. The companion getter
`getCurrentNodesAndEdgesFromState` reads from the same location using identical
routing logic.

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

Note: The `REPLACE_STATE` action correctly uses the return-only pattern
(`return action.payload.state`) without mutating the draft. The
`typeInference.ts` file does `return draft` after mutations - this works because
returning the draft itself is treated as a no-op by Immer, but it is still
better avoided for clarity.

### Do not use produce outside the reducer for state updates

All state transitions should go through `mainReducer` via `dispatch()`. Using
`produce()` on state outside the reducer would create state objects that bypass
React's `useReducer` and break the single-source-of-truth pattern. The
exceptions are the handle setter functions and type inference utilities, which
use `produce()` to create immutable copies of sub-objects (node data, handles)
rather than the full state.

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

The mainReducer already wraps everything in `produce()`. Calling `produce()`
again on the draft inside the reducer callback would create a nested producer,
which is unnecessary overhead and can cause confusing behavior. The current
codebase avoids this correctly.

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

When called inside the mainReducer's producer (where the data is already an
Immer draft), `mutate=true` avoids the overhead of a nested `produce()`. When
called outside a producer, `mutate=false` uses `produce()` to return a new
immutable object.

### Structural sharing with spread

Inside the producer, the code often uses spreads like `[...nodes]` when
assigning to `state.nodes`. This creates new array references so that React's
shallow comparison detects the change. Without this, Immer might reuse the same
array reference if only elements changed, which could cause missed re-renders in
components that check array identity.

## Relationships with Project Features

### -> [State Management (mainReducer)](../core/stateManagementDoc.md)

Immer is the backbone of `mainReducer`. Every action dispatched through React's
`useReducer` flows through the single `produce()` call. The entire state tree
(nodes, edges, typeOfNodes, openedNodeGroupStack, viewport) is managed immutably
through Immer drafts.

```
  React Component
       |
       | dispatch({ type: 'ADD_NODE', payload: {...} })
       v
  useReducer(mainReducer, initialState)
       |
       v
  mainReducer(oldState, action)
       |
       v
  produce(oldState, (draft) => { ... })
       |
       v
  new immutable state --> triggers re-render
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
within node data. When operating inside the reducer (on an Immer draft), they
mutate directly. When operating standalone, they use `produce()` to return clean
immutable copies.
