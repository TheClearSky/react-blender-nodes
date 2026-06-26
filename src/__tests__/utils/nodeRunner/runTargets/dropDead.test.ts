import { describe, expect, it } from 'vitest';
import { emitJs } from '@/utils/nodeRunner/runTargets/codegen/emitJs';
import type { ExecutionPlan } from '@/utils/nodeRunner/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

const num = { dataTypeUniqueId: 'number' };
const node = (id: string, t: string, i: unknown[], o: unknown[]) => ({
  id,
  position: { x: 0, y: 0 },
  data: { nodeTypeUniqueId: t, inputs: i, outputs: o },
});

// src → useful (the kept sink); src → dead (output unused);
// lonely → deadOnly (output unused — lonely is transitively dead).
function fixture() {
  const plan: ExecutionPlan = {
    levels: [
      [
        {
          kind: 'standard',
          nodeId: 'src',
          nodeTypeId: 'src',
          nodeTypeName: 'Src',
          concurrencyLevel: 0,
        },
        {
          kind: 'standard',
          nodeId: 'lonely',
          nodeTypeId: 'src',
          nodeTypeName: 'Lonely',
          concurrencyLevel: 0,
        },
      ],
      [
        {
          kind: 'standard',
          nodeId: 'useful',
          nodeTypeId: 'id',
          nodeTypeName: 'Useful',
          concurrencyLevel: 1,
        },
        {
          kind: 'standard',
          nodeId: 'dead',
          nodeTypeId: 'id',
          nodeTypeName: 'Dead',
          concurrencyLevel: 1,
        },
        {
          kind: 'standard',
          nodeId: 'deadOnly',
          nodeTypeId: 'id',
          nodeTypeName: 'DeadOnly',
          concurrencyLevel: 1,
        },
      ],
    ],
    inputResolutionMap: new Map([
      [
        'useful:in',
        [{ edgeId: 'e1', sourceNodeId: 'src', sourceHandleId: 'src_out' }],
      ],
      [
        'dead:in',
        [{ edgeId: 'e2', sourceNodeId: 'src', sourceHandleId: 'src_out' }],
      ],
      [
        'deadOnly:in',
        [
          {
            edgeId: 'e3',
            sourceNodeId: 'lonely',
            sourceHandleId: 'lonely_out',
          },
        ],
      ],
    ]),
    outputDistributionMap: new Map(),
    nodeCount: 5,
    warnings: [],
  };
  const state = {
    nodes: [
      node('src', 'src', [], [{ id: 'src_out', name: 'V', dataType: num }]),
      node(
        'lonely',
        'src',
        [],
        [{ id: 'lonely_out', name: 'V', dataType: num }],
      ),
      node(
        'useful',
        'id',
        [{ id: 'in', name: 'A', dataType: num }],
        [{ id: 'r', name: 'R', dataType: num }],
      ),
      node(
        'dead',
        'id',
        [{ id: 'in', name: 'A', dataType: num }],
        [{ id: 'd', name: 'D', dataType: num }],
      ),
      node(
        'deadOnly',
        'id',
        [{ id: 'in', name: 'A', dataType: num }],
        [{ id: 'o', name: 'O', dataType: num }],
      ),
    ],
    edges: [],
    typeOfNodes: { src: { name: 'Src' }, id: { name: 'Id' } },
    dataTypes: {},
  };
  return { plan, state: state as AnyState };
}

type ValueApiInput = { connections: { value: unknown }[]; isDefault: boolean };
async function run(source: string): Promise<Record<string, unknown>> {
  const impls = {
    src: () => new Map<string, unknown>([['V', 10]]),
    id: (inputs: Map<string, ValueApiInput>, outputs: Map<string, unknown>) => {
      const a = Number(inputs.get('A')?.connections[0]?.value ?? 0);
      const outName = [...outputs.keys()][0];
      return new Map<string, unknown>([[outName, a]]);
    },
  };
  const runGraph = new Function(`${source}\nreturn runGraph;`)() as (
    i: unknown,
    o?: unknown,
  ) => Promise<Record<string, unknown>>;
  return runGraph(impls, {});
}

describe('emitJs — dead-code elimination (Stage C)', () => {
  it('drops pure nodes no returned value depends on (incl. transitively)', () => {
    const { plan, state } = fixture();
    const source = emitJs(plan, state, {
      returnValues: ['useful:r'],
      assumePureImplementations: true,
      exportRunGraph: false,
    });
    expect(source).toContain('[src]');
    expect(source).toContain('[useful]');
    expect(source).not.toContain('[dead]');
    expect(source).not.toContain('[deadOnly]');
    expect(source).not.toContain('[lonely]'); // transitively dead
    expect(source).toContain('return { "useful:r": usefulR };');
  });

  it('is inert without assumePureImplementations (narrows return only)', () => {
    const { plan, state } = fixture();
    const source = emitJs(plan, state, {
      returnValues: ['useful:r'],
      exportRunGraph: false,
    });
    expect(source).toContain('[dead]'); // nodes kept — only the return is narrowed
    expect(source).toContain('[lonely]');
    expect(source).toContain('return { "useful:r": usefulR };');
  });

  it('is inert with assumePure but no narrowed return (every key is a root)', () => {
    const { plan, state } = fixture();
    const source = emitJs(plan, state, {
      assumePureImplementations: true,
      exportRunGraph: false,
    });
    expect(source).toContain('[dead]');
    // full (non-narrowed) return includes every output — nothing was dropped
    expect(source).toContain('"dead:d":');
    expect(source).toContain('"deadOnly:o":');
  });

  it('optimized output still computes the kept value correctly', async () => {
    const { plan, state } = fixture();
    const source = emitJs(plan, state, {
      returnValues: ['useful:r'],
      assumePureImplementations: true,
      exportRunGraph: false,
    });
    const values = await run(source);
    expect(values).toEqual({ 'useful:r': 10 });
  });
});
