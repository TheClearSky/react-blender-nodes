import type { Page } from '@playwright/test';
import { rightClickCanvas } from '../actions/graph/graphCanvas.actions';
import { addNodeViaContextMenu } from '../actions/contextMenu/contextMenu.actions';
import { collectAllNodeIds } from '../actions/graph/selection.actions';
import { getAllNodes } from '../locators/graph/graphCanvas.locators';
import { expect } from '@playwright/test';
import {
  MENU_PATH_STANDARD,
  MENU_PATH_LOGIC,
  MENU_PATH_UTILITY,
  MENU_PATH_IO,
  MENU_PATH_ADD_NODE,
  NODE_LOOP_START,
  NODE_LOOP_STOP,
  NODE_LOOP_END,
  NODE_COUNTER,
  NODE_BIT_INPUT,
  NODE_BIT_OUTPUT,
  NODE_CONFIGURABLE_GATE,
  NODE_COLOR_SOURCE,
  NODE_COLOR_MIXER,
  NODE_COLOR_DISPLAY,
} from '../constants';

/**
 * Open the context menu at `(x,y)` and click through the given folder path to
 * add a node with the given name. Returns the `data-id` of the newly-added
 * node.
 *
 * **Identity capture: set-difference, not last-in-DOM.** We snapshot
 * existing `data-id`s before clicking the menu, then after the new node
 * mounts we diff the two sets and return the single new id. This is
 * robust against ReactFlow re-ordering siblings (selection, z-index
 * churn during in-flight drags), where the new node may not be last in
 * DOM order.
 *
 * Empirically verified in `e2e/tests/loops/probe/domContract.spec.ts`:
 * the menu click results in exactly one new node before the next test
 * step runs.
 */
async function addNode(
  page: Page,
  position: { x: number; y: number },
  folderPath: readonly string[],
  nodeName: string,
): Promise<string> {
  const beforeIds = new Set(await collectAllNodeIds(page));
  await rightClickCanvas(page, position);
  await addNodeViaContextMenu(page, [...folderPath], nodeName);
  // Wait for the new node to mount — node count must equal beforeIds.size + 1
  // before the diff is meaningful. `toHaveCount` auto-retries.
  await expect(getAllNodes(page)).toHaveCount(beforeIds.size + 1);
  const afterIds = await collectAllNodeIds(page);
  const newIds = afterIds.filter((id) => !beforeIds.has(id));
  if (newIds.length !== 1) {
    throw new Error(
      `addNode: expected exactly 1 new node, got ${newIds.length} ` +
        `(before=${beforeIds.size}, after=${afterIds.length})`,
    );
  }
  return newIds[0];
}

// Convenience wrappers for common node types — keeps tests readable.

async function addLoopStart(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_STANDARD, NODE_LOOP_START);
}

async function addLoopStop(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_STANDARD, NODE_LOOP_STOP);
}

async function addLoopEnd(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_STANDARD, NODE_LOOP_END);
}

async function addCounter(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_UTILITY, NODE_COUNTER);
}

async function addBitInput(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_IO, NODE_BIT_INPUT);
}

async function addBitOutput(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_IO, NODE_BIT_OUTPUT);
}

async function addLogicGate(
  page: Page,
  position: { x: number; y: number },
  gateName: string,
): Promise<string> {
  return addNode(page, position, MENU_PATH_LOGIC, gateName);
}

async function addConfigurableGate(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_LOGIC, NODE_CONFIGURABLE_GATE);
}

async function addColorSource(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_ADD_NODE, NODE_COLOR_SOURCE);
}

async function addColorMixer(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_ADD_NODE, NODE_COLOR_MIXER);
}

async function addColorDisplay(
  page: Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_ADD_NODE, NODE_COLOR_DISPLAY);
}

export {
  addNode,
  addLoopStart,
  addLoopStop,
  addLoopEnd,
  addCounter,
  addBitInput,
  addBitOutput,
  addLogicGate,
  addConfigurableGate,
  addColorSource,
  addColorMixer,
  addColorDisplay,
};
