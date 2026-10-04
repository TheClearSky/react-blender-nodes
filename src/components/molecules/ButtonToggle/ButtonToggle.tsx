import { cn } from '@/utils';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

type ButtonToggleOption<T extends string> = {
  value: T;
  label: string;
};

type ButtonToggleProps<T extends string> = {
  options: readonly ButtonToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** @default 'normal' */
  size?: 'small' | 'normal';
  /** Stretch to fill the container, with equal-width segments. @default false */
  fullWidth?: boolean;
  /** Classes for the SELECTED segment, applied LAST so they win per-property. */
  activeClassName?: string;
  /** Classes for the NON-selected segments, applied LAST so they win per-property. */
  inactiveClassName?: string;
  className?: string;
};

// ─────────────────────────────────────────────────────
// Size config
// ─────────────────────────────────────────────────────

const sizeConfig = {
  small: {
    wrapper: 'rbn:rounded-sm rbn:border rbn:border-secondary-dark-gray/80',
    button: 'rbn:px-2.5 rbn:py-0.5 rbn:text-[12px]',
    divider: 'rbn:border-l rbn:border-secondary-dark-gray/50',
    activeBg: 'rbn:bg-primary-blue rbn:text-white',
    inactiveBg:
      'rbn:bg-graph-toggle-track-bg rbn:text-secondary-light-gray rbn:hover:bg-primary-dark-gray rbn:hover:text-primary-white',
  },
  normal: {
    wrapper:
      'rbn:rounded-md rbn:border rbn:border-runner-timeline-box-border rbn:bg-runner-inset-bg rbn:p-[3px]',
    button: 'rbn:rounded rbn:px-3.5 rbn:py-1 rbn:text-[13px]',
    divider: '',
    activeBg: 'rbn:bg-primary-blue rbn:text-white',
    inactiveBg: 'rbn:bg-graph-toggle-track-bg rbn:text-secondary-light-gray',
  },
} as const;

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────

function ButtonToggle<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  size = 'normal',
  fullWidth = false,
  activeClassName,
  inactiveClassName,
  className,
}: ButtonToggleProps<T>) {
  const cfg = sizeConfig[size];

  return (
    <div
      className={cn(
        'rbn:flex rbn:overflow-hidden',
        fullWidth && 'rbn:w-full',
        cfg.wrapper,
        className,
      )}
    >
      {options.map((option, idx) => (
        <button
          key={option.value}
          type='button'
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={cn(
            'btn-press rbn:font-medium rbn:transition-all rbn:duration-100',
            cfg.button,
            // fullWidth: equal segments, single-line labels (tighter padding so a
            // long label like "Step-by-Step" doesn't wrap). After cfg.button so
            // the px override wins.
            fullWidth &&
              'rbn:flex-1 rbn:whitespace-nowrap rbn:px-1 rbn:text-center',
            idx > 0 && cfg.divider,
            value === option.value ? cfg.activeBg : cfg.inactiveBg,
            disabled &&
              value !== option.value &&
              'rbn:cursor-not-allowed rbn:opacity-50',
            !disabled &&
              value !== option.value &&
              size === 'normal' &&
              'rbn:hover:text-primary-white',
            // Theme overrides LAST so they win per-property over EVERY default
            // above (incl. the size==='normal' hover:text-primary-white).
            value === option.value ? activeClassName : inactiveClassName,
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export { ButtonToggle };
export type { ButtonToggleProps, ButtonToggleOption };
