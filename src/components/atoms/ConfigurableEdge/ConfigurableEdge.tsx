import { cn, isCoordinateInBox } from '@/utils';
import {
  BaseEdge,
  getBezierPath,
  useOnViewportChange,
  useReactFlow,
  useStoreApi,
  type EdgeProps,
  type Viewport,
} from '@xyflow/react';
import { useMemo, useState } from 'react';

type ConfigurableEdgeProps = {
  sourceColor?: string;
  targetColor?: string;
} & EdgeProps;

export function ConfigurableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceColor = '#A1A1A1',
  targetColor = '#A1A1A1',
  ...props
}: ConfigurableEdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const reactflowStore = useStoreApi();
  const { flowToScreenPosition } = useReactFlow();

  const [viewport, setViewport] = useState({
    viewportXDebounced: 0,
    viewportYDebounced: 0,
    viewportZoomDebounced: 0,
  });

  useOnViewportChange({
    onEnd: (viewport: Viewport) => {
      setViewport({
        viewportXDebounced: viewport.x,
        viewportYDebounced: viewport.y,
        viewportZoomDebounced: viewport.zoom,
      });
    },
  });

  const isInViewport = useMemo(() => {
    const { domNode } = reactflowStore.getState();
    const domRect = domNode?.getBoundingClientRect();
    if (!domRect) return false;
    const sourceScreenPosition = flowToScreenPosition({
      x: sourceX,
      y: sourceY,
    });
    const targetScreenPosition = flowToScreenPosition({
      x: targetX,
      y: targetY,
    });
    return (
      isCoordinateInBox(sourceScreenPosition, domRect) ||
      isCoordinateInBox(targetScreenPosition, domRect)
    );
  }, [
    sourceX,
    sourceY,
    targetX,
    targetY,
    viewport.viewportXDebounced,
    viewport.viewportYDebounced,
    viewport.viewportZoomDebounced,
  ]);

  const { label, labelStyle, markerStart, markerEnd, interactionWidth } = props;

  return (
    <>
      <defs>
        <linearGradient
          id={`linear-gradient-edge-${id}`}
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
          gradientUnits='userSpaceOnUse'
        >
          <stop stopColor={sourceColor} offset='0' />
          <stop stopColor={targetColor} offset='1' />
        </linearGradient>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        label={label}
        labelStyle={labelStyle}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
        className={cn(
          '!stroke-7 in-[g.selected]:brightness-150',
          !isInViewport && 'opacity-25',
        )}
        style={{ stroke: `url(#${`linear-gradient-edge-${id}`})` }}
        focusable={true}
      />
    </>
  );
}
