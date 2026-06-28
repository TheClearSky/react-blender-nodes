import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import {
  planSourceEmission,
  READ_INPUT_SOURCE,
} from '@/utils/nodeRunner/runTargets/codegen/analyze/sourceEmit';
import type { RegisteredFunctions } from '@/utils/nodeRunner/runTargets/codegen/analyze/sourceEmit';
import { RESERVED_NAMES } from '@/utils/nodeRunner/runTargets/codegen/nameRegistry';
import { readInput as readInputIntrinsic } from '@/utils/nodeRunner/readInput';

/** The reserved-name set the pipeline injects (see `SourceEmissionInput`). */
const RESERVED = new Set<string>([
  ...RESERVED_NAMES,
  'readInput',
  'switchInputs',
  'loopValue',
]);

// The §10 truth table for `planSourceEmission` — the pure source-emission
// analysis (§0A name closure + §0B value-API surface whitelist + inter-procedural
// propagation + viability/cycles + impl-local dedup). This is the convergence
// check for the analysis: every covered/threaded case the convergence reviews
// raised is pinned here. No pipeline wiring is exercised.
//
// NOTE on `readInput`: vitest's SSR transform namespaces MODULE IMPORTS
// (`readInput` → `__vite_ssr_import_N__.readInput`), so an impl referencing the
// IMPORTED intrinsic would carry an unresolved `__vite_ssr_import_N__` free id and
// thread — the real bundling boundary. To exercise the supported bare-reference
// path (what an unbundled / bare-import consumer authors), impls below reference a
// LOCAL `readInput` const, which the analysis recognises by name. The real
// intrinsic (`readInputIntrinsic`) is used only for the behavioural-equivalence
// test below.
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

// Ambient references used to exercise §0(A) unresolved/whitelisted-global paths
// as BARE identifiers (a module import would be namespaced by vitest).
declare const mysteryHelper: (input: unknown) => unknown;

function plan(
  knownFunctions: RegisteredFunctions,
  nodeTypeIds: string[],
  options: {
    autoEmittedTypeIds?: string[];
    additionalGlobals?: string[];
  } = {},
) {
  return planSourceEmission(ts, {
    knownFunctions,
    allNodeTypeIds: new Set(nodeTypeIds),
    autoEmittedTypeIds: new Set(options.autoEmittedTypeIds ?? []),
    reservedNames: RESERVED,
    additionalGlobals: options.additionalGlobals,
  });
}

const isCovered = (result: ReturnType<typeof plan>, typeId: string): boolean =>
  result.localNameByTypeId.has(typeId);

const warningFor = (
  result: ReturnType<typeof plan>,
  typeId: string,
): string | undefined =>
  result.warnings.find((line) => line.includes(`"${typeId}"`));

const emittedNames = (result: ReturnType<typeof plan>): string[] =>
  result.emittedFunctions.map((fn) => fn.name);

describe('planSourceEmission — covered cases', () => {
  it('covers a helper-using impl and emits the helper before the impl (topo order)', () => {
    const firstVal = (
      handleMap: Map<string, { connections: { value: unknown }[] }>,
      name: string,
    ) => handleMap.get(name)!.connections[0].value;
    const andGate = (
      inputs: Map<string, { connections: { value: unknown }[] }>,
    ) =>
      new Map([
        [
          'Out',
          Boolean(firstVal(inputs, 'A')) && Boolean(firstVal(inputs, 'B')),
        ],
      ]);

    const result = plan({ andGate, firstVal }, ['andGate']);

    expect(isCovered(result, 'andGate')).toBe(true);
    expect(result.localNameByTypeId.get('andGate')).toBe('andGate');
    // helper before impl; no readInput (firstVal reads inputs.get directly)
    expect(emittedNames(result)).toEqual(['firstVal', 'andGate']);
    expect(result.warnings).toHaveLength(0);
  });

  it('covers a readInput-using impl and emits the intrinsic first', () => {
    const andGate = (inputs: Map<string, unknown>) =>
      new Map([
        [
          'Out',
          Boolean(readInput(inputs, 'A')[0]) &&
            Boolean(readInput(inputs, 'B')[0]),
        ],
      ]);

    const result = plan({ andGate }, ['andGate']);

    expect(isCovered(result, 'andGate')).toBe(true);
    expect(emittedNames(result)).toEqual(['readInput', 'andGate']);
  });

  it('covers a Date-using kernel (source-emit, wider SAFE_GLOBALS)', () => {
    const clock = (_inputs: Map<string, unknown>) =>
      new Map([['Out', Date.now()]]);
    const result = plan({ clock }, ['clock']);
    expect(isCovered(result, 'clock')).toBe(true);
  });

  it('covers context reads limited to the prelude fields', () => {
    const tag = (
      _inputs: Map<string, unknown>,
      _outputs: unknown,
      context: { nodeId: string },
    ) => new Map([['Out', context.nodeId]]);
    const result = plan({ tag }, ['tag']);
    expect(isCovered(result, 'tag')).toBe(true);
  });

  it('covers a renamed single param bound by position', () => {
    const node = (i: Map<string, unknown>) =>
      new Map([['Out', readInput(i, 'A')[0]]]);
    const result = plan({ node }, ['node']);
    expect(isCovered(result, 'node')).toBe(true);
  });

  it('covers array-destructuring of a readInput result', () => {
    const node = (inputs: Map<string, unknown>) => {
      const [first] = readInput(inputs, 'A');
      return new Map([['Out', Boolean(first)]]);
    };
    const result = plan({ node }, ['node']);
    expect(isCovered(result, 'node')).toBe(true);
  });

  it('covers a try/catch body — the catch binding is bound, not unresolved', () => {
    const node = (inputs: Map<string, unknown>) => {
      try {
        return new Map([['Out', readInput(inputs, 'A')[0]]]);
      } catch (error) {
        return new Map([['Out', error]]);
      }
    };
    const result = plan({ node }, ['node']);
    expect(isCovered(result, 'node')).toBe(true);
  });

  it('covers a named-function-expression helper that self-recurses by its inner name', () => {
    const fib = function fib(n: number): number {
      return n <= 1 ? n : fib(n - 1) + fib(n - 2);
    };
    const node = (inputs: Map<string, unknown>) =>
      new Map([['Out', fib(Number(readInput(inputs, 'A')[0]))]]);
    const result = plan({ node, fib }, ['node']);
    expect(isCovered(result, 'node')).toBe(true);
    expect(emittedNames(result)).toContain('fib');
  });

  it('emits a shared helper exactly once', () => {
    const dbl = (x: number) => x * 2;
    const a = (inputs: Map<string, unknown>) =>
      new Map([['Out', dbl(Number(readInput(inputs, 'A')[0]))]]);
    const b = (inputs: Map<string, unknown>) =>
      new Map([['Out', dbl(Number(readInput(inputs, 'B')[0]))]]);

    const result = plan({ a, b, dbl }, ['a', 'b']);

    expect(isCovered(result, 'a')).toBe(true);
    expect(isCovered(result, 'b')).toBe(true);
    expect(emittedNames(result).filter((name) => name === 'dbl')).toHaveLength(
      1,
    );
  });
});

describe('planSourceEmission — §0(A) name closure', () => {
  it('threads an impl with an unresolved free identifier', () => {
    const node = (inputs: Map<string, unknown>) =>
      new Map([['Out', mysteryHelper(inputs)]]);
    const result = plan({ node }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toContain('mysteryHelper');
  });

  it('admits an extra ambient global via additionalGlobals', () => {
    const node = (_inputs: Map<string, unknown>) => new Map([['Out', crypto]]);
    const blocked = plan({ node }, ['node']);
    expect(isCovered(blocked, 'node')).toBe(false);
    const allowed = plan({ node }, ['node'], { additionalGlobals: ['crypto'] });
    expect(isCovered(allowed, 'node')).toBe(true);
  });

  it('ignores a non-identifier additionalGlobals entry and warns', () => {
    const node = (_inputs: Map<string, unknown>) => new Map([['Out', 1]]);
    const result = plan({ node }, ['node'], {
      additionalGlobals: ['foo.bar'],
    });
    expect(result.warnings.some((line) => line.includes('foo.bar'))).toBe(true);
  });
});

describe('planSourceEmission — §0(B) value-API surface guard', () => {
  it('threads an impl reading context.state (executor-only)', () => {
    const node = (
      _inputs: Map<string, unknown>,
      _outputs: unknown,
      context: { state?: unknown },
    ) => new Map([['Out', context.state]]);
    const result = plan({ node }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toContain('context.state');
  });

  it('threads an impl reading context.loopIteration', () => {
    const node = (
      _inputs: Map<string, unknown>,
      _outputs: unknown,
      context: { loopIteration?: number },
    ) => new Map([['Out', context.loopIteration]]);
    expect(isCovered(plan({ node }, ['node']), 'node')).toBe(false);
  });

  it('threads a non-.value connection field read', () => {
    const node = (
      inputs: Map<
        string,
        { connections: { value: unknown; sourceNodeId?: string }[] }
      >,
    ) => new Map([['Out', inputs.get('A')!.connections[0].sourceNodeId]]);
    expect(isCovered(plan({ node }, ['node']), 'node')).toBe(false);
  });

  it('threads bracketed access context["state"]', () => {
    const node = (
      _inputs: Map<string, unknown>,
      _outputs: unknown,
      context: Record<string, unknown>,
    ) => new Map([['Out', context['state']]]);
    expect(isCovered(plan({ node }, ['node']), 'node')).toBe(false);
  });

  it('threads dynamic access context[k]', () => {
    const node = (
      _inputs: Map<string, unknown>,
      _outputs: unknown,
      context: Record<string, unknown>,
    ) => {
      const key = 'nodeId';
      return new Map([['Out', context[key]]]);
    };
    expect(isCovered(plan({ node }, ['node']), 'node')).toBe(false);
  });

  it('threads any read of the outputs parameter (v1)', () => {
    const node = (
      _inputs: Map<string, unknown>,
      outputs: Map<string, unknown>,
    ) => new Map([['Out', outputs.get('Out')]]);
    expect(isCovered(plan({ node }, ['node']), 'node')).toBe(false);
  });

  it('threads readInput called on the context param (wrong arg shape)', () => {
    const node = (
      _inputs: Map<string, unknown>,
      _outputs: unknown,
      context: Map<string, unknown>,
    ) => new Map([['Out', readInput(context, 'A')[0]]]);
    expect(isCovered(plan({ node }, ['node']), 'node')).toBe(false);
  });

  it('threads the inter-procedural escape: passing context to a helper that reads context.state', () => {
    const readsState = (ctx: { state?: unknown }) => ctx.state;
    const node = (
      _inputs: Map<string, unknown>,
      _outputs: unknown,
      context: { state?: unknown },
    ) => new Map([['Out', readsState(context)]]);
    const result = plan({ node, readsState }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toContain('context.state');
  });

  it('threads a destructured impl parameter', () => {
    const node = ({ a }: { a: unknown }) => new Map([['Out', a]]);
    const result = plan({ node }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toContain('parameter');
  });
});

describe('planSourceEmission — un-analyzable shapes', () => {
  it('threads a native / bound function', () => {
    const result = plan({ node: Math.max as never }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toContain('native');
  });

  it('threads a .bind() result (stringifies to [native code])', () => {
    const base = (inputs: Map<string, unknown>) => new Map([['Out', inputs]]);
    const bound = base.bind(null) as never;
    const result = plan({ node: bound }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
  });

  it('threads a method-shorthand function', () => {
    const holder = {
      node(inputs: Map<string, unknown>) {
        return new Map([['Out', inputs]]);
      },
    };
    const result = plan({ node: holder.node as never }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
  });
});

describe('planSourceEmission — non-emittable function kinds (this / generators)', () => {
  it('threads an impl that reads `this` (a baked free call binds globalThis under sloppy load)', () => {
    const node = function (this: { x?: unknown }): Map<string, unknown> {
      return new Map([['Out', this.x]]);
    };
    const result = plan({ node: node as never }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toContain('this');
  });

  it('threads an impl whose HELPER reads `this` — parseFunction rejects the helper, so the impl threads', () => {
    // The case that distinguishes the parseFunction whole-body walk (runs on impls
    // AND helpers) from an impl-body-only check: `this` here is invisible to §0(A)
    // (not a free id) and to surfaceCheck (not a value-API role), yet the helper is a
    // baked dep — so the reject must live where every parsed function passes (C-1).
    const helper = function (this: { x?: unknown }): unknown {
      return this.x;
    };
    const node = (_inputs: Map<string, unknown>) =>
      new Map([['Out', (helper as () => unknown)()]]);
    const result = plan({ node, helper: helper as never }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toBeDefined();
  });

  it('threads a generator-function impl (non-Map return; threaded as conservative defense-in-depth)', () => {
    const node = function* (): Generator<[string, unknown]> {
      yield ['Out', 1];
    };
    const result = plan({ node: node as never }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toContain('generator');
  });

  it('threads an async generator-function impl (asteriskToken is set on async generators too)', () => {
    const node = async function* (): AsyncGenerator<[string, unknown]> {
      yield ['Out', 1];
    };
    const result = plan({ node: node as never }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toContain('generator');
  });

  it('threads a covered-shaped impl whose only `this` is inside a NESTED arrow (lexical this, depth-independent)', () => {
    // C-1's thisWalk is a whole-fnNode sweep that does NOT stop at function
    // boundaries, so a `this` nested in an inner arrow is still caught — guards
    // against a future "stop at the first boundary" optimization regression.
    const node = function (this: { z?: unknown }): Map<string, unknown> {
      const read = (): unknown => this.z;
      return new Map([['Out', read()]]);
    };
    const result = plan({ node: node as never }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
    expect(warningFor(result, 'node')).toContain('this');
  });
});

describe('planSourceEmission — viability, cycles, dedup, exclusion', () => {
  it('threads when a helper name collides with a reserved/scaffolding identifier', () => {
    const result = (x: unknown) => x; // key "result" ∈ RESERVED_NAMES
    const node = (inputs: Map<string, unknown>) =>
      new Map([['Out', result(readInput(inputs, 'A')[0])]]);
    const plan_ = plan({ node, result }, ['node']);
    expect(isCovered(plan_, 'node')).toBe(false);
    expect(warningFor(plan_, 'node')).toContain('result');
  });

  it('threads an impl whose helpers form a reference cycle', () => {
    const a = (x: number): number => b(x);
    const b = (x: number): number => a(x);
    const node = (inputs: Map<string, unknown>) =>
      new Map([['Out', a(Number(readInput(inputs, 'A')[0]))]]);
    const result = plan({ node, a, b }, ['node']);
    expect(isCovered(result, 'node')).toBe(false);
  });

  it('gives two type ids that sanitize to one identifier distinct local names', () => {
    const implA = (inputs: Map<string, unknown>) =>
      new Map([['Out', readInput(inputs, 'A')[0]]]);
    const implB = (inputs: Map<string, unknown>) =>
      new Map([['Out', readInput(inputs, 'B')[0]]]);
    const result = plan({ 'v2.adder': implA, 'v2-adder': implB }, [
      'v2.adder',
      'v2-adder',
    ]);
    const names = new Set([
      result.localNameByTypeId.get('v2.adder'),
      result.localNameByTypeId.get('v2-adder'),
    ]);
    expect(names.size).toBe(2);
    expect(names).toContain('v2_adder');
  });

  it('keeps an impl local name off the readInput intrinsic name', () => {
    const impl = (inputs: Map<string, unknown>) =>
      new Map([['Out', readInput(inputs, 'A')[0]]]);
    const result = plan({ readInput: impl }, ['readInput']);
    expect(isCovered(result, 'readInput')).toBe(true);
    expect(result.localNameByTypeId.get('readInput')).not.toBe('readInput');
    // the intrinsic is still emitted under its own name
    expect(emittedNames(result)).toContain('readInput');
  });

  it('excludes auto-emitted type ids from source-emission', () => {
    const node = (inputs: Map<string, unknown>) =>
      new Map([['Out', readInput(inputs, 'A')[0]]]);
    const result = plan({ node }, ['node'], { autoEmittedTypeIds: ['node'] });
    expect(isCovered(result, 'node')).toBe(false);
    expect(result.warnings).toHaveLength(0); // excluded, not a coverage failure
    expect(result.emittedFunctions).toHaveLength(0);
  });
});

describe('READ_INPUT_SOURCE — behavioural equivalence with the runtime intrinsic', () => {
  it('matches readInput on connected, default, and missing handles', () => {
    const emitted = eval(`(${READ_INPUT_SOURCE})`) as typeof readInputIntrinsic;
    const inputs = new Map<
      string,
      { connections: { value: unknown }[]; defaultValue?: unknown }
    >([
      ['A', { connections: [{ value: 1 }, { value: 2 }] }],
      ['B', { connections: [], defaultValue: 9 }],
    ]);
    expect(emitted(inputs, 'A')).toEqual(readInputIntrinsic(inputs, 'A'));
    expect(emitted(inputs, 'B')).toEqual(readInputIntrinsic(inputs, 'B'));
    expect(emitted(inputs, 'Z')).toEqual(readInputIntrinsic(inputs, 'Z'));
  });
});
