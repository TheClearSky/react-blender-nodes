import type {
  GraphError,
  GraphErrorPathEntry,
  ExecutionRecord,
  ExecutionStepRecord,
  LoopRecord,
  LoopIterationRecord,
  SwitchRecord,
  GroupRecord,
  ConcurrencyLevelRecord,
  RecordedInputHandleValue,
  RecordedOutputHandleValue,
  RecordedInputConnection,
} from '../nodeRunner/types';
import { isObject } from './validation';

// ─────────────────────────────────────────────────────
// Map ↔ Record conversion
// ─────────────────────────────────────────────────────

/**
 * Convert a ReadonlyMap to a plain Record for JSON serialization.
 */
function mapToRecord<T>(map: ReadonlyMap<string, T>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of map) {
    result[key] = value;
  }
  return result;
}

/**
 * Convert a plain Record back to a ReadonlyMap.
 */
function recordToReadonlyMap<T>(
  obj: Record<string, T> | null | undefined,
): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  if (obj == null) return map;
  for (const [key, value] of Object.entries(obj)) {
    map.set(key, value);
  }
  return map;
}

// ─────────────────────────────────────────────────────
// Safe value serialization
// ─────────────────────────────────────────────────────

/**
 * Safely serialize a value for JSON. Primitives, plain objects, and arrays
 * pass through unchanged. Functions, symbols, and other non-serializable
 * values are replaced with a placeholder string.
 */
function safeSerializeValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean')
    return value;
  if (type === 'function') return '[Function]';
  if (type === 'symbol') return `[Symbol: ${value.toString()}]`;
  if (type === 'bigint') return value.toString();

  // Cycle guard: `seen` tracks the ANCESTORS on the current path (added on the
  // way down, removed on the way back up) so a self-referential container
  // (e.g. a node output where `o.self = o`) becomes `[Circular]` instead of
  // overflowing the stack — while a value merely shared by two siblings (a DAG,
  // not a cycle) still serializes fully.
  if (typeof value === 'object' && seen.has(value)) return '[Circular]';

  if (value instanceof Map) {
    seen.add(value);
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value) {
      obj[String(k)] = safeSerializeValue(v, seen);
    }
    seen.delete(value);
    return obj;
  }

  if (value instanceof Set) {
    seen.add(value);
    const result = [...value].map((v) => safeSerializeValue(v, seen));
    seen.delete(value);
    return result;
  }

  if (value instanceof Error) {
    return {
      __type: 'Error',
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    seen.add(value);
    const result = value.map((v) => safeSerializeValue(v, seen));
    seen.delete(value);
    return result;
  }

  if (isObject(value)) {
    // Plain object — recursively serialize values
    seen.add(value);
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = safeSerializeValue(v, seen);
    }
    seen.delete(value);
    return obj;
  }

  return String(value);
}

// ─────────────────────────────────────────────────────
// GraphError serialization
// ─────────────────────────────────────────────────────

/** Serialized form of a GraphError (JSON-safe). */
type SerializedGraphError = Omit<GraphError, 'originalError' | 'path'> & {
  originalError: unknown;
  path: ReadonlyArray<GraphErrorPathEntry>;
};

/**
 * Serialize a GraphError to a JSON-safe form.
 * `originalError` (which can be an Error object or anything) is
 * converted to a structured JSON-safe representation.
 */
function serializeGraphError(err: GraphError): SerializedGraphError {
  return {
    ...err,
    path: [...err.path],
    originalError: safeSerializeValue(err.originalError),
  };
}

/**
 * Deserialize a serialized GraphError back to the original type.
 * The `originalError` remains in its serialized form since the
 * original Error instance cannot be reconstructed.
 */
function deserializeGraphError(obj: SerializedGraphError): GraphError {
  return {
    ...obj,
    path: Array.isArray(obj.path) ? obj.path : [],
    originalError: obj.originalError,
  };
}

// ─────────────────────────────────────────────────────
// Serialized record shapes (JSON-safe equivalents of runtime types)
//
// These mirror the runtime types but with ReadonlyMap replaced by
// Record (for JSON compatibility). Structural validation guarantees
// the parsed JSON matches these shapes before deserialization.
// ─────────────────────────────────────────────────────

type SerializedRecordedInputHandleValue = Omit<
  RecordedInputHandleValue,
  'connections'
> & {
  connections: ReadonlyArray<RecordedInputConnection>;
  defaultValue?: unknown;
};

type SerializedRecordedOutputHandleValue = Omit<
  RecordedOutputHandleValue,
  'value'
> & {
  value: unknown;
};

type SerializedStepRecord = Omit<
  ExecutionStepRecord,
  'inputValues' | 'outputValues' | 'error'
> & {
  inputValues: Record<string, SerializedRecordedInputHandleValue>;
  outputValues: Record<string, SerializedRecordedOutputHandleValue>;
  error?: SerializedGraphError;
};

type SerializedLoopIterationRecord = Omit<
  LoopIterationRecord,
  'stepRecords' | 'nestedLoopRecords' | 'nestedSwitchRecords'
> & {
  stepRecords: ReadonlyArray<SerializedStepRecord>;
  nestedLoopRecords?: Record<string, SerializedLoopRecord>;
  nestedSwitchRecords?: Record<string, SerializedSwitchRecord>;
};

type SerializedLoopRecord = Omit<LoopRecord, 'iterations'> & {
  iterations: ReadonlyArray<SerializedLoopIterationRecord>;
};

type SerializedSwitchRecord = Omit<
  SwitchRecord,
  'stepRecords' | 'nestedLoopRecords' | 'nestedSwitchRecords'
> & {
  stepRecords: ReadonlyArray<SerializedStepRecord>;
  nestedLoopRecords?: Record<string, SerializedLoopRecord>;
  nestedSwitchRecords?: Record<string, SerializedSwitchRecord>;
};

type SerializedGroupRecord = Omit<
  GroupRecord,
  'innerRecord' | 'inputMapping' | 'outputMapping'
> & {
  innerRecord: SerializedExecutionRecord;
  inputMapping: Record<string, unknown>;
  outputMapping: Record<string, unknown>;
};

type SerializedExecutionRecord = Omit<
  ExecutionRecord,
  | 'steps'
  | 'errors'
  | 'loopRecords'
  | 'switchRecords'
  | 'groupRecords'
  | 'finalValues'
  | 'concurrencyLevels'
> & {
  steps: ReadonlyArray<SerializedStepRecord>;
  errors: ReadonlyArray<SerializedGraphError>;
  concurrencyLevels: ReadonlyArray<ConcurrencyLevelRecord>;
  loopRecords: Record<string, SerializedLoopRecord>;
  switchRecords: Record<string, SerializedSwitchRecord>;
  groupRecords: Record<string, SerializedGroupRecord>;
  finalValues: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────
// RecordedInputHandleValue serialization
// ─────────────────────────────────────────────────────

function serializeRecordedInputHandleValue(
  val: RecordedInputHandleValue,
): SerializedRecordedInputHandleValue {
  return {
    ...val,
    connections: val.connections.map((conn: RecordedInputConnection) => ({
      ...conn,
      value: safeSerializeValue(conn.value),
    })),
    defaultValue: safeSerializeValue(val.defaultValue),
  };
}

function serializeRecordedOutputHandleValue(
  val: RecordedOutputHandleValue,
): SerializedRecordedOutputHandleValue {
  return {
    ...val,
    value: safeSerializeValue(val.value),
  };
}

// ─────────────────────────────────────────────────────
// ExecutionStepRecord serialization
// ─────────────────────────────────────────────────────

function serializeStepRecord(step: ExecutionStepRecord): SerializedStepRecord {
  const inputValues: Record<string, SerializedRecordedInputHandleValue> = {};
  for (const [k, v] of step.inputValues) {
    inputValues[k] = serializeRecordedInputHandleValue(v);
  }

  const outputValues: Record<string, SerializedRecordedOutputHandleValue> = {};
  for (const [k, v] of step.outputValues) {
    outputValues[k] = serializeRecordedOutputHandleValue(v);
  }

  return {
    ...step,
    inputValues,
    outputValues,
    error: step.error ? serializeGraphError(step.error) : undefined,
  };
}

function deserializeStepRecord(obj: SerializedStepRecord): ExecutionStepRecord {
  return {
    ...obj,
    inputValues: recordToReadonlyMap(obj.inputValues ?? {}),
    outputValues: recordToReadonlyMap(obj.outputValues ?? {}),
    error: obj.error ? deserializeGraphError(obj.error) : undefined,
  };
}

// ─────────────────────────────────────────────────────
// LoopRecord serialization
// ─────────────────────────────────────────────────────

function serializeLoopIterationRecord(
  iter: LoopIterationRecord,
): SerializedLoopIterationRecord {
  const nested: Record<string, SerializedLoopRecord> = {};
  for (const [k, v] of iter.nestedLoopRecords) {
    nested[k] = serializeLoopRecord(v);
  }
  const nestedSwitches: Record<string, SerializedSwitchRecord> = {};
  for (const [k, v] of iter.nestedSwitchRecords) {
    nestedSwitches[k] = serializeSwitchRecord(v);
  }
  return {
    ...iter,
    stepRecords: iter.stepRecords.map(serializeStepRecord),
    nestedLoopRecords: Object.keys(nested).length > 0 ? nested : undefined,
    nestedSwitchRecords:
      Object.keys(nestedSwitches).length > 0 ? nestedSwitches : undefined,
  };
}

function deserializeLoopIterationRecord(
  obj: SerializedLoopIterationRecord,
): LoopIterationRecord {
  const nestedLoopRecords = new Map<string, LoopRecord>();
  if (obj.nestedLoopRecords) {
    for (const [k, v] of Object.entries(obj.nestedLoopRecords)) {
      nestedLoopRecords.set(k, deserializeLoopRecord(v));
    }
  }
  const nestedSwitchRecords = new Map<string, SwitchRecord>();
  if (obj.nestedSwitchRecords) {
    for (const [k, v] of Object.entries(obj.nestedSwitchRecords)) {
      nestedSwitchRecords.set(k, deserializeSwitchRecord(v));
    }
  }
  return {
    ...obj,
    stepRecords: (obj.stepRecords ?? []).map((s: SerializedStepRecord) =>
      deserializeStepRecord(s),
    ),
    nestedLoopRecords,
    nestedSwitchRecords,
  };
}

function serializeLoopRecord(rec: LoopRecord): SerializedLoopRecord {
  return {
    ...rec,
    iterations: rec.iterations.map(serializeLoopIterationRecord),
  };
}

function deserializeLoopRecord(obj: SerializedLoopRecord): LoopRecord {
  return {
    ...obj,
    iterations: (obj.iterations ?? []).map((i: SerializedLoopIterationRecord) =>
      deserializeLoopIterationRecord(i),
    ),
  };
}

// ─────────────────────────────────────────────────────
// SwitchRecord serialization (recursive)
// ─────────────────────────────────────────────────────

function serializeSwitchRecord(rec: SwitchRecord): SerializedSwitchRecord {
  const nestedLoops: Record<string, SerializedLoopRecord> = {};
  for (const [k, v] of rec.nestedLoopRecords) {
    nestedLoops[k] = serializeLoopRecord(v);
  }
  const nestedSwitches: Record<string, SerializedSwitchRecord> = {};
  for (const [k, v] of rec.nestedSwitchRecords) {
    nestedSwitches[k] = serializeSwitchRecord(v);
  }
  return {
    ...rec,
    stepRecords: rec.stepRecords.map(serializeStepRecord),
    nestedLoopRecords:
      Object.keys(nestedLoops).length > 0 ? nestedLoops : undefined,
    nestedSwitchRecords:
      Object.keys(nestedSwitches).length > 0 ? nestedSwitches : undefined,
  };
}

function deserializeSwitchRecord(obj: SerializedSwitchRecord): SwitchRecord {
  const nestedLoopRecords = new Map<string, LoopRecord>();
  if (obj.nestedLoopRecords) {
    for (const [k, v] of Object.entries(obj.nestedLoopRecords)) {
      nestedLoopRecords.set(k, deserializeLoopRecord(v));
    }
  }
  const nestedSwitchRecords = new Map<string, SwitchRecord>();
  if (obj.nestedSwitchRecords) {
    for (const [k, v] of Object.entries(obj.nestedSwitchRecords)) {
      nestedSwitchRecords.set(k, deserializeSwitchRecord(v));
    }
  }
  return {
    ...obj,
    stepRecords: (obj.stepRecords ?? []).map((s: SerializedStepRecord) =>
      deserializeStepRecord(s),
    ),
    nestedLoopRecords,
    nestedSwitchRecords,
  };
}

// ─────────────────────────────────────────────────────
// GroupRecord serialization (recursive)
// ─────────────────────────────────────────────────────

function serializeGroupRecord(rec: GroupRecord): SerializedGroupRecord {
  return {
    ...rec,
    innerRecord: serializeExecutionRecord(rec.innerRecord),
    inputMapping: mapToRecord(rec.inputMapping),
    outputMapping: mapToRecord(rec.outputMapping),
  };
}

function deserializeGroupRecord(obj: SerializedGroupRecord): GroupRecord {
  return {
    ...obj,
    innerRecord: deserializeExecutionRecord(obj.innerRecord),
    inputMapping: recordToReadonlyMap(obj.inputMapping ?? {}),
    outputMapping: recordToReadonlyMap(obj.outputMapping ?? {}),
  };
}

// ─────────────────────────────────────────────────────
// ExecutionRecord serialization (top-level, recursive via groups)
// ─────────────────────────────────────────────────────

/**
 * Serialize an ExecutionRecord to a JSON-safe plain object.
 * Converts all ReadonlyMap fields to Records, serializes errors,
 * and safely serializes all values. Handles recursive GroupRecords.
 */
function serializeExecutionRecord(
  record: ExecutionRecord,
): SerializedExecutionRecord {
  // Serialize loopRecords Map → Record
  const loopRecords: Record<string, SerializedLoopRecord> = {};
  for (const [k, v] of record.loopRecords) {
    loopRecords[k] = serializeLoopRecord(v);
  }

  // Serialize switchRecords Map → Record (recursive)
  const switchRecords: Record<string, SerializedSwitchRecord> = {};
  for (const [k, v] of record.switchRecords) {
    switchRecords[k] = serializeSwitchRecord(v);
  }

  // Serialize groupRecords Map → Record (recursive)
  const groupRecords: Record<string, SerializedGroupRecord> = {};
  for (const [k, v] of record.groupRecords) {
    groupRecords[k] = serializeGroupRecord(v);
  }

  // Serialize finalValues Map → Record with safe values
  const finalValues: Record<string, unknown> = {};
  for (const [k, v] of record.finalValues) {
    finalValues[k] = safeSerializeValue(v);
  }

  return {
    id: record.id,
    startTime: record.startTime,
    endTime: record.endTime,
    totalDuration: record.totalDuration,
    warmupDuration: record.warmupDuration,
    totalPauseDuration: record.totalPauseDuration,
    status: record.status,
    steps: record.steps.map(serializeStepRecord),
    errors: record.errors.map(serializeGraphError),
    concurrencyLevels: [...record.concurrencyLevels],
    loopRecords,
    switchRecords,
    groupRecords,
    finalValues,
    // Root Graph Output values (mirrors codegen's `runGraph` return). Sanitized
    // per-value like `finalValues` since they originate from node impls and may
    // be non-JSON. Omitted when absent (graph has no root Graph Output).
    ...(record.rootOutputs
      ? {
          rootOutputs: Object.fromEntries(
            Object.entries(record.rootOutputs).map(([key, value]) => [
              key,
              safeSerializeValue(value),
            ]),
          ),
        }
      : {}),
    ...(record.viewState ? { viewState: record.viewState } : {}),
  };
}

/**
 * Deserialize a serialized ExecutionRecord back to the original type.
 * Converts all Record fields back to ReadonlyMaps and deserializes errors.
 */
function deserializeExecutionRecord(
  obj: SerializedExecutionRecord,
): ExecutionRecord {
  // Deserialize loopRecords
  const loopRecords = new Map<string, LoopRecord>();
  if (obj.loopRecords) {
    for (const [k, v] of Object.entries(obj.loopRecords)) {
      loopRecords.set(k, deserializeLoopRecord(v));
    }
  }

  // Deserialize switchRecords (recursive)
  const switchRecords = new Map<string, SwitchRecord>();
  if (obj.switchRecords) {
    for (const [k, v] of Object.entries(obj.switchRecords)) {
      switchRecords.set(k, deserializeSwitchRecord(v));
    }
  }

  // Deserialize groupRecords (recursive)
  const groupRecords = new Map<string, GroupRecord>();
  if (obj.groupRecords) {
    for (const [k, v] of Object.entries(obj.groupRecords)) {
      groupRecords.set(k, deserializeGroupRecord(v));
    }
  }

  // Deserialize finalValues
  const finalValues = new Map<string, unknown>();
  if (obj.finalValues) {
    for (const [k, v] of Object.entries(obj.finalValues)) {
      finalValues.set(k, v);
    }
  }

  return {
    id: obj.id,
    startTime: obj.startTime,
    endTime: obj.endTime,
    totalDuration: obj.totalDuration,
    warmupDuration: obj.warmupDuration ?? 0,
    totalPauseDuration: obj.totalPauseDuration ?? 0,
    status: obj.status,
    steps: (obj.steps ?? []).map((s: SerializedStepRecord) =>
      deserializeStepRecord(s),
    ),
    errors: (obj.errors ?? []).map((e: SerializedGraphError) =>
      deserializeGraphError(e),
    ),
    concurrencyLevels: obj.concurrencyLevels ?? [],
    loopRecords,
    switchRecords,
    groupRecords,
    finalValues,
    ...(obj.rootOutputs ? { rootOutputs: obj.rootOutputs } : {}),
    ...(obj.viewState ? { viewState: obj.viewState } : {}),
  };
}

// ─────────────────────────────────────────────────────
// State field stripping / rehydration
// ─────────────────────────────────────────────────────

/**
 * Deep-clone a value.
 *
 * 1. Attempts `structuredClone` first — handles most JS types (Date, Map,
 *    Set, ArrayBuffer, etc.) but throws on functions and Zod schemas.
 * 2. Falls back to `JSON.parse(JSON.stringify(...))` which is **JSON-safe
 *    only**: it silently strips `Map`, `Set`, `Date` (to string), `undefined`,
 *    `BigInt` (throws), functions, and symbols.
 *
 * **Callers must ensure** the input contains only JSON-safe data, or strip
 * non-serializable fields before calling. Current callers
 * ({@link stripHandleNonSerializable} in `StateSerializer.serialize`) already
 * remove Zod schemas and callbacks, so the fallback is safe for existing usage.
 */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // structuredClone can't handle certain values (e.g. functions),
      // fall through to manual approach
    }
  }
  // Manual deep clone that strips non-serializable values
  return JSON.parse(
    JSON.stringify(value, (_key, val) => {
      if (typeof val === 'function') return undefined;
      if (typeof val === 'symbol') return undefined;
      return val;
    }),
  );
}

/**
 * Strip the `complexSchema` field from a DataType (it's a Zod class instance
 * and not serializable). Returns a new object without the field.
 */
function stripComplexSchema(
  dataType: Record<string, unknown>,
): Record<string, unknown> {
  const { complexSchema, ...rest } = dataType;
  return rest;
}

/**
 * Strip non-serializable fields from a handle object:
 * - `onChange` callback
 * - `dataType.dataTypeObject.complexSchema` (Zod schema)
 */
function stripHandleNonSerializable(
  handle: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...handle };

  // Remove onChange
  delete result.onChange;

  // Strip complexSchema from dataType.dataTypeObject
  const dataType = result.dataType;
  if (isObject(dataType) && isObject(dataType.dataTypeObject)) {
    result.dataType = {
      ...dataType,
      dataTypeObject: stripComplexSchema(dataType.dataTypeObject),
    };
  }

  // Strip complexSchema from inferredDataType.dataTypeObject
  const inferredDataType = result.inferredDataType;
  if (isObject(inferredDataType) && isObject(inferredDataType.dataTypeObject)) {
    result.inferredDataType = {
      ...inferredDataType,
      dataTypeObject: stripComplexSchema(inferredDataType.dataTypeObject),
    };
  }

  return result;
}

/**
 * Rehydrate a handle's `dataType.dataTypeObject` from the provided dataTypes map.
 * This restores the Zod schema (complexSchema) that was stripped during export.
 */
function rehydrateHandleDataType(
  handle: Record<string, unknown>,
  dataTypes: Record<string, unknown>,
): Record<string, unknown> {
  const dt = handle.dataType;
  if (isObject(dt)) {
    const dtId = dt.dataTypeUniqueId;
    if (typeof dtId === 'string' && isObject(dataTypes[dtId])) {
      handle.dataType = {
        ...dt,
        dataTypeObject: dataTypes[dtId],
      };
    }
  }
  const idt = handle.inferredDataType;
  if (isObject(idt)) {
    const dtId = idt.dataTypeUniqueId;
    if (typeof dtId === 'string' && isObject(dataTypes[dtId])) {
      handle.inferredDataType = {
        ...idt,
        dataTypeObject: dataTypes[dtId],
      };
    }
  }
  return handle;
}

// ─────────────────────────────────────────────────────
// Type guards for JSON import boundary
// ─────────────────────────────────────────────────────

/**
 * Type guard to narrow a validated Record to SerializedExecutionRecord.
 * Used at the JSON import boundary after structural validation has
 * confirmed the shape. This is NOT a substitute for validation —
 * call validateExecutionRecordStructure first.
 */
function isSerializedExecutionRecord(
  data: Record<string, unknown>,
): data is SerializedExecutionRecord {
  return (
    typeof data.id === 'string' &&
    typeof data.status === 'string' &&
    Array.isArray(data.steps) &&
    Array.isArray(data.errors)
  );
}

// ─────────────────────────────────────────────────────
// Immer patch serialization (for undo/redo export)
// ─────────────────────────────────────────────────────

import type { Patch } from 'immer';
import type {
  HistoryEntry,
  SerializedHistoryEntry,
  SerializedPatch,
} from '@/components/organisms/FullGraph/historyTypes';

/**
 * Make an Immer patch JSON-safe by running its `value` through
 * `safeSerializeValue` (strips Zod schemas, callbacks, etc.).
 * `remove` patches have no value and pass through unchanged.
 */
function serializePatch(patch: Patch): SerializedPatch {
  const serialized: SerializedPatch = {
    op: patch.op,
    path: patch.path,
  };
  if ('value' in patch && patch.value !== undefined) {
    serialized.value = safeSerializeValue(patch.value);
  }
  return serialized;
}

/**
 * Serialize a HistoryEntry for inclusion in an exported JSON file.
 * Strips non-serializable values from all patch data.
 */
function serializeHistoryEntry(entry: HistoryEntry): SerializedHistoryEntry {
  return {
    patches: entry.patches.map(serializePatch),
    inversePatches: entry.inversePatches.map(serializePatch),
    actionType: entry.actionType,
    timestamp: entry.timestamp,
  };
}

export {
  mapToRecord,
  recordToReadonlyMap,
  safeSerializeValue,
  serializeGraphError,
  deserializeGraphError,
  serializeExecutionRecord,
  deserializeExecutionRecord,
  isSerializedExecutionRecord,
  deepClone,
  stripComplexSchema,
  stripHandleNonSerializable,
  rehydrateHandleDataType,
  serializePatch,
  serializeHistoryEntry,
};

export type { SerializedExecutionRecord, SerializedGraphError };
