import type { Node, Edge } from '@xyflow/react';
import type { ConnectionNeighborhood } from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';
import type { GetNeighborhood } from './HandleSummaryModal';

/** Union of several neighbourhoods (dedup nodes/edges by id), merging every
 *  highlighted edge id. Used to show many connections in one consolidated map. */
function mergeNeighborhoods(
  parts: ConnectionNeighborhood[],
): ConnectionNeighborhood {
  const nodeById = new Map<string, Node>();
  const edgeById = new Map<string, Edge>();
  const highlight = new Set<string>();
  for (const part of parts) {
    for (const node of part.nodes) nodeById.set(node.id, node);
    for (const edge of part.edges) edgeById.set(edge.id, edge);
    for (const id of part.highlightEdgeIds ??
      (part.highlightEdgeId ? [part.highlightEdgeId] : []))
      highlight.add(id);
  }
  return {
    nodes: [...nodeById.values()],
    edges: [...edgeById.values()],
    highlightEdgeId: null,
    highlightEdgeIds: [...highlight],
  };
}

/**
 * The two views for a consolidated channel-deletion map: the focused union of
 * the given connections' 1-hop neighbourhoods, and the complete scope graph —
 * both highlighting every given edge. Drives the Neighbourhood / Complete map
 * toggle for loop/switch channel deletion.
 */
function buildConsolidatedViews(
  getNeighborhood: GetNeighborhood,
  scopeId: string,
  edgeIds: string[],
): { neighbourhood: ConnectionNeighborhood; complete: ConnectionNeighborhood } {
  if (edgeIds.length === 0) {
    const empty: ConnectionNeighborhood = {
      nodes: [],
      edges: [],
      highlightEdgeId: null,
      highlightEdgeIds: [],
    };
    return { neighbourhood: empty, complete: empty };
  }
  const neighbourhood = mergeNeighborhoods(
    edgeIds.map((id) => getNeighborhood(scopeId, id, 'neighbourhood')),
  );
  const complete: ConnectionNeighborhood = {
    ...getNeighborhood(scopeId, edgeIds[0], 'tree'),
    highlightEdgeId: null,
    highlightEdgeIds: edgeIds,
  };
  return { neighbourhood, complete };
}

export { buildConsolidatedViews };
