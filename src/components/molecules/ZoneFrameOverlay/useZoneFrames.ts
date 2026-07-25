import type { Zone } from '@/utils/nodeStateManagement/zones/types';
import { computePaddedHull } from './convexHull';

type NodeRect = {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
};

type ZoneFrame = {
  id: string;
  name: string;
  color: string;
  /** SVG polygon points string, in GRAPH coordinates. */
  points: string;
  /** Label anchor (graph coordinates) at the hull's top-left. */
  labelX: number;
  labelY: number;
};

/**
 * Pure geometry: the per-zone frame (padded convex hull + label anchor) for every
 * renderable zone, in GRAPH coordinates. Skips empty/malformed zones (defensive
 * against a programmatic REPLACE_STATE that bypassed the import coerce) and falls
 * back to a bounding box when the hull degenerates (collinear / coincident
 * members), so a user zone is never invisible. Extracted from the hook so it is
 * unit-testable without a React renderer.
 */
function computeZoneFrames(
  zones: Record<string, Zone> | undefined,
  nodes: ReadonlyArray<NodeRect>,
): ZoneFrame[] {
  if (!zones) return [];

  const nodeMap = new Map<string, NodeRect>();
  for (const node of nodes) nodeMap.set(node.id, node);

  const frames: ZoneFrame[] = [];
  for (const zone of Object.values(zones)) {
    if (!Array.isArray(zone.nodeIds) || zone.nodeIds.length === 0) continue;

    const rects: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    for (const nodeId of zone.nodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      rects.push({
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width ?? 180,
        height: node.measured?.height ?? 60,
      });
    }
    if (rects.length === 0) continue;

    let hull = computePaddedHull(rects, 24);
    if (hull.length < 3) {
      const pad = 24;
      const minX = Math.min(...rects.map((r) => r.x)) - pad;
      const minY = Math.min(...rects.map((r) => r.y)) - pad;
      const maxX = Math.max(...rects.map((r) => r.x + r.width)) + pad;
      const maxY = Math.max(...rects.map((r) => r.y + r.height)) + pad;
      hull = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];
    }

    const topLeft = hull.reduce(
      (best, p) =>
        p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best,
      hull[0],
    );

    frames.push({
      id: zone.id,
      name: typeof zone.name === 'string' ? zone.name : 'Zone',
      color: typeof zone.color === 'string' ? zone.color : '#888888',
      points: hull.map((p) => `${p.x},${p.y}`).join(' '),
      labelX: topLeft.x + 4,
      labelY: topLeft.y - 6,
    });
  }

  return frames;
}

export { computeZoneFrames };
export type { ZoneFrame, NodeRect };
