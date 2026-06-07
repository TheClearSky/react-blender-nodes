# Connection Validation

## Overview

Connection validation is the multi-layered gauntlet that decides whether an edge
(connection) may be added between two handles in the graph. When a user drags a
connection, ReactFlow emits an `ADD_EDGE_BY_REACT_FLOW` action and the reducer
runs a `validate -> plan -> apply` cycle. The **validate** half runs the
gauntlet; if every layer passes, it produces an `AddEdgePlan` describing what
should change (including any type-inference node-data replacements). The
**apply** half then mints the edge id and mutates the Immer draft. The system
also validates edge and node deletions to preserve loop and switch structure
integrity.

Validation is part of the Plan/Apply architecture (see
[State Management](../core/stateManagementDoc.md)). The pipeline is **pure**: it
reads from immutable state and returns a `Result<AddEdgePlan, ValidationError>`
discriminated union — never mutating state and never minting ids. This makes it
deterministic and replay-safe (the same `(state, action)` always yields the same
plan).

The pipeline and its helpers live across these files:

- `planApply/validateAddEdge.ts` — the ~13-step edge-addition gauntlet
  (`validateAddEdge`); the heart of connection validation.
- `planApply/validators.ts` — `validateAction`, which routes
  `ADD_EDGE_BY_REACT_FLOW` to `validateAddEdge` and `UPDATE_EDGES_BY_REACT_FLOW`
  to the (pure) removal path.
- `planApply/planInference.ts` — `planInferenceForEdgeAddition` (dry-run type
  inference) and `applyInferencePlanToProjection` (builds the projected state
  downstream checks see).
- `planApply/types.ts` — the `Result`/`ok`/`err` helpers, the `ValidationError`
  taxonomy, and the `AddEdgePlan`/`InferencePlan` types.
- `nodes/loops/loopValidation.ts` — `isLoopConnectionValid` (step 7) and
  `canRemoveLoopNodesAndEdges` (delete validation).
- `nodes/switches/switchValidation.ts` — `isSwitchConnectionValid` (step 7b).
- `newOrRemovedEdgeValidation.ts` —
  `checkComplexTypeCompatibilityAfterEdgeAddition`,
  `checkTypeConversionCompatibilityAfterEdgeAddition`, plus the legacy mutating
  `inferTypesAfterEdgeAddition`/`inferTypesAfterEdgeRemoval`.
- `zones/` — first-class zones whose `enforced` boundary rules back the
  loop/switch region checks.

> **Note on the legacy path.** The older `constructAndModifyHandles.ts`
> `addEdgeWithTypeChecking` function (which mutated state and returned a
> `ConnectionValidationResult`) is no longer on the dispatch path for edge
> _addition_ — it is retained for tests only. The live path is
> `validateAddEdge`. `constructAndModifyHandles.ts` is still the home of three
> functions the gauntlet calls: `willAddingEdgeCreateCycle`,
> `getResultantDataTypeOfHandleConsideringInferredType`, and
> `removeEdgeWithTypeChecking` (the latter now pure, used for edge _removal_).

## Entity-Relationship Diagram

```
+----------------------------+        +----------------------------+
|       Result<T,E>          |        |      ValidationError       |
|----------------------------|        |----------------------------|
| ok: true;  value: T        |        | code: '...'                |  (discriminated
| ok: false; error: E        |<-------| ...code-specific fields    |   union, 13 codes)
+----------------------------+        +----------------------------+

+----------------------------+        +----------------------------+
|        AddEdgePlan          |        |       InferencePlan        |
|----------------------------|        |----------------------------|
| kind: 'ADD_EDGE'           |        | nodeDataReplacements:      |
| connection {               |<------>|   Array<{                  |
|   source, target,          |        |     nodeId: string;        |
|   sourceHandle, targetHandle|       |     newData: unknown;      |
| }                          |        |   }>                       |
| inference: InferencePlan   |        +----------------------------+
| handleInsertions: []       |
+----------------------------+

+------------------+        +------------------+        +------------------+
|     DataType     |        |      Handle      |        |       Node       |
|------------------|        |------------------|        |------------------|
| dataTypeUniqueId |        | id               |        | id               |
| dataTypeObject   |<------>| dataType         |<------>| data             |
|   .underlyingType|        | inferredDataType?|        | nodeTypeUniqueId |
|   .complexSchema?|        | maxConnections?  |        |                  |
|   .maxConnections|        |                  |        |                  |
+------------------+        +------------------+        +------------------+

+----------------------------+        +----------------------------+
| ConnectionValidationResult |        |          State (flags)     |
|----------------------------|        |----------------------------|
| isValid: boolean           |        | enableCycleChecking?       |
| reason?: string            |        | enableTypeInference?       |
+----------------------------+        | enableComplexTypeChecking? |
 (used by the loop/switch/    )       | allowedConversions...?     |
 (complex/conversion helpers  )       | allowConversionBetween...? |
                                      | zones? / zoneIndex?        |
                                      +----------------------------+
```

## Functional Dependency Diagram

```
mainReducer (ADD_EDGE_BY_REACT_FLOW)                 [mainReducer.ts]
  |
  +-- validateAction()                               [planApply/validators.ts]
  |     +-- validateAddEdge()                        [planApply/validateAddEdge.ts]
  |           +-- (1) null checks on source/target/handles
  |           +-- (2) willAddingEdgeCreateCycle()    [constructAndModifyHandles.ts]
  |           |       +-- getOutgoers() DFS          [@xyflow/react]
  |           +-- (3) getCurrentNodesAndEdgesFromState()  -> scope-local view
  |           +-- (4) addEdge() duplicate check      [@xyflow/react]
  |           +-- (6) findIndex + getHandleFromNodeDataMatchingHandleId()
  |           +-- (7)  isLoopConnectionValid()       [nodes/loops/loopValidation.ts]
  |           |          +-- getLoopStructureFromNode()
  |           |          +-- verifyLoopStructureUniformHandleInference()
  |           |          +-- getNodesInLoopRegion() / findZoneByStructure()
  |           |          +-- getAllReachableNodes()
  |           |          +-- verifyParentLoopRegionsAreValid()
  |           +-- (7b) isSwitchConnectionValid()     [nodes/switches/switchValidation.ts]
  |           |          +-- getSwitchStructureFromNode()
  |           |          +-- getNodesInSwitchRegion() / findZoneByStructure()
  |           |          +-- getZoneHandleIds()
  |           |          +-- isNodeReachableToBoundary()   [zones/]
  |           +-- (9)  planInferenceForEdgeAddition()      [planApply/planInference.ts]
  |           |          +-- inferTypeAcrossTheNodeForHandleOfDataType(mutate=false)
  |           +-- (10) applyInferencePlanToProjection()    -> projectedState
  |           +-- (11) checkComplexTypeCompatibilityAfterEdgeAddition()  [newOrRemovedEdgeValidation.ts]
  |           +-- (12) checkTypeConversionCompatibilityAfterEdgeAddition()
  |           +-- (13) ok(AddEdgePlan)
  |
  +-- applyValidatedAction() -> applyPlan('ADD_EDGE')      [planApply/applyPlan.ts]
        +-- mint edge id; apply inference replacements; run handle duplication;
            push edge; recomputeAllZoneMemberships()

FullGraph.tsx (onBeforeDelete)                        [FullGraph.tsx]
  |
  +-- canRemoveLoopNodesAndEdges()                    [nodes/loops/loopValidation.ts]
        +-- getLoopStructureFromNode()  / isLoopNode()
        +-- getSwitchStructureFromNode() / isSwitchNode()

ReactFlow <Handle> (per-handle, UI-level)             [ContextAwareHandle.tsx]
  +-- useNodeConnections().length < maxConnections -> isConnectable
```

## Data Flow Diagram

```
User drags connection
         |
         v
+--------------------------+
| ADD_EDGE_BY_REACT_FLOW   |
| -> validateAction()      |
| -> validateAddEdge()     |
+-----------+--------------+
            |
            v
+--------------------------+   missing
| (1) source/target/handle |--------------> err(MISSING_ENDPOINT)
|     null checks          |
+-----------+--------------+
            | ok
            v
+--------------------------+  flag set & cycle
| (2) enableCycleChecking? |--------------> err(CYCLE_DETECTED)
+-----------+--------------+
            | (skip if flag off)
            v
+--------------------------+
| (3) view =               |   getCurrentNodesAndEdgesFromState(state)
|     scope-local nodes/   |   (subtree when inside a node group)
|     edges/zones          |
+-----------+--------------+
            v
+--------------------------+  addEdge() === view.edges
| (4) duplicate check      |--------------> err(DUPLICATE_EDGE)
+-----------+--------------+
            v
+--------------------------+  not found
| (6) find nodes + handle  |--------------> err(MISSING_ENDPOINT)
|     indices              |
+-----------+--------------+
            v   build viewScopedState (nodes/edges/zones/zoneIndex)
+--------------------------+  !isValid
| (7)  isLoopConnectionValid|-------------> err(LOOP_PATH_INVALID, reason)
+-----------+--------------+
            v   !isValid
+--------------------------+
| (7b) isSwitchConnectionValid|-----------> err(SWITCH_PATH_INVALID, reason)
+-----------+--------------+
            v
+--------------------------+  none of enableTypeInference /
| (8) any validation flag? |  enableComplexTypeChecking /
+-----------+--------------+  allowedConversionsBetweenDataTypes
            |   no  ----------------------> ok(AddEdgePlan, empty inference)
            | yes
            v
+--------------------------+  !ok
| (9) planInferenceFor     |--------------> err(TYPE_INFERENCE_FAILED, reason)
|     EdgeAddition (dry-run)|              (propagated verbatim)
+-----------+--------------+
            v   build projectedState = applyInferencePlanToProjection(...)
+--------------------------+  !isValid
| (11) complex type check  |--------------> err(COMPLEX_TYPE_MISMATCH)
|      (if flag)           |
+-----------+--------------+
            v   !isValid
+--------------------------+
| (12) conversion check    |--------------> err(CONVERSION_NOT_ALLOWED)
|      (if map present)    |
+-----------+--------------+
            v
+--------------------------+
| (13) ok(AddEdgePlan)     | --> applyPlan mints id, applies inference,
+--------------------------+     duplicates handles, pushes edge, recomputes zones
```

## System Diagram

```
+-----------------------------------------------------------------------------+
|                             react-blender-nodes                             |
|                                                                             |
|  +--------------------------+        +-----------------------------------+   |
|  |      FullGraph.tsx       |        |          mainReducer.ts           |   |
|  |   (React component)      |        |        (state management)         |   |
|  |                          |        |                                   |   |
|  | onConnect() ------------ |------->| ADD_EDGE_BY_REACT_FLOW            |   |
|  | onBeforeDelete() --+     |        |   |                               |   |
|  +--------------------|-----+        |   v                               |   |
|                       |              | validateAction() (validators.ts)  |   |
|                       |              |   |                               |   |
|                       |              |   v                               |   |
|                       |              | validateAddEdge() (the gauntlet)  |   |
|                       |              |   |                               |   |
|  +--------------------v-----+        |   v                               |   |
|  | canRemoveLoopNodesAnd    |        | applyValidatedAction()            |   |
|  | Edges()  (delete valid.) |        |   -> applyPlan('ADD_EDGE')        |   |
|  | - loop triplet together  |        +-----------------------------------+   |
|  | - switch pair together   |                                               |
|  | - bind edges not solo    |        Validation gauntlet (validateAddEdge):  |
|  +--------------------------+        +-----------------------------------+   |
|                                      | 1. null endpoint checks           |   |
|  +--------------------------+        | 2. cycle (DFS, enableCycleChecking)|  |
|  |  ContextAwareHandle.tsx  |        | 4. ReactFlow duplicate check      |   |
|  | maxConnections gate via  |        | 7. loop connection validation     |   |
|  | useNodeConnections()     |        | 7b. switch connection validation  |   |
|  | -> isConnectable (UI)    |        | 9. inference plan (dry-run)        |   |
|  +--------------------------+        | 11. complex type compatibility    |   |
|                                      | 12. type conversion compatibility |   |
|  +--------------------------+        +-----------------------------------+   |
|  |          zones/          |   <----  loop/switch region checks read       |
|  | enforced boundary rules  |          findZoneByStructure + nodeIds         |
|  +--------------------------+                                                |
+-----------------------------------------------------------------------------+
```

## The Result and Error Types

Unlike the legacy `ConnectionValidationResult` (a `{ isValid, reason }` object),
the gauntlet returns a `Result<AddEdgePlan, ValidationError>` sum type. Defined
in `planApply/types.ts`:

```typescript
type Result<T, E = ValidationError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never>; // { ok: true, value }
function err<E>(error: E): Result<never, E>; // { ok: false, error }
```

`ValidationError` is a discriminated union of **machine-readable codes** (not
free-form strings), so callers can branch on `error.code`. The full taxonomy
(`src/utils/nodeStateManagement/planApply/types.ts` › `ValidationError`):

| Code                             | Extra fields                                                          | Raised by                                                 |
| -------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `MISSING_ENDPOINT`               | `which: 'source'\|'target'\|'sourceHandle'\|'targetHandle'`, `detail` | steps 1 and 6 (null endpoints / node or handle not found) |
| `CYCLE_DETECTED`                 | `sourceNodeId`, `targetNodeId`                                        | step 2                                                    |
| `DUPLICATE_EDGE`                 | `sourceHandle`, `targetHandle`                                        | step 4                                                    |
| `LOOP_PATH_INVALID`              | `reason` (human string from the loop validator)                       | step 7                                                    |
| `SWITCH_PATH_INVALID`            | `reason` (human string from the switch validator)                     | step 7b                                                   |
| `TYPE_INFERENCE_FAILED`          | `reason`                                                              | step 9 (propagated from `planInferenceForEdgeAddition`)   |
| `COMPLEX_TYPE_MISMATCH`          | `sourceTypeId`, `targetTypeId`                                        | step 11                                                   |
| `CONVERSION_NOT_ALLOWED`         | `from`, `to`                                                          | step 12                                                   |
| `NODE_TYPE_NOT_FOUND`            | `nodeType`                                                            | other actions (ADD_NODE, ADD_LOOP, ADD_SWITCH, …)         |
| `INVALID_NODE_GROUP`             | `reason`                                                              | other actions (group/loop/switch editing)                 |
| `EMPTY_STACK`                    | `action`                                                              | CLOSE_NODE_GROUP                                          |
| `NODE_COUNT_CONSTRAINT_VIOLATED` | `nodeType`, `constraintKind`, `limit`, `currentCount`                 | ADD_NODE / node removal                                   |
| `NOOP`                           | `reason`                                                              | UNDO/REDO with empty stacks                               |

On success, the value is an `AddEdgePlan`:

```typescript
type AddEdgePlan = {
  kind: 'ADD_EDGE';
  connection: {
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  };
  inference: InferencePlan; // { nodeDataReplacements: Array<{ nodeId; newData }> }
  handleInsertions: HandleInsertion[]; // always [] from validate; duplication runs in apply
};
```

The internal loop/switch/complex/conversion helpers still speak the older
`ConnectionValidationResult` (`{ isValid: boolean; reason?: string }`, exported
from `newOrRemovedEdgeValidation.ts`); `validateAddEdge` translates a failing
result into the appropriate `ValidationError` code.

## Validation Layers (the gauntlet)

`validateAddEdge` (`planApply/validateAddEdge.ts`) runs the following steps in
order, **short-circuiting** by returning `err(...)` on the first failure. Step
numbers below match the inline comments in the source.

### 1. Null endpoint checks

Returns `err({ code: 'MISSING_ENDPOINT', which, detail })` if any of `source`,
`target`, `sourceHandle`, or `targetHandle` is absent on the incoming
`Connection`. Always runs.

### 2. Cycle checking (DFS)

**Flag:** `enableCycleChecking`. When set, builds a scope-local view and calls
`willAddingEdgeCreateCycle(...)`
(`src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`willAddingEdgeCreateCycle`), a depth-first search starting at the target node
that walks outgoers via `getOutgoers()` from `@xyflow/react`. A self-connection
(`target === source`) counts as a cycle. On detection, returns
`err({ code: 'CYCLE_DETECTED', sourceNodeId, targetNodeId })`.

### 3. Scope-local view

Calls `getCurrentNodesAndEdgesFromState(state)`. When a node group is open
(`state.openedNodeGroupStack` non-empty), this returns the open subtree's
`nodes`/`edges`/`zones`/`zoneIndex` (plus `inputNodeId`/`outputNodeId`), so all
subsequent lookups operate on the visible scope rather than the root graph.

### 4. Duplicate edge check (ReactFlow)

Builds a placeholder candidate edge and calls ReactFlow's
`addEdge(candidate, view.edges)`. If the returned array is referentially equal
to `view.edges`, the edge already exists (or ReactFlow rejected it), and the
step returns `err({ code: 'DUPLICATE_EDGE', sourceHandle, targetHandle })`.
Always runs.

### 5. Placeholder edge object

Constructs a `newEdge` with `id: '__pending__'` and `type: 'configurableEdge'`.
The id is intentionally a placeholder — `applyPlan` mints the real id at commit
time. Downstream readers only touch source/target/sourceHandle/targetHandle.

### 6. Resolve nodes and handle indices

`findIndex` locates the source and target nodes in the view (`err`
`MISSING_ENDPOINT` if missing).
`getHandleFromNodeDataMatchingHandleId(handleId, node.data)` resolves each
handle's `HandleIndices` (`err` `MISSING_ENDPOINT` if the handle is not on the
node). A `viewScopedState` is then assembled (`...state` plus the view's
`nodes`, `edges`, and — when present — `zones`/`zoneIndex`) so the structural
validators in steps 7/7b see the correct subtree and zone set.

### 7. Loop connection validation

**Always runs** (no flag). Calls
`isLoopConnectionValid(viewScopedState, sourceNode, targetNode, sourceHandleIndex, targetHandleIndex)`
(`src/utils/nodeStateManagement/nodes/loops/loopValidation.ts` ›
`isLoopConnectionValid`). On failure returns
`err({ code: 'LOOP_PATH_INVALID', reason })`, where `reason` is the validator's
human-readable string. The validator handles three cases:

**Case 1 — both nodes are loop nodes.**

- **Bind connections** (`bindLoopNodes` data type on either handle): must follow
  the order `loopStart -> loopStop` or `loopStop -> loopEnd`. Otherwise rejected
  with "Loop nodes can only bind in order: loopStart<->loopStop<->loopEnd".
- **Non-bind connections within the same structure**: validated by
  `verifyLoopStructureUniformHandleInference` and must follow the same
  start->stop->end order.
- **Non-bind connections between two different structures**: allowed only as (a)
  loops in series (`loopEnd -> loopStart`) or (b) nesting (one structure inside
  the other's region). Connecting one structure's inner region directly to
  another's inner region is rejected. Parent loop regions are re-checked via
  `verifyParentLoopRegionsAreValid` (with the involved triplet ids ignored).

**Case 2 — exactly one node is a loop node.**

- Requires a complete loop structure (`getLoopStructureFromNode` must resolve
  the full triplet); else "Can't connect to incomplete loop structure".
- Requires uniform handle inference across the triplet.
- Enforces region placement of the non-loop node. The body regions come from the
  **enforced zones** when present
  (`findZoneByStructure(state.zones, loopStart.id, 'preStop' | 'postStop')`),
  otherwise fall back to `getNodesInLoopRegion`:
  - Nodes in the `LoopStart<->LoopStop` region may only connect to/from
    loopStart.
  - Nodes in the `LoopStop<->LoopEnd` region may only connect to/from loopStop.
  - Reachable nodes outside the region may only connect to/from loopEnd.
  - Group input nodes may only connect to loopStart; group output nodes may only
    connect to loopEnd.
- Finally re-checks parent loop regions via `verifyParentLoopRegionsAreValid`.

**Case 3 — neither node is a loop node.** Still calls
`verifyParentLoopRegionsAreValid`, which rejects edges that would cross a loop
region boundary ("Can't connect a node from inside the loop to a node from
outside the loop" / "Can't connect 2 nodes of different regions of loop nodes").

### 7b. Switch connection validation

**Always runs** (no flag). Calls
`isSwitchConnectionValid(viewScopedState, sourceNode, targetNode, sourceHandleIndex, targetHandleIndex)`
(`src/utils/nodeStateManagement/nodes/switches/switchValidation.ts` ›
`isSwitchConnectionValid`). On failure returns
`err({ code: 'SWITCH_PATH_INVALID', reason })`. Three cases:

**Case 1 — neither node is a switch node.** Iterates every `switchStart` in the
scope, derives its true/false branch node sets (from the **enforced** trueBranch
/ falseBranch zones if present, else `getNodesInSwitchRegion`), and rejects:

- Connecting a true-branch node to a false-branch node of the same switch
  ("Can't connect nodes across true and false branches of the same switch").
- Connecting a branch-interior node to a node outside the branch unless the
  outside node is isolated (`isNodeReachableToBoundary` is false) — i.e. you
  must route through Switch Start/End ("Can't connect between inside and outside
  a switch branch without going through Switch Start/End").

**Case 2 — both nodes are switch nodes.**

- **Bind connections** (`bindSwitchNodes`): allowed only
  `switchStart -> switchEnd`.
- Within the same structure, data may only flow `switchStart -> switchEnd`
  ("Within the same switch, data can only flow from Switch Start to Switch
  End"). For direct passthrough, the source's true/false output zone must match
  the target's true/false input zone (`getZoneHandleIds`), else "Can't connect
  across true and false zones in passthrough".

**Case 3 — one switch node, one regular node.** Determines which true/false
**zone** the switch handle belongs to and which branch the other node is in:

- A zoned handle requires the other node to be in the matching branch; a
  mismatched branch is rejected ("True-region node cannot connect to false-zone
  handle", and vice versa). An external node may connect to a zoned handle only
  if it is isolated.
- A non-zoned handle (bind, condition, or plain data input/output) on a switch
  node may not be wired to a body node inside a branch ("Body nodes in a switch
  branch can only send to Switch End zone inputs or other body nodes" / "...
  receive from Switch Start zone outputs or other body nodes").

### 8. Early return when no flags are enabled

If none of `enableTypeInference`, `enableComplexTypeChecking`, or
`allowedConversionsBetweenDataTypes` is set, the gauntlet returns immediately
with
`ok({ kind: 'ADD_EDGE', connection, inference: { nodeDataReplacements: [] }, handleInsertions: [] })`.
Cycle, loop, and switch checks have already run; type checks are skipped.

### 9. Type inference (dry-run plan)

**Flag:** `enableTypeInference`. Calls `planInferenceForEdgeAddition(...)`
(`src/utils/nodeStateManagement/planApply/planInference.ts` ›
`planInferenceForEdgeAddition`), which mirrors the control flow of the legacy
mutating `inferTypesAfterEdgeAddition` but **collects node-data replacements
into an `InferencePlan` instead of mutating**. It runs
`inferTypeAcrossTheNodeForHandleOfDataType(..., /* mutate */ false)` and reads
from a projection map so successive inferences see prior dry-run results. If
inference is impossible it returns
`err({ code: 'TYPE_INFERENCE_FAILED', reason })`, which `validateAddEdge`
propagates verbatim. Inference scenarios for `inferFromConnection` handles:

- **Neither handle is `inferFromConnection`** — no inference; empty plan.
- **Both are `inferFromConnection`**: neither inferred yet → rejected ("None of
  the handles are inferred, inference has no information to work with"); both
  already inferred → empty plan; one inferred → the uninferred side adopts the
  inferred type.
- **One is `inferFromConnection`**: already inferred → empty plan; otherwise
  infer from the concrete handle.

When the node being updated is a group boundary node, a loop node, or a switch
node, `overrideDataType` and `overrideName` are set so the inferred concrete
type/name replace the placeholder. Handle duplication (loop/switch/group) is
**not** planned here — it is performed later by `applyPlan` on the Immer draft
(see [Apply phase](#what-applyplan-does-on-success)).

### 10. Build the projected state

Calls `applyInferencePlanToProjection(stateForView, inferencePlan)`, returning a
shallow copy of the view with the planned `nodeDataReplacements` applied (or the
same object if the plan is empty). Node indices are re-found in the projected
state. Steps 11–12 read from this projection so they see post-inference types.

### 11. Complex type compatibility

**Flag:** `enableComplexTypeChecking`. Calls
`checkComplexTypeCompatibilityAfterEdgeAddition(projectedState, ...)`
(`src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`checkComplexTypeCompatibilityAfterEdgeAddition`). Resolves each handle's
effective type via `getResultantDataTypeOfHandleConsideringInferredType`, then:

- Neither complex → pass.
- Exactly one complex → reject ("Can't connect complex types with non-complex
  types").
- Both complex → same type only if `dataTypeUniqueId` matches **or** the two
  `complexSchema` references are identical (data types are immutable singletons,
  so reference equality suffices); otherwise reject ("Can't connect complex
  types with different types").

On failure `validateAddEdge` returns
`err({ code: 'COMPLEX_TYPE_MISMATCH', sourceTypeId, targetTypeId })` (the type
ids carried are the handle ids).

### 12. Type conversion compatibility

**Flag:** `allowedConversionsBetweenDataTypes` (presence of the map). Calls
`checkTypeConversionCompatibilityAfterEdgeAddition(projectedState, ...)`
(`src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`checkTypeConversionCompatibilityAfterEdgeAddition`):

- Same resolved type → always pass.
- Different types → allowed only if
  `allowedConversionsBetweenDataTypes[sourceType][targetType]` is truthy, **or**
  both types are complex and
  `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` is
  `true` (in which case complex-to-complex conversions pass without an explicit
  map entry, having already cleared step 11).

On failure returns `err({ code: 'CONVERSION_NOT_ALLOWED', from, to })`.

### 13. Success

Returns
`ok({ kind: 'ADD_EDGE', connection, inference: inferencePlan, handleInsertions: [] })`.

### Max connections (UI-level gate, not part of the gauntlet)

The `maxConnections` constraint is enforced at the ReactFlow `<Handle>` level in
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareHandle.tsx`
› `ContextAwareHandle`, **not** in `validateAddEdge`. The component reads the
live connection count with `useNodeConnections()` and disables the handle when
the limit is reached:

```typescript
const connections = isCurrentlyInsideReactFlow
  ? useNodeConnections({ handleId: id, handleType: type })
  : [];
const canConnect =
  maxConnections !== undefined
    ? connections.length < maxConnections
    : undefined;
// passed to <Handle isConnectable / isConnectableStart / isConnectableEnd>
```

When `maxConnections` is `undefined`, connections are unlimited. It can be set
on the `DataType` definition (applies to all handles of that type) or on an
individual handle (overrides the data-type default). Because this is a UI gate,
it prevents the user from _starting_ an over-limit connection rather than
rejecting one in the reducer.

## What applyPlan does on success

After validation, `applyValidatedAction` runs `applyPlan` inside Immer's
`produce`. For an `AddEdgePlan` (`planApply/applyPlan.ts`, case `'ADD_EDGE'`)
it:

1. Mints the real edge id (`generateRandomString`) and assembles the full
   `configurableEdge` object.
2. Captures pre-inference handle data (needed to detect infer handles for group
   duplication).
3. Applies the plan's `nodeDataReplacements` to the draft (deep-cloning each
   `newData` with `structuredClone` so later splices don't hit frozen objects).
4. De-duplicates handle names, then runs handle duplication on the draft via the
   still-mutating helpers: `addDuplicateHandlesToLoopNodesAfterInference`,
   `addDuplicateHandlesToSwitchNodesAfterInference` (plus switch zone-prefix and
   re-dedup passes), and `addDuplicateHandleToNodeGroupAfterInference`.
5. Pushes the new edge.
6. Recomputes zone memberships for all structures via
   `recomputeAllZoneMemberships`.

This is why type inference and handle duplication are observable as side effects
of adding an edge even though `validateAddEdge` itself is pure.

## Feature Flags

All flags live on the `State` object (`nodeStateManagement/types.ts`).

| Flag                                                                      | Type                                  | Default                   | Effect                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `enableCycleChecking`                                                     | `boolean?`                            | `undefined` (disabled)    | Step 2: DFS cycle detection before edge addition.                                                    |
| `enableTypeInference`                                                     | `boolean?`                            | `undefined` (disabled)    | Step 9: dry-run `inferFromConnection` resolution; on success, apply performs the real inference.     |
| `enableComplexTypeChecking`                                               | `boolean?`                            | `undefined` (disabled)    | Step 11: Zod/complex-schema compatibility validation.                                                |
| `allowedConversionsBetweenDataTypes`                                      | `AllowedConversionsBetweenDataTypes?` | `undefined` (all allowed) | Step 12: when set, restricts conversions to those listed in the map.                                 |
| `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` | `boolean?`                            | `undefined` (disabled)    | Step 12: when `true`, allows complex→complex conversions without an explicit map entry.              |
| `enableRecursionChecking`                                                 | `boolean?`                            | `undefined` (disabled)    | Prevents recursive nesting of node groups (used elsewhere, not in the edge gauntlet).                |
| `nodeCountConstraints`                                                    | `NodeCountConstraints?`               | `undefined`               | Min/max node counts per type (enforced for ADD_NODE and node removal in `validators.ts`, not edges). |
| `maxConnections`                                                          | `number?`                             | `undefined` (unlimited)   | Per-handle / per-data-type connection cap; enforced at the `<Handle>` component level.               |

**Note:** Steps 7 (loop) and 7b (switch) have **no** flag — they always run,
even when no loop/switch nodes exist (the validators short-circuit to valid in
that case). When none of the three type flags are set, step 8 returns the plan
immediately after the structural checks.

## Delete Validation

### canRemoveLoopNodesAndEdges

**Location:** `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts` ›
`canRemoveLoopNodesAndEdges`. Despite its name, it now guards both loop and
switch integrity. It returns a `{ validation: ConnectionValidationResult }`.
Four rules:

1. **Loop nodes must be deleted together.** If any loop node of a triplet is in
   the deletion set, all three (loopStart, loopStop, loopEnd) must be present —
   else "Loop nodes all need to be removed together, can't partially remove
   them".
2. **Switch nodes must be deleted together.** If any switch node of a pair is
   being deleted, both (switchStart, switchEnd) must be present — else "Switch
   nodes must be removed together, can't partially remove them".
3. **Loop bind edges cannot be removed individually.** Deleting a
   `bindLoopNodes` edge requires all three triplet nodes to be in the deletion
   set — else "Cannot disconnect loop nodes bind edges once fully connected, to
   delete, select all connected loop nodes and delete them at once".
4. **Switch bind edges cannot be removed individually.** Deleting a
   `bindSwitchNodes` edge requires both switch nodes in the deletion set — else
   "Cannot disconnect switch nodes bind edge once connected, to delete, select
   both switch nodes and delete them at once".

It accepts either id arrays or node/edge arrays for both `nodesToRemove` and
`edgesToRemove`.

### onBeforeDelete handler

**Location:** `src/components/organisms/FullGraph/FullGraph.tsx` ›
`onBeforeDelete`. The `onBeforeDelete` callback on the ReactFlow component calls
`canRemoveLoopNodesAndEdges` with the current scope's nodes/edges and the
proposed deletions, emits a `ui:delete:attempted` graph event (with `success`
and, on failure, `reason`), and returns `success` to allow or cancel the
deletion:

```typescript
onBeforeDelete={async ({ nodes, edges }) => {
  const nodesAndEdgesInCurrentNodeGroup = getCurrentNodesAndEdgesFromState(state);
  const validation = canRemoveLoopNodesAndEdges(
    { ...state, ...nodesAndEdgesInCurrentNodeGroup },
    nodes,
    edges,
  );
  const success = validation.validation.isValid;
  onGraphEvent?.({
    kind: 'ui:delete:attempted',
    success,
    reason: success ? undefined : validation.validation.reason,
    nodeIds: nodes.map((n) => n.id),
    edgeIds: edges.map((e) => e.id),
  });
  return success;
}}
```

### Edge removal type-inference reset

Edge _removal_ does not go through `validateAddEdge`. Instead,
`validateAction`'s `UPDATE_EDGES_BY_REACT_FLOW` case packages each removal into
an `EdgeChangeStep` by calling the now-**pure**
`removeEdgeWithTypeChecking(edge, { ...state, ...view }, change)`
(`src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`removeEdgeWithTypeChecking`). When `enableTypeInference` is on, that function
runs `inferTypesAfterEdgeRemoval`
(`src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`inferTypesAfterEdgeRemoval`): when the last connection to a set of
`inferFromConnection` handles is removed, the inferred type is reset to the
original handle definition. `applyPlan`'s `UPDATE_EDGES_RF` case then writes the
precomputed `updatedNodes`/`updatedEdges` back to the draft (only if
`validation.isValid`).

## Validation Order and Short-Circuiting

The gauntlet is strictly ordered and returns on the first failure:

```
1.  Null endpoint checks      -- always
2.  Cycle check               -- only if enableCycleChecking
3.  Scope-local view          -- always
4.  Duplicate check           -- always (ReactFlow reference equality)
5.  Placeholder edge          -- always
6.  Resolve nodes + handles   -- always
7.  Loop validation           -- always (no flag)
7b. Switch validation         -- always (no flag)
8.  Early return              -- if no type flags set -> ok(plan)
9.  Inference plan (dry-run)  -- only if enableTypeInference
10. Build projected state     -- only if a type flag is set
11. Complex type check        -- only if enableComplexTypeChecking
12. Conversion check          -- only if allowedConversionsBetweenDataTypes
13. Success                   -- ok(AddEdgePlan)
```

Each later step guards on its own flag; there is no shared mutable `isValid`
accumulator (unlike the legacy path). Steps 11/12 operate on the **projected**
state from step 10, so they validate post-inference types. The max-connections
gate is independent and lives at the UI/Handle level.

## Limitations and Notes

- **Cycle rejection carries no human reason.** Step 2 returns a typed
  `CYCLE_DETECTED` (with node ids) but no `reason` string; callers needing a
  message must format one from the code.
- **Complex schema identity is by reference, not deep equality.** Step 11 treats
  two complex types as the same when their `complexSchema` object references are
  identical (data types are immutable singletons). Two
  structurally-equal-but-separately-constructed schemas would be treated as
  different.
- **Max connections is UI-level only.** Enforced via `isConnectable` on the
  `<Handle>`; programmatic edge additions that bypass the UI are not capped.
- **Type inference is order-dependent.** When both handles are
  `inferFromConnection` and neither is inferred, the connection is rejected; the
  user must connect to a concrete type first.
- **Loop and switch validation always run.** Even with no loop/switch nodes
  present, steps 7 and 7b execute (and short-circuit to valid). When structures
  exist, they consult enforced zones first and fall back to BFS region
  computation.
- **`addEdgeWithTypeChecking` is test-only.** The live add path is
  `validateAddEdge`; do not route new code through the legacy mutating function.

## Examples

**Example 1 — simple valid connection (no flags)**

```
State: {}  // no type flags
Connection: Node A (output: "string") -> Node B (input: "string")
Gauntlet: null checks -> (no cycle flag) -> dup check -> loop (valid, no loops)
          -> switch (valid, no switches) -> step 8 early return
Result: ok({ kind: 'ADD_EDGE', inference: { nodeDataReplacements: [] } })
```

**Example 2 — cycle detection**

```
State: { enableCycleChecking: true }
Graph: A -> B -> C
Connection: C -> A
Gauntlet: step 2 DFS from A reaches C via A->B->C
Result: err({ code: 'CYCLE_DETECTED', sourceNodeId: 'C', targetNodeId: 'A' })
```

**Example 3 — type inference**

```
State: { enableTypeInference: true }
Connection: Node A (output: "number") -> Node B (input: loopInfer/inferFromConnection, not yet inferred)
Gauntlet: ... -> step 9 planInferenceForEdgeAddition:
  target handle is inferFromConnection & uninferred; source is concrete "number"
  -> plan a nodeDataReplacement inferring target's handle(s) as "number"
Result: ok({ kind: 'ADD_EDGE', inference: { nodeDataReplacements: [{ nodeId: B, newData }] } })
        (applyPlan then writes the inference and may duplicate loop infer handles)
```

**Example 4 — complex type mismatch**

```
State: { enableComplexTypeChecking: true }
Connection: A (output: complex/UserSchema) -> B (input: complex/OrderSchema)
Gauntlet: ... -> step 11: both complex, different dataTypeUniqueId & schema refs
Result: err({ code: 'COMPLEX_TYPE_MISMATCH', sourceTypeId: <srcHandleId>, targetTypeId: <tgtHandleId> })
```

**Example 5 — disallowed conversion**

```
State: { allowedConversionsBetweenDataTypes: { number: { string: true } } }
Connection: A (output: "string") -> B (input: "number")   // reverse direction
Gauntlet: ... -> step 12: types differ; map has no string->number entry
Result: err({ code: 'CONVERSION_NOT_ALLOWED', from: <srcHandleId>, to: <tgtHandleId> })
```

**Example 6 — loop region violation**

```
Connection: bodyNode (inside LoopStart<->LoopStop region) -> downstreamNode (outside loop)
Gauntlet: ... -> step 7 isLoopConnectionValid, Case 3 (neither is a loop node):
  verifyParentLoopRegionsAreValid finds source inside, target outside
Result: err({ code: 'LOOP_PATH_INVALID',
              reason: "Can't connect a node from inside the loop to a node from outside the loop" })
```

**Example 7 — switch cross-branch violation**

```
Connection: trueBranchNode -> falseBranchNode (same switch)
Gauntlet: ... -> step 7b isSwitchConnectionValid, Case 1:
  source in trueBranch zone, target in falseBranch zone
Result: err({ code: 'SWITCH_PATH_INVALID',
              reason: "Can't connect nodes across true and false branches of the same switch" })
```

**Example 8 — delete a single loop node**

```
Deletion: select only loopStart, press Delete
onBeforeDelete -> canRemoveLoopNodesAndEdges:
  loopStart is in the set, loopStop and loopEnd are not
Result: { validation: { isValid: false,
          reason: "Loop nodes all need to be removed together, can't partially remove them" } }
  -> handler emits ui:delete:attempted (success=false) and returns false (deletion cancelled)
```

## Relationships with Other Features

### -> [State Management](../core/stateManagementDoc.md)

Connection validation is the `ADD_EDGE_BY_REACT_FLOW` branch of
`validateAction`, the Plan half of the `validate -> plan -> apply` cycle.
`validateAddEdge` is pure and returns a `Result<AddEdgePlan, ValidationError>`;
`applyPlan` performs the edge insertion, inference application, handle
duplication, and zone recomputation on the Immer draft. Edge removal is the
`UPDATE_EDGES_BY_REACT_FLOW` branch.

### -> [Edges](../core/edgesDoc.md)

Every edge in the graph has passed the gauntlet. Edge removal runs the pure
`removeEdgeWithTypeChecking`, which triggers `inferTypesAfterEdgeRemoval` to
reset inferred types when the last relevant connection is removed.

### -> [Data Types](../core/dataTypesDoc.md)

The `underlyingType` on a data type (`string`, `number`, `boolean`, `complex`,
`noEquivalent`, `inferFromConnection`) drives steps 9, 11, and 12.
`complexSchema` backs the complex-type check; `maxConnections` backs the UI
handle gate.

### -> [Handles](../core/handlesDoc.md)

Handles are the connection endpoints. `HandleIndices` (resolved in step 6 via
`getHandleFromNodeDataMatchingHandleId`) locate handles within node data. A
handle's `inferredDataType` and
`getResultantDataTypeOfHandleConsideringInferredType` determine the effective
type used by the complex/conversion checks. The `maxConnections` cap can be set
per handle.

### -> [Type Inference](../core/typeInferenceDoc.md)

Inference is integrated as a **dry-run plan** (`planInferenceForEdgeAddition`)
during validation; the real mutation (and the loop/switch/group handle
duplication that follows it) happens in `applyPlan`. Inference both gates the
connection (impossible inference → `TYPE_INFERENCE_FAILED`) and computes the
node-data replacements carried in the `AddEdgePlan`.

### -> [Loops](loopsDoc.md)

Step 7 (`isLoopConnectionValid`) enforces bind order
(`loopStart->loopStop->loopEnd`), uniform handle inference across the triplet,
region isolation (consulting enforced `preStop`/`postStop` zones),
series/nesting rules for multiple structures, and parent-region consistency.
Delete validation keeps the triplet and its bind edges atomic.

### -> [Switches](switchesDoc.md)

Step 7b (`isSwitchConnectionValid`) enforces bind order
(`switchStart->switchEnd`), true/false branch isolation (consulting enforced
`trueBranch`/`falseBranch` zones and `isNodeReachableToBoundary`), zoned-handle
matching, and the prohibition on body nodes wiring to non-zoned switch handles.
Delete validation keeps the switch pair and its bind edge atomic.

### -> [Node Groups](nodeGroupsDoc.md)

When a group is open, step 3 scopes validation to the subtree's
nodes/edges/zones. Group input/output boundary nodes get special handling in the
inference plan (`overrideDataType`/`overrideName`), and `applyPlan` propagates
inferred handles onto boundary nodes via
`addDuplicateHandleToNodeGroupAfterInference`. Loop/switch validators also treat
group input/output nodes specially when deciding region placement.

### -> [Zones](zonesDoc.md)

First-class zones (`zones/`) carry an `enforced` flag and `boundaryHandles`/
`structureLink` metadata. Loop and switch validators prefer enforced zones
(`findZoneByStructure`) over recomputing regions by BFS, and
`isNodeReachableToBoundary` backs the "must route through the boundary" rules.
`applyPlan` keeps zone memberships current via `recomputeAllZoneMemberships`
after every edge change.
