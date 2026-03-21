import { useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Square,
  RotateCcw,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/utils';
import type { RunnerState } from '@/utils/nodeRunner/types';

/**
 * Execution mode: instant runs the whole graph then enables replay,
 * stepByStep pauses between each execution step.
 */
type RunMode = 'instant' | 'stepByStep';

/**
 * Props for the RunControls component.
 */
type RunControlsProps = {
  /** Current runner state machine state */
  runnerState: RunnerState;
  /** Start or resume execution */
  onRun: () => void;
  /** Pause a running execution */
  onPause: () => void;
  /** Execute one step forward (starts step-by-step if idle) */
  onStep: () => void;
  /** Stop and cancel execution */
  onStop: () => void;
  /** Reset runner back to idle */
  onReset: () => void;
  /** Current execution mode */
  mode: RunMode;
  /** Change execution mode */
  onModeChange: (mode: RunMode) => void;
  /** Max loop iterations before error */
  maxLoopIterations: number;
  /** Update max loop iterations */
  onMaxLoopIterationsChange: (max: number) => void;
};

// ─────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  RunnerState,
  { color: string; pulse: boolean; label: string }
> = {
  idle: { color: 'bg-secondary-dark-gray', pulse: false, label: 'Idle' },
  compiling: { color: 'bg-primary-blue', pulse: true, label: 'Compiling' },
  running: { color: 'bg-status-completed', pulse: true, label: 'Running' },
  paused: { color: 'bg-status-warning', pulse: false, label: 'Paused' },
  completed: {
    color: 'bg-status-completed',
    pulse: false,
    label: 'Completed',
  },
  errored: { color: 'bg-status-errored', pulse: false, label: 'Error' },
};

// ─────────────────────────────────────────────────────
// ActionButton
// ─────────────────────────────────────────────────────

function ActionButton({
  icon,
  onClick,
  disabled,
  active = false,
  variant = 'default',
  title,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
  variant?: 'default' | 'play';
  title: string;
}) {
  const isPlay = variant === 'play';
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'btn-press flex items-center justify-center transition-all duration-100',
        isPlay
          ? 'h-8 w-8 rounded-md bg-primary-blue text-white shadow-[0_0_12px_rgba(74,120,194,0.4)]'
          : 'h-7 w-7 rounded',
        disabled && 'cursor-not-allowed opacity-30',
        !disabled &&
          !active &&
          !isPlay &&
          'hover:bg-primary-dark-gray hover:text-white',
        !disabled && isPlay && 'hover:brightness-110',
        active &&
          !isPlay &&
          'bg-primary-blue shadow-[0_0_8px_rgba(71,114,179,0.5)]',
        !disabled &&
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-blue',
      )}
    >
      {icon}
    </button>
  );
}

// ─────────────────────────────────────────────────────
// RunControls
// ─────────────────────────────────────────────────────

/**
 * Control bar for running/debugging the graph.
 *
 * Layout:
 * ```
 * ● Status | [▶] [⏸] [⏭] [⏹] [↺] | [Instant/Step] | Max loops: [10000]
 * ```
 */
function RunControls({
  runnerState,
  onRun,
  onPause,
  onStep,
  onStop,
  onReset,
  mode,
  onModeChange,
  maxLoopIterations,
  onMaxLoopIterationsChange,
}: RunControlsProps) {
  const statusConfig = STATUS_CONFIG[runnerState];
  const canEdit =
    runnerState === 'idle' ||
    runnerState === 'completed' ||
    runnerState === 'errored';

  const canRun = runnerState === 'idle' || runnerState === 'errored';
  const canPause = runnerState === 'running';
  const canStep =
    runnerState === 'paused' ||
    runnerState === 'idle' ||
    runnerState === 'errored';
  const canStop = runnerState === 'running' || runnerState === 'paused';
  const canReset = runnerState === 'completed' || runnerState === 'errored';

  const handleMaxIterationsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      if (!isNaN(value) && value > 0) {
        onMaxLoopIterationsChange(value);
      }
    },
    [onMaxLoopIterationsChange],
  );

  return (
    <div className='flex h-9 w-full items-center gap-2 border-b border-secondary-dark-gray bg-runner-toolbar-bg px-3'>
      {/* Status indicator */}
      <div className='flex w-[140px] items-center gap-2.5'>
        <div className='relative flex items-center justify-center'>
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full transition-colors duration-200',
              statusConfig.color,
              statusConfig.pulse && 'animate-pulse',
              statusConfig.pulse && 'shadow-[0_0_8px_currentColor]',
            )}
          />
          {statusConfig.pulse && (
            <div
              className={cn(
                'absolute h-2.5 w-2.5 animate-ping rounded-full opacity-50',
                statusConfig.color,
              )}
            />
          )}
        </div>
        <span className='text-[14px] text-primary-white'>
          {statusConfig.label}
        </span>
      </div>

      <div className='mx-3 h-6 w-px bg-secondary-dark-gray' />

      {/* Action buttons */}
      <div className='flex items-center gap-3'>
        <ActionButton
          icon={<Play className='h-3.5 w-3.5 fill-current' />}
          onClick={onRun}
          disabled={!canRun}
          active={runnerState === 'running'}
          variant='play'
          title='Run'
        />
        <ActionButton
          icon={<Pause className='h-4 w-4 text-primary-white' />}
          onClick={onPause}
          disabled={!canPause}
          title='Pause'
        />
        <ActionButton
          icon={<SkipForward className='h-4 w-4 text-primary-white' />}
          onClick={onStep}
          disabled={!canStep}
          title='Step'
        />
        <ActionButton
          icon={<Square className='h-4 w-4 text-primary-white' />}
          onClick={onStop}
          disabled={!canStop}
          title='Stop'
        />
        <ActionButton
          icon={<RotateCcw className='h-4 w-4 text-primary-white' />}
          onClick={onReset}
          disabled={!canReset}
          title='Reset'
        />
      </div>

      <div className='mx-3 h-6 w-px bg-secondary-dark-gray' />

      {/* Mode toggle — inset pill */}
      <div className='flex rounded-md border border-runner-timeline-box-border bg-runner-inset-bg p-[3px]'>
        <button
          type='button'
          onClick={() => onModeChange('instant')}
          disabled={!canEdit}
          className={cn(
            'btn-press rounded px-3.5 py-1 text-[13px] transition-all duration-100',
            mode === 'instant'
              ? 'bg-primary-blue text-white'
              : 'text-secondary-light-gray',
            canEdit && mode !== 'instant' && 'hover:text-primary-white',
            !canEdit && 'cursor-not-allowed opacity-50',
          )}
        >
          Instant
        </button>
        <button
          type='button'
          onClick={() => onModeChange('stepByStep')}
          disabled={!canEdit}
          className={cn(
            'btn-press rounded px-3.5 py-1 text-[13px] transition-all duration-100',
            mode === 'stepByStep'
              ? 'bg-primary-blue text-white'
              : 'text-secondary-light-gray',
            canEdit && mode !== 'stepByStep' && 'hover:text-primary-white',
            !canEdit && 'cursor-not-allowed opacity-50',
          )}
        >
          Step-by-Step
        </button>
      </div>

      {/* Max iterations — pill */}
      <div className='ml-4 flex items-center rounded-md bg-runner-pill-bg px-2.5 py-1'>
        <span className='select-none whitespace-nowrap text-[13px] text-[#b0b0b0]'>
          Max Loops:
        </span>
        <input
          type='number'
          value={maxLoopIterations}
          onChange={handleMaxIterationsChange}
          disabled={!canEdit}
          min={1}
          className={cn(
            'ml-2 w-12 bg-transparent text-right font-mono text-[13px] text-[#eee] outline-none',
            !canEdit && 'cursor-not-allowed opacity-50',
            '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
          )}
        />
        <div className='ml-1.5 flex cursor-pointer flex-col text-[#999]'>
          <button
            type='button'
            className='flex h-2.5 items-center justify-center hover:text-primary-white'
            onClick={() => {
              if (canEdit) onMaxLoopIterationsChange(maxLoopIterations + 1);
            }}
            disabled={!canEdit}
            tabIndex={-1}
          >
            <ChevronUp className='h-2.5 w-2.5' />
          </button>
          <button
            type='button'
            className='flex h-2.5 items-center justify-center hover:text-primary-white'
            onClick={() => {
              if (canEdit && maxLoopIterations > 1)
                onMaxLoopIterationsChange(maxLoopIterations - 1);
            }}
            disabled={!canEdit}
            tabIndex={-1}
          >
            <ChevronDown className='h-2.5 w-2.5' />
          </button>
        </div>
      </div>
    </div>
  );
}

export { RunControls };

export type { RunControlsProps, RunMode };
