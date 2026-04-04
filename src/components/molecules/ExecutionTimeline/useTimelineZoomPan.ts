import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react';

const MIN_SCALE = 0.5;
const MAX_SCALE = 10000;
const WHEEL_ZOOM_SPEED = 0.003;
const PAN_MOVE_THRESHOLD = 3;

type UseTimelineZoomPanOptions = {
  /** Total visible time duration (with padding) used for fit-to-view */
  adjustedTotalDuration: number;
  /** Time padding ratio applied beyond the total duration */
  timePadRightMs: number;
  /** Width of the gutter (label column) in pixels */
  gutterWidth: number;
};

type UseTimelineZoomPanReturn = {
  timeScale: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  fitToView: () => void;
  zoomBy: (factor: number) => void;
  handlePanStart: (e: React.MouseEvent) => void;
  /** Ref that is true if the last pan gesture involved actual mouse movement */
  didPanMoveRef: React.RefObject<boolean>;
};

/**
 * Manages timeline zoom (button, wheel) and click-drag pan.
 *
 * - Button zoom centers on the viewport center
 * - Shift+wheel zoom centers on the cursor position
 * - Click-drag pans both X and Y
 * - Deferred scroll correction via useLayoutEffect after zoom
 * - Auto fit-to-view: timeScale is derived synchronously from duration and
 *   container width when in auto-fit mode (no effect cascade)
 */
function useTimelineZoomPan({
  adjustedTotalDuration,
  timePadRightMs,
  gutterWidth,
}: UseTimelineZoomPanOptions): UseTimelineZoomPanReturn {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panStartXRef = useRef(0);
  const panScrollLeftRef = useRef(0);

  // ── Container width tracking via ResizeObserver ──
  // The scroll container is conditionally rendered (only when record exists),
  // so we use a ResizeObserver that re-attaches whenever the ref changes.
  const [containerWidth, setContainerWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const observedElRef = useRef<HTMLDivElement | null>(null);

  // Check ref on every render — re-attach observer if the element changed.
  // This handles the case where the scroll container mounts after the hook
  // (e.g., when record transitions from null to non-null).
  const container = scrollContainerRef.current;
  if (container !== observedElRef.current) {
    // Detach from previous element
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    observedElRef.current = container;

    if (container) {
      setContainerWidth(container.clientWidth);
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) setContainerWidth(entry.contentRect.width);
      });
      observer.observe(container);
      observerRef.current = observer;
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // ── Auto-fit vs manual zoom state ──
  // When isAutoFit is true, timeScale is derived from duration + container width.
  // When false, manualTimeScale is used (set by zoomBy / wheel zoom).
  const [isAutoFit, setIsAutoFit] = useState(true);
  const [manualTimeScale, setManualTimeScale] = useState(MIN_SCALE);

  // Derive auto-fit scale synchronously — no effect, no second render
  const autoFitTimeScale = useMemo(() => {
    const availableWidth = containerWidth - gutterWidth;
    if (availableWidth <= 0 || adjustedTotalDuration <= 0) return MIN_SCALE;
    return Math.max(
      MIN_SCALE,
      Math.min(
        MAX_SCALE,
        availableWidth / (adjustedTotalDuration * (1 + timePadRightMs)),
      ),
    );
  }, [containerWidth, gutterWidth, adjustedTotalDuration, timePadRightMs]);

  const timeScale = isAutoFit ? autoFitTimeScale : manualTimeScale;

  // ── Auto-fit scroll reset ──
  // When in auto-fit mode, keep scroll at 0 (entire timeline visible).
  // Use layout effect so the reset applies before paint.
  const prevAutoFitScaleRef = useRef(autoFitTimeScale);
  useLayoutEffect(() => {
    if (!isAutoFit) return;
    // Only reset scroll when the auto-fit scale actually changes
    if (prevAutoFitScaleRef.current === autoFitTimeScale) return;
    prevAutoFitScaleRef.current = autoFitTimeScale;
    const container = scrollContainerRef.current;
    if (container) container.scrollLeft = 0;
  }, [isAutoFit, autoFitTimeScale]);

  // ── Deferred scroll: set after manual zoom, applied before paint ──
  const pendingScrollLeftRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingScrollLeftRef.current !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = pendingScrollLeftRef.current;
      pendingScrollLeftRef.current = null;
    }
  });

  // ── Fit-to-view (button / programmatic) ──
  const fitToView = useCallback(() => {
    setIsAutoFit(true);
    const container = scrollContainerRef.current;
    if (container) container.scrollLeft = 0;
  }, []);

  // ── Zoom (buttons) ──
  const zoomBy = useCallback(
    (factor: number) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const viewportCenter =
        container.scrollLeft + (container.clientWidth - gutterWidth) / 2;
      const currentScale = isAutoFit ? autoFitTimeScale : manualTimeScale;
      const timeAtCenter = viewportCenter / currentScale;

      const next = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, currentScale * factor),
      );
      pendingScrollLeftRef.current =
        timeAtCenter * next - (container.clientWidth - gutterWidth) / 2;
      setIsAutoFit(false);
      setManualTimeScale(next);
    },
    [gutterWidth, isAutoFit, autoFitTimeScale, manualTimeScale],
  );

  // ── Wheel zoom (centered on cursor) ──
  const timeScaleRef = useRef(timeScale);
  timeScaleRef.current = timeScale;
  const gutterWidthRef = useRef(gutterWidth);
  gutterWidthRef.current = gutterWidth;
  const isAutoFitRef = useRef(isAutoFit);
  isAutoFitRef.current = isAutoFit;

  // Stable wheel handler stored in a ref so we can add/remove the same function.
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);
  if (!wheelHandlerRef.current) {
    wheelHandlerRef.current = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();

      const el = scrollContainerRef.current;
      if (!el) return;
      const gw = gutterWidthRef.current;
      const rect = el.getBoundingClientRect();
      const cursorXInContainer = e.clientX - rect.left + el.scrollLeft - gw;
      const currentScale = timeScaleRef.current;
      const timeAtCursor = cursorXInContainer / currentScale;

      const zoomDelta = -e.deltaY * WHEEL_ZOOM_SPEED;
      const factor = Math.pow(2, zoomDelta);

      const next = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, currentScale * factor),
      );
      pendingScrollLeftRef.current =
        timeAtCursor * next - (e.clientX - rect.left - gw);
      setIsAutoFit(false);
      setManualTimeScale(next);
    };
  }

  // Track which DOM element we've attached to, re-attach if it changes
  // (e.g., after a collapse/expand cycle recreates the scroll container).
  const wheelAttachedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const handler = wheelHandlerRef.current!;
    if (container === wheelAttachedRef.current) return;

    if (wheelAttachedRef.current) {
      wheelAttachedRef.current.removeEventListener('wheel', handler);
    }
    wheelAttachedRef.current = container;
    if (container) {
      container.addEventListener('wheel', handler, { passive: false });
    }

    return () => {
      if (wheelAttachedRef.current) {
        wheelAttachedRef.current.removeEventListener('wheel', handler);
        wheelAttachedRef.current = null;
      }
    };
  });

  // ── Pan (click+drag on empty area — both X and Y) ──
  const panStartYRef = useRef(0);
  const panScrollTopRef = useRef(0);
  const didPanMoveRef = useRef(false);

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    e.preventDefault();
    isPanningRef.current = true;
    didPanMoveRef.current = false;
    panStartXRef.current = e.clientX;
    panStartYRef.current = e.clientY;
    panScrollLeftRef.current = container.scrollLeft;
    panScrollTopRef.current = container.scrollTop;
    container.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const handlePanMove = (moveEvent: MouseEvent) => {
      if (!isPanningRef.current) return;
      moveEvent.preventDefault();
      const dx = moveEvent.clientX - panStartXRef.current;
      const dy = moveEvent.clientY - panStartYRef.current;
      if (
        Math.abs(dx) > PAN_MOVE_THRESHOLD ||
        Math.abs(dy) > PAN_MOVE_THRESHOLD
      ) {
        didPanMoveRef.current = true;
      }
      container.scrollLeft = panScrollLeftRef.current - dx;
      container.scrollTop = panScrollTopRef.current - dy;
    };

    const handlePanEnd = () => {
      isPanningRef.current = false;
      container.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handlePanMove);
      document.removeEventListener('mouseup', handlePanEnd);
      document.removeEventListener('mouseleave', handlePanEnd);
      requestAnimationFrame(() => {
        didPanMoveRef.current = false;
      });
    };

    document.addEventListener('mousemove', handlePanMove);
    document.addEventListener('mouseup', handlePanEnd);
    document.addEventListener('mouseleave', handlePanEnd);
  }, []);

  return {
    timeScale,
    scrollContainerRef,
    fitToView,
    zoomBy,
    handlePanStart,
    didPanMoveRef,
  };
}

export { useTimelineZoomPan };
export type { UseTimelineZoomPanOptions, UseTimelineZoomPanReturn };
