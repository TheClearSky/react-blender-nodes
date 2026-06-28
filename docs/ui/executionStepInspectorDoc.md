# ExecutionStepInspector

## Overview

`ExecutionStepInspector` is a molecule component that displays detailed
information about a single execution step from the node runner's execution
recording. It renders a fixed-width (`340px`) side panel showing the step's node
identity, status, timing, a decorative timeline strip, loop/group context, an
optional edge-animation toggle, resolved input values with per-connection source
metadata, computed output values, and error details (if the step errored). The
component returns `null` when `stepRecord` is `null`, making it safe to always
render in the tree.

The inspector is purely presentational: it derives everything it shows from the
`stepRecord` prop (an `ExecutionStepRecord`) plus an optional `loopRecords` map
used to enrich the loop-context block. Inputs and outputs live inside a
multi-open Radix `Accordion` so each section can be collapsed independently.

Source:
`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`ExecutionStepInspector`

## Data Flow Diagram

```
ExecutionStepRecord                         loopRecords?: ReadonlyMap<string, LoopRecord>
|                                           |
+-- nodeTypeName, nodeId, nodeTypeId        |
|   |                                       |
|   +---> [ HEADER ]                        |
|         - Package icon + nodeTypeName     |
|         - "Animate" checkbox (only when   |
|           onEdgeValuesAnimatedChange set) |
|         - Close button (X icon)           |
|                                           |
+-- status, estimatedTiming, duration       |
|   startTime, endTime                       |
|   |                                       |
|   +---> [ EXECUTION INFO ]                |
|         - StatusBadge (completed |        |
|           errored | skipped)              |
|         - Duration: "< 0.1ms" when        |
|           estimatedTiming, else N.NNms    |
|         - startTime -> endTime line       |
|         - decorative progress strip       |
|           (hardcoded 20%/55%/77%)         |
|                                           |
+-- loopIteration, loopStructureId, --------+--> [ LOOP/GROUP CONTEXT ] (conditional)
|   groupNodeId, groupDepth                 |    - "Loop iteration {i+1} of {total}"
|                                           |      (total/condition from loopRecords)
|                                           |    - "Group: {groupNodeId} (depth N)"
|                                           |
+-- (debugMode) nodeId, nodeTypeId --------------> shown in tiny gray text
|
+-- inputValues: ReadonlyMap<handleName, RecordedInputHandleValue>
|   |
|   +---> [ INPUTS accordion section ]
|         Per handle (InputHandleDisplay):
|         +-- handleName (dataTypeId)
|         +-- connections[] ---> ConnectionLine per connection
|         |   +-- "Coming From– {sourceNodeName} / {sourceHandleName}"
|         |   +-- (debugMode) nodeId / handleId line
|         |   +-- value box (formatValue)
|         +-- else if isDefault: defaultValue box
|         +-- else: "No value" (italic)
|
+-- outputValues: ReadonlyMap<handleName, RecordedOutputHandleValue>
|   |
|   +---> [ OUTPUTS accordion section ]
|         Per handle (OutputHandleDisplay):
|         +-- handleName (dataTypeId)
|         +-- value box (formatValue)
|
+-- error?: GraphError
    |
    +---> [ ERROR SECTION ] (conditional)
          - "ERROR" label
          - formatGraphError(error) in monospace, whitespace-pre-wrap
```

## Props

`ExecutionStepInspectorProps`
(`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`ExecutionStepInspectorProps`):

| Prop                         | Type                              | Default      | Description                                                                                                                                            |
| ---------------------------- | --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stepRecord`                 | `ExecutionStepRecord \| null`     | _(required)_ | The step record to inspect. Pass `null` to hide the inspector (the component returns `null`).                                                          |
| `onClose`                    | `() => void`                      | _(required)_ | Callback invoked when the user clicks the close (`X`) button.                                                                                          |
| `loopRecords`                | `ReadonlyMap<string, LoopRecord>` | `undefined`  | Loop recordings keyed by loop structure ID. Used to enrich the loop-context block with total iteration count and the iteration's loop condition value. |
| `hideComplexValues`          | `boolean`                         | `false`      | When `true`, replaces complex values (objects, arrays, Maps, functions) with type-summary strings like `Object(3)` or `Array(5)`.                      |
| `debugMode`                  | `boolean`                         | `false`      | When `true`, shows raw node IDs and handle IDs alongside display names — in the execution-info block and in each connection line.                      |
| `edgeValuesAnimated`         | `boolean`                         | `undefined`  | Controlled value of the "Animate" checkbox. When rendered, the checkbox shows `edgeValuesAnimated ?? true` (defaults to checked).                      |
| `onEdgeValuesAnimatedChange` | `(animated: boolean) => void`     | `undefined`  | Change handler for the "Animate" checkbox. The checkbox is rendered **only when this prop is provided**; omit it to hide the toggle.                   |

> Note: there is no `nodeTypeId`-as-subtitle behavior and no `300px` width. The
> header shows a `Package` icon and `nodeTypeName` only; `nodeId`/`nodeTypeId`
> appear only in `debugMode`, inside the execution-info block.

## Rendering Sections

The root element is
`div.flex.w-[340px].animate-slide-in-right.flex-col.bg-runner-panel-bg`. There
is no internal `max-h` / scroll cap — the inspector renders at its natural
height and is scrolled by its container (the `NodeRunnerPanel` wraps it in a
`node-runner-scrollbar overflow-y-auto` element).

### Header (icon, name, animate toggle, close)

A flex row with a bottom border (`border-b border-secondary-dark-gray`,
`px-4 py-3`):

- **Left**: a Lucide `Package` icon and `stepRecord.nodeTypeName` (`15px`,
  letter-spaced, white).
- **Right**:
  - **Animate toggle** — a checkbox labeled "Animate", wrapped in a `Tooltip`
    ("Animate edge value badges along the connection path instead of showing
    them statically"). It is rendered **only when `onEdgeValuesAnimatedChange`
    is provided**. Its `checked` state is `edgeValuesAnimated ?? true`.
  - **Close button** — a Lucide `X` icon (`h-3.5 w-3.5`) with
    `aria-label="Close"` that calls `onClose`.

### Execution info (status, timing, loop/group, debug)

A column (`border-b border-secondary-dark-gray`, `px-4 py-3.5`, `gap-3`)
containing:

- **Status row** — a bordered pill row with a `StatusBadge` on the left and the
  duration on the right. Duration text is `'< 0.1ms'` when
  `stepRecord.estimatedTiming` is truthy, otherwise
  `` `${stepRecord.duration.toFixed(2)}ms` `` (2 decimal places).
- **Timeline box** — a dark box (`bg-runner-timeline-box-bg`) showing
  `` `${startTime.toFixed(2)}ms → ${endTime.toFixed(2)}ms` `` centered, above a
  **decorative** progress strip. The strip's filled segment (`left: 20%`,
  `width: 55%`) and marker (`left: 77%`) are **hardcoded constants** — they do
  not encode this step's real position within the run.
- **Loop/Group context** (conditional) — rendered when
  `stepRecord.loopIteration !== undefined` **or** `stepRecord.groupNodeId` is
  set. See [Loop & group context](#loop--group-context) below.
- **Debug line** (conditional) — when `debugMode` is `true`, a tiny gray line:
  `` `nodeId: ${stepRecord.nodeId} · typeId: ${stepRecord.nodeTypeId}` ``.

#### StatusBadge

A pill (`rounded-full px-3 py-1`) configured by `statusBadgeConfig`, keyed on
`ExecutionStepRecord['status']`
(`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`statusBadgeConfig`):

| `status`    | Background class                      | Text color       | Label       |
| ----------- | ------------------------------------- | ---------------- | ----------- |
| `completed` | `bg-runner-bar-completed` (`#4f8a4f`) | `text-[#e0f0e0]` | `Completed` |
| `errored`   | `bg-runner-bar-errored` (`#a64141`)   | `text-[#f0e0e0]` | `Error`     |
| `skipped`   | `bg-[#888888]/30`                     | `text-[#888888]` | `Skipped`   |

(`ExecutionStepRecordStatus` is the union `'completed' | 'errored' | 'skipped'`,
`src/utils/nodeRunner/types.ts` › `ExecutionStepRecordStatus`, derived from the
`executionStepRecordStatuses` const array, `src/utils/nodeRunner/types.ts` ›
`executionStepRecordStatuses`.)

### Loop & group context

Rendered inside the execution-info block, between the timeline box and the debug
line.

- **Loop iteration** — shown when `stepRecord.loopIteration !== undefined`. The
  component looks up the matching `LoopRecord` via
  `loopRecords?.get(stepRecord.loopStructureId)` and the matching
  `LoopIterationRecord` via `loopRecord.iterations[stepRecord.loopIteration]`.
  It renders:
  - `` `Loop iteration ${stepRecord.loopIteration + 1}` `` (1-based), plus
    `` ` of ${loopRecord.totalIterations}` `` when a `LoopRecord` was found.
  - When the iteration record is found, a sub-line:
    `Condition: true (continues)` or `Condition: false (exits)` from
    `iterationRecord.conditionValue`.

  If `loopRecords` is omitted (or the IDs don't match), only the bare
  `Loop iteration N` line shows — total count and condition are skipped.

- **Group** — shown when `stepRecord.groupNodeId` is set:
  `` `Group: ${stepRecord.groupNodeId}` ``, with
  `` ` (depth ${stepRecord.groupDepth})` `` appended only when `groupDepth` is
  defined.

### Inputs (accordion section)

The inputs and outputs live in a single
`<Accordion type="multiple" defaultValue={['inputs','outputs']}>` — both are
expanded by default and collapse independently. The inputs `AccordionTrigger`
label is literally `Inputs`.

`inputEntries` is `Array.from(stepRecord.inputValues.entries())`. For each
`[handleName, RecordedInputHandleValue]`, an `InputHandleDisplay` renders. A
thin divider (`h-px bg-secondary-dark-gray`) is drawn **above** every entry
after the first (`idx > 0`).

`InputHandleDisplay` shows:

- **Handle line**: `handleName` in white, followed by `(dataTypeId)` in gray.
- **Body**, chosen in this order:
  1. If `connections.length > 0` — one `ConnectionLine` per connection.
  2. Else if `isDefault` — a value box rendering
     `formatValue(handleValue.defaultValue, hideComplex)`.
  3. Else — `No value` in gray italic.

`ConnectionLine`
(`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`ConnectionLine`) renders per connection (`RecordedInputConnection`):

- A label line: `Coming From–` (gray) then
  `` `${conn.sourceNodeName} / ${conn.sourceHandleName}` `` in white.
- **Debug line** (when `debugMode`): tiny gray
  `` `nodeId: ${conn.sourceNodeId} · handleId: ${conn.sourceHandleId}` ``.
- A value box (`border-runner-value-border bg-runner-value-bg`, monospace)
  rendering `formatValue(conn.value, hideComplex)`.

If `inputValues` is empty, the section body shows `No inputs` in gray italic.

> There are **no** "N conn" / "default" / fan-in count badges, and `dataTypeId`
> is shown in parentheses after the handle name (not as a separate gray chip).
> Connection lines do **not** render `sourceDataTypeId` — only the source node
> and handle names (plus IDs in debug mode).

### Outputs (accordion section)

The outputs `AccordionTrigger` label is literally `Outputs`.

`outputEntries` is `Array.from(stepRecord.outputValues.entries())`. For each
`[handleName, RecordedOutputHandleValue]`, an `OutputHandleDisplay` renders,
with the same `idx > 0` divider rule as inputs.

`OutputHandleDisplay` shows:

- **Handle line**: `handleName` in white, then `(dataTypeId)` in gray.
- A value box rendering `formatValue(handleValue.value, hideComplex)`.

If `outputValues` is empty, the section body shows `No outputs` in gray italic.

> `RecordedOutputHandleValue.targetCount` exists on the type
> (`src/utils/nodeRunner/types.ts` › `RecordedOutputHandleValue`) but the
> inspector does **not** render a fan-out / "N targets" badge. The value box is
> the only output detail shown.

### Error display

Rendered only when `stepRecord.error` is defined, after the accordion (so below
outputs). It is a red-tinted bordered container (`border-status-errored/30`,
`bg-status-errored/10`) containing:

- An uppercase `Error` label in `text-status-errored`.
- The full message from `formatGraphError(stepRecord.error)`, in monospace with
  `whitespace-pre-wrap` so its multi-line output is preserved.

`formatGraphError` (`src/utils/nodeRunner/errors.ts` › `formatGraphError`)
builds these lines:

```
Error in "<customName> : <nodeTypeName>" (<nodeId>)   (custom name shown when set; else just "<nodeTypeName>")
Message: <message>
Path: <customName> : <nodeTypeName> → <nodeTypeName> → ...   (only if path.length > 0; each entry shows its own custom name)
Loop: iteration <n> of <maxIterations>           (only if loopContext)
Group: <groupNodeTypeId> (depth <depth>)         (only if groupContext)
Duration: <duration.toFixed(2)>ms
```

The `GraphError` type (`src/utils/nodeRunner/types.ts` › `GraphError`) carries
`message`, `nodeId`, `nodeTypeId`, `nodeTypeName`, optional `customName`
(standard nodes only; rendered `Custom : Type`), optional `handleId`, `path`
(`GraphErrorPathEntry[]`), optional `loopContext`
(`{ loopStructureId, iteration, maxIterations }`) and `groupContext`
(`{ groupNodeId, groupNodeTypeId, depth }`), `timestamp`, `duration`, and
`originalError`.

## Value Display

All values pass through `formatValue(value, hideComplex)`
(`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`formatValue`).

### Primitive values

| Type        | Display                                    |
| ----------- | ------------------------------------------ |
| `undefined` | `undefined`                                |
| `null`      | `null`                                     |
| `boolean`   | `true` or `false`                          |
| `number`    | `String(value)` (e.g., `42`, `23.5`)       |
| `string`    | Wrapped in double quotes (e.g., `"hello"`) |

### Complex values (hideComplexValues option)

When `hideComplex` is `false` (default), complex values are fully expanded:

| Type       | Display                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Map`      | `Map { key1: value1, key2: value2 }` (entries recursively formatted)                                                     |
| `Array`    | `[value1, value2, value3]` (elements recursively formatted)                                                              |
| object     | `JSON.stringify(value, null, 2)`; on throw, falls back to `String(value)`                                                |
| `function` | Not a `Map`/`Array`/JSON-serializable object → falls through to `JSON.stringify`, which yields `undefined` for functions |

When `hideComplex` is `true`, `isComplex(value)` gates a `typeSummary(value)`
replacement. `isComplex` returns `true` when `value` is non-null/undefined and
`typeof` is `'object'` or `'function'`. `typeSummary`
(`src/components/molecules/ExecutionStepInspector/ExecutionStepInspector.tsx` ›
`typeSummary`) returns:

| Value        | Summary                                            |
| ------------ | -------------------------------------------------- |
| `undefined`  | `undefined`                                        |
| `null`       | `null`                                             |
| `boolean`    | `boolean`                                          |
| `number`     | `number`                                           |
| `string`     | `string`                                           |
| `Map`        | `Map(N)` where N is `value.size`                   |
| `Array`      | `Array(N)` where N is `value.length`               |
| `function`   | `function`                                         |
| other object | `Object(N)` where N is `Object.keys(value).length` |
| fallthrough  | `Object(?)`                                        |

> `typeSummary` handles primitives too, but in practice only complex values
> reach it (primitives short-circuit the `isComplex` guard in `formatValue`).

## Limitations and Notes

- **No editing**: the inspector is read-only. Values cannot be modified.
- **No search/filter**: with many inputs or outputs there is no way to search
  for a specific handle.
- **Flat value display**: objects render as pretty-printed JSON text, not as
  collapsible tree views.
- **No canvas navigation from connections**: clicking a `sourceNodeName` in a
  connection line does nothing (node navigation lives in the timeline/run
  controls, not the inspector).
- **Fixed width**: the panel is hardcoded to `340px` (`w-[340px]`), not
  resizable.
- **No internal scroll cap**: the inspector renders full-height; scrolling is
  owned by the parent container.
- **Decorative timeline strip**: the progress bar inside the timeline box uses
  fixed percentages and does not reflect this step's real start/end position.
- **`targetCount` unused**: output fan-out count is present on the data but not
  surfaced in the UI.
- **`autoInspectErrors` is not implemented here**: it exists on
  `NodeRunnerPanelSettings` but the current `NodeRunnerPanel` does not auto-open
  the inspector on error; selection is driven by timeline clicks.

## Relationships with Other Features

### -> [Execution Recording (ExecutionStepRecord)](../runner/executionRecordingDoc.md)

The inspector consumes `ExecutionStepRecord` objects produced by the execution
recorder (`src/utils/nodeRunner/types.ts` › `ExecutionStepRecord`). Relevant
fields it reads:

- `inputValues`: `ReadonlyMap<string, RecordedInputHandleValue>` —
  per-connection detail with source node/handle metadata
  (`RecordedInputConnection`, `src/utils/nodeRunner/types.ts` ›
  `RecordedInputConnection`).
- `outputValues`: `ReadonlyMap<string, RecordedOutputHandleValue>` — computed
  values (with an unused `targetCount`).
- `status`, `duration`, `estimatedTiming`, `startTime`, `endTime` — for the
  status badge and timing block.
- `loopIteration`, `loopStructureId`, `groupNodeId`, `groupDepth` — for the
  loop/group context block.
- `error`: optional `GraphError` with full execution-path trace and loop/group
  context.

`RecordedInputConnection` is a display-only, stripped-down version of the
runtime `InputConnectionValue` (`src/utils/nodeRunner/types.ts` ›
`InputConnectionValue`): it keeps `value`, `sourceNodeId`, `sourceNodeName`,
`sourceHandleId`, `sourceHandleName`, and `sourceDataTypeId`, but drops `edgeId`
and `sourceNodeTypeId`.

The optional `loopRecords` prop is a `ReadonlyMap<string, LoopRecord>` — the
same shape as `ExecutionRecord.loopRecords` (`src/utils/nodeRunner/types.ts` ›
`ExecutionRecord`). `LoopRecord.iterations` is an array of `LoopIterationRecord`
(`src/utils/nodeRunner/types.ts` › `LoopIterationRecord`), whose
`conditionValue` drives the "continues/exits" sub-line, and
`LoopRecord.totalIterations` supplies the "of N" suffix.

### -> [NodeRunnerPanel](nodeRunnerPanelDoc.md)

The `NodeRunnerPanel` organism
(`src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx` ›
`NodeRunnerPanel`) hosts the inspector as a right-side panel that slides in/out.
The panel:

- **Picks the step** by matching `selectedStepIndex` against `stepIndex`:
  `record.steps.find((s) => s.stepIndex === selectedStepIndex)` — it does
  **not** index `record.steps[selectedStepIndex]` directly.
- **Controls open/close** locally: `inspectorOpen` is derived from
  `selectedStepRecord !== null`, and `onClose` (→ `handleCloseInspector`) sets
  `selectedStepIndex` back to `null`. While the close animation plays, the panel
  renders the last step via a ref so content doesn't vanish mid-transition.
- **Forwards `loopRecords={record?.loopRecords}`** so the loop-context block can
  show totals/conditions.
- **Forwards `hideComplexValues` and `debugMode`** from its own props.
- **Wires the animate toggle**: `edgeValuesAnimated` and `setEdgeValuesAnimated`
  come from the `useRecordingViewState()` context hook and are passed as
  `edgeValuesAnimated` / `onEdgeValuesAnimatedChange`. (`edgeValuesAnimated` is
  persisted on the saved recording's `RecordingViewState`.)

### -> [ExecutionTimeline (step selection)](executionTimelineDoc.md)

The `ExecutionTimeline` molecule selects which step the inspector shows. When a
step block is left-clicked:

1. The timeline calls `onStepClick(stepRecord)`.
2. The panel's `handleStepClick` toggles `selectedStepIndex` (clicking the
   already-selected step closes the inspector).
3. The panel resolves the matching `ExecutionStepRecord` and passes it to
   `ExecutionStepInspector` as `stepRecord`.

The inspector and timeline are decoupled — they coordinate only through the
panel's selection state (`selectedStepIndex`).

### -> [Atoms: Accordion & Tooltip](uiPrimitivesDoc.md)

- The inputs/outputs sections use the `Accordion` atom family
  (`src/components/atoms/Accordion/Accordion.tsx` › `Accordion`), a thin wrapper
  over Radix `Accordion`. The inspector uses `type="multiple"` with
  `defaultValue={['inputs','outputs']}` so both start expanded and toggle
  independently.
- The "Animate" checkbox label is wrapped in the `Tooltip` atom
  (`src/components/atoms/Tooltip/Tooltip.tsx` › `Tooltip`) to explain edge-value
  animation.
