# ConfigurableNode

## Overview

ConfigurableNode is the core visual rendering component for nodes in the
react-blender-nodes library. Inspired by Blender's node editor, it renders a
fully configurable node with a colored header, input/output connection handles,
collapsible input panels, interactive input fields, node group navigation,
resizing controls, and runner execution status overlays.

ConfigurableNode operates in two modes:

- **Standalone mode** (`isCurrentlyInsideReactFlow=false`): Renders as a static
  preview with positioned handle indicators but no ReactFlow integration. Useful
  for Storybook, documentation, or thumbnails.
- **ReactFlow mode** (`isCurrentlyInsideReactFlow=true`): Renders with live
  ReactFlow `<Handle>` elements, node resizing controls, connection-aware input
  toggling, and context-based dispatch. Used inside `FullGraph` via
  `ConfigurableNodeReactFlowWrapper`.

The component uses `forwardRef` to expose its root `<div>` for external
measurement or focus management, and is wrapped with `NodeStatusIndicator` when
runner visual state is present.

## Entity-Relationship Diagram

```
+------------------------------+         +---------------------------+
|    ConfigurableNodeProps      |         |   ConfigurableNodeState   |
|------------------------------|         |   (ReactFlow Node<Data>)  |
| id?: string                  |         |---------------------------|
| name?: string                |<--------| Node<ConfigurableNode-    |
| headerColor?: string         |  wraps  |   Props, 'configurable-   |
| inputs?: (Input | Panel)[]   |         |   Node'>                  |
| outputs?: Output[]           |         +---------------------------+
| isCurrentlyInsideReactFlow?  |
| nodeResizerProps?            |
| nodeTypeUniqueId?            |
| showNodeOpenButton?          |
| runnerVisualState?           |       +-----------------------------+
| runnerErrors?                |       | ConfigurableNodeInputPanel  |
| runnerWarnings?              |       |-----------------------------|
+------------------------------+       | id: string                  |
        |          |                   | name: string                |
        |          |                   | inputs: Input[]             |
        v          v                   +-----------------------------+
+----------------+  +------------------+           |
| Configurable-  |  | Configurable-    |           | contains
| NodeInput      |  | NodeOutput       |           v
|----------------|  |------------------|   +--------------------+
| id: string     |  | id: string       |   | ConfigurableNode-  |
| name: string   |  | name: string     |   | Input (same type)  |
| handleColor?   |  | handleColor?     |   +--------------------+
| handleShape?   |  | handleShape?     |
| allowInput?    |  | maxConnections?  |
| maxConnections?|  | dataType?        |
| dataType?      |  | inferredDataType?|
| inferredDataType?| | type: string |  |
| type: string | |  |   number | bool  |
|   number |     |  |   unsupported    |
|   boolean |    |  +------------------+
|   unsupported  |
| value?         |
| onChange?      |
+----------------+
```

## Functional Dependency Diagram

```
ConfigurableNode depends on:
+-----------------------------------------------------------------------+
|                                                                       |
|  ConfigurableNode (organisms/)                                        |
|  |                                                                    |
|  +-- ContextAwareHandle (SupportingSubcomponents/)                    |
|  |   +-- Handle (@xyflow/react)          [ReactFlow mode]             |
|  |   +-- renderHandleShape()             [13 shape variants]          |
|  |   +-- handleShapesMap                 (ContextAwareHandleShapes)   |
|  |   +-- useNodeConnections()            (@xyflow/react)              |
|  |                                                                    |
|  +-- ContextAwareInput (SupportingSubcomponents/)                     |
|  |   +-- ReactFlowAwareInput                                         |
|  |   |   +-- useReactFlow()              (@xyflow/react)              |
|  |   |   +-- useNodeId()                 (@xyflow/react)              |
|  |   |   +-- updateHandleInNodeDataMatchingHandleId()  (utils/)       |
|  |   |   +-- Input (atoms/)              [string type]                |
|  |   |   +-- SliderNumberInput (molecules/) [number type]             |
|  |   |   +-- Checkbox (atoms/)           [boolean type]               |
|  |   +-- Input (atoms/)                  [standalone string]          |
|  |   +-- SliderNumberInput (molecules/)  [standalone number]          |
|  |   +-- Checkbox (atoms/)               [standalone boolean]         |
|  |                                                                    |
|  +-- ContextAwareOpenButton (SupportingSubcomponents/)                |
|  |   +-- ReactFlowAwareOpenButton                                    |
|  |   |   +-- useNodeId()                 (@xyflow/react)              |
|  |   |   +-- FullGraphContext            (FullGraph/)                 |
|  |   |   +-- actionTypesMap.OPEN_NODE_GROUP  (mainReducer)            |
|  |   +-- SquareMousePointerIcon          (lucide-react)               |
|  |                                                                    |
|  +-- NodeResizerWithMoreControls (atoms/)                             |
|  |   +-- NodeResizeControl               (@xyflow/react)              |
|  |                                                                    |
|  +-- NodeStatusIndicator (atoms/)                                     |
|  |   +-- useFloatingTooltip()            (hooks/)                     |
|  |   +-- FloatingArrow                   (@floating-ui/react)         |
|  |   +-- formatGraphError()              (nodeRunner/errors)          |
|  |                                                                    |
|  +-- FullGraphContext                    (FullGraph/FullGraphState)    |
|  +-- Button (atoms/)                    [panel toggle]                |
|  +-- ChevronDownIcon / ChevronUpIcon    (lucide-react)                |
|  +-- useNodeConnections()               (@xyflow/react)               |
|  +-- cn()                               (utils/)                      |
|                                                                       |
+-----------------------------------------------------------------------+
```

## Data Flow Diagram

```
                           ReactFlow Node Registry
                                    |
                                    | nodeTypes = { configurableNode: Wrapper }
                                    v
                    +-----------------------------------+
                    | ConfigurableNodeReactFlowWrapper  |
                    |-----------------------------------|
                    | Receives: NodeProps<State> + id   |
                    | Reads: FullGraphContext            |
                    |   -> nodeRunnerStates.get(id)     |
                    | Passes: data.* as props            |
                    |   + isCurrentlyInsideReactFlow=true|
                    |   + runnerVisualState              |
                    |   + runnerErrors / runnerWarnings  |
                    +----------------+------------------+
                                     |
                                     v
                    +-----------------------------------+
                    |        ConfigurableNode            |
                    |-----------------------------------|
                    | State: openPanels (Set<string>)    |
                    | Reads: FullGraphContext             |
                    |   -> enableDebugMode (shows id)    |
                    +---+--------+--------+--------+----+
                        |        |        |        |
          +-------------+   +----+   +----+   +----+----------+
          |                 |        |        |                |
          v                 v        v        v                v
    +-----------+    +----------+ +------+ +--------+  +---------------+
    |  Header   |    | Render-  | |Render| |Render- |  | NodeStatus-   |
    | (colored  |    | Output   | |Input | |Input-  |  | Indicator     |
    |  bar +    |    | (per     | |(per  | |Panel   |  | (wraps all    |
    |  name +   |    | output)  | |input)| |(per    |  |  when runner  |
    |  open btn)|    +----+-----+ +--+---+ |panel)  |  |  state set)   |
    +-----------+         |          |     +---+----+  +---------------+
                          |          |         |
                          v          v         v
                   ContextAware  ContextAware  Collapsible group
                   Handle        Handle +      with nested
                   (source,      (target,      RenderInput items
                    right)       left) +
                                 ContextAwareInput
                                 (if allowInput
                                  && !connected)
```

## System Diagram

```
+===========================================================================+
|                          react-blender-nodes                              |
|                                                                           |
|  +-- State Layer (useFullGraph / mainReducer) -------------------------+  |
|  |  State { dataTypes, typeOfNodes, nodes, edges, ... }                |  |
|  |  dispatch(action) -> mainReducer -> new State                       |  |
|  +---------------------------------------------------------------------+  |
|       |                                                                   |
|       | provides via FullGraphContext                                      |
|       v                                                                   |
|  +-- FullGraph (organism) ---------------------------------------------+  |
|  |                                                                     |  |
|  |  ReactFlow canvas                                                   |  |
|  |    |                                                                |  |
|  |    +-- nodeTypes.configurableNode = ConfigurableNodeReactFlowWrapper|  |
|  |    |     |                                                          |  |
|  |    |     +-- ConfigurableNode  <<<<< THIS FEATURE >>>>>             |  |
|  |    |           |                                                    |  |
|  |    |           +-- ContextAwareHandle  (connection ports)           |  |
|  |    |           +-- ContextAwareInput   (inline editors)             |  |
|  |    |           +-- ContextAwareOpenButton (group navigation)        |  |
|  |    |           +-- NodeResizerWithMoreControls (resize)             |  |
|  |    |           +-- NodeStatusIndicator (runner overlay)             |  |
|  |    |                                                                |  |
|  |    +-- edgeTypes / connection lines                                 |  |
|  |    +-- ContextMenu (right-click)                                    |  |
|  |                                                                     |  |
|  +---------------------------------------------------------------------+  |
|       |                                                                   |
|       | nodeRunnerStates via FullGraphContext                              |
|       |                                                                   |
|  +-- Runner Layer (useNodeRunner) -------------------------------------+  |
|  |  compiler -> ExecutionPlan -> executor -> ExecutionRecord           |  |
|  |  Produces: Map<nodeId, { visualState, errors, warnings }>          |  |
|  +---------------------------------------------------------------------+  |
|                                                                           |
+===========================================================================+
```

## ConfigurableNodeProps

| Prop                                | Type                                | Default     | Description                                                                                                                      |
| ----------------------------------- | ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                | `string?`                           | `undefined` | Node instance ID. Shown in header when `enableDebugMode` is true in FullGraphContext.                                            |
| `name`                              | `string?`                           | `'Node'`    | Display name rendered in the header bar.                                                                                         |
| `headerColor`                       | `string?`                           | `'#79461D'` | CSS background color for the header bar.                                                                                         |
| `inputs`                            | `(Input \| Panel)[]?`               | `[]`        | Array of input definitions and/or input panel definitions. Panels are distinguished by having an `inputs` property.              |
| `outputs`                           | `Output[]?`                         | `[]`        | Array of output handle definitions.                                                                                              |
| `isCurrentlyInsideReactFlow`        | `boolean?`                          | `false`     | Whether the node is rendered inside a ReactFlow context. Controls handle rendering mode and enables resizer/connection features. |
| `nodeResizerProps`                  | `NodeResizerWithMoreControlsProps?` | `{}`        | Props forwarded to the `NodeResizerWithMoreControls` component. Only rendered when `isCurrentlyInsideReactFlow` is true.         |
| `nodeTypeUniqueId`                  | `string?`                           | `undefined` | The node type's unique identifier from the type definitions.                                                                     |
| `showNodeOpenButton`                | `boolean?`                          | `false`     | Whether to show the open button (SquareMousePointer icon) in the header. Used for node groups to navigate into the subtree.      |
| `runnerVisualState`                 | `NodeVisualState?`                  | `undefined` | Runner execution visual state. When defined, wraps the node content with `NodeStatusIndicator`.                                  |
| `runnerErrors`                      | `ReadonlyArray<GraphError>?`        | `undefined` | Errors from the runner for this node. Shown as tooltip on the error icon overlay.                                                |
| `runnerWarnings`                    | `ReadonlyArray<string>?`            | `undefined` | Warning messages from the runner. Shown as tooltip on the warning icon overlay.                                                  |
| `...HTMLAttributes<HTMLDivElement>` | —                                   | —           | All standard div attributes (className, style, onClick, etc.) are spread onto the root element.                                  |

## Type Definitions

### ConfigurableNodeInput

Defines an input socket on a node with optional interactive input component.
Generic over `UnderlyingType`, `ComplexSchemaType`, and `DataTypeUniqueId`.

```
ConfigurableNodeInput {
  id: string                    // Unique handle identifier
  name: string                  // Display label
  handleColor?: string          // Handle visual color
  handleShape?: HandleShape     // One of 13 shape variants
  allowInput?: boolean          // Show inline editor when unconnected
  maxConnections?: number       // Connection limit (undefined = unlimited)
  dataType?: {                  // Data type for FullGraph type checking
    dataTypeObject: DataType
    dataTypeUniqueId: string
  }
  inferredDataType?: {          // Inferred type when using inferredFromConnection
    dataTypeObject: DataType
    dataTypeUniqueId: string
  } | null

  // Discriminated union on type:
  type: 'string'                value?: string    onChange?: (v: string) => void
       | 'number'               value?: number    onChange?: (v: number) => void
       | 'boolean'              value?: boolean   onChange?: (v: boolean) => void
       | 'unsupportedDirectly'  value?: unknown   onChange?: (v: unknown) => void
}
```

### ConfigurableNodeOutput

Defines an output socket on a node. Same generic parameters as Input but without
`allowInput`, `value`, or `onChange`.

```
ConfigurableNodeOutput {
  id: string                    // Unique handle identifier
  name: string                  // Display label
  handleColor?: string          // Handle visual color
  handleShape?: HandleShape     // One of 13 shape variants
  maxConnections?: number       // Connection limit

  dataType?: { dataTypeObject, dataTypeUniqueId }
  inferredDataType?: { dataTypeObject, dataTypeUniqueId } | null

  type: 'string' | 'number' | 'boolean' | 'unsupportedDirectly'
}
```

### ConfigurableNodeInputPanel

Groups multiple inputs into a collapsible panel section.

```
ConfigurableNodeInputPanel {
  id: string                    // Unique panel identifier
  name: string                  // Panel header label
  inputs: ConfigurableNodeInput[] // Inputs contained in this panel
}
```

### ConfigurableNodeState (ReactFlow state)

The ReactFlow node type used when ConfigurableNode is registered as a node type.
Defined in `ConfigurableNodeReactFlowWrapper.tsx`.

```
ConfigurableNodeState = Node<
  Omit<ConfigurableNodeProps, 'isCurrentlyInsideReactFlow'>,
  'configurableNode'
>
```

This is a standard ReactFlow `Node` where:

- `data` contains all ConfigurableNodeProps except `isCurrentlyInsideReactFlow`
  (which is always `true` inside ReactFlow)
- `type` is the literal `'configurableNode'`

## Rendering Structure

The ConfigurableNode renders the following DOM structure:

```
<div>  (root, rounded-md, border highlight on focus/selection)
  |
  +-- <div> HEADER (headerColor background, rounded-t-md)
  |   +-- <p> name (truncated)
  |   +-- <p> id (only if enableDebugMode)
  |   +-- <ContextAwareOpenButton> (only if showNodeOpenButton)
  |
  +-- <div> BODY (bg-primary-dark-gray, min-h-[50px], rounded-b-md)
      |
      +-- <NodeResizerWithMoreControls> (only if isCurrentlyInsideReactFlow)
      |
      +-- <div> OUTPUTS section (flex-col, py-4)
      |   +-- <RenderOutput> for each output
      |       +-- output.name (text, right-aligned)
      |       +-- <ContextAwareHandle type="source" position="right">
      |
      +-- <div> INPUTS section (flex-col, py-4)
          +-- For each input item:
              |
              +-- IF input has 'inputs' property -> <RenderInputPanel>
              |   +-- <Button> toggle (chevron + panel.name)
              |   +-- <div> collapsible content (bg-[#272727])
              |       +-- <RenderInput> for each panel input
              |
              +-- ELSE -> <RenderInput>
                  +-- <ContextAwareHandle type="target" position="left">
                  +-- IF allowInput && !connected:
                  |   +-- <ContextAwareInput> (renders Input/SliderNumberInput/Checkbox)
                  +-- ELSE:
                      +-- input.name (text label)

// When runnerVisualState is defined, the entire nodeContent above
// is wrapped in:
<NodeStatusIndicator visualState={...} errors={...} warnings={...}>
  {nodeContent}
</NodeStatusIndicator>
```

### Header (name, color, collapse toggle)

The header is a colored bar (`headerColor` background) with:

- The node `name` displayed as truncated text
- The node `id` displayed when `enableDebugMode` is true in `FullGraphContext`
- A `ContextAwareOpenButton` when `showNodeOpenButton` is true (for node groups)

The header uses `rounded-t-md` to match the node's top border radius.

### Input Handles (ContextAwareHandle)

Each input renders a `ContextAwareHandle` with `type="target"` and
`position=Position.Left`. The handle sits absolutely positioned on the left edge
of the input row, centered vertically.

### Output Handles (ContextAwareHandle)

Each output renders a `ContextAwareHandle` with `type="source"` and
`position=Position.Right`. The handle sits absolutely positioned on the right
edge of the output row. Output text is right-aligned.

### Input Panels (collapsible groups)

Panels are detected by the presence of an `inputs` property on the input item.
Each panel renders:

- A `Button` header with a chevron icon (up when open, down when closed) and the
  panel name
- A collapsible `<div>` with `bg-[#272727]` that contains the panel's inputs
- Panel open/close state is managed via `openPanels: Set<string>` in component
  state (all panels start closed)

### Direct Inputs (ContextAwareInput)

When an input has `allowInput=true` AND is not connected to another node, the
label is replaced with an interactive input component:

- `type: 'string'` renders an `<Input>` text field (or `ReactFlowAwareInput`
  wrapper in ReactFlow mode)
- `type: 'number'` renders a `<SliderNumberInput>` slider
- `type: 'boolean'` renders a `<Checkbox>` with label
- `type: 'unsupportedDirectly'` renders nothing

Connection detection uses `useNodeConnections()` from `@xyflow/react`.

### Open Button (ContextAwareOpenButton)

The open button renders a `SquareMousePointerIcon` from lucide-react. In
ReactFlow mode, clicking dispatches `OPEN_NODE_GROUP` via
`FullGraphContext.allProps.dispatch`. In standalone mode, the icon renders
without a click handler.

### Resizer (NodeResizerWithMoreControls)

Only rendered when `isCurrentlyInsideReactFlow=true`. Provides customizable
resize controls using `@xyflow/react`'s `NodeResizeControl`:

- Default: horizontal-only resizing with left and right line controls
- Supports configurable `linePosition`, `handlePosition`, `resizeDirection`
- Supports `minWidth`, `minHeight`, `maxWidth`, `maxHeight` constraints

### Status Indicator (NodeStatusIndicator)

When `runnerVisualState` is defined, the entire node content is wrapped in
`NodeStatusIndicator`, which renders:

- An outline overlay using CSS `outline` (not `border`, so no layout shift)
- State-specific styling via the `visualState` prop
- Error/warning tooltip icons positioned absolutely at top-right

## Supporting Subcomponents

### ContextAwareHandle

**File:** `SupportingSubcomponents/ContextAwareHandle.tsx`

Renders a connection handle (port) for inputs or outputs with support for 13
custom shapes. Operates in two modes:

**ReactFlow mode** (`isCurrentlyInsideReactFlow=true`):

- Renders a ReactFlow `<Handle>` component with transparent background
- The actual shape is rendered inside the Handle as a non-interactive overlay
- Uses `useNodeConnections()` to check connection count against `maxConnections`
- Sets `isConnectable`, `isConnectableStart`, `isConnectableEnd` based on
  remaining capacity

**Standalone mode** (`isCurrentlyInsideReactFlow=false`):

- Renders an absolutely positioned `<div>` with the shape
- Positioned based on `Position.Left` or `Position.Right`

**Available shapes (13):** circle, square, rectangle, list, grid, diamond,
trapezium, hexagon, star, cross, zigzag, sparkle, parallelogram

Shapes are implemented via:

- CSS `border-radius` (circle)
- CSS `rotate` (diamond)
- CSS `clip-path` polygons (trapezium, hexagon, star, parallelogram)
- CSS `mask` (zigzag, sparkle)
- Nested `<div>` grids (list, grid, cross)

### ContextAwareInput

**File:** `SupportingSubcomponents/ContextAwareInput.tsx`

Renders the appropriate inline input component based on the input's `type`.
Operates in two modes:

**ReactFlow mode:** Delegates to `ReactFlowAwareInput`, which:

- Uses `useReactFlow()` and `useNodeId()` to access the ReactFlow instance
- On value change, calls `input.onChange()` AND updates the ReactFlow node data
  via `reactflowContext.setNodes()` using
  `updateHandleInNodeDataMatchingHandleId()`
- This ensures both the callback and the ReactFlow state stay in sync

**Standalone mode:** Renders the input component directly with only the
`onChange` callback.

**Supported input types:** | Type | Component | Notes |
|------|-----------|-------| | `string` | `<Input>` | Text field with
placeholder = input name | | `number` | `<SliderNumberInput>` | Slider + number
input combo | | `boolean` | `<Checkbox>` | Checkbox with label (input name) | |
`unsupportedDirectly` | `null` | No input rendered |

### ContextAwareOpenButton

**File:** `SupportingSubcomponents/ContextAwareOpenButton.tsx`

Conditionally renders a button for opening node groups (navigating into a
subtree). Only renders when `showButton=true`.

**ReactFlow mode:** Dispatches `OPEN_NODE_GROUP` action via
`FullGraphContext.allProps.dispatch` with the current `nodeId` (from
`useNodeId()`).

**Standalone mode:** Renders the icon without a click handler.

### ConfigurableNodeReactFlowWrapper

**File:** `SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx`

The bridge between ReactFlow's node type system and `ConfigurableNode`.
Registered as `nodeTypes.configurableNode` in FullGraph.

**Responsibilities:**

1. Receives `NodeProps<ConfigurableNodeState>` from ReactFlow (includes `data`
   and `id`)
2. Reads `FullGraphContext` to get runner state for this node via
   `nodeRunnerStates.get(id)`
3. Spreads `data` as props to `ConfigurableNode`
4. Sets `isCurrentlyInsideReactFlow=true`
5. Passes `runnerVisualState`, `runnerErrors`, `runnerWarnings` from the runner
   state
6. Adds `className='w-full'` so the node fills its ReactFlow container width

## Runner Visual State Integration

The runner provides per-node visual state through
`FullGraphContext.nodeRunnerStates`, a `ReadonlyMap<string, NodeRunnerState>`
where each entry contains:

```
NodeRunnerState {
  visualState: NodeVisualState    // 'idle' | 'running' | 'completed' | 'errored' | 'skipped' | 'warning'
  errors?: ReadonlyArray<GraphError>
  warnings?: ReadonlyArray<string>
}
```

**Data flow:**

```
useNodeRunner (hook)
  |
  | produces Map<nodeId, NodeRunnerState>
  v
FullGraphContext.nodeRunnerStates
  |
  | read by ConfigurableNodeReactFlowWrapper
  v
nodeRunnerStates.get(id) -> { visualState, errors, warnings }
  |
  | passed as props to ConfigurableNode
  v
ConfigurableNode checks: runnerVisualState !== undefined?
  |
  YES -> wraps content in <NodeStatusIndicator>
  NO  -> renders content directly
```

**NodeStatusIndicator visual mapping:**

| NodeVisualState | Outline Style         | Glow Effect         | Icon                   | Overlay           |
| --------------- | --------------------- | ------------------- | ---------------------- | ----------------- |
| `idle`          | 5px solid transparent | none                | none                   | none              |
| `running`       | 5px dashed blue       | breathing animation | none                   | none              |
| `completed`     | 5px solid green       | green glow          | none                   | none              |
| `errored`       | 5px solid red         | red glow            | AlertCircle (red)      | none              |
| `skipped`       | 5px dashed gray       | none                | none                   | 30% black dimming |
| `warning`       | 5px solid orange      | orange glow         | AlertTriangle (orange) | none              |

Error and warning icons show tooltips on hover using `@floating-ui/react`,
displaying formatted error messages or warning text.

## Limitations and Deprecated Patterns

1. **No vertical handles**: Handles only support `Position.Left` (inputs) and
   `Position.Right` (outputs). Top/bottom handle positions are not supported by
   ConfigurableNode's layout.

2. **`unsupportedDirectly` type renders nothing**: Inputs with
   `type: 'unsupportedDirectly'` and `allowInput: true` will not render any
   input component — the `ContextAwareInput` returns `null` for this type.

3. **Panel state is local**: The `openPanels` Set is local component state.
   Panel open/close state is not persisted across re-renders that unmount the
   node (e.g., navigating between group levels) and is not part of the
   serializable graph state.

4. **Connection detection relies on hook ordering**: `RenderInput` conditionally
   calls `useNodeConnections()` based on `isCurrentlyInsideReactFlow`. This is
   technically a violation of the Rules of Hooks (conditional hook call), but is
   safe because `isCurrentlyInsideReactFlow` is effectively constant for the
   lifetime of a mounted node.

5. **No custom input renderers**: The input rendering is hardcoded to
   string/number/boolean types. Custom input components for complex data types
   are not supported — they fall through to the `unsupportedDirectly` case.

## Examples

### Basic node with inputs and outputs

```tsx
<ConfigurableNode
  name='Data Processing Node'
  headerColor='#C44536'
  inputs={[
    {
      id: 'input1',
      name: 'Text Input',
      type: 'string',
      handleColor: '#00BFFF',
    },
    {
      id: 'input2',
      name: 'Numeric Input',
      type: 'number',
      handleColor: '#96CEB4',
    },
  ]}
  outputs={[
    {
      id: 'output1',
      name: 'Processed Text',
      type: 'string',
      handleColor: '#FECA57',
    },
    {
      id: 'output2',
      name: 'Processed Number',
      type: 'number',
      handleColor: '#FF9FF3',
    },
  ]}
/>
```

### Node with interactive inputs

```tsx
<ConfigurableNode
  name='Interactive Node'
  headerColor='#7B2CBF'
  inputs={[
    {
      id: 'input1',
      name: 'Text Input',
      type: 'string',
      handleColor: '#00BFFF',
      allowInput: true,
      value: 'Hello World',
      onChange: (value) => console.log(value),
    },
    {
      id: 'input2',
      name: 'Number Input',
      type: 'number',
      handleColor: '#96CEB4',
      allowInput: true,
      value: 42,
      onChange: (value) => console.log(value),
    },
  ]}
  outputs={[
    { id: 'output1', name: 'Result', type: 'string', handleColor: '#FF6B6B' },
  ]}
/>
```

### Node with collapsible panels

```tsx
<ConfigurableNode
  name='Advanced Node'
  headerColor='#2D5A87'
  inputs={[
    {
      id: 'input1',
      name: 'Primary Input',
      type: 'string',
      handleColor: '#00BFFF',
    },
    {
      id: 'panel1',
      name: 'Advanced Settings',
      inputs: [
        {
          id: 'p1_in1',
          name: 'Threshold',
          type: 'number',
          handleColor: '#96CEB4',
          allowInput: true,
        },
        {
          id: 'p1_in2',
          name: 'Config',
          type: 'string',
          handleColor: '#00FFFF',
          allowInput: true,
        },
      ],
    },
  ]}
  outputs={[
    { id: 'output1', name: 'Result', type: 'string', handleColor: '#FFD93D' },
  ]}
/>
```

### Registering as a ReactFlow node type

```tsx
import { ConfigurableNodeReactFlowWrapper } from 'react-blender-nodes';

const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};

<ReactFlow
  nodeTypes={nodeTypes}
  nodes={[
    {
      id: 'node1',
      type: 'configurableNode',
      position: { x: 100, y: 100 },
      data: {
        name: 'My Node',
        headerColor: '#C44536',
        inputs: [{ id: 'in1', name: 'Input', type: 'string' }],
        outputs: [{ id: 'out1', name: 'Output', type: 'string' }],
      },
    },
  ]}
/>;
```

## Relationships with Other Features

### -> [Handles](../core/handlesDoc.md)

ConfigurableNode uses `ContextAwareHandle` for all connection ports. Each
input/output handle is configured with a `HandleShape` from the 13 available
shapes defined in `ContextAwareHandleShapes.ts`. Handle shapes are visually
rendered inside transparent ReactFlow `<Handle>` elements, providing custom
visual appearance while maintaining ReactFlow's connection interaction behavior.

### -> [Data Types](../core/dataTypesDoc.md)

Each input and output optionally carries a `dataType` and `inferredDataType`
reference. These are used by the FullGraph layer for type-safe edge validation
(preventing incompatible connections). The `handleColor` and `handleShape` are
typically derived from the data type definitions at the FullGraph level.
ConfigurableNode itself does not perform type checking — it only renders the
visual properties.

### -> [Nodes](../core/nodesDoc.md)

ConfigurableNode is the visual representation of nodes defined in `typeOfNodes`.
The FullGraph system maps each node type's definition (inputs, outputs, header
color, name) to `ConfigurableNodeProps` stored as ReactFlow node `data`. The
`nodeTypeUniqueId` prop links back to the type definition.

### -> [State Management (UPDATE_INPUT_VALUE, OPEN_NODE_GROUP dispatch)](../core/stateManagementDoc.md)

Two state management dispatch paths exist:

1. **Input value changes** (`ContextAwareInput` -> `ReactFlowAwareInput`): When
   a user edits an inline input in ReactFlow mode, the value is updated via
   `reactflowContext.setNodes()` using
   `updateHandleInNodeDataMatchingHandleId()`. This updates the ReactFlow node
   data directly, keeping the visual state and graph state in sync.

2. **Node group navigation** (`ContextAwareOpenButton` ->
   `ReactFlowAwareOpenButton`): When a user clicks the open button on a node
   group, the `OPEN_NODE_GROUP` action is dispatched via
   `FullGraphContext.allProps.dispatch`. This navigates the FullGraph into the
   group's subtree.

### -> [Runner (visual state overlays)](../runner/runnerHookDoc.md)

The runner integration is layered:

1. `useNodeRunner` hook produces a `Map<nodeId, NodeRunnerState>` from execution
   state
2. This map is provided via `FullGraphContext.nodeRunnerStates`
3. `ConfigurableNodeReactFlowWrapper` reads the map and passes runner state as
   props
4. `ConfigurableNode` conditionally wraps its content with `NodeStatusIndicator`
5. `NodeStatusIndicator` renders CSS outline overlays and error/warning tooltip
   icons

This design avoids prop drilling and keeps the runner integration opt-in — nodes
without runner state render normally without any overhead.

### -> [FullGraph](fullGraphDoc.md)

ConfigurableNode is rendered exclusively within FullGraph's ReactFlow canvas (in
production use). FullGraph provides:

- `FullGraphContext` with `allProps` (state + dispatch) and `nodeRunnerStates`
- The `nodeTypes` registry that maps `'configurableNode'` to
  `ConfigurableNodeReactFlowWrapper`
- Edge connection validation and data type checking
- The node lifecycle (add, remove, move, resize)

### -> [ReactFlow](../external/reactFlowDoc.md)

ConfigurableNode integrates deeply with ReactFlow (@xyflow/react):

- `<Handle>` components for connection ports
- `useNodeConnections()` for connection state detection
- `useReactFlow()` and `useNodeId()` for node data updates
- `NodeResizeControl` for resize functionality
- `Node<Data, Type>` generic for type-safe node state
- `NodeProps` for the wrapper component interface
