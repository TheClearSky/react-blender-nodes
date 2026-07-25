import { describe, it, expect } from 'vitest';
import {
  computeNodePreviewValues,
  EMPTY_NODE_PREVIEW_VALUES,
} from '@/utils/nodeRunner/computeNodePreviewValues';
import type {
  ExecutionRecord,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/types';

/** Minimal fully-typed step record — the derivation only reads nodeId/stepIndex. */
function makeStep(
  nodeId: string,
  stepIndex: number,
  overrides: Partial<ExecutionStepRecord> = {},
): ExecutionStepRecord {
  return {
    stepIndex,
    nodeId,
    nodeTypeId: 'test',
    nodeTypeName: 'Test',
    concurrencyLevel: 0,
    startTime: 0,
    endTime: 1,
    duration: 1,
    pauseAdjustment: 0,
    status: 'completed',
    inputValues: new Map(),
    outputValues: new Map(),
    ...overrides,
  };
}

function makeRecord(steps: ExecutionStepRecord[]): ExecutionRecord {
  return {
    id: 'record',
    startTime: 0,
    endTime: 1,
    totalDuration: 1,
    warmupDuration: 0,
    totalPauseDuration: 0,
    status: 'completed',
    steps,
    errors: [],
    concurrencyLevels: [],
    loopRecords: new Map(),
    groupRecords: new Map(),
    switchRecords: new Map(),
    finalValues: new Map(),
  };
}

describe('computeNodePreviewValues', () => {
  it('picks the max-stepIndex step per node as `live`', () => {
    // node A runs three times (e.g. loop iterations); node B once.
    const record = makeRecord([
      makeStep('A', 0),
      makeStep('B', 1),
      makeStep('A', 2),
      makeStep('A', 4),
    ]);
    const values = computeNodePreviewValues(record, null);
    expect(values.get('A')?.live?.stepIndex).toBe(4);
    expect(values.get('B')?.live?.stepIndex).toBe(1);
  });

  it('returns undefined for a node that never ran', () => {
    const record = makeRecord([makeStep('A', 0)]);
    const values = computeNodePreviewValues(record, 3);
    expect(values.get('missing')).toBeUndefined();
  });

  it('`atStep` is null when currentStepIndex is null', () => {
    const record = makeRecord([makeStep('A', 0), makeStep('A', 2)]);
    const values = computeNodePreviewValues(record, null);
    expect(values.get('A')?.atStep).toBeNull();
    expect(values.get('A')?.live?.stepIndex).toBe(2);
  });

  it('`atStep` picks the latest occurrence at or before currentStepIndex', () => {
    // A at 0,2,4; scrub to 3 ⇒ atStep = index 2 (latest ≤ 3), live stays at 4.
    const record = makeRecord([
      makeStep('A', 0),
      makeStep('A', 2),
      makeStep('A', 4),
    ]);
    const values = computeNodePreviewValues(record, 3);
    expect(values.get('A')?.atStep?.stepIndex).toBe(2);
    expect(values.get('A')?.live?.stepIndex).toBe(4);
  });

  it('`atStep` includes a step whose index exactly equals currentStepIndex', () => {
    const record = makeRecord([makeStep('A', 0), makeStep('A', 3)]);
    const values = computeNodePreviewValues(record, 3);
    expect(values.get('A')?.atStep?.stepIndex).toBe(3);
  });

  it('`atStep` is null for a node whose first run is after currentStepIndex', () => {
    const record = makeRecord([makeStep('A', 0), makeStep('B', 5)]);
    const values = computeNodePreviewValues(record, 2);
    expect(values.get('B')?.atStep).toBeNull();
    expect(values.get('B')?.live?.stepIndex).toBe(5);
  });

  it('resolves nested (group/loop/switch-inner) nodes from the flat record.steps — no recursion', () => {
    // Group-inner / loop-body / switch-branch steps all live in the flat
    // `record.steps` with a global stepIndex, so a single pass reaches every depth.
    const record = makeRecord([
      makeStep('root', 0),
      makeStep('groupInner', 1, { groupNodeId: 'g1', groupDepth: 1 }),
      makeStep('loopBody', 2, { loopIteration: 0, loopStructureId: 'L1' }),
      makeStep('loopBody', 3, { loopIteration: 1, loopStructureId: 'L1' }),
    ]);
    const values = computeNodePreviewValues(record, 5);
    expect(values.get('groupInner')?.live?.stepIndex).toBe(1);
    expect(values.get('loopBody')?.live?.loopIteration).toBe(1);
    expect(values.get('loopBody')?.atStep?.stepIndex).toBe(3);
  });

  it('EMPTY_NODE_PREVIEW_VALUES is a stable empty map', () => {
    expect(EMPTY_NODE_PREVIEW_VALUES.size).toBe(0);
    expect(EMPTY_NODE_PREVIEW_VALUES).toBe(EMPTY_NODE_PREVIEW_VALUES);
  });
});
