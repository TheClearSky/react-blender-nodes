import { expect, type Page } from '@playwright/test';
import { getAllNodes } from '../../locators/graph/graphCanvas.locators';
import { getNodeByName, getNodeById } from '../../locators/node/node.locators';
import { T_NODE_VISIBLE } from '../../constants';

/**
 * Wait until a node with the given user-facing name is visible.
 */
async function waitForNodeVisible(
  page: Page,
  name: string,
  timeout = T_NODE_VISIBLE,
): Promise<void> {
  await getNodeByName(page, name)
    .first()
    .waitFor({ state: 'visible', timeout });
}

/**
 * Click a node to select it (deselects other nodes).
 */
async function selectNode(page: Page, nodeId: string): Promise<void> {
  await getNodeById(page, nodeId).click();
}

/**
 * Control/Meta-click a node to add it to the current selection. ReactFlow's
 * default `multiSelectionKeyCode` is `Control` on Windows/Linux and `Meta`
 * on macOS — Playwright's `ControlOrMeta` modifier maps to whichever the
 * running platform expects.
 */
async function addNodeToSelection(page: Page, nodeId: string): Promise<void> {
  await getNodeById(page, nodeId).click({ modifiers: ['ControlOrMeta'] });
}

/**
 * Multi-select nodes. Holds the multi-selection key down for the duration so
 * ReactFlow treats clicks 2..N as "add to selection" rather than as discrete
 * selections.
 */
async function selectMultipleNodes(
  page: Page,
  nodeIds: readonly string[],
): Promise<void> {
  if (nodeIds.length === 0) return;
  await selectNode(page, nodeIds[0]);
  for (let i = 1; i < nodeIds.length; i++) {
    await addNodeToSelection(page, nodeIds[i]);
  }
}

/**
 * Return the data-id of the Nth node currently on the canvas. Useful when a
 * test adds a node and needs its generated id without knowing it in advance.
 */
async function getNodeIdAt(page: Page, index: number): Promise<string> {
  const id = await getAllNodes(page).nth(index).getAttribute('data-id');
  if (!id) throw new Error(`Node at index ${index} has no data-id`);
  return id;
}

/** Data-id of the most recently added (last-in-DOM) node. */
async function getLastAddedNodeId(page: Page): Promise<string> {
  const total = await getAllNodes(page).count();
  if (total === 0) throw new Error('No nodes on canvas');
  return getNodeIdAt(page, total - 1);
}

/**
 * Assert a node with the given id is (or isn't) on the canvas.
 *
 * `exists=true` (default) → expect exactly one node with that id;
 * `exists=false` → expect zero. Auto-retries via the locator's
 * `toHaveCount`, so it tolerates a one-frame render lag.
 */
async function expectNodeExists(
  page: Page,
  nodeId: string,
  exists = true,
): Promise<void> {
  await expect(getNodeById(page, nodeId)).toHaveCount(exists ? 1 : 0);
}

export {
  waitForNodeVisible,
  selectNode,
  addNodeToSelection,
  selectMultipleNodes,
  getNodeIdAt,
  getLastAddedNodeId,
  expectNodeExists,
};
