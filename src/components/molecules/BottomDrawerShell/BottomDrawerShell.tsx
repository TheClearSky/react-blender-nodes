import { useCallback, useEffect, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';
import { useResizeHandle } from '@/hooks/useResizeHandle';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────

const DEFAULT_CONTENT_HEIGHT = 220;
const MIN_CONTENT_HEIGHT = 80;
const MAX_CONTENT_HEIGHT = 600;
/** Must match `useSlideAnimation`'s default `hiddenTransform`. */
const HIDDEN_TRANSFORM = 'translateY(100%)';

// ─────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────

type BottomDrawerShellProps = {
  /** Whether the drawer is open. Closing plays the exit slide, then hides/unmounts. */
  open: boolean;
  /** Called by the header's `X` button. */
  onClose: () => void;
  /**
   * Header-row content, left of the switcher/close buttons. Gets the row's
   * flexible width (`min-w-0 flex-1`) — the runner puts `RunControls` here, a
   * consumer drawer its icon + label.
   */
  header?: ReactNode;
  /** Buttons rendered between `header` and the `X` (the drawer switchers). */
  headerActions?: ReactNode;
  /** Body, rendered inside the resizable content area (a flex row). */
  children: ReactNode;
  /**
   * Keep the whole drawer MOUNTED while closed (hidden with the `hidden`
   * attribute → `display: none`) instead of unmounting after the exit slide.
   * Children keep their state; the next open still slides up.
   * @default false
   */
  keepMounted?: boolean;
  /** Forwarded to the animated panel element, for height measurement. */
  panelRef?: RefObject<HTMLDivElement | null>;
  /** Merged onto the animated panel element. */
  className?: string;
  /** `data-slot` of the animated panel element. @default 'bottom-drawer' */
  dataSlot?: string;
  /** `data-drawer-id` of the animated panel element (the drawer's id). */
  drawerId?: string;
  /** Accessible name of the panel (`role="region"`). */
  ariaLabel?: string;
  /** Tooltip AND accessible name of the `X` button. @default 'Close panel' */
  closeTitle?: string;
  /** Starting body height in px, clamped to 80–600. @default 220 */
  initialContentHeight?: number;
};

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────

/**
 * The bottom-drawer chrome shared by the runner panel and every consumer
 * `bottomDrawers` entry: a clip wrapper pinned to the bottom of the nearest
 * positioned ancestor, a slide-up/down mount animation (`useSlideAnimation`),
 * a three-dot window handle that doubles as the vertical resize grip
 * (`useResizeHandle`, direction `up`, 220 px within 80–600), a header row
 * `[header][headerActions][X]`, and a height-bound body.
 *
 * Themed by the `runnerPanel.container` / `resizeHandle` / `closeButton`
 * slots — the same slots the runner panel has always used, so a themed runner
 * and a themed consumer drawer match without a second slot family.
 *
 * Closed: returns `null` once the exit animation finished — or, with
 * `keepMounted`, keeps the DOM and hides it (`hidden`), parking the panel at
 * the hidden transform so the next open animates. The resize height persists
 * across open/close either way because the hook state lives here. While a
 * drawer is sliding OUT and another is sliding IN (a switch), the opening one
 * is layered above and the closing one ignores the pointer, so the 250 ms
 * overlap can neither occlude the new drawer nor swallow clicks.
 */
function BottomDrawerShell({
  open,
  onClose,
  header,
  headerActions,
  children,
  keepMounted = false,
  panelRef,
  className,
  dataSlot = 'bottom-drawer',
  drawerId,
  ariaLabel,
  closeTitle = 'Close panel',
  initialContentHeight = DEFAULT_CONTENT_HEIGHT,
}: BottomDrawerShellProps) {
  const theme = useGraphTheme();

  const { size: contentHeight, onMouseDown: handleResizeStart } =
    useResizeHandle({
      initialSize: Math.min(
        MAX_CONTENT_HEIGHT,
        Math.max(MIN_CONTENT_HEIGHT, initialContentHeight),
      ),
      minSize: MIN_CONTENT_HEIGHT,
      maxSize: MAX_CONTENT_HEIGHT,
      direction: 'up',
    });

  const { mounted, ref: animationRef, style } = useSlideAnimation(open);

  // Combine the animation ref with the caller's measurement ref.
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      (animationRef as RefObject<HTMLDivElement | null>).current = node;
      if (panelRef) {
        (panelRef as RefObject<HTMLDivElement | null>).current = node;
      }
    },
    [animationRef, panelRef],
  );

  // keepMounted: once the exit slide has finished (`mounted` false) the panel
  // is hidden, not removed. Its inline transform is at the VISIBLE position
  // (the cancelled exit animation snaps back to the committed inline style),
  // so park it at the hidden transform — otherwise the next open would appear
  // instantly instead of sliding up.
  useEffect(() => {
    if (!keepMounted || mounted) return;
    const panel = animationRef.current;
    if (panel) panel.style.transform = HIDDEN_TRANSFORM;
  }, [keepMounted, mounted, animationRef]);

  if (!mounted && !keepMounted) return null;

  return (
    // Clip wrapper: contains the slide animation so translateY(100%)
    // doesn't overflow the page and cause scrollbars. The OPEN drawer sits one
    // layer above a closing one (z-20 vs z-10).
    <div
      hidden={!mounted}
      className={cn(
        'rbn:absolute rbn:inset-x-0 rbn:bottom-0 rbn:overflow-hidden rbn:pointer-events-none',
        open ? 'rbn:z-20' : 'rbn:z-10',
      )}
    >
      <div
        ref={combinedRef}
        role='region'
        aria-label={ariaLabel}
        data-slot={dataSlot}
        data-drawer-id={drawerId}
        className={cn(
          // A closing drawer must not swallow clicks meant for the one opening.
          open ? 'rbn:pointer-events-auto' : 'rbn:pointer-events-none',
          'rbn:flex rbn:flex-col rbn:overflow-hidden rbn:rounded-t-lg rbn:border rbn:border-b-0 rbn:border-secondary-dark-gray/60 rbn:bg-runner-panel-bg rbn:shadow-xl',
          theme?.runnerPanel?.container,
          className,
        )}
        style={style}
      >
        {/* Window handle — three dots, also serves as resize handle */}
        <div
          className={cn(
            'rbn:group/resizer rbn:flex rbn:shrink-0 rbn:cursor-ns-resize rbn:items-center rbn:justify-center rbn:border-b rbn:border-runner-timeline-box-border rbn:bg-runner-resize-handle-bg rbn:py-2 rbn:transition-colors rbn:hover:bg-runner-resize-handle-hover-bg',
            theme?.runnerPanel?.resizeHandle,
          )}
          onMouseDown={handleResizeStart}
        >
          <div className='rbn:flex rbn:gap-1.5'>
            <span className='rbn:h-1.5 rbn:w-1.5 rbn:rounded-full rbn:bg-runner-handle-dot rbn:transition-colors rbn:group-hover/resizer:bg-primary-blue' />
            <span className='rbn:h-1.5 rbn:w-1.5 rbn:rounded-full rbn:bg-runner-handle-dot rbn:transition-colors rbn:group-hover/resizer:bg-primary-blue' />
            <span className='rbn:h-1.5 rbn:w-1.5 rbn:rounded-full rbn:bg-runner-handle-dot rbn:transition-colors rbn:group-hover/resizer:bg-primary-blue' />
          </div>
        </div>

        {/* Header row: content + drawer switchers + close button */}
        <div className='rbn:flex rbn:shrink-0 rbn:items-center'>
          <div className='rbn:min-w-0 rbn:flex-1'>{header}</div>
          {headerActions}
          <button
            type='button'
            onClick={onClose}
            className={cn(
              'btn-press rbn:mr-3 rbn:shrink-0 rbn:rounded rbn:p-1.5 rbn:text-secondary-light-gray rbn:transition-colors rbn:hover:bg-primary-dark-gray rbn:hover:text-primary-white',
              theme?.runnerPanel?.closeButton,
            )}
            title={closeTitle}
            aria-label={closeTitle}
          >
            <X className='rbn:h-4 rbn:w-4' />
          </button>
        </div>

        {/* Body — height-bound, resizable via the handle above */}
        <div
          className='rbn:relative rbn:flex rbn:min-h-0 rbn:overflow-hidden'
          style={{ height: `${contentHeight}px` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export { BottomDrawerShell };

export type { BottomDrawerShellProps };
