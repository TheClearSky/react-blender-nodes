import { Button } from '@/components/atoms';
import { cn } from '@/utils/cnHelper';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

type Orientation = 'horizontal' | 'vertical';

type ScrollableButtonContainerProps = {
  children?: React.ReactNode;
  orientation?: Orientation;
  className?: string;
  scrollAreaClassName?: string;
  showArrows?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  scrollSpeedPxPerFrame?: number;
  reserveArrowSpace?: boolean;
  observeChildren?: boolean;
};

const ScrollableButtonContainer = forwardRef<
  HTMLDivElement,
  ScrollableButtonContainerProps
>(
  (
    {
      children,
      orientation = 'horizontal',
      className,
      scrollAreaClassName,
      showArrows = true,
      disabled = false,
      ariaLabel,
      scrollSpeedPxPerFrame = 14,
      observeChildren = true,
    },
    ref,
  ) => {
    const listRef = useRef<HTMLDivElement | null>(null);
    const [canScrollStart, setCanScrollStart] = useState(false);
    const [canScrollEnd, setCanScrollEnd] = useState(false);
    const scrollRafRef = useRef<number | null>(null);
    const scrollingDirectionRef = useRef<null | 'start' | 'end'>(null);

    useImperativeHandle(ref, () => listRef.current as HTMLDivElement);

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

    const handleStartAutoScroll = useCallback(
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
    }, [updateScrollState]);

    useEffect(() => {
      const id = requestAnimationFrame(updateScrollState);
      return () => cancelAnimationFrame(id);
    }, [children, updateScrollState]);

    useEffect(() => {
      if (!observeChildren) return;
      const el = listRef.current;
      if (!el) return;
      const mo = new MutationObserver(() => updateScrollState());
      mo.observe(el, { childList: true, subtree: true });
      return () => mo.disconnect();
    }, [observeChildren, updateScrollState]);

    const showStart = showArrows && canScrollStart && !disabled;
    const showEnd = showArrows && canScrollEnd && !disabled;

    const scrollDefaults =
      orientation === 'horizontal'
        ? 'overflow-x-scroll overflow-y-hidden flex items-center gap-2 whitespace-nowrap'
        : 'overflow-y-scroll overflow-x-hidden flex flex-col items-start gap-2';

    return (
      <div className={cn('relative w-full h-full', className)}>
        {showStart && (
          <Button
            className={cn(
              'h-[44px] border-secondary-dark-gray bg-primary-black absolute z-10',
              orientation === 'horizontal'
                ? 'left-0 top-1/2 -translate-y-1/2'
                : 'top-0 left-1/2 -translate-x-1/2',
            )}
            disabled={!showStart}
            onMouseDown={() => handleStartAutoScroll('start')}
            onMouseUp={stopAutoScroll}
            onMouseLeave={stopAutoScroll}
            onTouchStart={() => handleStartAutoScroll('start')}
            onTouchEnd={stopAutoScroll}
          >
            {orientation === 'horizontal' ? <ChevronLeft /> : <ChevronUp />}
          </Button>
        )}
        <div
          ref={listRef}
          aria-label={ariaLabel}
          className={cn(
            'no-scrollbar w-full h-full',
            scrollDefaults,
            scrollAreaClassName,
          )}
        >
          {children}
        </div>
        {showEnd && (
          <Button
            className={cn(
              'h-[44px] border-secondary-dark-gray bg-primary-black absolute z-10',
              orientation === 'horizontal'
                ? 'right-0 top-1/2 -translate-y-1/2'
                : 'bottom-0 left-1/2 -translate-x-1/2',
            )}
            disabled={!showEnd}
            onMouseDown={() => handleStartAutoScroll('end')}
            onMouseUp={stopAutoScroll}
            onMouseLeave={stopAutoScroll}
            onTouchStart={() => handleStartAutoScroll('end')}
            onTouchEnd={stopAutoScroll}
          >
            {orientation === 'horizontal' ? <ChevronRight /> : <ChevronDown />}
          </Button>
        )}
      </div>
    );
  },
);

ScrollableButtonContainer.displayName = 'ScrollableButtonContainer';

export { ScrollableButtonContainer };
export type { ScrollableButtonContainerProps };
