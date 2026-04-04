import {
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react';
import { type XYPosition } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import {
  ContextMenu,
  type ContextMenuItem,
} from '../../molecules/ContextMenu/ContextMenu';
import { cn } from '@/utils';

type FullGraphContextMenuProps = {
  isOpen: boolean;
  position: XYPosition;
  onClose: () => void;
  items: ContextMenuItem[];
};

const ANIMATION_DURATION = 150;

const FullGraphContextMenu = ({
  isOpen,
  position,
  onClose,
  items,
}: FullGraphContextMenuProps) => {
  // Track mounted state separately so the element stays in DOM during exit fade
  const [isMounted, setIsMounted] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isOpen) {
      setIsMounted(true);
    } else if (isMounted) {
      // Delay unmount to let the fade-out finish
      timeoutRef.current = setTimeout(
        () => setIsMounted(false),
        ANIMATION_DURATION,
      );
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isOpen]);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
    placement: 'bottom-start',
    middleware: [
      offset(5),
      flip({ fallbackPlacements: ['top-start'] }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);

  // Only update the virtual reference when the menu opens at a new position.
  // Ignore position resets (e.g. to {0,0}) during fade-out so the menu stays anchored.
  useEffect(() => {
    if (!isOpen) return;
    refs.setReference({
      getBoundingClientRect: () => ({
        x: position.x,
        y: position.y,
        width: 1,
        height: 1,
        top: position.y,
        right: position.x + 1,
        bottom: position.y + 1,
        left: position.x,
      }),
    });
  }, [isOpen, position, refs]);

  if (!isMounted) {
    return null;
  }

  return (
    <div
      ref={refs.setFloating}
      style={{
        ...floatingStyles,
        contain: 'layout',
      }}
      className={cn(
        'z-50 transition-opacity ease-out',
        isOpen ? 'opacity-100 duration-100' : 'opacity-0 duration-150',
      )}
      onClick={(e) => e.stopPropagation()}
      {...getFloatingProps()}
    >
      <ContextMenu subItems={items} />
    </div>
  );
};

export { FullGraphContextMenu };
export type { FullGraphContextMenuProps };
