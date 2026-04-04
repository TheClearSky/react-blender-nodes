import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import {
  RunControls,
  type RunControlsProps,
  type RunMode,
} from './RunControls';
import type { RunnerState } from '@/utils/nodeRunner/types';
import { runnerStates } from '@/utils/nodeRunner/types';

const meta = {
  title: 'Molecules/RunControls',
  component: RunControls,
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
  },
  args: {
    runnerState: 'idle',
    mode: 'instant',
    maxLoopIterations: 100,
    onRun: fn(),
    onPause: fn(),
    onStep: fn(),
    onStop: fn(),
    onReset: fn(),
    onModeChange: fn(),
    onMaxLoopIterationsChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className='flex justify-center items-center min-h-screen p-8'>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<RunControlsProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground = {} satisfies Story;

export const IdleState: Story = {
  args: {
    runnerState: 'idle',
  },
};

export const RunningState: Story = {
  args: {
    runnerState: 'running',
  },
};

export const PausedState: Story = {
  args: {
    runnerState: 'paused',
    mode: 'stepByStep',
  },
};

export const CompletedState: Story = {
  args: {
    runnerState: 'completed',
  },
};

export const ErroredState: Story = {
  args: {
    runnerState: 'errored',
  },
};

export const StepByStepMode: Story = {
  args: {
    runnerState: 'idle',
    mode: 'stepByStep',
  },
};

export const CompilingState: Story = {
  args: {
    runnerState: 'compiling',
  },
};

/**
 * Shows all runner states side by side to compare button enable/disable patterns.
 */
export const AllStatesComparison: Story = {
  args: { runnerState: 'idle' },
  render: () => {
    const states: RunnerState[] = [
      'idle',
      'compiling',
      'running',
      'paused',
      'completed',
      'errored',
    ];

    return (
      <div className='flex flex-col gap-4'>
        {states.map((state) => (
          <div key={state} className='flex items-center gap-4'>
            <span className='text-primary-white text-[14px] font-main w-24 text-right uppercase tracking-wider'>
              {state}
            </span>
            <RunControls
              runnerState={state}
              mode='instant'
              maxLoopIterations={100}
              onRun={fn()}
              onPause={fn()}
              onStep={fn()}
              onStop={fn()}
              onReset={fn()}
              onModeChange={fn()}
              onMaxLoopIterationsChange={fn()}
            />
          </div>
        ))}
      </div>
    );
  },
};

/**
 * Fully interactive demo simulating the runner lifecycle.
 * Click buttons to transition between states.
 */
export const InteractiveLifecycle: Story = {
  args: { runnerState: 'idle' },
  render: () => {
    const [runnerState, setRunnerState] = useState<RunnerState>('idle');
    const [mode, setMode] = useState<RunMode>('instant');
    const [maxIterations, setMaxIterations] = useState(100);
    const [log, setLog] = useState<string[]>([]);

    function addLog(action: string) {
      setLog((prev) => [
        ...prev.slice(-9),
        `${new Date().toLocaleTimeString()}: ${action}`,
      ]);
    }

    function handleRun() {
      addLog('Run clicked');
      setRunnerState('compiling');
      setTimeout(() => {
        setRunnerState('running');
        addLog('Compiling → Running');
        if (mode === 'instant') {
          setTimeout(() => {
            setRunnerState('completed');
            addLog('Running → Completed');
          }, 2000);
        }
      }, 500);
    }

    function handlePause() {
      addLog('Pause clicked');
      setRunnerState('paused');
    }

    function handleStep() {
      if (runnerState === 'idle' || runnerState === 'errored') {
        addLog('Step clicked (starting step-by-step)');
        setMode('stepByStep');
        setRunnerState('paused');
      } else {
        addLog('Step forward');
      }
    }

    function handleStop() {
      addLog('Stop clicked');
      setRunnerState('errored');
    }

    function handleReset() {
      addLog('Reset clicked');
      setRunnerState('idle');
    }

    return (
      <div className='flex flex-col gap-6 items-center'>
        <div className='text-primary-white text-[18px] font-main'>
          State:{' '}
          <span className='text-primary-blue font-semibold'>{runnerState}</span>
        </div>
        <RunControls
          runnerState={runnerState}
          mode={mode}
          maxLoopIterations={maxIterations}
          onRun={handleRun}
          onPause={handlePause}
          onStep={handleStep}
          onStop={handleStop}
          onReset={handleReset}
          onModeChange={setMode}
          onMaxLoopIterationsChange={setMaxIterations}
        />
        <div className='w-[500px] bg-secondary-black rounded-md p-3 border border-secondary-dark-gray'>
          <div className='text-[12px] text-secondary-light-gray font-main mb-2'>
            Action Log:
          </div>
          {log.length === 0 ? (
            <div className='text-[12px] text-secondary-dark-gray font-main italic'>
              Click buttons to see state transitions...
            </div>
          ) : (
            log.map((entry, i) => (
              <div
                key={i}
                className='text-[12px] text-primary-white font-main py-0.5'
              >
                {entry}
              </div>
            ))
          )}
        </div>
      </div>
    );
  },
};
