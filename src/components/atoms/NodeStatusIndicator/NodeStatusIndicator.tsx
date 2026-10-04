import { type ReactNode } from 'react';
import { FloatingArrow } from '@floating-ui/react';
import { useFloatingTooltip } from '@/hooks/useFloatingTooltip';
import { AlertCircleIcon, AlertTriangleIcon } from 'lucide-react';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import type { NodeVisualState, GraphError } from '@/utils/nodeRunner/types';
import { formatGraphError } from '@/utils/nodeRunner/errors';

/**
 * Props for the NodeStatusIndicator component.
 *
 * Renders a border overlay and optional icon on top of a node
 * to indicate its execution visual state.
 */
type NodeStatusIndicatorProps = {
  /** Current visual state of the node */
  visualState: NodeVisualState;
  /** Errors associated with this node (shown on hover when errored) */
  errors?: ReadonlyArray<GraphError>;
  /** Warning messages (shown on hover when warning) */
  warnings?: ReadonlyArray<string>;
  /** The node content to wrap */
  children: ReactNode;
};

/**
 * Tooltip shown when hovering over an error or warning icon.
 * Uses @floating-ui/react for positioning, matching the existing
 * ContextMenu pattern in the codebase.
 */
function StatusTooltip({
  icon,
  content,
  iconClassName,
}: {
  icon: ReactNode;
  content: string;
  iconClassName?: string;
}) {
  const {
    refs,
    floatingStyles,
    context,
    arrowRef,
    getReferenceProps,
    getFloatingProps,
    isMounted,
    transitionStyles,
  } = useFloatingTooltip({
    placement: 'top',
    offsetPx: 10,
    hoverDelay: { open: 150, close: 0 },
    transitionDuration: 150,
  });
  const theme = useGraphTheme();

  return (
    <>
      <div
        ref={refs.setReference}
        className={cn(
          'rbn:absolute rbn:top-1 rbn:right-1 rbn:z-10 rbn:cursor-pointer rbn:pointer-events-auto',
          iconClassName,
        )}
        {...getReferenceProps()}
      >
        {icon}
      </div>
      {isMounted && (
        <div
          ref={refs.setFloating}
          style={{ ...floatingStyles, zIndex: 50 }}
          {...getFloatingProps()}
        >
          <div
            style={transitionStyles}
            className={cn(
              'rbn:max-w-xs rbn:rounded-md rbn:bg-tooltip-bg rbn:border rbn:border-secondary-dark-gray rbn:px-3 rbn:py-2 rbn:text-[14px] rbn:leading-[18px] rbn:font-main rbn:text-primary-white rbn:shadow-lg rbn:whitespace-pre-wrap rbn:pointer-events-auto',
              theme?.statusIndicator?.tooltip,
            )}
          >
            {content}
            <FloatingArrow
              ref={arrowRef}
              context={context}
              width={10}
              height={5}
              fill='var(--color-tooltip-bg)'
              strokeWidth={1}
              stroke='var(--color-secondary-dark-gray)'
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Outline overlay and icon indicator for a node's execution state.
 * Uses CSS `outline` (not `border`) so the indicator never affects
 * the node's layout or size.
 *
 * Visual states:
 * - `idle`: No visual change
 * - `running`: Dashed blue outline with breathing glow
 * - `completed`: Solid green outline (persists)
 * - `errored`: Solid red outline + AlertCircle icon with error tooltip
 * - `skipped`: Dimmed opacity, dashed gray outline
 * - `warning`: Solid orange outline + AlertTriangle icon with warning tooltip
 */
function NodeStatusIndicator({
  visualState,
  errors,
  warnings,
  children,
}: NodeStatusIndicatorProps) {
  const errorTooltipContent =
    errors && errors.length > 0
      ? errors.map((e) => formatGraphError(e)).join('\n\n')
      : undefined;

  const warningTooltipContent =
    warnings && warnings.length > 0 ? warnings.join('\n') : undefined;

  return (
    <div className='rbn:relative'>
      {/* Outline overlay — uses outline (not border) so it never shifts the node's size.
          Always mounted so transitions work smoothly when scrubbing back to idle. */}
      <div
        className={cn(
          'rbn:absolute rbn:inset-0 rbn:rounded-md rbn:pointer-events-none rbn:z-10 rbn:transition-[outline-color,box-shadow,opacity] rbn:duration-200',
          visualState === 'idle' &&
            'rbn:[outline:5px_solid_transparent] rbn:shadow-none',
          visualState === 'running' &&
            'rbn:[outline:5px_dashed_var(--color-primary-blue)] rbn:animate-[running-glow_2s_ease-in-out_infinite]',
          visualState === 'completed' &&
            'rbn:[outline:5px_solid_var(--color-status-completed)] rbn:shadow-[0_0_12px_rgba(76,175,80,0.3)]',
          visualState === 'errored' &&
            'rbn:[outline:5px_solid_var(--color-status-errored)] rbn:shadow-[0_0_12px_rgba(255,68,68,0.3)]',
          visualState === 'skipped' &&
            'rbn:[outline:5px_dashed_var(--color-secondary-dark-gray)] rbn:opacity-50',
          visualState === 'warning' &&
            'rbn:[outline:5px_solid_var(--color-status-warning)] rbn:shadow-[0_0_12px_rgba(255,165,0,0.3)]',
        )}
      />

      {/* Error icon */}
      {visualState === 'errored' && errorTooltipContent && (
        <StatusTooltip
          icon={
            <AlertCircleIcon className='rbn:w-5 rbn:h-5 rbn:text-status-errored' />
          }
          content={errorTooltipContent}
        />
      )}

      {/* Warning icon */}
      {visualState === 'warning' && warningTooltipContent && (
        <StatusTooltip
          icon={
            <AlertTriangleIcon className='rbn:w-5 rbn:h-5 rbn:text-status-warning' />
          }
          content={warningTooltipContent}
        />
      )}

      {/* Dimming layer for skipped */}
      {visualState === 'skipped' && (
        <div className='rbn:absolute rbn:inset-0 rbn:rounded-md rbn:bg-black/30 rbn:pointer-events-none rbn:z-10' />
      )}

      {children}
    </div>
  );
}

export { NodeStatusIndicator };

export type { NodeStatusIndicatorProps };
