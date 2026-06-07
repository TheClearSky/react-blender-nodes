# Type Inference

## Overview

Type inference is the system that resolves `inferFromConnection` data types when
edges are added or removed. Handles with the `inferFromConnection` underlying
type have no concrete type until they are connected to another handle that does.
The inference system:

1. Copies the concrete type from the non-infer handle to the infer handle when
   an edge is added
2. Cascades the inferred type across all handles of the same node that share the
   same data type identifier (`dataTypeUniqueId`)
3. Resets inferred types when the last connection to any handle of that data
   type on a node is removed
4. Adds duplicate infer handles on group, loop, and switch nodes after
   inference, so further connections can be made

This system is opt-in via `state.enableTypeInference`. When disabled,
`inferFromConnection` handles are never resolved and connections are allowed
without inference (but loop/switch structural validation and cycle checking
still run).

### Pure plan/apply architecture (important)

Inference is now part of the **pure validate → plan → apply pipeline**, not a
mutating reducer pass. On edge addition:

- `validateAction` (in `src/utils/nodeStateManagement/planApply/validators.ts` ›
  `validateAction`) dispatches `ADD_EDGE_BY_REACT_FLOW` to `validateAddEdge`.
- `validateAddEdge` calls `planInferenceForEdgeAddition` which runs inference in
  **dry-run mode** (`mutate = false`), accumulating projected node-data into a
  `Map` so that successive inference calls see prior results. It returns an
  `InferencePlan` (`{ nodeDataReplacements: Array<{nodeId, newData}> }`) instead
  of mutating state. **No ids are minted and no handles are duplicated during
  validation** — that keeps `validateAction` deterministic and replay-safe.
- Complex-type and conversion checks then run against a **projected**
  post-inference state built by `applyInferencePlanToProjection` (a shallow copy
  with replaced node data).
- `applyPlan` (the `ADD_EDGE` case) mints the edge id, deep-`structuredClone`s
  the replacement node data into the Immer draft, deduplicates handle names,
  runs handle **duplication** for loops/switches/groups, applies switch
  zone-prefix renaming, pushes the edge, and recomputes zone memberships.

The legacy mutating entry point `addEdgeWithTypeChecking`
(`src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`addEdgeWithTypeChecking`) still exists and still calls
`inferTypesAfterEdgeAddition`, but it is **only referenced by tests**
(`src/__tests__/utils/nodeStateManagement/edgeValidation.test.ts` ›
`Edge validation pipeline`); production addition no longer uses it. Edge
_removal_, by contrast, still flows through `removeEdgeWithTypeChecking` →
`inferTypesAfterEdgeRemoval` (called from the `UPDATE_EDGES_BY_REACT_FLOW` case
of `validateAction`).

## Entity-Relationship Diagram

```
+------------------+        +------------------+        +------------------+
|     State        |        |      Node        |        |     Handle       |
|------------------|        |------------------|        |------------------|
| enableTypeInfer- |1     * | nodeTypeUniqueId |1     * | id               |
|   ence: boolean  |------->| data             |------->| name             |
| dataTypes        |        |                  |        | dataType         |
| typeOfNodes      |        +------------------+        | inferredDataType |
| nodes            |                                    +------------------+
| edges            |                                           |
+------------------+                                           |
       |                                                       |
       |1                                            uses      |
       |                                                       v
       |         +------------------+        +---------------------------+
       |       * |      Edge        |        |       DataType            |
       +-------->|------------------|        |---------------------------|
                 | source           |        | name                      |
                 | target           |        | underlyingType            |
                 | sourceHandle     |        |   'inferFromConnection'   |
                 | targetHandle     |        |   | 'string' | 'number'   |
                 +------------------+        |   | 'boolean' | 'complex' |
                                             |   | 'noEquivalent'        |
                                             | color                     |
                                             +---------------------------+
```

`underlyingType` is one of EXACTLY six values defined by
`supportedUnderlyingTypes` (`src/utils/nodeStateManagement/types.ts` ›
`supportedUnderlyingTypes`): `'string'`, `'number'`, `'boolean'`, `'complex'`,
`'noEquivalent'`, `'inferFromConnection'`.

## Functional Dependency Diagram

```
ACTIVE PATH (production) — pure plan/apply
==========================================

validateAction (planApply/validators.ts)
  |
  +-- ADD_EDGE_BY_REACT_FLOW --> validateAddEdge (planApply/validateAddEdge.ts)
  |     |
  |     +-- null checks (MISSING_ENDPOINT)
  |     +-- [enableCycleChecking?] willAddingEdgeCreateCycle (CYCLE_DETECTED)
  |     +-- duplicate check via addEdge() (DUPLICATE_EDGE)
  |     +-- isLoopConnectionValid          (LOOP_PATH_INVALID)
  |     +-- isSwitchConnectionValid        (SWITCH_PATH_INVALID)
  |     +-- [enableTypeInference?]
  |     |     planInferenceForEdgeAddition  (planApply/planInference.ts)
  |     |       |
  |     |       +-- inferTypeAcrossTheNodeForHandleOfDataType(mutate=false)
  |     |       |     '-- inferTypeOnHandleAfterConnectingWithAnotherHandle
  |     |       '-- returns InferencePlan { nodeDataReplacements } (TYPE_INFERENCE_FAILED)
  |     |
  |     +-- applyInferencePlanToProjection  (shallow projected state)
  |     +-- [enableComplexTypeChecking?] checkComplexTypeCompatibilityAfterEdgeAddition (COMPLEX_TYPE_MISMATCH)
  |     +-- [allowedConversionsBetweenDataTypes?] checkTypeConversionCompatibilityAfterEdgeAddition (CONVERSION_NOT_ALLOWED)
  |     '-- ok(AddEdgePlan { connection, inference, handleInsertions:[] })
  |
  +-- UPDATE_EDGES_BY_REACT_FLOW
        '-- removeEdgeWithTypeChecking (constructAndModifyHandles.ts)  [PURE — returns updatedNodes/edges]
              '-- [enableTypeInference?] inferTypesAfterEdgeRemoval (newOrRemovedEdgeValidation.ts)
                    +-- getConnectedEdges()  (@xyflow/react)
                    +-- getAllHandlesFromNodeData()
                    '-- inferTypeAcrossTheNodeForHandleOfDataType (resetInferredType:true)

applyPlan (planApply/applyPlan.ts) — ADD_EDGE case
  |
  +-- mint edge id (generateRandomString(20))
  +-- capture PRE-inference handles (for group duplication detection)
  +-- structuredClone newData into draft for each nodeDataReplacement
  +-- ensureAllHandleNamesUnique (skips switch nodes here)
  +-- addDuplicateHandlesToLoopNodesAfterInference   (loops/loopHandleSync.ts)
  +-- addDuplicateHandlesToSwitchNodesAfterInference (switches/switchHandleSync.ts)
  +-- applySwitchZonePrefixesOnDraft + ensureAllHandleNamesUnique (switches)
  +-- addDuplicateHandleToNodeGroupAfterInference    (nodes/nodeGroups.ts)
  +-- push edge
  '-- recomputeAllZoneMemberships
```

## Data Flow Diagram

```
EDGE ADDITION FLOW (planInferenceForEdgeAddition, mutate = false)
=================================================================

Connection: Handle A (output) ----edge----> Handle B (input)
                |                                    |
                v                                    v
     Is A.underlyingType              Is B.underlyingType
     'inferFromConnection'?           'inferFromConnection'?
          |        |                       |        |
         YES      NO                     YES      NO
          |                                |
          +--------------+-----------------+
                         |
                         v
              Determine inference direction:
              +------------------------------------+
              | Case 1: Only A is infer            |
              |   already inferred? -> ok (no-op)  |
              |   else copy B's type to A's node   |
              |                                    |
              | Case 2: Only B is infer            |
              |   already inferred? -> ok (no-op)  |
              |   else copy A's type to B's node   |
              |                                    |
              | Case 3: Both are infer             |
              |   neither inferred -> ERR          |
              |     (TYPE_INFERENCE_FAILED)        |
              |   both inferred -> ok (no-op)      |
              |   one inferred -> copy to other    |
              |                                    |
              | Case 4: Neither is infer           |
              |   -> ok, empty plan                |
              +------------------------------------+
                         |
                         v
              inferTypeAcrossTheNodeForHandleOfDataType(mutate=false)
              +------------------------------------+
              | produce() a NEW node data where    |
              | every handle with                  |
              |   dataType.dataTypeUniqueId ==     |
              |   dataTypeToInferFor:              |
              |     -> set inferredDataType        |
              |     -> if overrideDataType: also   |
              |        set dataType = inferred      |
              |     -> if overrideName: copy name  |
              | overrideDataType/overrideName are  |
              | true for GROUP boundary, LOOP, and |
              | SWITCH nodes.                       |
              +------------------------------------+
                         |
                         v
              replacements.set(nodeId, newData)
              -> InferencePlan.nodeDataReplacements

(Handle DUPLICATION is NOT done here. It runs later in applyPlan,
 on the Immer draft, after structuredClone of newData.)


EDGE REMOVAL FLOW (inferTypesAfterEdgeRemoval)
==============================================

removeEdgeWithTypeChecking(removedEdge, state, change)
                |
                v
     For each side (source / target) whose handle has
     underlyingType === 'inferFromConnection':
                |
                v
     Build set of handle ids on that node sharing the
     same dataTypeUniqueId (inputs + outputs)
                |
                v
     Scan getConnectedEdges(node) excluding removedEdge:
     is ANY of those handle ids still connected?
         |              |
        YES            NO
         |              |
         v              v
     keep inferred   reset inferred type across the node via
                     inferTypeAcrossTheNodeForHandleOfDataType
                     with resetInferredType: true and the
                     ORIGINAL handle template rebuilt by
                     constructTypeOfHandleFromIndices
```

## System Diagram

```
+-----------------------------------------------------------------------+
|                          State                                        |
|                                                                       |
|  enableTypeInference: true                                            |
|                                                                       |
|  dataTypes: {                                                         |
|    groupInfer:  { underlyingType: 'inferFromConnection', ... }        |
|    loopInfer:   { underlyingType: 'inferFromConnection', ... }        |
|    switchInfer: { underlyingType: 'inferFromConnection', ... }        |
|    myString:    { underlyingType: 'string', ... }                     |
|  }                                                                    |
|                                                                       |
|  +--------------------+          +--------------------+               |
|  | Node: LoopStart    |          | Node: SomeNode     |               |
|  |--------------------|          |--------------------|               |
|  | inputs:            |          | outputs:           |               |
|  |  [0] loopInfer     |<---edge--| [0] myString       |               |
|  |      inferredData- |          |     (concrete)     |               |
|  |      Type: myString|          +--------------------+               |
|  | outputs:           |                                               |
|  |  [0] bindLoopNodes |                                               |
|  |  [1] loopInfer     |          Cascading: input[0] inferred         |
|  |      inferredData- |          -> output[1] also gets inferred      |
|  |      Type: myString|          (same dataType: 'loopInfer')         |
|  +--------------------+                                               |
|                                                                       |
+-----------------------------------------------------------------------+

EDGE-ADDITION PIPELINE (validateAddEdge, then applyPlan):
+----------------+   +----------------+   +----------------+   +----------------+
| 1. structural  |-->| 2. inference   |-->| 3. complex +   |-->| 4. apply       |
|    validation   |   |    PLANNING    |   |    conversion  |   |    (mutating)  |
| cycle / loop / |   | planInference- |   | checks on      |   | structuredClone|
|   switch        |   |   ForEdge...   |   | PROJECTED state|   | + duplication  |
| (validateAddEdge)|  | (mutate=false) |   |                |   | + push edge    |
+----------------+   +----------------+   +----------------+   +----------------+
```

## How Inference Works

### The inferFromConnection Type

`inferFromConnection` is one of the six underlying types in
`supportedUnderlyingTypes` (`src/utils/nodeStateManagement/types.ts` ›
`supportedUnderlyingTypes`). Unlike `string`, `number`, `boolean`, `complex`,
and `noEquivalent`, it has no concrete value semantics. Instead, it acts as a
placeholder that says "I'll become whatever type I'm connected to."

Three standard data types use it (all defined in
`src/utils/nodeStateManagement/standardNodes.ts` › `standardDataTypeNamesMap`):

- **`groupInfer`** — used on `groupInput` outputs and `groupOutput` inputs
- **`loopInfer`** — used on `loopStart`, `loopStop`, and `loopEnd` infer handles
- **`switchInfer`** — used on `switchStart` and `switchEnd` zoned data handles

Each handle stores two type fields:

- `dataType` — the declared type (e.g.,
  `{ dataTypeUniqueId: 'loopInfer', dataTypeObject: { underlyingType: 'inferFromConnection' } }`)
- `inferredDataType` — populated when inference resolves the concrete type
  (e.g.,
  `{ dataTypeUniqueId: 'myString', dataTypeObject: { underlyingType: 'string' } }`)

> Note on instantiated handles: when a handle is constructed
> (`constructInputOrOutputOfType`), every underlying type that is NOT
> `number`/`string`/`boolean` — i.e. `complex`, `noEquivalent`,
> `inferFromConnection` — collapses to the discriminated handle
> `type: 'unsupportedDirectly'`. Inference reads
> `dataType.dataTypeObject.underlyingType`, not this discriminator, so it still
> works on `unsupportedDirectly` handles.

### On Edge Addition (planning)

When `state.enableTypeInference` is `true`, `validateAddEdge` calls
`planInferenceForEdgeAddition`. It reads source/target handles from a
**projection** (`getProjectedNodeData`) so successive inferences compound, then:

1. **Reads both handles** and their `dataType` / `inferredDataType`
2. **Checks if either handle has `underlyingType === 'inferFromConnection'`**
3. **Determines the inference direction** across four cases:
   - **Neither is infer** → returns an empty plan (`ok`, valid)
   - **Only source is infer** → if already inferred, no-op; else infer source
     node from the target handle
   - **Only target is infer** → if already inferred, no-op; else infer target
     node from the source handle
   - **Both are infer** → if neither is inferred, error
     (`TYPE_INFERENCE_FAILED`, "inference has no information to work with"); if
     both are inferred, no-op (compatibility checked later); if exactly one is
     inferred, copy it to the other
4. **Sets `overrideDataType` / `overrideName`** to `true` when the node to
   update is a group boundary node
   (`isSourceNodeGroupInput`/`isTargetNodeGroupOutput`), a loop node
   (`isLoopNode`), OR a switch node (`isSwitchNode`)
5. **Runs `inferTypeAcrossTheNodeForHandleOfDataType(..., mutate=false)`** to
   produce the new node data, stores it in the replacements `Map`, and returns
   it as `InferencePlan.nodeDataReplacements`

Handle duplication is deliberately **not** planned here (see
`src/utils/nodeStateManagement/planApply/planInference.ts` ›
`planInferenceForEdgeAddition`, "Option A"); it runs during apply.

### On Edge Addition (apply)

`applyPlan`'s `ADD_EDGE` case
(`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`) does the
actual mutation on the Immer draft:

1. **Mints the edge id** (`generateRandomString(20)`) — validation never mints
   ids, so the plan only carries the validated `Connection`.
2. **Captures pre-inference handles** for the source/target so group duplication
   can still detect which side was originally `inferFromConnection` (after
   `overrideDataType`, the handle's `dataType` is no longer infer).
3. **Applies inference**: for each `nodeDataReplacement`, it
   **`structuredClone`s** `newData` before assigning into the draft. This is
   required because the prior committed state is Immer-frozen; assigning the
   frozen `newData` directly would make the subsequent splice-based handle
   duplication throw "object is not extensible".
4. **Deduplicates handle names** via `ensureAllHandleNamesUnique` on each
   replaced node (switch nodes are skipped at this step; they are deduped later,
   after zone prefixes are applied).
5. **Writes back** via `setCurrentNodesAndEdgesToStateWithMutatingState`.
6. **Runs handle duplication** (only if source or target was inferred):
   `addDuplicateHandlesToLoopNodesAfterInference`,
   `addDuplicateHandlesToSwitchNodesAfterInference`, switch zone-prefix renaming
   (`applySwitchZonePrefixesOnDraft`) plus a switch-specific dedup, and
   `addDuplicateHandleToNodeGroupAfterInference` (only when inside an open node
   group).
7. **Pushes the edge** into the current scope's edges.
8. **Recomputes zone memberships** (`recomputeAllZoneMemberships`) when zones
   exist.

### On Edge Removal

Edge removal still uses the (pure) `removeEdgeWithTypeChecking`, invoked from
the `UPDATE_EDGES_BY_REACT_FLOW` case of `validateAction`. When
`state.enableTypeInference` is `true`, it calls `inferTypesAfterEdgeRemoval`.
For each side of the removed edge whose handle has
`underlyingType === 'inferFromConnection'`:

1. **Collects all handle ids on the node** that share the same
   `dataTypeUniqueId` (inputs and outputs, via `getAllHandlesFromNodeData`)
2. **Scans the node's connected edges** (`getConnectedEdges`, excluding the
   removed edge) to see if any of those handle ids are still connected
3. **If none are connected**, resets the inferred type across the entire node by
   calling `inferTypeAcrossTheNodeForHandleOfDataType` with
   `resetInferredType: true` and the original handle template from
   `constructTypeOfHandleFromIndices`
4. **If at least one handle is still connected**, the inferred type is preserved

`inferTypesAfterEdgeRemoval` returns new arrays (it does NOT mutate in place);
`applyPlan`'s `UPDATE_EDGES_RF` case writes them back. Note: removal does
**not** remove the duplicated handles added during inference — they remain.

### Cascading Across Node Handles

`inferTypeAcrossTheNodeForHandleOfDataType`
(`src/utils/nodeStateManagement/edges/typeInference.ts` ›
`inferTypeAcrossTheNodeForHandleOfDataType`) iterates over **all** handles
(inputs and outputs, panels flattened) on a node via
`transformHandlesInNodeDataInPlace`. For each handle whose
`dataType.dataTypeUniqueId` matches the `dataTypeToInferFor` parameter, it calls
`inferTypeOnHandleAfterConnectingWithAnotherHandle`. It accepts a `mutate` flag
(default `true`): when `true` it mutates the node data in place; when `false` it
returns a new copy via Immer's `produce`.

This means if a `loopStart` node has input `[0]` and output `[1]` both with
`dataType: loopInfer`, connecting input `[0]` to a `string` handle gives
**both** input `[0]` and output `[1]` the inferred `string` type. This cascade
is what makes loop/switch data flow work — the type propagates from the input
side through to the output side of the same node.

### Dynamic Handle Addition After Inference

After inference is applied (in `applyPlan`), new empty infer handles are added
so that additional connections can be made:

- **For node groups**: `addDuplicateHandleToNodeGroupAfterInference` adds a new
  infer handle at the end of the group input's outputs or group output's inputs,
  and propagates it across the entire node type tree (node-type definition + all
  subtrees + all instances) via
  `addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees`.
- **For loop nodes**: `addDuplicateHandlesToLoopNodesAfterInference` adds a new
  input AND output infer handle to the inferred node, then cascades the inferred
  type to the OTHER TWO triplet nodes and adds matching handle pairs to them.
- **For switch nodes**: `addDuplicateHandlesToSwitchNodesAfterInference` adds
  true-zone and false-zone template handles to the inferred node, then cascades
  to its sibling (switchStart ↔ switchEnd) and adds matching templates there.

## Key Functions

### inferTypeOnHandleAfterConnectingWithAnotherHandle

**File**: `src/utils/nodeStateManagement/edges/typeInference.ts` ›
`inferTypeOnHandleAfterConnectingWithAnotherHandle`

The lowest-level inference function (module-private — not exported). Given a
handle and a connected handle's info, it:

1. Determines `inferredDataType` from the connected handle, preferring its
   `inferredDataType` over its `dataType`; if `resetInferredType` is true, sets
   it to `undefined`
2. If `overrideDataType` is true, also writes `dataType = inferredDataType`
3. Copies non-id/name/dataType/inferredDataType properties (e.g. `allowInput`,
   `maxConnections`) from the connected handle when it has a full `dataType`
4. If `overrideName` is true and the connected handle has a name, copies `name`
5. Builds the update object with `_.cloneDeep`, then either `Object.assign`s it
   onto the handle (mutate) or returns an Immer `produce`d copy (immutable)

### inferTypeAcrossTheNodeForHandleOfDataType

**File**: `src/utils/nodeStateManagement/edges/typeInference.ts` ›
`inferTypeAcrossTheNodeForHandleOfDataType`

The only exported function in this module. Cascades inference across an entire
node. Given node data, a `dataTypeToInferFor`, connected-handle info, and a
`mutate` flag, it calls `transformHandlesInNodeDataInPlace` and, for every
handle whose `dataType.dataTypeUniqueId === dataTypeToInferFor`, applies
`inferTypeOnHandleAfterConnectingWithAnotherHandle`. With `mutate=false` it
wraps the whole transform in `produce`.

### planInferenceForEdgeAddition

**File**: `src/utils/nodeStateManagement/planApply/planInference.ts` ›
`planInferenceForEdgeAddition`

The ACTIVE edge-addition inference planner. Mirrors the control flow of the
legacy `inferTypesAfterEdgeAddition` but **collects an `InferencePlan` instead
of mutating**. It uses a projection `Map` so chained inferences see prior
dry-run results, runs
`inferTypeAcrossTheNodeForHandleOfDataType(..., mutate=false)`, and returns
`Result<{ inference, handleInsertions, validation }, ValidationError>`. On
failure it returns `err({ code: 'TYPE_INFERENCE_FAILED', reason })`.

### applyInferencePlanToProjection

**File**: `src/utils/nodeStateManagement/planApply/planInference.ts` ›
`applyInferencePlanToProjection`

Returns a shallow copy of state with `nodeDataReplacements` applied (O(1) lookup
map). Used by the complex-type and conversion checks so they see post-inference
data without mutating the original. Returns the input state unchanged when the
plan is empty.

### inferTypesAfterEdgeAddition (legacy)

**File**: `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`inferTypesAfterEdgeAddition`

The original mutating orchestrator. Determines which node/data type to infer,
handles the four cases, sets `overrideDataType`/`overrideName` (group/loop only
— this legacy function does NOT branch on switch nodes), mutates the node in
place via `inferTypeAcrossTheNodeForHandleOfDataType`, then calls
`addDuplicateHandleToNodeGroupAfterInference` and
`addDuplicateHandlesToLoopNodesAfterInference`. Reached only through
`addEdgeWithTypeChecking` (test-only).

### inferTypesAfterEdgeRemoval

**File**: `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`inferTypesAfterEdgeRemoval`

The active edge-removal orchestrator (reached via `removeEdgeWithTypeChecking`).
For each side of the removed edge: checks the handle is `inferFromConnection`,
collects all same-`dataTypeUniqueId` handle ids, checks remaining connections,
and if none remain resets inference with a freshly constructed original handle
template and `resetInferredType: true`. Returns `{ updatedNodes, validation }`
without mutating in place.

### getResultantDataTypeOfHandleConsideringInferredType

**File**: `src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`getResultantDataTypeOfHandleConsideringInferredType`

A utility used after inference (especially for compatibility checking). It:

1. Returns `undefined` if the handle has no `dataType`
2. If the handle's `dataType` is not `inferFromConnection`, returns it directly
3. Otherwise returns `inferredDataType` if present
4. If not inferred and `fallbackToInferFromConnectionTypeWhenNotInferred` is
   true, returns the raw `inferFromConnection` type; else returns `undefined`

## Complex Type & Conversion Checks (post-inference)

These run on the **projected** state after inference, in `validateAddEdge`.

### checkComplexTypeCompatibilityAfterEdgeAddition

**File**: `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`checkComplexTypeCompatibilityAfterEdgeAddition`

Gated by `state.enableComplexTypeChecking`. Resolves both handles via
`getResultantDataTypeOfHandleConsideringInferredType`, then:

- Neither complex → valid
- Exactly one complex → invalid ("Can't connect complex types with non-complex
  types")
- Both complex → valid only if the `dataTypeUniqueId`s match OR the
  `complexSchema` references are identical. Reference equality is sufficient
  because data types are immutable singletons defined once in state.

On failure, `validateAddEdge` returns
`err({ code: 'COMPLEX_TYPE_MISMATCH', ... })`.

### checkTypeConversionCompatibilityAfterEdgeAddition

**File**: `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`checkTypeConversionCompatibilityAfterEdgeAddition`

Gated by `state.allowedConversionsBetweenDataTypes` being defined. Allows the
connection if:

- The resolved `dataTypeUniqueId`s are equal, OR
- The conversion is listed in
  `allowedConversionsBetweenDataTypes[sourceId][targetId]`, OR
- Both are complex AND
  `state.allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking`
  is true

On failure, `validateAddEdge` returns
`err({ code: 'CONVERSION_NOT_ALLOWED', ... })`.

## Inference for Node Groups

### How groupInfer handles work

Group boundary nodes (`groupInput` and `groupOutput`) use the `groupInfer` data
type (`underlyingType: 'inferFromConnection'`), making node groups polymorphic.

- `groupInput` has one output with `dataType: groupInfer` — the handle inside
  the group that feeds data in
- `groupOutput` has one input with `dataType: groupInfer` — the handle inside
  the group that collects data out

When a concrete-typed handle connects to a group boundary handle, that handle
gets inferred. Because `overrideDataType`/`overrideName` are `true` for group
boundary nodes, the `dataType` field itself is overwritten (not just
`inferredDataType`), and the handle takes the connected handle's name.

### addDuplicateHandleToNodeGroupAfterInference

**File**: `src/utils/nodeStateManagement/nodes/nodeGroups.ts` ›
`addDuplicateHandleToNodeGroupAfterInference`

Called from `applyPlan` (with the open `nodeGroup` from the stack). It uses an
**XOR gate**: it only fires when exactly one side is (originally
`inferFromConnection` AND a group boundary). It then:

1. Constructs a new blank infer handle from the node-type template via
   `constructTypeOfHandleFromIndices` (output for groupInput, input for
   groupOutput)
2. Inserts it at the end of the handle list (`index1: -1`, `'after'`) via
   `insertOrDeleteHandleInNodeDataUsingHandleIndices`
3. Propagates the handle across the whole node-type tree via
   `addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees`, which
   updates the node-type definition, all dependent subtrees, and all root
   instances

`applyPlan` passes POST-inference handle objects (so the propagated handle
carries the inferred name/type) but PRE-inference flags to determine which side
was `inferFromConnection` (because `overrideDataType` already changed it).

## Inference for Loop Nodes

### How loopInfer handles work

Loop nodes (`loopStart`, `loopStop`, `loopEnd`) use the `loopInfer` data type
(`underlyingType: 'inferFromConnection'`). The infer handles are at fixed
indices exported from `src/utils/nodeStateManagement/standardNodes.ts` ›
`loopStartInputInferHandleIndex` and resolved by `getLoopNodeInferHandleIndex`:

| Node Type | Input Infer Index | Output Infer Index |
| --------- | ----------------- | ------------------ |
| loopStart | 0                 | 1                  |
| loopStop  | 2                 | 1                  |
| loopEnd   | 1                 | 0                  |

These indices skip over non-infer handles like `bindLoopNodes` (a `noEquivalent`
handle with `maxConnections: 1`) and `condition` (the boolean handle on
loopStop). When inference cascades on a loop node, all `loopInfer` handles on
that node get the same inferred type — both input and output infer handles.

### addDuplicateHandlesToLoopNodesAfterInference

**File**: `src/utils/nodeStateManagement/nodes/loops/loopHandleSync.ts` ›
`addDuplicateHandlesToLoopNodesAfterInference`

Called from `applyPlan`. After a loop node's infer handle is inferred it:

1. Adds a new blank input infer handle AND a new blank output infer handle to
   the inferred node (`addLoopInferDuplicateToNode`, inserting at `index1: -1`,
   `'after'`)
2. Reads the just-inferred handle (the input side,
   `{ type: 'input', index1: -2 }`) and finds the triplet via
   `getLoopStructureFromNode`
3. For each OTHER triplet node (the two not yet processed), cascades the
   inferred `loopInfer` type onto it
   (`inferTypeAcrossTheNodeForHandleOfDataType`,
   `overrideDataType`/`overrideName` true) and adds a matching input/output
   infer handle pair

So loop handle duplication is **NOT** purely local — it propagates the new
handle pair and inferred type across all three triplet nodes. Unlike node
groups, it does not touch the node-type definition or other instances (loops are
not reusable node types).

## Inference for Switch Nodes

### How switchInfer handles work

Switch nodes (`switchStart`, `switchEnd`) use the `switchInfer` data type
(`underlyingType: 'inferFromConnection'`). A switch is a PAIR
(`switchStart → switchEnd`) bound by a `bindSwitchNodes` edge. The zoned data
handles are split into true/false zones by `Math.ceil(count/2)` (first half
true, second half false). `switchStart` also carries a `condition` (boolean)
input. As with loops, inference sets `overrideDataType`/`overrideName` true for
switch nodes.

### addDuplicateHandlesToSwitchNodesAfterInference

**File**: `src/utils/nodeStateManagement/nodes/switches/switchHandleSync.ts` ›
`addDuplicateHandlesToSwitchNodesAfterInference`

Called from `applyPlan`. After a switch node's infer handle is inferred it:

1. Adds template handles for both zones to the inferred node
   (`addSwitchInferDuplicateToNode`): for `switchStart`, one input template
   (before `condition`) plus a true-zone and a false-zone output template; for
   `switchEnd`, true-zone and false-zone input templates plus an output template
2. Reads the just-inferred handle (the input side, `type: 'input'`, with
   `index1: -3` for switchStart to skip template + condition, `-2` for
   switchEnd)
3. Finds the sibling via `getSwitchStructureFromNode`, cascades the inferred
   `switchInfer` type onto it, and adds matching templates there

After duplication, `applyPlan` renames zoned handles with `True: `/`False: `
prefixes (`applySwitchZonePrefixesOnDraft`) and then runs a switch-specific
`ensureAllHandleNamesUnique` so only true cross-zone duplicates get a numeric
suffix.

## Limitations and Deprecated Patterns

1. **Two unresolved infer handles cannot connect**: if both source and target
   are `inferFromConnection` and neither is inferred, the connection is rejected
   (`TYPE_INFERENCE_FAILED`). At least one side must already have a concrete or
   inferred type.

2. **No transitive inference across edges**: inference only propagates across
   handles within the same node (same `dataTypeUniqueId`). It does not chain
   from node A through node B to node C. Each edge addition triggers inference
   independently. (Loop/switch duplication does propagate the inferred type to
   the OTHER structure nodes, but only within a single structure.)

3. **Reset is all-or-nothing per data type**: when the last edge to any handle
   of a given data type is removed, ALL handles of that data type on the node
   are reset — not just the disconnected one.

4. **No undo of dynamic handle addition**: removing an edge does not remove the
   infer handles that were duplicated during inference. The handles remain even
   after inference reset.

5. **Group propagation reads the draft node-type tree**: `applyPlan` passes the
   draft as `unmodifiedState` to `addDuplicateHandleToNodeGroupAfterInference`;
   the propagation step reuses the pre-inference flags so it can identify the
   infer side after `overrideDataType` has changed it.

6. **`addEdgeWithTypeChecking` is legacy/test-only**: the mutating addition
   entry point and `inferTypesAfterEdgeAddition` are retained for tests; the
   legacy path does not handle switch nodes. Production uses the pure
   `validateAddEdge` → `planInferenceForEdgeAddition` → `applyPlan` flow.

## Examples

### Example 1: Basic Inference on Edge Addition

```
Before connection:
  NodeA output[0]: dataType=myString (underlyingType: 'string')
  LoopStart input[0]: dataType=loopInfer (underlyingType: 'inferFromConnection')
                       inferredDataType=undefined

User connects NodeA.output[0] -> LoopStart.input[0]

Planning (mutate=false): only target is infer, not yet inferred ->
  inferTypeAcrossTheNode for loopInfer on LoopStart, overrideDataType=true.

Apply:
  LoopStart input[0]: dataType=myString (overridden), inferredDataType=myString
  LoopStart output[1]: dataType=myString, inferredDataType=myString  <-- cascaded
  LoopStart input[-1]:  NEW blank loopInfer handle   <-- duplication
  LoopStart output[-1]: NEW blank loopInfer handle   <-- duplication
  (loopStop and loopEnd in the triplet receive the same inferred type + new pairs)
```

### Example 2: Inference Reset on Edge Removal

```
Before removal:
  LoopStart input[0]: dataType/inferredDataType resolved to myString
  LoopStart output[1]: resolved to myString
  (only one edge connected to input[0])

User removes the edge to LoopStart.input[0]

inferTypesAfterEdgeRemoval checks: any loopInfer handle on LoopStart still
connected (excluding removed edge)?  -> NO

After reset:
  LoopStart input[0]/output[1]: reset to the original loopInfer template
  (inferredDataType cleared; dataType restored to loopInfer)
```

### Example 3: Both Handles Are Infer (One Already Inferred)

```
LoopStart output[1]: resolved to myString (already inferred)
LoopEnd input[1]:    dataType=loopInfer, inferredDataType=undefined

User connects LoopStart.output[1] -> LoopEnd.input[1]

Both are inferFromConnection. Source already inferred, target not ->
  copy source's resolved type to LoopEnd's loopInfer handles.

After apply:
  LoopEnd input[1]:  resolved to myString
  LoopEnd output[0]: resolved to myString  <-- cascaded
```

### Example 4: Group Node Inference with Propagation

```
Inside a node group, user connects:
  SomeNode.output[0] (dataType=myNumber) -> GroupOutput.input[0] (dataType=groupInfer)

After apply:
  GroupOutput.input[0]: dataType=myNumber (overridden), name='Value'
  GroupOutput.input[-1]: NEW blank groupInfer handle (XOR gate fired)

The node-group TYPE definition also gets a new output added, and every instance
of this node group in the graph (and dependent subtrees) gets the new output.
```

## Relationships with Other Features

### -> [Data Types](dataTypesDoc.md)

Type inference depends on the `inferFromConnection` underlying type in
`supportedUnderlyingTypes`. The three standard data types that use it
(`groupInfer`, `loopInfer`, `switchInfer`) are defined in
`src/utils/nodeStateManagement/standardNodes.ts` › `standardDataTypeNamesMap`.
Custom `inferFromConnection` data types are possible but the system is primarily
designed for these three.

### -> [Handles](handlesDoc.md)

Each handle stores both `dataType` and `inferredDataType`. The
`getResultantDataTypeOfHandleConsideringInferredType` function abstracts this
duality — callers that need "the actual type of this handle" should use it
rather than reading `dataType` directly. Note that `complex`/`noEquivalent`/
`inferFromConnection` handles all instantiate with
`type: 'unsupportedDirectly'`.

### -> [Edges](edgesDoc.md)

Inference is triggered by edge addition and removal. On addition, planning
happens in `validateAddEdge`/`planInferenceForEdgeAddition` and is applied in
`applyPlan`. On removal, `removeEdgeWithTypeChecking` →
`inferTypesAfterEdgeRemoval` resets types when no connections remain. Inference
runs **before** the edge is committed — if it fails, the edge is rejected with a
`ValidationError`.

### -> [Connection Validation](../features/connectionValidationDoc.md)

In the active pipeline, `validateAddEdge` runs null checks → cycle → duplicate →
loop → switch validation → inference planning → complex-type → conversion
checks, in that order. The complex-type and conversion checks use a projected
post-inference state so they see resolved types. Failures are surfaced as
machine-readable `ValidationError` codes (`CYCLE_DETECTED`, `LOOP_PATH_INVALID`,
`SWITCH_PATH_INVALID`, `TYPE_INFERENCE_FAILED`, `COMPLEX_TYPE_MISMATCH`,
`CONVERSION_NOT_ALLOWED`, etc.).

### -> [Node Groups](../features/nodeGroupsDoc.md)

Group boundary nodes use `groupInfer`. On inference,
`addDuplicateHandleToNodeGroupAfterInference` adds a duplicate handle and
propagates it across the node-type tree (definition + subtrees + instances). The
`overrideDataType`/`overrideName` flags are set, so the handle's `dataType`
itself is replaced.

### -> [Loops](../features/loopsDoc.md)

Loop nodes use `loopInfer` at fixed indices. Inference cascades across a node's
infer handles, and `addDuplicateHandlesToLoopNodesAfterInference` propagates the
inferred type plus new input/output handle pairs to all three triplet nodes.

### -> [Switches](../features/switchesDoc.md)

Switch nodes use `switchInfer` with true/false zones. Inference cascades, and
`addDuplicateHandlesToSwitchNodesAfterInference`
(`src/utils/nodeStateManagement/nodes/switches/switchHandleSync.ts` ›
`addDuplicateHandlesToSwitchNodesAfterInference`) adds zoned templates to the
inferred node and its sibling. `applyPlan` then applies `True: `/`False: ` name
prefixes and re-dedups switch handle names.

### -> [State Management](stateManagementDoc.md)

The `enableTypeInference` flag on `State` gates inference. Inference is part of
the pure validate → plan → apply pipeline: planning is side-effect-free
(`mutate=false`, returns an `InferencePlan`), and mutation happens only in
`applyPlan` inside Immer's `produce`, where the replacement node data is
`structuredClone`d into the draft before handle duplication. The legacy mutating
functions (`addEdgeWithTypeChecking`, `inferTypesAfterEdgeAddition`) remain for
tests only.
