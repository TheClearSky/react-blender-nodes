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
      <div className='rbn:flex rbn:items-center rbn:gap-2'>
        <span className='rbn:text-[12px] rbn:font-semibold rbn:text-primary-white'>
          Switch
        </span>
        {switchRecord.branchTaken ? (
          <span className='rbn:flex rbn:items-center rbn:gap-0.5 rbn:text-[10px] rbn:text-status-completed'>
            <Check className='rbn:h-2.5 rbn:w-2.5' /> True Branch
          </span>
        ) : (
          <span className='rbn:flex rbn:items-center rbn:gap-0.5 rbn:text-[10px] rbn:text-secondary-light-gray'>
            <XIcon className='rbn:h-2.5 rbn:w-2.5' /> False Branch
          </span>
        )}
      </div>
      <div className='rbn:mt-1 rbn:flex rbn:items-center rbn:gap-2 rbn:text-[10px] rbn:text-secondary-light-gray'>
        <span className='rbn:font-mono rbn:tabular-nums'>
          {switchRecord.duration.toFixed(2)}ms
        </span>
        <span className='rbn:text-secondary-dark-gray'>&middot;</span>
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
      className='rbn:relative'
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
          'rbn:absolute rbn:cursor-pointer rbn:rounded-[2px] rbn:bg-timeline-switch-accent/60',
          isExpanded &&
            'rbn:z-10 rbn:ring-1 rbn:ring-timeline-switch-accent rbn:ring-offset-0 rbn:bg-timeline-switch-accent/80',
          !isExpanded &&
            hasSelectedStep &&
            'rbn:z-10 rbn:ring-1 rbn:ring-white/50 rbn:ring-offset-0',
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
            className='rbn:flex rbn:items-center rbn:gap-1 rbn:truncate rbn:px-2 rbn:text-[11px] rbn:font-normal rbn:text-timeline-hover-text rbn:drop-shadow-sm rbn:select-none'
            style={{ lineHeight: `${blockHeight}px` }}
          >
            <GitBranch className='rbn:h-2.5 rbn:w-2.5 rbn:flex-shrink-0' />
            {switchRecord.branchTaken ? 'True Branch' : 'False Branch'}
          </span>
        ) : (
          <span
            className='rbn:flex rbn:items-center rbn:justify-center rbn:text-[9px] rbn:font-medium rbn:text-timeline-hover-text rbn:select-none rbn:w-full'
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
      <div className='rbn:py-2 rbn:text-center rbn:text-[10px] rbn:text-secondary-light-gray'>
        No steps in this branch
      </div>
    );
  }

  return (
    <div className='rbn:relative rbn:pb-1' style={{ minHeight: '40px' }}>
      <div className='rbn:relative' style={{ width: `${contentWidth}px` }}>
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
        <div className='rbn:mb-1'>
          <div
            className={cn(
              'rbn:sticky rbn:left-0 rbn:z-[5] rbn:ml-4 rbn:flex rbn:w-fit rbn:items-center rbn:gap-2 rbn:rounded-t-[3px] rbn:border rbn:border-b-0 rbn:border-timeline-switch-accent/30 rbn:bg-runner-timeline-box-bg rbn:px-2 rbn:py-1 rbn:text-[10px]',
              theme?.timeline?.switchHeader,
            )}
          >
            <GitBranch className='rbn:h-2.5 rbn:w-2.5 rbn:text-timeline-switch-accent' />
            <span className='rbn:font-medium rbn:text-primary-white'>
              {switchRecord.branchTaken ? 'True Branch' : 'False Branch'}
            </span>
            <span className='rbn:text-secondary-light-gray'>
              {segment.steps.length} step
              {segment.steps.length !== 1 ? 's' : ''}
            </span>
            {switchRecord.branchTaken ? (
              <span className='rbn:flex rbn:items-center rbn:gap-0.5 rbn:text-status-completed/70'>
                <Check className='rbn:h-2.5 rbn:w-2.5' /> condition true
              </span>
            ) : (
              <span className='rbn:flex rbn:items-center rbn:gap-0.5 rbn:text-secondary-light-gray'>
                <XIcon className='rbn:h-2.5 rbn:w-2.5' /> condition false
              </span>
            )}
          </div>
          <div
            className={cn(
              'rbn:-mt-px rbn:rounded-[3px] rbn:border rbn:border-timeline-switch-accent/30 rbn:bg-runner-timeline-box-bg/50',
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
