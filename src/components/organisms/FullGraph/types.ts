import { type NodeChange, type EdgeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { type ConfigurableNodeReactFlowWrapperProps } from '../ConfigurableNode/ConfigurableNodeReactFlowWrapper';
import { type ConfigurableEdgeState } from '../../atoms/ConfigurableEdge/ConfigurableEdge';
import { type SupportedUnderlyingTypes } from '@/utils';
import { z } from 'zod';

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

type NodeOptionalKeys =
  | 'draggable'
  | 'zIndex'
  | 'selectable'
  | 'deletable'
  | 'dragging'
  | 'selected'
  | 'isConnectable'
  | 'positionAbsoluteX'
  | 'positionAbsoluteY';

/**
 * Array of configurable nodes in the graph
 */
type Nodes<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = Optional<
  ConfigurableNodeReactFlowWrapperProps<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >,
  NodeOptionalKeys
>[];

/**
 * Array of configurable edges in the graph
 */
type Edges = ConfigurableEdgeState[];

/**
 * Array of node changes for ReactFlow
 */
type NodeChanges<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = NodeChange<
  Optional<
    ConfigurableNodeReactFlowWrapperProps<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >,
    NodeOptionalKeys
  >
>[];

/**
 * Array of edge changes for ReactFlow
 */
type EdgeChanges = EdgeChange<ConfigurableEdgeState>[];

export type { Nodes, Edges, NodeChanges, EdgeChanges };
