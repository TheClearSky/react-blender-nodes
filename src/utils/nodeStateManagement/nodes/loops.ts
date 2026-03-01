import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import { constructTypeOfHandleFromIndices } from './constructAndModifyNodes';
import { insertOrDeleteHandleInNodeDataUsingHandleIndices } from '../handles/handleSetters';
import type { ConnectionValidationResult } from '../newOrRemovedEdgeValidation';
import {
  loopEndInputInferHandleIndex,
  loopEndOutputInferHandleIndex,
  loopStartInputInferHandleIndex,
  loopStartOutputInferHandleIndex,
  loopStopInputInferHandleIndex,
  loopStopOutputInferHandleIndex,
  standardDataTypeNamesMap,
  standardNodeTypeNamesMap,
} from '../standardNodes';
import { getOutgoers, getIncomers } from '@xyflow/react';
import {
  getAllHandlesFromNodeData,
  getHandleFromNodeDataFromIndices,
  getHandleFromNodeDataMatchingHandleId,
} from '../handles/handleGetters';
import type { HandleIndices } from '../handles/types';
import { getResultantDataTypeOfHandleConsideringInferredType } from '../constructAndModifyHandles';
import { isGroupInputOrOutputNode } from './nodeGroups';

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
  const queue: string[] = [startNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);

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

  return visited;
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
  loopStructure: LoopStructure<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): {
  nodesInRegionStartToStop: Set<string>;
  nodesInRegionStopToEnd: Set<string>;
} {
  const nodesInRegionStartToStop = new Set<string>();
  const nodesInRegionStopToEnd = new Set<string>();

  {
    // Bidirectional BFS: start from loopStart and loopStop, traverse in both directions
    // Stop when we hit the boundary loop nodes
    const queue: string[] = [
      loopStructure.loopStart.id,
      loopStructure.loopStop.id,
    ];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId || visited.has(currentNodeId)) {
        continue;
      }

      visited.add(currentNodeId);

      // Don't include loopStart or loopStop themselves in the region
      if (
        currentNodeId !== loopStructure.loopStart.id &&
        currentNodeId !== loopStructure.loopStop.id
      ) {
        nodesInRegionStartToStop.add(currentNodeId);
      }

      const currentNode: (typeof state.nodes)[number] | undefined =
        state.nodes.find((n) => n.id === currentNodeId);
      if (!currentNode) continue;

      // Traverse forward (outgoers)
      const outgoers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopStop.id
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
        currentNode.id !== loopStructure.loopStart.id
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
  }
  {
    // Bidirectional BFS: start from loopStop and loopEnd, traverse in both directions
    // Stop when we hit the boundary loop nodes
    const queue: string[] = [
      loopStructure.loopStop.id,
      loopStructure.loopEnd.id,
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId || visited.has(currentNodeId)) {
        continue;
      }

      visited.add(currentNodeId);

      // Don't include loopStop or loopEnd themselves in the region
      if (
        currentNodeId !== loopStructure.loopStop.id &&
        currentNodeId !== loopStructure.loopEnd.id
      ) {
        nodesInRegionStopToEnd.add(currentNodeId);
      }

      const currentNode: (typeof state.nodes)[number] | undefined =
        state.nodes.find((n) => n.id === currentNodeId);
      if (!currentNode) continue;

      // Traverse forward (outgoers)
      const outgoers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopEnd.id
          ? getOutgoers(currentNode, state.nodes, state.edges)
          : [];
      for (const outgoer of outgoers) {
        if (outgoer.id === loopStructure.loopEnd.id) {
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
        currentNode.id !== loopStructure.loopStop.id
          ? getIncomers(currentNode, state.nodes, state.edges)
          : [];
      for (const incomer of incomers) {
        if (incomer.id === loopStructure.loopStop.id) {
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

  return {
    nodesInRegionStartToStop,
    nodesInRegionStopToEnd,
  };
}

/**
 * Gets all boundary loop nodes of a node (if they exist), searching in all directions from the node
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param nodeToSearchFrom - The node to search from
 * @param ignoreBoundaryLoopNodeIds - The ids of the boundary loop nodes to ignore
 * @returns Set of boundary loop nodes of the node
 */
function getBoundaryLoopNodesOfNode<
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
  ignoreBoundaryLoopNodeIds: string[] = [],
  initialSearchNodeDirection: 'input' | 'output' | 'none' = 'none',
): {
  boundaryLoopNodes: {
    [key: string]: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >['nodes'][number];
  };
} {
  const boundaryLoopNodes: {
    [key: string]: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >['nodes'][number];
  } = {};

  const ignoreBoundaryLoopNodeIdsSet = new Set<string>(
    ignoreBoundaryLoopNodeIds,
  );

  // Bidirectional BFS: start from nodeToSearchFrom, traverse in both directions
  // Stop when we hit the boundary loop nodes
  const queue: string[] = [
    nodeToSearchFrom.id + '-' + initialSearchNodeDirection,
  ];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const currentNodeIdAndDirection = queue.shift();
    if (!currentNodeIdAndDirection) {
      continue;
    }
    const [currentNodeId, direction] = currentNodeIdAndDirection.split('-');
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);

    const currentNode: (typeof state.nodes)[number] | undefined =
      state.nodes.find((n) => n.id === currentNodeId);
    if (!currentNode) continue;

    const isCurrentNodeALoopNode =
      currentNode.data.nodeTypeUniqueId &&
      isLoopNode(currentNode.data.nodeTypeUniqueId) &&
      !ignoreBoundaryLoopNodeIdsSet.has(currentNode.id);

    if (isCurrentNodeALoopNode) {
      boundaryLoopNodes[currentNode.id + '-' + direction] = currentNode;
    }

    if (!isCurrentNodeALoopNode || direction === 'output') {
      // Traverse forward (outgoers)
      const outgoers: (typeof state.nodes)[number][] = getOutgoers(
        currentNode,
        state.nodes,
        state.edges,
      );
      for (const outgoer of outgoers) {
        if (!visited.has(outgoer.id)) {
          queue.push(outgoer.id + '-input');
        }
      }
    }

    if (!isCurrentNodeALoopNode || direction === 'input') {
      // Traverse backward (incomers) to handle zigzag paths
      const incomers: (typeof state.nodes)[number][] = getIncomers(
        currentNode,
        state.nodes,
        state.edges,
      );
      for (const incomer of incomers) {
        if (!visited.has(incomer.id)) {
          queue.push(incomer.id + '-output');
        }
      }
    }
  }
  return {
    boundaryLoopNodes,
  };
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
  loopStructure: LoopStructure<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  sourceHandleResultantInferredDataType: DataTypeUniqueId,
  targetHandleResultantInferredDataType: DataTypeUniqueId,
  sourceNodeId: string,
  targetNodeId: string,
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

  const maxNumberOfInferredLoopHandles = Math.max(
    ...allNumberOfInferredLoopHandles,
  );

  const areAllNumberOfInferredLoopHandlesEqualOrOneShort =
    allNumberOfInferredLoopHandles.every(
      (v) =>
        v === maxNumberOfInferredLoopHandles ||
        v === maxNumberOfInferredLoopHandles - 1,
    );
  if (!areAllNumberOfInferredLoopHandlesEqualOrOneShort) {
    return {
      validation: {
        isValid: false,
        reason:
          'Loop structure has too different number of inferred handles, complete the connections',
      },
    };
  }

  //Check the new connection

  const loopHandlesAtMax = allNumberOfInferredLoopHandles.map(
    (num) => num === maxNumberOfInferredLoopHandles,
  );

  const handlesBeingAddedTo = [
    loopStructure.loopStart.id === targetNodeId &&
      targetHandleResultantInferredDataType ===
        standardDataTypeNamesMap.loopInfer,
    loopStructure.loopStart.id === sourceNodeId &&
      sourceHandleResultantInferredDataType ===
        standardDataTypeNamesMap.loopInfer,
    loopStructure.loopStop.id === targetNodeId &&
      targetHandleResultantInferredDataType ===
        standardDataTypeNamesMap.loopInfer,
    loopStructure.loopStop.id === sourceNodeId &&
      sourceHandleResultantInferredDataType ===
        standardDataTypeNamesMap.loopInfer,
    loopStructure.loopEnd.id === targetNodeId &&
      targetHandleResultantInferredDataType ===
        standardDataTypeNamesMap.loopInfer,
    loopStructure.loopEnd.id === sourceNodeId &&
      sourceHandleResultantInferredDataType ===
        standardDataTypeNamesMap.loopInfer,
  ];

  if (!loopHandlesAtMax.every((loopHandleAtMax) => loopHandleAtMax)) {
    if (
      loopHandlesAtMax
        .map((isAtMax, index) => {
          if (isAtMax) {
            return handlesBeingAddedTo[index];
          }
          return false;
        })
        .some((isAtMaxAndBeingAddedTo) => isAtMaxAndBeingAddedTo)
    ) {
      return {
        validation: {
          isValid: false,
          reason:
            "Can't add a new connection to loops before older conenctions are synced across",
        },
      };
    }
  }

  for (let i = 0; i < maxNumberOfInferredLoopHandles; i++) {
    const inputLoopHandleLoopStart =
      allHandlesLoopStart.inputsAndIndices[i + loopStartInputInferHandleIndex];
    const outputLoopHandleLoopStart =
      allHandlesLoopStart.outputsAndIndices[
        i + loopStartOutputInferHandleIndex
      ];
    const inputLoopHandleLoopStop =
      allHandlesLoopStop.inputsAndIndices[i + loopStopInputInferHandleIndex];
    const outputLoopHandleLoopStop =
      allHandlesLoopStop.outputsAndIndices[i + loopStopOutputInferHandleIndex];
    const inputLoopHandleLoopEnd =
      allHandlesLoopEnd.inputsAndIndices[i + loopEndInputInferHandleIndex];
    const outputLoopHandleLoopEnd =
      allHandlesLoopEnd.outputsAndIndices[i + loopEndOutputInferHandleIndex];

    const allHandles = [
      inputLoopHandleLoopStart,
      outputLoopHandleLoopStart,
      inputLoopHandleLoopStop,
      outputLoopHandleLoopStop,
      inputLoopHandleLoopEnd,
      outputLoopHandleLoopEnd,
    ];

    const firstNonLoopInferHandle = allHandles.find(
      (handle) =>
        handle?.value?.dataType?.dataTypeUniqueId &&
        handle?.value?.dataType?.dataTypeUniqueId !==
          standardDataTypeNamesMap.loopInfer,
    );

    if (!firstNonLoopInferHandle) {
      return {
        validation: {
          isValid: false,
          reason:
            'This is a system error, this should never happen, please notify report this on https://github.com/TheClearSky/react-blender-nodes/issues',
        },
      };
    }

    const areAllHandleTypesEqual = allHandles.every((v, handleIndex) => {
      const dataTypeOfCurrentHandle = v.value.dataType?.dataTypeUniqueId;
      return (
        dataTypeOfCurrentHandle && //every handle should have some data type
        (dataTypeOfCurrentHandle ===
          firstNonLoopInferHandle.value?.dataType?.dataTypeUniqueId || //Either it should be equal to other types
          (i === maxNumberOfInferredLoopHandles - 1 //Or if in the last row
            ? dataTypeOfCurrentHandle === standardDataTypeNamesMap.loopInfer && //It should be equal to loopInfer (unassigned)
              (handlesBeingAddedTo[handleIndex] //but if it is being assigned to right now
                ? (handleIndex % 2 === 0
                    ? sourceHandleResultantInferredDataType //to get the current type, just do mod
                    : targetHandleResultantInferredDataType) ===
                  firstNonLoopInferHandle.value?.dataType?.dataTypeUniqueId //It's type should match to the other types
                : true)
            : false))
      );
    });
    if (!areAllHandleTypesEqual) {
      return {
        validation: {
          isValid: false,
          reason: 'Loop structure has different handle types',
        },
      };
    }
  }

  return {
    validation: { isValid: true },
  };
}

/**
 * Verifies if the parent loop regions of the source and target nodes are valid
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param sourceNode - The source node
 * @param targetNode - The target node
 * @param ignoreBoundaryLoopNodeIds - The ids of the boundary loop nodes to ignore
 * @returns Validation result indicating if the parent loop regions are valid
 */
function verifyParentLoopRegionsAreValid<
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
  ignoreBoundaryLoopNodeIds: string[] = [],
): {
  validation: ConnectionValidationResult;
} {
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
  const sourceBoundaryLoopNodes = getBoundaryLoopNodesOfNode(
    state,
    sourceNode,
    ignoreBoundaryLoopNodeIds,
    'output',
  );
  const targetBoundaryLoopNodes = getBoundaryLoopNodesOfNode(
    state,
    targetNode,
    ignoreBoundaryLoopNodeIds,
    'input',
  );

  const isSourceInAnIsolatedIslandWithoutLoopNodes =
    Object.keys(sourceBoundaryLoopNodes.boundaryLoopNodes).length === 0;
  const isTargetInAnIsolatedIslandWithoutLoopNodes =
    Object.keys(targetBoundaryLoopNodes.boundaryLoopNodes).length === 0;
  if (
    isSourceInAnIsolatedIslandWithoutLoopNodes ||
    isTargetInAnIsolatedIslandWithoutLoopNodes
  ) {
    return {
      validation: {
        isValid: true,
      },
    };
  }

  const isSourceNodeOutsideAllLoopNodes =
    isGroupInputOrOutputNode(sourceNodeType) ||
    Object.keys(sourceBoundaryLoopNodes.boundaryLoopNodes).every((key) => {
      const boundaryLoopNode = sourceBoundaryLoopNodes.boundaryLoopNodes[key];
      const [_, boundaryLoopNodeDirection] = key.split('-');
      return (
        boundaryLoopNode.data.nodeTypeUniqueId !==
          standardNodeTypeNamesMap.loopStop &&
        (boundaryLoopNodeDirection === 'input'
          ? boundaryLoopNode.data.nodeTypeUniqueId !==
            standardNodeTypeNamesMap.loopEnd
          : boundaryLoopNode.data.nodeTypeUniqueId !==
            standardNodeTypeNamesMap.loopStart)
      );
    });

  const isTargetNodeOutsideAllLoopNodes =
    isGroupInputOrOutputNode(targetNodeType) ||
    Object.keys(targetBoundaryLoopNodes.boundaryLoopNodes).every((key) => {
      const boundaryLoopNode = targetBoundaryLoopNodes.boundaryLoopNodes[key];
      const [_, boundaryLoopNodeDirection] = key.split('-');
      return (
        boundaryLoopNode.data.nodeTypeUniqueId !==
          standardNodeTypeNamesMap.loopStop &&
        (boundaryLoopNodeDirection === 'input'
          ? boundaryLoopNode.data.nodeTypeUniqueId !==
            standardNodeTypeNamesMap.loopEnd
          : boundaryLoopNode.data.nodeTypeUniqueId !==
            standardNodeTypeNamesMap.loopStart)
      );
    });

  if (isSourceNodeOutsideAllLoopNodes !== isTargetNodeOutsideAllLoopNodes) {
    return {
      validation: {
        isValid: false,
        reason:
          "Can't connect a node from inside the loop to a node from outside the loop",
      },
    };
  } else if (
    !isSourceNodeOutsideAllLoopNodes &&
    !isTargetNodeOutsideAllLoopNodes
  ) {
    const areBoundariesSame =
      Object.keys(sourceBoundaryLoopNodes.boundaryLoopNodes).every((key) => {
        const matchingBoundaryLoopNode =
          targetBoundaryLoopNodes.boundaryLoopNodes[key];
        return Boolean(matchingBoundaryLoopNode);
      }) &&
      Object.keys(sourceBoundaryLoopNodes.boundaryLoopNodes).length ===
        Object.keys(targetBoundaryLoopNodes.boundaryLoopNodes).length;

    if (!areBoundariesSame) {
      return {
        validation: {
          isValid: false,
          reason: "Can't connect 2 nodes of different regions of loop nodes",
        },
      };
    }
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

  const sourceHandleResultantInferredDataType =
    getResultantDataTypeOfHandleConsideringInferredType(sourceHandle, true);
  const targetHandleResultantInferredDataType =
    getResultantDataTypeOfHandleConsideringInferredType(targetHandle, true);

  if (
    !sourceHandleResultantInferredDataType ||
    !targetHandleResultantInferredDataType
  ) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target resultant handle data type not found',
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
      const loopStructureSource = getLoopStructureFromNode<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(state, sourceNode);
      const loopStructureTarget = getLoopStructureFromNode<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(state, targetNode);
      if (!loopStructureSource || !loopStructureTarget) {
        return {
          validation: {
            isValid: false,
            reason: `${loopStructureSource ? 'Target' : 'Source'} loop structure not found`,
          },
        };
      }

      const isSourceLoopStructureValid =
        verifyLoopStructureUniformHandleInference<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          loopStructureSource,
          sourceHandleResultantInferredDataType.dataTypeUniqueId,
          targetHandleResultantInferredDataType.dataTypeUniqueId,
          sourceNodeId,
          targetNodeId,
        );

      const isTargetLoopStructureValid =
        verifyLoopStructureUniformHandleInference<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          loopStructureSource,
          sourceHandleResultantInferredDataType.dataTypeUniqueId,
          targetHandleResultantInferredDataType.dataTypeUniqueId,
          sourceNodeId,
          targetNodeId,
        );

      if (
        !isSourceLoopStructureValid.validation.isValid ||
        !isTargetLoopStructureValid.validation.isValid
      ) {
        return {
          validation: {
            isValid: false,
            reason: `${
              isSourceLoopStructureValid.validation.isValid
                ? 'Target'
                : 'Source'
            } loop structure is invalid because of reason: ${
              !isSourceLoopStructureValid.validation.isValid
                ? isSourceLoopStructureValid.validation.reason
                : isTargetLoopStructureValid.validation.reason
            }`,
          },
        };
      }

      if (
        loopStructureSource.loopStart.id !== loopStructureTarget.loopStart.id
      ) {
        //Connection between 2 different loop structures
        //Can only happen in 2 ways:
        //1. Both are connecting in series, one's end is connected to the other's start
        //2. One in inside the other's loop region
        const isSourceLoopEndConnectedToTargetLoopStart =
          sourceNodeType === standardNodeTypeNamesMap.loopEnd &&
          targetNodeType === standardNodeTypeNamesMap.loopStart;

        if (isSourceLoopEndConnectedToTargetLoopStart) {
          const validation = verifyParentLoopRegionsAreValid(
            state,
            sourceNode,
            targetNode,
            [
              loopStructureSource.loopStart.id,
              loopStructureSource.loopStop.id,
              loopStructureSource.loopEnd.id,
              loopStructureTarget.loopStart.id,
              loopStructureTarget.loopStop.id,
              loopStructureTarget.loopEnd.id,
            ],
          );
          if (!validation.validation.isValid) {
            return validation;
          }
        } else {
          const [childLoopStructure, parentLoopStructure] =
            sourceNodeType === standardNodeTypeNamesMap.loopEnd
              ? [loopStructureSource, loopStructureTarget]
              : targetNodeType === standardNodeTypeNamesMap.loopStart
                ? [loopStructureTarget, loopStructureSource]
                : [undefined, undefined];

          if (!childLoopStructure || !parentLoopStructure) {
            return {
              validation: {
                isValid: false,
                reason:
                  "Can't connect one loop structure's inner region to another loop structure's inner region",
              },
            };
          }

          const validation = verifyParentLoopRegionsAreValid(
            state,
            sourceNode,
            targetNode,
            [
              childLoopStructure.loopStart.id,
              childLoopStructure.loopStop.id,
              childLoopStructure.loopEnd.id,
            ],
          );
          if (!validation.validation.isValid) {
            return validation;
          }
        }
      } else {
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

    const isLoopStructureValid = verifyLoopStructureUniformHandleInference<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >(
      loopStructure,
      sourceHandleResultantInferredDataType.dataTypeUniqueId,
      targetHandleResultantInferredDataType.dataTypeUniqueId,
      sourceNodeId,
      targetNodeId,
    );

    if (!isLoopStructureValid.validation.isValid) {
      return {
        validation: {
          isValid: false,
          reason: `Loop structure is invalid because of reason: ${isLoopStructureValid.validation.reason}`,
        },
      };
    }

    if (isSourceLoopNode) {
      const { nodesInRegionStartToStop, nodesInRegionStopToEnd } =
        getNodesInLoopRegion<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(state, loopStructure);

      const sourceReachable = getAllReachableNodes<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(state, sourceNodeId);

      const isTargetInStartToStop = nodesInRegionStartToStop.has(targetNodeId);
      const isTargetInStopToEnd = nodesInRegionStopToEnd.has(targetNodeId);
      const isTargetOutside =
        sourceReachable.has(targetNodeId) &&
        !isTargetInStartToStop &&
        !isTargetInStopToEnd;
      //Guaranteed to be group output node because it has an incoming connection
      //Group input has no input handles
      const isTargetGroupOutputNode = isGroupInputOrOutputNode(targetNodeType);

      const isSourceLoopStart = loopStructure.loopStart.id === sourceNodeId;
      const isSourceLoopStop = loopStructure.loopStop.id === sourceNodeId;
      const isSourceLoopEnd = loopStructure.loopEnd.id === sourceNodeId;

      if (isTargetGroupOutputNode && !isSourceLoopEnd) {
        return {
          validation: {
            isValid: false,
            reason:
              'Group output node can only connect to loop end not inside the loop',
          },
        };
      }
      if (isTargetInStartToStop && !isSourceLoopStart) {
        return {
          validation: {
            isValid: false,
            reason:
              'Loop nodes inside the LoopStart<->LoopStop region can only connect to LoopStart, LoopStop, other nodes in the same region or unreachable nodes',
          },
        };
      }
      if (isTargetInStopToEnd && !isSourceLoopStop) {
        return {
          validation: {
            isValid: false,
            reason:
              'Loop nodes inside the LoopStop<->LoopEnd region can only connect to LoopStop, LoopEnd, other nodes in the same region or unreachable nodes',
          },
        };
      }
      if (isTargetOutside && !isSourceLoopEnd) {
        return {
          validation: {
            isValid: false,
            reason:
              'Loop nodes outside the Loop region can only connect to LoopStart, LoopStop or other nodes outside the loop',
          },
        };
      }
      const parentloopStructureValidation = verifyParentLoopRegionsAreValid(
        state,
        sourceNode,
        targetNode,
        [
          loopStructure.loopStart.id,
          loopStructure.loopStop.id,
          loopStructure.loopEnd.id,
        ],
      );
      if (!parentloopStructureValidation.validation.isValid) {
        return parentloopStructureValidation;
      }
      return {
        validation: { isValid: true },
      };
    } else if (isTargetLoopNode) {
      const { nodesInRegionStartToStop, nodesInRegionStopToEnd } =
        getNodesInLoopRegion<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(state, loopStructure);
      const targetReachable = getAllReachableNodes<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(state, targetNodeId);
      const isSourceInStartToStop = nodesInRegionStartToStop.has(sourceNodeId);
      const isSourceInStopToEnd = nodesInRegionStopToEnd.has(sourceNodeId);
      const isSourceOutside =
        targetReachable.has(sourceNodeId) &&
        !isSourceInStartToStop &&
        !isSourceInStopToEnd;
      //Guaranteed to be group input node because it has an outgoing connection
      //Group output has no output handles
      const isSourceGroupInputNode = isGroupInputOrOutputNode(sourceNodeType);

      const isTargetLoopStart = loopStructure.loopStart.id === targetNodeId;
      const isTargetLoopStop = loopStructure.loopStop.id === targetNodeId;
      const isTargetLoopEnd = loopStructure.loopEnd.id === targetNodeId;

      if (isSourceGroupInputNode && !isTargetLoopStart) {
        return {
          validation: {
            isValid: false,
            reason:
              'Group input node can only connect to loop start not inside the loop',
          },
        };
      }
      if (isSourceInStartToStop && !isTargetLoopStop) {
        return {
          validation: {
            isValid: false,
            reason:
              'Loop nodes inside the LoopStart<->LoopStop region can only connect to LoopStart, LoopStop, other nodes in the same region or unreachable nodes',
          },
        };
      }
      if (isSourceInStopToEnd && !isTargetLoopEnd) {
        return {
          validation: {
            isValid: false,
            reason:
              'Loop nodes inside the LoopStop<->LoopEnd region can only connect to LoopStop, LoopEnd, other nodes in the same region or unreachable nodes',
          },
        };
      }
      if (isSourceOutside && !isTargetLoopStart) {
        return {
          validation: {
            isValid: false,
            reason:
              'Loop nodes outside the Loop region can only connect to LoopStart, LoopStop or other nodes outside the loop',
          },
        };
      }

      const parentloopStructureValidation = verifyParentLoopRegionsAreValid(
        state,
        sourceNode,
        targetNode,
        [
          loopStructure.loopStart.id,
          loopStructure.loopStop.id,
          loopStructure.loopEnd.id,
        ],
      );
      if (!parentloopStructureValidation.validation.isValid) {
        return parentloopStructureValidation;
      }
      return {
        validation: { isValid: true },
      };
    }
    return {
      validation: { isValid: true },
    };
  } else {
    const validation = verifyParentLoopRegionsAreValid(
      state,
      sourceNode,
      targetNode,
    );
    if (!validation.validation.isValid) {
      return validation;
    }

    return {
      validation: { isValid: true },
    };
  }
}

/**
 * Checks if loop nodes and edges can be removed from the graph
 * @param state - The current state of the graph
 * @param nodeToRemove - The nodes to remove
 * @param edgesToRemove - The edges to remove
 * @returns A validation result indicating if the node can be removed
 */
function canRemoveLoopNodesAndEdges<
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
  nodesToRemove:
    | string[]
    | State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['nodes'],
  edgesToRemove:
    | string[]
    | State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['edges'],
): {
  validation: ConnectionValidationResult;
} {
  let nodesToRemoveResultant: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'] = [];

  if (nodesToRemove.every((node) => typeof node === 'string')) {
    const nodeIdSet = new Set(nodesToRemove);
    nodesToRemoveResultant = state.nodes.filter((node) =>
      nodeIdSet.has(node.id),
    );
  } else {
    nodesToRemoveResultant = nodesToRemove;
  }

  const nodesToRemoveMap: Record<
    string,
    {
      node: State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['nodes'][number];
      alreadyChecked: boolean;
    }
  > = {};
  for (const node of nodesToRemoveResultant) {
    nodesToRemoveMap[node.id] = {
      node,
      alreadyChecked: false,
    };
  }

  const nodesToRemoveMapKeys = Object.keys(nodesToRemoveMap);

  for (const nodeId of nodesToRemoveMapKeys) {
    const node = nodesToRemoveMap[nodeId].node;
    if (nodesToRemoveMap[nodeId].alreadyChecked) {
      continue;
    }
    nodesToRemoveMap[nodeId].alreadyChecked = true;
    if (!node) {
      continue;
    }
    if (!node.data.nodeTypeUniqueId) {
      continue;
    }
    if (!isLoopNode(node.data.nodeTypeUniqueId)) {
      continue;
    }
    const loopStructure = getLoopStructureFromNode(state, node);
    if (!loopStructure) {
      continue;
    }

    if (
      nodesToRemoveMap[loopStructure.loopStart.id] === undefined ||
      nodesToRemoveMap[loopStructure.loopStop.id] === undefined ||
      nodesToRemoveMap[loopStructure.loopEnd.id] === undefined
    ) {
      return {
        validation: {
          isValid: false,
          reason:
            "Loop nodes all need to be removed together, can't partially remove them",
        },
      };
    }
    nodesToRemoveMap[loopStructure.loopStart.id].alreadyChecked = true;
    nodesToRemoveMap[loopStructure.loopStop.id].alreadyChecked = true;
    nodesToRemoveMap[loopStructure.loopEnd.id].alreadyChecked = true;
  }
  let edgesToRemoveResultant: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'] = [];

  if (edgesToRemove.every((edge) => typeof edge === 'string')) {
    const edgeIdSet = new Set(edgesToRemove);
    edgesToRemoveResultant = state.edges.filter((edge) =>
      edgeIdSet.has(edge.id),
    );
  } else {
    edgesToRemoveResultant = edgesToRemove;
  }

  for (const edge of edgesToRemoveResultant) {
    const sourceNode = state.nodes.find((node) => node.id === edge.source);
    const targetNode = state.nodes.find((node) => node.id === edge.target);
    const sourceHandleId = edge.sourceHandle;
    const targetHandleId = edge.targetHandle;
    if (!sourceHandleId || !targetHandleId) {
      continue;
    }
    if (!sourceNode || !targetNode) {
      continue;
    }
    const sourceNodeType = sourceNode.data.nodeTypeUniqueId;
    const targetNodeType = targetNode.data.nodeTypeUniqueId;
    if (!sourceNodeType || !targetNodeType) {
      continue;
    }
    if (!isLoopNode(sourceNodeType) || !isLoopNode(targetNodeType)) {
      continue;
    }

    const sourceHandle = getHandleFromNodeDataMatchingHandleId(
      sourceHandleId,
      sourceNode.data,
    )?.value;
    const targetHandle = getHandleFromNodeDataMatchingHandleId(
      targetHandleId,
      targetNode.data,
    )?.value;
    const sourceHandleDataTypeUniqueId =
      sourceHandle?.dataType?.dataTypeUniqueId;
    const targetHandleDataTypeUniqueId =
      targetHandle?.dataType?.dataTypeUniqueId;
    if (
      sourceHandleDataTypeUniqueId !== standardDataTypeNamesMap.bindLoopNodes ||
      targetHandleDataTypeUniqueId !== standardDataTypeNamesMap.bindLoopNodes
    ) {
      continue;
    }
    const loopStructure = getLoopStructureFromNode(state, sourceNode);
    if (!loopStructure) {
      continue;
    }
    if (
      nodesToRemoveMap[loopStructure.loopStart.id] === undefined ||
      nodesToRemoveMap[loopStructure.loopStop.id] === undefined ||
      nodesToRemoveMap[loopStructure.loopEnd.id] === undefined
    ) {
      return {
        validation: {
          isValid: false,
          reason:
            'Cannot disconnect loop nodes bind edges once fully connected, to delete, select all connected loop nodes and delete them at once',
        },
      };
    }
  }
  return {
    validation: { isValid: true },
  };
}

export {
  addDuplicateHandlesToLoopNodesAfterInference,
  isLoopConnectionValid,
  isLoopNode,
  canRemoveLoopNodesAndEdges,
  getLoopStructureFromNode,
  getNodesInLoopRegion,
};
export type { LoopStructure };
