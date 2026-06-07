import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import { getOutgoers, getIncomers } from '@xyflow/react';
import type { Zone } from './types';
import { getBoundaryNodeIds } from './types';

/**
 * Single-pass BFS that discovers all body nodes inside a zone.
 *
 * Starts by scanning edges connected to the zone's boundary handles
 * (defined in `zone.boundaryHandles`), then expands bidirectionally
 * via `getOutgoers`/`getIncomers`, stopping at boundary nodes.
 *
 * @param state - The current graph state (must be scope-correct — pass
 *   subtree nodes/edges when inside a node group).
 * @param zone - The zone whose body nodes to discover. Must have
 *   `boundaryHandles` defined (returns empty set for user zones).
 * @returns Set of node IDs inside the zone (excludes boundary nodes).
 *
 * @example
 * ```ts
 * const bodyNodeIds = discoverZoneNodesFromHandles(viewScopedState, trueZone);
 * // bodyNodeIds = Set { 'notGateId', 'andGateId' }
 * ```
 */
function discoverZoneNodesFromHandles<
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
  zone: Zone,
): Set<string> {
  if (!zone.boundaryHandles) return new Set();

  const boundaryNodeIdSet = new Set(getBoundaryNodeIds(zone));
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const [nodeId, { handleIds, direction }] of Object.entries(
    zone.boundaryHandles,
  )) {
    const handleIdSet = new Set(handleIds);
    for (const edge of state.edges) {
      if (
        direction === 'outputs' &&
        edge.source === nodeId &&
        edge.sourceHandle &&
        handleIdSet.has(edge.sourceHandle)
      ) {
        if (!boundaryNodeIdSet.has(edge.target)) queue.push(edge.target);
      }
      if (
        direction === 'inputs' &&
        edge.target === nodeId &&
        edge.targetHandle &&
        handleIdSet.has(edge.targetHandle)
      ) {
        if (!boundaryNodeIdSet.has(edge.source)) queue.push(edge.source);
      }
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId) || boundaryNodeIdSet.has(nodeId)) continue;
    visited.add(nodeId);

    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    for (const outgoer of getOutgoers(node, state.nodes, state.edges)) {
      if (!visited.has(outgoer.id) && !boundaryNodeIdSet.has(outgoer.id)) {
        queue.push(outgoer.id);
      }
    }
    for (const incomer of getIncomers(node, state.nodes, state.edges)) {
      if (!visited.has(incomer.id) && !boundaryNodeIdSet.has(incomer.id)) {
        queue.push(incomer.id);
      }
    }
  }

  return visited;
}

/**
 * Checks whether a node can reach any of the given boundary nodes via
 * edges in either direction (bidirectional BFS).
 *
 * Used to distinguish isolated nodes (no path to the structure — allowed
 * to join a zone) from truly external nodes (connected to outside-structure
 * nodes — blocked from zone handles).
 *
 * @param state - The current graph state (scope-correct).
 * @param startNodeId - The node to check reachability from.
 * @param boundaryNodeIds - Set of boundary node IDs to search for.
 * @returns `true` if the node can reach any boundary node, `false` if isolated.
 *
 * @example
 * ```ts
 * const canReach = isNodeReachableToBoundary(state, freshNodeId, new Set([switchStartId, switchEndId]));
 * if (!canReach) {
 *   // Node is isolated — allow it to join the zone
 * }
 * ```
 */
function isNodeReachableToBoundary<
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
  startNodeId: string,
  boundaryNodeIds: ReadonlySet<string>,
): boolean {
  const visited = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    if (boundaryNodeIds.has(nodeId)) return true;

    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    for (const outgoer of getOutgoers(node, state.nodes, state.edges)) {
      if (!visited.has(outgoer.id)) queue.push(outgoer.id);
    }
    for (const incomer of getIncomers(node, state.nodes, state.edges)) {
      if (!visited.has(incomer.id)) queue.push(incomer.id);
    }
  }

  return false;
}

export { discoverZoneNodesFromHandles, isNodeReachableToBoundary };
