import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import {
  ExecutionTimeline,
  type ExecutionTimelineProps,
} from './ExecutionTimeline';
import type {
  ExecutionRecord,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/types';

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

function makeRecord(
  steps: ExecutionStepRecord[],
  overrides?: Partial<ExecutionRecord>,
): ExecutionRecord {
  const endTime = Math.max(...steps.map((s) => s.endTime), 0);
  return {
    id: 'mock-run-1',
    startTime: 0,
    endTime,
    totalDuration: endTime,
    totalPauseDuration: 0,
    status: 'completed',
    steps,
    errors: [],
    concurrencyLevels: [],
    loopRecords: new Map(),
    groupRecords: new Map(),
    finalValues: new Map(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────
// Simple linear execution: A → B → C → D
// ─────────────────────────────────────────────────────

const linearSteps: ExecutionStepRecord[] = [
  makeStep({
    stepIndex: 0,
    nodeId: 'n1',
    nodeTypeName: 'Boolean Constant',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 12,
  }),
  makeStep({
    stepIndex: 1,
    nodeId: 'n2',
    nodeTypeName: 'NOT Gate',
    concurrencyLevel: 1,
    startTime: 12,
    duration: 8,
  }),
  makeStep({
    stepIndex: 2,
    nodeId: 'n3',
    nodeTypeName: 'Buffer',
    concurrencyLevel: 2,
    startTime: 20,
    duration: 15,
  }),
  makeStep({
    stepIndex: 3,
    nodeId: 'n4',
    nodeTypeName: 'Output Display',
    concurrencyLevel: 3,
    startTime: 35,
    duration: 6,
  }),
];

const linearRecord = makeRecord(linearSteps);

// ─────────────────────────────────────────────────────
// Concurrent execution: fan-out / fan-in diamond
//   A
//  / \
// B   C
//  \ /
//   D
// ─────────────────────────────────────────────────────

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

const concurrentRecord = makeRecord(concurrentSteps);

// ─────────────────────────────────────────────────────
// Large execution with many steps across multiple levels
// (deterministic values — no Math.random so it's stable)
// ─────────────────────────────────────────────────────

const nodeNames = [
  'Bool Constant',
  'Number Input',
  'String Input',
  'AND Gate',
  'OR Gate',
  'NOT Gate',
  'XOR Gate',
  'NAND Gate',
  'NOR Gate',
  'Buffer',
  'Multiplexer',
  'Accumulator',
  'Comparator',
  'Latch',
  'Shift Register',
  'Data Merge',
  'Output Display',
  'Debug Sink',
];

const largeSteps: ExecutionStepRecord[] = [];
let idx = 0;

// Level 0: 4 source nodes
const l0Durations = [10, 15, 8, 22];
for (let i = 0; i < 4; i++) {
  largeSteps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: `src-${i}`,
      nodeTypeName: nodeNames[i],
      concurrencyLevel: 0,
      startTime: 0,
      duration: l0Durations[i],
    }),
  );
}

// Level 1: 5 processing nodes
const l1Starts = [22, 22, 22, 22, 22];
const l1Durations = [30, 18, 25, 12, 40];
for (let i = 0; i < 5; i++) {
  largeSteps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: `proc-${i}`,
      nodeTypeName: nodeNames[3 + i],
      concurrencyLevel: 1,
      startTime: l1Starts[i],
      duration: l1Durations[i],
    }),
  );
}

// Level 2: 4 aggregation nodes
const l2Start = 62;
const l2Durations = [14, 22, 10, 16];
for (let i = 0; i < 4; i++) {
  largeSteps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: `agg-${i}`,
      nodeTypeName: nodeNames[8 + i],
      concurrencyLevel: 2,
      startTime: l2Start,
      duration: l2Durations[i],
    }),
  );
}

// Level 3: 3 output nodes
const l3Start = 84;
const l3Durations = [8, 12, 6];
for (let i = 0; i < 3; i++) {
  largeSteps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: `out-${i}`,
      nodeTypeName: nodeNames[15 + i],
      concurrencyLevel: 3,
      startTime: l3Start,
      duration: l3Durations[i],
    }),
  );
}

const largeRecord = makeRecord(largeSteps);

// ─────────────────────────────────────────────────────
// Execution with errors
// ─────────────────────────────────────────────────────

const errorSteps: ExecutionStepRecord[] = [
  makeStep({
    stepIndex: 0,
    nodeId: 'ok-1',
    nodeTypeName: 'Number Input',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 14,
  }),
  makeStep({
    stepIndex: 1,
    nodeId: 'ok-2',
    nodeTypeName: 'Transform',
    concurrencyLevel: 1,
    startTime: 14,
    duration: 20,
  }),
  makeStep({
    stepIndex: 2,
    nodeId: 'err-node',
    nodeTypeName: 'Divide',
    concurrencyLevel: 1,
    startTime: 14,
    duration: 8,
    status: 'errored',
    error: {
      message: 'Division by zero',
      nodeId: 'err-node',
      nodeTypeId: 'divider',
      nodeTypeName: 'Divide',
      path: [],
      timestamp: 22,
      duration: 8,
      originalError: new Error('Division by zero'),
    },
  }),
  makeStep({
    stepIndex: 3,
    nodeId: 'skip-1',
    nodeTypeName: 'Output Display',
    concurrencyLevel: 2,
    startTime: 34,
    duration: 0.5,
    status: 'skipped',
  }),
];

const errorRecord = makeRecord(errorSteps, { status: 'errored' });

// ─────────────────────────────────────────────────────
// Very long execution (stress test zoom/pan)
// ─────────────────────────────────────────────────────

const longSteps: ExecutionStepRecord[] = [];
let longIdx = 0;
let cursor = 0;
for (let level = 0; level < 8; level++) {
  const count = 3 + (level % 3);
  for (let i = 0; i < count; i++) {
    const dur = 20 + ((level * 7 + i * 13) % 40);
    longSteps.push(
      makeStep({
        stepIndex: longIdx++,
        nodeId: `L${level}-N${i}`,
        nodeTypeName: `${nodeNames[(level * 3 + i) % nodeNames.length]}`,
        concurrencyLevel: level,
        startTime: cursor,
        duration: dur,
      }),
    );
  }
  cursor += 60 + ((level * 11) % 30);
}

const longRecord = makeRecord(longSteps);

// ─────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────

const meta = {
  component: ExecutionTimeline,
  argTypes: {
    currentStepIndex: {
      control: { type: 'number', min: 0 },
    },
    selectedStepIndex: {
      control: { type: 'number', min: 0 },
    },
  },
  args: {
    currentStepIndex: 0,
    selectedStepIndex: null,
    onScrubTo: fn(),
    onStepClick: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<ExecutionTimelineProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    record: linearRecord,
  },
};

export const NoRecord: Story = {
  args: {
    record: null,
  },
};

export const LinearExecution: Story = {
  args: {
    record: linearRecord,
    currentStepIndex: 2,
  },
};

export const ConcurrentExecution: Story = {
  args: {
    record: concurrentRecord,
    currentStepIndex: 1,
  },
};

/**
 * 16 steps across 4 concurrency levels.
 * Use scroll wheel to zoom, drag to pan.
 */
export const LargeGraph: Story = {
  args: {
    record: largeRecord,
    currentStepIndex: 5,
  },
};

export const WithErrors: Story = {
  args: {
    record: errorRecord,
    currentStepIndex: 2,
    selectedStepIndex: 2,
  },
};

export const WithSelectedStep: Story = {
  args: {
    record: concurrentRecord,
    currentStepIndex: 1,
    selectedStepIndex: 1,
  },
};

/**
 * 30+ steps across 8 levels — stress-tests scroll wheel zoom and drag panning.
 * The timeline starts fitted to view. Use scroll wheel to zoom into specific regions.
 */
export const StressTestLong: Story = {
  args: {
    record: longRecord,
    currentStepIndex: 10,
  },
};

/**
 * Fully interactive demo with scrubber and click-to-inspect.
 *
 * - **Scroll wheel** to zoom in/out (centered on cursor)
 * - **Click + drag** to pan horizontally
 * - **Click a block** to select it
 * - **Click the ruler** to move the scrubber
 */
export const InteractiveDemo: Story = {
  args: {
    record: largeRecord,
    currentStepIndex: 0,
    selectedStepIndex: null,
  },
  render: () => {
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedStep, setSelectedStep] = useState<number | null>(null);

    return (
      <div className='flex flex-col gap-4 w-full'>
        <div className='flex items-center gap-4 px-4'>
          <span className='text-primary-white text-[14px] font-main'>
            Scrubber at step:{' '}
            <span className='text-primary-blue font-semibold'>
              {currentStep}
            </span>
          </span>
          <span className='text-secondary-light-gray text-[14px] font-main'>
            |
          </span>
          <span className='text-primary-white text-[14px] font-main'>
            Selected:{' '}
            <span className='text-primary-blue font-semibold'>
              {selectedStep ?? 'none'}
            </span>
          </span>
          <span className='text-secondary-dark-gray text-[12px] font-main ml-auto'>
            Scroll to zoom &middot; Drag to pan &middot; Click ruler to scrub
          </span>
        </div>
        <ExecutionTimeline
          record={largeRecord}
          currentStepIndex={currentStep}
          selectedStepIndex={selectedStep}
          onScrubTo={setCurrentStep}
          onStepClick={(step) => setSelectedStep(step.stepIndex)}
        />
      </div>
    );
  },
};

/**
 * Shows the timeline with all steps completed, scrubber at the last step.
 */
export const FullyCompleted: Story = {
  args: {
    record: linearRecord,
    currentStepIndex: linearSteps.length - 1,
  },
};
