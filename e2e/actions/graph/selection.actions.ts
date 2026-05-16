import type { Page } from '@playwright/test';
import {
  getAllNodes,
  getCanvas,
  getNodeById,
} from '../../locators/graph/graphCanvas.locators';
import { T_REDUCER_TICK } from '../../constants';

/**
 * Click a node with no modifiers — exclusive selection.
 */
async function selectOnly(page: Page, nodeId: string): Promise<void> {
  await getNodeById(page, nodeId).click();
}

/**
 * Add/remove a node to/from the current selection using the platform
 * multi-select modifier (Ctrl on Win/Linux, Meta on macOS).
 */
async function ctrlClickNode(page: Page, nodeId: string): Promise<void> {
  await getNodeById(page, nodeId).click({ modifiers: ['ControlOrMeta'] });
}

/**
 * Ctrl-select a list of nodes: clicks the first with no modifiers then
 * Ctrl-clicks each subsequent one. Result is a multi-selection of all nodes
 * in `nodeIds`.
 */
async function ctrlSelectNodes(
  page: Page,
  nodeIds: readonly string[],
): Promise<void> {
  if (nodeIds.length === 0) return;
  await selectOnly(page, nodeIds[0]);
  for (let i = 1; i < nodeIds.length; i++) {
    await ctrlClickNode(page, nodeIds[i]);
  }
}

/**
 * Box-select all nodes whose bounding boxes fall inside a rectangle.
 *
 * ReactFlow's default `selectionKeyCode` is `Shift`. With Shift held down,
 * dragging on the pane creates a rubber-band selection. We compute a bounding
 * rectangle from the given node ids (plus a small pad) and drag across it.
 */
async function boxSelectNodes(
  page: Page,
  nodeIds: readonly string[],
): Promise<void> {
  if (nodeIds.length === 0) return;
  const boxes = await Promise.all(
    nodeIds.map((id) => getNodeById(page, id).boundingBox()),
  );
  const rects = boxes.filter((b): b is NonNullable<typeof b> => b !== null);
  if (rects.length === 0) {
    throw new Error('No bounding boxes resolved for box selection');
  }
  const pad = 20;
  const left = Math.min(...rects.map((b) => b.x)) - pad;
  const top = Math.min(...rects.map((b) => b.y)) - pad;
  const right = Math.max(...rects.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...rects.map((b) => b.y + b.height)) + pad;
  await boxSelectArea(page, { x: left, y: top }, { x: right, y: bottom });
}

/**
 * Drag a rubber-band selection from one viewport coordinate to another.
 *
 * The start point MUST fall on the ReactFlow pane background, not on a node.
 * Callers choose coordinates that lie outside any visible node.
 */
async function boxSelectArea(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.keyboard.down('Shift');
  try {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // Intermediate step so ReactFlow starts the selection mode.
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    await page.mouse.move(midX, midY, { steps: 5 });
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
  } finally {
    await page.keyboard.up('Shift');
  }
  await page.waitForTimeout(100);
}

/** Press Delete and wait a reducer tick. */
async function pressDelete(page: Page): Promise<void> {
  await page.keyboard.press('Delete');
  await page.waitForTimeout(T_REDUCER_TICK);
}

/**
 * Click the canvas background at (5, 5) to drop any selection. The
 * coordinate is relative to the canvas locator and is intentionally far
 * from any node placed by the existing builders.
 */
async function deselect(page: Page): Promise<void> {
  await getCanvas(page).click({ position: { x: 5, y: 5 } });
}

/**
 * Remove all nodes + edges from the canvas.
 *
 * Walks every visible node id, Ctrl-selects them all, presses Delete. If any
 * nodes remain afterwards (e.g. a bound triplet blocked a partial delete),
 * falls back to repeating until the canvas is empty — protecting the caller
 * from stale state leaking between describe.serial scenarios.
 */
async function clearAllNodes(page: Page): Promise<void> {
  // Bound triplets require the entire triplet in the same delete set, so
  // selecting everything at once handles them naturally.
  let remaining = await getAllNodes(page).count();
  let guard = 0;
  while (remaining > 0 && guard < 5) {
    // Click the pane to clear any partial selection.
    await getCanvas(page).click({ position: { x: 5, y: 5 }, force: true });
    const allIds = await collectAllNodeIds(page);
    await ctrlSelectNodes(page, allIds);
    await pressDelete(page);
    remaining = await getAllNodes(page).count();
    guard += 1;
  }
  if (remaining > 0) {
    throw new Error(
      `clearAllNodes: ${remaining} nodes remain after ${guard} attempts`,
    );
  }
}

/** Return every currently-visible node's data-id, in DOM order. */
async function collectAllNodeIds(page: Page): Promise<string[]> {
  const handles = await getAllNodes(page).all();
  const ids: string[] = [];
  for (const h of handles) {
    const id = await h.getAttribute('data-id');
    if (id) ids.push(id);
  }
  return ids;
}

export {
  selectOnly,
  ctrlClickNode,
  ctrlSelectNodes,
  boxSelectNodes,
  boxSelectArea,
  pressDelete,
  deselect,
  clearAllNodes,
  collectAllNodeIds,
};
