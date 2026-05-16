import type { ExecutionStepRecord } from '@/utils/nodeRunner/types';
import { TRACK_HEIGHT, BLOCK_PADDING_Y, SUB_ROW_GAP } from './types';
import { TimelineBlock } from './TimelineBlock';

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

export { TimelineTrack };
