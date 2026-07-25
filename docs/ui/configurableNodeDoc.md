# ConfigurableNode

## Overview

ConfigurableNode is the core visual rendering component for nodes in the
react-blender-nodes library. Inspired by Blender's node editor, it renders a
fully configurable node with a colored header, input/output connection handles,
collapsible input panels, interactive inline input fields, header action icons
(loop/switch editors, node-type editor, group navigation), resizing controls,
and runner execution status overlays.

ConfigurableNode operates in two modes:

- **Standalone mode** (`isCurrentlyInsideReactFlow=false`): Renders as a static
  preview with absolutely-positioned handle indicators but no ReactFlow
  integration. Useful for Storybook, documentation, or thumbnails. Header action
  icons render without click handlers, and inline inputs call only their local
  `onChange`.
- **ReactFlow mode** (`isCurrentlyInsideReactFlow=true`): Renders with live
  ReactFlow `<Handle>` elements, node resizing controls, connection-aware input
  toggling, and context-based dispatch. Used inside `FullGraph` via
  `ConfigurableNodeReactFlowWrapper`.

The component uses `forwardRef` to expose its root `<div>` for external
measurement or focus management, and conditionally wraps its content with
`NodeStatusIndicator` when runner visual state is present.

**Source:** `src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNode`

**Public export:** All of the symbols below are re-exported from the package
root (`react-blender-nodes`) via `src/components/index.ts` ->
`src/components/organisms/index.ts` ->
`src/components/organisms/ConfigurableNode/index.ts`.

## Entity-Relationship Diagram

```
+----------------------------------+       +---------------------------+
|       ConfigurableNodeProps      |       |   ConfigurableNodeState   |
|----------------------------------|       |   (ReactFlow Node<Data>)  |
| id?: string                      |<------| Node<                     |
| name?: string                    | wraps |   Omit<ConfigurableNode-  |
| headerColor?: string             |       |     Props,                |
| inputs?: (Input | Panel)[]       |       |     'isCurrentlyInside-   |
| outputs?: Output[]               |       |      ReactFlow'>,         |
| isCurrentlyInsideReactFlow?      |       |   'configurableNode'      |
| nodeResizerProps?                |       | >                         |
| nodeTypeUniqueId?                |       +---------------------------+
| runnerVisualState?               |
| runnerErrors?                    |       +-----------------------------+
| runnerWarnings?                  |       | ConfigurableNodeInputPanel  |
| ...HTMLAttributes<HTMLDivElement>|       |-----------------------------|
+----------------------------------+       | id: string                  |
        |          |                       | name: string                |
        |          |                       | inputs: ConfigurableNode-   |
        v          v                       |   Input[]                   |
+----------------+  +------------------+   +-----------------------------+
| Configurable-  |  | Configurable-    |              |
| NodeInput      |  | NodeOutput       |              | contains
|----------------|  |------------------|              v
| id: string     |  | id: string       |   +----------------------+
| name: string   |  | name: string     |   | ConfigurableNodeInput|
| handleColor?   |  | handleColor?     |   |   (same type)        |
| handleShape?   |  | handleShape?     |   +----------------------+
| allowInput?    |  | maxConnections?  |
| maxConnections?|  | dataType?        |
| dataType?      |  | inferredDataType?|
| inferredDataType?| | type:           |
| type: 'string' | |  |  'string'       |
|   (+allowed-   |  |  | 'number'       |
|    Strings?)   |  |  | 'boolean'      |
|  | 'number'    |  |  | 'unsupported-  |
|  | 'boolean'   |  |     Directly'     |
|  | 'unsupported|  +------------------+
|     Directly'  |
| value?         |
| onChange?      |
+----------------+
```

## Functional Dependency Diagram

```
ConfigurableNode depends on:
+-----------------------------------------------------------------------+
|                                                                       |
|  ConfigurableNode (organisms/ConfigurableNode/)                       |
|  |                                                                    |
|  +-- ContextAwareHandle (SupportingSubcomponents/)                    |
|  |   +-- Handle (@xyflow/react)          [ReactFlow mode]             |
|  |   +-- renderHandleShape()             [13 shape variants]          |
|  |   +-- handleShapesMap                 (ContextAwareHandleShapes)   |
|  |   +-- useNodeConnections()            (@xyflow/react)              |
|  |                                                                    |
|  +-- ContextAwareInput (SupportingSubcomponents/)                     |
|  |   +-- ReactFlowAwareInput             [ReactFlow mode]             |
|  |   |   +-- useNodeId()                 (@xyflow/react)              |
|  |   |   +-- FullGraphContext            (FullGraph/FullGraphState)   |
|  |   |   +-- actionTypesMap.UPDATE_INPUT_VALUE  (mainReducer)         |
|  |   |   +-- useInputComponentRegistry() (FullGraph/)                 |
|  |   +-- Input (atoms/)                  [string type]                |
|  |   +-- Select (molecules/)             [string + allowedStrings]    |
|  |   +-- SliderNumberInput (molecules/)  [number type]                |
|  |   +-- Checkbox (atoms/)               [boolean type]               |
|  |   +-- custom component from registry  [unsupportedDirectly]        |
|  |                                                                    |
|  +-- ContextAwareNodeHeaderActions (SupportingSubcomponents/)         |
|  |   +-- FullGraphContext               (FullGraph/FullGraphState)    |
|  |   +-- LucideIcon (type only)         (renders action.icon)         |
|  |   +-- dispatches Action via allProps.dispatch                      |
|  |                                                                    |
|  +-- NodeResizerWithMoreControls (atoms/)                             |
|  |   +-- NodeResizeControl               (@xyflow/react)              |
|  |                                                                    |
|  +-- NodeStatusIndicator (atoms/)        [when runnerVisualState set] |
|  |   +-- useFloatingTooltip()            (hooks/)                     |
|  |   +-- FloatingArrow                   (@floating-ui/react)         |
|  |   +-- formatGraphError()              (nodeRunner/errors)          |
|  |                                                                    |
|  +-- FullGraphContext                    (FullGraph/FullGraphState)   |
|  +-- isLoopNode / isSwitchNode           (nodeStateManagement/nodes/) |
|  +-- actionTypesMap                      (mainReducer)                |
|  +-- Button (atoms/)                     [panel toggle]               |
|  +-- ChevronDownIcon / ChevronUpIcon     (lucide-react)              |
|  +-- Pencil / SquareMousePointerIcon     (lucide-react)              |
|  |     instantiated into headerActions[].icon                        |
|  +-- useNodeConnections()                (@xyflow/react)             |
|  +-- cn()                                (utils/)                     |
|                                                                       |
|  ConfigurableNodeReactFlowWrapper additionally depends on:            |
|  +-- RunnerContext                       (FullGraph/FullGraphState)   |
|  +-- ErrorBoundary                       (atoms/ErrorBoundary)        |
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
                    | Reads: RunnerContext               |
                    |   -> nodeRunnerStates.get(id)     |
                    | Wraps in <ErrorBoundary>           |
                    | Passes to ConfigurableNode:        |
                    |   isCurrentlyInsideReactFlow=true  |
                    |   id={id}, className='w-full'      |
                    |   {...data}                        |
                    |   runnerVisualState                |
                    |   runnerErrors / runnerWarnings    |
                    +----------------+------------------+
                                     |
                                     v
                    +-----------------------------------+
                    |        ConfigurableNode            |
                    |-----------------------------------|
                    | State: openPanels (Set<string>)    |
                    | Reads: FullGraphContext             |
                    |   -> state.enableDebugMode (id)    |
                    |   -> state.typeOfNodes[..].subtree |
                    | Computes: headerActions[]           |
                    +---+--------+--------+--------+----+
                        |        |        |        |
          +-------------+   +----+   +----+   +----+----------+
          |                 |        |        |                |
          v                 v        v        v                v
    +-----------+    +----------+ +------+ +--------+  +---------------+
    |  Header   |    | Render-  | |Render| |Render- |  | NodeStatus-   |
    | (color +  |    | Output   | |Input | |Input-  |  | Indicator     |
    |  name +   |    | (per     | |(per  | |Panel   |  | (wraps all    |
    |  debug id+|    | output)  | |input)| |(per    |  |  when runner  |
    |  header   |    +----+-----+ +--+---+ |panel)  |  |  visualState  |
    |  actions) |         |          |     +---+----+  |  defined)     |
    +-----------+         |          |         |       +---------------+
          |               v          v         v
   ContextAware-   ContextAware  ContextAware  Collapsible group
   NodeHeader-     Handle        Handle +      (Button toggle) with
   Actions         (source,      (target,      nested RenderInput
   (dispatch on    right)        left) +       items (hidden when
    click in RF)                 ContextAware-  panel closed)
                                 Input
                                 (if allowInput
                                  && !connected)
```

## System Diagram

```
+===========================================================================+
|                          react-blender-nodes                              |
|                                                                           |
|  +-- State Layer (useFullGraph / createGraphStore) -------------------+   |
|  |  State { dataTypes, typeOfNodes, nodes, edges, enableDebugMode, .. }|   |
|  |  dispatch(action) -> validateAction -> applyValidatedAction        |   |
|  +--------------------------------------------------------------------+   |
|       |                                                                   |
|       | provides via FullGraphContext (allProps = { state, dispatch })     |
|       v                                                                   |
|  +-- FullGraph (organism) --------------------------------------------+   |
|  |                                                                    |   |
|  |  ReactFlow canvas                                                  |   |
|  |    |                                                               |   |
|  |    +-- nodeTypes.configurableNode = ConfigurableNodeReactFlowWrappr|   |
|  |    |     |                                                         |   |
|  |    |     +-- ConfigurableNode  <<<<< THIS FEATURE >>>>>            |   |
|  |    |           |                                                   |   |
|  |    |           +-- ContextAwareHandle  (connection ports)          |   |
|  |    |           +-- ContextAwareInput   (inline editors)            |   |
|  |    |           +-- ContextAwareNodeHeaderActions (icon buttons)     |   |
|  |    |           +-- NodeResizerWithMoreControls (resize)            |   |
|  |    |           +-- NodeStatusIndicator (runner overlay)            |   |
|  |    |                                                               |   |
|  |    +-- edgeTypes / connection lines                                |   |
|  |    +-- ContextMenu (right-click)                                   |   |
|  |    +-- RunnerOverlay -> provides RunnerContext                     |   |
|  |    +-- InputComponentRegistryContext (custom inline inputs)        |   |
|  |                                                                    |   |
|  +--------------------------------------------------------------------+   |
|       |                                                                   |
|       | nodeRunnerStates via RunnerContext                                 |
|       |                                                                   |
|  +-- Runner Layer (useNodeRunner) ------------------------------------+   |
|  |  compiler -> ExecutionPlan -> executor -> ExecutionRecord          |   |
|  |  Produces: Map<nodeId, { visualState, errors, warnings }>         |   |
|  +--------------------------------------------------------------------+   |
|                                                                           |
+===========================================================================+
```

## ConfigurableNodeProps

`ConfigurableNodeProps` is generic over four parameters (all defaulting so the
component can be used untyped):

```ts
ConfigurableNodeProps<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex' ? z.ZodType : never = never,
  DataTypeUniqueId extends string = string,
>
```

| Prop                                | Type                                                       | Default     | Description                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                | `string?`                                                  | `undefined` | Node instance ID. Rendered in the header when `enableDebugMode` is true in `FullGraphContext`. Also used as the `nodeId` payload of header actions.                  |
| `name`                              | `string?`                                                  | `'Node'`    | Display name rendered in the header bar (truncated).                                                                                                                 |
| `headerColor`                       | `string?`                                                  | `'#79461D'` | CSS background color for the header bar.                                                                                                                             |
| `inputs`                            | `(ConfigurableNodeInput \| ConfigurableNodeInputPanel)[]?` | `[]`        | Array of input definitions and/or input panel definitions. Panels are distinguished at runtime by the presence of an `inputs` property (`'inputs' in input`).        |
| `outputs`                           | `ConfigurableNodeOutput[]?`                                | `[]`        | Array of output handle definitions.                                                                                                                                  |
| `isCurrentlyInsideReactFlow`        | `boolean?`                                                 | `false`     | Whether the node is rendered inside a ReactFlow context. Controls handle rendering mode, enables the resizer, and switches inputs/header actions into dispatch mode. |
| `nodeResizerProps`                  | `NodeResizerWithMoreControlsProps?`                        | `{}`        | Props forwarded to `NodeResizerWithMoreControls`. Only rendered when `isCurrentlyInsideReactFlow` is true.                                                           |
| `nodeTypeUniqueId`                  | `NodeTypeUniqueId?`                                        | `undefined` | The node type's unique identifier. Used to detect loop/switch nodes and node-group subtrees, which drive the header action icons.                                    |
| `runnerVisualState`                 | `NodeVisualState?`                                         | `undefined` | Runner execution visual state. When defined, the node content is wrapped with `NodeStatusIndicator`.                                                                 |
| `runnerErrors`                      | `ReadonlyArray<GraphError>?`                               | `undefined` | Errors from the runner for this node. Shown as a tooltip on the error icon overlay.                                                                                  |
| `runnerWarnings`                    | `ReadonlyArray<string>?`                                   | `undefined` | Warning messages from the runner. Shown as a tooltip on the warning icon overlay.                                                                                    |
| `customName`                        | `string?`                                                  | `undefined` | User-assigned instance name (standard nodes). When set, the header shows `Custom : Type`; also threaded into runner timeline / step records.                         |
| `previewCollapsed`                  | `boolean?`                                                 | `undefined` | Whether this instance's `nodePreviews` panel is collapsed (absent = expanded). Toggled by the eye header action; persisted on `node.data`, undoable.                 |
| `...HTMLAttributes<HTMLDivElement>` | —                                                          | —           | All standard div attributes (`className`, `style`, `onClick`, etc.) are spread onto the root element.                                                                |

> **Removed prop:** Earlier versions had a `showNodeOpenButton?: boolean` prop
> that toggled a single "open group" button. This prop no longer exists. Header
> action icons are now derived automatically from `nodeTypeUniqueId` plus the
> node-type definition in `FullGraphContext` (see
> [Header Actions](#header-actions-contextawarenodeheaderactions)).

## Type Definitions

### ConfigurableNodeInput

Defines an input socket on a node with an optional interactive input component.
Generic over `UnderlyingType`, `ComplexSchemaType`, and `DataTypeUniqueId`.

```
ConfigurableNodeInput {
  id: string                    // Unique handle identifier
  name: string                  // Display label
  handleColor?: string          // Handle visual color (default '#A1A1A1')
  handleShape?: HandleShape     // One of 13 shape variants (default 'circle')
  allowInput?: boolean          // Show inline editor when unconnected
  maxConnections?: number       // Connection limit (undefined = unlimited)
  dataType?: {                  // Data type for FullGraph type checking
    dataTypeObject: DataType<UnderlyingType, ComplexSchemaType>
    dataTypeUniqueId: DataTypeUniqueId
  }
  inferredDataType?: {          // Inferred type (inferredFromConnection)
    dataTypeObject: DataType<UnderlyingType, ComplexSchemaType>
    dataTypeUniqueId: DataTypeUniqueId
  } | null

  // Discriminated union on `type`:
  type: 'string'   value?: string   onChange?: (v: string) => void
                   allowedStrings?: readonly string[]   // -> Select dropdown
     | 'number'    value?: number   onChange?: (v: number) => void
     | 'boolean'   value?: boolean  onChange?: (v: boolean) => void
     | 'unsupportedDirectly'  value?: unknown  onChange?: (v: unknown) => void
}
```

The `'string'` branch carries an optional `allowedStrings: readonly string[]`.
When present and non-empty, the inline editor renders a `<Select>` dropdown
(with an "unsupported"/deselect option) instead of a free-text `<Input>`.

### ConfigurableNodeOutput

Defines an output socket on a node. Same generic parameters as
`ConfigurableNodeInput`, but without `allowInput`, `value`, `onChange`, or
`allowedStrings` (outputs are never edited inline).

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
  id: string                       // Unique panel identifier
  name: string                     // Panel header label
  inputs: ConfigurableNodeInput[]  // Inputs contained in this panel
}
```

### ConfigurableNodeState (ReactFlow state)

The ReactFlow node type used when ConfigurableNode is registered as a node type.
Defined in
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx`
› `ConfigurableNodeState`.

```ts
type ConfigurableNodeState<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = Node<
  Omit<
    ConfigurableNodeProps<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >,
    'isCurrentlyInsideReactFlow'
  >,
  'configurableNode'
>;
```

This is a standard ReactFlow `Node` where:

- `data` contains all `ConfigurableNodeProps` except
  `isCurrentlyInsideReactFlow` (the wrapper always sets it to `true` inside
  ReactFlow).
- `type` is the literal `'configurableNode'`.

## Rendering Structure

The ConfigurableNode renders the following DOM structure (see
`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNode`, the `nodeContent` element):

```
<div tabIndex=0>  (root: flex-col, rounded-md, w-max, border highlight on
  |                focus and on .selected ancestor)
  |
  +-- <div> HEADER (headerColor background, rounded-t-md, flex justify-between)
  |   +-- <p> name (truncated)
  |   +-- <p> id           (only if state.enableDebugMode)
  |   +-- <div> ml-auto
  |       +-- <ContextAwareNodeHeaderActions actions={headerActions} />
  |
  +-- <div> BODY (bg-primary-dark-gray, min-h-[50px], rounded-b-md)
      |
      +-- <NodeResizerWithMoreControls> (only if isCurrentlyInsideReactFlow)
      |
      +-- <div> OUTPUTS section (flex-col, py-4)
      |   +-- <RenderOutput> for each output
      |       +-- output.name (right-aligned, truncated; '​' if empty)
      |       +-- <ContextAwareHandle type="source" position={Position.Right}>
      |
      +-- <div> INPUTS section (flex-col, py-4)
          +-- For each input item:
              |
              +-- IF 'inputs' in input -> <RenderInputPanel>
              |   +-- <Button> toggle (ChevronUp/Down + panel.name)
              |   +-- <div> collapsible content (bg-[#272727];
              |   |        h-0 overflow-hidden when closed)
              |   +-- <RenderInput hide={!isOpen}> for each panel input
              |
              +-- ELSE -> <RenderInput>
                  +-- <ContextAwareHandle type="target" position={Position.Left}>
                  +-- IF allowInput && !isConnected:
                  |   +-- <ContextAwareInput>  (Input / Select /
                  |                              SliderNumberInput / Checkbox /
                  |                              registry component)
                  +-- ELSE:
                      +-- input.name (truncated; '​' if empty)

// When runnerVisualState !== undefined, the entire nodeContent above
// is wrapped in:
<NodeStatusIndicator visualState={...} errors={...} warnings={...}>
  {nodeContent}
</NodeStatusIndicator>
```

### Header (name, color, debug id, action icons)

The header is a colored bar (`headerColor` background, `rounded-t-md`) with:

- The node title, rendered by
  `src/components/organisms/ConfigurableNode/SupportingSubcomponents/EditableNodeTitle.tsx`
  › `EditableNodeTitle`. By default it shows the type-derived `name`
  (truncated). A node may carry an optional per-instance **custom name**
  (`customName`); when set, the title shows `Custom : Type` with the type name
  dimmed (`src/components/atoms/NodeIdentityLabel/NodeIdentityLabel.tsx` ›
  `NodeIdentityLabel`), the custom name ellipsizing first under overflow and the
  type name protected. For STANDARD nodes inside ReactFlow, double-clicking the
  title edits the custom name in place (commit on blur/Enter, Escape cancels,
  empty clears), dispatching `UPDATE_NODE_CUSTOM_NAME`. System nodes (graph &
  group I/O, loops, switches, groups) are NOT nameable (validator NOOP + display
  gate). The same `customName` is threaded into the runner timeline / step
  inspector and emitted as a `// node "Custom" : "Type"` codegen comment
  (identifiers stay type-derived). A custom name on a standard node **inside a
  referenced node group** is stored on the shared group definition, so it is
  shared across every instance of that group (the same per-definition semantics
  as input values). See the
  [State Management doc](../core/stateManagementDoc.md).
- The node `id` displayed when `state.enableDebugMode` is true in
  `FullGraphContext`.
- A right-aligned (`ml-auto`) cluster rendering `ContextAwareNodeHeaderActions`
  for the computed `headerActions` array.

### Node Preview Panel (NodePreviewPanel)

When a preview component is registered for this node's type via the FullGraph
`nodePreviews` prop, a `NodePreviewPanel`
(`src/components/organisms/ConfigurableNode/SupportingSubcomponents/NodePreviewPanel.tsx`
› `NodePreviewPanel`) renders ON TOP of the node — outside the node container
and outside the runner status border, width-matched to the node — fed the node's
live / at-step runner values. Because the panel is the wrapper's first child,
`node.position` anchors the PANEL's top edge (the node body sits below it, and
toggling the preview shifts the body vertically; handles/edges stay correct as
they are DOM-measured). It self-hides when no preview is registered, when
`data.previewCollapsed` is set, or when there is no `nodeId`, so it is safe to
mount unconditionally. A header eye action toggles the persisted
`previewCollapsed` flag. See [Node Previews](nodePreviewDoc.md) for the full
contract.

### Outputs section

Outputs are rendered **before** inputs in the DOM. Each output renders a
`RenderOutput`: a right-justified row with the (truncated, right-aligned)
`output.name` and a `ContextAwareHandle` with `type='source'` and
`position={Position.Right}`, absolutely positioned on the right edge. An empty
name renders a zero-width space (`'​'`) so the row keeps its height.

### Inputs section

Each non-panel input renders a `RenderInput` row containing a
`ContextAwareHandle` with `type='target'` and `position={Position.Left}`
(absolutely positioned on the left edge), followed by either the input label or
an inline editor.

Connection detection: inside ReactFlow, `RenderInput` calls
`useNodeConnections({ handleId: input.id })` and computes
`isConnected = connections.some(c => c.targetHandle === input.id)`. The inline
editor is shown only when `input.allowInput && !isConnected`
(`shouldShowInput`). When `shouldShowInput` is true the row uses tighter
vertical padding (`py-1`).

Fan-in reorder control: when an input handle has 2+ incoming connections, the
row also renders
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/InputConnectionOrderControl.tsx`
› `InputConnectionOrderControl` — a compact trigger (an ordered-list icon + the
connection count) that opens an `atoms/Popover` containing a drag-to-reorder
`DragList` of the connections. Reordering dispatches
`REORDER_INPUT_CONNECTIONS`, persisting each edge's `data.order` so the runner /
codegen consume the fan-in in that order (see
[Edges › Connection ordering](../core/edgesDoc.md#connection-ordering-fan-in)).
The control is themeable via the `node.inputOrderBadge` slot, self-hides for
single-connection handles, and renders only inside ReactFlow.

The popover itself shows: a **1-based position number** per row (the live order
index, recomputed as items are dragged), the **target input handle's name** in
the header (`Order connections into "<name>"`), and a per-row **color chip** —
the source handle's `handleColor` — beside each connection label.

### Input Panels (collapsible groups)

Panels are detected by `'inputs' in input`. Each panel (`RenderInputPanel`)
renders:

- A `Button` header (transparent, hover `bg-primary-gray`) with a chevron icon
  (`ChevronUpIcon` when open, `ChevronDownIcon` when closed) and the panel name.
  The click handler calls `e.stopPropagation()` and `e.preventDefault()` before
  toggling.
- A collapsible `<div>` with `bg-[#272727]`. When closed it gets
  `h-0 overflow-hidden`; its child `RenderInput` rows receive `hide={!isOpen}`
  (which adds `h-0 overflow-hidden py-0`). The inputs stay mounted — only their
  height collapses.
- Panel open/close state lives in `openPanels: Set<string>` in component state,
  toggled by `togglePanel(panelId)`. All panels start closed.

### Direct Inputs (ContextAwareInput)

When an input has `allowInput=true` AND is not connected, the label is replaced
with an interactive input component chosen by `input.type`:

- `'string'` with non-empty `allowedStrings` -> `<Select>` dropdown.
- `'string'` otherwise -> `<Input>` text field (placeholder = input name,
  `allowOnlyNumbers={false}`).
- `'number'` -> `<SliderNumberInput>` (slider + numeric field combo).
- `'boolean'` -> `<Checkbox>` with the input name as a label.
- `'unsupportedDirectly'` with a `dataType` -> a custom component looked up in
  the `InputComponentRegistry` by `dataType.dataTypeUniqueId`, if one is
  registered; otherwise `null`.

### Header Actions (ContextAwareNodeHeaderActions)

`ConfigurableNode` computes a `headerActions: NodeHeaderActionDefinition[]`
array each render, based on `nodeTypeUniqueId` and the node-type definition read
from `FullGraphContext`:

- `isLoopNode(nodeTypeUniqueId)` -> adds an **edit-loop** action (Pencil icon)
  that dispatches `OPEN_DRAWER` with
  `activeDrawer: { type: 'editLoop', nodeId }`.
- `isSwitchNode(nodeTypeUniqueId)` -> adds an **edit-switch** action (Pencil
  icon) dispatching `OPEN_DRAWER` with
  `activeDrawer: { type: 'editSwitch', nodeId }`.
- `hasSubtree` (the node type has a `subtree`, i.e. it is a node group) -> adds
  two actions:
  - **edit-node-type** (Pencil) dispatching `OPEN_DRAWER` with
    `activeDrawer: { type: 'editNodeType', nodeTypeId: nodeTypeUniqueId }`.
  - **open-node-group** (`SquareMousePointerIcon`) dispatching `OPEN_NODE_GROUP`
    with `{ nodeId }`, to navigate into the group's subtree.

`hasSubtree` is computed as
`!!nodeTypeUniqueId && !!fullGraphContext?.allProps?.state?.typeOfNodes?.[nodeTypeUniqueId]?.subtree`.

### Resizer (NodeResizerWithMoreControls)

Only rendered when `isCurrentlyInsideReactFlow=true`. Provides customizable
resize controls built on `@xyflow/react`'s `NodeResizeControl`. Notable defaults
from
`src/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls.tsx`
› `NodeResizerWithMoreControls`:

- `linePosition = ['left', 'right']`, `handlePosition = []` (line-variant
  controls on the left/right edges only by default).
- `resizeDirection = 'horizontal'` (horizontal-only resizing).
- `minWidth = 10`, `minHeight = 10`, `maxWidth = maxHeight = Number.MAX_VALUE`.
- `isVisible = true` (returns `null` when false), `autoScale = true`,
  `keepAspectRatio = false`.
- Forwards `onResizeStart`, `onResize`, `onResizeEnd`, `shouldResize`, `color`,
  and class/style overrides for lines and handles.

### Status Indicator (NodeStatusIndicator)

When `runnerVisualState !== undefined`, the entire node content is wrapped in
`NodeStatusIndicator`, which renders a layout-neutral CSS `outline` overlay,
state-specific glow/dimming, and error/warning tooltip icons. See the
[Runner Visual State Integration](#runner-visual-state-integration) section and
[`nodeStatusIndicatorDoc.md`](nodeStatusIndicatorDoc.md).

## Supporting Subcomponents

Barrel:
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/index.ts`
re-exports (via `export *`) `ContextAwareHandle`, `ContextAwareInput`,
`ContextAwareNodeHeaderActions`, `ConfigurableNodeReactFlowWrapper`, and — from
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareHandleShapes.ts`
— the `handleShapesMap` value and the `HandleShape` type. (There is no symbol
literally named `ContextAwareHandleShapes`; that is the module/file name.)

### ContextAwareHandle

**File:**
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareHandle.tsx`
› `ContextAwareHandle`

Renders a connection handle (port) for inputs or outputs with support for 13
custom shapes. Operates in two modes:

**ReactFlow mode** (`isCurrentlyInsideReactFlow=true`):

- Renders a ReactFlow `<Handle>`
  (`!w-6 !h-6 !border-none !bg-transparent !pointer-events-auto`) with a
  transparent background.
- The actual shape is rendered inside the Handle in a `pointer-events-none`
  overlay via the shared `HandleShapeSwatch` atom (which wraps the internal
  `renderHandleShape`); the same atom is reused, scaled down, by the config
  editors.
- Uses `useNodeConnections({ handleId: id, handleType: type })` to count
  connections. When `maxConnections` is defined,
  `canConnect = connections.length < maxConnections` and is passed to
  `isConnectable`, `isConnectableStart`, and `isConnectableEnd`. When
  `maxConnections` is undefined, those flags are left `undefined` (ReactFlow's
  default — connectable).

**Standalone mode** (`isCurrentlyInsideReactFlow=false`):

- Renders an absolutely positioned `<div>` with the shape, offset half its width
  off the left edge (`Position.Left`) or right edge (`Position.Right`) and
  vertically centered.

**Available shapes (13):** `circle`, `square`, `rectangle`, `list`, `grid`,
`diamond`, `trapezium`, `hexagon`, `star`, `cross`, `zigzag`, `sparkle`,
`parallelogram`. Defined in
`src/components/atoms/HandleShapeSwatch/handleShapes.ts` › `handleShapes` (a
`readonly` tuple), exposed via `handleShapesMap` and the `HandleShape` type.
Default color is `#A1A1A1`; default shape is `circle`.

Shapes are implemented via:

- CSS `border-radius` (circle) and `rotate-45` (diamond).
- CSS `clip-path` polygons through `createBorderedClipPath` (trapezium, hexagon,
  star, parallelogram) — a 2px black border layer behind a colored shape layer.
- CSS `mask` (zigzag, sparkle).
- Nested `<div>` rows/grids (list, grid, cross).

### ContextAwareInput

**File:**
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareInput.tsx`
› `ContextAwareInput`

Chooses the appropriate inline editor based on `input.type`. Exports both
`ContextAwareInput` and the internal `ReactFlowAwareInput`.

**ReactFlow mode:** Delegates to `ReactFlowAwareInput`, which:

- Reads `nodeId` via `useNodeId()` and `allProps` via
  `useContext(FullGraphContext)`.
- On every value change, calls the input's local `onChange` (if provided)
  **and** dispatches `UPDATE_INPUT_VALUE` through `allProps.dispatch`:
  ```ts
  allProps.dispatch({
    type: actionTypesMap.UPDATE_INPUT_VALUE,
    payload: { nodeId, inputId: input.id, value: newValue as string | number },
  });
  ```
  This keeps the local callback and the canonical graph state in sync. (Note:
  this is the current mechanism — earlier versions mutated ReactFlow node data
  directly via `setNodes()` + `updateHandleInNodeDataMatchingHandleId()`. That
  is no longer how inline edits propagate.)

**Standalone mode:** Renders the same component tree but only invokes the local
`onChange` — there is no dispatch and no ReactFlow node id.

**Supported input types:**

| `type`                | Component (no `allowedStrings`) | Component (with `allowedStrings`)  | Notes                                                                                                |
| --------------------- | ------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `string`              | `<Input>`                       | `<Select>` (`StringSelectForNode`) | Placeholder / value label = input name; Select offers deselect + "unsupported".                      |
| `number`              | `<SliderNumberInput>`           | n/a                                | Slider + number-field combo.                                                                         |
| `boolean`             | `<Checkbox>` + label            | n/a                                | `'indeterminate'` checkbox states are ignored.                                                       |
| `unsupportedDirectly` | registry component or `null`    | n/a                                | Renders `inputComponentRegistry[input.dataType.dataTypeUniqueId]` when registered; otherwise `null`. |

Custom components for `unsupportedDirectly` are resolved through
`useInputComponentRegistry()`
(`src/components/organisms/FullGraph/InputComponentRegistryContext.ts` ›
`useInputComponentRegistry`). A registered component receives
`{ value, onChange, name, dataTypeId }`.

### ContextAwareNodeHeaderActions

**File:**
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareNodeHeaderActions.tsx`
› `ContextAwareNodeHeaderActions`

Renders a row of clickable Lucide icons for header actions. Returns `null` when
`actions` is empty.

```ts
type NodeHeaderActionDefinition = {
  id: string;
  icon: LucideIcon;
  iconClassName?: string;
  action: Action; // a mainReducer Action object
};

type ContextAwareNodeHeaderActionsProps = {
  actions: NodeHeaderActionDefinition[];
  isCurrentlyInsideReactFlow: boolean;
};
```

For each action it renders the icon (`strokeWidth={2.5}`, default class
`shrink-0 w-6 h-6 aspect-square cursor-pointer hover:opacity-80`, overridable
via `iconClassName`). In **ReactFlow mode** the icon's `onClick` dispatches
`actionDef.action` via `fullGraphContext?.allProps?.dispatch`. In **standalone
mode** the `onClick` is `undefined`, so icons are inert.

> This component **replaces** the former `ContextAwareOpenButton`. The "open
> node group" behavior is now just one entry (`open-node-group`) in the actions
> array.

### ConfigurableNodeReactFlowWrapper

**File:**
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx`
› `ConfigurableNodeReactFlowWrapper`

The bridge between ReactFlow's node-type system and `ConfigurableNode`.
Registered as `nodeTypes.configurableNode` in FullGraph.

Its props type, `ConfigurableNodeReactFlowWrapperProps`, is
`NodeProps<ConfigurableNodeState> & { position: XYPosition }`. The component
itself is declared with `forwardRef<HTMLDivElement, Omit<…Props, 'position'>>`
and destructures `{ data = {}, id }`.

**Responsibilities:**

1. Reads `RunnerContext` and looks up `runnerContext?.nodeRunnerStates?.get(id)`
   for this node's runner state.
2. Wraps the node in an `<ErrorBoundary>` (`atoms/ErrorBoundary`):
   - `resetKey={JSON.stringify(data)}` so the boundary resets when node data
     changes.
   - A fallback "Render Error" card (red-bordered,
     `data-slot='error-boundary-node'`) showing an `AlertTriangle` icon beside
     the "Render Error" label, the node name, the error message, and a "Retry"
     button.
   - `onError` logs `[ConfigurableNode:<id>] Render error:` to the console.
3. Renders `<ConfigurableNode>` with:
   - `isCurrentlyInsideReactFlow={true}`
   - `id={id}`
   - `className='w-full'` (so the node fills its ReactFlow container width)
   - `{...data}` spread (this comes after `className`, so a `className` inside
     `data` would override `'w-full'`)
   - `runnerVisualState={nodeRunnerState?.visualState}`,
     `runnerErrors={nodeRunnerState?.errors}`,
     `runnerWarnings={nodeRunnerState?.warnings}`
   - the forwarded `ref`.

## Runner Visual State Integration

Per-node runner state is provided through **`RunnerContext`** (not
`FullGraphContext`). `RunnerContext` is defined in
`src/components/organisms/FullGraph/FullGraphState.ts` › `RunnerContext` and
carries:

```ts
type RunnerContextValue = {
  nodeRunnerStates: ReadonlyMap<string, NodeRunnerState>;
  selectedStepRecord: ExecutionStepRecord | null;
  edgeValuesAnimated: boolean;
};

type NodeRunnerState = {
  visualState: NodeVisualState; // 'idle' | 'running' | 'completed'
  // | 'errored' | 'skipped' | 'warning'
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};
```

**Data flow:**

```
useNodeRunner (hook)
  |
  | produces per-node visual state, errors, warnings
  v
RunnerContext.nodeRunnerStates  (ReadonlyMap<string, NodeRunnerState>)
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

`NodeVisualState` is the literal union
`'idle' | 'running' | 'completed' | 'errored' | 'skipped' | 'warning'`
(`src/utils/nodeRunner/types.ts` › `NodeVisualState`).

**NodeStatusIndicator visual mapping:**

| NodeVisualState | Outline                            | Glow / Extra                   | Icon                          |
| --------------- | ---------------------------------- | ------------------------------ | ----------------------------- |
| `idle`          | 5px solid transparent              | none                           | none                          |
| `running`       | 5px dashed `--primary-blue`        | `running-glow` 2s animation    | none                          |
| `completed`     | 5px solid `--status-completed`     | green box-shadow               | none                          |
| `errored`       | 5px solid `--status-errored`       | red box-shadow                 | `AlertCircleIcon` (#FF4444)   |
| `skipped`       | 5px dashed `--secondary-dark-gray` | opacity 50% + black/30 overlay | none                          |
| `warning`       | 5px solid `--status-warning`       | orange box-shadow              | `AlertTriangleIcon` (#FFA500) |

The outline overlay div is always mounted (even at `idle`) so transitions are
smooth when scrubbing the timeline. Error/warning icons sit at the top-right
(`absolute top-1 right-1`) and show a `@floating-ui/react` tooltip on hover —
errors are formatted via `formatGraphError()` and joined with `\n\n`; warnings
are joined with `\n`.

## Limitations and Deprecated Patterns

1. **No vertical handles**: Handles only use `Position.Left` (inputs) and
   `Position.Right` (outputs). Top/bottom positions are not part of
   ConfigurableNode's layout.

2. **`unsupportedDirectly` requires a `dataType` + registered component**: An
   `unsupportedDirectly` input only renders an editor when it has a `dataType`
   and a matching component is registered in the `InputComponentRegistry`.
   Without a registered component (or without a `dataType`), `ContextAwareInput`
   returns `null`.

3. **Panel state is local**: `openPanels` is local component state. It is not
   persisted across unmounts (e.g. navigating between group levels) and is not
   part of the serializable graph state.

4. **Connection detection relies on hook ordering**: `RenderInput` and
   `ContextAwareHandle` conditionally call `useNodeConnections()` based on
   `isCurrentlyInsideReactFlow`. This is technically a Rules-of-Hooks violation
   (conditional hook call), but is safe because `isCurrentlyInsideReactFlow` is
   effectively constant for a mounted node's lifetime.

5. **Inline editors persist to graph state via dispatch**: In ReactFlow mode,
   inline edits dispatch `UPDATE_INPUT_VALUE`. The older direct-mutation path
   (`setNodes()` + `updateHandleInNodeDataMatchingHandleId()`) is no longer used
   by `ContextAwareInput` (that helper now lives only in
   `src/utils/nodeStateManagement/handles/handleSetters.ts` ›
   `updateHandleInNodeDataMatchingHandleId`).

6. **`data.className` can override `'w-full'`**: The wrapper spreads `{...data}`
   after `className='w-full'`, so a `className` stored in node `data` wins.

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

### Node with interactive inputs (text, number, boolean, dropdown)

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
    {
      id: 'input3',
      name: 'Enabled',
      type: 'boolean',
      allowInput: true,
      value: true,
      onChange: (value) => console.log(value),
    },
    {
      id: 'input4',
      name: 'Mode',
      type: 'string',
      allowInput: true,
      allowedStrings: ['fast', 'balanced', 'precise'],
      value: 'balanced',
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
          handleShape: 'diamond',
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
        inputs: [
          { id: 'in1', name: 'Input', type: 'string', allowInput: true },
        ],
        outputs: [{ id: 'out1', name: 'Output', type: 'string' }],
      },
    },
  ]}
/>;
```

> In practice you rarely register this wrapper by hand — `FullGraph` wires
> `nodeTypes.configurableNode = ConfigurableNodeReactFlowWrapper` for you and
> derives each node's `data` from `typeOfNodes`. Use the manual registration
> above only when embedding the node in your own ReactFlow canvas.

## Relationships with Other Features

### -> [Handles](../core/handlesDoc.md)

ConfigurableNode uses `ContextAwareHandle` for all connection ports. Each
input/output handle is configured with a `HandleShape` from the 13 shapes in
`src/components/atoms/HandleShapeSwatch/handleShapes.ts` › `handleShapes`.
Handle shapes are rendered inside transparent ReactFlow `<Handle>` elements,
providing custom visual appearance while keeping ReactFlow's connection
interaction behavior. Connection capacity is enforced via `maxConnections` +
`useNodeConnections()`.

### -> [Data Types](../core/dataTypesDoc.md)

Each input and output optionally carries a `dataType` and `inferredDataType`
reference. These are used by the FullGraph layer for type-safe edge validation.
`handleColor` and `handleShape` are typically derived from the data type
definitions at the FullGraph level. The `dataType.dataTypeUniqueId` also keys
the `InputComponentRegistry` lookup for `unsupportedDirectly` inline editors.
ConfigurableNode itself performs no type checking — it only renders the visual
properties and the registered editor.

### -> [Nodes](../core/nodesDoc.md)

ConfigurableNode is the visual representation of nodes defined in `typeOfNodes`.
FullGraph maps each node type's definition (inputs, outputs, header color, name,
optional `subtree`) to `ConfigurableNodeProps` stored as ReactFlow node `data`.
The `nodeTypeUniqueId` prop links back to the type definition and drives the
loop/switch/group header actions.

### -> [State Management (UPDATE_INPUT_VALUE, OPEN_DRAWER, OPEN_NODE_GROUP)](../core/stateManagementDoc.md)

Two dispatch paths flow out of ConfigurableNode (both via
`FullGraphContext.allProps.dispatch`):

1. **Inline input edits** (`ContextAwareInput` -> `ReactFlowAwareInput`):
   dispatch `UPDATE_INPUT_VALUE` with `{ nodeId, inputId, value }`. The reducer
   updates the canonical node data so visual state and graph state stay in sync.

2. **Header actions** (`ContextAwareNodeHeaderActions`): dispatch the action
   object attached to each header icon:
   - `OPEN_DRAWER` with
     `activeDrawer: { type: 'editLoop' | 'editSwitch', nodeId }` or
     `{ type: 'editNodeType', nodeTypeId }`.
   - `OPEN_NODE_GROUP` with `{ nodeId }` to navigate into a node group's
     subtree.

The relevant action constants live in
`src/utils/nodeStateManagement/mainReducer.ts` › `actionTypesMap`, and the
`ActiveDrawer` union (`editLoop` | `editNodeType` | `editSwitch`) is defined in
`src/utils/nodeStateManagement/types.ts` › `ActiveDrawer`.

### -> [Runner (visual state overlays)](../runner/runnerHookDoc.md)

The runner integration is layered:

1. `useNodeRunner` produces per-node visual state, errors, and warnings.
2. These are exposed via `RunnerContext.nodeRunnerStates`
   (`ReadonlyMap<string, NodeRunnerState>`).
3. `ConfigurableNodeReactFlowWrapper` reads the map and passes the per-node
   runner state as props.
4. `ConfigurableNode` conditionally wraps its content in `NodeStatusIndicator`
   when `runnerVisualState !== undefined`.
5. `NodeStatusIndicator` renders the CSS outline overlay and error/warning
   tooltip icons.

This keeps the runner integration opt-in — nodes without runner state render
normally without overhead.

### -> [NodeStatusIndicator](nodeStatusIndicatorDoc.md)

The status overlay atom that ConfigurableNode wraps its content with. See that
doc for the full visual-state table, tooltip behavior, and CSS details.

### -> [FullGraph](fullGraphDoc.md)

ConfigurableNode is rendered exclusively within FullGraph's ReactFlow canvas (in
production use). FullGraph provides:

- `FullGraphContext` with `allProps` (`{ state, dispatch }`), used for
  `enableDebugMode`, subtree detection, inline-edit dispatch, and header
  actions.
- `RunnerContext` (via the runner overlay) with `nodeRunnerStates`.
- `InputComponentRegistryContext` for custom inline editors.
- The `nodeTypes` registry mapping `'configurableNode'` to
  `ConfigurableNodeReactFlowWrapper`.
- Edge connection validation, data-type checking, and the node lifecycle.

### -> [ReactFlow](../external/reactFlowDoc.md)

ConfigurableNode integrates deeply with ReactFlow (`@xyflow/react`):

- `<Handle>` components for connection ports.
- `useNodeConnections()` for connection-state detection and capacity limits.
- `useNodeId()` for resolving the current node id during inline edits.
- `NodeResizeControl` (via `NodeResizerWithMoreControls`) for resizing.
- `Node<Data, Type>` generic for type-safe node state.
- `NodeProps` for the wrapper component interface.
