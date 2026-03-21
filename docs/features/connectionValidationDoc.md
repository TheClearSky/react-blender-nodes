# Connection Validation

## Overview

Connection validation is the multi-layered system that determines whether an
edge (connection) can be added between two handles in the graph. When a user
drags a connection between two nodes, the system runs a pipeline of validation
checks — each controlled by an optional feature flag — to accept or reject the
connection. The system also validates edge and node deletions to preserve loop
structure integrity.

The validation pipeline is implemented across three primary files:

- `constructAndModifyHandles.ts` — orchestrates the validation pipeline via
  `addEdgeWithTypeChecking` and `willAddingEdgeCreateCycle`
- `newOrRemovedEdgeValidation.ts` — implements type inference, complex type
  checking, and type conversion validation
- `nodes/loops.ts` — implements loop-specific connection and deletion validation

## Entity-Relationship Diagram

```
+------------------+          +------------------+          +------------------+
|     DataType     |          |      Handle      |          |       Node       |
|------------------|          |------------------|          |------------------|
| name             |          | id               |          | id               |
| underlyingType   |<-------->| dataType         |<-------->| data             |
| complexSchema?   |          | inferredDataType?|          | nodeTypeUniqueId |
| color            |          | maxConnections?  |          |                  |
| maxConnections?  |          |                  |          |                  |
+------------------+          +--------+---------+          +--------+---------+
                                       |                             |
                                       |    +-----------+            |
                                       +--->|   Edge    |<-----------+
                                            |-----------|
                                            | id        |
                                            | source    |
                                            | target    |
                                            | srcHandle |
                                            | tgtHandle |
                                            +-----------+

+----------------------------+          +----------------------------+
| ConnectionValidationResult |          |          State             |
|----------------------------|          |----------------------------|
| isValid: boolean           |          | enableCycleChecking?       |
| reason?: string            |          | enableTypeInference?       |
+----------------------------+          | enableComplexTypeChecking? |
                                        | allowedConversions...?     |
                                        | allowConversionBetween...? |
                                        +----------------------------+
```

## Functional Dependency Diagram

```
mainReducer (ADD_EDGE_BY_REACT_FLOW)
  |
  +-- willAddingEdgeCreateCycle()          [constructAndModifyHandles.ts]
  |     +-- getOutgoers() (DFS)            [@xyflow/react]
  |
  +-- addEdgeWithTypeChecking()            [constructAndModifyHandles.ts]
        |
        +-- addEdge() (duplicate check)    [@xyflow/react]
        |
        +-- getHandleFromNodeDataMatchingHandleId()
        |
        +-- isLoopConnectionValid()        [nodes/loops.ts]
        |     +-- getLoopStructureFromNode()
        |     +-- verifyLoopStructureUniformHandleInference()
        |     +-- getNodesInLoopRegion()
        |     +-- getAllReachableNodes()
        |     +-- verifyParentLoopRegionsAreValid()
        |
        +-- inferTypesAfterEdgeAddition()  [newOrRemovedEdgeValidation.ts]
        |     +-- inferTypeAcrossTheNodeForHandleOfDataType()
        |     +-- addDuplicateHandleToNodeGroupAfterInference()
        |     +-- addDuplicateHandlesToLoopNodesAfterInference()
        |
        +-- checkComplexTypeCompatibilityAfterEdgeAddition()
        |
        +-- checkTypeConversionCompatibilityAfterEdgeAddition()

FullGraph.tsx (onBeforeDelete)
  |
  +-- canRemoveLoopNodesAndEdges()         [nodes/loops.ts]
        +-- getLoopStructureFromNode()
```

## Data Flow Diagram

```
User drags connection
         |
         v
+---------------------+
| ADD_EDGE_BY_REACT_FLOW |
| (mainReducer.ts)    |
+---------+-----------+
          |
          v
+---------------------+     Yes
| enableCycleChecking |----------> willAddingEdgeCreateCycle()
| flag set?           |                    |
+---------+-----------+             Creates cycle?
          |                          /          \
          | No (skip)            Yes             No
          |                       |               |
          |                  REJECT            Continue
          v                                       |
+---------------------+                          |
| addEdge() duplicate |<-------------------------+
| check (ReactFlow)   |
+---------+-----------+
          |
     Already exists?
      /          \
   Yes            No
    |              |
 REJECT        Continue
                   |
                   v
+---------------------+
| Find source/target  |
| nodes and handles   |
+---------+-----------+
          |
     Found?
      /      \
   No         Yes
    |           |
 REJECT     Continue
                |
                v
+---------------------+
| isLoopConnectionValid|
| (always runs)        |
+---------+-----------+
          |
     Valid?
      /      \
   No         Yes
    |           |
 REJECT     Continue
                |
                v
+---------------------+     Yes
| enableTypeInference |----------> inferTypesAfterEdgeAddition()
| flag set?           |                    |
+---------+-----------+             Valid inference?
          |                          /          \
          | No (skip)            No              Yes
          |                       |               |
          |                  REJECT            Continue
          v                                       |
+---------------------+     Yes                   |
| enableComplexType   |----------> checkComplexTypeCompat...()
| Checking flag set?  |                    |      |
+---------+-----------+             Compatible?   |
          |                          /      \     |
          | No (skip)            No          Yes  |
          |                       |           |   |
          |                  REJECT       Continue|
          v                                  |    |
+---------------------+     Yes             |    |
| allowedConversions  |--------> checkTypeConversionCompat...()
| BetweenDataTypes?   |                |    |    |
+---------+-----------+          Allowed?   |    |
          |                      /    \     |    |
          | No (skip)         No      Yes   |    |
          |                    |       |    |    |
          |               REJECT   Continue |    |
          v                            |    |    |
+---------------------+               |    |    |
| All checks passed   |<--------------+----+----+
| Push edge to state  |
+---------------------+
          |
          v
       ACCEPT
```

## System Diagram

```
+-----------------------------------------------------------------------+
|                         react-blender-nodes                           |
|                                                                       |
|  +---------------------------+     +-------------------------------+  |
|  |     FullGraph.tsx         |     |      mainReducer.ts           |  |
|  |  (React Component)       |     |  (State Management)           |  |
|  |                           |     |                               |  |
|  |  onConnect() ----------->|---->|  ADD_EDGE_BY_REACT_FLOW       |  |
|  |  onBeforeDelete() ----+  |     |    |                          |  |
|  +---------------------------+     |    v                          |  |
|                           |        |  willAddingEdgeCreateCycle()  |  |
|                           |        |    |                          |  |
|                           |        |    v                          |  |
|                           |        |  addEdgeWithTypeChecking()    |  |
|                           |        +------+------------------------+  |
|                           |               |                           |
|  +------------------------+--+     +------v------------------------+  |
|  | canRemoveLoopNodesAndEdges|     | Validation Pipeline           |  |
|  | (Delete Validation)       |     |                               |  |
|  |                           |     | 1. ReactFlow duplicate check  |  |
|  | - Loop nodes must be      |     | 2. Cycle check (DFS)         |  |
|  |   deleted together        |     | 3. Loop connection valid.    |  |
|  | - Bind edges can't be     |     | 4. Type inference            |  |
|  |   removed individually    |     | 5. Complex type compat.      |  |
|  +---------------------------+     | 6. Type conversion compat.   |  |
|                                    | 7. Max connections (Handle)  |  |
|                                    +-------------------------------+  |
+-----------------------------------------------------------------------+
```

## ConnectionValidationResult Type

Defined in `newOrRemovedEdgeValidation.ts`:

```typescript
type ConnectionValidationResult = {
  isValid: boolean;
  reason?: string;
};
```

Every validation function returns `{ validation: ConnectionValidationResult }`.
When `isValid` is `false`, the `reason` string describes why the connection was
rejected. The pipeline short-circuits on the first failure — subsequent checks
are skipped.

## Validation Layers

### 1. Duplicate Edge Check (ReactFlow)

**Location:** `addEdgeWithTypeChecking` in `constructAndModifyHandles.ts`, line
100

ReactFlow's built-in `addEdge()` function is called with the proposed edge. If
the return value equals the current edges array (reference equality), the edge
already exists or was rejected by ReactFlow internals.

```
Rejection reason: "Edge already exists or was rejected by reactflow"
```

This check always runs and cannot be disabled.

### 2. Cycle Checking (DFS)

**Location:** `willAddingEdgeCreateCycle` in `constructAndModifyHandles.ts`,
line 443 **Flag:** `enableCycleChecking`

Uses depth-first search starting from the target node, traversing outgoers via
`getOutgoers()` from `@xyflow/react`. If any outgoer reaches back to the source
node, a cycle would be created.

Algorithm:

1. If target node equals source node (self-connection), return `true`
2. Starting from target node, recursively visit all outgoers
3. Track visited nodes to avoid re-processing
4. If source node is encountered during traversal, cycle detected

When a cycle is detected, the edge addition is silently rejected (no reason
string — the reducer simply `break`s).

### 3. Loop Connection Validation

**Location:** `isLoopConnectionValid` in `nodes/loops.ts`, line 1379 **Flag:**
Always active (no feature flag)

Validates connections involving loop nodes (loopStart, loopStop, loopEnd). This
is the most complex validation layer, handling three cases:

**Case 1: Both nodes are loop nodes**

- **Bind connections** (using `bindLoopNodes` data type): Must follow the order
  `loopStart -> loopStop -> loopEnd`
- **Non-bind connections between same loop structure**: Validates uniform handle
  inference across the structure
- **Non-bind connections between different loop structures**:
  - Series connection: loopEnd of one connects to loopStart of another
  - Nesting: One loop structure is inside another's loop region
  - Cross-region connections between different structures are rejected

**Case 2: One node is a loop node, the other is not**

- Requires a complete loop structure (all three nodes bound)
- Validates that the non-loop node is in the correct region:
  - Nodes in the `loopStart<->loopStop` region can only connect to `loopStart`
    or `loopStop`
  - Nodes in the `loopStop<->loopEnd` region can only connect to `loopStop` or
    `loopEnd`
  - Nodes outside the loop region can only connect to `loopStart` (as input) or
    `loopEnd` (as output)
- Group input nodes can only connect to `loopStart`
- Group output nodes can only connect to `loopEnd`
- Validates parent loop regions are not violated

**Case 3: Neither node is a loop node**

- Still validates parent loop region constraints (a non-loop edge must not cross
  loop region boundaries)

### 4. Type Inference Validation

**Location:** `inferTypesAfterEdgeAddition` in `newOrRemovedEdgeValidation.ts`,
line 29 **Flag:** `enableTypeInference`

Handles the `inferFromConnection` underlying type. When a handle has this type,
its actual data type is inferred from the connected handle.

Inference scenarios:

- **Neither handle is `inferFromConnection`**: No inference needed, passes
  validation
- **Both handles are `inferFromConnection`**:
  - Neither inferred yet: **Rejected** — no information to infer from
  - Both already inferred: Passes (compatibility checked by later layers)
  - One inferred, one not: The uninferred handle adopts the inferred handle's
    type
- **One handle is `inferFromConnection`**:
  - Already inferred: Passes
  - Not inferred: Infers type from the concrete handle

After inference, the function also:

1. Calls `addDuplicateHandleToNodeGroupAfterInference()` — adds new infer
   handles to group input/output nodes
2. Calls `addDuplicateHandlesToLoopNodesAfterInference()` — duplicates both
   input and output infer handles on loop nodes so more connections can be made

For edge removal (`inferTypesAfterEdgeRemoval`): When the last connection to a
set of `inferFromConnection` handles is removed, the inferred type is reset to
the original handle definition.

### 5. Complex Type Checking

**Location:** `checkComplexTypeCompatibilityAfterEdgeAddition` in
`newOrRemovedEdgeValidation.ts`, line 300 **Flag:** `enableComplexTypeChecking`

Validates Zod schema compatibility when connecting complex types:

- **Neither is complex**: Passes
- **One is complex, one is not**: **Rejected** — "Can't connect complex types
  with non-complex types"
- **Both are complex**: Checks if they are the same type by comparing:
  1. `dataTypeUniqueId` equality, OR
  2. JSON-serialized `complexSchema` equality
  - If different: **Rejected** — "Can't connect complex types with different
    types"

This layer uses `getResultantDataTypeOfHandleConsideringInferredType()` to
resolve inferred types before comparison.

### 6. Type Conversion Checking

**Location:** `checkTypeConversionCompatibilityAfterEdgeAddition` in
`newOrRemovedEdgeValidation.ts`, line 426 **Flag:**
`allowedConversionsBetweenDataTypes`

When the conversion map is provided, only explicitly allowed type conversions
are permitted:

1. **Same type**: Always passes
2. **Different types**: Checks the conversion map
   `allowedConversionsBetweenDataTypes[sourceType][targetType]`
3. **Both complex**: If
   `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` is
   `true`, complex-to-complex conversions are allowed even without explicit map
   entries (provided complex type checking didn't reject them in the previous
   step)

Rejection format:
`"${sourceTypeId} to ${targetTypeId} conversion is not allowed"`

### 7. Max Connections Check

**Location:** `ContextAwareHandle.tsx`, line 306 **Flag:** None (driven by
`maxConnections` property on DataType or handle)

Unlike the other validation layers, this check happens at the ReactFlow
`<Handle>` component level rather than in the reducer. The `isConnectable`,
`isConnectableStart`, and `isConnectableEnd` props are set based on whether the
current connection count is below `maxConnections`.

```typescript
const canConnect =
  maxConnections !== undefined
    ? connections.length < maxConnections
    : undefined;
```

When `maxConnections` is `undefined`, connections are unlimited. The
`maxConnections` value can be set on:

- The `DataType` definition (applies to all handles of that type)
- Individual handle definitions in the node type (overrides the DataType
  default)

## Feature Flags

| Flag                                                                      | Type                                  | Default                   | Location            | Effect                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------- | ------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `enableCycleChecking`                                                     | `boolean?`                            | `undefined` (disabled)    | `State`             | Enables DFS-based cycle detection before edge addition                                     |
| `enableTypeInference`                                                     | `boolean?`                            | `undefined` (disabled)    | `State`             | Enables `inferFromConnection` type resolution on edge add/remove                           |
| `enableComplexTypeChecking`                                               | `boolean?`                            | `undefined` (disabled)    | `State`             | Enables Zod schema compatibility validation for complex types                              |
| `allowedConversionsBetweenDataTypes`                                      | `AllowedConversionsBetweenDataTypes?` | `undefined` (all allowed) | `State`             | When set, restricts type conversions to those explicitly listed in the map                 |
| `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` | `boolean?`                            | `undefined` (disabled)    | `State`             | When `true`, allows complex-to-complex conversions unless blocked by complex type checking |
| `enableRecursionChecking`                                                 | `boolean?`                            | `undefined` (disabled)    | `State`             | Prevents recursive nesting of node groups (not part of edge validation pipeline)           |
| `maxConnections`                                                          | `number?`                             | `undefined` (unlimited)   | `DataType` / handle | Limits connections per handle; enforced at the Handle component level                      |

**Note:** When none of `enableTypeInference`, `enableComplexTypeChecking`, or
`allowedConversionsBetweenDataTypes` are set, `addEdgeWithTypeChecking` skips
all validation after the duplicate check and loop validation, and pushes the
edge directly.

## Delete Validation

### canRemoveLoopNodesAndEdges

**Location:** `nodes/loops.ts`, line 1877

Validates that deletion operations do not break loop structure integrity. Two
rules are enforced:

1. **Loop nodes must be deleted together**: If any loop node in a structure
   (loopStart, loopStop, or loopEnd) is being deleted, all three must be in the
   deletion set. Partial deletion is rejected with:
   `"Loop nodes all need to be removed together, can't partially remove them"`

2. **Bind edges cannot be individually removed**: If a bind edge (connecting two
   loop nodes via the `bindLoopNodes` data type) is being deleted, all three
   loop nodes must also be in the deletion set. Otherwise rejected with:
   `"Cannot disconnect loop nodes bind edges once fully connected, to delete, select all connected loop nodes and delete them at once"`

### onBeforeDelete handler

**Location:** `FullGraph.tsx`, line 556

The `onBeforeDelete` callback on the ReactFlow component calls
`canRemoveLoopNodesAndEdges()` with the current state and the nodes/edges
proposed for deletion. If validation fails, the handler returns `false` to
cancel the deletion.

```typescript
onBeforeDelete={async ({ nodes, edges }) => {
  const validation = canRemoveLoopNodesAndEdges(
    { ...state, ...nodesAndEdgesInCurrentNodeGroup },
    nodes,
    edges,
  );
  return validation.validation.isValid;
}}
```

## Validation Order and Short-Circuiting

The validation pipeline is **strictly ordered** and **short-circuits** on the
first failure:

```
1. Duplicate check        -- Always runs (ReactFlow level)
2. Cycle check            -- Only if enableCycleChecking (reducer level, before addEdgeWithTypeChecking)
3. Source/target lookup    -- Always runs
4. Loop connection valid. -- Always runs (before type checks)
5. Type inference          -- Only if enableTypeInference; skipped if prior check failed
6. Complex type compat.   -- Only if enableComplexTypeChecking AND validation.isValid
7. Type conversion compat. -- Only if allowedConversionsBetweenDataTypes AND validation.isValid
```

Steps 5-7 use an explicit `validation.isValid` guard:

```typescript
if (state.enableComplexTypeChecking && validation.isValid) { ... }
if (state.allowedConversionsBetweenDataTypes && validation.isValid) { ... }
```

If none of steps 5-7 are enabled (no flags set), the edge is accepted
immediately after step 4.

The **max connections** check (step 7 in the conceptual pipeline) operates
independently at the Handle component level via ReactFlow's `isConnectable`
prop, preventing connection initiation rather than rejecting after the fact.

## Limitations and Deprecated Patterns

- **Complex type comparison uses JSON.stringify**: Schema compatibility for
  complex types is checked via `JSON.stringify(complexSchema)` comparison, which
  may produce false negatives for functionally equivalent schemas with different
  property ordering.

- **Cycle checking is separate from the main pipeline**:
  `willAddingEdgeCreateCycle` runs in the reducer before
  `addEdgeWithTypeChecking` is called, not inside the unified validation
  pipeline. This means cycle rejection does not produce a
  `ConnectionValidationResult` — it silently breaks.

- **Max connections is component-level only**: The `maxConnections` constraint
  is enforced via ReactFlow's `isConnectable` prop at the UI level. There is no
  server-side or reducer-level enforcement, so programmatic edge additions
  bypass this check.

- **Type inference is order-dependent**: When both handles are
  `inferFromConnection` and neither is inferred, the connection is rejected. The
  user must connect to a concrete type first.

- **Loop validation always runs**: Even when no loop nodes exist,
  `isLoopConnectionValid` is called. For non-loop nodes, it still checks parent
  loop region constraints via `verifyParentLoopRegionsAreValid`.

## Examples

**Example 1: Simple valid connection (no flags)**

```
State: { enableTypeInference: false, enableComplexTypeChecking: false }
Connection: Node A (output: "string") -> Node B (input: "string")
Pipeline: Duplicate check -> Loop check (pass, no loops) -> Skip all type checks -> ACCEPT
```

**Example 2: Cycle detection**

```
State: { enableCycleChecking: true }
Graph: A -> B -> C
Connection: C -> A
Pipeline: Cycle check -> DFS from A finds C via A->B->C -> REJECT (cycle)
```

**Example 3: Type inference**

```
State: { enableTypeInference: true }
Connection: Node A (output: "number") -> Node B (input: "inferFromConnection", not yet inferred)
Pipeline: Duplicate -> Loop -> inferTypesAfterEdgeAddition():
  - Target handle is inferFromConnection, not inferred
  - Source handle is concrete "number"
  - Infer target as "number" across all handles of same dataTypeUniqueId
  -> ACCEPT
```

**Example 4: Complex type mismatch**

```
State: { enableComplexTypeChecking: true }
Connection: Node A (output: complex/UserSchema) -> Node B (input: complex/OrderSchema)
Pipeline: Duplicate -> Loop -> Complex type check:
  - Both are complex
  - dataTypeUniqueIds differ
  - JSON schemas differ
  -> REJECT ("Can't connect complex types with different types")
```

**Example 5: Type conversion**

```
State: { allowedConversionsBetweenDataTypes: { "number": { "string": true } } }
Connection: Node A (output: "number") -> Node B (input: "string")
Pipeline: Duplicate -> Loop -> Type conversion check:
  - Types differ: "number" vs "string"
  - Conversion map: number->string = true
  -> ACCEPT
```

**Example 6: Loop node connection**

```
Connection: Regular Node -> LoopStop (infer handle)
Pipeline: Duplicate -> Loop validation:
  - Target is loop node, source is not
  - Loop structure found (loopStart, loopStop, loopEnd all bound)
  - Verify uniform handle inference across structure
  - Source is in startToStop region, target is loopStop -> valid position
  -> Continue to type checks -> ACCEPT
```

**Example 7: Delete loop node**

```
Deletion: Select only loopStart node, press Delete
onBeforeDelete -> canRemoveLoopNodesAndEdges():
  - loopStart is in deletion set
  - loopStop and loopEnd are NOT in deletion set
  -> REJECT ("Loop nodes all need to be removed together")
```

## Relationships with Other Features

### -> [Edges](../core/edgesDoc.md)

Connection validation is the gatekeeper for all edge creation. Every edge in the
graph has passed through the validation pipeline. Edge removal also triggers
`inferTypesAfterEdgeRemoval` to reset inferred types when appropriate, and
`canRemoveLoopNodesAndEdges` to protect loop integrity.

### -> [Data Types](../core/dataTypesDoc.md)

Data types define the `underlyingType` (string, number, boolean, complex,
noEquivalent, inferFromConnection) that drives validation layers 4-6. The
`maxConnections` property on data types controls layer 7. The `complexSchema`
property is used for complex type compatibility checking.

### -> [Handles](../core/handlesDoc.md)

Handles are the connection points on nodes. Each handle references a `DataType`
and may carry an `inferredDataType` when using type inference. The
`maxConnections` property can be set per-handle (overriding the data type
default). Handle indices (`HandleIndices`) are used throughout validation to
locate specific handles within node data.

### -> [Type Inference](../core/typeInferenceDoc.md)

Type inference (`inferFromConnection` underlying type) is deeply integrated with
connection validation. The `inferTypesAfterEdgeAddition` function both validates
that inference is possible and performs the inference as a side effect, updating
node data in place. After inference, duplicate handles are added to group and
loop nodes to allow further connections.

### -> [Loops](loopsDoc.md)

Loop validation is the most complex validation layer. Loop nodes (loopStart,
loopStop, loopEnd) form triplet structures connected by bind edges. The
validation ensures:

- Bind edges follow the correct order
- Non-bind connections respect loop region boundaries
- Nested loops are properly contained
- Loop structures cannot be partially deleted
- Inferred handles are duplicated on loop nodes after inference

### -> [Node Groups](nodeGroupsDoc.md)

Node groups interact with connection validation through:

- Group input/output nodes have special handling in type inference (inferred
  types are propagated, handles are duplicated)
- Group input nodes can only connect to loopStart (not inside loop regions)
- Group output nodes can only connect to loopEnd (not inside loop regions)
- The `openedNodeGroupStack` determines which nodes/edges are currently visible
  and subject to validation

### -> [State Management](../core/stateManagementDoc.md)

Connection validation is invoked from the `mainReducer` via the
`ADD_EDGE_BY_REACT_FLOW` action. The reducer orchestrates the cycle check and
then delegates to `addEdgeWithTypeChecking`. The validation functions mutate
state directly (via Immer's draft state) — successful edge additions push the
new edge to `state.edges`, and type inference modifies node data in place.
Delete validation is triggered from the React component layer via
`onBeforeDelete`.
