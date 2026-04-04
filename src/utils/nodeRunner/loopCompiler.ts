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
 * Nested loops inside a parent loop's body are compiled recursively as
 * LoopExecutionBlock body steps, ensuring correct execution order and recording.
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
  // ── Discover all loop structures ─────────────────────
  const loopStartNodes = nodes.filter(
    (node) => node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart,
  );

  type LoopInfo = {
    loopStartId: string;
    loopStopId: string;
    loopEndId: string;
    bodyNodeIds: Set<string>;
    postStopBodyNodeIds: Set<string>;
    /** Union of bodyNodeIds + postStopBodyNodeIds for nesting detection */
    allBodyNodeIds: Set<string>;
  };

  const allLoops: LoopInfo[] = [];

  for (const loopStartNode of loopStartNodes) {
    const loopStructure = getLoopStructureFromNode(state, loopStartNode);
    if (!loopStructure) continue;

    const { loopStart, loopStop, loopEnd } = loopStructure;
    const { nodesInRegionStartToStop, nodesInRegionStopToEnd } =
      getNodesInLoopRegion(state, loopStructure);

    const allBodyNodeIds = new Set<string>([
      ...nodesInRegionStartToStop,
      ...nodesInRegionStopToEnd,
    ]);

    allLoops.push({
      loopStartId: loopStart.id,
      loopStopId: loopStop.id,
      loopEndId: loopEnd.id,
      bodyNodeIds: nodesInRegionStartToStop,
      postStopBodyNodeIds: nodesInRegionStopToEnd,
      allBodyNodeIds,
    });
  }

  // ── Determine which loops are top-level vs nested ────
  // A loop is nested if its loopStart is inside another loop's body.
  const nestedLoopStartIds = new Set<string>();
  for (const loop of allLoops) {
    for (const otherLoop of allLoops) {
      if (loop === otherLoop) continue;
      if (otherLoop.allBodyNodeIds.has(loop.loopStartId)) {
        nestedLoopStartIds.add(loop.loopStartId);
      }
    }
  }

  // Build a lookup from loopStartId to LoopInfo
  const loopInfoByStartId = new Map<string, LoopInfo>();
  for (const loop of allLoops) {
    loopInfoByStartId.set(loop.loopStartId, loop);
  }

  // ── Compile a single loop (recursive for nested loops) ──
  /**
   * Compile a set of body node IDs into sorted ExecutionSteps,
   * handling inner loops (proxy approach) and group scopes.
   */
  function compileBodyRegion(
    regionNodeIds: Set<string>,
    innerLoops: LoopInfo[],
    innerLoopBlocks: Map<string, LoopExecutionBlock>,
    innerLoopNodeIds: Set<string>,
  ): ExecutionStep[] {
    const innerProxyIds = new Set(innerLoops.map((l) => l.loopStartId));

    // Use proxy approach for inner loops
    const nodeToProxy = new Map<string, string>();
    for (const innerLoop of innerLoops) {
      const proxyId = innerLoop.loopStartId;
      nodeToProxy.set(innerLoop.loopStartId, proxyId);
      nodeToProxy.set(innerLoop.loopStopId, proxyId);
      nodeToProxy.set(innerLoop.loopEndId, proxyId);
      for (const id of innerLoop.allBodyNodeIds) {
        nodeToProxy.set(id, proxyId);
      }
    }

    // Include all region nodes (excluding inner loop internals) + all inner loop proxies.
    // Inner loops were already partitioned to this region, so their proxies belong here unconditionally.
    const nodeIdArray = [
      ...Array.from(regionNodeIds).filter((id) => !innerLoopNodeIds.has(id)),
      ...innerProxyIds,
    ];

    if (nodeIdArray.length === 0) return [];

    const nodeIdSet = new Set(nodeIdArray);

    // Build adjacency lists with proxy redirection
    const adjacencyList = new Map<string, Set<string>>();
    const reverseAdjacencyList = new Map<string, Set<string>>();

    for (const nodeId of nodeIdArray) {
      adjacencyList.set(nodeId, new Set());
      reverseAdjacencyList.set(nodeId, new Set());
    }

    for (const edge of edges) {
      if (isBindLoopNodesEdge(edge, nodes)) continue;

      let source = edge.source;
      let target = edge.target;

      const sourceProxy = nodeToProxy.get(source);
      if (sourceProxy) source = sourceProxy;
      const targetProxy = nodeToProxy.get(target);
      if (targetProxy) target = targetProxy;

      if (source === target) continue;

      if (nodeIdSet.has(source) && nodeIdSet.has(target)) {
        adjacencyList.get(source)?.add(target);
        reverseAdjacencyList.get(target)?.add(source);
      }
    }

    const levels = topologicalSortWithLevels(
      nodeIdArray,
      adjacencyList,
      reverseAdjacencyList,
    );

    // Detect group instances
    const nodesForGroupCheck = nodeIdArray
      .filter((id) => !innerProxyIds.has(id))
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n != null);

    const { groupScopes } = compileGroupScopes(
      state,
      nodesForGroupCheck,
      functionImplementations,
      maxIterations,
      compileGraph,
      depth + 1,
    );

    const groupScopeByNodeId = new Map(
      groupScopes.map((s) => [s.groupNodeId, s]),
    );

    // Convert to ExecutionSteps
    const steps: ExecutionStep[] = [];
    for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
      const level = levels[levelIdx];
      for (const nodeId of level) {
        if (innerProxyIds.has(nodeId)) {
          const innerBlock = innerLoopBlocks.get(nodeId);
          if (innerBlock) {
            steps.push({ ...innerBlock, concurrencyLevel: levelIdx });
          }
          continue;
        }

        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        const nodeTypeId = node.data.nodeTypeUniqueId;
        if (!nodeTypeId) continue;

        if (isGroupBoundaryNode(nodeTypeId)) continue;

        const groupScope = groupScopeByNodeId.get(nodeId);
        if (groupScope) {
          steps.push({ ...groupScope, concurrencyLevel: levelIdx });
          continue;
        }

        const typeOfNode = state.typeOfNodes[nodeTypeId];
        steps.push({
          kind: 'standard',
          nodeId,
          nodeTypeId,
          nodeTypeName: typeOfNode?.name ?? nodeTypeId,
          concurrencyLevel: levelIdx,
        });
      }
    }
    return steps;
  }

  function compileSingleLoop(loop: LoopInfo): LoopExecutionBlock {
    const {
      loopStartId,
      loopStopId,
      loopEndId,
      bodyNodeIds,
      postStopBodyNodeIds,
      allBodyNodeIds,
    } = loop;

    // Find inner loops whose loopStart is among our body nodes (either region)
    const innerLoops: LoopInfo[] = [];
    const innerLoopNodeIds = new Set<string>();
    for (const innerLoop of allLoops) {
      if (innerLoop === loop) continue;
      if (allBodyNodeIds.has(innerLoop.loopStartId)) {
        innerLoops.push(innerLoop);
        innerLoopNodeIds.add(innerLoop.loopStartId);
        innerLoopNodeIds.add(innerLoop.loopStopId);
        innerLoopNodeIds.add(innerLoop.loopEndId);
        for (const id of innerLoop.allBodyNodeIds) {
          innerLoopNodeIds.add(id);
        }
      }
    }

    // Recursively compile inner loops
    const innerLoopBlocks = new Map<string, LoopExecutionBlock>();
    for (const innerLoop of innerLoops) {
      innerLoopBlocks.set(innerLoop.loopStartId, compileSingleLoop(innerLoop));
    }

    // Partition inner loops into pre-stop and post-stop based on where loopStart lives
    const preStopInnerLoops = innerLoops.filter((il) =>
      bodyNodeIds.has(il.loopStartId),
    );
    const postStopInnerLoops = innerLoops.filter((il) =>
      postStopBodyNodeIds.has(il.loopStartId),
    );

    const preStopSteps = compileBodyRegion(
      bodyNodeIds,
      preStopInnerLoops,
      innerLoopBlocks,
      innerLoopNodeIds,
    );
    const postStopSteps = compileBodyRegion(
      postStopBodyNodeIds,
      postStopInnerLoops,
      innerLoopBlocks,
      innerLoopNodeIds,
    );

    return {
      kind: 'loop',
      loopStartNodeId: loopStartId,
      loopStopNodeId: loopStopId,
      loopEndNodeId: loopEndId,
      preStopSteps,
      postStopSteps,
      maxIterations,
      concurrencyLevel: 0, // Reassigned by parent
    };
  }

  // ── Compile only top-level loops ─────────────────────
  const loopBlocks: LoopExecutionBlock[] = [];
  const loopNodeIds = new Set<string>();

  for (const loop of allLoops) {
    // Skip nested loops — they're compiled recursively by their parent
    if (nestedLoopStartIds.has(loop.loopStartId)) continue;

    loopBlocks.push(compileSingleLoop(loop));

    // Add ALL node IDs belonging to this loop tree to the exclusion set
    loopNodeIds.add(loop.loopStartId);
    loopNodeIds.add(loop.loopStopId);
    loopNodeIds.add(loop.loopEndId);
    for (const id of loop.allBodyNodeIds) {
      loopNodeIds.add(id);
    }
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
  if (!targetType || !isLoopNode(targetType)) return false;

  const targetHandleId = edge.targetHandle;
  if (!targetHandleId) return false;

  const inputs = targetNode.data.inputs;
  if (!inputs) return false;

  // Flatten input groups
  const flatInputs = inputs.flatMap((inp) =>
    'inputs' in inp ? inp.inputs : [inp],
  );

  for (const input of flatInputs) {
    if ('id' in input && input.id === targetHandleId) {
      const dataTypeId = input.dataType?.dataTypeUniqueId;
      if (dataTypeId === standardDataTypeNamesMap.bindLoopNodes) {
        return true;
      }
    }
  }

  return false;
}

export { compileLoopStructures, isBindLoopNodesEdge };
