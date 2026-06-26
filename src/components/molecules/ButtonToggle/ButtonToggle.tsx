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
    wrapper: 'rounded-sm border border-secondary-dark-gray/80',
    button: 'px-2.5 py-0.5 text-[12px]',
    divider: 'border-l border-secondary-dark-gray/50',
    activeBg: 'bg-primary-blue text-white',
    inactiveBg:
      'bg-graph-toggle-track-bg text-secondary-light-gray hover:bg-primary-dark-gray hover:text-primary-white',
  },
  normal: {
    wrapper:
      'rounded-md border border-runner-timeline-box-border bg-runner-inset-bg p-[3px]',
    button: 'rounded px-3.5 py-1 text-[13px]',
    divider: '',
    activeBg: 'bg-primary-blue text-white',
    inactiveBg: 'bg-graph-toggle-track-bg text-secondary-light-gray',
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
        'flex overflow-hidden',
        fullWidth && 'w-full',
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
            'btn-press font-medium transition-all duration-100',
            cfg.button,
            // fullWidth: equal segments, single-line labels (tighter padding so a
            // long label like "Step-by-Step" doesn't wrap). After cfg.button so
            // the px override wins.
            fullWidth && 'flex-1 whitespace-nowrap px-1 text-center',
            idx > 0 && cfg.divider,
            value === option.value ? cfg.activeBg : cfg.inactiveBg,
            disabled &&
              value !== option.value &&
              'cursor-not-allowed opacity-50',
            !disabled &&
              value !== option.value &&
              size === 'normal' &&
              'hover:text-primary-white',
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
