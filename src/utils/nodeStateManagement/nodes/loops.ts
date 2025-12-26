import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import { constructTypeOfHandleFromIndices } from './constructAndModifyNodes';
import { insertOrDeleteHandleInNodeDataUsingHandleIndices } from '../handles/handleSetters';
import type { ConnectionValidationResult } from '../newOrRemovedEdgeValidation';
import {
  standardDataTypeNamesMap,
  standardNodeTypeNamesMap,
} from '../standardNodes';
import { getOutgoers, getIncomers } from '@xyflow/react';
import {
  getAllHandlesFromNodeData,
  getHandleFromNodeDataFromIndices,
} from '../handles/handleGetters';
import type { HandleIndices } from '../handles/types';

const loopStartInputInferHandleIndex = 0;
const loopStartOutputInferHandleIndex = 1;
const loopStopInputInferHandleIndex = 2;
const loopStopOutputInferHandleIndex = 1;
const loopEndInputInferHandleIndex = 1;
const loopEndOutputInferHandleIndex = 0;

function getLoopNodeInferHandleIndex(
  nodeTypeUniqueId: string,
  type: 'input' | 'output',
): number {
  if (nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart) {
    return type === 'input'
      ? loopStartInputInferHandleIndex
      : loopStartOutputInferHandleIndex;
  }
  if (nodeTypeUniqueId === standardNodeTypeNamesMap.loopStop) {
    return type === 'input'
      ? loopStopInputInferHandleIndex
      : loopStopOutputInferHandleIndex;
  }
  return type === 'input'
    ? loopEndInputInferHandleIndex
    : loopEndOutputInferHandleIndex;
}

/**
 * Checks if a node is a loop node (loopStart, loopEnd, or loopStop)
 *
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @param nodeTypeUniqueId - The node type unique ID to check
 * @returns True if the node is a loop node
 */
function isLoopNode<NodeTypeUniqueId extends string = string>(
  nodeTypeUniqueId: NodeTypeUniqueId,
): boolean {
  return (
    nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart ||
    nodeTypeUniqueId === standardNodeTypeNamesMap.loopEnd ||
    nodeTypeUniqueId === standardNodeTypeNamesMap.loopStop
  );
}

/**
 * Adds duplicate handles to loop nodes when a loopInfer handle gets inferred
 *
 * When a loopInfer handle gets inferred on loopStart, loopEnd, or loopStop nodes,
 * BOTH input and output handles are duplicated to allow further connections.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param sourceNodeIndex - Index of the source node
 * @param targetNodeIndex - Index of the target node
 * @param sourceHandle - The source handle
 * @param targetHandle - The target handle
 * @param unmodifiedState - The unmodified state before edge addition
 * @param isSourceHandleInferredFromConnection - Whether source handle is inferred from connection
 * @param isTargetHandleInferredFromConnection - Whether target handle is inferred from connection
 * @returns Validation result indicating success or failure
 */
function addDuplicateHandlesToLoopNodesAfterInference<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  sourceNodeIndex: number,
  targetNodeIndex: number,
  isSourceHandleInferredFromConnection: boolean,
  isTargetHandleInferredFromConnection: boolean,
): {
  validation: ConnectionValidationResult;
} {
  const sourceNode = state.nodes[sourceNodeIndex];
  const targetNode = state.nodes[targetNodeIndex];
  const sourceNodeType = sourceNode.data.nodeTypeUniqueId;
  const targetNodeType = targetNode.data.nodeTypeUniqueId;

  if (!sourceNodeType || !targetNodeType) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target node type not found',
      },
    };
  }

  const isSourceNodeLoopNode = isLoopNode(sourceNodeType);
  const isTargetNodeLoopNode = isLoopNode(targetNodeType);

  // If both nodes are not loop nodes, no duplicate handles needed
  if (!isSourceNodeLoopNode && !isTargetNodeLoopNode) {
    return {
      validation: {
        isValid: true,
      },
    };
  }

  // Process source node if it's a loop node and its handle got inferred
  if (isSourceNodeLoopNode && isSourceHandleInferredFromConnection) {
    // Duplicate input handle
    const newDuplicateInputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      sourceNodeType,
      state.typeOfNodes,
      {
        type: 'input',
        index1: getLoopNodeInferHandleIndex(sourceNodeType, 'input'),
        index2: undefined,
      },
    );

    if (!newDuplicateInputHandle) {
      return {
        validation: {
          isValid: false,
          reason: 'New duplicate input handle not found for source loop node',
        },
      };
    }

    insertOrDeleteHandleInNodeDataUsingHandleIndices<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >(
      sourceNode.data,
      {
        type: 'input',
        index1: -1,
        index2: undefined,
      },
      0,
      newDuplicateInputHandle,
      true,
      'after',
    );

    // Duplicate output handle
    const newDuplicateOutputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      sourceNodeType,
      state.typeOfNodes,
      {
        type: 'output',
        index1: getLoopNodeInferHandleIndex(sourceNodeType, 'output'),
        index2: undefined,
      },
    );

    if (!newDuplicateOutputHandle) {
      return {
        validation: {
          isValid: false,
          reason: 'New duplicate output handle not found for source loop node',
        },
      };
    }

    insertOrDeleteHandleInNodeDataUsingHandleIndices<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >(
      sourceNode.data,
      {
        type: 'output',
        index1: -1,
        index2: undefined,
      },
      0,
      newDuplicateOutputHandle,
      true,
      'after',
    );
  }

  // Process target node if it's a loop node and its handle got inferred
  if (isTargetNodeLoopNode && isTargetHandleInferredFromConnection) {
    // Duplicate input handle
    const newDuplicateInputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      targetNodeType,
      state.typeOfNodes,
      {
        type: 'input',
        index1: getLoopNodeInferHandleIndex(targetNodeType, 'input'),
        index2: undefined,
      },
    );

    if (!newDuplicateInputHandle) {
      return {
        validation: {
          isValid: false,
          reason: 'New duplicate input handle not found for target loop node',
        },
      };
    }

    insertOrDeleteHandleInNodeDataUsingHandleIndices<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >(
      targetNode.data,
      {
        type: 'input',
        index1: -1,
        index2: undefined,
      },
      0,
      newDuplicateInputHandle,
      true,
      'after',
    );

    // Duplicate output handle
    const newDuplicateOutputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      targetNodeType,
      state.typeOfNodes,
      {
        type: 'output',
        index1: getLoopNodeInferHandleIndex(targetNodeType, 'output'),
        index2: undefined,
      },
    );

    if (!newDuplicateOutputHandle) {
      return {
        validation: {
          isValid: false,
          reason: 'New duplicate output handle not found for target loop node',
        },
      };
    }

    insertOrDeleteHandleInNodeDataUsingHandleIndices<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >(
      targetNode.data,
      {
        type: 'output',
        index1: -1,
        index2: undefined,
      },
      0,
      newDuplicateOutputHandle,
      true,
      'after',
    );
  }

  return {
    validation: { isValid: true },
  };
}

/**
 * Gets all nodes reachable from a given node in both forward and backward directions
 * This includes all nodes that can be reached by following edges in any direction (zigzag paths)
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param startNodeId - ID of the starting node
 * @returns Set of all reachable node IDs
 */
function getAllReachableNodes<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  startNodeId: string,
): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [startNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);
    reachable.add(currentNodeId);

    const currentNode = state.nodes.find((node) => node.id === currentNodeId);
    if (!currentNode) {
      continue;
    }

    // Get all outgoers (forward direction)
    const outgoers = getOutgoers(currentNode, state.nodes, state.edges);
    for (const outgoer of outgoers) {
      if (!visited.has(outgoer.id)) {
        queue.push(outgoer.id);
      }
    }

    // Get all incomers (backward direction)
    const incomers = getIncomers(currentNode, state.nodes, state.edges);
    for (const incomer of incomers) {
      if (!visited.has(incomer.id)) {
        queue.push(incomer.id);
      }
    }
  }

  return reachable;
}

/**
 * Checks if there's any path between two sets of nodes
 *
 * @param sourceReachable - Set of node IDs reachable from source
 * @param targetReachable - Set of node IDs reachable from target
 * @returns True if there's any path between the two sets
 */
function hasPathBetweenNodeSets(
  sourceReachable: Set<string>,
  targetReachable: Set<string>,
): boolean {
  // Check if any node from source is reachable from target or vice versa
  for (const sourceNodeId of sourceReachable) {
    if (targetReachable.has(sourceNodeId)) {
      return true;
    }
  }
  return false;
}

/**
 * Represents a loop triplet or pair structure
 */
type LoopStructure<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  loopStart: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number];
  loopStop: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number];
  loopEnd: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number];
};

/**
 * Finds all loop triplets and pairs in the graph
 * A triplet is loopStart -> loopStop -> loopEnd
 * A pair can be loopStart -> loopStop or loopStop -> loopEnd
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param startNodeId - Starting node ID to find reachable loops from
 * @returns Array of loop structures (triplets or pairs)
 */
function findAllReachableLoopStructures<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  startNodeId: string,
): LoopStructure[] {
  const reachableNodes = getAllReachableNodes(state, startNodeId);
  const loopStructures: LoopStructure[] = [];
  const processedStructures = new Set<string>();

  // Find all loop nodes in reachable set
  const loopStartNodes: string[] = [];
  const loopStopNodes: string[] = [];
  const loopEndNodes: string[] = [];

  for (const nodeId of reachableNodes) {
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node?.data.nodeTypeUniqueId) {
      continue;
    }

    const nodeType = node.data.nodeTypeUniqueId;
    if (nodeType === standardNodeTypeNamesMap.loopStart) {
      loopStartNodes.push(nodeId);
    } else if (nodeType === standardNodeTypeNamesMap.loopStop) {
      loopStopNodes.push(nodeId);
    } else if (nodeType === standardNodeTypeNamesMap.loopEnd) {
      loopEndNodes.push(nodeId);
    }
  }

  // Try to form triplets: loopStart -> loopStop -> loopEnd
  for (const loopStartId of loopStartNodes) {
    const loopStartNode = state.nodes.find((n) => n.id === loopStartId);
    if (!loopStartNode) continue;

    const loopStartOutgoers = getOutgoers(
      loopStartNode,
      state.nodes,
      state.edges,
    );
    for (const outgoer of loopStartOutgoers) {
      if (outgoer.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStop) {
        const loopStopId = outgoer.id;
        const loopStopOutgoers = getOutgoers(outgoer, state.nodes, state.edges);
        for (const loopEndCandidate of loopStopOutgoers) {
          if (
            loopEndCandidate.data.nodeTypeUniqueId ===
            standardNodeTypeNamesMap.loopEnd
          ) {
            const structureKey = `${loopStartId}-${loopStopId}-${loopEndCandidate.id}`;
            if (!processedStructures.has(structureKey)) {
              processedStructures.add(structureKey);
              loopStructures.push({
                loopStart: loopStartId,
                loopStop: loopStopId,
                loopEnd: loopEndCandidate.id,
              });
            }
          }
        }
      }
    }
  }

  // Find incomplete pairs: loopStart -> loopStop (without loopEnd)
  for (const loopStartId of loopStartNodes) {
    const loopStartNode = state.nodes.find((n) => n.id === loopStartId);
    if (!loopStartNode) continue;

    const loopStartOutgoers = getOutgoers(
      loopStartNode,
      state.nodes,
      state.edges,
    );
    for (const outgoer of loopStartOutgoers) {
      if (outgoer.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStop) {
        const loopStopId = outgoer.id;
        // Check if this loopStop is already part of a triplet
        const isPartOfTriplet = loopStructures.some(
          (struct) => struct.loopStop === loopStopId,
        );
        if (!isPartOfTriplet) {
          const structureKey = `${loopStartId}-${loopStopId}`;
          if (!processedStructures.has(structureKey)) {
            processedStructures.add(structureKey);
            loopStructures.push({
              loopStart: loopStartId,
              loopStop: loopStopId,
            });
          }
        }
      }
    }
  }

  // Find incomplete pairs: loopStop -> loopEnd (without loopStart)
  for (const loopStopId of loopStopNodes) {
    const loopStopNode = state.nodes.find((n) => n.id === loopStopId);
    if (!loopStopNode) continue;

    const loopStopOutgoers = getOutgoers(
      loopStopNode,
      state.nodes,
      state.edges,
    );
    for (const outgoer of loopStopOutgoers) {
      if (outgoer.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopEnd) {
        const loopEndId = outgoer.id;
        // Check if this loopStop is already part of a triplet
        const isPartOfTriplet = loopStructures.some(
          (struct) =>
            struct.loopStop === loopStopId && struct.loopEnd === loopEndId,
        );
        if (!isPartOfTriplet) {
          const structureKey = `${loopStopId}-${loopEndId}`;
          if (!processedStructures.has(structureKey)) {
            processedStructures.add(structureKey);
            loopStructures.push({
              loopStop: loopStopId,
              loopEnd: loopEndId,
            });
          }
        }
      }
    }
  }

  return loopStructures;
}

/**
 * Gets all nodes inside a loop region (between loopStart and loopStop, or between loopStop and loopEnd)
 * Uses bidirectional traversal to handle zigzag paths - regions are only separated by loop nodes
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param loopStructure - The loop structure to analyze
 * @param region - Which region to get nodes from: 'startToStop' or 'stopToEnd'
 * @returns Set of node IDs inside the specified region
 */
function getNodesInLoopRegion<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  loopStructure: LoopStructure,
  region: 'startToStop' | 'stopToEnd',
): Set<string> {
  const nodesInRegion = new Set<string>();

  if (
    region === 'startToStop' &&
    loopStructure.loopStart &&
    loopStructure.loopStop
  ) {
    // Bidirectional BFS: start from loopStart and loopStop, traverse in both directions
    // Stop when we hit the boundary loop nodes
    const queue: string[] = [loopStructure.loopStart, loopStructure.loopStop];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId || visited.has(currentNodeId)) {
        continue;
      }

      visited.add(currentNodeId);

      // Don't include loopStart or loopStop themselves in the region
      if (
        currentNodeId !== loopStructure.loopStart &&
        currentNodeId !== loopStructure.loopStop
      ) {
        nodesInRegion.add(currentNodeId);
      }

      const currentNode: (typeof state.nodes)[number] | undefined =
        state.nodes.find((n) => n.id === currentNodeId);
      if (!currentNode) continue;

      // Traverse forward (outgoers)
      const outgoers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopStop
          ? getOutgoers(currentNode, state.nodes, state.edges)
          : [];
      for (const outgoer of outgoers) {
        // Check if outgoer is a loop node (other than our boundaries) - if so, it's a boundary
        const outgoerType = outgoer.data.nodeTypeUniqueId;
        if (outgoerType && isLoopNode(outgoerType)) {
          // This is another loop node, it's a boundary - don't traverse
          continue;
        }
        if (!visited.has(outgoer.id)) {
          queue.push(outgoer.id);
        }
      }

      // Traverse backward (incomers) to handle zigzag paths
      const incomers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopStart
          ? getIncomers(currentNode, state.nodes, state.edges)
          : [];
      for (const incomer of incomers) {
        // Check if incomer is a loop node (other than our boundaries) - if so, it's a boundary
        const incomerType = incomer.data.nodeTypeUniqueId;
        if (incomerType && isLoopNode(incomerType)) {
          // This is another loop node, it's a boundary - don't traverse
          continue;
        }
        if (!visited.has(incomer.id)) {
          queue.push(incomer.id);
        }
      }
    }
  } else if (
    region === 'stopToEnd' &&
    loopStructure.loopStop &&
    loopStructure.loopEnd
  ) {
    // Bidirectional BFS: start from loopStop and loopEnd, traverse in both directions
    // Stop when we hit the boundary loop nodes
    const queue: string[] = [loopStructure.loopStop, loopStructure.loopEnd];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId || visited.has(currentNodeId)) {
        continue;
      }

      visited.add(currentNodeId);

      // Don't include loopStop or loopEnd themselves in the region
      if (
        currentNodeId !== loopStructure.loopStop &&
        currentNodeId !== loopStructure.loopEnd
      ) {
        nodesInRegion.add(currentNodeId);
      }

      const currentNode: (typeof state.nodes)[number] | undefined =
        state.nodes.find((n) => n.id === currentNodeId);
      if (!currentNode) continue;

      // Traverse forward (outgoers)
      const outgoers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopEnd
          ? getOutgoers(currentNode, state.nodes, state.edges)
          : [];
      for (const outgoer of outgoers) {
        if (outgoer.id === loopStructure.loopEnd) {
          // Reached loopEnd boundary, don't traverse further
          continue;
        }
        // Check if outgoer is a loop node (other than our boundaries) - if so, it's a boundary
        const outgoerType = outgoer.data.nodeTypeUniqueId;
        if (outgoerType && isLoopNode(outgoerType)) {
          // This is another loop node, it's a boundary - don't traverse
          continue;
        }
        if (!visited.has(outgoer.id)) {
          queue.push(outgoer.id);
        }
      }

      // Traverse backward (incomers) to handle zigzag paths
      const incomers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopStop
          ? getIncomers(currentNode, state.nodes, state.edges)
          : [];
      for (const incomer of incomers) {
        if (incomer.id === loopStructure.loopStop) {
          // Reached loopStop boundary, don't traverse further
          continue;
        }
        // Check if incomer is a loop node (other than our boundaries) - if so, it's a boundary
        const incomerType = incomer.data.nodeTypeUniqueId;
        if (incomerType && isLoopNode(incomerType)) {
          // This is another loop node, it's a boundary - don't traverse
          continue;
        }
        if (!visited.has(incomer.id)) {
          queue.push(incomer.id);
        }
      }
    }
  }

  return nodesInRegion;
}

/**
 * Gets all nodes outside a loop structure (not in any region)
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param loopStructure - The loop structure to analyze
 * @returns Set of node IDs outside the loop structure
 */
function getNodesOutsideLoop<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  loopStructure: LoopStructure,
): Set<string> {
  const allNodes = new Set(state.nodes.map((n) => n.id));
  const nodesInLoop = new Set<string>();

  // Add loop nodes themselves
  if (loopStructure.loopStart) nodesInLoop.add(loopStructure.loopStart);
  if (loopStructure.loopStop) nodesInLoop.add(loopStructure.loopStop);
  if (loopStructure.loopEnd) nodesInLoop.add(loopStructure.loopEnd);

  // Add nodes in startToStop region
  if (loopStructure.loopStart && loopStructure.loopStop) {
    const startToStopNodes = getNodesInLoopRegion(
      state,
      loopStructure,
      'startToStop',
    );
    for (const nodeId of startToStopNodes) {
      nodesInLoop.add(nodeId);
    }
  }

  // Add nodes in stopToEnd region
  if (loopStructure.loopStop && loopStructure.loopEnd) {
    const stopToEndNodes = getNodesInLoopRegion(
      state,
      loopStructure,
      'stopToEnd',
    );
    for (const nodeId of stopToEndNodes) {
      nodesInLoop.add(nodeId);
    }
  }

  // Nodes outside are all nodes minus nodes in loop
  const nodesOutside = new Set<string>();
  for (const nodeId of allNodes) {
    if (!nodesInLoop.has(nodeId)) {
      nodesOutside.add(nodeId);
    }
  }

  return nodesOutside;
}

function getLoopStructureFromNode<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  nodeToSearchFrom: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number],
):
  | LoopStructure<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  | undefined {
  let loopStartOrUndefined:
    | LoopStructure<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['loopStart']
    | undefined;
  let loopStopOrUndefined:
    | LoopStructure<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['loopStop']
    | undefined;
  let loopEndOrUndefined:
    | LoopStructure<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['loopEnd']
    | undefined;

  if (
    nodeToSearchFrom.data.nodeTypeUniqueId ===
    standardNodeTypeNamesMap.loopStart
  ) {
    loopStartOrUndefined = nodeToSearchFrom;

    //Search for loopStop
    const idOfLoopBindHandle = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof nodeToSearchFrom.data
    >(
      {
        type: 'output',
        index1: 0,
        index2: undefined,
      },
      nodeToSearchFrom.data,
    )?.value?.id;
    if (!idOfLoopBindHandle) {
      return undefined;
    }
    const connectionOfThisHandle = state.edges.find(
      (edge) => edge.sourceHandle === idOfLoopBindHandle,
    );
    if (!connectionOfThisHandle) {
      return undefined;
    }
    const targetNode = state.nodes.find(
      (n) => n.id === connectionOfThisHandle.target,
    );
    if (!targetNode) {
      return undefined;
    }
    if (
      targetNode.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.loopStop
    ) {
      return undefined;
    }
    loopStopOrUndefined = targetNode;

    //Search for loopEnd
    const id2OfLoopBindHandle = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof targetNode.data
    >(
      {
        type: 'output',
        index1: 0,
        index2: undefined,
      },
      targetNode.data,
    )?.value?.id;
    if (!id2OfLoopBindHandle) {
      return undefined;
    }
    const connectionOfThisHandle2 = state.edges.find(
      (edge) => edge.sourceHandle === id2OfLoopBindHandle,
    );
    if (!connectionOfThisHandle2) {
      return undefined;
    }
    const targetNode2 = state.nodes.find(
      (n) => n.id === connectionOfThisHandle2.target,
    );
    if (!targetNode2) {
      return undefined;
    }
    if (
      targetNode2.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.loopEnd
    ) {
      return undefined;
    }
    loopEndOrUndefined = targetNode2;
  } else if (
    nodeToSearchFrom.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStop
  ) {
    loopStopOrUndefined = nodeToSearchFrom;

    //Search for loopStart
    const idOfLoopBindHandle = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof nodeToSearchFrom.data
    >(
      {
        type: 'input',
        index1: 0,
        index2: undefined,
      },
      nodeToSearchFrom.data,
    )?.value?.id;
    if (!idOfLoopBindHandle) {
      return undefined;
    }
    const connectionOfThisHandle = state.edges.find(
      (edge) => edge.targetHandle === idOfLoopBindHandle,
    );
    if (!connectionOfThisHandle) {
      return undefined;
    }
    const sourceNode = state.nodes.find(
      (n) => n.id === connectionOfThisHandle.source,
    );
    if (!sourceNode) {
      return undefined;
    }
    if (
      sourceNode.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.loopStart
    ) {
      return undefined;
    }
    loopStartOrUndefined = sourceNode;

    //Search for loopEnd
    const id2OfLoopBindHandle = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof nodeToSearchFrom.data
    >(
      {
        type: 'output',
        index1: 0,
        index2: undefined,
      },
      nodeToSearchFrom.data,
    )?.value?.id;
    if (!id2OfLoopBindHandle) {
      return undefined;
    }
    const connectionOfThisHandle2 = state.edges.find(
      (edge) => edge.sourceHandle === id2OfLoopBindHandle,
    );
    if (!connectionOfThisHandle2) {
      return undefined;
    }
    const targetNode2 = state.nodes.find(
      (n) => n.id === connectionOfThisHandle2.target,
    );
    if (!targetNode2) {
      return undefined;
    }
    if (
      targetNode2.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.loopEnd
    ) {
      return undefined;
    }
    loopEndOrUndefined = targetNode2;
  } else if (
    nodeToSearchFrom.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopEnd
  ) {
    loopEndOrUndefined = nodeToSearchFrom;

    //Search for loopStop
    const idOfLoopBindHandle = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof nodeToSearchFrom.data
    >(
      {
        type: 'input',
        index1: 0,
        index2: undefined,
      },
      nodeToSearchFrom.data,
    )?.value?.id;
    if (!idOfLoopBindHandle) {
      return undefined;
    }
    const connectionOfThisHandle = state.edges.find(
      (edge) => edge.targetHandle === idOfLoopBindHandle,
    );
    if (!connectionOfThisHandle) {
      return undefined;
    }
    const sourceNode = state.nodes.find(
      (n) => n.id === connectionOfThisHandle.source,
    );
    if (!sourceNode) {
      return undefined;
    }
    if (
      sourceNode.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.loopStop
    ) {
      return undefined;
    }
    loopStopOrUndefined = sourceNode;

    //Search for loopStart
    const id2OfLoopBindHandle = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof sourceNode.data
    >(
      {
        type: 'input',
        index1: 0,
        index2: undefined,
      },
      sourceNode.data,
    )?.value?.id;
    if (!id2OfLoopBindHandle) {
      return undefined;
    }
    const connectionOfThisHandle2 = state.edges.find(
      (edge) => edge.targetHandle === id2OfLoopBindHandle,
    );
    if (!connectionOfThisHandle2) {
      return undefined;
    }
    const targetNode2 = state.nodes.find(
      (n) => n.id === connectionOfThisHandle2.source,
    );
    if (!targetNode2) {
      return undefined;
    }
    if (
      targetNode2.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.loopStart
    ) {
      return undefined;
    }
    loopStartOrUndefined = targetNode2;
  }

  if (loopStartOrUndefined && loopStopOrUndefined && loopEndOrUndefined) {
    return {
      loopStart: loopStartOrUndefined,
      loopStop: loopStopOrUndefined,
      loopEnd: loopEndOrUndefined,
    };
  }
  return undefined;
}

function verifyLoopStructureUniformHandleInference<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  loopStructure: LoopStructure<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): {
  validation: ConnectionValidationResult;
} {
  const loopStart = loopStructure.loopStart;
  const loopStop = loopStructure.loopStop;
  const loopEnd = loopStructure.loopEnd;

  const allHandlesLoopStart = getAllHandlesFromNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof loopStart.data
  >(loopStart.data);

  const allHandlesLoopStop = getAllHandlesFromNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof loopStop.data
  >(loopStop.data);

  const allHandlesLoopEnd = getAllHandlesFromNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof loopEnd.data
  >(loopEnd.data);

  const numberOfInferredInputLoopHandlesLoopStart =
    allHandlesLoopStart.inputsAndIndices.length -
    (loopStartInputInferHandleIndex + 1);
  const numberOfInferredOutputLoopHandlesLoopStart =
    allHandlesLoopStart.outputsAndIndices.length -
    (loopStartOutputInferHandleIndex + 1);
  const numberOfInferredInputLoopHandlesLoopStop =
    allHandlesLoopStop.inputsAndIndices.length -
    (loopStopInputInferHandleIndex + 1);
  const numberOfInferredOutputLoopHandlesLoopStop =
    allHandlesLoopStop.outputsAndIndices.length -
    (loopStopOutputInferHandleIndex + 1);
  const numberOfInferredInputLoopHandlesLoopEnd =
    allHandlesLoopEnd.inputsAndIndices.length -
    (loopEndInputInferHandleIndex + 1);
  const numberOfInferredOutputLoopHandlesLoopEnd =
    allHandlesLoopEnd.outputsAndIndices.length -
    (loopEndOutputInferHandleIndex + 1);

  const allNumberOfInferredLoopHandles = [
    numberOfInferredInputLoopHandlesLoopStart,
    numberOfInferredOutputLoopHandlesLoopStart,
    numberOfInferredInputLoopHandlesLoopStop,
    numberOfInferredOutputLoopHandlesLoopStop,
    numberOfInferredInputLoopHandlesLoopEnd,
    numberOfInferredOutputLoopHandlesLoopEnd,
  ];

  const areAllNumberOfInferredLoopHandlesEqual =
    allNumberOfInferredLoopHandles.every(
      (v) => v === allNumberOfInferredLoopHandles[0],
    );
  if (!areAllNumberOfInferredLoopHandlesEqual) {
    return {
      validation: {
        isValid: false,
        reason: 'Loop structure has different number of inferred handles',
      },
    };
  }

  for (let i = 0; i < allNumberOfInferredLoopHandles[0] - 1; i++) {
    const inputLoopHandleLoopStart =
      allHandlesLoopStart.inputsAndIndices[
        i + loopStartInputInferHandleIndex + 1
      ];
    const outputLoopHandleLoopStart =
      allHandlesLoopStart.outputsAndIndices[
        i + loopStartOutputInferHandleIndex + 1
      ];
    const inputLoopHandleLoopStop =
      allHandlesLoopStop.inputsAndIndices[
        i + loopStopInputInferHandleIndex + 1
      ];
    const outputLoopHandleLoopStop =
      allHandlesLoopStop.outputsAndIndices[
        i + loopStopOutputInferHandleIndex + 1
      ];
    const inputLoopHandleLoopEnd =
      allHandlesLoopEnd.inputsAndIndices[i + loopEndInputInferHandleIndex + 1];
    const outputLoopHandleLoopEnd =
      allHandlesLoopEnd.outputsAndIndices[
        i + loopEndOutputInferHandleIndex + 1
      ];

    const allHandles = [
      inputLoopHandleLoopStart,
      outputLoopHandleLoopStart,
      inputLoopHandleLoopStop,
      outputLoopHandleLoopStop,
      inputLoopHandleLoopEnd,
      outputLoopHandleLoopEnd,
    ];

    const areAllHandleTypesEqual = allHandles.every(
      (v) =>
        v.value?.dataType?.dataTypeUniqueId &&
        allHandles[0].value?.dataType?.dataTypeUniqueId &&
        v.value?.dataType?.dataTypeUniqueId ===
          allHandles[0].value?.dataType?.dataTypeUniqueId,
    );
    if (!areAllHandleTypesEqual) {
      return {
        validation: {
          isValid: false,
          reason: 'Loop structure has different handle types',
        },
      };
    }

    //Check connections
  }

  return {
    validation: { isValid: true },
  };
}
/**
 * Checks if any path between source and target nodes contains loop nodes
 *
 * A connection cannot happen between a handle before loopStart and after loopStart.
 * This function checks all possible paths between sourceNode and targetNode, and if
 * any loopStart, loopEnd, or loopStop is found in any path, the connection is not allowed.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param sourceNode - The source node
 * @param targetNode - The target node
 * @returns Validation result indicating if the connection is allowed
 */
function isLoopConnectionValid<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  sourceNode: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number],
  targetNode: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number],
  sourceHandleIndex: HandleIndices,
  targetHandleIndex: HandleIndices,
): {
  validation: ConnectionValidationResult;
} {
  const sourceNodeId = sourceNode.id;
  const targetNodeId = targetNode.id;
  const sourceNodeType = sourceNode.data.nodeTypeUniqueId;
  const targetNodeType = targetNode.data.nodeTypeUniqueId;

  if (!sourceNodeType || !targetNodeType) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target node type not found',
      },
    };
  }

  const sourceHandle = getHandleFromNodeDataFromIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof sourceNode.data,
    typeof sourceHandleIndex
  >(sourceHandleIndex, sourceNode.data)?.value;
  const targetHandle = getHandleFromNodeDataFromIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof targetNode.data,
    typeof targetHandleIndex
  >(targetHandleIndex, targetNode.data)?.value;

  const sourceHandleDataType = sourceHandle?.dataType;
  const targetHandleDataType = targetHandle?.dataType;

  if (!sourceHandleDataType || !targetHandleDataType) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target handle data type not found',
      },
    };
  }

  const isSourceLoopNode = isLoopNode(sourceNodeType);
  const isTargetLoopNode = isLoopNode(targetNodeType);

  // Case 1: Both nodes are loop nodes
  if (isSourceLoopNode && isTargetLoopNode) {
    const isLoopBindingConnection =
      sourceHandleDataType.dataTypeUniqueId ===
        standardDataTypeNamesMap.bindLoopNodes ||
      targetHandleDataType.dataTypeUniqueId ===
        standardDataTypeNamesMap.bindLoopNodes;

    if (isLoopBindingConnection) {
      // Check if connection is in valid order: loopStart<->loopStop<->loopEnd
      const isValidOrder =
        (sourceNodeType === standardNodeTypeNamesMap.loopStart &&
          targetNodeType === standardNodeTypeNamesMap.loopStop) ||
        (sourceNodeType === standardNodeTypeNamesMap.loopStop &&
          targetNodeType === standardNodeTypeNamesMap.loopEnd);

      if (!isValidOrder) {
        return {
          validation: {
            isValid: false,
            reason:
              'Loop nodes can only bind in order: loopStart<->loopStop<->loopEnd',
          },
        };
      }
    } else {
      const loopStructureSource = getLoopStructureFromNode(state, sourceNode);
      const loopStructureTarget = getLoopStructureFromNode(state, targetNode);
      if (!loopStructureSource || !loopStructureTarget) {
        return {
          validation: {
            isValid: false,
            reason: `${loopStructureSource ? 'Target' : 'Source'} loop structure not found`,
          },
        };
      }
    }

    return {
      validation: { isValid: true },
    };
  } else if (isSourceLoopNode || isTargetLoopNode) {
    const loopStructure = getLoopStructureFromNode(
      state,
      isSourceLoopNode ? sourceNode : targetNode,
    );
    if (!loopStructure) {
      return {
        validation: {
          isValid: false,
          reason: "Can't connect to incomplete loop structure",
        },
      };
    }
    if (isSourceLoopNode) {
    }
  }

  // // Case 2: None or only one is a loop node
  // // Find all reachable loop structures from both nodes
  // const sourceLoopStructures = findAllReachableLoopStructures(
  //   state,
  //   sourceNodeId,
  // );
  // const targetLoopStructures = findAllReachableLoopStructures(
  //   state,
  //   targetNodeId,
  // );

  // // Combine all unique loop structures
  // const allLoopStructures = new Map<string, LoopStructure>();
  // for (const structure of sourceLoopStructures) {
  //   const key = `${structure.loopStart || ''}-${structure.loopStop || ''}-${structure.loopEnd || ''}`;
  //   allLoopStructures.set(key, structure);
  // }
  // for (const structure of targetLoopStructures) {
  //   const key = `${structure.loopStart || ''}-${structure.loopStop || ''}-${structure.loopEnd || ''}`;
  //   allLoopStructures.set(key, structure);
  // }
  // console.log('allLoopStructures', allLoopStructures);

  // // Check each loop structure
  // for (const loopStructure of allLoopStructures.values()) {
  //   // Get nodes in each region
  //   const startToStopNodes =
  //     loopStructure.loopStart && loopStructure.loopStop
  //       ? getNodesInLoopRegion(state, loopStructure, 'startToStop')
  //       : new Set<string>();

  //   console.log(
  //     'startToStopNodes:',
  //     JSON.stringify(Array.from(startToStopNodes), null, 2),
  //   );
  //   const stopToEndNodes =
  //     loopStructure.loopStop && loopStructure.loopEnd
  //       ? getNodesInLoopRegion(state, loopStructure, 'stopToEnd')
  //       : new Set<string>();
  //   const nodesOutside = getNodesOutsideLoop(state, loopStructure);

  //   // Check if source node is reachable from the loop structure
  //   const sourceReachable = getAllReachableNodes(state, sourceNodeId);
  //   const targetReachable = getAllReachableNodes(state, targetNodeId);

  //   const isSourceReachableFromLoop =
  //     sourceReachable.has(loopStructure.loopStart || '') ||
  //     sourceReachable.has(loopStructure.loopStop || '') ||
  //     sourceReachable.has(loopStructure.loopEnd || '');

  //   const isTargetReachableFromLoop =
  //     targetReachable.has(loopStructure.loopStart || '') ||
  //     targetReachable.has(loopStructure.loopStop || '') ||
  //     targetReachable.has(loopStructure.loopEnd || '');

  //   // Determine which region each node is in
  //   const isSourceInStartToStop = startToStopNodes.has(sourceNodeId);
  //   const isSourceInStopToEnd = stopToEndNodes.has(sourceNodeId);
  //   const isSourceOutside = nodesOutside.has(sourceNodeId);
  //   const isSourceLoopStart = loopStructure.loopStart === sourceNodeId;
  //   const isSourceLoopStop = loopStructure.loopStop === sourceNodeId;
  //   const isSourceLoopEnd = loopStructure.loopEnd === sourceNodeId;
  //   const isSourceGroupInput = isGroupInputOrOutputNode(sourceNodeType);
  //   const isSourceGroupOutput = isGroupInputOrOutputNode(sourceNodeType);
  //   const isSourceUnreachable =
  //     !isSourceReachableFromLoop &&
  //     !isSourceLoopStart &&
  //     !isSourceLoopStop &&
  //     !isSourceLoopEnd;

  //   const isTargetInStartToStop = startToStopNodes.has(targetNodeId);
  //   const isTargetInStopToEnd = stopToEndNodes.has(targetNodeId);
  //   const isTargetOutside = nodesOutside.has(targetNodeId);
  //   const isTargetLoopStart = loopStructure.loopStart === targetNodeId;
  //   const isTargetLoopStop = loopStructure.loopStop === targetNodeId;
  //   const isTargetLoopEnd = loopStructure.loopEnd === targetNodeId;
  //   const isTargetGroupInput = isGroupInputOrOutputNode(targetNodeType);
  //   const isTargetGroupOutput = isGroupInputOrOutputNode(targetNodeType);
  //   const isTargetUnreachable =
  //     !isTargetReachableFromLoop &&
  //     !isTargetLoopStart &&
  //     !isTargetLoopStop &&
  //     !isTargetLoopEnd;

  //   console.log('isSourceUnreachable', isSourceUnreachable);
  //   console.log('isTargetUnreachable', isTargetUnreachable);
  //   console.log('isSourceOutside', isSourceOutside);
  //   console.log('isTargetOutside', isTargetOutside);
  //   console.log('isSourceInStartToStop', isSourceInStartToStop);
  //   console.log('isTargetInStartToStop', isTargetInStartToStop);
  //   console.log('isSourceInStopToEnd', isSourceInStopToEnd);
  //   console.log('isTargetInStopToEnd', isTargetInStopToEnd);
  //   console.log('isSourceLoopStart', isSourceLoopStart);
  //   console.log('isTargetLoopStart', isTargetLoopStart);
  //   console.log('isSourceLoopStop', isSourceLoopStop);
  //   console.log('isTargetLoopStop', isTargetLoopStop);
  //   console.log('isSourceLoopEnd', isSourceLoopEnd);
  //   console.log('isTargetLoopEnd', isTargetLoopEnd);

  //   // If both nodes are unreachable from this loop, they don't belong to any region
  //   // and can connect freely (they can join any region)
  //   if (isSourceUnreachable || isTargetUnreachable) {
  //     continue;
  //   }
  //   // If both nodes are outside, they can connect freely
  //   if (isSourceOutside && isTargetOutside) {
  //     continue;
  //   }
  //   // If source is outside and target is loopStart, they can connect freely
  //   if (isSourceOutside && isTargetLoopStart) {
  //     continue;
  //   }
  //   // If source is loopEnd and target is outside, they can connect freely
  //   if (isSourceLoopEnd && isTargetOutside) {
  //     continue;
  //   }

  //   // If both nodes are in the same region, they can connect freely
  //   if (isSourceInStartToStop && isTargetInStartToStop) {
  //     continue;
  //   }
  //   if (isSourceInStopToEnd && isTargetInStopToEnd) {
  //     continue;
  //   }

  //   //Order of connection: loopStart<->loopStop<->loopEnd
  //   if (isSourceLoopStart && isTargetLoopStop) {
  //     continue;
  //   }
  //   if (isSourceLoopStop && isTargetLoopEnd) {
  //     continue;
  //   }
  //   if (isSourceLoopEnd && isTargetLoopStart) {
  //     continue;
  //   }

  //   // Connection inside region loopStart<->loopStop
  //   if (isSourceInStartToStop && isTargetLoopStop) {
  //     continue;
  //   }
  //   if (isTargetInStartToStop && isSourceLoopStart) {
  //     continue;
  //   }
  //   // Connection inside region loopStop<->loopEnd
  //   if (isSourceInStopToEnd && isTargetLoopEnd) {
  //     continue;
  //   }
  //   if (isTargetInStopToEnd && isSourceLoopStop) {
  //     continue;
  //   }
  //   return {
  //     validation: {
  //       isValid: false,
  //       reason:
  //         'Loop nodes can only connect in order: loopStart<->loopStop<->loopEnd, and regions cannot be connected to each other',
  //     },
  //   };

  //   // // Validation rules:
  //   // // 1. Nodes in startToStop region can only connect within that region or to loopStop
  //   // // 2. Nodes in stopToEnd region can only connect within that region or to loopEnd
  //   // // 3. Nodes outside can only connect to loopStart or nodes outside, not to nodes inside regions
  //   // // 4. Nodes in startToStop region cannot connect to nodes in stopToEnd region (and vice versa)

  //   // // Explicitly disallow connections between startToStop and stopToEnd regions
  //   // if (isSourceInStartToStop && isTargetInStopToEnd) {
  //   //   return {
  //   //     validation: {
  //   //       isValid: false,
  //   //       reason: 'Nodes in loopStart->loopStop region cannot connect to nodes in loopStop->loopEnd region',
  //   //     },
  //   //   };
  //   // }

  //   // if (isSourceInStopToEnd && isTargetInStartToStop) {
  //   //   return {
  //   //     validation: {
  //   //       isValid: false,
  //   //       reason: 'Nodes in loopStop->loopEnd region cannot connect to nodes in loopStart->loopStop region',
  //   //     },
  //   //   };
  //   // }

  //   // // Check if source is trying to connect from an invalid position
  //   // if (isSourceInStartToStop || isSourceLoopStart) {
  //   //   // Source is in startToStop region or is loopStart
  //   //   // Can only connect to nodes in same region or to loopStop
  //   //   if (
  //   //     !isTargetInStartToStop &&
  //   //     !isTargetLoopStop &&
  //   //     !isTargetLoopStart
  //   //   ) {
  //   //     return {
  //   //       validation: {
  //   //         isValid: false,
  //   //         reason: 'Nodes in loopStart->loopStop region can only connect within that region or to loopStop',
  //   //       },
  //   //     };
  //   //   }
  //   // }

  //   // if (isSourceInStopToEnd || isSourceLoopStop) {
  //   //   // Source is in stopToEnd region or is loopStop
  //   //   // Can only connect to nodes in same region or to loopEnd
  //   //   if (
  //   //     !isTargetInStopToEnd &&
  //   //     !isTargetLoopEnd &&
  //   //     !isTargetLoopStop
  //   //   ) {
  //   //     return {
  //   //       validation: {
  //   //         isValid: false,
  //   //         reason: 'Nodes in loopStop->loopEnd region can only connect within that region or to loopEnd',
  //   //       },
  //   //     };
  //   //   }
  //   // }

  //   // if (isSourceOutside && !isSourceLoopStart && !isSourceLoopStop && !isSourceLoopEnd) {
  //   //   // Source is outside (not a loop node and not unreachable - already handled above)
  //   //   // Can only connect to loopStart or nodes outside
  //   //   if (isTargetInStartToStop || isTargetInStopToEnd) {
  //   //     return {
  //   //       validation: {
  //   //         isValid: false,
  //   //         reason: 'Nodes outside loop cannot connect to nodes inside loop regions',
  //   //       },
  //   //     };
  //   //   }
  //   //   if (!isTargetLoopStart && !isTargetOutside) {
  //   //     return {
  //   //       validation: {
  //   //         isValid: false,
  //   //         reason: 'Nodes outside loop can only connect to loopStart or nodes outside',
  //   //       },
  //   //     };
  //   //   }
  //   // }

  //   // // Check if target is trying to receive from an invalid position
  //   // if (isTargetInStartToStop || isTargetLoopStop) {
  //   //   // Target is in startToStop region or is loopStop
  //   //   // Can only receive from nodes in same region or from loopStart
  //   //   if (
  //   //     !isSourceInStartToStop &&
  //   //     !isSourceLoopStart &&
  //   //     !isSourceLoopStop
  //   //   ) {
  //   //     return {
  //   //       validation: {
  //   //         isValid: false,
  //   //         reason: 'Nodes in loopStart->loopStop region can only receive connections from within that region or from loopStart',
  //   //       },
  //   //     };
  //   //   }
  //   // }

  //   // if (isTargetInStopToEnd || isTargetLoopEnd) {
  //   //   // Target is in stopToEnd region or is loopEnd
  //   //   // Can only receive from nodes in same region or from loopStop
  //   //   if (
  //   //     !isSourceInStopToEnd &&
  //   //     !isSourceLoopStop &&
  //   //     !isSourceLoopEnd
  //   //   ) {
  //   //     return {
  //   //       validation: {
  //   //         isValid: false,
  //   //         reason: 'Nodes in loopStop->loopEnd region can only receive connections from within that region or from loopStop',
  //   //       },
  //   //     };
  //   //   }
  //   // }

  //   // if (isTargetOutside && !isTargetLoopStart && !isTargetLoopStop && !isTargetLoopEnd) {
  //   //   // Target is outside (not a loop node and not unreachable - already handled above)
  //   //   // Can only receive from loopEnd or nodes outside
  //   //   if (isSourceInStartToStop || isSourceInStopToEnd) {
  //   //     return {
  //   //       validation: {
  //   //         isValid: false,
  //   //         reason: 'Nodes outside loop cannot receive connections from nodes inside loop regions',
  //   //       },
  //   //     };
  //   //   }
  //   //   if (!isSourceLoopEnd && !isSourceOutside) {
  //   //     return {
  //   //       validation: {
  //   //         isValid: false,
  //   //         reason: 'Nodes outside loop can only receive connections from loopEnd or nodes outside',
  //   //       },
  //   //     };
  //   //   }
  //   // }
  // }

  return {
    validation: { isValid: true },
  };
}

export {
  addDuplicateHandlesToLoopNodesAfterInference,
  isLoopConnectionValid,
  isLoopNode,
};
