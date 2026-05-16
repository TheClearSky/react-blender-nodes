import { useMemo } from 'react';
import type { ExecutionStepRecord } from '@/utils/nodeRunner/types';
import { groupByLevel } from './types';
import { TimelineTrack } from './TimelineTrack';

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

export { FlatSection };
