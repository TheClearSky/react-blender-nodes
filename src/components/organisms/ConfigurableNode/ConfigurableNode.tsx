import { NodeResizerWithMoreControls } from '@/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls';
import { cn } from '@/utils';
import { Position, Handle, type HandleType } from '@xyflow/react';
import { forwardRef, type HTMLAttributes } from 'react';

type Input = {
  id: string;
  name: string;
  handleColor?: string;
} & (
  | {
      type: 'string';
      value?: string;
      onChange?: (value: string) => void;
    }
  | {
      type: 'number';
      value?: number;
      onChange?: (value: number) => void;
    }
);
type Output = {
  id: string;
  name: string;
  handleColor?: string;
} & (
  | {
      type: 'string';
    }
  | {
      type: 'number';
    }
);

type ConfigurableNodeProps = {
  name?: string;
  headerColor?: string;
  inputs?: Input[];
  outputs?: Output[];
  isCurrentlyInsideReactFlow?: boolean;
} & HTMLAttributes<HTMLDivElement>;

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

const ConfigurableNode = forwardRef<HTMLDivElement, ConfigurableNodeProps>(
  (
    {
      name = 'Node',
      headerColor = '#79461D',
      inputs = [],
      outputs = [],
      isCurrentlyInsideReactFlow = false,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        tabIndex={0}
        className={cn(
          'flex flex-col gap-0 rounded-md w-max border-[1.5px] border-transparent focus:border-white',
          className,
        )}
        {...props}
        ref={ref}
      >
        <div
          className='text-primary-white text-left text-[27px] leading-[27px] font-main \
          py-2 px-4 transition-all rounded-t-md truncate'
          style={{
            backgroundColor: headerColor,
          }}
        >
          {name}
        </div>
        <div className='min-h-[50px] rounded-b-md bg-primary-dark-gray'>
          {isCurrentlyInsideReactFlow && <NodeResizerWithMoreControls />}
          <div className='flex flex-col gap-6 py-4'>
            {outputs.map((output) => (
              <div
                key={output.id}
                className='text-primary-white text-[27px] leading-[27px] font-main relative px-6 flex flex-row justify-end'
              >
                <div className='truncate text-right'>{output.name}</div>
                <ContextAwareHandle
                  type='source'
                  position={Position.Right}
                  id={output.id}
                  color={output.handleColor}
                  isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
                />
              </div>
            ))}
          </div>
          <div className='flex flex-col gap-6 py-4'>
            {inputs.map((input) => (
              <div
                key={input.id}
                className='text-primary-white text-[27px] leading-[27px] font-main relative px-6 flex flex-row'
              >
                <ContextAwareHandle
                  type='target'
                  position={Position.Left}
                  id={input.id}
                  color={input.handleColor}
                  isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
                />
                <div className='truncate'>{input.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
);

ConfigurableNode.displayName = 'ConfigurableNode';

export { ConfigurableNode };

export type { ConfigurableNodeProps };
