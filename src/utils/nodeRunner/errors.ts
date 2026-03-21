import type {
  GraphError,
  GraphErrorPathEntry,
  InputResolutionEntry,
} from './types';

/**
 * Extracts a human-readable error message from an unknown thrown value.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Creates a GraphError with full context from a caught exception
 * during node execution.
 */
function createGraphError(params: {
  error: unknown;
  nodeId: string;
  nodeTypeId: string;
  nodeTypeName: string;
  handleId?: string;
  path: ReadonlyArray<GraphErrorPathEntry>;
  loopContext?: GraphError['loopContext'];
  groupContext?: GraphError['groupContext'];
  timestamp: number;
  duration: number;
}): GraphError {
  return {
    message: extractErrorMessage(params.error),
    nodeId: params.nodeId,
    nodeTypeId: params.nodeTypeId,
    nodeTypeName: params.nodeTypeName,
    handleId: params.handleId,
    path: params.path,
    loopContext: params.loopContext,
    groupContext: params.groupContext,
    timestamp: params.timestamp,
    duration: params.duration,
    originalError: params.error,
  };
}

/**
 * Builds an error path by tracing back from a node through
 * the input resolution map to find upstream nodes that contributed
 * data to the errored node.
 *
 * The path is ordered from earliest upstream node to the errored node.
 */
function buildErrorPath(
  nodeId: string,
  inputResolutionMap: ReadonlyMap<string, ReadonlyArray<InputResolutionEntry>>,
  nodeInfoMap: ReadonlyMap<
    string,
    {
      nodeTypeId: string;
      nodeTypeName: string;
      concurrencyLevel: number;
    }
  >,
): ReadonlyArray<GraphErrorPathEntry> {
  const path: GraphErrorPathEntry[] = [];
  const visited = new Set<string>();

  // BFS backwards through the graph to find the upstream chain
  const queue: Array<{ nodeId: string; handleId?: string }> = [{ nodeId }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.nodeId)) {
      continue;
    }
    visited.add(current.nodeId);

    const info = nodeInfoMap.get(current.nodeId);
    if (info) {
      path.push({
        nodeId: current.nodeId,
        nodeTypeId: info.nodeTypeId,
        nodeTypeName: info.nodeTypeName,
        handleId: current.handleId,
        concurrencyLevel: info.concurrencyLevel,
      });
    }

    // Find all inputs of this node and trace their sources
    for (const [qualifiedId, entries] of inputResolutionMap) {
      // qualifiedId format: "nodeId:handleId"
      const colonIndex = qualifiedId.indexOf(':');
      if (colonIndex === -1) continue;

      const entryNodeId = qualifiedId.substring(0, colonIndex);
      if (entryNodeId !== current.nodeId) continue;

      for (const entry of entries) {
        if (!visited.has(entry.sourceNodeId)) {
          queue.push({
            nodeId: entry.sourceNodeId,
            handleId: entry.sourceHandleId,
          });
        }
      }
    }
  }

  // Reverse so path goes from upstream to the errored node
  path.reverse();
  return path;
}

/**
 * Formats a GraphError into a multi-line human-readable string
 * for display in error tooltips and logs.
 */
function formatGraphError(error: GraphError): string {
  const lines: string[] = [];

  lines.push(`Error in "${error.nodeTypeName}" (${error.nodeId})`);
  lines.push(`Message: ${error.message}`);

  if (error.path.length > 0) {
    const pathStr = error.path.map((entry) => entry.nodeTypeName).join(' → ');
    lines.push(`Path: ${pathStr}`);
  }

  if (error.loopContext) {
    lines.push(
      `Loop: iteration ${error.loopContext.iteration} of ${error.loopContext.maxIterations}`,
    );
  }

  if (error.groupContext) {
    lines.push(
      `Group: ${error.groupContext.groupNodeTypeId} (depth ${error.groupContext.depth})`,
    );
  }

  lines.push(`Duration: ${error.duration.toFixed(2)}ms`);

  return lines.join('\n');
}

export {
  extractErrorMessage,
  createGraphError,
  buildErrorPath,
  formatGraphError,
};
