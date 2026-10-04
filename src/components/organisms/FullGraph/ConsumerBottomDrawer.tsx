import { useCallback } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { ErrorBoundary } from '@/components/atoms/ErrorBoundary';
import { BottomDrawerShell } from '@/components/molecules/BottomDrawerShell/BottomDrawerShell';
import { useBottomDrawers } from './BottomDrawerContext';
import { BottomDrawerSwitchers } from './BottomDrawerSwitchers';
import type { GraphBottomDrawer } from './bottomDrawers';

/**
 * One consumer-registered bottom drawer: the shared shell with an icon + label
 * header, the switchers for the other drawers, and the consumer's `content`
 * inside its own error boundary — a throwing consumer body must not take the
 * graph down with it (the runner has the same boundary in `FullGraph`).
 *
 * The content sits in a scrollable box; the shell's resize handle sets its
 * height. Open state is the shared drawer context, never a local flag.
 */
function ConsumerBottomDrawer({ drawer }: { drawer: GraphBottomDrawer }) {
  const { openDrawerId, setOpenDrawerId } = useBottomDrawers();
  const theme = useGraphTheme();
  const open = openDrawerId === drawer.id;

  // Close ONLY if this drawer is the open one — never another drawer's.
  const handleClose = useCallback(
    () =>
      setOpenDrawerId((previous) => (previous === drawer.id ? null : previous)),
    [drawer.id, setOpenDrawerId],
  );

  return (
    <BottomDrawerShell
      open={open}
      onClose={handleClose}
      // Consumer content keeps its local state across close/reopen and
      // runner switches unless the consumer opts out.
      keepMounted={drawer.keepMounted ?? true}
      initialContentHeight={drawer.defaultHeight}
      drawerId={drawer.id}
      ariaLabel={drawer.label}
      closeTitle={`Close ${drawer.label}`}
      header={
        <div className='rbn:flex rbn:h-11 rbn:min-w-0 rbn:items-center rbn:gap-2 rbn:px-3 rbn:text-[12px] rbn:font-medium rbn:text-primary-white'>
          {drawer.icon !== undefined && (
            <span className='rbn:flex rbn:h-3.5 rbn:w-3.5 rbn:shrink-0 rbn:items-center rbn:justify-center rbn:text-secondary-light-gray rbn:[&>svg]:h-3.5 rbn:[&>svg]:w-3.5'>
              {drawer.icon}
            </span>
          )}
          <span className='rbn:truncate'>{drawer.label}</span>
        </div>
      }
      headerActions={<BottomDrawerSwitchers currentDrawerId={drawer.id} />}
    >
      <ErrorBoundary
        fallback={({ error, reset }) => (
          <div
            data-slot='error-boundary-drawer'
            className={cn(
              'rbn:flex rbn:h-full rbn:w-full rbn:flex-col rbn:items-center rbn:justify-center rbn:gap-3 rbn:bg-zinc-900 rbn:p-6 rbn:text-zinc-300',
              theme?.errorBoundary?.container,
            )}
          >
            <AlertTriangle className='rbn:h-8 rbn:w-8 rbn:text-red-400' />
            <p className='rbn:text-sm rbn:font-medium rbn:text-red-400'>
              {drawer.label} error
            </p>
            <p className='rbn:max-w-md rbn:text-center rbn:text-xs rbn:text-zinc-500'>
              {error.message}
            </p>
            <button
              type='button'
              onClick={reset}
              className={cn(
                'rbn:mt-2 rbn:inline-flex rbn:items-center rbn:gap-1.5 rbn:rounded-md rbn:border rbn:border-zinc-700 rbn:bg-zinc-800 rbn:px-3 rbn:py-1.5 rbn:text-xs rbn:text-zinc-300 rbn:transition-colors rbn:hover:bg-zinc-700',
                theme?.errorBoundary?.retryButton,
              )}
            >
              <RotateCcw className='rbn:h-3 rbn:w-3' />
              Retry
            </button>
          </div>
        )}
        onError={(error, errorInfo) => {
          console.error(
            `[FullGraph] Bottom drawer '${drawer.id}' render error:`,
            error,
            errorInfo,
          );
        }}
      >
        <div className='node-runner-scrollbar rbn:min-h-0 rbn:min-w-0 rbn:flex-1 rbn:overflow-auto'>
          {drawer.content}
        </div>
      </ErrorBoundary>
    </BottomDrawerShell>
  );
}

export { ConsumerBottomDrawer };
