import { useState, useCallback } from 'react';
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
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ConfigurableNodeReactFlowWrapper } from '../ConfigurableNode/ConfigurableNodeReactFlowWrapper';
import { ConfigurableEdge } from '../../atoms/ConfigurableEdge/ConfigurableEdge';
import { ConfigurableConnection } from '@/components/atoms/ConfiguableConnection/ConfigurableConnection';

const initialNodes = [
  {
    id: 'n1',
    position: { x: -200, y: 100 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    data: {
      name: 'Node 1',
      outputs: [{ name: 'Output 1', id: 'output1' }],
      inputs: [{ name: 'Input 1', id: 'input1' }],
    },
  },
  {
    id: 'n2',
    position: { x: 200, y: 200 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    data: {
      name: 'Node 2',
      inputs: [{ name: 'Input 2', id: 'input2' }],
      outputs: [{ name: 'Output 2', id: 'output2' }],
    },
  },
];
const initialEdges = [
  { id: 'n1-n2', source: 'n1', target: 'n2', type: 'configurabledge' },
];

const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};

const edgeTypes = {
  configurabledge: ConfigurableEdge,
};

function FullGraph() {
  const [nodes, setNodes] =
    useState<NonNullable<ReactFlowProps['nodes']>>(initialNodes);
  const [edges, setEdges] =
    useState<NonNullable<ReactFlowProps['edges']>>(initialEdges);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  );
  const onConnect = useCallback(
    (newConnection: Connection) =>
      setEdges((edgesSnapshot) => addEdge(newConnection, edgesSnapshot)),
    [],
  );

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
          maxZoom: 1,
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
