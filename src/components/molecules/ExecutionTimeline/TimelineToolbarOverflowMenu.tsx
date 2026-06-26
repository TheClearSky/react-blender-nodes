import {
  MoreHorizontal,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Timer,
  Layers,
  Zap,
} from 'lucide-react';
import { cn } from '@/utils';
import { Popover } from '@/components/atoms/Popover';
import { ButtonToggle } from '@/components/molecules/ButtonToggle';
import { SliderNumberInput } from '@/components/molecules/SliderNumberInput/SliderNumberInput';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { TIME_MODE_OPTIONS } from './SupportingSubcomponents/types';

type TimeMode = (typeof TIME_MODE_OPTIONS)[number]['value'];

type TimelineToolbarOverflowMenuProps = {
  autoplayIntervalSec: number;
  onAutoplayIntervalChange: (seconds: number) => void;
  autoScroll: boolean;
  onAutoScrollChange: (enabled: boolean) => void;
  hasPauseData: boolean;
  timeMode: TimeMode;
  onTimeModeChange: (mode: TimeMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToView: () => void;
  totalDurationMs: number;
  stepCount: number;
  warmupDurationMs: number;
  /** Container-query class that hides the ⋯ trigger at wide widths. */
  triggerClassName?: string;
};

/**
 * The timeline toolbar's secondary controls (autoplay interval, auto-scroll,
 * time mode, zoom, run stats) collapsed into a ⋯ popover for narrow containers
 * (`@max-[832px]/runnerpanel`). The collapse caret + step navigation stay inline.
 * Shares state with the inline controls via props.
 */
function TimelineToolbarOverflowMenu({
  autoplayIntervalSec,
  onAutoplayIntervalChange,
  autoScroll,
  onAutoScrollChange,
  hasPauseData,
  timeMode,
  onTimeModeChange,
  onZoomIn,
  onZoomOut,
  onFitToView,
  totalDurationMs,
  stepCount,
  warmupDurationMs,
  triggerClassName,
}: TimelineToolbarOverflowMenuProps) {
  const theme = useGraphTheme();
  const sectionLabel =
    'px-1 text-[10px] font-semibold uppercase tracking-wider text-secondary-light-gray';
  // Ghost buttons (no filled bg) so the themed `overflowMenuItem` hover reaches
  // their inlined hover state — a filled `bg-primary-dark-gray` would be a
  // portaled inline token the menu-surface slot can't override.
  const zoomButton = cn(
    'btn-press flex flex-1 items-center justify-center rounded py-1 text-primary-white transition-colors hover:bg-primary-dark-gray',
    theme?.runnerPanel?.overflowMenuItem,
  );
  return (
    <Popover
      trigger={<MoreHorizontal className='h-4 w-4' />}
      triggerLabel='More timeline options'
      triggerClassName={cn(theme?.runnerPanel?.closeButton, triggerClassName)}
      contentClassName={theme?.runnerPanel?.overflowMenu}
    >
      <div className='flex flex-col gap-1'>
        <span className={sectionLabel}>Autoplay interval (s)</span>
        <SliderNumberInput
          name='Interval'
          value={autoplayIntervalSec}
          onChange={(v) => onAutoplayIntervalChange(Math.max(0.5, v))}
          min={0.5}
          max={30}
          size='small'
          className={theme?.node?.inputField}
        />
      </div>

      <label className='flex cursor-pointer items-center gap-2 px-1 text-[13px] text-primary-white select-none'>
        <input
          type='checkbox'
          checked={autoScroll}
          onChange={(e) => onAutoScrollChange(e.target.checked)}
          className='h-3.5 w-3.5 cursor-pointer rounded-sm accent-primary-blue'
        />
        Auto-scroll to selected step
      </label>

      {hasPauseData && (
        <div className='flex flex-col gap-1'>
          <span className={sectionLabel}>Time mode</span>
          <ButtonToggle
            options={TIME_MODE_OPTIONS}
            value={timeMode}
            onChange={onTimeModeChange}
            size='small'
            fullWidth
            activeClassName={theme?.runnerPanel?.overflowMenuItemActive}
            inactiveClassName={theme?.runnerPanel?.overflowMenuItem}
          />
        </div>
      )}

      <div className='flex flex-col gap-1'>
        <span className={sectionLabel}>Zoom</span>
        <div className='flex items-center gap-1'>
          <button
            type='button'
            onClick={onZoomIn}
            className={zoomButton}
            title='Zoom In'
          >
            <ZoomIn className='h-4 w-4' />
          </button>
          <button
            type='button'
            onClick={onZoomOut}
            className={zoomButton}
            title='Zoom Out'
          >
            <ZoomOut className='h-4 w-4' />
          </button>
          <button
            type='button'
            onClick={onFitToView}
            className={zoomButton}
            title='Fit to View'
          >
            <Maximize2 className='h-4 w-4' />
          </button>
        </div>
      </div>

      <div className='flex flex-col gap-1 border-t border-secondary-dark-gray pt-2 font-mono text-[12px] text-primary-white'>
        <span className='flex items-center gap-1.5'>
          <Timer className='h-3.5 w-3.5' /> {totalDurationMs.toFixed(2)}ms
        </span>
        <span className='flex items-center gap-1.5'>
          <Layers className='h-3.5 w-3.5' /> {stepCount} steps
        </span>
        {warmupDurationMs > 0 && (
          <span className='flex items-center gap-1.5'>
            <Zap className='h-3.5 w-3.5' /> JIT {warmupDurationMs.toFixed(1)}ms
          </span>
        )}
      </div>
    </Popover>
  );
}

export { TimelineToolbarOverflowMenu };
