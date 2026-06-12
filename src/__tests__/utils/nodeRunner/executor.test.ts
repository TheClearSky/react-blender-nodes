import { describe, it, expect } from 'vitest';
import { execute } from '@/utils/nodeRunner/executor';
import type {
  ExecutionPlan,
  StandardExecutionStep,
  InputResolutionEntry,
} from '@/utils/nodeRunner/types';

describe('nodeRunner/executor — successful execution', () => {
  it('executes a node, stores its output value, and records completion', async () => {
    const stepA: StandardExecutionStep = {
      kind: 'standard',
      nodeId: 'node-a',
      nodeTypeId: 'producer',
      nodeTypeName: 'Producer',
      concurrencyLevel: 0,
    };

    const plan: ExecutionPlan = {
      levels: [[stepA]],
      inputResolutionMap: new Map(),
      outputDistributionMap: new Map(),
      nodeCount: 1,
      warnings: [],
    };

    const state = {
      nodes: [
        {
          id: 'node-a',
          position: { x: 0, y: 0 },
          data: {
            nodeTypeUniqueId: 'producer',
            inputs: [],
            outputs: [{ id: 'output-0', name: 'Out' }],
          },
        },
      ],
      edges: [],
      typeOfNodes: { producer: { name: 'Producer' } },
      dataTypes: {},
    };

    const implementations = {
      producer: () => new Map([['Out', 42]]),
    };

    const record = await execute(
      plan,
      implementations,
      state as unknown as Parameters<typeof execute>[2],
      {
        onNodeStateChange: () => {},
        abortSignal: new AbortController().signal,
      },
    );

    expect(record.status).toBe('completed');

    const stepRecord = record.steps.find((s) => s.nodeId === 'node-a');
    expect(stepRecord?.status).toBe('completed');
    // The produced output is captured on the step and in the ValueStore snapshot.
    expect(
      [...(stepRecord?.outputValues.values() ?? [])].map((v) => v.value),
    ).toContain(42);
    expect([...record.finalValues.values()]).toContain(42);
  });
});

describe('nodeRunner/executor — error propagation', () => {
  it('downstream nodes are skipped when upstream node errors', async () => {
    // Build a minimal 2-node plan: A → B
    // A throws, B should be skipped (not executed)
    const stepA: StandardExecutionStep = {
      kind: 'standard',
      nodeId: 'node-a',
      nodeTypeId: 'thrower',
      nodeTypeName: 'Thrower',
      concurrencyLevel: 0,
    };
    const stepB: StandardExecutionStep = {
      kind: 'standard',
      nodeId: 'node-b',
      nodeTypeId: 'receiver',
      nodeTypeName: 'Receiver',
      concurrencyLevel: 1,
    };

    const inputResolutionMap = new Map<
      string,
      ReadonlyArray<InputResolutionEntry>
    >();
    // B's input depends on A's output
    inputResolutionMap.set('node-b:input-0', [
      { edgeId: 'edge-1', sourceNodeId: 'node-a', sourceHandleId: 'output-0' },
    ]);

    const plan: ExecutionPlan = {
      levels: [[stepA], [stepB]],
      inputResolutionMap,
      outputDistributionMap: new Map(),
      nodeCount: 2,
      warnings: [],
    };

    // Minimal state with the two nodes
    const state = {
      nodes: [
        {
          id: 'node-a',
          position: { x: 0, y: 0 },
          data: {
            nodeTypeUniqueId: 'thrower',
            inputs: [],
            outputs: [{ id: 'output-0', name: 'Out' }],
          },
        },
        {
          id: 'node-b',
          position: { x: 200, y: 0 },
          data: {
            nodeTypeUniqueId: 'receiver',
            inputs: [{ id: 'input-0', name: 'In' }],
            outputs: [],
          },
        },
      ],
      edges: [],
      typeOfNodes: {
        thrower: { name: 'Thrower' },
        receiver: { name: 'Receiver' },
      },
      dataTypes: {},
    };

    let receiverWasExecuted = false;

    const implementations = {
      thrower: () => {
        throw new Error('Intentional error from thrower');
      },
      receiver: () => {
        receiverWasExecuted = true;
        return new Map();
      },
    };

    const nodeStates: Map<string, string> = new Map();
    const controller = new AbortController();

    const record = await execute(
      plan,
      implementations,
      state as unknown as Parameters<typeof execute>[2],
      {
        onNodeStateChange: (nodeId, visualState) => {
          nodeStates.set(nodeId, visualState);
        },
        abortSignal: controller.signal,
      },
    );

    // A should have errored
    expect(nodeStates.get('node-a')).toBe('errored');

    // B should be SKIPPED, not executed
    expect(receiverWasExecuted).toBe(false);
    expect(nodeStates.get('node-b')).toBe('skipped');

    // Record should show the error
    expect(record.status).toBe('errored');
    expect(record.errors.length).toBeGreaterThanOrEqual(1);
    expect(record.errors[0].nodeId).toBe('node-a');

    // B's step should be recorded as skipped
    const stepBRecord = record.steps.find((s) => s.nodeId === 'node-b');
    expect(stepBRecord).toBeDefined();
    expect(stepBRecord!.status).toBe('skipped');
  });
});
