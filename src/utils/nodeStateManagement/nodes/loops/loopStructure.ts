import type { State, SupportedUnderlyingTypes } from '../../types';
import type { z } from 'zod';
import { getOutgoers, getIncomers } from '@xyflow/react';
import { standardNodeTypeNamesMap } from '../../standardNodes';
import { getHandleFromNodeDataFromIndices } from '../../handles/handleGetters';
import { isLoopNode } from './loopIdentification';
import type { LoopStructure } from './types';

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
    const lastDashIdx = currentNodeIdAndDirection.lastIndexOf('-');
    if (lastDashIdx === -1) continue;
    const currentNodeId = currentNodeIdAndDirection.substring(0, lastDashIdx);
    const direction = currentNodeIdAndDirection.substring(lastDashIdx + 1);
    if (!currentNodeId || !direction) continue;
    if (visited.has(currentNodeIdAndDirection)) {
      continue;
    }

    visited.add(currentNodeIdAndDirection);

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
        const key = outgoer.id + '-input';
        if (!visited.has(key)) {
          queue.push(key);
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
        const key = incomer.id + '-output';
        if (!visited.has(key)) {
          queue.push(key);
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

export { getBoundaryLoopNodesOfNode, getLoopStructureFromNode };
