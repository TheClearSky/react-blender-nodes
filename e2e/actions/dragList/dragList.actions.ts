import type { Page } from '@playwright/test';
import {
  getAllDragListItems,
  getDragListItemByName,
  getDragHandle,
} from '../../locators/dragList/dragList.locators';
import { T_REDUCER_TICK } from '../../constants';

/**
 * Navigate to a DragList Storybook story. Uses the iframe.html endpoint
 * so the story renders at the page root (no outer Storybook shell).
 */
async function navigateToDragListStory(
  page: Page,
  storyId: string,
): Promise<void> {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
  await page
    .locator('[data-slot="drag-list"]')
    .waitFor({ state: 'visible', timeout: 15000 });
}

/**
 * Returns the text content of all visible drag list items in DOM order.
 * Items that are hidden (being dragged) are excluded.
 */
async function getDragListOrder(page: Page): Promise<string[]> {
  const items = getAllDragListItems(page);
  const count = await items.count();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent();
    if (text) names.push(text.trim());
  }
  return names;
}

/**
 * Drag an item by name to a target position relative to another item.
 *
 * @param page - Playwright Page
 * @param sourceName - Text of the item to drag
 * @param targetName - Text of the item to drop near
 * @param position - 'above' (top 30%), 'below' (bottom 30%), or 'on' (middle, for non-leaf 'inside')
 */
async function dragItemToTarget(
  page: Page,
  sourceName: string,
  targetName: string,
  position: 'above' | 'below' | 'on',
): Promise<void> {
  const sourceItem = getDragListItemByName(page, sourceName);
  const targetItem = getDragListItemByName(page, targetName);

  const handle = getDragHandle(sourceItem);
  const handleBox = await handle.boundingBox();
  const targetBox = await targetItem.boundingBox();

  if (!handleBox || !targetBox) {
    throw new Error(
      `Cannot find bounding boxes for "${sourceName}" or "${targetName}"`,
    );
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  let endY: number;
  if (position === 'above') {
    endY = targetBox.y + targetBox.height * 0.15;
  } else if (position === 'below') {
    endY = targetBox.y + targetBox.height * 0.85;
  } else {
    endY = targetBox.y + targetBox.height * 0.5;
  }
  const endX = targetBox.x + targetBox.width / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      startX + ((endX - startX) * i) / steps,
      startY + ((endY - startY) * i) / steps,
    );
    await page.waitForTimeout(20);
  }

  await page.waitForTimeout(T_REDUCER_TICK);
  await page.mouse.up();
  await page.waitForTimeout(T_REDUCER_TICK * 3);
}

/**
 * Drag an item by name outside the list area and release, verifying
 * the item snaps back (no state change).
 */
async function dragItemOutsideAndRelease(
  page: Page,
  sourceName: string,
): Promise<void> {
  const sourceItem = getDragListItemByName(page, sourceName);
  const handle = getDragHandle(sourceItem);
  const handleBox = await handle.boundingBox();

  if (!handleBox) throw new Error(`Cannot find "${sourceName}" handle`);

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(T_REDUCER_TICK);
  await page.mouse.up();
  await page.waitForTimeout(T_REDUCER_TICK * 3);
}

export {
  navigateToDragListStory,
  getDragListOrder,
  dragItemToTarget,
  dragItemOutsideAndRelease,
};
