import { describe, it, expect } from 'vitest';
import { compile } from '@/utils/nodeRunner';
import type {
  ExecutionPlan,
  ExecutionStep,
  GroupExecutionScope,
  FunctionImplementations,
} from '@/utils/nodeRunner/types';

// Pins the connection-order invariant for fan-in handles that live INSIDE a
// structure — the feature's most fragile path. Per the compiler analysis:
//   • a loop body / switch branch node's fan-in resolves in the ROOT plan
//     (keyed "<bodyNode>:<handle>"), because body nodes sit at root scope and
//     their edges are in the root `edges` array sorted by Phase 1;
//   • a group subtree node's fan-in resolves in that group step's `innerPlan`
//     (recursive compile).
// If a future refactor gave bodies their own resolution map without re-applying
// the Phase-1 sort, these compile-level assertions fail — turning D-4's
// documented invariant into an enforced one. Assertions are on the compiled
// `ExecutionPlan`, not runtime/codegen, so they are fast and deterministic.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;
const bit = { dataTypeUniqueId: 'bit' };
const noInfer = { dataTypeUniqueId: 'noEquivalent' }; // bindLoopNodes/bindSwitchNodes marker
const IMPLS = {} as FunctionImplementations;
const COMPILE_OPTS = { maxLoopIterations: 100 };

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  order?: number,
  dataType?: { dataTypeUniqueId: string },
) {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    ...(dataType
      ? { data: { dataType, ...(order !== undefined ? { order } : {}) } }
      : order !== undefined
        ? { data: { order } }
        : {}),
  };
}

/** Edge ids resolved into a handle key, in compile order. Pass the plan that owns
 *  the handle (root plan, or a group step's innerPlan). */
function fanInOrder(plan: ExecutionPlan, key: string): string[] {
  return (plan.inputResolutionMap.get(key) ?? []).map((entry) => entry.edgeId);
}

function findGroupScope(plan: ExecutionPlan): GroupExecutionScope | undefined {
  for (const level of plan.levels)
    for (const step of level as ExecutionStep[])
      if (step.kind === 'group') return step;
  return undefined;
}

// ── (1) Fan-in on a node INSIDE A LOOP BODY (pre-stop region) ────────────────
function loopBodyFixture(orderById: Record<string, number> = {}): AnyState {
  return {
    nodes: [
      {
        id: 's1',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'src',
          inputs: [],
          outputs: [{ id: 's1_o', name: 'O', dataType: bit }],
        },
      },
      {
        id: 's2',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'src',
          inputs: [],
          outputs: [{ id: 's2_o', name: 'O', dataType: bit }],
        },
      },
      {
        id: 'ls',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'loopStart',
          inputs: [{ id: 'ls_bind', name: 'Loop', dataType: noInfer }],
          outputs: [{ id: 'ls_o', name: 'V', dataType: bit }],
        },
      },
      {
        id: 'b',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'consumer',
          inputs: [{ id: 'b_in', name: 'In', dataType: bit }],
          outputs: [{ id: 'b_o', name: 'Out', dataType: bit }],
        },
      },
      {
        id: 'lstop',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'loopStop',
          inputs: [
            { id: 'lstop_in', name: 'V', dataType: bit },
            { id: 'lstop_cond', name: 'Condition', dataType: bit },
          ],
          outputs: [{ id: 'lstop_o', name: 'V', dataType: bit }],
        },
      },
      {
        id: 'le',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'loopEnd',
          inputs: [{ id: 'le_in', name: 'V', dataType: bit }],
          outputs: [{ id: 'le_o', name: 'V', dataType: bit }],
        },
      },
    ],
    edges: [
      edge('be1', 'ls', 'ls_bind', 'lstop', 'lstop_bindIn', undefined, noInfer), // structural
      edge('f1', 's1', 's1_o', 'b', 'b_in', orderById.f1),
      edge('f2', 's2', 's2_o', 'b', 'b_in', orderById.f2),
      edge('e_b_stop', 'b', 'b_o', 'lstop', 'lstop_in'),
    ],
    zones: {
      z_pre: {
        id: 'z_pre',
        structureId: 'ls',
        role: 'preStop',
        nodeIds: ['b'],
      },
      z_post: {
        id: 'z_post',
        structureId: 'ls',
        role: 'postStop',
        nodeIds: [],
      },
    },
    typeOfNodes: {
      src: {
        name: 'Src',
        inputs: [],
        outputs: [{ name: 'O', dataType: 'bit' }],
      },
      consumer: {
        name: 'Consumer',
        inputs: [{ name: 'In', dataType: 'bit' }],
        outputs: [{ name: 'Out', dataType: 'bit' }],
      },
    },
    dataTypes: {},
  } as AnyState;
}

describe('compiler — ordered fan-in INSIDE a loop body (root plan)', () => {
  it('defaults to edges-array order with no data.order', () => {
    expect(
      fanInOrder(compile(loopBodyFixture(), IMPLS, COMPILE_OPTS), 'b:b_in'),
    ).toEqual(['f1', 'f2']);
  });
  it('honors reversed data.order', () => {
    expect(
      fanInOrder(
        compile(loopBodyFixture({ f2: 0, f1: 1 }), IMPLS, COMPILE_OPTS),
        'b:b_in',
      ),
    ).toEqual(['f2', 'f1']);
  });
});

// ── (2) Fan-in on a node INSIDE A SWITCH BRANCH (true zone) ──────────────────
function switchBranchFixture(orderById: Record<string, number> = {}): AnyState {
  return {
    nodes: [
      {
        id: 's1',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'src',
          inputs: [],
          outputs: [{ id: 's1_o', name: 'O', dataType: bit }],
        },
      },
      {
        id: 's2',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'src',
          inputs: [],
          outputs: [{ id: 's2_o', name: 'O', dataType: bit }],
        },
      },
      {
        id: 'sw',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'switchStart',
          inputs: [
            { id: 'sw_bind', name: 'Switch', dataType: noInfer },
            { id: 'sw_cond', name: 'Condition', dataType: bit },
          ],
          outputs: [
            { id: 'sw_t', name: 'T', dataType: bit },
            { id: 'sw_f', name: 'F', dataType: bit },
          ],
        },
      },
      {
        id: 'b',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'consumer',
          inputs: [{ id: 'b_in', name: 'In', dataType: bit }],
          outputs: [{ id: 'b_o', name: 'Out', dataType: bit }],
        },
      },
      {
        id: 'swe',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'switchEnd',
          inputs: [
            { id: 'swe_t', name: 'T', dataType: bit },
            { id: 'swe_f', name: 'F', dataType: bit },
          ],
          outputs: [{ id: 'swe_o', name: 'Out', dataType: bit }],
        },
      },
    ],
    edges: [
      edge('be1', 'sw', 'sw_bind', 'swe', 'swe_bindIn', undefined, noInfer),
      edge('f1', 's1', 's1_o', 'b', 'b_in', orderById.f1),
      edge('f2', 's2', 's2_o', 'b', 'b_in', orderById.f2),
      edge('e_b_end', 'b', 'b_o', 'swe', 'swe_t'),
    ],
    zones: {
      z_t: { id: 'z_t', structureId: 'sw', role: 'trueBranch', nodeIds: ['b'] },
      z_f: { id: 'z_f', structureId: 'sw', role: 'falseBranch', nodeIds: [] },
    },
    typeOfNodes: {
      src: {
        name: 'Src',
        inputs: [],
        outputs: [{ name: 'O', dataType: 'bit' }],
      },
      consumer: {
        name: 'Consumer',
        inputs: [{ name: 'In', dataType: 'bit' }],
        outputs: [{ name: 'Out', dataType: 'bit' }],
      },
    },
    dataTypes: {},
  } as AnyState;
}

describe('compiler — ordered fan-in INSIDE a switch branch (root plan)', () => {
  it('defaults to edges-array order', () => {
    expect(
      fanInOrder(compile(switchBranchFixture(), IMPLS, COMPILE_OPTS), 'b:b_in'),
    ).toEqual(['f1', 'f2']);
  });
  it('honors reversed data.order', () => {
    expect(
      fanInOrder(
        compile(switchBranchFixture({ f2: 0, f1: 1 }), IMPLS, COMPILE_OPTS),
        'b:b_in',
      ),
    ).toEqual(['f2', 'f1']);
  });
});

// ── (3) Fan-in on a node INSIDE A GROUP SUBTREE (innerPlan) ──────────────────
function groupSubtreeFixture(orderById: Record<string, number> = {}): AnyState {
  const subtree = {
    nodes: [
      {
        id: 'gi',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'groupInput',
          inputs: [],
          outputs: [
            { id: 'gi_a', name: 'A', dataType: bit },
            { id: 'gi_b', name: 'B', dataType: bit },
            { id: 'gi_b2', name: 'B 2', dataType: bit },
          ],
        },
      },
      {
        id: 'or',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'orGate',
          inputs: [
            { id: 'or_a', name: 'A', dataType: bit },
            { id: 'or_b', name: 'B', dataType: bit },
          ],
          outputs: [{ id: 'or_out', name: 'Out', dataType: bit }],
        },
      },
      {
        id: 'go',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'groupOutput',
          inputs: [{ id: 'go_out', name: 'Out', dataType: bit }],
          outputs: [],
        },
      },
    ],
    edges: [
      edge('e1', 'gi', 'gi_a', 'or', 'or_a'),
      edge('e2', 'gi', 'gi_b', 'or', 'or_b', orderById.e2),
      edge('e3', 'gi', 'gi_b2', 'or', 'or_b', orderById.e3),
      edge('e4', 'or', 'or_out', 'go', 'go_out'),
    ],
    inputNodeId: 'gi',
    outputNodeId: 'go',
  };
  return {
    nodes: [
      {
        id: 'grp',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'myGroup',
          inputs: [
            { id: 'grp_a', name: 'A', dataType: bit },
            { id: 'grp_b', name: 'B', dataType: bit },
            { id: 'grp_b2', name: 'B 2', dataType: bit },
          ],
          outputs: [{ id: 'grp_out', name: 'Out', dataType: bit }],
        },
      },
    ],
    edges: [],
    typeOfNodes: {
      orGate: {
        name: 'OR Gate',
        inputs: [
          { name: 'A', dataType: 'bit' },
          { name: 'B', dataType: 'bit' },
        ],
        outputs: [{ name: 'Out', dataType: 'bit' }],
      },
      myGroup: {
        name: 'My Group',
        inputs: [
          { name: 'A', dataType: 'bit' },
          { name: 'B', dataType: 'bit' },
          { name: 'B 2', dataType: 'bit' },
        ],
        outputs: [{ name: 'Out', dataType: 'bit' }],
        subtree,
      },
    },
    dataTypes: {},
  } as AnyState;
}

describe('compiler — ordered fan-in INSIDE a group subtree (innerPlan)', () => {
  it('defaults to edges-array order', () => {
    const scope = findGroupScope(
      compile(groupSubtreeFixture(), IMPLS, COMPILE_OPTS),
    );
    expect(scope).toBeDefined();
    expect(fanInOrder(scope!.innerPlan, 'or:or_b')).toEqual(['e2', 'e3']);
  });
  it('honors reversed data.order', () => {
    const scope = findGroupScope(
      compile(groupSubtreeFixture({ e3: 0, e2: 1 }), IMPLS, COMPILE_OPTS),
    );
    expect(scope).toBeDefined();
    expect(fanInOrder(scope!.innerPlan, 'or:or_b')).toEqual(['e3', 'e2']);
  });
});

// ── (4) The captured tiebreak field itself (E-2 / D-4 enforcement) ───────────
describe('compiler — captures edgesArrayIndex as the explicit fan-in tiebreak', () => {
  it('populates the index and, with no data.order, resolves by ascending index', () => {
    const scope = findGroupScope(
      compile(groupSubtreeFixture(), IMPLS, COMPILE_OPTS),
    );
    const entries = scope!.innerPlan.inputResolutionMap.get('or:or_b') ?? [];
    expect(entries.map((entry) => entry.edgeId)).toEqual(['e2', 'e3']);
    const indices = entries.map((entry) => entry.edgesArrayIndex);
    // Every entry carries its source edges-array index ...
    expect(indices.every((index) => typeof index === 'number')).toBe(true);
    // ... and with no data.order the tiebreak resolves them by strictly
    // ascending, distinct index (the mechanism, not just one output).
    const numeric = indices as number[];
    expect([...numeric]).toEqual([...numeric].sort((a, b) => a - b));
    expect(new Set(numeric).size).toBe(numeric.length);
  });
});
