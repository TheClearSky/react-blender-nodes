import type { ValidationIssue } from './types';

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

  const state = data.state as Record<string, unknown>;

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
      if (typeof (dt as Record<string, unknown>).name !== 'string') {
        issues.push(
          issue(`state.dataTypes.${dtId}.name`, 'Expected string name'),
        );
      }
      if (typeof (dt as Record<string, unknown>).underlyingType !== 'string') {
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
      const nodeType = nt as Record<string, unknown>;
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

      const n = node as Record<string, unknown>;
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
        const pos = n.position as Record<string, unknown>;
        if (typeof pos.x !== 'number') {
          issues.push(issue(`${path}.position.x`, 'Expected number x'));
        }
        if (typeof pos.y !== 'number') {
          issues.push(issue(`${path}.position.y`, 'Expected number y'));
        }
      }
    }
  }

  // edges
  if (!Array.isArray(state.edges)) {
    issues.push(issue('state.edges', 'Expected edges array'));
  } else {
    const edgeIds = new Set<string>();
    const nodeIds = new Set<string>();
    if (Array.isArray(state.nodes)) {
      for (const node of state.nodes) {
        if (
          isObject(node) &&
          typeof (node as Record<string, unknown>).id === 'string'
        ) {
          nodeIds.add((node as Record<string, unknown>).id as string);
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

      const e = edge as Record<string, unknown>;
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

  const record = data.record as Record<string, unknown>;

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

      const s = step as Record<string, unknown>;
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

export {
  validateGraphStateStructure,
  validateExecutionRecordStructure,
  isObject,
};
