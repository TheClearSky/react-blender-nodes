import { describe, it, expect } from 'vitest';
import { normalizeConnectionOrder } from '@/utils/importExport/validation';
import type { ValidationIssue } from '@/utils/importExport/types';

// `normalizeConnectionOrder` is the import-boundary repair (mirrors
// `repairRootGraphIo`): within a fan-in group it repacks `edge.data.order` to
// contiguous 0..n-1 when an import carries out-of-contract values, and is a
// silent no-op on clean / back-compat / single-connection state. Tested directly
// because it operates on raw `Record<string, unknown>` import state, before any
// rehydration. The repack order matches the compiler/popover: finite orders
// ascending (`compareConnectionOrder`), ties broken by edges-array index.

type RawOrder = number | string | null;

/** Build a raw fan-in state: N edges into the same `sink:in`, optional order each. */
function fanInState(
  orders: Array<RawOrder | undefined>,
): Record<string, unknown> {
  return {
    edges: orders.map((order, index) => ({
      id: `e${index}`,
      source: `s${index}`,
      sourceHandle: `s${index}_out`,
      target: 'sink',
      targetHandle: 'in',
      ...(order === undefined ? {} : { data: { order } }),
    })),
  };
}

function ordersOf(state: Record<string, unknown>): Array<number | undefined> {
  return (state.edges as Array<{ data?: { order?: unknown } }>).map((edge) => {
    const order = edge.data?.order;
    return typeof order === 'number' ? order : undefined;
  });
}

describe('normalizeConnectionOrder (import repair)', () => {
  it('repacks out-of-range / non-finite orders to contiguous 0..n-1', () => {
    // e0 = 1e308 (huge but finite), e1 = -5 → -5 sorts first.
    const state = fanInState([1e308, -5]);
    const warnings: ValidationIssue[] = [];
    normalizeConnectionOrder(state, warnings);
    expect(ordersOf(state)).toEqual([1, 0]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/fan-in connection order/i);
    expect(warnings[0].severity).toBe('warning');
  });

  it('repacks non-number garbage orders by stable edges-array order', () => {
    // Both non-numbers → both read as unset → ties broken by array index.
    const state = fanInState(['x', null]);
    const warnings: ValidationIssue[] = [];
    normalizeConnectionOrder(state, warnings);
    expect(ordersOf(state)).toEqual([0, 1]);
    expect(warnings).toHaveLength(1);
  });

  it('repacks a sparse group and counts only the edges that changed', () => {
    // {0, 5}: e0 already rank 0 (unchanged), e1 5 → 1.
    const state = fanInState([0, 5]);
    const warnings: ValidationIssue[] = [];
    normalizeConnectionOrder(state, warnings);
    expect(ordersOf(state)).toEqual([0, 1]);
    expect(warnings[0].message).toMatch(/Normalized 1 /);
  });

  it('is a no-op (no warning) on an already-canonical 0..n-1 group', () => {
    const state = fanInState([0, 1]);
    const warnings: ValidationIssue[] = [];
    normalizeConnectionOrder(state, warnings);
    expect(ordersOf(state)).toEqual([0, 1]);
    expect(warnings).toHaveLength(0);
  });

  it('leaves an entirely un-reordered (back-compat) group untouched', () => {
    const state = fanInState([undefined, undefined]);
    const warnings: ValidationIssue[] = [];
    normalizeConnectionOrder(state, warnings);
    expect(ordersOf(state)).toEqual([undefined, undefined]);
    expect(warnings).toHaveLength(0);
  });

  it('does not touch a single-connection handle', () => {
    const state = fanInState([5]);
    const warnings: ValidationIssue[] = [];
    normalizeConnectionOrder(state, warnings);
    expect(ordersOf(state)).toEqual([5]); // group size < 2 → skipped
    expect(warnings).toHaveLength(0);
  });

  it('normalizes each fan-in group independently', () => {
    // Two separate sinks; only the broken one is repacked.
    const state = {
      edges: [
        {
          id: 'a0',
          source: 'p',
          sourceHandle: 'o',
          target: 't1',
          targetHandle: 'in',
          data: { order: 0 },
        },
        {
          id: 'a1',
          source: 'q',
          sourceHandle: 'o',
          target: 't1',
          targetHandle: 'in',
          data: { order: 1 },
        },
        {
          id: 'b0',
          source: 'p',
          sourceHandle: 'o',
          target: 't2',
          targetHandle: 'in',
          data: { order: 9 },
        },
        {
          id: 'b1',
          source: 'q',
          sourceHandle: 'o',
          target: 't2',
          targetHandle: 'in',
          data: { order: 3 },
        },
      ],
    } as Record<string, unknown>;
    const warnings: ValidationIssue[] = [];
    normalizeConnectionOrder(state, warnings);
    // t1 already canonical → untouched; t2 {9,3} → {1,0}.
    expect(ordersOf(state)).toEqual([0, 1, 1, 0]);
    expect(warnings).toHaveLength(1);
  });
});
