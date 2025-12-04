import {
  NodeResizerWithMoreControls,
  type NodeResizerWithMoreControlsProps,
} from '@/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls';
import { cn, type DataType, type SupportedUnderlyingTypes } from '@/utils';
import { Position, useNodeConnections } from '@xyflow/react';
import { forwardRef, type HTMLAttributes, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Button } from '@/components/atoms';
import {
  ContextAwareHandle,
  type HandleShape,
} from './SupportingSubcomponents/ContextAwareHandle';
import { ContextAwareInput } from './SupportingSubcomponents/ContextAwareInput';
import { ContextAwareOpenButton } from './SupportingSubcomponents/ContextAwareOpenButton';
import { z } from 'zod';

/**
 * Configuration for a node input
 *
 * Defines an input socket on a node with optional interactive input component.
 * Supports both string and number types with type-specific onChange handlers.
 */
type ConfigurableNodeInput<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = {
  /** Unique identifier for the input */
  id: string;
  /** Display name for the input */
  name: string;
  /** Color of the input handle/socket */
  handleColor?: string;
  /** Shape of the input handle (circle, square, diamond, etc.) */
  handleShape?: HandleShape;
  /** Whether to show an interactive input component when not connected */
  allowInput?: boolean;

  /** Data type of the input, used by full graph */
  dataType?: {
    dataTypeObject: DataType<UnderlyingType, ComplexSchemaType>;
    dataTypeUniqueId: DataTypeUniqueId;
  };
  /** Inferred data type of the input (only when type inference is enabled and datatype is inferredFromConnection and connected), used by full graph */
  inferredDataType?: {
    dataTypeObject: DataType<UnderlyingType, ComplexSchemaType>;
    dataTypeUniqueId: DataTypeUniqueId;
  } | null;
} & (
  | {
      /** String input type */
      type: 'string';
      /** Current value of the input */
      value?: string;
      /** Callback when the input value changes */
      onChange?: (value: string) => void;
    }
  | {
      /** Number input type */
      type: 'number';
      /** Current value of the input */
      value?: number;
      /** Callback when the input value changes */
      onChange?: (value: number) => void;
    }
);

/**
 * Configuration for a node output
 *
 * Defines an output socket on a node that can be connected to inputs.
 */
type ConfigurableNodeOutput<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = {
  /** Unique identifier for the output */
  id: string;
  /** Display name for the output */
  name: string;
  /** Color of the output handle/socket */
  handleColor?: string;
  /** Shape of the output handle (circle, square, diamond, etc.) */
  handleShape?: HandleShape;

  /** Data type of the output, used by full graph */
  dataType?: {
    dataTypeObject: DataType<UnderlyingType, ComplexSchemaType>;
    dataTypeUniqueId: DataTypeUniqueId;
  };
  /** Inferred data type of the output (only when type inference is enabled and datatype is inferredFromConnection and connected), used by full graph */
  inferredDataType?: {
    dataTypeObject: DataType<UnderlyingType, ComplexSchemaType>;
    dataTypeUniqueId: DataTypeUniqueId;
  } | null;
} & (
  | {
      /** String output type */
      type: 'string';
    }
  | {
      /** Number output type */
      type: 'number';
    }
);

/**
 * Configuration for a collapsible input panel
 *
 * Groups multiple inputs together in a collapsible panel for better organization.
 */
type ConfigurableNodeInputPanel<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = {
  /** Unique identifier for the panel */
  id: string;
  /** Display name for the panel */
  name: string;
  /** Array of inputs contained in this panel */
  inputs: ConfigurableNodeInput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >[];
};

/**
 * Props for the ConfigurableNode component
 *
 * Defines the complete configuration for a customizable node with inputs, outputs,
 * and optional panels. Supports both standalone usage and ReactFlow integration.
 */
type ConfigurableNodeProps<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = {
  /** Display name of the node */
  name?: string;
  /** Background color of the node header */
  headerColor?: string;
  /** Array of inputs and input panels */
  inputs?: (
    | ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
    | ConfigurableNodeInputPanel<
        UnderlyingType,
        ComplexSchemaType,
        DataTypeUniqueId
      >
  )[];
  /** Array of output sockets */
  outputs?: ConfigurableNodeOutput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >[];
  /** Whether the node is currently inside a ReactFlow context */
  isCurrentlyInsideReactFlow?: boolean;
  /** Props for the node resizer component */
  nodeResizerProps?: NodeResizerWithMoreControlsProps;
  /** Node type unique id */
  nodeTypeUniqueId?: NodeTypeUniqueId;
  /**
   * Whether to show the node open button (square mouse pointer icon)
   * - Used by full graph for node groups
   * @default false
   */
  showNodeOpenButton?: boolean;
} & HTMLAttributes<HTMLDivElement>;

type RenderInputProps<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = {
  input: ConfigurableNodeInput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >;
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
          shape={input.handleShape}
          isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
        />
        <div className='flex-1 flex items-center gap-3 w-full'>
          {!shouldShowInput && (
            <div className='truncate'>{input.name || '\u200B'}</div>
          )}
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

type RenderOutputProps<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = {
  output: ConfigurableNodeOutput<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >;
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
        <div className='truncate text-right'>{output.name || '\u200B'}</div>
        <ContextAwareHandle
          type='source'
          position={Position.Right}
          id={output.id}
          color={output.handleColor}
          shape={output.handleShape}
          isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
        />
      </div>
    );
  },
);

RenderOutput.displayName = 'RenderOutput';

// Helper function to render a collapsible panel
type RenderInputPanelProps<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = {
  panel: ConfigurableNodeInputPanel<
    UnderlyingType,
    ComplexSchemaType,
    DataTypeUniqueId
  >;
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

/**
 * A customizable node component inspired by Blender's node editor
 *
 * This component creates a node with configurable inputs, outputs, and collapsible panels.
 * It supports both standalone usage and ReactFlow integration with automatic handle
 * management and interactive input components.
 *
 * Features:
 * - Customizable header with color and name
 * - Dynamic inputs and outputs with custom handle shapes
 * - Collapsible input panels for organization
 * - Interactive input components (text/number) when not connected
 * - ReactFlow integration with automatic handle positioning
 * - Node resizing controls when inside ReactFlow
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the root div element
 * @returns JSX element containing the configurable node
 *
 * @example
 * ```tsx
 * // Basic node with inputs and outputs
 * <ConfigurableNode
 *   name="Data Processor"
 *   headerColor="#C44536"
 *   inputs={[
 *     {
 *       id: 'input1',
 *       name: 'Text Input',
 *       type: 'string',
 *       handleColor: '#00BFFF',
 *       handleShape: 'circle',
 *       allowInput: true,
 *     },
 *   ]}
 *   outputs={[
 *     {
 *       id: 'output1',
 *       name: 'Result',
 *       type: 'string',
 *       handleColor: '#FECA57',
 *       handleShape: 'square',
 *     },
 *   ]}
 * />
 *
 * // Node with collapsible panels
 * <ConfigurableNode
 *   name="Advanced Node"
 *   headerColor="#2D5A87"
 *   inputs={[
 *     {
 *       id: 'direct-input',
 *       name: 'Direct Input',
 *       type: 'string',
 *       allowInput: true,
 *     },
 *     {
 *       id: 'settings-panel',
 *       name: 'Settings Panel',
 *       inputs: [
 *         {
 *           id: 'threshold',
 *           name: 'Threshold',
 *           type: 'number',
 *           handleShape: 'diamond',
 *           allowInput: true,
 *         },
 *       ],
 *     },
 *   ]}
 * />
 * ```
 */
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
      nodeTypeUniqueId,
      showNodeOpenButton = false,
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
          'in-[.selected]:border-white', //in-[.selected]:text-white is handled by the parent (inside react flow)
          className,
        )}
        {...props}
        ref={ref}
      >
        <div
          className='text-primary-white text-left text-[27px] leading-[27px] font-main \
          px-4 transition-all rounded-t-md truncate flex justify-between items-center'
          style={{
            backgroundColor: headerColor,
          }}
        >
          <p className='truncate py-2'>{name}</p>
          <ContextAwareOpenButton
            showButton={showNodeOpenButton}
            isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
          />
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
