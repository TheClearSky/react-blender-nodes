import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type { z } from 'zod';
import { standardDataTypeNamesMap } from '../nodeStateManagement/standardNodes';
import { isSwitchNode } from '../nodeStateManagement/nodes/switches';

function isBindSwitchNodesEdge<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  edge: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'][number],
  nodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'],
): boolean {
  if (!edge.sourceHandle) return false;
  const sourceNode = nodes.find((n) => n.id === edge.source);
  if (!sourceNode?.data.nodeTypeUniqueId) return false;
  if (!isSwitchNode(sourceNode.data.nodeTypeUniqueId)) return false;

  const outputs = sourceNode.data.outputs;
  if (!outputs) return false;
  for (const output of outputs) {
    if ('id' in output && output.id === edge.sourceHandle) {
      if (
        output.dataType?.dataTypeUniqueId ===
        standardDataTypeNamesMap.bindSwitchNodes
      ) {
        return true;
      }
    }
  }
  return false;
}

export { isBindSwitchNodesEdge };
