import type { State, SupportedUnderlyingTypes } from '../../types';
import type { z } from 'zod';
import { standardNodeTypeNamesMap } from '../../standardNodes';
import { getHandleFromNodeDataFromIndices } from '../../handles/handleGetters';
import type { SwitchStructure } from './types';

function getSwitchStructureFromNode<
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
  | SwitchStructure<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  | undefined {
  if (
    nodeToSearchFrom.data.nodeTypeUniqueId ===
    standardNodeTypeNamesMap.switchStart
  ) {
    const bindHandleId = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof nodeToSearchFrom.data
    >({ type: 'output', index1: 0, index2: undefined }, nodeToSearchFrom.data)
      ?.value?.id;
    if (!bindHandleId) return undefined;

    const bindEdge = state.edges.find(
      (edge) => edge.sourceHandle === bindHandleId,
    );
    if (!bindEdge) return undefined;

    const switchEnd = state.nodes.find((n) => n.id === bindEdge.target);
    if (!switchEnd) return undefined;
    if (
      switchEnd.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.switchEnd
    ) {
      return undefined;
    }

    return { switchStart: nodeToSearchFrom, switchEnd };
  } else if (
    nodeToSearchFrom.data.nodeTypeUniqueId ===
    standardNodeTypeNamesMap.switchEnd
  ) {
    const bindHandleId = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof nodeToSearchFrom.data
    >({ type: 'input', index1: 0, index2: undefined }, nodeToSearchFrom.data)
      ?.value?.id;
    if (!bindHandleId) return undefined;

    const bindEdge = state.edges.find(
      (edge) => edge.targetHandle === bindHandleId,
    );
    if (!bindEdge) return undefined;

    const switchStart = state.nodes.find((n) => n.id === bindEdge.source);
    if (!switchStart) return undefined;
    if (
      switchStart.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.switchStart
    ) {
      return undefined;
    }

    return { switchStart, switchEnd: nodeToSearchFrom };
  }

  return undefined;
}

export { getSwitchStructureFromNode };
