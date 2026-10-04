import {
  Play,
  Pause,
  SkipForward,
  CornerDownRight,
  Square,
  RotateCcw,
} from 'lucide-react';
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
  /** Live step-over (drains through the structure the next step descends into). */
  onStepOver?: () => void;
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
        'btn-press rbn:flex rbn:items-center rbn:justify-center rbn:transition-all rbn:duration-100',
        isPlay
          ? 'rbn:h-8 rbn:w-8 rbn:rounded-md rbn:bg-primary-blue rbn:text-white rbn:shadow-[0_0_12px_var(--color-runner-play-button-glow)]'
          : 'rbn:h-7 rbn:w-7 rbn:rounded',
        disabled && 'rbn:cursor-not-allowed rbn:opacity-30',
        !disabled &&
          !active &&
          !isPlay &&
          'rbn:hover:bg-primary-dark-gray rbn:hover:text-white',
        !disabled && isPlay && 'rbn:hover:brightness-110',
        active &&
          !isPlay &&
          'rbn:bg-primary-blue rbn:shadow-[0_0_8px_var(--color-runner-active-button-glow)]',
        !disabled &&
          'rbn:focus-visible:outline-none rbn:focus-visible:ring-1 rbn:focus-visible:ring-primary-blue',
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
  onStepOver,
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
  // Step-over drains an EXISTING generator; from idle there is none (plain
  // Step starts the run), so the button only makes sense while paused.
  const canStepOver = runnerState === 'paused';

  return (
    <div
      className={cn(
        'rbn:flex rbn:h-11 rbn:w-full rbn:items-center rbn:gap-2 rbn:border-b rbn:border-secondary-dark-gray rbn:bg-runner-toolbar-bg rbn:px-3',
        theme?.runControls?.container,
      )}
    >
      {/* Status indicator — label hides below `@max-[832px]`, leaving just the dot */}
      <div className='rbn:flex rbn:w-[140px] rbn:@max-[832px]/runnerpanel:w-auto rbn:items-center rbn:gap-2.5'>
        <div className='rbn:relative rbn:flex rbn:items-center rbn:justify-center'>
          <div
            className={cn(
              'rbn:h-2.5 rbn:w-2.5 rbn:rounded-full rbn:transition-colors rbn:duration-200',
              statusConfig.color,
              statusConfig.pulse && 'rbn:animate-pulse',
              statusConfig.pulse && 'rbn:shadow-[0_0_8px_currentColor]',
              theme?.runControls?.statusDot,
            )}
          />
          {statusConfig.pulse && (
            <div
              className={cn(
                'rbn:absolute rbn:h-2.5 rbn:w-2.5 rbn:animate-ping rbn:rounded-full rbn:opacity-50',
                statusConfig.color,
                theme?.runControls?.statusDot,
              )}
            />
          )}
        </div>
        <span
          className={cn(
            'rbn:text-[14px] rbn:text-primary-white rbn:@max-[832px]/runnerpanel:hidden',
            theme?.runControls?.statusLabel,
          )}
        >
          {statusConfig.label}
        </span>
      </div>

      <div
        className={cn(
          'rbn:mx-3 rbn:h-6 rbn:w-px rbn:bg-secondary-dark-gray rbn:@max-[832px]/runnerpanel:hidden',
          theme?.runControls?.divider,
        )}
      />

      {/* Action buttons */}
      <div className='rbn:flex rbn:items-center rbn:gap-3'>
        <ActionButton
          icon={<Play className='rbn:h-3.5 rbn:w-3.5 rbn:fill-current' />}
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
              className='rbn:w-[160px] rbn:@max-[832px]/runnerpanel:hidden'
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
          icon={<Pause className='rbn:h-4 rbn:w-4 rbn:text-primary-white' />}
          onClick={onPause}
          disabled={!canPause}
          title='Pause'
        />
        <ActionButton
          icon={
            <SkipForward className='rbn:h-4 rbn:w-4 rbn:text-primary-white' />
          }
          onClick={onStep}
          disabled={!canStep || !steppingAvailable}
          title='Step'
        />
        {onStepOver && (
          <ActionButton
            icon={
              <CornerDownRight className='rbn:h-4 rbn:w-4 rbn:text-primary-white' />
            }
            onClick={onStepOver}
            disabled={!canStepOver || !steppingAvailable}
            title='Step over (execute through the group the next step enters)'
          />
        )}
        <ActionButton
          icon={<Square className='rbn:h-4 rbn:w-4 rbn:text-primary-white' />}
          onClick={onStop}
          disabled={!canStop}
          title='Stop'
        />
        <ActionButton
          icon={
            <RotateCcw className='rbn:h-4 rbn:w-4 rbn:text-primary-white' />
          }
          onClick={onReset}
          disabled={!canReset}
          title='Reset'
        />
      </div>

      <div
        className={cn(
          'rbn:mx-3 rbn:h-6 rbn:w-px rbn:bg-secondary-dark-gray rbn:@max-[832px]/runnerpanel:hidden',
          theme?.runControls?.divider,
        )}
      />

      {/* Mode toggle — inset pill (moves into the ⋯ menu below `@max-[832px]`) */}
      <Tooltip
        className='rbn:@max-[832px]/runnerpanel:hidden'
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
        className='rbn:@max-[832px]/runnerpanel:hidden'
        content='Maximum loop iterations before the runner throws an error. Protects against infinite loops.'
      >
        <div
          className={cn(
            'rbn:ml-4',
            !canEdit && 'rbn:pointer-events-none rbn:opacity-50',
          )}
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
        triggerClassName='rbn:@min-[832px]/runnerpanel:hidden rbn:@max-[832px]/runnerpanel:ml-auto'
      />
    </div>
  );
}

export { RunControls };

export type { RunControlsProps, RunMode, RunControlsRunTarget };
