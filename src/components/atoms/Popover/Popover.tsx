import { useState, type ReactNode } from 'react';
import {
  useFloating,
  useClick,
  useDismiss,
  useInteractions,
  useTransitionStyles,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';
import { cn } from '@/utils/cnHelper';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

type PopoverProps = {
  /** Content rendered inside the trigger button (typically an icon). */
  trigger: ReactNode;
  /** Accessible label for the trigger button. */
  triggerLabel: string;
  /** Popover body. */
  children: ReactNode;
  /**
   * Floating placement. Defaults to `top-end` because the runner panel is
   * anchored to the viewport bottom, so its overflow menus must open UPWARD.
   */
  placement?: Placement;
  /** Classes merged onto the trigger button. */
  triggerClassName?: string;
  /** Classes merged onto the floating content surface. */
  contentClassName?: string;
};

/**
 * The CSS `transform-origin` for a scale-in animation: the edge the popover is
 * anchored to, which is OPPOSITE its placement side (a `top` popover sits above
 * its reference, so it grows from its `bottom`).
 */
function transformOriginForPlacement(placement: Placement): string {
  const side = placement.split('-')[0];
  if (side === 'top') return 'bottom';
  if (side === 'bottom') return 'top';
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  return 'center';
}

/**
 * Internal generic popover built on `@floating-ui/react` (same mechanics as
 * `PopoverColorPicker`, sibling primitive to `atoms/Tooltip`). Kept OUT of the
 * public atoms barrel — internal use only. Consumers: the runner toolbars' `⋯`
 * overflow menus (open upward, the default `top-end`) and the node input
 * connection-order badge (`InputConnectionOrderControl`, opens `left-start`).
 * `FloatingPortal` escapes the panel's `overflow-hidden`; `useDismiss` only
 * closes on a press OUTSIDE the reference/floating elements, so interacting with
 * controls inside the menu (slider drag, radio click, reorder drag) does NOT
 * dismiss it. The open animation grows from the anchored edge — `transformOrigin`
 * is derived from the resolved placement, so it is correct whichever way the
 * popover (or a `flip()`) opens.
 */
function Popover({
  trigger,
  triggerLabel,
  children,
  placement = 'top-end',
  triggerClassName,
  contentClassName,
}: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useGraphTheme();

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ]);

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: 150,
    initial: { opacity: 0, transform: 'scale(0.95)' },
    // Grow from the anchored edge (opposite the resolved placement side) so the
    // scale-in is correct for an upward (`top-*`), downward, or sideways
    // (`left-*`, the connection-order badge) popover — and after a `flip()`.
    common: { transformOrigin: transformOriginForPlacement(context.placement) },
  });

  return (
    <>
      <button
        ref={refs.setReference}
        type='button'
        aria-label={triggerLabel}
        {...getReferenceProps()}
        className={cn(
          'btn-press flex shrink-0 items-center justify-center rounded p-1.5 text-secondary-light-gray transition-colors hover:bg-primary-dark-gray hover:text-primary-white',
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {isMounted && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 50 }}
            {...getFloatingProps()}
          >
            <div
              data-slot='popover'
              style={transitionStyles}
              className={cn(
                'flex min-w-[200px] flex-col gap-2 rounded-lg border border-secondary-dark-gray bg-graph-elevated-surface-bg p-2 shadow-lg',
                theme?.popover?.surface,
                contentClassName,
              )}
            >
              {children}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

export { Popover };
export type { PopoverProps };
