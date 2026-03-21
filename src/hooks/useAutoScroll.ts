import { useCallback, useEffect, useRef, useState } from 'react';

type UseAutoScrollOptions = {
  /** Scroll axis @default 'horizontal' */
  orientation?: 'horizontal' | 'vertical';
  /** Disable all scroll detection and auto-scrolling @default false */
  disabled?: boolean;
  /** Pixels scrolled per animation frame @default 14 */
  scrollSpeedPxPerFrame?: number;
  /** Watch for child DOM mutations to recalculate scroll state @default true */
  observeChildren?: boolean;
};

type UseAutoScrollReturn = {
  /** Ref to attach to the scrollable container element */
  listRef: React.RefObject<HTMLDivElement | null>;
  /** Whether content overflows at the start (left / top) */
  canScrollStart: boolean;
  /** Whether content overflows at the end (right / bottom) */
  canScrollEnd: boolean;
  /** Begin continuous scrolling in a direction (call on button press) */
  startAutoScroll: (direction: 'start' | 'end') => void;
  /** Stop continuous scrolling (call on button release) */
  stopAutoScroll: () => void;
};

/**
 * Manages overflow-scroll state detection and RAF-based auto-scrolling.
 *
 * Tracks whether the container can scroll in each direction via
 * scroll events, ResizeObserver, window resize, and optional
 * MutationObserver on children. Provides start/stop controls for
 * continuous scrolling driven by requestAnimationFrame.
 */
function useAutoScroll({
  orientation = 'horizontal',
  disabled = false,
  scrollSpeedPxPerFrame = 14,
  observeChildren = true,
}: UseAutoScrollOptions = {}): UseAutoScrollReturn {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);
  const scrollRafRef = useRef<number | null>(null);
  const scrollingDirectionRef = useRef<null | 'start' | 'end'>(null);

  const getAxis = useCallback(() => {
    if (orientation === 'vertical') {
      return {
        pos: 'scrollTop' as const,
        size: 'clientHeight' as const,
        full: 'scrollHeight' as const,
      };
    }
    return {
      pos: 'scrollLeft' as const,
      size: 'clientWidth' as const,
      full: 'scrollWidth' as const,
    };
  }, [orientation]);

  const updateScrollState = useCallback(() => {
    const el = listRef.current;
    if (!el || disabled) {
      setCanScrollStart(false);
      setCanScrollEnd(false);
      return;
    }
    const axis = getAxis();
    const pos = el[axis.pos];
    const size = el[axis.size];
    const full = el[axis.full];
    setCanScrollStart(pos > 0);
    setCanScrollEnd(pos + size < full - 1);
  }, [disabled, getAxis]);

  const stopAutoScroll = useCallback(() => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollingDirectionRef.current = null;
  }, []);

  const tickScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !scrollingDirectionRef.current || disabled) {
      stopAutoScroll();
      return;
    }
    const axis = getAxis();
    const direction = scrollingDirectionRef.current === 'start' ? -1 : 1;
    if (axis.pos === 'scrollLeft') {
      el.scrollLeft += direction * scrollSpeedPxPerFrame;
    } else {
      el.scrollTop += direction * scrollSpeedPxPerFrame;
    }

    updateScrollState();

    const reachedEnd =
      (direction < 0 && !canScrollStart) || (direction > 0 && !canScrollEnd);
    if (reachedEnd) {
      stopAutoScroll();
      return;
    }
    scrollRafRef.current = requestAnimationFrame(tickScroll);
  }, [
    canScrollEnd,
    canScrollStart,
    disabled,
    getAxis,
    scrollSpeedPxPerFrame,
    stopAutoScroll,
    updateScrollState,
  ]);

  const startAutoScroll = useCallback(
    (direction: 'start' | 'end') => {
      if (disabled) return;
      if (scrollingDirectionRef.current === direction) return;
      scrollingDirectionRef.current = direction;
      if (scrollRafRef.current !== null)
        cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(tickScroll);
    },
    [disabled, tickScroll],
  );

  // Scroll, resize, and pointer-up listeners
  useEffect(() => {
    updateScrollState();
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => updateScrollState());
      resizeObserver.observe(el);
    }

    const onWindowResize = () => updateScrollState();
    window.addEventListener('resize', onWindowResize);

    const onWindowPointerUp = () => stopAutoScroll();
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('touchend', onWindowPointerUp);

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('touchend', onWindowPointerUp);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [updateScrollState, stopAutoScroll]);

  // Recalculate on next frame when children change (prop-driven)
  useEffect(() => {
    const id = requestAnimationFrame(updateScrollState);
    return () => cancelAnimationFrame(id);
  }, [updateScrollState]);

  // MutationObserver for child DOM changes
  useEffect(() => {
    if (!observeChildren) return;
    const el = listRef.current;
    if (!el) return;
    const mo = new MutationObserver(() => updateScrollState());
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [observeChildren, updateScrollState]);

  return {
    listRef,
    canScrollStart,
    canScrollEnd,
    startAutoScroll,
    stopAutoScroll,
  };
}

export { useAutoScroll };
export type { UseAutoScrollOptions, UseAutoScrollReturn };
