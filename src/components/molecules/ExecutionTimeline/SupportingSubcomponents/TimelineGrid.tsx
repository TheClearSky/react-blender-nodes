import {
  RULER_HEIGHT,
  MIN_LABEL_GAP_PX,
  niceTickInterval,
  formatTime,
} from './types';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

// ─────────────────────────────────────────────────────
// TimeRuler — at top, with duration/step info
// ─────────────────────────────────────────────────────

function TimeRuler({
  timeScale,
  contentWidth,
  totalDuration,
  onScrubDown,
}: {
  timeScale: number;
  contentWidth: number;
  totalDuration: number;
  onScrubDown: (e: React.MouseEvent) => void;
}) {
  const theme = useGraphTheme();
  const roughInterval = MIN_LABEL_GAP_PX / timeScale;
  const tickInterval = niceTickInterval(roughInterval);

  const ticks: number[] = [];
  for (let t = 0; t <= totalDuration + tickInterval; t += tickInterval) {
    ticks.push(t);
  }

  return (
    <div
      className={cn(
        'rbn:relative rbn:border-b rbn:border-timeline-ruler-border rbn:bg-runner-ruler-bg',
        theme?.timeline?.ruler,
      )}
      style={{ height: `${RULER_HEIGHT}px`, width: `${contentWidth}px` }}
    >
      <div
        className='rbn:relative rbn:h-full rbn:cursor-ew-resize rbn:select-none'
        onMouseDown={onScrubDown}
      >
        {ticks.map((t) => {
          const x = t * timeScale;
          if (x > contentWidth) return null;
          return (
            <div
              key={t}
              className='rbn:absolute rbn:bottom-1 rbn:-translate-x-1/2'
              style={{ left: `${x}px` }}
            >
              <span className='rbn:font-mono rbn:text-[11px] rbn:tabular-nums rbn:text-runner-muted-text rbn:select-none rbn:whitespace-nowrap'>
                {formatTime(t)}
              </span>
              <div className='rbn:absolute rbn:-bottom-1 rbn:left-1/2 rbn:h-1 rbn:w-px rbn:bg-timeline-tick' />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// TimelineGrid — vertical grid lines
// ─────────────────────────────────────────────────────

function TimelineGrid({
  timeScale,
  contentWidth,
  totalDuration,
}: {
  timeScale: number;
  contentWidth: number;
  totalDuration: number;
}) {
  const roughInterval = MIN_LABEL_GAP_PX / timeScale;
  const tickInterval = niceTickInterval(roughInterval);

  const lines: number[] = [];
  for (let t = 0; t <= totalDuration + tickInterval; t += tickInterval) {
    const x = t * timeScale;
    if (x <= contentWidth) lines.push(x);
  }

  return (
    <div className='rbn:pointer-events-none rbn:absolute rbn:inset-0'>
      {lines.map((x) => (
        <div
          key={x}
          className='rbn:absolute rbn:top-0 rbn:bottom-0 rbn:w-px rbn:bg-runner-grid-line'
          style={{ left: `${x}px` }}
        />
      ))}
    </div>
  );
}

export { TimeRuler, TimelineGrid };
