import { describe, it, expect } from 'vitest';
import {
  serializeExecutionRecord,
  deserializeExecutionRecord,
} from '@/utils/importExport/serialization';
import type {
  ExecutionRecord,
  ExecutionStepRecord,
  LoopRecord,
  SwitchRecord,
} from '@/utils/nodeRunner/types';

function makeStep(nodeId: string, stepIndex: number): ExecutionStepRecord {
  return {
    stepIndex,
    nodeId,
    nodeTypeId: 'switchStart',
    nodeTypeName: 'Switch Start',
    concurrencyLevel: 0,
    startTime: 0,
    endTime: 1,
    duration: 1,
    pauseAdjustment: 0,
    status: 'completed',
    inputValues: new Map(),
    outputValues: new Map(),
  };
}

function makeSwitch(
  id: string,
  opts?: {
    stepRecords?: ExecutionStepRecord[];
    nestedLoopRecords?: ReadonlyMap<string, LoopRecord>;
    nestedSwitchRecords?: ReadonlyMap<string, SwitchRecord>;
  },
): SwitchRecord {
  return {
    switchStructureId: id,
    switchStartNodeId: `${id}-start`,
    switchEndNodeId: `${id}-end`,
    branchTaken: true,
    startTime: 0,
    endTime: 2,
    duration: 2,
    stepRecords: opts?.stepRecords ?? [],
    nestedLoopRecords: opts?.nestedLoopRecords ?? new Map(),
    nestedSwitchRecords: opts?.nestedSwitchRecords ?? new Map(),
  };
}

function makeLoop(
  id: string,
  nestedSwitchInIteration?: ReadonlyMap<string, SwitchRecord>,
): LoopRecord {
  return {
    loopStructureId: id,
    loopStartNodeId: `${id}-start`,
    loopStopNodeId: `${id}-stop`,
    loopEndNodeId: `${id}-end`,
    totalIterations: 1,
    startTime: 0,
    endTime: 3,
    duration: 3,
    iterations: [
      {
        iteration: 0,
        startTime: 0,
        endTime: 3,
        duration: 3,
        conditionValue: true,
        stepRecords: [],
        nestedLoopRecords: new Map(),
        nestedSwitchRecords: nestedSwitchInIteration ?? new Map(),
      },
    ],
  };
}

describe('importExport/serialization — switch record round-trip', () => {
  it('preserves top-level switchRecords and their nested loop/switch records through a JSON round-trip', () => {
    const leafSwitch = makeSwitch('sw2');
    const nestedLoop = makeLoop('loopB');
    const parentSwitch = makeSwitch('sw1', {
      stepRecords: [makeStep('sw1-start', 0)],
      nestedLoopRecords: new Map([['loopB', nestedLoop]]),
      nestedSwitchRecords: new Map([['sw2', leafSwitch]]),
    });

    // A loop whose iteration nests a switch — exercises the loop-iteration path
    // that previously dropped nestedSwitchRecords on serialize.
    const switchInLoopIter = makeSwitch('sw3');
    const loopWithNestedSwitch = makeLoop(
      'loopA',
      new Map([['sw3', switchInLoopIter]]),
    );

    const record: ExecutionRecord = {
      id: 'run1',
      startTime: 0,
      endTime: 10,
      totalDuration: 10,
      warmupDuration: 0,
      totalPauseDuration: 0,
      status: 'completed',
      steps: [],
      errors: [],
      concurrencyLevels: [],
      loopRecords: new Map([['loopA', loopWithNestedSwitch]]),
      groupRecords: new Map(),
      switchRecords: new Map([['sw1', parentSwitch]]),
      finalValues: new Map(),
    };

    // Full path: in-memory → JSON text → in-memory (the JSON step is where the
    // Map-corruption used to happen).
    const json = JSON.stringify(serializeExecutionRecord(record));
    const restored = deserializeExecutionRecord(JSON.parse(json));

    // Top-level switchRecords survive (deserialize previously hardcoded new Map()).
    expect(restored.switchRecords).toBeInstanceOf(Map);
    expect(restored.switchRecords.size).toBe(1);
    const sw1 = restored.switchRecords.get('sw1');
    expect(sw1).toBeDefined();
    expect(sw1?.switchStructureId).toBe('sw1');
    expect(sw1?.branchTaken).toBe(true);

    // Step records survive as an array of records with rehydrated Maps.
    expect(sw1?.stepRecords).toHaveLength(1);
    expect(sw1?.stepRecords[0].inputValues).toBeInstanceOf(Map);

    // Nested loop + switch maps survive (serialize previously emitted {} for Maps).
    expect(sw1?.nestedLoopRecords).toBeInstanceOf(Map);
    expect(sw1?.nestedLoopRecords.get('loopB')?.loopStructureId).toBe('loopB');
    expect(sw1?.nestedSwitchRecords).toBeInstanceOf(Map);
    expect(sw1?.nestedSwitchRecords.get('sw2')?.switchStructureId).toBe('sw2');

    // The switch nested inside a loop iteration also survives the round-trip.
    const loopA = restored.loopRecords.get('loopA');
    expect(loopA?.iterations[0].nestedSwitchRecords).toBeInstanceOf(Map);
    expect(
      loopA?.iterations[0].nestedSwitchRecords.get('sw3')?.switchStructureId,
    ).toBe('sw3');
  });

  it('serializes nested switch Maps as real data in the JSON, not empty objects', () => {
    const parentSwitch = makeSwitch('sw1', {
      nestedSwitchRecords: new Map([['sw2', makeSwitch('sw2')]]),
    });
    const record: ExecutionRecord = {
      id: 'run2',
      startTime: 0,
      endTime: 1,
      totalDuration: 1,
      warmupDuration: 0,
      totalPauseDuration: 0,
      status: 'completed',
      steps: [],
      errors: [],
      concurrencyLevels: [],
      loopRecords: new Map(),
      groupRecords: new Map(),
      switchRecords: new Map([['sw1', parentSwitch]]),
      finalValues: new Map(),
    };

    const json = JSON.stringify(serializeExecutionRecord(record));
    // The nested switch's id/data must appear in the JSON; Map-corruption would
    // have emitted `"nestedSwitchRecords": {}` and dropped it.
    expect(json).toContain('"sw2"');
    expect(json).toMatch(/"switchStructureId":\s*"sw2"/);
  });
});
