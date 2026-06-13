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
    <div className='flex flex-col items-center'>
      <div
        className={cn(
          'rounded px-1.5 py-0.5 font-mono text-[11px] text-white whitespace-nowrap',
          isDragging
            ? 'bg-timeline-scrubber-active'
            : 'bg-runner-scrubber-blue',
        )}
      >
        {formatTime(timeMs)}
      </div>
      <div className='h-0 w-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-runner-scrubber-blue' />
    </div>
  );
}

export { ScrubberHead };
