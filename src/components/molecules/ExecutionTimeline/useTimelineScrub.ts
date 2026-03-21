import { useState, useCallback, useRef } from 'react';
import type { ExecutionStepRecord } from '@/utils/nodeRunner/types';

/** Find the step whose midpoint is nearest to a pixel position in content-space. */
function findNearestStep(
  contentPx: number,
  steps: ReadonlyArray<ExecutionStepRecord>,
  timeScale: number,
): number | null {
  if (steps.length === 0) return null;
  const time = contentPx / timeScale;
  let closestIndex = steps[0].stepIndex;
  let closestDist = Infinity;
  for (const step of steps) {
    const mid = step.startTime + step.duration / 2;
    const dist = Math.abs(mid - time);
    if (dist < closestDist) {
      closestDist = dist;
      closestIndex = step.stepIndex;
    }
  }
  return closestIndex;
}

type UseTimelineScrubOptions = {
  steps: ReadonlyArray<ExecutionStepRecord>;
  timeScale: number;
  contentWidth: number;
  currentStepIndex: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  gutterWidth: number;
  onScrubTo: (stepIndex: number) => void;
};

type UseTimelineScrubReturn = {
  /** Current scrubber pixel position (drag position or snapped) */
  scrubberPx: number;
  /** Whether the user is currently dragging the scrubber */
  isDraggingScrubber: boolean;
  /** Index of the step nearest to the drag position (null when not dragging) */
  nearestDragStepIndex: number | null;
  /** Whether the scrubber is in a snap transition */
  isSnapping: boolean;
  /** Start scrub drag from a mousedown clientX */
  startScrubDrag: (clientX: number) => void;
  /** MouseDown handler for the ruler area */
  handleRulerScrubDown: (e: React.MouseEvent) => void;
  /** MouseDown handler for the scrubber handle */
  handleScrubberMouseDown: (e: React.MouseEvent) => void;
  /** Callback for onTransitionEnd on the scrubber element */
  onSnapTransitionEnd: () => void;
};

/**
 * Manages scrubber drag state for the execution timeline:
 * - Continuous pixel position tracking during drag
 * - Nearest-step highlighting
 * - Snap-to-step on release with transition animation
 */
function useTimelineScrub({
  steps,
  timeScale,
  contentWidth,
  currentStepIndex,
  scrollContainerRef,
  gutterWidth,
  onScrubTo,
}: UseTimelineScrubOptions): UseTimelineScrubReturn {
  const [scrubDragPx, setScrubDragPx] = useState<number | null>(null);
  const [nearestDragStepIndex, setNearestDragStepIndex] = useState<
    number | null
  >(null);
  const nearestDragStepIndexRef = useRef<number | null>(null);
  const isDraggingScrubber = scrubDragPx !== null;

  // ── Snap transition ──
  const isSnappingRef = useRef(false);
  const prevStepIndexRef = useRef(currentStepIndex);
  if (prevStepIndexRef.current !== currentStepIndex && !isDraggingScrubber) {
    isSnappingRef.current = true;
  }
  prevStepIndexRef.current = currentStepIndex;

  // ── Scrubber position ──
  const currentStep = steps[currentStepIndex];
  const snappedScrubberPx = currentStep
    ? (currentStep.startTime + currentStep.duration / 2) * timeScale
    : 0;
  const scrubberPx = scrubDragPx ?? snappedScrubberPx;

  // ── Scrub drag ──
  const startScrubDrag = useCallback(
    (clientX: number) => {
      const container = scrollContainerRef.current;
      if (!container || steps.length === 0) return;

      const rect = container.getBoundingClientRect();
      const contentX = clientX - rect.left + container.scrollLeft - gutterWidth;
      const clamped = Math.max(0, Math.min(contentX, contentWidth));
      setScrubDragPx(clamped);
      const nearest = findNearestStep(clamped, steps, timeScale);
      nearestDragStepIndexRef.current = nearest;
      setNearestDragStepIndex(nearest);
      if (nearest !== null) onScrubTo(nearest);

      const handleMove = (e: MouseEvent) => {
        const r = container.getBoundingClientRect();
        const cx = e.clientX - r.left + container.scrollLeft - gutterWidth;
        const cl = Math.max(0, Math.min(cx, contentWidth));
        setScrubDragPx(cl);
        const n = findNearestStep(cl, steps, timeScale);
        if (n !== nearestDragStepIndexRef.current && n !== null) {
          onScrubTo(n);
        }
        nearestDragStepIndexRef.current = n;
        setNearestDragStepIndex(n);
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);

        if (nearestDragStepIndexRef.current !== null) {
          onScrubTo(nearestDragStepIndexRef.current);
        }
        nearestDragStepIndexRef.current = null;
        setScrubDragPx(null);
        setNearestDragStepIndex(null);
        isSnappingRef.current = true;
        setTimeout(() => {
          isSnappingRef.current = false;
        }, 200);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [
      steps,
      timeScale,
      contentWidth,
      gutterWidth,
      scrollContainerRef,
      onScrubTo,
    ],
  );

  const handleRulerScrubDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      startScrubDrag(e.clientX);
    },
    [startScrubDrag],
  );

  const handleScrubberMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      startScrubDrag(e.clientX);
    },
    [startScrubDrag],
  );

  const onSnapTransitionEnd = useCallback(() => {
    isSnappingRef.current = false;
  }, []);

  return {
    scrubberPx,
    isDraggingScrubber,
    nearestDragStepIndex,
    isSnapping: isSnappingRef.current,
    startScrubDrag,
    handleRulerScrubDown,
    handleScrubberMouseDown,
    onSnapTransitionEnd,
  };
}

export { useTimelineScrub };
export type { UseTimelineScrubOptions, UseTimelineScrubReturn };
