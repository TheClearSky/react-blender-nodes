import { describe, it, expect } from 'vitest';
import {
  findStepOverTarget,
  findStepOutTarget,
} from '@/utils/nodeRunner/stepNavigation';
import type { ExecutionStepRecord } from '@/utils/nodeRunner/types';

/** Minimal step stub — only stepIndex + instancePath matter to the helpers. */
function makeStep(
  stepIndex: number,
  instancePath?: readonly string[],
): ExecutionStepRecord {
  return { stepIndex, instancePath } as ExecutionStepRecord;
}

// Shape of the two-instance fixture: root, G1-inner, G1-structural(root path),
// G2-inner, G2-structural(root path), root.
const flatTwoInstances = [
  makeStep(0),
  makeStep(1, ['G1']),
  makeStep(2),
  makeStep(3, ['G2']),
  makeStep(4),
  makeStep(5),
];

// Nested: root, A-inner, B-inner (A>B), B-structural([A]), A-structural(root).
const nested = [
  makeStep(0),
  makeStep(1, ['A']),
  makeStep(2, ['A', 'B_tpl']),
  makeStep(3, ['A']),
  makeStep(4),
];

// Concurrent interleave: two sibling instances' inner steps alternate.
const interleaved = [
  makeStep(0),
  makeStep(1, ['G1']),
  makeStep(2, ['G2']),
  makeStep(3, ['G1']),
  makeStep(4, ['G2']),
  makeStep(5),
];

describe('stepNavigation — step over', () => {
  it('from a root step just before a group, lands PAST the inner steps on the next root-depth step', () => {
    expect(findStepOverTarget(flatTwoInstances, 0)).toBe(2);
  });

  it('from inside a group, advances to the next step at or above its depth', () => {
    // #1 is depth 1; the next step with depth ≤ 1 is #2 (root).
    expect(findStepOverTarget(flatTwoInstances, 1)).toBe(2);
  });

  it('returns null at the end of the record', () => {
    expect(findStepOverTarget(flatTwoInstances, 5)).toBeNull();
  });

  it('nested: stepping over from root skips the whole 2-level subtree', () => {
    expect(findStepOverTarget(nested, 0)).toBe(4);
  });

  it('interleaved concurrency: guided by path depth, not contiguity', () => {
    // From #1 (depth 1), the next depth ≤ 1 step is #2 (the OTHER instance) —
    // depth-based semantics, deliberately instance-agnostic for over.
    expect(findStepOverTarget(interleaved, 1)).toBe(2);
    // From root #0, skip nothing deeper... #1 is deeper, first ≤0 is #5.
    expect(findStepOverTarget(interleaved, 0)).toBe(5);
  });
});

describe('stepNavigation — step out', () => {
  it('from inside a group, lands on the first strictly-shallower step (the structural exit)', () => {
    expect(findStepOutTarget(flatTwoInstances, 1)).toBe(2);
    expect(findStepOutTarget(flatTwoInstances, 3)).toBe(4);
  });

  it('returns null at root depth', () => {
    expect(findStepOutTarget(flatTwoInstances, 0)).toBeNull();
    expect(findStepOutTarget(flatTwoInstances, 2)).toBeNull();
  });

  it('nested: stepping out one level at a time', () => {
    // From B-inner (depth 2) → first depth<2 is #3 ([A]).
    expect(findStepOutTarget(nested, 2)).toBe(3);
    // From #3 (depth 1) → first depth<1 is #4 (root).
    expect(findStepOutTarget(nested, 3)).toBe(4);
  });

  it('returns null when nothing shallower follows', () => {
    const tail = [makeStep(0), makeStep(1, ['G1'])];
    expect(findStepOutTarget(tail, 1)).toBeNull();
  });
});
