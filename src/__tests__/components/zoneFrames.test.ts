import { describe, it, expect } from 'vitest';
import { computeZoneFrames } from '@/components/molecules/ZoneFrameOverlay/useZoneFrames';
import type { Zone } from '@/utils/nodeStateManagement/zones/types';

type N = {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
};

function node(id: string, x: number, y: number): N {
  return { id, position: { x, y }, measured: { width: 100, height: 50 } };
}
function userZone(
  id: string,
  nodeIds: string[],
  extra: Partial<Zone> = {},
): Zone {
  return {
    id,
    name: 'Z',
    color: '#60a5fa',
    nodeIds,
    enforced: false,
    ...extra,
  } as Zone;
}

describe('computeZoneFrames', () => {
  it('produces a hull frame for a multi-node user zone (name + color + ≥3 points)', () => {
    const frames = computeZoneFrames(
      { z1: userZone('z1', ['a', 'b'], { name: 'Group', color: '#ff0000' }) },
      [node('a', 0, 0), node('b', 300, 200)],
    );
    expect(frames).toHaveLength(1);
    expect(frames[0].name).toBe('Group');
    expect(frames[0].color).toBe('#ff0000');
    expect(frames[0].points.split(' ').length).toBeGreaterThanOrEqual(3);
  });

  it('renders a single-node user zone (a 1-node selection is never invisible)', () => {
    const frames = computeZoneFrames({ z1: userZone('z1', ['a']) }, [
      node('a', 10, 10),
    ]);
    expect(frames).toHaveLength(1);
    expect(frames[0].points.split(' ').length).toBeGreaterThanOrEqual(3);
  });

  it('skips zones with no members or only missing members', () => {
    const frames = computeZoneFrames(
      { empty: userZone('empty', []), ghost: userZone('ghost', ['nope']) },
      [node('a', 0, 0)],
    );
    expect(frames).toHaveLength(0);
  });

  it('defensively skips a malformed zone (non-array nodeIds)', () => {
    const frames = computeZoneFrames(
      {
        bad: {
          id: 'bad',
          name: 'X',
          color: '#000',
          nodeIds: 'oops',
          enforced: false,
        } as unknown as Zone,
      },
      [node('a', 0, 0)],
    );
    expect(frames).toHaveLength(0);
  });

  it('coerces a non-string name/color to safe defaults', () => {
    const frames = computeZoneFrames(
      {
        z1: {
          id: 'z1',
          name: 42,
          color: {},
          nodeIds: ['a'],
          enforced: false,
        } as unknown as Zone,
      },
      [node('a', 0, 0)],
    );
    expect(frames).toHaveLength(1);
    expect(frames[0].name).toBe('Zone');
    expect(frames[0].color).toBe('#888888');
  });
});
