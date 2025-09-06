import { useCallback, useEffect, useRef, useState } from 'react';

type UseDragOptions = {
  /**
   * Callback when dragging occurs
   * @param movementX - The horizontal movement in pixels
   * @param movementY - The vertical movement in pixels
   * @param deltaX - The horizontal movement ratio (movementX / elementWidth)
   * @param deltaY - The vertical movement ratio (movementY / elementHeight)
   * @param width - The width of the element
   * @param height - The height of the element
   */
  onMove?: (
    movementX: number,
    movementY: number,
    deltaX: number,
    deltaY: number,
    width: number,
    height: number,
  ) => void;
  /**
   * Callback when a click is detected (small drag distance)
   */
  onClick?: () => void;
  /**
   * The maximum distance in pixels to consider as a click (default: 2)
   */
  clickThreshold?: number;
  /**
   * Whether dragging is enabled (default: true)
   */
  enabled?: boolean;
};

type UseDragReturn = {
  /**
   * Whether the user is currently dragging
   */
  isDragging: boolean;
  /**
   * Ref to attach to the draggable element
   */
  dragRef: (element: HTMLElement | null) => void;
};

/**
 * Custom hook for handling drag functionality
 *
 * @param options - Configuration options for the drag behavior
 * @returns Object containing drag state and ref for the draggable element
 */
function useDrag({
  onMove,
  onClick,
  clickThreshold = 2,
  enabled = true,
}: UseDragOptions = {}): UseDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [dragElement, setDragElement] = useState<HTMLElement | null>(null);

  const initialMouseDownPosition = useRef<{ x: number; y: number } | null>(
    null,
  );
  const elementSize = useRef<{ width: number; height: number } | null>(null);

  const dragRef = useCallback((element: HTMLElement | null) => {
    setDragElement(element);
  }, []);

  useEffect(() => {
    if (!dragElement || !enabled) return;

    const handleMouseDown = (event: MouseEvent) => {
      initialMouseDownPosition.current = {
        x: event.clientX,
        y: event.clientY,
      };

      elementSize.current = {
        width: dragElement.clientWidth,
        height: dragElement.clientHeight,
      };

      setIsDragging(true);

      const handleMouseUp = (event: MouseEvent) => {
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mousemove', handleMouseMove);

        setIsDragging(false);

        // Check if this was a click (small movement) rather than a drag
        if (initialMouseDownPosition.current) {
          const distance = Math.sqrt(
            (event.clientX - initialMouseDownPosition.current.x) ** 2 +
              (event.clientY - initialMouseDownPosition.current.y) ** 2,
          );

          if (distance < clickThreshold) {
            onClick?.();
          }
        }
      };

      const handleMouseMove = (event: MouseEvent) => {
        const movementX = event.movementX;
        const movementY = event.movementY;
        const width = elementSize.current?.width || 1;
        const height = elementSize.current?.height || 1;

        const deltaX = movementX / width;
        const deltaY = movementY / height;

        onMove?.(movementX, movementY, deltaX, deltaY, width, height);
      };

      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mousemove', handleMouseMove);
    };

    dragElement.addEventListener('mousedown', handleMouseDown);

    return () => {
      dragElement.removeEventListener('mousedown', handleMouseDown);
    };
  }, [dragElement, enabled, onMove, onClick, clickThreshold]);

  return {
    isDragging,
    dragRef,
  };
}

export { useDrag };
export type { UseDragOptions, UseDragReturn };
