import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { cloneDeepPreservingNonPlainObjects } from '@/utils/nodeStateManagement/cloneDeepPreservingNonPlainObjects';

describe('cloneDeepPreservingNonPlainObjects', () => {
  it('deep-copies plain objects/arrays into a fresh mutable tree', () => {
    const original = { a: 1, nested: { b: [2, 3] } };
    const copy = cloneDeepPreservingNonPlainObjects(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.nested).not.toBe(original.nested);
    expect(copy.nested.b).not.toBe(original.nested.b);
    // Mutable — the whole reason the ADD_EDGE apply path clones frozen data.
    copy.nested.b.push(4);
    expect(original.nested.b).toEqual([2, 3]);
  });

  it('passes functions and class instances (zod schemas) BY REFERENCE', () => {
    const schema = z.custom<unknown>(() => true);
    const fn = () => 42;
    const original = { schema, fn, dataTypeObject: { complexSchema: schema } };
    const copy = cloneDeepPreservingNonPlainObjects(original);
    // Identity preserved — edge validation compares schema references.
    expect(copy.schema).toBe(schema);
    expect(copy.fn).toBe(fn);
    expect(copy.dataTypeObject.complexSchema).toBe(schema);
    // …while the plain wrapper around the schema is still a fresh copy.
    expect(copy.dataTypeObject).not.toBe(original.dataTypeObject);
  });

  it('is cycle-safe (self-referential plain data) instead of overflowing', () => {
    const cyclic: Record<string, unknown> = { name: 'node' };
    cyclic.self = cyclic;
    cyclic.list = [cyclic];
    let copy: Record<string, unknown> = {};
    expect(() => {
      copy = cloneDeepPreservingNonPlainObjects(cyclic);
    }).not.toThrow();
    // The cycle is reconstructed with the SAME copy object, not duplicated.
    expect(copy.self).toBe(copy);
    expect((copy.list as unknown[])[0]).toBe(copy);
    expect(copy).not.toBe(cyclic);
  });

  it('de-duplicates shared plain subtrees (like structuredClone did)', () => {
    const shared = { v: 1 };
    const original = { left: shared, right: shared };
    const copy = cloneDeepPreservingNonPlainObjects(original);
    expect(copy.left).toBe(copy.right); // one shared copy, not two
    expect(copy.left).not.toBe(shared);
  });

  it('handles an own `__proto__` key without triggering the prototype setter', () => {
    // JSON.parse produces an OWN enumerable `__proto__` data property — the
    // shape an imported/replaced state can carry.
    const malicious = JSON.parse(
      '{"__proto__": {"polluted": true}, "safe": 1}',
    );
    const copy = cloneDeepPreservingNonPlainObjects(malicious);
    // The copy keeps its normal Object.prototype (not re-parented) and no
    // global pollution occurs.
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(
      (Object.prototype as unknown as { polluted?: boolean }).polluted,
    ).toBeUndefined();
    expect(copy.safe).toBe(1);
    // The __proto__ key survives as an own data property, not as the prototype.
    expect(Object.prototype.hasOwnProperty.call(copy, '__proto__')).toBe(true);
  });

  it('passes null-prototype objects BY REFERENCE (no re-parenting)', () => {
    const nullProto = Object.create(null) as Record<string, unknown>;
    nullProto.k = 'v';
    const original = { wrapped: nullProto };
    const copy = cloneDeepPreservingNonPlainObjects(original);
    expect(copy.wrapped).toBe(nullProto); // by reference
    expect(Object.getPrototypeOf(copy.wrapped)).toBeNull(); // unchanged
  });

  it('copies own enumerable symbol-keyed properties', () => {
    const marker = Symbol('marker');
    const original: Record<string | symbol, unknown> = { a: 1, [marker]: 2 };
    const copy = cloneDeepPreservingNonPlainObjects(original);
    expect(copy[marker]).toBe(2);
    expect(copy.a).toBe(1);
  });

  it('returns primitives, null, and undefined unchanged', () => {
    expect(cloneDeepPreservingNonPlainObjects(5)).toBe(5);
    expect(cloneDeepPreservingNonPlainObjects('x')).toBe('x');
    expect(cloneDeepPreservingNonPlainObjects(null)).toBe(null);
    expect(cloneDeepPreservingNonPlainObjects(undefined)).toBe(undefined);
  });
});
