import type { State, SupportedUnderlyingTypes } from './types';
import type { z } from 'zod';
import { typedKeys } from '../typedKeys';

function countNodesOfTypeInRoot<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
  nodeType: NodeTypeUniqueId,
): number {
  return state.nodes.filter((node) => node.data.nodeTypeUniqueId === nodeType)
    .length;
}

function countNodesOfTypeAcrossAll<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
  nodeType: NodeTypeUniqueId,
): number {
  let count = countNodesOfTypeInRoot(state, nodeType);
  for (const key of typedKeys(state.typeOfNodes)) {
    const subtree = state.typeOfNodes[key].subtree;
    if (subtree) {
      count += subtree.nodes.filter(
        (node) => node.data.nodeTypeUniqueId === nodeType,
      ).length;
    }
  }
  return count;
}

function countNodesOfTypeInGroup<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
  groupNodeType: NodeTypeUniqueId,
  targetNodeType: NodeTypeUniqueId,
): number {
  const subtree = state.typeOfNodes[groupNodeType]?.subtree;
  if (!subtree) return 0;
  return subtree.nodes.filter(
    (node) => node.data.nodeTypeUniqueId === targetNodeType,
  ).length;
}

function getCurrentScope<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
): NodeTypeUniqueId | undefined {
  const stack = state.openedNodeGroupStack;
  if (!stack || stack.length === 0) return undefined;
  return stack[stack.length - 1].nodeType;
}

export {
  countNodesOfTypeInRoot,
  countNodesOfTypeAcrossAll,
  countNodesOfTypeInGroup,
  getCurrentScope,
};
