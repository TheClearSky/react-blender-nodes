import {
  type State,
  type SupportedUnderlyingTypes,
  type ActiveDrawer,
  type TypeOfInput,
  type TypeOfInputPanel,
} from './types';
import { z } from 'zod';
import { type Connection, type XYPosition, type Viewport } from '@xyflow/react';
import type { EdgeChanges, NodeChanges } from '@/components';
import { validateAction } from './planApply/validators';
import { applyValidatedAction } from './applyWithHistory';
import type {
  LoopChannelHandles,
  SwitchChannelHandles,
} from './handles/channelDeletionAnalysis';

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
  'UPDATE_LOOP',
  'OPEN_DRAWER',
  'CLOSE_DRAWER',
  'ADD_SWITCH',
  'UPDATE_SWITCH',
  'UNDO',
  'REDO',
  'BEGIN_BATCH',
  'END_BATCH',
  'CLEAR_HISTORY',
  'DELETE_NODE_TYPE_HANDLES',
  'DELETE_LOOP_CHANNELS',
  'DELETE_SWITCH_CHANNELS',
  'UPDATE_GRAPH_IO_HANDLES',
  'REORDER_INPUT_CONNECTIONS',
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
  [actionTypes[13]]: actionTypes[13],
  [actionTypes[14]]: actionTypes[14],
  [actionTypes[15]]: actionTypes[15],
  [actionTypes[16]]: actionTypes[16],
  [actionTypes[17]]: actionTypes[17],
  [actionTypes[18]]: actionTypes[18],
  [actionTypes[19]]: actionTypes[19],
  [actionTypes[20]]: actionTypes[20],
  [actionTypes[21]]: actionTypes[21],
  [actionTypes[22]]: actionTypes[22],
  [actionTypes[23]]: actionTypes[23],
  [actionTypes[24]]: actionTypes[24],
  [actionTypes[25]]: actionTypes[25],
  [actionTypes[26]]: actionTypes[26],
  [actionTypes[27]]: actionTypes[27],
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
        /**
         * Root Graph I/O edit policy (forwarded from the `<FullGraph>` props of
         * the same name). Govern ONLY root-boundary inference; ignored when a
         * node group is open (group boundaries always behave fully). Absent ⇒
         * permissive (`true`) so programmatic/test dispatch keeps full parity.
         */
        allowRootIORename?: boolean;
        allowRootIOStructureEdit?: boolean;
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
        // Static type imports (not inline import('./types') qualifiers):
        // inline qualifiers are hoisted verbatim into the rolled-up
        // dist/index.d.ts as relative imports that escape the package
        // (guarded by scripts/check-dist-types.mjs).
        updates: {
          name?: string;
          headerColor?: string;
          inputs?: (
            | TypeOfInput<DataTypeUniqueId>
            | TypeOfInputPanel<DataTypeUniqueId>
          )[];
          outputs?: TypeOfInput<DataTypeUniqueId>[];
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
    }
  | {
      /** Update handle names and order across a loop triplet */
      type: typeof actionTypesMap.UPDATE_LOOP;
      payload: {
        loopStartNodeId: string;
        loopStopNodeId: string;
        loopEndNodeId: string;
        levels: Array<{
          handles: {
            loopStartIn: { id: string; name: string };
            loopStartOut: { id: string; name: string };
            loopStopIn: { id: string; name: string };
            loopStopOut: { id: string; name: string };
            loopEndIn: { id: string; name: string };
            loopEndOut: { id: string; name: string };
          };
        }>;
      };
    }
  | {
      /** Open a drawer (loop edit, node type edit) */
      type: typeof actionTypesMap.OPEN_DRAWER;
      payload: {
        activeDrawer: ActiveDrawer;
      };
    }
  | {
      /** Close the currently open drawer */
      type: typeof actionTypesMap.CLOSE_DRAWER;
    }
  | {
      /** Add a complete switch pair (switchStart + switchEnd) with bind edge */
      type: typeof actionTypesMap.ADD_SWITCH;
      payload: {
        /** Position where switchStart is placed; switchEnd auto-spreads to the right */
        position: XYPosition;
      };
    }
  | {
      /** Update handle names and order across a switch pair */
      type: typeof actionTypesMap.UPDATE_SWITCH;
      payload: {
        switchStartNodeId: string;
        switchEndNodeId: string;
        levels: Array<{
          handles: {
            switchStartIn: { id: string; name: string };
            switchStartTrueOut: { id: string; name: string };
            switchStartFalseOut: { id: string; name: string };
            switchEndTrueIn: { id: string; name: string };
            switchEndFalseIn: { id: string; name: string };
            switchEndOut: { id: string; name: string };
          };
        }>;
      };
    }
  | {
      /** Undo the most recent undoable action */
      type: typeof actionTypesMap.UNDO;
    }
  | {
      /** Redo the most recently undone action */
      type: typeof actionTypesMap.REDO;
    }
  | {
      /** Begin accumulating undoable dispatches into a single undo entry */
      type: typeof actionTypesMap.BEGIN_BATCH;
    }
  | {
      /** Finalize the current batch into a single undo entry */
      type: typeof actionTypesMap.END_BATCH;
    }
  | {
      /** Clear the entire undo/redo history */
      type: typeof actionTypesMap.CLEAR_HISTORY;
    }
  | {
      /** Delete one or more input/output handles from a node type, cascading
       *  to every edge connected to those handles across all instances and
       *  group subtrees. Applied as a single undoable step. */
      type: typeof actionTypesMap.DELETE_NODE_TYPE_HANDLES;
      payload: {
        /** ID of the node type to delete handles from */
        nodeTypeId: NodeTypeUniqueId;
        /** Handles to delete, addressed by direction + name + data type
         *  (drag-list item ids are regenerated and can't be used). */
        deletions: {
          direction: 'input' | 'output';
          handleName: string;
          handleDataTypeId: DataTypeUniqueId;
        }[];
      };
    }
  | {
      /** Delete one or more whole data channels from a loop triplet, cascading
       *  every edge connected to the channel's handles in the current scope and
       *  reverting inferred types. Applied as a single undoable step. */
      type: typeof actionTypesMap.DELETE_LOOP_CHANNELS;
      payload: {
        loopStartNodeId: string;
        loopStopNodeId: string;
        loopEndNodeId: string;
        channels: Array<{
          dataTypeUniqueId: string;
          handles: LoopChannelHandles;
        }>;
      };
    }
  | {
      /** Delete one or more whole data channels from a switch pair (both the
       *  true and false branch handles), cascading every connected edge in the
       *  current scope and reverting inferred types. One undoable step. */
      type: typeof actionTypesMap.DELETE_SWITCH_CHANNELS;
      payload: {
        switchStartNodeId: string;
        switchEndNodeId: string;
        channels: Array<{
          dataTypeUniqueId: string;
          handles: SwitchChannelHandles;
        }>;
      };
    }
  | {
      /** Edit the handles of a ROOT Graph Input / Graph Output node INSTANCE (the
       *  program's declared inputs/outputs): add / rename / reorder / delete.
       *  `handles` is the final kept list; entries without `id` are new (id minted
       *  in applyPlan, defaulting to `groupInfer` so they infer on connect).
       *  Deleted handles' root edges cascade. One undoable step. */
      type: typeof actionTypesMap.UPDATE_GRAPH_IO_HANDLES;
      payload: {
        nodeId: string;
        handles: { id?: string; name: string }[];
      };
    }
  | {
      /** Reorder the incoming connections of a multi-connection (fan-in) input
       *  handle. `orderedEdgeIds` is the FULL set of edges currently entering the
       *  handle, in the new order; applyPlan writes each edge's `data.order`
       *  (a contiguous `0..n-1`) so the runner and every codegen target consume
       *  the connections in this order. One undoable step. */
      type: typeof actionTypesMap.REORDER_INPUT_CONNECTIONS;
      payload: {
        /** Node owning the target input handle. */
        nodeId: string;
        /** The target input handle id. */
        handleId: string;
        /** Every edge currently entering the handle, in the desired order. */
        orderedEdgeIds: string[];
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
  const planResult = validateAction(oldState, action);
  if (planResult === null || !planResult.ok) return oldState;
  return applyValidatedAction(oldState, action, planResult.value);
}

export { mainReducer, actionTypesMap };

export type { Action };
