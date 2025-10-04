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
import { useEffect } from 'react';
import { ContextMenu } from '../../molecules/ContextMenu/ContextMenu';
import type { createNodeContextMenu } from '../../molecules/ContextMenu/createNodeContextMenu';

type FullGraphContextMenuProps = {
  isOpen: boolean;
  position: XYPosition;
  onClose: () => void;
  subItems: ReturnType<typeof createNodeContextMenu>;
};

const FullGraphContextMenu = ({
  isOpen,
  position,
  onClose,
  subItems,
}: FullGraphContextMenuProps) => {
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) {
        onClose();
      }
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }
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
    } as unknown as Element);
  }, [isOpen, position, refs]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={refs.setFloating}
      style={{
        ...floatingStyles,
        contain: 'layout',
        willChange: 'transform',
      }}
      className='z-50'
      onClick={(e) => e.stopPropagation()}
      {...getFloatingProps()}
    >
      <ContextMenu subItems={subItems} />
    </div>
  );
};

export { FullGraphContextMenu };
export type { FullGraphContextMenuProps };
