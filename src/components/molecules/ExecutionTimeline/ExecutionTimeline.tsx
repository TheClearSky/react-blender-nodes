import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChevronRight, ZoomOut, ZoomIn, Maximize2, Info } from 'lucide-react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useTransitionStyles,
  FloatingPortal,
  arrow,
  FloatingArrow,
} from '@floating-ui/react';
import { useFloatingTooltip } from '@/hooks/useFloatingTooltip';
import { cn } from '@/utils';
import type {
  ExecutionRecord,
  ExecutionStepRecord,
  ExecutionStepRecordStatus,
} from '@/utils/nodeRunner/types';
import { useTimelineZoomPan } from './useTimelineZoomPan';
import { useTimelineScrub } from './useTimelineScrub';

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────

const TRACK_HEIGHT = 28;
const BLOCK_PADDING_Y = 3;
const SUB_ROW_GAP = 4;
const RULER_HEIGHT = 32;
const MIN_BLOCK_WIDTH = 6;
const GUTTER_WIDTH = 0;
const TIME_PAD_RIGHT_MS = 0.15;
const MIN_LABEL_GAP_PX = 48;
const LABEL_MIN_WIDTH = 50;
const LABEL_MIN_HEIGHT = 18;

// ─────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────

type ExecutionTimelineProps = {
  record: ExecutionRecord | null;
  currentStepIndex: number;
  onScrubTo: (stepIndex: number) => void;
  onStepClick: (stepRecord: ExecutionStepRecord) => void;
  selectedStepIndex: number | null;
};

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

const statusBlockClass: Record<ExecutionStepRecordStatus, string> = {
  completed: 'bg-runner-bar-completed',
  errored: 'bg-runner-bar-errored',
  skipped: 'bg-status-skipped',
};

const statusTooltipClass: Record<ExecutionStepRecordStatus, string> = {
  completed: 'text-status-completed',
  errored: 'text-status-errored',
  skipped: 'text-secondary-light-gray',
};

const statusLabel: Record<ExecutionStepRecordStatus, string> = {
  completed: 'Done',
  errored: 'Error',
  skipped: 'Skipped',
};

function niceTickInterval(roughInterval: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(roughInterval)));
  const residual = roughInterval / mag;
  if (residual <= 1) return mag;
  if (residual <= 2) return 2 * mag;
  if (residual <= 5) return 5 * mag;
  return 10 * mag;
}

function formatTime(ms: number): string {
  if (ms === 0) return '0';
  if (ms < 0) return '0';
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─────────────────────────────────────────────────────
// BlockTooltip
// ─────────────────────────────────────────────────────

function BlockTooltip({
  step,
  blockRef,
  isOpen,
}: {
  step: ExecutionStepRecord;
  blockRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
}) {
  const arrowRef = useRef<SVGSVGElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: () => {},
    middleware: [
      offset(10),
      flip(),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: autoUpdate,
    placement: 'top',
  });

  useEffect(() => {
    if (blockRef.current) {
      refs.setPositionReference(blockRef.current);
    }
  }, [blockRef, refs]);

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: 150,
    initial: { opacity: 0, transform: 'translateY(4px)' },
  });

  if (!isMounted) return null;

  return (
    <div
      ref={refs.setFloating}
      style={{ ...floatingStyles, pointerEvents: 'none', zIndex: 50 }}
    >
      <div
        style={transitionStyles}
        className='z-50 rounded-md border border-secondary-dark-gray/60 bg-tooltip-bg px-3 py-2 shadow-2xl backdrop-blur-sm'
      >
        <div className='flex items-center gap-2'>
          <span className='text-[12px] font-semibold text-primary-white'>
            {step.nodeTypeName}
          </span>
          <span
            className={cn(
              'text-[10px] font-medium',
              statusTooltipClass[step.status],
            )}
          >
            {statusLabel[step.status]}
          </span>
        </div>
        <div className='mt-1 flex items-center gap-2 text-[10px] text-secondary-light-gray'>
          <span className='font-mono tabular-nums'>
            {step.duration.toFixed(2)}ms
          </span>
          <span className='text-secondary-dark-gray'>&middot;</span>
          <span>Step {step.stepIndex}</span>
        </div>
        <FloatingArrow
          ref={arrowRef}
          context={context}
          width={10}
          height={5}
          fill='var(--color-tooltip-bg)'
          strokeWidth={1}
          stroke='var(--color-secondary-dark-gray)'
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// TimelineBlock
// ─────────────────────────────────────────────────────

function TimelineBlock({
  step,
  timeScale,
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
  isSelected: boolean;
  isSnapped: boolean;
  isNearestDragTarget: boolean;
  onClick: () => void;
  onScrubTo: () => void;
  subRowTop: number;
  subRowHeight: number;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

  const left = step.startTime * timeScale;
  const width = Math.max(step.duration * timeScale, MIN_BLOCK_WIDTH);
  const showLabel = width > LABEL_MIN_WIDTH && subRowHeight >= LABEL_MIN_HEIGHT;

  return (
    <>
      <div
        ref={blockRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onScrubTo();
        }}
        className={cn(
          'timeline-block absolute cursor-pointer rounded-[2px]',
          statusBlockClass[step.status],
          isSelected && 'z-10 ring-1 ring-white ring-offset-0',
          !isSelected &&
            isSnapped &&
            !isNearestDragTarget &&
            'z-10 ring-2 ring-primary-blue ring-offset-0 shadow-[0_0_12px_rgba(71,114,179,0.4)]',
          !isSelected &&
            isNearestDragTarget &&
            'z-10 ring-1 ring-white/70 ring-offset-0 brightness-125 shadow-[0_0_20px_rgba(71,114,179,0.7)]',
        )}
        style={{
          left: `${left}px`,
          width: `${width}px`,
          top: `${subRowTop}px`,
          height: `${subRowHeight}px`,
        }}
      >
        {showLabel && (
          <span
            className='block truncate px-2 text-[12px] font-normal text-[#eee] drop-shadow-sm select-none'
            style={{ lineHeight: `${subRowHeight}px` }}
          >
            {step.nodeTypeName}
          </span>
        )}
      </div>
      <BlockTooltip step={step} blockRef={blockRef} isOpen={isHovered} />
    </>
  );
}

// ─────────────────────────────────────────────────────
// TimelineTrack — no gutter labels
// ─────────────────────────────────────────────────────

function TimelineTrack({
  steps,
  timeScale,
  contentWidth,
  selectedStepIndex,
  currentStepIndex,
  nearestDragStepIndex,
  onStepClick,
  onScrubTo,
}: {
  steps: ReadonlyArray<ExecutionStepRecord>;
  timeScale: number;
  contentWidth: number;
  selectedStepIndex: number | null;
  currentStepIndex: number;
  nearestDragStepIndex: number | null;
  onStepClick: (step: ExecutionStepRecord) => void;
  onScrubTo: (stepIndex: number) => void;
}) {
  const rowCount = steps.length;
  const totalGap = rowCount > 1 ? (rowCount - 1) * SUB_ROW_GAP : 0;
  const trackHeight =
    rowCount > 1
      ? TRACK_HEIGHT +
        (rowCount - 1) * (TRACK_HEIGHT - BLOCK_PADDING_Y * 2) +
        totalGap
      : TRACK_HEIGHT;
  const usableHeight = trackHeight - BLOCK_PADDING_Y * 2 - totalGap;
  const subRowHeight = rowCount > 0 ? usableHeight / rowCount : usableHeight;

  return (
    <div
      className='relative'
      style={{
        height: `${trackHeight}px`,
        width: `${contentWidth}px`,
        marginBottom: `${SUB_ROW_GAP}px`,
      }}
    >
      {steps.map((step, i) => (
        <TimelineBlock
          key={`${step.nodeId}-${step.stepIndex}`}
          step={step}
          timeScale={timeScale}
          isSelected={selectedStepIndex === step.stepIndex}
          isSnapped={currentStepIndex === step.stepIndex}
          isNearestDragTarget={nearestDragStepIndex === step.stepIndex}
          onClick={() => onStepClick(step)}
          onScrubTo={() => onScrubTo(step.stepIndex)}
          subRowTop={BLOCK_PADDING_Y + i * (subRowHeight + SUB_ROW_GAP)}
          subRowHeight={subRowHeight}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// TimeRuler — at top, with duration/step info
// ─────────────────────────────────────────────────────

function TimeRuler({
  timeScale,
  contentWidth,
  totalDuration,
  onScrubDown,
  displayDuration,
  stepCount,
}: {
  timeScale: number;
  contentWidth: number;
  totalDuration: number;
  onScrubDown: (e: React.MouseEvent) => void;
  displayDuration: number;
  stepCount: number;
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

      {/* Duration / step count info — right edge */}
      <div className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 font-mono text-[10px] text-secondary-light-gray'>
        <span className='tabular-nums'>{displayDuration.toFixed(2)}ms</span>
        <span>&middot;</span>
        <span>{stepCount} steps</span>
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

// ─────────────────────────────────────────────────────
// ScrubberHead — blue pill with time value
// ─────────────────────────────────────────────────────

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
          isDragging ? 'bg-[#6a9be0]' : 'bg-runner-scrubber-blue',
        )}
      >
        {formatTime(timeMs)}
      </div>
      <div className='h-0 w-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-runner-scrubber-blue' />
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Time mode types & info tooltip
// ─────────────────────────────────────────────────────

type TimeMode = 'execution' | 'wallClock';

function TimeModeInfoTooltip() {
  const {
    refs,
    floatingStyles,
    getReferenceProps,
    getFloatingProps,
    isMounted,
    transitionStyles,
  } = useFloatingTooltip({
    placement: 'bottom',
    offsetPx: 6,
    hoverDelay: { open: 200, close: 0 },
    transitionDuration: 150,
    withArrow: false,
    initialTransition: { opacity: 0, transform: 'translateY(-4px)' },
  });

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        type='button'
        className='flex h-5 w-5 items-center justify-center rounded-full text-secondary-light-gray transition-colors hover:bg-primary-dark-gray hover:text-primary-white'
      >
        <Info className='h-3 w-3' />
      </button>
      {isMounted && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, ...transitionStyles }}
            {...getFloatingProps()}
            className='z-50 max-w-[240px] rounded-md border border-secondary-dark-gray/60 bg-tooltip-bg px-3 py-2 shadow-2xl backdrop-blur-sm'
          >
            <div className='space-y-1.5 text-[10px] leading-relaxed text-secondary-light-gray'>
              <div>
                <span className='font-semibold text-primary-white'>
                  Execution
                </span>{' '}
                — Shows only computation time with pauses removed. Best for
                step-by-step mode.
              </div>
              <div>
                <span className='font-semibold text-primary-white'>
                  Wall Clock
                </span>{' '}
                — Shows real elapsed time including pauses between steps.
              </div>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────

function ExecutionTimeline({
  record,
  currentStepIndex,
  onScrubTo,
  onStepClick,
  selectedStepIndex,
}: ExecutionTimelineProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [timeMode, setTimeMode] = useState<TimeMode>('execution');

  // ── Adjusted steps (subtract pause time in execution mode) ──
  const hasPauseData = (record?.totalPauseDuration ?? 0) > 0;

  const adjustedSteps = useMemo(() => {
    if (!record) return [] as ExecutionStepRecord[];
    if (timeMode === 'wallClock') return record.steps as ExecutionStepRecord[];
    return record.steps.map((step) => ({
      ...step,
      startTime: step.startTime - step.pauseAdjustment,
      endTime: step.endTime - step.pauseAdjustment,
    }));
  }, [record, timeMode]);

  const adjustedTotalDuration = record
    ? timeMode === 'execution'
      ? record.totalDuration - record.totalPauseDuration
      : record.totalDuration
    : 0;

  // ── Zoom & Pan ──
  const {
    timeScale,
    scrollContainerRef,
    fitToView,
    zoomBy,
    handlePanStart,
    didPanMoveRef,
  } = useTimelineZoomPan({
    adjustedTotalDuration,
    timePadRightMs: TIME_PAD_RIGHT_MS,
    gutterWidth: GUTTER_WIDTH,
  });

  // ── Group steps by concurrency level ──
  const stepsByLevel = useMemo(() => {
    if (adjustedSteps.length === 0)
      return new Map<number, ExecutionStepRecord[]>();
    const grouped = new Map<number, ExecutionStepRecord[]>();
    for (const step of adjustedSteps) {
      const existing = grouped.get(step.concurrencyLevel);
      if (existing) {
        existing.push(step);
      } else {
        grouped.set(step.concurrencyLevel, [step]);
      }
    }
    return grouped;
  }, [adjustedSteps]);

  const sortedLevels = useMemo(
    () => Array.from(stepsByLevel.keys()).sort((a, b) => a - b),
    [stepsByLevel],
  );

  const totalDuration =
    adjustedTotalDuration + adjustedTotalDuration * TIME_PAD_RIGHT_MS;
  const contentWidth = totalDuration * timeScale;

  // ── Scrub ──
  const {
    scrubberPx,
    isDraggingScrubber,
    nearestDragStepIndex,
    isSnapping,
    handleRulerScrubDown,
    handleScrubberMouseDown,
    onSnapTransitionEnd,
  } = useTimelineScrub({
    steps: adjustedSteps,
    timeScale,
    contentWidth,
    currentStepIndex,
    scrollContainerRef,
    gutterWidth: GUTTER_WIDTH,
    onScrubTo,
  });

  // Wrap onStepClick to suppress clicks that occur right after a pan gesture
  const guardedStepClick = useCallback(
    (step: ExecutionStepRecord) => {
      if (didPanMoveRef.current) return;
      onStepClick(step);
    },
    [onStepClick, didPanMoveRef],
  );

  const scrubberTimeMs = timeScale > 0 ? scrubberPx / timeScale : 0;

  // ── Empty state ──
  if (!record) {
    return (
      <div className='flex h-full flex-col bg-runner-toolbar-bg'>
        {/* Header */}
        <div className='flex h-10 items-center justify-between bg-runner-toolbar-bg px-4'>
          <div className='flex items-center gap-2 text-[14px] text-primary-white'>
            <ChevronRight className='h-3 w-3 text-secondary-light-gray' />
            Timeline
          </div>
        </div>
        <div className='flex-1 p-4 pt-0'>
          <div className='flex h-full flex-col items-center justify-center gap-2 rounded-md border border-runner-timeline-box-border bg-runner-timeline-box-bg'>
            <div className='flex items-center gap-1.5'>
              <div className='h-1.5 w-6 rounded-full bg-secondary-dark-gray' />
              <div className='h-1.5 w-10 rounded-full bg-secondary-dark-gray' />
              <div className='h-1.5 w-4 rounded-full bg-secondary-dark-gray' />
            </div>
            <span className='text-[11px] text-secondary-light-gray'>
              No execution record to display
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col bg-runner-toolbar-bg'>
      {/* Header — toolbar-middle */}
      <div className='flex h-10 items-center justify-between px-4'>
        <button
          type='button'
          onClick={() => setIsCollapsed(!isCollapsed)}
          className='btn-press flex items-center gap-2 rounded px-1.5 py-1 text-[14px] text-primary-white transition-colors hover:bg-primary-dark-gray/50'
        >
          <span
            className={cn(
              'transition-transform duration-150',
              !isCollapsed && 'rotate-90',
            )}
          >
            <ChevronRight className='h-3 w-3 text-secondary-light-gray' />
          </span>
          Timeline
        </button>

        <div className='flex items-center gap-3'>
          {/* Time mode toggle — only visible when pause data exists */}
          {hasPauseData && (
            <div className='flex items-center gap-1'>
              <div className='flex overflow-hidden rounded-md border border-secondary-dark-gray/80'>
                <button
                  type='button'
                  onClick={() => setTimeMode('execution')}
                  className={cn(
                    'btn-press px-2 py-0.5 text-[10px] font-medium transition-all duration-100',
                    timeMode === 'execution'
                      ? 'bg-primary-blue text-white'
                      : 'bg-secondary-black text-secondary-light-gray hover:bg-primary-dark-gray hover:text-primary-white',
                  )}
                >
                  Execution
                </button>
                <button
                  type='button'
                  onClick={() => setTimeMode('wallClock')}
                  className={cn(
                    'btn-press border-l border-secondary-dark-gray/50 px-2 py-0.5 text-[10px] font-medium transition-all duration-100',
                    timeMode === 'wallClock'
                      ? 'bg-primary-blue text-white'
                      : 'bg-secondary-black text-secondary-light-gray hover:bg-primary-dark-gray hover:text-primary-white',
                  )}
                >
                  Wall Clock
                </button>
              </div>
              <TimeModeInfoTooltip />
            </div>
          )}

          <div className='flex items-center gap-3'>
            <button
              type='button'
              onClick={() => zoomBy(1.5)}
              className='btn-press text-secondary-light-gray transition-colors hover:text-primary-white'
              title='Zoom In'
            >
              <ZoomIn className='h-4 w-4' />
            </button>
            <button
              type='button'
              onClick={() => zoomBy(1 / 1.5)}
              className='btn-press text-secondary-light-gray transition-colors hover:text-primary-white'
              title='Zoom Out'
            >
              <ZoomOut className='h-4 w-4' />
            </button>
            <button
              type='button'
              onClick={fitToView}
              className='btn-press text-secondary-light-gray transition-colors hover:text-primary-white'
              title='Fit to View'
            >
              <Maximize2 className='h-4 w-4' />
            </button>
          </div>
        </div>
      </div>

      {/* Accordion body — padded container for the timeline box */}
      {!isCollapsed && (
        <div className='min-h-0 flex-1 px-4 pb-4'>
          <div className='flex h-full flex-col overflow-hidden rounded-md border border-runner-timeline-box-border bg-runner-timeline-box-bg'>
            {/* Scrollable timeline content */}
            <div
              ref={scrollContainerRef}
              className='timeline-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto'
              onMouseDown={handlePanStart}
            >
              <div
                className='relative flex min-h-full flex-col'
                style={{ width: `${contentWidth}px` }}
              >
                {/* Ruler at top */}
                <TimeRuler
                  timeScale={timeScale}
                  contentWidth={contentWidth}
                  totalDuration={totalDuration}
                  onScrubDown={handleRulerScrubDown}
                  displayDuration={adjustedTotalDuration}
                  stepCount={record.steps.length}
                />

                {/* Tracks area with grid lines */}
                <div className='relative' style={{ minHeight: '120px' }}>
                  <TimelineGrid
                    timeScale={timeScale}
                    contentWidth={contentWidth}
                    totalDuration={totalDuration}
                  />
                  <div className='pt-3'>
                    {sortedLevels.map((level) => {
                      const steps = stepsByLevel.get(level);
                      if (!steps) return null;
                      return (
                        <TimelineTrack
                          key={level}
                          steps={steps}
                          timeScale={timeScale}
                          contentWidth={contentWidth}
                          selectedStepIndex={selectedStepIndex}
                          currentStepIndex={currentStepIndex}
                          nearestDragStepIndex={nearestDragStepIndex}
                          onStepClick={guardedStepClick}
                          onScrubTo={onScrubTo}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* ── Full-height scrubber overlay ── */}
                <div
                  className='pointer-events-none absolute inset-y-0 z-[15]'
                  style={{
                    left: `${scrubberPx}px`,
                    transition: isSnapping ? 'left 150ms ease-out' : 'none',
                  }}
                  onTransitionEnd={onSnapTransitionEnd}
                >
                  {/* Wide invisible hit area for dragging */}
                  <div
                    className='pointer-events-auto absolute left-1/2 top-0 bottom-0 w-4 -translate-x-1/2 cursor-ew-resize'
                    onMouseDown={handleScrubberMouseDown}
                  />

                  {/* Vertical line */}
                  <div
                    className='pointer-events-none absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2'
                    style={{
                      backgroundColor: isDraggingScrubber
                        ? 'rgba(74, 133, 255, 0.7)'
                        : 'rgba(74, 133, 255, 0.5)',
                    }}
                  />

                  {/* Scrubber head — time pill anchored in ruler area */}
                  <div
                    className='pointer-events-auto absolute left-1/2 -translate-x-1/2 cursor-ew-resize'
                    style={{ top: '2px' }}
                    onMouseDown={handleScrubberMouseDown}
                  >
                    <ScrubberHead
                      timeMs={scrubberTimeMs}
                      isDragging={isDraggingScrubber}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { ExecutionTimeline };

export type { ExecutionTimelineProps };
