import { describe, it, expect } from 'vitest';
import { compile } from '@/utils/nodeRunner';
import { emitGraph } from '@/utils/nodeRunner/runTargets/codegen/emitGraph';
import { readInput } from '@/utils/nodeRunner/readInput';
import type { FunctionImplementations } from '@/utils/nodeRunner/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;
const bit = { dataTypeUniqueId: 'bit' };

// Graph Input (A, B, B_2) → OR Gate (A, B) → Graph Output (Out), where the OR
// Gate's `B` input is a FAN-IN: both root inputs B and B_2 wire into it. This is
// `graph-state (32)`. With analyzeImplementations the node still INLINES (no
// thread) because the derived hook is fan-in-safe; whether B_2 appears in the body
// depends on whether the impl reads B as the first connection (scalar) or the
// whole array.
function fixture(orGateImpl: FunctionImplementations['orGate']) {
  const state = {
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
      {
        id: 'e1',
        source: 'gi',
        sourceHandle: 'gi_a',
        target: 'or',
        targetHandle: 'or_a',
      },
      {
        id: 'e2',
        source: 'gi',
        sourceHandle: 'gi_b',
        target: 'or',
        targetHandle: 'or_b',
      },
      // The ONE extra edge vs graph 31: B_2 → or.B, making or.B a fan-in.
      {
        id: 'e3',
        source: 'gi',
        sourceHandle: 'gi_b2',
        target: 'or',
        targetHandle: 'or_b',
      },
      {
        id: 'e4',
        source: 'or',
        sourceHandle: 'or_out',
        target: 'go',
        targetHandle: 'go_out',
      },
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

  const impls = { orGate: orGateImpl } as FunctionImplementations;
  return { state, impls };
}

// Reads B as the FIRST connection only (`[0]`) — the scalar case. Matches the
// `graph-state (32) code expected.txt` body: `Boolean(A) || Boolean(B)`.
const SCALAR_OR: FunctionImplementations['orGate'] = (inputs) =>
  new Map([
    [
      'Out',
      Boolean(readInput(inputs, 'A')[0]) || Boolean(readInput(inputs, 'B')[0]),
    ],
  ]);

// Reads B as the WHOLE array — the fan-in-consuming case. Matches the
// `…expected if node was using both.txt` intent: B rendered as `[B, B_2]`.
const ARRAY_OR: FunctionImplementations['orGate'] = (inputs) =>
  new Map([
    [
      'Out',
      Boolean(readInput(inputs, 'A')[0]) ||
        readInput(inputs, 'B').some((value) => Boolean(value)),
    ],
  ]);

async function emit(
  orGateImpl: FunctionImplementations['orGate'],
  optimize = false,
): Promise<string> {
  const { state, impls } = fixture(orGateImpl);
  const plan = compile(state, impls, { maxLoopIterations: 100 });
  return emitGraph(plan, state, {
    exportRunGraph: false,
    analyzeImplementations: true,
    ...(optimize
      ? { optimize: { deadCode: true }, assumePureImplementations: true }
      : {}),
    impls: impls as Readonly<Record<string, (...args: never[]) => unknown>>,
  });
}

describe('emitGraph — fan-in into a scalar node input INLINES (FANIN-2)', () => {
  it('SCALAR read: inlines as Boolean(A) || Boolean(B), NOT threaded', async () => {
    const source = await emit(SCALAR_OR);
    // Inlined — no thread harness, no async.
    expect(source).not.toContain('functionImplementations');
    expect(source).not.toContain('async ');
    // The fan-in B renders as its FIRST connection; the body matches the expected
    // file exactly (B_2 is an unused param, kept without DCE).
    expect(source).toContain('const orGateOut = Boolean(A) || Boolean(B);');
    expect(source).toMatch(/function runGraph\(A, B, B_2\)/);
  });

  it('SCALAR read + dead-code: drops the unused fan-in param B_2', async () => {
    const source = await emit(SCALAR_OR, /* optimize */ true);
    expect(source).toContain('const orGateOut = Boolean(A) || Boolean(B);');
    // B_2 is unreferenced in the inlined body → DCE removes it from the signature.
    expect(source).toMatch(/function runGraph\(A, B\)/);
    expect(source).not.toContain('B_2');
  });

  it('WHOLE-ARRAY read: inlines the fan-in as an array [B, B_2], NOT threaded', async () => {
    const source = await emit(ARRAY_OR);
    expect(source).not.toContain('functionImplementations');
    expect(source).not.toContain('async ');
    // The fan-in B renders as the array of ALL its connections.
    expect(source).toContain(
      'Boolean(A) || [B, B_2].some((value) => Boolean(value))',
    );
    // B_2 IS used (inside the array) → kept as a param even with DCE available.
    expect(source).toMatch(/function runGraph\(A, B, B_2\)/);
  });

  it('WHOLE-ARRAY read + dead-code: keeps B_2 (it is referenced)', async () => {
    const source = await emit(ARRAY_OR, /* optimize */ true);
    expect(source).toContain(
      'Boolean(A) || [B, B_2].some((value) => Boolean(value))',
    );
    expect(source).toMatch(/function runGraph\(A, B, B_2\)/);
  });
});
