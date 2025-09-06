import { type NodeChange, type EdgeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { type ConfigurableNodeState } from '../ConfigurableNode/ConfigurableNodeReactFlowWrapper';
import { type ConfigurableEdgeState } from '../../atoms/ConfigurableEdge/ConfigurableEdge';

type Nodes = ConfigurableNodeState[];
type Edges = ConfigurableEdgeState[];

type NodeChanges = NodeChange<ConfigurableNodeState>[];
type EdgeChanges = EdgeChange<ConfigurableEdgeState>[];

export type { Nodes, Edges, NodeChanges, EdgeChanges };
