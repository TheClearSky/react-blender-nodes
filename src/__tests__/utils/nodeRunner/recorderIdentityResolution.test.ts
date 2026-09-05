import { describe, it, expect, vi } from 'vitest';
import {
  ExecutionRecorder,
  structureRecordKey,
  resolveStructureRecord,
  // Module-only (deliberately absent from the package barrel), so it is
  // imported from the module the way `validation.ts` does.
  isStructureRecordKey,
} from '@/utils/nodeRunner/executionRecorder';
import type { RecorderWarning } from '@/utils/nodeRunner/executionRecorder';

/**
 * PLAN C F3 — pins for the identity/resolution/salvage machinery the v3
 * implementation review found untested (TP-09…TP-13, CP-16(iv)(v)) plus the
 * Class A completion-serial watermark oracle.
 *
 * Everything here drives the recorder API directly. That is deliberate: each
 * case is a recorder-internal invariant that a healthy executor never
 * produces on purpose (a lost race, a salvaged orphan, a step that never
 * finished), and the executor-driven counterparts live in the S1/S4 suites.
 *
 * Assertion rule (inherited from the concurrency suite): membership and
 * topology, never absolute timings. The one duration assertion below is
 * RELATIONAL (scoped pause < total pause), which holds regardless of clock.
 */

/**
 * Minimal shape `resolveStructureRecord` is generic over. `loopStructureId`
 * is carried so the negative cases below are adversarial: a resolver that
 * ever went back to scanning record VALUES for a matching structure id
 * (the design §3.5 originally sketched) would find these and hand back the
 * wrong instance's record.
 */
type ProbeRecord = {
  ownerInstancePath?: readonly string[];
  loopStructureId?: string;
  tag: string;
};

function waitForMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('resolveStructureRecord — the single lookup every UI surface routes through (TP-09)', () => {
  it('resolves an exact identity at every nesting depth', () => {
    const map = new Map<string, ProbeRecord>([
      [structureRecordKey([], 'L'), { ownerInstancePath: [], tag: 'root' }],
      [
        structureRecordKey(['g2'], 'L'),
        { ownerInstancePath: ['g2'], tag: 'depth-1' },
      ],
      [
        structureRecordKey(['g2', 's1'], 'L'),
        { ownerInstancePath: ['g2', 's1'], tag: 'depth-2' },
      ],
    ]);

    // FORMAT pin, written literally rather than through the SUT's own key
    // function — building the map, resolving it and asserting the result all
    // through `structureRecordKey` would move together under any format
    // change and pin nothing.
    expect(Array.from(map.keys())).toEqual([
      '["L"]',
      '["g2","L"]',
      '["g2","s1","L"]',
    ]);
    expect(resolveStructureRecord(map, 'L', ['g2', 's1'])?.key).toBe(
      '["g2","s1","L"]',
    );

    expect(resolveStructureRecord(map, 'L', [])?.record.tag).toBe('root');
    expect(resolveStructureRecord(map, 'L')?.record.tag).toBe('root');
    expect(resolveStructureRecord(map, 'L', ['g2'])?.record.tag).toBe(
      'depth-1',
    );
    expect(resolveStructureRecord(map, 'L', ['g2', 's1'])?.record.tag).toBe(
      'depth-2',
    );
    // The returned key is the one the record is actually filed under, so a
    // caller can write it straight back into selection state.
    expect(resolveStructureRecord(map, 'L', ['g2'])?.key).toBe(
      structureRecordKey(['g2'], 'L'),
    );
  });

  it('NEVER returns another instance’s record for a miss — the aliasing v3 exists to remove', () => {
    // Two instances of ONE group template share the template's structure ids,
    // so `L` here is the same node id in both. Only the owner path separates
    // them; a fallback that matched on structure id alone would hand back
    // instance 1's record for an instance 2 query.
    const map = new Map<string, ProbeRecord>([
      [
        structureRecordKey(['g1'], 'L'),
        { ownerInstancePath: ['g1'], loopStructureId: 'L', tag: 'instance-1' },
      ],
    ]);

    expect(resolveStructureRecord(map, 'L', ['g2'])).toBeUndefined();
    expect(resolveStructureRecord(map, 'L', [])).toBeUndefined();
    expect(resolveStructureRecord(map, 'L')).toBeUndefined();
    // A structure id that simply is not present.
    expect(resolveStructureRecord(map, 'other', ['g1'])).toBeUndefined();
  });

  it('reaches a salvage record filed under a numeric ordinal', () => {
    // The finalize backstop appends an ordinal when the identity key is
    // taken. Without the ordinal probe such a record is written, serialized
    // and counted — yet invisible to every UI surface.
    const map = new Map<string, ProbeRecord>([
      [
        structureRecordKey(['g1'], 'L', 1),
        { ownerInstancePath: ['g1'], tag: 'salvaged' },
      ],
    ]);

    const resolved = resolveStructureRecord(map, 'L', ['g1']);
    expect(resolved?.record.tag).toBe('salvaged');
    expect(resolved?.key).toBe(structureRecordKey(['g1'], 'L', 1));

    // A healthy record always wins over its own salvage duplicate.
    map.set(structureRecordKey(['g1'], 'L'), {
      ownerInstancePath: ['g1'],
      tag: 'healthy',
    });
    expect(resolveStructureRecord(map, 'L', ['g1'])?.record.tag).toBe(
      'healthy',
    );
  });

  it('falls back ONLY for records filed under a pre-v3 KEY — never for one under a real identity key', () => {
    const map = new Map<string, ProbeRecord>([
      ['L', { tag: 'legacy-bare' }],
      ['g2|K', { tag: 'legacy-qualified' }],
      [
        structureRecordKey(['g9'], 'V'),
        { ownerInstancePath: ['g9'], loopStructureId: 'V', tag: 'current' },
      ],
    ]);

    // Legacy records have no identity of their own, so any owner resolves.
    expect(resolveStructureRecord(map, 'L', [])?.record.tag).toBe(
      'legacy-bare',
    );
    expect(resolveStructureRecord(map, 'L', ['anything'])?.record.tag).toBe(
      'legacy-bare',
    );
    expect(resolveStructureRecord(map, 'K', ['g2'])?.record.tag).toBe(
      'legacy-qualified',
    );
    // The current-format record in the same map is NOT reachable by scan.
    expect(resolveStructureRecord(map, 'V', ['wrong'])).toBeUndefined();
  });

  it('matches an `owner|id` legacy key BY OWNER — that shape does distinguish instances', () => {
    // A bare key carries no owner, so any owner may claim it. An `owner|id`
    // key is different: it demonstrably tells the two instances apart, so
    // handing one back for a different owner would return another instance's
    // record — the exact aliasing this whole format exists to remove, sneaking
    // back in through the compatibility path.
    const map = new Map<string, ProbeRecord>([
      ['g1|L', { loopStructureId: 'L', tag: 'instance-1' }],
      ['g2|L', { loopStructureId: 'L', tag: 'instance-2' }],
    ]);

    expect(resolveStructureRecord(map, 'L', ['g1'])?.record.tag).toBe(
      'instance-1',
    );
    expect(resolveStructureRecord(map, 'L', ['g2'])?.record.tag).toBe(
      'instance-2',
    );
    // No owner-matching candidate and no bare key ⇒ nothing, rather than
    // whichever instance Map iteration order happened to reach first.
    expect(resolveStructureRecord(map, 'L', ['g9'])).toBeUndefined();
    expect(resolveStructureRecord(map, 'L', [])).toBeUndefined();

    // A bare key in the same map remains the identity-free fallback.
    map.set('L', { loopStructureId: 'L', tag: 'bare' });
    expect(resolveStructureRecord(map, 'L', ['g9'])?.record.tag).toBe('bare');
    // …but an owner-matching qualified key still wins over it.
    expect(resolveStructureRecord(map, 'L', ['g1'])?.record.tag).toBe(
      'instance-1',
    );
  });

  it('matches a MULTI-SEGMENT owner by the slash-joined prefix the pre-v3 producer emitted', () => {
    // The v2 qualified spelling was `${ownerInstancePath.join('/')}|${id}`, so
    // the owner part is slash-joined and the pipe is the boundary, appearing
    // exactly once. A single-segment owner cannot tell the two apart, which is
    // why this case uses depth 2.
    const map = new Map<string, ProbeRecord>([
      ['a/b|L', { loopStructureId: 'L', tag: 'nested' }],
    ]);
    expect(resolveStructureRecord(map, 'L', ['a', 'b'])?.record.tag).toBe(
      'nested',
    );
    expect(resolveStructureRecord(map, 'L', ['a'])).toBeUndefined();
    expect(resolveStructureRecord(map, 'L', ['b', 'a'])).toBeUndefined();
  });

  it('does NOT treat a pipe INSIDE a structure id as an owner separator', () => {
    // `a|b|L` is a real v2 key for owner ['a'] and structure id `b|L` — node
    // ids are consumer-authored via REPLACE_STATE and no reserved-character
    // guard exists. Accepting a pipe-joined owner would make this answer a
    // query for structure `L` under owner ['a','b'] with a DIFFERENT
    // structure's record — the exact cross-identity alias the owner-aware
    // scan was written to remove.
    const map = new Map<string, ProbeRecord>([
      ['a|b|L', { loopStructureId: 'b|L', tag: 'different-structure' }],
    ]);

    expect(resolveStructureRecord(map, 'L', ['a', 'b'])).toBeUndefined();
    // Its OWN identity still resolves: owner ['a'], structure id `b|L`.
    expect(resolveStructureRecord(map, 'b|L', ['a'])?.record.tag).toBe(
      'different-structure',
    );
  });

  it('still resolves a legacy-keyed record that IMPORT stamped with an empty owner', () => {
    // The deserializers default a missing `ownerInstancePath` to `[]` so an
    // imported record is not a type lie — which makes an imported pre-v3
    // record's VALUE indistinguishable from a root-owned current one. Only
    // its KEY still says which it is, so that is what the fallback tests.
    const map = new Map<string, ProbeRecord>([
      ['L', { ownerInstancePath: [], loopStructureId: 'L', tag: 'imported' }],
    ]);

    expect(resolveStructureRecord(map, 'L')?.record.tag).toBe('imported');
    expect(resolveStructureRecord(map, 'L', ['g1'])?.record.tag).toBe(
      'imported',
    );
  });
});

describe('the recorder-warning delivery contract useNodeRunner depends on (WD-07/WD-08)', () => {
  // `useNodeRunner` hands the executor a stable TRAMPOLINE that dereferences a
  // ref at emit time, so a consumer's latest handler is used rather than the
  // one that happened to be current when the run started. These pin the two
  // recorder-side properties that makes rely on; the hook has no unit-test
  // harness (vitest runs in `node`, no testing-library), so the trampoline's
  // browser behaviour is covered by `e2e/repro/c1-recorder-warning-channel`.

  it('calls the observer it was constructed with EVERY time, so a trampoline sees each warning', () => {
    const seen: string[] = [];
    let live: ((warning: RecorderWarning) => void) | undefined = (warning) =>
      seen.push(`first:${warning.kind}`);
    // The recorder holds this wrapper for the whole run; swapping `live`
    // afterwards is what the hook's ref-swap looks like from here.
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => live?.(warning),
    });
    recorder.start();

    recorder.beginLoopStructure('A', 'A', 'stop', 'end', []);
    recorder.beginLoopStructure('A', 'A', 'stop', 'end', []); // key-collision

    live = (warning) => seen.push(`second:${warning.kind}`);
    recorder.beginLoopStructure('B', 'B', 'stop', 'end', []);
    recorder.beginLoopStructure('B', 'B', 'stop', 'end', []); // key-collision

    expect(seen).toEqual(['first:key-collision', 'second:key-collision']);
  });

  it('suppresses its own console fallback whenever an observer is registered — which is why the trampoline must not swallow', () => {
    // This is the property that makes WD-07 a real hazard: once ANY observer
    // is registered the recorder never console-warns, so a trampoline whose
    // ref has gone empty must emit the fallback itself or the warning is lost
    // on every channel at once.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const swallowing = new ExecutionRecorder({
        onRecorderWarning: () => {},
      });
      swallowing.start();
      swallowing.beginLoopStructure('L', 'L', 'stop', 'end', []);
      swallowing.beginLoopStructure('L', 'L', 'stop', 'end', []);
      expect(
        warnSpy.mock.calls.filter((call) =>
          String(call[0]).startsWith('[ExecutionRecorder]'),
        ),
      ).toHaveLength(0);

      // With NO observer the same misuse does reach the console.
      const unobserved = new ExecutionRecorder();
      unobserved.start();
      unobserved.beginLoopStructure('L', 'L', 'stop', 'end', []);
      unobserved.beginLoopStructure('L', 'L', 'stop', 'end', []);
      expect(
        warnSpy.mock.calls.filter((call) =>
          String(call[0]).startsWith('[ExecutionRecorder] key-collision'),
        ).length,
      ).toBeGreaterThan(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('isStructureRecordKey — the one predicate that separates a current key from a pre-v3 one', () => {
  it('accepts exactly what structureRecordKey can emit, and nothing else', () => {
    // TRUE ⇒ "this is a current identity key", which makes
    // `resolveStructureRecord`'s compatibility scan SKIP the entry. A false
    // positive therefore makes a legacy record unreachable; a false negative
    // lets the scan return a current record across identities.
    const identityKeys = [
      structureRecordKey([], 'L'),
      structureRecordKey(['g2'], 'L'),
      structureRecordKey(['a1', 'b'], 'L'),
      structureRecordKey(['g2'], 'L', 1),
      structureRecordKey(['a1', 'b'], 'L', 42),
      // Ids that would break any delimiter-based scheme — JSON escapes them,
      // so these must still be recognised as current keys.
      structureRecordKey(['a|b'], 'c'),
      structureRecordKey(['a'], 'b|c'),
      structureRecordKey(['say "hi"'], 'back\\slash'),
      structureRecordKey(['新しい'], '😀'),
      structureRecordKey([''], ''),
    ];
    for (const key of identityKeys) {
      expect(isStructureRecordKey(key), key).toBe(true);
    }

    const legacyOrJunk = [
      'L', // pre-v3 bare id
      'g2|L', // pre-v3 owner-qualified
      'a/b/c',
      '', // not JSON
      '{"L":1}', // JSON, but an object
      '[]', // JSON array, but empty
      '"L"', // JSON, but a string
      '42',
      'null',
      '[1,2]', // no string segment
      '["L",1.5]', // a fractional "ordinal" this module cannot emit
      '["L",-1]', // a negative one
      '["L",0]', // ordinals start at 1
    ];
    for (const key of legacyOrJunk) {
      expect(isStructureRecordKey(key), key).toBe(false);
    }
  });
});

describe('recorder salvage + sweeps (TP-10, TP-11, TP-13, CP-16)', () => {
  it('files a colliding salvage under an ordinal and never overwrites the healthy record (TP-10)', () => {
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    // A healthy execution of identity ["L"].
    recorder.beginLoopStructure('L', 'L', 'stop', 'end', []);
    recorder.beginLoopIteration('L', 0, []);
    recorder.completeLoopIteration('L', 0, false, []);
    recorder.completeLoopStructure('L', []);

    // A SECOND execution of the same identity that never completes.
    recorder.beginLoopStructure('L', 'L', 'stop', 'end', []);
    const record = recorder.finalize('completed', new Map());

    const healthy = record.loopRecords.get(structureRecordKey([], 'L'));
    const salvaged = record.loopRecords.get(structureRecordKey([], 'L', 1));
    expect(healthy).toBeDefined();
    expect(salvaged).toBeDefined();
    // The completed one kept its iterations; the salvaged one has none.
    expect(healthy!.totalIterations).toBe(1);
    expect(salvaged!.totalIterations).toBe(0);
    // Both carry the same structural identity — only the key disambiguates.
    expect(healthy!.ownerInstancePath).toEqual([]);
    expect(salvaged!.ownerInstancePath).toEqual([]);
    expect(
      warnings.filter((warning) => warning.kind === 'orphan-promoted'),
    ).toHaveLength(1);
  });

  it('emits orphan-DROPPED for a structure-less pending iteration and keeps its steps in the flat list (TP-11)', () => {
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    // An iteration with no owning structure: the loop triplet ids live on the
    // structure entry, so there is nothing to build a LoopRecord from.
    recorder.beginLoopIteration('ghost', 0, ['g1']);
    const stepIndex = recorder.beginStep({
      nodeId: 'inner',
      nodeTypeId: 'innerType',
      nodeTypeName: 'Inner',
      concurrencyLevel: 0,
      loopIteration: 0,
      loopStructureId: 'ghost',
      instancePath: ['g1'],
    });
    recorder.completeStep(stepIndex, new Map(), new Map());

    const record = recorder.finalize('completed', new Map());

    const dropped = warnings.filter(
      (warning) => warning.kind === 'orphan-dropped',
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.key).toBe(structureRecordKey(['g1'], 'ghost'));
    expect(record.loopRecords.size).toBe(0);
    // Dropped from the structure tree, NOT from the record: the step survives.
    expect(record.steps.map((step) => step.nodeId)).toEqual(['inner']);
  });

  it('promotes a nested orphan exactly once, folded into its parent (TP-13 — the consumePendingLoopSubtree recursion)', () => {
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    // outer ⊃ inner, both left pending: the parent materialization absorbs
    // the child, and the child must not ALSO surface as its own top-level
    // record (that phantom is what the subtree consumption prevents).
    recorder.beginLoopStructure('outer', 'outer', 'oStop', 'oEnd', ['g1']);
    recorder.beginLoopIteration('outer', 0, ['g1']);
    recorder.beginLoopStructure('inner', 'inner', 'iStop', 'iEnd', ['g1'], {
      kind: 'loop',
      loopStructureId: 'outer',
      iteration: 0,
    });

    const record = recorder.finalize('completed', new Map());

    expect(Array.from(record.loopRecords.keys())).toEqual([
      structureRecordKey(['g1'], 'outer'),
    ]);
    const outerRecord = record.loopRecords.get(
      structureRecordKey(['g1'], 'outer'),
    )!;
    expect(outerRecord.iterations).toHaveLength(1);
    expect(
      Array.from(outerRecord.iterations[0]!.nestedLoopRecords.keys()),
    ).toEqual([structureRecordKey(['g1'], 'inner')]);
    // ONE promotion warning: the parent's. The child was absorbed, not
    // separately salvaged.
    expect(
      warnings.filter((warning) => warning.kind === 'orphan-promoted'),
    ).toHaveLength(1);
  });

  it('never loses a nested loop record when a superseded iteration has no structure to attach to (SW-14)', () => {
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    // A child completes and parks itself for parent iteration 0 — but the
    // PARENT STRUCTURE was never begun, so there is nothing to attach the
    // superseded iteration record to.
    recorder.beginLoopIteration('P', 0, []);
    recorder.beginLoopStructure('C', 'C', 'cStop', 'cEnd', [], {
      kind: 'loop',
      loopStructureId: 'P',
      iteration: 0,
    });
    recorder.completeLoopStructure('C', []);

    // Superseding iteration 0 builds a record for it — which SPLICES the
    // parked child out of the recorder's list. Dropping that record would
    // take the child with it, and finalize only sweeps what is still parked.
    recorder.beginLoopIteration('P', 1, []);

    const record = recorder.finalize('completed', new Map());

    expect(warnings.map((warning) => warning.kind)).toContain('key-collision');
    // The child survived — promoted flat, since its parent never existed.
    const childRecord = record.loopRecords.get(structureRecordKey([], 'C'));
    expect(childRecord).toBeDefined();
    expect(childRecord!.loopStructureId).toBe('C');
    expect(
      warnings.filter((warning) => warning.kind === 'orphan-promoted').length,
    ).toBeGreaterThan(0);
  });

  it('never loses a nested loop record when completeLoopIteration has no structure either (PD-01)', () => {
    // The SAME hazard as the supersede path, at the sibling call site — the
    // one the executor actually drives. Building the record splices the parked
    // child out; without the shared push-back it would vanish with the record.
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    recorder.beginLoopIteration('P', 0, []);
    recorder.beginLoopStructure('C', 'C', 'cStop', 'cEnd', [], {
      kind: 'loop',
      loopStructureId: 'P',
      iteration: 0,
    });
    recorder.completeLoopStructure('C', []);
    // No `beginLoopStructure('P')` ever happened, so there is nothing to
    // attach the iteration record to.
    recorder.completeLoopIteration('P', 0, false, []);

    const record = recorder.finalize('completed', new Map());

    expect(record.loopRecords.get(structureRecordKey([], 'C'))).toBeDefined();
    // And, unlike before, the drop is announced rather than silent.
    const dropped = warnings.filter(
      (warning) => warning.kind === 'orphan-dropped',
    );
    expect(dropped.length).toBeGreaterThan(0);
    expect(
      dropped.some((warning) => warning.message.includes('iteration 0')),
    ).toBe(true);
  });

  it('never loses a nested loop record when beginLoopStructure supersedes an entry holding COMPLETED iterations (R2-01)', () => {
    // The THIRD discarder. Unlike the two producers, this site drops an
    // iteration record it did not build: `existing.iterations` is already
    // populated, and each of those absorbed (spliced) its nested children out
    // of the parked list. Dropping the entry took them with it.
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    recorder.beginLoopStructure('P', 'P', 'pStop', 'pEnd', []);
    recorder.beginLoopIteration('P', 0, []);
    recorder.beginLoopStructure('C', 'C', 'cStop', 'cEnd', [], {
      kind: 'loop',
      loopStructureId: 'P',
      iteration: 0,
    });
    recorder.completeLoopStructure('C', []); // C parks
    recorder.completeLoopIteration('P', 0, false, []); // C is spliced INTO P/0

    // MISUSE: P is re-begun, so the entry holding that completed iteration —
    // and the child inside it — is discarded.
    recorder.beginLoopStructure('P', 'P', 'pStop', 'pEnd', []);
    recorder.completeLoopStructure('P', []);
    const record = recorder.finalize('completed', new Map());

    // THE pin: the nested loop record survives, promoted flat by finalize.
    expect(record.loopRecords.get(structureRecordKey([], 'C'))).toBeDefined();
    // And the discard is announced, naming what was lost.
    const collision = warnings.find(
      (warning) => warning.kind === 'key-collision',
    );
    expect(collision).toBeDefined();
    expect(collision!.message).toContain('completed iteration record');
  });

  it('never silently deletes a pending child the materializer declined to fold (R3-01, the fourth site)', () => {
    // `materializePendingLoopStructure` skips a pending child whose identity
    // key is already taken by a parked sibling record; `consumePendingLoopSubtree`
    // had no such conjunct, so it deleted exactly that difference — a live
    // child, its built iteration records and its parked grandchildren — from
    // every map, with no warning on any channel.
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    recorder.beginLoopStructure('P', 'P', 'pStop', 'pEnd', []);
    recorder.beginLoopIteration('P', 0, []);

    // Run 1 of C completes and PARKS under (P, 0) — this is the record whose
    // key the folder will find already taken.
    recorder.beginLoopStructure('C', 'C', 'cStop', 'cEnd', [], {
      kind: 'loop',
      loopStructureId: 'P',
      iteration: 0,
    });
    recorder.completeLoopStructure('C', []);

    // Run 2 of C — same identity, still PENDING, and holding a grandchild G
    // that its own iteration absorbed.
    recorder.beginLoopStructure('C', 'C', 'cStop', 'cEnd', [], {
      kind: 'loop',
      loopStructureId: 'P',
      iteration: 0,
    });
    recorder.beginLoopIteration('C', 0, []);
    recorder.beginLoopStructure('G', 'G', 'gStop', 'gEnd', [], {
      kind: 'loop',
      loopStructureId: 'C',
      iteration: 0,
    });
    recorder.completeLoopStructure('G', []);
    recorder.completeLoopIteration('C', 0, false, []);

    // P never completes ⇒ the finalize salvage materializes it and consumes
    // its subtree.
    const record = recorder.finalize('completed', new Map());

    // THE pin: the second C is not destroyed. It is promoted flat (the folder
    // could not nest it — its key was taken), and G rides along inside it.
    const salvagedC = record.loopRecords.get(structureRecordKey([], 'C'));
    expect(salvagedC).toBeDefined();
    const gIsReachable =
      record.loopRecords.has(structureRecordKey([], 'G')) ||
      salvagedC!.iterations.some((iteration) =>
        iteration.nestedLoopRecords.has(structureRecordKey([], 'G')),
      );
    expect(gIsReachable).toBe(true);
    // And nothing disappears without a word.
    expect(
      warnings.filter((warning) => warning.kind === 'orphan-promoted').length,
    ).toBeGreaterThan(1);
  });

  it('warns when completeLoopIteration is given an iteration that disagrees with the pending one (PD-12)', () => {
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    recorder.beginLoopStructure('L', 'L', 'stop', 'end', []);
    recorder.beginLoopIteration('L', 2, []);
    // A child parked for the PENDING iteration number (2), which is what the
    // steps and children are actually stamped with.
    recorder.beginLoopStructure('C', 'C', 'cStop', 'cEnd', [], {
      kind: 'loop',
      loopStructureId: 'L',
      iteration: 2,
    });
    recorder.completeLoopStructure('C', []);

    // The caller closes it as 5 — a divergence.
    recorder.completeLoopIteration('L', 5, false, []);
    recorder.completeLoopStructure('L', []);
    const record = recorder.finalize('completed', new Map());

    const collisions = warnings.filter(
      (warning) => warning.kind === 'key-collision',
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.message).toContain('5');
    expect(collisions[0]!.message).toContain('2');

    // THE point of using `pending.iteration` for the filter: the child is
    // still collected, rather than escaping to the top level as a phantom.
    const loopRecord = record.loopRecords.get(structureRecordKey([], 'L'))!;
    expect(loopRecord.iterations).toHaveLength(1);
    expect(
      Array.from(loopRecord.iterations[0]!.nestedLoopRecords.keys()),
    ).toEqual([structureRecordKey([], 'C')]);
    expect(record.loopRecords.has(structureRecordKey([], 'C'))).toBe(false);
  });

  it('reconstructs push-back parentage so a returned child lands in the right iteration (PD-12)', () => {
    const recorder = new ExecutionRecorder();
    recorder.start();

    // No structure yet: the child parks for P/0, then the supersede path
    // returns it with that parentage reconstructed.
    recorder.beginLoopIteration('P', 0, []);
    recorder.beginLoopStructure('C', 'C', 'cStop', 'cEnd', [], {
      kind: 'loop',
      loopStructureId: 'P',
      iteration: 0,
    });
    recorder.completeLoopStructure('C', []);
    recorder.beginLoopIteration('P', 0, []); // supersede — pushes the child back

    // NOW the structure exists and iteration 0 completes normally: if the
    // pushed-back parentage were wrong, the child would not be collected here
    // and would surface flat instead.
    recorder.beginLoopStructure('P', 'P', 'pStop', 'pEnd', []);
    recorder.completeLoopIteration('P', 0, false, []);
    recorder.completeLoopStructure('P', []);
    const record = recorder.finalize('completed', new Map());

    const parentRecord = record.loopRecords.get(structureRecordKey([], 'P'))!;
    expect(parentRecord).toBeDefined();
    expect(
      Array.from(parentRecord.iterations[0]!.nestedLoopRecords.keys()),
    ).toEqual([structureRecordKey([], 'C')]);
    expect(record.loopRecords.has(structureRecordKey([], 'C'))).toBe(false);
  });

  it('stamps a step that was begun but never completed, and keeps it in the record (CP-16 iv)', () => {
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    const stepIndex = recorder.beginStep({
      nodeId: 'never-finished',
      nodeTypeId: 'someType',
      nodeTypeName: 'Some Type',
      concurrencyLevel: 0,
    });

    const record = recorder.finalize('errored', new Map());

    const step = record.steps[stepIndex]!;
    expect(step.status).toBe('errored');
    // Relative to the run start, like every other step time — and no longer
    // the `endTime: 0` sentinel `beginStep` wrote. `finalize` samples one
    // `now` and uses it for BOTH the sweep's stamp and `totalDuration`, so
    // these are equal by construction; asserting equality pins that, whereas
    // `toBeLessThanOrEqual` could never have failed.
    expect(step.endTime).toBeGreaterThan(0);
    expect(step.endTime).toBe(record.totalDuration);
    expect(step.duration).toBe(step.endTime - step.startTime);
    // Salvage never fabricates error entries (status is executor-computed).
    expect(record.errors).toHaveLength(0);

    const promoted = warnings.filter(
      (warning) => warning.kind === 'orphan-promoted',
    );
    expect(promoted).toHaveLength(1);
    expect(promoted[0]!.key).toBe(String(stepIndex));
  });

  it('reports pause RELATIVE to the scope, not the whole run (CP-16 v)', async () => {
    const recorder = new ExecutionRecorder();
    recorder.start();

    // Paused before the scope exists — this must not land in the scope.
    recorder.pause();
    await waitForMilliseconds(12);
    recorder.resume();

    const token = recorder.beginScope(['g1']);
    recorder.pause();
    await waitForMilliseconds(12);
    recorder.resume();
    const scopedRecord = recorder.endScope(token, 'completed', new Map());

    const record = recorder.finalize('completed', new Map());

    expect(scopedRecord.totalPauseDuration).toBeGreaterThan(0);
    // The run accumulated both pauses; the scope only its own.
    expect(scopedRecord.totalPauseDuration).toBeLessThan(
      record.totalPauseDuration,
    );
  });
});

describe('Class A — the completion-serial watermark (F3 pin 5, recorder-level oracle)', () => {
  it('includes a re-executed instance’s record in the LATER scope, though the identity key is unchanged', () => {
    const recorder = new ExecutionRecorder();
    recorder.start();

    // A group instance `g` containing loop `K`, executed twice — exactly what
    // a group inside a 2-iteration loop produces. Both executions write the
    // SAME identity key ["g","K"], so a "keys new since the scope opened"
    // filter sees nothing new the second time and the second group's
    // innerRecord comes back empty. The store-serial watermark sees the
    // rewrite.
    const runOnce = (label: string) => {
      const token = recorder.beginScope(['g']);
      recorder.beginLoopStructure('K', 'K', 'kStop', 'kEnd', ['g']);
      recorder.beginLoopIteration('K', 0, ['g']);
      recorder.completeLoopIteration('K', 0, false, ['g']);
      recorder.completeLoopStructure('K', ['g']);
      const scoped = recorder.endScope(token, 'completed', new Map());
      recorder.completeGroup(
        'g',
        'groupType',
        scoped,
        new Map(),
        new Map(),
        [],
      );
      return { label, scoped };
    };

    const first = runOnce('iteration-0');
    const second = runOnce('iteration-1');

    const identityKey = structureRecordKey(['g'], 'K');
    expect(Array.from(first.scoped.loopRecords.keys())).toEqual([identityKey]);
    // THE pin: the second scope sees the SAME key, rewritten — not a new one.
    expect(Array.from(second.scoped.loopRecords.keys())).toEqual([identityKey]);

    const record = recorder.finalize('completed', new Map());
    const groupRecord = record.groupRecords.get(structureRecordKey([], 'g'))!;
    // `completeGroup` is last-write-wins on one identity, so the surviving
    // group record is the second execution's — and it still carries the loop.
    expect(Array.from(groupRecord.innerRecord.loopRecords.keys())).toEqual([
      identityKey,
    ]);
  });
});
