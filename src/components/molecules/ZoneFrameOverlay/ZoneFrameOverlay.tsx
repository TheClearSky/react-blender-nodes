import { useStore } from '@xyflow/react';
import type { ZoneFrame } from './useZoneFrames';

type ZoneFrameOverlayProps = {
  /** Precomputed frames (system ∪ user) from FullGraph's shared memo. */
  frames: ZoneFrame[];
  /**
   * IDs of USER zones. Their dashed polygon is still drawn here, but their LABEL
   * is suppressed — the interactive `UserZoneLabelLayer` renders editable labels
   * for user zones instead (rename / recolor / delete).
   */
  userZoneIds?: Set<string>;
};

function ZoneFrameOverlay({ frames, userZoneIds }: ZoneFrameOverlayProps) {
  // R2: without an equality fn the fresh `{x,y,zoom}` literal makes this overlay
  // reconcile on EVERY ReactFlow store tick (drag, select, hover, dimensions),
  // not just when the transform changes. Compare the three scalars instead.
  const viewport = useStore(
    (s) => ({ x: s.transform[0], y: s.transform[1], zoom: s.transform[2] }),
    (a, b) => a.x === b.x && a.y === b.y && a.zoom === b.zoom,
  );

  if (frames.length === 0) return null;

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
        {frames.map((frame) => (
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
            {/* User-zone labels are rendered (and edited) by UserZoneLabelLayer. */}
            {!userZoneIds?.has(frame.id) && (
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
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}

export { ZoneFrameOverlay };
export type { ZoneFrameOverlayProps };
