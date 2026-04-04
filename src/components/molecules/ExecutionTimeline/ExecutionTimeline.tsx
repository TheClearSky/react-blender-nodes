import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  Check,
  X as XIcon,
  AlertTriangle,
  Repeat,
  Timer,
  Layers,
  Zap,
} from 'lucide-react';
import { cn } from '@/utils';
import type {
  ExecutionRecord,
  ExecutionStepRecord,
  ExecutionStepRecordStatus,
  LoopRecord,
  LoopIterationRecord,
  LoopPhase,
} from '@/utils/nodeRunner/types';
import { useRecordingViewState } from '@/components/organisms/FullGraph/RecordingViewStateContext';
import { SliderNumberInput } from '@/components/molecules/SliderNumberInput/SliderNumberInput';
import { Tooltip } from '@/components/atoms/Tooltip';
import { ButtonToggle } from '@/components/molecules/ButtonToggle';
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

const TIME_MODE_OPTIONS = [
  { value: 'execution' as const, label: 'Execution' },
  { value: 'wallClock' as const, label: 'Wall Clock' },
];

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

function formatDuration(step: ExecutionStepRecord): string {
  if (step.estimatedTiming) return '< 0.1ms';
  return `${step.duration.toFixed(2)}ms`;
}

/** Group steps by concurrencyLevel into sorted rows. */
function groupByLevel(
  steps: readonly ExecutionStepRecord[],
): Map<number, ExecutionStepRecord[]> {
  const grouped = new Map<number, ExecutionStepRecord[]>();
  for (const step of steps) {
    const existing = grouped.get(step.concurrencyLevel);
    if (existing) existing.push(step);
    else grouped.set(step.concurrencyLevel, [step]);
  }
  return grouped;
}

// ─────────────────────────────────────────────────────
// Timeline segment types
// ─────────────────────────────────────────────────────

type FlatSegment = {
  kind: 'flat';
  steps: ExecutionStepRecord[];
};

type LoopIterationDisplay = {
  iteration: number;
  conditionValue: boolean;
  steps: ExecutionStepRecord[];
  nestedLoopRecords: ReadonlyMap<string, LoopRecord>;
};

type AdjustedLoopIterationRecord = LoopIterationRecord & {
  adjustedStartTime: number;
  adjustedEndTime: number;
  adjustedDuration: number;
};

type LoopSegment = {
  kind: 'loop';
  loopStructureId: string;
  loopRecord: LoopRecord;
  adjustedIterations: AdjustedLoopIterationRecord[];
  iterations: LoopIterationDisplay[];
};

type TimelineSegment = FlatSegment | LoopSegment;

/** Phase ordering for deterministic sort within loop iterations. */
const PHASE_ORDER: Record<LoopPhase, number> = {
  loopStart: 0,
  preStop: 1,
  loopStop: 2,
  postStop: 3,
  loopEnd: 4,
};

/** Compare two steps by phase order (primary) then startTime (tiebreaker). */
function compareByPhase(
  a: ExecutionStepRecord,
  b: ExecutionStepRecord,
): number {
  const pa = a.loopPhase ? PHASE_ORDER[a.loopPhase] : 1; // default to preStop for body steps
  const pb = b.loopPhase ? PHASE_ORDER[b.loopPhase] : 1;
  if (pa !== pb) return pa - pb;
  return a.startTime - b.startTime;
}

/** Build a LoopSegment from a LoopRecord, populating iteration displays. */
function buildLoopSegment(
  loopId: string,
  loopRec: LoopRecord,
  adjustForPause: boolean,
): LoopSegment {
  const adjustedIterations: AdjustedLoopIterationRecord[] =
    loopRec.iterations.map((iter) => {
      const steps = iter.stepRecords;
      if (steps.length === 0) {
        // In-progress iteration with no steps yet — use raw iteration times
        return {
          ...iter,
          adjustedStartTime: iter.startTime,
          adjustedEndTime: iter.endTime,
          adjustedDuration: iter.duration,
        };
      }

      // Derive iteration boundaries from constituent steps.
      // This ensures parity with how individual step blocks are positioned:
      // in execution mode each step uses (startTime - pauseAdjustment).
      let minStart = Infinity;
      let maxEnd = -Infinity;
      for (const s of steps) {
        const adjStart = adjustForPause
          ? s.startTime - s.pauseAdjustment
          : s.startTime;
        const adjEnd = adjustForPause
          ? s.endTime - s.pauseAdjustment
          : s.endTime;
        if (adjStart < minStart) minStart = adjStart;
        if (adjEnd > maxEnd) maxEnd = adjEnd;
      }

      return {
        ...iter,
        adjustedStartTime: minStart,
        adjustedEndTime: maxEnd,
        adjustedDuration: maxEnd - minStart,
      };
    });

  return {
    kind: 'loop',
    loopStructureId: loopId,
    loopRecord: loopRec,
    adjustedIterations,
    iterations: loopRec.iterations.map((iter) => ({
      iteration: iter.iteration,
      conditionValue: iter.conditionValue,
      // Strip parent-loop attribution so buildSegments treats these as flat.
      // Sort by phase order for deterministic vertical positioning.
      steps: [...iter.stepRecords].sort(compareByPhase).map((s) => ({
        ...s,
        startTime: adjustForPause
          ? s.startTime - s.pauseAdjustment
          : s.startTime,
        endTime: adjustForPause ? s.endTime - s.pauseAdjustment : s.endTime,
        loopStructureId: undefined,
        loopIteration: undefined,
      })),
      nestedLoopRecords: iter.nestedLoopRecords,
    })),
  };
}

/**
 * Partition steps into ordered flat and loop segments.
 *
 * Steps are routed to their loop segment when the loopStructureId is present
 * in the provided loopRecords map. Steps belonging to deeper-nested loops
 * (IDs not in loopRecords) are skipped — they are rendered recursively when
 * the user drills into an iteration via IterationDetail.
 *
 * Loop records that have no body steps in the flat steps array (i.e. nested
 * loops whose steps live only in LoopIterationRecord.stepRecords) are still
 * created as segments and interleaved by start time.
 */
function buildSegments(
  steps: readonly ExecutionStepRecord[],
  loopRecords: ReadonlyMap<string, LoopRecord>,
  adjustForPause: boolean,
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let currentFlat: ExecutionStepRecord[] = [];

  // Track which loop segments have been created (from step routing)
  const loopSegmentMap = new Map<string, LoopSegment>();

  for (const step of steps) {
    // Structural loop steps (Loop Start/Stop/End) have loopStructureId but
    // no loopIteration — render them as regular flat blocks on the timeline
    const isLoopBody =
      step.loopStructureId !== undefined && step.loopIteration !== undefined;

    if (!isLoopBody) {
      // Check if this is a structural step for a nested loop we don't own —
      // skip it so it doesn't appear as a flat block at this level
      if (
        step.loopStructureId !== undefined &&
        !loopRecords.has(step.loopStructureId)
      ) {
        continue;
      }
      currentFlat.push(step);
    } else {
      const loopId = step.loopStructureId!;
      const loopRec = loopRecords.get(loopId);

      if (!loopRec) {
        // Step belongs to a deeper-nested loop — skip it at this level
        continue;
      }

      // Flush any pending flat steps before this loop
      if (!loopSegmentMap.has(loopId) && currentFlat.length > 0) {
        segments.push({ kind: 'flat', steps: currentFlat });
        currentFlat = [];
      }

      // Get or create loop segment
      if (!loopSegmentMap.has(loopId)) {
        const loopSeg = buildLoopSegment(loopId, loopRec, adjustForPause);
        loopSegmentMap.set(loopId, loopSeg);
        segments.push(loopSeg);
      }
    }
  }

  // Flush remaining flat steps
  if (currentFlat.length > 0) {
    segments.push({ kind: 'flat', steps: currentFlat });
  }

  // Create segments for any loop records not encountered via steps
  // (nested loops whose body steps aren't in our flat steps array).
  // Insert them at the right position by start time.
  for (const [loopId, loopRec] of loopRecords) {
    if (loopSegmentMap.has(loopId)) continue;

    const loopSeg = buildLoopSegment(loopId, loopRec, adjustForPause);
    const loopStart = loopRec.iterations[0]?.startTime ?? 0;

    // Find insertion point: after the last segment that starts before this loop
    let insertIdx = segments.length;
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const segStart =
        seg.kind === 'flat'
          ? (seg.steps[0]?.startTime ?? 0)
          : (seg.loopRecord.iterations[0]?.startTime ?? 0);
      if (segStart <= loopStart) {
        // If the preceding segment is a flat section, we may need to split it
        if (seg.kind === 'flat') {
          const beforeSteps = seg.steps.filter((s) => s.startTime <= loopStart);
          const afterSteps = seg.steps.filter((s) => s.startTime > loopStart);
          if (beforeSteps.length > 0 && afterSteps.length > 0) {
            // Split the flat segment around the loop
            segments.splice(
              i,
              1,
              { kind: 'flat', steps: beforeSteps },
              loopSeg,
              { kind: 'flat', steps: afterSteps },
            );
            insertIdx = -1; // already inserted
            break;
          }
        }
        insertIdx = i + 1;
        break;
      }
    }
    if (insertIdx >= 0) {
      segments.splice(insertIdx, 0, loopSeg);
    }
  }

  return segments;
}

// ─────────────────────────────────────────────────────
// BlockTooltipContent
// ─────────────────────────────────────────────────────

function BlockTooltipContent({ step }: { step: ExecutionStepRecord }) {
  return (
    <>
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
        <span className='font-mono tabular-nums'>{formatDuration(step)}</span>
        <span className='text-secondary-dark-gray'>&middot;</span>
        <span>Step {step.stepIndex}</span>
        {step.loopIteration !== undefined && (
          <>
            <span className='text-secondary-dark-gray'>&middot;</span>
            <span>Iter {step.loopIteration}</span>
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────
// TimelineBlock
// ─────────────────────────────────────────────────────

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
          className='block truncate px-2 text-[12px] font-normal text-[#eee] drop-shadow-sm select-none'
          style={{ lineHeight: `${subRowHeight}px` }}
        >
          {step.nodeTypeName}
        </span>
      )}
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────
// TimelineTrack — row of blocks at one concurrency level
// ─────────────────────────────────────────────────────

function TimelineTrack({
  steps,
  timeScale,
  timeOffset = 0,
  contentWidth,
  selectedStepIndex,
  currentStepIndex,
  nearestDragStepIndex,
  onStepClick,
  onScrubTo,
}: {
  steps: ReadonlyArray<ExecutionStepRecord>;
  timeScale: number;
  timeOffset?: number;
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
          timeOffset={timeOffset}
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
// FlatSection — renders non-loop steps grouped by level
// ─────────────────────────────────────────────────────

function FlatSection({
  steps,
  timeScale,
  contentWidth,
  selectedStepIndex,
  currentStepIndex,
  nearestDragStepIndex,
  onStepClick,
  onScrubTo,
}: {
  steps: readonly ExecutionStepRecord[];
  timeScale: number;
  contentWidth: number;
  selectedStepIndex: number | null;
  currentStepIndex: number;
  nearestDragStepIndex: number | null;
  onStepClick: (step: ExecutionStepRecord) => void;
  onScrubTo: (stepIndex: number) => void;
}) {
  const stepsByLevel = useMemo(() => groupByLevel(steps), [steps]);
  const sortedLevels = useMemo(
    () => Array.from(stepsByLevel.keys()).sort((a, b) => a - b),
    [stepsByLevel],
  );

  if (steps.length === 0) return null;

  return (
    <>
      {sortedLevels.map((level) => {
        const levelSteps = stepsByLevel.get(level);
        if (!levelSteps) return null;
        return (
          <TimelineTrack
            key={`flat-${level}`}
            steps={levelSteps}
            timeScale={timeScale}
            contentWidth={contentWidth}
            selectedStepIndex={selectedStepIndex}
            currentStepIndex={currentStepIndex}
            nearestDragStepIndex={nearestDragStepIndex}
            onStepClick={onStepClick}
            onScrubTo={onScrubTo}
          />
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────
// LoopIterationBlock — a single iteration block on the global timeline
// ─────────────────────────────────────────────────────

function LoopIterationTooltipContent({
  iterRecord,
  iterDisplay,
  loopRecord,
}: {
  iterRecord: LoopIterationRecord;
  iterDisplay: LoopIterationDisplay;
  loopRecord: LoopRecord;
}) {
  const isMaxIterError =
    iterRecord.iteration === loopRecord.totalIterations - 1 &&
    iterRecord.conditionValue === true;

  return (
    <>
      <div className='flex items-center gap-2'>
        <span className='text-[12px] font-semibold text-primary-white'>
          Loop Iteration {iterRecord.iteration}
        </span>
        {isMaxIterError ? (
          <span className='flex items-center gap-0.5 text-[10px] text-status-errored'>
            <AlertTriangle className='h-2.5 w-2.5' /> max exceeded
          </span>
        ) : iterRecord.conditionValue ? (
          <span className='flex items-center gap-0.5 text-[10px] text-status-completed'>
            <Check className='h-2.5 w-2.5' /> continues
          </span>
        ) : (
          <span className='flex items-center gap-0.5 text-[10px] text-secondary-light-gray'>
            <XIcon className='h-2.5 w-2.5' /> exits
          </span>
        )}
      </div>
      <div className='mt-1 flex items-center gap-2 text-[10px] text-secondary-light-gray'>
        <span className='font-mono tabular-nums'>
          {iterRecord.duration.toFixed(2)}ms
        </span>
        <span className='text-secondary-dark-gray'>&middot;</span>
        <span>{iterDisplay.steps.length} steps</span>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────
// LoopTrack — iteration blocks on the global timeline
// ─────────────────────────────────────────────────────

function LoopTrack({
  segment,
  timeScale,
  contentWidth,
  selectedIteration,
  onSelectIteration,
  selectedStepIndex,
}: {
  segment: LoopSegment;
  timeScale: number;
  contentWidth: number;
  selectedIteration: number | null;
  onSelectIteration: (iteration: number) => void;
  selectedStepIndex: number | null;
}) {
  const { loopRecord, iterations } = segment;
  const isMaxIterError =
    loopRecord.iterations.length > 0 &&
    loopRecord.iterations[loopRecord.iterations.length - 1].conditionValue ===
      true;

  return (
    <div
      className='relative'
      style={{
        height: `${TRACK_HEIGHT}px`,
        width: `${contentWidth}px`,
        marginBottom: `${SUB_ROW_GAP}px`,
      }}
    >
      {segment.adjustedIterations.map((iterRec, idx) => {
        const iterDisplay = iterations[idx];
        if (!iterDisplay) return null;

        const left = iterRec.adjustedStartTime * timeScale;
        const width = Math.max(
          iterRec.adjustedDuration * timeScale,
          MIN_BLOCK_WIDTH,
        );
        const isSelected = selectedIteration === iterRec.iteration;
        const isLastAndError =
          isMaxIterError && idx === loopRecord.iterations.length - 1;
        const hasSelectedStep =
          selectedStepIndex !== null &&
          iterDisplay.steps.some((s) => s.stepIndex === selectedStepIndex);
        const blockHeight = TRACK_HEIGHT - BLOCK_PADDING_Y * 2;
        const showLabel =
          width > LABEL_MIN_WIDTH && blockHeight >= LABEL_MIN_HEIGHT;

        return (
          <LoopIterationBlockInner
            key={iterRec.iteration}
            iterRecord={iterRec}
            iterDisplay={iterDisplay}
            loopRecord={loopRecord}
            left={left}
            width={width}
            blockHeight={blockHeight}
            showLabel={showLabel}
            isSelected={isSelected}
            isLastAndError={isLastAndError}
            hasSelectedStep={hasSelectedStep}
            onSelect={() => onSelectIteration(iterRec.iteration)}
          />
        );
      })}
    </div>
  );
}

function LoopIterationBlockInner({
  iterRecord,
  iterDisplay,
  loopRecord,
  left,
  width,
  blockHeight,
  showLabel,
  isSelected,
  isLastAndError,
  hasSelectedStep,
  onSelect,
}: {
  iterRecord: LoopIterationRecord;
  iterDisplay: LoopIterationDisplay;
  loopRecord: LoopRecord;
  left: number;
  width: number;
  blockHeight: number;
  showLabel: boolean;
  isSelected: boolean;
  isLastAndError: boolean;
  hasSelectedStep: boolean;
  onSelect: () => void;
}) {
  return (
    <Tooltip
      as='div'
      placement='top'
      content={
        <LoopIterationTooltipContent
          iterRecord={iterRecord}
          iterDisplay={iterDisplay}
          loopRecord={loopRecord}
        />
      }
      className={cn(
        'absolute cursor-pointer rounded-[2px] bg-[#8c52d1]/60',
        isSelected &&
          'z-10 ring-1 ring-[#8c52d1] ring-offset-0 bg-[#8c52d1]/80',
        !isSelected &&
          hasSelectedStep &&
          'z-10 ring-1 ring-white/50 ring-offset-0',
        isLastAndError && 'border border-status-errored/50',
      )}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        top: `${BLOCK_PADDING_Y}px`,
        height: `${blockHeight}px`,
      }}
      triggerProps={{
        onClick: (e) => {
          e.stopPropagation();
          onSelect();
        },
      }}
    >
      {showLabel ? (
        <span
          className='flex items-center gap-1 truncate px-2 text-[11px] font-normal text-[#eee] drop-shadow-sm select-none'
          style={{ lineHeight: `${blockHeight}px` }}
        >
          <Repeat className='h-2.5 w-2.5 flex-shrink-0' />
          Iter {iterRecord.iteration}
        </span>
      ) : (
        <span
          className='flex items-center justify-center text-[9px] font-medium text-[#eee] select-none'
          style={{ lineHeight: `${blockHeight}px` }}
        >
          {iterRecord.iteration}
        </span>
      )}
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────
// IterationDetail — detailed view of one iteration's steps
// ─────────────────────────────────────────────────────

function IterationDetail({
  iteration,
  nestedLoopRecords,
  adjustForPause,
  selectedIterations,
  onSelectIteration,
  timeScale,
  contentWidth,
  selectedStepIndex,
  currentStepIndex,
  nearestDragStepIndex,
  onStepClick,
  onScrubTo,
}: {
  iteration: LoopIterationDisplay;
  nestedLoopRecords: ReadonlyMap<string, LoopRecord>;
  adjustForPause: boolean;
  selectedIterations: ReadonlyMap<string, number>;
  onSelectIteration: (loopId: string, iteration: number | null) => void;
  timeScale: number;
  contentWidth: number;
  selectedStepIndex: number | null;
  currentStepIndex: number;
  nearestDragStepIndex: number | null;
  onStepClick: (step: ExecutionStepRecord) => void;
  onScrubTo: (stepIndex: number) => void;
}) {
  const { steps } = iteration;

  // Build segments using this iteration's nested loop records
  const segments = useMemo(
    () => buildSegments(steps, nestedLoopRecords, adjustForPause),
    [steps, nestedLoopRecords, adjustForPause],
  );

  if (segments.length === 0) {
    return (
      <div className='py-2 text-center text-[10px] text-secondary-light-gray'>
        No steps in this iteration
      </div>
    );
  }

  return (
    <div className='relative pb-1' style={{ minHeight: '40px' }}>
      <div className='relative' style={{ width: `${contentWidth}px` }}>
        {segments.map((segment, segIdx) => {
          if (segment.kind === 'flat') {
            return (
              <FlatSection
                key={`iter-${iteration.iteration}-flat-${segIdx}`}
                steps={segment.steps}
                timeScale={timeScale}
                contentWidth={contentWidth}
                selectedStepIndex={selectedStepIndex}
                currentStepIndex={currentStepIndex}
                nearestDragStepIndex={nearestDragStepIndex}
                onStepClick={onStepClick}
                onScrubTo={onScrubTo}
              />
            );
          }

          const loopId = segment.loopStructureId;
          const selIter = selectedIterations.get(loopId) ?? null;

          return (
            <LoopSection
              key={`iter-${iteration.iteration}-loop-${loopId}`}
              segment={segment}
              timeScale={timeScale}
              contentWidth={contentWidth}
              selectedIteration={selIter}
              onSelectIteration={(iter) => {
                const current = selectedIterations.get(loopId);
                onSelectIteration(loopId, current === iter ? null : iter);
              }}
              selectedStepIndex={selectedStepIndex}
              currentStepIndex={currentStepIndex}
              nearestDragStepIndex={nearestDragStepIndex}
              onStepClick={onStepClick}
              onScrubTo={onScrubTo}
              adjustForPause={adjustForPause}
              selectedIterations={selectedIterations}
              onNestedSelectIteration={onSelectIteration}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// LoopSection — iteration blocks on the global timeline + expandable detail
// ─────────────────────────────────────────────────────

function LoopSection({
  segment,
  timeScale,
  contentWidth,
  selectedIteration,
  onSelectIteration,
  selectedStepIndex,
  currentStepIndex,
  nearestDragStepIndex,
  onStepClick,
  onScrubTo,
  adjustForPause,
  selectedIterations,
  onNestedSelectIteration,
}: {
  segment: LoopSegment;
  timeScale: number;
  contentWidth: number;
  selectedIteration: number | null;
  onSelectIteration: (iteration: number) => void;
  selectedStepIndex: number | null;
  currentStepIndex: number;
  nearestDragStepIndex: number | null;
  onStepClick: (step: ExecutionStepRecord) => void;
  onScrubTo: (stepIndex: number) => void;
  adjustForPause: boolean;
  selectedIterations: ReadonlyMap<string, number>;
  onNestedSelectIteration: (loopId: string, iteration: number | null) => void;
}) {
  const { iterations } = segment;
  const iterationToShow =
    selectedIteration !== null ? (iterations[selectedIteration] ?? null) : null;

  return (
    <div>
      {/* Iteration blocks on the global timeline */}
      <LoopTrack
        segment={segment}
        timeScale={timeScale}
        contentWidth={contentWidth}
        selectedIteration={selectedIteration}
        onSelectIteration={onSelectIteration}
        selectedStepIndex={selectedStepIndex}
      />

      {/* Expanded iteration detail */}
      {iterationToShow && (
        <div className='mb-1'>
          <div className='sticky left-0 z-[5] ml-4 flex w-fit items-center gap-2 rounded-t-[3px] border border-b-0 border-[#8c52d1]/30 bg-runner-timeline-box-bg px-2 py-1 text-[10px]'>
            <Repeat className='h-2.5 w-2.5 text-[#8c52d1]' />
            <span className='font-medium text-primary-white'>
              Iteration {iterationToShow.iteration}
            </span>
            <span className='text-secondary-light-gray'>
              {iterationToShow.steps.length} step
              {iterationToShow.steps.length !== 1 ? 's' : ''}
            </span>
            {iterationToShow.conditionValue ? (
              <span className='flex items-center gap-0.5 text-status-completed/70'>
                <Check className='h-2.5 w-2.5' /> continues
              </span>
            ) : (
              <span className='flex items-center gap-0.5 text-secondary-light-gray'>
                <XIcon className='h-2.5 w-2.5' /> exits
              </span>
            )}
          </div>
          <div className='-mt-px rounded-[3px] border border-[#8c52d1]/30 bg-runner-timeline-box-bg/50'>
            <IterationDetail
              iteration={iterationToShow}
              nestedLoopRecords={iterationToShow.nestedLoopRecords}
              adjustForPause={adjustForPause}
              selectedIterations={selectedIterations}
              onSelectIteration={onNestedSelectIteration}
              timeScale={timeScale}
              contentWidth={contentWidth}
              selectedStepIndex={selectedStepIndex}
              currentStepIndex={currentStepIndex}
              nearestDragStepIndex={nearestDragStepIndex}
              onStepClick={onStepClick}
              onScrubTo={onScrubTo}
            />
          </div>
        </div>
      )}
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

  // ── Autoplay state ──
  const [isAutoplaying, setIsAutoplaying] = useState(false);
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Prev / Next step navigation ──
  const navigableStepIndex = selectedStepIndex ?? currentStepIndex;
  const canGoPrev = record !== null && navigableStepIndex > 0;
  const canGoNext =
    record !== null && navigableStepIndex < record.steps.length - 1;

  const scrollTimelineToStep = useCallback(
    (step: ExecutionStepRecord) => {
      const container = scrollContainerRef.current;
      if (!container || timeScale <= 0) return;
      // Find the adjusted step to get pause-corrected time
      const adjusted = adjustedSteps.find(
        (s) => s.stepIndex === step.stepIndex,
      );
      const adjStart = adjusted
        ? adjusted.startTime
        : step.startTime - step.pauseAdjustment;
      // Visual center: accounts for MIN_BLOCK_WIDTH expansion on tiny blocks
      const blockLeft = adjStart * timeScale;
      const adjDur = adjusted
        ? adjusted.endTime - adjusted.startTime
        : step.duration;
      const blockWidth = Math.max(adjDur * timeScale, MIN_BLOCK_WIDTH);
      const blockCenterX = blockLeft + blockWidth / 2;
      const targetScrollX = Math.max(
        0,
        blockCenterX - container.clientWidth / 2,
      );

      // Wait for React to re-render (e.g. loop iteration expansion),
      // then do a single combined scroll for both axes
      setTimeout(() => {
        const c = scrollContainerRef.current;
        if (!c) return;
        let targetScrollY = c.scrollTop;
        const el = c.querySelector(`[data-step-index="${step.stepIndex}"]`);
        if (el) {
          const containerRect = c.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const elCenterY = elRect.top + elRect.height / 2;
          const containerCenterY = containerRect.top + containerRect.height / 2;
          const scrollDelta = elCenterY - containerCenterY;
          if (Math.abs(scrollDelta) > 4) {
            targetScrollY = c.scrollTop + scrollDelta;
          }
        }
        c.scrollTo({
          left: targetScrollX,
          top: targetScrollY,
          behavior: 'smooth',
        });
      }, 50);
    },
    [scrollContainerRef, timeScale, adjustedSteps],
  );

  /** Synchronously expand the correct loop iteration for a step. */
  const ensureIterationExpanded = useCallback(
    (step: ExecutionStepRecord) => {
      if (
        step.loopStructureId !== undefined &&
        step.loopIteration !== undefined
      ) {
        setSelectedIterations((prev) => {
          if (prev.get(step.loopStructureId!) === step.loopIteration!)
            return prev;
          const next = new Map(prev);
          next.set(step.loopStructureId!, step.loopIteration!);
          return next;
        });
      }
    },
    [setSelectedIterations],
  );

  const goToPrevStep = useCallback(() => {
    if (!record || navigableStepIndex <= 0) return;
    const prevStep = record.steps[navigableStepIndex - 1];
    if (prevStep) {
      ensureIterationExpanded(prevStep);
      onStepClick(prevStep);
      if (autoScroll) {
        onNavigateToNode?.(prevStep.nodeId);
        scrollTimelineToStep(prevStep);
      }
    }
  }, [
    record,
    navigableStepIndex,
    onStepClick,
    onNavigateToNode,
    scrollTimelineToStep,
    autoScroll,
    ensureIterationExpanded,
  ]);

  const goToNextStep = useCallback(() => {
    if (!record || navigableStepIndex >= record.steps.length - 1) return;
    const nextStep = record.steps[navigableStepIndex + 1];
    if (nextStep) {
      ensureIterationExpanded(nextStep);
      onStepClick(nextStep);
      if (autoScroll) {
        onNavigateToNode?.(nextStep.nodeId);
        scrollTimelineToStep(nextStep);
      }
    }
  }, [
    record,
    navigableStepIndex,
    onStepClick,
    onNavigateToNode,
    scrollTimelineToStep,
    autoScroll,
    ensureIterationExpanded,
  ]);

  const goToStart = useCallback(() => {
    if (!record || record.steps.length === 0) return;
    setIsAutoplaying(false);
    const firstStep = record.steps[0];
    ensureIterationExpanded(firstStep);
    onStepClick(firstStep);
    if (autoScroll) {
      onNavigateToNode?.(firstStep.nodeId);
      scrollTimelineToStep(firstStep);
    }
  }, [
    record,
    onStepClick,
    onNavigateToNode,
    scrollTimelineToStep,
    autoScroll,
    ensureIterationExpanded,
  ]);

  const goToEnd = useCallback(() => {
    if (!record || record.steps.length === 0) return;
    setIsAutoplaying(false);
    const lastStep = record.steps[record.steps.length - 1];
    ensureIterationExpanded(lastStep);
    onStepClick(lastStep);
    if (autoScroll) {
      onNavigateToNode?.(lastStep.nodeId);
      scrollTimelineToStep(lastStep);
    }
  }, [
    record,
    onStepClick,
    onNavigateToNode,
    scrollTimelineToStep,
    autoScroll,
    ensureIterationExpanded,
  ]);

  // Stop autoplay when we reach the end or record changes
  useEffect(() => {
    if (!isAutoplaying || !record) return;
    if (navigableStepIndex >= record.steps.length - 1) {
      setIsAutoplaying(false);
    }
  }, [isAutoplaying, navigableStepIndex, record]);

  // Interval effect
  useEffect(() => {
    if (isAutoplaying && record) {
      autoplayRef.current = setInterval(() => {
        // Use functional approach: read latest index from record via closure
        // The effect re-runs when navigableStepIndex changes (via deps below)
        goToNextStep();
      }, autoplayIntervalSec * 1000);
      return () => {
        if (autoplayRef.current) clearInterval(autoplayRef.current);
      };
    }
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, [isAutoplaying, autoplayIntervalSec, record, goToNextStep]);

  const toggleAutoplay = useCallback(() => {
    setIsAutoplaying((prev) => !prev);
  }, []);

  // ── Auto-scroll during live stepping ──
  // When currentStepIndex changes and the user hasn't manually selected a step,
  // scroll the timeline to the current step. This handles live step-by-step runs
  // where the runner sets currentStepIndex on each step() call.
  const prevLiveStepRef = useRef(currentStepIndex);
  useEffect(() => {
    if (prevLiveStepRef.current === currentStepIndex) return;
    prevLiveStepRef.current = currentStepIndex;
    if (
      !autoScroll ||
      !record ||
      selectedStepIndex !== null ||
      isDraggingScrubber
    )
      return;

    const step = record.steps[currentStepIndex];
    if (!step) return;

    ensureIterationExpanded(step);
    onNavigateToNode?.(step.nodeId);
    scrollTimelineToStep(step);
  }, [
    currentStepIndex,
    autoScroll,
    record,
    selectedStepIndex,
    isDraggingScrubber,
    ensureIterationExpanded,
    onNavigateToNode,
    scrollTimelineToStep,
  ]);

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
            {record.compilationDuration > 0 && (
              <>
                <span>&middot;</span>
                <Tooltip content='JIT warmup time — absorbed before execution to ensure accurate step timings'>
                  <span className='flex items-center gap-1'>
                    <Zap className='h-3.5 w-3.5' />
                    <span>JIT {record.compilationDuration.toFixed(1)}ms</span>
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
