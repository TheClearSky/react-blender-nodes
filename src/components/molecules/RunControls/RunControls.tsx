import { Play, Pause, SkipForward, Square, RotateCcw } from 'lucide-react';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { SliderNumberInput } from '@/components/molecules/SliderNumberInput/SliderNumberInput';
import { Tooltip } from '@/components/atoms/Tooltip';
import { ButtonToggle } from '@/components/molecules/ButtonToggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/molecules/Select/Select';
import type { RunnerState } from '@/utils/nodeRunner/types';
import { RunControlsOverflowMenu } from './RunControlsOverflowMenu';
import { RUN_MODE_OPTIONS } from './runControlsShared';
import type { RunControlsRunTarget, RunMode } from './runControlsShared';

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
  /** Registered run targets (incl. the built-in default). When more than one, a
   *  compact target picker renders next to the Run button. */
  runTargets?: ReadonlyArray<RunControlsRunTarget>;
  /** The active run target id. */
  activeRunTargetId?: string;
  /** Change the active run target. */
  onRunTargetChange?: (id: string) => void;
  /** Whether the active target supports stepping (pause / step). Default true. */
  steppingAvailable?: boolean;
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
  const theme = useGraphTheme();
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'btn-press flex items-center justify-center transition-all duration-100',
        isPlay
          ? 'h-8 w-8 rounded-md bg-primary-blue text-white shadow-[0_0_12px_var(--color-runner-play-button-glow)]'
          : 'h-7 w-7 rounded',
        disabled && 'cursor-not-allowed opacity-30',
        !disabled &&
          !active &&
          !isPlay &&
          'hover:bg-primary-dark-gray hover:text-white',
        !disabled && isPlay && 'hover:brightness-110',
        active &&
          !isPlay &&
          'bg-primary-blue shadow-[0_0_8px_var(--color-runner-active-button-glow)]',
        !disabled &&
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-blue',
        isPlay
          ? theme?.runControls?.playButton
          : theme?.runControls?.actionButton,
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
  runTargets,
  activeRunTargetId,
  onRunTargetChange,
  steppingAvailable = true,
}: RunControlsProps) {
  const statusConfig = STATUS_CONFIG[runnerState];
  const theme = useGraphTheme();
  const showTargetPicker = !!runTargets && runTargets.length > 1;
  const activeTarget = runTargets?.find(
    (target) => target.id === activeRunTargetId,
  );
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
    <div
      className={cn(
        'flex h-11 w-full items-center gap-2 border-b border-secondary-dark-gray bg-runner-toolbar-bg px-3',
        theme?.runControls?.container,
      )}
    >
      {/* Status indicator — label hides below `@max-[832px]`, leaving just the dot */}
      <div className='flex w-[140px] @max-[832px]/runnerpanel:w-auto items-center gap-2.5'>
        <div className='relative flex items-center justify-center'>
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full transition-colors duration-200',
              statusConfig.color,
              statusConfig.pulse && 'animate-pulse',
              statusConfig.pulse && 'shadow-[0_0_8px_currentColor]',
              theme?.runControls?.statusDot,
            )}
          />
          {statusConfig.pulse && (
            <div
              className={cn(
                'absolute h-2.5 w-2.5 animate-ping rounded-full opacity-50',
                statusConfig.color,
                theme?.runControls?.statusDot,
              )}
            />
          )}
        </div>
        <span
          className={cn(
            'text-[14px] text-primary-white @max-[832px]/runnerpanel:hidden',
            theme?.runControls?.statusLabel,
          )}
        >
          {statusConfig.label}
        </span>
      </div>

      <div
        className={cn(
          'mx-3 h-6 w-px bg-secondary-dark-gray @max-[832px]/runnerpanel:hidden',
          theme?.runControls?.divider,
        )}
      />

      {/* Action buttons */}
      <div className='flex items-center gap-3'>
        <ActionButton
          icon={<Play className='h-3.5 w-3.5 fill-current' />}
          onClick={onRun}
          disabled={!canRun}
          active={runnerState === 'running'}
          variant='play'
          title={activeTarget ? `Run: ${activeTarget.label}` : 'Run'}
        />
        {showTargetPicker && (
          <Select
            value={activeRunTargetId}
            onValueChange={(value) => value && onRunTargetChange?.(value)}
            disabled={!canRun}
            size='compact'
          >
            <SelectTrigger
              className='w-[160px] @max-[832px]/runnerpanel:hidden'
              title='Choose run target'
            >
              <SelectValue placeholder='Run target' />
            </SelectTrigger>
            <SelectContent>
              {runTargets!.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  {target.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ActionButton
          icon={<Pause className='h-4 w-4 text-primary-white' />}
          onClick={onPause}
          disabled={!canPause}
          title='Pause'
        />
        <ActionButton
          icon={<SkipForward className='h-4 w-4 text-primary-white' />}
          onClick={onStep}
          disabled={!canStep || !steppingAvailable}
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

      <div
        className={cn(
          'mx-3 h-6 w-px bg-secondary-dark-gray @max-[832px]/runnerpanel:hidden',
          theme?.runControls?.divider,
        )}
      />

      {/* Mode toggle — inset pill (moves into the ⋯ menu below `@max-[832px]`) */}
      <Tooltip
        className='@max-[832px]/runnerpanel:hidden'
        content='Instant runs the entire graph at once, then enables replay. Step-by-Step pauses after each node so you can inspect intermediate values.'
      >
        <ButtonToggle
          options={RUN_MODE_OPTIONS}
          value={mode}
          onChange={onModeChange}
          disabled={!canEdit || !steppingAvailable}
          size='small'
        />
      </Tooltip>

      {/* Max iterations — slider (moves into the ⋯ menu below `@max-[832px]`) */}
      <Tooltip
        className='@max-[832px]/runnerpanel:hidden'
        content='Maximum loop iterations before the runner throws an error. Protects against infinite loops.'
      >
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
            className={theme?.node?.inputField}
          />
        </div>
      </Tooltip>

      {/* Secondary controls collapse here below `@max-[832px]` (one narrow regime). */}
      <RunControlsOverflowMenu
        mode={mode}
        onModeChange={onModeChange}
        maxLoopIterations={maxLoopIterations}
        onMaxLoopIterationsChange={onMaxLoopIterationsChange}
        runTargets={runTargets}
        activeRunTargetId={activeRunTargetId}
        onRunTargetChange={onRunTargetChange}
        showTargetPicker={showTargetPicker}
        canEdit={canEdit}
        canRun={canRun}
        steppingAvailable={steppingAvailable}
        triggerClassName='@min-[832px]/runnerpanel:hidden @max-[832px]/runnerpanel:ml-auto'
      />
    </div>
  );
}

export { RunControls };

export type { RunControlsProps, RunMode, RunControlsRunTarget };
