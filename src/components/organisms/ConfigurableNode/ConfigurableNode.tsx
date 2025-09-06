import {
  NodeResizerWithMoreControls,
  type NodeResizerWithMoreControlsProps,
} from '@/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls';
import { cn } from '@/utils';
import { Position, useNodeConnections } from '@xyflow/react';
import { forwardRef, type HTMLAttributes, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Button } from '@/components/atoms';
import { ContextAwareHandle } from './ContextAwareHandle';
import { ContextAwareInput } from './ContextAwareInput';

type ConfigurableNodeInput = {
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
type ConfigurableNodeOutput = {
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

type ConfigurableNodeInputPanel = {
  id: string;
  name: string;
  inputs: ConfigurableNodeInput[];
};

type ConfigurableNodeProps = {
  name?: string;
  headerColor?: string;
  inputs?: (ConfigurableNodeInput | ConfigurableNodeInputPanel)[];
  outputs?: ConfigurableNodeOutput[];
  isCurrentlyInsideReactFlow?: boolean;
  nodeResizerProps?: NodeResizerWithMoreControlsProps;
} & HTMLAttributes<HTMLDivElement>;

type RenderInputProps = {
  input: ConfigurableNodeInput;
  isCurrentlyInsideReactFlow: boolean;
  hide?: boolean;
};

// Helper function to render a single input
const RenderInput = forwardRef<HTMLDivElement, RenderInputProps>(
  ({ input, isCurrentlyInsideReactFlow, hide = false }, ref) => {
    // Check if this input is connected (only when inside ReactFlow)
    const connections = isCurrentlyInsideReactFlow
      ? useNodeConnections({
          handleId: input.id,
        })
      : [];
    const isConnected =
      isCurrentlyInsideReactFlow &&
      connections.some((connection) => connection.targetHandle === input.id);

    // Determine if we should show the input component or just the label
    const shouldShowInput = input.allowInput && !isConnected;

    return (
      <div
        key={input.id}
        ref={ref}
        className={cn(
          'text-primary-white text-[27px] leading-[27px] font-main relative px-6 flex flex-row py-3',
          hide && 'h-0 overflow-hidden py-0',
          shouldShowInput && 'py-1',
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
          {!shouldShowInput && <div className='truncate'>{input.name}</div>}
          {shouldShowInput && (
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
  },
);

RenderInput.displayName = 'RenderInput';

type RenderOutputProps = {
  output: ConfigurableNodeOutput;
  isCurrentlyInsideReactFlow: boolean;
};

const RenderOutput = forwardRef<HTMLDivElement, RenderOutputProps>(
  ({ output, isCurrentlyInsideReactFlow }, ref) => {
    return (
      <div
        key={output.id}
        ref={ref}
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
    );
  },
);

RenderOutput.displayName = 'RenderOutput';

// Helper function to render a collapsible panel
type RenderInputPanelProps = {
  panel: ConfigurableNodeInputPanel;
  isCurrentlyInsideReactFlow: boolean;
  isOpen: boolean;
  onToggle: () => void;
};

const RenderInputPanel = forwardRef<HTMLDivElement, RenderInputPanelProps>(
  ({ panel, isCurrentlyInsideReactFlow, isOpen, onToggle }, ref) => (
    <div key={panel.id} ref={ref} className='flex flex-col'>
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
  ),
);

RenderInputPanel.displayName = 'RenderInputPanel';

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

export type {
  ConfigurableNodeProps,
  ConfigurableNodeInput,
  ConfigurableNodeOutput,
  ConfigurableNodeInputPanel,
};
