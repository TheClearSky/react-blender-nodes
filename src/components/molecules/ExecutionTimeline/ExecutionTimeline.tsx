import { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Play,
  Square,
  ZoomOut,
  ZoomIn,
  Maximize2,
  Timer,
  Layers,
  Zap,
} from 'lucide-react';
import { cn } from '@/utils';
import type {
  ExecutionRecord,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/types';
import { useRecordingViewState } from '@/components/organisms/FullGraph/RecordingViewStateContext';
import { SliderNumberInput } from '@/components/molecules/SliderNumberInput/SliderNumberInput';
import { Tooltip } from '@/components/atoms/Tooltip';
import { ButtonToggle } from '@/components/molecules/ButtonToggle';
import { useTimelineZoomPan } from './useTimelineZoomPan';
import { useTimelineScrub } from './useTimelineScrub';
import { useTimelineAutoplay } from './useTimelineAutoplay';
import {
  GUTTER_WIDTH,
  TIME_PAD_RIGHT_MS,
  TIME_MODE_OPTIONS,
  buildSegments,
  type TimelineSegment,
  type LoopSegment,
} from './SupportingSubcomponents/types';
import { FlatSection } from './SupportingSubcomponents/FlatSection';
import { LoopSection } from './SupportingSubcomponents/LoopComponents';
import {
  TimeRuler,
  TimelineGrid,
} from './SupportingSubcomponents/TimelineGrid';
import { ScrubberHead } from './SupportingSubcomponents/ScrubberHead';

// ─────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────

type ExecutionTimelineProps = {
  record: ExecutionRecord | null;
  currentStepIndex: number;
  onScrubTo: (stepIndex: number) => void;
  onStepClick: (stepRecord: ExecutionStepRecord) => void;
  selectedStepIndex: number | null;
  /** Called when the user navigates to a node via prev/next buttons. */
  onNavigateToNode?: (nodeId: string) => void;
};

// ─────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────

function ExecutionTimeline({
  record,
  currentStepIndex,
  onScrubTo,
  onStepClick,
  selectedStepIndex,
  onNavigateToNode,
}: ExecutionTimelineProps) {
  const {
    autoScroll,
    setAutoScroll,
    timeMode,
    setTimeMode,
    timelineCollapsed: isCollapsed,
    setTimelineCollapsed: setIsCollapsed,
    selectedIterations,
    setSelectedIterations,
    autoplayIntervalSec,
    setAutoplayIntervalSec,
  } = useRecordingViewState();

  // ── Adjusted steps (subtract pause time in execution mode) ──
  const hasPauseData = (record?.totalPauseDuration ?? 0) > 0;

  const adjustedSteps = useMemo<readonly ExecutionStepRecord[]>(() => {
    if (!record) return [];
    if (timeMode === 'wallClock') return record.steps;
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

  // ── Segments ──
  const segments = useMemo<TimelineSegment[]>(() => {
    if (!record) return [];
    return buildSegments(
      adjustedSteps,
      record.loopRecords,
      timeMode === 'execution',
    );
  }, [adjustedSteps, record, timeMode]);

  // Auto-select first iteration of first loop on initial render
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current || segments.length === 0) return;
    const firstLoop = segments.find((s): s is LoopSegment => s.kind === 'loop');
    if (firstLoop) {
      hasAutoSelected.current = true;
      setSelectedIterations(new Map([[firstLoop.loopStructureId, 0]]));
    }
  }, [segments]);

  // Auto-select iteration when a step inside a loop is clicked
  useEffect(() => {
    if (selectedStepIndex === null || !record) return;
    const step = record.steps.find((s) => s.stepIndex === selectedStepIndex);
    if (
      step?.loopStructureId !== undefined &&
      step.loopIteration !== undefined
    ) {
      setSelectedIterations((prev) => {
        const next = new Map(prev);
        next.set(step.loopStructureId!, step.loopIteration!);
        return next;
      });
    }
  }, [selectedStepIndex, record]);

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

  const tracksContainerRef = useRef<HTMLDivElement>(null);

  // ── Autoplay & step navigation ──
  const {
    isAutoplaying,
    canGoPrev,
    canGoNext,
    goToPrevStep,
    goToNextStep,
    goToStart,
    goToEnd,
    toggleAutoplay,
  } = useTimelineAutoplay({
    record,
    currentStepIndex,
    selectedStepIndex,
    adjustedSteps,
    timeScale,
    autoScroll,
    autoplayIntervalSec,
    isDraggingScrubber,
    scrollContainerRef,
    setSelectedIterations,
    onStepClick,
    onNavigateToNode,
  });

  // ── Empty state ──
  if (!record) {
    return (
      <div className='flex h-full flex-col bg-runner-toolbar-bg'>
        {/* Header */}
        <div className='flex h-12 items-center justify-between bg-runner-toolbar-bg px-4'>
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
      <div className='flex h-12 items-center justify-between px-4'>
        <div className='flex items-center gap-3'>
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

          {/* Step navigation: |< < ▶/■ > >| */}
          <div className='flex items-center gap-2'>
            <div className='flex items-center'>
              {/* Go to start */}
              <button
                type='button'
                disabled={!canGoPrev}
                onClick={goToStart}
                className={cn(
                  'btn-press rounded-l-md border border-secondary-dark-gray/80 px-1 py-0.5 transition-colors',
                  canGoPrev
                    ? 'bg-primary-dark-gray text-primary-white hover:bg-primary-blue/80'
                    : 'bg-secondary-black text-secondary-dark-gray pointer-events-none',
                )}
                title='Go to first step'
              >
                <ChevronsLeft className='h-3.5 w-3.5' />
              </button>
              {/* Previous step */}
              <button
                type='button'
                disabled={!canGoPrev}
                onClick={goToPrevStep}
                className={cn(
                  'btn-press border border-l-0 border-secondary-dark-gray/80 px-1 py-0.5 transition-colors',
                  canGoPrev
                    ? 'bg-primary-dark-gray text-primary-white hover:bg-primary-blue/80'
                    : 'bg-secondary-black text-secondary-dark-gray pointer-events-none',
                )}
                title='Previous step'
              >
                <ChevronLeft className='h-3.5 w-3.5' />
              </button>
              {/* Autoplay toggle */}
              <button
                type='button'
                disabled={!record || record.steps.length === 0}
                onClick={toggleAutoplay}
                className={cn(
                  'btn-press border border-l-0 border-secondary-dark-gray/80 px-1.5 py-0.5 transition-colors',
                  isAutoplaying
                    ? 'bg-primary-blue text-white hover:bg-primary-blue/80'
                    : record && record.steps.length > 0
                      ? 'bg-primary-dark-gray text-primary-white hover:bg-primary-blue/80'
                      : 'bg-secondary-black text-secondary-dark-gray pointer-events-none',
                )}
                title={isAutoplaying ? 'Stop autoplay' : 'Autoplay'}
              >
                {isAutoplaying ? (
                  <Square className='h-3 w-3' />
                ) : (
                  <Play className='h-3.5 w-3.5' />
                )}
              </button>
              {/* Next step */}
              <button
                type='button'
                disabled={!canGoNext}
                onClick={goToNextStep}
                className={cn(
                  'btn-press border border-l-0 border-secondary-dark-gray/80 px-1 py-0.5 transition-colors',
                  canGoNext
                    ? 'bg-primary-dark-gray text-primary-white hover:bg-primary-blue/80'
                    : 'bg-secondary-black text-secondary-dark-gray pointer-events-none',
                )}
                title='Next step'
              >
                <ChevronRight className='h-3.5 w-3.5' />
              </button>
              {/* Go to end */}
              <button
                type='button'
                disabled={!canGoNext}
                onClick={goToEnd}
                className={cn(
                  'btn-press rounded-r-md border border-l-0 border-secondary-dark-gray/80 px-1 py-0.5 transition-colors',
                  canGoNext
                    ? 'bg-primary-dark-gray text-primary-white hover:bg-primary-blue/80'
                    : 'bg-secondary-black text-secondary-dark-gray pointer-events-none',
                )}
                title='Go to last step'
              >
                <ChevronsRight className='h-3.5 w-3.5' />
              </button>
            </div>

            {/* Autoplay interval */}
            <Tooltip content='Seconds between each step during autoplay. Drag or click to adjust (0.5s–30s).'>
              <SliderNumberInput
                name='Interval'
                value={autoplayIntervalSec}
                onChange={(v) => setAutoplayIntervalSec(Math.max(0.5, v))}
                min={0.5}
                max={30}
                size='small'
              />
            </Tooltip>

            {/* Auto-scroll toggle */}
            <Tooltip content='Automatically scroll the timeline and canvas to follow the selected step'>
              <label className='flex cursor-pointer items-center gap-1 text-[12px] text-secondary-light-gray select-none'>
                <input
                  type='checkbox'
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className='h-3 w-3 cursor-pointer rounded-sm accent-primary-blue'
                />
                <span className='text-primary-white'>Auto-scroll</span>
              </label>
            </Tooltip>
          </div>
        </div>

        <div className='flex items-center gap-3'>
          {/* Time mode toggle — only visible when pause data exists */}
          {hasPauseData && (
            <Tooltip
              content={
                <div className='space-y-1.5 text-[12px] leading-relaxed text-primary-white'>
                  <div>
                    <span className='font-semibold'>Execution</span> — Shows
                    only computation time with pauses removed. Best for
                    step-by-step mode.
                  </div>
                  <div>
                    <span className='font-semibold'>Wall Clock</span> — Shows
                    real elapsed time including pauses between steps.
                  </div>
                </div>
              }
            >
              <ButtonToggle
                options={TIME_MODE_OPTIONS}
                value={timeMode}
                onChange={setTimeMode}
                size='small'
              />
            </Tooltip>
          )}

          {/* Duration / step count / compilation info */}
          <div className='flex items-center gap-2 font-mono text-[12px] text-primary-white'>
            <Tooltip content='Total execution duration'>
              <span className='flex items-center gap-1'>
                <Timer className='h-3.5 w-3.5' />
                <span className='tabular-nums'>
                  {adjustedTotalDuration.toFixed(2)}ms
                </span>
              </span>
            </Tooltip>
            <span>&middot;</span>
            <Tooltip content='Total number of executed steps'>
              <span className='flex items-center gap-1'>
                <Layers className='h-3.5 w-3.5' />
                <span>{record.steps.length} steps</span>
              </span>
            </Tooltip>
            {record.warmupDuration > 0 && (
              <>
                <span>&middot;</span>
                <Tooltip content='JIT warmup time — absorbed before execution to ensure accurate step timings'>
                  <span className='flex items-center gap-1'>
                    <Zap className='h-3.5 w-3.5' />
                    <span>JIT {record.warmupDuration.toFixed(1)}ms</span>
                  </span>
                </Tooltip>
              </>
            )}
          </div>

          {/* Zoom controls */}
          <button
            type='button'
            onClick={() => zoomBy(1.5)}
            className='btn-press text-primary-white transition-colors hover:text-primary-blue'
            title='Zoom In'
          >
            <ZoomIn className='h-4 w-4' />
          </button>
          <button
            type='button'
            onClick={() => zoomBy(1 / 1.5)}
            className='btn-press text-primary-white transition-colors hover:text-primary-blue'
            title='Zoom Out'
          >
            <ZoomOut className='h-4 w-4' />
          </button>
          <button
            type='button'
            onClick={fitToView}
            className='btn-press text-primary-white transition-colors hover:text-primary-blue'
            title='Fit to View'
          >
            <Maximize2 className='h-4 w-4' />
          </button>
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
                style={{ minWidth: `${contentWidth}px` }}
              >
                {/* Sticky ruler + scrubber head — stays visible when scrolling down */}
                <div className='sticky top-0 z-20'>
                  <TimeRuler
                    timeScale={timeScale}
                    contentWidth={contentWidth}
                    totalDuration={totalDuration}
                    onScrubDown={handleRulerScrubDown}
                  />

                  {/* Scrubber head anchored in ruler — sticks with it */}
                  <div
                    className='pointer-events-none absolute inset-y-0'
                    style={{
                      left: `${scrubberPx}px`,
                      transition: isSnapping ? 'left 150ms ease-out' : 'none',
                    }}
                  >
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

                {/* Tracks area with grid lines */}
                <div
                  ref={tracksContainerRef}
                  className='relative'
                  style={{ minHeight: '120px' }}
                >
                  <TimelineGrid
                    timeScale={timeScale}
                    contentWidth={contentWidth}
                    totalDuration={totalDuration}
                  />
                  <div className='pt-3'>
                    {segments.map((segment, segIdx) => {
                      if (segment.kind === 'flat') {
                        return (
                          <FlatSection
                            key={`flat-${segIdx}`}
                            steps={segment.steps}
                            timeScale={timeScale}
                            contentWidth={contentWidth}
                            selectedStepIndex={selectedStepIndex}
                            currentStepIndex={currentStepIndex}
                            nearestDragStepIndex={nearestDragStepIndex}
                            onStepClick={guardedStepClick}
                            onScrubTo={onScrubTo}
                          />
                        );
                      }

                      const loopId = segment.loopStructureId;
                      const selIter = selectedIterations.get(loopId) ?? null;

                      return (
                        <LoopSection
                          key={`loop-${loopId}`}
                          segment={segment}
                          timeScale={timeScale}
                          contentWidth={contentWidth}
                          selectedIteration={selIter}
                          onSelectIteration={(iter) => {
                            setSelectedIterations((prev) => {
                              const next = new Map(prev);
                              // Toggle: click same iteration to collapse
                              if (prev.get(loopId) === iter) {
                                next.delete(loopId);
                              } else {
                                next.set(loopId, iter);
                              }
                              return next;
                            });
                          }}
                          selectedStepIndex={selectedStepIndex}
                          currentStepIndex={currentStepIndex}
                          nearestDragStepIndex={nearestDragStepIndex}
                          onStepClick={guardedStepClick}
                          onScrubTo={onScrubTo}
                          adjustForPause={timeMode === 'execution'}
                          selectedIterations={selectedIterations}
                          onNestedSelectIteration={(loopId, iter) => {
                            setSelectedIterations((prev) => {
                              const next = new Map(prev);
                              if (iter === null) {
                                next.delete(loopId);
                              } else {
                                next.set(loopId, iter);
                              }
                              return next;
                            });
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* ── Full-height scrubber line overlay ── */}
                <div
                  className='pointer-events-none absolute inset-y-0 z-[15]'
                  style={{
                    left: `${scrubberPx}px`,
                    transition: isSnapping ? 'left 150ms ease-out' : 'none',
                  }}
                  onTransitionEnd={onSnapTransitionEnd}
                >
                  {/* Invisible hit area for dragging */}
                  <div
                    className='pointer-events-auto absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 cursor-ew-resize'
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
