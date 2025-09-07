import { getInputOrOutputFromNodeData } from '@/components/organisms/ConfigurableNode/nodeDataManipulation';
import {
  BaseEdge,
  getBezierPath,
  useConnection,
  useNodesData,
  type ConnectionLineComponentProps,
} from '@xyflow/react';
import { useMemo } from 'react';

/** Props for the ConfigurableConnection component */
type ConfigurableConnectionProps = {} & ConnectionLineComponentProps;

/**
 * A configurable connection line component for ReactFlow
 *
 * This component renders the connection line that appears when dragging from
 * a handle to create a new connection. It automatically uses the color of
 * the source handle for consistent visual feedback.
 *
 * Features:
 * - Automatic color matching from source handle
 * - Bezier curve rendering
 * - ReactFlow integration
 * - Visual feedback during connection creation
 *
 * @param props - The component props
 * @returns JSX element containing the connection line
 *
 * @example
 * ```tsx
 * // Used as connectionLineComponent in ReactFlow
 * <ReactFlow
 *   connectionLineComponent={ConfigurableConnection}
 *   // ... other props
 * />
 * ```
 */
const ConfigurableConnection = ({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConfigurableConnectionProps) => {
  const { fromHandle } = useConnection();
  const nodeData = useNodesData(fromHandle?.nodeId || '');

  const handleColor = useMemo(() => {
    if (!fromHandle?.id || !nodeData?.data) return;
    const inputOrOutput = getInputOrOutputFromNodeData(
      fromHandle?.id,
      nodeData?.data,
    );
    return inputOrOutput?.handleColor ?? '#A1A1A1';
  }, [fromHandle?.id, nodeData?.data]);

  const [edgePath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  return (
    <BaseEdge
      path={edgePath}
      className='!stroke-7 in-[g.selected]:brightness-150'
      style={{ stroke: handleColor || '#A1A1A1' }}
      focusable={true}
    />
  );
};

ConfigurableConnection.displayName = 'ConfigurableConnection';

export { ConfigurableConnection };

export type { ConfigurableConnectionProps };
