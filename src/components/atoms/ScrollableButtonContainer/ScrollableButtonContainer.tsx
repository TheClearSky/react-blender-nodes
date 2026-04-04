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

    useImperativeHandle(ref, () => listRef.current as HTMLDivElement);

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
