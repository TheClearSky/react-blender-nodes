import type { ValidationIssue } from './types';
import { standardNodeTypeNamesMap } from '../nodeStateManagement/standardNodes';
import { compareFanIn } from '../connectionOrder';

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

  // loopRecords, groupRecords, finalValues — should be objects (serialized Maps)
  if (record.loopRecords !== undefined && !isObject(record.loopRecords)) {
    issues.push(
      issue('record.loopRecords', 'Expected loopRecords object', 'warning'),
    );
  }
  if (record.groupRecords !== undefined && !isObject(record.groupRecords)) {
    issues.push(
      issue('record.groupRecords', 'Expected groupRecords object', 'warning'),
    );
  }
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

export {
  validateGraphStateStructure,
  validateExecutionRecordStructure,
  checkRootGraphIo,
  repairRootGraphIo,
  normalizeConnectionOrder,
  isObject,
};
