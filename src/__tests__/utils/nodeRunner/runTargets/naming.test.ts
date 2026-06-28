import { describe, expect, it } from 'vitest';
import { createNameRegistry } from '@/utils/nodeRunner/runTargets/codegen/nameRegistry';

describe('codegen NameRegistry', () => {
  it('derives camelCase node + Pascal handle names', () => {
    const registry = createNameRegistry();
    expect(
      registry.nameFor('a:1', { nodeLabel: 'Bit Input', handleName: 'Out' }),
    ).toBe('bitInputOut');
    expect(
      registry.nameFor('b:1', { nodeLabel: 'Add', handleName: 'Sum' }),
    ).toBe('addSum');
    // all-caps acronyms lowercase cleanly instead of mangling ("aNDGateOut")
    expect(
      registry.nameFor('c:1', { nodeLabel: 'AND Gate', handleName: 'Out' }),
    ).toBe('andGateOut');
    expect(
      registry.nameFor('d:1', { nodeLabel: 'XOR Gate', handleName: 'Out' }),
    ).toBe('xorGateOut');
  });

  it('is stable: the same key always returns the same name', () => {
    const registry = createNameRegistry();
    const first = registry.nameFor('a:1', {
      nodeLabel: 'Add',
      handleName: 'Sum',
    });
    const second = registry.nameFor('a:1', {
      nodeLabel: 'Ignored',
      handleName: 'Ignored',
    });
    expect(second).toBe(first);
  });

  it('dedupes colliding bases with numeric suffixes', () => {
    const registry = createNameRegistry();
    const hint = { nodeLabel: 'Add', handleName: 'Sum' };
    expect(registry.nameFor('a:1', hint)).toBe('addSum');
    expect(registry.nameFor('b:1', hint)).toBe('addSum2');
    expect(registry.nameFor('c:1', hint)).toBe('addSum3');
  });

  it('never collides with reserved scaffolding / keyword names', () => {
    const registry = createNameRegistry();
    // derives to "out" (reserved) → must be suffixed away
    expect(registry.nameFor('a:1', { nodeLabel: '', handleName: 'Out' })).toBe(
      'out2',
    );
    // derives to "values" (reserved)
    expect(
      registry.nameFor('b:1', { nodeLabel: '', handleName: 'Values' }),
    ).toBe('values2');
  });

  it('sanitizes leading digits and symbols into valid identifiers', () => {
    const registry = createNameRegistry();
    expect(
      registry.nameFor('a:1', { nodeLabel: '2D Vector', handleName: 'X' }),
    ).toBe('v2dVectorX');
    expect(
      registry.nameFor('b:1', { nodeLabel: 'Foo-Bar!', handleName: 'Out #1' }),
    ).toBe('fooBarOut1');
  });

  it('falls back to a generic base when there is nothing to derive', () => {
    const registry = createNameRegistry();
    expect(registry.nameFor('a:1', { nodeLabel: '', handleName: '' })).toBe(
      'value',
    );
  });

  it('exposes registration order and existing lookups', () => {
    const registry = createNameRegistry();
    expect(registry.existing('a:1')).toBeNull();
    registry.nameFor('a:1', { nodeLabel: 'Add', handleName: 'Sum' });
    registry.nameFor('b:1', { nodeLabel: 'Bit Input', handleName: 'Out' });
    expect(registry.existing('a:1')).toBe('addSum');
    expect(registry.entries().map((entry) => entry.scopedKey)).toEqual([
      'a:1',
      'b:1',
    ]);
    expect(registry.entries().map((entry) => entry.name)).toEqual([
      'addSum',
      'bitInputOut',
    ]);
  });

  it('reserve() takes a name without adding it to entries(), steering derivation off it', () => {
    const registry = createNameRegistry();
    registry.reserve('readInput');
    // a reserved scaffolding name is NOT a value-store slot — it stays out of entries()
    expect(registry.entries()).toEqual([]);
    // a key whose derived base collides with the reserved name is suffixed away
    expect(
      registry.nameFor('a:1', { nodeLabel: '', handleName: 'readInput' }),
    ).toBe('readInput2');
    // and the real derived slot DOES appear in entries()
    expect(registry.entries().map((entry) => entry.name)).toEqual([
      'readInput2',
    ]);
  });
});
