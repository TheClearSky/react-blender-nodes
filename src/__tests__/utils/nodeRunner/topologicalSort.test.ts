import { describe, it, expect } from 'vitest';
import { topologicalSortWithLevels } from '@/utils/nodeRunner/topologicalSort';

function adjacency(
  entries: Array<[string, string[]]>,
): Map<string, Set<string>> {
  return new Map(entries.map(([k, v]) => [k, new Set(v)]));
}

describe('nodeRunner/topologicalSortWithLevels', () => {
  it('returns no levels for an empty node set', () => {
    expect(topologicalSortWithLevels([], new Map(), new Map())).toEqual([]);
  });

  it('puts independent nodes (no edges) into a single concurrency level', () => {
    const levels = topologicalSortWithLevels(
      ['a', 'b', 'c'],
      new Map(),
      new Map(),
    );
    expect(levels).toHaveLength(1);
    expect([...levels[0]].sort()).toEqual(['a', 'b', 'c']);
  });

  it('orders a linear chain a→b→c into three sequential levels', () => {
    const forward = adjacency([
      ['a', ['b']],
      ['b', ['c']],
    ]);
    const reverse = adjacency([
      ['b', ['a']],
      ['c', ['b']],
    ]);
    const levels = topologicalSortWithLevels(['a', 'b', 'c'], forward, reverse);
    expect(levels.map((l) => [...l])).toEqual([['a'], ['b'], ['c']]);
  });

  it('groups a diamond a→{b,c}→d so b and c share the middle level', () => {
    const forward = adjacency([
      ['a', ['b', 'c']],
      ['b', ['d']],
      ['c', ['d']],
    ]);
    const reverse = adjacency([
      ['b', ['a']],
      ['c', ['a']],
      ['d', ['b', 'c']],
    ]);
    const levels = topologicalSortWithLevels(
      ['a', 'b', 'c', 'd'],
      forward,
      reverse,
    );
    expect(levels.map((l) => [...l].sort())).toEqual([
      ['a'],
      ['b', 'c'],
      ['d'],
    ]);
  });

  it('throws when the graph contains a cycle', () => {
    const forward = adjacency([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const reverse = adjacency([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    expect(() =>
      topologicalSortWithLevels(['a', 'b'], forward, reverse),
    ).toThrow(/cycle/i);
  });

  it('throws a structured GraphError (not a bare Error) listing the cycle nodes', () => {
    const forward = adjacency([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const reverse = adjacency([
      ['a', ['b']],
      ['b', ['a']],
    ]);

    let thrown: unknown;
    try {
      topologicalSortWithLevels(['a', 'b'], forward, reverse);
    } catch (error) {
      thrown = error;
    }

    // A structured GraphError is a plain object (not an Error subclass) with
    // nodeId / message / path / timestamp — the shape the engine boundary
    // recognizes (see executionHelpers isGraphError check).
    expect(thrown).not.toBeInstanceOf(Error);
    expect(thrown).toMatchObject({
      nodeId: 'a',
      nodeTypeId: 'cycle',
      nodeTypeName: 'Cycle',
    });
    const graphError = thrown as {
      message: string;
      timestamp: number;
      path: ReadonlyArray<{ nodeId: string }>;
    };
    expect(graphError.message).toMatch(/cycle/i);
    expect(typeof graphError.timestamp).toBe('number');
    expect(graphError.path.map((entry) => entry.nodeId).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('ignores edges that point to nodes outside the provided set', () => {
    // b also points at external 'z' which is not part of nodeIds.
    const forward = adjacency([
      ['a', ['b']],
      ['b', ['z']],
    ]);
    const reverse = adjacency([['b', ['a']]]);
    const levels = topologicalSortWithLevels(['a', 'b'], forward, reverse);
    expect(levels.map((l) => [...l])).toEqual([['a'], ['b']]);
  });
});
