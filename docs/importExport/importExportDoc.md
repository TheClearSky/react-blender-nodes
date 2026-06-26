# Import/Export

## Overview

The import/export system provides serialization and deserialization of two
primary data structures:

1. **Graph State** -- the full graph definition (data types, node types, nodes,
   edges, viewport, node-group navigation stack)
2. **Execution Records** -- recorded execution traces for replay and inspection

Both export paths produce versioned JSON envelopes (`version: 1`). Both import
paths validate structure, optionally apply repair strategies, and return a
discriminated-union `ImportResult<T>` that is either
`{ success: true, data, warnings }` or `{ success: false, errors, warnings }`.

A central challenge is that the runtime `State` and `ExecutionRecord` types
contain non-serializable values (Zod schemas, callback functions, `ReadonlyMap`
instances, `Error` objects) and UI-only state that must not round-trip. The
export layer strips or converts these; the import layer rehydrates or
reconstructs them.

Two facts drive the whole design:

- **UI-only state is stripped on export.** `StateSerializer.serialize` deletes
  `activeDrawer`, `zones`, `zoneIndex`, and `history` from the cloned state, in
  addition to stripping non-serializable handle fields. None of these belong in
  a portable graph definition.
- **Zones are rebuilt on import, not carried.** Because `zones`/`zoneIndex` are
  stripped, importing a state via `REPLACE_STATE` re-derives them from scratch:
  `applyPlan`'s `REPLACE_STATE` case calls `rehydrateAllZones(imported)` and
  `delete imported.history`. The importer itself does not touch zones -- that
  happens in the reducer when the imported state is dispatched.

### Source files

| File                                                                   | Responsibility                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/utils/importExport/index.ts`                                      | Public API barrel                                                                                                                                                                    |
| `src/utils/importExport/types.ts`                                      | All type definitions (`ValidationIssue`, `ImportResult`, envelopes, repair strategies, options)                                                                                      |
| `src/utils/importExport/stateExport.ts` › `exportGraphState`           | `exportGraphState` -- delegates to `StateSerializer.serialize`, JSON-stringifies                                                                                                     |
| `src/utils/importExport/stateImport.ts` › `importGraphState`           | `importGraphState` -- parse, validate, repair, rehydrate handle dataTypes                                                                                                            |
| `src/utils/importExport/recordExport.ts` › `exportExecutionRecord`     | `exportExecutionRecord` -- delegates to `serializeExecutionRecord`, wraps + stringifies                                                                                              |
| `src/utils/importExport/recordImport.ts` › `importExecutionRecord`     | `importExecutionRecord` -- parse, validate, repair, `deserializeExecutionRecord`                                                                                                     |
| `src/utils/importExport/validation.ts` › `validateGraphStateStructure` | Structural validators (`validateGraphStateStructure`, `validateExecutionRecordStructure`, `isObject`)                                                                                |
| `src/utils/importExport/stateSerializer.ts` › `StateSerializer`        | `StateSerializer` class: deep-clones, strips UI-only state (`activeDrawer`/`zones`/`zoneIndex`/`history`) and non-serializable handle fields                                         |
| `src/utils/importExport/serialization.ts`                              | Map<->Record conversion, `safeSerializeValue`, `GraphError` (de)serialization, full `ExecutionRecord` (de)serialization, handle strip/rehydrate, Immer-patch + history serialization |

Two cross-system source files are central to integration:

| File                                                                                                | Responsibility                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/organisms/FullGraph/useGraphImportExport.tsx` › `useGraphImportExport`              | The hook that owns the import/export lifecycle: export handlers, `downloadJson`, hidden file inputs, `REPLACE_STATE` dispatch, ReactFlow remount, `GraphEvent` emission, recording load |
| `src/components/organisms/FullGraph/createImportExportMenuItems.ts` › `createImportExportMenuItems` | Builds the context-menu "Import/Export" submenu                                                                                                                                         |
| `src/utils/nodeStateManagement/planApply/applyPlan.ts` › `REPLACE_STATE`                            | `REPLACE_STATE` apply case: `rehydrateAllZones` + `delete imported.history`                                                                                                             |
| `src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `rehydrateAllZones`                        | `rehydrateAllZones` -- rebuilds all switch/loop zones from imported nodes                                                                                                               |

---

## Entity-Relationship Diagram

```
+----------------------+          +-------------------------+
|  ExportedGraphState  |          | ExportedExecutionRecord |
|----------------------|          |-------------------------|
| version: 1           |          | version: 1              |
| exportedAt: string   |          | exportedAt: string      |
| state: Record<...>   |          | record: Record<...>     |
+----------------------+          +-------------------------+
         |                                 |
         | wraps (UI-only stripped)        | wraps (Maps -> Records)
         v                                 v
+----------------------+          +-------------------------+
|       State          |          |   ExecutionRecord       |
|----------------------|          |-------------------------|
| dataTypes{}          |          | id                      |
| typeOfNodes{}        |          | startTime / endTime     |
| nodes[]              |          | totalDuration           |
| edges[]              |          | warmupDuration          |
| viewport?            |          | totalPauseDuration      |
| openedNodeGroupStack?|          | status                  |
| activeDrawer?  (X)   |          | steps[]                 |
| zones?         (X)   |          | errors[]                |
| zoneIndex?     (X)   |          | concurrencyLevels[]     |
| history?       (X)   |          | loopRecords (Map)       |
+----------------------+          | groupRecords (Map)      |
    |           |                 | switchRecords (Map)     |
    |           |                 | finalValues (Map)       |
    v           v                 | viewState?              |
+--------+ +--------+             +-------------------------+
| Node   | | Edge   |                 |
|--------| |--------|                 v
| id     | | id     |       +----------------------+
| type   | | source |       | ExecutionStepRecord  |
| position | target |       |----------------------|
| data{} | | srcH   |       | stepIndex            |
|  inputs| | tgtH   |       | nodeId / nodeTypeId  |
|  output| +--------+       | nodeTypeName         |
+--------+                  | status               |
                            | inputValues (Map)    |
   (X) = stripped on export | outputValues (Map)   |
                            | error?               |
                            +----------------------+
```

`ExecutionRecord` also nests recursively: `groupRecords[id].innerRecord` is a
full `ExecutionRecord`; `loopRecords[id].iterations[].nestedLoopRecords` are
more `LoopRecord`s. Each `LoopIterationRecord` (and each `SwitchRecord`) also
carries a `nestedSwitchRecords` map, but -- like top-level `switchRecords` -- it
does not round-trip (see the lossy-switch note below).

---

## Data Flow Diagram

### State Export/Import

```
  Runtime State
       |
       v
  exportGraphState(state, options?)
       |
       |  StateSerializer.serialize:
       |  1. deepClone(state) (structuredClone, JSON fallback)
       |  2. delete activeDrawer, zones, zoneIndex, history (UI-only)
       |  3. stripDataTypes:   delete complexSchema per dataType
       |  4. stripTypeOfNodes: strip handles (inputs/panels/outputs),
       |                       strip subtree.nodes handles,
       |                       delete subtree.zones / subtree.zoneIndex
       |  5. stripNodes:       strip handles on every node
       |  6. wrap { version: 1, exportedAt, state }
       |       |
       v       v
  JSON.stringify  ------>  file download / storage
       |
       v
  importGraphState(json, options)
       |
       |  1. JSON.parse (failure -> error result)
       |  2. validateGraphStateStructure (envelope + state shape)
       |  3. if errors and no repair strategies enabled -> fail
       |  4. Apply repair strategies (if enabled), in order:
       |     - removeDuplicateNodeIds
       |     - removeDuplicateEdgeIds
       |     - removeOrphanEdges
       |     - fillMissingDefaults (viewport only)
       |  5. Rehydrate complexSchema on dataTypes from options.dataTypes
       |  6. ALWAYS rehydrate handle dataTypeObjects (inputs/panels/outputs)
       |  7. Filter errors that match repaired issues; fail if any remain
       |  8. Type-narrow via isValidState guard
       |
       v
  ImportResult<State>
       |
       | (on success, in useGraphImportExport)
       v
  Replace imported.dataTypes / typeOfNodes with live originals
       |
       v
  dispatch(REPLACE_STATE, { state })
       |              |
       |              +--> applyPlan REPLACE_STATE case:
       |                   rehydrateAllZones(imported)
       |                   imported.zones / zoneIndex = rehydrated.*
       |                   delete imported.history
       v
  setReactFlowKey(k => k + 1)  (force ReactFlow remount)
       |
       v
  emit GraphEvent { kind: 'ui:state:imported', success: true, state }
```

### Recording Export/Import

```
  Runtime ExecutionRecord
       |
       v
  exportExecutionRecord(record, options?)
       |
       |  serializeExecutionRecord:
       |  - loopRecords Map -> Record (recursive iterations + nestedLoopRecords)
       |  - groupRecords Map -> Record (recursive innerRecord, input/outputMapping)
       |  - finalValues  Map -> Record via safeSerializeValue
       |  - switchRecords Map -> Record via Object.fromEntries (shallow)
       |  - steps[]: inputValues/outputValues Map -> Record,
       |             connection + default + output values via safeSerializeValue
       |  - errors[] + step.error via serializeGraphError (originalError -> safe)
       |  - concurrencyLevels spread to array
       |  - carry warmupDuration, totalPauseDuration, viewState (if present)
       |  wrap { version: 1, exportedAt, record }
       |       |
       v       v
  JSON.stringify  ------>  file download / storage
       |
       v
  importExecutionRecord(json, options?)
       |
       |  1. JSON.parse (failure -> error result)
       |  2. validateExecutionRecordStructure (envelope + record shape)
       |  3. if errors and no repair strategies enabled -> fail
       |  4. Apply repair strategies (if enabled):
       |     - removeOrphanSteps (filter steps missing nodeId/nodeTypeId/stepIndex)
       |     - sanitizeNonSerializableValues (no-op after JSON.parse)
       |  5. Filter errors that match repaired issues; fail if any remain
       |  6. Narrow via isSerializedExecutionRecord guard
       |  7. deserializeExecutionRecord:
       |     - Records -> ReadonlyMap for all map fields
       |     - reconstruct GraphError objects (originalError stays serialized)
       |     - recursive for loops, groups; switchRecords reset to new Map()
       |
       v
  ImportResult<ExecutionRecord>
       |
       | (on success, in useGraphImportExport)
       v
  loadRecordRef.current(result.data) -> RecordValidationResult
       |                                  { valid, warnings, errors }
       v
  if (!valid) onImportError(errors); else load + emit
       'ui:recording:imported'
```

---

## System Diagram

```
+-----------------------------------------------------------------------+
|                          FullGraph Component                          |
|                  (useGraphImportExport hook + UI)                     |
|                                                                       |
|  +-------------------+     +-------------------------+                |
|  | Context Menu      |     | FileInputElements (FC)  |                |
|  | (Import/Export)   |---->| two hidden <input>      |                |
|  | createImport...() |     | type="file" accept=.json|                |
|  +-------------------+     +-------------------------+                |
|         |                        |                                    |
|         v                        v                                    |
|  handleExportState()      FileReader.readAsText()                     |
|  handleExportRecording()         |                                    |
|         |                        v                                    |
|         v                  handleImportState(text)                    |
|  exportGraphState()        handleImportRecording(text)                |
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
|                         | + Rehydration / |                           |
|                         |   Deserialize   |                           |
|                         +-----------------+                           |
|                                  |                                    |
|                     +------------+-------------+                      |
|                     v                          v                      |
|       dispatch(REPLACE_STATE)        loadRecordRef.current(record)    |
|       (applyPlan rehydrates zones,   -> RecordValidationResult        |
|        deletes history)                                               |
|       + setReactFlowKey(k => k+1)                                     |
|       + emit GraphEvent              + emit GraphEvent                |
+-----------------------------------------------------------------------+
```

---

## State Export

### exportGraphState

**Signature:** `exportGraphState(state, options?) -> string`

**Location:** `src/utils/importExport/stateExport.ts` › `exportGraphState`

Takes a runtime `State` object and returns a JSON string. It is a thin wrapper:
it calls `StateSerializer.serialize(state)` to build the envelope, then
`JSON.stringify(envelope, null, options?.pretty ? 2 : undefined)`.

```ts
type ExportedGraphState = {
  version: 1;
  exportedAt: string; // ISO 8601, from new Date().toISOString()
  state: Record<string, unknown>;
};
```

`exportGraphState` is fully generic over
`<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>`,
mirroring the `State` generics.

**Options (`ExportOptions`):**

| Option   | Type      | Default | Description                   |
| -------- | --------- | ------- | ----------------------------- |
| `pretty` | `boolean` | `false` | 2-space indent in output JSON |

### StateSerializer class

**Location:** `src/utils/importExport/stateSerializer.ts` › `StateSerializer`

`StateSerializer` is a static utility class that encapsulates the
clone-and-strip logic. `exportGraphState` and the public barrel both re-export
it.

**`StateSerializer.serialize(state)`** does, in order:

1. `deepClone(state)` -- `structuredClone` with a JSON-stringify fallback.
2. Delete **UI-only state** that must not be exported:
   `delete cloned.activeDrawer`, `delete cloned.zones`,
   `delete cloned.zoneIndex`, `delete cloned.history`.
3. `StateSerializer.stripDataTypes(cloned)` -- non-serializable dataType fields.
4. `StateSerializer.stripTypeOfNodes(cloned)` -- non-serializable node-type
   fields.
5. `StateSerializer.stripNodes(cloned)` (private) -- node-instance handle
   fields.
6. Wrap in
   `{ version: 1, exportedAt: new Date().toISOString(), state: cloned }`.

**Static methods:**

| Method                         | Behavior                                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serialize(state)`             | The full pipeline above; returns an `ExportedGraphState`.                                                                                                                                                  |
| `serializeNode(node)`          | Public helper that strips non-serializable handle fields from a single (already-cloned) node via `stripNodeHandles`. Returns a new node object.                                                            |
| `stripDataTypes(cloned)`       | For each dataType, replaces it with `stripComplexSchema(dataType)` (removes the Zod `complexSchema`). Mutates in place.                                                                                    |
| `stripTypeOfNodes(cloned)`     | For each node type: strips `inputs` (panels + plain handles) and `outputs`; if a `subtree` exists, strips `subtree.nodes` handles **and deletes `subtree.zones` / `subtree.zoneIndex`**. Mutates in place. |
| `stripNodes(cloned)` (private) | Maps each node through `stripNodeHandles`. Mutates `cloned.nodes` in place.                                                                                                                                |

### What is serialized and what is stripped

After deep-cloning, the serializer removes two categories of data.

**UI-only / runtime state (deleted wholesale):**

| Field               | Location                            | Reason                                       |
| ------------------- | ----------------------------------- | -------------------------------------------- |
| `activeDrawer`      | `state.activeDrawer`                | Transient UI (open drawer)                   |
| `zones`             | `state.zones`                       | Derived; rehydrated on import                |
| `zoneIndex`         | `state.zoneIndex`                   | Derived from zones                           |
| `history`           | `state.history`                     | Undo/redo stacks; import always starts fresh |
| `subtree.zones`     | `typeOfNodes[id].subtree.zones`     | Derived (group-node subtree)                 |
| `subtree.zoneIndex` | `typeOfNodes[id].subtree.zoneIndex` | Derived (group-node subtree)                 |

**Non-serializable handle/dataType fields (deleted per object):**

| Field           | Location                                               | Action                 |
| --------------- | ------------------------------------------------------ | ---------------------- |
| `complexSchema` | `dataTypes[id].complexSchema`                          | Deleted (Zod instance) |
| `onChange`      | Handle objects (inputs/outputs)                        | Deleted (callback)     |
| `complexSchema` | `handle.dataType.dataTypeObject.complexSchema`         | Deleted (Zod instance) |
| `complexSchema` | `handle.inferredDataType.dataTypeObject.complexSchema` | Deleted (Zod instance) |

Handle stripping (`stripHandleNonSerializable`) is applied to:

- Top-level `state.dataTypes` (via `stripComplexSchema`)
- Top-level `state.typeOfNodes` inputs/outputs (including panel-nested inputs)
- `typeOfNodes[id].subtree.nodes` handles (group-node definitions)
- `state.nodes[].data.inputs` (including panels) and
  `state.nodes[].data.outputs`

Everything else (node positions, edge connections, viewport, feature flags such
as `enableTypeInference`, the `openedNodeGroupStack`) passes through unchanged.

---

## State Import

### importGraphState

**Signature:** `importGraphState(json, options) -> ImportResult<State>`

**Location:** `src/utils/importExport/stateImport.ts` › `importGraphState`

Parses a JSON string, validates, repairs, and rehydrates it back to a full
`State` object. The `options` argument is **required** (unlike record import).

> Note: there is no `StateDeserializer` class. As documented at the top of
> `stateImport.ts`, import involves validation, repair, and rehydration --
> concerns that don't map cleanly onto a serialize/deserialize pair -- so the
> import logic lives as plain functions.

### StateImportOptions

```ts
type StateImportOptions<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /** Live data type definitions (source of truth for Zod schemas) */
  dataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >;
  /** Live node type definitions (source of truth for handle structure) */
  typeOfNodes: Record<
    NodeTypeUniqueId,
    TypeOfNode<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >;
  /** Called for each validation issue (error and warning) found during import */
  onValidationError?: (issue: ValidationIssue) => void;
  /** Repair strategies to apply (all default to false) */
  repair?: Partial<StateRepairStrategies>;
};
```

`dataTypes` and `typeOfNodes` are **required** because they carry the
non-serializable fields (Zod schemas, callbacks) that were stripped during
export. `onValidationError` is invoked for every issue (both severities).

### Validation (validateGraphStateStructure)

**Location:** `src/utils/importExport/validation.ts` ›
`validateGraphStateStructure`

Checks the parsed JSON against the expected structure and returns an array of
`ValidationIssue` objects. It does NOT check semantic correctness (e.g. whether
handle dataType IDs exist in `dataTypes`).

**Checks performed:**

| Path                | Check                                                                                                                                                                                  | Severity                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| (root)              | Must be an object                                                                                                                                                                      | error                        |
| `version`           | Must equal `1`                                                                                                                                                                         | error                        |
| `exportedAt`        | Must be a string                                                                                                                                                                       | warning                      |
| `state`             | Must be an object (otherwise returns early)                                                                                                                                            | error                        |
| `state.dataTypes`   | Must be an object; each entry must have `name` (string) and `underlyingType` (string)                                                                                                  | error                        |
| `state.typeOfNodes` | Must be an object; each entry must have `name` (string), `inputs` (array), `outputs` (array)                                                                                           | error                        |
| `state.nodes`       | Must be an array; each node must have `id` (string), optional `type` (string if present), `position` (`{x: number, y: number}`); duplicate node IDs flagged                            | error (dup = warning)        |
| `state.edges`       | Must be an array; each edge must have `id`, `source`, `target`, `sourceHandle`, `targetHandle` (all strings); duplicate IDs and orphan source/target (when node set non-empty) flagged | error (dup/orphan = warning) |

### Repair Strategies (StateRepairStrategies)

All five strategies are `boolean` and default to `false`; the importer only runs
them when explicitly enabled. If structural errors exist but **no** repair flag
is truthy, the import fails immediately.

| Strategy                   | What it does                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `removeDuplicateNodeIds`   | Keeps the first occurrence of each node ID, drops later duplicates                                                                                      |
| `removeDuplicateEdgeIds`   | Keeps the first occurrence of each edge ID, drops later duplicates                                                                                      |
| `removeOrphanEdges`        | Removes edges whose `source` or `target` is not a known node ID (computed after node dedup). Pushes a warning with the removed count                    |
| `fillMissingDefaults`      | If `state.viewport` is `undefined`, sets it to `{ x: 0, y: 0, zoom: 1 }`. (The type comment mentions "feature flags" but the code only fills viewport.) |
| `rehydrateDataTypeObjects` | Declared in the type and accepted in the API, but rehydration of handle `dataTypeObject`s runs unconditionally regardless of this flag                  |

**Repair order:**

1. `removeDuplicateNodeIds`
2. `removeDuplicateEdgeIds`
3. `removeOrphanEdges` (uses the node set after dedup)
4. `fillMissingDefaults`

After repair, the importer filters out the errors that correspond to repaired
issues -- matching on message substrings (`"Duplicate node ID"`,
`"Duplicate edge ID"`, `"not found"`) and the `viewport` path. If any unrepaired
error remains, the import fails with those errors.

### Rehydration of live definitions

Two rehydration passes run after repair (the second is **not** gated by any
repair flag):

1. **complexSchema on dataTypes:** For each imported dataType ID, if the
   matching entry in `options.dataTypes` has a truthy `complexSchema`, it is
   copied onto the imported dataType
   (`dt.complexSchema = providedDt.complexSchema`).

2. **handle dataTypeObjects (always):** Each node runs through
   `rehydrateNodeHandles`, which walks `data.inputs` (including panel-nested
   `inputs`) and `data.outputs` and calls `rehydrateHandleDataType`. That helper
   replaces `handle.dataType.dataTypeObject` and
   `handle.inferredDataType.dataTypeObject` with the full live dataType from the
   provided `dataTypes` map, keyed by `dataTypeUniqueId`.

Finally the result is narrowed with the `isValidState` type guard (checks for
the presence of `nodes`, `edges`, `dataTypes`, `typeOfNodes`) before returning
`{ success: true, data: state, warnings }`.

> The importer does **not** rebuild zones or restore history. That is the
> reducer's job: when `useGraphImportExport` dispatches `REPLACE_STATE`, the
> `applyPlan` case calls `rehydrateAllZones(imported)` to derive
> `zones`/`zoneIndex` and `delete imported.history`. See
> [Integration](#integration-with-fullgraph) and
> [Relationships](#--state-management-replace_state--zone-rehydration).

---

## Recording Export

### exportExecutionRecord

**Signature:** `exportExecutionRecord(record, options?) -> string`

**Location:** `src/utils/importExport/recordExport.ts` › `exportExecutionRecord`

Delegates to `serializeExecutionRecord(record)` to produce a JSON-safe plain
object, wraps it in an `ExportedExecutionRecord` envelope
(`{ version: 1, exportedAt, record }`), and stringifies it.

```ts
type ExportedExecutionRecord = {
  version: 1;
  exportedAt: string;
  record: Record<string, unknown>;
};
```

### serializeExecutionRecord

**Location:** `src/utils/importExport/serialization.ts` ›
`serializeExecutionRecord`

`ExecutionRecord` and its nested types use `ReadonlyMap` extensively and embed
`GraphError` (with an arbitrary `originalError`) and arbitrary handle values.
Serialization produces the JSON-safe `SerializedExecutionRecord` shape:

| Runtime field                                           | Serialized form / handling                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `startTime`, `endTime`, `totalDuration`, `status` | Copied through                                                                                                                                                                               |
| `warmupDuration`, `totalPauseDuration`                  | Copied through                                                                                                                                                                               |
| `steps[]`                                               | Each via `serializeStepRecord`                                                                                                                                                               |
| `step.inputValues` (Map by handleName)                  | `Record<string, SerializedRecordedInputHandleValue>`; each connection `value` + `defaultValue` run through `safeSerializeValue`                                                              |
| `step.outputValues` (Map by handleName)                 | `Record<string, SerializedRecordedOutputHandleValue>`; `value` run through `safeSerializeValue`                                                                                              |
| `step.error?`                                           | `serializeGraphError` (or `undefined`)                                                                                                                                                       |
| `errors[]`                                              | Each via `serializeGraphError`                                                                                                                                                               |
| `concurrencyLevels`                                     | Spread into a plain array                                                                                                                                                                    |
| `loopRecords` (Map)                                     | `Record<string, SerializedLoopRecord>` (recursive: iterations -> stepRecords + `nestedLoopRecords`; each iteration's `nestedSwitchRecords` map is **not** converted and does not round-trip) |
| `groupRecords` (Map)                                    | `Record<string, SerializedGroupRecord>` (recursive: `innerRecord` is a full `SerializedExecutionRecord`; `inputMapping`/`outputMapping` -> Record)                                           |
| `switchRecords` (Map)                                   | `Object.fromEntries([...(record.switchRecords ?? new Map())])` -- a **shallow** Record, not deeply serialized                                                                                |
| `finalValues` (Map)                                     | `Record<string, unknown>` via `safeSerializeValue`                                                                                                                                           |
| `viewState?`                                            | Carried through only when present (`...(record.viewState ? { viewState } : {})`)                                                                                                             |

Notes:

- `GraphError.originalError` is passed through `safeSerializeValue` (an `Error`
  instance becomes `{ __type: "Error", name, message, stack }`).
- `GroupRecord.innerRecord` recurses through the entire
  `serializeExecutionRecord` pipeline (node groups can nest arbitrarily deep).
- `LoopIterationRecord.nestedLoopRecords` is only emitted when non-empty.
- `LoopIterationRecord.nestedSwitchRecords` and
  `SwitchRecord.nestedSwitchRecords` are **not** converted by
  `serializeLoopIterationRecord` -- the `Map` rides the `...iter` spread
  untouched, so it serializes to `{}` and does not round-trip (the same loss as
  top-level `switchRecords`).
- `switchRecords` is intentionally shallow on export and is **not**
  reconstructed on import (see below).

---

## Recording Import

### importExecutionRecord

**Signature:**
`importExecutionRecord(json, options?) -> ImportResult<ExecutionRecord>`

**Location:** `src/utils/importExport/recordImport.ts` › `importExecutionRecord`

`options` is optional here (unlike state import) -- a record can be
reconstructed entirely from its own JSON.

### RecordImportOptions

```ts
type RecordImportOptions = {
  onValidationError?: (issue: ValidationIssue) => void;
  repair?: Partial<RecordRepairStrategies>;
};
```

### Validation (validateExecutionRecordStructure)

**Location:** `src/utils/importExport/validation.ts` ›
`validateExecutionRecordStructure`

| Path                       | Check                                                                                                                                                                             | Severity |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| (root)                     | Must be an object                                                                                                                                                                 | error    |
| `version`                  | Must equal `1`                                                                                                                                                                    | error    |
| `exportedAt`               | Must be a string                                                                                                                                                                  | warning  |
| `record`                   | Must be an object (otherwise returns early)                                                                                                                                       | error    |
| `record.id`                | Must be a string                                                                                                                                                                  | error    |
| `record.startTime`         | Must be a number                                                                                                                                                                  | error    |
| `record.endTime`           | Must be a number                                                                                                                                                                  | error    |
| `record.totalDuration`     | Must be a number                                                                                                                                                                  | error    |
| `record.status`            | Must be one of: `completed`, `errored`, `cancelled`                                                                                                                               | error    |
| `record.steps[]`           | Each must have `stepIndex` (number), `nodeId` (string), `nodeTypeId` (string), `status` (one of `completed`/`errored`/`skipped`), `inputValues` (object), `outputValues` (object) | error    |
| `record.errors`            | Must be an array                                                                                                                                                                  | warning  |
| `record.concurrencyLevels` | Must be an array                                                                                                                                                                  | warning  |
| `record.loopRecords`       | If present, must be an object                                                                                                                                                     | warning  |
| `record.groupRecords`      | If present, must be an object                                                                                                                                                     | warning  |
| `record.finalValues`       | If present, must be an object                                                                                                                                                     | warning  |

> The validator does not check `warmupDuration`, `totalPauseDuration`,
> `switchRecords`, or `viewState`; the deserializer supplies sane defaults for
> the first two, resets `switchRecords` to an empty Map, and only carries
> `viewState` when present.

### Repair Strategies (RecordRepairStrategies)

| Strategy                        | What it does                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `removeOrphanSteps`             | Filters out steps missing required fields (`nodeId`, `nodeTypeId`, `stepIndex`). Pushes a warning with the removed count |
| `sanitizeNonSerializableValues` | No-op in practice (values are already JSON after `JSON.parse`); kept for API symmetry                                    |

As with state import: if there are structural errors and no repair flag is
truthy, the import fails immediately. After repair, errors whose `path` includes
`"steps"` are dropped if `removeOrphanSteps` is enabled; any remaining errors
fail the import.

### deserializeExecutionRecord

**Location:** `src/utils/importExport/serialization.ts` ›
`deserializeExecutionRecord`

After repair, the record is narrowed via `isSerializedExecutionRecord` (checks
`id` string, `status` string, `steps` array, `errors` array), then deserialized:

- All `Record` map fields become `ReadonlyMap`. `loopRecords`, `groupRecords`,
  and `finalValues` are rebuilt with explicit `new Map()` loops (so each value
  can be deserialized as it is inserted); per-step `inputValues`/`outputValues`
  and group `inputMapping`/`outputMapping` go through the `recordToReadonlyMap`
  helper.
- `GraphError` objects are reconstructed via `deserializeGraphError` (the
  `originalError` remains in its serialized form -- a real `Error` cannot be
  rebuilt).
- Loops deserialize recursively (`iterations` -> `stepRecords` +
  `nestedLoopRecords`); groups deserialize recursively (`innerRecord`).
- `warmupDuration` and `totalPauseDuration` default to `0` if absent.
- `concurrencyLevels` defaults to `[]` if absent.
- **`switchRecords` is reset to `new Map()`** -- switch records are not
  round-tripped.
- `viewState` is carried only when present.

---

## Serialization Helpers

These are exported from the barrel for advanced usage: `mapToRecord`,
`recordToReadonlyMap`, `safeSerializeValue`, `serializeGraphError`,
`deserializeGraphError`, `serializeExecutionRecord`,
`deserializeExecutionRecord`. (Helpers such as `deepClone`,
`stripComplexSchema`, `stripHandleNonSerializable`, `rehydrateHandleDataType`,
`isSerializedExecutionRecord`, `serializePatch`, and `serializeHistoryEntry` are
exported from `serialization.ts` for internal use but are not on the public
package barrel.)

### mapToRecord / recordToReadonlyMap

```ts
mapToRecord<T>(map: ReadonlyMap<string, T>): Record<string, T>
recordToReadonlyMap<T>(obj: Record<string, T> | null | undefined): ReadonlyMap<string, T>
```

Bidirectional conversion between `ReadonlyMap` and plain objects.
`recordToReadonlyMap` returns an empty Map for `null`/`undefined`.

### safeSerializeValue

```ts
safeSerializeValue(value: unknown): unknown
```

Recursively makes a value JSON-safe:

| Input type                    | Output                                                    |
| ----------------------------- | --------------------------------------------------------- |
| `null`, `undefined`           | Pass through                                              |
| `string`, `number`, `boolean` | Pass through                                              |
| `function`                    | `"[Function]"`                                            |
| `symbol`                      | `` `[Symbol: ${value.toString()}]` ``                     |
| `bigint`                      | `value.toString()`                                        |
| `Map`                         | Converted to `Record` (keys stringified), values recursed |
| `Set`                         | Converted to array, values recursed                       |
| `Error`                       | `{ __type: "Error", name, message, stack }`               |
| `Array`                       | Elements recursed                                         |
| Plain object                  | Values recursed                                           |
| Other                         | `String(value)`                                           |

### serializeGraphError / deserializeGraphError

`serializeGraphError(err)` spreads the `GraphError`, copies `path` to a fresh
array (`[...err.path]`), and runs `originalError` through `safeSerializeValue`.

`deserializeGraphError(obj)` spreads back, ensures `path` is an array
(defaulting to `[]`), and keeps `originalError` in its serialized form -- the
original `Error` instance cannot be reconstructed.

### deepClone / stripComplexSchema / stripHandleNonSerializable / rehydrateHandleDataType

(Internal to `serialization.ts`, used by `StateSerializer` and the importer.)

- `deepClone(value)` tries `structuredClone`; on failure (e.g. functions, Zod
  schemas) it falls back to `JSON.parse(JSON.stringify(...))` with a replacer
  that drops functions and symbols. Callers must ensure JSON-safe input or strip
  non-serializable fields first.
- `stripComplexSchema(dataType)` returns a copy without `complexSchema`.
- `stripHandleNonSerializable(handle)` deletes `onChange` and strips
  `complexSchema` from `dataType.dataTypeObject` and
  `inferredDataType.dataTypeObject`.
- `rehydrateHandleDataType(handle, dataTypes)` re-attaches the live dataType
  object (carrying its Zod schema) to a handle's `dataType` and
  `inferredDataType`, keyed by `dataTypeUniqueId`.

### serializePatch / serializeHistoryEntry

**Location:** `src/utils/importExport/serialization.ts` › `serializePatch`

Helpers for serializing undo/redo history (an Immer-patch subsystem). They make
each Immer `Patch`'s `value` JSON-safe via `safeSerializeValue` and produce a
`SerializedHistoryEntry` (`patches`, `inversePatches`, `actionType`,
`timestamp`). These build on the
[history subsystem](../core/stateManagementDoc.md#history-subsystem) defined in
`src/components/organisms/FullGraph/historyTypes.ts`.

> **Important:** these history helpers exist but are **not** currently wired
> into any exporter. `StateSerializer.serialize` deletes `history` before
> serialization, and `REPLACE_STATE` deletes any incoming `history`, so history
> never round-trips today. The helpers are infrastructure for a future "Export
> with History" path.

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

Both `validateGraphStateStructure` and `validateExecutionRecordStructure` are
exported on the public barrel for standalone use.

### ImportResult type

```ts
type ImportResult<T> =
  | { success: true; data: T; warnings: ValidationIssue[] }
  | { success: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };
```

Discriminated union on `success`. On failure, `errors` contains the unrepaired
issues (or a single envelope/parse error). On success, `warnings` may still
contain informational issues (missing `exportedAt`, repaired-orphan counts,
etc.).

---

## Integration with FullGraph

The lifecycle is owned by the `useGraphImportExport` hook
(`src/components/organisms/FullGraph/useGraphImportExport.tsx` ›
`useGraphImportExport`), consumed by `FullGraph`.

### Context menu items

`createImportExportMenuItems`
(`src/components/organisms/FullGraph/createImportExportMenuItems.ts` ›
`createImportExportMenuItems`) returns a single top-level `ContextMenuItem`
(with `separator: true`) whose `subItems` form the submenu:

```
Import/Export (ArrowDownUpIcon)
  +-- Export State      (FileOutputIcon)   -> onExportState
  +-- Import State      (FileInputIcon)    -> onImportState
  +-- Export Recording  (FileOutputIcon, separator) -> onExportRecording
  +-- Import Recording  (FileInputIcon)    -> onImportRecording
```

The config object (`ImportExportMenuItemsConfig`) receives the four callbacks
and a `closeMenu` function; every `onClick` calls its callback then
`closeMenu()`.

### Hidden file inputs (FileInputElements)

The hook returns a `FileInputElements` React FC that renders two hidden
`<input type="file" accept=".json" className="hidden">` elements, wired to
`importStateInputRef` and `importRecordingInputRef`:

| Ref                       | Purpose                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `importStateInputRef`     | "Import State" target. On change, reads text via `FileReader` and calls `handleImportState(text)`         |
| `importRecordingInputRef` | "Import Recording" target. On change, reads text via `FileReader` and calls `handleImportRecording(text)` |

Both reset `e.target.value = ''` after reading so the same file can be
re-imported. The hook deliberately captures `onGraphEvent` in a ref
(`onGraphEventRef`) so that parent re-renders don't recreate `FileInputElements`
and detach the inputs between the menu click and the file selection.

### handleImportState

`handleImportState(json)` calls `importGraphState` with `state.dataTypes` /
`state.typeOfNodes` as the live definitions and **all** repair strategies on
(`removeOrphanEdges`, `removeDuplicateNodeIds`, `removeDuplicateEdgeIds`,
`fillMissingDefaults`, `rehydrateDataTypeObjects`). On success it:

1. Replaces the imported `dataTypes` and `typeOfNodes` with the live originals
   (these are immutable type definitions that should never be the
   schema-stripped JSON copies):
   ```ts
   const importedState = {
     ...result.data,
     dataTypes: state.dataTypes,
     typeOfNodes: state.typeOfNodes,
   };
   ```
2. Dispatches
   `{ type: actionTypesMap.REPLACE_STATE, payload: { state: importedState } }`.
   The reducer's `REPLACE_STATE` apply then `rehydrateAllZones` and deletes any
   `history`.
3. Calls `setReactFlowKey(k => k + 1)` to force a full ReactFlow remount, so
   Handle registration happens in sync with edge rendering.
4. Emits `GraphEvent { kind: 'ui:state:imported', success: true, state }` (via
   the ref) and calls the optional `onStateImported(importedState)` prop.

On failure it maps `result.errors` to `` `${e.path}: ${e.message}` `` strings,
emits `{ kind: 'ui:state:imported', success: false, errors }`, and calls
`onImportError(errors)`.

### handleImportRecording

`handleImportRecording(json)` calls `importExecutionRecord` with
`{ repair: { sanitizeNonSerializableValues: true, removeOrphanSteps: true } }`.
On success it feeds the deserialized record into the runner via
`loadRecordRef.current(...)`, which returns a
`RecordValidationResult { valid, warnings, errors }`:

- If `!valid`, calls `onImportError(loadResult.errors)` and stops.
- If `valid` with warnings, logs them via `console.warn` but still loads.
- Emits `GraphEvent { kind: 'ui:recording:imported' }` and calls the optional
  `onRecordingImported(result.data)` prop.

On failure it maps errors and calls `onImportError`.

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
`graph-state.json` for state, `execution-recording.json` for recordings. Both
export handlers pass `{ pretty: true }`.

---

## Limitations and Deprecated Patterns

1. **UI-only state never round-trips.** `activeDrawer`, `zones`, `zoneIndex`,
   and `history` are deleted on export. Zones are rebuilt on import
   (`rehydrateAllZones`); history starts empty.

2. **Non-serializable handle fields are lost during export.** `complexSchema`
   (Zod instances) and `onChange` callbacks are stripped. On import they are
   supplied via the `dataTypes`/`typeOfNodes` options (and in `FullGraph`, by
   replacing those wholesale with the live originals).

3. **Live definitions required on state import.** The importer cannot
   reconstruct Zod schemas or callbacks from JSON. `importGraphState`'s
   `options` is therefore mandatory.

4. **`rehydrateDataTypeObjects` is effectively always-on.** The flag exists in
   the API for symmetry, but handle `dataTypeObject` rehydration runs
   unconditionally.

5. **Error objects are not fully round-trippable.** `GraphError.originalError`
   is serialized to `{ __type: "Error", name, message, stack }` (or another safe
   form) and preserved as-is on import; it is never rebuilt into a real `Error`.

6. **Switch records are lossy.** Top-level `switchRecords` is shallow-serialized
   on export via `Object.fromEntries` and **reset to an empty Map on import**.
   `nestedSwitchRecords` (on every `LoopIterationRecord` and `SwitchRecord`) is
   likewise dropped -- `serializeLoopIterationRecord` never converts it, so the
   `Map` serializes to `{}`. Loop and group records, by contrast, round-trip
   recursively (their `stepRecords`, `nestedLoopRecords`, and `innerRecord` are
   preserved).

7. **Map fields become Records.** `ReadonlyMap<string, T>` fields in
   `ExecutionRecord` become `Record<string, T>` in JSON and are converted back
   on import; key ordering is not guaranteed.

8. **History serialization is unwired.**
   `serializePatch`/`serializeHistoryEntry` exist but no exporter calls them;
   history is always stripped.

9. **Version is always `1`.** There is no migration system -- a different
   envelope version fails validation.

10. **ReactFlow remount on state import.** After a state import, `FullGraph`
    increments a key on `<ReactFlow>` (`setReactFlowKey`) to force a remount,
    because Handle registration must happen in sync with edge rendering.

---

## Examples

### Exporting and downloading graph state

```ts
import { exportGraphState } from '@theclearsky/react-blender-nodes';

const json = exportGraphState(state, { pretty: true });
// json is a string -- save to file, send to server, etc.
```

### Importing graph state with repair

```ts
import {
  importGraphState,
  actionTypesMap,
} from '@theclearsky/react-blender-nodes';

const result = importGraphState(json, {
  dataTypes: myDataTypes, // live definitions (required)
  typeOfNodes: myTypeOfNodes, // live definitions (required)
  onValidationError: (issue) => console.warn(issue.path, issue.message),
  repair: {
    removeOrphanEdges: true,
    removeDuplicateNodeIds: true,
    removeDuplicateEdgeIds: true,
    fillMissingDefaults: true,
    normalizeConnectionOrder: true, // repack imported fan-in connection orders to 0..n-1
  },
});

if (result.success) {
  // Replace stripped JSON definitions with the live originals before dispatch.
  const importedState = {
    ...result.data,
    dataTypes: myDataTypes,
    typeOfNodes: myTypeOfNodes,
  };
  // REPLACE_STATE rehydrates zones and clears history inside applyPlan.
  dispatch({
    type: actionTypesMap.REPLACE_STATE,
    payload: { state: importedState },
  });
} else {
  console.error(result.errors); // unrepaired validation issues
}
```

### Exporting and importing execution recordings

```ts
import {
  exportExecutionRecord,
  importExecutionRecord,
} from '@theclearsky/react-blender-nodes';

// Export
const json = exportExecutionRecord(record, { pretty: true });

// Import
const result = importExecutionRecord(json, {
  repair: { removeOrphanSteps: true },
});

if (result.success) {
  const { valid, warnings, errors } = runner.loadRecord(result.data);
  if (!valid) console.error(errors);
}
```

### Using validation standalone

```ts
import {
  validateGraphStateStructure,
  validateExecutionRecordStructure,
} from '@theclearsky/react-blender-nodes';

const parsed = JSON.parse(jsonString);
const issues = validateGraphStateStructure(parsed);
const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');
```

---

## Relationships with Other Features

### -> [State Management (REPLACE_STATE + zone rehydration)](../core/stateManagementDoc.md)

On successful state import, `useGraphImportExport` dispatches
`actionTypesMap.REPLACE_STATE` with the rehydrated state (after replacing
`dataTypes`/`typeOfNodes` with live originals). This is the only action that
wholesale replaces the graph state. Its `applyPlan` case
(`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `REPLACE_STATE`) calls
`rehydrateAllZones(imported)` to rebuild `zones`/`zoneIndex` and
`delete imported.history`. `REPLACE_STATE` is non-undoable.

### -> [Execution Recording (ExecutionRecord serialization)](../runner/executionRecordingDoc.md)

The recording export/import serializes the full `ExecutionRecord` type from the
runner (`src/utils/nodeRunner/types.ts` › `ExecutionRecord`), including nested
`LoopRecord`, `LoopIterationRecord`, `GroupRecord`, `ExecutionStepRecord`,
`GraphError`, `ConcurrencyLevelRecord`, and `RecordingViewState`. All
`ReadonlyMap` fields are bidirectionally converted, except `switchRecords`,
which is lossy.

### -> [Runner Hook (loadRecord)](../runner/runnerHookDoc.md)

Recording import feeds the deserialized `ExecutionRecord` into the runner via
`loadRecordRef.current(result.data)`. The runner's `loadRecord` returns a
`RecordValidationResult` (`{ valid, warnings, errors }`) that the import handler
checks before completing.

### -> [FullGraph (UI integration)](../ui/fullGraphDoc.md)

`FullGraph` (via `useGraphImportExport`) owns the import/export lifecycle:
export callbacks, hidden file inputs (`FileInputElements`), `downloadJson`,
state replacement, ReactFlow remount, and `GraphEvent` emission. The
`onStateImported`, `onRecordingImported`, and `onImportError` props (plus the
unified `onGraphEvent` stream) let parent components react to import events.

### -> [Context Menu (menu items)](../ui/contextMenuDoc.md)

`createImportExportMenuItems` returns a `ContextMenuItem[]` whose single entry
(rendered with a separator) carries the Import/Export submenu, spread into the
right-click context menu alongside the node-creation items.
