import { describe, expect, it } from 'vitest';
import { serializeExecutionPlan } from '@/utils/nodeRunner/runTargets/serializeExecutionPlan';
import type {
  ExecutionPlan,
  ExecutionStep,
  StandardExecutionStep,
} from '@/utils/nodeRunner/types';

function standardStep(
  nodeId: string,
  concurrencyLevel = 0,
): StandardExecutionStep {
  return {
    kind: 'standard',
    nodeId,
    nodeTypeId: `${nodeId}Type`,
    nodeTypeName: `${nodeId} Type`,
    concurrencyLevel,
  };
}

/**
 * A plan exercising every step kind, concurrency within a level, loop bodies
 * (pre/post-stop), switch branches, and a nested group plan with its own
 * boundary mappings + inner resolution maps.
 */
function makePlan(): ExecutionPlan {
  const innerPlan: ExecutionPlan = {
    levels: [[standardStep('inner1')]],
    inputResolutionMap: new Map([
      [
        'inner1:in',
        [
          {
            edgeId: 'ie1',
            sourceNodeId: 'gi',
            sourceHandleId: 'gi:out',
            edgesArrayIndex: 0,
          },
        ],
      ],
    ]),
    outputDistributionMap: new Map([
      [
        'gi:out',
        [
          {
            edgeId: 'ie1',
            targetNodeId: 'inner1',
            targetHandleId: 'inner1:in',
          },
        ],
      ],
    ]),
    nodeCount: 1,
    warnings: ['inner warning'],
  };

  const loopBlock: ExecutionStep = {
    kind: 'loop',
    loopStartNodeId: 'ls',
    loopStopNodeId: 'lstop',
    loopEndNodeId: 'le',
    preStopSteps: [standardStep('pre', 1)],
    postStopSteps: [standardStep('post', 1)],
    maxIterations: 100,
    concurrencyLevel: 1,
  };

  const switchBlock: ExecutionStep = {
    kind: 'switch',
    switchStartNodeId: 'ss',
    switchEndNodeId: 'se',
    trueBranchSteps: [standardStep('t', 2)],
    falseBranchSteps: [standardStep('f', 2)],
    concurrencyLevel: 2,
  };

  const groupScope: ExecutionStep = {
    kind: 'group',
    groupNodeId: 'g1',
    groupNodeTypeId: 'groupType',
    groupNodeTypeName: 'Group Type',
    innerPlan,
    inputMapping: new Map([['g1:in', 'gi:out']]),
    outputMapping: new Map([['go:in', 'g1:out']]),
    concurrencyLevel: 3,
  };

  return {
    levels: [
      [standardStep('a'), standardStep('b')], // two steps in one level (concurrent)
      [loopBlock],
      [switchBlock],
      [groupScope],
    ],
    inputResolutionMap: new Map([
      [
        'b:in',
        [
          {
            edgeId: 'e1',
            sourceNodeId: 'a',
            sourceHandleId: 'a:out',
            edgesArrayIndex: 0,
          },
        ],
      ],
    ]),
    outputDistributionMap: new Map([
      ['a:out', [{ edgeId: 'e1', targetNodeId: 'b', targetHandleId: 'b:in' }]],
    ]),
    nodeCount: 7,
    warnings: ['top warning'],
  };
}

describe('serializeExecutionPlan', () => {
  it('is JSON-lossless: serialize → stringify → parse is deep-equal', () => {
    const serialized = serializeExecutionPlan(makePlan());
    const roundTripped = JSON.parse(JSON.stringify(serialized));
    expect(roundTripped).toEqual(serialized);
  });

  it('converts every top-level ReadonlyMap to a plain Record', () => {
    const serialized = serializeExecutionPlan(makePlan());
    expect(serialized.inputResolutionMap instanceof Map).toBe(false);
    expect(serialized.outputDistributionMap instanceof Map).toBe(false);
    expect(serialized.inputResolutionMap).toEqual({
      'b:in': [
        {
          edgeId: 'e1',
          sourceNodeId: 'a',
          sourceHandleId: 'a:out',
          edgesArrayIndex: 0,
        },
      ],
    });
    expect(serialized.outputDistributionMap).toEqual({
      'a:out': [{ edgeId: 'e1', targetNodeId: 'b', targetHandleId: 'b:in' }],
    });
  });

  it('preserves level structure, concurrency, and scalar fields', () => {
    const serialized = serializeExecutionPlan(makePlan());
    expect(serialized.nodeCount).toBe(7);
    expect(serialized.warnings).toEqual(['top warning']);
    expect(serialized.levels).toHaveLength(4);
    // First level keeps both concurrent steps in order.
    const firstLevel = serialized.levels[0];
    expect(firstLevel.map((step) => step.kind)).toEqual([
      'standard',
      'standard',
    ]);
  });

  it('recursively serializes loop and switch bodies', () => {
    const serialized = serializeExecutionPlan(makePlan());
    const loopStep = serialized.levels[1][0];
    expect(loopStep.kind).toBe('loop');
    if (loopStep.kind === 'loop') {
      expect(loopStep.preStopSteps).toHaveLength(1);
      expect(loopStep.postStopSteps).toHaveLength(1);
      expect(loopStep.maxIterations).toBe(100);
    }
    const switchStep = serialized.levels[2][0];
    expect(switchStep.kind).toBe('switch');
    if (switchStep.kind === 'switch') {
      expect(switchStep.trueBranchSteps).toHaveLength(1);
      expect(switchStep.falseBranchSteps).toHaveLength(1);
    }
  });

  it('recursively serializes nested group plans and boundary mappings', () => {
    const serialized = serializeExecutionPlan(makePlan());
    const groupStep = serialized.levels[3][0];
    expect(groupStep.kind).toBe('group');
    if (groupStep.kind === 'group') {
      expect(groupStep.inputMapping).toEqual({ 'g1:in': 'gi:out' });
      expect(groupStep.outputMapping).toEqual({ 'go:in': 'g1:out' });
      // The inner plan's maps are recursively flattened too.
      expect(groupStep.innerPlan.inputResolutionMap instanceof Map).toBe(false);
      expect(groupStep.innerPlan.inputResolutionMap).toEqual({
        'inner1:in': [
          {
            edgeId: 'ie1',
            sourceNodeId: 'gi',
            sourceHandleId: 'gi:out',
            edgesArrayIndex: 0,
          },
        ],
      });
      expect(groupStep.innerPlan.nodeCount).toBe(1);
    }
  });

  it('does not mutate the source plan (maps stay maps)', () => {
    const plan = makePlan();
    serializeExecutionPlan(plan);
    expect(plan.inputResolutionMap instanceof Map).toBe(true);
    expect(plan.outputDistributionMap instanceof Map).toBe(true);
  });

  it('preserves root Graph I/O node ids through serialize + JSON round-trip', () => {
    const plan: ExecutionPlan = {
      ...makePlan(),
      rootInputNodeId: 'graph-input',
      rootOutputNodeId: 'graph-output',
    };
    const serialized = serializeExecutionPlan(plan);
    expect(serialized.rootInputNodeId).toBe('graph-input');
    expect(serialized.rootOutputNodeId).toBe('graph-output');
    // The json-ir artifact is JSON.stringify'd — the markers must survive it,
    // or a re-imported plan loses its root-I/O contract (the "lossless" claim).
    const roundTripped = JSON.parse(JSON.stringify(serialized));
    expect(roundTripped.rootInputNodeId).toBe('graph-input');
    expect(roundTripped.rootOutputNodeId).toBe('graph-output');
  });
});
