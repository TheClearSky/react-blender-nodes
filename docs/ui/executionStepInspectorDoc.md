# ExecutionStepInspector

## Overview

ExecutionStepInspector is a molecule component that displays detailed
information about a single execution step from the node runner's execution
recording. It renders a 300px-wide side panel showing the step's node identity,
status, timing, resolved input values with per-connection source metadata,
computed output values with fan-out counts, error details (if the step errored),
and loop/group context metadata. The component returns `null` when no step
record is provided, making it safe to always render in the tree.

## Data Flow Diagram

```
ExecutionStepRecord
|
+-- nodeTypeName, nodeId, nodeTypeId
|   |
|   +---> [ HEADER SECTION ]
|         - Node type display name (title)
|         - Node instance ID (subtitle)
|         - Close button (X icon)
|         - Debug: nodeTypeId shown alongside
|
+-- status, duration, startTime, endTime
|   |
|   +---> [ STATUS + TIMING SECTION ]
|         - StatusBadge (completed | errored | skipped)
|         - Duration (ms, 2 decimal places)
|         - Start -> End time bar
|
+-- loopIteration, loopStructureId, groupNodeId, groupDepth
|   |
|   +---> [ METADATA SECTION ] (conditional)
|         - Loop iteration number
|         - Group node ID + depth
|
+-- inputValues: Map<handleName, RecordedInputHandleValue>
|   |
|   +---> [ INPUTS SECTION ]
|         Per handle:
|         +-- handleName, dataTypeId, isDefault
|         +-- connections[] ---> ConnectionLine per connection
|         |   +-- sourceNodeName / sourceHandleName
|         |   +-- sourceDataTypeId
|         |   +-- value (formatted)
|         |   +-- Debug: sourceNodeId, sourceHandleId
|         +-- defaultValue (when isDefault && no connections)
|
+-- outputValues: Map<handleName, RecordedOutputHandleValue>
|   |
|   +---> [ OUTPUTS SECTION ]
|         Per handle:
|         +-- handleName, dataTypeId
|         +-- targetCount badge (when > 1)
|         +-- value (formatted)
|
+-- error?: GraphError
    |
    +---> [ ERROR SECTION ] (conditional)
          - "Error" label
          - Formatted error message via formatGraphError()
```

## Props

| Prop                | Type                          | Default      | Description                                                                                                                       |
| ------------------- | ----------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `stepRecord`        | `ExecutionStepRecord \| null` | _(required)_ | The step record to inspect. Pass `null` to hide the inspector (renders nothing).                                                  |
| `onClose`           | `() => void`                  | _(required)_ | Callback invoked when the user clicks the close button.                                                                           |
| `hideComplexValues` | `boolean`                     | `false`      | When `true`, replaces complex values (objects, arrays, Maps, functions) with type summary strings like `Object(3)` or `Array(5)`. |
| `debugMode`         | `boolean`                     | `false`      | When `true`, shows raw node IDs and handle IDs alongside display names in the header and connection lines.                        |

## Rendering Sections

### Header (node name, status, timing)

The header is a gradient bar (`from-secondary-black to-primary-black`) with a
bottom border. It displays:

- **Node type name** (`stepRecord.nodeTypeName`) as the title, truncated with
  ellipsis if too long.
- **Node instance ID** (`stepRecord.nodeId`) as a monospace subtitle.
- **Close button** (Lucide `X` icon) positioned top-right.
- **Debug mode**: replaces the subtitle with `nodeId` and `nodeTypeId` in a
  smaller font.

Below the header, inside the scrollable content area:

- **StatusBadge** — a colored pill showing `Completed`, `Error`, or `Skipped`
  with status-specific background, text, and border colors.
- **Duration** — `stepRecord.duration` formatted to 2 decimal places with `ms`
  suffix.
- **Time range** — `startTime -> endTime` displayed in a dark pill with
  monospace tabular numerals and a blue arrow separator.

### Inputs (per-handle, per-connection values)

Rendered under an `--- Inputs ---` section header (centered label with
horizontal rules).

For each entry in `stepRecord.inputValues` (a
`Map<string, RecordedInputHandleValue>`):

- **Handle name** in white, **data type ID** in gray beside it.
- **Multiple connections badge**: when `connections.length > 1`, a blue pill
  shows `N conn`.
- **Default badge**: when `isDefault` is `true` and there are no connections, a
  gray pill shows `default`.

For each connection in the handle's `connections` array, a `ConnectionLine`
sub-component renders:

- **Source node name** (blue) `/` **source handle name** (gray).
- **Source data type ID** (smaller gray text).
- **Value** formatted by `formatValue()`.
- **Debug mode**: raw `sourceNodeId` and `sourceHandleId` on a separate line.

When `isDefault` is `true` and there are no connections, the `defaultValue` is
displayed directly. When neither connections nor default exist, "No value" is
shown in italic.

If the input map is empty, "No inputs" is shown in italic.

### Outputs (per-handle values)

Rendered under an `--- Outputs ---` section header.

For each entry in `stepRecord.outputValues` (a
`Map<string, RecordedOutputHandleValue>`):

- **Handle name** in white, **data type ID** in gray.
- **Target count badge**: when `targetCount > 1`, a blue pill shows `N targets`.
- **Value** formatted by `formatValue()`, indented below the handle name.

If the output map is empty, "No outputs" is shown in italic.

### Error Display

Rendered only when `stepRecord.error` is defined. Appears below the outputs
section, separated by a divider.

Displays in a red-tinted bordered container (`border-status-errored/30`,
`bg-status-errored/10`):

- **"Error"** label in uppercase red.
- **Error message** via `formatGraphError(stepRecord.error)`, rendered in
  monospace with `whitespace-pre-wrap` for multi-line messages.

The `GraphError` type includes `message`, `nodeId`, `nodeTypeId`,
`nodeTypeName`, `path` (execution path trace), optional `loopContext` and
`groupContext`, `timestamp`, `duration`, and `originalError`.

### Metadata (loop iteration, group depth)

Rendered conditionally when `stepRecord.loopIteration !== undefined` or
`stepRecord.groupNodeId` is defined. Appears between the timing section and the
inputs section.

- **Loop iteration**: "Loop iteration: N" where N is `stepRecord.loopIteration`.
- **Group**: "Group: {groupNodeId} (depth {groupDepth})" where depth is shown
  only if `groupDepth` is defined.

## Value Display

All values pass through the `formatValue(value, hideComplex)` function.

### Primitive values

| Type        | Display                                    |
| ----------- | ------------------------------------------ |
| `undefined` | `undefined`                                |
| `null`      | `null`                                     |
| `boolean`   | `true` or `false`                          |
| `number`    | String representation (e.g., `42`, `23.5`) |
| `string`    | Wrapped in double quotes (e.g., `"hello"`) |

### Complex values (hideComplexValues option)

When `hideComplexValues` is `false` (default), complex values are fully
expanded:

| Type       | Display                                                     |
| ---------- | ----------------------------------------------------------- |
| `Map`      | `Map { key1: value1, key2: value2 }` (recursive formatting) |
| `Array`    | `[value1, value2, value3]` (recursive formatting)           |
| `Object`   | `JSON.stringify(value, null, 2)` (pretty-printed JSON)      |
| `function` | Falls through to `String(value)`                            |

When `hideComplexValues` is `true`, the `typeSummary()` function replaces
complex values:

| Type       | Summary                               |
| ---------- | ------------------------------------- |
| `Map`      | `Map(N)` where N is `value.size`      |
| `Array`    | `Array(N)` where N is `value.length`  |
| `Object`   | `Object(N)` where N is number of keys |
| `function` | `function`                            |

The `isComplex()` check returns `true` for any value where `typeof` is
`'object'` (excluding `null`) or `'function'`.

## Limitations and Deprecated Patterns

- **No editing**: the inspector is read-only. Values cannot be modified.
- **No search/filter**: with many inputs or outputs, there is no search
  capability to find specific handles.
- **Flat value display**: deeply nested objects are shown as indented JSON but
  without collapsible tree views.
- **No direct navigation**: clicking a source node name in a connection line
  does not navigate to that node on the canvas.
- **Fixed width**: the panel is hardcoded to 300px (`w-[300px]`), not resizable.
- **Max scroll height**: content area is capped at 400px (`max-h-[400px]`) with
  vertical scrolling.

## Relationships with Other Features

### -> [Execution Recording (ExecutionStepRecord)](../runner/executionRecordingDoc.md)

The inspector consumes `ExecutionStepRecord` objects produced by the execution
recorder ([types.ts](src/utils/nodeRunner/types.ts)). Each record is a frozen
snapshot containing:

- `inputValues`: `Map<handleName, RecordedInputHandleValue>` — per-connection
  detail with source node/handle metadata.
- `outputValues`: `Map<handleName, RecordedOutputHandleValue>` — computed values
  with fan-out target counts.
- `error`: optional `GraphError` with full execution path trace, loop/group
  context, and the original thrown error.

The `RecordedInputConnection` type is a stripped-down version of
`InputConnectionValue` (used at runtime), removing `edgeId` and
`sourceNodeTypeId` while keeping display-relevant fields.

### -> [NodeRunnerPanel](nodeRunnerPanelDoc.md)

The `NodeRunnerPanel` organism hosts the inspector as a side panel. The panel
controls:

- **Which step** is shown via `RunSessionInteractionState.selectedStepIndex`,
  which indexes into `ExecutionRecord.steps`.
- **Whether the inspector is open** via
  `RunSessionInteractionState.inspectorOpen`.
- **Value display settings** via `NodeRunnerPanelSettings.hideComplexValues`.
- **Auto-inspect on error** via `NodeRunnerPanelSettings.autoInspectErrors` —
  automatically opens the inspector when a step errors.

### -> [ExecutionTimeline (step selection)](executionTimelineDoc.md)

The `ExecutionTimeline` molecule allows the user to select a step by clicking on
its bar in the timeline visualization. When a step is selected:

1. The timeline sets `selectedStepIndex` on the session's interaction state.
2. The panel reads the corresponding `ExecutionStepRecord` from
   `record.steps[selectedStepIndex]`.
3. The panel passes that record to `ExecutionStepInspector` as the `stepRecord`
   prop.

The inspector and timeline are decoupled — they communicate only through the
shared `RunSessionInteractionState` on the `RunSession` object.
