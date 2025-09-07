import { type State, type SupportedUnderlyingTypes } from './types';
import { z } from 'zod';
import { produce } from 'immer';
import { generateRandomString } from '../randomGeneration';
import { constructNodeOfType } from './constructAndModifyNodes';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type XYPosition,
} from '@xyflow/react';
import type { EdgeChanges, NodeChanges } from '@/components';

/** Length of generated random IDs for nodes */
const lengthOfIds = 20;

/** Available action types for the graph state reducer */
const actionTypes = [
  'ADD_NODE',
  'UPDATE_NODE_BY_REACT_FLOW',
  'UPDATE_EDGES_BY_REACT_FLOW',
  'ADD_EDGE_BY_REACT_FLOW',
  'UPDATE_INPUT_VALUE',
] as const;

/** Map of action types for type-safe action dispatching */
const actionTypesMap = {
  [actionTypes[0]]: actionTypes[0],
  [actionTypes[1]]: actionTypes[1],
  [actionTypes[2]]: actionTypes[2],
  [actionTypes[3]]: actionTypes[3],
  [actionTypes[4]]: actionTypes[4],
} as const;

/**
 * Union type of all possible actions for the graph state reducer
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 */
type Action<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> =
  | {
      /** Add a new node to the graph */
      type: typeof actionTypesMap.ADD_NODE;
      payload: {
        /** Type of node to add */
        type: State<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >['nodeIdToNodeType'][string];
        /** Position where to place the node */
        position: XYPosition;
      };
    }
  | {
      /** Update nodes based on ReactFlow changes */
      type: typeof actionTypesMap.UPDATE_NODE_BY_REACT_FLOW;
      payload: {
        /** Array of node changes from ReactFlow */
        changes: NodeChanges;
      };
    }
  | {
      /** Update edges based on ReactFlow changes */
      type: typeof actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW;
      payload: {
        /** Array of edge changes from ReactFlow */
        changes: EdgeChanges;
      };
    }
  | {
      /** Add a new edge to the graph */
      type: typeof actionTypesMap.ADD_EDGE_BY_REACT_FLOW;
      payload: {
        /** Connection object from ReactFlow */
        edge: Connection;
      };
    }
  | {
      /** Update the value of a node input */
      type: typeof actionTypesMap.UPDATE_INPUT_VALUE;
      payload: {
        /** ID of the node containing the input */
        nodeId: string;
        /** ID of the input to update */
        inputId: string;
        /** New value for the input */
        value: string | number;
      };
    };

/**
 * Main reducer function for managing graph state
 *
 * This reducer handles all state updates for the graph including nodes, edges,
 * and input values. It uses Immer for immutable state updates and integrates
 * with ReactFlow for node and edge management.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param oldState - The current state of the graph
 * @param action - The action to apply to the state
 * @returns New state after applying the action
 *
 * @example
 * ```tsx
 * import {
 *   mainReducer,
 *   makeStateWithAutoInfer,
 *   makeNodeIdToNodeTypeWithAutoInfer,
 *   makeTypeOfNodeWithAutoInfer,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 *
 * // Create type-safe state with auto-infer helpers
 * const dataTypes = {
 *   stringType: makeDataTypeWithAutoInfer({
 *     name: 'String',
 *     underlyingType: 'string',
 *     color: '#4A90E2',
 *   }),
 * };
 *
 * const typeOfNodes = {
 *   inputNode: makeTypeOfNodeWithAutoInfer({
 *     name: 'Input Node',
 *     headerColor: '#C44536',
 *     inputs: [{ name: 'Input', dataType: 'stringType', allowInput: true }],
 *     outputs: [{ name: 'Output', dataType: 'stringType' }],
 *   }),
 * };
 *
 * const nodeIdToNodeType = makeNodeIdToNodeTypeWithAutoInfer({
 *   'node-1': 'inputNode',
 * });
 *
 * const state = makeStateWithAutoInfer({
 *   dataTypes,
 *   typeOfNodes,
 *   nodeIdToNodeType,
 *   nodes: [],
 *   edges: [],
 * });
 *
 * // Add a new node (type-safe!)
 * const newState = mainReducer(state, {
 *   type: 'ADD_NODE',
 *   payload: {
 *     type: 'inputNode',
 *     position: { x: 100, y: 100 },
 *   },
 * });
 *
 * // Update input value (type-safe!)
 * const updatedState = mainReducer(newState, {
 *   type: 'UPDATE_INPUT_VALUE',
 *   payload: {
 *     nodeId: 'node1',
 *     inputId: 'input1',
 *     value: 'new value',
 *   },
 * });
 * ```
 */
function mainReducer<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  oldState: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  action: Action<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
) {
  const newState = produce(
    oldState,
    (
      newState: State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >,
    ) => {
      switch (action.type) {
        case actionTypesMap.ADD_NODE:
          const nodeType = action.payload.type;
          const nodeId = generateRandomString(lengthOfIds);
          const position = action.payload.position;

          const node: (typeof newState.nodes)[number] = constructNodeOfType(
            newState.dataTypes,
            nodeType,
            newState.typeOfNodes,
            nodeId,
            position,
          );
          newState.nodes.push(node);
          break;
        case actionTypesMap.UPDATE_NODE_BY_REACT_FLOW:
          const nodeChanges = action.payload.changes;
          newState.nodes = applyNodeChanges(nodeChanges, newState.nodes);
          break;
        case actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW:
          const edgeChanges = action.payload.changes;
          newState.edges = applyEdgeChanges(edgeChanges, newState.edges);
          break;
        case actionTypesMap.ADD_EDGE_BY_REACT_FLOW:
          const newEdge = action.payload.edge;
          const edgeChangesOfNewEdge: (typeof newState.edges)[number] = {
            ...newEdge,
            type: 'configurableEdge',
            id: generateRandomString(lengthOfIds),
          };
          newState.edges = addEdge(edgeChangesOfNewEdge, newState.edges);
          break;
      }
    },
  );
  return newState;
}

export { mainReducer, actionTypesMap };

export type { Action };
