import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
  resolveStructureRecord,
  structureRecordKey,
} from '@/utils/nodeRunner/executionRecorder';
import {
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  CornerDownRight,
  CornerRightUp,
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
import { DEFAULT_RUNNER_VIEW_PREFERENCES } from '@/utils/nodeStateManagement/runnerViewPreferences';
import { SliderNumberInput } from '@/components/molecules/SliderNumberInput/SliderNumberInput';
import { Tooltip } from '@/components/atoms/Tooltip';
import { ButtonToggle } from '@/components/molecules/ButtonToggle';
import {
  findStepOverTarget,
  findStepOutTarget,
} from '@/utils/nodeRunner/stepNavigation';
import { useTimelineZoomPan } from './useTimelineZoomPan';
import { useTimelineScrub } from './useTimelineScrub';
import { useTimelineAutoplay } from './useTimelineAutoplay';
import { TimelineToolbarOverflowMenu } from './TimelineToolbarOverflowMenu';
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
import { SwitchSection } from './SupportingSubcomponents/SwitchComponents';
import {
  TimeRuler,
  TimelineGrid,
} from './SupportingSubcomponents/TimelineGrid';
import { ScrubberHead } from './SupportingSubcomponents/ScrubberHead';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

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
  /** Follow-into-groups: the viewport opens/closes group scopes to follow the
   *  scrub head's instance path. Backed by the document-level graph-`State`
   *  preference `runnerViewPreferences.followIntoGroups` (persisted on export,
   *  toggled via UPDATE_RUNNER_VIEW_PREFERENCE); rendered only when the callback is
   *  provided. */
  followIntoGroups?: boolean;
  onFollowIntoGroupsChange?: (enabled: boolean) => void;
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
  followIntoGroups,
  onFollowIntoGroupsChange,
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

  // Step-over/out jump targets over instancePath depth (null = disabled).
  const stepOverTargetIndex = useMemo(
    () => (record ? findStepOverTarget(record.steps, currentStepIndex) : null),
    [record, currentStepIndex],
  );
  const stepOutTargetIndex = useMemo(
    () => (record ? findStepOutTarget(record.steps, currentStepIndex) : null),
    [record, currentStepIndex],
  );

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
      record.switchRecords,
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
      // Selection is keyed by the loop record's MAP key (a full-path
      // identity), which is what the segments carry — writing the bare
      // structure id would select a same-template sibling's segment.
      // Nested loops are not in the top-level map — their segments come from
      // `iteration.nestedLoopRecords`, keyed by the same full-path identity.
      // So resolve for the legacy/bare-key case, else mint the identity key,
      // which is correct at every depth.
      const segmentKey =
        resolveStructureRecord(
          record.loopRecords,
          step.loopStructureId,
          step.instancePath,
        )?.key ??
        structureRecordKey(step.instancePath ?? [], step.loopStructureId);
      setSelectedIterations((prev) => {
        const next = new Map(prev);
        next.set(segmentKey, step.loopIteration!);
        return next;
      });
    }
  }, [selectedStepIndex, record]);

  // Track which switch sections are expanded
  const [expandedSwitches, setExpandedSwitches] = useState<Set<string>>(
    new Set(),
  );

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

  const theme = useGraphTheme();

  // ── Empty state ──
  if (!record) {
    return (
      <div
        className={cn(
          'rbn:flex rbn:h-full rbn:flex-col rbn:bg-runner-toolbar-bg',
          theme?.timeline?.container,
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'rbn:flex rbn:h-12 rbn:items-center rbn:justify-between rbn:bg-runner-toolbar-bg rbn:px-4',
            theme?.timeline?.toolbar,
          )}
        >
          <div className='rbn:flex rbn:items-center rbn:gap-2 rbn:text-[14px] rbn:text-primary-white'>
            <ChevronRight className='rbn:h-3 rbn:w-3 rbn:text-secondary-light-gray' />
            Timeline
          </div>
        </div>
        <div className='rbn:flex-1 rbn:p-4 rbn:pt-0'>
          <div
            className={cn(
              'rbn:flex rbn:h-full rbn:flex-col rbn:items-center rbn:justify-center rbn:gap-2 rbn:rounded-md rbn:border rbn:border-runner-timeline-box-border rbn:bg-runner-timeline-box-bg',
              theme?.timeline?.trackArea,
            )}
          >
            <div className='rbn:flex rbn:items-center rbn:gap-1.5'>
              <div className='rbn:h-1.5 rbn:w-6 rbn:rounded-full rbn:bg-secondary-dark-gray' />
              <div className='rbn:h-1.5 rbn:w-10 rbn:rounded-full rbn:bg-secondary-dark-gray' />
              <div className='rbn:h-1.5 rbn:w-4 rbn:rounded-full rbn:bg-secondary-dark-gray' />
            </div>
            <span className='rbn:text-[11px] rbn:text-secondary-light-gray'>
              No execution record to display
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rbn:flex rbn:h-full rbn:flex-col rbn:bg-runner-toolbar-bg',
        theme?.timeline?.container,
      )}
    >
      {/* Header — toolbar-middle */}
      <div
        className={cn(
          'rbn:flex rbn:h-12 rbn:items-center rbn:justify-between rbn:px-4',
          theme?.timeline?.toolbar,
        )}
      >
        <div className='rbn:flex rbn:items-center rbn:gap-3'>
          <button
            type='button'
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              'btn-press rbn:flex rbn:items-center rbn:gap-2 rbn:rounded rbn:px-1.5 rbn:py-1 rbn:text-[14px] rbn:text-primary-white rbn:transition-colors rbn:hover:bg-primary-dark-gray/50',
              theme?.timeline?.toolbarButton,
            )}
          >
            <span
              className={cn(
                'rbn:transition-transform rbn:duration-150',
                !isCollapsed && 'rbn:rotate-90',
              )}
            >
              <ChevronRight className='rbn:h-3 rbn:w-3 rbn:text-secondary-light-gray' />
            </span>
            Timeline
          </button>

          {/* Step navigation: |< < ▶/■ > >| */}
          <div className='rbn:flex rbn:items-center rbn:gap-2'>
            <div className='rbn:flex rbn:items-center'>
              {/* Go to start */}
              <button
                type='button'
                disabled={!canGoPrev}
                onClick={goToStart}
                className={cn(
                  'btn-press rbn:rounded-l-md rbn:border rbn:border-secondary-dark-gray/80 rbn:px-1 rbn:py-0.5 rbn:transition-colors',
                  canGoPrev
                    ? 'rbn:bg-primary-dark-gray rbn:text-primary-white rbn:hover:bg-primary-blue/80'
                    : 'rbn:bg-secondary-black rbn:text-secondary-dark-gray rbn:pointer-events-none',
                  theme?.timeline?.navButton,
                )}
                title='Go to first step'
              >
                <ChevronsLeft className='rbn:h-3.5 rbn:w-3.5' />
              </button>
              {/* Previous step */}
              <button
                type='button'
                disabled={!canGoPrev}
                onClick={goToPrevStep}
                className={cn(
                  'btn-press rbn:border rbn:border-l-0 rbn:border-secondary-dark-gray/80 rbn:px-1 rbn:py-0.5 rbn:transition-colors',
                  canGoPrev
                    ? 'rbn:bg-primary-dark-gray rbn:text-primary-white rbn:hover:bg-primary-blue/80'
                    : 'rbn:bg-secondary-black rbn:text-secondary-dark-gray rbn:pointer-events-none',
                  theme?.timeline?.navButton,
                )}
                title='Previous step'
              >
                <ChevronLeft className='rbn:h-3.5 rbn:w-3.5' />
              </button>
              {/* Autoplay toggle */}
              <button
                type='button'
                disabled={!record || record.steps.length === 0}
                onClick={toggleAutoplay}
                className={cn(
                  'btn-press rbn:border rbn:border-l-0 rbn:border-secondary-dark-gray/80 rbn:px-1.5 rbn:py-0.5 rbn:transition-colors',
                  isAutoplaying
                    ? 'rbn:bg-primary-blue rbn:text-white rbn:hover:bg-primary-blue/80'
                    : record && record.steps.length > 0
                      ? 'rbn:bg-primary-dark-gray rbn:text-primary-white rbn:hover:bg-primary-blue/80'
                      : 'rbn:bg-secondary-black rbn:text-secondary-dark-gray rbn:pointer-events-none',
                  theme?.timeline?.navButton,
                )}
                title={isAutoplaying ? 'Stop autoplay' : 'Autoplay'}
              >
                {isAutoplaying ? (
                  <Square className='rbn:h-3 rbn:w-3' />
                ) : (
                  <Play className='rbn:h-3.5 rbn:w-3.5' />
                )}
              </button>
              {/* Next step */}
              <button
                type='button'
                disabled={!canGoNext}
                onClick={goToNextStep}
                className={cn(
                  'btn-press rbn:border rbn:border-l-0 rbn:border-secondary-dark-gray/80 rbn:px-1 rbn:py-0.5 rbn:transition-colors',
                  canGoNext
                    ? 'rbn:bg-primary-dark-gray rbn:text-primary-white rbn:hover:bg-primary-blue/80'
                    : 'rbn:bg-secondary-black rbn:text-secondary-dark-gray rbn:pointer-events-none',
                  theme?.timeline?.navButton,
                )}
                title='Next step'
              >
                <ChevronRight className='rbn:h-3.5 rbn:w-3.5' />
              </button>
              {/* Go to end */}
              <button
                type='button'
                disabled={!canGoNext}
                onClick={goToEnd}
                className={cn(
                  'btn-press rbn:rounded-r-md rbn:border rbn:border-l-0 rbn:border-secondary-dark-gray/80 rbn:px-1 rbn:py-0.5 rbn:transition-colors',
                  canGoNext
                    ? 'rbn:bg-primary-dark-gray rbn:text-primary-white rbn:hover:bg-primary-blue/80'
                    : 'rbn:bg-secondary-black rbn:text-secondary-dark-gray rbn:pointer-events-none',
                  theme?.timeline?.navButton,
                )}
                title='Go to last step'
              >
                <ChevronsRight className='rbn:h-3.5 rbn:w-3.5' />
              </button>
            </div>

            {/* Step over / step out — replay jumps over the instancePath depth
                of the flat step list (group-aware debugger navigation). */}
            <div className='rbn:flex rbn:items-center'>
              <button
                type='button'
                data-testid='timeline-step-over'
                aria-label='Step over'
                disabled={stepOverTargetIndex === null}
                onClick={() =>
                  stepOverTargetIndex !== null && onScrubTo(stepOverTargetIndex)
                }
                className={cn(
                  'btn-press rbn:rounded-l-md rbn:border rbn:border-secondary-dark-gray/80 rbn:px-1 rbn:py-0.5 rbn:transition-colors',
                  stepOverTargetIndex !== null
                    ? 'rbn:bg-primary-dark-gray rbn:text-primary-white rbn:hover:bg-primary-blue/80'
                    : 'rbn:bg-secondary-black rbn:text-secondary-dark-gray rbn:pointer-events-none',
                  theme?.timeline?.navButton,
                )}
                title='Step over (skip past the group/structure the next step descends into)'
              >
                <CornerDownRight className='rbn:h-3.5 rbn:w-3.5' />
              </button>
              <button
                type='button'
                data-testid='timeline-step-out'
                aria-label='Step out'
                disabled={stepOutTargetIndex === null}
                onClick={() =>
                  stepOutTargetIndex !== null && onScrubTo(stepOutTargetIndex)
                }
                className={cn(
                  'btn-press rbn:rounded-r-md rbn:border rbn:border-l-0 rbn:border-secondary-dark-gray/80 rbn:px-1 rbn:py-0.5 rbn:transition-colors',
                  stepOutTargetIndex !== null
                    ? 'rbn:bg-primary-dark-gray rbn:text-primary-white rbn:hover:bg-primary-blue/80'
                    : 'rbn:bg-secondary-black rbn:text-secondary-dark-gray rbn:pointer-events-none',
                  theme?.timeline?.navButton,
                )}
                title='Step out (jump to the first step after the enclosing group scope)'
              >
                <CornerRightUp className='rbn:h-3.5 rbn:w-3.5' />
              </button>
            </div>

            {/* Autoplay interval (moves into the ⋯ menu below `@max-[832px]`) */}
            <Tooltip
              className='rbn:@max-[832px]/runnerpanel:hidden'
              content='Seconds between each step during autoplay. Drag or click to adjust (0.5s–30s).'
            >
              <SliderNumberInput
                name='Interval'
                value={autoplayIntervalSec}
                onChange={(v) => setAutoplayIntervalSec(Math.max(0.5, v))}
                min={0.5}
                max={30}
                size='small'
                className={theme?.node?.inputField}
              />
            </Tooltip>

            {/* Auto-scroll toggle (moves into the ⋯ menu below `@max-[832px]`) */}
            <Tooltip
              className='rbn:@max-[832px]/runnerpanel:hidden'
              content='Automatically scroll the timeline and canvas to follow the selected step'
            >
              <label className='rbn:flex rbn:cursor-pointer rbn:items-center rbn:gap-1 rbn:text-[12px] rbn:text-secondary-light-gray rbn:select-none'>
                <input
                  type='checkbox'
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className='rbn:h-3 rbn:w-3 rbn:cursor-pointer rbn:rounded-sm rbn:accent-primary-blue'
                />
                <span className='rbn:text-primary-white'>Auto-scroll</span>
              </label>
            </Tooltip>

            {/* Follow-into-groups toggle (only when the host provides it) */}
            {onFollowIntoGroupsChange && (
              <Tooltip
                className='rbn:@max-[832px]/runnerpanel:hidden'
                content='Open/close group scopes so the canvas follows the scrub head into the group instance that executed'
              >
                <label className='rbn:flex rbn:cursor-pointer rbn:items-center rbn:gap-1 rbn:text-[12px] rbn:text-secondary-light-gray rbn:select-none'>
                  <input
                    type='checkbox'
                    data-testid='follow-into-groups'
                    aria-label='Follow into groups'
                    checked={
                      followIntoGroups ??
                      DEFAULT_RUNNER_VIEW_PREFERENCES.followIntoGroups
                    }
                    onChange={(e) => onFollowIntoGroupsChange(e.target.checked)}
                    className='rbn:h-3 rbn:w-3 rbn:cursor-pointer rbn:rounded-sm rbn:accent-primary-blue'
                  />
                  <span className='rbn:text-primary-white'>Follow groups</span>
                </label>
              </Tooltip>
            )}
          </div>
        </div>

        <div className='rbn:flex rbn:items-center rbn:gap-3'>
          {/* Secondary controls collapse into the ⋯ menu below `@max-[832px]`. */}
          <div className='rbn:flex rbn:items-center rbn:gap-3 rbn:@max-[832px]/runnerpanel:hidden'>
            {/* Time mode toggle — only visible when pause data exists */}
            {hasPauseData && (
              <Tooltip
                content={
                  <div className='rbn:space-y-1.5 rbn:text-[12px] rbn:leading-relaxed rbn:text-primary-white'>
                    <div>
                      <span className='rbn:font-semibold'>Execution</span> —
                      Shows only computation time with pauses removed. Best for
                      step-by-step mode.
                    </div>
                    <div>
                      <span className='rbn:font-semibold'>Wall Clock</span> —
                      Shows real elapsed time including pauses between steps.
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
            <div className='rbn:flex rbn:items-center rbn:gap-2 rbn:font-mono rbn:text-[12px] rbn:text-primary-white'>
              <Tooltip content='Total execution duration'>
                <span className='rbn:flex rbn:items-center rbn:gap-1'>
                  <Timer className='rbn:h-3.5 rbn:w-3.5' />
                  <span className='rbn:tabular-nums'>
                    {adjustedTotalDuration.toFixed(2)}ms
                  </span>
                </span>
              </Tooltip>
              <span>&middot;</span>
              <Tooltip content='Total number of executed steps'>
                <span className='rbn:flex rbn:items-center rbn:gap-1'>
                  <Layers className='rbn:h-3.5 rbn:w-3.5' />
                  <span>{record.steps.length} steps</span>
                </span>
              </Tooltip>
              {record.warmupDuration > 0 && (
                <>
                  <span>&middot;</span>
                  <Tooltip content='JIT warmup time — absorbed before execution to ensure accurate step timings'>
                    <span className='rbn:flex rbn:items-center rbn:gap-1'>
                      <Zap className='rbn:h-3.5 rbn:w-3.5' />
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
              className={cn(
                'btn-press rbn:text-primary-white rbn:transition-colors rbn:hover:text-primary-blue',
                theme?.timeline?.toolbarButton,
              )}
              title='Zoom In'
            >
              <ZoomIn className='rbn:h-4 rbn:w-4' />
            </button>
            <button
              type='button'
              onClick={() => zoomBy(1 / 1.5)}
              className={cn(
                'btn-press rbn:text-primary-white rbn:transition-colors rbn:hover:text-primary-blue',
                theme?.timeline?.toolbarButton,
              )}
              title='Zoom Out'
            >
              <ZoomOut className='rbn:h-4 rbn:w-4' />
            </button>
            <button
              type='button'
              onClick={fitToView}
              className={cn(
                'btn-press rbn:text-primary-white rbn:transition-colors rbn:hover:text-primary-blue',
                theme?.timeline?.toolbarButton,
              )}
              title='Fit to View'
            >
              <Maximize2 className='rbn:h-4 rbn:w-4' />
            </button>
          </div>
          <TimelineToolbarOverflowMenu
            autoplayIntervalSec={autoplayIntervalSec}
            onAutoplayIntervalChange={setAutoplayIntervalSec}
            autoScroll={autoScroll}
            onAutoScrollChange={setAutoScroll}
            hasPauseData={hasPauseData}
            timeMode={timeMode}
            onTimeModeChange={setTimeMode}
            onZoomIn={() => zoomBy(1.5)}
            onZoomOut={() => zoomBy(1 / 1.5)}
            onFitToView={fitToView}
            totalDurationMs={adjustedTotalDuration}
            stepCount={record.steps.length}
            warmupDurationMs={record.warmupDuration}
            triggerClassName='rbn:@min-[832px]/runnerpanel:hidden'
          />
        </div>
      </div>

      {/* Accordion body — padded container for the timeline box */}
      {!isCollapsed && (
        <div className='rbn:min-h-0 rbn:flex-1 rbn:px-4 rbn:pb-4'>
          <div
            className={cn(
              'rbn:flex rbn:h-full rbn:flex-col rbn:overflow-hidden rbn:rounded-md rbn:border rbn:border-runner-timeline-box-border rbn:bg-runner-timeline-box-bg',
              theme?.timeline?.trackArea,
            )}
          >
            {/* Scrollable timeline content */}
            <div
              ref={scrollContainerRef}
              className='timeline-scrollbar rbn:min-h-0 rbn:flex-1 rbn:overflow-x-auto rbn:overflow-y-auto'
              onMouseDown={handlePanStart}
            >
              <div
                className='rbn:relative rbn:flex rbn:min-h-full rbn:flex-col'
                style={{ minWidth: `${contentWidth}px` }}
              >
                {/* Sticky ruler + scrubber head — stays visible when scrolling down */}
                <div className='rbn:sticky rbn:top-0 rbn:z-20'>
                  <TimeRuler
                    timeScale={timeScale}
                    contentWidth={contentWidth}
                    totalDuration={totalDuration}
                    onScrubDown={handleRulerScrubDown}
                  />

                  {/* Scrubber head anchored in ruler — sticks with it */}
                  <div
                    className='rbn:pointer-events-none rbn:absolute rbn:inset-y-0'
                    style={{
                      left: `${scrubberPx}px`,
                      transition: isSnapping ? 'left 150ms ease-out' : 'none',
                    }}
                  >
                    <div
                      className='rbn:pointer-events-auto rbn:absolute rbn:left-1/2 rbn:-translate-x-1/2 rbn:cursor-ew-resize'
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
                  className='rbn:relative'
                  style={{ minHeight: '120px' }}
                >
                  <TimelineGrid
                    timeScale={timeScale}
                    contentWidth={contentWidth}
                    totalDuration={totalDuration}
                  />
                  <div className='rbn:pt-3'>
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

                      if (segment.kind === 'switch') {
                        const switchId = segment.switchStructureId;
                        return (
                          <SwitchSection
                            key={`switch-${switchId}`}
                            segment={segment}
                            timeScale={timeScale}
                            contentWidth={contentWidth}
                            isExpanded={expandedSwitches.has(switchId)}
                            onToggleExpand={() => {
                              setExpandedSwitches((prev) => {
                                const next = new Set(prev);
                                if (next.has(switchId)) next.delete(switchId);
                                else next.add(switchId);
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
                            onSelectIteration={(loopId, iter) => {
                              setSelectedIterations((prev) => {
                                const next = new Map(prev);
                                if (iter === null) next.delete(loopId);
                                else next.set(loopId, iter);
                                return next;
                              });
                            }}
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
                  className='rbn:pointer-events-none rbn:absolute rbn:inset-y-0 rbn:z-[15]'
                  style={{
                    left: `${scrubberPx}px`,
                    transition: isSnapping ? 'left 150ms ease-out' : 'none',
                  }}
                  onTransitionEnd={onSnapTransitionEnd}
                >
                  {/* Invisible hit area for dragging */}
                  <div
                    className='rbn:pointer-events-auto rbn:absolute rbn:left-1/2 rbn:top-0 rbn:bottom-0 rbn:w-0.5 rbn:-translate-x-1/2 rbn:cursor-ew-resize'
                    onMouseDown={handleScrubberMouseDown}
                  />

                  {/* Vertical line */}
                  <div
                    className='rbn:pointer-events-none rbn:absolute rbn:left-1/2 rbn:top-0 rbn:bottom-0 rbn:w-px rbn:-translate-x-1/2'
                    style={{
                      backgroundColor: isDraggingScrubber
                        ? 'var(--color-timeline-scrubber-line-active)'
                        : 'var(--color-timeline-scrubber-line)',
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
