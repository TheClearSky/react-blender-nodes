import {
  switchStartInputInferHandleIndex,
  switchStartOutputInferTrueHandleIndex,
  switchEndInputInferTrueHandleIndex,
  switchEndOutputInferHandleIndex,
  standardNodeTypeNamesMap,
} from '../../standardNodes';

function isSwitchNode<NodeTypeUniqueId extends string = string>(
  nodeTypeUniqueId: NodeTypeUniqueId,
): boolean {
  return (
    nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart ||
    nodeTypeUniqueId === standardNodeTypeNamesMap.switchEnd
  );
}

function getSwitchNodeInferHandleIndex(
  nodeTypeUniqueId: string,
  type: 'input' | 'output',
): number {
  if (nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart) {
    return type === 'input'
      ? switchStartInputInferHandleIndex
      : switchStartOutputInferTrueHandleIndex;
  }
  return type === 'input'
    ? switchEndInputInferTrueHandleIndex
    : switchEndOutputInferHandleIndex;
}

export { isSwitchNode, getSwitchNodeInferHandleIndex };
