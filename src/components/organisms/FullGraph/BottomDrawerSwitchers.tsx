import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { useBottomDrawers } from './BottomDrawerContext';

/**
 * The switcher buttons in an OPEN drawer's header — one per OTHER registered
 * drawer — so the user can go straight from the runner to a consumer drawer
 * (or back) without closing first. Opening one closes the current drawer by
 * construction: there is only one open id.
 *
 * Styled like the header's `X` (and themed by the same `runnerPanel.closeButton`
 * slot, which already covers the `⋯` overflow triggers for the same reason).
 * Each label is capped at a fixed width and truncates, since in the runner's
 * header these share the row with `RunControls`. Renders nothing when this
 * drawer is the only one.
 */
function BottomDrawerSwitchers({
  currentDrawerId,
}: {
  /** The drawer whose header this is — excluded from the list. */
  currentDrawerId: string;
}) {
  const { drawers, setOpenDrawerId } = useBottomDrawers();
  const theme = useGraphTheme();
  const others = drawers.filter((drawer) => drawer.id !== currentDrawerId);
  if (others.length === 0) return null;

  return (
    <div
      role='group'
      aria-label='Switch drawer'
      className='rbn:mr-1 rbn:flex rbn:shrink-0 rbn:items-center rbn:gap-1'
      data-slot='bottom-drawer-switchers'
    >
      {others.map((drawer) => (
        <button
          key={drawer.id}
          type='button'
          data-testid={`bottom-drawer-switch-${drawer.id}`}
          onClick={() => setOpenDrawerId(drawer.id)}
          className={cn(
            'btn-press rbn:flex rbn:min-w-0 rbn:max-w-[9rem] rbn:items-center rbn:gap-1.5 rbn:rounded rbn:px-2 rbn:py-1.5 rbn:text-[11px] rbn:font-medium rbn:text-secondary-light-gray rbn:transition-colors rbn:hover:bg-primary-dark-gray rbn:hover:text-primary-white',
            theme?.runnerPanel?.closeButton,
          )}
          title={`Switch to ${drawer.label}`}
        >
          {drawer.icon !== undefined && (
            <span className='rbn:flex rbn:h-3.5 rbn:w-3.5 rbn:shrink-0 rbn:items-center rbn:justify-center rbn:[&>svg]:h-3.5 rbn:[&>svg]:w-3.5'>
              {drawer.icon}
            </span>
          )}
          <span className='rbn:truncate'>{drawer.label}</span>
        </button>
      ))}
    </div>
  );
}

export { BottomDrawerSwitchers };
