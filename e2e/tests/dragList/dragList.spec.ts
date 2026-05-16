import { test, expect } from '@playwright/test';
import {
  navigateToDragListStory,
  getDragListOrder,
  dragItemToTarget,
  dragItemOutsideAndRelease,
} from '../../actions/dragList/dragList.actions';
import {
  getAllDragListItems,
  getDragListItemByName,
  getDeleteButton,
  getCollapseToggle,
  getGhostElement,
  getFloatingPreview,
  getDragHandle,
} from '../../locators/dragList/dragList.locators';
import {
  STORY_DRAGLIST_PLAYGROUND,
  STORY_DRAGLIST_WITH_SUBTREES,
  STORY_DRAGLIST_WITH_DELETE,
  T_REDUCER_TICK,
} from '../../constants';

// ─────────────────────────────────────────────────────
// Flat list reorder
// ─────────────────────────────────────────────────────

test.describe('DragList — flat list reorder', () => {
  test('DL1: drag item down within a flat list', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_PLAYGROUND);

    const before = await getDragListOrder(page);
    expect(before).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
      'Epsilon',
      'Zeta',
    ]);

    await dragItemToTarget(page, 'Alpha', 'Delta', 'below');

    const after = await getDragListOrder(page);
    expect(after).toContain('Alpha');
    expect(after.length).toBe(6);
    const alphaIndex = after.indexOf('Alpha');
    const deltaIndex = after.indexOf('Delta');
    expect(alphaIndex).toBeGreaterThan(deltaIndex);
  });

  test('DL2: drag item up within a flat list', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_PLAYGROUND);

    await dragItemToTarget(page, 'Epsilon', 'Beta', 'above');

    const after = await getDragListOrder(page);
    expect(after.length).toBe(6);
    const epsilonIndex = after.indexOf('Epsilon');
    const betaIndex = after.indexOf('Beta');
    expect(epsilonIndex).toBeLessThanOrEqual(betaIndex);
  });

  test('DL3: drag item to the very beginning', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_PLAYGROUND);

    await dragItemToTarget(page, 'Zeta', 'Alpha', 'above');

    const after = await getDragListOrder(page);
    expect(after[0]).toBe('Zeta');
    expect(after.length).toBe(6);
  });

  test('DL4: drag item to the very end', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_PLAYGROUND);

    await dragItemToTarget(page, 'Alpha', 'Zeta', 'below');

    const after = await getDragListOrder(page);
    expect(after[after.length - 1]).toBe('Alpha');
    expect(after.length).toBe(6);
  });

  test('DL5: no item loss when dropping outside the list', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_PLAYGROUND);

    await dragItemOutsideAndRelease(page, 'Gamma');

    const after = await getDragListOrder(page);
    expect(after.length).toBe(6);
    expect(after).toContain('Gamma');
  });
});

// ─────────────────────────────────────────────────────
// Nested tree operations
// ─────────────────────────────────────────────────────

test.describe('DragList — nested tree operations', () => {
  test('DL6: drag child out of group to root level', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_WITH_SUBTREES);

    await dragItemToTarget(page, 'Rotation', 'Opacity', 'below');

    const after = await getDragListOrder(page);
    expect(after.length).toBe(10);
    const rotationIndex = after.indexOf('Rotation');
    const opacityIndex = after.indexOf('Opacity');
    expect(rotationIndex).toBeGreaterThan(opacityIndex);
    const transformIndex = after.indexOf('Transform');
    expect(rotationIndex).toBeGreaterThan(transformIndex);
  });

  test('DL7: drag root item into a group (inside)', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_WITH_SUBTREES);

    await dragItemToTarget(page, 'Opacity', 'Transform', 'on');

    const after = await getDragListOrder(page);
    expect(after.length).toBe(10);
    const opacityIndex = after.indexOf('Opacity');
    const transformIndex = after.indexOf('Transform');
    const scaleXIndex = after.indexOf('Scale X');
    expect(opacityIndex).toBeGreaterThan(transformIndex);
    expect(opacityIndex).toBeLessThan(scaleXIndex);
  });

  test('DL8: drag item between groups', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_WITH_SUBTREES);

    await dragItemToTarget(page, 'Hue', 'Scale X', 'above');

    const after = await getDragListOrder(page);
    expect(after.length).toBe(10);
    const hueIndex = after.indexOf('Hue');
    const scaleXIndex = after.indexOf('Scale X');
    expect(hueIndex).toBeLessThan(scaleXIndex);
    const transformIndex = after.indexOf('Transform');
    expect(hueIndex).toBeGreaterThan(transformIndex);
  });

  test('DL9: drag last child out keeps empty group', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_WITH_SUBTREES);

    await dragItemToTarget(page, 'Scale X', 'Output', 'below');
    await dragItemToTarget(page, 'Scale Y', 'Output', 'below');
    await dragItemToTarget(page, 'Rotation', 'Output', 'below');

    const after = await getDragListOrder(page);
    expect(after).toContain('Transform');
    expect(after).toContain('Scale X');
    expect(after).toContain('Scale Y');
    expect(after).toContain('Rotation');
  });

  test('DL10: reorder within a group', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_WITH_SUBTREES);

    await dragItemToTarget(page, 'Scale X', 'Rotation', 'below');

    const after = await getDragListOrder(page);
    expect(after.length).toBe(10);
    const scaleXIndex = after.indexOf('Scale X');
    const rotationIndex = after.indexOf('Rotation');
    expect(scaleXIndex).toBeGreaterThan(rotationIndex);
  });
});

// ─────────────────────────────────────────────────────
// Collapse / expand
// ─────────────────────────────────────────────────────

test.describe('DragList — collapse and expand', () => {
  test('DL11: collapsing a group hides its children', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_WITH_SUBTREES);

    const transformItem = getDragListItemByName(page, 'Transform');
    const toggle = getCollapseToggle(transformItem);
    await toggle.click();

    await expect(getDragListItemByName(page, 'Scale X')).toHaveCount(0);
    await expect(getDragListItemByName(page, 'Scale Y')).toHaveCount(0);
    await expect(getDragListItemByName(page, 'Rotation')).toHaveCount(0);
  });

  test('DL12: expanding a collapsed group shows its children', async ({
    page,
  }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_WITH_SUBTREES);

    const transformItem = getDragListItemByName(page, 'Transform');
    const toggle = getCollapseToggle(transformItem);
    await toggle.click();
    await toggle.click();

    await expect(getDragListItemByName(page, 'Scale X')).toBeVisible();
    await expect(getDragListItemByName(page, 'Rotation')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────

test.describe('DragList — delete', () => {
  test('DL13: delete a leaf item', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_WITH_DELETE);

    page.on('dialog', (dialog) => dialog.accept());

    const item = getDragListItemByName(page, 'Deletable Item A');
    const deleteBtn = getDeleteButton(item);
    await deleteBtn.click();

    await expect(getDragListItemByName(page, 'Deletable Item A')).toHaveCount(
      0,
    );
    await expect(getAllDragListItems(page)).toHaveCount(5);
  });

  test('DL14: cancel delete keeps item', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_WITH_DELETE);

    page.on('dialog', (dialog) => dialog.dismiss());

    const item = getDragListItemByName(page, 'Deletable Item B');
    const deleteBtn = getDeleteButton(item);
    await deleteBtn.click();

    await expect(getDragListItemByName(page, 'Deletable Item B')).toBeVisible();
    await expect(getAllDragListItems(page)).toHaveCount(6);
  });
});

// ─────────────────────────────────────────────────────
// Visual feedback during drag
// ─────────────────────────────────────────────────────

test.describe('DragList — visual feedback', () => {
  test('DL15: dragging shows floating preview and ghost', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_PLAYGROUND);

    const item = getDragListItemByName(page, 'Gamma');
    const handle = getDragHandle(item);
    const box = await handle.boundingBox();
    if (!box) throw new Error('No box');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.waitForTimeout(T_REDUCER_TICK * 2);

    await expect(getFloatingPreview(page)).toBeVisible();
    await expect(getGhostElement(page)).toBeVisible();

    await page.mouse.up();
  });

  test('DL16: dragged item is hidden from the list', async ({ page }) => {
    await navigateToDragListStory(page, STORY_DRAGLIST_PLAYGROUND);

    const beforeCount = await getAllDragListItems(page).count();

    const item = getDragListItemByName(page, 'Gamma');
    const handle = getDragHandle(item);
    const box = await handle.boundingBox();
    if (!box) throw new Error('No box');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.waitForTimeout(T_REDUCER_TICK * 2);

    const duringCount = await getAllDragListItems(page).count();
    expect(duringCount).toBe(beforeCount - 1);

    await page.mouse.up();
  });
});
