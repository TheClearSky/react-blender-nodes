import { describe, it, expect } from 'vitest';
import { compile } from '@/utils/nodeRunner';
import { emitGraph } from '@/utils/nodeRunner/runTargets/codegen/emitGraph';
import { readInput } from '@/utils/nodeRunner/readInput';
import type { FunctionImplementations } from '@/utils/nodeRunner/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;
const bit = { dataTypeUniqueId: 'bit' };

// A LIVE value-API node: Bit Input (Value baked `true`) → Graph Output (result).
// Its impl reads inputs via the `readInput` intrinsic and is otherwise
// self-contained, so `analyzeImplementations` should AUTO-EMIT it inline.
function fixture() {
  const state = {
    nodes: [
      {
        id: 'bc',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'bitConstant',
          inputs: [
            {
              id: 'bc_v',
              name: 'Value',
              dataType: bit,
              allowInput: true,
              type: 'boolean',
              value: true,
            },
          ],
          outputs: [{ id: 'bc_out', name: 'Out', dataType: bit }],
        },
      },
      {
        id: 'go',
        position: { x: 0, y: 0 },
        data: {
          nodeTypeUniqueId: 'groupOutput',
          inputs: [{ id: 'go_r', name: 'result', dataType: bit }],
          outputs: [],
        },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'bc',
        sourceHandle: 'bc_out',
        target: 'go',
        targetHandle: 'go_r',
      },
    ],
    typeOfNodes: {
      bitConstant: {
        name: 'Bit Input',
        inputs: [{ name: 'Value', dataType: 'bit' }],
        outputs: [{ name: 'Out', dataType: 'bit' }],
      },
      groupOutput: {
        name: 'Graph Output',
        inputs: [{ name: 'result', dataType: 'bit' }],
        outputs: [],
      },
    },
    dataTypes: {},
  } as AnyState;

  const impls: FunctionImplementations = {
    bitConstant: (inputs) =>
      new Map([['Out', Boolean(readInput(inputs, 'Value')[0])]]),
  };
  return { state, impls };
}

describe('emitGraph — auto-emit (Stage 3) end-to-end', () => {
  it('threads the value node WITHOUT analyzeImplementations', async () => {
    const { state, impls } = fixture();
    const plan = compile(state, impls, { maxLoopIterations: 100 });
    const source = await emitGraph(plan, state, { exportRunGraph: false });
    expect(source).toContain('functionImplementations');
    expect(source).toContain('async function runGraph');
  });

  it('AUTO-EMITS the value node inline WITH analyzeImplementations (no thread call)', async () => {
    const { state, impls } = fixture();
    const plan = compile(state, impls, { maxLoopIterations: 100 });
    const source = await emitGraph(plan, state, {
      exportRunGraph: false,
      analyzeImplementations: true,
      impls: impls as Readonly<Record<string, (...args: never[]) => unknown>>,
    });
    // The Bit Input is now an inline expression — the baked `Value` (true)
    // flowed through readInput → Boolean(true) — and is NOT threaded.
    expect(source).toContain('Boolean(true)');
    expect(source).not.toContain('functionImplementations["bitConstant"]');
  });

  it('auto-emit + dead-code gives the fully clean signature', async () => {
    const { state, impls } = fixture();
    const plan = compile(state, impls, { maxLoopIterations: 100 });
    const source = await emitGraph(plan, state, {
      exportRunGraph: false,
      analyzeImplementations: true,
      optimize: { deadCode: true },
      assumePureImplementations: true,
      impls: impls as Readonly<Record<string, (...args: never[]) => unknown>>,
    });
    // Inlined AND the now-unused plumbing dropped by DCE.
    expect(source).toContain('Boolean(true)');
    expect(source).not.toContain('functionImplementations');
    expect(source).not.toContain('async ');
    expect(source).toMatch(/return\s*\{\s*result:/);
  });
});
