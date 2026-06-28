import { describe, it, expect } from 'vitest';
import { compile } from '@/utils/nodeRunner';
import { execute } from '@/utils/nodeRunner/executor';
import type {
  FunctionImplementations,
  StandardExecutionStep,
} from '@/utils/nodeRunner/types';

// The `Object.assign` fixtures in emitCode.test.ts bypass the compiler; this suite
// exercises the REAL threading end-to-end: compile() must read `node.data.customName`
// onto the step, execute() must copy it onto the record, and the downstream
// connection must carry the SOURCE node's custom name (`sourceNodeCustomName`).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;
const number = { dataTypeUniqueId: 'number' };

// src ("TheSource") → consumer ("Summer"). consumer reads src's output.
const state = {
  nodes: [
    {
      id: 'src',
      position: { x: 0, y: 0 },
      data: {
        nodeTypeUniqueId: 'src',
        customName: 'TheSource',
        inputs: [],
        outputs: [{ id: 'src_out', name: 'Out', dataType: number }],
      },
    },
    {
      id: 'consumer',
      position: { x: 0, y: 0 },
      data: {
        nodeTypeUniqueId: 'consumer',
        customName: 'Summer',
        inputs: [{ id: 'c_in', name: 'In', dataType: number }],
        outputs: [{ id: 'c_out', name: 'Out', dataType: number }],
      },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'src',
      sourceHandle: 'src_out',
      target: 'consumer',
      targetHandle: 'c_in',
    },
  ],
  typeOfNodes: {
    src: {
      name: 'Number',
      inputs: [],
      outputs: [{ id: 'src_out', name: 'Out', dataType: number }],
    },
    consumer: {
      name: 'Add',
      inputs: [{ id: 'c_in', name: 'In', dataType: number }],
      outputs: [{ id: 'c_out', name: 'Out', dataType: number }],
    },
  },
  dataTypes: {},
} as AnyState;

const impls: FunctionImplementations = {
  src: () => new Map([['Out', 10]]),
  consumer: (inputs) =>
    new Map([['Out', Number(inputs.get('In')?.connections[0]?.value) + 1]]),
};

describe('runner — customName threading (compile → record → connection)', () => {
  it('compile() reads node.data.customName onto each StandardExecutionStep', () => {
    const plan = compile(state, impls);
    const standardSteps = plan.levels
      .flat()
      .filter((s): s is StandardExecutionStep => s.kind === 'standard');
    expect(standardSteps.find((s) => s.nodeId === 'src')?.customName).toBe(
      'TheSource',
    );
    expect(standardSteps.find((s) => s.nodeId === 'consumer')?.customName).toBe(
      'Summer',
    );
  });

  it('execute() records customName on the step and threads sourceNodeCustomName onto the connection', async () => {
    const plan = compile(state, impls);
    const record = await execute(plan, impls, state, {
      onNodeStateChange: () => {},
      abortSignal: new AbortController().signal,
    });
    expect(record.status).toBe('completed');

    const consumer = record.steps.find((s) => s.nodeId === 'consumer');
    expect(consumer?.customName).toBe('Summer');
    // The connection label carries the SOURCE node's custom name (keyed by handle name).
    const connection = consumer?.inputValues.get('In')?.connections[0];
    expect(connection?.sourceNodeCustomName).toBe('TheSource');
  });
});
