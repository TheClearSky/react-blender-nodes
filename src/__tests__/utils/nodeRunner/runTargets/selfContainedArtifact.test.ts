import { describe, it, expect } from 'vitest';
import { execute } from '@/utils/nodeRunner/executor';
import { emitGraph } from '@/utils/nodeRunner/runTargets/codegen/emitGraph';
import { eliminateDeadCode } from '@/utils/nodeRunner/runTargets/codegen/ast/deadCode';
import { loadTs } from '@/utils/nodeRunner/runTargets/codegen/tsLoader';
import type {
  ExecutionPlan,
  FunctionImplementations,
  InputResolutionEntry,
} from '@/utils/nodeRunner/types';

// Stage-2 integration: the source-emission feature wired end-to-end through
// emitGraph. The oracle is eval-and-deep-equal vs the in-process executor (the
// repo idiom, mirroring emitJs.test.ts) plus the signature / header / warning
// invariants the convergence reviews pinned.
//
// NOTE: a BARE `readInput` local stand-in is used inside the impls (vitest
// namespaces module imports → unresolved → would thread; bare names are what an
// unbundled consumer authors). The executor runs the same closures (capturing the
// local `readInput`/`tripleHelper`); the emitted module bakes the `readInput`
// intrinsic + the helper. Both compute identically.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;
const number = { dataTypeUniqueId: 'number' };

const readInput = (
  inputs: ReadonlyMap<string, unknown>,
  name: string,
): unknown[] => {
  const handle = inputs.get(name) as
    | { connections?: { value: unknown }[]; defaultValue?: unknown }
    | undefined;
  return handle && handle.connections && handle.connections.length > 0
    ? handle.connections.map((connection) => connection.value)
    : [handle ? handle.defaultValue : undefined];
};
const tripleHelper = (value: number): number => value * 3;

function comparableValues(
  pairs: Iterable<[string, unknown]>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of pairs) {
    if (key.includes('__jit_warmup__')) continue;
    if (key.includes('>')) continue;
    if (value === undefined) continue;
    result[key] = value;
  }
  return result;
}

function evaluateRunGraph(
  source: string,
): (...args: unknown[]) => Promise<Record<string, unknown>> {
  return new Function(`${source}\nreturn runGraph;`)();
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

/** A two-node graph: Src (Out=4) → Tripler (Out = 3 * In). The Tripler impl is
 *  parameterised so a covered vs threaded variant can share the topology. */
function buildFixture(triplerImpl: FunctionImplementations[string]) {
  const plan: ExecutionPlan = {
    levels: [
      [
        {
          kind: 'standard',
          nodeId: 'a',
          nodeTypeId: 'src',
          nodeTypeName: 'Src',
          concurrencyLevel: 0,
        },
      ],
      [
        {
          kind: 'standard',
          nodeId: 'b',
          nodeTypeId: 'tripler',
          nodeTypeName: 'Tripler',
          concurrencyLevel: 1,
        },
      ],
    ],
    inputResolutionMap: new Map<string, ReadonlyArray<InputResolutionEntry>>([
      ['b:b_in', [{ edgeId: 'e', sourceNodeId: 'a', sourceHandleId: 'a_out' }]],
    ]),
    outputDistributionMap: new Map(),
    nodeCount: 2,
    warnings: [],
  };
  const state = {
    nodes: [
      node('a', 'src', [], [{ id: 'a_out', name: 'Out', dataType: number }]),
      node(
        'b',
        'tripler',
        [{ id: 'b_in', name: 'In', dataType: number }],
        [{ id: 'b_out', name: 'Out', dataType: number }],
      ),
    ],
    edges: [],
    typeOfNodes: { src: { name: 'Src' }, tripler: { name: 'Tripler' } },
    dataTypes: {},
  } as AnyState;
  const impls: FunctionImplementations = {
    src: () => new Map([['Out', 4]]),
    tripler: triplerImpl,
  };
  return { plan, state, impls };
}

const coveredTripler: FunctionImplementations[string] = (inputs) =>
  new Map([['Out', tripleHelper(Number(readInput(inputs, 'In')[0]))]]);

// Reads `context.state` (executor-only) → NOT source-emittable → threads. The
// read is voided, so the output is identical to the covered variant either way.
const threadedTripler: FunctionImplementations[string] = (
  inputs,
  _outputs,
  context,
) => {
  void (context as { state?: unknown }).state;
  return new Map([['Out', tripleHelper(Number(readInput(inputs, 'In')[0]))]]);
};

describe('emitImplementations: source — fully covered', () => {
  it('bakes every impl + helper, drops the functionImplementations param, and matches the executor', async () => {
    const { plan, state, impls } = buildFixture(coveredTripler);
    const knownFunctions = { ...impls, tripleHelper } as Readonly<
      Record<string, (...args: never[]) => unknown>
    >;

    const source = await emitGraph(plan, state, {
      exportRunGraph: false,
      emitImplementations: 'source',
      knownFunctions,
    });

    // Standalone: no threaded impls, the param dropped, the helper + intrinsic baked.
    expect(source).not.toContain('functionImplementations');
    expect(source).toMatch(/async function runGraph\(options = \{\}\)/);
    expect(source).toContain('const readInput =');
    expect(source).toContain('const tripleHelper =');
    // Header survives the signatureOnly reprint EXACTLY once (no drop, no duplicate).
    expect(source.split('// Auto-generated').length - 1).toBe(1);
    expect(source.split('// warning:').length).toBe(1); // no coverage warnings

    // Parity: runGraph() with ZERO impls deep-equals the in-process executor.
    const runGraph = evaluateRunGraph(source);
    const emitted = comparableValues(Object.entries(await runGraph()));
    const inProcess = await runInProcess(plan, state, impls);
    expect(emitted).toEqual(inProcess);
    expect(emitted['b:b_out']).toBe(12);
  });
});

describe('emitImplementations: source — mixed coverage', () => {
  it('threads the uncovered node, keeps the param + a warning, and matches the executor', async () => {
    const { plan, state, impls } = buildFixture(threadedTripler);
    const knownFunctions = { ...impls, tripleHelper } as Readonly<
      Record<string, (...args: never[]) => unknown>
    >;

    const source = await emitGraph(plan, state, {
      exportRunGraph: false,
      emitImplementations: 'source',
      knownFunctions,
    });

    // Src baked; Tripler threaded (reads context.state) → param kept + a warning.
    expect(source).toContain('functionImplementations["tripler"]');
    expect(source).toMatch(/async function runGraph\(functionImplementations/);
    expect(source).toMatch(/\/\/ warning: node type "tripler" stays threaded/);
    expect(source).toContain('context.state');

    // Parity: supply the leftover (threaded) impl; Src is baked.
    const runGraph = evaluateRunGraph(source);
    const emitted = comparableValues(
      Object.entries(await runGraph({ tripler: impls.tripler })),
    );
    const inProcess = await runInProcess(plan, state, impls);
    expect(emitted).toEqual(inProcess);
    expect(emitted['b:b_out']).toBe(12);
  });
});

describe('eliminateDeadCode — signatureOnly + implCallNames', () => {
  it('drops an unreferenced functionImplementations param, keeps options/async/header', async () => {
    const ts = await loadTs();
    const source = [
      '// header line one',
      '// header line two',
      '',
      'async function runGraph(functionImplementations, options = {}) {',
      '  const abortSignal = options.abortSignal;',
      '  const x = await localFn(abortSignal);',
      '  return { "n:o": x };',
      '}',
      '',
      'export { runGraph };',
    ].join('\n');

    const cleaned = eliminateDeadCode(ts, source, { signatureOnly: true });

    expect(cleaned).toMatch(/function runGraph\(options = \{\}\)/);
    expect(cleaned).not.toContain('functionImplementations');
    expect(cleaned).toContain('async'); // an await survives
    // Header preserved by the printer EXACTLY once (no drop, no duplicate).
    expect(cleaned.split('header line one').length - 1).toBe(1);
    expect(cleaned).toContain('export { runGraph };');
  });

  it('keeps a side-effecting baked node under full DCE unless assumePure (implCallNames floor)', async () => {
    const ts = await loadTs();
    const source = [
      'async function runGraph(options = {}) {',
      '  const display = (i) => undefined;',
      '  const out = await display(1);', // a baked impl call binding, output unused
      '  return {};',
      '}',
    ].join('\n');

    // Without assumePure: the binding is treated as side-effecting (kept).
    const kept = eliminateDeadCode(ts, source, {
      implCallNames: new Set(['display']),
    });
    expect(kept).toContain('await display(1)');

    // With assumePure: the dead binding is prunable.
    const pruned = eliminateDeadCode(ts, source, {
      implCallNames: new Set(['display']),
      assumePureImplementations: true,
    });
    expect(pruned).not.toContain('await display(1)');
  });
});
