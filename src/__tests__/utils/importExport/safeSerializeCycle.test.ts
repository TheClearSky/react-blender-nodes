import { describe, it, expect } from 'vitest';
import { safeSerializeValue } from '@/utils/importExport/serialization';

describe('importExport/safeSerializeValue — cycle handling (SEC-3)', () => {
  it('serializes a self-referential object as [Circular] without throwing', () => {
    const o: Record<string, unknown> = { a: 1 };
    o.self = o;
    const result = safeSerializeValue(o) as Record<string, unknown>;
    expect(result.a).toBe(1);
    expect(result.self).toBe('[Circular]');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('handles cycles through arrays and maps', () => {
    const arr: unknown[] = [1];
    arr.push(arr);
    const arrResult = safeSerializeValue(arr) as unknown[];
    expect(arrResult[0]).toBe(1);
    expect(arrResult[1]).toBe('[Circular]');

    const map = new Map<string, unknown>();
    map.set('self', map);
    const mapResult = safeSerializeValue(map) as Record<string, unknown>;
    expect(mapResult.self).toBe('[Circular]');
  });

  it('serializes a shared (non-cyclic) reference fully on both branches', () => {
    const shared = { x: 1 };
    const container = { a: shared, b: shared };
    const result = safeSerializeValue(container) as {
      a: { x: number };
      b: { x: number };
    };
    // A DAG (same object referenced twice) is NOT a cycle — both must serialize.
    expect(result.a.x).toBe(1);
    expect(result.b.x).toBe(1);
  });
});
