import { describe, it, expect } from 'vitest';
import { execute, executeStepByStep } from '@/utils/nodeRunner/executor';
import { compile } from '@/utils/nodeRunner';
import { emitJs } from '@/utils/nodeRunner/runTargets/codegen/emitJs';
import type {
  ExecutionPlan,
  FunctionImplementations,
  InputResolutionEntry,
  StandardExecutionStep,
} from '@/utils/nodeRunner/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;
const number = { dataTypeUniqueId: 'number' };

const step = (
  nodeId: string,
  nodeTypeId: string,
  nodeTypeName: string,
  concurrencyLevel: number,
): StandardExecutionStep => ({
  kind: 'standard',
  nodeId,
  nodeTypeId,
  nodeTypeName,
  concurrencyLevel,
});

const node = (id: string, t: string, i: unknown[], o: unknown[]) => ({
  id,
  position: { x: 0, y: 0 },
  data: { nodeTypeUniqueId: t, inputs: i, outputs: o },
});

const run = (
  plan: ExecutionPlan,
  state: AnyState,
  impls: FunctionImplementations,
  rootInputs?: Record<string, unknown>,
) =>
  execute(plan, impls, state, {
    onNodeStateChange: () => {},
    abortSignal: new AbortController().signal,
    rootInputs,
  });

// Drive executeStepByStep to completion and return the final ExecutionRecord.
async function runStep(
  plan: ExecutionPlan,
  state: AnyState,
  impls: FunctionImplementations,
  rootInputs?: Record<string, unknown>,
) {
  const gen = executeStepByStep(plan, impls, state, {
    onNodeStateChange: () => {},
    abortSignal: new AbortController().signal,
    rootInputs,
  });
  let result = await gen.next();
  while (!result.done) {
    result = await gen.next();
  }
  return result.value;
}

describe('runner — root Graph I/O (E1)', () => {
  // Graph Input (output "x") → Doubler → Graph Output (input "out").
  function fixtureNodes() {
    return [
      node(
        'gi',
        'groupInput',
        [],
        [{ id: 'gi_x', name: 'x', dataType: number }],
      ),
      node(
        'doubler',
        'doubler',
        [{ id: 'd_in', name: 'In', dataType: number }],
        [{ id: 'd_out', name: 'Out', dataType: number }],
      ),
      node(
        'go',
        'groupOutput',
        [{ id: 'go_out', name: 'out', dataType: number }],
        [],
      ),
    ];
  }
  const impls: FunctionImplementations = {
    doubler: (inputs) =>
      new Map([['Out', Number(inputs.get('In')?.connections[0]?.value) * 2]]),
  };

  it('executor seeds rootInputs into the Graph Input and collects rootOutputs', async () => {
    const inputResolutionMap = new Map<
      string,
      ReadonlyArray<InputResolutionEntry>
    >([
      [
        'doubler:d_in',
        [{ edgeId: 'e1', sourceNodeId: 'gi', sourceHandleId: 'gi_x' }],
      ],
      [
        'go:go_out',
        [{ edgeId: 'e2', sourceNodeId: 'doubler', sourceHandleId: 'd_out' }],
      ],
    ]);
    const plan: ExecutionPlan = {
      levels: [
        [step('gi', 'groupInput', 'Graph Input', 0)],
        [step('doubler', 'doubler', 'Doubler', 1)],
        [step('go', 'groupOutput', 'Graph Output', 2)],
      ],
      inputResolutionMap,
      outputDistributionMap: new Map(),
      nodeCount: 3,
      warnings: [],
      rootInputNodeId: 'gi',
      rootOutputNodeId: 'go',
    };
    const state = {
      nodes: fixtureNodes(),
      edges: [],
      typeOfNodes: {
        groupInput: { name: 'Graph Input' },
        groupOutput: { name: 'Graph Output' },
        doubler: { name: 'Doubler' },
      },
      dataTypes: {},
    } as AnyState;

    const record = await run(plan, state, impls, { x: 5 });
    expect(record.status).toBe('completed');
    // 5 → doubler → 10, collected as the named graph output.
    expect(record.rootOutputs).toEqual({ out: 10 });
  });

  it('seeds rootInputs by handle ID when the name key is absent (name-or-id, rename-proof)', async () => {
    const inputResolutionMap = new Map<
      string,
      ReadonlyArray<InputResolutionEntry>
    >([
      [
        'doubler:d_in',
        [{ edgeId: 'e1', sourceNodeId: 'gi', sourceHandleId: 'gi_x' }],
      ],
      [
        'go:go_out',
        [{ edgeId: 'e2', sourceNodeId: 'doubler', sourceHandleId: 'd_out' }],
      ],
    ]);
    const plan: ExecutionPlan = {
      levels: [
        [step('gi', 'groupInput', 'Graph Input', 0)],
        [step('doubler', 'doubler', 'Doubler', 1)],
        [step('go', 'groupOutput', 'Graph Output', 2)],
      ],
      inputResolutionMap,
      outputDistributionMap: new Map(),
      nodeCount: 3,
      warnings: [],
      rootInputNodeId: 'gi',
      rootOutputNodeId: 'go',
    };
    const state = {
      nodes: fixtureNodes(),
      edges: [],
      typeOfNodes: {
        groupInput: { name: 'Graph Input' },
        groupOutput: { name: 'Graph Output' },
        doubler: { name: 'Doubler' },
      },
      dataTypes: {},
    } as AnyState;

    // Key by the stable handle ID `gi_x` instead of the name `x`. A caller who
    // keys by id is immune to rename-on-connect; the name `x` is NOT present.
    const record = await run(plan, state, impls, { gi_x: 5 });
    expect(record.status).toBe('completed');
    expect(record.rootOutputs).toEqual({ out: 10 });
  });

  it('no rootOutputs when the graph has no Graph Output node', async () => {
    const plan: ExecutionPlan = {
      levels: [[step('a', 'producer', 'Producer', 0)]],
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
    } as AnyState;
    const record = await run(plan, state, {
      producer: () => new Map([['Out', 1]]),
    });
    expect(record.rootOutputs).toBeUndefined();
  });

  it('compile detects the root Graph Input / Output nodes and the pipeline runs end-to-end', async () => {
    const state = {
      nodes: fixtureNodes(),
      edges: [
        {
          id: 'e1',
          source: 'gi',
          sourceHandle: 'gi_x',
          target: 'doubler',
          targetHandle: 'd_in',
        },
        {
          id: 'e2',
          source: 'doubler',
          sourceHandle: 'd_out',
          target: 'go',
          targetHandle: 'go_out',
        },
      ],
      typeOfNodes: {
        groupInput: {
          name: 'Graph Input',
          inputs: [],
          outputs: [{ name: 'x', dataType: 'number' }],
        },
        groupOutput: {
          name: 'Graph Output',
          inputs: [{ name: 'out', dataType: 'number' }],
          outputs: [],
        },
        doubler: {
          name: 'Doubler',
          inputs: [{ name: 'In', dataType: 'number' }],
          outputs: [{ name: 'Out', dataType: 'number' }],
        },
      },
      dataTypes: {},
    } as AnyState;

    const plan = compile(state, impls, { maxLoopIterations: 100 });
    expect(plan.rootInputNodeId).toBe('gi');
    expect(plan.rootOutputNodeId).toBe('go');

    const record = await run(plan, state, impls, { x: 7 });
    expect(record.rootOutputs).toEqual({ out: 14 });
  });

  it('step-by-step seeds rootInputs and collects rootOutputs identically to instant (A2)', async () => {
    const state = {
      nodes: fixtureNodes(),
      edges: [
        {
          id: 'e1',
          source: 'gi',
          sourceHandle: 'gi_x',
          target: 'doubler',
          targetHandle: 'd_in',
        },
        {
          id: 'e2',
          source: 'doubler',
          sourceHandle: 'd_out',
          target: 'go',
          targetHandle: 'go_out',
        },
      ],
      typeOfNodes: {
        groupInput: {
          name: 'Graph Input',
          inputs: [],
          outputs: [{ name: 'x', dataType: 'number' }],
        },
        groupOutput: {
          name: 'Graph Output',
          inputs: [{ name: 'out', dataType: 'number' }],
          outputs: [],
        },
        doubler: {
          name: 'Doubler',
          inputs: [{ name: 'In', dataType: 'number' }],
          outputs: [{ name: 'Out', dataType: 'number' }],
        },
      },
      dataTypes: {},
    } as AnyState;

    const plan = compile(state, impls, { maxLoopIterations: 100 });

    const instant = await run(plan, state, impls, { x: 6 });
    const stepped = await runStep(plan, state, impls, { x: 6 });

    // Same seeded input ⇒ same collected outputs across both in-process modes.
    expect(stepped.rootOutputs).toEqual({ out: 12 });
    expect(stepped.rootOutputs).toEqual(instant.rootOutputs);
  });

  it('warns and ignores root Graph I/O when compiling with a node group open (G2)', () => {
    // Root program has a Graph Input + Output, but a node group "adder" is open,
    // so the compiler reads the SUBTREE and isRootScope is false.
    const state = {
      nodes: [
        node(
          'gi',
          'groupInput',
          [],
          [{ id: 'gi_x', name: 'x', dataType: number }],
        ),
        node('group1', 'adder', [], []),
        node(
          'go',
          'groupOutput',
          [{ id: 'go_out', name: 'out', dataType: number }],
          [],
        ),
      ],
      edges: [],
      openedNodeGroupStack: [{ nodeType: 'adder' }],
      typeOfNodes: {
        groupInput: { name: 'Graph Input' },
        groupOutput: { name: 'Graph Output' },
        adder: {
          name: 'Adder',
          subtree: {
            nodes: [
              node(
                'p',
                'producer',
                [],
                [{ id: 'p_out', name: 'Out', dataType: number }],
              ),
            ],
            edges: [],
          },
        },
      },
      dataTypes: {},
    } as AnyState;

    const plan = compile(state, impls, { maxLoopIterations: 100 });

    // Root Graph I/O is dropped (different scope) but the user is warned.
    expect(plan.rootInputNodeId).toBeUndefined();
    expect(plan.rootOutputNodeId).toBeUndefined();
    expect(plan.warnings).toContain(
      'Running inside an open node group ("Adder"); root Graph I/O is ignored.',
    );
  });

  it('fan-in into a Graph Output handle returns an ARRAY (executor + codegen parity)', async () => {
    // Graph Input (x) → Doubler1 ┐
    //                 → Doubler2 ┴→ Graph Output.out   (TWO edges into `out`)
    const state = {
      nodes: [
        node(
          'gi',
          'groupInput',
          [],
          [{ id: 'gi_x', name: 'x', dataType: number }],
        ),
        node(
          'd1',
          'doubler',
          [{ id: 'd1_in', name: 'In', dataType: number }],
          [{ id: 'd1_out', name: 'Out', dataType: number }],
        ),
        node(
          'd2',
          'doubler',
          [{ id: 'd2_in', name: 'In', dataType: number }],
          [{ id: 'd2_out', name: 'Out', dataType: number }],
        ),
        node(
          'go',
          'groupOutput',
          [{ id: 'go_out', name: 'out', dataType: number }],
          [],
        ),
      ],
      edges: [
        {
          id: 'e1',
          source: 'gi',
          sourceHandle: 'gi_x',
          target: 'd1',
          targetHandle: 'd1_in',
        },
        {
          id: 'e2',
          source: 'gi',
          sourceHandle: 'gi_x',
          target: 'd2',
          targetHandle: 'd2_in',
        },
        {
          id: 'e3',
          source: 'd1',
          sourceHandle: 'd1_out',
          target: 'go',
          targetHandle: 'go_out',
        },
        {
          id: 'e4',
          source: 'd2',
          sourceHandle: 'd2_out',
          target: 'go',
          targetHandle: 'go_out',
        },
      ],
      typeOfNodes: {
        groupInput: {
          name: 'Graph Input',
          inputs: [],
          outputs: [{ name: 'x', dataType: 'number' }],
        },
        groupOutput: {
          name: 'Graph Output',
          inputs: [{ name: 'out', dataType: 'number' }],
          outputs: [],
        },
        doubler: {
          name: 'Doubler',
          inputs: [{ name: 'In', dataType: 'number' }],
          outputs: [{ name: 'Out', dataType: 'number' }],
        },
      },
      dataTypes: {},
    } as AnyState;

    const plan = compile(state, impls, { maxLoopIterations: 100 });

    // Executor: the fan-in handle collects BOTH values as an array.
    const record = await run(plan, state, impls, { x: 5 });
    expect(record.rootOutputs).toEqual({ out: [10, 10] });

    // Codegen: `runGraph` returns the same array — parity.
    const source = emitJs(plan, state, { exportRunGraph: false });
    expect(source).toMatch(/return \{ "out": \[/);
    const runGraph = new Function(`${source}\nreturn runGraph;`)() as (
      impls: FunctionImplementations,
      x: number,
    ) => Promise<Record<string, unknown>>;
    expect(await runGraph(impls, 5)).toEqual({ out: [10, 10] });
  });

  it('fan-in array ORDER follows edge order (asymmetric values lock it)', async () => {
    // gi.x → d1 ┐
    // gi.y → d2 ┴→ Graph Output.out  (edge e3 from d1 BEFORE e4 from d2)
    // Distinct values (5, 8) catch a reordering the symmetric [10,10] test cannot.
    const state = {
      nodes: [
        node(
          'gi',
          'groupInput',
          [],
          [
            { id: 'gi_x', name: 'x', dataType: number },
            { id: 'gi_y', name: 'y', dataType: number },
          ],
        ),
        node(
          'd1',
          'doubler',
          [{ id: 'd1_in', name: 'In', dataType: number }],
          [{ id: 'd1_out', name: 'Out', dataType: number }],
        ),
        node(
          'd2',
          'doubler',
          [{ id: 'd2_in', name: 'In', dataType: number }],
          [{ id: 'd2_out', name: 'Out', dataType: number }],
        ),
        node(
          'go',
          'groupOutput',
          [{ id: 'go_out', name: 'out', dataType: number }],
          [],
        ),
      ],
      edges: [
        {
          id: 'e1',
          source: 'gi',
          sourceHandle: 'gi_x',
          target: 'd1',
          targetHandle: 'd1_in',
        },
        {
          id: 'e2',
          source: 'gi',
          sourceHandle: 'gi_y',
          target: 'd2',
          targetHandle: 'd2_in',
        },
        {
          id: 'e3',
          source: 'd1',
          sourceHandle: 'd1_out',
          target: 'go',
          targetHandle: 'go_out',
        },
        {
          id: 'e4',
          source: 'd2',
          sourceHandle: 'd2_out',
          target: 'go',
          targetHandle: 'go_out',
        },
      ],
      typeOfNodes: {
        groupInput: {
          name: 'Graph Input',
          inputs: [],
          outputs: [
            { name: 'x', dataType: 'number' },
            { name: 'y', dataType: 'number' },
          ],
        },
        groupOutput: {
          name: 'Graph Output',
          inputs: [{ name: 'out', dataType: 'number' }],
          outputs: [],
        },
        doubler: {
          name: 'Doubler',
          inputs: [{ name: 'In', dataType: 'number' }],
          outputs: [{ name: 'Out', dataType: 'number' }],
        },
      },
      dataTypes: {},
    } as AnyState;

    const plan = compile(state, impls, { maxLoopIterations: 100 });
    // d1 doubles x=5 → 10 (first edge into `out`); d2 doubles y=8 → 16 (second).
    const record = await run(plan, state, impls, { x: 5, y: 8 });
    expect(record.rootOutputs).toEqual({ out: [10, 16] });

    // Codegen parity: same ordered array.
    const source = emitJs(plan, state, { exportRunGraph: false });
    const runGraph = new Function(`${source}\nreturn runGraph;`)() as (
      impls: FunctionImplementations,
      x: number,
      y: number,
    ) => Promise<Record<string, unknown>>;
    expect(await runGraph(impls, 5, 8)).toEqual({ out: [10, 16] });
  });
});

describe('codegen — root Graph I/O function signature (E4)', () => {
  const bit = { dataTypeUniqueId: 'bit' };
  // Graph Input (a, b) → AND Gate (emitCode) → Graph Output (out).
  const state = {
    nodes: [
      node(
        'gi',
        'groupInput',
        [],
        [
          { id: 'gi_a', name: 'a', dataType: bit },
          { id: 'gi_b', name: 'b', dataType: bit },
        ],
      ),
      node(
        'and',
        'andGate',
        [
          { id: 'and_a', name: 'A', dataType: bit },
          { id: 'and_b', name: 'B', dataType: bit },
        ],
        [{ id: 'and_out', name: 'Out', dataType: bit }],
      ),
      node(
        'go',
        'groupOutput',
        [{ id: 'go_out', name: 'out', dataType: bit }],
        [],
      ),
    ],
    edges: [
      {
        id: 'e1',
        source: 'gi',
        sourceHandle: 'gi_a',
        target: 'and',
        targetHandle: 'and_a',
      },
      {
        id: 'e2',
        source: 'gi',
        sourceHandle: 'gi_b',
        target: 'and',
        targetHandle: 'and_b',
      },
      {
        id: 'e3',
        source: 'and',
        sourceHandle: 'and_out',
        target: 'go',
        targetHandle: 'go_out',
      },
    ],
    typeOfNodes: {
      groupInput: { name: 'Graph Input' },
      groupOutput: { name: 'Graph Output' },
      andGate: { name: 'AND Gate' },
    },
    dataTypes: {},
  } as AnyState;
  const andImpl: FunctionImplementations = {
    andGate: (inputs) =>
      new Map([
        [
          'Out',
          Boolean(inputs.get('A')?.connections[0]?.value) &&
            Boolean(inputs.get('B')?.connections[0]?.value),
        ],
      ]),
  };
  const metadata = {
    nodeTypeMetadata: {
      andGate: {
        emit: ({ inputs }: { inputs: Record<string, string> }) => ({
          Out: `Boolean(${inputs.A}) && Boolean(${inputs.B})`,
        }),
      },
    },
  };

  it('emits a clean `function runGraph(a, b)` (no impls/async) for an emitCode graph', () => {
    const plan = compile(state, andImpl, { maxLoopIterations: 100 });
    const source = emitJs(plan, state, { metadata, exportRunGraph: false });
    // Graph Input handles are the parameters; no functionImplementations / async.
    expect(source).toContain('function runGraph(a, b) {');
    expect(source).not.toContain('functionImplementations');
    expect(source).not.toContain('async function runGraph');
    // The emitCode gate reads the parameters directly.
    expect(source).toContain('Boolean(a) && Boolean(b)');
    // The return is the Graph Output handle, keyed by name.
    expect(source).toContain('return { "out":');
  });

  it('the emitted runGraph(a, b) runs and matches the executor', async () => {
    const plan = compile(state, andImpl, { maxLoopIterations: 100 });
    const source = emitJs(plan, state, { metadata, exportRunGraph: false });
    const runGraph = new Function(`${source}\nreturn runGraph;`)() as (
      a: boolean,
      b: boolean,
    ) => Record<string, unknown>;
    expect(runGraph(true, true)).toEqual({ out: true });
    expect(runGraph(true, false)).toEqual({ out: false });
    // Parity with the in-process executor (rootInputs ≡ runGraph args).
    const record = await run(plan, state, andImpl, { a: true, b: true });
    expect(record.rootOutputs).toEqual(runGraph(true, true));
  });
});
