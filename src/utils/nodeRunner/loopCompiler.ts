import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  LoopExecutionBlock,
  ExecutionStep,
  ExecutionPlan,
  FunctionImplementations,
} from './types';
import {
  standardNodeTypeNamesMap,
  standardDataTypeNamesMap,
} from '../nodeStateManagement/standardNodes';
import {
  isLoopNode,
  getLoopStructureFromNode,
  getNodesInLoopRegion,
} from '../nodeStateManagement/nodes/loops';
import { topologicalSortWithLevels } from './topologicalSort';
import { compileGroupScopes, isGroupBoundaryNode } from './groupCompiler';

/**
 * Compile all loop structures in the graph into LoopExecutionBlocks.
 *
 * For each loopStart node, finds the complete triplet (start, stop, end),
 * discovers body nodes, topologically sorts them, and packages them into
 * a LoopExecutionBlock.
 *
 * Body nodes that are group instances are compiled into GroupExecutionScope
 * steps (instead of StandardExecutionStep) so they execute correctly at runtime.
 *
 * Returns the compiled blocks plus the set of all node IDs belonging to
 * loops (to exclude from the main topological sort).
 */
function compileLoopStructures<
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
  edges: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'],
  maxIterations: number,
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
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
  loopBlocks: ReadonlyArray<LoopExecutionBlock>;
  loopNodeIds: ReadonlySet<string>;
} {
  const loopBlocks: LoopExecutionBlock[] = [];
  const loopNodeIds = new Set<string>();

  // Find all loopStart nodes
  const loopStartNodes = nodes.filter(
    (node) => node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart,
  );

  for (const loopStartNode of loopStartNodes) {
    const loopStructure = getLoopStructureFromNode(state, loopStartNode);
    if (!loopStructure) {
      // Incomplete loop structure — skip (validation should have caught this)
      continue;
    }

    const { loopStart, loopStop, loopEnd } = loopStructure;

    // Add loop triplet node IDs
    loopNodeIds.add(loopStart.id);
    loopNodeIds.add(loopStop.id);
    loopNodeIds.add(loopEnd.id);

    // Get body nodes (between loopStart and loopStop)
    const { nodesInRegionStartToStop } = getNodesInLoopRegion(
      state,
      loopStructure,
    );

    // Add body node IDs to the exclusion set
    for (const bodyNodeId of nodesInRegionStartToStop) {
      loopNodeIds.add(bodyNodeId);
    }

    // Build adjacency lists for body nodes only
    const bodyNodeIdArray = Array.from(nodesInRegionStartToStop);
    const bodyNodeIdSet = new Set(bodyNodeIdArray);

    const adjacencyList = new Map<string, Set<string>>();
    const reverseAdjacencyList = new Map<string, Set<string>>();

    for (const nodeId of bodyNodeIdArray) {
      adjacencyList.set(nodeId, new Set());
      reverseAdjacencyList.set(nodeId, new Set());
    }

    // Only include edges where both source and target are body nodes
    // and the edge is not a bindLoopNodes structural edge
    for (const edge of edges) {
      if (bodyNodeIdSet.has(edge.source) && bodyNodeIdSet.has(edge.target)) {
        // Check if this is a structural bindLoopNodes edge by looking at
        // the source handle's data type
        if (isBindLoopNodesEdge(edge, nodes)) {
          continue;
        }

        const fwd = adjacencyList.get(edge.source);
        if (fwd) fwd.add(edge.target);

        const rev = reverseAdjacencyList.get(edge.target);
        if (rev) rev.add(edge.source);
      }
    }

    // Topologically sort body nodes
    const bodyLevels = topologicalSortWithLevels(
      bodyNodeIdArray,
      adjacencyList,
      reverseAdjacencyList,
    );

    // Detect group instances among body nodes so they're compiled as
    // GroupExecutionScope instead of StandardExecutionStep.
    const bodyNodesForGroupCheck = bodyNodeIdArray
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n != null);

    const { groupScopes: bodyGroupScopes } = compileGroupScopes(
      state,
      bodyNodesForGroupCheck,
      functionImplementations,
      maxIterations,
      compileGraph,
      depth + 1,
    );

    const bodyGroupScopeByNodeId = new Map(
      bodyGroupScopes.map((s) => [s.groupNodeId, s]),
    );

    // Convert to ExecutionSteps with proper classification
    const bodySteps: ExecutionStep[] = [];
    for (let levelIdx = 0; levelIdx < bodyLevels.length; levelIdx++) {
      const level = bodyLevels[levelIdx];
      for (const nodeId of level) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        const nodeTypeId = node.data.nodeTypeUniqueId;
        if (!nodeTypeId) continue;

        // Skip group boundary nodes (GroupInput/GroupOutput inside nested groups)
        if (isGroupBoundaryNode(nodeTypeId)) continue;

        // Check if this body node is a group instance
        const groupScope = bodyGroupScopeByNodeId.get(nodeId);
        if (groupScope) {
          bodySteps.push({
            ...groupScope,
            concurrencyLevel: levelIdx,
          });
          continue;
        }

        // Standard node
        const typeOfNode = state.typeOfNodes[nodeTypeId];
        bodySteps.push({
          kind: 'standard',
          nodeId,
          nodeTypeId,
          nodeTypeName: typeOfNode?.name ?? nodeTypeId,
          concurrencyLevel: levelIdx,
        });
      }
    }

    loopBlocks.push({
      kind: 'loop',
      loopStartNodeId: loopStart.id,
      loopStopNodeId: loopStop.id,
      loopEndNodeId: loopEnd.id,
      bodySteps,
      maxIterations,
      concurrencyLevel: 0, // Will be reassigned by main compiler based on external dependencies
    });
  }

  return { loopBlocks, loopNodeIds };
}

/**
 * Check if an edge is a structural bindLoopNodes edge.
 * These edges use the 'bindLoopNodes' data type and should not create
 * data flow entries.
 */
function isBindLoopNodesEdge<
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
  if (!sourceNode) return false;

  // Check if source node is a loop node
  const sourceType = sourceNode.data.nodeTypeUniqueId;
  if (!sourceType) return false;
  if (!isLoopNode(sourceType)) return false;

  // Check the source handle's data type
  const sourceHandleId = edge.sourceHandle;
  const outputs = sourceNode.data.outputs;
  if (!outputs) return false;

  for (const output of outputs) {
    if ('id' in output && output.id === sourceHandleId) {
      const dataTypeId = output.dataType?.dataTypeUniqueId;
      if (dataTypeId === standardDataTypeNamesMap.bindLoopNodes) {
        return true;
      }
    }
  }

  // Also check if the target node is a loop node and the target handle is bindLoopNodes
  const targetNode = nodes.find((n) => n.id === edge.target);
  if (!targetNode) return false;

  const targetType = targetNode.data.nodeTypeUniqueId;
  if (!targetType) return false;
  if (!isLoopNode(targetType)) return false;

  const targetHandleId = edge.targetHandle;
  if (!targetHandleId) return false;

  const inputs = targetNode.data.inputs;
  if (!inputs) return false;

  for (const input of inputs) {
    if ('inputs' in input) {
      // Panel — check inner inputs
      for (const innerInput of input.inputs) {
        if (innerInput.id === targetHandleId) {
          if (
            innerInput.dataType?.dataTypeUniqueId ===
            standardDataTypeNamesMap.bindLoopNodes
          ) {
            return true;
          }
        }
      }
    } else if ('id' in input && input.id === targetHandleId) {
      const dataTypeId = input.dataType?.dataTypeUniqueId;
      if (dataTypeId === standardDataTypeNamesMap.bindLoopNodes) {
        return true;
      }
    }
  }

  return false;
}

export { compileLoopStructures, isBindLoopNodesEdge };
