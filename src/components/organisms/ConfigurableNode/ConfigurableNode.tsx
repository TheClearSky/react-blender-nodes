import {
  NodeResizerWithMoreControls,
  type NodeResizerWithMoreControlsProps,
} from '@/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls';
import { cn, type DataType, type SupportedUnderlyingTypes } from '@/utils';
import { Position, useNodeConnections } from '@xyflow/react';
import { forwardRef, type HTMLAttributes, useContext, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Button } from '@/components/atoms';
import {
  ContextAwareHandle,
  type HandleShape,
} from './SupportingSubcomponents/ContextAwareHandle';
import { ContextAwareInput } from './SupportingSubcomponents/ContextAwareInput';
import {
  ContextAwareNodeHeaderActions,
  type NodeHeaderActionDefinition,
} from './SupportingSubcomponents/ContextAwareNodeHeaderActions';
import { isLoopNode } from '@/utils/nodeStateManagement/nodes/loops/loopIdentification';
import { isSwitchNode } from '@/utils/nodeStateManagement/nodes/switches/switchIdentification';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';
import { Pencil, SquareMousePointerIcon } from 'lucide-react';
import { z } from 'zod';
import { FullGraphContext } from '../FullGraph/FullGraphState';
import type { NodeVisualState, GraphError } from '@/utils/nodeRunner/types';
import { NodeStatusIndicator } from '@/components/atoms/NodeStatusIndicator/NodeStatusIndicator';
import { useGraphTheme } from '../FullGraph/GraphThemeContext';

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
  /** Maximum number of connections for this input */
  maxConnections?: number;

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
      /** When set, renders a select dropdown instead of a free-text input */
      allowedStrings?: readonly string[];
    }
  | {
      /** Number input type */
      type: 'number';
      /** Current value of the input */
      value?: number;
      /** Callback when the input value changes */
      onChange?: (value: number) => void;
    }
  | {
      /**  */
      type: 'boolean';
      /** Current value of the input */
      value?: boolean;
      /** Callback when the input value changes */
      onChange?: (value: boolean) => void;
    }
  | {
      /** Unsupported input type */
      type: 'unsupportedDirectly';
      /** Current value of the input */
      value?: unknown;
      /** Callback when the input value changes */
      onChange?: (value: unknown) => void;
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
  /** Maximum number of connections for this output */
  maxConnections?: number;

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
  | {
      /** Boolean output type */
      type: 'boolean';
    }
  | {
      /** Unsupported output type */
      type: 'unsupportedDirectly';
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
  /** Unique identifier for the node, for debugging when enableDebugMode is true and inside react flow */
  id?: string;
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
  /** Runner visual state for this node (undefined = no runner overlay) */
  runnerVisualState?: NodeVisualState;
  /** Errors from the runner for this node */
  runnerErrors?: ReadonlyArray<GraphError>;
  /** Warnings from the runner for this node (e.g., missing implementation) */
  runnerWarnings?: ReadonlyArray<string>;
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
const RenderInputView = forwardRef<
  HTMLDivElement,
  RenderInputProps & { isConnected: boolean }
>(({ input, isCurrentlyInsideReactFlow, hide = false, isConnected }, ref) => {
  const theme = useGraphTheme();
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
        theme?.node?.inputRow,
      )}
    >
      <ContextAwareHandle
        type='target'
        position={Position.Left}
        id={input.id}
        color={input.handleColor}
        shape={input.handleShape}
        maxConnections={input.maxConnections}
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
});

RenderInputView.displayName = 'RenderInputView';

// Inside ReactFlow: subscribe to this input handle's connections so a wired input
// hides its editor. Isolated so useNodeConnections is never called conditionally.
const ConnectedRenderInput = forwardRef<HTMLDivElement, RenderInputProps>(
  (props, ref) => {
    const connections = useNodeConnections({ handleId: props.input.id });
    const isConnected = connections.some(
      (connection) => connection.targetHandle === props.input.id,
    );
    return <RenderInputView ref={ref} {...props} isConnected={isConnected} />;
  },
);

ConnectedRenderInput.displayName = 'ConnectedRenderInput';

const RenderInput = forwardRef<HTMLDivElement, RenderInputProps>(
  (props, ref) => {
    // useNodeConnections requires the ReactFlow provider and throws without it,
    // so only the in-ReactFlow variant calls it (via ConnectedRenderInput).
    return props.isCurrentlyInsideReactFlow ? (
      <ConnectedRenderInput ref={ref} {...props} />
    ) : (
      <RenderInputView ref={ref} {...props} isConnected={false} />
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
    const theme = useGraphTheme();
    return (
      <div
        key={output.id}
        ref={ref}
        className={cn(
          'text-primary-white text-[27px] leading-[27px] font-main relative px-6 flex flex-row justify-end py-3',
          theme?.node?.outputRow,
        )}
      >
        <div className='truncate text-right'>{output.name || '\u200B'}</div>
        <ContextAwareHandle
          type='source'
          position={Position.Right}
          id={output.id}
          color={output.handleColor}
          shape={output.handleShape}
          maxConnections={output.maxConnections}
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
  ({ panel, isCurrentlyInsideReactFlow, isOpen, onToggle }, ref) => {
    const theme = useGraphTheme();
    return (
      <div key={panel.id} ref={ref} className='flex flex-col'>
        {/* Panel header with toggle button - same spacing as regular inputs */}
        <Button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onToggle();
          }}
          className={cn(
            'bg-transparent border-none hover:bg-primary-gray rounded-none justify-start',
            theme?.node?.panelHeader,
          )}
        >
          {/* Arrow on the left */}
          {isOpen ? (
            <ChevronUpIcon className='w-6 h-6 shrink-0 mr-2' />
          ) : (
            <ChevronDownIcon className='w-6 h-6 shrink-0 mr-2' />
          )}
          <span className='truncate'>{panel.name}</span>
        </Button>

        {/* Panel content - only render if open */}
        <div
          className={cn(
            'flex flex-col bg-node-panel-content-bg',
            !isOpen && 'h-0 overflow-hidden',
            theme?.node?.panelContent,
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
  },
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
      id,
      name = 'Node',
      headerColor = '#79461D',
      inputs = [],
      outputs = [],
      isCurrentlyInsideReactFlow = false,
      className,
      nodeResizerProps = {},
      nodeTypeUniqueId,
      runnerVisualState,
      runnerErrors,
      runnerWarnings,
      ...props
    },
    ref,
  ) => {
    // State for panel open/close states
    const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());

    const fullGraphContext = useContext(FullGraphContext);
    const theme = useGraphTheme();

    const hasSubtree =
      !!nodeTypeUniqueId &&
      !!fullGraphContext?.allProps?.state?.typeOfNodes?.[nodeTypeUniqueId]
        ?.subtree;

    const headerActions: NodeHeaderActionDefinition[] = [];

    if (nodeTypeUniqueId && isLoopNode(nodeTypeUniqueId)) {
      headerActions.push({
        id: 'edit-loop',
        icon: Pencil,
        action: {
          type: actionTypesMap.OPEN_DRAWER,
          payload: { activeDrawer: { type: 'editLoop', nodeId: id ?? '' } },
        },
      });
    }

    if (nodeTypeUniqueId && isSwitchNode(nodeTypeUniqueId)) {
      headerActions.push({
        id: 'edit-switch',
        icon: Pencil,
        action: {
          type: actionTypesMap.OPEN_DRAWER,
          payload: { activeDrawer: { type: 'editSwitch', nodeId: id ?? '' } },
        },
      });
    }

    if (hasSubtree) {
      headerActions.push({
        id: 'edit-node-type',
        icon: Pencil,
        action: {
          type: actionTypesMap.OPEN_DRAWER,
          payload: {
            activeDrawer: {
              type: 'editNodeType',
              nodeTypeId: nodeTypeUniqueId,
            },
          },
        },
      });
      headerActions.push({
        id: 'open-node-group',
        icon: SquareMousePointerIcon,
        iconClassName:
          'shrink-0 w-7 h-7 aspect-square cursor-pointer hover:opacity-80',
        action: {
          type: actionTypesMap.OPEN_NODE_GROUP,
          payload: { nodeId: id ?? '' },
        },
      });
    }

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
    const nodeContent = (
      <div
        tabIndex={0}
        className={cn(
          'flex flex-col gap-0 rounded-md w-max border-[1.5px] border-transparent focus:border-white',
          'in-[.selected]:border-white', //in-[.selected]:text-white is handled by the parent (inside react flow)
          theme?.node?.container,
          className,
        )}
        {...props}
        ref={ref}
      >
        <div
          className={cn(
            'text-primary-white text-left text-[27px] leading-[27px] font-main px-4 transition-all rounded-t-md truncate flex justify-between items-center',
            theme?.node?.header,
          )}
          style={{
            backgroundColor: headerColor,
          }}
        >
          <p className={cn('truncate py-2', theme?.node?.headerTitle)}>
            {name}
          </p>
          {fullGraphContext?.allProps?.state?.enableDebugMode && (
            <p className='shrink-0 py-2'>{id}</p>
          )}
          <div className='ml-auto flex items-center gap-3'>
            <ContextAwareNodeHeaderActions
              actions={headerActions}
              isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
            />
          </div>
        </div>
        <div
          className={cn(
            'min-h-[50px] rounded-b-md bg-primary-dark-gray',
            theme?.node?.body,
          )}
        >
          {isCurrentlyInsideReactFlow && (
            <NodeResizerWithMoreControls {...nodeResizerProps} />
          )}
          <div
            className={cn('flex flex-col py-4', theme?.node?.outputsSection)}
          >
            {outputs.map((output) => (
              <RenderOutput
                key={output.id}
                output={output}
                isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
              />
            ))}
          </div>
          <div className={cn('flex flex-col py-4', theme?.node?.inputsSection)}>
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

    // Wrap with status indicator when runner state is present
    if (runnerVisualState !== undefined) {
      return (
        <NodeStatusIndicator
          visualState={runnerVisualState}
          errors={runnerErrors}
          warnings={runnerWarnings}
        >
          {nodeContent}
        </NodeStatusIndicator>
      );
    }

    return nodeContent;
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
