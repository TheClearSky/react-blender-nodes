import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import { getOutgoers, getIncomers } from '@xyflow/react';
import type { Zone } from './types';
import { getBoundaryNodeIds } from './types';

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
