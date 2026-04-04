import { Play, Pause, SkipForward, Square, RotateCcw } from 'lucide-react';
import { cn } from '@/utils';
import { SliderNumberInput } from '@/components/molecules/SliderNumberInput/SliderNumberInput';
import { Tooltip } from '@/components/atoms/Tooltip';
import { ButtonToggle } from '@/components/molecules/ButtonToggle';
import type { RunnerState } from '@/utils/nodeRunner/types';

const RUN_MODE_OPTIONS = [
  { value: 'instant' as const, label: 'Instant' },
  { value: 'stepByStep' as const, label: 'Step-by-Step' },
];

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
 * ● Status | [▶] [⏸] [⏭] [⏹] [↺] | [Instant/Step] | Max loops: [100]
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

  return (
    <div className='flex h-11 w-full items-center gap-2 border-b border-secondary-dark-gray bg-runner-toolbar-bg px-3'>
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
      <Tooltip content='Instant runs the entire graph at once, then enables replay. Step-by-Step pauses after each node so you can inspect intermediate values.'>
        <ButtonToggle
          options={RUN_MODE_OPTIONS}
          value={mode}
          onChange={onModeChange}
          disabled={!canEdit}
          size='small'
        />
      </Tooltip>

      {/* Max iterations — slider */}
      <Tooltip content='Maximum loop iterations before the runner throws an error. Protects against infinite loops.'>
        <div
          className={cn('ml-4', !canEdit && 'pointer-events-none opacity-50')}
        >
          <SliderNumberInput
            name='Max Loops'
            value={maxLoopIterations}
            onChange={(v) =>
              onMaxLoopIterationsChange(Math.max(1, Math.round(v)))
            }
            size='small'
            decimals={0}
          />
        </div>
      </Tooltip>
    </div>
  );
}

export { RunControls };

export type { RunControlsProps, RunMode };
