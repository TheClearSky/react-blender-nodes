# Product Knowledge

Everything a developer needs to understand about react-blender-nodes as a
product -- the domain concepts, how they relate, and what you can do with them.
This is not about code patterns (see
[codingGuidelines.md](./codingGuidelines.md)) or implementation details (see the
[feature docs](#related-docs)). This is about **what the product is**.

---

## Table of Contents

1. [What This Library Is](#what-this-library-is)
2. [Core Concepts](#core-concepts)
   - [Data Types](#data-types)
   - [Handles](#handles)
   - [Nodes](#nodes)
   - [Edges](#edges)
   - [State](#state)
3. [Type System](#type-system)
   - [Type Inference](#type-inference)
   - [Type Conversion](#type-conversion)
   - [Complex Type Checking](#complex-type-checking)
   - [Cycle Checking](#cycle-checking)
4. [Advanced Features](#advanced-features)
   - [Node Groups](#node-groups)
   - [Loops](#loops)
5. [Execution (Runner)](#execution-runner)
   - [Function Implementations](#function-implementations)
   - [Compilation](#compilation)
   - [Execution Modes](#execution-modes)
   - [Runner States](#runner-states)
   - [Execution Recording](#execution-recording)
   - [Visual Feedback](#visual-feedback)
6. [Import / Export](#import--export)
7. [UI Surface](#ui-surface)
8. [Consumer API Summary](#consumer-api-summary)
9. [System Invariants](#system-invariants)
10. [Related Docs](#related-docs)

---

## What This Library Is

react-blender-nodes is a React component library that provides a **node-based
graph editor** inspired by Blender's node editor. Consumers embed a
`<FullGraph>` component in their app and get:

- An interactive canvas where users place nodes, draw connections, and build
  data-flow graphs
- A type-safe system that validates connections between nodes
- Optional execution: the graph can be compiled and run, with each node calling
  a user-provided function
- Dark theme UI matching Blender's aesthetic

The library is published as `@theclearsky/react-blender-nodes` on npm.

### Who Uses It

Library consumers are React developers who want a visual node editor in their
application. They define:

1. **Data types** (what kinds of data flow through the graph)
2. **Node types** (what operations exist)
3. **Function implementations** (what each node does when executed)

End users of the consumer's app interact with the graph visually: placing nodes,
connecting them, and optionally running the graph.

---

## Core Concepts

### Data Types

A **data type** defines a kind of data that can flow through the graph. Every
handle (port) on a node references a data type, and connections between handles
are validated based on their data types.

Each data type has:

- **name**: Display name (e.g., "String", "Number", "User")
- **underlyingType**: One of the supported underlying types (see below)
- **color**: Hex color used to render handles and edges of this type
- **shape** (optional): Override the handle shape for this data type
- **allowInput** (optional): Whether handles of this type show an inline input
  widget when unconnected
- **maxConnections** (optional): Limit how many edges can connect to a handle of
  this type

#### Supported Underlying Types

| Underlying Type       | Meaning                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `string`              | Text data. Shows a text input when `allowInput` is true.                                                         |
| `number`              | Numeric data. Shows a slider input when `allowInput` is true.                                                    |
| `boolean`             | True/false. Shows a checkbox when `allowInput` is true.                                                          |
| `complex`             | Structured data validated by a Zod schema. Used for objects, arrays, etc.                                        |
| `inferFromConnection` | Polymorphic -- the actual type is inferred at connection time from whatever is connected to it.                  |
| `noEquivalent`        | Structural-only connection (e.g., the "Bind Loop Nodes" link). Cannot carry user data. Used for internal wiring. |

Data types are defined once in the initial state and are immutable during graph
editing.

### Handles

A **handle** is a connection port on a node. Handles are either **inputs** (left
side) or **outputs** (right side).

Each handle has:

- **name**: Display label
- **dataType**: References a data type by its unique ID
- **allowInput** (optional): If true and the handle is unconnected, shows an
  inline input widget (text field, number slider, or checkbox depending on the
  underlying type)
- **maxConnections** (optional): Limits how many edges can connect (default:
  unlimited)

Handles can be **grouped into panels**. A panel is a collapsible section of
inputs within a node, with its own label. Panels are purely organizational --
they nest inputs visually but don't affect data flow.

#### Handle Shapes

Handles render with a visual shape that can be set per-data-type or per-handle:

`circle`, `square`, `rectangle`, `diamond`, `hexagon`, `star`, `cross`, `list`,
`grid`, `trapezium`, `zigzag`, `sparkle`, `parallelogram`

The default is `circle`. Shape is a visual-only property -- it doesn't affect
behavior.

### Nodes

There are two levels of abstraction:

1. **TypeOfNode** (node type definition): A template defining what a kind of
   node looks like -- its name, header color, inputs, outputs, and context menu
   placement. Defined once in the state.

2. **Node instance**: A concrete node placed on the canvas at a specific
   position, with its own ID, referencing a TypeOfNode. Each instance has its
   own handle IDs, input values, and selection state.

When a user right-clicks the canvas and selects "Add Node > [type]", a new node
instance is created from that TypeOfNode.

#### Standard Node Types (Built-in)

The library provides 5 built-in node types that cannot be removed:

| Node Type     | Purpose                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `groupInput`  | Boundary node inside a group -- maps the group's outer inputs to inner handles  |
| `groupOutput` | Boundary node inside a group -- maps inner handles to the group's outer outputs |
| `loopStart`   | Marks the beginning of a loop body                                              |
| `loopStop`    | Evaluates the loop condition, decides whether to continue iterating             |
| `loopEnd`     | Marks the end of a loop, outputs the final iteration's values                   |

These appear under "Standard Nodes" in the context menu.

#### Node Properties

Each TypeOfNode can configure:

- **headerColor**: Color of the node's title bar
- **locationInContextMenu**: Path in the nested context menu (e.g.,
  `["Math", "Trig"]` places it under Math > Trig)
- **priorityInContextMenu**: Ordering within a menu level (higher = appears
  first)
- **subtree**: If present, this node type is a **node group** (see
  [Node Groups](#node-groups))

### Edges

An **edge** is a directed connection from an output handle on one node to an
input handle on another. Edges represent data flow.

When an edge is created, it passes through a **7-layer validation pipeline**
(each layer can be independently enabled/disabled):

1. **Duplicate check**: Prevents the same edge from being created twice
2. **Cycle detection**: Rejects edges that would create a directed cycle
   (`enableCycleChecking`)
3. **Loop boundary validation**: Ensures edges respect loop region boundaries
4. **Type inference resolution**: Resolves `inferFromConnection` types from the
   connected handle (`enableTypeInference`)
5. **Complex type checking**: Validates Zod schema compatibility for complex
   types (`enableComplexTypeChecking`)
6. **Type conversion checking**: Verifies types are compatible or explicitly
   allowed (`allowedConversionsBetweenDataTypes`)
7. **Max connections check**: Enforces per-handle connection limits
   (`maxConnections`)

If all layers pass, the edge is rendered as a bezier curve with a gradient
between the source and target handle colors.

When an edge is removed:

1. If the connected handles had inferred types, those types may be reset
2. Connected handles' inline inputs may reappear (since the handle is now
   unconnected)

### State

The complete graph state is a single object containing:

| Field                                | What It Holds                                            |
| ------------------------------------ | -------------------------------------------------------- |
| `dataTypes`                          | Registry of all data type definitions                    |
| `typeOfNodes`                        | Registry of all node type definitions (including groups) |
| `nodes`                              | Array of node instances on the current canvas            |
| `edges`                              | Array of edges on the current canvas                     |
| `viewport`                           | Current pan/zoom position                                |
| `openedNodeGroupStack`               | Navigation stack when editing inside node groups         |
| `allowedConversionsBetweenDataTypes` | Type conversion rules (optional)                         |
| `enableTypeInference`                | Whether polymorphic type resolution is active            |
| `enableComplexTypeChecking`          | Whether Zod schema compatibility is checked              |
| `enableCycleChecking`                | Whether cycles are prevented                             |
| `enableRecursionChecking`            | Whether recursive group nesting is prevented             |
| `enableDebugMode`                    | Whether debug overlays are shown                         |

State is managed via a reducer with 11 action types:

| Action                       | What It Does                                                |
| ---------------------------- | ----------------------------------------------------------- |
| `ADD_NODE`                   | Creates a new node instance from a TypeOfNode               |
| `ADD_NODE_AND_SELECT`        | Creates and selects a new node                              |
| `REMOVE_NODE`                | Deletes a node and its connected edges                      |
| `UPDATE_NODE`                | Updates a node's input values                               |
| `UPDATE_NODE_BY_REACT_FLOW`  | Applies position/dimension/selection changes from ReactFlow |
| `ADD_EDGE_BY_REACT_FLOW`     | Creates a new edge (with validation)                        |
| `UPDATE_EDGES_BY_REACT_FLOW` | Applies edge selection/removal changes from ReactFlow       |
| `SET_VIEWPORT`               | Updates pan/zoom                                            |
| `OPEN_NODE_GROUP`            | Navigates into a node group's subtree                       |
| `CLOSE_NODE_GROUP`           | Navigates back out of a node group                          |
| `REPLACE_STATE`              | Replaces the entire state (used by import)                  |

All mutations go through the reducer. The reducer uses Immer for immutable
updates.

---

## Type System

### Type Inference

When `enableTypeInference` is true, handles with the `inferFromConnection`
underlying type don't have a fixed data type. Instead, their type is
**inferred** when an edge connects to them:

1. User connects a `string` output to an `inferFromConnection` input
2. The input's type is resolved to `string`
3. If that input's node has an `inferFromConnection` output, that output also
   resolves to `string`
4. This cascades through the graph

When the edge is removed, inferred types reset back to `inferFromConnection`.

This enables polymorphic nodes like "Pass Through" that work with any data type.

### Type Conversion

When `allowedConversionsBetweenDataTypes` is provided in the state, connections
between different data types are **restricted** to only those explicitly
allowed:

```
allowedConversionsBetweenDataTypes: {
  numberType: { stringType: true },  // number -> string is allowed
}
```

If not provided, all connections between different data types are allowed. If
provided (even as an empty object), only explicitly listed conversions are
permitted.

### Complex Type Checking

When `enableComplexTypeChecking` is true and both handles have `complex`
underlying types, their Zod schemas are compared for structural compatibility.
Two complex types are compatible if they have the same schema structure.

The interaction between complex type checking and type conversion is controlled
by `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking`:

- If false (default): complex types need explicit entries in
  `allowedConversionsBetweenDataTypes`
- If true: complex types can connect freely unless their schemas are
  incompatible

### Cycle Checking

When `enableCycleChecking` is true, creating an edge that would form a cycle in
the graph is rejected. The check uses DFS traversal from the target node to see
if it can reach the source node through existing edges.

Loops are an exception -- they create intentional cycles through the loop
triplet system.

---

## Advanced Features

### Node Groups

A **node group** is a reusable sub-graph packaged as a single node. It's like a
function in programming -- it encapsulates a graph inside a single node that can
be used multiple times.

#### How Groups Work

1. A TypeOfNode with a `subtree` property is a node group
2. The subtree contains its own `nodes` and `edges`, plus two required boundary
   nodes:
   - **groupInput**: Maps the group's outer input handles to inner output
     handles
   - **groupOutput**: Maps inner input handles to the group's outer output
     handles
3. Group instances appear as regular nodes on the canvas with the group's
   inputs/outputs
4. Double-clicking a group node (or using "Open" from the context menu)
   navigates **into** the group, showing its internal graph
5. The `openedNodeGroupStack` tracks the navigation depth (groups can be nested)

#### Group Rules

- Boundary nodes (`groupInput`, `groupOutput`) cannot be deleted or duplicated
  inside a group
- A group's subtree can only be edited when no instances of it exist (or you're
  editing a specific instance)
- `numberOfReferences` tracks how many instances of this group exist
- If `enableRecursionChecking` is true, a group cannot contain an instance of
  itself (directly or indirectly)

### Loops

**Loops** enable iterative computation in the graph using a **triplet** of three
nodes that must be used together:

#### The Loop Triplet

```
                   Loop Body
                 +-----------+
   data in       |           |       data out
---->[loopStart]---> ... --->[loopStop]--->[loopEnd]--->
       |                        ^  |
       | Bind Loop Nodes        |  | condition
       +------------------------+  | (continue?)
```

1. **loopStart**: Entry point. Receives initial data and passes it into the loop
   body. Outputs a "Bind Loop Nodes" handle that must connect to loopStop.

2. **loopStop**: Condition check. Receives the loop body's output and a boolean
   "Continue If Condition Is True" input. If true, feeds data back to loopStart
   for another iteration. Outputs a "Bind Loop Nodes" handle that must connect
   to loopEnd.

3. **loopEnd**: Exit point. Receives the final iteration's output and passes it
   downstream.

#### Bind Loop Nodes

The `bindLoopNodes` data type (underlying type: `noEquivalent`) is a
structural-only connection that **binds** the three loop nodes into a single
loop structure. It doesn't carry data -- it tells the system "these three nodes
form one loop."

Rules:

- `bindLoopNodes` handles have `maxConnections: 1`
- A loop triplet must be fully connected (start -> stop -> end) to function
- Nodes between loopStart and loopStop form the **loop body**
- The loop body executes repeatedly until the condition on loopStop is false

#### Loop Data Flow

Data flows through `inferFromConnection` handles on the loop nodes:

- loopStart receives initial data on its infer input, outputs it into the loop
  body
- loopStop receives processed data from the body, outputs it back into the start
  (for next iteration) or forward to loopEnd
- loopEnd outputs the final value

The loop body can contain any nodes, including other loops (nested loops) and
group instances.

---

## Execution (Runner)

The runner system compiles and executes the node graph. It is **optional** --
graphs can be purely visual without execution.

### Function Implementations

To make a graph executable, the consumer provides a `FunctionImplementations`
map: one function per node type.

Each function receives:

- **inputs**: `Map<handleName, InputHandleValue>` -- resolved input values
  including connection metadata
- **outputs**: `Map<handleName, OutputHandleInfo>` -- output handle metadata
- **context**: `ExecutionContext` -- node identity, graph state reference, loop
  iteration, abort signal

Each function returns:

- `Map<handleName, value>` -- computed output values

```typescript
const andGate: FunctionImplementation = (inputs, outputs, ctx) => {
  const a = inputs.get('A')?.connections[0]?.value ?? false;
  const b = inputs.get('B')?.connections[0]?.value ?? false;
  return new Map([['Out', Boolean(a) && Boolean(b)]]);
};
```

Standard node types (`groupInput`, `groupOutput`, `loopStart`, `loopStop`,
`loopEnd`) have built-in execution logic and don't need function
implementations.

### Compilation

Before execution, the graph is **compiled** into an execution plan. The
compiler:

1. Analyzes the graph structure
2. Classifies nodes (standard, loop, group)
3. Compiles loop structures into `LoopExecutionBlock` objects
4. Compiles group instances into `GroupExecutionScope` objects (recursively
   compiling subtrees)
5. Topologically sorts remaining nodes into **concurrency levels**

Nodes in the same concurrency level have no data dependencies on each other and
can run in parallel.

The compilation also produces:

- **inputResolutionMap**: How each input handle gets its values (which edges
  feed into it)
- **outputDistributionMap**: Where each output handle's values go
- **warnings**: Missing function implementations, unreachable nodes, etc.

### Execution Modes

The runner supports two modes:

| Mode             | Behavior                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **Instant**      | Executes all steps as fast as possible. UI updates at the end.                                        |
| **Step-by-step** | Executes one step, then pauses. User clicks "Step" to advance. Allows inspecting values at each step. |

### Runner States

The runner is a state machine:

```
idle -> compiling -> running <-> paused -> completed
                       |                      |
                       +-------> errored <----+
```

| State       | Meaning                                            |
| ----------- | -------------------------------------------------- |
| `idle`      | No execution in progress                           |
| `compiling` | Graph is being compiled into an execution plan     |
| `running`   | Execution is in progress                           |
| `paused`    | Execution paused (step-by-step mode or user pause) |
| `completed` | All steps finished successfully                    |
| `errored`   | An error occurred during execution                 |

### Execution Recording

Every execution produces an `ExecutionRecord` containing:

- **steps**: Array of `ExecutionStepRecord` objects, each with:
  - Timing (start, end, duration, pause adjustment)
  - Status (completed, errored, skipped)
  - Input value snapshots (per-handle, per-connection)
  - Output value snapshots
  - Error details (if errored)
  - Loop iteration and group depth context

- **loopRecords**: Per-loop iteration breakdown with timing and condition values

- **groupRecords**: Per-group execution breakdown

- **Overall timing**: Total duration, start/end timestamps

The recording enables:

- **Timeline visualization**: Steps plotted on a time axis
- **Step inspection**: Click any step to see its input/output values
- **Scrubbing**: Move through execution history to see the graph state at any
  point
- **Export**: Save the recording to a JSON file for later analysis

### Visual Feedback

During and after execution, each node displays a **visual state**:

| Visual State | Appearance                                 |
| ------------ | ------------------------------------------ |
| `idle`       | No indicator                               |
| `running`    | Blue dashed border with glow animation     |
| `completed`  | Green solid border with subtle glow        |
| `errored`    | Red solid border, error tooltip on hover   |
| `skipped`    | Dimmed appearance                          |
| `warning`    | Orange indicator, warning tooltip on hover |

---

## Import / Export

The library supports importing and exporting:

### State Export/Import

- **Export**: Serializes the complete graph state (data types, node types,
  nodes, edges, settings) to a JSON file
- **Import**: Validates and deserializes a JSON file back into state, with
  repair strategies for minor schema mismatches

### Recording Export/Import

- **Export**: Serializes an execution recording (steps, timings, values) to a
  JSON file
- **Import**: Validates and loads a recording for replay in the timeline

Both import paths include **validation** (schema checking) and **repair**
(handling missing optional fields, normalizing formats).

---

## UI Surface

The library provides these main UI areas:

### Graph Canvas (`FullGraph`)

The main editing surface. Built on ReactFlow. Provides:

- Pan, zoom, and minimap navigation
- Node placement via right-click context menu
- Edge drawing by dragging between handles
- Multi-select with selection box
- Delete with Backspace/Delete/X keys
- Node group navigation (double-click to enter, breadcrumb to exit)

### Context Menu

Right-click opens a nested menu with:

- "Add Node" submenu organized by `locationInContextMenu` paths
- "Add Node Group" for existing group types
- Import/Export options (state and recording)

### Node Runner Panel

A slide-out drawer (right side) that appears when `functionImplementations` are
provided. Contains:

1. **Run Controls**: Play/Pause/Step/Stop/Reset buttons, mode toggle (instant vs
   step-by-step), max loop iterations setting
2. **Execution Timeline**: Multi-track visualization of step execution over
   time, with zoom/pan, scrubber, and click-to-inspect
3. **Execution Step Inspector**: Detail panel showing the selected step's input
   values, output values, errors, and metadata

---

## Consumer API Summary

### Minimum Setup

```tsx
import { FullGraph, useFullGraph, makeStateWithAutoInfer, makeDataTypeWithAutoInfer, makeTypeOfNodeWithAutoInfer } from 'react-blender-nodes';
import 'react-blender-nodes/style.css';

// 1. Define data types
const dataTypes = { myType: makeDataTypeWithAutoInfer({ name: '...', underlyingType: '...', color: '...' }) };

// 2. Define node types
const typeOfNodes = { myNode: makeTypeOfNodeWithAutoInfer({ name: '...', inputs: [...], outputs: [...] }) };

// 3. Create initial state
const initialState = makeStateWithAutoInfer({ dataTypes, typeOfNodes, nodes: [], edges: [] });

// 4. Use the hook
const { state, dispatch } = useFullGraph(initialState);

// 5. Render
<FullGraph state={state} dispatch={dispatch} />
```

### Adding Execution

```tsx
import { makeFunctionImplementationsWithAutoInfer } from 'react-blender-nodes';

const functionImplementations = makeFunctionImplementationsWithAutoInfer({
  myNode: (inputs, outputs, context) => {
    // Read inputs, compute, return outputs
    return new Map([['outputName', computedValue]]);
  },
});

<FullGraph
  state={state}
  dispatch={dispatch}
  functionImplementations={functionImplementations}
/>;
```

When `functionImplementations` is provided, the Node Runner Panel appears
automatically.

### Auto-Infer Helpers

All definition objects should be created through helper functions for type
safety:

| Helper                                                | Purpose                         |
| ----------------------------------------------------- | ------------------------------- |
| `makeDataTypeWithAutoInfer`                           | Define a data type              |
| `makeTypeOfNodeWithAutoInfer`                         | Define a node type              |
| `makeStateWithAutoInfer`                              | Create the initial state        |
| `makeAllowedConversionsBetweenDataTypesWithAutoInfer` | Define type conversion rules    |
| `makeFunctionImplementationsWithAutoInfer`            | Define function implementations |

These are identity functions -- they return their input unchanged. Their purpose
is to enable TypeScript to infer the generic parameters and validate that data
type references are correct across the entire configuration.

---

## System Invariants

These properties are always maintained by the library:

### Graph Constraints

- **Acyclicity**: The graph is always a DAG (no directed cycles), enforced by
  the validation pipeline
- **Single input source**: Each input handle has at most one incoming edge
- **Multiple output targets**: Output handles can feed any number of target
  handles
- **Loop triplet integrity**: loopStart/loopStop/loopEnd must always form a
  valid, fully-connected triplet
- **Group boundary respect**: Data can only cross group boundaries through
  groupInput/groupOutput
- **No group recursion**: A group cannot contain an instance of itself (directly
  or indirectly)
- **Type consistency**: All edges satisfy type compatibility at all times

### Execution Guarantees

- **Input availability**: All node inputs are resolved before the node executes
  (topological order)
- **Deterministic compilation**: Same graph always produces the same execution
  plan
- **Complete recording**: Every executed step is fully recorded (timing, inputs,
  outputs, errors)
- **Error context**: Errors include the full upstream path trace and loop/group
  context
- **Iteration isolation**: Loop iterations have separate value contexts
- **Scope isolation**: Group executions are internally scoped

### State Management

- **Immutability**: All state updates produce new state objects (Immer)
- **Reducer authority**: All mutations go through `dispatch` -- direct state
  mutation is never allowed
- **Feature flag independence**: Each validation feature (type inference, cycle
  checking, etc.) can be independently enabled/disabled

---

## Related Docs

For detailed implementation documentation, see the
[Documentation Index](./index.md):

| Area                 | Key Docs                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data types & handles | [dataTypesDoc](./core/dataTypesDoc.md), [handlesDoc](./core/handlesDoc.md)                                                                         |
| Nodes & edges        | [nodesDoc](./core/nodesDoc.md), [edgesDoc](./core/edgesDoc.md)                                                                                     |
| Type system          | [typeInferenceDoc](./core/typeInferenceDoc.md), [connectionValidationDoc](./features/connectionValidationDoc.md)                                   |
| State management     | [stateManagementDoc](./core/stateManagementDoc.md)                                                                                                 |
| Node groups          | [nodeGroupsDoc](./features/nodeGroupsDoc.md)                                                                                                       |
| Loops                | [loopsDoc](./features/loopsDoc.md)                                                                                                                 |
| Runner               | [runnerCompilerDoc](./runner/runnerCompilerDoc.md), [runnerExecutorDoc](./runner/runnerExecutorDoc.md), [runnerHookDoc](./runner/runnerHookDoc.md) |
| Recording            | [executionRecordingDoc](./runner/executionRecordingDoc.md)                                                                                         |
| Import/Export        | [importExportDoc](./importExport/importExportDoc.md)                                                                                               |
| UI components        | [fullGraphDoc](./ui/fullGraphDoc.md), [configurableNodeDoc](./ui/configurableNodeDoc.md)                                                           |
| Coding patterns      | [codingGuidelines](./codingGuidelines.md)                                                                                                          |
