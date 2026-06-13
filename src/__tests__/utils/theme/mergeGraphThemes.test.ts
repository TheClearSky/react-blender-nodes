import { describe, it, expect, vi } from 'vitest';
import type { GraphTheme } from '@/utils/theme';
import {
  mergeGraphThemes,
  resolveGraphTheme,
  graphThemePresets,
  lightGraphTheme,
} from '@/utils/theme';

describe('theme/mergeGraphThemes', () => {
  it('merges nested sections recursively, overrides winning per slot', () => {
    const base: GraphTheme = {
      node: { header: 'bg-zinc-200', body: 'bg-zinc-100' },
      root: 'bg-white',
    };
    const overrides: GraphTheme = {
      node: { header: 'bg-red-500' },
    };

    const merged = mergeGraphThemes(base, overrides);

    expect(merged).toEqual({
      node: { header: 'bg-red-500', body: 'bg-zinc-100' },
      root: 'bg-white',
    });
  });

  it('keeps base values when override values are undefined', () => {
    const base: GraphTheme = {
      root: 'bg-white',
      node: { body: 'bg-zinc-100' },
    };
    const overrides: GraphTheme = {
      root: undefined,
      node: { body: undefined },
    };

    expect(mergeGraphThemes(base, overrides)).toEqual({
      root: 'bg-white',
      node: { body: 'bg-zinc-100' },
    });
  });

  it('REPLACES the base with null override values (unlike undefined)', () => {
    const base: GraphTheme = {
      root: 'bg-white',
      node: { body: 'bg-zinc-100' },
    };
    const overrides = { root: null } as unknown as GraphTheme;

    const merged = mergeGraphThemes(base, overrides);

    expect(merged.root).toBeNull();
    expect(merged.node).toEqual({ body: 'bg-zinc-100' });
  });

  it('REPLACES arrays instead of merging them index-wise', () => {
    const base: GraphTheme = {
      reactFlow: { background: { gap: [20, 20] } },
    };
    const overrides: GraphTheme = {
      reactFlow: { background: { gap: 8 } },
    };
    const overridesWithTuple: GraphTheme = {
      reactFlow: { background: { gap: [4, 12] } },
    };

    expect(mergeGraphThemes(base, overrides).reactFlow?.background?.gap).toBe(
      8,
    );
    expect(
      mergeGraphThemes(base, overridesWithTuple).reactFlow?.background?.gap,
    ).toEqual([4, 12]);
  });

  it('REPLACES non-plain objects (e.g. Date) instead of merging them into {}', () => {
    const nonPlainValue = new Date(0);
    const base = { node: { body: 'bg-zinc-100' } } as GraphTheme;
    const overrides = { node: nonPlainValue } as unknown as GraphTheme;

    const merged = mergeGraphThemes(base, overrides) as unknown as {
      node: unknown;
    };

    expect(merged.node).toBe(nonPlainValue);
  });

  it('ignores __proto__/constructor/prototype override keys (JSON-sourced themes)', () => {
    const hostileOverrides = JSON.parse(
      '{"__proto__":{"root":"evil-class"},"node":{"body":"bg-zinc-50"}}',
    ) as GraphTheme;

    const merged = mergeGraphThemes({}, hostileOverrides);

    expect(merged.root).toBeUndefined();
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(merged.node).toEqual({ body: 'bg-zinc-50' });
  });

  it('throws on circular override structures instead of overflowing the stack', () => {
    const selfReferencingNode: Record<string, unknown> = {};
    selfReferencingNode.self = selfReferencingNode;
    const base = { node: { self: {} } } as unknown as GraphTheme;
    const overrides = { node: selfReferencingNode } as unknown as GraphTheme;

    expect(() => mergeGraphThemes(base, overrides)).toThrow(/circular/);
  });

  it('does not mutate either input', () => {
    const base: GraphTheme = { node: { header: 'a' } };
    const overrides: GraphTheme = { node: { body: 'b' } };

    mergeGraphThemes(base, overrides);

    expect(base).toEqual({ node: { header: 'a' } });
    expect(overrides).toEqual({ node: { body: 'b' } });
  });

  it('returns a copy of base when no overrides are given', () => {
    const base: GraphTheme = { root: 'bg-white' };
    const merged = mergeGraphThemes(base);

    expect(merged).toEqual(base);
    expect(merged).not.toBe(base);
  });
});

describe('theme/resolveGraphTheme', () => {
  it('defaults to the blenderDark preset (empty — defaults are the preset)', () => {
    expect(resolveGraphTheme()).toEqual({});
    expect(graphThemePresets.blenderDark).toEqual({});
  });

  it('deep-merges consumer overrides over the named preset', () => {
    const resolved = resolveGraphTheme('blenderDark', {
      node: { header: 'rounded-none' },
    });

    expect(resolved.node?.header).toBe('rounded-none');
  });

  it('aliases untouched preset sections by reference (zero-copy by design)', () => {
    const resolved = resolveGraphTheme('light', {
      node: { body: 'bg-zinc-50' },
    });

    // Untouched sections share the preset object; overridden ones are fresh.
    expect(resolved.timeline).toBe(graphThemePresets.light.timeline);
    expect(resolved.node).not.toBe(graphThemePresets.light.node);
  });

  it('deep-freezes the presets so mutating a resolved theme throws instead of corrupting them', () => {
    const resolved = resolveGraphTheme('light');

    expect(Object.isFrozen(lightGraphTheme)).toBe(true);
    expect(Object.isFrozen(lightGraphTheme.timeline)).toBe(true);
    expect(() => {
      (resolved.timeline as { container?: string }).container = 'MUTATED';
    }).toThrow(TypeError);
    expect(graphThemePresets.light.timeline?.container).not.toBe('MUTATED');
  });

  it('never mutates the preset objects', () => {
    const lightRootBeforeResolve = graphThemePresets.light.root;
    const lightNodeBeforeResolve = graphThemePresets.light.node;

    resolveGraphTheme('light', {
      root: 'bg-white',
      node: { body: 'bg-zinc-50' },
    });

    expect(graphThemePresets.light.root).toBe(lightRootBeforeResolve);
    expect(graphThemePresets.light.node).toBe(lightNodeBeforeResolve);
  });

  it('warns and falls back to blenderDark on unknown preset names (JS consumers)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = resolveGraphTheme('lihgt' as never, { root: 'bg-white' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      "Unknown theme preset 'lihgt'",
    );
    expect(resolved.root).toBe('bg-white');
    warnSpy.mockRestore();
  });
});
