import { type NodeChange, type EdgeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { type ConfigurableNodeState } from '../ConfigurableNode/ConfigurableNodeReactFlowWrapper';
import { type ConfigurableEdgeState } from '../../atoms/ConfigurableEdge/ConfigurableEdge';

/**
 * Array of configurable nodes in the graph
 */
type Nodes = ConfigurableNodeState[];

/**
 * Array of configurable edges in the graph
 */
type Edges = ConfigurableEdgeState[];

/**
 * Array of node changes for ReactFlow
 */
type NodeChanges = NodeChange<ConfigurableNodeState>[];

/**
 * Array of edge changes for ReactFlow
 */
type EdgeChanges = EdgeChange<ConfigurableEdgeState>[];

export type { Nodes, Edges, NodeChanges, EdgeChanges };
