# react-blender-nodes Documentation Index

## Full Architecture Diagram

```
+===========================================================================+
|                        react-blender-nodes                                |
+===========================================================================+
|                                                                           |
|  CORE SYSTEMS (Tier 1)                                                    |
|  ~~~~~~~~~~~~~~~~~~~~~~                                                   |
|                                                                           |
|  +-------------+    referenced by    +-------------+                      |
|  |  DataTypes  |<--------------------|   Handles   |                      |
|  | string      |                     | input/output|                      |
|  | number      |    +-------------+  | ports with  |                      |
|  | boolean     |    |    Type     |  | data types  |                      |
|  | complex     |    |  Inference  |  +------+------+                      |
|  | inferFrom   |--->| resolves    |         |                             |
|  |  Connection |    | polymorphic |         | attached to                  |
|  | noEquivalent|    | handles     |         |                             |
|  +------+------+    +-------------+         v                             |
|         |                            +-------------+    +-------------+   |
|         | types flow through         |    Nodes    |--->|    Edges    |   |
|         +--------------------------->| TypeOfNode  |    | connections |   |
|                                      | instances   |    | between     |   |
|                                      +------+------+    | handles     |   |
|                                             |           +------+------+   |
|                                             |                  |          |
|                                             v                  v          |
|                                      +-----------------------------+      |
|                                      |    State Management         |      |
|                                      | mainReducer (11 actions)    |      |
|                                      | Immer produce() immutable   |      |
|                                      +-----------------------------+      |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  FEATURE SYSTEMS (Tier 2)                                                 |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~                                                |
|                                                                           |
|  +-------------------+  +-------------------+  +---------------------+    |
|  |   Node Groups     |  |      Loops        |  | Connection          |    |
|  | subtree-based     |  | loopStart/Stop/End|  | Validation          |    |
|  | composable groups |  | triplet system    |  | cycle check         |    |
|  | groupInput/Output |  | iteration data    |  | type conversion     |    |
|  | boundary nodes    |  | flow, bindLoop    |  | complex type check  |    |
|  | stack navigation  |  | structural edges  |  | loop/group rules    |    |
|  +-------------------+  +-------------------+  +---------------------+    |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  RUNNER SYSTEMS (Tier 3)                                                  |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~                                                |
|                                                                           |
|  +------------------+     +------------------+     +------------------+   |
|  | Runner Compiler  |---->| Runner Executor  |---->| Execution        |   |
|  | 5-phase pipeline |     | async engine     |     | Recording        |   |
|  | State -> Plan    |     | ValueStore       |     | step records     |   |
|  |                  |     | concurrent exec  |     | value snapshots  |   |
|  +------------------+     +--------+---------+     +------------------+   |
|                                    |                                      |
|                                    v                                      |
|                           +------------------+                            |
|                           | useNodeRunner    |                            |
|                           | state machine    |                            |
|                           | run/pause/step   |                            |
|                           | replay/replayTo  |                            |
|                           +------------------+                            |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  UI LAYER (Tier 4)                                                        |
|  ~~~~~~~~~~~~~~~~~~                                                       |
|                                                                           |
|  +================================================================+      |
|  |                     FullGraph Component                         |      |
|  |  +---------------------------+  +---------------------------+  |      |
|  |  |   ConfigurableNode        |  |   ConfigurableEdge        |  |      |
|  |  | +-----+ +-----+ +------+ |  | gradient bezier curves    |  |      |
|  |  | |Hndls| |Inpts| |Status| |  | viewport optimization     |  |      |
|  |  | +-----+ +-----+ +------+ |  +---------------------------+  |      |
|  |  +---------------------------+                                 |      |
|  |  +---------------------------+  +---------------------------+  |      |
|  |  |     Context Menu          |  |  NodeGroupSelector       |  |      |
|  |  | nested submenus           |  |  breadcrumb navigation   |  |      |
|  |  | node creation             |  +---------------------------+  |      |
|  |  | import/export actions     |                                 |      |
|  |  +---------------------------+                                 |      |
|  +================================================================+      |
|                                                                           |
|  +================================================================+      |
|  |                   NodeRunnerPanel                               |      |
|  |  +--------------+  +----------------+  +--------------------+  |      |
|  |  | RunControls  |  | Execution      |  | ExecutionStep      |  |      |
|  |  | play/pause   |  | Timeline       |  | Inspector          |  |      |
|  |  | step/stop    |  | zoom/pan       |  | input/output vals  |  |      |
|  |  | mode toggle  |  | scrubber       |  | error display      |  |      |
|  |  +--------------+  +----------------+  +--------------------+  |      |
|  +================================================================+      |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  UI ATOMS & HOOKS (Tier 5)           IMPORT/EXPORT (Tier 6)              |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~          ~~~~~~~~~~~~~~~~~~~~~                |
|                                                                           |
|  NodeStatusIndicator                 State export/import                  |
|  Input, Button, Checkbox             Recording export/import              |
|  Badge, Separator, Collapsible       Validation & repair                  |
|  ScrollableButtonContainer           JSON serialization                   |
|  useDrag, useClickedOutside                                               |
|  useSlideAnimation, useResizeHandle                                       |
|  useFloatingTooltip, useAutoScroll                                        |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  EXTERNAL SYSTEMS (Tier 7)                                                |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~                                               |
|                                                                           |
|  ReactFlow    Immer     Zod       Tailwind    Radix UI    Storybook       |
|  (@xyflow/    produce() schema    CSS dark    checkbox    component       |
|   react)      immut.    valid.    theme       primitive   dev/test        |
|                                                                           |
+---------------------------------------------------------------------------+
```

## Data Flow Diagram

```
User defines         User connects         User clicks "Run"
DataTypes &          handles via                  |
TypeOfNodes          edges                        v
     |                  |              +--------------------+
     v                  v              | Runner Compiler    |
+---------+     +------------+         | (5 phases)         |
| State   |---->| Connection |         +--------+-----------+
| Mgmt    |     | Validation |                  |
| Reducer |     | Pipeline   |         ExecutionPlan
+---------+     +------------+                  |
     |                                          v
     v                              +--------------------+
+---------+                         | Runner Executor    |
| FullGraph|                        | (async, ValueStore)|
| renders  |                        +--------+-----------+
| nodes &  |                                 |
| edges    |                        ExecutionRecord
+---------+                                  |
     |                                       v
     |                              +--------------------+
     +------ visual state --------->| NodeStatusIndicator|
              feedback              | NodeRunnerPanel    |
                                    +--------------------+
```

---

## Product Knowledge

For a comprehensive overview of what this library is, its domain concepts, and
how they relate, see [productKnowledge.md](./productKnowledge.md). Covers:

- What the library is and who uses it
- Core concepts: data types, handles, nodes, edges, and state
- The type system: inference, conversion, complex checking, cycle checking
- Advanced features: node groups and loops (triplet system)
- Execution: function implementations, compilation, modes, recording, visual
  feedback
- Import/export capabilities
- Consumer API with auto-infer helpers

---

## Coding Guidelines

For coding patterns, TypeScript conventions, React patterns, and style rules
used across the entire codebase, see
[codingGuidelines.md](./codingGuidelines.md). Covers:

- The 4-parameter generic signature (`DataTypeUniqueId`, `NodeTypeUniqueId`,
  `UnderlyingType`, `ComplexSchemaType`) and how it threads through every layer
- Identity-function auto-infer pattern (`makeStateWithAutoInfer`, etc.)
- `as const` arrays to derive union types and runtime lookup maps
- Discriminated union actions, `produce()` reducer, variance bridge for context
- Component declaration style (function declarations, named exports, no
  `React.FC`)
- Hook structure (options object in, typed object out), ref-as-callback-channel
- `cn()` + `cva()` styling, `data-slot` attributes, custom color tokens
- Naming conventions for files, types, functions, and constants
- Anti-patterns to avoid

---

## What to Read Based on What You're Building

### Adding a New Data Type

| Doc                                                                 | Why                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------- |
| [dataTypesDoc.md](./core/dataTypesDoc.md)                           | DataType interface, underlying types, how to register |
| [handlesDoc.md](./core/handlesDoc.md)                               | How handles reference data types                      |
| [typeInferenceDoc.md](./core/typeInferenceDoc.md)                   | If your type interacts with inferFromConnection       |
| [connectionValidationDoc.md](./features/connectionValidationDoc.md) | Type conversion rules for your new type               |

### Adding a New Node Type

| Doc                                                   | Why                                        |
| ----------------------------------------------------- | ------------------------------------------ |
| [nodesDoc.md](./core/nodesDoc.md)                     | TypeOfNode definition, node instantiation  |
| [handlesDoc.md](./core/handlesDoc.md)                 | Defining inputs/outputs with HandleIndices |
| [configurableNodeDoc.md](./ui/configurableNodeDoc.md) | How the node renders visually              |
| [stateManagementDoc.md](./core/stateManagementDoc.md) | ADD_NODE action, reducer integration       |
| [contextMenuDoc.md](./ui/contextMenuDoc.md)           | Adding the node to the "Add Node" menu     |

### Making Nodes Executable (Runner Integration)

| Doc                                                           | Why                                          |
| ------------------------------------------------------------- | -------------------------------------------- |
| [runnerCompilerDoc.md](./runner/runnerCompilerDoc.md)         | How nodes become ExecutionSteps              |
| [runnerExecutorDoc.md](./runner/runnerExecutorDoc.md)         | FunctionImplementation interface, ValueStore |
| [runnerHookDoc.md](./runner/runnerHookDoc.md)                 | useNodeRunner API, state machine             |
| [executionRecordingDoc.md](./runner/executionRecordingDoc.md) | Step records, replay support                 |
| [nodeStatusIndicatorDoc.md](./ui/nodeStatusIndicatorDoc.md)   | Visual feedback during execution             |

### Building a Node Group

| Doc                                                   | Why                                            |
| ----------------------------------------------------- | ---------------------------------------------- |
| [nodeGroupsDoc.md](./features/nodeGroupsDoc.md)       | Subtree structure, boundary nodes, handle sync |
| [nodesDoc.md](./core/nodesDoc.md)                     | groupInput/groupOutput standard nodes          |
| [typeInferenceDoc.md](./core/typeInferenceDoc.md)     | How group boundary handles resolve types       |
| [stateManagementDoc.md](./core/stateManagementDoc.md) | OPEN/CLOSE_NODE_GROUP, ADD_NODE_GROUP actions  |
| [fullGraphDoc.md](./ui/fullGraphDoc.md)               | Group navigation stack, NodeGroupSelector      |

### Building a Loop

| Doc                                                                 | Why                                       |
| ------------------------------------------------------------------- | ----------------------------------------- |
| [loopsDoc.md](./features/loopsDoc.md)                               | Loop triplet system, bindLoopNodes edges  |
| [nodesDoc.md](./core/nodesDoc.md)                                   | loopStart/loopStop/loopEnd standard nodes |
| [connectionValidationDoc.md](./features/connectionValidationDoc.md) | Loop-specific validation rules            |
| [runnerCompilerDoc.md](./runner/runnerCompilerDoc.md)               | LoopExecutionBlock compilation            |

### Modifying the Graph Editor UI

| Doc                                                   | Why                                                 |
| ----------------------------------------------------- | --------------------------------------------------- |
| [fullGraphDoc.md](./ui/fullGraphDoc.md)               | Top-level component, ReactFlow integration, context |
| [configurableNodeDoc.md](./ui/configurableNodeDoc.md) | Node rendering, panels, header, handles             |
| [configurableEdgeDoc.md](./ui/configurableEdgeDoc.md) | Edge rendering, gradient colors                     |
| [contextMenuDoc.md](./ui/contextMenuDoc.md)           | Right-click menu system                             |
| [reactFlowDoc.md](./external/reactFlowDoc.md)         | ReactFlow concepts used by the library              |

### Modifying the Runner Panel UI

| Doc                                                               | Why                                      |
| ----------------------------------------------------------------- | ---------------------------------------- |
| [nodeRunnerPanelDoc.md](./ui/nodeRunnerPanelDoc.md)               | Drawer layout, resize, slide animation   |
| [runControlsDoc.md](./ui/runControlsDoc.md)                       | Transport bar buttons, mode toggle       |
| [executionTimelineDoc.md](./ui/executionTimelineDoc.md)           | Multi-track timeline, zoom/pan, scrubber |
| [executionStepInspectorDoc.md](./ui/executionStepInspectorDoc.md) | Step detail display                      |
| [runnerHookDoc.md](./runner/runnerHookDoc.md)                     | Hook API the panel consumes              |

### Adding a New Input Component

| Doc                                                   | Why                                   |
| ----------------------------------------------------- | ------------------------------------- |
| [inputComponentsDoc.md](./ui/inputComponentsDoc.md)   | Existing input atoms, patterns        |
| [configurableNodeDoc.md](./ui/configurableNodeDoc.md) | How inputs are rendered inside nodes  |
| [dataTypesDoc.md](./core/dataTypesDoc.md)             | hasInputField, underlyingType mapping |
| [tailwindDoc.md](./external/tailwindDoc.md)           | Styling conventions, custom theme     |

### Implementing Import/Export

| Doc                                                           | Why                                          |
| ------------------------------------------------------------- | -------------------------------------------- |
| [importExportDoc.md](./importExport/importExportDoc.md)       | Serialization, validation, repair strategies |
| [stateManagementDoc.md](./core/stateManagementDoc.md)         | REPLACE_STATE action                         |
| [executionRecordingDoc.md](./runner/executionRecordingDoc.md) | Recording export/import format               |
| [fullGraphDoc.md](./ui/fullGraphDoc.md)                       | Import/export UI integration                 |

### Adding a New UI Atom

| Doc                                           | Why                                           |
| --------------------------------------------- | --------------------------------------------- |
| [uiPrimitivesDoc.md](./ui/uiPrimitivesDoc.md) | Existing atoms: Badge, Separator, Collapsible |
| [hooksDoc.md](./hooks/hooksDoc.md)            | Custom hooks available for reuse              |
| [tailwindDoc.md](./external/tailwindDoc.md)   | Styling patterns, cn() helper, color tokens   |
| [storybookDoc.md](./external/storybookDoc.md) | Story writing conventions                     |
| [radixUIDoc.md](./external/radixUIDoc.md)     | Radix UI integration pattern                  |

### Working with State/Reducer

| Doc                                                   | Why                                             |
| ----------------------------------------------------- | ----------------------------------------------- |
| [stateManagementDoc.md](./core/stateManagementDoc.md) | State type, 11 actions, Immer produce()         |
| [immerDoc.md](./external/immerDoc.md)                 | Immer integration pattern                       |
| [edgesDoc.md](./core/edgesDoc.md)                     | Edge add/remove with type checking side effects |
| [typeInferenceDoc.md](./core/typeInferenceDoc.md)     | Inference cascades triggered by state changes   |

### Writing Tests / Stories

| Doc                                           | Why                                |
| --------------------------------------------- | ---------------------------------- |
| [storybookDoc.md](./external/storybookDoc.md) | Story patterns, running Storybook  |
| [fullGraphDoc.md](./ui/fullGraphDoc.md)       | Main playground story              |
| [zodDoc.md](./external/zodDoc.md)             | Schema validation testing patterns |

---

## Complete Document Map

### Core Systems

| #   | Feature          | Doc                                                   | Description                                                                                 |
| --- | ---------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Data Types       | [dataTypesDoc.md](./core/dataTypesDoc.md)             | Type system foundation: string, number, boolean, complex, inferFromConnection, noEquivalent |
| 2   | Handles          | [handlesDoc.md](./core/handlesDoc.md)                 | Input/output ports, HandleIndices addressing, panels, dynamic handle addition               |
| 3   | Nodes            | [nodesDoc.md](./core/nodesDoc.md)                     | TypeOfNode definitions, Node instances, 5 standard node types                               |
| 4   | Edges            | [edgesDoc.md](./core/edgesDoc.md)                     | Connection management, type-checked add/remove, DFS cycle detection                         |
| 5   | State Management | [stateManagementDoc.md](./core/stateManagementDoc.md) | mainReducer, 11 action types, Immer-based immutable updates                                 |
| 6   | Type Inference   | [typeInferenceDoc.md](./core/typeInferenceDoc.md)     | inferFromConnection resolution, cascading inference on edge changes                         |

### Feature Systems

| #   | Feature               | Doc                                                                 | Description                                                             |
| --- | --------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 7   | Node Groups           | [nodeGroupsDoc.md](./features/nodeGroupsDoc.md)                     | Subtree-based composable groups, boundary nodes, handle synchronization |
| 8   | Loops                 | [loopsDoc.md](./features/loopsDoc.md)                               | Loop triplet (loopStart/Stop/End), bindLoopNodes, iteration data flow   |
| 9   | Connection Validation | [connectionValidationDoc.md](./features/connectionValidationDoc.md) | Cycle check, type conversion, complex type check, loop/group rules      |

### Runner Systems

| #   | Feature             | Doc                                                           | Description                                                    |
| --- | ------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| 10  | Runner Compiler     | [runnerCompilerDoc.md](./runner/runnerCompilerDoc.md)         | 5-phase pipeline: State -> ExecutionPlan                       |
| 11  | Runner Executor     | [runnerExecutorDoc.md](./runner/runnerExecutorDoc.md)         | Async execution engine, ValueStore, concurrent level execution |
| 12  | Runner Hook         | [runnerHookDoc.md](./runner/runnerHookDoc.md)                 | useNodeRunner state machine, run/pause/step/stop/reset/replay  |
| 13  | Execution Recording | [executionRecordingDoc.md](./runner/executionRecordingDoc.md) | ExecutionRecord, step records, value snapshots, replay support |

### UI Components

| #   | Feature                | Doc                                                               | Description                                                           |
| --- | ---------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| 14  | FullGraph              | [fullGraphDoc.md](./ui/fullGraphDoc.md)                           | Top-level graph editor, ReactFlow integration, 3-layer architecture   |
| 15  | ConfigurableNode       | [configurableNodeDoc.md](./ui/configurableNodeDoc.md)             | Node rendering: header, handles, inputs, panels, resizing             |
| 16  | ConfigurableEdge       | [configurableEdgeDoc.md](./ui/configurableEdgeDoc.md)             | Edge rendering: gradient colors, bezier curves, viewport optimization |
| 17  | Context Menu           | [contextMenuDoc.md](./ui/contextMenuDoc.md)                       | Right-click menu: nested submenus, node creation, import/export       |
| 18  | NodeRunnerPanel        | [nodeRunnerPanelDoc.md](./ui/nodeRunnerPanelDoc.md)               | Runner UI drawer: composed of RunControls + Timeline + Inspector      |
| 19  | RunControls            | [runControlsDoc.md](./ui/runControlsDoc.md)                       | Transport bar: play/pause/step/stop/reset, mode toggle                |
| 20  | ExecutionTimeline      | [executionTimelineDoc.md](./ui/executionTimelineDoc.md)           | Multi-track timeline: zoom/pan, step blocks, scrubber                 |
| 21  | ExecutionStepInspector | [executionStepInspectorDoc.md](./ui/executionStepInspectorDoc.md) | Step detail panel: input/output values, error display                 |

### UI Atoms, Hooks & Utilities

| #   | Feature             | Doc                                                         | Description                                                          |
| --- | ------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| 22  | NodeStatusIndicator | [nodeStatusIndicatorDoc.md](./ui/nodeStatusIndicatorDoc.md) | Visual state overlay: running/completed/errored/warning borders      |
| 23  | Input Components    | [inputComponentsDoc.md](./ui/inputComponentsDoc.md)         | Text input, number slider, checkbox, button atoms                    |
| 24  | UI Primitives       | [uiPrimitivesDoc.md](./ui/uiPrimitivesDoc.md)               | Badge, Separator, Collapsible, ScrollableButtonContainer             |
| 25  | Custom Hooks        | [hooksDoc.md](./hooks/hooksDoc.md)                          | useDrag, useClickedOutside, useSlideAnimation, useResizeHandle, etc. |

### Import/Export

| #   | Feature       | Doc                                                     | Description                                                    |
| --- | ------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| 26  | Import/Export | [importExportDoc.md](./importExport/importExportDoc.md) | State & recording serialization, validation, repair strategies |

### External Systems

| #   | Feature      | Doc                                           | Description                                                  |
| --- | ------------ | --------------------------------------------- | ------------------------------------------------------------ |
| 27  | ReactFlow    | [reactFlowDoc.md](./external/reactFlowDoc.md) | Core graph rendering engine: nodes, edges, viewport, minimap |
| 28  | Immer        | [immerDoc.md](./external/immerDoc.md)         | Immutable state management via produce() in mainReducer      |
| 29  | Zod          | [zodDoc.md](./external/zodDoc.md)             | Schema validation for complex data types                     |
| 30  | Tailwind CSS | [tailwindDoc.md](./external/tailwindDoc.md)   | Utility CSS, custom dark theme, cn() helper, color tokens    |
| 31  | Radix UI     | [radixUIDoc.md](./external/radixUIDoc.md)     | UI primitives: checkbox component                            |
| 32  | Storybook    | [storybookDoc.md](./external/storybookDoc.md) | Component development, stories, visual testing               |

---

## Key Source File Locations

```
src/
+-- utils/
|   +-- nodeStateManagement/
|   |   +-- types.ts                  State, DataType, TypeOfNode, Node, Edge
|   |   +-- mainReducer.ts           11-action reducer, Immer produce()
|   |   +-- standardNodes.ts         Standard data types & node types
|   |   +-- constructAndModifyHandles.ts  Edge add/remove with validation
|   |   +-- nodes/
|   |       +-- nodeGroups.ts         Group subtree operations
|   |       +-- loops.ts             Loop triplet operations
|   +-- nodeRunner/
|   |   +-- compiler.ts              5-phase compilation pipeline
|   |   +-- executor.ts              Async execution engine
|   |   +-- useNodeRunner.ts         React hook state machine
|   |   +-- executionRecorder.ts     Execution recording
|   |   +-- valueStore.ts            Runtime value propagation
|   |   +-- topologicalSort.ts       Kahn's algorithm
|   |   +-- loopCompiler.ts          Loop block compilation
|   |   +-- groupCompiler.ts         Group scope compilation
|   |   +-- types.ts                 All runner type definitions
|   +-- importExport/
|       +-- stateExport.ts           State serialization
|       +-- stateImport.ts           State deserialization + validation
|       +-- recordExport.ts          Recording serialization
|       +-- recordImport.ts          Recording deserialization
|       +-- validation.ts            Structural validation + repair
+-- components/
|   +-- organisms/
|   |   +-- FullGraph/                Main graph editor
|   |   +-- ConfigurableNode/         Node rendering
|   |   +-- NodeRunnerPanel/          Runner UI panel
|   +-- molecules/
|   |   +-- ContextMenu/              Right-click menu
|   |   +-- RunControls/              Transport bar
|   |   +-- ExecutionTimeline/         Timeline scrubber
|   |   +-- ExecutionStepInspector/    Step detail viewer
|   +-- atoms/
|       +-- Badge/                    Status badges
|       +-- Separator/                Divider line
|       +-- Collapsible/             Expand/collapse section
|       +-- NodeStatusIndicator/      Runner visual overlay
|       +-- ScrollableButtonContainer/ Horizontal scroll
+-- hooks/
    +-- useClickedOutside.ts          Outside click detection
    +-- useDrag.ts                    Drag interaction
    +-- useSlideAnimation.ts          CSS slide transitions
    +-- useResizeHandle.ts            Drag-to-resize
    +-- useFloatingTooltip.ts         Cursor-following tooltip
    +-- useAutoScroll.ts              Auto-scroll to bottom
```

---

## Cross-Feature Dependency Map

```
DataTypes ----> Handles ----> Type Inference
    |               |
    v               v
  Nodes -------> Edges -------> Connection Validation
    |               |
    |    +----------+----------+
    v    v                     v
Node Groups              Loops
    |                      |
    +----------+-----------+
               |
               v
        State Management
               |
       +-------+-------+
       |               |
       v               v
Runner Compiler    FullGraph
       |               |
       v               +----> ConfigurableNode
Runner Executor   |           ConfigurableEdge
       |               |      Context Menu
       v               |
Execution Recording    +----> NodeRunnerPanel
       |                        |
       v                  +-----+-----+
useNodeRunner             |     |     |
       |              RunCtrl  Timeline Inspector
       v
NodeStatusIndicator
```
