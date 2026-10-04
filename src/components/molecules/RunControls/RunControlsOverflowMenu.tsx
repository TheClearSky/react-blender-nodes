import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/utils';
import { Popover } from '@/components/atoms/Popover';
import { ButtonToggle } from '@/components/molecules/ButtonToggle';
import { SliderNumberInput } from '@/components/molecules/SliderNumberInput/SliderNumberInput';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { RUN_MODE_OPTIONS } from './runControlsShared';
import type { RunControlsRunTarget, RunMode } from './runControlsShared';

type RunControlsOverflowMenuProps = {
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
  maxLoopIterations: number;
  onMaxLoopIterationsChange: (max: number) => void;
  runTargets?: ReadonlyArray<RunControlsRunTarget>;
  activeRunTargetId?: string;
  onRunTargetChange?: (id: string) => void;
  showTargetPicker: boolean;
  canEdit: boolean;
  canRun: boolean;
  steppingAvailable: boolean;
  /** Container-query class that hides the ⋯ trigger at wide widths. */
  triggerClassName?: string;
};

/**
 * The secondary RunControls (run target, mode, max loops) collapsed into a ⋯
 * popover for narrow containers (`@max-[832px]/runnerpanel`). The run target renders
 * as plain selectable rows here (NOT the portaled `Select`) to avoid nesting
 * floating portals. Shares state with the inline controls via the same props,
 * so toggling either updates the same value.
 */
function RunControlsOverflowMenu({
  mode,
  onModeChange,
  maxLoopIterations,
  onMaxLoopIterationsChange,
  runTargets,
  activeRunTargetId,
  onRunTargetChange,
  showTargetPicker,
  canEdit,
  canRun,
  steppingAvailable,
  triggerClassName,
}: RunControlsOverflowMenuProps) {
  const theme = useGraphTheme();
  const sectionLabel =
    'rbn:px-1 rbn:text-[10px] rbn:font-semibold rbn:uppercase rbn:tracking-wider rbn:text-secondary-light-gray';
  return (
    <Popover
      trigger={<MoreHorizontal className='rbn:h-4 rbn:w-4' />}
      triggerLabel='More run options'
      triggerClassName={cn(theme?.runnerPanel?.closeButton, triggerClassName)}
      contentClassName={theme?.runnerPanel?.overflowMenu}
    >
      {showTargetPicker && runTargets && (
        <div className='rbn:flex rbn:flex-col rbn:gap-1'>
          <span className={sectionLabel}>Run target</span>
          {runTargets.map((target) => (
            <button
              key={target.id}
              type='button'
              disabled={!canRun}
              onClick={() => onRunTargetChange?.(target.id)}
              className={cn(
                'btn-press rbn:flex rbn:items-center rbn:gap-2 rbn:rounded rbn:px-2 rbn:py-1.5 rbn:text-left rbn:text-[13px] rbn:text-primary-white rbn:transition-colors',
                target.id === activeRunTargetId
                  ? cn(
                      'rbn:bg-primary-blue/20',
                      theme?.runnerPanel?.overflowMenuItemActive,
                    )
                  : cn(
                      'rbn:hover:bg-primary-dark-gray',
                      theme?.runnerPanel?.overflowMenuItem,
                    ),
                !canRun && 'rbn:cursor-not-allowed rbn:opacity-40',
              )}
            >
              {target.icon}
              <span className='rbn:truncate'>{target.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className='rbn:flex rbn:flex-col rbn:gap-1'>
        <span className={sectionLabel}>Mode</span>
        <ButtonToggle
          options={RUN_MODE_OPTIONS}
          value={mode}
          onChange={onModeChange}
          disabled={!canEdit || !steppingAvailable}
          size='small'
          fullWidth
          activeClassName={theme?.runnerPanel?.overflowMenuItemActive}
          inactiveClassName={theme?.runnerPanel?.overflowMenuItem}
        />
      </div>
      <div
        className={cn(
          'rbn:flex rbn:flex-col rbn:gap-1',
          !canEdit && 'rbn:pointer-events-none rbn:opacity-50',
        )}
      >
        <span className={sectionLabel}>Max loops</span>
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
    </Popover>
  );
}

export { RunControlsOverflowMenu };
