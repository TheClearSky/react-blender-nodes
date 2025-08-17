import {
  ResizeControlVariant,
  type ResizeControlDirection,
} from '@xyflow/system';

import { NodeResizeControl } from '@xyflow/react';
import type {
  ControlLinePosition,
  ControlPosition,
  NodeResizerProps,
} from '@xyflow/react';
import { cn } from '@/utils';

type NodeResizerWithMoreControlsProps = NodeResizerProps & {
  linePosition?: ControlLinePosition[];
  handlePosition?: ControlPosition[];
  resizeDirection?: ResizeControlDirection;
};

/**
 * The `<NodeResizer />` component can be used to add a resize functionality to your
 * nodes. It renders draggable controls around the node to resize in all directions.
 * @public
 *
 * @example
 *```jsx
 *import { memo } from 'react';
 *import { Handle, Position, NodeResizer } from '@xyflow/react';
 *
 *function ResizableNode({ data }) {
 *  return (
 *    <>
 *      <NodeResizer minWidth={100} minHeight={30} />
 *      <Handle type="target" position={Position.Left} />
 *      <div style={{ padding: 10 }}>{data.label}</div>
 *      <Handle type="source" position={Position.Right} />
 *    </>
 *  );
 *};
 *
 *export default memo(ResizableNode);
 *```
 */
function NodeResizerWithMoreControls({
  nodeId,
  isVisible = true,
  handleClassName,
  handleStyle,
  lineClassName,
  lineStyle,
  color,
  minWidth = 10,
  minHeight = 10,
  maxWidth = Number.MAX_VALUE,
  maxHeight = Number.MAX_VALUE,
  keepAspectRatio = false,
  autoScale = true,
  shouldResize,
  onResizeStart,
  onResize,
  onResizeEnd,
  linePosition = ['left', 'right'],
  handlePosition = [],
  resizeDirection = 'horizontal',
}: NodeResizerWithMoreControlsProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <>
      {linePosition.map((position) => (
        <NodeResizeControl
          key={position}
          className={cn(
            '!border-none',
            position === 'left' || position === 'right' ? '!w-4' : '!h-4',
            lineClassName,
          )}
          style={lineStyle}
          nodeId={nodeId}
          position={position}
          variant={ResizeControlVariant.Line}
          color={color}
          minWidth={minWidth}
          minHeight={minHeight}
          maxWidth={maxWidth}
          maxHeight={maxHeight}
          onResizeStart={onResizeStart}
          keepAspectRatio={keepAspectRatio}
          autoScale={autoScale}
          shouldResize={shouldResize}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
          resizeDirection={resizeDirection}
        />
      ))}
      {handlePosition.map((position) => (
        <NodeResizeControl
          key={position}
          className={handleClassName}
          style={handleStyle}
          nodeId={nodeId}
          position={position}
          color={color}
          minWidth={minWidth}
          minHeight={minHeight}
          maxWidth={maxWidth}
          maxHeight={maxHeight}
          onResizeStart={onResizeStart}
          keepAspectRatio={keepAspectRatio}
          autoScale={autoScale}
          shouldResize={shouldResize}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
          resizeDirection={resizeDirection}
        />
      ))}
    </>
  );
}

export { NodeResizerWithMoreControls };

export type { NodeResizerWithMoreControlsProps };
