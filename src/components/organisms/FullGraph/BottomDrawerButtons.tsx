import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { useBottomDrawers } from './BottomDrawerContext';

/**
 * The floating open buttons, bottom-centre of the graph, shown only while EVERY
 * bottom drawer is closed — one per registered drawer, the runner first. This
 * is the former "Runner" reopen button generalised: same styling, same
 * `runnerToggleButton` theme slot on each button, same `Open runner panel`
 * tooltip on the runner's. The row wraps and never exceeds the graph's width,
 * and each button truncates its label, so many drawers or long labels stay
 * inside the canvas (the graph may be embedded in a narrow frame, so caps are
 * relative to the row, not the viewport).
 */
function BottomDrawerButtons() {
  const { drawers, openDrawerId, setOpenDrawerId } = useBottomDrawers();
  const theme = useGraphTheme();
  if (openDrawerId !== null || drawers.length === 0) return null;

  return (
    <div
      role='group'
      aria-label='Bottom drawers'
      className='rbn:absolute rbn:bottom-4 rbn:left-1/2 rbn:z-10 rbn:flex rbn:w-max rbn:max-w-full rbn:-translate-x-1/2 rbn:flex-wrap rbn:items-center rbn:justify-center rbn:gap-2 rbn:px-4'
      data-slot='bottom-drawer-buttons'
    >
      {drawers.map((drawer) => (
        <button
          key={drawer.id}
          type='button'
          data-testid={`bottom-drawer-open-${drawer.id}`}
          onClick={() => setOpenDrawerId(drawer.id)}
          className={cn(
            'btn-press rbn:flex rbn:min-w-0 rbn:max-w-[16rem] rbn:items-center rbn:gap-2 rbn:rounded-lg rbn:border rbn:border-secondary-dark-gray/60 rbn:bg-secondary-black/90 rbn:px-4 rbn:py-2 rbn:text-[12px] rbn:font-medium rbn:text-primary-white rbn:shadow-xl rbn:backdrop-blur-sm rbn:transition-colors rbn:hover:bg-primary-dark-gray',
            theme?.runnerToggleButton,
          )}
          title={drawer.title ?? `Open ${drawer.label}`}
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

export { BottomDrawerButtons };
