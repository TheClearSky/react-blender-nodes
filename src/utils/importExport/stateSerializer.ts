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

/**
 * Strip a single input (which may be a panel with nested inputs) or a plain input handle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripInputOrPanel(input: any): any {
  // Panel has `inputs` array
  if (input.inputs && Array.isArray(input.inputs)) {
    return {
      ...input,
      inputs: input.inputs.map(stripHandleNonSerializable),
    };
  }
  return stripHandleNonSerializable(input);
}

/**
 * Strip non-serializable fields from all handles in a node.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripNodeHandles(node: any): any {
  if (!node.data) return node;
  const data = { ...node.data };

  if (data.inputs && Array.isArray(data.inputs)) {
    data.inputs = data.inputs.map(stripInputOrPanel);
  }
  if (data.outputs && Array.isArray(data.outputs)) {
    data.outputs = data.outputs.map(stripHandleNonSerializable);
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
    // Deep clone to avoid mutating the original
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cloned: any = deepClone(state);

    // Strip UI-only state that shouldn't be exported
    delete cloned.activeDrawer;
    delete cloned.zones;
    delete cloned.zoneIndex;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static serializeNode(node: any): any {
    return stripNodeHandles(node);
  }

  /**
   * Strip `complexSchema` from each dataType in the cloned state.
   * Mutates the provided object in place.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static stripDataTypes(cloned: any): void {
    if (cloned.dataTypes) {
      for (const dtId of Object.keys(cloned.dataTypes)) {
        cloned.dataTypes[dtId] = stripComplexSchema(cloned.dataTypes[dtId]);
      }
    }
  }

  /**
   * Strip non-serializable fields from typeOfNodes handle definitions.
   * Handles inputs (including panels), outputs, and subtree nodes.
   * Mutates the provided object in place.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static stripTypeOfNodes(cloned: any): void {
    if (cloned.typeOfNodes) {
      for (const ntId of Object.keys(cloned.typeOfNodes)) {
        const nodeType = cloned.typeOfNodes[ntId];
        if (nodeType.inputs) {
          nodeType.inputs = nodeType.inputs.map(stripInputOrPanel);
        }
        if (nodeType.outputs) {
          nodeType.outputs = nodeType.outputs.map(stripHandleNonSerializable);
        }
        // Handle subtree (for group nodes)
        if (nodeType.subtree?.nodes) {
          nodeType.subtree.nodes = nodeType.subtree.nodes.map(stripNodeHandles);
          delete nodeType.subtree.zones;
          delete nodeType.subtree.zoneIndex;
        }
      }
    }
  }

  /**
   * Strip non-serializable fields from all node handles.
   * Mutates the provided object in place.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static stripNodes(cloned: any): void {
    if (cloned.nodes) {
      cloned.nodes = cloned.nodes.map(stripNodeHandles);
    }
  }
}

export { StateSerializer };
