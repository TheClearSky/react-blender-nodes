# Type Inference

## Overview

Type inference is the system that resolves `inferFromConnection` data types at
runtime when edges are added or removed. Handles with the `inferFromConnection`
underlying type have no concrete type until they are connected to another handle
that does. The inference system:

1. Copies the concrete type from the non-infer handle to the infer handle when
   an edge is added
2. Cascades the inferred type across all handles of the same node that share the
   same data type identifier
3. Resets inferred types when the last connection to any handle of that data
   type on a node is removed
4. Adds duplicate infer handles on group and loop nodes after inference, so
   further connections can be made

This system is opt-in via `state.enableTypeInference`. When disabled,
`inferFromConnection` handles are never resolved and all connections are allowed
without inference.

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
       |       * |      Edge       |        |       DataType            |
       +-------->|------------------|        |---------------------------|
                 | source           |        | name                      |
                 | target           |        | underlyingType            |
                 | sourceHandle     |        |   'inferFromConnection'   |
                 | targetHandle     |        |   | 'string' | 'number'  |
                 +------------------+        |   | 'boolean' | 'complex'|
                                             |   | 'noEquivalent'       |
                                             | color                    |
                                             +---------------------------+
```

## Functional Dependency Diagram

```
addEdgeWithTypeChecking
  |
  +-- [guard] state.enableTypeInference?
  |     |
  |     +-- inferTypesAfterEdgeAddition
  |           |
  |           +-- Determine which node/handle needs inference
  |           |     (source infer? target infer? both infer?)
  |           |
  |           +-- inferTypeAcrossTheNodeForHandleOfDataType
  |           |     |
  |           |     +-- transformHandlesInNodeDataInPlace
  |           |           |
  |           |           +-- inferTypeOnHandleAfterConnectingWithAnotherHandle
  |           |                 (per matching handle)
  |           |
  |           +-- addDuplicateHandleToNodeGroupAfterInference
  |           |     (if groupInput/groupOutput involved)
  |           |
  |           +-- addDuplicateHandlesToLoopNodesAfterInference
  |                 (if loopStart/loopStop/loopEnd involved)
  |
  +-- [guard] state.enableComplexTypeChecking?
  |     +-- checkComplexTypeCompatibilityAfterEdgeAddition
  |
  +-- [guard] state.allowedConversionsBetweenDataTypes?
        +-- checkTypeConversionCompatibilityAfterEdgeAddition

removeEdgeWithTypeChecking
  |
  +-- [guard] state.enableTypeInference?
        |
        +-- inferTypesAfterEdgeRemoval
              |
              +-- For each infer handle side (source/target):
                    |
                    +-- Collect all handles of same dataType on node
                    +-- Check if ANY of them still have a remaining edge
                    +-- If none connected: inferTypeAcrossTheNodeForHandleOfDataType
                          with resetInferredType: true
```

## Data Flow Diagram

```
EDGE ADDITION FLOW
===================

User connects Handle A (output) ----edge----> Handle B (input)
                |                                    |
                v                                    v
     Is A.underlyingType              Is B.underlyingType
     'inferFromConnection'?           'inferFromConnection'?
          |        |                       |        |
         YES      NO                     YES      NO
          |        |                       |        |
          v        v                       v        v
    +-----------+  +-----------+     +-----------+  +-----------+
    | A is the  |  | A has a   |     | B is the  |  | B has a   |
    | infer     |  | concrete  |     | infer     |  | concrete  |
    | handle    |  | type      |     | handle    |  | type      |
    +-----------+  +-----------+     +-----------+  +-----------+
          |              |                 |              |
          +--------------+-----------------+--------------+
                         |
                         v
              Determine inference direction:
              +------------------------------------+
              | Case 1: Only A is infer            |
              |   -> Copy B's type to A            |
              |   -> Cascade across A's node       |
              |                                    |
              | Case 2: Only B is infer            |
              |   -> Copy A's type to B            |
              |   -> Cascade across B's node       |
              |                                    |
              | Case 3: Both are infer             |
              |   -> If one already inferred,      |
              |      copy to the other             |
              |   -> If neither inferred, REJECT   |
              |   -> If both inferred, ALLOW       |
              |                                    |
              | Case 4: Neither is infer           |
              |   -> No inference needed           |
              +------------------------------------+
                         |
                         v
              inferTypeAcrossTheNodeForHandleOfDataType
              +------------------------------------+
              | For each handle on the node:       |
              |   if handle.dataType.id ==         |
              |      dataTypeToInferFor:           |
              |     -> Set inferredDataType        |
              |     -> Optionally override         |
              |        dataType and name           |
              |        (for groups/loops)          |
              +------------------------------------+
                         |
                         v
              Dynamic handle addition
              +------------------------------------+
              | If group node: add duplicate       |
              |   handle to groupInput/Output +    |
              |   propagate across node type tree  |
              |                                    |
              | If loop node: add duplicate        |
              |   input AND output infer handles   |
              +------------------------------------+


EDGE REMOVAL FLOW
==================

User removes edge between Handle A and Handle B
                |
                v
     For each side (A and B) that has
     underlyingType === 'inferFromConnection':
                |
                v
     Collect all handles on that node
     with the same dataTypeUniqueId
                |
                v
     Are ANY of those handles still
     connected via remaining edges?
         |              |
        YES            NO
         |              |
         v              v
     Do nothing    Reset inferredDataType
                   across the entire node
                   for that dataType
                   (using original handle
                    from typeOfNodes as
                    template with
                    resetInferredType: true)
```

## System Diagram

```
+-----------------------------------------------------------------------+
|                          State                                        |
|                                                                       |
|  enableTypeInference: true                                            |
|                                                                       |
|  dataTypes: {                                                         |
|    groupInfer: { underlyingType: 'inferFromConnection', ... }         |
|    loopInfer:  { underlyingType: 'inferFromConnection', ... }         |
|    myString:   { underlyingType: 'string', ... }                      |
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

INFERENCE PIPELINE (within addEdgeWithTypeChecking):
+-------------------+     +-------------------+     +-------------------+
| 1. Loop path      | --> | 2. Type           | --> | 3. Complex type   |
|    validation      |     |    inference       |     |    compatibility  |
| isLoopConnection- |     | inferTypesAfter-  |     | checkComplex...   |
|   Valid            |     |   EdgeAddition    |     |   AfterEdge...    |
+-------------------+     +-------------------+     +-------------------+
                                                            |
                                                            v
                                                    +-------------------+
                                                    | 4. Type           |
                                                    |    conversion     |
                                                    |    compatibility  |
                                                    | checkTypeConv...  |
                                                    +-------------------+
```

## How Inference Works

### The inferFromConnection Type

`inferFromConnection` is a special underlying type defined in
`supportedUnderlyingTypes`. Unlike `string`, `number`, `boolean`, `complex`, and
`noEquivalent`, it has no concrete value semantics. Instead, it acts as a
placeholder that says "I'll become whatever type I'm connected to."

Two standard data types use it:

- **`groupInfer`** — used on `groupInput` outputs and `groupOutput` inputs
- **`loopInfer`** — used on `loopStart`, `loopStop`, and `loopEnd` infer handles

Each handle stores two type fields:

- `dataType` — the declared type (e.g.,
  `{ dataTypeUniqueId: 'loopInfer', dataTypeObject: { underlyingType: 'inferFromConnection' } }`)
- `inferredDataType` — populated at runtime when inference resolves the concrete
  type (e.g.,
  `{ dataTypeUniqueId: 'myString', dataTypeObject: { underlyingType: 'string' } }`)

### On Edge Addition

When `addEdgeWithTypeChecking` is called and `state.enableTypeInference` is
`true`, the function `inferTypesAfterEdgeAddition` is invoked. It:

1. **Retrieves both handles** from the source and target nodes
2. **Checks if either handle has `underlyingType === 'inferFromConnection'`**
3. **Determines the inference direction** based on four cases:
   - **Neither is infer** → no inference needed, return valid
   - **Only source is infer** → if not already inferred, copy target's type to
     source node
   - **Only target is infer** → if not already inferred, copy source's type to
     target node
   - **Both are infer** → if one is already inferred, copy to the other; if
     neither is inferred, reject the connection; if both are already inferred,
     allow (compatibility checked later)
4. **Calls `inferTypeAcrossTheNodeForHandleOfDataType`** to cascade
5. **Calls dynamic handle addition** for groups and loops

### On Edge Removal

When `removeEdgeWithTypeChecking` is called and `state.enableTypeInference` is
`true`, the function `inferTypesAfterEdgeRemoval` is invoked. For each side of
the removed edge that has `underlyingType === 'inferFromConnection'`:

1. **Collects all handles on the node** that share the same `dataTypeUniqueId`
2. **Checks all remaining edges** (excluding the removed one) to see if any of
   those handles are still connected
3. **If no handles of that data type are still connected**, resets the inferred
   type across the entire node by calling
   `inferTypeAcrossTheNodeForHandleOfDataType` with `resetInferredType: true`
   and the original handle template from `constructTypeOfHandleFromIndices`
4. **If at least one handle is still connected**, the inferred type is preserved

This ensures that inference is only reset when all connections to that data type
are severed.

### Cascading Across Node Handles

The function `inferTypeAcrossTheNodeForHandleOfDataType` iterates over **all**
handles (both inputs and outputs) on a node using
`transformHandlesInNodeDataInPlace`. For each handle whose
`dataType.dataTypeUniqueId` matches the `dataTypeToInferFor` parameter, it calls
`inferTypeOnHandleAfterConnectingWithAnotherHandle`.

This means if a `loopStart` node has:

- Input `[0]` with `dataType: loopInfer`
- Output `[1]` with `dataType: loopInfer`

When input `[0]` gets connected to a `string` handle, **both** input `[0]` and
output `[1]` receive the inferred `string` type. This cascade is what makes loop
data flow work — the type propagates from the input side through to the output
side of the same node.

### Dynamic Handle Addition After Inference

After inference cascades, the system adds new empty infer handles so that
additional connections can be made:

- **For node groups**: `addDuplicateHandleToNodeGroupAfterInference` adds a new
  infer handle at the end of the group input's outputs or group output's inputs.
  It also propagates this change across the entire node type tree via
  `addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees`.
- **For loop nodes**: `addDuplicateHandlesToLoopNodesAfterInference` adds
  **both** a new input and output infer handle at the end of the respective
  handle lists. This is because loop nodes need matching input/output pairs.

## Key Functions

### inferTypeOnHandleAfterConnectingWithAnotherHandle

**File**: `src/utils/nodeStateManagement/edges/typeInference.ts`

The lowest-level inference function. Given a handle and a connected handle's
information, it:

1. Determines the `inferredDataType` from the connected handle (preferring
   `inferredDataType` over `dataType`)
2. If `resetInferredType` is true, sets `inferredDataType` to `undefined`
3. Optionally copies over `dataType` (override) and `name` (for groups/loops)
4. Copies additional handle properties (like `allowInput`, `maxConnections`)
   from the connected handle if it has a full data type object
5. Supports both mutable (default) and immutable (via immer `produce`) operation

### inferTypeAcrossTheNodeForHandleOfDataType

**File**: `src/utils/nodeStateManagement/edges/typeInference.ts`

Cascades inference across an entire node. Given a node's data, a
`dataTypeToInferFor` identifier, and connected handle info, it:

1. Calls `transformHandlesInNodeDataInPlace` to iterate all handles
2. For each handle whose `dataType.dataTypeUniqueId === dataTypeToInferFor`,
   calls `inferTypeOnHandleAfterConnectingWithAnotherHandle`
3. Supports both mutable and immutable operation

### inferTypesAfterEdgeAddition

**File**: `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts`

The main orchestrator for edge-addition inference. It:

1. Determines which node needs updating and what data type to infer for
2. Handles the four cases (neither infer, source infer, target infer, both
   infer)
3. Sets `overrideDataType` and `overrideName` flags for group input/output and
   loop nodes
4. Calls `inferTypeAcrossTheNodeForHandleOfDataType`
5. Calls `addDuplicateHandleToNodeGroupAfterInference`
6. Calls `addDuplicateHandlesToLoopNodesAfterInference`
7. Returns a validation result

### inferTypesAfterEdgeRemoval

**File**: `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts`

The main orchestrator for edge-removal inference. For each side of the removed
edge:

1. Checks if the handle's underlying type is `inferFromConnection`
2. Collects all handles on the node sharing the same `dataTypeUniqueId`
3. Checks if any of those handles are still connected via remaining edges
   (excluding the removed one)
4. If none are connected, resets inference by calling
   `inferTypeAcrossTheNodeForHandleOfDataType` with a freshly constructed
   original handle template and `resetInferredType: true`

### getResultantDataTypeOfHandleConsideringInferredType

**File**: `src/utils/nodeStateManagement/constructAndModifyHandles.ts`

A utility function used after inference (especially for type compatibility
checking). It:

1. If the handle's main `dataType` is not `inferFromConnection`, returns the
   main `dataType` directly
2. If it is `inferFromConnection`, returns the `inferredDataType` if available
3. If not inferred and `fallbackToInferFromConnectionTypeWhenNotInferred` is
   true, returns the raw `inferFromConnection` type
4. Otherwise returns `undefined`

## Inference for Node Groups

### How groupInfer handles work

Group nodes (`groupInput` and `groupOutput`) use the `groupInfer` data type,
which has `underlyingType: 'inferFromConnection'`. This allows node groups to be
polymorphic — they accept any type and pass it through.

- `groupInput` has one output with `dataType: groupInfer` — this is the handle
  inside the group that feeds data in
- `groupOutput` has one input with `dataType: groupInfer` — this is the handle
  inside the group that collects data out

When a concrete-typed handle is connected to a group input's output (inside the
group), the `groupInfer` handle gets inferred to that concrete type. The
`overrideDataType` and `overrideName` flags are set to `true` for group nodes,
meaning the original `dataType` field itself gets overwritten (not just
`inferredDataType`).

### addDuplicateHandleToNodeGroupAfterInference

**File**: `src/utils/nodeStateManagement/nodes/nodeGroups.ts`

After a group input or output handle gets inferred:

1. Creates a new blank infer handle from the node type template using
   `constructTypeOfHandleFromIndices`
2. Inserts it at the end of the handle list (`index1: -1`, `'after'`) using
   `insertOrDeleteHandleInNodeDataUsingHandleIndices`
3. Propagates the new handle across the entire node type tree by calling
   `addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees` on the
   `unmodifiedState`, which:
   - Adds the handle to the node type definition itself
   - Adds it to all subtrees of dependent node types
   - Adds it to all instances of that node type in the root graph

This ensures that every instance of the node group (and the node type
definition) gets the new handle.

## Inference for Loop Nodes

### How loopInfer handles work

Loop nodes (`loopStart`, `loopStop`, `loopEnd`) use the `loopInfer` data type
with `underlyingType: 'inferFromConnection'`. The infer handles are at specific
indices:

| Node Type | Input Infer Index | Output Infer Index |
| --------- | ----------------- | ------------------ |
| loopStart | 0                 | 1                  |
| loopStop  | 2                 | 1                  |
| loopEnd   | 1                 | 0                  |

These indices skip over non-infer handles like `bindLoopNodes` (at fixed
positions) and `condition` (on loopStop).

When inference cascades on a loop node, all handles with `dataType: loopInfer`
get the same inferred type — both the input and output infer handles. This is
how data type flows through the loop: a value enters `loopStart` input, exits
`loopStart` output with the same inferred type, flows through the loop body,
enters `loopStop` input, and so on.

### addDuplicateHandlesToLoopNodesAfterInference

**File**: `src/utils/nodeStateManagement/nodes/loops.ts`

After a loop node's infer handle gets inferred:

1. Creates a new blank input infer handle from the node type template
2. Inserts it at the end of inputs (`index1: -1`, `'after'`)
3. Creates a new blank output infer handle from the node type template
4. Inserts it at the end of outputs (`index1: -1`, `'after'`)

Unlike group nodes, loop nodes add **both** input and output handles
simultaneously, because loop nodes always need matching input/output pairs for
data to flow through. Also unlike group nodes, loop handle duplication is local
to the node instance — it does not propagate across a node type tree.

## Limitations and Deprecated Patterns

1. **Two unresolved infer handles cannot connect**: If both the source and
   target handles are `inferFromConnection` and neither has been inferred yet,
   the connection is rejected. At least one side must already have a concrete or
   inferred type.

2. **No transitive inference across edges**: Inference only propagates across
   handles within the same node (same `dataTypeUniqueId`). It does not
   automatically chain from node A through node B to node C. Each edge addition
   triggers inference independently.

3. **Reset is all-or-nothing per data type**: When the last edge to any handle
   of a given data type is removed, ALL handles of that data type on the node
   are reset — not just the specific handle that was disconnected.

4. **Group inference propagation uses unmodified state**: The
   `addDuplicateHandleToNodeGroupAfterInference` function receives the
   `unmodifiedState` for propagating handle additions across the node type tree.
   This prevents double-counting changes that were already made by inference.

5. **No undo of dynamic handle addition**: When infer handles are duplicated
   after inference, removing the edge does not automatically remove the
   duplicated handles. The handles remain even after inference reset.

## Examples

### Example 1: Basic Inference on Edge Addition

```
Before connection:
  NodeA output[0]: dataType=myString (underlyingType: 'string')
  LoopStart input[0]: dataType=loopInfer (underlyingType: 'inferFromConnection')
                       inferredDataType=undefined

User connects NodeA.output[0] -> LoopStart.input[0]

After inference:
  LoopStart input[0]: dataType=loopInfer
                       inferredDataType=myString (underlyingType: 'string')
  LoopStart output[1]: dataType=loopInfer          <-- cascaded!
                        inferredDataType=myString (underlyingType: 'string')

  LoopStart input[1]: NEW blank loopInfer handle   <-- dynamic addition
  LoopStart output[2]: NEW blank loopInfer handle  <-- dynamic addition
```

### Example 2: Inference Reset on Edge Removal

```
Before removal:
  LoopStart input[0]: dataType=loopInfer, inferredDataType=myString
  LoopStart output[1]: dataType=loopInfer, inferredDataType=myString
  (only one edge connected to input[0])

User removes the edge to LoopStart.input[0]

System checks: are any handles with dataType=loopInfer still connected?
  -> input[0]: no remaining edges
  -> output[1]: no remaining edges (or edges to other infer nodes)
  -> input[1]: no remaining edges (blank handle)
  -> Answer: NO

After reset:
  LoopStart input[0]: dataType=loopInfer, inferredDataType=undefined
  LoopStart output[1]: dataType=loopInfer, inferredDataType=undefined
```

### Example 3: Both Handles Are Infer (One Already Inferred)

```
LoopStart output[1]: dataType=loopInfer, inferredDataType=myString (already inferred)
LoopEnd input[1]: dataType=loopInfer, inferredDataType=undefined (not yet inferred)

User connects LoopStart.output[1] -> LoopEnd.input[1]

Both are inferFromConnection.
Source (LoopStart) already has inferredDataType.
Target (LoopEnd) does not.
  -> Copy LoopStart's inferred type to LoopEnd.

After inference:
  LoopEnd input[1]: dataType=loopInfer, inferredDataType=myString
  LoopEnd output[0]: dataType=loopInfer, inferredDataType=myString  <-- cascaded
```

### Example 4: Group Node Inference with Propagation

```
Inside a node group, user connects:
  SomeNode.output[0] (dataType=myNumber) -> GroupOutput.input[0] (dataType=groupInfer)

After inference:
  GroupOutput.input[0]: dataType=myNumber (overridden!), name='Value'
  GroupOutput.input[1]: NEW blank groupInfer handle

The node group type definition also gets a new output added.
All instances of this node group in the graph get the new output.
```

## Relationships with Other Features

### -> [Data Types](dataTypesDoc.md)

Type inference depends on the `inferFromConnection` underlying type defined in
`supportedUnderlyingTypes`. The two standard data types that use it
(`groupInfer` and `loopInfer`) are defined in `standardNodes.ts`. Custom
`inferFromConnection` data types could theoretically be created, though the
system is primarily designed for these two.

### -> [Handles](handlesDoc.md)

Each handle stores both `dataType` (the declared type) and `inferredDataType`
(the resolved type). The `getResultantDataTypeOfHandleConsideringInferredType`
function abstracts this duality — callers that need "the actual type of this
handle" should use this function rather than reading `dataType` directly.

### -> [Edges](edgesDoc.md)

Inference is triggered exclusively by edge addition and removal. The
`addEdgeWithTypeChecking` and `removeEdgeWithTypeChecking` functions in
`constructAndModifyHandles.ts` serve as the entry points. Inference happens
**before** the edge is actually pushed to `state.edges` — if inference fails
validation, the edge is rejected.

### -> [Node Groups](../features/nodeGroupsDoc.md)

Group input/output nodes use `groupInfer` handles. When a handle gets inferred
on these nodes, the system adds duplicate handles and propagates changes across
the node type tree (including all subtrees and instances). The
`overrideDataType` and `overrideName` flags are set to `true`, meaning the
handle's `dataType` itself gets replaced with the inferred type.

### -> [Loops](../features/loopsDoc.md)

Loop nodes (`loopStart`, `loopStop`, `loopEnd`) use `loopInfer` handles at
specific indices. Inference cascades across input and output infer handles on
the same node. After inference, both new input and output handles are duplicated
locally. The `overrideDataType` and `overrideName` flags are also set to `true`
for loop nodes.

### -> [Connection Validation](../features/connectionValidationDoc.md)

Inference runs as the first validation step in the edge-addition pipeline. After
inference resolves types, subsequent steps
(`checkComplexTypeCompatibilityAfterEdgeAddition`,
`checkTypeConversionCompatibilityAfterEdgeAddition`) use
`getResultantDataTypeOfHandleConsideringInferredType` to check compatibility
against the now-resolved types.

### -> [State Management](stateManagementDoc.md)

The `enableTypeInference` flag on the `State` type gates the entire system. When
`false`, `addEdgeWithTypeChecking` and `removeEdgeWithTypeChecking` skip all
inference logic. The inference functions mutate state directly (handles are
modified in-place via `Object.assign` and array splicing) as they operate within
the reducer's immer draft context.
