/**
 * Topological sort with concurrency levels using Kahn's algorithm.
 *
 * Nodes at the same level have no dependencies on each other and can
 * execute concurrently via Promise.allSettled.
 *
 * @param nodeIds - All node IDs to sort
 * @param adjacencyList - Forward edges: nodeId -> set of dependent nodeIds
 * @param reverseAdjacencyList - Backward edges: nodeId -> set of dependency nodeIds
 * @returns Array of levels, each level is an array of nodeIds that can run concurrently
 */
function topologicalSortWithLevels(
  nodeIds: ReadonlyArray<string>,
  adjacencyList: ReadonlyMap<string, ReadonlySet<string>>,
  reverseAdjacencyList: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyArray<ReadonlyArray<string>> {
  if (nodeIds.length === 0) {
    return [];
  }

  // Calculate in-degree for each node
  const inDegree = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const deps = reverseAdjacencyList.get(nodeId);
    inDegree.set(nodeId, deps ? deps.size : 0);
  }

  // Initialize queue with all nodes having in-degree = 0
  let queue: string[] = [];
  for (const nodeId of nodeIds) {
    if (inDegree.get(nodeId) === 0) {
      queue.push(nodeId);
    }
  }

  const levels: string[][] = [];
  let processedCount = 0;

  while (queue.length > 0) {
    // All nodes in the current queue form one concurrency level
    const currentLevel = queue;
    levels.push(currentLevel);
    processedCount += currentLevel.length;

    const nextQueue: string[] = [];

    for (const nodeId of currentLevel) {
      const neighbors = adjacencyList.get(nodeId);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        // Only process neighbors that are in our node set
        if (!inDegree.has(neighbor)) continue;

        const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          nextQueue.push(neighbor);
        }
      }
    }

    queue = nextQueue;
  }

  // If we didn't process all nodes, there's a cycle
  // (should not happen due to upstream cycle checking, but guard anyway)
  if (processedCount < nodeIds.length) {
    const processedSet = new Set<string>();
    for (const level of levels) {
      for (const id of level) {
        processedSet.add(id);
      }
    }
    const unprocessed = nodeIds.filter((id) => !processedSet.has(id));
    // Place remaining nodes in a final level rather than silently dropping them
    if (unprocessed.length > 0) {
      levels.push(unprocessed);
    }
  }

  return levels;
}

export { topologicalSortWithLevels };
