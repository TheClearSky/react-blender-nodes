import { describe, it, expect } from 'vitest';
import {
  serializeExecutionRecord,
  deserializeExecutionRecord,
} from '@/utils/importExport/serialization';
import { importExecutionRecord } from '@/utils/importExport/recordImport';
import {
  structureRecordKey,
  resolveStructureRecord,
} from '@/utils/nodeRunner/executionRecorder';
import type {
  ExecutionRecord,
  LoopRecord,
  GroupRecord,
  SwitchRecord,
} from '@/utils/nodeRunner/types';

/**
 * PLAN C F4(10) — the identity scheme across the EXPORT BOUNDARY.
 *
 * Structure-record maps are keyed by identity (`structureRecordKey`) and each
 * value repeats that identity structurally as `ownerInstancePath`. The
 * duplication is deliberate: a JSON object's keys are opaque strings, so a
 * consumer that never parses a key can still read identity off the record —
 * and a recording exported before the format existed can still be told apart
 * from a current one.
 */

function makeLoop(
  loopStructureId: string,
  ownerInstancePath: readonly string[],
): LoopRecord {
  return {
    loopStructureId,
    ownerInstancePath,
    loopStartNodeId: loopStructureId,
    loopStopNodeId: `${loopStructureId}-stop`,
    loopEndNodeId: `${loopStructureId}-end`,
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
        conditionValue: false,
        stepRecords: [],
        nestedLoopRecords: new Map(),
        nestedSwitchRecords: new Map(),
      },
    ],
  };
}

function makeEmptyRecord(): ExecutionRecord {
  return {
    id: 'run',
    startTime: 0,
    endTime: 10,
    totalDuration: 10,
    warmupDuration: 0,
    totalPauseDuration: 0,
    status: 'completed',
    steps: [],
    errors: [],
    concurrencyLevels: [],
    loopRecords: new Map(),
    groupRecords: new Map(),
    switchRecords: new Map(),
    finalValues: new Map(),
  };
}

describe('identity keys across the export boundary (F4(10))', () => {
  it('round-trips full-path keys at every depth, including a salvage ordinal', () => {
    const rootKey = structureRecordKey([], 'L');
    const depthOneKey = structureRecordKey(['g2'], 'L');
    const depthTwoKey = structureRecordKey(['a1', 'b'], 'L');
    const ordinalKey = structureRecordKey(['a1', 'b'], 'L', 1);

    const record: ExecutionRecord = {
      ...makeEmptyRecord(),
      loopRecords: new Map([
        [rootKey, makeLoop('L', [])],
        [depthOneKey, makeLoop('L', ['g2'])],
        [depthTwoKey, makeLoop('L', ['a1', 'b'])],
        // The finalize backstop's duplicate for the same identity.
        [ordinalKey, makeLoop('L', ['a1', 'b'])],
      ]),
    };

    const json = JSON.stringify(serializeExecutionRecord(record));
    const restored = deserializeExecutionRecord(JSON.parse(json));

    expect(Array.from(restored.loopRecords.keys())).toEqual([
      rootKey,
      depthOneKey,
      depthTwoKey,
      ordinalKey,
    ]);
    // The exported JSON carries the keys verbatim — escaped, since a key is
    // itself a JSON array.
    expect(json).toContain('\\"a1\\",\\"b\\",\\"L\\"');

    // Identity survives structurally, not only in the key.
    expect(restored.loopRecords.get(depthTwoKey)!.ownerInstancePath).toEqual([
      'a1',
      'b',
    ]);
    expect(restored.loopRecords.get(rootKey)!.ownerInstancePath).toEqual([]);

    // And it is still addressable through the one lookup the UI uses.
    expect(
      resolveStructureRecord(restored.loopRecords, 'L', ['a1', 'b'])?.key,
    ).toBe(depthTwoKey);
    expect(resolveStructureRecord(restored.loopRecords, 'L', ['g2'])?.key).toBe(
      depthOneKey,
    );
    // An instance that never ran this loop resolves to nothing — the whole
    // point of keying by path.
    expect(
      resolveStructureRecord(restored.loopRecords, 'L', ['a2', 'b']),
    ).toBeUndefined();
  });

  it('carries ownerInstancePath through group and switch records too', () => {
    const groupRecord: GroupRecord = {
      groupNodeId: 'b',
      ownerInstancePath: ['a1'],
      groupNodeTypeId: 'typeB',
      innerRecord: makeEmptyRecord(),
      inputMapping: new Map(),
      outputMapping: new Map(),
    };
    const switchRecord: SwitchRecord = {
      switchStructureId: 'S',
      ownerInstancePath: ['a1', 'b'],
      switchStartNodeId: 'S',
      switchEndNodeId: 'S-end',
      branchTaken: true,
      startTime: 0,
      endTime: 1,
      duration: 1,
      stepRecords: [],
      nestedLoopRecords: new Map(),
      nestedSwitchRecords: new Map(),
    };

    const record: ExecutionRecord = {
      ...makeEmptyRecord(),
      groupRecords: new Map([[structureRecordKey(['a1'], 'b'), groupRecord]]),
      switchRecords: new Map([
        [structureRecordKey(['a1', 'b'], 'S'), switchRecord],
      ]),
    };

    const restored = deserializeExecutionRecord(
      JSON.parse(JSON.stringify(serializeExecutionRecord(record))),
    );

    expect(
      restored.groupRecords.get(structureRecordKey(['a1'], 'b'))!
        .ownerInstancePath,
    ).toEqual(['a1']);
    expect(
      restored.switchRecords.get(structureRecordKey(['a1', 'b'], 'S'))!
        .ownerInstancePath,
    ).toEqual(['a1', 'b']);
  });

  it('gives a PRE-v3 recording an empty ownerInstancePath rather than an undefined one', () => {
    // What a recording exported before identity keys looks like: bare map
    // keys, and no `ownerInstancePath` anywhere. The type declares the field
    // required, so leaving it undefined would make every imported record a
    // type lie (RC-08/KA-06).
    const legacyJson = {
      id: 'legacy-run',
      startTime: 0,
      endTime: 1,
      totalDuration: 1,
      warmupDuration: 0,
      totalPauseDuration: 0,
      status: 'completed',
      steps: [],
      errors: [],
      concurrencyLevels: [],
      loopRecords: {
        L: {
          loopStructureId: 'L',
          loopStartNodeId: 'L',
          loopStopNodeId: 'L-stop',
          loopEndNodeId: 'L-end',
          totalIterations: 0,
          startTime: 0,
          endTime: 1,
          duration: 1,
          iterations: [],
        },
      },
      groupRecords: {},
      finalValues: {},
    };

    const restored = deserializeExecutionRecord(
      JSON.parse(JSON.stringify(legacyJson)),
    );

    const legacyLoop = restored.loopRecords.get('L');
    expect(legacyLoop).toBeDefined();
    expect(legacyLoop!.ownerInstancePath).toEqual([]);
    // It still resolves — through the fallback scan, which is what the
    // compatibility promise rests on.
    expect(resolveStructureRecord(restored.loopRecords, 'L')?.key).toBe('L');
  });
});

describe('import validation of the record format (F2b/UM-08)', () => {
  function importWith(record: Record<string, unknown>) {
    return importExecutionRecord(
      JSON.stringify({
        version: 1,
        exportedAt: new Date(0).toISOString(),
        record: {
          id: 'r',
          startTime: 0,
          endTime: 1,
          totalDuration: 1,
          status: 'completed',
          steps: [],
          errors: [],
          concurrencyLevels: [],
          ...record,
        },
      }),
    );
  }

  it('flags a legacy-keyed recording ONCE PER MAP, as a warning that does not block the import', () => {
    const result = importWith({
      loopRecords: {
        L1: { loopStructureId: 'L1' },
        L2: { loopStructureId: 'L2' },
      },
    });

    expect(result.success).toBe(true);
    const legacyWarnings = result.warnings.filter((issue) =>
      issue.message.includes('pre-identity-key format'),
    );
    // TWO legacy keys, ONE warning — an old recording gets a single
    // actionable line, not a flood.
    expect(legacyWarnings).toHaveLength(1);
    expect(legacyWarnings[0]!.severity).toBe('warning');
    expect(legacyWarnings[0]!.message).toContain('2 of 2');
    expect(legacyWarnings[0]!.path).toBe('record.loopRecords');
  });

  it('says nothing about keys for a current recording', () => {
    const result = importWith({
      loopRecords: {
        [structureRecordKey(['g1'], 'L')]: {
          loopStructureId: 'L',
          ownerInstancePath: ['g1'],
        },
        // A salvage duplicate is a valid key shape too.
        [structureRecordKey(['g1'], 'L', 1)]: {
          loopStructureId: 'L',
          ownerInstancePath: ['g1'],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(
      result.warnings.filter((issue) =>
        issue.message.includes('pre-identity-key format'),
      ),
    ).toHaveLength(0);
  });

  it('REJECTS a non-object record entry instead of deserializing a type-lying record', () => {
    // A legacy KEY is staleness — the record itself is fine. A non-object
    // VALUE is structural corruption: the deserializers spread `{...obj}`
    // with no guard, so letting it through hands the UI a `LoopRecord` whose
    // every required field is `undefined`, failing far from the import.
    const result = importWith({
      loopRecords: { [structureRecordKey([], 'L')]: null },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const entryErrors = result.errors.filter((issue) =>
        issue.message.includes('Expected record object'),
      );
      expect(entryErrors).toHaveLength(1);
      expect(entryErrors[0]!.path).toContain('record.loopRecords');
    }
  });

  it('flags a record map that is not an object at all', () => {
    // Without this branch `Object.entries([])`/`Object.entries("x")` would
    // hand the deserializer index-keyed junk.
    const result = importWith({ loopRecords: [] });

    const shapeIssues = result.warnings.filter((issue) =>
      issue.message.includes('Expected loopRecords object'),
    );
    expect(shapeIssues).toHaveLength(1);
  });

  it('descends into innerRecord and nested iteration maps, one warning per map', () => {
    // The maps most likely to hold aliased pre-v3 keys are the nested ones —
    // AU-01 was a group-inner bug and AU-02 a nested-loop bug — so a
    // top-level-only sweep says nothing about exactly the risky part.
    const result = importWith({
      groupRecords: {
        [structureRecordKey([], 'g1')]: {
          groupNodeId: 'g1',
          ownerInstancePath: [],
          innerRecord: {
            loopRecords: { L: { loopStructureId: 'L' } }, // legacy key, nested
          },
        },
      },
      loopRecords: {
        [structureRecordKey([], 'outer')]: {
          loopStructureId: 'outer',
          ownerInstancePath: [],
          iterations: [
            {
              iteration: 0,
              nestedLoopRecords: { K: { loopStructureId: 'K' } },
            },
          ],
        },
      },
    });

    const legacyPaths = result.warnings
      .filter((issue) => issue.message.includes('pre-identity-key format'))
      .map((issue) => issue.path);

    // The issue path quotes the key with JSON.stringify, so an identity key
    // (itself JSON) appears escaped inside it.
    expect(legacyPaths).toContain(
      `record.groupRecords[${JSON.stringify(structureRecordKey([], 'g1'))}].innerRecord.loopRecords`,
    );
    expect(legacyPaths).toContain(
      `record.loopRecords[${JSON.stringify(structureRecordKey([], 'outer'))}].iterations[0].nestedLoopRecords`,
    );
    // The two top-level maps are themselves current, so they contribute none.
    expect(legacyPaths).not.toContain('record.loopRecords');
    expect(legacyPaths).not.toContain('record.groupRecords');
  });

  it('validates switchRecords — previously not checked at all — and malformed identities', () => {
    const result = importWith({
      switchRecords: {
        [structureRecordKey([], 'S')]: {
          switchStructureId: 'S',
          ownerInstancePath: 'not-an-array',
        },
      },
    });

    const ownerIssues = result.warnings.filter((issue) =>
      issue.path.endsWith('.ownerInstancePath'),
    );
    expect(ownerIssues).toHaveLength(1);
    expect(ownerIssues[0]!.path).toContain('record.switchRecords');
    expect(ownerIssues[0]!.message).toContain('array of group-instance ids');
  });
});
