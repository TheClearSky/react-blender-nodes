import { describe, it, expect } from 'vitest';
import {
  coerceUserZones,
  normalizeUserZones,
} from '@/utils/importExport/validation';
import type { ValidationIssue } from '@/utils/importExport/types';

// coerceUserZones / normalizeUserZones mutate a plain state object in place. They
// are the import-repair layer for the authored, visual-only `userZones` field, so
// they operate on untyped `Record<string, unknown>` (a hand-edited / version-skewed
// file). Tested directly (they are not on any public barrel).

type Loose = Record<string, unknown>;
const zone = (z: Partial<Loose> & { nodeIds: unknown }) => z as Loose;

describe('coerceUserZones', () => {
  it('forces zone.id to equal its map key (no soft-locked, uneditable zones)', () => {
    const state: Loose = {
      userZones: {
        keyA: zone({
          id: 'keyB',
          name: 'Z',
          color: '#60a5fa',
          nodeIds: ['n1'],
        }),
      },
    };
    coerceUserZones(state, []);
    expect((state.userZones as Loose).keyA).toMatchObject({ id: 'keyA' });
  });

  it('dedupes nodeIds and drops non-string ids', () => {
    const state: Loose = {
      userZones: {
        z: zone({
          id: 'z',
          name: 'Z',
          color: '#60a5fa',
          nodeIds: ['n1', 'n1', 5, 'n2'],
        }),
      },
    };
    coerceUserZones(state, []);
    expect((state.userZones as Loose).z).toMatchObject({
      nodeIds: ['n1', 'n2'],
    });
  });

  it('drops a zone left with no members (an authored zone always has ≥1)', () => {
    const state: Loose = {
      userZones: {
        empty: zone({ id: 'empty', name: 'Z', color: '#60a5fa', nodeIds: [] }),
      },
    };
    coerceUserZones(state, []);
    expect(state.userZones).toEqual({});
  });

  it('strips system-only fields and forces enforced:false', () => {
    const state: Loose = {
      userZones: {
        z: zone({
          id: 'z',
          name: 'Z',
          color: '#60a5fa',
          nodeIds: ['n1'],
          enforced: true,
          boundaryHandles: { h: {} },
          structureLink: { structureType: 'switch' },
        }),
      },
    };
    coerceUserZones(state, []);
    const z = (state.userZones as Loose).z as Loose;
    expect(z.enforced).toBe(false);
    expect(z.boundaryHandles).toBeUndefined();
    expect(z.structureLink).toBeUndefined();
  });

  it('canonicalizes a valid color to lowercase hex; defaults an unparseable one', () => {
    const state: Loose = {
      userZones: {
        upper: zone({
          id: 'upper',
          name: 'Z',
          color: '#A3E635',
          nodeIds: ['n1'],
        }),
        bad: zone({ id: 'bad', name: 'Z', color: 'garbage', nodeIds: ['n2'] }),
      },
    };
    coerceUserZones(state, []);
    expect((state.userZones as Loose).upper).toMatchObject({
      color: '#a3e635',
    });
    expect((state.userZones as Loose).bad).toMatchObject({ color: '#888888' });
  });

  it('coerces subtree userZones too (id, dedupe)', () => {
    const state: Loose = {
      typeOfNodes: {
        g: {
          subtree: {
            userZones: {
              k: zone({
                id: 'WRONG',
                name: 'Z',
                color: '#60a5fa',
                nodeIds: ['s1', 's1'],
              }),
            },
          },
        },
      },
    };
    coerceUserZones(state, []);
    const k = ((state.typeOfNodes as Loose).g as Loose).subtree as Loose;
    expect((k.userZones as Loose).k).toMatchObject({
      id: 'k',
      nodeIds: ['s1'],
    });
  });

  it('leaves an absent userZones untouched (backward compat: no field, no warning)', () => {
    const state: Loose = { nodes: [] };
    const warnings: ValidationIssue[] = [];
    coerceUserZones(state, warnings);
    expect('userZones' in state).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it('is idempotent (coercing already-clean state changes nothing)', () => {
    const state: Loose = {
      userZones: {
        z: zone({ id: 'z', name: 'Z', color: '#60a5fa', nodeIds: ['n1'] }),
      },
    };
    coerceUserZones(state, []);
    const first = JSON.parse(JSON.stringify(state.userZones));
    coerceUserZones(state, []);
    expect(state.userZones).toEqual(first);
  });
});

describe('normalizeUserZones (ghost-id prune, per-container)', () => {
  it('prunes root member ids not in root nodes; keeps the real ones', () => {
    const state: Loose = {
      nodes: [{ id: 'n1' }],
      userZones: {
        z: zone({
          id: 'z',
          name: 'Z',
          color: '#60a5fa',
          nodeIds: ['n1', 'ghost'],
        }),
      },
    };
    normalizeUserZones(state, []);
    expect((state.userZones as Loose).z).toMatchObject({ nodeIds: ['n1'] });
  });

  it('prunes SUBTREE members against subtree.nodes, NOT root (guards silent subtree data loss)', () => {
    const state: Loose = {
      nodes: [{ id: 'root1' }], // root nodes are DISJOINT from subtree nodes
      typeOfNodes: {
        g: {
          subtree: {
            nodes: [{ id: 's1' }],
            userZones: {
              z: zone({
                id: 'z',
                name: 'Z',
                color: '#60a5fa',
                nodeIds: ['s1', 'ghost'],
              }),
            },
          },
        },
      },
    };
    normalizeUserZones(state, []);
    // 's1' survives ONLY if the subtree prune uses subtree.nodes; reusing the root
    // set would classify 's1' as a ghost and drop the whole subtree zone.
    const sub = ((state.typeOfNodes as Loose).g as Loose).subtree as Loose;
    expect((sub.userZones as Loose).z).toMatchObject({ nodeIds: ['s1'] });
  });

  it('drops a zone whose members are all ghosts', () => {
    const state: Loose = {
      nodes: [],
      userZones: {
        z: zone({ id: 'z', name: 'Z', color: '#60a5fa', nodeIds: ['ghost'] }),
      },
    };
    normalizeUserZones(state, []);
    expect(state.userZones).toEqual({});
  });

  it('is a no-op (no warning) when every member is real', () => {
    const state: Loose = {
      nodes: [{ id: 'n1' }],
      userZones: {
        z: zone({ id: 'z', name: 'Z', color: '#60a5fa', nodeIds: ['n1'] }),
      },
    };
    const warnings: ValidationIssue[] = [];
    normalizeUserZones(state, warnings);
    expect((state.userZones as Loose).z).toMatchObject({ nodeIds: ['n1'] });
    expect(warnings).toHaveLength(0);
  });
});
