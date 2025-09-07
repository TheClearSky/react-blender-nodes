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

const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};

const edgeTypes = {
  configurableEdge: ConfigurableEdge,
};

type FullGraphProps<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
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

  // Generate context menu items dynamically from typeOfNodes
  const contextMenuItems = createNodeContextMenu({
    typeOfNodes: state.typeOfNodes,
    dispatch,
    setContextMenu,
    contextMenuPosition: screenToFlowPosition(contextMenu.position),
  });

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
    });
  }, []);

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
          style={{
            position: 'absolute',
            top: contextMenu.position.y,
            left: contextMenu.position.x,
            zIndex: 10,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ContextMenu subItems={contextMenuItems} />
        </div>
      )}
    </div>
  );
}

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
