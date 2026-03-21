import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  GroupExecutionScope,
  ExecutionPlan,
  FunctionImplementations,
} from './types';
import {
  standardNodeTypeNames,
  standardNodeTypeNamesMap,
} from '../nodeStateManagement/standardNodes';

/**
 * Standard node type name literal union, derived from the const array.
 * Used as the narrowing target in the isStandardNodeType type guard.
 */
type StandardNodeTypeName = (typeof standardNodeTypeNames)[number];

/**
 * Maximum recursion depth for nested groups to prevent infinite recursion.
 */
const MAX_GROUP_DEPTH = 20;

/**
 * Extract handle IDs from a node's inputs array (flattening panels).
 * Returns IDs in order, matching the index positions used for mapping.
 */
function extractInputHandleIds(
  inputs:
    | ReadonlyArray<{ id?: string; inputs?: ReadonlyArray<{ id?: string }> }>
    | undefined,
): string[] {
  const ids: string[] = [];
  if (!inputs) return ids;
  for (const item of inputs) {
    if ('inputs' in item && item.inputs) {
      // Panel — flatten inner inputs
      for (const inner of item.inputs) {
        if (inner.id) ids.push(inner.id);
      }
    } else if (item.id) {
      ids.push(item.id);
    }
  }
  return ids;
}

/**
 * Extract handle IDs from a node's outputs array.
 */
function extractOutputHandleIds(
  outputs: ReadonlyArray<{ id?: string }> | undefined,
): string[] {
  const ids: string[] = [];
  if (!outputs) return ids;
  for (const item of outputs) {
    if (item.id) ids.push(item.id);
  }
  return ids;
}

/**
 * Compile all node group instances into GroupExecutionScopes.
 *
 * For each node whose typeOfNode has a `subtree`, this function:
 * 1. Checks for missing function implementations in the subtree
 * 2. Recursively compiles the subtree into an inner ExecutionPlan
 * 3. Builds handle mappings between outer and inner boundaries
 *
 * @param compileGraph - The main compile function (passed to avoid circular imports)
 */
function compileGroupScopes<
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
  nodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'],
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
  maxIterations: number,
  compileGraph: (
    state: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
    options?: { maxLoopIterations?: number },
    depth?: number,
  ) => ExecutionPlan,
  depth: number = 0,
): {
  groupScopes: ReadonlyArray<GroupExecutionScope>;
  groupNodeIds: ReadonlySet<string>;
  warnings: ReadonlyArray<string>;
} {
  if (depth >= MAX_GROUP_DEPTH) {
    return {
      groupScopes: [],
      groupNodeIds: new Set(),
      warnings: [
        `Maximum group nesting depth (${MAX_GROUP_DEPTH}) exceeded. Possible recursive group.`,
      ],
    };
  }

  const groupScopes: GroupExecutionScope[] = [];
  const groupNodeIds = new Set<string>();
  const warnings: string[] = [];

  // Find all nodes whose type has a subtree
  for (const node of nodes) {
    const nodeTypeId = node.data.nodeTypeUniqueId;
    if (!nodeTypeId) continue;
    const typeOfNode = state.typeOfNodes[nodeTypeId];
    if (!typeOfNode?.subtree) continue;

    groupNodeIds.add(node.id);

    const subtree = typeOfNode.subtree;

    // Check for missing function implementations in subtree nodes
    for (const innerNode of subtree.nodes) {
      const innerTypeId = innerNode.data.nodeTypeUniqueId;
      if (!innerTypeId) continue;
      const innerType = state.typeOfNodes[innerTypeId];

      // Skip standard nodes (they have built-in execution —
      // includes groupInput, groupOutput, loopStart, loopEnd, loopStop)
      if (isStandardNodeType(innerTypeId)) continue;

      if (
        !hasKey(functionImplementations, innerTypeId) ||
        !functionImplementations[innerTypeId]
      ) {
        const innerName = innerType?.name ?? innerTypeId;
        const outerName = typeOfNode.name;
        warnings.push(
          `Node type "${innerName}" inside group "${outerName}" has no function implementation.`,
        );
      }
    }

    // Build a synthetic state for the subtree compilation
    const subtreeState: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    > = {
      ...state,
      nodes: subtree.nodes,
      edges: subtree.edges,
      // Clear the opened group stack so getCurrentNodesAndEdgesFromState
      // returns the subtree's root nodes
      openedNodeGroupStack: undefined,
    };

    // Recursively compile the subtree
    const innerPlan = compileGraph(
      subtreeState,
      functionImplementations,
      { maxLoopIterations: maxIterations },
      depth + 1,
    );

    // Collect inner plan warnings
    for (const w of innerPlan.warnings) {
      warnings.push(`[Group "${typeOfNode.name}"] ${w}`);
    }

    // Build input mapping: outer input handle IDs -> inner GroupInput output handle IDs
    const inputMapping = new Map<string, string>();
    const outputMapping = new Map<string, string>();

    // Find GroupInput and GroupOutput nodes in subtree
    const groupInputNode = subtree.nodes.find(
      (n) => n.data.nodeTypeUniqueId === standardNodeTypeNamesMap.groupInput,
    );
    const groupOutputNode = subtree.nodes.find(
      (n) => n.data.nodeTypeUniqueId === standardNodeTypeNamesMap.groupOutput,
    );

    // Map outer inputs to GroupInput outputs by index position
    // Outer node's inputs[i] maps to GroupInput's outputs[i]
    if (groupInputNode) {
      const outerInputIds = extractInputHandleIds(node.data.inputs);
      const innerOutputIds = extractOutputHandleIds(
        groupInputNode.data.outputs,
      );

      const count = Math.min(outerInputIds.length, innerOutputIds.length);
      for (let i = 0; i < count; i++) {
        inputMapping.set(outerInputIds[i], innerOutputIds[i]);
      }
    }

    // Map GroupOutput inputs to outer outputs by index position
    // GroupOutput's inputs[i] maps to outer node's outputs[i]
    if (groupOutputNode) {
      const innerInputIds = extractInputHandleIds(groupOutputNode.data.inputs);
      const outerOutputIds = extractOutputHandleIds(node.data.outputs);

      const count = Math.min(innerInputIds.length, outerOutputIds.length);
      for (let i = 0; i < count; i++) {
        outputMapping.set(innerInputIds[i], outerOutputIds[i]);
      }
    }

    groupScopes.push({
      kind: 'group',
      groupNodeId: node.id,
      groupNodeTypeId: nodeTypeId,
      groupNodeTypeName: typeOfNode.name,
      innerPlan,
      inputMapping,
      outputMapping,
      concurrencyLevel: 0, // Will be reassigned by main compiler
    });
  }

  return { groupScopes, groupNodeIds, warnings };
}

/**
 * Check if a node type ID is a standard (built-in) node type.
 * Acts as a type guard: in the false branch, the type is narrowed to
 * Exclude<T, StandardNodeTypeName>, matching FunctionImplementations keys.
 */
function isStandardNodeType<T extends string>(
  nodeTypeId: T,
): nodeTypeId is T & StandardNodeTypeName {
  return (
    nodeTypeId === standardNodeTypeNamesMap.loopStart ||
    nodeTypeId === standardNodeTypeNamesMap.loopStop ||
    nodeTypeId === standardNodeTypeNamesMap.loopEnd ||
    nodeTypeId === standardNodeTypeNamesMap.groupInput ||
    nodeTypeId === standardNodeTypeNamesMap.groupOutput
  );
}

/**
 * Check if a node type ID is a group boundary node (GroupInput or GroupOutput).
 * These nodes are data mapping points handled by the executor, not executable
 * nodes — they must be excluded from the topological sort during compilation.
 */
function isGroupBoundaryNode<T extends string>(
  nodeTypeId: T,
): nodeTypeId is T & ('groupInput' | 'groupOutput') {
  return (
    nodeTypeId === standardNodeTypeNamesMap.groupInput ||
    nodeTypeId === standardNodeTypeNamesMap.groupOutput
  );
}

/**
 * Type-safe key lookup for Record types indexed by a generic string subtype.
 * Narrows `key` from `string` to `K` in the true branch, enabling direct
 * indexed access without casts.
 *
 * Accepts both full and partial records (mapped types with optional properties).
 */
function hasKey<K extends string>(
  obj: Partial<Record<K, unknown>>,
  key: string,
): key is K {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export {
  compileGroupScopes,
  isStandardNodeType,
  isGroupBoundaryNode,
  hasKey,
  MAX_GROUP_DEPTH,
};
