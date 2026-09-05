import type { ValidationIssue } from './types';
import { isStructureRecordKey } from '../nodeRunner/executionRecorder';
import { standardNodeTypeNamesMap } from '../nodeStateManagement/standardNodes';
import { compareFanIn } from '../connectionOrder';
import { normalizeZoneColor } from '../nodeStateManagement/zones/zoneColor';
import { DEFAULT_RUNNER_VIEW_PREFERENCES } from '../nodeStateManagement/runnerViewPreferences';

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function issue(
  path: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
): ValidationIssue {
  return { path, message, severity };
}

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

// ─────────────────────────────────────────────────────
// Root Graph I/O structural checks
// ─────────────────────────────────────────────────────
//
// The Graph I/O editor enforces invariants the raw state does not: each root
// Graph Input / Graph Output handle has a non-empty, unique name, and there is
// at most ONE root Graph Input and ONE root Graph Output. The runtime keys root
// I/O BY NAME (executor `runAll` does `output.name in rootInputs`) and the
// compiler picks the FIRST boundary node it finds — so duplicate/empty names
// silently collapse, and extra boundary nodes are silently ignored.
//
// `REPLACE_STATE` (import) bypasses the editor, so these invariants must also be
// checked here. The predicate mirrors the validator
// (`validators.ts` › `validateAction` UPDATE_GRAPH_IO_HANDLES case).

/**
 * The logical node-type id of a node lives in `node.data.nodeTypeUniqueId`
 * (the structural `node.type` is the ReactFlow renderer type, e.g.
 * `'configurableNode'`). Returns `undefined` when the shape is not present.
 */
function nodeTypeUniqueIdOf(node: Record<string, unknown>): string | undefined {
  if (!isObject(node.data)) return undefined;
  const typeId = node.data.nodeTypeUniqueId;
  return typeof typeId === 'string' ? typeId : undefined;
}

/**
 * The blank `inferFromConnection` template handle (`name === ''`) that a fresh
 * Graph Input/Output carries and that materializes a real handle on connect. It
 * is EXEMPT from the empty-name boundary check and from name repair — it is
 * intentionally empty, not an authored-empty error. Mirrors the editor's
 * `isInferTemplate` filter (`FullGraph.tsx` › `editGraphIoHandles`). An
 * AUTHORED empty name (no `inferFromConnection`) is NOT exempt and still errors.
 */
function isInferTemplateHandle(handle: Record<string, unknown>): boolean {
  if (handle.name !== '') return false;
  const dataType = handle.dataType;
  if (!isObject(dataType)) return false;
  const dataTypeObject = dataType.dataTypeObject;
  if (!isObject(dataTypeObject)) return false;
  return dataTypeObject.underlyingType === 'inferFromConnection';
}

/**
 * Flatten a handle list (defensively unwrapping input panels) to the leaf
 * handle names. Mirrors how the validator and the editor feed read names. The
 * blank `inferFromConnection` template is skipped (see `isInferTemplateHandle`)
 * so it never trips the empty-name check on a connected-to root boundary node.
 */
function flattenHandleNames(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const names: string[] = [];
  for (const handle of list) {
    if (!isObject(handle)) continue;
    if (Array.isArray(handle.inputs)) {
      for (const inner of handle.inputs) {
        if (
          isObject(inner) &&
          typeof inner.name === 'string' &&
          !isInferTemplateHandle(inner)
        ) {
          names.push(inner.name);
        }
      }
    } else if (
      typeof handle.name === 'string' &&
      !isInferTemplateHandle(handle)
    ) {
      names.push(handle.name);
    }
  }
  return names;
}

/**
 * Push an issue for each duplicate or empty handle name on a root boundary node.
 * Empty/duplicate names are errors (the runtime silently collapses them);
 * `path` points at the offending node so the consumer can locate it.
 */
function checkRootBoundaryHandleNames(
  names: string[],
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  if (names.some((name) => name.trim() === '')) {
    issues.push(
      issue(
        path,
        `${label} has an empty handle name (keyed by name at run time)`,
      ),
    );
  }
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (seen.has(trimmed)) duplicates.add(trimmed);
    seen.add(trimmed);
  }
  for (const duplicate of duplicates) {
    issues.push(
      issue(
        path,
        `${label} has a duplicate handle name "${duplicate}" (duplicates collapse at run time)`,
      ),
    );
  }
}

/**
 * Validate the root Graph Input / Graph Output invariants on an imported state.
 * Only inspects the ROOT `state.nodes` (boundary nodes inside group subtrees are
 * group parameters, not the program's root I/O). Appends to `issues`.
 */
function checkRootGraphIo(
  nodes: ReadonlyArray<unknown>,
  issues: ValidationIssue[],
): void {
  const rootInputs: Array<{ node: Record<string, unknown>; index: number }> =
    [];
  const rootOutputs: Array<{ node: Record<string, unknown>; index: number }> =
    [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isObject(node)) continue;
    const typeId = nodeTypeUniqueIdOf(node);
    if (typeId === standardNodeTypeNamesMap.groupInput) {
      rootInputs.push({ node, index: i });
    } else if (typeId === standardNodeTypeNamesMap.groupOutput) {
      rootOutputs.push({ node, index: i });
    }
  }

  for (const { node, index } of rootInputs) {
    // A Graph Input exposes its OUTPUT handles as the program's parameters.
    const names = isObject(node.data)
      ? flattenHandleNames(node.data.outputs)
      : [];
    checkRootBoundaryHandleNames(
      names,
      `state.nodes[${index}]`,
      'Root Graph Input',
      issues,
    );
  }
  for (const { node, index } of rootOutputs) {
    // A Graph Output exposes its INPUT handles as the program's return values.
    const names = isObject(node.data)
      ? flattenHandleNames(node.data.inputs)
      : [];
    checkRootBoundaryHandleNames(
      names,
      `state.nodes[${index}]`,
      'Root Graph Output',
      issues,
    );
  }

  if (rootInputs.length > 1) {
    issues.push(
      issue(
        'state.nodes',
        `Multiple root Graph Input nodes (${rootInputs.length}); only the first is used at run time`,
        'warning',
      ),
    );
  }
  if (rootOutputs.length > 1) {
    issues.push(
      issue(
        'state.nodes',
        `Multiple root Graph Output nodes (${rootOutputs.length}); only the first is used at run time`,
        'warning',
      ),
    );
  }
}

// ─────────────────────────────────────────────────────
// Graph State Validation
// ─────────────────────────────────────────────────────

/**
 * Validate the structure of an exported graph state envelope.
 * Returns all issues found — both errors and warnings.
 *
 * Does NOT check type-level correctness (e.g. whether dataType IDs
 * in handles match actual dataTypes entries) — that's the importer's job.
 */
function validateGraphStateStructure(data: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isObject(data)) {
    issues.push(issue('', 'Root must be an object'));
    return issues;
  }

  // Envelope checks
  if (data.version !== 1) {
    issues.push(
      issue(
        'version',
        `Expected version 1, got ${JSON.stringify(data.version)}`,
      ),
    );
  }
  if (typeof data.exportedAt !== 'string') {
    issues.push(issue('exportedAt', 'Expected ISO date string', 'warning'));
  }
  if (!isObject(data.state)) {
    issues.push(issue('state', 'Expected state object'));
    return issues;
  }

  const state = data.state;

  // dataTypes
  if (!isObject(state.dataTypes)) {
    issues.push(issue('state.dataTypes', 'Expected dataTypes object'));
  } else {
    for (const [dtId, dt] of Object.entries(state.dataTypes)) {
      if (!isObject(dt)) {
        issues.push(
          issue(`state.dataTypes.${dtId}`, 'Expected data type object'),
        );
        continue;
      }
      if (typeof dt.name !== 'string') {
        issues.push(
          issue(`state.dataTypes.${dtId}.name`, 'Expected string name'),
        );
      }
      if (typeof dt.underlyingType !== 'string') {
        issues.push(
          issue(
            `state.dataTypes.${dtId}.underlyingType`,
            'Expected string underlyingType',
          ),
        );
      }
    }
  }

  // typeOfNodes
  if (!isObject(state.typeOfNodes)) {
    issues.push(issue('state.typeOfNodes', 'Expected typeOfNodes object'));
  } else {
    for (const [ntId, nt] of Object.entries(state.typeOfNodes)) {
      if (!isObject(nt)) {
        issues.push(
          issue(`state.typeOfNodes.${ntId}`, 'Expected node type object'),
        );
        continue;
      }
      const nodeType = nt;
      if (typeof nodeType.name !== 'string') {
        issues.push(
          issue(`state.typeOfNodes.${ntId}.name`, 'Expected string name'),
        );
      }
      if (!Array.isArray(nodeType.inputs)) {
        issues.push(
          issue(`state.typeOfNodes.${ntId}.inputs`, 'Expected inputs array'),
        );
      }
      if (!Array.isArray(nodeType.outputs)) {
        issues.push(
          issue(`state.typeOfNodes.${ntId}.outputs`, 'Expected outputs array'),
        );
      }
    }
  }

  // nodes
  if (!Array.isArray(state.nodes)) {
    issues.push(issue('state.nodes', 'Expected nodes array'));
  } else {
    const nodeIds = new Set<string>();
    for (let i = 0; i < state.nodes.length; i++) {
      const node = state.nodes[i];
      const path = `state.nodes[${i}]`;

      if (!isObject(node)) {
        issues.push(issue(path, 'Expected node object'));
        continue;
      }

      const n = node;
      if (typeof n.id !== 'string') {
        issues.push(issue(`${path}.id`, 'Expected string id'));
      } else {
        if (nodeIds.has(n.id)) {
          issues.push(
            issue(`${path}.id`, `Duplicate node ID: "${n.id}"`, 'warning'),
          );
        }
        nodeIds.add(n.id);
      }

      if (typeof n.type !== 'string' && n.type !== undefined) {
        issues.push(issue(`${path}.type`, 'Expected string type'));
      }

      if (!isObject(n.position)) {
        issues.push(issue(`${path}.position`, 'Expected position object'));
      } else {
        const pos = n.position;
        if (typeof pos.x !== 'number') {
          issues.push(issue(`${path}.position.x`, 'Expected number x'));
        }
        if (typeof pos.y !== 'number') {
          issues.push(issue(`${path}.position.y`, 'Expected number y'));
        }
      }
    }

    // Root Graph I/O invariants (unique/non-empty handle names, single root
    // Graph Input/Output) — the editor enforces these, but import bypasses it.
    checkRootGraphIo(state.nodes, issues);
  }

  // edges
  if (!Array.isArray(state.edges)) {
    issues.push(issue('state.edges', 'Expected edges array'));
  } else {
    const edgeIds = new Set<string>();
    const nodeIds = new Set<string>();
    if (Array.isArray(state.nodes)) {
      for (const node of state.nodes) {
        if (isObject(node) && typeof node.id === 'string') {
          nodeIds.add(node.id);
        }
      }
    }

    for (let i = 0; i < state.edges.length; i++) {
      const edge = state.edges[i];
      const path = `state.edges[${i}]`;

      if (!isObject(edge)) {
        issues.push(issue(path, 'Expected edge object'));
        continue;
      }

      const e = edge;
      if (typeof e.id !== 'string') {
        issues.push(issue(`${path}.id`, 'Expected string id'));
      } else {
        if (edgeIds.has(e.id)) {
          issues.push(
            issue(`${path}.id`, `Duplicate edge ID: "${e.id}"`, 'warning'),
          );
        }
        edgeIds.add(e.id);
      }

      if (typeof e.source !== 'string') {
        issues.push(issue(`${path}.source`, 'Expected string source'));
      } else if (nodeIds.size > 0 && !nodeIds.has(e.source)) {
        issues.push(
          issue(
            `${path}.source`,
            `Source node "${e.source}" not found`,
            'warning',
          ),
        );
      }

      if (typeof e.target !== 'string') {
        issues.push(issue(`${path}.target`, 'Expected string target'));
      } else if (nodeIds.size > 0 && !nodeIds.has(e.target)) {
        issues.push(
          issue(
            `${path}.target`,
            `Target node "${e.target}" not found`,
            'warning',
          ),
        );
      }

      if (typeof e.sourceHandle !== 'string') {
        issues.push(
          issue(`${path}.sourceHandle`, 'Expected string sourceHandle'),
        );
      }
      if (typeof e.targetHandle !== 'string') {
        issues.push(
          issue(`${path}.targetHandle`, 'Expected string targetHandle'),
        );
      }
    }
  }

  return issues;
}

// ─────────────────────────────────────────────────────
// Execution Record Validation
// ─────────────────────────────────────────────────────

const validRecordStatuses = ['completed', 'errored', 'cancelled'];
const validStepStatuses = ['completed', 'errored', 'skipped'];

/**
 * Validate one serialized structure-record map (`loopRecords`,
 * `switchRecords`, `groupRecords`).
 *
 * Its KEYS are identity keys (`executionRecorder` › `structureRecordKey` — a
 * JSON array holding the structure's full path, e.g. `["g2","L7"]`), and each
 * value carries the same identity structurally as `ownerInstancePath`.
 * Recordings exported before that format existed carry bare structure ids and
 * no `ownerInstancePath`; they still import and still resolve, through
 * `resolveStructureRecord`'s legacy scan. A legacy key is therefore a
 * staleness WARNING, never an error — and it is reported once per map rather
 * than once per key, so an old recording yields one actionable line instead
 * of a flood.
 */
function validateStructureRecordMap(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    issues.push(
      issue(path, `Expected ${path.split('.').pop()} object`, 'warning'),
    );
    return;
  }

  const keys = Object.keys(value);
  let legacyKeyCount = 0;
  for (const key of keys) {
    if (!isStructureRecordKey(key)) legacyKeyCount++;
    const entry = value[key];
    if (!isObject(entry)) {
      // ERROR, not warning. A legacy KEY is staleness — the record is fine and
      // still resolves. A non-object VALUE is structural corruption: the
      // deserializers spread `{...obj}` with no guard, so letting this through
      // hands the timeline and inspector a value typed `LoopRecord` whose
      // every required field is `undefined`, and the failure then surfaces far
      // from the import that caused it.
      issues.push(
        issue(`${path}[${JSON.stringify(key)}]`, 'Expected record object'),
      );
      continue;
    }
    const owner = entry.ownerInstancePath;
    if (
      owner !== undefined &&
      !(
        Array.isArray(owner) &&
        owner.every((segment) => typeof segment === 'string')
      )
    ) {
      issues.push(
        issue(
          `${path}[${JSON.stringify(key)}].ownerInstancePath`,
          'Expected an array of group-instance ids',
          'warning',
        ),
      );
    }

    // RECURSE. The maps most likely to hold aliased pre-v3 keys are the nested
    // ones — AU-01 and AU-02 were a group-inner and a nested-loop bug — and a
    // top-level-only sweep reports nothing about them. Each nested map is
    // aggregated on its own path, so the "one actionable line per map" property
    // survives: a file gets one line per map that actually has legacy keys.
    const entryPath = `${path}[${JSON.stringify(key)}]`;
    const innerRecord = entry.innerRecord;
    if (isObject(innerRecord)) {
      validateStructureRecordMap(
        innerRecord.loopRecords,
        `${entryPath}.innerRecord.loopRecords`,
        issues,
      );
      validateStructureRecordMap(
        innerRecord.switchRecords,
        `${entryPath}.innerRecord.switchRecords`,
        issues,
      );
      validateStructureRecordMap(
        innerRecord.groupRecords,
        `${entryPath}.innerRecord.groupRecords`,
        issues,
      );
    }
    if (Array.isArray(entry.iterations)) {
      entry.iterations.forEach((iteration, index) => {
        if (!isObject(iteration)) return;
        validateStructureRecordMap(
          iteration.nestedLoopRecords,
          `${entryPath}.iterations[${index}].nestedLoopRecords`,
          issues,
        );
        validateStructureRecordMap(
          iteration.nestedSwitchRecords,
          `${entryPath}.iterations[${index}].nestedSwitchRecords`,
          issues,
        );
      });
    }
  }

  if (legacyKeyCount > 0) {
    issues.push(
      issue(
        path,
        `${legacyKeyCount} of ${keys.length} record keys use the pre-identity-key format (a bare structure id). They still resolve, but two instances of one node group share their template's structure ids and cannot be told apart — re-export the recording to upgrade it.`,
        'warning',
      ),
    );
  }
}

/**
 * Validate the structure of an exported execution record envelope.
 * Returns all issues found — both errors and warnings.
 */
function validateExecutionRecordStructure(data: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isObject(data)) {
    issues.push(issue('', 'Root must be an object'));
    return issues;
  }

  // Envelope checks
  if (data.version !== 1) {
    issues.push(
      issue(
        'version',
        `Expected version 1, got ${JSON.stringify(data.version)}`,
      ),
    );
  }
  if (typeof data.exportedAt !== 'string') {
    issues.push(issue('exportedAt', 'Expected ISO date string', 'warning'));
  }
  if (!isObject(data.record)) {
    issues.push(issue('record', 'Expected record object'));
    return issues;
  }

  const record = data.record;

  // Top-level fields
  if (typeof record.id !== 'string') {
    issues.push(issue('record.id', 'Expected string id'));
  }
  if (typeof record.startTime !== 'number') {
    issues.push(issue('record.startTime', 'Expected number startTime'));
  }
  if (typeof record.endTime !== 'number') {
    issues.push(issue('record.endTime', 'Expected number endTime'));
  }
  if (typeof record.totalDuration !== 'number') {
    issues.push(issue('record.totalDuration', 'Expected number totalDuration'));
  }
  if (
    typeof record.status !== 'string' ||
    !validRecordStatuses.includes(record.status)
  ) {
    issues.push(
      issue(
        'record.status',
        `Expected one of: ${validRecordStatuses.join(', ')}`,
      ),
    );
  }

  // steps
  if (!Array.isArray(record.steps)) {
    issues.push(issue('record.steps', 'Expected steps array'));
  } else {
    for (let i = 0; i < record.steps.length; i++) {
      const step = record.steps[i];
      const path = `record.steps[${i}]`;

      if (!isObject(step)) {
        issues.push(issue(path, 'Expected step object'));
        continue;
      }

      const s = step;
      if (typeof s.stepIndex !== 'number') {
        issues.push(issue(`${path}.stepIndex`, 'Expected number stepIndex'));
      }
      if (typeof s.nodeId !== 'string') {
        issues.push(issue(`${path}.nodeId`, 'Expected string nodeId'));
      }
      if (typeof s.nodeTypeId !== 'string') {
        issues.push(issue(`${path}.nodeTypeId`, 'Expected string nodeTypeId'));
      }
      if (
        typeof s.status !== 'string' ||
        !validStepStatuses.includes(s.status)
      ) {
        issues.push(
          issue(
            `${path}.status`,
            `Expected one of: ${validStepStatuses.join(', ')}`,
          ),
        );
      }
      if (!isObject(s.inputValues)) {
        issues.push(
          issue(`${path}.inputValues`, 'Expected inputValues object'),
        );
      }
      if (!isObject(s.outputValues)) {
        issues.push(
          issue(`${path}.outputValues`, 'Expected outputValues object'),
        );
      }
    }
  }

  // errors
  if (!Array.isArray(record.errors)) {
    issues.push(issue('record.errors', 'Expected errors array', 'warning'));
  }

  // concurrencyLevels
  if (!Array.isArray(record.concurrencyLevels)) {
    issues.push(
      issue(
        'record.concurrencyLevels',
        'Expected concurrencyLevels array',
        'warning',
      ),
    );
  }

  // Structure-record maps (serialized Maps) — shape, key format and identity
  validateStructureRecordMap(record.loopRecords, 'record.loopRecords', issues);
  validateStructureRecordMap(
    record.switchRecords,
    'record.switchRecords',
    issues,
  );
  validateStructureRecordMap(
    record.groupRecords,
    'record.groupRecords',
    issues,
  );

  if (record.finalValues !== undefined && !isObject(record.finalValues)) {
    issues.push(
      issue('record.finalValues', 'Expected finalValues object', 'warning'),
    );
  }

  return issues;
}

// ─────────────────────────────────────────────────────
// Root Graph I/O repair
// ─────────────────────────────────────────────────────

/**
 * Rename empty/duplicate leaf handle names in `list` in place so every name is
 * non-empty and unique, mirroring the editor's auto-name behavior (`input1`,
 * `input2`, …). Returns the number of names that were rewritten.
 */
function repairBoundaryHandleNames(list: unknown, prefix: string): number {
  if (!Array.isArray(list)) return 0;
  const used = new Set<string>();
  let nextIndex = 1;
  const nextName = (): string => {
    let candidate = `${prefix}${nextIndex}`;
    while (used.has(candidate)) {
      nextIndex += 1;
      candidate = `${prefix}${nextIndex}`;
    }
    nextIndex += 1;
    return candidate;
  };
  let repaired = 0;

  const fix = (handle: Record<string, unknown>): void => {
    // Never rename the blank infer template into a fake `input{n}` — it is
    // intentionally empty and the E2 editor filter depends on it staying so.
    if (isInferTemplateHandle(handle)) return;
    const name = typeof handle.name === 'string' ? handle.name.trim() : '';
    if (name === '' || used.has(name)) {
      handle.name = nextName();
      repaired += 1;
    } else {
      used.add(name);
    }
    used.add(handle.name as string);
  };

  for (const handle of list) {
    if (!isObject(handle)) continue;
    if (Array.isArray(handle.inputs)) {
      for (const inner of handle.inputs) {
        if (isObject(inner)) fix(inner);
      }
    } else {
      fix(handle);
    }
  }
  return repaired;
}

/**
 * Opt-in repair for the root Graph I/O invariants checked by `checkRootGraphIo`:
 * keep the FIRST root Graph Input / Graph Output (matching the compiler's
 * first-match behavior) and drop any extras, then de-duplicate / fill empty
 * handle names on the kept boundary nodes. Mutates `state.nodes` in place and
 * pushes a `warning` for each repair performed.
 */
function repairRootGraphIo(
  state: Record<string, unknown>,
  warnings: ValidationIssue[],
): void {
  if (!Array.isArray(state.nodes)) return;
  const nodes: unknown[] = state.nodes;

  let seenInput = false;
  let seenOutput = false;
  let droppedInputs = 0;
  let droppedOutputs = 0;

  const kept = nodes.filter((node) => {
    if (!isObject(node)) return true;
    const typeId = nodeTypeUniqueIdOf(node);
    if (typeId === standardNodeTypeNamesMap.groupInput) {
      if (seenInput) {
        droppedInputs += 1;
        return false;
      }
      seenInput = true;
    } else if (typeId === standardNodeTypeNamesMap.groupOutput) {
      if (seenOutput) {
        droppedOutputs += 1;
        return false;
      }
      seenOutput = true;
    }
    return true;
  });

  if (droppedInputs > 0) {
    warnings.push(
      issue(
        'state.nodes',
        `Removed ${droppedInputs} extra root Graph Input node(s) (kept first)`,
        'warning',
      ),
    );
  }
  if (droppedOutputs > 0) {
    warnings.push(
      issue(
        'state.nodes',
        `Removed ${droppedOutputs} extra root Graph Output node(s) (kept first)`,
        'warning',
      ),
    );
  }
  state.nodes = kept;

  let renamed = 0;
  for (const node of kept) {
    if (!isObject(node) || !isObject(node.data)) continue;
    const typeId = nodeTypeUniqueIdOf(node);
    if (typeId === standardNodeTypeNamesMap.groupInput) {
      renamed += repairBoundaryHandleNames(node.data.outputs, 'input');
    } else if (typeId === standardNodeTypeNamesMap.groupOutput) {
      renamed += repairBoundaryHandleNames(node.data.inputs, 'output');
    }
  }
  if (renamed > 0) {
    warnings.push(
      issue(
        'state.nodes',
        `Renamed ${renamed} empty/duplicate root Graph I/O handle name(s)`,
        'warning',
      ),
    );
  }
}

/**
 * Opt-in repair for the fan-in connection-order invariant the REORDER editor
 * guarantees but a raw import bypasses: within each input handle's fan-in group,
 * the editor writes contiguous `0..n-1` `edge.data.order`. A hand-edited or
 * round-tripped import can carry sparse, duplicate, negative, fractional,
 * non-finite, out-of-range, or non-number orders. This repacks each such group to
 * `0..n-1` in the order the compiler resolves them (`compareFanIn`: order then a
 * stable edges-array tiebreak), so the on-screen preview, runtime
 * `connections[]`, and codegen all agree and obey the contract. Crash-safety does
 * NOT depend on this (the compiler's `connectionOrderValue` sentinel already
 * holds) — it is contract truth + observability. Leaves untouched any group that
 * is already canonical (`0..n-1`) or entirely un-reordered (back-compat — no edge
 * carries an `order` key), so a normal import is a silent no-op. Root scope only
 * (mirrors `repairRootGraphIo`); group-subtree edges are left as-is (still
 * crash-safe via the compiler guard). Mutates `state.edges` in place; pushes ONE
 * summary warning if anything was rewritten.
 */
function normalizeConnectionOrder(
  state: Record<string, unknown>,
  warnings: ValidationIssue[],
): void {
  if (!Array.isArray(state.edges)) return;
  const edges: unknown[] = state.edges;

  // Group edge array-indices by `${target}:${targetHandle}` (the fan-in key).
  const groupsByHandle = new Map<string, number[]>();
  for (let index = 0; index < edges.length; index++) {
    const edge = edges[index];
    if (!isObject(edge)) continue;
    if (
      typeof edge.target !== 'string' ||
      typeof edge.targetHandle !== 'string'
    ) {
      continue;
    }
    const key = `${edge.target}:${edge.targetHandle}`;
    const bucket = groupsByHandle.get(key);
    if (bucket) bucket.push(index);
    else groupsByHandle.set(key, [index]);
  }

  let rewritten = 0;
  for (const indices of groupsByHandle.values()) {
    if (indices.length < 2) continue; // a singleton carries no order (compiler skips)

    const orders = indices.map((index) => orderOfImportedEdge(edges[index]));
    // Leave back-compat (no edge carries an `order` key → implicit edges-array
    // order) and already-canonical `0..n-1` groups exactly as-is; only repack
    // groups whose orders genuinely violate the contract.
    if (!indices.some((index) => importedEdgeHasOrderKey(edges[index])))
      continue;
    if (isCanonicalConnectionOrder(orders)) continue;

    const sortedIndices = [...indices].sort((firstIndex, secondIndex) =>
      compareFanIn(
        orderOfImportedEdge(edges[firstIndex]),
        firstIndex,
        orderOfImportedEdge(edges[secondIndex]),
        secondIndex,
      ),
    );
    for (let rank = 0; rank < sortedIndices.length; rank++) {
      const edge = edges[sortedIndices[rank]];
      if (!isObject(edge)) continue;
      if (orderOfImportedEdge(edge) === rank) continue; // already at the right rank
      edge.data = {
        ...(isObject(edge.data) ? edge.data : {}),
        order: rank,
      };
      rewritten += 1;
    }
  }

  if (rewritten > 0) {
    warnings.push(
      issue(
        'state.edges',
        `Normalized ${rewritten} fan-in connection order value(s) to contiguous 0..n-1`,
        'warning',
      ),
    );
  }
}

/** Read a possibly-malformed imported `edge.data.order` as the compiler gate sees it. */
function orderOfImportedEdge(edge: unknown): number | undefined {
  if (!isObject(edge) || !isObject(edge.data)) return undefined;
  const order = edge.data.order;
  return typeof order === 'number' ? order : undefined;
}

/** True iff the edge carries an `order` key at all (distinguishes back-compat from garbage). */
function importedEdgeHasOrderKey(edge: unknown): boolean {
  return isObject(edge) && isObject(edge.data) && 'order' in edge.data;
}

/** True iff `orders` is exactly a dense `0..n-1` permutation (no gaps/dups/unset/fractional). */
function isCanonicalConnectionOrder(orders: (number | undefined)[]): boolean {
  const seen = new Set<number>();
  for (const order of orders) {
    if (
      typeof order !== 'number' ||
      !Number.isInteger(order) ||
      order < 0 ||
      order >= orders.length
    ) {
      return false;
    }
    if (seen.has(order)) return false;
    seen.add(order);
  }
  return true;
}

/**
 * ALWAYS-ON structural safety for the authored `userZones` field (root AND each
 * group subtree). A passive, visual-only field a hand-edited / version-skewed file
 * could carry as garbage must never be able to crash the canvas: the overlay does
 * `zone.nodeIds.length` / `for…of zone.nodeIds` and renders `zone.name`/`zone.color`.
 * This drops non-object `userZones` and non-object zones, coerces `nodeIds` to a
 * string array, and replaces a non-string `name`/`color` with a default. Runs on
 * EVERY import (NOT gated on a repair flag) because REPLACE_STATE bypasses the
 * editor and `handleImportState` spreads the imported state wholesale. Mutates in
 * place; pushes ONE summary warning if it dropped anything.
 */
function coerceUserZones(
  state: Record<string, unknown>,
  warnings: ValidationIssue[],
): void {
  let dropped = 0;
  const coerceContainer = (container: Record<string, unknown>): void => {
    if (!('userZones' in container) || container.userZones === undefined)
      return;
    if (!isObject(container.userZones)) {
      delete container.userZones;
      dropped += 1;
      return;
    }
    const userZones = container.userZones;
    for (const zoneId of Object.keys(userZones)) {
      const zone = userZones[zoneId];
      if (!isObject(zone)) {
        delete userZones[zoneId];
        dropped += 1;
        continue;
      }
      // The map KEY is the authoritative id — every edit path is keyed on it, so
      // a file with id ≠ key would render a zone that can't be edited or deleted.
      zone.id = zoneId;
      const coercedNodeIds = Array.isArray(zone.nodeIds)
        ? [
            ...new Set(
              zone.nodeIds.filter((id): id is string => typeof id === 'string'),
            ),
          ]
        : [];
      zone.nodeIds = coercedNodeIds;
      // An authored zone always has ≥1 member (ADD requires it; both removal
      // paths auto-delete at 0), so an empty one is illegitimate — drop it.
      if (coercedNodeIds.length === 0) {
        delete userZones[zoneId];
        dropped += 1;
        continue;
      }
      if (typeof zone.name !== 'string') zone.name = 'Zone';
      // Canonicalize the color to the stored lowercase-hex form so a no-change
      // recolor of an imported zone compares equal; unparseable → default.
      zone.color =
        (typeof zone.color === 'string'
          ? normalizeZoneColor(zone.color)
          : undefined) ?? '#888888';
      // User zones are visual-only — never carry system enforcement fields.
      zone.enforced = false;
      delete zone.boundaryHandles;
      delete zone.structureLink;
    }
  };
  coerceContainer(state);
  if (isObject(state.typeOfNodes)) {
    for (const ntId of Object.keys(state.typeOfNodes)) {
      const nodeType = state.typeOfNodes[ntId];
      if (isObject(nodeType) && isObject(nodeType.subtree)) {
        coerceContainer(nodeType.subtree);
      }
    }
  }
  if (dropped > 0) {
    warnings.push(
      issue(
        'state.userZones',
        `Dropped ${dropped} malformed user zone(s)`,
        'warning',
      ),
    );
  }
}

/**
 * Coerce the document-level `runnerViewPreferences` on import. Runs on EVERY import
 * (REPLACE_STATE bypasses the editor). GLOBAL — root container ONLY (no subtree walk,
 * unlike `coerceUserZones`). An ABSENT or `null` field is left untouched
 * (byte-preserving — the read accessor `getRunnerViewPreferences` supplies the default
 * per-field). A PRESENT value is repaired to exactly `{ autoScroll, followIntoGroups }`
 * (both booleans; unknown keys dropped). Warns ONLY when a present value was actually
 * malformed (a non-object, or a non-boolean field); silent for filling a missing
 * sub-field or dropping junk keys. Mutates in place.
 */
function coerceRunnerViewPreferences(
  state: Record<string, unknown>,
  warnings: ValidationIssue[],
): void {
  // Absent OR null → leave as-is (the accessor defaults per-field at read).
  if (
    !('runnerViewPreferences' in state) ||
    state.runnerViewPreferences == null
  ) {
    return;
  }
  const raw = state.runnerViewPreferences;
  if (!isObject(raw)) {
    // Present but not a plain object (string / number / array) — a real corruption.
    state.runnerViewPreferences = { ...DEFAULT_RUNNER_VIEW_PREFERENCES };
    warnings.push(
      issue(
        'state.runnerViewPreferences',
        'Replaced a malformed runnerViewPreferences with defaults',
        'warning',
      ),
    );
    return;
  }
  // Present object → rebuild to exactly the two known boolean keys.
  let corrected = false;
  const coerceField = (key: 'autoScroll' | 'followIntoGroups'): boolean => {
    const value = raw[key];
    if (typeof value === 'boolean') return value;
    // A present non-boolean is a real correction; an absent sub-field is a benign fill.
    if (value !== undefined) corrected = true;
    return DEFAULT_RUNNER_VIEW_PREFERENCES[key];
  };
  state.runnerViewPreferences = {
    autoScroll: coerceField('autoScroll'),
    followIntoGroups: coerceField('followIntoGroups'),
  };
  if (corrected) {
    warnings.push(
      issue(
        'state.runnerViewPreferences',
        'Corrected a malformed runnerViewPreferences field',
        'warning',
      ),
    );
  }
}

/**
 * OPT-IN cleanup for `userZones` (root AND each group subtree): prunes member ids
 * that don't reference a node in the SAME container's `nodes` (ghosts from
 * hand-edits or node-removal paths that bypass the reducer prune) and drops any
 * zone left with no real members. Assumes `coerceUserZones` already ran. Each
 * container's ghost set is built from its OWN `nodes` — a subtree zone references
 * `subtree.nodes`, never root, so reusing a root set here would wrongly prune
 * every subtree member. Mutates in place; pushes ONE summary warning.
 */
function normalizeUserZones(
  state: Record<string, unknown>,
  warnings: ValidationIssue[],
): void {
  let changed = 0;
  const normalizeContainer = (container: Record<string, unknown>): void => {
    if (!isObject(container.userZones)) return;
    const nodeIdSet = new Set<string>();
    if (Array.isArray(container.nodes)) {
      for (const node of container.nodes) {
        if (isObject(node) && typeof node.id === 'string') {
          nodeIdSet.add(node.id);
        }
      }
    }
    const userZones = container.userZones;
    for (const zoneId of Object.keys(userZones)) {
      const zone = userZones[zoneId];
      if (!isObject(zone) || !Array.isArray(zone.nodeIds)) continue;
      const kept = zone.nodeIds.filter(
        (id): id is string => typeof id === 'string' && nodeIdSet.has(id),
      );
      if (kept.length === zone.nodeIds.length) continue;
      changed += 1;
      if (kept.length === 0) {
        delete userZones[zoneId];
      } else {
        zone.nodeIds = kept;
      }
    }
  };
  normalizeContainer(state);
  if (isObject(state.typeOfNodes)) {
    for (const ntId of Object.keys(state.typeOfNodes)) {
      const nodeType = state.typeOfNodes[ntId];
      if (isObject(nodeType) && isObject(nodeType.subtree)) {
        normalizeContainer(nodeType.subtree);
      }
    }
  }
  if (changed > 0) {
    warnings.push(
      issue(
        'state.userZones',
        `Pruned ghost node ids from ${changed} user zone(s)`,
        'warning',
      ),
    );
  }
}

export {
  validateGraphStateStructure,
  validateExecutionRecordStructure,
  checkRootGraphIo,
  repairRootGraphIo,
  normalizeConnectionOrder,
  coerceUserZones,
  coerceRunnerViewPreferences,
  normalizeUserZones,
  isObject,
};
