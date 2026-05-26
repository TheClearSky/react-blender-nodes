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
          className='flex items-center justify-center text-[9px] font-medium text-[#eee] select-none w-full'
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

export {
  LoopIterationTooltipContent,
  LoopTrack,
  LoopIterationBlockInner,
  IterationDetail,
  LoopSection,
};
