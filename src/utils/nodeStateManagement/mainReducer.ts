import { type State, type SupportedUnderlyingTypes } from './types';
import { z } from 'zod';
import { produce } from 'immer';
import { type Connection, type XYPosition, type Viewport } from '@xyflow/react';
import type { EdgeChanges, NodeChanges } from '@/components';
import { validateAction } from './planApply/validators';
import { applyPlan } from './planApply/applyPlan';

/** Available action types for the graph state reducer */
const actionTypes = [
  'ADD_NODE',
  'ADD_NODE_AND_SELECT',
  'UPDATE_NODE_BY_REACT_FLOW',
  'UPDATE_EDGES_BY_REACT_FLOW',
  'ADD_EDGE_BY_REACT_FLOW',
  'UPDATE_INPUT_VALUE',
  'OPEN_NODE_GROUP',
  'CLOSE_NODE_GROUP',
  'ADD_NODE_GROUP',
  'SET_VIEWPORT',
  'REPLACE_STATE',
  'UPDATE_NODE_TYPE',
  'ADD_LOOP',
] as const;

/** Map of action types for type-safe action dispatching */
const actionTypesMap = {
  [actionTypes[0]]: actionTypes[0],
  [actionTypes[1]]: actionTypes[1],
  [actionTypes[2]]: actionTypes[2],
  [actionTypes[3]]: actionTypes[3],
  [actionTypes[4]]: actionTypes[4],
  [actionTypes[5]]: actionTypes[5],
  [actionTypes[6]]: actionTypes[6],
  [actionTypes[7]]: actionTypes[7],
  [actionTypes[8]]: actionTypes[8],
  [actionTypes[9]]: actionTypes[9],
  [actionTypes[10]]: actionTypes[10],
  [actionTypes[11]]: actionTypes[11],
  [actionTypes[12]]: actionTypes[12],
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
        type: NodeTypeUniqueId;
        /** Position where to place the node */
        position: XYPosition;
      };
    }
  | {
      /** Add a new node to the graph and select it */
      type: typeof actionTypesMap.ADD_NODE_AND_SELECT;
      payload: {
        /** Type of node to add */
        type: NodeTypeUniqueId;
        /** Position where to place the node */
        position: XYPosition;
      };
    }
  | {
      /** Update nodes based on ReactFlow changes */
      type: typeof actionTypesMap.UPDATE_NODE_BY_REACT_FLOW;
      payload: {
        /** Array of node changes from ReactFlow */
        changes: NodeChanges<
          UnderlyingType,
          NodeTypeUniqueId,
          ComplexSchemaType,
          DataTypeUniqueId
        >;
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
    }
  | {
      /** Open a node group and push it onto the openedNodeGroupStack */
      type: typeof actionTypesMap.OPEN_NODE_GROUP;
      payload:
        | {
            //nodeId is used to calculate nodeType, this is instance opening
            /** ID of the node to open */
            nodeId: string;
          }
        | {
            //This has no nodeId, we are opening the original node group
            /** Type of node to open */
            nodeType: NodeTypeUniqueId;
          };
    }
  | {
      /** Close a node group and pop it from the openedNodeGroupStack */
      type: typeof actionTypesMap.CLOSE_NODE_GROUP;
    }
  | {
      /** Add a new node group to the graph */
      type: typeof actionTypesMap.ADD_NODE_GROUP;
    }
  | {
      /** Set the viewport of the graph */
      type: typeof actionTypesMap.SET_VIEWPORT;
      payload: {
        /** Current viewport of the graph */
        viewport: Viewport;
      };
    }
  | {
      /** Replace the entire graph state (used by import) */
      type: typeof actionTypesMap.REPLACE_STATE;
      payload: {
        /** The new state to replace the current state with */
        state: State<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >;
      };
    }
  | {
      /** Update properties of a node type definition (name, headerColor, inputs, outputs) */
      type: typeof actionTypesMap.UPDATE_NODE_TYPE;
      payload: {
        /** ID of the node type to update */
        nodeTypeId: NodeTypeUniqueId;
        /** Partial updates to apply */
        updates: {
          name?: string;
          headerColor?: string;
          inputs?: (
            | import('./types').TypeOfInput<DataTypeUniqueId>
            | import('./types').TypeOfInputPanel<DataTypeUniqueId>
          )[];
          outputs?: import('./types').TypeOfInput<DataTypeUniqueId>[];
        };
      };
    }
  | {
      /** Add a complete loop triplet (loopStart + loopStop + loopEnd) with bind edges */
      type: typeof actionTypesMap.ADD_LOOP;
      payload: {
        /** Position where loopStart is placed; loopStop and loopEnd auto-spread to the right */
        position: XYPosition;
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
 * const state = makeStateWithAutoInfer({
 *   dataTypes,
 *   typeOfNodes,
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
      draft: State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >,
    ) => {
      const planResult = validateAction(oldState, action);
      if (planResult !== null) {
        if (planResult.ok) {
          const returnValue = applyPlan(draft, planResult.value);
          if (returnValue !== undefined) return returnValue;
        }
        return;
      }
      // No legacy fallback needed — all actions migrated
    },
  );
  return newState;
}

export { mainReducer, actionTypesMap };

export type { Action };
