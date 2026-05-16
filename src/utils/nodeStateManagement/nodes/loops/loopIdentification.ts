import {
  loopEndInputInferHandleIndex,
  loopEndOutputInferHandleIndex,
  loopStartInputInferHandleIndex,
  loopStartOutputInferHandleIndex,
  loopStopInputInferHandleIndex,
  loopStopOutputInferHandleIndex,
  standardNodeTypeNamesMap,
} from '../../standardNodes';

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

export { isLoopNode, getLoopNodeInferHandleIndex };
