import { cn } from '@/utils';
import { Position, Handle, type HandleType } from '@xyflow/react';
import { forwardRef, type HTMLAttributes } from 'react';

type ContextAwareHandleProps = {
  type: HandleType;
  position: Position;
  id: string;
  color?: string;
  isCurrentlyInsideReactFlow?: boolean;
} & HTMLAttributes<HTMLDivElement>;

const ContextAwareHandle = forwardRef<HTMLDivElement, ContextAwareHandleProps>(
  (
    {
      type,
      position,
      id,
      color,
      isCurrentlyInsideReactFlow = false,
      className,
      ...props
    },
    ref,
  ) => {
    if (isCurrentlyInsideReactFlow) {
      return (
        <Handle
          type={type}
          position={position}
          id={id}
          className={cn('!w-6 !h-6 !border-2 !border-black', className)}
          style={{
            backgroundColor: color || '#A1A1A1',
          }}
          {...props}
          ref={ref}
        />
      );
    }
    return (
      <div
        className={cn(
          'w-6 h-6 border-2 border-black rounded-full absolute',
          position === Position.Right &&
            'right-0 top-1/2 -translate-y-1/2 translate-x-1/2',
          position === Position.Left &&
            'left-0 top-1/2 -translate-y-1/2 -translate-x-1/2',
          className,
        )}
        style={{
          backgroundColor: color || '#A1A1A1',
        }}
        {...props}
        ref={ref}
      />
    );
  },
);

ContextAwareHandle.displayName = 'ContextAwareHandle';

export { ContextAwareHandle };
export type { ContextAwareHandleProps };
