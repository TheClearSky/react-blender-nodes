import {
  NodeResizerWithMoreControls,
  type NodeResizerWithMoreControlsProps,
} from '@/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls';
import { cn, type DataType, type SupportedUnderlyingTypes } from '@/utils';
import { Position, useNodeConnections } from '@xyflow/react';
import {
  forwardRef,
  type HTMLAttributes,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Button } from '@/components/atoms';
import {
  ContextAwareHandle,
  type HandleShape,
} from './SupportingSubcomponents/ContextAwareHandle';
import { ContextAwareInput } from './SupportingSubcomponents/ContextAwareInput';
import {
  liveHandleColor,
  liveHandleShape,
} from '@/utils/nodeStateManagement/handles/liveHandleVisual';
import { InputConnectionOrderControl } from './SupportingSubcomponents/InputConnectionOrderControl';
import { EditableNodeTitle } from './SupportingSubcomponents/EditableNodeTitle';
import { InfoHint } from '../../atoms/InfoHint/InfoHint';
import {
  buildSocketDocs,
  socketDocKey,
  SocketDocsContext,
} from './SupportingSubcomponents/socketDocs';
import {
  ContextAwareNodeHeaderActions,
  type NodeHeaderActionDefinition,
} from './SupportingSubcomponents/ContextAwareNodeHeaderActions';
import { NodePreviewPanel } from './SupportingSubcomponents/NodePreviewPanel';
import { isLoopNode } from '@/utils/nodeStateManagement/nodes/loops/loopIdentification';
import { isSwitchNode } from '@/utils/nodeStateManagement/nodes/switches/switchIdentification';
import { isGroupInputOrOutputNode } from '@/utils/nodeStateManagement/nodes/nodeGroups';
import { standardNodeTypeNamesMap } from '@/utils/nodeStateManagement/standardNodes';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';
import { Pencil, SquareMousePointerIcon, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { FullGraphContext } from '../FullGraph/FullGraphState';
import { useNodePreviewRegistry } from '../FullGraph/NodePreviewRegistryContext';
import type { NodeVisualState, GraphError } from '@/utils/nodeRunner/types';
import { NodeStatusIndicator } from '@/components/atoms/NodeStatusIndicator/NodeStatusIndicator';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

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
  /** Optional user-chosen instance name shown over the type name (standard nodes
   *  only; absent = show the type name). */
  customName?: string;
  /** Whether this node instance's preview panel is collapsed (persisted on
   *  `node.data`; absent = expanded). Only rendered when a `nodePreviews`
   *  component is registered for this node type. */
  previewCollapsed?: boolean;
  /** This node's own in-app description (loops carry theirs here), shown
   *  behind the title's ⓘ ahead of its node type's description. */
  description?: string;
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
  const socketDocs = useContext(SocketDocsContext);
  const socketDescription = socketDocs.get(
    socketDocKey('in', input.name, input.dataType?.dataTypeUniqueId),
  )?.description;
  // Determine if we should show the input component or just the label
  const shouldShowInput = input.allowInput && !isConnected;

  return (
    <div
      ref={ref}
      className={cn(
        'rbn:group/socket rbn:text-primary-white rbn:text-[27px] rbn:leading-[27px] rbn:font-main rbn:relative rbn:px-6 rbn:flex rbn:flex-row rbn:py-3',
        hide && 'rbn:h-0 rbn:overflow-hidden rbn:py-0',
        shouldShowInput && 'rbn:py-1',
        theme?.node?.inputRow,
      )}
    >
      <ContextAwareHandle
        type='target'
        position={Position.Left}
        id={input.id}
        color={liveHandleColor(input)}
        shape={liveHandleShape(input)}
        maxConnections={input.maxConnections}
        isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
      />
      <div className='rbn:flex-1 rbn:flex rbn:items-center rbn:gap-3 rbn:w-full'>
        {/* Fan-in reorder badges (self-hides for <2 connections; RF-only). */}
        {isCurrentlyInsideReactFlow && (
          <InputConnectionOrderControl handleId={input.id} />
        )}
        {!shouldShowInput && (
          <div className='rbn:truncate'>{input.name || '\u200B'}</div>
        )}
        {shouldShowInput && (
          <div className='rbn:flex-1 rbn:w-full'>
            <ContextAwareInput
              input={input}
              isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
            />
          </div>
        )}
        {socketDescription && (
          <InfoHint
            text={socketDescription}
            label={`About ${input.name}`}
            className='rbn:hidden rbn:group-hover/socket:inline-flex rbn:group-focus-within/socket:inline-flex'
          />
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
    const socketDocs = useContext(SocketDocsContext);
    const socketDescription = socketDocs.get(
      socketDocKey('out', output.name, output.dataType?.dataTypeUniqueId),
    )?.description;
    return (
      <div
        ref={ref}
        className={cn(
          'rbn:group/socket rbn:text-primary-white rbn:text-[27px] rbn:leading-[27px] rbn:font-main rbn:relative rbn:px-6 rbn:flex rbn:flex-row rbn:items-center rbn:justify-end rbn:gap-3 rbn:py-3',
          theme?.node?.outputRow,
        )}
      >
        {socketDescription && (
          <InfoHint
            text={socketDescription}
            label={`About ${output.name}`}
            className='rbn:hidden rbn:group-hover/socket:inline-flex rbn:group-focus-within/socket:inline-flex'
          />
        )}
        <div className='rbn:truncate rbn:text-right'>
          {output.name || '\u200B'}
        </div>
        <ContextAwareHandle
          type='source'
          position={Position.Right}
          id={output.id}
          color={liveHandleColor(output)}
          shape={liveHandleShape(output)}
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
      <div ref={ref} className='rbn:flex rbn:flex-col'>
        {/* Panel header with toggle button - same spacing as regular inputs */}
        <Button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onToggle();
          }}
          className={cn(
            'rbn:bg-transparent rbn:border-none rbn:hover:bg-primary-gray rbn:rounded-none rbn:justify-start',
            theme?.node?.panelHeader,
          )}
        >
          {/* Arrow on the left */}
          {isOpen ? (
            <ChevronUpIcon className='rbn:w-6 rbn:h-6 rbn:shrink-0 rbn:mr-2' />
          ) : (
            <ChevronDownIcon className='rbn:w-6 rbn:h-6 rbn:shrink-0 rbn:mr-2' />
          )}
          <span className='rbn:truncate'>{panel.name}</span>
        </Button>

        {/* Panel content - only render if open */}
        <div
          className={cn(
            'rbn:flex rbn:flex-col rbn:bg-graph-node-panel-content-bg',
            !isOpen && 'rbn:h-0 rbn:overflow-hidden',
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
      customName,
      previewCollapsed,
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
      description,
      ...props
    },
    ref,
  ) => {
    // State for panel open/close states
    const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());

    const fullGraphContext = useContext(FullGraphContext);
    const theme = useGraphTheme();
    const nodePreviewRegistry = useNodePreviewRegistry();

    const hasSubtree =
      !!nodeTypeUniqueId &&
      !!fullGraphContext?.allProps?.state?.typeOfNodes?.[nodeTypeUniqueId]
        ?.subtree;

    // In-app docs, read LIVE from the node type (never copied onto the
    // instance), so editing a type's docs updates every node of it at once.
    const typeOfThisNode = nodeTypeUniqueId
      ? fullGraphContext?.allProps?.state?.typeOfNodes?.[nodeTypeUniqueId]
      : undefined;
    const socketDocs = useMemo(
      () => buildSocketDocs(typeOfThisNode),
      [typeOfThisNode],
    );
    // The node's own description (loops carry theirs) wins over its type's.
    const rawDescription = description ?? typeOfThisNode?.description;
    const nodeDescription =
      typeof rawDescription === 'string' && rawDescription.trim() !== ''
        ? rawDescription
        : undefined;

    // Custom names are for STANDARD nodes only — system/structural nodes (graph &
    // group I/O, loops, switches, groups) are excluded. The same predicate gates the
    // rename affordance AND the display (a system node never shows a custom name).
    const supportsCustomName =
      !!nodeTypeUniqueId &&
      !isGroupInputOrOutputNode(nodeTypeUniqueId) &&
      !isLoopNode(nodeTypeUniqueId) &&
      !isSwitchNode(nodeTypeUniqueId) &&
      !hasSubtree;
    const isCustomNameEditable =
      isCurrentlyInsideReactFlow && supportsCustomName;
    const dispatch = fullGraphContext?.allProps?.dispatch;
    const handleCustomNameCommit = useCallback(
      (newName: string | undefined) => {
        if (!dispatch || !id) return;
        dispatch({
          type: actionTypesMap.UPDATE_NODE_CUSTOM_NAME,
          payload: { nodeId: id, customName: newName },
        });
      },
      [dispatch, id],
    );

    const headerActions: NodeHeaderActionDefinition[] = [];

    // Root Graph Input / Output nodes (the graph's I/O boundary) get an edit
    // button that opens the Graph I/O editor. The SAME node types inside a
    // group are the group's boundary — edited via the group's node-type editor
    // — so the button is gated on root scope.
    if (
      nodeTypeUniqueId &&
      isGroupInputOrOutputNode(nodeTypeUniqueId) &&
      fullGraphContext?.allProps?.isAtRootScope
    ) {
      const isGraphInput =
        nodeTypeUniqueId === standardNodeTypeNamesMap.groupInput;
      headerActions.push({
        id: 'edit-graph-io',
        label: 'Edit graph I/O',
        icon: Pencil,
        action: {
          type: actionTypesMap.OPEN_DRAWER,
          payload: {
            activeDrawer: {
              type: isGraphInput ? 'editGraphInput' : 'editGraphOutput',
              nodeId: id ?? '',
            },
          },
        },
      });
    }

    // At root, the boundary nodes ARE the graph's I/O — display them as
    // "Graph Input"/"Graph Output" rather than their type name ("Group Input").
    const displayName =
      nodeTypeUniqueId &&
      isGroupInputOrOutputNode(nodeTypeUniqueId) &&
      fullGraphContext?.allProps?.isAtRootScope
        ? nodeTypeUniqueId === standardNodeTypeNamesMap.groupInput
          ? 'Graph Input'
          : 'Graph Output'
        : name;

    if (nodeTypeUniqueId && isLoopNode(nodeTypeUniqueId)) {
      headerActions.push({
        id: 'edit-loop',
        label: 'Edit loop',
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
        label: 'Edit switch',
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
        label: 'Edit node type',
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
        label: 'Open node group',
        icon: SquareMousePointerIcon,
        iconClassName:
          'rbn:shrink-0 rbn:w-7 rbn:h-7 rbn:aspect-square rbn:cursor-pointer rbn:hover:opacity-80',
        action: {
          type: actionTypesMap.OPEN_NODE_GROUP,
          payload: { nodeId: id ?? '' },
        },
      });
    }

    // A preview registered for this node type gets a persisted eye toggle to
    // collapse/expand its preview panel. The eye is a GRAPH action (needs
    // dispatch), so it is shown only IN-GRAPH — standalone the preview still
    // renders (via the `visualState` prop) but has no toggle control (D-9).
    const hasPreview =
      !!nodeTypeUniqueId && !!nodePreviewRegistry?.[nodeTypeUniqueId];
    if (hasPreview && isCurrentlyInsideReactFlow) {
      headerActions.push({
        id: 'toggle-preview',
        label: 'Toggle preview',
        icon: previewCollapsed ? EyeOff : Eye,
        action: {
          type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
          payload: { nodeId: id ?? '', previewCollapsed: !previewCollapsed },
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
          'rbn:group/node rbn:flex rbn:flex-col rbn:gap-0 rbn:rounded-md rbn:w-max rbn:border-[1.5px] rbn:border-transparent rbn:focus:border-white',
          'rbn:in-[.selected]:border-white', //in-[.selected]:text-white is handled by the parent (inside react flow)
          theme?.node?.container,
          className,
        )}
        {...props}
        ref={ref}
      >
        <div
          className={cn(
            'rbn:text-primary-white rbn:text-left rbn:text-[27px] rbn:leading-[27px] rbn:font-main rbn:px-4 rbn:transition-all rbn:rounded-t-md rbn:truncate rbn:flex rbn:justify-between rbn:items-center',
            theme?.node?.header,
          )}
          style={{
            backgroundColor: headerColor,
          }}
        >
          <EditableNodeTitle
            typeName={displayName}
            customName={supportsCustomName ? customName : undefined}
            isEditable={isCustomNameEditable}
            onCommit={handleCustomNameCommit}
            className={cn('rbn:min-w-0', theme?.node?.headerTitle)}
          />
          {nodeDescription && (
            <InfoHint
              text={nodeDescription}
              label={`About ${displayName}`}
              className='rbn:ml-3 rbn:hidden rbn:group-hover/node:inline-flex rbn:group-focus-within/node:inline-flex'
            />
          )}
          {fullGraphContext?.allProps?.state?.enableDebugMode && (
            <p className='rbn:ml-3 rbn:shrink-0 rbn:py-2'>{id}</p>
          )}
          <div className='rbn:ml-auto rbn:flex rbn:items-center rbn:gap-3'>
            <ContextAwareNodeHeaderActions
              actions={headerActions}
              isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
            />
          </div>
        </div>
        <SocketDocsContext.Provider value={socketDocs}>
          <div
            className={cn(
              'rbn:min-h-[50px] rbn:rounded-b-md rbn:bg-primary-dark-gray',
              theme?.node?.body,
            )}
          >
            {isCurrentlyInsideReactFlow && (
              <NodeResizerWithMoreControls {...nodeResizerProps} />
            )}
            <div
              className={cn(
                'rbn:flex rbn:flex-col rbn:py-4',
                theme?.node?.outputsSection,
              )}
            >
              {outputs.map((output) => (
                <RenderOutput
                  key={output.id}
                  output={output}
                  isCurrentlyInsideReactFlow={isCurrentlyInsideReactFlow}
                />
              ))}
            </div>
            <div
              className={cn(
                'rbn:flex rbn:flex-col rbn:py-4',
                theme?.node?.inputsSection,
              )}
            >
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
        </SocketDocsContext.Provider>
      </div>
    );

    // Wrap ONLY the node proper with the status indicator; the preview panel
    // sits ON TOP of the node (outside the status border), width-matched to the
    // node. Placement is fixed to 'top' today (bottom/left/right are future
    // options).
    const wrappedNodeContent =
      runnerVisualState !== undefined ? (
        <NodeStatusIndicator
          visualState={runnerVisualState}
          errors={runnerErrors}
          warnings={runnerWarnings}
        >
          {nodeContent}
        </NodeStatusIndicator>
      ) : (
        nodeContent
      );

    return (
      <div
        className={cn(
          'rbn:flex rbn:flex-col',
          // Inside ReactFlow the RF node div owns the width; standalone the node
          // content does. Either way the panel matches the node's width below.
          isCurrentlyInsideReactFlow ? 'rbn:w-full' : 'rbn:w-max',
        )}
      >
        <NodePreviewPanel
          nodeId={id}
          nodeTypeUniqueId={nodeTypeUniqueId}
          nodeName={displayName}
          customName={supportsCustomName ? customName : undefined}
          visualState={runnerVisualState}
          collapsed={!!previewCollapsed}
        />
        {wrappedNodeContent}
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
