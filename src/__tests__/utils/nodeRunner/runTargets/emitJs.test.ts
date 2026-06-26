import { describe, expect, it } from 'vitest';
import { execute } from '@/utils/nodeRunner/executor';
import { emitJs } from '@/utils/nodeRunner/runTargets/codegen/emitJs';
import { standardDataTypeNamesMap } from '@/utils/nodeStateManagement/standardNodes';
import type {
  ExecutionPlan,
  FunctionImplementations,
  InputHandleValue,
  InputResolutionEntry,
} from '@/utils/nodeRunner/types';

// ─────────────────────────────────────────────────────
// Test harness: the parity oracle.
//
// Each fixture is a hand-crafted (plan, state, impls) — the same approach as
// executor.test.ts. We run BOTH the in-process executor and the emitted
// `runGraph`, then assert their value stores are equal. Group-inner values live
// in a child ValueStore (keys "gid>…") that the root snapshot does not include,
// and the JIT-warmup key is executor-only — both are stripped before comparing.
// ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

function comparableValues(
  pairs: Iterable<[string, unknown]>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of pairs) {
    if (key.includes('__jit_warmup__')) continue; // executor-only warmup key
    if (key.includes('>')) continue; // group-inner scoped store (not in root snapshot)
    if (value === undefined) continue; // absent vs undefined are equivalent
    result[key] = value;
  }
  return result;
}

function evaluateRunGraph(
  source: string,
): (impls: FunctionImplementations) => Promise<Record<string, unknown>> {
  const factory = new Function(`${source}\nreturn runGraph;`);
  return factory();
}

async function runInProcess(
  plan: ExecutionPlan,
  state: AnyState,
  impls: FunctionImplementations,
): Promise<Record<string, unknown>> {
  const record = await execute(plan, impls, state, {
    onNodeStateChange: () => {},
    abortSignal: new AbortController().signal,
  });
  return comparableValues(record.finalValues);
}

async function runEmitted(
  plan: ExecutionPlan,
  state: AnyState,
  impls: FunctionImplementations,
): Promise<Record<string, unknown>> {
  const source = emitJs(plan, state, { exportRunGraph: false });
  const runGraph = evaluateRunGraph(source);
  const values = await runGraph(impls);
  return comparableValues(Object.entries(values));
}

async function assertParity(
  plan: ExecutionPlan,
  state: AnyState,
  impls: FunctionImplementations,
): Promise<Record<string, unknown>> {
  const inProcess = await runInProcess(plan, state, impls);
  const emitted = await runEmitted(plan, state, impls);
  expect(emitted).toEqual(inProcess);
  return emitted;
}

const number = { dataTypeUniqueId: 'number' };
const condition = { dataTypeUniqueId: standardDataTypeNamesMap.condition };

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

function resolution(
  pairs: Record<string, ReadonlyArray<InputResolutionEntry>>,
): Map<string, ReadonlyArray<InputResolutionEntry>> {
  return new Map(Object.entries(pairs));
}

/** First connection's value (falling back to the handle default), coerced to number. */
function connectionValue(
  inputs: ReadonlyMap<string, InputHandleValue>,
  name: string,
): number {
  const handle = inputs.get(name);
  return Number(handle?.connections[0]?.value ?? handle?.defaultValue ?? 0);
}

/** Sum of every connection's value on one handle (fan-in), coerced to number. */
function sumConnections(
  inputs: ReadonlyMap<string, InputHandleValue>,
  name: string,
): number {
  return (inputs.get(name)?.connections ?? []).reduce(
    (total, connection) => total + Number(connection.value),
    0,
  );
}

describe('emitJs — parity with the in-process executor', () => {
  it('single node: stores the produced output', async () => {
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
      ],
      inputResolutionMap: new Map(),
      outputDistributionMap: new Map(),
      nodeCount: 1,
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
      ],
      edges: [],
      typeOfNodes: { producer: { name: 'Producer' } },
      dataTypes: {},
    };
    const impls: FunctionImplementations = {
      producer: () => new Map([['Out', 42]]),
    };
    const values = await assertParity(plan, state, impls);
    expect(values['a:a_out']).toBe(42);
  });

  it('chain across levels: B consumes A', async () => {
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
      inputResolutionMap: resolution({
        'b:b_in': [{ edgeId: 'e', sourceNodeId: 'a', sourceHandleId: 'a_out' }],
      }),
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
    const impls: FunctionImplementations = {
      producer: () => new Map([['Out', 10]]),
      doubler: (inputs) =>
        new Map([['Out', connectionValue(inputs, 'In') * 2]]),
    };
    const values = await assertParity(plan, state, impls);
    expect(values['b:b_out']).toBe(20);
  });

  it('fan-in: one handle with multiple connections', async () => {
    const plan: ExecutionPlan = {
      levels: [
        [
          {
            kind: 'standard',
            nodeId: 'a',
            nodeTypeId: 'pa',
            nodeTypeName: 'A',
            concurrencyLevel: 0,
          },
          {
            kind: 'standard',
            nodeId: 'b',
            nodeTypeId: 'pb',
            nodeTypeName: 'B',
            concurrencyLevel: 0,
          },
        ],
        [
          {
            kind: 'standard',
            nodeId: 'c',
            nodeTypeId: 'summer',
            nodeTypeName: 'Summer',
            concurrencyLevel: 1,
          },
        ],
      ],
      inputResolutionMap: resolution({
        'c:c_in': [
          { edgeId: 'e1', sourceNodeId: 'a', sourceHandleId: 'a_out' },
          { edgeId: 'e2', sourceNodeId: 'b', sourceHandleId: 'b_out' },
        ],
      }),
      outputDistributionMap: new Map(),
      nodeCount: 3,
      warnings: [],
    };
    const state = {
      nodes: [
        node('a', 'pa', [], [{ id: 'a_out', name: 'Out', dataType: number }]),
        node('b', 'pb', [], [{ id: 'b_out', name: 'Out', dataType: number }]),
        node(
          'c',
          'summer',
          [{ id: 'c_in', name: 'Vals', dataType: number }],
          [{ id: 'c_out', name: 'Sum', dataType: number }],
        ),
      ],
      edges: [],
      typeOfNodes: {
        pa: { name: 'A' },
        pb: { name: 'B' },
        summer: { name: 'Summer' },
      },
      dataTypes: {},
    };
    const impls: FunctionImplementations = {
      pa: () => new Map([['Out', 3]]),
      pb: () => new Map([['Out', 4]]),
      summer: (inputs) => new Map([['Sum', sumConnections(inputs, 'Vals')]]),
    };
    const values = await assertParity(plan, state, impls);
    expect(values['c:c_out']).toBe(7);
  });

  it('default value: unconnected allowInput handle', async () => {
    const plan: ExecutionPlan = {
      levels: [
        [
          {
            kind: 'standard',
            nodeId: 'd',
            nodeTypeId: 'dtype',
            nodeTypeName: 'D',
            concurrencyLevel: 0,
          },
        ],
      ],
      inputResolutionMap: new Map(),
      outputDistributionMap: new Map(),
      nodeCount: 1,
      warnings: [],
    };
    const state = {
      nodes: [
        node(
          'd',
          'dtype',
          [
            {
              id: 'd_in',
              name: 'V',
              allowInput: true,
              value: 7,
              dataType: number,
            },
          ],
          [{ id: 'd_out', name: 'Out', dataType: number }],
        ),
      ],
      edges: [],
      typeOfNodes: { dtype: { name: 'D' } },
      dataTypes: {},
    };
    const impls: FunctionImplementations = {
      dtype: (inputs) => new Map([['Out', connectionValue(inputs, 'V') * 2]]),
    };
    const values = await assertParity(plan, state, impls);
    expect(values['d:d_out']).toBe(14);
  });

  it('loop: a counter that iterates until the condition is false', async () => {
    const loopBlock = {
      kind: 'loop' as const,
      loopStartNodeId: 'ls',
      loopStopNodeId: 'lstop',
      loopEndNodeId: 'le',
      preStopSteps: [
        {
          kind: 'standard' as const,
          nodeId: 'inc',
          nodeTypeId: 'inc',
          nodeTypeName: 'Inc',
          concurrencyLevel: 0,
        },
      ],
      postStopSteps: [],
      maxIterations: 10,
      concurrencyLevel: 1,
    };
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
        ],
        [loopBlock],
      ],
      inputResolutionMap: resolution({
        'ls:ls_in': [
          { edgeId: 'e0', sourceNodeId: 'src', sourceHandleId: 'src_out' },
        ],
        'inc:inc_in': [
          { edgeId: 'e1', sourceNodeId: 'ls', sourceHandleId: 'ls_out' },
        ],
        'lstop:lstop_data': [
          { edgeId: 'e2', sourceNodeId: 'inc', sourceHandleId: 'inc_n' },
        ],
        'lstop:lstop_cond': [
          { edgeId: 'e3', sourceNodeId: 'inc', sourceHandleId: 'inc_cont' },
        ],
        'le:le_in': [
          { edgeId: 'e4', sourceNodeId: 'lstop', sourceHandleId: 'lstop_out' },
        ],
      }),
      outputDistributionMap: new Map(),
      nodeCount: 5,
      warnings: [],
    };
    const state = {
      nodes: [
        node(
          'src',
          'src',
          [],
          [{ id: 'src_out', name: 'N', dataType: number }],
        ),
        node(
          'ls',
          'loopStart',
          [{ id: 'ls_in', name: 'In', dataType: number }],
          [{ id: 'ls_out', name: 'Body', dataType: number }],
        ),
        node(
          'inc',
          'inc',
          [{ id: 'inc_in', name: 'N', dataType: number }],
          [
            { id: 'inc_n', name: 'N', dataType: number },
            { id: 'inc_cont', name: 'Cont', dataType: number },
          ],
        ),
        node(
          'lstop',
          'loopStop',
          [
            { id: 'lstop_data', name: 'D', dataType: number },
            { id: 'lstop_cond', name: 'C', dataType: condition },
          ],
          [{ id: 'lstop_out', name: 'O', dataType: number }],
        ),
        node(
          'le',
          'loopEnd',
          [{ id: 'le_in', name: 'I', dataType: number }],
          [{ id: 'le_out', name: 'R', dataType: number }],
        ),
      ],
      edges: [],
      typeOfNodes: {
        src: { name: 'Src' },
        loopStart: { name: 'Loop Start' },
        inc: { name: 'Inc' },
        loopStop: { name: 'Loop Stop' },
        loopEnd: { name: 'Loop End' },
      },
      dataTypes: {},
    };
    const impls: FunctionImplementations = {
      src: () => new Map([['N', 0]]),
      inc: (inputs) => {
        const next = connectionValue(inputs, 'N') + 1;
        return new Map<string, unknown>([
          ['N', next],
          ['Cont', next < 3],
        ]);
      },
    };
    const values = await assertParity(plan, state, impls);
    expect(values['le:le_out']).toBe(3);
  });

  it('switch: takes the true branch and merges its zone at SwitchEnd', async () => {
    const switchBlock = {
      kind: 'switch' as const,
      switchStartNodeId: 'ss',
      switchEndNodeId: 'se',
      trueBranchSteps: [
        {
          kind: 'standard' as const,
          nodeId: 'tnode',
          nodeTypeId: 'dbl',
          nodeTypeName: 'Dbl',
          concurrencyLevel: 0,
        },
      ],
      falseBranchSteps: [
        {
          kind: 'standard' as const,
          nodeId: 'fnode',
          nodeTypeId: 'neg',
          nodeTypeName: 'Neg',
          concurrencyLevel: 0,
        },
      ],
      concurrencyLevel: 1,
    };
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
        ],
        [switchBlock],
      ],
      inputResolutionMap: resolution({
        'ss:ss_data': [
          { edgeId: 'e0', sourceNodeId: 'src', sourceHandleId: 'src_out' },
        ],
        'tnode:tn_in': [
          { edgeId: 'e1', sourceNodeId: 'ss', sourceHandleId: 'ss_true' },
        ],
        'fnode:fn_in': [
          { edgeId: 'e2', sourceNodeId: 'ss', sourceHandleId: 'ss_false' },
        ],
        'se:se_true_in': [
          { edgeId: 'e3', sourceNodeId: 'tnode', sourceHandleId: 'tn_out' },
        ],
        'se:se_false_in': [
          { edgeId: 'e4', sourceNodeId: 'fnode', sourceHandleId: 'fn_out' },
        ],
      }),
      outputDistributionMap: new Map(),
      nodeCount: 4,
      warnings: [],
    };
    const state = {
      nodes: [
        node(
          'src',
          'src',
          [],
          [{ id: 'src_out', name: 'N', dataType: number }],
        ),
        node(
          'ss',
          'switchStart',
          [
            { id: 'ss_data', name: 'D', dataType: number },
            {
              id: 'ss_cond',
              name: 'C',
              allowInput: true,
              value: true,
              dataType: condition,
            },
          ],
          [
            { id: 'ss_true', name: 'T', dataType: number },
            { id: 'ss_false', name: 'F', dataType: number },
          ],
        ),
        node(
          'tnode',
          'dbl',
          [{ id: 'tn_in', name: 'In', dataType: number }],
          [{ id: 'tn_out', name: 'Out', dataType: number }],
        ),
        node(
          'fnode',
          'neg',
          [{ id: 'fn_in', name: 'In', dataType: number }],
          [{ id: 'fn_out', name: 'Out', dataType: number }],
        ),
        node(
          'se',
          'switchEnd',
          [
            { id: 'se_true_in', name: 'TI', dataType: number },
            { id: 'se_false_in', name: 'FI', dataType: number },
          ],
          [{ id: 'se_out', name: 'O', dataType: number }],
        ),
      ],
      edges: [],
      typeOfNodes: {
        src: { name: 'Src' },
        switchStart: { name: 'Switch Start' },
        dbl: { name: 'Dbl' },
        neg: { name: 'Neg' },
        switchEnd: { name: 'Switch End' },
      },
      dataTypes: {},
    };
    const impls: FunctionImplementations = {
      src: () => new Map([['N', 5]]),
      dbl: (inputs) => new Map([['Out', connectionValue(inputs, 'In') * 2]]),
      neg: (inputs) => new Map([['Out', -connectionValue(inputs, 'In')]]),
    };
    const values = await assertParity(plan, state, impls);
    expect(values['se:se_out']).toBe(10);
  });

  it('group: maps boundaries and runs the inner plan in a scoped store', async () => {
    const innerPlan: ExecutionPlan = {
      levels: [
        [
          {
            kind: 'standard',
            nodeId: 'inner',
            nodeTypeId: 'tripler',
            nodeTypeName: 'Tripler',
            concurrencyLevel: 0,
          },
        ],
      ],
      inputResolutionMap: resolution({
        'inner:inner_in': [
          { edgeId: 'ie1', sourceNodeId: 'gi', sourceHandleId: 'gi_out' },
        ],
        'go:go_in': [
          { edgeId: 'ie2', sourceNodeId: 'inner', sourceHandleId: 'inner_out' },
        ],
      }),
      outputDistributionMap: new Map(),
      nodeCount: 1,
      warnings: [],
    };
    const groupStep = {
      kind: 'group' as const,
      groupNodeId: 'g1',
      groupNodeTypeId: 'myGroup',
      groupNodeTypeName: 'My Group',
      innerPlan,
      inputMapping: new Map([['g1_in', 'gi_out']]),
      outputMapping: new Map([['go_in', 'g1_out']]),
      concurrencyLevel: 1,
    };
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
        ],
        [groupStep],
      ],
      inputResolutionMap: resolution({
        'g1:g1_in': [
          { edgeId: 'e0', sourceNodeId: 'src', sourceHandleId: 'src_out' },
        ],
      }),
      outputDistributionMap: new Map(),
      nodeCount: 2,
      warnings: [],
    };
    const subtree = {
      inputNodeId: 'gi',
      outputNodeId: 'go',
      nodes: [
        node(
          'gi',
          'groupInput',
          [],
          [{ id: 'gi_out', name: 'X', dataType: number }],
        ),
        node(
          'inner',
          'tripler',
          [{ id: 'inner_in', name: 'X', dataType: number }],
          [{ id: 'inner_out', name: 'Y', dataType: number }],
        ),
        node(
          'go',
          'groupOutput',
          [{ id: 'go_in', name: 'Y', dataType: number }],
          [],
        ),
      ],
      edges: [],
    };
    const state = {
      nodes: [
        node(
          'src',
          'src',
          [],
          [{ id: 'src_out', name: 'N', dataType: number }],
        ),
        node(
          'g1',
          'myGroup',
          [{ id: 'g1_in', name: 'In', dataType: number }],
          [{ id: 'g1_out', name: 'Out', dataType: number }],
        ),
      ],
      edges: [],
      typeOfNodes: {
        src: { name: 'Src' },
        myGroup: { name: 'My Group', subtree },
        tripler: { name: 'Tripler' },
      },
      dataTypes: {},
    };
    const impls: FunctionImplementations = {
      src: () => new Map([['N', 4]]),
      tripler: (inputs) => new Map([['Y', connectionValue(inputs, 'X') * 3]]),
    };
    const values = await assertParity(plan, state as AnyState, impls);
    expect(values['g1:g1_out']).toBe(12);
  });

  it('emits readable, standalone source (structure smoke check)', () => {
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
      ],
      inputResolutionMap: new Map(),
      outputDistributionMap: new Map(),
      nodeCount: 1,
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
      ],
      edges: [],
      typeOfNodes: { producer: { name: 'Producer' } },
      dataTypes: {},
    };
    const source = emitJs(plan, state as AnyState);
    expect(source).toContain('async function runGraph(functionImplementations');
    expect(source).toContain('functionImplementations["producer"]');
    expect(source).toContain('export { runGraph };');
  });
});
