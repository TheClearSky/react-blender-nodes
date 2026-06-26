import { describe, expect, it } from 'vitest';
import { emitJs } from '@/utils/nodeRunner/runTargets/codegen/emitJs';
import type { ExecutionPlan } from '@/utils/nodeRunner/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

const number = { dataTypeUniqueId: 'number' };
const node = (id: string, t: string, i: unknown[], o: unknown[]) => ({
  id,
  position: { x: 0, y: 0 },
  data: { nodeTypeUniqueId: t, inputs: i, outputs: o },
});

type EmitContext = {
  inputs: Record<string, string>;
  outputs: ReadonlyArray<string>;
};

// Number source → Add. The Add type opts into the `emitCode` hook (unless its
// `emit` is overridden per-test to throw / under-cover).
function fixture(emit: (context: EmitContext) => Record<string, string>) {
  const plan: ExecutionPlan = {
    levels: [
      [
        {
          kind: 'standard',
          nodeId: 'src',
          nodeTypeId: 'src',
          nodeTypeName: 'Number',
          concurrencyLevel: 0,
        },
      ],
      [
        {
          kind: 'standard',
          nodeId: 'add',
          nodeTypeId: 'add',
          nodeTypeName: 'Add',
          concurrencyLevel: 1,
        },
      ],
    ],
    inputResolutionMap: new Map([
      [
        'add:a',
        [{ edgeId: 'e', sourceNodeId: 'src', sourceHandleId: 'src_out' }],
      ],
    ]),
    outputDistributionMap: new Map(),
    nodeCount: 2,
    warnings: [],
  };
  const state = {
    nodes: [
      node('src', 'src', [], [{ id: 'src_out', name: 'N', dataType: number }]),
      node(
        'add',
        'add',
        [
          { id: 'a', name: 'A', dataType: number },
          { id: 'b', name: 'B', allowInput: true, value: 5, dataType: number },
        ],
        [{ id: 'sum', name: 'Sum', dataType: number }],
      ),
    ],
    edges: [],
    typeOfNodes: {
      src: { name: 'Number' },
      add: { name: 'Add' },
    },
    dataTypes: {},
  };
  // Decision 6: emit hooks live in CodegenMetadata, passed to emitJs (not on state).
  const metadata = { nodeTypeMetadata: { add: { emit } } };
  return { plan, state: state as AnyState, metadata };
}

const addEmit = ({ inputs }: EmitContext) => ({
  Sum: `(${inputs.A}) + (${inputs.B})`,
});

// Two sources fan into the Add node's handle "A" (handle "B" stays its default).
// An emit hook can only thread `entries[0]`, so codegen must fall back to the
// threaded call form for this node to stay value-identical to the executor.
function fanInFixture(emit: (context: EmitContext) => Record<string, string>) {
  const plan: ExecutionPlan = {
    levels: [
      [
        {
          kind: 'standard',
          nodeId: 'src1',
          nodeTypeId: 'src1',
          nodeTypeName: 'Number',
          concurrencyLevel: 0,
        },
        {
          kind: 'standard',
          nodeId: 'src2',
          nodeTypeId: 'src2',
          nodeTypeName: 'Number',
          concurrencyLevel: 0,
        },
      ],
      [
        {
          kind: 'standard',
          nodeId: 'add',
          nodeTypeId: 'add',
          nodeTypeName: 'Add',
          concurrencyLevel: 1,
        },
      ],
    ],
    inputResolutionMap: new Map([
      [
        'add:a',
        [
          { edgeId: 'e1', sourceNodeId: 'src1', sourceHandleId: 'src1_out' },
          { edgeId: 'e2', sourceNodeId: 'src2', sourceHandleId: 'src2_out' },
        ],
      ],
    ]),
    outputDistributionMap: new Map(),
    nodeCount: 3,
    warnings: [],
  };
  const state = {
    nodes: [
      node(
        'src1',
        'src1',
        [],
        [{ id: 'src1_out', name: 'N', dataType: number }],
      ),
      node(
        'src2',
        'src2',
        [],
        [{ id: 'src2_out', name: 'N', dataType: number }],
      ),
      node(
        'add',
        'add',
        [
          { id: 'a', name: 'A', dataType: number },
          { id: 'b', name: 'B', allowInput: true, value: 5, dataType: number },
        ],
        [{ id: 'sum', name: 'Sum', dataType: number }],
      ),
    ],
    edges: [],
    typeOfNodes: {
      src1: { name: 'Number' },
      src2: { name: 'Number' },
      add: { name: 'Add' },
    },
    dataTypes: {},
  };
  const metadata = { nodeTypeMetadata: { add: { emit } } };
  return { plan, state: state as AnyState, metadata };
}

async function run(source: string): Promise<Record<string, unknown>> {
  const impls = { src: () => new Map<string, unknown>([['N', 10]]) };
  const runGraph = new Function(`${source}\nreturn runGraph;`)() as (
    i: unknown,
    o?: unknown,
  ) => Promise<Record<string, unknown>>;
  return runGraph(impls, {});
}

describe('emitJs — emitCode hook (Stage D)', () => {
  it('renders an opted-in node inline instead of a value-API call', () => {
    const { plan, state, metadata } = fixture(addEmit);
    const source = emitJs(plan, state, { metadata, exportRunGraph: false });
    // the Add node became `const addSum = (numberN) + (…);`
    expect(source).toContain('const addSum = (numberN) + (');
    // no implementation call is generated for the inlined node
    expect(source).not.toContain('functionImplementations["add"]');
    // the upstream node is still a normal call
    expect(source).toContain('functionImplementations["src"]');
  });

  it('the inlined expression runs to the correct value', async () => {
    const { plan, state, metadata } = fixture(addEmit);
    const source = emitJs(plan, state, { metadata, exportRunGraph: false });
    const values = await run(source);
    expect(values['add:sum']).toBe(15); // 10 (src) + 5 (default B)
  });

  it('falls back to the call form when emit throws', () => {
    const { plan, state, metadata } = fixture(() => {
      throw new Error('boom');
    });
    const source = emitJs(plan, state, { metadata, exportRunGraph: false });
    expect(source).toContain('functionImplementations["add"]');
    expect(source).not.toContain('const addSum = (numberN)');
  });

  it('falls back when emit does not cover every output', () => {
    const { plan, state, metadata } = fixture(() => ({})); // missing "Sum"
    const source = emitJs(plan, state, { metadata, exportRunGraph: false });
    expect(source).toContain('functionImplementations["add"]');
  });

  it('falls back to the threaded call when a handle has fan-in (>1 edge)', () => {
    const { plan, state, metadata } = fanInFixture(addEmit);
    const source = emitJs(plan, state, { metadata, exportRunGraph: false });
    // The emit hook can only see entries[0]; with fan-in we must NOT inline it —
    // the node threads instead (a `functionImplementations["add"]` call), not an
    // inline `(numberN) + (…)` expression.
    expect(source).not.toContain('const addSum = (numberN) + (');
    expect(source).toContain('functionImplementations["add"]');
    // Both upstream connections are threaded into handle "A".
    expect(source).toContain('makeInput([numberN, numberN2], false)');
  });

  it('the fan-in fallback runs value-identical to the threaded executor', async () => {
    const { plan, state, metadata } = fanInFixture(addEmit);
    const source = emitJs(plan, state, { metadata, exportRunGraph: false });
    // Threaded `add` impl: sum of ALL connections on "A" plus the default of "B".
    const impls = {
      src1: () => new Map<string, unknown>([['N', 10]]),
      src2: () => new Map<string, unknown>([['N', 20]]),
      add: (
        inputs: Map<
          string,
          { connections: { value: unknown }[]; defaultValue?: unknown }
        >,
      ) => {
        const a = (inputs.get('A')?.connections ?? []).reduce(
          (total, connection) => total + Number(connection.value),
          0,
        );
        const b = Number(
          inputs.get('B')?.connections[0]?.value ??
            inputs.get('B')?.defaultValue ??
            0,
        );
        return new Map<string, unknown>([['Sum', a + b]]);
      },
    };
    const runGraph = new Function(`${source}\nreturn runGraph;`)() as (
      i: unknown,
      o?: unknown,
    ) => Promise<Record<string, unknown>>;
    const values = await runGraph(impls, {});
    // 10 (src1) + 20 (src2) + 5 (default B) — both fan-in edges counted.
    expect(values['add:sum']).toBe(35);
  });
});
