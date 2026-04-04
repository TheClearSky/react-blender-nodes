import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type CSSProperties,
  type ComponentType,
  type HTMLAttributes,
} from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow,
  useTransitionStyles,
  FloatingPortal,
  FloatingArrow,
  type Placement,
} from '@floating-ui/react';
import { Info } from 'lucide-react';
import { cn } from '@/utils';

// ─────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────

type TooltipProps = {
  /** Tooltip content — string or ReactNode */
  content: ReactNode;
  /** Trigger element(s) */
  children: ReactNode;
  /** Show an ⓘ icon next to the trigger @default false */
  infoIcon?: boolean;
  /** Tooltip placement @default 'bottom' */
  placement?: Placement;
  /** Max width of the tooltip @default 240 */
  maxWidth?: number;
  /** Additional className for the trigger wrapper */
  className?: string;
  /** Inline style for the trigger wrapper (useful for absolute positioning) */
  style?: CSSProperties;
  /** Render the wrapper as a different element @default 'span' */
  as?: 'span' | 'div' | ComponentType<HTMLAttributes<HTMLElement>>;
  /** Extra props forwarded to the trigger wrapper (e.g. data-*, onClick) */
  triggerProps?: HTMLAttributes<HTMLElement>;
};

// ─────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────

function Tooltip({
  content,
  children,
  infoIcon = false,
  placement = 'bottom',
  maxWidth = 240,
  className,
  style,
  as: Tag = 'span',
  triggerProps,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const arrowRef = useRef<SVGSVGElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(6),
      flip(),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: autoUpdate,
    placement,
  });

  useEffect(() => {
    if (triggerRef.current) refs.setPositionReference(triggerRef.current);
  }, [refs]);

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: 120,
    initial: { opacity: 0, transform: 'translateY(-3px)' },
  });

  return (
    <>
      <Tag
        ref={triggerRef as never}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className={cn('inline-flex items-center gap-1.5', className)}
        style={style}
        {...triggerProps}
      >
        {infoIcon && (
          <Info className='h-3.5 w-3.5 shrink-0 text-primary-white' />
        )}
        {children}
      </Tag>
      {isMounted && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, pointerEvents: 'none', zIndex: 50 }}
          >
            <div
              style={{ ...transitionStyles, maxWidth: `${maxWidth}px` }}
              className='rounded-md border-[1.25px] border-primary-white/60 bg-tooltip-bg px-3 py-2 text-[12px] text-primary-white shadow-2xl backdrop-blur-sm'
            >
              {content}
              <FloatingArrow
                ref={arrowRef}
                context={context}
                width={8}
                height={4}
                fill='var(--color-tooltip-bg)'
                strokeWidth={1}
                stroke='var(--color-secondary-dark-gray)'
              />
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

export { Tooltip };
export type { TooltipProps };
