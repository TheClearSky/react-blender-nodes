import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import type {
  ExecutionStepRecord,
  LoopIterationRecord,
  LoopRecord,
} from '@/utils/nodeRunner/types';
import { BlockTooltipContent } from './BlockTooltipContent';
import { TimelineBlock } from './TimelineBlock';
import { TimelineTrack } from './TimelineTrack';
import { FlatSection } from './FlatSection';
import {
  LoopIterationTooltipContent,
  LoopTrack,
  LoopIterationBlockInner,
  LoopSection,
} from './LoopComponents';
import { TimeRuler, TimelineGrid } from './TimelineGrid';
import { ScrubberHead } from './ScrubberHead';
import type { LoopSegment } from './types';

// ─────────────────────────────────────────────────────
// Mock data helpers
// ─────────────────────────────────────────────────────

function makeStep(
  overrides: Partial<ExecutionStepRecord> & {
    stepIndex: number;
    nodeId: string;
    nodeTypeName: string;
    concurrencyLevel: number;
    startTime: number;
    duration: number;
  },
): ExecutionStepRecord {
  return {
    nodeTypeId: overrides.nodeId,
    status: 'completed',
    endTime: overrides.startTime + overrides.duration,
    pauseAdjustment: 0,
    inputValues: new Map(),
    outputValues: new Map(),
    ...overrides,
  };
}

const completedStep = makeStep({
  stepIndex: 0,
  nodeId: 'n1',
  nodeTypeName: 'Boolean Constant',
  // A user custom name so the runner hosts render `Custom : Type` through the shared
  // NodeIdentityLabel (timeline block uses protect='custom', tooltip protect='type').
  customName: 'Summer',
  concurrencyLevel: 0,
  startTime: 0,
  duration: 12,
});

const erroredStep = makeStep({
  stepIndex: 1,
  nodeId: 'n2',
  nodeTypeName: 'Divide',
  concurrencyLevel: 1,
  startTime: 12,
  duration: 8,
  status: 'errored',
});

const skippedStep = makeStep({
  stepIndex: 2,
  nodeId: 'n3',
  nodeTypeName: 'Output Display',
  concurrencyLevel: 2,
  startTime: 20,
  duration: 0.5,
  status: 'skipped',
});

const longStep = makeStep({
  stepIndex: 3,
  nodeId: 'n4',
  nodeTypeName: 'Long Running Accumulator Node',
  concurrencyLevel: 0,
  startTime: 0,
  duration: 80,
});

const concurrentSteps: ExecutionStepRecord[] = [
  makeStep({
    stepIndex: 0,
    nodeId: 'src',
    nodeTypeName: 'Source',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 18,
  }),
  makeStep({
    stepIndex: 1,
    nodeId: 'left',
    nodeTypeName: 'AND Gate',
    concurrencyLevel: 1,
    startTime: 18,
    duration: 35,
  }),
  makeStep({
    stepIndex: 2,
    nodeId: 'right',
    nodeTypeName: 'OR Gate',
    concurrencyLevel: 1,
    startTime: 18,
    duration: 20,
  }),
  makeStep({
    stepIndex: 3,
    nodeId: 'sink',
    nodeTypeName: 'XOR Gate',
    concurrencyLevel: 2,
    startTime: 53,
    duration: 14,
  }),
];

// ── Loop mock data ──

function makeLoopIterationRecord(
  iteration: number,
  conditionValue: boolean,
  steps: ExecutionStepRecord[],
): LoopIterationRecord {
  const startTime = steps.length > 0 ? steps[0].startTime : 0;
  const endTime =
    steps.length > 0 ? Math.max(...steps.map((s) => s.endTime)) : 0;
  return {
    iteration,
    conditionValue,
    startTime,
    endTime,
    duration: endTime - startTime,
    stepRecords: steps,
    nestedLoopRecords: new Map(),
    nestedSwitchRecords: new Map(),
  };
}

const iterSteps0 = [
  makeStep({
    stepIndex: 10,
    nodeId: 'body-a',
    nodeTypeName: 'Increment',
    concurrencyLevel: 0,
    startTime: 5,
    duration: 10,
    loopStructureId: 'loop-1',
    loopIteration: 0,
  }),
  makeStep({
    stepIndex: 11,
    nodeId: 'body-b',
    nodeTypeName: 'Compare',
    concurrencyLevel: 1,
    startTime: 15,
    duration: 5,
    loopStructureId: 'loop-1',
    loopIteration: 0,
  }),
];

const iterSteps1 = [
  makeStep({
    stepIndex: 12,
    nodeId: 'body-a',
    nodeTypeName: 'Increment',
    concurrencyLevel: 0,
    startTime: 25,
    duration: 10,
    loopStructureId: 'loop-1',
    loopIteration: 1,
  }),
  makeStep({
    stepIndex: 13,
    nodeId: 'body-b',
    nodeTypeName: 'Compare',
    concurrencyLevel: 1,
    startTime: 35,
    duration: 5,
    loopStructureId: 'loop-1',
    loopIteration: 1,
  }),
];

const iterSteps2 = [
  makeStep({
    stepIndex: 14,
    nodeId: 'body-a',
    nodeTypeName: 'Increment',
    concurrencyLevel: 0,
    startTime: 45,
    duration: 10,
    loopStructureId: 'loop-1',
    loopIteration: 2,
  }),
];

const iterRecords: LoopIterationRecord[] = [
  makeLoopIterationRecord(0, true, iterSteps0),
  makeLoopIterationRecord(1, true, iterSteps1),
  makeLoopIterationRecord(2, false, iterSteps2),
];

const mockLoopRecord: LoopRecord = {
  loopStructureId: 'loop-1',
  loopStartNodeId: 'loopStart-1',
  loopStopNodeId: 'loopStop-1',
  loopEndNodeId: 'loopEnd-1',
  totalIterations: 3,
  iterations: iterRecords,
  startTime: 0,
  endTime: 120,
  duration: 120,
};

const mockLoopSegment: LoopSegment = {
  kind: 'loop',
  loopStructureId: 'loop-1',
  loopRecord: mockLoopRecord,
  adjustedIterations: iterRecords.map((iter) => ({
    ...iter,
    adjustedStartTime: iter.startTime,
    adjustedEndTime: iter.endTime,
    adjustedDuration: iter.duration,
  })),
  iterations: iterRecords.map((iter) => ({
    iteration: iter.iteration,
    conditionValue: iter.conditionValue,
    steps: iter.stepRecords.map((s) => ({
      ...s,
      loopStructureId: undefined,
      loopIteration: undefined,
    })),
    nestedLoopRecords: new Map(),
    nestedSwitchRecords: new Map(),
  })),
};

// ─────────────────────────────────────────────────────
// Wrapper for dark background (matches timeline bg)
// ─────────────────────────────────────────────────────

function DarkBg({ children }: { children: React.ReactNode }) {
  return (
    <div className='rounded-md bg-runner-timeline-box-bg p-4'>{children}</div>
  );
}

function PositionedContainer({
  children,
  width = 600,
  height = 40,
}: {
  children: React.ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <DarkBg>
      <div
        className='relative'
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        {children}
      </div>
    </DarkBg>
  );
}

// ═══════════════════════════════════════════════════════
// BlockTooltipContent
// ═══════════════════════════════════════════════════════

const tooltipMeta = {
  title: 'Molecules/BlockTooltipContent',
  component: BlockTooltipContent,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <DarkBg>
        <Story />
      </DarkBg>
    ),
  ],
} satisfies Meta<typeof BlockTooltipContent>;

export default tooltipMeta;

type TooltipStory = StoryObj<typeof tooltipMeta>;

export const CompletedTooltip: TooltipStory = {
  args: { step: completedStep },
};

export const ErroredTooltip: TooltipStory = {
  args: { step: erroredStep },
};

export const SkippedTooltip: TooltipStory = {
  args: { step: skippedStep },
};

export const LoopStepTooltip: TooltipStory = {
  args: { step: iterSteps0[0] },
};

// ═══════════════════════════════════════════════════════
// TimelineBlock
// ═══════════════════════════════════════════════════════

export const BlockCompleted = {
  render: () => (
    <PositionedContainer>
      <TimelineBlock
        step={completedStep}
        timeScale={4}
        isSelected={false}
        isSnapped={false}
        isNearestDragTarget={false}
        onClick={fn()}
        onScrubTo={fn()}
        subRowTop={3}
        subRowHeight={22}
      />
    </PositionedContainer>
  ),
} satisfies StoryObj;

export const BlockErrored = {
  render: () => (
    <PositionedContainer>
      <TimelineBlock
        step={erroredStep}
        timeScale={4}
        isSelected={false}
        isSnapped={false}
        isNearestDragTarget={false}
        onClick={fn()}
        onScrubTo={fn()}
        subRowTop={3}
        subRowHeight={22}
      />
    </PositionedContainer>
  ),
} satisfies StoryObj;

export const BlockSkipped = {
  render: () => (
    <PositionedContainer>
      <TimelineBlock
        step={skippedStep}
        timeScale={4}
        isSelected={false}
        isSnapped={false}
        isNearestDragTarget={false}
        onClick={fn()}
        onScrubTo={fn()}
        subRowTop={3}
        subRowHeight={22}
      />
    </PositionedContainer>
  ),
} satisfies StoryObj;

export const BlockSelected = {
  render: () => (
    <PositionedContainer>
      <TimelineBlock
        step={completedStep}
        timeScale={4}
        isSelected={true}
        isSnapped={false}
        isNearestDragTarget={false}
        onClick={fn()}
        onScrubTo={fn()}
        subRowTop={3}
        subRowHeight={22}
      />
    </PositionedContainer>
  ),
} satisfies StoryObj;

export const BlockSnapped = {
  render: () => (
    <PositionedContainer>
      <TimelineBlock
        step={completedStep}
        timeScale={4}
        isSelected={false}
        isSnapped={true}
        isNearestDragTarget={false}
        onClick={fn()}
        onScrubTo={fn()}
        subRowTop={3}
        subRowHeight={22}
      />
    </PositionedContainer>
  ),
} satisfies StoryObj;

export const BlockDragTarget = {
  render: () => (
    <PositionedContainer>
      <TimelineBlock
        step={completedStep}
        timeScale={4}
        isSelected={false}
        isSnapped={false}
        isNearestDragTarget={true}
        onClick={fn()}
        onScrubTo={fn()}
        subRowTop={3}
        subRowHeight={22}
      />
    </PositionedContainer>
  ),
} satisfies StoryObj;

export const BlockWithLabel = {
  render: () => (
    <PositionedContainer width={400}>
      <TimelineBlock
        step={longStep}
        timeScale={4}
        isSelected={false}
        isSnapped={false}
        isNearestDragTarget={false}
        onClick={fn()}
        onScrubTo={fn()}
        subRowTop={3}
        subRowHeight={22}
      />
    </PositionedContainer>
  ),
} satisfies StoryObj;

// ═══════════════════════════════════════════════════════
// TimelineTrack
// ═══════════════════════════════════════════════════════

export const TrackSingleRow = {
  render: () => (
    <DarkBg>
      <TimelineTrack
        steps={[concurrentSteps[0]]}
        timeScale={4}
        contentWidth={400}
        selectedStepIndex={null}
        currentStepIndex={0}
        nearestDragStepIndex={null}
        onStepClick={fn()}
        onScrubTo={fn()}
      />
    </DarkBg>
  ),
} satisfies StoryObj;

export const TrackConcurrentRows = {
  render: () => (
    <DarkBg>
      <TimelineTrack
        steps={[concurrentSteps[1], concurrentSteps[2]]}
        timeScale={4}
        contentWidth={400}
        selectedStepIndex={null}
        currentStepIndex={1}
        nearestDragStepIndex={null}
        onStepClick={fn()}
        onScrubTo={fn()}
      />
    </DarkBg>
  ),
} satisfies StoryObj;

// ═══════════════════════════════════════════════════════
// FlatSection
// ═══════════════════════════════════════════════════════

export const FlatSectionStory = {
  name: 'FlatSection',
  render: () => (
    <DarkBg>
      <FlatSection
        steps={concurrentSteps}
        timeScale={4}
        contentWidth={400}
        selectedStepIndex={1}
        currentStepIndex={0}
        nearestDragStepIndex={null}
        onStepClick={fn()}
        onScrubTo={fn()}
      />
    </DarkBg>
  ),
} satisfies StoryObj;

// ═══════════════════════════════════════════════════════
// ScrubberHead
// ═══════════════════════════════════════════════════════

export const ScrubberIdle = {
  render: () => (
    <DarkBg>
      <ScrubberHead timeMs={42.5} isDragging={false} />
    </DarkBg>
  ),
} satisfies StoryObj;

export const ScrubberDragging = {
  render: () => (
    <DarkBg>
      <ScrubberHead timeMs={123.45} isDragging={true} />
    </DarkBg>
  ),
} satisfies StoryObj;

export const ScrubberZero = {
  render: () => (
    <DarkBg>
      <ScrubberHead timeMs={0} isDragging={false} />
    </DarkBg>
  ),
} satisfies StoryObj;

export const ScrubberLargeValue = {
  render: () => (
    <DarkBg>
      <ScrubberHead timeMs={2500} isDragging={false} />
    </DarkBg>
  ),
} satisfies StoryObj;

// ═══════════════════════════════════════════════════════
// TimeRuler & TimelineGrid
// ═══════════════════════════════════════════════════════

export const RulerStory = {
  name: 'TimeRuler',
  render: () => (
    <DarkBg>
      <div style={{ width: '600px', overflow: 'hidden' }}>
        <TimeRuler
          timeScale={4}
          contentWidth={600}
          totalDuration={120}
          onScrubDown={fn()}
        />
      </div>
    </DarkBg>
  ),
} satisfies StoryObj;

export const GridStory = {
  name: 'TimelineGrid',
  render: () => (
    <DarkBg>
      <div className='relative' style={{ width: '600px', height: '200px' }}>
        <TimelineGrid timeScale={4} contentWidth={600} totalDuration={120} />
      </div>
    </DarkBg>
  ),
} satisfies StoryObj;

export const RulerAndGrid = {
  render: () => (
    <DarkBg>
      <div style={{ width: '600px' }}>
        <TimeRuler
          timeScale={4}
          contentWidth={600}
          totalDuration={120}
          onScrubDown={fn()}
        />
        <div className='relative' style={{ height: '150px' }}>
          <TimelineGrid timeScale={4} contentWidth={600} totalDuration={120} />
          <div className='pt-3'>
            <FlatSection
              steps={concurrentSteps}
              timeScale={4}
              contentWidth={600}
              selectedStepIndex={null}
              currentStepIndex={0}
              nearestDragStepIndex={null}
              onStepClick={fn()}
              onScrubTo={fn()}
            />
          </div>
        </div>
      </div>
    </DarkBg>
  ),
} satisfies StoryObj;

// ═══════════════════════════════════════════════════════
// Loop components
// ═══════════════════════════════════════════════════════

export const LoopTooltipContinues = {
  render: () => (
    <DarkBg>
      <LoopIterationTooltipContent
        iterRecord={iterRecords[0]}
        iterDisplay={mockLoopSegment.iterations[0]}
        loopRecord={mockLoopRecord}
      />
    </DarkBg>
  ),
} satisfies StoryObj;

export const LoopTooltipExits = {
  render: () => (
    <DarkBg>
      <LoopIterationTooltipContent
        iterRecord={iterRecords[2]}
        iterDisplay={mockLoopSegment.iterations[2]}
        loopRecord={mockLoopRecord}
      />
    </DarkBg>
  ),
} satisfies StoryObj;

export const LoopIterationBlock = {
  render: () => (
    <PositionedContainer>
      <LoopIterationBlockInner
        iterRecord={iterRecords[0]}
        iterDisplay={mockLoopSegment.iterations[0]}
        loopRecord={mockLoopRecord}
        left={20}
        width={80}
        blockHeight={22}
        showLabel={true}
        isSelected={false}
        isLastAndError={false}
        hasSelectedStep={false}
        onSelect={fn()}
      />
    </PositionedContainer>
  ),
} satisfies StoryObj;

export const LoopIterationBlockSelected = {
  render: () => (
    <PositionedContainer>
      <LoopIterationBlockInner
        iterRecord={iterRecords[1]}
        iterDisplay={mockLoopSegment.iterations[1]}
        loopRecord={mockLoopRecord}
        left={100}
        width={80}
        blockHeight={22}
        showLabel={true}
        isSelected={true}
        isLastAndError={false}
        hasSelectedStep={false}
        onSelect={fn()}
      />
    </PositionedContainer>
  ),
} satisfies StoryObj;

export const LoopTrackStory = {
  name: 'LoopTrack',
  render: () => (
    <DarkBg>
      <LoopTrack
        segment={mockLoopSegment}
        timeScale={4}
        contentWidth={400}
        selectedIteration={null}
        onSelectIteration={fn()}
        selectedStepIndex={null}
      />
    </DarkBg>
  ),
} satisfies StoryObj;

export const LoopSectionCollapsed = {
  name: 'LoopSection (collapsed)',
  render: () => (
    <DarkBg>
      <LoopSection
        segment={mockLoopSegment}
        timeScale={4}
        contentWidth={400}
        selectedIteration={null}
        onSelectIteration={fn()}
        selectedStepIndex={null}
        currentStepIndex={10}
        nearestDragStepIndex={null}
        onStepClick={fn()}
        onScrubTo={fn()}
        adjustForPause={false}
        selectedIterations={new Map()}
        onNestedSelectIteration={fn()}
      />
    </DarkBg>
  ),
} satisfies StoryObj;

export const LoopSectionExpanded = {
  name: 'LoopSection (expanded)',
  render: () => (
    <DarkBg>
      <LoopSection
        segment={mockLoopSegment}
        timeScale={4}
        contentWidth={400}
        selectedIteration={0}
        onSelectIteration={fn()}
        selectedStepIndex={null}
        currentStepIndex={10}
        nearestDragStepIndex={null}
        onStepClick={fn()}
        onScrubTo={fn()}
        adjustForPause={false}
        selectedIterations={new Map()}
        onNestedSelectIteration={fn()}
      />
    </DarkBg>
  ),
} satisfies StoryObj;
