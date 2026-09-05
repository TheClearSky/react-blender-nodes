import { describe, it, expect } from 'vitest';
import { compile } from '@/utils/nodeRunner';
import { readInput } from '@/utils/nodeRunner/readInput';
import type { FunctionImplementations } from '@/utils/nodeRunner/types';

// The compiler resolves a fan-in input handle's `connections[]` in the order its
// edges carry via `data.order` (written by REORDER_INPUT_CONNECTIONS). This is the
// SINGLE point that fixes the order for the executor and for every run target.
// These tests pin that behaviour at the ROOT scope; the loop / switch / group
// cases live in `reorderedFanInInStructures.test.ts`.
//
// Fixture: Graph Input (A, B, B_2) → OR Gate (A, B) → Graph Output (Out), where
// the OR Gate's `B` input is a FAN-IN — both root inputs `B` (edge e2) and `B_2`
// (edge e3) wire into `or.B`.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;
const bit = { dataTypeUniqueId: 'bit' };

function fixture(orderById: Record<string, number> = {}): AnyState {
  function edge(
    id: string,
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string,
  ) {
    return {
      id,
      source,
      sourceHandle,
      target,
      targetHandle,
      ...(orderById[id] !== undefined
        ? { data: { order: orderById[id] } }
        : {}),
    };
  }
  return {
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
      edge('e2', 'gi', 'gi_b', 'or', 'or_b'),
      edge('e3', 'gi', 'gi_b2', 'or', 'or_b'),
      edge('e4', 'or', 'or_out', 'go', 'go_out'),
    ],
    typeOfNodes: {
      groupInput: {
        name: 'Graph Input',
        inputs: [],
        outputs: [
          { name: 'A', dataType: 'bit' },
          { name: 'B', dataType: 'bit' },
          { name: 'B 2', dataType: 'bit' },
        ],
      },
      orGate: {
        name: 'OR Gate',
        inputs: [
          { name: 'A', dataType: 'bit' },
          { name: 'B', dataType: 'bit' },
        ],
        outputs: [{ name: 'Out', dataType: 'bit' }],
      },
      groupOutput: {
        name: 'Graph Output',
        inputs: [{ name: 'Out', dataType: 'bit' }],
        outputs: [],
      },
    },
    dataTypes: {},
  } as AnyState;
}

// Reads B as the WHOLE fan-in array, so B's connections are consumed in
// resolution order.
const ARRAY_OR: FunctionImplementations['orGate'] = (inputs) =>
  new Map([
    [
      'Out',
      Boolean(readInput(inputs, 'A')[0]) ||
        readInput(inputs, 'B').some((value) => Boolean(value)),
    ],
  ]);

const IMPLS = { orGate: ARRAY_OR } as FunctionImplementations;

/** Edge ids resolved into `or.B`, in compile order. */
function fanInEdgeOrder(orderById?: Record<string, number>): string[] {
  const plan = compile(fixture(orderById), IMPLS, { maxLoopIterations: 100 });
  return (plan.inputResolutionMap.get('or:or_b') ?? []).map(
    (entry) => entry.edgeId,
  );
}

describe('compiler — fan-in connection order follows per-edge data.order', () => {
  it('defaults to edges-array order when no order is set (back-compat)', () => {
    expect(fanInEdgeOrder()).toEqual(['e2', 'e3']);
  });

  it('honors an explicit reversed order', () => {
    expect(fanInEdgeOrder({ e3: 0, e2: 1 })).toEqual(['e3', 'e2']);
  });

  it('honors an explicit forward order', () => {
    expect(fanInEdgeOrder({ e2: 0, e3: 1 })).toEqual(['e2', 'e3']);
  });

  it('places an ordered edge before an unordered one (stable sort)', () => {
    // Only e3 is pinned to the front; e2 has no order and trails.
    expect(fanInEdgeOrder({ e3: 0 })).toEqual(['e3', 'e2']);
  });

  it('appends an unordered (newly-added) connection after ordered ones', () => {
    // e2,e3 pinned 0,1; a hypothetical 3rd unordered edge would trail — modeled
    // here by leaving e3 unordered while e2 is pinned first.
    expect(fanInEdgeOrder({ e2: 0 })).toEqual(['e2', 'e3']);
  });
});
