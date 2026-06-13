import { cn } from '@/utils';
import type { ExecutionStepRecord } from '@/utils/nodeRunner/types';
import { Tooltip } from '@/components/atoms/Tooltip';
import {
  statusBlockClass,
  MIN_BLOCK_WIDTH,
  LABEL_MIN_WIDTH,
  LABEL_MIN_HEIGHT,
} from './types';
import { BlockTooltipContent } from './BlockTooltipContent';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

function TimelineBlock({
  step,
  timeScale,
  timeOffset = 0,
  isSelected,
  isSnapped,
  isNearestDragTarget,
  onClick,
  onScrubTo,
  subRowTop,
  subRowHeight,
}: {
  step: ExecutionStepRecord;
  timeScale: number;
  timeOffset?: number;
  isSelected: boolean;
  isSnapped: boolean;
  isNearestDragTarget: boolean;
  onClick: () => void;
  onScrubTo: () => void;
  subRowTop: number;
  subRowHeight: number;
}) {
  const theme = useGraphTheme();
  const left = (step.startTime - timeOffset) * timeScale;
  const width = Math.max(step.duration * timeScale, MIN_BLOCK_WIDTH);
  const showLabel = width > LABEL_MIN_WIDTH && subRowHeight >= LABEL_MIN_HEIGHT;

  return (
    <Tooltip
      as='div'
      placement='top'
      content={<BlockTooltipContent step={step} />}
      className={cn(
        'timeline-block absolute cursor-pointer rounded-[2px]',
        statusBlockClass[step.status],
        isSelected && 'z-10 ring-1 ring-white ring-offset-0',
        !isSelected &&
          isSnapped &&
          !isNearestDragTarget &&
          'z-10 ring-2 ring-primary-blue ring-offset-0 shadow-[0_0_12px_var(--color-timeline-snap-glow)]',
        !isSelected &&
          isNearestDragTarget &&
          'z-10 ring-1 ring-white/70 ring-offset-0 brightness-125 shadow-[0_0_20px_var(--color-timeline-drag-target-glow)]',
        theme?.timeline?.block,
      )}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        top: `${subRowTop}px`,
        height: `${subRowHeight}px`,
      }}
      triggerProps={
        {
          'data-step-index': step.stepIndex,
          onClick: (e) => {
            e.stopPropagation();
            onClick();
          },
          onContextMenu: (e) => {
            e.preventDefault();
            e.stopPropagation();
            onScrubTo();
          },
        } as React.HTMLAttributes<HTMLElement>
      }
    >
      {showLabel && (
        <span
          className='block truncate px-2 text-[12px] font-normal text-timeline-hover-text drop-shadow-sm select-none'
          style={{ lineHeight: `${subRowHeight}px` }}
        >
          {step.nodeTypeName}
        </span>
      )}
    </Tooltip>
  );
}

export { TimelineBlock };
