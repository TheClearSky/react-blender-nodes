import { useState, useCallback, useRef } from 'react';

type UseResizeHandleOptions = {
  /** Starting height/width in pixels */
  initialSize: number;
  /** Minimum allowed size */
  minSize: number;
  /** Maximum allowed size */
  maxSize: number;
  /**
   * Resize direction.
   * - 'up': dragging up increases size (bottom panel resized from top edge)
   * - 'down': dragging down increases size
   * - 'left': dragging left increases size
   * - 'right': dragging right increases size
   * @default 'up'
   */
  direction?: 'up' | 'down' | 'left' | 'right';
};

type UseResizeHandleReturn = {
  /** Current size in pixels */
  size: number;
  /** Attach to onMouseDown of the resize handle element */
  onMouseDown: (e: React.MouseEvent) => void;
};

/**
 * Hook for drag-to-resize a panel dimension.
 *
 * Handles mousedown → mousemove → mouseup lifecycle with clamping,
 * cursor override, and user-select prevention during drag.
 */
function useResizeHandle({
  initialSize,
  minSize,
  maxSize,
  direction = 'up',
}: UseResizeHandleOptions): UseResizeHandleReturn {
  const [size, setSize] = useState(initialSize);
  const isResizingRef = useRef(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);

  const isVertical = direction === 'up' || direction === 'down';
  const cursorStyle = isVertical ? 'ns-resize' : 'ew-resize';
  // For 'up' and 'left', dragging in the negative direction increases size
  const sign = direction === 'up' || direction === 'left' ? -1 : 1;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizingRef.current = true;
      startPosRef.current = isVertical ? e.clientY : e.clientX;
      startSizeRef.current = size;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = cursorStyle;

      const handleMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current) return;
        const currentPos = isVertical ? moveEvent.clientY : moveEvent.clientX;
        const delta = (currentPos - startPosRef.current) * sign;
        const newSize = Math.max(
          minSize,
          Math.min(maxSize, startSizeRef.current + delta),
        );
        setSize(newSize);
      };

      const handleUp = () => {
        isResizingRef.current = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [size, minSize, maxSize, isVertical, cursorStyle, sign],
  );

  return { size, onMouseDown };
}

export { useResizeHandle };
export type { UseResizeHandleOptions, UseResizeHandleReturn };
