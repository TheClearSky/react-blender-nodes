import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, useCallback, useRef } from 'react';
import { fn } from 'storybook/test';

import { NodeRunnerPanel, type NodeRunnerPanelProps } from './NodeRunnerPanel';
import { RecordingViewStateProvider } from '@/components/organisms/FullGraph/RecordingViewStateContext';
import type { RunMode } from '@/components/molecules/RunControls/RunControls';
import type {
  RunnerState,
  ExecutionRecord,
  ExecutionStepRecord,
  GraphError,
  RecordedInputHandleValue,
  RecordedInputConnection,
  RecordedOutputHandleValue,
} from '@/utils/nodeRunner/types';
import { runnerStates } from '@/utils/nodeRunner/types';

// ═══════════════════════════════════════════════════════
// Mock Data Factories
// ═══════════════════════════════════════════════════════

function conn(
  value: unknown,
  sourceNodeName: string,
  sourceHandleName: string,
  opts: Partial<RecordedInputConnection> = {},
): RecordedInputConnection {
  return {
    value,
    sourceNodeId:
      opts.sourceNodeId ??
      `node-${sourceNodeName.toLowerCase().replace(/\s/g, '-')}`,
    sourceNodeName,
    sourceHandleId:
      opts.sourceHandleId ??
      `handle-${sourceHandleName.toLowerCase().replace(/\s/g, '-')}`,
    sourceHandleName,
    sourceDataTypeId: opts.sourceDataTypeId ?? 'bit',
    ...opts,
  };
}

function inputWith(
  connections: RecordedInputConnection[],
  dataTypeId: string = 'bit',
): RecordedInputHandleValue {
  return { connections, dataTypeId, isDefault: false };
}

function inputDefault(
  defaultValue: unknown,
  dataTypeId: string = 'bit',
): RecordedInputHandleValue {
  return { connections: [], dataTypeId, isDefault: true, defaultValue };
}

function output(
  value: unknown,
  dataTypeId: string = 'bit',
  targetCount: number = 1,
): RecordedOutputHandleValue {
  return { value, dataTypeId, targetCount };
}

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
    compilationDuration: 0,
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

// ═══════════════════════════════════════════════════════
// Scenario: Half-Adder Circuit
//
//   BitConst(A) ──┬──> AND Gate ──> Display(Carry)
//                 │
//   BitConst(B) ──┼──> XOR Gate ──> Display(Sum)
//                 │
//   (fan-out from A and B to both AND and XOR)
// ═══════════════════════════════════════════════════════

const halfAdderSteps: ExecutionStepRecord[] = [
  makeStep({
    stepIndex: 0,
    nodeId: 'bit-a',
    nodeTypeId: 'bitConstant',
    nodeTypeName: 'Bit Constant (A)',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 0.3,
    inputValues: new Map([['Value', inputDefault(true)]]),
    outputValues: new Map([['Out', output(true, 'bit', 2)]]),
  }),
  makeStep({
    stepIndex: 1,
    nodeId: 'bit-b',
    nodeTypeId: 'bitConstant',
    nodeTypeName: 'Bit Constant (B)',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 0.2,
    inputValues: new Map([['Value', inputDefault(true)]]),
    outputValues: new Map([['Out', output(true, 'bit', 2)]]),
  }),
  makeStep({
    stepIndex: 2,
    nodeId: 'and-1',
    nodeTypeId: 'andGate',
    nodeTypeName: 'AND Gate',
    concurrencyLevel: 1,
    startTime: 0.3,
    duration: 0.4,
    inputValues: new Map([
      ['A', inputWith([conn(true, 'Bit Constant (A)', 'Out')])],
      ['B', inputWith([conn(true, 'Bit Constant (B)', 'Out')])],
    ]),
    outputValues: new Map([['Out', output(true)]]),
  }),
  makeStep({
    stepIndex: 3,
    nodeId: 'xor-1',
    nodeTypeId: 'xorGate',
    nodeTypeName: 'XOR Gate',
    concurrencyLevel: 1,
    startTime: 0.3,
    duration: 0.5,
    inputValues: new Map([
      ['A', inputWith([conn(true, 'Bit Constant (A)', 'Out')])],
      ['B', inputWith([conn(true, 'Bit Constant (B)', 'Out')])],
    ]),
    outputValues: new Map([['Out', output(false)]]),
  }),
  makeStep({
    stepIndex: 4,
    nodeId: 'disp-carry',
    nodeTypeId: 'bitDisplay',
    nodeTypeName: 'Carry Display',
    concurrencyLevel: 2,
    startTime: 0.8,
    duration: 0.1,
    inputValues: new Map([['In', inputWith([conn(true, 'AND Gate', 'Out')])]]),
    outputValues: new Map(),
  }),
  makeStep({
    stepIndex: 5,
    nodeId: 'disp-sum',
    nodeTypeId: 'bitDisplay',
    nodeTypeName: 'Sum Display',
    concurrencyLevel: 2,
    startTime: 0.8,
    duration: 0.15,
    inputValues: new Map([['In', inputWith([conn(false, 'XOR Gate', 'Out')])]]),
    outputValues: new Map(),
  }),
];

const halfAdderRecord = makeRecord(halfAdderSteps);

// ═══════════════════════════════════════════════════════
// Scenario: Large Pipeline (16 nodes, 4 levels)
// ═══════════════════════════════════════════════════════

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

function buildLargePipeline(): ExecutionStepRecord[] {
  const steps: ExecutionStepRecord[] = [];
  let idx = 0;

  // Level 0: 4 sources
  const l0Durations = [10, 15, 8, 22];
  for (let i = 0; i < 4; i++) {
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `src-${i}`,
        nodeTypeName: nodeNames[i],
        concurrencyLevel: 0,
        startTime: 0,
        duration: l0Durations[i],
        inputValues: new Map([
          ['Value', inputDefault(i % 2 === 0, i < 2 ? 'bit' : 'number')],
        ]),
        outputValues: new Map([
          ['Out', output(i % 2 === 0, i < 2 ? 'bit' : 'number', 2)],
        ]),
      }),
    );
  }

  // Level 1: 5 processing nodes
  const l1Durations = [30, 18, 25, 12, 40];
  for (let i = 0; i < 5; i++) {
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `proc-${i}`,
        nodeTypeName: nodeNames[3 + i],
        concurrencyLevel: 1,
        startTime: 22,
        duration: l1Durations[i],
        inputValues: new Map([
          ['A', inputWith([conn(true, nodeNames[i % 4], 'Out')])],
          ['B', inputWith([conn(false, nodeNames[(i + 1) % 4], 'Out')])],
        ]),
        outputValues: new Map([['Out', output(i % 2 === 0)]]),
      }),
    );
  }

  // Level 2: 4 aggregation nodes
  const l2Durations = [14, 22, 10, 16];
  for (let i = 0; i < 4; i++) {
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `agg-${i}`,
        nodeTypeName: nodeNames[8 + i],
        concurrencyLevel: 2,
        startTime: 62,
        duration: l2Durations[i],
      }),
    );
  }

  // Level 3: 3 output nodes
  const l3Durations = [8, 12, 6];
  for (let i = 0; i < 3; i++) {
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `out-${i}`,
        nodeTypeName: nodeNames[15 + i],
        concurrencyLevel: 3,
        startTime: 84,
        duration: l3Durations[i],
      }),
    );
  }

  return steps;
}

const largePipelineSteps = buildLargePipeline();
const largePipelineRecord = makeRecord(largePipelineSteps);

// ═══════════════════════════════════════════════════════
// Scenario: Execution with Errors
// ═══════════════════════════════════════════════════════

const divisionError: GraphError = {
  message: 'Division by zero: denominator input resolved to 0',
  nodeId: 'err-node',
  nodeTypeId: 'divider',
  nodeTypeName: 'Divide',
  handleId: 'output-0',
  path: [
    {
      nodeId: 'src-const',
      nodeTypeId: 'constant',
      nodeTypeName: 'Constant',
      concurrencyLevel: 0,
    },
    {
      nodeId: 'err-node',
      nodeTypeId: 'divider',
      nodeTypeName: 'Divide',
      handleId: 'input-denom',
      concurrencyLevel: 1,
    },
  ],
  timestamp: 22,
  duration: 8,
  originalError: new Error('Division by zero'),
};

const errorSteps: ExecutionStepRecord[] = [
  makeStep({
    stepIndex: 0,
    nodeId: 'ok-1',
    nodeTypeName: 'Number Input',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 14,
    inputValues: new Map([['Value', inputDefault(42, 'number')]]),
    outputValues: new Map([['Out', output(42, 'number', 2)]]),
  }),
  makeStep({
    stepIndex: 1,
    nodeId: 'ok-2',
    nodeTypeName: 'Transform',
    concurrencyLevel: 1,
    startTime: 14,
    duration: 20,
    inputValues: new Map([
      [
        'Value',
        inputWith(
          [conn(42, 'Number Input', 'Out', { sourceDataTypeId: 'number' })],
          'number',
        ),
      ],
    ]),
    outputValues: new Map([['Result', output(84, 'number')]]),
  }),
  makeStep({
    stepIndex: 2,
    nodeId: 'err-node',
    nodeTypeName: 'Divide',
    concurrencyLevel: 1,
    startTime: 14,
    duration: 8,
    status: 'errored',
    inputValues: new Map([
      [
        'Numerator',
        inputWith(
          [conn(42, 'Number Input', 'Out', { sourceDataTypeId: 'number' })],
          'number',
        ),
      ],
      [
        'Denominator',
        inputWith(
          [conn(0, 'Constant Zero', 'Value', { sourceDataTypeId: 'number' })],
          'number',
        ),
      ],
    ]),
    outputValues: new Map(),
    error: divisionError,
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

const errorRecord = makeRecord(errorSteps, {
  status: 'errored',
  errors: [divisionError],
});

// ═══════════════════════════════════════════════════════
// Scenario: Loop Execution (counter loop 5 iterations)
// ═══════════════════════════════════════════════════════

function buildLoopExecution(): ExecutionStepRecord[] {
  const steps: ExecutionStepRecord[] = [];
  let idx = 0;

  // Level 0: initial value source
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'init',
      nodeTypeName: 'Number Constant',
      concurrencyLevel: 0,
      startTime: 0,
      duration: 0.5,
      inputValues: new Map([['Value', inputDefault(0, 'number')]]),
      outputValues: new Map([['Out', output(0, 'number')]]),
    }),
  );

  // Level 0: max value
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'max',
      nodeTypeName: 'Number Constant',
      concurrencyLevel: 0,
      startTime: 0,
      duration: 0.3,
      inputValues: new Map([['Value', inputDefault(5, 'number')]]),
      outputValues: new Map([['Out', output(5, 'number')]]),
    }),
  );

  // 5 loop iterations
  for (let iter = 0; iter < 5; iter++) {
    // Counter node
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `counter-${iter}`,
        nodeTypeName: 'Counter',
        concurrencyLevel: 1,
        startTime: 0.5 + iter * 1.2,
        duration: 0.8,
        loopIteration: iter,
        loopStructureId: 'loop-main',
        inputValues: new Map([
          [
            'Count',
            inputWith(
              [
                conn(
                  iter,
                  iter === 0 ? 'Number Constant' : 'Counter',
                  iter === 0 ? 'Out' : 'Count + 1',
                  { sourceDataTypeId: 'number' },
                ),
              ],
              'number',
            ),
          ],
          [
            'Max',
            inputWith(
              [
                conn(5, 'Number Constant', 'Out', {
                  sourceDataTypeId: 'number',
                }),
              ],
              'number',
            ),
          ],
        ]),
        outputValues: new Map([
          ['Count + 1', output(iter + 1, 'number')],
          ['Reached Max', output(iter + 1 >= 5, 'bit')],
        ]),
      }),
    );
  }

  // Level 2: final output
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'result',
      nodeTypeName: 'Output Display',
      concurrencyLevel: 2,
      startTime: 6.5,
      duration: 0.2,
      inputValues: new Map([
        [
          'In',
          inputWith(
            [conn(5, 'Counter', 'Count + 1', { sourceDataTypeId: 'number' })],
            'number',
          ),
        ],
      ]),
      outputValues: new Map(),
    }),
  );

  return steps;
}

const loopSteps = buildLoopExecution();
const loopRecord = makeRecord(loopSteps);

// ═══════════════════════════════════════════════════════
// Scenario: Group Execution (Half-Adder inside a group)
// ═══════════════════════════════════════════════════════

const groupSteps: ExecutionStepRecord[] = [
  makeStep({
    stepIndex: 0,
    nodeId: 'outer-a',
    nodeTypeName: 'Bit Constant',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 0.2,
    inputValues: new Map([['Value', inputDefault(true)]]),
    outputValues: new Map([['Out', output(true)]]),
  }),
  makeStep({
    stepIndex: 1,
    nodeId: 'outer-b',
    nodeTypeName: 'Bit Constant',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 0.15,
    inputValues: new Map([['Value', inputDefault(false)]]),
    outputValues: new Map([['Out', output(false)]]),
  }),
  // Group inner nodes
  makeStep({
    stepIndex: 2,
    nodeId: 'group-and',
    nodeTypeName: 'AND Gate (inner)',
    concurrencyLevel: 1,
    startTime: 0.2,
    duration: 0.3,
    groupNodeId: 'group-ha',
    groupDepth: 1,
    inputValues: new Map([
      ['A', inputWith([conn(true, 'Group Input', 'A')])],
      ['B', inputWith([conn(false, 'Group Input', 'B')])],
    ]),
    outputValues: new Map([['Out', output(false)]]),
  }),
  makeStep({
    stepIndex: 3,
    nodeId: 'group-xor',
    nodeTypeName: 'XOR Gate (inner)',
    concurrencyLevel: 1,
    startTime: 0.2,
    duration: 0.35,
    groupNodeId: 'group-ha',
    groupDepth: 1,
    inputValues: new Map([
      ['A', inputWith([conn(true, 'Group Input', 'A')])],
      ['B', inputWith([conn(false, 'Group Input', 'B')])],
    ]),
    outputValues: new Map([['Out', output(true)]]),
  }),
  makeStep({
    stepIndex: 4,
    nodeId: 'outer-carry',
    nodeTypeName: 'Carry Display',
    concurrencyLevel: 2,
    startTime: 0.55,
    duration: 0.1,
    inputValues: new Map([
      ['In', inputWith([conn(false, 'Half Adder', 'Carry')])],
    ]),
    outputValues: new Map(),
  }),
  makeStep({
    stepIndex: 5,
    nodeId: 'outer-sum',
    nodeTypeName: 'Sum Display',
    concurrencyLevel: 2,
    startTime: 0.55,
    duration: 0.12,
    inputValues: new Map([
      ['In', inputWith([conn(true, 'Half Adder', 'Sum')])],
    ]),
    outputValues: new Map(),
  }),
];

const groupRecord = makeRecord(groupSteps);

// ═══════════════════════════════════════════════════════
// Meta
// ═══════════════════════════════════════════════════════

const meta = {
  title: 'Organisms/NodeRunnerPanel',
  component: NodeRunnerPanel,
  argTypes: {
    runnerState: {
      control: 'select',
      options: [...runnerStates],
    },
    mode: {
      control: 'select',
      options: ['instant', 'stepByStep'],
    },
    maxLoopIterations: {
      control: { type: 'number', min: 1, max: 100000 },
    },
    currentStepIndex: {
      control: { type: 'number', min: 0 },
    },
    debugMode: { control: 'boolean' },
    hideComplexValues: { control: 'boolean' },
  },
  args: {
    runnerState: 'idle',
    record: null,
    currentStepIndex: 0,
    onRun: fn(),
    onPause: fn(),
    onStep: fn(),
    onStop: fn(),
    onReset: fn(),
    mode: 'instant',
    onModeChange: fn(),
    maxLoopIterations: 100,
    onMaxLoopIterationsChange: fn(),
    onScrubTo: fn(),
    debugMode: false,
    hideComplexValues: false,
  },
  decorators: [
    (Story) => (
      <RecordingViewStateProvider>
        <div className='relative flex flex-col justify-end min-h-[600px] bg-[#1a1a1a]'>
          <Story />
        </div>
      </RecordingViewStateProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<NodeRunnerPanelProps>;

export default meta;

type Story = StoryObj<typeof meta>;

// ═══════════════════════════════════════════════════════
// Static Stories (individual states)
// ═══════════════════════════════════════════════════════

/** Panel in idle state before any execution. No timeline shown. */
export const IdleNoRecord: Story = {
  args: {
    runnerState: 'idle',
    record: null,
  },
};

/** Panel after a completed execution. Timeline shows half-adder circuit. */
export const CompletedHalfAdder: Story = {
  args: {
    runnerState: 'completed',
    record: halfAdderRecord,
    currentStepIndex: 5,
  },
};

/** Panel showing a large pipeline execution (16 nodes, 4 levels). */
export const CompletedLargePipeline: Story = {
  args: {
    runnerState: 'completed',
    record: largePipelineRecord,
    currentStepIndex: 10,
  },
};

/** Panel showing an errored execution with skipped downstream. */
export const ErroredExecution: Story = {
  args: {
    runnerState: 'errored',
    record: errorRecord,
    currentStepIndex: 2,
  },
};

/** Panel showing loop execution (counter, 5 iterations). */
export const LoopExecution: Story = {
  args: {
    runnerState: 'completed',
    record: loopRecord,
    currentStepIndex: 4,
  },
};

/** Panel showing group execution (half-adder inside a group). */
export const GroupExecution: Story = {
  args: {
    runnerState: 'completed',
    record: groupRecord,
    currentStepIndex: 3,
  },
};

/** Panel in paused state during step-by-step execution. */
export const PausedStepByStep: Story = {
  args: {
    runnerState: 'paused',
    record: makeRecord(halfAdderSteps.slice(0, 3)),
    currentStepIndex: 2,
    mode: 'stepByStep',
  },
};

/** Panel currently running. Only controls shown, timeline grows. */
export const Running: Story = {
  args: {
    runnerState: 'running',
    record: makeRecord(halfAdderSteps.slice(0, 2)),
    currentStepIndex: 1,
    mode: 'instant',
  },
};

/** Panel in compiling state. All buttons disabled. */
export const Compiling: Story = {
  args: {
    runnerState: 'compiling',
    record: null,
  },
};

// ═══════════════════════════════════════════════════════
// Scenario: Full Adder Circuit (10 nodes, 4 levels)
//
//   A ──┬──> XOR1 ──┬──> XOR2 ──> Sum Display
//       └──> AND1 ──┼──> OR ──> Cout Display
//   B ──┬──> XOR1   │
//       └──> AND1   │
//   Cin ─┬──> XOR2  │
//         └──> AND2 ──> OR
// ═══════════════════════════════════════════════════════

const fullAdderSteps: ExecutionStepRecord[] = [
  // Level 0: three input constants (concurrent)
  makeStep({
    stepIndex: 0,
    nodeId: 'fa-a',
    nodeTypeId: 'bitConstant',
    nodeTypeName: 'Bit Constant (A)',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 0.2,
    inputValues: new Map([['Value', inputDefault(true)]]),
    outputValues: new Map([['Out', output(true, 'bit', 2)]]),
  }),
  makeStep({
    stepIndex: 1,
    nodeId: 'fa-b',
    nodeTypeId: 'bitConstant',
    nodeTypeName: 'Bit Constant (B)',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 0.15,
    inputValues: new Map([['Value', inputDefault(true)]]),
    outputValues: new Map([['Out', output(true, 'bit', 2)]]),
  }),
  makeStep({
    stepIndex: 2,
    nodeId: 'fa-cin',
    nodeTypeId: 'bitConstant',
    nodeTypeName: 'Bit Constant (Cin)',
    concurrencyLevel: 0,
    startTime: 0,
    duration: 0.18,
    inputValues: new Map([['Value', inputDefault(true)]]),
    outputValues: new Map([['Out', output(true, 'bit', 2)]]),
  }),
  // Level 1: Half Adder 1 — XOR(A,B) and AND(A,B) (concurrent)
  makeStep({
    stepIndex: 3,
    nodeId: 'fa-xor1',
    nodeTypeId: 'xorGate',
    nodeTypeName: 'XOR Gate (HA1)',
    concurrencyLevel: 1,
    startTime: 0.2,
    duration: 0.4,
    inputValues: new Map([
      ['A', inputWith([conn(true, 'Bit Constant (A)', 'Out')])],
      ['B', inputWith([conn(true, 'Bit Constant (B)', 'Out')])],
    ]),
    outputValues: new Map([['Out', output(false, 'bit', 2)]]), // 1 XOR 1 = 0
  }),
  makeStep({
    stepIndex: 4,
    nodeId: 'fa-and1',
    nodeTypeId: 'andGate',
    nodeTypeName: 'AND Gate (HA1)',
    concurrencyLevel: 1,
    startTime: 0.2,
    duration: 0.35,
    inputValues: new Map([
      ['A', inputWith([conn(true, 'Bit Constant (A)', 'Out')])],
      ['B', inputWith([conn(true, 'Bit Constant (B)', 'Out')])],
    ]),
    outputValues: new Map([['Out', output(true)]]), // 1 AND 1 = 1
  }),
  // Level 2: Half Adder 2 — XOR(partial_sum, Cin) and AND(partial_sum, Cin) (concurrent)
  makeStep({
    stepIndex: 5,
    nodeId: 'fa-xor2',
    nodeTypeId: 'xorGate',
    nodeTypeName: 'XOR Gate (HA2)',
    concurrencyLevel: 2,
    startTime: 0.6,
    duration: 0.45,
    inputValues: new Map([
      ['A', inputWith([conn(false, 'XOR Gate (HA1)', 'Out')])],
      ['B', inputWith([conn(true, 'Bit Constant (Cin)', 'Out')])],
    ]),
    outputValues: new Map([['Out', output(true)]]), // 0 XOR 1 = 1 (Sum)
  }),
  makeStep({
    stepIndex: 6,
    nodeId: 'fa-and2',
    nodeTypeId: 'andGate',
    nodeTypeName: 'AND Gate (HA2)',
    concurrencyLevel: 2,
    startTime: 0.6,
    duration: 0.38,
    inputValues: new Map([
      ['A', inputWith([conn(false, 'XOR Gate (HA1)', 'Out')])],
      ['B', inputWith([conn(true, 'Bit Constant (Cin)', 'Out')])],
    ]),
    outputValues: new Map([['Out', output(false)]]), // 0 AND 1 = 0
  }),
  // Level 3: OR gate for carry, and displays (concurrent)
  makeStep({
    stepIndex: 7,
    nodeId: 'fa-or',
    nodeTypeId: 'orGate',
    nodeTypeName: 'OR Gate (Carry)',
    concurrencyLevel: 3,
    startTime: 1.05,
    duration: 0.3,
    inputValues: new Map([
      ['A', inputWith([conn(true, 'AND Gate (HA1)', 'Out')])],
      ['B', inputWith([conn(false, 'AND Gate (HA2)', 'Out')])],
    ]),
    outputValues: new Map([['Out', output(true)]]), // 1 OR 0 = 1 (Cout)
  }),
  makeStep({
    stepIndex: 8,
    nodeId: 'fa-disp-sum',
    nodeTypeId: 'bitDisplay',
    nodeTypeName: 'Sum Display',
    concurrencyLevel: 3,
    startTime: 1.05,
    duration: 0.1,
    inputValues: new Map([
      ['In', inputWith([conn(true, 'XOR Gate (HA2)', 'Out')])],
    ]),
    outputValues: new Map(),
  }),
  // Level 4: Cout display
  makeStep({
    stepIndex: 9,
    nodeId: 'fa-disp-cout',
    nodeTypeId: 'bitDisplay',
    nodeTypeName: 'Cout Display',
    concurrencyLevel: 4,
    startTime: 1.35,
    duration: 0.1,
    inputValues: new Map([
      ['In', inputWith([conn(true, 'OR Gate (Carry)', 'Out')])],
    ]),
    outputValues: new Map(),
  }),
];

const fullAdderRecord = makeRecord(fullAdderSteps);

// ═══════════════════════════════════════════════════════
// Scenario: 4-Bit Ripple Carry Adder (5 + 3 = 8)
//
// Chains 4 full adders; carry propagates through the chain.
// Per FA: 2 inputs + XOR1 + AND1 + XOR2 + AND2 + OR + display = 8 steps
// Plus Cin constant + Cout display = 34 total steps
// ═══════════════════════════════════════════════════════

function buildRippleCarryAdderExecution(): ExecutionStepRecord[] {
  const steps: ExecutionStepRecord[] = [];
  let idx = 0;

  // A = 0101 = 5 (LSB first: [1,0,1,0])
  // B = 0011 = 3 (LSB first: [1,1,0,0])
  const aVals = [true, false, true, false];
  const bVals = [true, true, false, false];

  // Expected intermediate values:
  // Bit 0: A=1,B=1,Cin=0 → partial=0, gen=1, sum=0, prop=0, cout=1
  // Bit 1: A=0,B=1,Cin=1 → partial=1, gen=0, sum=0, prop=1, cout=1
  // Bit 2: A=1,B=0,Cin=1 → partial=1, gen=0, sum=0, prop=1, cout=1
  // Bit 3: A=0,B=0,Cin=1 → partial=0, gen=0, sum=1, prop=0, cout=0
  // Result: S=1000=8, Cout=0 ✓

  type BitCalc = {
    partial: boolean;
    gen: boolean;
    sum: boolean;
    prop: boolean;
    cout: boolean;
  };
  const bits: BitCalc[] = [];
  let carry = false; // Cin = 0
  for (let i = 0; i < 4; i++) {
    const partial = aVals[i] !== bVals[i]; // XOR
    const gen = aVals[i] && bVals[i]; // AND
    const sum = partial !== carry; // XOR with carry
    const prop: boolean = partial && carry; // AND with carry
    const cout: boolean = gen || prop; // OR
    bits.push({ partial, gen, sum, prop, cout });
    carry = cout;
  }

  // Level 0: Cin constant + all A and B constants (concurrent)
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'rca-cin',
      nodeTypeId: 'bitConstant',
      nodeTypeName: 'Cin (0)',
      concurrencyLevel: 0,
      startTime: 0,
      duration: 0.2,
      inputValues: new Map([['Value', inputDefault(false)]]),
      outputValues: new Map([['Out', output(false, 'bit', 2)]]),
    }),
  );

  for (let i = 0; i < 4; i++) {
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `rca-a${i}`,
        nodeTypeId: 'bitConstant',
        nodeTypeName: `A${i} (${aVals[i] ? '1' : '0'})`,
        concurrencyLevel: 0,
        startTime: 0,
        duration: 0.15 + i * 0.02,
        inputValues: new Map([['Value', inputDefault(aVals[i])]]),
        outputValues: new Map([['Out', output(aVals[i], 'bit', 2)]]),
      }),
    );
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `rca-b${i}`,
        nodeTypeId: 'bitConstant',
        nodeTypeName: `B${i} (${bVals[i] ? '1' : '0'})`,
        concurrencyLevel: 0,
        startTime: 0,
        duration: 0.12 + i * 0.02,
        inputValues: new Map([['Value', inputDefault(bVals[i])]]),
        outputValues: new Map([['Out', output(bVals[i], 'bit', 2)]]),
      }),
    );
  }

  // For each bit position, build the full adder steps
  // Due to carry chain, each FA depends on the previous one's carry output
  let levelTime = 0.25;

  for (let i = 0; i < 4; i++) {
    const b = bits[i];
    const prevCarryName = i === 0 ? 'Cin (0)' : `OR Gate (FA${i - 1})`;
    const prevCarryVal = i === 0 ? false : bits[i - 1].cout;
    const level = 1 + i * 2; // Each FA occupies 2 levels (stage1 + stage2)

    // Stage 1: XOR1 and AND1 (concurrent within this FA)
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `rca-xor1-${i}`,
        nodeTypeId: 'xorGate',
        nodeTypeName: `XOR1 (FA${i})`,
        concurrencyLevel: level,
        startTime: levelTime,
        duration: 0.3 + Math.random() * 0.1,
        inputValues: new Map([
          [
            'A',
            inputWith([
              conn(aVals[i], `A${i} (${aVals[i] ? '1' : '0'})`, 'Out'),
            ]),
          ],
          [
            'B',
            inputWith([
              conn(bVals[i], `B${i} (${bVals[i] ? '1' : '0'})`, 'Out'),
            ]),
          ],
        ]),
        outputValues: new Map([['Out', output(b.partial, 'bit', 2)]]),
      }),
    );
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `rca-and1-${i}`,
        nodeTypeId: 'andGate',
        nodeTypeName: `AND1 (FA${i})`,
        concurrencyLevel: level,
        startTime: levelTime,
        duration: 0.28 + Math.random() * 0.1,
        inputValues: new Map([
          [
            'A',
            inputWith([
              conn(aVals[i], `A${i} (${aVals[i] ? '1' : '0'})`, 'Out'),
            ]),
          ],
          [
            'B',
            inputWith([
              conn(bVals[i], `B${i} (${bVals[i] ? '1' : '0'})`, 'Out'),
            ]),
          ],
        ]),
        outputValues: new Map([['Out', output(b.gen)]]),
      }),
    );

    const stage1End = levelTime + 0.4;

    // Stage 2: XOR2, AND2 (depend on XOR1 + carry), then OR
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `rca-xor2-${i}`,
        nodeTypeId: 'xorGate',
        nodeTypeName: `XOR2 (FA${i})`,
        concurrencyLevel: level + 1,
        startTime: stage1End,
        duration: 0.35,
        inputValues: new Map([
          ['A', inputWith([conn(b.partial, `XOR1 (FA${i})`, 'Out')])],
          ['B', inputWith([conn(prevCarryVal, prevCarryName, 'Out')])],
        ]),
        outputValues: new Map([['Out', output(b.sum)]]),
      }),
    );
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `rca-and2-${i}`,
        nodeTypeId: 'andGate',
        nodeTypeName: `AND2 (FA${i})`,
        concurrencyLevel: level + 1,
        startTime: stage1End,
        duration: 0.32,
        inputValues: new Map([
          ['A', inputWith([conn(b.partial, `XOR1 (FA${i})`, 'Out')])],
          ['B', inputWith([conn(prevCarryVal, prevCarryName, 'Out')])],
        ]),
        outputValues: new Map([['Out', output(b.prop)]]),
      }),
    );

    const stage2End = stage1End + 0.4;

    // OR gate for carry
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `rca-or-${i}`,
        nodeTypeId: 'orGate',
        nodeTypeName: `OR Gate (FA${i})`,
        concurrencyLevel: level + 1,
        startTime: stage2End,
        duration: 0.25,
        inputValues: new Map([
          ['A', inputWith([conn(b.gen, `AND1 (FA${i})`, 'Out')])],
          ['B', inputWith([conn(b.prop, `AND2 (FA${i})`, 'Out')])],
        ]),
        outputValues: new Map([['Out', output(b.cout)]]),
      }),
    );

    // Sum display for this bit
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `rca-disp-s${i}`,
        nodeTypeId: 'bitDisplay',
        nodeTypeName: `S${i} Display (${b.sum ? '1' : '0'})`,
        concurrencyLevel: level + 1,
        startTime: stage2End,
        duration: 0.1,
        inputValues: new Map([
          ['In', inputWith([conn(b.sum, `XOR2 (FA${i})`, 'Out')])],
        ]),
        outputValues: new Map(),
      }),
    );

    levelTime = stage2End + 0.3;
  }

  // Final Cout display
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'rca-disp-cout',
      nodeTypeId: 'bitDisplay',
      nodeTypeName: `Cout Display (${bits[3].cout ? '1' : '0'})`,
      concurrencyLevel: 9,
      startTime: levelTime,
      duration: 0.1,
      inputValues: new Map([
        ['In', inputWith([conn(bits[3].cout, 'OR Gate (FA3)', 'Out')])],
      ]),
      outputValues: new Map(),
    }),
  );

  return steps;
}

const rippleCarryAdderSteps = buildRippleCarryAdderExecution();
const rippleCarryAdderRecord = makeRecord(rippleCarryAdderSteps);

// ═══════════════════════════════════════════════════════
// Scenario: Nested Group Execution
// (Full Adder group containing two Half-Adder inner groups)
//
// Outer:
//   BitConst(A) ──┐
//   BitConst(B) ──┼──> [Full Adder Group] ──> Carry Display
//   BitConst(Cin) ┘         │
//                           └──> Sum Display
//
// Inside "Full Adder Group":
//   GroupInput(A,B) ──> [Half Adder Group 1] ──> partial_sum
//   GroupInput(Cin) + partial_sum ──> [Half Adder Group 2] ──> Sum
//   HA1.carry OR HA2.carry ──> GroupOutput(Cout)
//
// Inside each "Half Adder Group":
//   GroupInput(X,Y) ──> XOR ──> GroupOutput(Sum)
//                   ──> AND ──> GroupOutput(Carry)
// ═══════════════════════════════════════════════════════

function buildNestedGroupExecution(): {
  steps: ExecutionStepRecord[];
  groupRecords: Map<string, import('@/utils/nodeRunner/types').GroupRecord>;
} {
  const steps: ExecutionStepRecord[] = [];
  let idx = 0;

  // Level 0: outer constants
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-a',
      nodeTypeName: 'Bit Constant (A)',
      nodeTypeId: 'bitConstant',
      concurrencyLevel: 0,
      startTime: 0,
      duration: 0.2,
      inputValues: new Map([['Value', inputDefault(true)]]),
      outputValues: new Map([['Out', output(true, 'bit')]]),
    }),
  );
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-b',
      nodeTypeName: 'Bit Constant (B)',
      nodeTypeId: 'bitConstant',
      concurrencyLevel: 0,
      startTime: 0,
      duration: 0.15,
      inputValues: new Map([['Value', inputDefault(false)]]),
      outputValues: new Map([['Out', output(false, 'bit')]]),
    }),
  );
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-cin',
      nodeTypeName: 'Bit Constant (Cin)',
      nodeTypeId: 'bitConstant',
      concurrencyLevel: 0,
      startTime: 0,
      duration: 0.18,
      inputValues: new Map([['Value', inputDefault(true)]]),
      outputValues: new Map([['Out', output(true, 'bit')]]),
    }),
  );

  // Level 1: Full Adder Group (depth 1)
  //   Inner HA1 (depth 2): XOR(A=1, B=0)=1, AND(A=1, B=0)=0
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-ha1-xor',
      nodeTypeName: 'XOR Gate (HA1 inner)',
      nodeTypeId: 'xorGate',
      concurrencyLevel: 1,
      startTime: 0.2,
      duration: 0.3,
      groupNodeId: 'ng-ha1-group',
      groupDepth: 2,
      inputValues: new Map([
        ['A', inputWith([conn(true, 'Group Input', 'A')])],
        ['B', inputWith([conn(false, 'Group Input', 'B')])],
      ]),
      outputValues: new Map([['Out', output(true)]]),
    }),
  );
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-ha1-and',
      nodeTypeName: 'AND Gate (HA1 inner)',
      nodeTypeId: 'andGate',
      concurrencyLevel: 1,
      startTime: 0.2,
      duration: 0.25,
      groupNodeId: 'ng-ha1-group',
      groupDepth: 2,
      inputValues: new Map([
        ['A', inputWith([conn(true, 'Group Input', 'A')])],
        ['B', inputWith([conn(false, 'Group Input', 'B')])],
      ]),
      outputValues: new Map([['Out', output(false)]]),
    }),
  );

  // Inner HA2 (depth 2): XOR(partial=1, Cin=1)=0, AND(partial=1, Cin=1)=1
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-ha2-xor',
      nodeTypeName: 'XOR Gate (HA2 inner)',
      nodeTypeId: 'xorGate',
      concurrencyLevel: 2,
      startTime: 0.5,
      duration: 0.35,
      groupNodeId: 'ng-ha2-group',
      groupDepth: 2,
      inputValues: new Map([
        ['A', inputWith([conn(true, 'Half Adder 1', 'Sum')])],
        ['B', inputWith([conn(true, 'Group Input', 'Cin')])],
      ]),
      outputValues: new Map([['Out', output(false)]]), // Sum = 0
    }),
  );
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-ha2-and',
      nodeTypeName: 'AND Gate (HA2 inner)',
      nodeTypeId: 'andGate',
      concurrencyLevel: 2,
      startTime: 0.5,
      duration: 0.3,
      groupNodeId: 'ng-ha2-group',
      groupDepth: 2,
      inputValues: new Map([
        ['A', inputWith([conn(true, 'Half Adder 1', 'Sum')])],
        ['B', inputWith([conn(true, 'Group Input', 'Cin')])],
      ]),
      outputValues: new Map([['Out', output(true)]]),
    }),
  );

  // OR gate (depth 1, inside Full Adder group but outside HA groups)
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-or',
      nodeTypeName: 'OR Gate (Carry)',
      nodeTypeId: 'orGate',
      concurrencyLevel: 3,
      startTime: 0.85,
      duration: 0.2,
      groupNodeId: 'ng-fa-group',
      groupDepth: 1,
      inputValues: new Map([
        ['A', inputWith([conn(false, 'Half Adder 1', 'Carry')])],
        ['B', inputWith([conn(true, 'Half Adder 2', 'Carry')])],
      ]),
      outputValues: new Map([['Out', output(true)]]), // Cout = 1
    }),
  );

  // Level 2: outer displays
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-disp-sum',
      nodeTypeName: 'Sum Display',
      nodeTypeId: 'bitDisplay',
      concurrencyLevel: 4,
      startTime: 1.05,
      duration: 0.1,
      inputValues: new Map([
        ['In', inputWith([conn(false, 'Full Adder', 'Sum')])],
      ]),
      outputValues: new Map(),
    }),
  );
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'ng-disp-cout',
      nodeTypeName: 'Cout Display',
      nodeTypeId: 'bitDisplay',
      concurrencyLevel: 4,
      startTime: 1.05,
      duration: 0.12,
      inputValues: new Map([
        ['In', inputWith([conn(true, 'Full Adder', 'Cout')])],
      ]),
      outputValues: new Map(),
    }),
  );

  // Build inner group records
  const ha1InnerRecord = makeRecord(
    [steps[3], steps[4]], // HA1 XOR + AND
    { id: 'ha1-inner-run' },
  );
  const ha2InnerRecord = makeRecord(
    [steps[5], steps[6]], // HA2 XOR + AND
    { id: 'ha2-inner-run' },
  );
  const faInnerRecord = makeRecord(
    [steps[3], steps[4], steps[5], steps[6], steps[7]], // All FA inner steps
    { id: 'fa-inner-run' },
  );

  const groupRecords = new Map<
    string,
    import('@/utils/nodeRunner/types').GroupRecord
  >([
    [
      'ng-fa-group',
      {
        groupNodeId: 'ng-fa-group',
        groupNodeTypeId: 'fullAdderGroup',
        innerRecord: faInnerRecord,
        inputMapping: new Map([
          ['A', true],
          ['B', false],
          ['Cin', true],
        ]),
        outputMapping: new Map([
          ['Sum', false],
          ['Cout', true],
        ]),
      },
    ],
    [
      'ng-ha1-group',
      {
        groupNodeId: 'ng-ha1-group',
        groupNodeTypeId: 'halfAdderGroup',
        innerRecord: ha1InnerRecord,
        inputMapping: new Map([
          ['A', true],
          ['B', false],
        ]),
        outputMapping: new Map([
          ['Sum', true],
          ['Carry', false],
        ]),
      },
    ],
    [
      'ng-ha2-group',
      {
        groupNodeId: 'ng-ha2-group',
        groupNodeTypeId: 'halfAdderGroup',
        innerRecord: ha2InnerRecord,
        inputMapping: new Map([
          ['A', true],
          ['B', true],
        ]),
        outputMapping: new Map([
          ['Sum', false],
          ['Carry', true],
        ]),
      },
    ],
  ]);

  return { steps, groupRecords };
}

const nestedGroupData = buildNestedGroupExecution();
const nestedGroupRecord = makeRecord(nestedGroupData.steps, {
  groupRecords: nestedGroupData.groupRecords,
});

// ═══════════════════════════════════════════════════════
// Scenario: Loop with Error (counter exceeds max, errors on iteration 3)
// ═══════════════════════════════════════════════════════

function buildLoopWithError(): {
  steps: ExecutionStepRecord[];
  errors: GraphError[];
  loopRecords: Map<string, import('@/utils/nodeRunner/types').LoopRecord>;
} {
  const steps: ExecutionStepRecord[] = [];
  const errors: GraphError[] = [];
  let idx = 0;

  // Level 0: init
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'le-init',
      nodeTypeName: 'Number Constant',
      nodeTypeId: 'bitConstant',
      concurrencyLevel: 0,
      startTime: 0,
      duration: 0.3,
      inputValues: new Map([['Value', inputDefault(0, 'number')]]),
      outputValues: new Map([['Out', output(0, 'number')]]),
    }),
  );

  // 3 successful iterations
  const iterationRecords: import('@/utils/nodeRunner/types').LoopIterationRecord[] =
    [];
  for (let iter = 0; iter < 3; iter++) {
    const iterStart = 0.3 + iter * 1.0;
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `le-counter-${iter}`,
        nodeTypeName: 'Counter',
        nodeTypeId: 'counter',
        concurrencyLevel: 1,
        startTime: iterStart,
        duration: 0.6,
        loopIteration: iter,
        loopStructureId: 'le-loop',
        inputValues: new Map([
          [
            'Count',
            inputWith(
              [
                conn(
                  iter,
                  iter === 0 ? 'Number Constant' : 'Counter',
                  iter === 0 ? 'Out' : 'Count + 1',
                  { sourceDataTypeId: 'number' },
                ),
              ],
              'number',
            ),
          ],
          ['Max', inputDefault(5, 'number')],
        ]),
        outputValues: new Map([
          ['Count + 1', output(iter + 1, 'number')],
          ['Reached Max', output(false, 'bit')],
        ]),
      }),
    );

    iterationRecords.push({
      iteration: iter,
      startTime: iterStart,
      endTime: iterStart + 0.6,
      duration: 0.6,
      conditionValue: true,
      stepRecords: [steps[steps.length - 1]],
      nestedLoopRecords: new Map(),
    });
  }

  // Iteration 3: error in a "divide" node inside the loop
  const errorIterStart = 3.3;
  const loopError: GraphError = {
    message: 'Overflow: counter value 3 caused integer overflow in accumulator',
    nodeId: 'le-accumulator-3',
    nodeTypeId: 'accumulator',
    nodeTypeName: 'Accumulator',
    path: [
      {
        nodeId: 'le-init',
        nodeTypeId: 'bitConstant',
        nodeTypeName: 'Number Constant',
        concurrencyLevel: 0,
      },
      {
        nodeId: 'le-counter-2',
        nodeTypeId: 'counter',
        nodeTypeName: 'Counter',
        concurrencyLevel: 1,
      },
      {
        nodeId: 'le-accumulator-3',
        nodeTypeId: 'accumulator',
        nodeTypeName: 'Accumulator',
        concurrencyLevel: 1,
      },
    ],
    loopContext: {
      loopStructureId: 'le-loop',
      iteration: 3,
      maxIterations: 10,
    },
    timestamp: errorIterStart + 0.4,
    duration: 0.4,
    originalError: new Error('Integer overflow'),
  };
  errors.push(loopError);

  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'le-accumulator-3',
      nodeTypeName: 'Accumulator',
      nodeTypeId: 'accumulator',
      concurrencyLevel: 1,
      startTime: errorIterStart,
      duration: 0.4,
      status: 'errored',
      loopIteration: 3,
      loopStructureId: 'le-loop',
      inputValues: new Map([
        [
          'Value',
          inputWith(
            [conn(3, 'Counter', 'Count + 1', { sourceDataTypeId: 'number' })],
            'number',
          ),
        ],
      ]),
      outputValues: new Map(),
      error: loopError,
    }),
  );

  iterationRecords.push({
    iteration: 3,
    startTime: errorIterStart,
    endTime: errorIterStart + 0.4,
    duration: 0.4,
    conditionValue: true,
    stepRecords: [steps[steps.length - 1]],
    nestedLoopRecords: new Map(),
  });

  // Downstream skipped
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'le-output',
      nodeTypeName: 'Output Display',
      nodeTypeId: 'bitDisplay',
      concurrencyLevel: 2,
      startTime: 3.7,
      duration: 0,
      status: 'skipped',
    }),
  );

  const loopRecords = new Map<
    string,
    import('@/utils/nodeRunner/types').LoopRecord
  >([
    [
      'le-loop',
      {
        loopStructureId: 'le-loop',
        loopStartNodeId: 'le-loop-start',
        loopStopNodeId: 'le-loop-stop',
        loopEndNodeId: 'le-loop-end',
        iterations: iterationRecords,
        totalIterations: 4,
        startTime: 0.3,
        endTime: 3.7,
        duration: 3.4,
      },
    ],
  ]);

  return { steps, errors, loopRecords };
}

const loopErrorData = buildLoopWithError();
const loopErrorRecord = makeRecord(loopErrorData.steps, {
  status: 'errored',
  errors: loopErrorData.errors,
  loopRecords: loopErrorData.loopRecords,
});

// ═══════════════════════════════════════════════════════
// Scenario: Loop Inside Group
//
// Outer:
//   BitConst(0) ──> [Accumulator Group] ──> Display
//   BitConst(3) ──> [Accumulator Group]
//
// Inside "Accumulator Group":
//   GroupInput(init, target) ──> LoopStart ──> Incrementer ──> LoopStop ──> LoopEnd ──> GroupOutput
//
// The group encapsulates a loop that increments from init to target.
// ═══════════════════════════════════════════════════════

function buildLoopInsideGroupExecution(): {
  steps: ExecutionStepRecord[];
  loopRecords: Map<string, import('@/utils/nodeRunner/types').LoopRecord>;
  groupRecords: Map<string, import('@/utils/nodeRunner/types').GroupRecord>;
} {
  const steps: ExecutionStepRecord[] = [];
  let idx = 0;

  // Level 0: outer constants
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'lig-init',
      nodeTypeName: 'Number Constant (0)',
      nodeTypeId: 'bitConstant',
      concurrencyLevel: 0,
      startTime: 0,
      duration: 0.2,
      inputValues: new Map([['Value', inputDefault(0, 'number')]]),
      outputValues: new Map([['Out', output(0, 'number')]]),
    }),
  );
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'lig-target',
      nodeTypeName: 'Number Constant (3)',
      nodeTypeId: 'bitConstant',
      concurrencyLevel: 0,
      startTime: 0,
      duration: 0.15,
      inputValues: new Map([['Value', inputDefault(3, 'number')]]),
      outputValues: new Map([['Out', output(3, 'number')]]),
    }),
  );

  // Group inner: 3 loop iterations inside the group
  const iterationRecords: import('@/utils/nodeRunner/types').LoopIterationRecord[] =
    [];

  for (let iter = 0; iter < 3; iter++) {
    const iterStart = 0.2 + iter * 0.8;
    steps.push(
      makeStep({
        stepIndex: idx++,
        nodeId: `lig-inc-${iter}`,
        nodeTypeName: 'Incrementer',
        nodeTypeId: 'counter',
        concurrencyLevel: 1,
        startTime: iterStart,
        duration: 0.5,
        groupNodeId: 'lig-acc-group',
        groupDepth: 1,
        loopIteration: iter,
        loopStructureId: 'lig-inner-loop',
        inputValues: new Map([
          [
            'Count',
            inputWith(
              [
                conn(
                  iter,
                  iter === 0 ? 'Group Input' : 'Incrementer',
                  iter === 0 ? 'Init' : 'Count + 1',
                  { sourceDataTypeId: 'number' },
                ),
              ],
              'number',
            ),
          ],
          [
            'Max',
            inputWith(
              [
                conn(3, 'Group Input', 'Target', {
                  sourceDataTypeId: 'number',
                }),
              ],
              'number',
            ),
          ],
        ]),
        outputValues: new Map([
          ['Count + 1', output(iter + 1, 'number')],
          ['Reached Max', output(iter + 1 >= 3, 'bit')],
        ]),
      }),
    );

    iterationRecords.push({
      iteration: iter,
      startTime: iterStart,
      endTime: iterStart + 0.5,
      duration: 0.5,
      conditionValue: iter + 1 < 3, // continue while not reached max
      stepRecords: [steps[steps.length - 1]],
      nestedLoopRecords: new Map(),
    });
  }

  // Outer display
  steps.push(
    makeStep({
      stepIndex: idx++,
      nodeId: 'lig-display',
      nodeTypeName: 'Result Display',
      nodeTypeId: 'bitDisplay',
      concurrencyLevel: 2,
      startTime: 2.6,
      duration: 0.1,
      inputValues: new Map([
        [
          'In',
          inputWith(
            [
              conn(3, 'Accumulator Group', 'Result', {
                sourceDataTypeId: 'number',
              }),
            ],
            'number',
          ),
        ],
      ]),
      outputValues: new Map(),
    }),
  );

  const loopRecords = new Map<
    string,
    import('@/utils/nodeRunner/types').LoopRecord
  >([
    [
      'lig-inner-loop',
      {
        loopStructureId: 'lig-inner-loop',
        loopStartNodeId: 'lig-loop-start',
        loopStopNodeId: 'lig-loop-stop',
        loopEndNodeId: 'lig-loop-end',
        iterations: iterationRecords,
        totalIterations: 3,
        startTime: 0.2,
        endTime: 2.6,
        duration: 2.4,
      },
    ],
  ]);

  const groupInnerRecord = makeRecord(
    steps.slice(2, 5), // The 3 incrementer steps
    { id: 'lig-inner-run', loopRecords },
  );

  const groupRecords = new Map<
    string,
    import('@/utils/nodeRunner/types').GroupRecord
  >([
    [
      'lig-acc-group',
      {
        groupNodeId: 'lig-acc-group',
        groupNodeTypeId: 'accumulatorGroup',
        innerRecord: groupInnerRecord,
        inputMapping: new Map([
          ['Init', 0],
          ['Target', 3],
        ]),
        outputMapping: new Map([['Result', 3]]),
      },
    ],
  ]);

  return { steps, loopRecords, groupRecords };
}

const loopInsideGroupData = buildLoopInsideGroupExecution();
const loopInsideGroupRecord = makeRecord(loopInsideGroupData.steps, {
  loopRecords: loopInsideGroupData.loopRecords,
  groupRecords: loopInsideGroupData.groupRecords,
});

// ═══════════════════════════════════════════════════════
// New Static Stories
// ═══════════════════════════════════════════════════════

/** Full Adder: A=1, B=1, Cin=1 → Sum=1, Cout=1. 10 nodes, 5 levels. */
export const FullAdderExecution: Story = {
  args: {
    runnerState: 'completed',
    record: fullAdderRecord,
    currentStepIndex: 9,
  },
};

/** 4-bit Ripple Carry Adder: 5+3=8. ~34 steps, 10 levels, carry chain. */
export const RippleCarryAdderExecution: Story = {
  args: {
    runnerState: 'completed',
    record: rippleCarryAdderRecord,
    currentStepIndex: rippleCarryAdderSteps.length - 1,
  },
};

/** Nested groups: Full Adder containing two Half Adder sub-groups. */
export const NestedGroupExecution: Story = {
  args: {
    runnerState: 'completed',
    record: nestedGroupRecord,
    currentStepIndex: 7,
  },
};

/** Loop that errors on iteration 3 with overflow. */
export const LoopWithErrorExecution: Story = {
  args: {
    runnerState: 'errored',
    record: loopErrorRecord,
    currentStepIndex: 4,
  },
};

/** Loop inside a group: accumulator group with 3 inner iterations. */
export const LoopInsideGroupExecution: Story = {
  args: {
    runnerState: 'completed',
    record: loopInsideGroupRecord,
    currentStepIndex: 4,
  },
};

// ═══════════════════════════════════════════════════════
// All States Comparison
// ═══════════════════════════════════════════════════════

/** Shows every runner state side by side for visual comparison. */
export const AllStatesComparison: Story = {
  args: { runnerState: 'idle' },
  decorators: [
    (Story) => (
      <div className='flex flex-col gap-0 min-h-[600px] bg-[#1a1a1a]'>
        <Story />
      </div>
    ),
  ],
  render: () => {
    const configs: Array<{
      state: RunnerState;
      record: ExecutionRecord | null;
      stepIdx: number;
      mode: RunMode;
    }> = [
      { state: 'idle', record: null, stepIdx: 0, mode: 'instant' },
      { state: 'compiling', record: null, stepIdx: 0, mode: 'instant' },
      {
        state: 'running',
        record: makeRecord(halfAdderSteps.slice(0, 2)),
        stepIdx: 1,
        mode: 'instant',
      },
      {
        state: 'paused',
        record: makeRecord(halfAdderSteps.slice(0, 3)),
        stepIdx: 2,
        mode: 'stepByStep',
      },
      {
        state: 'completed',
        record: halfAdderRecord,
        stepIdx: 5,
        mode: 'instant',
      },
      {
        state: 'errored',
        record: errorRecord,
        stepIdx: 2,
        mode: 'instant',
      },
    ];

    return (
      <div className='flex flex-col gap-6 p-4'>
        {configs.map(({ state, record, stepIdx, mode }) => (
          <div key={state} className='flex flex-col gap-1'>
            <span className='text-primary-white text-[14px] font-main uppercase tracking-wider'>
              {state}
            </span>
            <NodeRunnerPanel
              runnerState={state}
              record={record}
              currentStepIndex={stepIdx}
              onRun={fn()}
              onPause={fn()}
              onStep={fn()}
              onStop={fn()}
              onReset={fn()}
              mode={mode}
              onModeChange={fn()}
              maxLoopIterations={100}
              onMaxLoopIterationsChange={fn()}
              onScrubTo={fn()}
            />
          </div>
        ))}
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Interactive: Full Lifecycle Simulation
// ═══════════════════════════════════════════════════════

/**
 * Fully interactive lifecycle simulation.
 *
 * - Click **Run** to compile and execute the half-adder circuit
 * - Switch between **Instant** and **Step** modes
 * - In Step mode: use **Step** to advance one node at a time
 * - **Pause** a running execution
 * - **Stop** to abort
 * - **Reset** after completion or error
 * - Click timeline blocks to inspect step details
 * - Drag the ruler to scrub the timeline
 * - Scroll to zoom in/out on the timeline
 */
export const InteractiveLifecycle: Story = {
  args: { runnerState: 'idle' },
  decorators: [
    (Story) => (
      <div className='flex flex-col min-h-[700px] bg-[#1a1a1a]'>
        <Story />
      </div>
    ),
  ],
  render: () => {
    const [runnerState, setRunnerState] = useState<RunnerState>('idle');
    const [mode, setMode] = useState<RunMode>('instant');
    const [maxIterations, setMaxIterations] = useState(100);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [visibleSteps, setVisibleSteps] = useState(0);
    const [log, setLog] = useState<string[]>([]);
    const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const addLog = useCallback((msg: string) => {
      setLog((prev) => [
        ...prev.slice(-14),
        `${new Date().toLocaleTimeString()}: ${msg}`,
      ]);
    }, []);

    const record =
      visibleSteps > 0
        ? makeRecord(halfAdderSteps.slice(0, visibleSteps))
        : null;

    const clearTimer = useCallback(() => {
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    }, []);

    const advanceOneStep = useCallback(() => {
      setVisibleSteps((prev) => {
        const next = prev + 1;
        setCurrentStepIndex(next - 1);
        if (next >= halfAdderSteps.length) {
          setRunnerState('completed');
          addLog(`Step ${next}/${halfAdderSteps.length} -- Completed`);
        } else {
          addLog(
            `Step ${next}/${halfAdderSteps.length}: ${halfAdderSteps[next - 1].nodeTypeName}`,
          );
        }
        return next;
      });
    }, [addLog]);

    const runInstant = useCallback(() => {
      let step = 0;
      const tick = () => {
        step++;
        setVisibleSteps(step);
        setCurrentStepIndex(step - 1);
        if (step < halfAdderSteps.length) {
          addLog(
            `Running step ${step}/${halfAdderSteps.length}: ${halfAdderSteps[step - 1].nodeTypeName}`,
          );
          stepTimerRef.current = setTimeout(tick, 400);
        } else {
          setRunnerState('completed');
          addLog(`Completed all ${halfAdderSteps.length} steps`);
        }
      };
      tick();
    }, [addLog]);

    const handleRun = useCallback(() => {
      if (runnerState === 'paused') {
        addLog('Resumed from pause');
        setRunnerState('running');
        if (mode === 'instant') {
          runInstant();
        }
        return;
      }
      addLog('Run clicked -- Compiling...');
      setRunnerState('compiling');
      setVisibleSteps(0);
      setCurrentStepIndex(0);
      setTimeout(() => {
        addLog('Compilation done -- Executing...');
        setRunnerState('running');
        if (mode === 'instant') {
          runInstant();
        } else {
          // Step-by-step: immediately pause, waiting for step clicks
          advanceOneStep();
          setRunnerState('paused');
          addLog('Paused for step-by-step');
        }
      }, 600);
    }, [runnerState, mode, addLog, runInstant, advanceOneStep]);

    const handlePause = useCallback(() => {
      addLog('Paused');
      clearTimer();
      setRunnerState('paused');
    }, [addLog, clearTimer]);

    const handleStep = useCallback(() => {
      if (runnerState === 'idle' || runnerState === 'errored') {
        setMode('stepByStep');
        addLog('Starting step-by-step...');
        setRunnerState('compiling');
        setVisibleSteps(0);
        setCurrentStepIndex(0);
        setTimeout(() => {
          advanceOneStep();
          setRunnerState('paused');
          addLog('Paused after first step');
        }, 400);
      } else if (runnerState === 'paused') {
        advanceOneStep();
        if (visibleSteps + 1 < halfAdderSteps.length) {
          setRunnerState('paused');
        }
      }
    }, [runnerState, addLog, advanceOneStep, visibleSteps]);

    const handleStop = useCallback(() => {
      addLog('Stopped');
      clearTimer();
      setRunnerState('errored');
    }, [addLog, clearTimer]);

    const handleReset = useCallback(() => {
      addLog('Reset to idle');
      clearTimer();
      setRunnerState('idle');
      setVisibleSteps(0);
      setCurrentStepIndex(0);
    }, [addLog, clearTimer]);

    return (
      <div className='flex flex-col flex-1'>
        {/* Status header */}
        <div className='flex items-center gap-4 px-4 py-3 border-b border-secondary-dark-gray'>
          <span className='text-primary-white text-[16px] font-main font-semibold'>
            Interactive Lifecycle Demo
          </span>
          <span className='text-secondary-light-gray text-[13px] font-main'>
            State:{' '}
            <span className='text-primary-blue font-semibold'>
              {runnerState}
            </span>
          </span>
          <span className='text-secondary-light-gray text-[13px] font-main'>
            Mode:{' '}
            <span className='text-primary-blue font-semibold'>{mode}</span>
          </span>
          <span className='text-secondary-light-gray text-[13px] font-main'>
            Steps:{' '}
            <span className='text-primary-blue font-semibold'>
              {visibleSteps}/{halfAdderSteps.length}
            </span>
          </span>
        </div>

        {/* Action log */}
        <div className='flex-1 overflow-y-auto p-4'>
          <div className='bg-secondary-black rounded-md p-3 border border-secondary-dark-gray max-w-[700px]'>
            <div className='text-[12px] text-secondary-light-gray font-main mb-2 uppercase tracking-wider'>
              Action Log
            </div>
            {log.length === 0 ? (
              <div className='text-[12px] text-secondary-dark-gray font-main italic'>
                Click Run or Step to begin...
              </div>
            ) : (
              log.map((entry, i) => (
                <div
                  key={i}
                  className='text-[12px] text-primary-white py-0.5 font-mono'
                >
                  {entry}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel */}
        <NodeRunnerPanel
          runnerState={runnerState}
          record={record}
          currentStepIndex={currentStepIndex}
          onRun={handleRun}
          onPause={handlePause}
          onStep={handleStep}
          onStop={handleStop}
          onReset={handleReset}
          mode={mode}
          onModeChange={setMode}
          maxLoopIterations={maxIterations}
          onMaxLoopIterationsChange={setMaxIterations}
          onScrubTo={setCurrentStepIndex}
        />
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Interactive: Timeline Scrubbing & Step Inspection
// ═══════════════════════════════════════════════════════

/**
 * Interactive replay demo using the large pipeline record.
 *
 * - Click any **timeline block** to open the step inspector
 * - Drag the **ruler** to move the scrubber
 * - Use **zoom controls** or scroll wheel to zoom
 * - Click the **close button** on the inspector to dismiss
 */
export const InteractiveReplay: Story = {
  args: { runnerState: 'completed' },
  decorators: [
    (Story) => (
      <div className='flex flex-col min-h-[600px] bg-[#1a1a1a]'>
        <Story />
      </div>
    ),
  ],
  render: () => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const currentStep = largePipelineSteps[currentStepIndex];

    return (
      <div className='flex flex-col flex-1'>
        {/* Info bar */}
        <div className='flex items-center gap-6 px-4 py-3 border-b border-secondary-dark-gray'>
          <span className='text-primary-white text-[16px] font-main font-semibold'>
            Replay: Large Pipeline (16 nodes)
          </span>
          <span className='text-secondary-light-gray text-[13px] font-main'>
            Scrubber at step{' '}
            <span className='text-primary-blue font-semibold'>
              {currentStepIndex}
            </span>
          </span>
          {currentStep && (
            <span className='text-secondary-light-gray text-[13px] font-main'>
              Node:{' '}
              <span className='text-primary-white'>
                {currentStep.nodeTypeName}
              </span>{' '}
              @ level {currentStep.concurrencyLevel}
            </span>
          )}
          <span className='text-secondary-dark-gray text-[11px] font-main ml-auto'>
            Scroll to zoom | Drag to pan | Click ruler to scrub | Click block to
            inspect
          </span>
        </div>

        <div className='flex-1' />

        {/* Panel */}
        <NodeRunnerPanel
          runnerState='completed'
          record={largePipelineRecord}
          currentStepIndex={currentStepIndex}
          onRun={fn()}
          onPause={fn()}
          onStep={fn()}
          onStop={fn()}
          onReset={fn()}
          mode='instant'
          onModeChange={fn()}
          maxLoopIterations={100}
          onMaxLoopIterationsChange={fn()}
          onScrubTo={setCurrentStepIndex}
        />
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Interactive: Error Inspection
// ═══════════════════════════════════════════════════════

/**
 * Demonstrates error handling in the panel.
 *
 * - The **Divide** node at step 2 has a "Division by zero" error
 * - The **Output Display** at step 3 is skipped due to upstream error
 * - Click the errored block (red) to see full error details in the inspector
 * - Click the skipped block (gray) to see skipped status
 */
export const InteractiveErrorInspection: Story = {
  args: { runnerState: 'errored' },
  decorators: [
    (Story) => (
      <div className='flex flex-col min-h-[600px] bg-[#1a1a1a]'>
        <Story />
      </div>
    ),
  ],
  render: () => {
    const [currentStepIndex, setCurrentStepIndex] = useState(2);

    return (
      <div className='flex flex-col flex-1'>
        <div className='flex items-center gap-4 px-4 py-3 border-b border-secondary-dark-gray'>
          <span className='text-primary-white text-[16px] font-main font-semibold'>
            Error Inspection Demo
          </span>
          <span className='text-[#FF4444] text-[13px] font-main'>
            1 error | 1 skipped
          </span>
          <span className='text-secondary-dark-gray text-[11px] font-main ml-auto'>
            Click the red block to inspect the error details
          </span>
        </div>

        <div className='flex-1' />

        <NodeRunnerPanel
          runnerState='errored'
          record={errorRecord}
          currentStepIndex={currentStepIndex}
          onRun={fn()}
          onPause={fn()}
          onStep={fn()}
          onStop={fn()}
          onReset={fn()}
          mode='instant'
          onModeChange={fn()}
          maxLoopIterations={100}
          onMaxLoopIterationsChange={fn()}
          onScrubTo={setCurrentStepIndex}
        />
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Interactive: Loop Replay
// ═══════════════════════════════════════════════════════

/**
 * Replay a loop execution (counter from 0 to 5).
 *
 * - Scrub through loop iterations using the timeline ruler
 * - Click counter nodes to see per-iteration input/output values
 * - Each iteration shows incrementing Count and the Reached Max flag
 */
export const InteractiveLoopReplay: Story = {
  args: { runnerState: 'completed' },
  decorators: [
    (Story) => (
      <div className='flex flex-col min-h-[600px] bg-[#1a1a1a]'>
        <Story />
      </div>
    ),
  ],
  render: () => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const currentStep = loopSteps[currentStepIndex];

    return (
      <div className='flex flex-col flex-1'>
        <div className='flex items-center gap-4 px-4 py-3 border-b border-secondary-dark-gray'>
          <span className='text-primary-white text-[16px] font-main font-semibold'>
            Loop Replay: Counter 0..5
          </span>
          <span className='text-secondary-light-gray text-[13px] font-main'>
            Step{' '}
            <span className='text-primary-blue font-semibold'>
              {currentStepIndex}
            </span>{' '}
            / {loopSteps.length - 1}
          </span>
          {currentStep?.loopIteration !== undefined && (
            <span className='text-secondary-light-gray text-[13px] font-main'>
              Loop iteration:{' '}
              <span className='text-primary-blue font-semibold'>
                {currentStep.loopIteration}
              </span>
            </span>
          )}
        </div>

        <div className='flex-1' />

        <NodeRunnerPanel
          runnerState='completed'
          record={loopRecord}
          currentStepIndex={currentStepIndex}
          onRun={fn()}
          onPause={fn()}
          onStep={fn()}
          onStop={fn()}
          onReset={fn()}
          mode='instant'
          onModeChange={fn()}
          maxLoopIterations={100}
          onMaxLoopIterationsChange={fn()}
          onScrubTo={setCurrentStepIndex}
        />
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Interactive: Group Replay
// ═══════════════════════════════════════════════════════

/**
 * Replay a group execution (half-adder wrapped in a node group).
 *
 * - Click inner nodes (AND Gate inner, XOR Gate inner) to see group context
 * - Inspector shows groupNodeId and groupDepth
 */
export const InteractiveGroupReplay: Story = {
  args: { runnerState: 'completed' },
  decorators: [
    (Story) => (
      <div className='flex flex-col min-h-[600px] bg-[#1a1a1a]'>
        <Story />
      </div>
    ),
  ],
  render: () => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    return (
      <div className='flex flex-col flex-1'>
        <div className='flex items-center gap-4 px-4 py-3 border-b border-secondary-dark-gray'>
          <span className='text-primary-white text-[16px] font-main font-semibold'>
            Group Replay: Half-Adder Group
          </span>
          <span className='text-secondary-dark-gray text-[11px] font-main ml-auto'>
            Click inner group nodes to see group context in inspector
          </span>
        </div>

        <div className='flex-1' />

        <NodeRunnerPanel
          runnerState='completed'
          record={groupRecord}
          currentStepIndex={currentStepIndex}
          onRun={fn()}
          onPause={fn()}
          onStep={fn()}
          onStop={fn()}
          onReset={fn()}
          mode='instant'
          onModeChange={fn()}
          maxLoopIterations={100}
          onMaxLoopIterationsChange={fn()}
          onScrubTo={setCurrentStepIndex}
        />
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Interactive: Debug Mode + Hide Complex Values
// ═══════════════════════════════════════════════════════

/**
 * Toggle debug mode and hide-complex-values options interactively.
 *
 * - **Debug mode**: Shows node IDs and handle IDs in the inspector
 * - **Hide complex**: Replaces objects/arrays with type summaries
 * - Uses the large pipeline record for rich data variety
 */
export const InteractiveDisplayOptions: Story = {
  args: { runnerState: 'completed' },
  decorators: [
    (Story) => (
      <div className='flex flex-col min-h-[650px] bg-[#1a1a1a]'>
        <Story />
      </div>
    ),
  ],
  render: () => {
    const [currentStepIndex, setCurrentStepIndex] = useState(4);
    const [debugMode, setDebugMode] = useState(false);
    const [hideComplex, setHideComplex] = useState(false);

    return (
      <div className='flex flex-col flex-1'>
        <div className='flex items-center gap-4 px-4 py-3 border-b border-secondary-dark-gray'>
          <span className='text-primary-white text-[16px] font-main font-semibold'>
            Display Options
          </span>
          <button
            onClick={() => setDebugMode((p) => !p)}
            className={`px-3 py-1 text-[12px] font-main rounded cursor-pointer border transition-colors ${
              debugMode
                ? 'bg-primary-blue/20 text-primary-blue border-primary-blue/40'
                : 'bg-secondary-black text-secondary-light-gray border-secondary-dark-gray hover:bg-primary-dark-gray'
            }`}
          >
            Debug {debugMode ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setHideComplex((p) => !p)}
            className={`px-3 py-1 text-[12px] font-main rounded cursor-pointer border transition-colors ${
              hideComplex
                ? 'bg-primary-blue/20 text-primary-blue border-primary-blue/40'
                : 'bg-secondary-black text-secondary-light-gray border-secondary-dark-gray hover:bg-primary-dark-gray'
            }`}
          >
            Hide Complex {hideComplex ? 'ON' : 'OFF'}
          </button>
          <span className='text-secondary-dark-gray text-[11px] font-main ml-auto'>
            Click blocks to inspect, then toggle options above
          </span>
        </div>

        <div className='flex-1' />

        <NodeRunnerPanel
          runnerState='completed'
          record={largePipelineRecord}
          currentStepIndex={currentStepIndex}
          onRun={fn()}
          onPause={fn()}
          onStep={fn()}
          onStop={fn()}
          onReset={fn()}
          mode='instant'
          onModeChange={fn()}
          maxLoopIterations={100}
          onMaxLoopIterationsChange={fn()}
          onScrubTo={setCurrentStepIndex}
          debugMode={debugMode}
          hideComplexValues={hideComplex}
        />
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Interactive: Mode Switching Simulation
// ═══════════════════════════════════════════════════════

/**
 * Demonstrates switching between Instant and Step-by-Step mode.
 *
 * 1. Start in **Instant** mode: click Run to execute all steps automatically
 * 2. **Reset**, then switch to **Step** mode
 * 3. Click **Run** or **Step** to advance one step at a time
 * 4. Observe how the timeline builds incrementally in step mode
 */
export const InteractiveModeSwitching: Story = {
  args: { runnerState: 'idle' },
  decorators: [
    (Story) => (
      <div className='flex flex-col min-h-[650px] bg-[#1a1a1a]'>
        <Story />
      </div>
    ),
  ],
  render: () => {
    const [runnerState, setRunnerState] = useState<RunnerState>('idle');
    const [mode, setMode] = useState<RunMode>('instant');
    const [maxIterations, setMaxIterations] = useState(100);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [visibleSteps, setVisibleSteps] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const record =
      visibleSteps > 0
        ? makeRecord(largePipelineSteps.slice(0, visibleSteps))
        : null;

    const clearTimer = useCallback(() => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }, []);

    const advanceOne = useCallback(() => {
      setVisibleSteps((prev) => {
        const next = prev + 1;
        setCurrentStepIndex(next - 1);
        if (next >= largePipelineSteps.length) {
          setRunnerState('completed');
        }
        return next;
      });
    }, []);

    const handleRun = useCallback(() => {
      if (runnerState === 'paused') {
        setRunnerState('running');
        if (mode === 'instant') {
          const autoRun = () => {
            setVisibleSteps((prev) => {
              const next = prev + 1;
              setCurrentStepIndex(next - 1);
              if (next >= largePipelineSteps.length) {
                setRunnerState('completed');
                return next;
              }
              timerRef.current = setTimeout(autoRun, 200);
              return next;
            });
          };
          autoRun();
        }
        return;
      }

      setRunnerState('compiling');
      setVisibleSteps(0);
      setCurrentStepIndex(0);
      setTimeout(() => {
        setRunnerState('running');
        if (mode === 'instant') {
          const autoRun = () => {
            setVisibleSteps((prev) => {
              const next = prev + 1;
              setCurrentStepIndex(next - 1);
              if (next >= largePipelineSteps.length) {
                setRunnerState('completed');
                return next;
              }
              timerRef.current = setTimeout(autoRun, 200);
              return next;
            });
          };
          autoRun();
        } else {
          advanceOne();
          setRunnerState('paused');
        }
      }, 400);
    }, [runnerState, mode, advanceOne]);

    const handlePause = useCallback(() => {
      clearTimer();
      setRunnerState('paused');
    }, [clearTimer]);

    const handleStep = useCallback(() => {
      if (runnerState === 'idle' || runnerState === 'errored') {
        setMode('stepByStep');
        setRunnerState('compiling');
        setVisibleSteps(0);
        setCurrentStepIndex(0);
        setTimeout(() => {
          advanceOne();
          setRunnerState('paused');
        }, 400);
      } else if (runnerState === 'paused') {
        advanceOne();
        if (visibleSteps + 1 < largePipelineSteps.length) {
          setRunnerState('paused');
        }
      }
    }, [runnerState, advanceOne, visibleSteps]);

    const handleStop = useCallback(() => {
      clearTimer();
      setRunnerState('errored');
    }, [clearTimer]);

    const handleReset = useCallback(() => {
      clearTimer();
      setRunnerState('idle');
      setVisibleSteps(0);
      setCurrentStepIndex(0);
    }, [clearTimer]);

    return (
      <div className='flex flex-col flex-1'>
        <div className='flex items-center gap-4 px-4 py-3 border-b border-secondary-dark-gray'>
          <span className='text-primary-white text-[16px] font-main font-semibold'>
            Mode Switching: Large Pipeline
          </span>
          <span className='text-secondary-light-gray text-[13px] font-main'>
            {runnerState} | {mode} | {visibleSteps}/{largePipelineSteps.length}{' '}
            steps
          </span>
          <span className='text-secondary-dark-gray text-[11px] font-main ml-auto'>
            Switch mode when idle, then click Run
          </span>
        </div>

        <div className='flex-1' />

        <NodeRunnerPanel
          runnerState={runnerState}
          record={record}
          currentStepIndex={currentStepIndex}
          onRun={handleRun}
          onPause={handlePause}
          onStep={handleStep}
          onStop={handleStop}
          onReset={handleReset}
          mode={mode}
          onModeChange={setMode}
          maxLoopIterations={maxIterations}
          onMaxLoopIterationsChange={setMaxIterations}
          onScrubTo={setCurrentStepIndex}
        />
      </div>
    );
  },
};

// ═══════════════════════════════════════════════════════
// Interactive: Scenario Switcher
// ═══════════════════════════════════════════════════════

/**
 * Switch between different execution scenarios to see
 * how the panel handles each one.
 *
 * Scenarios:
 * - **Half-Adder**: Simple 6-step circuit with fan-out
 * - **Large Pipeline**: 16 nodes across 4 concurrency levels
 * - **With Errors**: Error + skipped downstream
 * - **Loop**: Counter loop with 5 iterations
 * - **Group**: Half-adder wrapped in a node group
 */
export const InteractiveScenarioSwitcher: Story = {
  args: { runnerState: 'completed' },
  decorators: [
    (Story) => (
      <div className='flex flex-col min-h-[700px] bg-[#1a1a1a]'>
        <Story />
      </div>
    ),
  ],
  render: () => {
    const scenarios = [
      {
        label: 'Half-Adder',
        record: halfAdderRecord,
        state: 'completed',
      },
      {
        label: 'Large Pipeline',
        record: largePipelineRecord,
        state: 'completed',
      },
      {
        label: 'With Errors',
        record: errorRecord,
        state: 'errored',
      },
      {
        label: 'Loop (Counter)',
        record: loopRecord,
        state: 'completed',
      },
      {
        label: 'Group (Half-Adder)',
        record: groupRecord,
        state: 'completed',
      },
      {
        label: 'Full Adder',
        record: fullAdderRecord,
        state: 'completed',
      },
      {
        label: '4-bit RCA (5+3=8)',
        record: rippleCarryAdderRecord,
        state: 'completed',
      },
      {
        label: 'Nested Groups',
        record: nestedGroupRecord,
        state: 'completed',
      },
      {
        label: 'Loop Error',
        record: loopErrorRecord,
        state: 'errored',
      },
      {
        label: 'Loop in Group',
        record: loopInsideGroupRecord,
        state: 'completed',
      },
    ] as const;

    const [scenarioIdx, setScenarioIdx] = useState(0);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const scenario = scenarios[scenarioIdx];

    return (
      <div className='flex flex-col flex-1'>
        <div className='flex items-center gap-3 px-4 py-3 border-b border-secondary-dark-gray overflow-x-auto'>
          {scenarios.map((s, i) => (
            <button
              key={s.label}
              onClick={() => {
                setScenarioIdx(i);
                setCurrentStepIndex(0);
              }}
              className={`px-3 py-1.5 text-[13px] font-main rounded cursor-pointer whitespace-nowrap transition-colors ${
                i === scenarioIdx
                  ? 'bg-primary-blue text-primary-white'
                  : 'bg-secondary-black text-secondary-light-gray hover:bg-primary-dark-gray border border-secondary-dark-gray'
              }`}
            >
              {s.label}
            </button>
          ))}
          <span className='text-secondary-light-gray text-[13px] font-main ml-auto'>
            {scenario.record.steps.length} steps
          </span>
        </div>

        <div className='flex-1' />

        <NodeRunnerPanel
          runnerState={scenario.state}
          record={scenario.record}
          currentStepIndex={currentStepIndex}
          onRun={fn()}
          onPause={fn()}
          onStep={fn()}
          onStop={fn()}
          onReset={fn()}
          mode='instant'
          onModeChange={fn()}
          maxLoopIterations={100}
          onMaxLoopIterationsChange={fn()}
          onScrubTo={setCurrentStepIndex}
        />
      </div>
    );
  },
};
