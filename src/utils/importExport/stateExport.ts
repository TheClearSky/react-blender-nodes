import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type { ExportOptions } from './types';
import { StateSerializer } from './stateSerializer';

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
  const envelope = StateSerializer.serialize(state);
  return JSON.stringify(envelope, null, options?.pretty ? 2 : undefined);
}

export { exportGraphState };
