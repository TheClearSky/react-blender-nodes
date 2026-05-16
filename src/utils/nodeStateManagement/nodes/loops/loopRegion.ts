import type { State, SupportedUnderlyingTypes } from '../../types';
import type { z } from 'zod';
import { getOutgoers, getIncomers } from '@xyflow/react';
import type { LoopStructure } from './types';

/**
 * Gets all nodes reachable from a given node in both forward and backward directions
 * This includes all nodes that can be reached by following edges in any direction (zigzag paths)
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param startNodeId - ID of the starting node
 * @returns Set of all reachable node IDs
 */
function getAllReachableNodes<
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
): Set<string> {
  const queue: string[] = [startNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);

    const currentNode = state.nodes.find((node) => node.id === currentNodeId);
    if (!currentNode) {
      continue;
    }

    // Get all outgoers (forward direction)
    const outgoers = getOutgoers(currentNode, state.nodes, state.edges);
    for (const outgoer of outgoers) {
      if (!visited.has(outgoer.id)) {
        queue.push(outgoer.id);
      }
    }

    // Get all incomers (backward direction)
    const incomers = getIncomers(currentNode, state.nodes, state.edges);
    for (const incomer of incomers) {
      if (!visited.has(incomer.id)) {
        queue.push(incomer.id);
      }
    }
  }

  return visited;
}

/**
 * Gets all nodes inside a loop region (between loopStart and loopStop, or between loopStop and loopEnd)
 * Uses bidirectional traversal to handle zigzag paths - regions are only separated by loop nodes
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param loopStructure - The loop structure to analyze
 * @param region - Which region to get nodes from: 'startToStop' or 'stopToEnd'
 * @returns Set of node IDs inside the specified region
 */
function getNodesInLoopRegion<
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
  loopStructure: LoopStructure<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): {
  nodesInRegionStartToStop: Set<string>;
  nodesInRegionStopToEnd: Set<string>;
} {
  const nodesInRegionStartToStop = new Set<string>();
  const nodesInRegionStopToEnd = new Set<string>();

  {
    // Bidirectional BFS: start from loopStart and loopStop, traverse in both directions
    // Stop when we hit the boundary loop nodes
    const queue: string[] = [
      loopStructure.loopStart.id,
      loopStructure.loopStop.id,
    ];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId || visited.has(currentNodeId)) {
        continue;
      }

      visited.add(currentNodeId);

      // Don't include loopStart or loopStop themselves in the region
      if (
        currentNodeId !== loopStructure.loopStart.id &&
        currentNodeId !== loopStructure.loopStop.id
      ) {
        nodesInRegionStartToStop.add(currentNodeId);
      }

      const currentNode: (typeof state.nodes)[number] | undefined =
        state.nodes.find((n) => n.id === currentNodeId);
      if (!currentNode) continue;

      // Traverse forward (outgoers)
      const outgoers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopStop.id
          ? getOutgoers(currentNode, state.nodes, state.edges)
          : [];
      for (const outgoer of outgoers) {
        // Skip our own loop boundary nodes (already handled)
        if (
          outgoer.id === loopStructure.loopStart.id ||
          outgoer.id === loopStructure.loopStop.id ||
          outgoer.id === loopStructure.loopEnd.id
        ) {
          continue;
        }
        if (!visited.has(outgoer.id)) {
          queue.push(outgoer.id);
        }
      }

      // Traverse backward (incomers) to handle zigzag paths
      const incomers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopStart.id
          ? getIncomers(currentNode, state.nodes, state.edges)
          : [];
      for (const incomer of incomers) {
        // Skip our own loop boundary nodes (already handled)
        if (
          incomer.id === loopStructure.loopStart.id ||
          incomer.id === loopStructure.loopStop.id ||
          incomer.id === loopStructure.loopEnd.id
        ) {
          continue;
        }
        if (!visited.has(incomer.id)) {
          queue.push(incomer.id);
        }
      }
    }
  }
  {
    // Bidirectional BFS: start from loopStop and loopEnd, traverse in both directions
    // Stop when we hit the boundary loop nodes
    const queue: string[] = [
      loopStructure.loopStop.id,
      loopStructure.loopEnd.id,
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId || visited.has(currentNodeId)) {
        continue;
      }

      visited.add(currentNodeId);

      // Don't include loopStop or loopEnd themselves in the region
      if (
        currentNodeId !== loopStructure.loopStop.id &&
        currentNodeId !== loopStructure.loopEnd.id
      ) {
        nodesInRegionStopToEnd.add(currentNodeId);
      }

      const currentNode: (typeof state.nodes)[number] | undefined =
        state.nodes.find((n) => n.id === currentNodeId);
      if (!currentNode) continue;

      // Traverse forward (outgoers)
      const outgoers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopEnd.id
          ? getOutgoers(currentNode, state.nodes, state.edges)
          : [];
      for (const outgoer of outgoers) {
        // Skip our own loop boundary nodes
        if (
          outgoer.id === loopStructure.loopStart.id ||
          outgoer.id === loopStructure.loopStop.id ||
          outgoer.id === loopStructure.loopEnd.id
        ) {
          continue;
        }
        if (!visited.has(outgoer.id)) {
          queue.push(outgoer.id);
        }
      }

      // Traverse backward (incomers) to handle zigzag paths
      const incomers: (typeof state.nodes)[number][] =
        currentNode.id !== loopStructure.loopStop.id
          ? getIncomers(currentNode, state.nodes, state.edges)
          : [];
      for (const incomer of incomers) {
        // Skip our own loop boundary nodes
        if (
          incomer.id === loopStructure.loopStart.id ||
          incomer.id === loopStructure.loopStop.id ||
          incomer.id === loopStructure.loopEnd.id
        ) {
          continue;
        }
        if (!visited.has(incomer.id)) {
          queue.push(incomer.id);
        }
      }
    }
  }

  return {
    nodesInRegionStartToStop,
    nodesInRegionStopToEnd,
  };
}

export { getAllReachableNodes, getNodesInLoopRegion };
