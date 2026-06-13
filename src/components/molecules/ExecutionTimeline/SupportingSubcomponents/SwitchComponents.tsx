import { useMemo } from 'react';
import { Check, X as XIcon, GitBranch } from 'lucide-react';
import { cn } from '@/utils';
import type {
  ExecutionStepRecord,
  SwitchRecord,
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
  type SwitchSegment,
} from './types';
import { FlatSection } from './FlatSection';
import { LoopSection } from './LoopComponents';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

function SwitchTooltipContent({
  switchRecord,
}: {
  switchRecord: SwitchRecord;
}) {
  return (
    <>
      <div className='flex items-center gap-2'>
        <span className='text-[12px] font-semibold text-primary-white'>
          Switch
        </span>
        {switchRecord.branchTaken ? (
          <span className='flex items-center gap-0.5 text-[10px] text-status-completed'>
            <Check className='h-2.5 w-2.5' /> True Branch
          </span>
        ) : (
          <span className='flex items-center gap-0.5 text-[10px] text-secondary-light-gray'>
            <XIcon className='h-2.5 w-2.5' /> False Branch
          </span>
        )}
      </div>
      <div className='mt-1 flex items-center gap-2 text-[10px] text-secondary-light-gray'>
        <span className='font-mono tabular-nums'>
          {switchRecord.duration.toFixed(2)}ms
        </span>
        <span className='text-secondary-dark-gray'>&middot;</span>
        <span>{switchRecord.stepRecords.length} steps</span>
      </div>
    </>
  );
}

function SwitchTrack({
  segment,
  timeScale,
  contentWidth,
  isExpanded,
  onToggleExpand,
  selectedStepIndex,
}: {
  segment: SwitchSegment;
  timeScale: number;
  contentWidth: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedStepIndex: number | null;
}) {
  const { switchRecord } = segment;
  const left = segment.adjustedStartTime * timeScale;
  const width = Math.max(segment.adjustedDuration * timeScale, MIN_BLOCK_WIDTH);
  const blockHeight = TRACK_HEIGHT - BLOCK_PADDING_Y * 2;
  const showLabel = width > LABEL_MIN_WIDTH && blockHeight >= LABEL_MIN_HEIGHT;
  const hasSelectedStep =
    selectedStepIndex !== null &&
    segment.steps.some((s) => s.stepIndex === selectedStepIndex);

  return (
    <div
      className='relative'
      style={{
        height: `${TRACK_HEIGHT}px`,
        width: `${contentWidth}px`,
        marginBottom: `${SUB_ROW_GAP}px`,
      }}
    >
      <Tooltip
        as='div'
        placement='top'
        content={<SwitchTooltipContent switchRecord={switchRecord} />}
        className={cn(
          'absolute cursor-pointer rounded-[2px] bg-timeline-switch-accent/60',
          isExpanded &&
            'z-10 ring-1 ring-timeline-switch-accent ring-offset-0 bg-timeline-switch-accent/80',
          !isExpanded &&
            hasSelectedStep &&
            'z-10 ring-1 ring-white/50 ring-offset-0',
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
            onToggleExpand();
          },
        }}
      >
        {showLabel ? (
          <span
            className='flex items-center gap-1 truncate px-2 text-[11px] font-normal text-timeline-hover-text drop-shadow-sm select-none'
            style={{ lineHeight: `${blockHeight}px` }}
          >
            <GitBranch className='h-2.5 w-2.5 flex-shrink-0' />
            {switchRecord.branchTaken ? 'True Branch' : 'False Branch'}
          </span>
        ) : (
          <span
            className='flex items-center justify-center text-[9px] font-medium text-timeline-hover-text select-none w-full'
            style={{ lineHeight: `${blockHeight}px` }}
          >
            {switchRecord.branchTaken ? 'T' : 'F'}
          </span>
        )}
      </Tooltip>
    </div>
  );
}

function SwitchDetail({
  segment,
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
  segment: SwitchSegment;
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
  const { steps, switchRecord } = segment;

  const nestedLoopRecords = switchRecord.nestedLoopRecords;
  const nestedSwitchRecords = switchRecord.nestedSwitchRecords;

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
        No steps in this branch
      </div>
    );
  }

  return (
    <div className='relative pb-1' style={{ minHeight: '40px' }}>
      <div className='relative' style={{ width: `${contentWidth}px` }}>
        {segments.map((seg, segIdx) => {
          if (seg.kind === 'flat') {
            return (
              <FlatSection
                key={`switch-flat-${segIdx}`}
                steps={seg.steps}
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

          if (seg.kind === 'loop') {
            const loopId = seg.loopStructureId;
            const selIter = selectedIterations.get(loopId) ?? null;
            return (
              <LoopSection
                key={`switch-loop-${loopId}`}
                segment={seg}
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
          }

          return null;
        })}
      </div>
    </div>
  );
}

function SwitchSection({
  segment,
  timeScale,
  contentWidth,
  isExpanded,
  onToggleExpand,
  selectedStepIndex,
  currentStepIndex,
  nearestDragStepIndex,
  onStepClick,
  onScrubTo,
  adjustForPause,
  selectedIterations,
  onSelectIteration,
}: {
  segment: SwitchSegment;
  timeScale: number;
  contentWidth: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedStepIndex: number | null;
  currentStepIndex: number;
  nearestDragStepIndex: number | null;
  onStepClick: (step: ExecutionStepRecord) => void;
  onScrubTo: (stepIndex: number) => void;
  adjustForPause: boolean;
  selectedIterations: ReadonlyMap<string, number>;
  onSelectIteration: (loopId: string, iteration: number | null) => void;
}) {
  const theme = useGraphTheme();
  const { switchRecord } = segment;

  return (
    <div>
      <SwitchTrack
        segment={segment}
        timeScale={timeScale}
        contentWidth={contentWidth}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        selectedStepIndex={selectedStepIndex}
      />

      {isExpanded && (
        <div className='mb-1'>
          <div
            className={cn(
              'sticky left-0 z-[5] ml-4 flex w-fit items-center gap-2 rounded-t-[3px] border border-b-0 border-timeline-switch-accent/30 bg-runner-timeline-box-bg px-2 py-1 text-[10px]',
              theme?.timeline?.switchHeader,
            )}
          >
            <GitBranch className='h-2.5 w-2.5 text-timeline-switch-accent' />
            <span className='font-medium text-primary-white'>
              {switchRecord.branchTaken ? 'True Branch' : 'False Branch'}
            </span>
            <span className='text-secondary-light-gray'>
              {segment.steps.length} step
              {segment.steps.length !== 1 ? 's' : ''}
            </span>
            {switchRecord.branchTaken ? (
              <span className='flex items-center gap-0.5 text-status-completed/70'>
                <Check className='h-2.5 w-2.5' /> condition true
              </span>
            ) : (
              <span className='flex items-center gap-0.5 text-secondary-light-gray'>
                <XIcon className='h-2.5 w-2.5' /> condition false
              </span>
            )}
          </div>
          <div
            className={cn(
              '-mt-px rounded-[3px] border border-timeline-switch-accent/30 bg-runner-timeline-box-bg/50',
              theme?.timeline?.detailBox,
            )}
          >
            <SwitchDetail
              segment={segment}
              adjustForPause={adjustForPause}
              selectedIterations={selectedIterations}
              onSelectIteration={onSelectIteration}
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

export { SwitchSection, SwitchTrack, SwitchDetail, SwitchTooltipContent };
