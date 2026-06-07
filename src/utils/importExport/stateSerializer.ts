import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type { ExportedGraphState } from './types';
import {
  deepClone,
  stripComplexSchema,
  stripHandleNonSerializable,
} from './serialization';

// ─────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────
//
// Serialization walks a deep-cloned state, stripping non-serializable values
// (Zod schemas, onChange callbacks) in place. The clone is a heterogeneous
// object graph mid-transform, so it is handled as `Record<string, unknown>`;
// array elements known to be objects are narrowed via `asRecord` (the single,
// contained assertion used by this in-place strip).

/** Narrow an array element / nested value already known to be an object. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

/**
 * Strip a single input (which may be a panel with nested inputs) or a plain input handle.
 */
function stripInputOrPanel(
  input: Record<string, unknown>,
): Record<string, unknown> {
  // Panel has `inputs` array
  if (Array.isArray(input.inputs)) {
    return {
      ...input,
      inputs: input.inputs.map((sub) =>
        stripHandleNonSerializable(asRecord(sub)),
      ),
    };
  }
  return stripHandleNonSerializable(input);
}

/**
 * Strip non-serializable fields from all handles in a node.
 */
function stripNodeHandles(
  node: Record<string, unknown>,
): Record<string, unknown> {
  if (!node.data || typeof node.data !== 'object') return node;
  const data = { ...asRecord(node.data) };

  if (Array.isArray(data.inputs)) {
    data.inputs = data.inputs.map((input) =>
      stripInputOrPanel(asRecord(input)),
    );
  }
  if (Array.isArray(data.outputs)) {
    data.outputs = data.outputs.map((output) =>
      stripHandleNonSerializable(asRecord(output)),
    );
  }

  return { ...node, data };
}

// ─────────────────────────────────────────────────────
// StateSerializer
// ─────────────────────────────────────────────────────

/**
 * Encapsulates serialization of graph state for export.
 *
 * Strips non-serializable fields:
 * - `complexSchema` (Zod class instance) from dataTypes
 * - `onChange` callbacks from handles
 * - `complexSchema` from handle `dataType.dataTypeObject`
 */
class StateSerializer {
  /**
   * Serialize a graph state into an `ExportedGraphState` envelope.
   *
   * Deep-clones the state, strips non-serializable fields, and wraps
   * it in a versioned envelope with an export timestamp.
   */
  static serialize<
    DataTypeUniqueId extends string = string,
    NodeTypeUniqueId extends string = string,
    UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
    ComplexSchemaType extends UnderlyingType extends 'complex'
      ? z.ZodType
      : never = never,
  >(
    state: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ): ExportedGraphState {
    // Deep clone to avoid mutating the original. `deepClone` preserves the
    // type; widen to the serialized `Record` shape for the in-place strip.
    const cloned: Record<string, unknown> = deepClone(state);

    // Strip UI-only state that shouldn't be exported (all optional on State).
    delete cloned.activeDrawer;
    delete cloned.zones;
    delete cloned.zoneIndex;
    delete cloned.history;

    // Strip non-serializable fields from each section
    StateSerializer.stripDataTypes(cloned);
    StateSerializer.stripTypeOfNodes(cloned);
    StateSerializer.stripNodes(cloned);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      state: cloned,
    };
  }

  /**
   * Serialize a single node by stripping non-serializable handle fields.
   * Operates on an already-cloned node object (mutates in place).
   */
  static serializeNode(node: Record<string, unknown>): Record<string, unknown> {
    return stripNodeHandles(node);
  }

  /**
   * Strip `complexSchema` from each dataType in the cloned state.
   * Mutates the provided object in place.
   */
  static stripDataTypes(cloned: Record<string, unknown>): void {
    const dataTypes = cloned.dataTypes;
    if (!dataTypes || typeof dataTypes !== 'object') return;
    const map = asRecord(dataTypes);
    for (const dtId of Object.keys(map)) {
      map[dtId] = stripComplexSchema(asRecord(map[dtId]));
    }
  }

  /**
   * Strip non-serializable fields from typeOfNodes handle definitions.
   * Handles inputs (including panels), outputs, and subtree nodes.
   * Mutates the provided object in place.
   */
  static stripTypeOfNodes(cloned: Record<string, unknown>): void {
    const typeOfNodes = cloned.typeOfNodes;
    if (!typeOfNodes || typeof typeOfNodes !== 'object') return;
    const map = asRecord(typeOfNodes);
    for (const ntId of Object.keys(map)) {
      const nodeType = asRecord(map[ntId]);
      if (Array.isArray(nodeType.inputs)) {
        nodeType.inputs = nodeType.inputs.map((input) =>
          stripInputOrPanel(asRecord(input)),
        );
      }
      if (Array.isArray(nodeType.outputs)) {
        nodeType.outputs = nodeType.outputs.map((output) =>
          stripHandleNonSerializable(asRecord(output)),
        );
      }
      // Handle subtree (for group nodes)
      const subtree = nodeType.subtree;
      if (subtree && typeof subtree === 'object') {
        const st = asRecord(subtree);
        if (Array.isArray(st.nodes)) {
          st.nodes = st.nodes.map((node) => stripNodeHandles(asRecord(node)));
        }
        delete st.zones;
        delete st.zoneIndex;
      }
    }
  }

  /**
   * Strip non-serializable fields from all node handles.
   * Mutates the provided object in place.
   */
  private static stripNodes(cloned: Record<string, unknown>): void {
    if (Array.isArray(cloned.nodes)) {
      cloned.nodes = cloned.nodes.map((node) =>
        stripNodeHandles(asRecord(node)),
      );
    }
  }
}

export { StateSerializer };
