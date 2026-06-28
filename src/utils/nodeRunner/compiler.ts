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
import { standardNodeTypeNamesMap } from '../nodeStateManagement/standardNodes';
import { isLoopNode } from '../nodeStateManagement/nodes/loops';
import { isSwitchNode } from '../nodeStateManagement/nodes/switches';
import { topologicalSortWithLevels } from './topologicalSort';
import { compileLoopStructures, isBindLoopNodesEdge } from './loopCompiler';
import { compileSwitchStructures } from './switchCompiler';
import { isBindSwitchNodesEdge } from './switchCompilerHelpers';
import {
  compileGroupScopes,
  isStandardNodeType,
  isGroupBoundaryNode,
  hasKey,
} from './groupCompiler';
import { compareFanIn } from '../connectionOrder';

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

  // Root-level Graph I/O: ONLY at the true root scope (not inside an opened group,
  // not a nested compile). The single Graph Input / Graph Output node lets the
  // executor + codegen treat its handles as the program's parameters / return.
  // Inside groups these are the group's boundary nodes (handled via group scopes).
  const isRootScope = !depth && !state.openedNodeGroupStack?.length;

  // G2: a top-level Run while a node group is open compiles the open SUBTREE, not
  // the root program, and silently ignores root Graph I/O (isRootScope is false).
  // Surface that scope substitution as a plan warning so the UI / consumer can tell
  // the user. (A nested compile — `depth` set — is the group sub-compile itself and
  // legitimately has no root I/O, so it is excluded.)
  if (!depth && state.openedNodeGroupStack?.length) {
    const openGroup =
      state.openedNodeGroupStack[state.openedNodeGroupStack.length - 1];
    const groupLabel =
      state.typeOfNodes[openGroup.nodeType]?.name ?? openGroup.nodeType;
    warnings.push(
      `Running inside an open node group ("${groupLabel}"); root Graph I/O is ignored.`,
    );
  }

  const rootInputNodeId = isRootScope
    ? nodes.find(
        (node) =>
          node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.groupInput,
      )?.id
    : undefined;
  const rootOutputNodeId = isRootScope
    ? nodes.find(
        (node) =>
          node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.groupOutput,
      )?.id
    : undefined;

  if (nodes.length === 0) {
    return {
      levels: [],
      inputResolutionMap: new Map(),
      outputDistributionMap: new Map(),
      nodeCount: 0,
      warnings: [],
    };
  }

  // Build the input-resolution and output-distribution maps in ONE pass over
  // `edges`. Each fan-in entry captures its edges-array index (the deterministic
  // tiebreak, stored ON the entry) plus a finite-only `data.order` map
  // (`edgeOrderById`; one `Number.isFinite` predicate is the single authority —
  // NaN/±Infinity/non-numbers are left absent and fall through to
  // `connectionOrderValue`'s `+∞` sentinel).
  const inputResolutionMap = new Map<string, InputResolutionEntry[]>();
  const outputDistributionMap = new Map<string, OutputDistributionEntry[]>();
  const edgeOrderById = new Map<string, number>();

  for (const [edgesArrayIndex, edge] of edges.entries()) {
    const sourceHandle = edge.sourceHandle;
    const targetHandle = edge.targetHandle;

    if (!sourceHandle || !targetHandle) continue;

    // Skip structural bind edges from data flow maps
    if (
      isBindLoopNodesEdge(edge, nodes) ||
      isBindSwitchNodesEdge(edge, nodes)
    ) {
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
      edgesArrayIndex,
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

    // Finite order only (real data edges that became an entry above; one
    // `Number.isFinite` authority — the tiebreak index already rode onto the entry).
    const order = edge.data?.order;
    if (Number.isFinite(order)) edgeOrderById.set(edge.id, order as number);
  }

  // Honor user-defined connection order for fan-in inputs. Each edge may carry
  // `data.order` — its rank within the target handle's fan-in group, written by
  // REORDER_INPUT_CONNECTIONS. Sort each fan-in handle's resolution entries by
  // that order; edges without one tie on the `+∞` sentinel and fall back to their
  // `edgesArrayIndex` (edges-array position), so un-reordered handles and newly
  // added connections keep their existing order. The EXPLICIT index tiebreak
  // makes this independent of `Array.prototype.sort` stability and byte-identical
  // to the reorder popover (which tiebreaks on the same getEdges() index), so the
  // on-screen preview equals the executed/compiled order. This is the SINGLE
  // point that fixes fan-in order for BOTH the executor (valueStore builds
  // `connections[]` from these entries) and every codegen target.
  // STRUCTURE INVARIANT (load-bearing — do not break without re-applying this
  // sort, pinned by reorderedFanInInStructures.test.ts): loop/switch bodies live
  // at the ROOT scope, so their fan-in edges are in `edges` and are sorted HERE,
  // read back at runtime/codegen through the root `env.plan`; group subtrees get
  // their own sort via the recursive `compile()` over `subtree.edges`. Do NOT
  // give loop/switch bodies a scoped resolution map without re-running this sort.
  for (const inputEntries of inputResolutionMap.values()) {
    if (inputEntries.length < 2) continue;
    inputEntries.sort((first, second) =>
      compareFanIn(
        edgeOrderById.get(first.edgeId),
        first.edgesArrayIndex ?? 0,
        edgeOrderById.get(second.edgeId),
        second.edgesArrayIndex ?? 0,
      ),
    );
  }

  // ─────────────────────────────────────────────────────
  // Phase 2: Node Classification + Missing Implementation Detection
  // ─────────────────────────────────────────────────────

  for (const node of nodes) {
    const nodeTypeId = node.data.nodeTypeUniqueId;
    if (!nodeTypeId) continue;

    // Skip loop/switch nodes (checked before isStandardNodeType to preserve narrowing)
    if (isLoopNode(nodeTypeId)) continue;
    if (isSwitchNode(nodeTypeId)) continue;
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
  // Phase 3b: Switch Compilation
  // ─────────────────────────────────────────────────────

  const { switchBlocks, switchNodeIds } = compileSwitchStructures(
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

  // Build lookup maps for loop blocks, switch blocks, and group scopes
  const groupScopeByNodeId = new Map(
    groupScopes.map((scope) => [scope.groupNodeId, scope]),
  );
  const loopBlockByStartId = new Map(
    loopBlocks.map((block) => [block.loopStartNodeId, block]),
  );
  const switchBlockByStartId = new Map(
    switchBlocks.map((block) => [block.switchStartNodeId, block]),
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

  // Map every switch node ID to its proxy (switchStartNodeId)
  const nodeToSwitchProxy = new Map<string, string>();
  for (const block of switchBlocks) {
    const proxyId = block.switchStartNodeId;
    nodeToSwitchProxy.set(block.switchStartNodeId, proxyId);
    nodeToSwitchProxy.set(block.switchEndNodeId, proxyId);
    for (const step of [...block.trueBranchSteps, ...block.falseBranchSteps]) {
      if (step.kind === 'standard') {
        nodeToSwitchProxy.set(step.nodeId, proxyId);
      }
    }
  }

  // Remaining node IDs: non-loop, non-switch, non-boundary nodes + one proxy per loop/switch
  const loopProxyIds = new Set(loopBlocks.map((b) => b.loopStartNodeId));
  const switchProxyIds = new Set(switchBlocks.map((b) => b.switchStartNodeId));
  const remainingNodeIds = [
    ...nodes
      .map((n) => n.id)
      .filter(
        (id) =>
          !loopNodeIds.has(id) &&
          !switchNodeIds.has(id) &&
          !groupBoundaryNodeIds.has(id),
      ),
    ...loopProxyIds,
    ...switchProxyIds,
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
    if (isBindSwitchNodesEdge(edge, nodes)) continue;

    // Redirect loop/switch nodes to their proxy
    let source = edge.source;
    let target = edge.target;

    const sourceLoopProxy = nodeToLoopProxy.get(source);
    if (sourceLoopProxy) source = sourceLoopProxy;
    const sourceSwitchProxy = nodeToSwitchProxy.get(source);
    if (sourceSwitchProxy) source = sourceSwitchProxy;

    const targetLoopProxy = nodeToLoopProxy.get(target);
    if (targetLoopProxy) target = targetLoopProxy;
    const targetSwitchProxy = nodeToSwitchProxy.get(target);
    if (targetSwitchProxy) target = targetSwitchProxy;

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
          steps.push({ ...block, concurrencyLevel: levelIdx });
        }
        continue;
      }

      // Check if this is a switch proxy
      if (switchProxyIds.has(nodeId)) {
        const block = switchBlockByStartId.get(nodeId);
        if (block) {
          steps.push({ ...block, concurrencyLevel: levelIdx });
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
        customName: node.data.customName,
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
      } else if (step.kind === 'switch') {
        nodeCount +=
          2 + step.trueBranchSteps.length + step.falseBranchSteps.length;
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
    rootInputNodeId,
    rootOutputNodeId,
  };
}

export { compile, DEFAULT_MAX_LOOP_ITERATIONS };
