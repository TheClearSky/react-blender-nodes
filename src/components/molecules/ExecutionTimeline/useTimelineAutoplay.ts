import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ExecutionRecord,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/types';
import { MIN_BLOCK_WIDTH } from './SupportingSubcomponents/types';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

type UseTimelineAutoplayOptions = {
  record: ExecutionRecord | null;
  currentStepIndex: number;
  selectedStepIndex: number | null;
  adjustedSteps: readonly ExecutionStepRecord[];
  timeScale: number;
  autoScroll: boolean;
  autoplayIntervalSec: number;
  isDraggingScrubber: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  setSelectedIterations: React.Dispatch<
    React.SetStateAction<Map<string, number>>
  >;
  onStepClick: (step: ExecutionStepRecord) => void;
  onNavigateToNode?: (nodeId: string) => void;
};

type UseTimelineAutoplayReturn = {
  /** Whether autoplay is currently active. */
  isAutoplaying: boolean;
  /** Can navigate to a previous step. */
  canGoPrev: boolean;
  /** Can navigate to a next step. */
  canGoNext: boolean;
  /** Go to the previous step. */
  goToPrevStep: () => void;
  /** Go to the next step. */
  goToNextStep: () => void;
  /** Jump to the first step (stops autoplay). */
  goToStart: () => void;
  /** Jump to the last step (stops autoplay). */
  goToEnd: () => void;
  /** Toggle autoplay on/off. */
  toggleAutoplay: () => void;
};

// ─────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────

/**
 * Encapsulates the autoplay / step-navigation logic for ExecutionTimeline.
 *
 * Manages:
 * - `isAutoplaying` state and its interval effect
 * - Prev / Next / Start / End step navigation
 * - Auto-expanding loop iterations for the target step
 * - Auto-scrolling the timeline container to keep the active step visible
 * - Live-stepping auto-scroll (when currentStepIndex changes externally)
 */
function useTimelineAutoplay({
  record,
  currentStepIndex,
  selectedStepIndex,
  adjustedSteps,
  timeScale,
  autoScroll,
  autoplayIntervalSec,
  isDraggingScrubber,
  scrollContainerRef,
  setSelectedIterations,
  onStepClick,
  onNavigateToNode,
}: UseTimelineAutoplayOptions): UseTimelineAutoplayReturn {
  // ── Autoplay state ──
  const [isAutoplaying, setIsAutoplaying] = useState(false);
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Navigation index ──
  const navigableStepIndex = selectedStepIndex ?? currentStepIndex;
  const canGoPrev = record !== null && navigableStepIndex > 0;
  const canGoNext =
    record !== null && navigableStepIndex < record.steps.length - 1;

  // ── Scroll timeline to a step ──
  const scrollTimelineToStep = useCallback(
    (step: ExecutionStepRecord) => {
      const container = scrollContainerRef.current;
      if (!container || timeScale <= 0) return;
      // Find the adjusted step to get pause-corrected time
      const adjusted = adjustedSteps.find(
        (s) => s.stepIndex === step.stepIndex,
      );
      const adjStart = adjusted
        ? adjusted.startTime
        : step.startTime - step.pauseAdjustment;
      // Visual center: accounts for MIN_BLOCK_WIDTH expansion on tiny blocks
      const blockLeft = adjStart * timeScale;
      const adjDur = adjusted
        ? adjusted.endTime - adjusted.startTime
        : step.duration;
      const blockWidth = Math.max(adjDur * timeScale, MIN_BLOCK_WIDTH);
      const blockCenterX = blockLeft + blockWidth / 2;
      const targetScrollX = Math.max(
        0,
        blockCenterX - container.clientWidth / 2,
      );

      // Wait for React to re-render (e.g. loop iteration expansion),
      // then do a single combined scroll for both axes
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        scrollTimeoutRef.current = null;
        const c = scrollContainerRef.current;
        if (!c) return;
        let targetScrollY = c.scrollTop;
        const el = c.querySelector(`[data-step-index="${step.stepIndex}"]`);
        if (el) {
          const containerRect = c.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const elCenterY = elRect.top + elRect.height / 2;
          const containerCenterY = containerRect.top + containerRect.height / 2;
          const scrollDelta = elCenterY - containerCenterY;
          if (Math.abs(scrollDelta) > 4) {
            targetScrollY = c.scrollTop + scrollDelta;
          }
        }
        c.scrollTo({
          left: targetScrollX,
          top: targetScrollY,
          behavior: 'smooth',
        });
      }, 50);
    },
    [scrollContainerRef, timeScale, adjustedSteps],
  );

  // Clean up scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // ── Ensure loop iteration is expanded for a step ──
  const ensureIterationExpanded = useCallback(
    (step: ExecutionStepRecord) => {
      if (
        step.loopStructureId !== undefined &&
        step.loopIteration !== undefined
      ) {
        setSelectedIterations((prev) => {
          if (prev.get(step.loopStructureId!) === step.loopIteration!)
            return prev;
          const next = new Map(prev);
          next.set(step.loopStructureId!, step.loopIteration!);
          return next;
        });
      }
    },
    [setSelectedIterations],
  );

  // ── Step navigation callbacks ──
  const goToPrevStep = useCallback(() => {
    if (!record || navigableStepIndex <= 0) return;
    const prevStep = record.steps[navigableStepIndex - 1];
    if (prevStep) {
      ensureIterationExpanded(prevStep);
      onStepClick(prevStep);
      if (autoScroll) {
        onNavigateToNode?.(prevStep.nodeId);
        scrollTimelineToStep(prevStep);
      }
    }
  }, [
    record,
    navigableStepIndex,
    onStepClick,
    onNavigateToNode,
    scrollTimelineToStep,
    autoScroll,
    ensureIterationExpanded,
  ]);

  const goToNextStep = useCallback(() => {
    if (!record || navigableStepIndex >= record.steps.length - 1) return;
    const nextStep = record.steps[navigableStepIndex + 1];
    if (nextStep) {
      ensureIterationExpanded(nextStep);
      onStepClick(nextStep);
      if (autoScroll) {
        onNavigateToNode?.(nextStep.nodeId);
        scrollTimelineToStep(nextStep);
      }
    }
  }, [
    record,
    navigableStepIndex,
    onStepClick,
    onNavigateToNode,
    scrollTimelineToStep,
    autoScroll,
    ensureIterationExpanded,
  ]);

  const goToStart = useCallback(() => {
    if (!record || record.steps.length === 0) return;
    setIsAutoplaying(false);
    const firstStep = record.steps[0];
    ensureIterationExpanded(firstStep);
    onStepClick(firstStep);
    if (autoScroll) {
      onNavigateToNode?.(firstStep.nodeId);
      scrollTimelineToStep(firstStep);
    }
  }, [
    record,
    onStepClick,
    onNavigateToNode,
    scrollTimelineToStep,
    autoScroll,
    ensureIterationExpanded,
  ]);

  const goToEnd = useCallback(() => {
    if (!record || record.steps.length === 0) return;
    setIsAutoplaying(false);
    const lastStep = record.steps[record.steps.length - 1];
    ensureIterationExpanded(lastStep);
    onStepClick(lastStep);
    if (autoScroll) {
      onNavigateToNode?.(lastStep.nodeId);
      scrollTimelineToStep(lastStep);
    }
  }, [
    record,
    onStepClick,
    onNavigateToNode,
    scrollTimelineToStep,
    autoScroll,
    ensureIterationExpanded,
  ]);

  // ── Stop autoplay when we reach the end or record changes ──
  useEffect(() => {
    if (!isAutoplaying || !record) return;
    if (navigableStepIndex >= record.steps.length - 1) {
      setIsAutoplaying(false);
    }
  }, [isAutoplaying, navigableStepIndex, record]);

  // ── Autoplay interval effect ──
  useEffect(() => {
    if (isAutoplaying && record) {
      autoplayRef.current = setInterval(() => {
        goToNextStep();
      }, autoplayIntervalSec * 1000);
      return () => {
        if (autoplayRef.current) clearInterval(autoplayRef.current);
      };
    }
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, [isAutoplaying, autoplayIntervalSec, record, goToNextStep]);

  const toggleAutoplay = useCallback(() => {
    setIsAutoplaying((prev) => !prev);
  }, []);

  // ── Auto-scroll during live stepping ──
  const prevLiveStepRef = useRef(currentStepIndex);
  useEffect(() => {
    if (prevLiveStepRef.current === currentStepIndex) return;
    prevLiveStepRef.current = currentStepIndex;
    if (
      !autoScroll ||
      !record ||
      selectedStepIndex !== null ||
      isDraggingScrubber
    )
      return;

    const step = record.steps[currentStepIndex];
    if (!step) return;

    ensureIterationExpanded(step);
    onNavigateToNode?.(step.nodeId);
    scrollTimelineToStep(step);
  }, [
    currentStepIndex,
    autoScroll,
    record,
    selectedStepIndex,
    isDraggingScrubber,
    ensureIterationExpanded,
    onNavigateToNode,
    scrollTimelineToStep,
  ]);

  return {
    isAutoplaying,
    canGoPrev,
    canGoNext,
    goToPrevStep,
    goToNextStep,
    goToStart,
    goToEnd,
    toggleAutoplay,
  };
}

export { useTimelineAutoplay };
export type { UseTimelineAutoplayReturn };
