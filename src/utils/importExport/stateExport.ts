import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type { ExportedGraphState, ExportOptions } from './types';
import {
  deepClone,
  stripComplexSchema,
  stripHandleNonSerializable,
} from './serialization';

/**
 * Export a graph state to a JSON string.
 *
 * Strips non-serializable fields:
 * - `complexSchema` (Zod class instance) from dataTypes
 * - `onChange` callbacks from handles
 * - `complexSchema` from handle `dataType.dataTypeObject`
 *
 * @param state - The graph state to export
 * @param options - Export options (pretty-print, etc.)
 * @returns JSON string of the exported state
 *
 * @example
 * ```ts
 * const json = exportGraphState(state, { pretty: true });
 * // Save to file, download, etc.
 * ```
 */
function exportGraphState<
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
  options?: ExportOptions,
): string {
  // Deep clone to avoid mutating the original
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cloned: any = deepClone(state);

  // Strip complexSchema from each dataType
  if (cloned.dataTypes) {
    for (const dtId of Object.keys(cloned.dataTypes)) {
      cloned.dataTypes[dtId] = stripComplexSchema(cloned.dataTypes[dtId]);
    }
  }

  // Strip non-serializable fields from typeOfNodes handle definitions
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
      }
    }
  }

  // Strip non-serializable fields from node handles
  if (cloned.nodes) {
    cloned.nodes = cloned.nodes.map(stripNodeHandles);
  }

  const envelope: ExportedGraphState = {
    version: 1,
    exportedAt: new Date().toISOString(),
    state: cloned,
  };

  return JSON.stringify(envelope, null, options?.pretty ? 2 : undefined);
}

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

export { exportGraphState };
