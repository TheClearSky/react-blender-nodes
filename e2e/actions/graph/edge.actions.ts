import type { Page } from '@playwright/test';
import {
  getAllEdges,
  getEdgeInteraction,
  getEdgesBetweenNodes,
} from '../../locators/graph/graphCanvas.locators';

/**
 * Click the Nth edge to select it. Uses the `.react-flow__edge-interaction`
 * hit-box which is wider than the visible path. Falls back to clicking the
 * edge element itself with `force: true` for edges that don't render the
 * interaction path.
 */
async function selectEdge(page: Page, index: number): Promise<void> {
  const interaction = getEdgeInteraction(page, index);
  const count = await interaction.count();
  if (count > 0) {
    await interaction.click();
    return;
  }
  await getAllEdges(page).nth(index).click({ force: true });
}

/**
 * Click the first edge whose source node is `sourceNodeId` and target node
 * is `targetNodeId`. Multiple edges can exist between a node pair (different
 * handle pairs); this helper selects the first.
 */
async function selectEdgeBetween(
  page: Page,
  sourceNodeId: string,
  targetNodeId: string,
): Promise<void> {
  const edge = getEdgesBetweenNodes(page, sourceNodeId, targetNodeId).first();
  await edge.click({ force: true });
}

/** Ctrl-click an edge to add/remove it from the current selection. */
async function ctrlClickEdgeBetween(
  page: Page,
  sourceNodeId: string,
  targetNodeId: string,
): Promise<void> {
  const edge = getEdgesBetweenNodes(page, sourceNodeId, targetNodeId).first();
  await edge.click({ force: true, modifiers: ['ControlOrMeta'] });
}

export { selectEdge, selectEdgeBetween, ctrlClickEdgeBetween };
