import type { ExecutionRecord } from '../nodeRunner/types';
import type { ExportedExecutionRecord, ExportOptions } from './types';
import { serializeExecutionRecord } from './serialization';

/**
 * Export an execution record to a JSON string.
 *
 * Converts all ReadonlyMap fields to plain objects, serializes
 * GraphError.originalError to a JSON-safe form, and safely
 * serializes all unknown values (functions → placeholder strings).
 *
 * @param record - The execution record to export
 * @param options - Export options (pretty-print, etc.)
 * @returns JSON string of the exported record
 *
 * @example
 * ```ts
 * const json = exportExecutionRecord(record, { pretty: true });
 * // Save to file, download, etc.
 * ```
 */
function exportExecutionRecord(
  record: ExecutionRecord,
  options?: ExportOptions,
): string {
  const serialized = serializeExecutionRecord(record);

  const envelope: ExportedExecutionRecord = {
    version: 1,
    exportedAt: new Date().toISOString(),
    record: serialized,
  };

  return JSON.stringify(envelope, null, options?.pretty ? 2 : undefined);
}

export { exportExecutionRecord };
