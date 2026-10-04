import { cn } from '@/utils';
import { formatTime } from './types';

function ScrubberHead({
  timeMs,
  isDragging,
}: {
  timeMs: number;
  isDragging: boolean;
}) {
  return (
    <div className='rbn:flex rbn:flex-col rbn:items-center'>
      <div
        className={cn(
          'rbn:rounded rbn:px-1.5 rbn:py-0.5 rbn:font-mono rbn:text-[11px] rbn:text-white rbn:whitespace-nowrap',
          isDragging
            ? 'rbn:bg-timeline-scrubber-active'
            : 'rbn:bg-runner-scrubber-blue',
        )}
      >
        {formatTime(timeMs)}
      </div>
      <div className='rbn:h-0 rbn:w-0 rbn:border-l-[4px] rbn:border-r-[4px] rbn:border-t-[4px] rbn:border-l-transparent rbn:border-r-transparent rbn:border-t-runner-scrubber-blue' />
    </div>
  );
}

export { ScrubberHead };
