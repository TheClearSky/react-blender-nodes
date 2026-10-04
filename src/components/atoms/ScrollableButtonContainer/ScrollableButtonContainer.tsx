import { Button } from '@/components/atoms/Button';
import { cn } from '@/utils/cnHelper';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react';
import { forwardRef, useImperativeHandle } from 'react';
import { useAutoScroll } from '@/hooks/useAutoScroll';

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
    const {
      listRef,
      canScrollStart,
      canScrollEnd,
      startAutoScroll: handleStartAutoScroll,
      stopAutoScroll,
    } = useAutoScroll({
      orientation,
      disabled,
      scrollSpeedPxPerFrame,
      observeChildren,
    });

    useImperativeHandle(ref, () => listRef.current!);

    const showStart = showArrows && canScrollStart && !disabled;
    const showEnd = showArrows && canScrollEnd && !disabled;

    const scrollDefaults =
      orientation === 'horizontal'
        ? 'rbn:overflow-x-scroll rbn:overflow-y-hidden rbn:flex rbn:items-center rbn:gap-2 rbn:whitespace-nowrap'
        : 'rbn:overflow-y-scroll rbn:overflow-x-hidden rbn:flex rbn:flex-col rbn:items-start rbn:gap-2';

    return (
      <div className={cn('rbn:relative rbn:w-full rbn:h-full', className)}>
        {showStart && (
          <Button
            className={cn(
              'rbn:h-[44px] rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:absolute rbn:z-10',
              orientation === 'horizontal'
                ? 'rbn:left-0 rbn:top-1/2 rbn:-translate-y-1/2'
                : 'rbn:top-0 rbn:left-1/2 rbn:-translate-x-1/2',
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
            'rbn:no-scrollbar rbn:w-full rbn:h-full',
            scrollDefaults,
            scrollAreaClassName,
          )}
        >
          {children}
        </div>
        {showEnd && (
          <Button
            className={cn(
              'rbn:h-[44px] rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:absolute rbn:z-10',
              orientation === 'horizontal'
                ? 'rbn:right-0 rbn:top-1/2 rbn:-translate-y-1/2'
                : 'rbn:bottom-0 rbn:left-1/2 rbn:-translate-x-1/2',
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
