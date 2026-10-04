import { useMemo } from 'react';
import { Check, X as XIcon, AlertTriangle, Repeat } from 'lucide-react';
import { cn } from '@/utils';
import type {
  ExecutionStepRecord,
  LoopIterationRecord,
  LoopRecord,
} from '@/utils/nodeRunner/types';
import { Tooltip } from '@/components/atoms/Tooltip';
import {
  TRACK_HEIGHT,
  BLOCK_PADDING_Y,
  SUB_ROW_GAP,
  MIN_BLOCK_WIDTH,
  LABEL_MIN_WIDTH,
  LABEL_MIN_HEIGHT,
  buildSegments,
  type LoopSegment,
  type LoopIterationDisplay,
} from './types';
import { FlatSection } from './FlatSection';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

// ─────────────────────────────────────────────────────
// LoopIterationTooltipContent
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
      <div className='rbn:flex rbn:items-center rbn:gap-2'>
        <span className='rbn:text-[12px] rbn:font-semibold rbn:text-primary-white'>
          Loop Iteration {iterRecord.iteration}
        </span>
        {isMaxIterError ? (
          <span className='rbn:flex rbn:items-center rbn:gap-0.5 rbn:text-[10px] rbn:text-status-errored'>
            <AlertTriangle className='rbn:h-2.5 rbn:w-2.5' /> max exceeded
          </span>
        ) : iterRecord.conditionValue ? (
          <span className='rbn:flex rbn:items-center rbn:gap-0.5 rbn:text-[10px] rbn:text-status-completed'>
            <Check className='rbn:h-2.5 rbn:w-2.5' /> continues
          </span>
        ) : (
          <span className='rbn:flex rbn:items-center rbn:gap-0.5 rbn:text-[10px] rbn:text-secondary-light-gray'>
            <XIcon className='rbn:h-2.5 rbn:w-2.5' /> exits
          </span>
        )}
      </div>
      <div className='rbn:mt-1 rbn:flex rbn:items-center rbn:gap-2 rbn:text-[10px] rbn:text-secondary-light-gray'>
        <span className='rbn:font-mono rbn:tabular-nums'>
          {iterRecord.duration.toFixed(2)}ms
        </span>
        <span className='rbn:text-secondary-dark-gray'>&middot;</span>
        <span>{iterDisplay.steps.length} steps</span>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────
// LoopIterationBlockInner
// ─────────────────────────────────────────────────────

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
        'rbn:absolute rbn:cursor-pointer rbn:rounded-[2px] rbn:bg-timeline-loop-accent/60',
        isSelected &&
          'rbn:z-10 rbn:ring-1 rbn:ring-timeline-loop-accent rbn:ring-offset-0 rbn:bg-timeline-loop-accent/80',
        !isSelected &&
          hasSelectedStep &&
          'rbn:z-10 rbn:ring-1 rbn:ring-white/50 rbn:ring-offset-0',
        isLastAndError && 'rbn:border rbn:border-status-errored/50',
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
          className='rbn:flex rbn:items-center rbn:gap-1 rbn:truncate rbn:px-2 rbn:text-[11px] rbn:font-normal rbn:text-timeline-hover-text rbn:drop-shadow-sm rbn:select-none'
          style={{ lineHeight: `${blockHeight}px` }}
        >
          <Repeat className='rbn:h-2.5 rbn:w-2.5 rbn:flex-shrink-0' />
          Iter {iterRecord.iteration}
        </span>
      ) : (
        <span
          className='rbn:flex rbn:items-center rbn:justify-center rbn:text-[9px] rbn:font-medium rbn:text-timeline-hover-text rbn:select-none rbn:w-full'
          style={{ lineHeight: `${blockHeight}px` }}
        >
          {iterRecord.iteration}
        </span>
      )}
    </Tooltip>
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
      className='rbn:relative'
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

  // Build segments using this iteration's nested loop/switch records
  const nestedSwitchRecords = iteration.nestedSwitchRecords ?? new Map();
  const segments = useMemo(
    () =>
      buildSegments(
        steps,
        nestedLoopRecords,
        nestedSwitchRecords,
        adjustForPause,
      ),
    [steps, nestedLoopRecords, nestedSwitchRecords, adjustForPause],
  );

  if (segments.length === 0) {
    return (
      <div className='rbn:py-2 rbn:text-center rbn:text-[10px] rbn:text-secondary-light-gray'>
        No steps in this iteration
      </div>
    );
  }

  return (
    <div className='rbn:relative rbn:pb-1' style={{ minHeight: '40px' }}>
      <div className='rbn:relative' style={{ width: `${contentWidth}px` }}>
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

          if (segment.kind !== 'loop') return null;

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
// LoopSection — iteration blocks + expandable detail
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
  const theme = useGraphTheme();
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
        <div className='rbn:mb-1'>
          <div
            className={cn(
              'rbn:sticky rbn:left-0 rbn:z-[5] rbn:ml-4 rbn:flex rbn:w-fit rbn:items-center rbn:gap-2 rbn:rounded-t-[3px] rbn:border rbn:border-b-0 rbn:border-timeline-loop-accent/30 rbn:bg-runner-timeline-box-bg rbn:px-2 rbn:py-1 rbn:text-[10px]',
              theme?.timeline?.loopHeader,
            )}
          >
            <Repeat className='rbn:h-2.5 rbn:w-2.5 rbn:text-timeline-loop-accent' />
            <span className='rbn:font-medium rbn:text-primary-white'>
              Iteration {iterationToShow.iteration}
            </span>
            <span className='rbn:text-secondary-light-gray'>
              {iterationToShow.steps.length} step
              {iterationToShow.steps.length !== 1 ? 's' : ''}
            </span>
            {iterationToShow.conditionValue ? (
              <span className='rbn:flex rbn:items-center rbn:gap-0.5 rbn:text-status-completed/70'>
                <Check className='rbn:h-2.5 rbn:w-2.5' /> continues
              </span>
            ) : (
              <span className='rbn:flex rbn:items-center rbn:gap-0.5 rbn:text-secondary-light-gray'>
                <XIcon className='rbn:h-2.5 rbn:w-2.5' /> exits
              </span>
            )}
          </div>
          <div
            className={cn(
              'rbn:-mt-px rbn:rounded-[3px] rbn:border rbn:border-timeline-loop-accent/30 rbn:bg-runner-timeline-box-bg/50',
              theme?.timeline?.detailBox,
            )}
          >
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

export {
  LoopIterationTooltipContent,
  LoopTrack,
  LoopIterationBlockInner,
  IterationDetail,
  LoopSection,
};
