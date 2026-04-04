import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  ExecutionPlan,
  ExecutionStep,
  FunctionImplementations,
  InputResolutionEntry,
  OutputDistributionEntry,
  StandardExecutionStep,
} from './types';
import { getCurrentNodesAndEdgesFromState } from '../nodeStateManagement/nodes/constructAndModifyNodes';
import { isLoopNode } from '../nodeStateManagement/nodes/loops';
import { topologicalSortWithLevels } from './topologicalSort';
import { compileLoopStructures, isBindLoopNodesEdge } from './loopCompiler';
import {
  compileGroupScopes,
  isStandardNodeType,
  isGroupBoundaryNode,
  hasKey,
} from './groupCompiler';

const DEFAULT_MAX_LOOP_ITERATIONS = 100;

/**
 * Compile a graph State into an ExecutionPlan (intermediate representation).
 *
 * The compiler performs 5 phases:
 * 1. Graph Analysis — build adjacency lists and resolution maps from edges
 * 2. Node Classification — separate nodes into standard, loop, and group
 * 3. Loop Compilation — compile loop structures into LoopExecutionBlocks
 * 4. Group Compilation — compile node groups into GroupExecutionScopes
 * 5. Topological Sort — sort remaining nodes into concurrency levels
 */
function compile<
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
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
  options?: { maxLoopIterations?: number },
  depth?: number,
): ExecutionPlan {
  const maxLoopIterations =
    options?.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITERATIONS;
  const warnings: string[] = [];

  // ─────────────────────────────────────────────────────
  // Phase 1: Graph Analysis
  // ─────────────────────────────────────────────────────

  const { nodes, edges } = getCurrentNodesAndEdgesFromState(state);

  if (nodes.length === 0) {
    return {
      levels: [],
      inputResolutionMap: new Map(),
      outputDistributionMap: new Map(),
      nodeCount: 0,
      warnings: [],
    };
  }

  // Build input resolution map and output distribution map
  const inputResolutionMap = new Map<string, InputResolutionEntry[]>();
  const outputDistributionMap = new Map<string, OutputDistributionEntry[]>();

  for (const edge of edges) {
    const sourceHandle = edge.sourceHandle;
    const targetHandle = edge.targetHandle;

    if (!sourceHandle || !targetHandle) continue;

    // Skip bindLoopNodes edges from data flow maps (structural only, no data)
    if (isBindLoopNodesEdge(edge, nodes)) {
      continue;
    }

    // Add to input resolution map
    const inputKey = `${edge.target}:${targetHandle}`;
    let inputEntries = inputResolutionMap.get(inputKey);
    if (!inputEntries) {
      inputEntries = [];
      inputResolutionMap.set(inputKey, inputEntries);
    }
    inputEntries.push({
      edgeId: edge.id,
      sourceNodeId: edge.source,
      sourceHandleId: sourceHandle,
    });

    // Add to output distribution map
    const outputKey = `${edge.source}:${sourceHandle}`;
    let outputEntries = outputDistributionMap.get(outputKey);
    if (!outputEntries) {
      outputEntries = [];
      outputDistributionMap.set(outputKey, outputEntries);
    }
    outputEntries.push({
      edgeId: edge.id,
      targetNodeId: edge.target,
      targetHandleId: targetHandle,
    });
  }

  // ─────────────────────────────────────────────────────
  // Phase 2: Node Classification + Missing Implementation Detection
  // ─────────────────────────────────────────────────────

  for (const node of nodes) {
    const nodeTypeId = node.data.nodeTypeUniqueId;
    if (!nodeTypeId) continue;

    // Skip loop nodes (checked before isStandardNodeType to preserve narrowing)
    if (isLoopNode(nodeTypeId)) continue;
    // Skip standard nodes — narrows nodeTypeId to Exclude<NodeTypeUniqueId, StandardNodeTypeName>
    if (isStandardNodeType(nodeTypeId)) continue;

    // Skip group instances (their inner nodes are checked in groupCompiler)
    const typeOfNode = state.typeOfNodes[nodeTypeId];
    if (typeOfNode?.subtree) continue;

    // Check if function implementation exists
    if (
      !hasKey(functionImplementations, nodeTypeId) ||
      !functionImplementations[nodeTypeId]
    ) {
      const name = typeOfNode?.name ?? nodeTypeId;
      warnings.push(
        `Node type "${name}" (${nodeTypeId}) has no function implementation.`,
      );
    }
  }

  // ─────────────────────────────────────────────────────
  // Phase 3: Loop Compilation
  // ─────────────────────────────────────────────────────

  const { loopBlocks, loopNodeIds } = compileLoopStructures(
    state,
    nodes,
    edges,
    maxLoopIterations,
    functionImplementations,
    compile,
    depth ?? 0,
  );

  // ─────────────────────────────────────────────────────
  // Phase 4: Group Compilation
  // ─────────────────────────────────────────────────────

  const {
    groupScopes,
    groupNodeIds: _groupNodeIds,
    warnings: groupWarnings,
  } = compileGroupScopes(
    state,
    nodes,
    functionImplementations,
    maxLoopIterations,
    compile,
    depth ?? 0,
  );

  for (const w of groupWarnings) {
    warnings.push(w);
  }

  // Build lookup maps for loop blocks and group scopes
  const groupScopeByNodeId = new Map(
    groupScopes.map((scope) => [scope.groupNodeId, scope]),
  );
  // Build a map from loopStart nodeId to its block
  const loopBlockByStartId = new Map(
    loopBlocks.map((block) => [block.loopStartNodeId, block]),
  );

  // ─────────────────────────────────────────────────────
  // Phase 4.5: Identify group boundary nodes
  // ─────────────────────────────────────────────────────

  // GroupInput/GroupOutput are data mapping points handled by the executor,
  // not executable nodes. They must be excluded from the topological sort
  // just like loop nodes are. Their edges remain in the resolution maps
  // so the executor can still resolve handle mappings.
  const groupBoundaryNodeIds = new Set<string>();
  for (const node of nodes) {
    const boundaryTypeId = node.data.nodeTypeUniqueId;
    if (boundaryTypeId && isGroupBoundaryNode(boundaryTypeId)) {
      groupBoundaryNodeIds.add(node.id);
    }
  }

  // ─────────────────────────────────────────────────────
  // Phase 5: Topological Sort
  // ─────────────────────────────────────────────────────

  // Use a proxy/representative approach for loops:
  // Each loop's loopStartNodeId acts as a proxy in the sort.
  // All external edges to/from any loop node are redirected through
  // the proxy, ensuring both upstream AND downstream dependencies
  // are respected.

  // Map every loop node ID to its loop's proxy (loopStartNodeId)
  const nodeToLoopProxy = new Map<string, string>();
  for (const block of loopBlocks) {
    const proxyId = block.loopStartNodeId;
    nodeToLoopProxy.set(block.loopStartNodeId, proxyId);
    nodeToLoopProxy.set(block.loopStopNodeId, proxyId);
    nodeToLoopProxy.set(block.loopEndNodeId, proxyId);
    for (const step of [...block.preStopSteps, ...block.postStopSteps]) {
      if (step.kind === 'standard') {
        nodeToLoopProxy.set(step.nodeId, proxyId);
      }
    }
  }

  // Remaining node IDs: non-loop, non-boundary nodes + one proxy per loop
  const loopProxyIds = new Set(loopBlocks.map((b) => b.loopStartNodeId));
  const remainingNodeIds = [
    ...nodes
      .map((n) => n.id)
      .filter((id) => !loopNodeIds.has(id) && !groupBoundaryNodeIds.has(id)),
    ...loopProxyIds,
  ];
  const remainingSet = new Set(remainingNodeIds);

  // Build filtered adjacency lists, redirecting loop node edges to proxies
  const filteredAdjacency = new Map<string, Set<string>>();
  const filteredReverseAdjacency = new Map<string, Set<string>>();

  for (const nodeId of remainingNodeIds) {
    filteredAdjacency.set(nodeId, new Set());
    filteredReverseAdjacency.set(nodeId, new Set());
  }

  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    if (isBindLoopNodesEdge(edge, nodes)) continue;

    // Redirect loop nodes to their proxy
    let source = edge.source;
    let target = edge.target;

    const sourceProxy = nodeToLoopProxy.get(source);
    if (sourceProxy) source = sourceProxy;

    const targetProxy = nodeToLoopProxy.get(target);
    if (targetProxy) target = targetProxy;

    // Skip internal loop edges (both ends in same loop)
    if (source === target) continue;

    // Only include if both endpoints are in the remaining set
    if (remainingSet.has(source) && remainingSet.has(target)) {
      filteredAdjacency.get(source)?.add(target);
      filteredReverseAdjacency.get(target)?.add(source);
    }
  }

  // Sort remaining nodes (including loop proxies)
  const sortedLevels = topologicalSortWithLevels(
    remainingNodeIds,
    filteredAdjacency,
    filteredReverseAdjacency,
  );

  // Convert sorted levels into ExecutionStep levels
  // Replace proxy IDs with LoopExecutionBlocks, group IDs with GroupExecutionScopes
  const levels: ExecutionStep[][] = [];

  for (let levelIdx = 0; levelIdx < sortedLevels.length; levelIdx++) {
    const level = sortedLevels[levelIdx];
    const steps: ExecutionStep[] = [];

    for (const nodeId of level) {
      // Check if this is a loop proxy
      if (loopProxyIds.has(nodeId)) {
        const block = loopBlockByStartId.get(nodeId);
        if (block) {
          steps.push({
            ...block,
            concurrencyLevel: levelIdx,
          });
        }
        continue;
      }

      // Check if this is a group node
      const groupScope = groupScopeByNodeId.get(nodeId);
      if (groupScope) {
        steps.push({
          ...groupScope,
          concurrencyLevel: levelIdx,
        });
        continue;
      }

      // Standard node
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const nodeTypeId = node.data.nodeTypeUniqueId;
      if (!nodeTypeId) continue;
      const typeOfNode = state.typeOfNodes[nodeTypeId];

      steps.push({
        kind: 'standard',
        nodeId,
        nodeTypeId,
        nodeTypeName: typeOfNode?.name ?? nodeTypeId,
        concurrencyLevel: levelIdx,
      } satisfies StandardExecutionStep);
    }

    if (steps.length > 0) {
      levels.push(steps);
    }
  }

  // Count total executable nodes
  let nodeCount = 0;
  for (const level of levels) {
    for (const step of level) {
      if (step.kind === 'standard') {
        nodeCount++;
      } else if (step.kind === 'loop') {
        // Count loop triplet + body nodes
        nodeCount += 3 + step.preStopSteps.length + step.postStopSteps.length;
      } else if (step.kind === 'group') {
        nodeCount += 1 + step.innerPlan.nodeCount;
      }
    }
  }

  return {
    levels,
    inputResolutionMap,
    outputDistributionMap,
    nodeCount,
    warnings,
  };
}

export { compile, DEFAULT_MAX_LOOP_ITERATIONS };
