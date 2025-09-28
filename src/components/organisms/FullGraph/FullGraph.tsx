import { useReducer, useState, useCallback, type ActionDispatch } from 'react';
import { z } from 'zod';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  type XYPosition,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ConfigurableNodeReactFlowWrapper } from '../ConfigurableNode/ConfigurableNodeReactFlowWrapper';
import { ConfigurableEdge } from '../../atoms/ConfigurableEdge/ConfigurableEdge';
import { ConfigurableConnection } from '@/components/atoms/ConfiguableConnection/ConfigurableConnection';
import { ContextMenu } from '../../molecules/ContextMenu/ContextMenu';
import { createNodeContextMenu } from '../../molecules/ContextMenu/createNodeContextMenu';
import {
  actionTypesMap,
  mainReducer,
  type Action,
} from '@/utils/nodeStateManagement/mainReducer';
import {
  type State,
  type SupportedUnderlyingTypes,
} from '@/utils/nodeStateManagement/types';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useInteractions,
} from '@floating-ui/react';

const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};

const edgeTypes = {
  configurableEdge: ConfigurableEdge,
};

/**
 * Props for the FullGraph component
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 */
type FullGraphProps<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /** The current state of the graph including nodes, edges, and type definitions */
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
  /** Dispatch function for updating the graph state */
  dispatch: ActionDispatch<
    [
      action: Action<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >,
    ]
  >;
};

/**
 * Custom hook for managing the full graph state with reducer
 *
 * This hook provides state management for the entire graph including nodes, edges,
 * data types, and node type definitions. It uses a reducer pattern for predictable
 * state updates.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param initialState - The initial state of the graph
 * @returns Object containing the current state and dispatch function
 *
 * @example
 * ```tsx
 * import {
 *   useFullGraph,
 *   makeStateWithAutoInfer,
 *   makeNodeIdToNodeTypeWithAutoInfer,
 *   makeTypeOfNodeWithAutoInfer,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 *
 * // Define data types with auto-infer for type safety
 * const dataTypes = {
 *   stringType: makeDataTypeWithAutoInfer({
 *     name: 'String',
 *     underlyingType: 'string',
 *     color: '#4A90E2',
 *   }),
 *   numberType: makeDataTypeWithAutoInfer({
 *     name: 'Number',
 *     underlyingType: 'number',
 *     color: '#E74C3C',
 *   }),
 * };
 *
 * // Define node types with auto-infer for type safety
 * const typeOfNodes = {
 *   inputNode: makeTypeOfNodeWithAutoInfer({
 *     name: 'Input Node',
 *     headerColor: '#C44536',
 *     inputs: [
 *       { name: 'Input', dataType: 'stringType', allowInput: true }
 *     ],
 *     outputs: [
 *       { name: 'Output', dataType: 'stringType' }
 *     ],
 *   }),
 * };
 *
 * // Define node ID to type mapping with auto-infer
 * const nodeIdToNodeType = makeNodeIdToNodeTypeWithAutoInfer({
 *   'node-1': 'inputNode',
 * });
 *
 * // Create state with auto-infer for complete type safety
 * const initialState = makeStateWithAutoInfer({
 *   dataTypes,
 *   typeOfNodes,
 *   nodeIdToNodeType,
 *   nodes: [],
 *   edges: [],
 * });
 *
 * const { state, dispatch } = useFullGraph(initialState);
 *
 * // Add a new node (type-safe!)
 * dispatch({
 *   type: 'ADD_NODE',
 *   payload: { type: 'inputNode', position: { x: 100, y: 100 } },
 * });
 * ```
 */
function useFullGraph<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  initialState: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
) {
  const [state, dispatch] = useReducer(
    mainReducer<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    initialState,
  );

  return { state, dispatch };
}

/**
 * Internal component that provides the actual graph functionality
 *
 * This component handles the ReactFlow integration and context menu functionality.
 * It's wrapped by the main FullGraph component to provide ReactFlowProvider context.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param props - The component props
 * @returns JSX element containing the graph editor
 */
function FullGraphWithReactFlowProvider<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  state,
  dispatch,
}: FullGraphProps<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>) {
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: XYPosition;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });
  const { screenToFlowPosition } = useReactFlow();

  // Floating UI setup for context menu
  const { refs, floatingStyles, context } = useFloating({
    open: contextMenu.isOpen,
    onOpenChange: (open) => {
      if (!open) {
        setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
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

  // Dismiss interactions for context menu
  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);

  // Generate context menu items dynamically from typeOfNodes
  const contextMenuItems = createNodeContextMenu({
    typeOfNodes: state.typeOfNodes,
    dispatch,
    setContextMenu,
    contextMenuPosition: screenToFlowPosition(contextMenu.position),
  });

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const position = { x: event.clientX, y: event.clientY };

      // Set the reference element position for floating UI with proper dimensions
      if (refs.setReference) {
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
      }

      setContextMenu({
        isOpen: true,
        position,
      });
    },
    [refs],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      <ReactFlow
        nodes={state.nodes}
        edges={state.edges}
        onNodesChange={(changes) =>
          dispatch({
            type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
            payload: { changes },
          })
        }
        onEdgesChange={(changes) =>
          dispatch({
            type: actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW,
            payload: { changes },
          })
        }
        onConnect={(newConnection) =>
          dispatch({
            type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
            payload: { edge: newConnection },
          })
        }
        fitView
        fitViewOptions={{
          maxZoom: 0.5,
          minZoom: 0.1,
        }}
        maxZoom={1}
        minZoom={0.1}
        proOptions={{
          hideAttribution: true,
        }}
        colorMode='dark'
        selectNodesOnDrag={true}
        elevateNodesOnSelect={true}
        elevateEdgesOnSelect={true}
        selectionMode={SelectionMode.Partial}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={['Backspace', 'Delete', 'x']}
        connectionLineComponent={ConfigurableConnection}
        onContextMenu={handleContextMenu}
        onClick={handleCloseContextMenu}
      >
        <Controls />
        <Background />
        <MiniMap pannable />
      </ReactFlow>

      {/* Context Menu */}
      {contextMenu.isOpen && (
        <div
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            // Prevent scrollbar during positioning
            contain: 'layout',
            willChange: 'transform',
          }}
          className='z-50'
          onClick={(e) => e.stopPropagation()}
          {...getFloatingProps()}
        >
          <ContextMenu subItems={contextMenuItems} />
        </div>
      )}
    </div>
  );
}

/**
 * Main graph editor component inspired by Blender's node editor
 *
 * This is the primary component for creating interactive node-based graph editors.
 * It provides a complete ReactFlow-based interface with custom nodes, edges, and
 * context menu functionality for adding new nodes.
 *
 * Features:
 * - Pan, zoom, and select nodes with intuitive controls
 * - Drag and drop node connections
 * - Right-click context menu for adding new nodes
 * - Custom node types with configurable inputs and outputs
 * - Real-time node manipulation and state management
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param props - The component props
 * @returns JSX element containing the complete graph editor
 *
 * @example
 * ```tsx
 * import {
 *   FullGraph,
 *   useFullGraph,
 *   makeStateWithAutoInfer,
 *   makeNodeIdToNodeTypeWithAutoInfer,
 *   makeTypeOfNodeWithAutoInfer,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 *
 * function MyNodeEditor() {
 *   // Define data types with auto-infer for type safety
 *   const dataTypes = {
 *     stringType: makeDataTypeWithAutoInfer({
 *       name: 'String',
 *       underlyingType: 'string',
 *       color: '#4A90E2',
 *     }),
 *     numberType: makeDataTypeWithAutoInfer({
 *       name: 'Number',
 *       underlyingType: 'number',
 *       color: '#E74C3C',
 *     }),
 *   };
 *
 *   // Define node types with auto-infer for type safety
 *   const typeOfNodes = {
 *     inputNode: makeTypeOfNodeWithAutoInfer({
 *       name: 'Input Node',
 *       headerColor: '#C44536',
 *       inputs: [
 *         { name: 'Input', dataType: 'stringType', allowInput: true }
 *       ],
 *       outputs: [
 *         { name: 'Output', dataType: 'stringType' }
 *       ],
 *     }),
 *     outputNode: makeTypeOfNodeWithAutoInfer({
 *       name: 'Output Node',
 *       headerColor: '#2D5A87',
 *       inputs: [
 *         { name: 'Input', dataType: 'stringType' }
 *       ],
 *       outputs: [],
 *     }),
 *   };
 *
 *   // Define node ID to type mapping with auto-infer
 *   const nodeIdToNodeType = makeNodeIdToNodeTypeWithAutoInfer({
 *     'node-1': 'inputNode',
 *     'node-2': 'outputNode',
 *   });
 *
 *   // Create state with auto-infer for complete type safety
 *   const initialState = makeStateWithAutoInfer({
 *     dataTypes,
 *     typeOfNodes,
 *     nodeIdToNodeType,
 *     nodes: [],
 *     edges: [],
 *   });
 *
 *   const { state, dispatch } = useFullGraph(initialState);
 *
 *   return (
 *     <div style={{ height: '600px', width: '100%' }}>
 *       <FullGraph state={state} dispatch={dispatch} />
 *     </div>
 *   );
 * }
 * ```
 */
function FullGraph<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  state,
  dispatch,
}: FullGraphProps<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>) {
  return (
    <ReactFlowProvider>
      <FullGraphWithReactFlowProvider state={state} dispatch={dispatch} />
    </ReactFlowProvider>
  );
}

export { FullGraph, useFullGraph };

export { type FullGraphProps };
