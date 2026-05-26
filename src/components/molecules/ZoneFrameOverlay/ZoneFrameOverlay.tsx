import { useMemo } from 'react';
import { useStore } from '@xyflow/react';
import type { Zone } from '@/utils/nodeStateManagement/zones/types';
import { computePaddedHull } from './convexHull';

type NodeRect = {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
};

type ZoneFrameOverlayProps = {
  zones: Record<string, Zone> | undefined;
  nodes: ReadonlyArray<NodeRect>;
};

function ZoneFrameOverlay({ zones, nodes }: ZoneFrameOverlayProps) {
  const viewport = useStore((s) => ({
    x: s.transform[0],
    y: s.transform[1],
    zoom: s.transform[2],
  }));

  const zoneFrames = useMemo(() => {
    if (!zones) return [];

    const nodeMap = new Map<string, NodeRect>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    const frames: Array<{
      id: string;
      name: string;
      color: string;
      points: string;
      labelX: number;
      labelY: number;
    }> = [];

    for (const zone of Object.values(zones)) {
      if (zone.nodeIds.length === 0) continue;

      const rects: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
      }> = [];
      for (const nodeId of zone.nodeIds) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;
        const width = node.measured?.width ?? 180;
        const height = node.measured?.height ?? 60;
        rects.push({
          x: node.position.x,
          y: node.position.y,
          width,
          height,
        });
      }

      if (rects.length === 0) continue;

      const hull = computePaddedHull(rects, 24);
      if (hull.length < 3) continue;

      const pointsStr = hull.map((p) => `${p.x},${p.y}`).join(' ');
      const topLeft = hull.reduce(
        (best, p) =>
          p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best,
        hull[0],
      );

      frames.push({
        id: zone.id,
        name: zone.name,
        color: zone.color,
        points: pointsStr,
        labelX: topLeft.x + 4,
        labelY: topLeft.y - 6,
      });
    }

    return frames;
  }, [zones, nodes]);

  if (zoneFrames.length === 0) return null;

  return (
    <svg
      className='react-flow__zone-overlay'
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <g
        transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}
      >
        {zoneFrames.map((frame) => (
          <g key={frame.id}>
            <polygon
              points={frame.points}
              fill={frame.color}
              fillOpacity={0.1}
              stroke={frame.color}
              strokeOpacity={0.5}
              strokeWidth={2 / viewport.zoom}
              strokeDasharray={`${8 / viewport.zoom},${4 / viewport.zoom}`}
              strokeLinejoin='round'
            />
            <text
              x={frame.labelX}
              y={frame.labelY}
              fill={frame.color}
              fontSize={12 / viewport.zoom}
              fontFamily='Inter, system-ui, sans-serif'
              fontWeight={600}
              opacity={0.85}
            >
              {frame.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export { ZoneFrameOverlay };
export type { ZoneFrameOverlayProps };
