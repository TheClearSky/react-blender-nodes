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
|                                      | createGraphStore + useFull- |      |
|                                      |  Graph (external store)     |      |
|                                      | validate -> plan -> apply   |      |
|                                      | (35 actions, 34 plan kinds) |      |
|                                      | Immer produce + undo/redo   |      |
|                                      |  history (patches)          |      |
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
|  +-------------------+  +-------------------+  +---------------------+    |
|  |     Switches      |  |      Zones        |  |  Editor Drawers     |    |
|  | switchStart/End   |  | first-class       |  | loop / switch /     |    |
|  | pair, condition   |  | regions, frames   |  | node-type editors   |    |
|  | true/false zones  |  | loop pre/post-stop|  | reorder/rename      |    |
|  | bindSwitchNodes   |  | switch true/false |  | handles (channels)  |    |
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
|                           | run/pause/resume |                            |
|                           | step/stop/reset  |                            |
|                           | replayTo/loadRec |                            |
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
|  Accordion, Tooltip, Modal            Validation & repair                 |
|  ErrorBoundary                                                            |
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
|  (@xyflow/    produce + schema    CSS dark    checkbox    component       |
|   react)      patches   valid.    theme       primitive   dev/test        |
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
| State   |---->| validate-> |         +--------+-----------+
| Mgmt    |     |  plan->    |                  |
| (store) |     |  apply     |         ExecutionPlan
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
- Advanced features: node groups, loops (triplet), switches (pair), zones, and
  undo/redo history
- Editing: loop / switch / node-type drawers
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
- Discriminated union actions, validate -> plan -> apply pipeline, variance
  bridge for context
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
| [nodePreviewDoc.md](./ui/nodePreviewDoc.md)           | Optional per-node-type preview component   |

### Making Nodes Executable (Runner Integration)

| Doc                                                           | Why                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [runnerCompilerDoc.md](./runner/runnerCompilerDoc.md)         | How nodes become ExecutionSteps                                                                                                                               |
| [runnerExecutorDoc.md](./runner/runnerExecutorDoc.md)         | FunctionImplementation interface, ValueStore                                                                                                                  |
| [runnerHookDoc.md](./runner/runnerHookDoc.md)                 | useNodeRunner API, state machine                                                                                                                              |
| [executionRecordingDoc.md](./runner/executionRecordingDoc.md) | Step records, replay support                                                                                                                                  |
| [runTargetsDoc.md](./runner/runTargetsDoc.md)                 | Pluggable run targets, split Run button, the React-free `/contract` subpath (codegen / export moved to the `@theclearsky/react-blender-nodes-codegen` plugin) |
| [nodeStatusIndicatorDoc.md](./ui/nodeStatusIndicatorDoc.md)   | Visual feedback during execution                                                                                                                              |
| [nodePreviewDoc.md](./ui/nodePreviewDoc.md)                   | Optional per-node-type preview components fed live / at-step runner values                                                                                    |

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
| [zonesDoc.md](./features/zonesDoc.md)                               | Pre-Stop / Post-Stop body zones           |
| [nodesDoc.md](./core/nodesDoc.md)                                   | loopStart/loopStop/loopEnd standard nodes |
| [connectionValidationDoc.md](./features/connectionValidationDoc.md) | Loop-specific validation rules            |
| [runnerCompilerDoc.md](./runner/runnerCompilerDoc.md)               | LoopExecutionBlock compilation            |

### Building a Switch

| Doc                                                                 | Why                                        |
| ------------------------------------------------------------------- | ------------------------------------------ |
| [switchesDoc.md](./features/switchesDoc.md)                         | Switch pair, condition, bindSwitchNodes    |
| [zonesDoc.md](./features/zonesDoc.md)                               | True / False branch zones, handle ordering |
| [nodesDoc.md](./core/nodesDoc.md)                                   | switchStart/switchEnd standard nodes       |
| [connectionValidationDoc.md](./features/connectionValidationDoc.md) | Switch branch validation rules             |
| [runnerCompilerDoc.md](./runner/runnerCompilerDoc.md)               | SwitchExecutionBlock compilation           |

### Editing Loops, Switches, or Node Types (Drawers)

| Doc                                                   | Why                                                  |
| ----------------------------------------------------- | ---------------------------------------------------- |
| [editorsDoc.md](./ui/editorsDoc.md)                   | Loop/switch/node-type drawers, channel reorder model |
| [stateManagementDoc.md](./core/stateManagementDoc.md) | UPDATE_LOOP/UPDATE_SWITCH/UPDATE_NODE_TYPE, drawers  |
| [loopsDoc.md](./features/loopsDoc.md)                 | Loop structure the loop editor edits                 |
| [switchesDoc.md](./features/switchesDoc.md)           | Switch structure the switch editor edits             |

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

| Doc                                                   | Why                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| [inputComponentsDoc.md](./ui/inputComponentsDoc.md)   | Existing input atoms, patterns                                |
| [configurableNodeDoc.md](./ui/configurableNodeDoc.md) | How inputs are rendered inside nodes                          |
| [dataTypesDoc.md](./core/dataTypesDoc.md)             | hasInputField, underlyingType mapping                         |
| [colorPickerDoc.md](./ui/colorPickerDoc.md)           | OKLCH color picker molecule (compound parts + popover + hook) |
| [tailwindDoc.md](./external/tailwindDoc.md)           | Styling conventions, custom theme                             |

### Implementing Import/Export

| Doc                                                           | Why                                          |
| ------------------------------------------------------------- | -------------------------------------------- |
| [importExportDoc.md](./importExport/importExportDoc.md)       | Serialization, validation, repair strategies |
| [stateManagementDoc.md](./core/stateManagementDoc.md)         | REPLACE_STATE action                         |
| [executionRecordingDoc.md](./runner/executionRecordingDoc.md) | Recording export/import format               |
| [fullGraphDoc.md](./ui/fullGraphDoc.md)                       | Import/export UI integration                 |

### Theming the Graph

| Doc                                         | Why                                                           |
| ------------------------------------------- | ------------------------------------------------------------- |
| [themingDoc.md](./ui/themingDoc.md)         | GraphThemeProvider, slot map, presets, var-override mechanism |
| [tailwindDoc.md](./external/tailwindDoc.md) | Token blocks (inline vs themeable), cn() conflict resolution  |
| [fullGraphDoc.md](./ui/fullGraphDoc.md)     | Where the provider sits relative to FullGraph's contexts      |

### Adding a New UI Atom

| Doc                                           | Why                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [uiPrimitivesDoc.md](./ui/uiPrimitivesDoc.md) | Accordion, Modal, Tooltip, ErrorBoundary, ConfigurableConnection, ScrollableButtonContainer |
| [hooksDoc.md](./hooks/hooksDoc.md)            | Custom hooks available for reuse                                                            |
| [tailwindDoc.md](./external/tailwindDoc.md)   | Styling patterns, cn() helper, color tokens                                                 |
| [storybookDoc.md](./external/storybookDoc.md) | Story writing conventions                                                                   |
| [radixUIDoc.md](./external/radixUIDoc.md)     | Radix UI integration pattern                                                                |

### Working with State/Reducer

| Doc                                                   | Why                                               |
| ----------------------------------------------------- | ------------------------------------------------- |
| [stateManagementDoc.md](./core/stateManagementDoc.md) | State type, 35 actions, validate -> plan -> apply |
| [historyDoc.md](./core/historyDoc.md)                 | Undo/redo, batching, Immer-patch history entries  |
| [immerDoc.md](./external/immerDoc.md)                 | Immer produce + produceWithPatches integration    |
| [edgesDoc.md](./core/edgesDoc.md)                     | Edge add/remove with type checking side effects   |
| [typeInferenceDoc.md](./core/typeInferenceDoc.md)     | Inference cascades triggered by state changes     |

### Writing Tests / Stories

| Doc                                           | Why                                |
| --------------------------------------------- | ---------------------------------- |
| [storybookDoc.md](./external/storybookDoc.md) | Story patterns, running Storybook  |
| [fullGraphDoc.md](./ui/fullGraphDoc.md)       | Main playground story              |
| [zodDoc.md](./external/zodDoc.md)             | Schema validation testing patterns |

---

## Complete Document Map

### Core Systems

| #   | Feature           | Doc                                                   | Description                                                                                 |
| --- | ----------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Data Types        | [dataTypesDoc.md](./core/dataTypesDoc.md)             | Type system foundation: string, number, boolean, complex, inferFromConnection, noEquivalent |
| 2   | Handles           | [handlesDoc.md](./core/handlesDoc.md)                 | Input/output ports, HandleIndices addressing, panels, dynamic handle addition               |
| 3   | Nodes             | [nodesDoc.md](./core/nodesDoc.md)                     | TypeOfNode definitions, Node instances, 7 standard node types                               |
| 4   | Edges             | [edgesDoc.md](./core/edgesDoc.md)                     | Connection management, type-checked add/remove, DFS cycle detection                         |
| 5   | State Management  | [stateManagementDoc.md](./core/stateManagementDoc.md) | createGraphStore + useFullGraph, validate -> plan -> apply, 35 action types                 |
| 6   | Type Inference    | [typeInferenceDoc.md](./core/typeInferenceDoc.md)     | inferFromConnection resolution, cascading inference on edge changes                         |
| 7   | Undo/Redo History | [historyDoc.md](./core/historyDoc.md)                 | state.history, Immer patches, batching, UNDO/REDO/BEGIN_BATCH/END_BATCH/CLEAR_HISTORY       |

### Feature Systems

| #   | Feature               | Doc                                                                 | Description                                                                 |
| --- | --------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 8   | Node Groups           | [nodeGroupsDoc.md](./features/nodeGroupsDoc.md)                     | Subtree-based composable groups, boundary nodes, handle synchronization     |
| 9   | Loops                 | [loopsDoc.md](./features/loopsDoc.md)                               | Loop triplet (loopStart/Stop/End), bindLoopNodes, iteration data flow       |
| 10  | Switches              | [switchesDoc.md](./features/switchesDoc.md)                         | Switch pair (switchStart/End), condition, bindSwitchNodes, true/false zones |
| 11  | Zones                 | [zonesDoc.md](./features/zonesDoc.md)                               | First-class regions: loop pre/post-stop & switch true/false, frame overlay  |
| 12  | Connection Validation | [connectionValidationDoc.md](./features/connectionValidationDoc.md) | Cycle check, type conversion, complex type check, loop/switch/group rules   |

### Runner Systems

| #   | Feature             | Doc                                                           | Description                                                                                                                                                                                         |
| --- | ------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | Runner Compiler     | [runnerCompilerDoc.md](./runner/runnerCompilerDoc.md)         | 5-phase pipeline: State -> ExecutionPlan (loop/switch/group)                                                                                                                                        |
| 14  | Runner Executor     | [runnerExecutorDoc.md](./runner/runnerExecutorDoc.md)         | Async execution engine, ValueStore, concurrent level execution                                                                                                                                      |
| 15  | Runner Hook         | [runnerHookDoc.md](./runner/runnerHookDoc.md)                 | useNodeRunner hook: run/pause/resume/step/stop/reset/replayTo                                                                                                                                       |
| 16  | Execution Recording | [executionRecordingDoc.md](./runner/executionRecordingDoc.md) | ExecutionRecord, step records, value snapshots, replay support                                                                                                                                      |
| 17  | Run Targets         | [runTargetsDoc.md](./runner/runTargetsDoc.md)                 | Pluggable execution: RunTarget contract, built-in in-process/json-ir, the React-free `/contract` subpath (codegen ships as the `@theclearsky/react-blender-nodes-codegen` plugin), split Run button |

### UI Components

| #   | Feature                | Doc                                                               | Description                                                                                    |
| --- | ---------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 18  | FullGraph              | [fullGraphDoc.md](./ui/fullGraphDoc.md)                           | Top-level graph editor, external store, ReactFlow integration                                  |
| 19  | ConfigurableNode       | [configurableNodeDoc.md](./ui/configurableNodeDoc.md)             | Node rendering: header, handles, inputs, panels, header actions                                |
| 20  | ConfigurableEdge       | [configurableEdgeDoc.md](./ui/configurableEdgeDoc.md)             | Edge rendering: gradient colors, bezier curves, viewport optimization                          |
| 21  | Context Menu           | [contextMenuDoc.md](./ui/contextMenuDoc.md)                       | Right-click menu: add node/loop/switch, node groups, import/export                             |
| 22  | Editor Drawers         | [editorsDoc.md](./ui/editorsDoc.md)                               | Loop / switch / node-type edit drawers, data-channel reorder & rename                          |
| 23  | NodeRunnerPanel        | [nodeRunnerPanelDoc.md](./ui/nodeRunnerPanelDoc.md)               | Runner UI drawer: composed of RunControls + Timeline + Inspector                               |
| 24  | RunControls            | [runControlsDoc.md](./ui/runControlsDoc.md)                       | Transport bar: play/pause/step/stop/reset, mode toggle, split Run-target picker                |
| 25  | ExecutionTimeline      | [executionTimelineDoc.md](./ui/executionTimelineDoc.md)           | Multi-track timeline: loops, switches, zoom/pan, scrubber                                      |
| 26  | ExecutionStepInspector | [executionStepInspectorDoc.md](./ui/executionStepInspectorDoc.md) | Step detail panel: input/output values, error display                                          |
| 27  | ColorPicker            | [colorPickerDoc.md](./ui/colorPickerDoc.md)                       | OKLCH-native color picker: PopoverColorPicker, compound parts, useColorPicker                  |
| 28  | Graph Theming          | [themingDoc.md](./ui/themingDoc.md)                               | Optional GraphThemeProvider: per-slot className overrides, presets, ReactFlow section          |
| 40  | Node Preview           | [nodePreviewDoc.md](./ui/nodePreviewDoc.md)                       | Optional per-node-type preview components rendered on the node, fed live/at-step runner values |

### UI Atoms, Hooks & Utilities

| #   | Feature             | Doc                                                         | Description                                                                                      |
| --- | ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 29  | NodeStatusIndicator | [nodeStatusIndicatorDoc.md](./ui/nodeStatusIndicatorDoc.md) | Visual state overlay: running/completed/errored/warning borders                                  |
| 30  | Input Components    | [inputComponentsDoc.md](./ui/inputComponentsDoc.md)         | Text input, number slider, checkbox, button atoms                                                |
| 31  | UI Primitives       | [uiPrimitivesDoc.md](./ui/uiPrimitivesDoc.md)               | Accordion, Modal, Tooltip, ErrorBoundary, NodeResizerWithMoreControls, ScrollableButtonContainer |
| 32  | Custom Hooks        | [hooksDoc.md](./hooks/hooksDoc.md)                          | useDrag, useClickedOutside, useSlideAnimation, useResizeHandle, useControllableState, etc.       |

### Import/Export

| #   | Feature       | Doc                                                     | Description                                                    |
| --- | ------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| 33  | Import/Export | [importExportDoc.md](./importExport/importExportDoc.md) | State & recording serialization, validation, repair strategies |

### External Systems

| #   | Feature      | Doc                                           | Description                                                    |
| --- | ------------ | --------------------------------------------- | -------------------------------------------------------------- |
| 34  | ReactFlow    | [reactFlowDoc.md](./external/reactFlowDoc.md) | Core graph rendering engine: nodes, edges, viewport, minimap   |
| 35  | Immer        | [immerDoc.md](./external/immerDoc.md)         | Immutable updates via produce + produceWithPatches (undo/redo) |
| 36  | Zod          | [zodDoc.md](./external/zodDoc.md)             | Schema validation for complex data types                       |
| 37  | Tailwind CSS | [tailwindDoc.md](./external/tailwindDoc.md)   | Utility CSS, custom dark theme, cn() helper, color tokens      |
| 38  | Radix UI     | [radixUIDoc.md](./external/radixUIDoc.md)     | UI primitives: checkbox component                              |
| 39  | Storybook    | [storybookDoc.md](./external/storybookDoc.md) | Component development, stories, visual testing                 |

---

## Key Source File Locations

```
src/
+-- utils/
|   +-- nodeStateManagement/
|   |   +-- types.ts                  State (incl. history, zones), DataType, TypeOfNode, ActiveDrawer
|   |   +-- mainReducer.ts            35 action types; delegates to validate + applyValidatedAction
|   |   +-- applyWithHistory.ts       applyValidatedAction: 3-path undo/redo history routing
|   |   +-- graphEvent.ts             GraphEvent observability stream (applied/rejected/committed/ui)
|   |   +-- standardNodes.ts          Standard data types & 7 standard node types
|   |   +-- constructAndModifyHandles.ts  Legacy edge add/remove (test-only)
|   |   +-- planApply/
|   |   |   +-- validators.ts         validateAction (pure) -> Result<Plan, ValidationError>
|   |   |   +-- validateAddEdge.ts    13-step edge validation gauntlet
|   |   |   +-- applyPlan.ts          The only mutator: switch over 34 plan kinds, mints ids
|   |   |   +-- types.ts              Plan union, Result, ValidationError taxonomy
|   |   +-- zones/                    First-class regions (types, lifecycle, BFS discovery)
|   |   +-- nodes/
|   |       +-- nodeGroups.ts         Group subtree operations
|   |       +-- loops/                Loop triplet operations (folder)
|   |       +-- switches/             Switch pair operations + true/false zones (folder)
|   +-- nodeRunner/
|   |   +-- compiler.ts              5-phase compilation pipeline
|   |   +-- executor/                Async execution engine (folder)
|   |   +-- useNodeRunner.ts         React hook state machine
|   |   +-- executionRecorder.ts     Execution recording
|   |   +-- valueStore.ts            Runtime value propagation
|   |   +-- topologicalSort.ts       Kahn's algorithm
|   |   +-- loopCompiler.ts          Loop block compilation
|   |   +-- switchCompiler.ts        Switch block compilation
|   |   +-- groupCompiler.ts         Group scope compilation
|   |   +-- types.ts                 All runner type definitions
|   +-- importExport/
|       +-- stateSerializer.ts       State strip (UI-only fields incl. history/zones)
|       +-- stateExport.ts           exportGraphState: serialize state -> JSON string
|       +-- stateImport.ts           State deserialization + validation
|       +-- recordExport.ts          Recording serialization
|       +-- recordImport.ts          Recording deserialization
|       +-- serialization.ts         Map<->Record, safe values, GraphError ser/de
|       +-- validation.ts            Structural validation + repair
+-- components/
|   +-- organisms/
|   |   +-- FullGraph/                Main graph editor
|   |   |   +-- graphStore.ts         createGraphStore (external Redux-style store)
|   |   |   +-- FullGraphState.ts     useFullGraph (useSyncExternalStore)
|   |   |   +-- historyTypes.ts       HistoryEntry/Config, isUndoable, recordInHistory
|   |   +-- ConfigurableNode/         Node rendering
|   |   +-- NodeRunnerPanel/          Runner UI panel
|   +-- molecules/
|   |   +-- ContextMenu/              Right-click menu
|   |   +-- LoopEditDrawer/           Loop data-channel editor
|   |   +-- SwitchEditDrawer/         Switch data-channel editor
|   |   +-- NodeTypeEditDrawer/       Group/node-type editor
|   |   +-- ColorPicker/              OKLCH color picker (PopoverColorPicker + compound parts + useColorPicker)
|   |   +-- ZoneFrameOverlay/         Convex-hull zone frame rendering
|   |   +-- RunControls/              Transport bar
|   |   +-- ExecutionTimeline/         Timeline scrubber
|   |   +-- ExecutionStepInspector/    Step detail viewer
|   +-- atoms/
|       +-- Accordion/                Collapsible disclosure section
|       +-- Modal/                    Dialog / preset modal
|       +-- Tooltip/                  Floating tooltip
|       +-- ErrorBoundary/            Render-error fallback
|       +-- ConfigurableConnection/   In-progress connection line
|       +-- NodeResizerWithMoreControls/ Node resize handles
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
    |    +----------+----+----------+----------+
    v    v               v          v          v
Node Groups          Loops      Switches     Zones
    |                  |          |            ^
    |                  +----+-----+            | (regions for)
    +----------+------------+                  |
               |        (loops + switches create)
               v
        State Management ---- Undo/Redo History
        (validate->plan->apply, createGraphStore)
               |
       +-------+-------+
       |               |
       v               v
Runner Compiler    FullGraph (+ useFullGraph store)
       |               |
       v               +----> ConfigurableNode
Runner Executor   |           ConfigurableEdge
       |               |      Context Menu
       v               |      Editor Drawers / ZoneFrameOverlay
Execution Recording    +----> NodeRunnerPanel
       |                        |
       v                  +-----+-----+
useNodeRunner             |     |     |
       |              RunCtrl  Timeline Inspector
       v
NodeStatusIndicator
```
