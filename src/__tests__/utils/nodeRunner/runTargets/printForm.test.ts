import { describe, expect, it } from 'vitest';
import { emitJs } from '@/utils/nodeRunner/runTargets/codegen/emitJs';
import type { ExecutionPlan } from '@/utils/nodeRunner/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

const number = { dataTypeUniqueId: 'number' };
function node(
  id: string,
  nodeTypeUniqueId: string,
  inputs: ReadonlyArray<Record<string, unknown>>,
  outputs: ReadonlyArray<Record<string, unknown>>,
) {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { nodeTypeUniqueId, inputs, outputs },
  };
}

/** A 2-node chain (≥2 nodeCalls ⇒ the prelude kicks in). */
function twoNodeFixture() {
  const plan: ExecutionPlan = {
    levels: [
      [
        {
          kind: 'standard',
          nodeId: 'a',
          nodeTypeId: 'producer',
          nodeTypeName: 'Producer',
          concurrencyLevel: 0,
        },
      ],
      [
        {
          kind: 'standard',
          nodeId: 'b',
          nodeTypeId: 'doubler',
          nodeTypeName: 'Doubler',
          concurrencyLevel: 1,
        },
      ],
    ],
    inputResolutionMap: new Map([
      ['b:b_in', [{ edgeId: 'e', sourceNodeId: 'a', sourceHandleId: 'a_out' }]],
    ]),
    outputDistributionMap: new Map(),
    nodeCount: 2,
    warnings: [],
  };
  const state = {
    nodes: [
      node(
        'a',
        'producer',
        [],
        [{ id: 'a_out', name: 'Out', dataType: number }],
      ),
      node(
        'b',
        'doubler',
        [{ id: 'b_in', name: 'In', dataType: number }],
        [{ id: 'b_out', name: 'Out', dataType: number }],
      ),
    ],
    edges: [],
    typeOfNodes: {
      producer: { name: 'Producer' },
      doubler: { name: 'Doubler' },
    },
    dataTypes: {},
  };
  return { plan, state: state as AnyState };
}

describe('emitJs output form (Stage B)', () => {
  it('default output is value-API-trimmed with a compact prelude', () => {
    const { plan, state } = twoNodeFixture();
    const source = emitJs(plan, state);
    // named helper functions emitted once
    expect(source).toContain('function makeInput(');
    expect(source).toContain('function makeOutputs(');
    expect(source).toContain('function makeContext(');
    // top-level single-output nodes declare their value inline as a readable local
    // (node type "Producer" + handle "Out" → producerOut)
    expect(source).toContain(
      'const producerOut = (await functionImplementations["producer"]',
    );
    // a downstream node references that bare local directly
    expect(source).toContain('makeInput([producerOut], false)');
    // the return remaps the bare locals back to stable nodeId:handleId keys
    expect(source).toContain('return { "a:a_out": producerOut');
    // inspector-only metadata trimmed; no per-input `.set` ceremony
    expect(source).not.toContain('handleId:');
    expect(source).not.toContain('inputs.set(');
  });
});
