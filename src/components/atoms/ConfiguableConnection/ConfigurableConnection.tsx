import { getInputOrOutputFromNodeData } from '@/components/organisms';
import {
  BaseEdge,
  getBezierPath,
  useConnection,
  useNodesData,
  type ConnectionLineComponentProps,
} from '@xyflow/react';
import { useMemo } from 'react';

type ConfigurableConnectionProps = {} & ConnectionLineComponentProps;

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
