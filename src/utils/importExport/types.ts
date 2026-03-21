import type { z } from 'zod';
import type {
  DataType,
  TypeOfNode,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';

// ─────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────

/**
 * A single validation issue found during import.
 * Includes a dot-path to the problematic field for precise error location.
 */
type ValidationIssue = {
  /** Dot-path to the problematic field, e.g. "state.nodes[2].position.x" */
  path: string;
  /** Human-readable description of the issue */
  message: string;
  /** Whether this blocks import ('error') or is informational ('warning') */
  severity: 'error' | 'warning';
};

/**
 * Result of an import operation. Discriminated union on `success`.
 */
type ImportResult<T> =
  | { success: true; data: T; warnings: ValidationIssue[] }
  | { success: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

// ─────────────────────────────────────────────────────
// Export Envelopes
// ─────────────────────────────────────────────────────

/**
 * JSON envelope for exported graph state.
 * The `state` field contains the serialized State with non-serializable
 * fields stripped (complexSchema, onChange, etc.).
 */
type ExportedGraphState = {
  version: 1;
  exportedAt: string;
  state: Record<string, unknown>;
};

/**
 * JSON envelope for exported execution records.
 * All ReadonlyMap fields are converted to plain objects,
 * errors are serialized, and values are made JSON-safe.
 */
type ExportedExecutionRecord = {
  version: 1;
  exportedAt: string;
  record: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────
// Repair Strategies
// ─────────────────────────────────────────────────────

/**
 * Opt-in repair strategies for state import.
 * All default to `false` — must be explicitly enabled.
 */
type StateRepairStrategies = {
  /** Remove edges whose source or target node doesn't exist */
  removeOrphanEdges: boolean;
  /** Deduplicate nodes with the same ID (keep first occurrence) */
  removeDuplicateNodeIds: boolean;
  /** Deduplicate edges with the same ID (keep first occurrence) */
  removeDuplicateEdgeIds: boolean;
  /** Fill missing optional fields (viewport, feature flags) with defaults */
  fillMissingDefaults: boolean;
  /** Rebuild handle dataType.dataTypeObject from provided dataTypes */
  rehydrateDataTypeObjects: boolean;
};

/**
 * Opt-in repair strategies for execution record import.
 * All default to `false` — must be explicitly enabled.
 */
type RecordRepairStrategies = {
  /** Replace non-serializable step values with "[non-serializable]" */
  sanitizeNonSerializableValues: boolean;
  /** Remove steps referencing nodes not present in the record */
  removeOrphanSteps: boolean;
};

// ─────────────────────────────────────────────────────
// Import Options
// ─────────────────────────────────────────────────────

/**
 * Options for importing graph state.
 *
 * `dataTypes` and `typeOfNodes` are required so the importer can
 * rehydrate Zod schemas and handle dataTypeObjects that were stripped
 * during export.
 */
type StateImportOptions<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /** User-provided data type definitions (source of truth for Zod schemas) */
  dataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >;
  /** User-provided node type definitions (source of truth for handle structure) */
  typeOfNodes: Record<
    NodeTypeUniqueId,
    TypeOfNode<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >;
  /** Called for each validation issue found during import */
  onValidationError?: (issue: ValidationIssue) => void;
  /** Repair strategies to apply (all default to false) */
  repair?: Partial<StateRepairStrategies>;
};

/**
 * Options for importing execution records.
 */
type RecordImportOptions = {
  /** Called for each validation issue found during import */
  onValidationError?: (issue: ValidationIssue) => void;
  /** Repair strategies to apply (all default to false) */
  repair?: Partial<RecordRepairStrategies>;
};

// ─────────────────────────────────────────────────────
// Export Options
// ─────────────────────────────────────────────────────

/**
 * Options for export functions.
 */
type ExportOptions = {
  /** Whether to pretty-print the JSON output (2-space indent) */
  pretty?: boolean;
};

export type {
  ValidationIssue,
  ImportResult,
  ExportedGraphState,
  ExportedExecutionRecord,
  StateRepairStrategies,
  RecordRepairStrategies,
  StateImportOptions,
  RecordImportOptions,
  ExportOptions,
};
