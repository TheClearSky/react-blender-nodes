# Edges

## Overview

Edges are the connections between node handles in the react-blender-nodes graph
editor. They represent directed data flow from an output handle on a source node
to an input handle on a target node. Every edge in the system uses the
`configurableEdge` type and is rendered by the `ConfigurableEdge` component with
gradient colors derived from the connected handles.

Edge mutations flow through the pure **validate -> plan -> apply** pipeline that
backs the whole state engine:

1. `validateAction(state, action)`
   (`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`)
   inspects the action against the immutable, scoped state and returns a
   `Result<Plan, ValidationError>` — for edge addition it delegates to
   `validateAddEdge`. Validation is **pure**: it never mutates, never mints ids,
   and is safe to replay.
2. `applyValidatedAction(state, action, plan)`
   (`src/utils/nodeStateManagement/applyWithHistory.ts` ›
   `applyValidatedAction`) runs `applyPlan` inside Immer's `produce` /
   `produceWithPatches` and records undo history into `state.history`. It does
   **not** emit events — observability events are emitted by the caller
   (`graphStore.dispatch`) after the apply commits, via `deriveAppliedEvent` /
   `deriveRejectedEvent`.
3. `applyPlan` (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
   `applyPlan`) is the only place that mints edge/node ids (via
   `generateRandomString`), constructs the edge object, applies inference
   replacements, duplicates handles, and recomputes zones.

The edge system is responsible for:

- **Adding edges** through `validateAddEdge`: missing-endpoint checks, cycle
  detection, duplicate rejection, loop validation, switch validation, a dry-run
  type-inference plan, complex-type checking, and type-conversion checking — all
  run against a scoped, projected view of the state.
- **Removing edges** through `removeEdgeWithTypeChecking` (pure), packaged into
  the `UPDATE_EDGES_RF` plan, with type-inference rollback when
  `inferFromConnection` handles lose all connections.
- **Rendering edges** as bezier curves with gradient colors, viewport-aware
  optimization, and runner value pills.
- **Compiling edges** into `inputResolutionMap` and `outputDistributionMap` for
  the runner's execution plan.

Edges are stored as a flat array in `state.edges` (or within a node group's
`subtree.edges` when inside a group). The `getCurrentNodesAndEdgesFromState`
utility resolves which nodes/edges/zones are currently visible based on the
`openedNodeGroupStack`.

> **Legacy note.** A previous mutating orchestrator, `addEdgeWithTypeChecking`
> (`src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
> `addEdgeWithTypeChecking`), is still exported but is now only referenced by
> tests (`edgeValidation.test.ts`). Production no longer calls it — the active
> addition path is `validateAddEdge` + `applyPlan`. Do not document
> `addEdgeWithTypeChecking` as the live path.

## Entity-Relationship Diagram

```
+------------------+        +------------------+        +------------------+
|    Node          |        |     Edge         |        |    Handle        |
|------------------|        |------------------|        |------------------|
| id: string       |<-------| source: string   |        | id: string       |
| data: NodeData   |   1..* | target: string   | *..1   | dataType         |
| position         |        | sourceHandle: str |------->| inferredDataType |
+------------------+        | targetHandle: str |        | handleColor      |
                            | type: 'config...'|        | name: string     |
                            | id: string       |        +------------------+
                            +------------------+
                                    |
                                    | rendered by
                                    v
                            +--------------------+
                            | ConfigurableEdge   |
                            |--------------------|
                            | gradient colors    |
                            | bezier path        |
                            | viewport clipping  |
                            | runner value pill   |
                            +--------------------+
```

Relationships:

- An **Edge** connects exactly one source Node to one target Node
- An **Edge** references exactly one source Handle and one target Handle
- A **Node** can have 0..\* outgoing and 0..\* incoming edges
- A **Handle** can have 0..\* edges connected (fan-in on inputs, fan-out on
  outputs)

## Functional Dependency Diagram

```
+-----------------------------------------------------------------------+
|                        Edge Operations                                 |
+-----------------------------------------------------------------------+
|                                                                       |
|  validateAddEdge()                  (planApply/validateAddEdge.ts)     |
|    |-- willAddingEdgeCreateCycle()   (constructAndModifyHandles.ts)    |
|    |-- addEdge() dup check           (@xyflow/react)                  |
|    |-- isLoopConnectionValid()       (nodes/loops/loopValidation.ts)   |
|    |-- isSwitchConnectionValid()     (nodes/switches/switchValidation) |
|    |-- planInferenceForEdgeAddition()(planApply/planInference.ts)      |
|    |     '-- inferTypeAcrossTheNodeForHandleOfDataType(mutate=false)   |
|    |-- applyInferencePlanToProjection()                               |
|    |-- checkComplexTypeCompatibilityAfterEdgeAddition()               |
|    |     '-- getResultantDataTypeOfHandleConsideringInferredType()    |
|    '-- checkTypeConversionCompatibilityAfterEdgeAddition()            |
|          '-- getResultantDataTypeOfHandleConsideringInferredType()    |
|       => returns Result<AddEdgePlan, ValidationError>                 |
|                                                                       |
|  applyPlan(ADD_EDGE)                 (planApply/applyPlan.ts)          |
|    |-- mint edge id (generateRandomString)                           |
|    |-- cloneDeepPreservingNonPlain replacements into draft            |
|    |-- ensureAllHandleNamesUnique()                                   |
|    |-- addDuplicateHandlesToLoopNodesAfterInference()                 |
|    |-- addDuplicateHandlesToSwitchNodesAfterInference()               |
|    |-- applySwitchZonePrefixesOnDraft()                              |
|    |-- growSpareAndPropagateBoundaryHandle()                          |
|    |-- finalView.edges.push(newEdge)                                  |
|    '-- recomputeAllZoneMemberships()                                  |
|                                                                       |
|  removeEdgeWithTypeChecking()        (constructAndModifyHandles.ts)    |
|    '-- inferTypesAfterEdgeRemoval()  (newOrRemovedEdgeValidation.ts)   |
|          |-- getConnectedEdges()       (@xyflow/react)                |
|          |-- getAllHandlesFromNodeData()                               |
|          '-- inferTypeAcrossTheNodeForHandleOfDataType()              |
|       => packaged as EdgeChangeStep in UPDATE_EDGES_RF plan          |
|                                                                       |
+-----------------------------------------------------------------------+
```

## Data Flow Diagram

### Edge Addition Flow

```
User drags connection between handles
            |
            v
ReactFlow fires onConnect(connection)
            |
            v
FullGraph dispatches ADD_EDGE_BY_REACT_FLOW (via graphStore.dispatch)
            |
            v
validateAction() -> validateAddEdge(state, action)        [PURE]
            |
            +-----> 1. Null checks on source/target/sourceHandle/targetHandle
            |              -> err MISSING_ENDPOINT
            |
            +-----> 2. [enableCycleChecking?] willAddingEdgeCreateCycle()
            |              on the SCOPED view (current group's nodes/edges)
            |              -> err CYCLE_DETECTED
            |
            +-----> 3. getCurrentNodesAndEdgesFromState() -> scoped view
            |
            +-----> 4. Duplicate check via ReactFlow addEdge()
            |              -> err DUPLICATE_EDGE
            |
            +-----> 5. Build placeholder edge ({id:'__pending__', ...})
            |
            +-----> 6. Find node indices + handle indices
            |              (getHandleFromNodeDataMatchingHandleId)
            |              -> err MISSING_ENDPOINT if not found
            |
            +-----> 7. isLoopConnectionValid(viewScopedState, ...)
            |              -> err LOOP_PATH_INVALID
            |
            +-----> 7b. isSwitchConnectionValid(viewScopedState, ...)
            |              -> err SWITCH_PATH_INVALID
            |
            +-----> 8. [no validation flags?] return ok(AddEdgePlan)
            |              with empty inference + handleInsertions
            |
            +-----> 9. [enableTypeInference?] planInferenceForEdgeAddition()
            |              dry-run (mutate=false) building an InferencePlan
            |              of nodeDataReplacements (accumulated in a Map so
            |              successive inferences see prior results)
            |              -> err TYPE_INFERENCE_FAILED
            |
            +-----> 10. applyInferencePlanToProjection() -> shallow projection
            |
            +-----> 11. [enableComplexTypeChecking?]
            |              checkComplexTypeCompatibilityAfterEdgeAddition()
            |              against the PROJECTED post-inference state
            |              -> err COMPLEX_TYPE_MISMATCH
            |
            +-----> 12. [allowedConversionsBetweenDataTypes?]
            |              checkTypeConversionCompatibilityAfterEdgeAddition()
            |              against the PROJECTED state
            |              -> err CONVERSION_NOT_ALLOWED
            |
            v
       ok({ kind:'ADD_EDGE', connection, inference, handleInsertions:[] })
            |
            v
applyValidatedAction() -> produceWithPatches(state, draft => applyPlan(draft, plan))
            |
            +-----> mint edge id (generateRandomString(20))
            +-----> cloneDeepPreservingNonPlain each inference replacement into the draft
            +-----> ensureAllHandleNamesUnique() per replaced node
            +-----> addDuplicateHandlesToLoopNodesAfterInference()
            +-----> addDuplicateHandlesToSwitchNodesAfterInference()
            +-----> applySwitchZonePrefixesOnDraft() (True:/False: prefixes)
            +-----> growSpareAndPropagateBoundaryHandle() (if in group)
            +-----> finalView.edges.push(newEdge)
            '-----> recomputeAllZoneMemberships() (if any zones exist)
            |
            v
   applyValidatedAction records undo patches in state.history;
   then graphStore.dispatch emits action:applied (diff-derived edgeId)
```

### Edge Removal Flow

```
User presses Delete/Backspace/x on selected edge
            |
            v
onBeforeDelete -> canRemoveLoopNodesAndEdges() guard (FullGraph)
            |   (blocks partial deletion of loop triplets / switch pairs and
            |    disconnection of bind edges; rejected here never dispatches)
            v
ReactFlow fires onEdgesChange(changes)
            |
            v
FullGraph dispatches UPDATE_EDGES_BY_REACT_FLOW
            |
            v
validateAction() -> UPDATE_EDGES_RF case                  [PURE]
            |
            +-----> For each change:
            |
            |       change.type !== 'remove'?
            |          -> step { kind:'passthrough', change }
            |
            |       remove (edge found?):
            |          -> removeEdgeWithTypeChecking(edge, scopedState, change)
            |             returns { updatedNodes, updatedEdges, validation }
            |             (PURE; runs inferTypesAfterEdgeRemoval if
            |              enableTypeInference)
            |          -> step { kind:'removal', updatedNodes, updatedEdges,
            |                    validation }
            |
            v
       ok({ kind:'UPDATE_EDGES_RF', steps })
            |
            v
applyPlan(UPDATE_EDGES_RF):
            +-----> passthrough  -> applyEdgeChanges([change], view.edges)
            +-----> removal (validation.isValid) -> write updatedNodes/Edges
            '-----> recomputeAllZoneMemberships() (if any zones exist)
```

## System Diagram

```
+------------------------------------------------------------------+
|                        FullGraph.tsx                               |
|                                                                   |
|   onConnect ---------> dispatch(ADD_EDGE_BY_REACT_FLOW)          |
|   onEdgesChange -----> dispatch(UPDATE_EDGES_BY_REACT_FLOW)      |
|   onBeforeDelete ----> canRemoveLoopNodesAndEdges() guard        |
|                                                                   |
|   dispatch is graphStore.dispatch (Redux-style external store,    |
|   read via useSyncExternalStore in useFullGraph)                  |
+-----+----------------------------+-------------------------------+
      |                            |
      v                            v
+-----+---------------+   +--------+------------+
| graphStore.dispatch |   | ConfigurableEdge    |
|  validateAction()   |   | (rendering)         |
|  applyValidatedAct. |   |                     |
|  deriveAppliedEvent |   | - getBezierPath()   |
+-----+---------------+   | - gradient colors   |
      |                   | - viewport observer |
      v                   | - runner value pill |
+-----+----------------+  | - BaseEdge render   |
| planApply/           |  +---------------------+
|  validators.ts       |
|   validateAction()   |
|     ADD_EDGE ->       |
|       validateAddEdge |
|     UPDATE_EDGES_RF ->|
|       removeEdgeWith  |
|        TypeChecking() |
|  applyPlan.ts        |
|   applyPlan(plan)    |
+-----+----------------+
      |
      v (at runtime)
+-----+-------------------------------+
| nodeRunner/compiler.ts              |
|                                     |
| edges --> inputResolutionMap        |
|       --> outputDistributionMap     |
|                                     |
| (skips bindLoopNodes &              |
|  bindSwitchNodes structural edges)  |
+-------------------------------------+
```

## Type Definitions

### Edges

```typescript
// `src/components/organisms/FullGraph/types.ts` › `Edges`
type Edges = ConfigurableEdgeState[];
```

All edges in the graph are stored as an array of `ConfigurableEdgeState`.

### ConfigurableEdgeState / ConfigurableEdgeData

```typescript
// `src/components/atoms/ConfigurableEdge/ConfigurableEdge.tsx` › `ConfigurableEdgeData`
type ConfigurableEdgeData = { order?: number } & Record<string, unknown>;

// `src/components/atoms/ConfigurableEdge/ConfigurableEdge.tsx` › `ConfigurableEdgeState`
type ConfigurableEdgeState = Edge<ConfigurableEdgeData, 'configurableEdge'>;
```

A ReactFlow `Edge` whose `data` is `ConfigurableEdgeData` and whose type
discriminator is `'configurableEdge'`. Every edge in the system uses this type.
`data.order` is the **only** field the library persists on an edge — a
connection's rank within its target input handle's fan-in group (see
[Connection ordering](#connection-ordering-fan-in)); it is absent on edges that
have never been reordered. The key fields inherited from ReactFlow's `Edge`:

| Field          | Type      | Description                                |
| -------------- | --------- | ------------------------------------------ |
| `id`           | `string`  | Unique edge identifier (20-char random)    |
| `source`       | `string`  | Source node ID                             |
| `target`       | `string`  | Target node ID                             |
| `sourceHandle` | `string`  | Source handle ID                           |
| `targetHandle` | `string`  | Target handle ID                           |
| `type`         | `string`  | Always `'configurableEdge'`                |
| `data.order`   | `number?` | Fan-in rank within the target input handle |

### EdgeChanges

```typescript
// `src/components/organisms/FullGraph/types.ts` › `EdgeChanges`
type EdgeChanges = EdgeChange<ConfigurableEdgeState>[];
```

ReactFlow's edge change events, typed to `ConfigurableEdgeState`.

### AddEdgePlan

```typescript
// `src/utils/nodeStateManagement/planApply/types.ts` › `AddEdgePlan`
type AddEdgePlan = {
  kind: 'ADD_EDGE';
  connection: {
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  };
  inference: InferencePlan; // { nodeDataReplacements: { nodeId, newData }[] }
  handleInsertions: HandleInsertion[]; // always [] — duplication runs in applyPlan
};
```

The pure-intent result of a successful `validateAddEdge`. The edge **id** and
the constructed edge object are deferred to `applyPlan`; only the validated
`connection`, the pre-computed inference replacements (which carry existing node
ids, so they stay deterministic), and `handleInsertions` (empty) are carried.

### UpdateEdgesByReactFlowPlan / EdgeChangeStep

```typescript
// `src/utils/nodeStateManagement/planApply/types.ts` › `EdgeChangeStep` / `UpdateEdgesByReactFlowPlan`
type EdgeChangeStep =
  | { kind: 'passthrough'; change: unknown }
  | {
      kind: 'removal';
      updatedNodes: unknown;
      updatedEdges: unknown;
      validation: { isValid: boolean };
    };

type UpdateEdgesByReactFlowPlan = {
  kind: 'UPDATE_EDGES_RF';
  steps: EdgeChangeStep[];
};
```

Each ReactFlow edge change is packaged as a step. Non-`remove` changes are
`passthrough` (re-run through `applyEdgeChanges`); `remove` changes carry the
pre-computed `updatedNodes`/`updatedEdges` from `removeEdgeWithTypeChecking`.

### ValidationError (edge-relevant codes)

```typescript
// `src/utils/nodeStateManagement/planApply/types.ts` › `ValidationError`
type ValidationError =
  | { code: 'DUPLICATE_EDGE'; sourceHandle: string; targetHandle: string }
  | { code: 'CYCLE_DETECTED'; sourceNodeId: string; targetNodeId: string }
  | {
      code: 'MISSING_ENDPOINT';
      which: 'source' | 'target' | 'sourceHandle' | 'targetHandle';
      detail: string;
    }
  | { code: 'LOOP_PATH_INVALID'; reason: string }
  | { code: 'SWITCH_PATH_INVALID'; reason: string }
  | { code: 'TYPE_INFERENCE_FAILED'; reason: string }
  | {
      code: 'COMPLEX_TYPE_MISMATCH';
      sourceTypeId: string;
      targetTypeId: string;
    }
  | { code: 'CONVERSION_NOT_ALLOWED'; from: string; to: string };
// ...plus NODE_TYPE_NOT_FOUND, INVALID_NODE_GROUP, EMPTY_STACK,
//         NODE_COUNT_CONSTRAINT_VIOLATED, NOOP (non-edge actions)
```

Edge rejection now returns a **machine-readable code** (not a free-text string).
A rejected dispatch emits an `action:rejected` graph event carrying this
`ValidationError`, so consumers can `switch` on `.code`.

### ConnectionValidationResult

```typescript
// `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` › `ConnectionValidationResult`
type ConnectionValidationResult = {
  isValid: boolean;
  reason?: string;
};
```

The structural/inference/complex/conversion helper functions
(`isLoopConnectionValid`, `isSwitchConnectionValid`,
`checkComplexTypeCompatibilityAfterEdgeAddition`, etc.) do **not** return this
type directly — each returns a one-level wrapper,
`{ validation: ConnectionValidationResult }`, so callers read
`result.validation.isValid` / `result.validation.reason`. `validateAddEdge`
translates a failing `ConnectionValidationResult` into the appropriate
`ValidationError` code.

### InputResolutionEntry / OutputDistributionEntry

```typescript
// `src/utils/nodeRunner/types.ts` › `InputResolutionEntry` / `OutputDistributionEntry`
type InputResolutionEntry = {
  edgeId: string;
  sourceNodeId: string;
  sourceHandleId: string;
};

type OutputDistributionEntry = {
  edgeId: string;
  targetNodeId: string;
  targetHandleId: string;
};
```

These are the compiled representations of edges used by the runner. See "Edges
in the Runner" below.

## Edge Addition Pipeline

The orchestrator is `validateAddEdge`
(`src/utils/nodeStateManagement/planApply/validateAddEdge.ts` ›
`validateAddEdge`). All steps run against the **scoped view** returned by
`getCurrentNodesAndEdgesFromState` (root nodes/edges, or the open node group's
subtree). Validation is pure — it produces a Plan and never mutates.

### 1. User connects two handles

The user drags from an output handle to an input handle in the ReactFlow canvas.
ReactFlow fires `onConnect` with a `Connection` (`source`, `target`,
`sourceHandle`, `targetHandle`). `FullGraph.tsx` dispatches
`ADD_EDGE_BY_REACT_FLOW` via `graphStore.dispatch`.

### 2. Missing-endpoint checks

If any of `source`, `target`, `sourceHandle`, `targetHandle` is falsy,
`validateAddEdge` returns `err({ code: 'MISSING_ENDPOINT', which, detail })`.
Node-not-found and handle-not-found (after index lookup) also return
`MISSING_ENDPOINT`.

### 3. Cycle detection (willAddingEdgeCreateCycle)

**File:** `src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`willAddingEdgeCreateCycle`

If `state.enableCycleChecking` is true, `willAddingEdgeCreateCycle` runs on a
state object scoped to the current view
(`{ ...state, nodes: view.nodes, edges: view.edges }`). The algorithm:

1. Find the target node; if not found, return `false` (no cycle possible)
2. If `target.id === sourceNodeId` (self-loop), return `true`
3. DFS from the target node, following outgoing edges via `getOutgoers()`, with
   a visited set
4. If any outgoer equals the source node, adding source->target would create a
   cycle

On cycle: `err({ code: 'CYCLE_DETECTED', sourceNodeId, targetNodeId })`.

### 4. Duplicate rejection

A candidate edge is run through ReactFlow's `addEdge()`. If `addEdge` returns
the same array reference (meaning it deduped), the edge is a duplicate:
`err({ code: 'DUPLICATE_EDGE', sourceHandle, targetHandle })`.

### 5. Loop connection validation

**File:** `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts` ›
`isLoopConnectionValid`

Run on a `viewScopedState` (the scoped view, plus the view's precomputed
`zones`/`zoneIndex` when present). This validates loop binding order
(`loopStart -> loopStop -> loopEnd` via `bindLoopNodes`), region containment,
uniform handle inference across the loop triplet, and parent-region validity for
nested/sibling loops. On failure: `err({ code: 'LOOP_PATH_INVALID', reason })`.

### 5b. Switch connection validation

**File:** `src/utils/nodeStateManagement/nodes/switches/switchValidation.ts` ›
`isSwitchConnectionValid`

Also run on `viewScopedState`. Enforces that a switch pair
(`switchStart -> switchEnd` via `bindSwitchNodes`) has no cross-branch
(true/false zone) connections and that body nodes interact only via zone
handles. On failure: `err({ code: 'SWITCH_PATH_INVALID', reason })`.

### 6. Early return when no validation flags

```ts
const isValidationNeeded =
  state.enableTypeInference ||
  state.enableComplexTypeChecking ||
  state.allowedConversionsBetweenDataTypes;
```

If none are set, `validateAddEdge` returns an `AddEdgePlan` immediately with an
empty inference plan. (Cycle, loop and switch validation still ran above.)

### 7. Type inference plan (if enabled)

**File:** `src/utils/nodeStateManagement/planApply/planInference.ts` ›
`planInferenceForEdgeAddition`

Called when `state.enableTypeInference` is true. This **mirrors** the legacy
`inferTypesAfterEdgeAddition` control flow but builds an `InferencePlan` of
`nodeDataReplacements` **without mutating state**:

- It reads source/target handles and their `dataType` /`inferredDataType`.
- It branches on the four cases (neither / source-only / target-only / both
  `inferFromConnection`):
  - **Neither is infer**: empty plan, valid.
  - **Both are infer, neither inferred**:
    `err({ code: 'TYPE_INFERENCE_FAILED' })` — no information to infer from.
  - **Both already inferred**: empty plan, valid (compatibility checked later).
  - **One inferred / one not**: infer the un-inferred side.
  - **Only one is infer, already inferred**: empty plan, valid.
- For group-boundary (`groupInput`/`groupOutput`), loop, and switch nodes it
  sets `overrideDataType` and `overrideName` so the handle's declared `dataType`
  (and name) are replaced, not just `inferredDataType`.
- It runs `inferTypeAcrossTheNodeForHandleOfDataType(..., /* mutate */ false)`
  and stores the resulting node data in a projection `Map` keyed by node id, so
  successive inferences observe prior dry-run results.

Handle **duplication** is NOT planned here — it is deferred to `applyPlan`.

### 8. Projection for downstream checks

**File:** `src/utils/nodeStateManagement/planApply/planInference.ts` ›
`applyInferencePlanToProjection`

Produces a shallow copy of the scoped state with the planned node-data
replacements applied. Node indices are re-found in the projected state so the
complex/conversion checks see post-inference handle types.

### 9. Complex type checking (if enabled)

**File:** `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`checkComplexTypeCompatibilityAfterEdgeAddition`

Runs against the **projected** state when `state.enableComplexTypeChecking` is
true. Uses `getResultantDataTypeOfHandleConsideringInferredType` to resolve the
effective data type. Rules:

- Neither handle is complex: valid.
- Exactly one is complex (XOR): invalid — "Can't connect complex types with
  non-complex types".
- Both are complex: valid only if they share the same `dataTypeUniqueId` **OR**
  their `complexSchema` is **reference-equal** (`===`). Data types are immutable
  singletons defined once in `state.dataTypes`, so two handles sharing a type
  point to the same schema object — reference equality is sufficient. (There is
  **no** `JSON.stringify` comparison.)

On failure: `err({ code: 'COMPLEX_TYPE_MISMATCH', sourceTypeId, targetTypeId })`
(the ids carried are the handle ids).

### 10. Type conversion checking (if enabled)

**File:** `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`checkTypeConversionCompatibilityAfterEdgeAddition`

Runs against the **projected** state when
`state.allowedConversionsBetweenDataTypes` is defined. Rules:

- Same `dataTypeUniqueId`: valid.
- Different types: valid only if
  - `allowedConversionsBetweenDataTypes[sourceTypeId][targetTypeId]` is truthy,
    **OR**
  - both are complex **AND**
    `state.allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking`
    is true.

On failure: `err({ code: 'CONVERSION_NOT_ALLOWED', from, to })`.

### 11. Plan returned

On success, `validateAddEdge` returns
`ok({ kind: 'ADD_EDGE', connection, inference, handleInsertions: [] })`.

## Edge Application (applyPlan, ADD_EDGE case)

**File:** `src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`
(`case 'ADD_EDGE'`)

Runs inside Immer's draft. In order:

1. **Mint the edge id** with `generateRandomString(20)` and assemble the full
   `Edge` object from `plan.connection` with `type: 'configurableEdge'`.
2. **Capture pre-inference handles** for the source/target (needed later to
   detect `inferFromConnection`, because inference's `overrideDataType` rewrites
   the handle's `underlyingType` to the concrete type).
3. **Apply inference replacements**: for each `nodeDataReplacements` entry,
   deep-copy the `newData` into the draft with
   `cloneDeepPreservingNonPlainObjects`. The deep copy is required: the
   inference plan can hold frozen objects (Immer auto-freezes the prior
   committed state, which inference reads from), and the subsequent splice-based
   handle duplication would otherwise fail with "object is not extensible". The
   helper copies PLAIN data but passes functions and zod `complexSchema`s
   through by reference, so it dodges `structuredClone`'s `DataCloneError` on
   schema internals and lodash `cloneDeep`'s identity-break of the schema
   singletons.
4. **Dedup handle names** per replaced node via `ensureAllHandleNamesUnique`
   (skipped for switch nodes here; switch dedup happens after zone prefixing).
5. **Write back** inference changes to the scoped location.
6. **Handle duplication** (only if a side was inferred):
   - `addDuplicateHandlesToLoopNodesAfterInference` — adds a matching new
     input+output infer handle to loop triplet nodes.
   - `addDuplicateHandlesToSwitchNodesAfterInference` — adds new infer handles
     to switch nodes.
   - `applySwitchZonePrefixesOnDraft` — prefixes zoned switch handle names with
     `"True: "` / `"False: "` (split at `Math.ceil(dataCount/2)`), then
     re-dedups switch handle names so only true cross-level duplicates get
     suffixed.
   - `growSpareAndPropagateBoundaryHandle` — when inside a node group, adds a
     new infer handle to the group input/output node and propagates the handle
     across the node type tree.
7. **Push the edge** onto the scoped `edges` array.
8. **Recompute zones**: if any zones exist, `recomputeAllZoneMemberships`
   refreshes zone node memberships and `zoneIndex.handleToZone`.

`applyValidatedAction` then records undo/redo patches into `state.history`.
Afterwards, `graphStore.dispatch` emits an `action:applied` event (via
`deriveAppliedEvent`) whose `edgeId` is **diff-derived** from the committed
`nextState.edges` (guaranteed to match the rendered DOM).

## Edge Removal Pipeline

### 1. User deletes edge

The user selects an edge and presses Delete, Backspace, or x. Before any
dispatch, `FullGraph`'s `onBeforeDelete` calls `canRemoveLoopNodesAndEdges`,
which forces whole-triplet (and whole-switch-pair) deletion and blocks
disconnecting bind edges. If it rejects, no action is dispatched (and a
`ui:delete:attempted` event may be emitted). Otherwise ReactFlow fires
`onEdgesChange` with `remove` changes and `FullGraph` dispatches
`UPDATE_EDGES_BY_REACT_FLOW`.

### 2. validateAction (UPDATE_EDGES_RF case)

**File:** `src/utils/nodeStateManagement/planApply/validators.ts` ›
`validateAction` (`case UPDATE_EDGES_BY_REACT_FLOW`)

For each change, on the scoped view:

- Non-`remove` change -> `{ kind: 'passthrough', change }`.
- `remove` change whose edge is not found -> `passthrough` (let
  `applyEdgeChanges` handle it).
- `remove` change with the edge found -> calls the **pure**
  `removeEdgeWithTypeChecking(edge, scopedState, change)` and packages the
  result as `{ kind: 'removal', updatedNodes, updatedEdges, validation }`.

### 3. removeEdgeWithTypeChecking (pure)

**File:** `src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`removeEdgeWithTypeChecking`

Returns `{ updatedNodes, updatedEdges, validation }` (it does **not** mutate):

1. Runs ReactFlow's `applyEdgeChanges()`; if it deduped (same reference),
   returns invalid.
2. If no validation flags are enabled, returns the edge-removed array directly.
3. Finds source/target nodes + handle indices; missing -> invalid.
4. If `enableTypeInference`, calls `inferTypesAfterEdgeRemoval`.

### 4. Type inference rollback (if enabled)

**File:** `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`inferTypesAfterEdgeRemoval`

For each end of the removed edge whose handle is `inferFromConnection`:

1. Collect all `getConnectedEdges` for that node (via `@xyflow/react`).
2. Build a set of all handle ids on that node sharing the removed handle's
   `dataTypeUniqueId` (via `getAllHandlesFromNodeData`).
3. Scan remaining edges (excluding the removed one) for any still touching those
   handle ids.
4. If **none** remain connected, reset the inferred type:
   `inferTypeAcrossTheNodeForHandleOfDataType(..., { handle: constructTypeOfHandleFromIndices(...), resetInferredType: true })`
   — restoring the original handle definition from `typeOfNodes`.

This is all-or-nothing per data type: removing the last edge to **any** matching
handle resets **all** handles of that data type on the node.

### 5. applyPlan (UPDATE_EDGES_RF case)

**File:** `src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`
(`case 'UPDATE_EDGES_RF'`)

Iterates the steps: `passthrough` re-applies `applyEdgeChanges`; `removal` with
`validation.isValid` writes back `updatedNodes`/`updatedEdges`. Afterwards, if
any zones exist, `recomputeAllZoneMemberships` runs.

## Edge Rendering (ConfigurableEdge)

**File:** `src/components/atoms/ConfigurableEdge/ConfigurableEdge.tsx` ›
`ConfigurableEdge`

All edges are rendered by the `ConfigurableEdge` component, registered as the
`'configurableEdge'` edge type.

### Gradient Colors

Each edge displays a linear gradient from source handle color to target handle
color:

1. Uses `useNodesData()` to reactively read source and target node data.
2. Calls `getHandleFromNodeDataMatchingHandleId()` to find each handle's color.
3. Falls back to `#A1A1A1` (gray) if no color is found.
4. Creates an SVG `<linearGradient>` with `gradientUnits='userSpaceOnUse'`
   positioned between source and target coordinates.

### Bezier Curves

Uses ReactFlow's `getBezierPath()` to compute the path, rendered via
`<BaseEdge>`.

### Viewport Optimization

Uses `IntersectionObserver` to detect whether the edge's SVG element is visible:

- Observes the edge's DOM element against the ReactFlow container (`domNode`).
- Threshold `1` (fully visible) with `20px` root margin.
- When not in viewport, applies `opacity-25`.

### Runner Value Pills

When a step is selected in the runner inspector (`RunnerContext`), the edge
matches the inspected node's input/output values and renders a value pill:

- **Input match**: `edge.target === step.nodeId` and a connection's
  `sourceNodeId`/`sourceHandleId` matches the edge — shows the incoming value.
- **Output match**: `edge.source === step.nodeId` — shows the output value keyed
  by handle name.
- The pill animates along the edge path (`<animateMotion>`) when
  `runnerCtx.edgeValuesAnimated` is true; otherwise it sits at the midpoint.
- Values are formatted by `formatEdgeValue`. Strings whose length **exceeds**
  `MAX_EDGE_VALUE_LENGTH` (12) are sliced to 11 chars plus an ellipsis
  (`value.slice(0, 11) + "…"`); `Map(n)`, `[n]`, `{n}` summaries are used for
  collections/objects.

### Styling

- Stroke width: `stroke-7!` (7px important).
- Stroke color: `url(#linear-gradient-edge-{id})` (the gradient).
- Selected edges get `brightness-150` (via `in-[g.selected]:brightness-150`).
- When a runner value pill is shown (`formattedValue !== null`), the
  `<BaseEdge>` gets `animate-[edge-brightness-pulse_1.5s_ease-in-out_infinite]`
  to pulse the active edge.
- Focusable for keyboard interaction.

## Cycle Detection

**File:** `src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`willAddingEdgeCreateCycle`

`willAddingEdgeCreateCycle()` implements standard DFS cycle detection:

```
willAddingEdgeCreateCycle(state, sourceNodeId, targetNodeId):
  1. Find target node in state.nodes
  2. If target not found: return false (no cycle possible)
  3. If target.id === sourceNodeId: return true (self-loop)
  4. Define hasCycle(node, visited):
     a. If node.id in visited: return false (already processed)
     b. Add node.id to visited
     c. For each outgoer of node (via getOutgoers):
        - If outgoer.id === sourceNodeId: return true
        - If hasCycle(outgoer, visited): return true
     d. Return false
  5. Return hasCycle(target)
```

Logic: if adding source->target, check whether target can already reach source.
Gated by `state.enableCycleChecking`. In `validateAddEdge` it runs on the
**scoped** view, so cycle checking respects the open node group boundary.

## Edges in the Runner

**File:** `src/utils/nodeRunner/compiler.ts` › `compile`

During compilation, edges are transformed into two lookup maps. Edges where
`isBindLoopNodesEdge(edge, nodes)` **or** `isBindSwitchNodesEdge(edge, nodes)`
are **skipped** — these are structural binding edges that carry no data.

### inputResolutionMap

```
Map<"targetNodeId:targetHandleId", InputResolutionEntry[]>
```

For each (non-bind) edge, an entry is added keyed by
`"{targetNodeId}:{targetHandleId}"`: "to resolve this input handle's value, read
from this source handle". Multiple entries indicate **fan-in**, and those
entries are stable-sorted by each edge's `data.order` (see
[Connection ordering](#connection-ordering-fan-in)) so `connections[]` follows
the user-defined order.

### outputDistributionMap

```
Map<"sourceNodeId:sourceHandleId", OutputDistributionEntry[]>
```

For each (non-bind) edge, an entry is added keyed by
`"{sourceNodeId}:{sourceHandleId}"`: "distribute this output to these target
handles". Multiple entries indicate **fan-out**.

### Special handling

- **bindLoopNodes and bindSwitchNodes edges** are excluded from both maps (and
  from topological sorting) — they connect the loop triplet / switch pair
  structurally only.
- **Group boundary node edges** remain in the maps so the executor can resolve
  handle mappings between outer and inner group graphs.

The executor uses these maps at runtime to resolve input values from the
`ValueStore`, build `InputHandleValue` objects with connection metadata, and
build `OutputHandleInfo` objects so implementations know their downstream
consumers.

## Connection ordering (fan-in)

An input handle may receive multiple edges (**fan-in**). The order of those
connections is meaningful: it is the order the runner and codegen present them
to a `FunctionImplementations` (`readInput(inputs, name)` yields the connection
values in this order). By default the order is the order the edges appear in
`state.edges`; the user can override it per handle.

- **Persistence.** The order is stored per edge as `data.order` — the
  connection's contiguous `0..n-1` rank within its target handle's fan-in group
  (`src/components/atoms/ConfigurableEdge/ConfigurableEdge.tsx` ›
  `ConfigurableEdgeData`). It is additive and back-compatible: edges that have
  never been reordered carry no `order`, and the compiler then falls back to the
  `state.edges` array order. Because the serializer does not strip edges,
  `data.order` round-trips through export/import for free.
- **Action.** Reordering dispatches `REORDER_INPUT_CONNECTIONS`
  (`src/utils/nodeStateManagement/mainReducer.ts` › `actionTypesMap`) with
  `{ nodeId, handleId, orderedEdgeIds }`. The pure validator
  (`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`)
  accepts it only when `orderedEdgeIds` is a strict permutation of the handle's
  current (2+) fan-in edges, otherwise it is a `NOOP`. `applyPlan`
  (`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`) writes
  the contiguous `data.order` onto each edge — replacing edge objects so frozen
  committed state is never mutated — scope-aware via
  `getCurrentNodesAndEdgesFromState`. It is a single undoable step (the plan is
  `src/utils/nodeStateManagement/planApply/types.ts` ›
  `ReorderInputConnectionsPlan`).
- **Resolution.** The compiler (`src/utils/nodeRunner/compiler.ts` › `compile`)
  stable-sorts each fan-in handle's `InputResolutionEntry[]` by `data.order`
  right after building the `inputResolutionMap`. This single point fixes the
  order for BOTH the executor (which builds `connections[]` from these entries)
  and every codegen target (which lowers the same `ExecutionPlan`).
- **UI.** See [ConfigurableNode](../ui/configurableNodeDoc.md) — a compact
  reorder control (an ordered-list icon + the connection count) appears on any
  input handle with 2+ connections and opens a drag-to-reorder popover
  (`src/components/organisms/ConfigurableNode/SupportingSubcomponents/InputConnectionOrderControl.tsx`
  › `InputConnectionOrderControl`).

## Limitations and Deprecated Patterns

- **Minimal library-read edge data**: `ConfigurableEdgeState` is
  `Edge<ConfigurableEdgeData, 'configurableEdge'>`, where `ConfigurableEdgeData`
  is `{ order?: number } & Record<string, unknown>`. The library persists and
  reads exactly one edge field — `data.order`, the fan-in connection rank (see
  [Connection ordering](#connection-ordering-fan-in)). All other edge metadata
  is derived from the connected handles at render time.
- **Single edge type**: All edges use `'configurableEdge'`. There is no
  mechanism for custom edge types.
- **`addEdgeWithTypeChecking` is legacy/test-only**: the mutating
  `addEdgeWithTypeChecking` in
  `src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
  `addEdgeWithTypeChecking` is still exported but only referenced by
  `edgeValidation.test.ts`. The production addition path is `validateAddEdge`
  (pure) + `applyPlan` (mutating apply). The `removeEdgeWithTypeChecking` path,
  by contrast, IS live — but it is now pure (returns new arrays) and consumed by
  `src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`.
- **Reference-equality complex comparison**: complex-type compatibility compares
  `complexSchema` by reference (`===`), relying on data types being immutable
  singletons. Two structurally-identical schemas defined as separate objects are
  treated as different types.
- **Inference does not survive removal**: dynamic handle duplication done during
  addition is not undone when the edge is removed; only `inferredDataType`
  resets (when the last matching connection is severed). Undo/redo (via Immer
  patches in `state.history`) is the mechanism for reverting structural changes.

## Examples

### Basic edge addition (no validation)

When `enableTypeInference`, `enableComplexTypeChecking`, and
`allowedConversionsBetweenDataTypes` are all falsy:

```
User connects NodeA:output1 -> NodeB:input1
  -> validateAddEdge():
     -> endpoint checks pass
     -> cycle check (if enabled): no path NodeB -> NodeA
     -> duplicate check: addEdge() did not dedup
     -> loop + switch validation: neither side is a structure node, pass
     -> no validation flags set -> return ok(AddEdgePlan, empty inference)
  -> applyPlan(ADD_EDGE):
     -> mint id, push { id:"abc123…", source:"NodeA", target:"NodeB",
                        sourceHandle:"output1", targetHandle:"input1",
                        type:"configurableEdge" }
```

### Edge addition with type inference

```
NodeA output: dataType "number" (underlyingType "number")
LoopStart input[0]: dataType "loopInfer" (underlyingType "inferFromConnection"),
                    inferredDataType undefined

User connects NodeA:output -> LoopStart:input[0]
  -> validateAddEdge():
     -> loop + switch validation pass
     -> planInferenceForEdgeAddition() (dry-run):
        target handle is inferFromConnection, not yet inferred
        -> plan replacement: LoopStart.data with inferredDataType=number
           cascaded across all loopInfer handles (overrideDataType/Name set)
     -> projection built; complex check: neither complex, pass
     -> return ok(AddEdgePlan with one nodeDataReplacement)
  -> applyPlan(ADD_EDGE):
     -> cloneDeepPreservingNonPlain replacement into draft, dedup names
     -> addDuplicateHandlesToLoopNodesAfterInference() adds a new
        input+output loopInfer handle
     -> push edge; recompute zones
```

### Edge removal with inference rollback

```
LoopStart input[0]: dataType loopInfer, inferredDataType=number
(no other loopInfer handle on LoopStart still connected)

User deletes the edge NodeA:output -> LoopStart:input[0]
  -> validateAction(UPDATE_EDGES_RF):
     -> removeEdgeWithTypeChecking() (pure):
        inferTypesAfterEdgeRemoval(): no remaining loopInfer connection
        -> reset: rebuild original handle from typeOfNodes,
                  resetInferredType=true across the node
     -> step { kind:'removal', updatedNodes, updatedEdges, validation }
  -> applyPlan(UPDATE_EDGES_RF): write back, recompute zones
```

## Relationships with Other Features

### -> [Data Types](dataTypesDoc.md)

Edges connect handles of specific data types. The validation pipeline checks
type compatibility (same type, allowed conversion, or reference-equal complex
schema). The `inferFromConnection` underlying type enables dynamic type
inference through edges; `noEquivalent` types like `bindLoopNodes`/
`bindSwitchNodes` are structural and never carry runtime data.

### -> [Handles](handlesDoc.md)

Edges reference handles by ID (`sourceHandle`, `targetHandle`). Handle colors
drive edge gradient rendering. Handle data types drive the validation pipeline.
Inference replacements rewrite handle properties (`inferredDataType`, and — for
group/loop/switch boundary handles — `dataType` and `name`) when edges are added
or removed.

### -> [Nodes](nodesDoc.md)

Edges connect nodes. Cycle detection traverses node adjacency. Node `data`
contains the handles that edges reference. Inference replaces a node's entire
`data` (via `cloneDeepPreservingNonPlainObjects` in `applyPlan`).

### -> [Type Inference](typeInferenceDoc.md)

Edge addition runs `planInferenceForEdgeAddition` (dry-run) to build the
`InferencePlan`; `applyPlan` writes it and runs handle duplication. Edge removal
runs `inferTypesAfterEdgeRemoval` to reset inferred types when no connections
remain. See `src/utils/nodeStateManagement/edges/typeInference.ts` ›
`inferTypeAcrossTheNodeForHandleOfDataType` for the low-level inference
primitives (`inferTypeOnHandleAfterConnectingWithAnotherHandle`,
`inferTypeAcrossTheNodeForHandleOfDataType`).

### -> [Connection Validation](../features/connectionValidationDoc.md)

`validateAddEdge` runs validations in sequence: missing-endpoint -> cycle ->
duplicate -> loop -> switch -> inference -> complex -> conversion. The internal
helpers return `ConnectionValidationResult`; the orchestrator maps failures to
`ValidationError` codes. Each gated step only runs if its flag is enabled.

### -> [Loops](../features/loopsDoc.md)

Loop nodes (loopStart, loopStop, loopEnd) have special edge validation via
`isLoopConnectionValid()`. `bindLoopNodes` edges connect the loop triplet
structurally and are skipped during compilation. Loop nodes get duplicate infer
handles in `applyPlan` after inference. Loop-triplet deletion is guarded by
`canRemoveLoopNodesAndEdges` in `onBeforeDelete`.

### -> [State Management](stateManagementDoc.md)

Edge operations flow through `validateAction`
(`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`) ->
`applyValidatedAction` (`src/utils/nodeStateManagement/applyWithHistory.ts` ›
`applyValidatedAction`) -> `applyPlan`
(`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`). The
recommended dispatch path is the Redux-style `graphStore` (read via
`useSyncExternalStore` inside `useFullGraph`); the legacy `mainReducer`
delegates to the same `validateAction`/`applyValidatedAction` pair. Undo/redo
patches live on `state.history`.

### -> [Runner](../runner/runnerHookDoc.md)

The compiler transforms edges into `inputResolutionMap` and
`outputDistributionMap` (keyed by `"nodeId:handleId"`). The executor uses these
maps to resolve input values from the `ValueStore` and build metadata for
function implementations. `bindLoopNodes` and `bindSwitchNodes` edges are
excluded from the data-flow maps.

### -> [ConfigurableEdge UI](../ui/configurableEdgeDoc.md)

The `ConfigurableEdge` React component renders all edges. It reads handle colors
from node data via `useNodesData()` and
`getHandleFromNodeDataMatchingHandleId()`, computes bezier paths, applies SVG
gradients, uses `IntersectionObserver` for viewport optimization, and renders
runner value pills from `RunnerContext`.

### -> [Import/Export](../importExport/importExportDoc.md)

Edges are serialized as part of graph state export. During import, orphan edges
(referencing non-existent nodes or handles) can be removed when
`repair.removeOrphanEdges` is enabled, and duplicate edge IDs resolved with
`repair.removeDuplicateEdgeIds`. On `REPLACE_STATE`, `applyPlan` rehydrates
zones (`rehydrateAllZones`) and **deletes** `state.history`.
