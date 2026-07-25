import { cn } from '@/utils';
import {
  Position,
  Handle,
  type HandleType,
  useNodeConnections,
} from '@xyflow/react';
import { forwardRef, type HTMLAttributes } from 'react';
import {
  HandleShapeSwatch,
  handleShapesMap,
  type HandleShape,
} from '@/components/atoms/HandleShapeSwatch';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

/**
 * Props for the ContextAwareHandle component
 */
type ContextAwareHandleProps = {
  /** Type of handle (source or target) */
  type: HandleType;
  /** Position of the handle on the node */
  position: Position;
  /** Unique identifier for the handle */
  id: string;
  /** Color of the handle */
  color?: string;
  /** Shape of the handle */
  shape?: HandleShape;
  /** Maximum number of connections for this handle */
  maxConnections?: number;
  /** Whether the handle is currently inside a ReactFlow context */
  isCurrentlyInsideReactFlow?: boolean;
} & HTMLAttributes<HTMLDivElement>;

/**
 * A context-aware handle component for node inputs and outputs
 *
 * This component renders handles (connection points) for nodes with support for
 * various shapes and automatic ReactFlow integration. It can render as either
 * a ReactFlow Handle when inside a ReactFlow context or as a standalone element
 * for preview purposes.
 *
 * Features:
 * - 13+ custom handle shapes (circle, square, diamond, star, etc.)
 * - Automatic ReactFlow integration
 * - Custom colors and styling
 * - Border support for clip-path shapes
 * - Type-safe shape definitions
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the handle element
 * @returns JSX element containing the handle
 *
 * @example
 * ```tsx
 * // Basic handle
 * <ContextAwareHandle
 *   type="target"
 *   position={Position.Left}
 *   id="input1"
 *   color="#00BFFF"
 *   shape="circle"
 *   isCurrentlyInsideReactFlow={true}
 * />
 *
 * // Custom shape handle
 * <ContextAwareHandle
 *   type="source"
 *   position={Position.Right}
 *   id="output1"
 *   color="#FECA57"
 *   shape="diamond"
 *   isCurrentlyInsideReactFlow={true}
 * />
 *
 * // Preview handle (outside ReactFlow)
 * <ContextAwareHandle
 *   type="target"
 *   position={Position.Left}
 *   id="preview-input"
 *   color="#96CEB4"
 *   shape="star"
 *   isCurrentlyInsideReactFlow={false}
 * />
 * ```
 */
type ConnectableHandleProps = {
  type: HandleType;
  position: Position;
  id: string;
  color?: string;
  shape: HandleShape;
  maxConnections?: number;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

// Variant rendered INSIDE a ReactFlow provider: always calls useNodeConnections
// (the hook throws without the provider, so it must never be called conditionally).
const ConnectableHandle = forwardRef<HTMLDivElement, ConnectableHandleProps>(
  (
    { type, position, id, color, shape, maxConnections, className, ...props },
    ref,
  ) => {
    const connections = useNodeConnections({
      handleId: id,
      handleType: type,
    });
    const theme = useGraphTheme();
    const canConnect =
      maxConnections !== undefined
        ? connections.length < maxConnections
        : undefined;
    return (
      <Handle
        type={type}
        position={position}
        id={id}
        className={cn(
          '!w-6 !h-6 !border-none !bg-transparent !pointer-events-auto',
          className,
        )}
        style={{
          backgroundColor: 'transparent',
        }}
        isConnectable={canConnect}
        isConnectableStart={canConnect}
        isConnectableEnd={canConnect}
        {...props}
        ref={ref}
      >
        <div className={cn('pointer-events-none flex justify-center')}>
          <HandleShapeSwatch
            shape={shape}
            color={color}
            className={cn(theme?.node?.handleShape, className)}
          />
        </div>
      </Handle>
    );
  },
);
ConnectableHandle.displayName = 'ConnectableHandle';

type StaticHandleProps = {
  position: Position;
  color?: string;
  shape: HandleShape;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

// Variant rendered OUTSIDE ReactFlow (e.g. node-type preview): never calls
// ReactFlow hooks (useNodeConnections throws without the provider).
const StaticHandle = forwardRef<HTMLDivElement, StaticHandleProps>(
  ({ position, color, shape, className, ...props }, ref) => {
    const theme = useGraphTheme();
    return (
      <div
        className={cn(
          'absolute',
          position === Position.Right &&
            'right-0 top-1/2 -translate-y-1/2 translate-x-1/2',
          position === Position.Left &&
            'left-0 top-1/2 -translate-y-1/2 -translate-x-1/2',
        )}
        {...props}
        ref={ref}
      >
        <HandleShapeSwatch
          shape={shape}
          color={color}
          className={cn(theme?.node?.handleShape, className)}
        />
      </div>
    );
  },
);
StaticHandle.displayName = 'StaticHandle';

const ContextAwareHandle = forwardRef<HTMLDivElement, ContextAwareHandleProps>(
  (
    {
      type,
      position,
      id,
      color,
      shape = handleShapesMap.circle,
      maxConnections,
      isCurrentlyInsideReactFlow = false,
      className,
      ...props
    },
    ref,
  ) => {
    // Pick the variant by context membership so neither calls a hook conditionally.
    if (isCurrentlyInsideReactFlow) {
      return (
        <ConnectableHandle
          type={type}
          position={position}
          id={id}
          color={color}
          shape={shape}
          maxConnections={maxConnections}
          className={className}
          {...props}
          ref={ref}
        />
      );
    }
    return (
      <StaticHandle
        position={position}
        color={color}
        shape={shape}
        className={className}
        {...props}
        ref={ref}
      />
    );
  },
);

ContextAwareHandle.displayName = 'ContextAwareHandle';

export { ContextAwareHandle };
export type { ContextAwareHandleProps, HandleShape };
