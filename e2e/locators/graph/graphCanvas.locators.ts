import type { Page, Locator } from '@playwright/test';

/**
 * Locators for the ReactFlow graph canvas.
 *
 * We use Storybook's `/iframe.html?id=<story-id>&viewMode=story` URL so the
 * story renders at the page root (no outer Storybook iframe). This avoids the
 * extra frame hop and makes locators straightforward.
 */

function getCanvas(page: Page): Locator {
  return page.locator('.react-flow__pane');
}

function getAllNodes(page: Page): Locator {
  return page.locator('.react-flow__node');
}

function getNodeById(page: Page, nodeId: string): Locator {
  return page.locator(`.react-flow__node[data-id="${nodeId}"]`);
}

function getAllEdges(page: Page): Locator {
  return page.locator('.react-flow__edge');
}

/**
 * All edges whose source/target node IDs match the given pair.
 *
 * ReactFlow renders each edge with
 *   `aria-label="Edge from <sourceNodeId> to <targetNodeId>"`
 * so we match on that. Multiple edges can exist between the same pair (one
 * per handle), so callers who need to verify a specific handle pair must
 * combine this with `connectionExistsBetweenHandles` (which examines the
 * `.react-flow__handle.connected` hit-state on the handles themselves).
 */
function getEdgesBetweenNodes(
  page: Page,
  sourceNodeId: string,
  targetNodeId: string,
): Locator {
  return page.locator(
    `.react-flow__edge[aria-label="Edge from ${sourceNodeId} to ${targetNodeId}"]`,
  );
}

/** Edge by its ReactFlow `data-id`. */
function getEdgeById(page: Page, edgeId: string): Locator {
  return page.locator(`.react-flow__edge[data-id="${edgeId}"]`);
}

/**
 * The invisible interaction layer for an edge — this is the element that
 * accepts clicks. ReactFlow renders a visible SVG path plus a wider
 * `.react-flow__edge-interaction` path for hit-testing.
 */
function getEdgeInteraction(page: Page, index: number): Locator {
  return getAllEdges(page).nth(index).locator('.react-flow__edge-interaction');
}

export {
  getCanvas,
  getAllNodes,
  getNodeById,
  getAllEdges,
  getEdgesBetweenNodes,
  getEdgeById,
  getEdgeInteraction,
};
