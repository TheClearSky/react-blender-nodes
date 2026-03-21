import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import {
  ExecutionStepInspector,
  type ExecutionStepInspectorProps,
} from './ExecutionStepInspector';
import type {
  ExecutionStepRecord,
  GraphError,
  RecordedInputHandleValue,
  RecordedInputConnection,
  RecordedOutputHandleValue,
} from '@/utils/nodeRunner/types';

// ─────────────────────────────────────────────────────
// Helpers for concise mock data
// ─────────────────────────────────────────────────────

/** Create a single recorded input connection */
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

/** Create a recorded input with connections */
function inputWith(
  connections: RecordedInputConnection[],
  dataTypeId: string = 'bit',
): RecordedInputHandleValue {
  return { connections, dataTypeId, isDefault: false };
}

/** Create a recorded input with a default (user-entered) value */
function inputDefault(
  defaultValue: unknown,
  dataTypeId: string = 'bit',
): RecordedInputHandleValue {
  return { connections: [], dataTypeId, isDefault: true, defaultValue };
}

/** Create a recorded output value */
function output(
  value: unknown,
  dataTypeId: string = 'bit',
  targetCount: number = 1,
): RecordedOutputHandleValue {
  return { value, dataTypeId, targetCount };
}

// ─────────────────────────────────────────────────────
// Mock step records
// ─────────────────────────────────────────────────────

const completedStep: ExecutionStepRecord = {
  stepIndex: 3,
  nodeId: 'node-and-42',
  nodeTypeId: 'andGate',
  nodeTypeName: 'AND Gate',
  concurrencyLevel: 1,
  startTime: 10.2,
  endTime: 10.7,
  duration: 0.5,
  pauseAdjustment: 0,
  status: 'completed',
  inputValues: new Map([
    ['Bit 1', inputWith([conn(true, 'Boolean Constant', 'Bit')])],
    ['Bit 2', inputWith([conn(false, 'NOT Gate', 'Result')])],
  ]),
  outputValues: new Map([['Bit', output(false)]]),
};

const erroredStep: ExecutionStepRecord = {
  stepIndex: 5,
  nodeId: 'node-div-88',
  nodeTypeId: 'divider',
  nodeTypeName: 'Divide',
  concurrencyLevel: 2,
  startTime: 22.0,
  endTime: 22.3,
  duration: 0.3,
  pauseAdjustment: 0,
  status: 'errored',
  inputValues: new Map([
    [
      'Numerator',
      inputWith(
        [conn(42, 'Constant', 'Value', { sourceDataTypeId: 'number' })],
        'number',
      ),
    ],
    [
      'Denominator',
      inputWith(
        [conn(0, 'Constant', 'Value', { sourceDataTypeId: 'number' })],
        'number',
      ),
    ],
  ]),
  outputValues: new Map(),
  error: {
    message: 'Division by zero',
    nodeId: 'node-div-88',
    nodeTypeId: 'divider',
    nodeTypeName: 'Divide',
    path: [
      {
        nodeId: 'node-const-10',
        nodeTypeId: 'constant',
        nodeTypeName: 'Constant',
        concurrencyLevel: 0,
      },
      {
        nodeId: 'node-div-88',
        nodeTypeId: 'divider',
        nodeTypeName: 'Divide',
        handleId: 'input-denom',
        concurrencyLevel: 2,
      },
    ],
    timestamp: 22.3,
    duration: 0.3,
    originalError: new Error('Division by zero'),
  } satisfies GraphError,
};

const skippedStep: ExecutionStepRecord = {
  stepIndex: 7,
  nodeId: 'node-out-99',
  nodeTypeId: 'output',
  nodeTypeName: 'Output Display',
  concurrencyLevel: 3,
  startTime: 25.0,
  endTime: 25.0,
  duration: 0,
  pauseAdjustment: 0,
  status: 'skipped',
  inputValues: new Map(),
  outputValues: new Map(),
};

const loopStep: ExecutionStepRecord = {
  stepIndex: 12,
  nodeId: 'node-acc-55',
  nodeTypeId: 'accumulator',
  nodeTypeName: 'Accumulator',
  concurrencyLevel: 1,
  startTime: 45.0,
  endTime: 45.8,
  duration: 0.8,
  pauseAdjustment: 0,
  status: 'completed',
  inputValues: new Map([
    [
      'Value',
      inputWith(
        [conn(42, 'Loop Start', 'Current', { sourceDataTypeId: 'number' })],
        'number',
      ),
    ],
    ['Increment', inputDefault(1, 'number')],
  ]),
  outputValues: new Map([['Result', output(43, 'number')]]),
  loopIteration: 5,
  loopStructureId: 'loop-main',
};

const groupStep: ExecutionStepRecord = {
  stepIndex: 8,
  nodeId: 'node-inner-33',
  nodeTypeId: 'halfAdder',
  nodeTypeName: 'Half Adder (inner)',
  concurrencyLevel: 1,
  startTime: 30.0,
  endTime: 31.5,
  duration: 1.5,
  pauseAdjustment: 0,
  status: 'completed',
  inputValues: new Map([
    ['A', inputWith([conn(true, 'Group Input', 'A')])],
    ['B', inputWith([conn(true, 'Group Input', 'B')])],
  ]),
  outputValues: new Map([
    ['Sum', output(false)],
    ['Carry', output(true)],
  ]),
  groupNodeId: 'group-ha-1',
  groupDepth: 1,
};

/** Step with fan-in: 3 connections feeding one input */
const fanInStep: ExecutionStepRecord = {
  stepIndex: 9,
  nodeId: 'node-or-66',
  nodeTypeId: 'orGate',
  nodeTypeName: 'OR Gate (3-input)',
  concurrencyLevel: 2,
  startTime: 28.0,
  endTime: 28.4,
  duration: 0.4,
  pauseAdjustment: 0,
  status: 'completed',
  inputValues: new Map([
    [
      'Bits',
      inputWith([
        conn(true, 'Sensor A', 'Active'),
        conn(false, 'Sensor B', 'Active'),
        conn(true, 'Override', 'Force On'),
      ]),
    ],
  ]),
  outputValues: new Map([['Result', output(true, 'bit', 2)]]),
};

/** Step with no connections (all user-entered defaults) */
const defaultInputStep: ExecutionStepRecord = {
  stepIndex: 0,
  nodeId: 'node-const-1',
  nodeTypeId: 'boolConst',
  nodeTypeName: 'Boolean Constant',
  concurrencyLevel: 0,
  startTime: 0,
  endTime: 0.1,
  duration: 0.1,
  pauseAdjustment: 0,
  status: 'completed',
  inputValues: new Map([['Value', inputDefault(true)]]),
  outputValues: new Map([['Bit', output(true, 'bit', 2)]]),
};

/** Step with rich/complex values */
const richInputStep: ExecutionStepRecord = {
  stepIndex: 15,
  nodeId: 'node-merge-77',
  nodeTypeId: 'dataMerge',
  nodeTypeName: 'Data Merge',
  concurrencyLevel: 2,
  startTime: 50.0,
  endTime: 52.3,
  duration: 2.3,
  pauseAdjustment: 0,
  status: 'completed',
  inputValues: new Map([
    [
      'Label',
      inputWith(
        [
          conn('Sensor Alpha', 'Text Input', 'Value', {
            sourceDataTypeId: 'string',
          }),
        ],
        'string',
      ),
    ],
    [
      'Temperature',
      inputWith(
        [conn(23.5, 'Thermometer', 'Reading', { sourceDataTypeId: 'number' })],
        'number',
      ),
    ],
    ['Active', inputWith([conn(true, 'Switch', 'State')])],
    [
      'Tags',
      inputWith(
        [
          conn(['important', 'validated', 'final'], 'Tag Builder', 'Tags', {
            sourceDataTypeId: 'stringArray',
          }),
        ],
        'stringArray',
      ),
    ],
    [
      'Metadata',
      inputWith(
        [
          conn({ version: 2, source: 'api' }, 'Config', 'Data', {
            sourceDataTypeId: 'json',
          }),
        ],
        'json',
      ),
    ],
  ]),
  outputValues: new Map([
    [
      'Merged',
      output({ label: 'Sensor Alpha', temp: 23.5, active: true }, 'json'),
    ],
  ]),
};

/** Step with deeply nested complex values */
const deepComplexStep: ExecutionStepRecord = {
  stepIndex: 20,
  nodeId: 'node-transform-99',
  nodeTypeId: 'transformer',
  nodeTypeName: 'Data Transformer',
  concurrencyLevel: 1,
  startTime: 60.0,
  endTime: 63.5,
  duration: 3.5,
  pauseAdjustment: 0,
  status: 'completed',
  inputValues: new Map([
    [
      'Config',
      inputWith(
        [
          conn(
            {
              transform: 'normalize',
              params: { min: 0, max: 100, clamp: true },
              pipeline: ['validate', 'cast', 'transform', 'emit'],
            },
            'Settings Panel',
            'Config',
            { sourceDataTypeId: 'json' },
          ),
        ],
        'json',
      ),
    ],
    [
      'Data',
      inputWith(
        [
          conn(
            new Map([
              ['sensor-1', { temp: 23.5, humid: 45 }],
              ['sensor-2', { temp: 18.2, humid: 62 }],
            ]),
            'Sensor Hub',
            'Readings',
            { sourceDataTypeId: 'sensorMap' },
          ),
        ],
        'sensorMap',
      ),
    ],
    ['BatchSize', inputDefault(256, 'number')],
  ]),
  outputValues: new Map([
    [
      'Result',
      output(
        [
          { id: 'sensor-1', normalized: 0.47 },
          { id: 'sensor-2', normalized: 0.364 },
        ],
        'json',
      ),
    ],
    ['Count', output(2, 'number')],
  ]),
};

// ─────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────

const meta = {
  component: ExecutionStepInspector,
  argTypes: {
    hideComplexValues: { control: 'boolean' },
    debugMode: { control: 'boolean' },
  },
  args: {
    onClose: fn(),
    hideComplexValues: false,
    debugMode: false,
  },
  decorators: [
    (Story) => (
      <div className='flex justify-center items-center min-h-screen p-8'>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<ExecutionStepInspectorProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    stepRecord: completedStep,
  },
};

export const NoStep: Story = {
  args: {
    stepRecord: null,
  },
};

export const CompletedStep: Story = {
  args: {
    stepRecord: completedStep,
  },
};

export const ErroredStep: Story = {
  args: {
    stepRecord: erroredStep,
  },
};

export const SkippedStep: Story = {
  args: {
    stepRecord: skippedStep,
  },
};

export const InsideLoop: Story = {
  args: {
    stepRecord: loopStep,
  },
};

export const InsideGroup: Story = {
  args: {
    stepRecord: groupStep,
  },
};

/**
 * 3 connections feeding a single input handle (fan-in).
 * Each connection shown on its own line with source node/handle names.
 */
export const MultipleConnections: Story = {
  args: {
    stepRecord: fanInStep,
  },
};

/**
 * Node with no incoming connections — inputs show a "default" badge
 * and the user-entered value.
 */
export const DefaultInputValues: Story = {
  args: {
    stepRecord: defaultInputStep,
  },
};

/**
 * Mixed input types: strings, numbers, booleans, arrays, objects.
 * Each from a different source node.
 */
export const RichInputsAndOutputs: Story = {
  args: {
    stepRecord: richInputStep,
  },
};

/**
 * Deeply nested objects, Maps, and arrays. Toggle `hideComplexValues`
 * to see type summary mode.
 */
export const DeepComplexValues: Story = {
  args: {
    stepRecord: deepComplexStep,
  },
};

/**
 * Same deep complex data with `hideComplexValues` enabled — objects
 * and arrays show only a type summary.
 */
export const HideComplexValuesEnabled: Story = {
  args: {
    stepRecord: deepComplexStep,
    hideComplexValues: true,
  },
};

/**
 * Debug mode ON — shows node IDs and handle IDs alongside display names
 * for all connections and in the header.
 */
export const DebugModeEnabled: Story = {
  args: {
    stepRecord: fanInStep,
    debugMode: true,
  },
};

/**
 * Debug mode with complex data.
 */
export const DebugModeWithComplexData: Story = {
  args: {
    stepRecord: richInputStep,
    debugMode: true,
  },
};

/**
 * Shows all three status states side by side.
 */
export const AllStatuses: Story = {
  args: { stepRecord: completedStep },
  render: () => {
    return (
      <div className='flex flex-wrap gap-6 items-start'>
        <div className='flex flex-col gap-1 items-center'>
          <span className='text-[12px] text-secondary-light-gray font-main uppercase tracking-wider'>
            Completed
          </span>
          <ExecutionStepInspector stepRecord={completedStep} onClose={fn()} />
        </div>
        <div className='flex flex-col gap-1 items-center'>
          <span className='text-[12px] text-secondary-light-gray font-main uppercase tracking-wider'>
            Errored
          </span>
          <ExecutionStepInspector stepRecord={erroredStep} onClose={fn()} />
        </div>
        <div className='flex flex-col gap-1 items-center'>
          <span className='text-[12px] text-secondary-light-gray font-main uppercase tracking-wider'>
            Skipped
          </span>
          <ExecutionStepInspector stepRecord={skippedStep} onClose={fn()} />
        </div>
      </div>
    );
  },
};

/**
 * Interactive demo: click through steps, toggle debug and hide-complex.
 */
export const InteractiveStepSwitcher: Story = {
  args: { stepRecord: completedStep },
  render: () => {
    const steps = [
      completedStep,
      erroredStep,
      skippedStep,
      loopStep,
      groupStep,
      fanInStep,
      defaultInputStep,
      richInputStep,
      deepComplexStep,
    ];
    const labels = [
      'Completed',
      'Errored',
      'Skipped',
      'Loop',
      'Group',
      'Fan-In',
      'Defaults',
      'Rich Data',
      'Complex',
    ];
    const [index, setIndex] = useState(0);
    const [hideComplex, setHideComplex] = useState(false);
    const [debugMode, setDebugMode] = useState(false);

    return (
      <div className='flex gap-6 items-start'>
        <div className='flex flex-col gap-1'>
          <span className='text-[12px] text-secondary-light-gray font-main mb-2'>
            Select a step:
          </span>
          {labels.map((label, i) => (
            <button
              key={label}
              onClick={() => setIndex(i)}
              className={`px-3 py-1.5 text-[13px] font-main rounded text-left cursor-pointer transition-colors ${
                i === index
                  ? 'bg-primary-blue text-primary-white'
                  : 'bg-secondary-black text-secondary-light-gray hover:bg-primary-dark-gray'
              }`}
            >
              {label}
            </button>
          ))}
          <div className='flex flex-col gap-1 mt-3'>
            <button
              onClick={() => setHideComplex((p) => !p)}
              className='px-3 py-1.5 text-[12px] font-main rounded cursor-pointer bg-secondary-black text-secondary-light-gray hover:bg-primary-dark-gray border border-secondary-dark-gray'
            >
              {hideComplex ? 'Show' : 'Hide'} complex
            </button>
            <button
              onClick={() => setDebugMode((p) => !p)}
              className={`px-3 py-1.5 text-[12px] font-main rounded cursor-pointer border ${
                debugMode
                  ? 'bg-primary-blue/20 text-primary-blue border-primary-blue/40'
                  : 'bg-secondary-black text-secondary-light-gray border-secondary-dark-gray hover:bg-primary-dark-gray'
              }`}
            >
              Debug {debugMode ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        <ExecutionStepInspector
          stepRecord={steps[index]}
          onClose={() => setIndex(0)}
          hideComplexValues={hideComplex}
          debugMode={debugMode}
        />
      </div>
    );
  },
};
