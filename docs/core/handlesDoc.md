# Handles

## Overview

Handles are the input and output ports on nodes in the react-blender-nodes graph
editor. They serve as the primary connection points through which edges link
nodes together, enabling data flow across the graph.

The handle system operates at two distinct levels:

1. **Type-level definitions** (`TypeOfInput`, `TypeOfInputPanel`): These define
   what a handle _looks like_ in a node type definition -- its name, data type
   reference, whether it allows direct user input, and connection limits.
   Type-level definitions are templates; they don't carry unique IDs or runtime
   values.

2. **Instance-level handles** (`ConfigurableNodeInput`,
   `ConfigurableNodeOutput`, `ConfigurableNodeInputPanel`): These are the actual
   instantiated handles on placed nodes. Each instance has a unique ID
   (generated at construction time), a current value, an optional inferred data
   type, handle color, handle shape, and an `onChange` callback. Instance-level
   handles are what get rendered in the UI and connected by edges.

Additionally, handles can be grouped into **input panels** (`TypeOfInputPanel` /
`ConfigurableNodeInputPanel`), which are collapsible groups of inputs displayed
together in the node UI. This nesting creates a two-dimensional addressing
system (`HandleIndices`) that is central to how handles are located, iterated,
and manipulated.

---

## Entity-Relationship Diagram

```
+-------------------+        references        +-------------------+
|    DataType        |<-------------------------+   TypeOfInput      |
|  (color, shape,    |                          |  (name, dataType,  |
|   underlyingType,  |                          |   allowInput,      |
|   allowInput,      |                          |   maxConnections)  |
|   maxConnections)  |                          +--------+----------+
+-------------------+                                    |
        |                                                | defined in
        | determines                                     v
        | appearance      +-------------------+    +-------------------+
        +---------------->| ConfigurableNode  |    |  TypeOfNode        |
                          |   Input/Output    |    |  (inputs[], which  |
                          | (id, name, value, |    |   can be TypeOfInput|
                          |  handleColor,     |    |   or TypeOfInput   |
                          |  handleShape,     |    |   Panel; outputs[])|
                          |  dataType,        |    +-------------------+
                          |  inferredDataType,|             |
                          |  type, onChange)  |             | instantiated via
                          +---------+---------+             | constructNodeOfType
                                    |                       |
                          rendered  |              +--------v----------+
                          via       |              | Node Instance      |
                                    v              | (node.data.inputs, |
                          +---------+---------+    |  node.data.outputs)|
                          | ContextAwareHandle |   +--------+----------+
                          | (ReactFlow Handle  |            |
                          |  with custom shape)|            | connected by
                          +-------------------+             v
                                                   +-------------------+
                                                   |     Edge           |
                                                   | (source, target,   |
                                                   |  sourceHandle,     |
                                                   |  targetHandle)     |
                                                   +-------------------+
```

---

## Functional Dependency Diagram

```
                        +------------------+
                        |    DataType       |
                        | (foundation)      |
                        +--------+---------+
                                 |
                    depends on   |   determines color, shape,
                                 |   underlyingType, allowInput
                                 v
                        +------------------+
                        |    Handle         |
                        | (TypeOfInput &    |
                        |  Configurable     |
                        |  NodeInput/Output)|
                        +--------+---------+
                                 |
              +------------------+------------------+
              |                  |                  |
              v                  v                  v
     +----------------+  +----------------+  +------------------+
     | Type Inference  |  | Edge System    |  | Runner System    |
     | (resolves       |  | (connects      |  | (maps handles to |
     |  inferFrom      |  |  handles via   |  |  InputHandleValue|
     |  Connection)    |  |  sourceHandle/ |  |  & OutputHandle  |
     +----------------+  |  targetHandle)  |  |  Info)           |
                          +----------------+  +------------------+
              |                  |
              v                  v
     +----------------+  +------------------+
     | Node Groups     |  | Loop Nodes       |
     | (dynamic handle |  | (dynamic handle  |
     |  addition on    |  |  addition, both  |
     |  GroupInput/     |  |  input & output  |
     |  GroupOutput)    |  |  duplicated)     |
     +----------------+  +------------------+
```

---

## Data Flow Diagram

```
  TypeOfInput definition          constructInputOrOutputOfType()
  { name, dataType,        -----> Looks up DataType, generates
    allowInput,                   unique ID, determines type
    maxConnections }              (string/number/boolean/
                                   unsupportedDirectly)
                                          |
                                          v
                                  ConfigurableNodeInput instance
                                  { id, name, type, value,
                                    handleColor, handleShape,
                                    dataType, allowInput,
                                    maxConnections }
                                          |
                          +---------------+---------------+
                          |                               |
                          v                               v
                  ContextAwareHandle            ContextAwareInput
                  (renders handle shape         (renders Input or
                   with color; wraps             SliderNumberInput or
                   ReactFlow <Handle>            Checkbox when
                   when inside ReactFlow)        allowInput && !connected)
                          |                               |
                          v                               v
                  Edge Connection                 User enters value
                  (edge.sourceHandle =            (updates node data via
                   output.id,                     updateHandleInNode
                   edge.targetHandle =             DataMatchingHandleId)
                   input.id)
                          |
                          v
                  Runner Execution
                  (handles mapped to
                   InputHandleValue {
                     connections[],
                     handleId, handleName,
                     dataTypeId, isDefault,
                     defaultValue
                   }
                   and OutputHandleInfo {
                     handleId, handleName,
                     dataTypeId, connections[]
                   })
```

---

## System Diagram

```
react-blender-nodes
|
+-- State
|   +-- dataTypes: Record<DataTypeUniqueId, DataType>
|   +-- typeOfNodes: Record<NodeTypeUniqueId, TypeOfNode>
|   |   +-- inputs: (TypeOfInput | TypeOfInputPanel)[]    <-- type-level handles
|   |   +-- outputs: TypeOfInput[]                         <-- type-level handles
|   +-- nodes[]
|   |   +-- data.inputs: (ConfigurableNodeInput | ConfigurableNodeInputPanel)[]
|   |   +-- data.outputs: ConfigurableNodeOutput[]         <-- instance-level handles
|   +-- edges[]
|       +-- sourceHandle: string  (references output handle id)
|       +-- targetHandle: string  (references input handle id)
|
+-- Handle Utilities (src/utils/nodeStateManagement/handles/)
|   +-- types.ts           HandleIndices, AllTypesOfHandles, etc.
|   +-- handleGetters.ts   getHandleFromNodeDataMatchingHandleId, etc.
|   +-- handleSetters.ts   insertOrDeleteHandleInNodeDataUsingHandleIndices, etc.
|   +-- handleIterators.ts handleIteratorIncludingIndices, handleIterator
|
+-- Handle Construction (src/utils/nodeStateManagement/nodes/)
|   +-- constructAndModifyNodes.ts  constructInputOrOutputOfType,
|   |                               constructTypeOfHandleFromIndices
|   +-- constructAndModifyHandles.ts  addAnInputOrOutput...AcrossStateIncludingSubtrees,
|                                     getResultantDataTypeOfHandleConsideringInferredType
|
+-- UI Rendering (src/components/organisms/ConfigurableNode/)
|   +-- ConfigurableNode.tsx         RenderInput, RenderOutput, RenderInputPanel
|   +-- ContextAwareHandle.tsx       Handle shape rendering (13 shapes)
|   +-- ContextAwareInput.tsx        Interactive input when allowInput && !connected
|   +-- ContextAwareHandleShapes.ts  HandleShape type and handleShapesMap
|
+-- Dynamic Handle Addition
|   +-- nodeGroups.ts  addDuplicateHandleToNodeGroupAfterInference
|   +-- loops.ts       addDuplicateHandlesToLoopNodesAfterInference
|
+-- Runner Integration
    +-- types.ts  InputHandleValue, OutputHandleInfo, InputConnectionValue
```

---

## Type Definitions

### TypeOfInput\<DataTypeUniqueId\>

The type-level definition of a handle. Used in `TypeOfNode.inputs[]` and
`TypeOfNode.outputs[]`.

```typescript
type TypeOfInput<DataTypeUniqueId extends string = string> = {
  name: string; // Display name
  dataType: DataTypeUniqueId; // Reference to a key in state.dataTypes
  allowInput?: boolean; // Override DataType.allowInput for this handle
  maxConnections?: number; // Override DataType.maxConnections
};
```

**Key behavior**: `allowInput` and `maxConnections` on `TypeOfInput` take
precedence over the same fields on `DataType`. If not specified on
`TypeOfInput`, the values from the referenced `DataType` are used as fallback
(see `constructInputOrOutputOfType`).

### TypeOfInputPanel\<DataTypeUniqueId\>

Groups multiple `TypeOfInput` entries into a collapsible panel.

```typescript
type TypeOfInputPanel<DataTypeUniqueId extends string = string> = {
  name: string; // Panel display name
  inputs: TypeOfInput<DataTypeUniqueId>[]; // Inputs within the panel
};
```

### ConfigurableNodeInput

The instance-level input handle on a placed node. Created by
`constructInputOrOutputOfType`.

```typescript
type ConfigurableNodeInput<
  UnderlyingType,
  ComplexSchemaType,
  DataTypeUniqueId,
> = {
  id: string; // Unique runtime ID (20-char random string)
  name: string; // Display name (from TypeOfInput.name)
  handleColor?: string; // From DataType.color
  handleShape?: HandleShape; // From DataType.shape
  allowInput?: boolean; // Resolved from TypeOfInput or DataType
  maxConnections?: number; // Resolved from TypeOfInput or DataType
  dataType?: {
    // Reference to the DataType definition
    dataTypeObject: DataType;
    dataTypeUniqueId: DataTypeUniqueId;
  };
  inferredDataType?: {
    // Set when type inference resolves an
    dataTypeObject: DataType; // inferFromConnection handle
    dataTypeUniqueId: DataTypeUniqueId;
  } | null;
} & (
  | { type: 'string'; value?: string; onChange?: (v: string) => void }
  | { type: 'number'; value?: number; onChange?: (v: number) => void }
  | { type: 'boolean'; value?: boolean; onChange?: (v: boolean) => void }
  | {
      type: 'unsupportedDirectly';
      value?: unknown;
      onChange?: (v: unknown) => void;
    }
);
```

The `type` discriminant is determined by `DataType.underlyingType`:

- `'string'` -> `type: 'string'`
- `'number'` -> `type: 'number'`
- `'boolean'` -> `type: 'boolean'`
- Everything else (`'complex'`, `'noEquivalent'`, `'inferFromConnection'`) ->
  `type: 'unsupportedDirectly'`

### ConfigurableNodeOutput

Similar to `ConfigurableNodeInput` but without value/onChange (outputs don't
accept direct user input). Has the same `id`, `name`, `handleColor`,
`handleShape`, `maxConnections`, `dataType`, and `inferredDataType` fields.

### ConfigurableNodeInputPanel

Instance-level panel grouping inputs together.

```typescript
type ConfigurableNodeInputPanel<UnderlyingType, ComplexSchemaType, DataTypeUniqueId> = {
  id: string;                                          // Unique panel ID
  name: string;                                        // Panel display name
  inputs: ConfigurableNodeInput<...>[];                // Instantiated inputs
};
```

### HandleIndices

The addressing system for locating handles within the nested input/panel/output
structure. This is the most critical type for handle manipulation.

```typescript
type HandleIndices =
  | { type: 'input'; index1: number; index2: number | undefined }
  | { type: 'output'; index1: number; index2: undefined };
```

See [Handle Addressing](#handle-addressing-handleindices) for a detailed
explanation.

### HandleShape

Union of 13 visual shapes for handle rendering.

```typescript
type HandleShape =
  | 'circle'
  | 'square'
  | 'rectangle'
  | 'list'
  | 'grid'
  | 'diamond'
  | 'trapezium'
  | 'hexagon'
  | 'star'
  | 'cross'
  | 'zigzag'
  | 'sparkle'
  | 'parallelogram';
```

The shape is set on `DataType.shape` and flows through to
`ConfigurableNodeInput.handleShape` during construction.

### AllTypesOfHandles

A union type that covers both type-level and instance-level handle arrays. Used
as a generic constraint in handle utility functions so they can operate on both
`TypeOfNode.inputs/outputs` and `node.data.inputs/outputs`.

```typescript
type AllTypesOfHandles =
  | State['nodes'][number]['data']['inputs'] // instance-level inputs
  | State['nodes'][number]['data']['outputs'] // instance-level outputs
  | State['typeOfNodes'][id]['inputs'] // type-level inputs
  | State['typeOfNodes'][id]['outputs']; // type-level outputs
```

### InstantiatedTypesOfHandles

A subset of `AllTypesOfHandles` restricted to instance-level handles only (from
`node.data`).

### NonPanelTypesOfHandles

Excludes `ConfigurableNodeInputPanel` and `TypeOfInputPanel` from a handle
union. This gives you only individual handles (not panels), which is what the
iterator yields.

### HandleAndRelatedInformation

The return type of handle iterators and getters. Bundles the handle value with
its addressing information.

```typescript
type HandleAndRelatedInformation = {
  value: NonPanelTypesOfHandles; // The actual handle (input or output)
  handleIndices: HandleIndices; // Where it lives in the structure
  parentArray: AllTypesOfHandles; // The array containing this handle
  parentArrayIndex: number; // Index within the parent array
};
```

---

## Handle Lifecycle

### 1. Definition in TypeOfNode

Handles begin as `TypeOfInput` or `TypeOfInputPanel` entries in a `TypeOfNode`
definition:

```typescript
const myNodeType = makeTypeOfNodeWithAutoInfer({
  name: 'My Node',
  inputs: [
    { name: 'Value', dataType: 'stringType', allowInput: true },
    {
      name: 'Settings',
      inputs: [{ name: 'Threshold', dataType: 'numberType', allowInput: true }],
    },
  ],
  outputs: [{ name: 'Result', dataType: 'stringType' }],
});
```

### 2. Instantiation via constructInputOrOutputOfType

When a node is placed in the graph (via `constructNodeOfType`), each
`TypeOfInput` is transformed into a `ConfigurableNodeInput` or
`ConfigurableNodeOutput`:

1. The function looks up the referenced `DataType` from `state.dataTypes`
2. It generates a unique 20-character random ID
3. It resolves `allowInput` and `maxConnections` (handle-level overrides
   DataType-level)
4. It determines the `type` discriminant from `DataType.underlyingType`
5. It copies `color` and `shape` from the `DataType`

Panels are processed by `constructInputPanelOfType`, which generates a panel ID
and constructs each inner input.

### 3. Rendering via ContextAwareHandle

`ContextAwareHandle` renders the visual handle shape. It has two modes:

- **Inside ReactFlow**: Wraps the shape in a ReactFlow `<Handle>` component with
  proper `type` (source/target), `position`, and `id`. Manages `isConnectable`
  based on `maxConnections` vs current connection count.
- **Outside ReactFlow** (preview/storybook): Renders the shape as a positioned
  `<div>`.

The component supports 13 shapes via `renderHandleShape()`, using CSS,
`clip-path`, and CSS masks for complex shapes.

### 4. User Input via ContextAwareInput

When `allowInput` is true and the handle is not connected, `ContextAwareInput`
renders an interactive input component:

- `type: 'string'` -> `<Input>` text field
- `type: 'number'` -> `<SliderNumberInput>` slider
- `type: 'boolean'` -> `<Checkbox>`

Inside ReactFlow, `ReactFlowAwareInput` wraps these and automatically updates
the node data via `updateHandleInNodeDataMatchingHandleId` when the value
changes.

### 5. Edge Connection

Edges reference handles by their unique IDs:

- `edge.sourceHandle` = output handle's `id`
- `edge.targetHandle` = input handle's `id`

When an edge is connected, `addEdgeWithTypeChecking` validates the connection
(type compatibility, cycle detection, loop validation) before adding it.

### 6. Type Inference (for inferFromConnection)

When `DataType.underlyingType === 'inferFromConnection'` and type inference is
enabled:

1. On edge addition: `inferTypesAfterEdgeAddition` resolves the handle's
   `inferredDataType` from the connected handle's data type
2. On edge removal: `inferTypesAfterEdgeRemoval` clears the `inferredDataType`
3. `getResultantDataTypeOfHandleConsideringInferredType` resolves the effective
   data type, preferring `inferredDataType` over the base `dataType` when
   available

### 7. Dynamic Addition (for groups and loops)

Group and loop nodes dynamically add new infer handles when existing ones get
connected. See [Dynamic Handle Addition](#dynamic-handle-addition).

### 8. Execution via Runner

During graph execution, handles are mapped to runner types:

- **Input handles** become `InputHandleValue`:
  - `connections[]` carries values from all incoming edges
  - `isDefault` is true when no edges exist (value comes from user input)
  - `defaultValue` holds the user-entered value
- **Output handles** become `OutputHandleInfo`:
  - Metadata about each output (name, dataTypeId, downstream connections)
  - The function implementation returns a `Map<handleName, computedValue>`

---

## Handle Addressing (HandleIndices)

`HandleIndices` is the addressing system for locating any handle within the
nested structure of inputs, panels, and outputs. This is a critical concept
because inputs can be either standalone or nested inside panels, creating a
two-dimensional address space.

### The Structure

```typescript
type HandleIndices =
  | { type: 'input'; index1: number; index2: number | undefined }
  | { type: 'output'; index1: number; index2: undefined };
```

### How Addressing Works

Consider a node with these inputs and outputs:

```
inputs[0] = ConfigurableNodeInput "A"        --> { type:'input', index1:0, index2:undefined }
inputs[1] = ConfigurableNodeInputPanel "Settings"
  inputs[1].inputs[0] = ConfigurableNodeInput "B"  --> { type:'input', index1:1, index2:0 }
  inputs[1].inputs[1] = ConfigurableNodeInput "C"  --> { type:'input', index1:1, index2:1 }
inputs[2] = ConfigurableNodeInput "D"        --> { type:'input', index1:2, index2:undefined }

outputs[0] = ConfigurableNodeOutput "Out1"   --> { type:'output', index1:0, index2:undefined }
outputs[1] = ConfigurableNodeOutput "Out2"   --> { type:'output', index1:1, index2:undefined }
```

**Rules:**

- `type`: Either `'input'` or `'output'` -- determines which array to look in
- `index1`: Index into the top-level `inputs[]` or `outputs[]` array
- `index2`: For inputs, if the item at `index1` is a panel, this is the index
  into that panel's `inputs[]` array. If the item is a standalone input (not a
  panel), `index2` is `undefined`. For outputs, `index2` is always `undefined`
  (outputs cannot be in panels).

### Negative Indices

The system supports negative indices (like Python's list indexing):

- `index1: -1` refers to the **last** element
- `index1: -2` refers to the second-to-last element
- Same for `index2`

This is implemented by `getResultantIndexIncludingNegativeIndices`:

```typescript
function getResultantIndexIncludingNegativeIndices(
  index: number,
  arrayLength: number,
): number {
  return index >= 0 ? index : index + arrayLength;
}
```

Negative indices are heavily used in dynamic handle addition (groups/loops),
where `index1: -1` with `beforeOrAfterIndex: 'after'` means "insert after the
last handle."

### Why This Matters

The `HandleIndices` system is essential because:

1. **Panels create nesting** -- you can't use a single flat index for all inputs
2. **Handle operations** (get, set, insert, delete) all use `HandleIndices`
3. **The iterator** yields `HandleAndRelatedInformation` which includes indices
4. **Dynamic handle addition** uses indices to specify where to insert new
   handles
5. **Type-level operations** (modifying `TypeOfNode`) use the same addressing as
   instance-level operations

---

## Handle Getters, Setters, and Iterators

### Getters

**`getHandleFromNodeDataMatchingHandleId(handleId, nodeData, runForInputs?, runForOutputs?)`**

Searches all inputs (including panel contents) and outputs to find a handle by
its unique `id`. Returns `HandleAndRelatedInformation` or `undefined`.

This is the primary lookup function used throughout the codebase -- whenever you
have a handle ID (e.g., from an edge's `sourceHandle` or `targetHandle`), this
function finds the corresponding handle and its indices.

**`getHandleFromNodeDataFromIndices(indices, nodeData)`**

Direct index-based lookup. Given `HandleIndices`, returns the handle at that
exact position. Returns `HandleAndRelatedInformation` if found, or
`HandleAndRelatedInformationWhenNotFound` (with `value: undefined`) if the
indices point to a valid but empty position.

**`getAllHandlesFromNodeData(nodeData, runForInputs?, runForOutputs?)`**

Returns all handles as two arrays: `inputsAndIndices` and `outputsAndIndices`,
each containing `HandleAndRelatedInformation` entries. This flattens panels,
giving you every individual handle.

### Setters

**`transformHandlesInNodeDataInPlace(nodeData, transformFn, runForInputs?, runForOutputs?)`**

Iterates over all handles and calls `transformFn(handle, indices)` for each. The
function can mutate the handle directly (in-place). If the transform function
returns `false` for inputs, iteration stops early (short-circuit).

**`updateHandleInNodeDataMatchingHandleId(nodeData, handleId, updates, runForInputs?, runForOutputs?, mutate?)`**

Finds a handle by ID and applies partial updates via `Object.assign`. Supports
both mutable and immutable (immer `produce`) modes.

**`updateHandleInNodeDataUsingHandleIndices(nodeData, handleIndices, updates, mutate?)`**

Same as above but locates the handle via indices instead of ID.

**`insertOrDeleteHandleInNodeDataUsingHandleIndices(nodeData, handleIndices, deleteCount, handleToInsert, mutate?, beforeOrAfterIndex?)`**

The most powerful setter. Uses `Array.splice` to insert and/or delete handles at
a specific position. The `beforeOrAfterIndex` parameter controls whether
insertion happens before or after the referenced index. This is the function
used by dynamic handle addition in groups and loops.

### Iterators

**`handleIteratorIncludingIndices(inputsOrOutputs, typeInIndices, startFromIndices?)`**

The core iterator. Returns an `IteratorObject` that yields
`HandleAndRelatedInformation` for each non-panel handle in order. It
transparently traverses into panels, yielding each panel's inputs with the
correct `index1`/`index2` addressing.

The iterator:

1. Walks through `inputsOrOutputs` array by `index1`
2. If the element is not a panel (no `'inputs'` property), yields it with
   `index2: undefined`
3. If the element is a panel, walks through `panel.inputs` by `index2`, yielding
   each
4. After exhausting a panel's inputs, advances to the next top-level element
5. Supports starting from a specific index via `startFromIndices`

**`handleIterator(inputsOrOutputs, typeInIndices)`**

A simpler wrapper that yields just the handle values (without indices or parent
array info).

---

## Dynamic Handle Addition

### For Node Groups

Node groups have `GroupInput` and `GroupOutput` nodes inside their subtree.
These nodes have `inferFromConnection` handles that dynamically grow when
connected.

**Flow:**

1. User connects an edge to a `GroupInput` output or `GroupOutput` input that
   has an `inferFromConnection` data type
2. Type inference resolves the handle's `inferredDataType` from the connected
   handle
3. `addDuplicateHandleToNodeGroupAfterInference` is triggered
4. The function: a. Constructs a new infer handle from the node type template
   (using `constructTypeOfHandleFromIndices` with `index1: 0`, the
   first/template handle) b. Inserts the new handle on the
   **GroupInput/GroupOutput node instance** at `index1: -1` (last position),
   after the existing handles c. Calls
   `addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees` to add
   a corresponding handle on the **outer group node type** (and all its
   instances across the entire state tree, including subtrees of other node
   groups that use this group)

**Important detail:** When a GroupInput output handle gets inferred, a new
**input** is added to the outer group node (GroupInput outputs map to the
group's inputs). When a GroupOutput input handle gets inferred, a new **output**
is added to the outer group node.

The XOR check
`(isSourceInferred && isSourceGroupInput) !== (isTargetInferred && isTargetGroupOutput)`
ensures this only runs when exactly one side of the connection is a group
boundary node with an infer handle -- never for a direct
GroupInput-to-GroupOutput connection.

### For Loop Nodes

Loop nodes (`loopStart`, `loopEnd`, `loopStop`) have infer handles at specific
fixed indices defined in `standardNodes.ts`:

| Node Type | Input Infer Index | Output Infer Index |
| --------- | ----------------- | ------------------ |
| loopStart | 0                 | varies             |
| loopStop  | 2                 | varies             |
| loopEnd   | 1                 | varies             |

**Flow:**

1. User connects an edge to a loop node's infer handle
2. Type inference resolves the handle's `inferredDataType`
3. `addDuplicateHandlesToLoopNodesAfterInference` is triggered
4. Unlike groups, **both** input and output handles are duplicated on the same
   loop node: a. A new input infer handle is constructed from the template and
   inserted at `index1: -1` (after last input) b. A new output infer handle is
   constructed from the template and inserted at `index1: -1` (after last
   output)
5. This happens independently for source and target nodes if either is a loop
   node

**Key difference from groups:** Loop node handle addition is local to the node
instance only. There is no propagation across the state tree (no
`addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees` call).
Group handle addition propagates to all instances and subtrees.

---

## Limitations and Deprecated Patterns

- **Outputs cannot be in panels**: `TypeOfNode.outputs` is `TypeOfInput[]` (not
  a union with `TypeOfInputPanel`). Only inputs support panel grouping.
- **`index2` is always `undefined` for outputs**: The `HandleIndices` type
  enforces this at the type level.
- **`iterateOverAllHandlesInNodeData`**: Referenced in some documentation but
  does not exist as a standalone function. The actual iteration is done via
  `handleIteratorIncludingIndices` and its wrappers.
- **`type: 'unsupportedDirectly'`**: Handles with `complex`, `noEquivalent`, or
  `inferFromConnection` underlying types cannot render user input components
  (ContextAwareInput returns `null` for this type).

---

## Examples

### Defining Handles in a Node Type

```typescript
import {
  makeTypeOfNodeWithAutoInfer,
  makeDataTypeWithAutoInfer,
} from 'react-blender-nodes';

// Data types (handles reference these by key)
const dataTypes = {
  stringType: makeDataTypeWithAutoInfer({
    name: 'String',
    underlyingType: 'string',
    color: '#4A90E2',
    shape: 'circle',
    allowInput: true, // Default: inputs of this type allow direct input
  }),
  numberType: makeDataTypeWithAutoInfer({
    name: 'Number',
    underlyingType: 'number',
    color: '#E74C3C',
    shape: 'diamond',
    allowInput: true,
  }),
  inferType: makeDataTypeWithAutoInfer({
    name: 'Infer',
    underlyingType: 'inferFromConnection',
    color: '#888888',
    shape: 'hexagon',
  }),
};

// Node type with various handle configurations
const processorNode = makeTypeOfNodeWithAutoInfer({
  name: 'Processor',
  headerColor: '#2D5A87',
  inputs: [
    // Simple input
    { name: 'Text', dataType: 'stringType' },
    // Input panel with nested inputs
    {
      name: 'Parameters',
      inputs: [
        { name: 'Scale', dataType: 'numberType' },
        { name: 'Offset', dataType: 'numberType', allowInput: false }, // Override: no direct input
      ],
    },
    // Infer handle (type resolved at connection time)
    { name: 'Dynamic', dataType: 'inferType' },
  ],
  outputs: [
    { name: 'Result', dataType: 'stringType' },
    { name: 'Count', dataType: 'numberType', maxConnections: 1 },
  ],
});
```

### Accessing Handle Values

```typescript
import {
  getHandleFromNodeDataMatchingHandleId,
  getHandleFromNodeDataFromIndices,
  getAllHandlesFromNodeData,
} from 'react-blender-nodes';

// Find a handle by its runtime ID
const handleInfo = getHandleFromNodeDataMatchingHandleId('abc123', node.data);
if (handleInfo) {
  console.log(handleInfo.value.name); // Handle name
  console.log(handleInfo.handleIndices); // { type: 'input', index1: 0, index2: undefined }
}

// Find a handle by its position
const secondPanelFirstInput = getHandleFromNodeDataFromIndices(
  { type: 'input', index1: 1, index2: 0 },
  node.data,
);

// Get all handles flattened
const { inputsAndIndices, outputsAndIndices } = getAllHandlesFromNodeData(
  node.data,
);
for (const { value, handleIndices } of inputsAndIndices) {
  console.log(`${value.name} at`, handleIndices);
}
```

### Dynamic Handle Addition Flow

```
1. User drags edge from "Math Node:Output" to "GroupInput:Infer Output"
                    |
2. Type inference runs:
   - GroupInput's infer output gets inferredDataType = numberType
                    |
3. addDuplicateHandleToNodeGroupAfterInference():
   a. Constructs new infer handle from GroupInput type template
   b. Inserts on GroupInput instance: { type:'output', index1:-1 } -> after last
   c. Adds matching input on outer group node type:
      addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees(
        state, groupNodeType,
        { name: 'Infer Output', dataType: 'numberType' },
        { type:'input', index1:-1 },
        'after'
      )
                    |
4. Result:
   - GroupInput node now has a NEW unconnected infer output (ready for next connection)
   - Outer group node type and ALL its instances now have a new input matching
     the inferred type (numberType)
```

---

## Relationships with Other Features

### -> [Data Types](dataTypesDoc.md)

Handles reference data types by `DataTypeUniqueId`. The `DataType` determines
the handle's color, shape, underlying type (which controls input rendering),
default `allowInput`, and default `maxConnections`. The handle's
`TypeOfInput.allowInput` and `maxConnections` can override the DataType
defaults.

### -> [Type Inference](typeInferenceDoc.md)

Handles with `underlyingType: 'inferFromConnection'` participate in the type
inference system. When connected, their `inferredDataType` field is populated
with the resolved type. `getResultantDataTypeOfHandleConsideringInferredType` is
the key function that resolves the effective type.

### -> [Nodes](nodesDoc.md)

Handles are stored in `node.data.inputs` and `node.data.outputs`. The node type
definition (`TypeOfNode`) contains the template handles. Instance handles are
created during `constructNodeOfType`.

### -> [Edges](edgesDoc.md)

Edges connect handles by referencing their unique IDs (`edge.sourceHandle` and
`edge.targetHandle`). Edge operations use
`getHandleFromNodeDataMatchingHandleId` to resolve handles from IDs, and
`HandleIndices` to perform type-level operations.

### -> [Node Groups](../features/nodeGroupsDoc.md)

GroupInput and GroupOutput nodes have dynamic infer handles. When connected, new
handles are added to both the inner node and the outer group node type
(propagated across all instances via
`addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees`).

### -> [Loops](../features/loopsDoc.md)

Loop nodes (loopStart, loopEnd, loopStop) have infer handles at specific
indices. When connected, both input and output handles are duplicated on the
loop node instance (local only, no propagation).

### -> [Runner](../runner/runnerHookDoc.md)

During execution, handles map to `InputHandleValue` (for inputs) and
`OutputHandleInfo` (for outputs). The `FunctionImplementation` receives inputs
keyed by handle **name** (not ID), with `connections[]` carrying values from
incoming edges and `defaultValue` carrying user-entered values for unconnected
handles.

### -> [ConfigurableNode UI](../ui/configurableNodeDoc.md)

`ConfigurableNode` renders inputs and outputs using `RenderInput`,
`RenderOutput`, and `RenderInputPanel` components. Each delegates to
`ContextAwareHandle` for the visual port and `ContextAwareInput` for interactive
user input. Panel open/close state is managed locally within the component.

### -> [State Management](stateManagementDoc.md)

Handle modifications flow through the reducer system (`mainReducer`). The handle
utility functions (`handleGetters`, `handleSetters`, `handleIterators`) are pure
functions that operate on node data directly, used by both the reducer and the
UI layer.
