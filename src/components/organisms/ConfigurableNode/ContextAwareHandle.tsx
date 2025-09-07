import { cn } from '@/utils';
import { Position, Handle, type HandleType } from '@xyflow/react';
import { forwardRef, type HTMLAttributes } from 'react';

/** Available handle shapes for node inputs and outputs */
const handleShapes = [
  'circle',
  'square',
  'rectangle',
  'list',
  'grid',
  'diamond',
  'trapezium',
  'hexagon',
  'star',
  'cross',
  'zigzag',
  'sparkle',
  'parallelogram',
] as const;

/** Map of handle shapes for type-safe access */
const handleShapesMap = {
  [handleShapes[0]]: handleShapes[0],
  [handleShapes[1]]: handleShapes[1],
  [handleShapes[2]]: handleShapes[2],
  [handleShapes[3]]: handleShapes[3],
  [handleShapes[4]]: handleShapes[4],
  [handleShapes[5]]: handleShapes[5],
  [handleShapes[6]]: handleShapes[6],
  [handleShapes[7]]: handleShapes[7],
  [handleShapes[8]]: handleShapes[8],
  [handleShapes[9]]: handleShapes[9],
  [handleShapes[10]]: handleShapes[10],
  [handleShapes[11]]: handleShapes[11],
  [handleShapes[12]]: handleShapes[12],
} as const;

/** Type representing all available handle shapes */
type HandleShape = (typeof handleShapesMap)[keyof typeof handleShapesMap];

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
  /** Whether the handle is currently inside a ReactFlow context */
  isCurrentlyInsideReactFlow?: boolean;
} & HTMLAttributes<HTMLDivElement>;

// Helper function to create bordered clip-path shapes
const createBorderedClipPath = (
  clipPath: string,
  color: string,
  className?: string,
  borderColor: string = 'black',
  borderWidth: number = 2,
) => {
  return (
    <div className={cn('relative', className)}>
      {/* Border layer - slightly larger container */}
      <div
        className='absolute'
        style={{
          top: -borderWidth,
          left: -borderWidth,
          right: -borderWidth,
          bottom: -borderWidth,
          backgroundColor: borderColor,
          clipPath: clipPath,
        }}
      />
      {/* Main shape layer - ensure it has full dimensions */}
      <div
        className='absolute inset-0'
        style={{
          backgroundColor: color,
          clipPath: clipPath,
        }}
      />
    </div>
  );
};

// Helper function to render different handle shapes
const renderHandleShape = (
  shape: HandleShape = handleShapesMap.circle,
  color: string = '#A1A1A1',
  className?: string,
) => {
  const baseClassesThickBorder = 'border-2 border-black';
  const baseClassesThinBorder = 'border-1 border-black';
  const colorStyle = { backgroundColor: color };

  switch (shape) {
    case handleShapesMap.circle:
      return (
        <div
          className={cn(
            'w-6 h-6 rounded-full',
            baseClassesThickBorder,
            className,
          )}
          style={colorStyle}
        />
      );

    case handleShapesMap.square:
      return (
        <div
          className={cn('w-6 h-6', baseClassesThickBorder, className)}
          style={colorStyle}
        />
      );

    case handleShapesMap.rectangle:
      return (
        <div
          className={cn('w-4 h-8', baseClassesThickBorder, className)}
          style={colorStyle}
        />
      );

    case handleShapesMap.list:
      return (
        <div
          className={cn(
            'w-6 h-6 flex flex-col justify-center gap-0.5',
            className,
          )}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn('w-full h-2', baseClassesThinBorder)}
              style={colorStyle}
            />
          ))}
        </div>
      );

    case handleShapesMap.grid:
      return (
        <div className={cn('w-6 h-6 grid grid-cols-2 gap-0.5', className)}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn('w-full h-full', baseClassesThinBorder)}
              style={colorStyle}
            />
          ))}
        </div>
      );

    case handleShapesMap.diamond:
      return (
        <div
          className={cn('w-6 h-6 rotate-45', baseClassesThickBorder, className)}
          style={colorStyle}
        />
      );

    case handleShapesMap.trapezium:
      return createBorderedClipPath(
        'polygon(25% 0%, 75% 0%, 100% 100%, 0% 100%)',
        color,
        cn('w-6 h-6', className),
      );

    case handleShapesMap.hexagon:
      return createBorderedClipPath(
        'polygon(-50% 50%,50% 100%,150% 50%,50% 0)',
        color,
        cn('w-5 h-6', className),
      );

    case handleShapesMap.star:
      return createBorderedClipPath(
        'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
        color,
        cn('w-6 h-6', className),
      );

    case handleShapesMap.cross:
      return (
        <div className={cn('w-6 h-6 relative', className)}>
          <div
            className={cn(
              'absolute top-1/2 left-0 w-full h-2 -translate-y-1/2',
              baseClassesThinBorder,
            )}
            style={colorStyle}
          />
          <div
            className={cn(
              'absolute left-1/2 top-0 w-2 h-full -translate-x-1/2',
              baseClassesThinBorder,
            )}
            style={colorStyle}
          />
        </div>
      );

    case handleShapesMap.zigzag:
      return (
        <div
          className={cn('w-6 h-6', className)}
          style={
            {
              ...colorStyle,
              '--a': '90deg',
              '--s': '24px',
              '--b': '4px',
              width: 'calc(var(--b) + var(--s)/(2*tan(var(--a)/2)))',
              minHeight: '24px',
              '--_g':
                '100% var(--s) repeat-y conic-gradient(from calc(90deg - var(--a)/2) at left, #0000, #000 1deg calc(var(--a) - 1deg), #0000 var(--a))',
              mask: 'var(--b) 50%/var(--_g) exclude, 0 50%/var(--_g)',
              border: '2px solid black',
            } as React.CSSProperties
          }
        />
      );

    case handleShapesMap.sparkle:
      return (
        <div
          className={cn('w-6 h-6', className)}
          style={
            {
              ...colorStyle,
              mask: 'radial-gradient(#0000 71%, #000 72%) 10000% 10000%/99.5% 99.5%',
              border: '2px solid black',
            } as React.CSSProperties
          }
        />
      );

    case handleShapesMap.parallelogram:
      return createBorderedClipPath(
        'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)',
        color,
        cn('w-6 h-6', className),
      );

    default:
      return (
        <div
          className={cn(
            'w-6 h-6 rounded-full',
            baseClassesThickBorder,
            className,
          )}
          style={colorStyle}
        />
      );
  }
};

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
const ContextAwareHandle = forwardRef<HTMLDivElement, ContextAwareHandleProps>(
  (
    {
      type,
      position,
      id,
      color,
      shape = handleShapesMap.circle,
      isCurrentlyInsideReactFlow = false,
      className,
      ...props
    },
    ref,
  ) => {
    if (isCurrentlyInsideReactFlow) {
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
          {...props}
          ref={ref}
        >
          <div className='pointer-events-none'>
            {renderHandleShape(shape, color || '#A1A1A1', className)}
          </div>
        </Handle>
      );
    }

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
        {renderHandleShape(shape, color || '#A1A1A1', className)}
      </div>
    );
  },
);

ContextAwareHandle.displayName = 'ContextAwareHandle';

export { ContextAwareHandle, handleShapesMap };
export type { ContextAwareHandleProps, HandleShape };
