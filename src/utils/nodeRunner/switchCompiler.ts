import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  SwitchExecutionBlock,
  ExecutionStep,
  ExecutionPlan,
  FunctionImplementations,
} from './types';
import { standardNodeTypeNamesMap } from '../nodeStateManagement/standardNodes';
import {
  getSwitchStructureFromNode,
  getNodesInSwitchRegion,
} from '../nodeStateManagement/nodes/switches';
import { topologicalSortWithLevels } from './topologicalSort';
import { compileGroupScopes, isGroupBoundaryNode } from './groupCompiler';
import { isBindSwitchNodesEdge } from './switchCompilerHelpers';
import { findZoneByStructure } from '../nodeStateManagement/zones';

function compileSwitchStructures<
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
  switchBlocks: ReadonlyArray<SwitchExecutionBlock>;
  switchNodeIds: ReadonlySet<string>;
} {
  const switchStartNodes = nodes.filter(
    (node) =>
      node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart,
  );

  const switchBlocks: SwitchExecutionBlock[] = [];
  const switchNodeIds = new Set<string>();

  for (const switchStartNode of switchStartNodes) {
    const structure = getSwitchStructureFromNode(state, switchStartNode);
    if (!structure) continue;

    const { switchStart, switchEnd } = structure;

    let nodesInTrueBranch: Set<string>;
    let nodesInFalseBranch: Set<string>;
    const trueZone = state.zones
      ? findZoneByStructure(state.zones, switchStart.id, 'trueBranch')
      : undefined;
    const falseZone = state.zones
      ? findZoneByStructure(state.zones, switchStart.id, 'falseBranch')
      : undefined;
    if (trueZone && falseZone) {
      nodesInTrueBranch = new Set(trueZone.nodeIds);
      nodesInFalseBranch = new Set(falseZone.nodeIds);
    } else {
      const regions = getNodesInSwitchRegion(state, structure);
      nodesInTrueBranch = regions.nodesInTrueBranch;
      nodesInFalseBranch = regions.nodesInFalseBranch;
    }

    switchNodeIds.add(switchStart.id);
    switchNodeIds.add(switchEnd.id);
    for (const id of nodesInTrueBranch) switchNodeIds.add(id);
    for (const id of nodesInFalseBranch) switchNodeIds.add(id);

    function compileBranch(branchNodeIds: Set<string>): ExecutionStep[] {
      if (branchNodeIds.size === 0) return [];

      const nodeIdArray = [...branchNodeIds];
      const nodeIdSet = new Set(nodeIdArray);

      const adjacencyList = new Map<string, Set<string>>();
      const reverseAdjacencyList = new Map<string, Set<string>>();
      for (const id of nodeIdArray) {
        adjacencyList.set(id, new Set());
        reverseAdjacencyList.set(id, new Set());
      }

      for (const edge of edges) {
        if (isBindSwitchNodesEdge(edge, nodes)) continue;
        const source = edge.source;
        const target = edge.target;
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

      const nodesForGroupCheck = nodeIdArray
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

      const steps: ExecutionStep[] = [];
      for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
        for (const nodeId of levels[levelIdx]) {
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

    switchBlocks.push({
      kind: 'switch',
      switchStartNodeId: switchStart.id,
      switchEndNodeId: switchEnd.id,
      trueBranchSteps: compileBranch(nodesInTrueBranch),
      falseBranchSteps: compileBranch(nodesInFalseBranch),
      concurrencyLevel: 0,
    });
  }

  return { switchBlocks, switchNodeIds };
}

export { compileSwitchStructures };
