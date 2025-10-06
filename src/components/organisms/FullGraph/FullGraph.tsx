import {
  useReducer,
  useState,
  useCallback,
  type ActionDispatch,
  createContext,
  useMemo,
  useEffect,
} from 'react';
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
import { createNodeContextMenu } from '../../molecules/ContextMenu/createNodeContextMenu';
import { FullGraphContextMenu } from './FullGraphContextMenu';
import { FullGraphNodeGroupSelector } from './FullGraphNodeGroupSelector';
import {
  actionTypesMap,
  mainReducer,
  type Action,
} from '@/utils/nodeStateManagement/mainReducer';
import {
  type State,
  type SupportedUnderlyingTypes,
} from '@/utils/nodeStateManagement/types';
import { getCurrentNodesAndEdgesFromState } from '@/utils';

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
 * // Create state with auto-infer for complete type safety
 * const initialState = makeStateWithAutoInfer({
 *   dataTypes,
 *   typeOfNodes,
 *   nodes: [],
 *   edges: [],
 * });
 *
 * const { state, dispatch } = useFullGraph(initialState);
 *
 * // Add a new node (type-safe!)
 * dispatch({
 *   type: actionTypesMap.ADD_NODE,
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

  const nodeGroups = useMemo(() => {
    return Object.keys(state.typeOfNodes)
      .filter(
        (key) =>
          state.typeOfNodes[key as keyof typeof state.typeOfNodes].subtree !==
          undefined,
      )
      .map((key) => ({
        id: key,
        name: state.typeOfNodes[key as keyof typeof state.typeOfNodes].name,
      }));
  }, [state.typeOfNodes]);

  const currentNodeGroup = useMemo(() => {
    return state.openedNodeGroupStack?.[state.openedNodeGroupStack.length - 1];
  }, [state.openedNodeGroupStack]);

  const { screenToFlowPosition, fitView } = useReactFlow();

  // Generate context menu items dynamically from typeOfNodes
  const contextMenuItems = createNodeContextMenu({
    typeOfNodes: state.typeOfNodes,
    dispatch,
    setContextMenu,
    contextMenuPosition: screenToFlowPosition(contextMenu.position),
  });

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const position = { x: event.clientX, y: event.clientY };
    setContextMenu({ isOpen: true, position });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
  }, []);

  const currentNodesAndEdges = useMemo(() => {
    return getCurrentNodesAndEdgesFromState(state);
  }, [state.nodes, state.edges, state.openedNodeGroupStack, state.typeOfNodes]);

  useEffect(() => {
    if (state.viewport === undefined) {
      fitView({
        maxZoom: 0.5,
        minZoom: 0.1,
      });
    }
  }, [state.viewport]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
      }}
      className='relative'
    >
      <ReactFlow
        nodes={currentNodesAndEdges.nodes}
        edges={currentNodesAndEdges.edges}
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
        viewport={state.viewport}
        onViewportChange={(viewport) =>
          dispatch({
            type: actionTypesMap.SET_VIEWPORT,
            payload: { viewport },
          })
        }
      >
        <Controls />
        <Background />
        <MiniMap pannable />
      </ReactFlow>

      {/* Context Menu */}
      <FullGraphContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={handleCloseContextMenu}
        subItems={contextMenuItems}
      />

      <FullGraphNodeGroupSelector
        nodeGroups={nodeGroups}
        value={currentNodeGroup?.nodeType ?? ''}
        setValue={(value) =>
          dispatch({
            type: actionTypesMap.OPEN_NODE_GROUP,
            payload: {
              nodeType: value as NodeTypeUniqueId,
            },
          })
        }
        handleAddNewGroup={() =>
          dispatch({
            type: actionTypesMap.ADD_NODE_GROUP,
          })
        }
        enableBackButton={(state.openedNodeGroupStack?.length || 0) > 0}
        handleBack={() =>
          dispatch({
            type: actionTypesMap.CLOSE_NODE_GROUP,
          })
        }
        openedNodeGroupStack={(state.openedNodeGroupStack || []).map(
          (nodeGroup) => ({
            id:
              nodeGroup.nodeType +
              ('nodeId' in nodeGroup ? nodeGroup.nodeId : ''),
            name: state.typeOfNodes[nodeGroup.nodeType].name,
          }),
        )}
      />
    </div>
  );
}

const FullGraphContext = createContext<{
  allProps: FullGraphProps;
}>(null!); //the not-null assertion (null!) is because-
// we are creating a context that is always provided (right below)

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
 *   // Create state with auto-infer for complete type safety
 *   const initialState = makeStateWithAutoInfer({
 *     dataTypes,
 *     typeOfNodes,
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
      {/* @ts-ignore - this is because useContext can't infer types, issue highlighted here: https://stackoverflow.com/questions/51448291/how-to-create-a-generic-react-component-with-a-typed-context-provider */}
      <FullGraphContext.Provider value={{ allProps: { state, dispatch } }}>
        <FullGraphWithReactFlowProvider state={state} dispatch={dispatch} />
      </FullGraphContext.Provider>
    </ReactFlowProvider>
  );
}

export { FullGraph, useFullGraph, FullGraphContext };

export { type FullGraphProps };
