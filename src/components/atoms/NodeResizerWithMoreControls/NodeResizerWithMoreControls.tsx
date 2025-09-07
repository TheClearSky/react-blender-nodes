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

/**
 * Props for the NodeResizerWithMoreControls component
 */
type NodeResizerWithMoreControlsProps = NodeResizerProps & {
  /** Array of line positions for resize controls */
  linePosition?: ControlLinePosition[];
  /** Array of handle positions for resize controls */
  handlePosition?: ControlPosition[];
  /** Direction of resize operation */
  resizeDirection?: ResizeControlDirection;
};

/**
 * Enhanced node resizer component with customizable controls
 *
 * This component extends the standard ReactFlow NodeResizer with additional
 * customization options for line and handle positions. It provides fine-grained
 * control over which resize controls are displayed and how they behave.
 *
 * Features:
 * - Customizable line and handle positions
 * - Direction-specific resize controls
 * - Min/max width and height constraints
 * - Aspect ratio preservation
 * - Auto-scaling support
 * - Custom styling options
 *
 * @param props - The component props
 * @returns JSX element containing the node resizer controls
 *
 * @example
 * ```tsx
 * // Basic resizer with default controls
 * <NodeResizerWithMoreControls
 *   minWidth={100}
 *   minHeight={50}
 *   maxWidth={500}
 *   maxHeight={300}
 * />
 *
 * // Custom line positions only
 * <NodeResizerWithMoreControls
 *   linePosition={['left', 'right']}
 *   minWidth={100}
 *   minHeight={50}
 * />
 *
 * // Custom handle positions
 * <NodeResizerWithMoreControls
 *   handlePosition={['top-left', 'bottom-right']}
 *   minWidth={100}
 *   minHeight={50}
 * />
 *
 * // Horizontal-only resizing
 * <NodeResizerWithMoreControls
 *   resizeDirection="horizontal"
 *   linePosition={['left', 'right']}
 *   minWidth={100}
 *   maxWidth={500}
 * />
 * ```
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
