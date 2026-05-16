import {
  RULER_HEIGHT,
  MIN_LABEL_GAP_PX,
  niceTickInterval,
  formatTime,
} from './types';

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
  const roughInterval = MIN_LABEL_GAP_PX / timeScale;
  const tickInterval = niceTickInterval(roughInterval);

  const ticks: number[] = [];
  for (let t = 0; t <= totalDuration + tickInterval; t += tickInterval) {
    ticks.push(t);
  }

  return (
    <div
      className='relative border-b border-[#3a3a3a] bg-runner-ruler-bg'
      style={{ height: `${RULER_HEIGHT}px`, width: `${contentWidth}px` }}
    >
      <div
        className='relative h-full cursor-ew-resize select-none'
        onMouseDown={onScrubDown}
      >
        {ticks.map((t) => {
          const x = t * timeScale;
          if (x > contentWidth) return null;
          return (
            <div
              key={t}
              className='absolute bottom-1 -translate-x-1/2'
              style={{ left: `${x}px` }}
            >
              <span className='font-mono text-[11px] tabular-nums text-[#9a9a9a] select-none whitespace-nowrap'>
                {formatTime(t)}
              </span>
              <div className='absolute -bottom-1 left-1/2 h-1 w-px bg-[#555]' />
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
    <div className='pointer-events-none absolute inset-0'>
      {lines.map((x) => (
        <div
          key={x}
          className='absolute top-0 bottom-0 w-px bg-runner-grid-line'
          style={{ left: `${x}px` }}
        />
      ))}
    </div>
  );
}

export { TimeRuler, TimelineGrid };
