import { memo } from 'react';
import { cn } from '@/utils';
import { handleShapesMap, type HandleShape } from './handleShapes';

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
          style={{
            ...colorStyle,
            width: 'calc(4px + 24px/(2*tan(90deg/2)))',
            minHeight: '24px',
            mask: '4px 50%/100% 24px repeat-y conic-gradient(from calc(90deg - 90deg/2) at left, #0000, #000 1deg calc(90deg - 1deg), #0000 90deg) exclude, 0 50%/100% 24px repeat-y conic-gradient(from calc(90deg - 90deg/2) at left, #0000, #000 1deg calc(90deg - 1deg), #0000 90deg)',
            border: '2px solid black',
          }}
        />
      );

    case handleShapesMap.sparkle:
      return (
        <div
          className={cn('w-6 h-6', className)}
          style={{
            ...colorStyle,
            mask: 'radial-gradient(#0000 71%, #000 72%) 10000% 10000%/99.5% 99.5%',
            border: '2px solid black',
          }}
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
 * Props for the HandleShapeSwatch component
 */
type HandleShapeSwatchProps = {
  /** Shape of the handle (defaults to circle) */
  shape?: HandleShape;
  /** Fill color; falls back to a neutral gray when empty/undefined */
  color?: string;
  /**
   * Rendered size in px. The canonical canvas footprint is 24; at exactly 24 the
   * swatch renders the shape verbatim (byte-identical to the canvas). Any other
   * size renders the same shape scaled to fit a `size x size` box (for dense
   * editor rows).
   */
  size?: number;
  /** Applied to the shape element (e.g. the `theme.node.handleShape` slot). */
  className?: string;
};

/**
 * A presentational handle-shape swatch: the single source of truth for how the
 * 13 handle shapes render. Used both by the canvas `ContextAwareHandle` (at the
 * default `size` 24) and by the config editors (at a small `size`, scaled to fit).
 *
 * Internal atom — intentionally NOT re-exported from the public atoms barrel.
 */
const HandleShapeSwatch = memo(function HandleShapeSwatch({
  shape = handleShapesMap.circle,
  color,
  size = 24,
  className,
}: HandleShapeSwatchProps) {
  const shapeElement = renderHandleShape(shape, color || '#A1A1A1', className);

  // Canvas path: return the shape verbatim so the on-canvas DOM is byte-identical
  // (no wrapper element, no extra attribute).
  if (size === 24) {
    return shapeElement;
  }

  // Editor path: fit the 24px-footprint shape into a `size x size` box so dense
  // rows never grow (the tallest shape, the 16x32 rectangle, is contained here).
  const scale = size / 24;
  return (
    <div
      data-slot='handle-shape-swatch'
      className='relative flex shrink-0 items-center justify-center overflow-hidden'
      style={{ width: size, height: size }}
    >
      <div
        className='flex items-center justify-center'
        style={{ transform: `scale(${scale})` }}
      >
        {shapeElement}
      </div>
    </div>
  );
});

export { HandleShapeSwatch };
export type { HandleShapeSwatchProps };
