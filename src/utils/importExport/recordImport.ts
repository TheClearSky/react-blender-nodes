import type { ExecutionRecord } from '../nodeRunner/types';
import type {
  ImportResult,
  ValidationIssue,
  RecordImportOptions,
} from './types';
import { validateExecutionRecordStructure, isObject } from './validation';
import {
  deserializeExecutionRecord,
  isSerializedExecutionRecord,
} from './serialization';

/**
 * Import an execution record from a JSON string.
 *
 * Validates the structure, applies any enabled repair strategies,
 * and deserializes all Record fields back to ReadonlyMaps.
 *
 * @param json - The JSON string to import
 * @param options - Import options (validation callbacks, repair strategies)
 * @returns ImportResult with the deserialized ExecutionRecord or validation errors
 *
 * @example
 * ```ts
 * const result = importExecutionRecord(json, {
 *   onValidationError: (issue) => console.warn(issue),
 *   repair: { sanitizeNonSerializableValues: true },
 * });
 *
 * if (result.success) {
 *   // Use result.data as ExecutionRecord
 * } else {
 *   // Handle result.errors
 * }
 * ```
 */
function importExecutionRecord(
  json: string,
  options?: RecordImportOptions,
): ImportResult<ExecutionRecord> {
  const warnings: ValidationIssue[] = [];
  const errors: ValidationIssue[] = [];

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({
      path: '',
      message: `Invalid JSON: ${msg}`,
      severity: 'error',
    });
    return { success: false, errors, warnings };
  }

  // Validate structure
  const issues = validateExecutionRecordStructure(parsed);
  for (const issue of issues) {
    options?.onValidationError?.(issue);
    if (issue.severity === 'error') {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  // If there are structural errors and no repair strategies, fail
  const repair = options?.repair ?? {};
  const hasRepairStrategies = Object.values(repair).some(Boolean);

  if (errors.length > 0 && !hasRepairStrategies) {
    return { success: false, errors, warnings };
  }

  if (!isObject(parsed)) {
    return {
      success: false,
      errors: [
        { path: '', message: 'Root must be an object', severity: 'error' },
      ],
      warnings,
    };
  }

  const recordData = parsed.record;
  if (!isObject(recordData)) {
    return {
      success: false,
      errors: [
        { path: 'record', message: 'Missing record object', severity: 'error' },
      ],
      warnings,
    };
  }

  // Apply repair strategies before deserialization
  if (repair.removeOrphanSteps && Array.isArray(recordData.steps)) {
    const steps: unknown[] = recordData.steps;
    // Collect all valid steps that have required fields
    const validSteps = steps.filter(
      (s): s is Record<string, unknown> =>
        isObject(s) &&
        typeof s.nodeId === 'string' &&
        typeof s.nodeTypeId === 'string' &&
        typeof s.stepIndex === 'number',
    );
    const removed = steps.length - validSteps.length;
    if (removed > 0) {
      recordData.steps = validSteps;
      warnings.push({
        path: 'record.steps',
        message: `Removed ${removed} malformed step(s)`,
        severity: 'warning',
      });
    }
  }

  if (repair.sanitizeNonSerializableValues && Array.isArray(recordData.steps)) {
    // Values are already JSON since they came from JSON.parse,
    // so non-serializable values can't actually exist here.
    // This repair is more about ensuring consistency.
  }

  // Re-check for remaining errors after repair
  const remainingErrors = errors.filter((e) => {
    if (repair.removeOrphanSteps && e.path.includes('steps')) return false;
    return true;
  });

  if (remainingErrors.length > 0) {
    return { success: false, errors: remainingErrors, warnings };
  }

  // Narrow to SerializedExecutionRecord via type guard (validation confirmed shape upstream)
  if (!isSerializedExecutionRecord(recordData)) {
    return {
      success: false,
      errors: [
        {
          path: 'record',
          message: 'Record structure does not match expected shape',
          severity: 'error',
        },
      ],
      warnings,
    };
  }

  // Deserialize: Records → Maps, reconstruct errors
  const record = deserializeExecutionRecord(recordData);

  return { success: true, data: record, warnings };
}

export { importExecutionRecord };
