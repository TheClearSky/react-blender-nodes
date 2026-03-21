import { useRef, useState } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow,
  useHover,
  useInteractions,
  useDismiss,
  useTransitionStyles,
  type Placement,
} from '@floating-ui/react';

type UseFloatingTooltipOptions = {
  /** Tooltip placement relative to the reference element @default 'top' */
  placement?: Placement;
  /** Offset distance in pixels @default 10 */
  offsetPx?: number;
  /** Hover delay in ms @default { open: 150, close: 0 } */
  hoverDelay?: { open: number; close: number };
  /** Enter/exit transition duration in ms @default 150 */
  transitionDuration?: number;
  /** Whether to include an arrow element @default true */
  withArrow?: boolean;
  /** Initial transition style @default { opacity: 0, transform: 'translateY(4px)' } */
  initialTransition?: React.CSSProperties;
};

/**
 * Consolidates the common floating-ui tooltip boilerplate:
 * useFloating + useHover + useDismiss + useInteractions + useTransitionStyles + arrow.
 *
 * This pattern is repeated across NodeStatusIndicator (StatusTooltip),
 * ExecutionTimeline (BlockTooltip, TimeModeInfoTooltip), and potentially
 * future tooltip-like components.
 */
function useFloatingTooltip({
  placement = 'top',
  offsetPx = 10,
  hoverDelay = { open: 150, close: 0 },
  transitionDuration = 150,
  withArrow = true,
  initialTransition = { opacity: 0, transform: 'translateY(4px)' },
}: UseFloatingTooltipOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const arrowRef = useRef<SVGSVGElement>(null);

  const middleware = [
    offset(offsetPx),
    flip(),
    shift({ padding: 8 }),
    ...(withArrow ? [arrow({ element: arrowRef })] : []),
  ];

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware,
    whileElementsMounted: autoUpdate,
    placement,
  });

  const hover = useHover(context, { delay: hoverDelay });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    dismiss,
  ]);

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: transitionDuration,
    initial: initialTransition,
  });

  return {
    isOpen,
    setIsOpen,
    refs,
    floatingStyles,
    context,
    arrowRef,
    getReferenceProps,
    getFloatingProps,
    isMounted,
    transitionStyles,
  };
}

export { useFloatingTooltip };
export type { UseFloatingTooltipOptions };
