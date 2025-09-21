import { getInputOrOutputFromNodeData } from '@/components/organisms/ConfigurableNode/nodeDataManipulation';
import { cn } from '@/utils';
import {
  BaseEdge,
  getBezierPath,
  useNodesData,
  useStoreApi,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

/** State type for configurable edges */
type ConfigurableEdgeState = Edge<{}, 'configurableEdge'>;

/** Props for the ConfigurableEdge component */
type ConfigurableEdgeProps = EdgeProps<ConfigurableEdgeState>;

/**
 * A configurable edge component with gradient colors and viewport optimization
 *
 * This component renders edges between nodes with automatic color gradients
 * based on the source and target handle colors. It includes viewport optimization
 * to reduce rendering overhead for edges outside the visible area.
 *
 * Features:
 * - Automatic gradient colors based on handle colors
 * - Viewport optimization for performance
 * - Bezier curve rendering
 * - ReactFlow integration
 * - Custom styling and animations
 *
 * @param props - The component props
 * @param _ - Unused ref parameter
 * @returns JSX element containing the configurable edge
 *
 * @example
 * ```tsx
 * // Edge with automatic gradient colors
 * <ConfigurableEdge
 *   id="edge1"
 *   sourceX={100}
 *   sourceY={50}
 *   targetX={200}
 *   targetY={50}
 *   sourcePosition={Position.Right}
 *   targetPosition={Position.Left}
 *   source="node1"
 *   target="node2"
 *   sourceHandleId="output1"
 *   targetHandleId="input1"
 * />
 * ```
 */
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

    const store = useStoreApi();

    const [isInViewport, setIsInViewport] = useState(true);

    const domIntersectionObserver = useRef<IntersectionObserver>(null);

    useEffect(() => {
      const domNode = store.getState().domNode;
      if (!domNode) return;
      const currentElement = document.getElementById(id);
      if (!currentElement) return;

      // Create intersection observer
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries.find((entry) => entry.target.id === id);
          if (!entry) return;
          setIsInViewport((_) => entry.isIntersecting);
        },
        {
          root: domNode,
          threshold: 1, // Trigger when 100% visible
          rootMargin: '20px',
        },
      );

      observer.observe(currentElement);

      // Store observer in ref for cleanup
      domIntersectionObserver.current = observer;

      // Cleanup function
      return () => {
        if (domIntersectionObserver.current) {
          domIntersectionObserver.current.disconnect();
          domIntersectionObserver.current = null;
        }
      };
    }, [store.getState().domNode]);

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
          style={{
            stroke: `url(#${`linear-gradient-edge-${id}`})`,
          }}
          focusable={true}
        />
      </>
    );
  },
);

ConfigurableEdge.displayName = 'ConfigurableEdge';

export { ConfigurableEdge };

export type { ConfigurableEdgeProps, ConfigurableEdgeState };
