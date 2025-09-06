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

const lengthOfIds = 20;

const actionTypes = [
  'ADD_NODE',
  'UPDATE_NODE_BY_REACT_FLOW',
  'UPDATE_EDGES_BY_REACT_FLOW',
  'ADD_EDGE_BY_REACT_FLOW',
  'UPDATE_INPUT_VALUE',
] as const;

const actionTypesMap = {
  [actionTypes[0]]: actionTypes[0],
  [actionTypes[1]]: actionTypes[1],
  [actionTypes[2]]: actionTypes[2],
  [actionTypes[3]]: actionTypes[3],
  [actionTypes[4]]: actionTypes[4],
} as const;

type Action<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> =
  | {
      type: typeof actionTypesMap.ADD_NODE;
      payload: {
        type: State<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >['nodeIdToNodeType'][string];
        position: XYPosition;
      };
    }
  | {
      type: typeof actionTypesMap.UPDATE_NODE_BY_REACT_FLOW;
      payload: {
        changes: NodeChanges;
      };
    }
  | {
      type: typeof actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW;
      payload: {
        changes: EdgeChanges;
      };
    }
  | {
      type: typeof actionTypesMap.ADD_EDGE_BY_REACT_FLOW;
      payload: {
        edge: Connection;
      };
    }
  | {
      type: typeof actionTypesMap.UPDATE_INPUT_VALUE;
      payload: {
        nodeId: string;
        inputId: string;
        value: string | number;
      };
    };

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
