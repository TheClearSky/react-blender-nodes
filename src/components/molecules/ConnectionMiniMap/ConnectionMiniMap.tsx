import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import { ConfigurableNodeReactFlowWrapper } from '@/components';
import { ConfigurableEdge } from '@/components/atoms/ConfigurableEdge/ConfigurableEdge';
import type { ConnectionNeighborhood } from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';

// Reuse the real renderers so the preview is visually identical to the canvas.
const nodeTypes = { configurableNode: ConfigurableNodeReactFlowWrapper };
const edgeTypes = { configurableEdge: ConfigurableEdge };

type ConnectionMiniMapProps = {
  neighborhood: ConnectionNeighborhood;
  /** px number, or a CSS length like '100%' so the map can fill its container. */
  height?: number | string;
  highlightColor?: string;
};

/**
 * Inline read-only mini-map of one connection's neighbourhood. It renders the
 * REAL node/edge components in an isolated ReactFlow so it matches the canvas
 * exactly. Pan and zoom are ENABLED so it's an explorable viewport — those only
 * move the mini-map's own camera and never touch graph state. The NODES carry
 * `pointer-events: none` (so their inputs can't fire a dispatch, and a drag
 * passes through to the pane to pan), and node drag/connect/select are off, so
 * the preview can never mutate the graph. It reads `FullGraphContext` (available
 * because it mounts inside FullGraph) only for shared config like data types.
 */
function ConnectionMiniMap({
  neighborhood,
  height = 170,
  highlightColor = '#ef4444',
}: ConnectionMiniMapProps) {
  const nodes = useMemo<Node[]>(
    () =>
      neighborhood.nodes.map((node) => ({
        ...node,
        selected: false,
        dragging: false,
        draggable: false,
        selectable: false,
        connectable: false,
        // Block interaction with the node + its inputs (so nothing dispatches);
        // pointer events pass through to the pane so panning still works.
        style: { ...(node.style ?? {}), pointerEvents: 'none' as const },
      })),
    [neighborhood],
  );

  const highlightIds = useMemo(
    () =>
      new Set(
        neighborhood.highlightEdgeIds ??
          (neighborhood.highlightEdgeId ? [neighborhood.highlightEdgeId] : []),
      ),
    [neighborhood],
  );

  const edges = useMemo<Edge[]>(
    () =>
      neighborhood.edges.map((edge) =>
        highlightIds.has(edge.id)
          ? {
              ...edge,
              selected: true,
              animated: true,
              style: {
                ...(edge.style ?? {}),
                stroke: highlightColor,
                strokeWidth: 2,
              },
            }
          : { ...edge, selected: false },
      ),
    [neighborhood, highlightColor, highlightIds],
  );

  // ReactFlow measures node + handle bounds on mount. If the container is still
  // animating (e.g. a modal's zoom-in scale transform), those bounds get captured
  // at the wrong scale and are never corrected, so edges render off the handles.
  // Wait until the container's on-screen box is stable, then mount the flow so its
  // first (and only) measurement happens at the final scale.
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let frame = 0;
    let frames = 0;
    let stableFrames = 0;
    let previous = element.getBoundingClientRect();
    const tick = () => {
      const rect = element.getBoundingClientRect();
      const moved =
        Math.abs(rect.width - previous.width) > 0.5 ||
        Math.abs(rect.height - previous.height) > 0.5 ||
        Math.abs(rect.x - previous.x) > 0.5 ||
        Math.abs(rect.y - previous.y) > 0.5;
      previous = rect;
      stableFrames = moved ? 0 : stableFrames + 1;
      frames += 1;
      // Stable for 2 consecutive frames, or a safety cap so the map always shows.
      if (stableFrames >= 2 || frames >= 90) {
        setReady(true);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (nodes.length === 0) {
    return (
      <div
        className='flex items-center justify-center rounded bg-secondary-dark-gray text-[11px] text-primary-white/50 font-main'
        style={{ height }}
      >
        No preview available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className='rounded overflow-hidden border border-secondary-dark-gray bg-[#1a1a1a]'
      style={{ height }}
    >
      {ready && (
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick
            minZoom={0.05}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            colorMode='dark'
          />
        </ReactFlowProvider>
      )}
    </div>
  );
}

export { ConnectionMiniMap };
export type { ConnectionMiniMapProps };
