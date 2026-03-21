import { type ReactNode } from 'react';
import { FloatingArrow } from '@floating-ui/react';
import { useFloatingTooltip } from '@/hooks/useFloatingTooltip';
import { AlertCircleIcon, AlertTriangleIcon } from 'lucide-react';
import { cn } from '@/utils';
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

  return (
    <>
      <div
        ref={refs.setReference}
        className={cn(
          'absolute top-1 right-1 z-10 cursor-pointer pointer-events-auto',
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
            className='max-w-xs rounded-md bg-[#181818] border border-secondary-dark-gray px-3 py-2 text-[14px] leading-[18px] font-main text-primary-white shadow-lg whitespace-pre-wrap pointer-events-auto'
          >
            {content}
            <FloatingArrow
              ref={arrowRef}
              context={context}
              width={10}
              height={5}
              fill='#181818'
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
    <div className='relative'>
      {/* Outline overlay — uses outline (not border) so it never shifts the node's size.
          Always mounted so transitions work smoothly when scrubbing back to idle. */}
      <div
        className={cn(
          'absolute inset-0 rounded-md pointer-events-none z-10 transition-[outline-color,box-shadow,opacity] duration-200',
          visualState === 'idle' &&
            '[outline:5px_solid_transparent] shadow-none',
          visualState === 'running' &&
            '[outline:5px_dashed_var(--color-primary-blue)] animate-[running-glow_2s_ease-in-out_infinite]',
          visualState === 'completed' &&
            '[outline:5px_solid_var(--color-status-completed)] shadow-[0_0_12px_rgba(76,175,80,0.3)]',
          visualState === 'errored' &&
            '[outline:5px_solid_var(--color-status-errored)] shadow-[0_0_12px_rgba(255,68,68,0.3)]',
          visualState === 'skipped' &&
            '[outline:5px_dashed_var(--color-secondary-dark-gray)] opacity-50',
          visualState === 'warning' &&
            '[outline:5px_solid_var(--color-status-warning)] shadow-[0_0_12px_rgba(255,165,0,0.3)]',
        )}
      />

      {/* Error icon */}
      {visualState === 'errored' && errorTooltipContent && (
        <StatusTooltip
          icon={<AlertCircleIcon className='w-5 h-5 text-[#FF4444]' />}
          content={errorTooltipContent}
        />
      )}

      {/* Warning icon */}
      {visualState === 'warning' && warningTooltipContent && (
        <StatusTooltip
          icon={<AlertTriangleIcon className='w-5 h-5 text-[#FFA500]' />}
          content={warningTooltipContent}
        />
      )}

      {/* Dimming layer for skipped */}
      {visualState === 'skipped' && (
        <div className='absolute inset-0 rounded-md bg-black/30 pointer-events-none z-10' />
      )}

      {children}
    </div>
  );
}

export { NodeStatusIndicator };

export type { NodeStatusIndicatorProps };
