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
  /**
   * Whether to prevent the default behavior of the drag event and stop propagation
   */
  preventDefaultAndStopPropagation?: boolean;
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
  preventDefaultAndStopPropagation = true,
}: UseDragOptions = {}): UseDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [dragElement, setDragElement] = useState<HTMLElement | null>(null);

  const initialMouseDownPosition = useRef<{ x: number; y: number } | null>(
    null,
  );
  const elementSize = useRef<{ width: number; height: number } | null>(null);

  const mouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpRef = useRef<((e: MouseEvent) => void) | null>(null);

  // Keep the latest callbacks/options in a ref so the drag effect can depend
  // only on [dragElement, enabled]. Otherwise unstable onMove/onClick references
  // make the effect re-run on every render, and its cleanup removes the
  // in-flight document listeners — killing a drag the instant it produces a
  // value change (the re-render tears down its own gesture).
  const optionsRef = useRef({
    onMove,
    onClick,
    clickThreshold,
    preventDefaultAndStopPropagation,
  });
  optionsRef.current = {
    onMove,
    onClick,
    clickThreshold,
    preventDefaultAndStopPropagation,
  };

  const dragRef = useCallback((element: HTMLElement | null) => {
    setDragElement(element);
  }, []);

  useEffect(() => {
    if (!dragElement || !enabled) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (optionsRef.current.preventDefaultAndStopPropagation) {
        event.preventDefault();
        event.stopPropagation();
      }
      initialMouseDownPosition.current = {
        x: event.clientX,
        y: event.clientY,
      };

      elementSize.current = {
        width: dragElement.clientWidth,
        height: dragElement.clientHeight,
      };

      setIsDragging(true);

      const handleMouseMove = (event: MouseEvent) => {
        const { onMove, preventDefaultAndStopPropagation } = optionsRef.current;
        if (preventDefaultAndStopPropagation) {
          event.preventDefault();
          event.stopPropagation();
        }
        const movementX = event.movementX;
        const movementY = event.movementY;
        const width = elementSize.current?.width || 1;
        const height = elementSize.current?.height || 1;

        const deltaX = movementX / width;
        const deltaY = movementY / height;

        onMove?.(movementX, movementY, deltaX, deltaY, width, height);
      };

      const handleMouseUp = (event: MouseEvent) => {
        const { onClick, clickThreshold, preventDefaultAndStopPropagation } =
          optionsRef.current;
        if (preventDefaultAndStopPropagation) {
          event.preventDefault();
          event.stopPropagation();
        }
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mousemove', handleMouseMove);
        mouseMoveRef.current = null;
        mouseUpRef.current = null;

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

      mouseMoveRef.current = handleMouseMove;
      mouseUpRef.current = handleMouseUp;
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mousemove', handleMouseMove);
    };

    dragElement.addEventListener('mousedown', handleMouseDown);

    return () => {
      dragElement.removeEventListener('mousedown', handleMouseDown);
      if (mouseMoveRef.current) {
        document.removeEventListener('mousemove', mouseMoveRef.current);
        mouseMoveRef.current = null;
      }
      if (mouseUpRef.current) {
        document.removeEventListener('mouseup', mouseUpRef.current);
        mouseUpRef.current = null;
      }
    };
  }, [dragElement, enabled]);

  return {
    isDragging,
    dragRef,
  };
}

export { useDrag };
export type { UseDragOptions, UseDragReturn };
