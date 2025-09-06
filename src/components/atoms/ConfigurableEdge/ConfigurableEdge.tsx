import { getInputOrOutputFromNodeData } from '@/components/organisms/ConfigurableNode/Conversions';
import { cn, isCoordinateInBox } from '@/utils';
import {
  BaseEdge,
  getBezierPath,
  useNodesData,
  useOnViewportChange,
  useReactFlow,
  useStoreApi,
  type EdgeProps,
  type Edge,
  type Viewport,
} from '@xyflow/react';
import { forwardRef, useMemo, useState } from 'react';

type ConfigurableEdgeState = Edge<{}, 'configurableEdge'>;

type ConfigurableEdgeProps = EdgeProps<ConfigurableEdgeState>;

const ConfigurableEdge = forwardRef<HTMLDivElement, ConfigurableEdgeProps>(
  (
    {
      id,
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      ...props
    },
    _,
  ) => {
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

    const sourceNodeData = useNodesData(props.source || '');

    const sourceHandleColor = useMemo(() => {
      if (!props.source || !sourceNodeData) return;
      const inputOrOutput = getInputOrOutputFromNodeData(
        props.sourceHandleId || '',
        sourceNodeData?.data,
      );
      return inputOrOutput?.handleColor ?? '#A1A1A1';
    }, [props.source, sourceNodeData]);

    const targetNodeData = useNodesData(props.target || '');

    const targetHandleColor = useMemo(() => {
      if (!props.target || !targetNodeData) return;
      const inputOrOutput = getInputOrOutputFromNodeData(
        props.targetHandleId || '',
        targetNodeData?.data,
      );
      return inputOrOutput?.handleColor ?? '#A1A1A1';
    }, [props.target, targetNodeData]);

    const { label, labelStyle, markerStart, markerEnd, interactionWidth } =
      props;

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
            <stop stopColor={sourceHandleColor} offset='0' />
            <stop stopColor={targetHandleColor} offset='1' />
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
  },
);

ConfigurableEdge.displayName = 'ConfigurableEdge';

export { ConfigurableEdge };

export type { ConfigurableEdgeProps, ConfigurableEdgeState };
