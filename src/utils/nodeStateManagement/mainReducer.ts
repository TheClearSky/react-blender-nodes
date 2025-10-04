import { type State, type SupportedUnderlyingTypes } from './types';
import { z } from 'zod';
import { produce } from 'immer';
import { generateRandomString } from '../randomGeneration';
import {
  constructNodeOfType,
  getCurrentNodesAndEdgesFromState,
  setCurrentNodesAndEdgesToStateWithMutatingState,
} from './constructAndModifyNodes';
import {
  addEdgeWithTypeChecking,
  removeEdgeWithTypeChecking,
  willAddingEdgeCreateCycle,
} from './constructAndModifyHandles';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type XYPosition,
  type Viewport,
} from '@xyflow/react';
import type { EdgeChanges, NodeChanges } from '@/components';
import { standardNodeTypeNamesMap } from './standardNodes';

/** Length of generated random IDs for nodes */
const lengthOfIds = 20;

/** Available action types for the graph state reducer */
const actionTypes = [
  'ADD_NODE',
  'ADD_NODE_AND_SELECT',
  'UPDATE_NODE_BY_REACT_FLOW',
  'UPDATE_EDGES_BY_REACT_FLOW',
  'ADD_EDGE_BY_REACT_FLOW',
  'UPDATE_INPUT_VALUE',
  'OPEN_NODE_GROUP',
  'ADD_NODE_GROUP',
  'SET_VIEWPORT',
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
          newState = setCurrentNodesAndEdgesToStateWithMutatingState(newState, [
            ...getCurrentNodesAndEdgesFromState(newState).nodes,
            node,
          ]);
          break;
        case actionTypesMap.ADD_NODE_AND_SELECT:
          const nodeTypeAndSelect = action.payload.type;
          const nodeIdAndSelect = generateRandomString(lengthOfIds);
          const positionAndSelect = action.payload.position;

          const nodeAndSelect: (typeof newState.nodes)[number] =
            constructNodeOfType(
              newState.dataTypes,
              nodeTypeAndSelect,
              newState.typeOfNodes,
              nodeIdAndSelect,
              positionAndSelect,
            );
          newState = setCurrentNodesAndEdgesToStateWithMutatingState(
            newState,
            getCurrentNodesAndEdgesFromState(newState).nodes.map((node) => ({
              ...node,
              selected: false,
            })),
          );
          //Set the node to selected
          newState = setCurrentNodesAndEdgesToStateWithMutatingState(newState, [
            ...getCurrentNodesAndEdgesFromState(newState).nodes,
            { ...nodeAndSelect, selected: true },
          ]);
          break;
        case actionTypesMap.UPDATE_NODE_BY_REACT_FLOW:
          const nodeChanges = action.payload.changes;
          newState = setCurrentNodesAndEdgesToStateWithMutatingState(
            newState,
            applyNodeChanges(
              nodeChanges,
              getCurrentNodesAndEdgesFromState(newState).nodes,
            ),
          );
          break;
        case actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW:
          const edgeChanges = action.payload.changes;
          for (const edgeChange of edgeChanges) {
            if (edgeChange.type !== 'remove') {
              newState = setCurrentNodesAndEdgesToStateWithMutatingState(
                newState,
                undefined,
                applyEdgeChanges(
                  [edgeChange],
                  getCurrentNodesAndEdgesFromState(newState).edges,
                ),
              );
              continue;
            }
            const { id: edgeId } = edgeChange;
            const edge = getCurrentNodesAndEdgesFromState(newState).edges.find(
              (edge) => edge.id === edgeId,
            );
            if (!edge) {
              continue;
            }
            const removedEdgeResult = removeEdgeWithTypeChecking(
              edge,
              {
                ...newState,
                nodes: getCurrentNodesAndEdgesFromState(newState).nodes,
                edges: getCurrentNodesAndEdgesFromState(newState).edges,
              },
              edgeChange,
            );
            if (!removedEdgeResult.validation.isValid) {
              continue;
            }
            newState = setCurrentNodesAndEdgesToStateWithMutatingState(
              newState,
              removedEdgeResult.updatedNodes,
              removedEdgeResult.updatedEdges,
            );
          }

          break;
        case actionTypesMap.ADD_EDGE_BY_REACT_FLOW:
          const newEdge = action.payload.edge;

          const { sourceHandle, targetHandle, source, target } = newEdge;

          if (
            newState.enableCycleChecking &&
            willAddingEdgeCreateCycle(
              {
                ...newState,
                nodes: getCurrentNodesAndEdgesFromState(newState).nodes,
                edges: getCurrentNodesAndEdgesFromState(newState).edges,
              },
              source,
              target,
            )
          ) {
            break;
          }

          if (!source || !target || !sourceHandle || !targetHandle) {
            break;
          }

          // Use the addEdgeWithTypeChecking function
          const addedEdgeResult = addEdgeWithTypeChecking(
            source,
            sourceHandle,
            target,
            targetHandle,
            {
              ...newState,
              nodes: getCurrentNodesAndEdgesFromState(newState).nodes,
              edges: getCurrentNodesAndEdgesFromState(newState).edges,
            },
          );
          if (!addedEdgeResult.validation.isValid) {
            break;
          }
          newState = setCurrentNodesAndEdgesToStateWithMutatingState(
            newState,
            addedEdgeResult.updatedNodes,
            addedEdgeResult.updatedEdges,
          );
          break;
        case actionTypesMap.OPEN_NODE_GROUP:
          //If nodeId is provided, we are opening an instance of the node group
          if ('nodeId' in action.payload) {
            const openNodeId = action.payload.nodeId;
            // Find the node to get its type
            const nodeToOpen = newState.nodes.find(
              (node) => node.id === openNodeId,
            );
            if (!nodeToOpen) {
              break;
            }
            const nodeType = nodeToOpen.data.nodeTypeUniqueId;
            if (!nodeType) {
              break;
            }
            const nodeTypeToOpen = newState.typeOfNodes[nodeType];
            if (!nodeTypeToOpen || !nodeTypeToOpen.subtree) {
              //Not a valid node group
              break;
            }
            //Push the node group onto the stack (instance opening)
            newState.openedNodeGroupStack = [
              ...(newState.openedNodeGroupStack || []),
              {
                nodeType: nodeType,
                nodeId: openNodeId,
                previousViewport: newState.viewport,
              },
            ];
          } else {
            //Clear the stack and push the node group onto the stack (original opening hence has no nodeId)
            const nodeType = action.payload.nodeType;
            const nodeTypeToOpen = newState.typeOfNodes[nodeType];
            if (!nodeTypeToOpen || !nodeTypeToOpen.subtree) {
              //Not a valid node group
              break;
            }
            //No history
            newState.openedNodeGroupStack = [
              {
                nodeType: nodeType,
              },
            ];
          }
          break;
        case actionTypesMap.ADD_NODE_GROUP:
          const groupNodeType = generateRandomString(lengthOfIds);
          const groupInputNodeId = generateRandomString(lengthOfIds);
          const groupInputNode: (typeof newState.nodes)[number] =
            constructNodeOfType(
              newState.dataTypes,
              //@ts-ignore we assume standard node types are always added in state
              standardNodeTypeNamesMap.groupInput,
              newState.typeOfNodes,
              groupInputNodeId,
              { x: -500, y: 0 },
            );
          const groupOutputNodeId = generateRandomString(lengthOfIds);
          const groupOutputNode: (typeof newState.nodes)[number] =
            constructNodeOfType(
              newState.dataTypes,
              //@ts-ignore we assume standard node types are always added in state
              standardNodeTypeNamesMap.groupOutput,
              newState.typeOfNodes,
              groupOutputNodeId,
              { x: 500, y: 0 },
            );
          const nodeGroup: (typeof newState.typeOfNodes)[NodeTypeUniqueId] = {
            name: 'Node Group',
            headerColor: '#344621',
            inputs: [],
            outputs: [],
            subtree: {
              nodes: [groupInputNode, groupOutputNode],
              edges: [],
              numberOfReferences: 0,
              inputNodeId: groupInputNodeId,
              outputNodeId: groupOutputNodeId,
            },
          };
          newState.typeOfNodes[groupNodeType as NodeTypeUniqueId] = nodeGroup;
          newState.openedNodeGroupStack = [
            {
              nodeType: groupNodeType as NodeTypeUniqueId,
            },
          ];
          newState.viewport = undefined;
          break;
        case actionTypesMap.SET_VIEWPORT:
          newState.viewport = action.payload.viewport;
          break;
      }
    },
  );
  return newState;
}

export { mainReducer, actionTypesMap };

export type { Action };
