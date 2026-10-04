import { cn } from '@/utils';
import type { ExecutionStepRecord } from '@/utils/nodeRunner/types';
import { Tooltip } from '@/components/atoms/Tooltip';
import { NodeIdentityLabel } from '@/components/atoms/NodeIdentityLabel';
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
        'timeline-block rbn:absolute rbn:cursor-pointer rbn:rounded-[2px]',
        statusBlockClass[step.status],
        isSelected && 'rbn:z-10 rbn:ring-1 rbn:ring-white rbn:ring-offset-0',
        !isSelected &&
          isSnapped &&
          !isNearestDragTarget &&
          'rbn:z-10 rbn:ring-2 rbn:ring-primary-blue rbn:ring-offset-0 rbn:shadow-[0_0_12px_var(--color-timeline-snap-glow)]',
        !isSelected &&
          isNearestDragTarget &&
          'rbn:z-10 rbn:ring-1 rbn:ring-white/70 rbn:ring-offset-0 rbn:brightness-125 rbn:shadow-[0_0_20px_var(--color-timeline-drag-target-glow)]',
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
          className='rbn:flex rbn:items-center rbn:px-2 rbn:text-[12px] rbn:font-normal rbn:text-timeline-hover-text rbn:drop-shadow-sm rbn:select-none'
          style={{ height: `${subRowHeight}px` }}
        >
          <NodeIdentityLabel
            typeName={step.nodeTypeName}
            customName={step.customName}
            protect='custom'
            className='rbn:min-w-0'
          />
        </span>
      )}
    </Tooltip>
  );
}

export { TimelineBlock };
