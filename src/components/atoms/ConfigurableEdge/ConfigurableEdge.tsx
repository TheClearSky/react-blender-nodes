import { getHandleFromNodeDataMatchingHandleId } from '@/utils/nodeStateManagement/handles/handleGetters';
import { cn } from '@/utils';
import {
  BaseEdge,
  getBezierPath,
  useNodesData,
  useStoreApi,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';
import {
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RunnerContext } from '@/components/organisms/FullGraph/FullGraphState';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

const MAX_EDGE_VALUE_LENGTH = 12;

/** Format a value for display on an edge pill. Truncates long values. */
function formatEdgeValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value.length > MAX_EDGE_VALUE_LENGTH)
      return `"${value.slice(0, MAX_EDGE_VALUE_LENGTH - 1)}\u2026"`;
    return `"${value}"`;
  }
  if (value instanceof Map) return `Map(${value.size})`;
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value).length}}`;
  return String(value);
}

/**
 * Per-edge data carried on a configurable edge.
 *
 * `order` is the connection's rank WITHIN its target input handle's fan-in group
 * — a contiguous `0..n-1` written across the group's sibling edges when the user
 * reorders the connections (`REORDER_INPUT_CONNECTIONS`). It is absent on edges
 * that have never been reordered; the compiler then falls back to the
 * edges-array order, so existing graphs and the common single-connection case are
 * unchanged. It is the only field the library itself persists on an edge today.
 *
 * The `& Record<string, unknown>` keeps the data bag OPEN — a consumer may still
 * stash their own arbitrary keys on `edge.data` (as the prior
 * `Record<string, unknown>` typing allowed), so adding the typed `order` is a
 * purely additive, non-breaking change to the (internal) `ConfigurableEdgeState`.
 */
type ConfigurableEdgeData = { order?: number } & Record<string, unknown>;

/** State type for configurable edges */
type ConfigurableEdgeState = Edge<ConfigurableEdgeData, 'configurableEdge'>;

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
    const [edgePath, labelX, labelY] = getBezierPath({
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
      // Scope to THIS flow's container: the same edge id can exist in another
      // ReactFlow instance (e.g. the preview mini-map rendered beside the
      // canvas), and a document-wide lookup would observe the wrong element —
      // one that never intersects our own `root`, dimming every edge.
      const currentElement = domNode.querySelector('#' + CSS.escape(id));
      if (!currentElement) return;

      // Create intersection observer
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries.find((entry) => entry.target.id === id);
          if (!entry) return;
          // "Fully visible" via the ratio with a small tolerance — NOT an exact
          // threshold of 1: subpixel rounding makes a 100%-visible edge report a
          // ratio of ~0.9999 (never exactly 1), so threshold:1 marks it
          // off-screen (dim) and dithers (flicker) as that ratio jitters.
          setIsInViewport(entry.intersectionRatio >= 0.99);
        },
        {
          root: domNode,
          threshold: [0, 0.99],
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

    // Emphasis for animated (highlighted preview) edges — e.g. connections about
    // to be deleted: (1) marching-ants dashes 10x longer than @xyflow's default of
    // 5, and (2) an opacity pulse. Both run via the Web Animations API on the path
    // element (the same scoped, no-CSS mechanism as useSlideAnimation), so nothing
    // is added to the global stylesheet and neither fights @xyflow's `.animated`
    // CSS in the cascade (script-driven WAA overrides CSS per-property). The dash
    // length is set inline below (overriding @xyflow's dasharray:5). Dash: 100 =
    // one 50+50 pattern, 5s keeps @xyflow's marching speed (~20px/s). Pulse: matches
    // the existing `edge-brightness-pulse` (1 ↔ 0.35, 1.5s ease-in-out).
    useEffect(() => {
      if (!props.animated) return;
      const domNode = store.getState().domNode;
      if (!domNode) return;
      const pathElement = domNode.querySelector('#' + CSS.escape(id));
      if (!pathElement) return;
      const dashAnimation = pathElement.animate(
        [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }],
        { duration: 500, iterations: Infinity },
      );
      const pulseAnimation = pathElement.animate(
        [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }],
        { duration: 1500, iterations: Infinity, easing: 'ease-in-out' },
      );
      return () => {
        dashAnimation.cancel();
        pulseAnimation.cancel();
      };
    }, [props.animated, id, store]);

    const sourceNodeData = useNodesData(props.source || '');

    const sourceHandleColor = useMemo(() => {
      if (!props.source || !sourceNodeData) return;
      const inputOrOutput = getHandleFromNodeDataMatchingHandleId(
        props.sourceHandleId || '',
        sourceNodeData?.data,
      )?.value;
      return inputOrOutput?.handleColor ?? '#A1A1A1';
    }, [props.source, sourceNodeData]);

    const targetNodeData = useNodesData(props.target || '');

    const targetHandleColor = useMemo(() => {
      if (!props.target || !targetNodeData) return;
      const inputOrOutput = getHandleFromNodeDataMatchingHandleId(
        props.targetHandleId || '',
        targetNodeData?.data,
      )?.value;
      return inputOrOutput?.handleColor ?? '#A1A1A1';
    }, [props.target, targetNodeData]);

    const { label, labelStyle, markerStart, markerEnd, interactionWidth } =
      props;

    // ── Runner inspection: match this edge to an input or output value ──
    const runnerCtx = useContext(RunnerContext);
    const theme = useGraphTheme();

    type MatchResult = { found: true; value: unknown } | { found: false };

    // Match input edges (edge.target === inspected node)
    const inputMatch = useMemo((): MatchResult => {
      const step = runnerCtx?.selectedStepRecord;
      if (!step || props.target !== step.nodeId) return { found: false };

      for (const [, inputVal] of step.inputValues) {
        for (const conn of inputVal.connections) {
          if (
            conn.sourceNodeId === props.source &&
            conn.sourceHandleId === (props.sourceHandleId ?? '')
          ) {
            return { found: true, value: conn.value };
          }
        }
      }
      return { found: false };
    }, [
      runnerCtx?.selectedStepRecord,
      props.target,
      props.source,
      props.sourceHandleId,
    ]);

    // Match output edges (edge.source === inspected node)
    const outputMatch = useMemo((): MatchResult => {
      const step = runnerCtx?.selectedStepRecord;
      if (!step || props.source !== step.nodeId || !sourceNodeData?.data)
        return { found: false };

      // Find handle name from handle ID using source node data
      const handle = getHandleFromNodeDataMatchingHandleId(
        props.sourceHandleId || '',
        sourceNodeData.data,
        false, // search outputs
      );
      if (!handle) return { found: false };

      const outputVal = step.outputValues.get(handle.value.name);
      if (!outputVal) return { found: false };
      return { found: true, value: outputVal.value };
    }, [
      runnerCtx?.selectedStepRecord,
      props.source,
      props.sourceHandleId,
      sourceNodeData,
    ]);

    const match = inputMatch.found ? inputMatch : outputMatch;
    const animated = runnerCtx?.edgeValuesAnimated ?? true;
    const formattedValue = match.found ? formatEdgeValue(match.value) : null;

    // Estimate pill width based on text length
    const pillTextLen = formattedValue?.length ?? 0;
    const pillWidth = Math.max(40, pillTextLen * 7.5 + 20);
    const pillHeight = 22;

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
            'stroke-7! in-[g.selected]:brightness-150',
            !isInViewport && 'opacity-25',
            formattedValue !== null &&
              'animate-[edge-brightness-pulse_1.5s_ease-in-out_infinite]',
          )}
          style={{
            stroke: `url(#${`linear-gradient-edge-${id}`})`,
            ...(props.animated && { strokeDasharray: '50 50' }),
          }}
          focusable={true}
        />

        {/* Runner inspection: value display on edge */}
        {formattedValue !== null && (
          <>
            {animated ? (
              /* Animated: value pill travels along the edge path */
              <g pointerEvents='none'>
                <animateMotion
                  dur='2.5s'
                  repeatCount='indefinite'
                  path={edgePath}
                />
                <rect
                  x={-pillWidth / 2}
                  y={-pillHeight / 2}
                  width={pillWidth}
                  height={pillHeight}
                  rx={6}
                  className={cn(
                    'fill-edge-value-pill-bg stroke-edge-value-pill-border',
                    theme?.edge?.valuePillBox,
                  )}
                  strokeWidth={1}
                />
                <text
                  textAnchor='middle'
                  dominantBaseline='central'
                  className={cn(
                    'fill-edge-value-pill-text',
                    theme?.edge?.valuePillText,
                  )}
                  fontSize={11}
                  fontFamily='var(--font-main)'
                >
                  {formattedValue}
                </text>
              </g>
            ) : (
              /* Static: value pill at midpoint */
              <g
                transform={`translate(${labelX}, ${labelY})`}
                pointerEvents='none'
              >
                <rect
                  x={-pillWidth / 2}
                  y={-pillHeight / 2}
                  width={pillWidth}
                  height={pillHeight}
                  rx={6}
                  className={cn(
                    'fill-edge-value-pill-bg stroke-edge-value-pill-border',
                    theme?.edge?.valuePillBox,
                  )}
                  strokeWidth={1}
                />
                <text
                  textAnchor='middle'
                  dominantBaseline='central'
                  className={cn(
                    'fill-edge-value-pill-text',
                    theme?.edge?.valuePillText,
                  )}
                  fontSize={11}
                  fontFamily='var(--font-main)'
                >
                  {formattedValue}
                </text>
              </g>
            )}
          </>
        )}
      </>
    );
  },
);

ConfigurableEdge.displayName = 'ConfigurableEdge';

export { ConfigurableEdge };

export type {
  ConfigurableEdgeProps,
  ConfigurableEdgeState,
  ConfigurableEdgeData,
};
