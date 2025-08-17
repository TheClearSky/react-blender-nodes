import { useCallback } from 'react';
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type ReactFlowProps,
  type NodeChange,
  type EdgeChange,
  type Connection,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ConfigurableNodeReactFlowWrapper } from '../ConfigurableNode/ConfigurableNodeReactFlowWrapper';
import { ConfigurableEdge } from '../../atoms/ConfigurableEdge/ConfigurableEdge';
import { ConfigurableConnection } from '@/components/atoms/ConfiguableConnection/ConfigurableConnection';

const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};

const edgeTypes = {
  configurabledge: ConfigurableEdge,
};

type Nodes = NonNullable<ReactFlowProps['nodes']>;
type Edges = NonNullable<ReactFlowProps['edges']>;

type FullGraphProps = {
  nodes?: Nodes;
  edges?: Edges;
  setNodes?: (updater: (nodes: Nodes) => Nodes) => void;
  setEdges?: (updater: (edges: Edges) => Edges) => void;
  setNodesWithNoAsyncCheck?: (nodes: Node[]) => void;
  setEdgesWithNoAsyncCheck?: (edges: Edge[]) => void;
};

function FullGraph({
  nodes = [],
  edges = [],
  setNodes = () => {},
  setEdges = () => {},
  setNodesWithNoAsyncCheck = () => {},
  setEdgesWithNoAsyncCheck = () => {},
}: FullGraphProps) {
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot));
    setNodesWithNoAsyncCheck(applyNodeChanges(changes, nodes));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot));
    setEdgesWithNoAsyncCheck(applyEdgeChanges(changes, edges));
  }, []);
  const onConnect = useCallback((newConnection: Connection) => {
    setEdges((edgesSnapshot) => addEdge(newConnection, edgesSnapshot));
    setEdgesWithNoAsyncCheck(addEdge(newConnection, edges));
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
      >
        <Controls />
        <Background />
        <MiniMap pannable />
      </ReactFlow>
    </div>
  );
}

export { FullGraph };

export { type FullGraphProps, type Nodes, type Edges };
