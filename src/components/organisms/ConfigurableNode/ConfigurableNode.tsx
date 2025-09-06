import {
  NodeResizerWithMoreControls,
  type NodeResizerWithMoreControlsProps,
} from '@/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls';
import { cn } from '@/utils';
import {
  Position,
  Handle,
  type HandleType,
  useReactFlow,
  useNodeId,
} from '@xyflow/react';
import { forwardRef, type HTMLAttributes, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Button, Input } from '@/components/atoms';
import { SliderNumberInput } from '@/components/molecules';
import { modifyInputsInNodeDataWithoutMutating } from './nodeDataManipulation';

type Input = {
  id: string;
  name: string;
  handleColor?: string;
  allowInput?: boolean;
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

type InputPanel = {
  id: string;
  name: string;
  inputs: Input[];
};

type ConfigurableNodeProps = {
  name?: string;
  headerColor?: string;
  inputs?: (Input | InputPanel)[];
  outputs?: Output[];
  isCurrentlyInsideReactFlow?: boolean;
  nodeResizerProps?: NodeResizerWithMoreControlsProps;
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

type ReactFlowAwareInputProps = {
  input: Input;
};

const ReactFlowAwareInput = ({ input }: ReactFlowAwareInputProps) => {
  const reactflowContext = useReactFlow();
  const nodeId = useNodeId();
  return input.type === 'string' ? (
    <Input
      placeholder={input.name}
      value={input.value}
      onChange={(newValue) => {
        input.onChange?.(newValue);
        reactflowContext.setNodes((nodes) =>
          nodes.map((currentNode) => {
            if (currentNode.id === nodeId) {
              return {
                ...currentNode,
                data: modifyInputsInNodeDataWithoutMutating(
                  input.id,
                  currentNode.data,
                  newValue,
                ),
              };
            }
            return currentNode;
          }),
        );
      }}
      allowOnlyNumbers={false}
      className='w-full'
    />
  ) : (
    <SliderNumberInput
      name={input.name}
      value={input.value}
      onChange={(newValue) => {
        input.onChange?.(newValue);
        reactflowContext.setNodes((nodes) =>
          nodes.map((currentNode) => {
            if (currentNode.id === nodeId) {
              return {
                ...currentNode,
                data: modifyInputsInNodeDataWithoutMutating(
                  input.id,
                  currentNode.data,
                  newValue,
                ),
              };
            }
            return currentNode;
          }),
        );
      }}
      className='w-full'
    />
  );
};

type ContextAwareInputProps = {
  input: Input;
  isCurrentlyInsideReactFlow: boolean;
};

const ContextAwareInput = ({
  input,
  isCurrentlyInsideReactFlow,
}: ContextAwareInputProps) => {
  if (isCurrentlyInsideReactFlow) {
    return <ReactFlowAwareInput input={input} />;
  }

  return input.type === 'string' ? (
    <Input
      placeholder={input.name}
      value={input.value}
      onChange={input.onChange}
      allowOnlyNumbers={false}
      className='w-full'
    />
  ) : (
    <SliderNumberInput
      name={input.name}
      value={input.value}
      onChange={input.onChange}
      className='w-full'
    />
  );
};

type RenderInputProps = {
  input: Input;
  isCurrentlyInsideReactFlow: boolean;
  hide?: boolean;
};

// Helper function to render a single input
const RenderInput = ({
  input,
  isCurrentlyInsideReactFlow,
  hide = false,
}: RenderInputProps) => {
  return (
    <div
      key={input.id}
      className={cn(
        'text-primary-white text-[27px] leading-[27px] font-main relative px-6 flex flex-row py-3',
        hide && 'h-0 overflow-hidden py-0',
        input.allowInput && 'py-1',
      )}
    >
      <ContextAwareHandle
        type='target'
        position={Position.Left}
        id={input.id}
        color={input.handleColor}
        isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
      />
      <div className='flex-1 flex items-center gap-3'>
        {!input.allowInput && <div className='truncate'>{input.name}</div>}
        {input.allowInput && (
          <div className='flex-1 w-full'>
            <ContextAwareInput
              input={input}
              isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
            />
          </div>
        )}
      </div>
    </div>
  );
};

type RenderOutputProps = {
  output: Output;
  isCurrentlyInsideReactFlow: boolean;
};

const RenderOutput = ({
  output,
  isCurrentlyInsideReactFlow,
}: RenderOutputProps) => {
  return (
    <>
      <div
        key={output.id}
        className='text-primary-white text-[27px] leading-[27px] font-main relative px-6 flex flex-row justify-end py-3'
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
    </>
  );
};

// Helper function to render a collapsible panel
type RenderInputPanelProps = {
  panel: InputPanel;
  isCurrentlyInsideReactFlow: boolean;
  isOpen: boolean;
  onToggle: () => void;
};

const RenderInputPanel = ({
  panel,
  isCurrentlyInsideReactFlow,
  isOpen,
  onToggle,
}: RenderInputPanelProps) => (
  <div key={panel.id} className='flex flex-col'>
    {/* Panel header with toggle button - same spacing as regular inputs */}
    <Button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      className='bg-transparent border-none hover:bg-primary-gray rounded-none justify-start'
    >
      {/* Arrow on the left */}
      {isOpen ? (
        <ChevronUpIcon className='w-6 h-6 flex-shrink-0 mr-2' />
      ) : (
        <ChevronDownIcon className='w-6 h-6 flex-shrink-0 mr-2' />
      )}
      <span className='truncate'>{panel.name}</span>
    </Button>

    {/* Panel content - only render if open */}
    <div
      className={cn(
        'flex flex-col bg-[#272727]',
        !isOpen && 'h-0 overflow-hidden',
      )}
    >
      {panel.inputs.map((input) => (
        <RenderInput
          key={input.id}
          input={input}
          isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
          hide={!isOpen}
        />
      ))}
    </div>
  </div>
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
      nodeResizerProps = {},
      ...props
    },
    ref,
  ) => {
    // State for panel open/close states
    const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());

    // Toggle panel open/close state
    const togglePanel = (panelId: string) => {
      setOpenPanels((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(panelId)) {
          newSet.delete(panelId);
        } else {
          newSet.add(panelId);
        }
        return newSet;
      });
    };
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
          {isCurrentlyInsideReactFlow && (
            <NodeResizerWithMoreControls {...nodeResizerProps} />
          )}
          <div className='flex flex-col py-4'>
            {outputs.map((output) => (
              <RenderOutput
                key={output.id}
                output={output}
                isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
              />
            ))}
          </div>
          <div className='flex flex-col py-4'>
            {inputs.map((input) => {
              // Check if this is a panel or a regular input
              if ('inputs' in input) {
                // This is an InputPanel
                const isOpen = openPanels.has(input.id);
                return (
                  <RenderInputPanel
                    key={input.id}
                    panel={input}
                    isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
                    isOpen={isOpen}
                    onToggle={() => togglePanel(input.id)}
                  />
                );
              } else {
                // This is a regular Input
                return (
                  <RenderInput
                    key={input.id}
                    input={input}
                    isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
                  />
                );
              }
            })}
          </div>
        </div>
      </div>
    );
  },
);

ConfigurableNode.displayName = 'ConfigurableNode';

export { ConfigurableNode };

export type { ConfigurableNodeProps, Input, Output, InputPanel };
