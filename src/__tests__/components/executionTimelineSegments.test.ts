import { describe, it, expect } from 'vitest';
import { buildSegments } from '@/components/molecules/ExecutionTimeline/SupportingSubcomponents/types';
import { structureRecordKey } from '@/utils/nodeRunner/executionRecorder';
import type {
  ExecutionStepRecord,
  LoopRecord,
  LoopIterationRecord,
} from '@/utils/nodeRunner/types';

/**
 * PLAN C F3 / RU-12 / TP-23 — `buildSegments` against IDENTITY-KEYED records.
 *
 * `buildSegments` is where the timeline decides which loop a step belongs to.
 * Since the v3 redesign it resolves that through `resolveStructureRecord`
 * rather than `loopRecords.get(step.loopStructureId)`, because two instances
 * of one node group share their template's structure ids — a bare-id lookup
 * would route BOTH instances' steps into whichever record was stored first.
 * These pins cover the qualified-key (depth ≥ 1) path, which no test reached
 * before.
 */

function makeStep(
  overrides: Partial<ExecutionStepRecord> & { stepIndex: number },
): ExecutionStepRecord {
  return {
    nodeId: `node-${overrides.stepIndex}`,
    nodeTypeId: 'testType',
    nodeTypeName: 'Test Type',
    concurrencyLevel: 0,
    startTime: overrides.stepIndex,
    endTime: overrides.stepIndex + 1,
    duration: 1,
    pauseAdjustment: 0,
    status: 'completed',
    inputValues: new Map(),
    outputValues: new Map(),
    ...overrides,
  };
}

function makeLoopRecord(
  loopStructureId: string,
  ownerInstancePath: readonly string[],
  stepRecords: ExecutionStepRecord[],
): LoopRecord {
  const iteration: LoopIterationRecord = {
    iteration: 0,
    startTime: 0,
    endTime: 10,
    duration: 10,
    conditionValue: false,
    stepRecords,
    nestedLoopRecords: new Map(),
    nestedSwitchRecords: new Map(),
  };
  return {
    loopStructureId,
    ownerInstancePath,
    loopStartNodeId: loopStructureId,
    loopStopNodeId: `${loopStructureId}-stop`,
    loopEndNodeId: `${loopStructureId}-end`,
    iterations: [iteration],
    totalIterations: 1,
    startTime: 0,
    endTime: 10,
    duration: 10,
  };
}

describe('buildSegments — identity-keyed loop records', () => {
  it('routes each instance’s steps to ITS OWN loop record when both share a template structure id', () => {
    // One group template containing loop `L`, placed twice. Both instances'
    // steps carry loopStructureId 'L'; only instancePath separates them.
    const firstInstanceStep = makeStep({
      stepIndex: 0,
      nodeId: 'body',
      loopStructureId: 'L',
      loopIteration: 0,
      instancePath: ['g1'],
    });
    const secondInstanceStep = makeStep({
      stepIndex: 1,
      nodeId: 'body',
      loopStructureId: 'L',
      loopIteration: 0,
      instancePath: ['g2'],
    });

    const loopRecords = new Map<string, LoopRecord>([
      [
        structureRecordKey(['g1'], 'L'),
        makeLoopRecord('L', ['g1'], [firstInstanceStep]),
      ],
      [
        structureRecordKey(['g2'], 'L'),
        makeLoopRecord('L', ['g2'], [secondInstanceStep]),
      ],
    ]);

    const segments = buildSegments(
      [firstInstanceStep, secondInstanceStep],
      loopRecords,
    );

    const loopSegments = segments.filter(
      (segment) => segment.kind === 'loop',
    ) as Array<Extract<(typeof segments)[number], { kind: 'loop' }>>;
    // TWO distinct segments — a bare-id lookup would collapse them into one.
    expect(loopSegments).toHaveLength(2);
    expect(loopSegments.map((segment) => segment.loopStructureId)).toEqual([
      structureRecordKey(['g1'], 'L'),
      structureRecordKey(['g2'], 'L'),
    ]);
    // Each segment carries the record of the instance that ran it.
    expect(loopSegments[0]!.loopRecord.ownerInstancePath).toEqual(['g1']);
    expect(loopSegments[1]!.loopRecord.ownerInstancePath).toEqual(['g2']);
  });

  it('keys the segment by the RESOLVED identity, so selection writes and segment lookups agree', () => {
    // The timeline writes `selectedIterations[segment.loopStructureId]` on
    // click; if the segment were keyed by the bare id while the record map is
    // keyed by identity, iteration expansion would silently never match.
    const step = makeStep({
      stepIndex: 0,
      loopStructureId: 'L',
      loopIteration: 0,
      instancePath: ['a1', 'b'],
    });
    const identityKey = structureRecordKey(['a1', 'b'], 'L');
    const loopRecords = new Map<string, LoopRecord>([
      [identityKey, makeLoopRecord('L', ['a1', 'b'], [step])],
    ]);

    const segments = buildSegments([step], loopRecords);
    const loopSegment = segments.find((segment) => segment.kind === 'loop');
    expect(loopSegment).toBeDefined();
    expect(
      (loopSegment as Extract<typeof loopSegment, { kind: 'loop' }>)
        .loopStructureId,
    ).toBe(identityKey);
    expect(loopRecords.has(identityKey)).toBe(true);
  });

  it('never folds a step into another instance’s segment when its own record is absent', () => {
    // Instance g2 ran, but only g1's record is in this map (g2's lives one
    // level down, inside its own group record). The step must be treated as
    // deeper-nested and skipped — with a bare-id lookup it would land in
    // g1's segment and the timeline would attribute g2's work to g1.
    const step = makeStep({
      stepIndex: 0,
      nodeId: 'ran-in-g2',
      loopStructureId: 'L',
      loopIteration: 0,
      instancePath: ['g2'],
    });
    const loopRecords = new Map<string, LoopRecord>([
      [structureRecordKey(['g1'], 'L'), makeLoopRecord('L', ['g1'], [])],
    ]);

    const segments = buildSegments([step], loopRecords);

    // g1's record still renders — buildSegments creates a segment for every
    // record in the map, including ones no step routed to (nested loops whose
    // body steps live only in their own iteration records, and the salvage
    // duplicates §2(c)(vi) declares).
    expect(segments).toHaveLength(1);
    const [only] = segments;
    expect(only!.kind).toBe('loop');
    const loopSegment = only as Extract<typeof only, { kind: 'loop' }>;
    expect(loopSegment.loopStructureId).toBe(structureRecordKey(['g1'], 'L'));
    // THE pin: g2's step appears nowhere in it.
    const renderedNodeIds = loopSegment.iterations.flatMap((iteration) =>
      iteration.steps.map((rendered) => rendered.nodeId),
    );
    expect(renderedNodeIds).not.toContain('ran-in-g2');
  });

  it('still renders a pre-v3 recording, whose records carry bare keys and no owner', () => {
    // Legacy recordings resolve through the fallback scan — the compatibility
    // promise `resolveStructureRecord` documents.
    const step = makeStep({
      stepIndex: 0,
      loopStructureId: 'L',
      loopIteration: 0,
    });
    // The type says `ownerInstancePath` is always there; a recording exported
    // before it existed proves otherwise — which is exactly the shape the
    // fallback has to cope with.
    const legacyRecord = makeLoopRecord('L', [], [step]) as Omit<
      LoopRecord,
      'ownerInstancePath'
    > & { ownerInstancePath?: readonly string[] };
    delete legacyRecord.ownerInstancePath;

    const loopRecords = new Map<string, LoopRecord>([
      ['L', legacyRecord as LoopRecord],
    ]);

    const segments = buildSegments([step], loopRecords);
    const loopSegments = segments.filter((segment) => segment.kind === 'loop');
    expect(loopSegments).toHaveLength(1);
    expect(
      (loopSegments[0] as Extract<(typeof segments)[number], { kind: 'loop' }>)
        .loopStructureId,
    ).toBe('L');
  });
});
