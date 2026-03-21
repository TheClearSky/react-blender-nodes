# Edges

## Overview

Edges are the connections between node handles in the react-blender-nodes graph
editor. They represent directed data flow from an output handle on a source node
to an input handle on a target node. Every edge in the system uses the
`configurableEdge` type and is rendered by the `ConfigurableEdge` component with
gradient colors derived from the connected handles.

The edge system is responsible for:

- **Adding edges** with a multi-step validation pipeline (cycle detection, loop
  validation, type inference, complex type checking, type conversion checking)
- **Removing edges** with type inference rollback when `inferFromConnection`
  handles lose all connections
- **Rendering edges** as bezier curves with gradient colors and viewport-aware
  optimization
- **Compiling edges** into `inputResolutionMap` and `outputDistributionMap` for
  the runner's execution plan

Edges are stored as a flat array in `state.edges` (or within a node group's
`subtree.edges` when inside a group). The `getCurrentNodesAndEdgesFromState`
utility resolves which edges are currently visible based on the
`openedNodeGroupStack`.

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
                            +--------------------+
```

Relationships:

- An **Edge** connects exactly one source Node to one target Node
- An **Edge** references exactly one source Handle and one target Handle
- A **Node** can have 0.._ outgoing and 0.._ incoming edges
- A **Handle** can have 0..\* edges connected (fan-in on inputs, fan-out on
  outputs)

## Functional Dependency Diagram

```
+-----------------------------------------------------------------------+
|                        Edge Operations                                 |
+-----------------------------------------------------------------------+
|                                                                       |
|  addEdgeWithTypeChecking()                                            |
|    |-- isLoopConnectionValid()         (loops.ts)                     |
|    |-- inferTypesAfterEdgeAddition()   (newOrRemovedEdgeValidation.ts) |
|    |     |-- inferTypeAcrossTheNodeForHandleOfDataType() (typeInf...)  |
|    |     |     '-- inferTypeOnHandleAfterConnectingWithAnotherHandle() |
|    |     |-- addDuplicateHandleToNodeGroupAfterInference()            |
|    |     '-- addDuplicateHandlesToLoopNodesAfterInference()           |
|    |-- checkComplexTypeCompatibilityAfterEdgeAddition()               |
|    |     '-- getResultantDataTypeOfHandleConsideringInferredType()    |
|    '-- checkTypeConversionCompatibilityAfterEdgeAddition()            |
|          '-- getResultantDataTypeOfHandleConsideringInferredType()    |
|                                                                       |
|  removeEdgeWithTypeChecking()                                         |
|    '-- inferTypesAfterEdgeRemoval()    (newOrRemovedEdgeValidation.ts) |
|          |-- getConnectedEdges()       (@xyflow/react)                |
|          |-- getAllHandlesFromNodeData()                               |
|          '-- inferTypeAcrossTheNodeForHandleOfDataType()              |
|                                                                       |
|  willAddingEdgeCreateCycle()                                          |
|    '-- getOutgoers()                   (@xyflow/react)                |
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
FullGraph dispatches ADD_EDGE_BY_REACT_FLOW
            |
            v
mainReducer handles action
            |
            +-----> [enableCycleChecking?]
            |              |
            |       willAddingEdgeCreateCycle()
            |              |
            |       (DFS from target node, looking for source)
            |              |
            |       cycle found? --> REJECT (break)
            |              |
            v              v (no cycle)
    Validate source, target, sourceHandle, targetHandle exist
            |
            v
    getCurrentNodesAndEdgesFromState() --> resolve group context
            |
            v
    addEdgeWithTypeChecking(source, sourceHandle, target, targetHandle, state, ...)
            |
            +-----> ReactFlow addEdge() check (duplicate rejection)
            |
            +-----> [validation needed?] check enableTypeInference,
            |       enableComplexTypeChecking, allowedConversionsBetweenDataTypes
            |              |
            |       (if none enabled, push edge and return valid)
            |              |
            v              v
    Find source & target nodes + handles by index
            |
            +-----> 1. isLoopConnectionValid()
            |              |
            |       Validates loop binding order, loop structure integrity,
            |       uniform handle inference across loop triplet
            |              |
            +-----> 2. inferTypesAfterEdgeAddition()  [if enableTypeInference]
            |              |
            |       Infers types for 'inferFromConnection' handles.
            |       Propagates inferred type across all handles of
            |       same dataTypeUniqueId on the node.
            |       Adds duplicate handles to loop/group nodes.
            |              |
            +-----> 3. checkComplexTypeCompatibilityAfterEdgeAddition()
            |              [if enableComplexTypeChecking]
            |              |
            |       Rejects complex<->non-complex connections.
            |       Rejects mismatched complex schemas (by ID or JSON equality).
            |              |
            +-----> 4. checkTypeConversionCompatibilityAfterEdgeAddition()
            |              [if allowedConversionsBetweenDataTypes]
            |              |
            |       Checks if source->target type conversion is
            |       explicitly allowed in the conversion map.
            |              |
            v              v
    All validations pass? --> state.edges.push(newEdge)
                              return { validation: { isValid: true } }
```

### Edge Removal Flow

```
User presses Delete/Backspace/x on selected edge
            |
            v
ReactFlow fires onEdgesChange(changes)
            |
            v
FullGraph dispatches UPDATE_EDGES_BY_REACT_FLOW
            |
            v
mainReducer handles action
            |
            +-----> For each edgeChange:
            |
            |       [edgeChange.type !== 'remove']?
            |              |
            |       Yes: applyEdgeChanges directly (e.g., selection changes)
            |              |
            |       No (remove):
            |              |
            v              v
    Find the edge being removed
            |
            v
    removeEdgeWithTypeChecking(removedEdge, state, edgeChange)
            |
            +-----> ReactFlow applyEdgeChanges check
            |
            +-----> [validation needed?]
            |              |
            |       (if none enabled, apply changes and return)
            |              |
            v              v
    Find source & target nodes + handles
            |
            +-----> inferTypesAfterEdgeRemoval()  [if enableTypeInference]
            |              |
            |       For each node with 'inferFromConnection' handles:
            |         - Get all connected edges (excluding removed edge)
            |         - Get all handles of same dataTypeUniqueId
            |         - If NO remaining connections exist for those handles:
            |           --> Reset inferred type to original type definition
            |              |
            v              v
    Return updatedNodes + updatedEdges (with edge removed)
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
+-----+----------------------------+-------------------------------+
      |                            |
      v                            v
+-----+--------+         +---------+-----------+
| mainReducer  |         | ConfigurableEdge    |
|              |         | (rendering)         |
| ADD_EDGE:    |         |                     |
|  cycle check |         | - getBezierPath()   |
|  addEdge     |         | - gradient colors   |
|  WithType    |         | - viewport observer |
|  Checking()  |         | - BaseEdge render   |
|              |         |                     |
| UPDATE_EDGES:|         +---------------------+
|  remove      |
|  EdgeWith    |
|  Type        |
|  Checking()  |
+-+------+-----+
  |      |
  v      v
+-+------+---------------------------+
| constructAndModifyHandles.ts       |
|                                    |
| addEdgeWithTypeChecking()          |
|   +-> isLoopConnectionValid()      |
|   +-> inferTypesAfterEdgeAddition()|
|   +-> checkComplexTypeCompat...()  |
|   +-> checkTypeConversionCompat..()|
|                                    |
| removeEdgeWithTypeChecking()       |
|   +-> inferTypesAfterEdgeRemoval() |
|                                    |
| willAddingEdgeCreateCycle()        |
|   +-> DFS via getOutgoers()        |
+------------------------------------+
          |
          v (at runtime)
+---------+---------------------------+
| compiler.ts                         |
|                                     |
| edges --> inputResolutionMap        |
|       --> outputDistributionMap     |
|                                     |
| (feeds executor with data flow map) |
+-------------------------------------+
```

## Type Definitions

### Edges

```typescript
// src/components/organisms/FullGraph/types.ts
type Edges = ConfigurableEdgeState[];
```

All edges in the graph are stored as an array of `ConfigurableEdgeState`.

### ConfigurableEdgeState

```typescript
// src/components/atoms/ConfigurableEdge/ConfigurableEdge.tsx
type ConfigurableEdgeState = Edge<{}, 'configurableEdge'>;
```

A ReactFlow `Edge` with no custom data and the type discriminator
`'configurableEdge'`. Every edge in the system uses this type. The key fields
inherited from ReactFlow's `Edge`:

| Field          | Type     | Description                             |
| -------------- | -------- | --------------------------------------- |
| `id`           | `string` | Unique edge identifier (20-char random) |
| `source`       | `string` | Source node ID                          |
| `target`       | `string` | Target node ID                          |
| `sourceHandle` | `string` | Source handle ID                        |
| `targetHandle` | `string` | Target handle ID                        |
| `type`         | `string` | Always `'configurableEdge'`             |

### EdgeChanges

```typescript
// src/components/organisms/FullGraph/types.ts
type EdgeChanges = EdgeChange<ConfigurableEdgeState>[];
```

ReactFlow's edge change events, typed to `ConfigurableEdgeState`.

### ConnectionValidationResult

```typescript
// src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts
type ConnectionValidationResult = {
  isValid: boolean;
  reason?: string;
};
```

Returned by every validation function in the edge pipeline. When `isValid` is
`false`, `reason` describes why the connection was rejected.

### InputResolutionEntry / OutputDistributionEntry

```typescript
// src/utils/nodeRunner/types.ts
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

### 1. User connects two handles

The user drags from an output handle to an input handle in the ReactFlow canvas.
ReactFlow fires the `onConnect` callback with a `Connection` object containing
`source`, `target`, `sourceHandle`, and `targetHandle`.

`FullGraph.tsx` dispatches `ADD_EDGE_BY_REACT_FLOW` with this connection.

### 2. Cycle detection (willAddingEdgeCreateCycle)

**File:** `constructAndModifyHandles.ts:443-490`

If `state.enableCycleChecking` is true, the reducer calls
`willAddingEdgeCreateCycle()` before any other validation.

The algorithm:

1. Find the target node
2. If source === target (self-loop), return `true`
3. Perform DFS starting from the target node, following outgoing edges via
   `getOutgoers()`
4. If any outgoer in the traversal equals the source node, a cycle would be
   created
5. Uses a visited set to avoid reprocessing nodes

If a cycle is detected, the reducer breaks immediately and the edge is not
added.

### 3. addEdgeWithTypeChecking

**File:** `constructAndModifyHandles.ts:63-222`

This is the central orchestrator for edge addition. It:

1. Constructs the new edge object with a random 20-character ID and
   `type: 'configurableEdge'`
2. Calls ReactFlow's `addEdge()` to check for duplicates - if the edge already
   exists, returns invalid
3. Checks if any validation is needed
   (`enableTypeInference || enableComplexTypeChecking || allowedConversionsBetweenDataTypes`)
4. If no validation needed, pushes the edge directly to `state.edges`
5. Otherwise, finds source/target nodes and handles by index, then runs the
   validation pipeline in order

### 4. Loop connection validation

**File:** `nodes/loops.ts:1379+`

Called first in the validation pipeline via `isLoopConnectionValid()`. This
validates:

- **Binding order**: Loop nodes can only bind in the order
  `loopStart -> loopStop -> loopEnd` using the special `bindLoopNodes` data type
- **Same-structure connections**: When connecting non-binding handles between
  loop nodes in the same structure, verifies uniform handle inference across the
  loop triplet
- **Cross-structure connections**: When connecting loop nodes from different
  structures, validates that either:
  - They connect in series (one's loopEnd to another's loopStart)
  - One is nested inside the other's loop region
- **Loop-to-regular connections**: When connecting a loop node to a non-loop
  node, verifies the non-loop node is not a group boundary node (unless
  specifically allowed)

### 5. Type inference (if enabled)

**File:** `newOrRemovedEdgeValidation.ts:29-298`

Called when `state.enableTypeInference` is true. Handles the
`inferFromConnection` underlying type:

**Cases:**

- **Neither handle is inferFromConnection**: No inference needed, valid
- **Both are inferFromConnection**:
  - Neither inferred yet: Invalid (no information to infer from)
  - Both already inferred: Valid (compatibility checked later)
  - One inferred, one not: Infer the un-inferred one from the inferred one
- **One is inferFromConnection**:
  - Already inferred: Valid
  - Not inferred: Infer from the connected non-infer handle

**Inference mechanism** (`inferTypeAcrossTheNodeForHandleOfDataType`):

- Sets the `inferredDataType` on every handle in the node that shares the same
  `dataTypeUniqueId`
- For loop nodes and group boundary nodes, also overrides the `dataType` and
  `name` fields
- Copies handle properties (like `handleColor`) from the connected handle

**Post-inference:**

- `addDuplicateHandleToNodeGroupAfterInference()`: Adds new infer handles to
  group input/output nodes so more connections can be made
- `addDuplicateHandlesToLoopNodesAfterInference()`: Adds new infer handles to
  all three loop triplet nodes (loopStart, loopStop, loopEnd) on both input and
  output sides

### 6. Complex type checking (if enabled)

**File:** `newOrRemovedEdgeValidation.ts:300-424`

Called when `state.enableComplexTypeChecking` is true and previous validations
passed.

Uses `getResultantDataTypeOfHandleConsideringInferredType()` to resolve the
effective data type (considering inference).

**Rules:**

- Neither handle is complex: Valid
- One is complex, one is not: Invalid ("Can't connect complex types with
  non-complex types")
- Both are complex: Valid only if they share the same `dataTypeUniqueId` OR
  their `complexSchema` (Zod schema) serializes to the same JSON

### 7. Type conversion checking (if enabled)

**File:** `newOrRemovedEdgeValidation.ts:426-532`

Called when `state.allowedConversionsBetweenDataTypes` is defined and previous
validations passed.

**Rules:**

- Same data type IDs: Valid
- Different data type IDs: Valid only if:
  - The conversion is explicitly listed in
    `allowedConversionsBetweenDataTypes[sourceTypeId][targetTypeId]`, OR
  - Both are complex types AND
    `state.allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking`
    is true

### 8. Edge stored in state

If all validations pass, the edge is pushed to `state.edges` via
`state.edges.push(newEdge)` (Immer draft mutation in the reducer context). The
reducer then writes the updated nodes and edges back via
`setCurrentNodesAndEdgesToStateWithMutatingState()`.

## Edge Removal Pipeline

### 1. User deletes edge

The user selects an edge and presses Delete, Backspace, or x. ReactFlow fires
`onEdgesChange` with a `remove` type change. Additionally, `onBeforeDelete`
checks `canRemoveLoopNodesAndEdges()` to prevent deletion of edges that would
break loop structures.

### 2. removeEdgeWithTypeChecking

**File:** `constructAndModifyHandles.ts:247-389`

1. Calls ReactFlow's `applyEdgeChanges()` to verify the removal is valid
2. Checks if validation is needed (same flags as addition)
3. If no validation needed, returns updated edges with edge removed
4. Otherwise, finds source/target nodes and handles

### 3. Type inference rollback (if enabled)

**File:** `newOrRemovedEdgeValidation.ts:534-773`

For each end of the removed edge that has an `inferFromConnection` handle:

1. Get all connected edges for that node (excluding the removed edge)
2. Get all handles on that node with the same `dataTypeUniqueId`
3. Check if ANY of those handles still have a remaining connection
4. If no remaining connections exist, **reset** the inferred type:
   - Calls `inferTypeAcrossTheNodeForHandleOfDataType()` with
     `resetInferredType: true`
   - Constructs the original handle definition from `typeOfNodes` to restore the
     original state

This ensures that when the last edge to an inferred handle is removed, the
handle reverts to its un-inferred `inferFromConnection` state.

### 4. Edge removed from state

The edge is removed via `applyEdgeChanges()` and the updated nodes (potentially
with reset inferred types) and edges are written back to state.

## Edge Rendering (ConfigurableEdge)

**File:** `components/atoms/ConfigurableEdge/ConfigurableEdge.tsx`

All edges are rendered by the `ConfigurableEdge` component, registered in
`FullGraphCustomNodesAndEdges` as the `'configurableEdge'` edge type.

### Gradient Colors

Each edge displays a linear gradient from source handle color to target handle
color:

1. Uses `useNodesData()` to reactively read source and target node data
2. Calls `getHandleFromNodeDataMatchingHandleId()` to find the handle's color
3. Falls back to `#A1A1A1` (gray) if no color is found
4. Creates an SVG `<linearGradient>` element with
   `gradientUnits='userSpaceOnUse'` positioned between source and target
   coordinates

### Bezier Curves

Uses ReactFlow's `getBezierPath()` to compute the path, then renders via
`<BaseEdge>`.

### Viewport Optimization

Uses `IntersectionObserver` to detect whether the edge's SVG element is visible
in the viewport:

- Observes the edge's DOM element against the ReactFlow container
- Threshold set to 1 (fully visible) with 20px root margin
- When not in viewport, applies `opacity-25` class to reduce visual clutter
- Selected edges get `brightness-150` for highlight

### Styling

- Stroke width: `stroke-7!` (7px important)
- Stroke color: `url(#linear-gradient-edge-{id})` (the gradient)
- Focusable for keyboard interaction

## Cycle Detection

**File:** `constructAndModifyHandles.ts:443-490`

The `willAddingEdgeCreateCycle()` function implements a standard DFS cycle
detection algorithm:

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

The logic: if adding edge source->target, check whether target can already reach
source through existing edges. If so, adding this edge would create a cycle.

Cycle checking is gated by `state.enableCycleChecking` and runs in the reducer
before `addEdgeWithTypeChecking()`.

## Edges in the Runner

**File:** `utils/nodeRunner/compiler.ts`

During compilation (Phase 1: Graph Analysis), edges are transformed into two
lookup maps:

### inputResolutionMap

```
Map<"nodeId:handleId", InputResolutionEntry[]>
```

For each edge, an entry is added keyed by `"{targetNodeId}:{targetHandleId}"`.
This tells the executor: "to resolve this input handle's value, read from these
source handles."

Multiple entries for the same key indicate **fan-in** (multiple edges feeding
one input).

### outputDistributionMap

```
Map<"nodeId:handleId", OutputDistributionEntry[]>
```

For each edge, an entry is added keyed by `"{sourceNodeId}:{sourceHandleId}"`.
This tells the executor: "after computing this output, distribute the value to
these target handles."

Multiple entries for the same key indicate **fan-out** (one output feeding
multiple inputs).

### Special handling

- **bindLoopNodes edges** are skipped (`isBindLoopNodesEdge` check) - these are
  structural edges connecting loop triplet nodes and carry no data
- **Group boundary node edges** remain in the maps so the executor can resolve
  handle mappings between outer and inner group graphs

The executor uses these maps at runtime to:

1. Resolve input values from the `ValueStore` before calling a node's function
   implementation
2. Build `InputHandleValue` objects with full connection metadata
3. Build `OutputHandleInfo` objects so implementations know their downstream
   consumers

## Limitations and Deprecated Patterns

- **No custom edge data**: `ConfigurableEdgeState` uses
  `Edge<{}, 'configurableEdge'>` with empty data. All edge metadata is derived
  from the connected handles at render time.
- **Single edge type**: All edges use `'configurableEdge'`. There is no
  mechanism for custom edge types.
- **JSON-based complex type comparison**: Complex type compatibility uses
  `JSON.stringify()` for schema comparison, which may not catch all equivalent
  schemas.
- **Mutation in addEdgeWithTypeChecking**: The function mutates `state.edges`
  directly (via Immer draft) rather than returning new edges. The
  `removeEdgeWithTypeChecking` function returns new arrays instead. This
  asymmetry exists because the addition function was designed to work within the
  Immer reducer context.

## Examples

### Basic edge addition (no validation)

When `enableTypeInference`, `enableComplexTypeChecking`, and
`allowedConversionsBetweenDataTypes` are all falsy, adding an edge is
straightforward:

```
User connects NodeA:output1 -> NodeB:input1
  -> Cycle check (if enabled): DFS finds no path from NodeB back to NodeA
  -> addEdgeWithTypeChecking():
     -> ReactFlow addEdge() confirms no duplicate
     -> No validation needed
     -> Push { id: "abc123...", source: "NodeA", target: "NodeB",
              sourceHandle: "output1", targetHandle: "input1",
              type: "configurableEdge" } to state.edges
```

### Edge addition with type inference

```
NodeA has output handle with dataType: "number" (underlyingType: "number")
NodeB has input handle with dataType: "generic" (underlyingType: "inferFromConnection")

User connects NodeA:output -> NodeB:input
  -> addEdgeWithTypeChecking():
     -> Loop validation: neither is a loop node, passes
     -> inferTypesAfterEdgeAddition():
        -> Target handle is inferFromConnection, not yet inferred
        -> Infer target from source: set inferredDataType = source's dataType
        -> inferTypeAcrossTheNodeForHandleOfDataType():
           -> All handles on NodeB with dataType "generic" get inferredDataType set
     -> Complex type check: neither is complex, passes
     -> Push edge to state.edges
```

### Edge removal with inference rollback

```
NodeB has inferredDataType set from previous connection to NodeA.
NodeB has no other connections to handles with the same dataTypeUniqueId.

User deletes the edge NodeA:output -> NodeB:input
  -> removeEdgeWithTypeChecking():
     -> inferTypesAfterEdgeRemoval():
        -> Target handle is inferFromConnection
        -> Get all connected edges to NodeB (excluding removed edge)
        -> No remaining connections to handles of this dataType
        -> Reset: inferredDataType = undefined, restore original handle definition
     -> Return updated nodes and edges
```

## Relationships with Other Features

### -> [Data Types](dataTypesDoc.md)

Edges connect handles of specific data types. The validation pipeline checks
type compatibility (same type, allowed conversion, or complex schema match). The
`inferFromConnection` underlying type enables dynamic type inference through
edges.

### -> [Handles](handlesDoc.md)

Edges reference handles by ID (`sourceHandle`, `targetHandle`). Handle colors
drive edge gradient rendering. Handle data types drive the validation pipeline.
Type inference modifies handle properties (`inferredDataType`, `handleColor`,
`name`) when edges are added or removed.

### -> [Nodes](nodesDoc.md)

Edges connect nodes. The cycle detection algorithm traverses node adjacency.
Node data contains the handles that edges reference. When type inference occurs,
node data is mutated to update inferred types across all matching handles.

### -> [Type Inference](typeInferenceDoc.md)

The edge addition pipeline triggers `inferTypesAfterEdgeAddition()` which
propagates types through `inferFromConnection` handles. Edge removal triggers
`inferTypesAfterEdgeRemoval()` which resets inferred types when no connections
remain. See `edges/typeInference.ts` for the low-level inference logic.

### -> [Connection Validation](../features/connectionValidationDoc.md)

All validation functions return `ConnectionValidationResult`. The pipeline runs
validations in sequence: loop validation -> type inference -> complex type
checking -> type conversion checking. Each step only runs if the previous
passed.

### -> [Loops](../features/loopsDoc.md)

Loop nodes (loopStart, loopStop, loopEnd) have special edge validation via
`isLoopConnectionValid()`. The `bindLoopNodes` data type creates structural
edges that connect the loop triplet. These structural edges are skipped during
compilation (no data flows through them). Loop nodes get duplicate infer handles
added after inference to allow multiple data channels.

### -> [State Management](stateManagementDoc.md)

Edge operations flow through `mainReducer.ts` actions: `ADD_EDGE_BY_REACT_FLOW`
and `UPDATE_EDGES_BY_REACT_FLOW`. The reducer orchestrates cycle checking before
edge addition and delegates to
`addEdgeWithTypeChecking`/`removeEdgeWithTypeChecking`. State mutations happen
within Immer's `produce()` context.

### -> [Runner](../runner/runnerHookDoc.md)

The compiler transforms edges into `inputResolutionMap` and
`outputDistributionMap` (keyed by `"nodeId:handleId"`). The executor uses these
maps to resolve input values from the `ValueStore` and build metadata for
function implementations. `bindLoopNodes` edges are excluded from the data flow
maps.

### -> [ConfigurableEdge UI](../ui/configurableEdgeDoc.md)

The `ConfigurableEdge` React component renders all edges. It reads handle colors
from node data via `useNodesData()` and
`getHandleFromNodeDataMatchingHandleId()`, computes bezier paths, applies SVG
gradients, and uses `IntersectionObserver` for viewport optimization.

### -> [Import/Export](../importExport/importExportDoc.md)

Edges are serialized as part of graph state export. During import, orphan edges
(referencing non-existent nodes or handles) can be automatically removed when
`repair.removeOrphanEdges` is enabled. Duplicate edge IDs can be resolved with
`repair.removeDuplicateEdgeIds`.
