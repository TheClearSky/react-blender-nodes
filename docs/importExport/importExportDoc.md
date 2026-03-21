# Import/Export

## Overview

The import/export system provides serialization and deserialization of two
primary data structures:

1. **Graph State** -- the full graph definition (nodes, edges, data types, node
   types, viewport, node group subtrees)
2. **Execution Records** -- recorded execution traces for replay and inspection

Both export paths produce versioned JSON envelopes. Both import paths validate
structure, optionally apply repair strategies, and return a discriminated-union
`ImportResult<T>` that is either `{ success: true, data, warnings }` or
`{ success: false, errors, warnings }`.

A central challenge is that the runtime `State` and `ExecutionRecord` types
contain non-serializable values (Zod schemas, callback functions, `ReadonlyMap`
instances, `Error` objects). The export layer strips or converts these; the
import layer rehydrates or reconstructs them.

### Source files

| File                                      | Responsibility                                |
| ----------------------------------------- | --------------------------------------------- |
| `src/utils/importExport/index.ts`         | Public API barrel                             |
| `src/utils/importExport/types.ts`         | All type definitions                          |
| `src/utils/importExport/stateExport.ts`   | `exportGraphState`                            |
| `src/utils/importExport/stateImport.ts`   | `importGraphState`                            |
| `src/utils/importExport/recordExport.ts`  | `exportExecutionRecord`                       |
| `src/utils/importExport/recordImport.ts`  | `importExecutionRecord`                       |
| `src/utils/importExport/validation.ts`    | Structural validators                         |
| `src/utils/importExport/serialization.ts` | Serialization helpers, stripping, rehydration |

---

## Entity-Relationship Diagram

```
+---------------------+          +------------------------+
|  ExportedGraphState  |          | ExportedExecutionRecord|
|---------------------|          |------------------------|
| version: 1          |          | version: 1             |
| exportedAt: string  |          | exportedAt: string     |
| state: {...}        |          | record: {...}          |
+---------------------+          +------------------------+
         |                                 |
         | wraps                           | wraps
         v                                 v
+---------------------+          +------------------------+
|       State          |          |   ExecutionRecord      |
|---------------------|          |------------------------|
| dataTypes{}         |          | id                     |
| typeOfNodes{}       |          | status                 |
| nodes[]             |          | steps[]                |
| edges[]             |          | errors[]               |
| viewport?           |          | loopRecords (Map)      |
| openedNodeGroupStack|          | groupRecords (Map)     |
+---------------------+          | finalValues (Map)      |
    |           |                | concurrencyLevels[]    |
    |           |                +------------------------+
    v           v                    |
+--------+ +--------+               v
| Node   | | Edge   |       +-------------------+
|--------| |--------|       | ExecutionStepRecord|
| id     | | id     |       |-------------------|
| type   | | source |       | stepIndex         |
| position | target |       | nodeId            |
| data{} | | srcH   |       | nodeTypeId        |
|  inputs| | tgtH   |       | status            |
|  output| +--------+       | inputValues (Map) |
+--------+                  | outputValues (Map)|
                             | error?            |
                             +-------------------+
```

---

## Data Flow Diagram

### State Export/Import

```
  Runtime State
       |
       v
  exportGraphState()
       |
       |  1. Deep clone state
       |  2. Strip complexSchema from dataTypes
       |  3. Strip onChange, complexSchema from handles
       |     (inputs, outputs, panels, subtree nodes)
       |  4. Wrap in { version: 1, exportedAt, state }
       |  5. JSON.stringify
       |
       v
  JSON string  ------>  file download / storage
       |
       v
  importGraphState(json, options)
       |
       |  1. JSON.parse
       |  2. validateGraphStateStructure (envelope + state)
       |  3. Apply repair strategies (if enabled):
       |     - removeDuplicateNodeIds
       |     - removeDuplicateEdgeIds
       |     - removeOrphanEdges
       |     - fillMissingDefaults
       |  4. Rehydrate complexSchema on dataTypes
       |  5. Rehydrate handle dataTypeObjects from dataTypes
       |  6. Filter repaired errors, check remaining
       |  7. Type-narrow via isValidState guard
       |
       v
  ImportResult<State>
       |
       | (on success, in FullGraph)
       v
  Replace dataTypes/typeOfNodes with live originals
       |
       v
  dispatch(REPLACE_STATE)
       |
       v
  Force ReactFlow remount (key increment)
```

### Recording Export/Import

```
  Runtime ExecutionRecord
       |
       v
  exportExecutionRecord()
       |
       |  1. serializeExecutionRecord:
       |     - ReadonlyMap -> Record (loopRecords, groupRecords, finalValues)
       |     - ReadonlyMap -> Record (step inputValues, outputValues)
       |     - GraphError.originalError -> safeSerializeValue
       |     - Functions -> "[Function]", Symbols -> "[Symbol: ...]"
       |     - Recursive for GroupRecord.innerRecord
       |  2. Wrap in { version: 1, exportedAt, record }
       |  3. JSON.stringify
       |
       v
  JSON string  ------>  file download / storage
       |
       v
  importExecutionRecord(json, options)
       |
       |  1. JSON.parse
       |  2. validateExecutionRecordStructure (envelope + record)
       |  3. Apply repair strategies (if enabled):
       |     - removeOrphanSteps (filter malformed steps)
       |     - sanitizeNonSerializableValues (no-op after JSON parse)
       |  4. Narrow via isSerializedExecutionRecord guard
       |  5. deserializeExecutionRecord:
       |     - Record -> ReadonlyMap for all map fields
       |     - Reconstruct GraphError objects
       |     - Recursive for GroupRecord.innerRecord
       |
       v
  ImportResult<ExecutionRecord>
       |
       | (on success, in FullGraph)
       v
  loadRecordRef.current(result.data)  -- loads into runner
```

---

## System Diagram

```
+-----------------------------------------------------------------------+
|                          FullGraph Component                          |
|                                                                       |
|  +-------------------+     +--------------------+                     |
|  | Context Menu      |     | Hidden <input>     |                     |
|  | (Import/Export)   |---->| type="file"        |                     |
|  +-------------------+     | accept=".json"     |                     |
|         |                  +--------------------+                     |
|         |                        |                                    |
|         v                        v                                    |
|  handleExportState()      FileReader.readAsText()                    |
|  handleExportRecording()         |                                    |
|         |                        v                                    |
|         v                  handleImportState(json)                   |
|  exportGraphState()        handleImportRecording(json)               |
|  exportExecutionRecord()         |                                    |
|         |                        v                                    |
|         v               +------------------+                          |
|  downloadJson()         | importGraphState |  importExecutionRecord   |
|  (Blob + <a> click)     +------------------+                          |
|                                  |                                    |
|                                  v                                    |
|                         +-----------------+                           |
|                         | Validation      |                           |
|                         | + Repair        |                           |
|                         | + Rehydration   |                           |
|                         +-----------------+                           |
|                                  |                                    |
|                     +------------+-------------+                      |
|                     v                          v                      |
|           dispatch(REPLACE_STATE)    loadRecord(record)              |
|           + ReactFlow remount        (into runner)                   |
+-----------------------------------------------------------------------+
```

---

## State Export

### exportGraphState

**Signature:** `exportGraphState(state, options?) -> string`

**Location:** `src/utils/importExport/stateExport.ts`

Takes a runtime `State` object and returns a JSON string wrapped in an
`ExportedGraphState` envelope:

```ts
type ExportedGraphState = {
  version: 1;
  exportedAt: string; // ISO 8601
  state: Record<string, unknown>;
};
```

**Options:**

| Option   | Type      | Default | Description                   |
| -------- | --------- | ------- | ----------------------------- |
| `pretty` | `boolean` | `false` | 2-space indent in output JSON |

### What is serialized and what is stripped

The function deep-clones the state (via `structuredClone` with JSON fallback),
then walks the clone to remove non-serializable fields:

| Field           | Location                                               | Action                 |
| --------------- | ------------------------------------------------------ | ---------------------- |
| `complexSchema` | `dataTypes[id].complexSchema`                          | Deleted (Zod instance) |
| `onChange`      | Handle objects (inputs/outputs)                        | Deleted (callback)     |
| `complexSchema` | `handle.dataType.dataTypeObject.complexSchema`         | Deleted (Zod instance) |
| `complexSchema` | `handle.inferredDataType.dataTypeObject.complexSchema` | Deleted (Zod instance) |

Stripping is applied to:

- Top-level `state.dataTypes`
- Top-level `state.typeOfNodes` inputs/outputs (including panel nested inputs)
- `typeOfNodes[id].subtree.nodes` (group node definitions)
- `state.nodes[].data.inputs` and `state.nodes[].data.outputs`

Everything else (node positions, edge connections, viewport, feature flags, node
group stack) passes through unchanged.

---

## State Import

### importGraphState

**Signature:** `importGraphState(json, options) -> ImportResult<State>`

**Location:** `src/utils/importExport/stateImport.ts`

Parses a JSON string, validates, repairs, and rehydrates it back to a full
`State` object.

### StateImportOptions

```ts
type StateImportOptions = {
  dataTypes: Record<DataTypeUniqueId, DataType>; // live definitions (source of truth)
  typeOfNodes: Record<NodeTypeUniqueId, TypeOfNode>; // live definitions (source of truth)
  onValidationError?: (issue: ValidationIssue) => void;
  repair?: Partial<StateRepairStrategies>;
};
```

`dataTypes` and `typeOfNodes` are **required** because they carry the
non-serializable fields (Zod schemas, callbacks) that were stripped during
export.

### Validation (validateGraphStateStructure)

**Location:** `src/utils/importExport/validation.ts:30`

Checks the parsed JSON against the expected structure. Returns an array of
`ValidationIssue` objects. Does NOT check semantic correctness (e.g., whether
handle dataType IDs exist in `dataTypes`).

**Checks performed:**

| Path                | Check                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (root)              | Must be an object                                                                                                                                                             |
| `version`           | Must be `1`                                                                                                                                                                   |
| `exportedAt`        | Must be a string (warning if missing)                                                                                                                                         |
| `state`             | Must be an object                                                                                                                                                             |
| `state.dataTypes`   | Must be an object; each entry must have `name` (string) and `underlyingType` (string)                                                                                         |
| `state.typeOfNodes` | Must be an object; each entry must have `name` (string), `inputs` (array), `outputs` (array)                                                                                  |
| `state.nodes`       | Must be an array; each node must have `id` (string), `position` (`{x: number, y: number}`); detects duplicate IDs (warning)                                                   |
| `state.edges`       | Must be an array; each edge must have `id`, `source`, `target`, `sourceHandle`, `targetHandle` (all strings); detects duplicate IDs (warning), orphan source/target (warning) |

### Repair Strategies (StateRepairStrategies)

All strategies default to `false` and must be explicitly opted in.

| Strategy                   | What it does                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `removeDuplicateNodeIds`   | Keeps first occurrence of each node ID, removes subsequent duplicates                                                |
| `removeDuplicateEdgeIds`   | Keeps first occurrence of each edge ID, removes subsequent duplicates                                                |
| `removeOrphanEdges`        | Removes edges whose `source` or `target` does not match any node ID. Emits a warning with the count of removed edges |
| `fillMissingDefaults`      | Sets `viewport` to `{ x: 0, y: 0, zoom: 1 }` if missing                                                              |
| `rehydrateDataTypeObjects` | (Handled implicitly -- rehydration always runs)                                                                      |

**Repair order:**

1. `removeDuplicateNodeIds`
2. `removeDuplicateEdgeIds`
3. `removeOrphanEdges` (uses node set after dedup)
4. `fillMissingDefaults`

After repair, the function filters out errors that correspond to repaired
issues. If unrepaired errors remain, the import fails.

### Rehydration of live definitions

Two rehydration passes always run (not gated by repair flags):

1. **complexSchema on dataTypes:** For each imported `dataType`, if the
   corresponding entry in `options.dataTypes` has a `complexSchema`, it is
   copied onto the imported dataType.

2. **handle dataTypeObjects:** For each node's input/output handles (including
   panel-nested inputs), the `dataType.dataTypeObject` and
   `inferredDataType.dataTypeObject` are replaced with the full live dataType
   from `options.dataTypes`, keyed by `dataTypeUniqueId`.

In `FullGraph.tsx`, the import handler goes further: it replaces the **entire**
`dataTypes` and `typeOfNodes` on the imported state with the live originals,
since these are type definitions that don't change between sessions.

---

## Recording Export

### exportExecutionRecord

**Signature:** `exportExecutionRecord(record, options?) -> string`

**Location:** `src/utils/importExport/recordExport.ts`

Delegates to `serializeExecutionRecord()` to produce a JSON-safe plain object,
then wraps it in an `ExportedExecutionRecord` envelope.

### Map serialization

The `ExecutionRecord` and its nested types use `ReadonlyMap` extensively. These
are converted to plain `Record<string, T>` objects for JSON compatibility:

| Runtime field                     | Serialized form                                       |
| --------------------------------- | ----------------------------------------------------- |
| `record.loopRecords` (Map)        | `Record<string, SerializedLoopRecord>`                |
| `record.groupRecords` (Map)       | `Record<string, SerializedGroupRecord>`               |
| `record.finalValues` (Map)        | `Record<string, unknown>`                             |
| `step.inputValues` (Map)          | `Record<string, SerializedRecordedInputHandleValue>`  |
| `step.outputValues` (Map)         | `Record<string, SerializedRecordedOutputHandleValue>` |
| `groupRecord.inputMapping` (Map)  | `Record<string, unknown>`                             |
| `groupRecord.outputMapping` (Map) | `Record<string, unknown>`                             |

Additionally:

- `GraphError.originalError` is passed through `safeSerializeValue()` (Error
  instances become `{ __type: "Error", name, message, stack }`)
- `GroupRecord.innerRecord` is serialized recursively (groups can nest)
- `concurrencyLevels` is spread to a plain array

---

## Recording Import

### importExecutionRecord

**Signature:**
`importExecutionRecord(json, options?) -> ImportResult<ExecutionRecord>`

**Location:** `src/utils/importExport/recordImport.ts`

### RecordImportOptions

```ts
type RecordImportOptions = {
  onValidationError?: (issue: ValidationIssue) => void;
  repair?: Partial<RecordRepairStrategies>;
};
```

### Validation

`validateExecutionRecordStructure` checks:

| Path                       | Check                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (root)                     | Must be an object                                                                                                                                                                    |
| `version`                  | Must be `1`                                                                                                                                                                          |
| `exportedAt`               | Must be a string (warning)                                                                                                                                                           |
| `record`                   | Must be an object                                                                                                                                                                    |
| `record.id`                | Must be a string                                                                                                                                                                     |
| `record.startTime`         | Must be a number                                                                                                                                                                     |
| `record.endTime`           | Must be a number                                                                                                                                                                     |
| `record.totalDuration`     | Must be a number                                                                                                                                                                     |
| `record.status`            | Must be one of: `completed`, `errored`, `cancelled`                                                                                                                                  |
| `record.steps[]`           | Each must have `stepIndex` (number), `nodeId` (string), `nodeTypeId` (string), `status` (one of: `completed`, `errored`, `skipped`), `inputValues` (object), `outputValues` (object) |
| `record.errors`            | Must be an array (warning)                                                                                                                                                           |
| `record.concurrencyLevels` | Must be an array (warning)                                                                                                                                                           |
| `record.loopRecords`       | If present, must be an object (warning)                                                                                                                                              |
| `record.groupRecords`      | If present, must be an object (warning)                                                                                                                                              |
| `record.finalValues`       | If present, must be an object (warning)                                                                                                                                              |

### Repair Strategies (RecordRepairStrategies)

| Strategy                        | What it does                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `removeOrphanSteps`             | Filters out steps missing required fields (`nodeId`, `nodeTypeId`, `stepIndex`). Emits a warning with count |
| `sanitizeNonSerializableValues` | No-op in practice (values are already JSON after `JSON.parse`), included for API consistency                |

After repair, the import narrows the data via `isSerializedExecutionRecord`
(checks `id`, `status`, `steps[]`, `errors[]`), then calls
`deserializeExecutionRecord()` to convert all `Record` fields back to
`ReadonlyMap` instances and reconstruct `GraphError` objects.

---

## Serialization Helpers

### mapToRecord / recordToReadonlyMap

```
mapToRecord<T>(map: ReadonlyMap<string, T>) -> Record<string, T>
recordToReadonlyMap<T>(obj: Record<string, T> | null | undefined) -> ReadonlyMap<string, T>
```

Bidirectional conversion between `ReadonlyMap` and plain objects.
`recordToReadonlyMap` handles `null`/`undefined` by returning an empty Map.

### safeSerializeValue

```
safeSerializeValue(value: unknown) -> unknown
```

Recursively makes a value JSON-safe:

| Input type                    | Output                                                    |
| ----------------------------- | --------------------------------------------------------- |
| `null`, `undefined`           | Pass through                                              |
| `string`, `number`, `boolean` | Pass through                                              |
| `function`                    | `"[Function]"`                                            |
| `symbol`                      | `"[Symbol: ...]"`                                         |
| `bigint`                      | `value.toString()`                                        |
| `Map`                         | Converted to `Record` (keys stringified), values recursed |
| `Set`                         | Converted to array, values recursed                       |
| `Error`                       | `{ __type: "Error", name, message, stack }`               |
| `Array`                       | Elements recursed                                         |
| Plain object                  | Values recursed                                           |
| Other                         | `String(value)`                                           |

### serializeGraphError / deserializeGraphError

Serialize: spreads the `GraphError`, copies `path` to a plain array, runs
`originalError` through `safeSerializeValue`.

Deserialize: spreads back, ensures `path` is an array. The `originalError` stays
in its serialized form since the original `Error` instance cannot be
reconstructed.

---

## Validation System

### ValidationIssue type

```ts
type ValidationIssue = {
  path: string; // Dot-path, e.g. "state.nodes[2].position.x"
  message: string; // Human-readable description
  severity: 'error' | 'warning';
};
```

- **error**: Blocks import unless a matching repair strategy is enabled
- **warning**: Informational; included in the result but does not block import

### ImportResult type

```ts
type ImportResult<T> =
  | { success: true; data: T; warnings: ValidationIssue[] }
  | { success: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };
```

Discriminated union on `success`. On failure, `errors` contains all unrepaired
issues. On success, `warnings` may still contain informational issues (e.g.,
count of repaired orphan edges).

---

## Integration with FullGraph

### Context menu items

`createImportExportMenuItems` (in
`src/components/organisms/FullGraph/createImportExportMenuItems.ts`) builds a
submenu under the right-click context menu:

```
Import/Export (ArrowDownUpIcon)
  +-- Export State      (FileOutputIcon)   -> handleExportState
  +-- Import State      (FileInputIcon)    -> click hidden file input
  +-- ---separator---
  +-- Export Recording  (FileOutputIcon)   -> handleExportRecording
  +-- Import Recording  (FileInputIcon)    -> click hidden file input
```

The config object receives callbacks and a `closeMenu` function; each menu item
calls its callback then closes the menu.

### Hidden file inputs

Two hidden `<input type="file" accept=".json">` elements are rendered inside
`FullGraphWithReactFlowProvider`:

| Ref                       | Purpose                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `importStateInputRef`     | Triggered by "Import State" menu item. On file select, reads text via `FileReader`, calls `handleImportState(text)`         |
| `importRecordingInputRef` | Triggered by "Import Recording" menu item. On file select, reads text via `FileReader`, calls `handleImportRecording(text)` |

Both reset `e.target.value = ''` after reading so the same file can be
re-imported.

### downloadJson helper

```ts
function downloadJson(json: string, filename: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

Creates a temporary object URL from a Blob, triggers a download via a
programmatic `<a>` click, then revokes the URL. Default filenames:
`graph-state.json` for state, `execution-recording.json` for recordings.

---

## Limitations and Deprecated Patterns

1. **Non-serializable fields are lost during export.** `complexSchema` (Zod
   instances), `onChange` callbacks, and other function/class-based fields are
   stripped. On import, these must be supplied via the `dataTypes` and
   `typeOfNodes` options.

2. **Live definitions required on import.** The importer cannot reconstruct Zod
   schemas or callbacks from JSON. The `FullGraph` integration solves this by
   replacing the entire imported `dataTypes` and `typeOfNodes` with the current
   live originals (since these are immutable type definitions).

3. **Error objects are not fully round-trippable.** `GraphError.originalError`
   is serialized to a structured representation but cannot be reconstructed as a
   real `Error` instance on import. The serialized form
   (`{ __type: "Error", name, message, stack }`) is preserved as-is.

4. **Map fields are converted to Records.** `ReadonlyMap<string, T>` fields in
   `ExecutionRecord` become `Record<string, T>` in JSON. On import, they are
   converted back. Key ordering is not guaranteed to be preserved.

5. **Version is always `1`.** There is no migration system -- if the envelope
   version changes, existing exports will fail validation.

6. **ReactFlow remount on state import.** After a state import, `FullGraph`
   increments a key on the `<ReactFlow>` component to force a full remount. This
   is necessary because Handle registration must happen in sync with edge
   rendering.

---

## Examples

### Exporting and downloading graph state

```ts
import { exportGraphState } from 'react-blender-nodes';

const json = exportGraphState(state, { pretty: true });
// json is a string -- save to file, send to server, etc.
```

### Importing graph state with repair

```ts
import { importGraphState } from 'react-blender-nodes';

const result = importGraphState(json, {
  dataTypes: myDataTypes,
  typeOfNodes: myTypeOfNodes,
  onValidationError: (issue) => console.warn(issue.path, issue.message),
  repair: {
    removeOrphanEdges: true,
    removeDuplicateNodeIds: true,
    fillMissingDefaults: true,
  },
});

if (result.success) {
  // result.data is a valid State
  // result.warnings may contain repair info
  dispatch({ type: 'REPLACE_STATE', payload: { state: result.data } });
} else {
  // result.errors contains unrepaired validation issues
  console.error(result.errors);
}
```

### Exporting and importing execution recordings

```ts
import {
  exportExecutionRecord,
  importExecutionRecord,
} from 'react-blender-nodes';

// Export
const json = exportExecutionRecord(record, { pretty: true });

// Import
const result = importExecutionRecord(json, {
  repair: { removeOrphanSteps: true },
});

if (result.success) {
  runner.loadRecord(result.data);
}
```

### Using validation standalone

```ts
import {
  validateGraphStateStructure,
  validateExecutionRecordStructure,
} from 'react-blender-nodes';

const parsed = JSON.parse(jsonString);
const issues = validateGraphStateStructure(parsed);
const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');
```

---

## Relationships with Other Features

### -> [State Management (REPLACE_STATE action)](../core/stateManagementDoc.md)

On successful state import, `FullGraph` dispatches
`actionTypesMap.REPLACE_STATE` with the rehydrated state (after replacing
`dataTypes` and `typeOfNodes` with live originals). This is the only action type
that wholesale replaces the graph state.

### -> [Execution Recording (ExecutionRecord serialization)](../runner/executionRecordingDoc.md)

The recording export/import system serializes the full `ExecutionRecord` type
from the runner, including nested `LoopRecord`, `GroupRecord`,
`ExecutionStepRecord`, and `GraphError` types. All `ReadonlyMap` fields are
bidirectionally converted.

### -> [Runner Hook (loadRecord)](../runner/runnerHookDoc.md)

Recording import feeds the deserialized `ExecutionRecord` into the runner via
`loadRecordRef.current(result.data)`. The runner's `loadRecord` method returns a
`{ valid, errors, warnings }` result that the import handler checks before
completing.

### -> [FullGraph (UI integration)](../ui/fullGraphDoc.md)

`FullGraph` owns the import/export lifecycle: export callbacks, hidden file
inputs, `downloadJson`, state replacement, and ReactFlow remount. The
`onStateImported`, `onRecordingImported`, and `onImportError` props allow parent
components to react to import events.

### -> [Context Menu (menu items)](../ui/contextMenuDoc.md)

`createImportExportMenuItems` returns `ContextMenuItem[]` that are spread into
the context menu alongside the node-creation menu items. The import/export
submenu is rendered with a separator from the node menu.
