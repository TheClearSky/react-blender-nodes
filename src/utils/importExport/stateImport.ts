import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type {
  ImportResult,
  ValidationIssue,
  StateImportOptions,
} from './types';
import { validateGraphStateStructure, isObject } from './validation';
import { rehydrateHandleDataType } from './serialization';

/**
 * Type guard to narrow a validated Record to State after structural validation.
 * This is NOT a substitute for validation — call validateGraphStateStructure first.
 */
function isValidState<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  data: Record<string, unknown>,
): data is State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  return (
    'nodes' in data &&
    'edges' in data &&
    'dataTypes' in data &&
    'typeOfNodes' in data
  );
}

/**
 * Rehydrate all handles in a node with dataTypeObject from provided dataTypes.
 */
function rehydrateNodeHandles(
  node: Record<string, unknown>,
  dataTypes: Record<string, unknown>,
): Record<string, unknown> {
  if (!isObject(node.data)) return node;
  const data: Record<string, unknown> = { ...node.data };

  if (Array.isArray(data.inputs)) {
    const inputs: unknown[] = data.inputs;
    data.inputs = inputs.map((input: unknown) => {
      if (!isObject(input)) return input;
      // Panel — has nested inputs array
      if (Array.isArray(input.inputs)) {
        const panelInputs: unknown[] = input.inputs;
        return {
          ...input,
          inputs: panelInputs.map((h: unknown) =>
            isObject(h) ? rehydrateHandleDataType(h, dataTypes) : h,
          ),
        };
      }
      return rehydrateHandleDataType(input, dataTypes);
    });
  }
  if (Array.isArray(data.outputs)) {
    const outputs: unknown[] = data.outputs;
    data.outputs = outputs.map((output: unknown) =>
      isObject(output) ? rehydrateHandleDataType(output, dataTypes) : output,
    );
  }

  return { ...node, data };
}

/**
 * Import a graph state from a JSON string.
 *
 * Validates the structure, applies any enabled repair strategies,
 * and rehydrates non-serializable fields (complexSchema, dataTypeObject)
 * from the user-provided `dataTypes` and `typeOfNodes`.
 *
 * @param json - The JSON string to import
 * @param options - Import options including dataTypes/typeOfNodes for rehydration
 * @returns ImportResult with the rehydrated State or validation errors
 *
 * @example
 * ```ts
 * const result = importGraphState(json, {
 *   dataTypes: myDataTypes,
 *   typeOfNodes: myTypeOfNodes,
 *   onValidationError: (issue) => console.warn(issue),
 *   repair: { removeOrphanEdges: true, fillMissingDefaults: true },
 * });
 *
 * if (result.success) {
 *   // Use result.data as State
 * } else {
 *   // Handle result.errors
 * }
 * ```
 */
function importGraphState<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  json: string,
  options: StateImportOptions<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): ImportResult<
  State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
> {
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
  const issues = validateGraphStateStructure(parsed);
  for (const issue of issues) {
    options.onValidationError?.(issue);
    if (issue.severity === 'error') {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  // If there are structural errors and no repair strategies, fail
  const repair = options.repair ?? {};
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

  const state = parsed.state;
  if (!isObject(state)) {
    return {
      success: false,
      errors: [
        { path: 'state', message: 'Missing state object', severity: 'error' },
      ],
      warnings,
    };
  }

  // Apply repair strategies
  if (repair.removeDuplicateNodeIds && Array.isArray(state.nodes)) {
    const seen = new Set<string>();
    const nodes: unknown[] = state.nodes;
    state.nodes = nodes.filter((n) => {
      if (!isObject(n) || typeof n.id !== 'string') return true;
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }

  if (repair.removeDuplicateEdgeIds && Array.isArray(state.edges)) {
    const seen = new Set<string>();
    const edges: unknown[] = state.edges;
    state.edges = edges.filter((e) => {
      if (!isObject(e) || typeof e.id !== 'string') return true;
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }

  if (
    repair.removeOrphanEdges &&
    Array.isArray(state.nodes) &&
    Array.isArray(state.edges)
  ) {
    const nodeIds = new Set<string>();
    const nodes: unknown[] = state.nodes;
    for (const n of nodes) {
      if (isObject(n) && typeof n.id === 'string') {
        nodeIds.add(n.id);
      }
    }
    const edges: unknown[] = state.edges;
    const before = edges.length;
    const filteredEdges = edges.filter(
      (e) =>
        isObject(e) &&
        typeof e.source === 'string' &&
        typeof e.target === 'string' &&
        nodeIds.has(e.source) &&
        nodeIds.has(e.target),
    );
    state.edges = filteredEdges;
    const removed = before - filteredEdges.length;
    if (removed > 0) {
      warnings.push({
        path: 'state.edges',
        message: `Removed ${removed} orphan edge(s)`,
        severity: 'warning',
      });
    }
  }

  if (repair.fillMissingDefaults) {
    if (state.viewport === undefined) {
      state.viewport = { x: 0, y: 0, zoom: 1 };
    }
    // Feature flags default to undefined (disabled) — no action needed
  }

  // Rehydrate complexSchema on dataTypes from provided dataTypes
  // Widen to Record<string, unknown> to avoid Object.keys returning string[] vs DataTypeUniqueId
  const dataTypesLookup: Record<string, unknown> = options.dataTypes;
  if (isObject(state.dataTypes)) {
    for (const dtId of Object.keys(state.dataTypes)) {
      const providedDt = dataTypesLookup[dtId];
      const dt = state.dataTypes[dtId];
      if (
        providedDt &&
        isObject(providedDt) &&
        isObject(dt) &&
        'complexSchema' in providedDt &&
        providedDt.complexSchema
      ) {
        dt.complexSchema = providedDt.complexSchema;
      }
    }
  }

  // Always rehydrate handle dataTypeObjects since export strips them
  if (Array.isArray(state.nodes)) {
    const nodes: unknown[] = state.nodes;
    state.nodes = nodes.map((node: unknown) =>
      isObject(node) ? rehydrateNodeHandles(node, dataTypesLookup) : node,
    );
  }

  // Re-check for remaining structural errors after repair
  const remainingErrors = errors.filter((e) => {
    // Check if the error was about something we repaired
    if (
      repair.removeDuplicateNodeIds &&
      e.message.includes('Duplicate node ID')
    )
      return false;
    if (
      repair.removeDuplicateEdgeIds &&
      e.message.includes('Duplicate edge ID')
    )
      return false;
    if (repair.removeOrphanEdges && e.message.includes('not found'))
      return false;
    if (repair.fillMissingDefaults && e.path.includes('viewport')) return false;
    return true;
  });

  if (remainingErrors.length > 0) {
    return { success: false, errors: remainingErrors, warnings };
  }

  // Narrow to State via type guard (validation confirmed shape upstream)
  if (
    !isValidState<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >(state)
  ) {
    return {
      success: false,
      errors: [
        {
          path: 'state',
          message: 'Invalid state structure',
          severity: 'error',
        },
      ],
      warnings,
    };
  }

  return {
    success: true,
    data: state,
    warnings,
  };
}

export { importGraphState };
