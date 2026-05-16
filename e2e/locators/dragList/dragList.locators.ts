import type { Page, Locator } from '@playwright/test';

/**
 * The drag list container element.
 */
function getDragListContainer(page: Page): Locator {
  return page.locator('[data-slot="drag-list"]');
}

/**
 * All visible drag list item rows (excludes hidden dragged items).
 */
function getAllDragListItems(page: Page): Locator {
  return page.locator('[data-slot="drag-list-item"]');
}

/**
 * A drag list item by its display text content.
 */
function getDragListItemByName(page: Page, name: string): Locator {
  return page.locator('[data-slot="drag-list-item"]').filter({ hasText: name });
}

/**
 * The drag handle (GripVertical icon container) within a specific item.
 * The handle is the last child div with touch-none class.
 */
function getDragHandle(item: Locator): Locator {
  return item.locator('.touch-none');
}

/**
 * The inline ghost element rendered at the drop target position.
 */
function getGhostElement(page: Page): Locator {
  return page.locator('[data-slot="drag-list-ghost"]');
}

/**
 * The floating drag preview that follows the cursor.
 */
function getFloatingPreview(page: Page): Locator {
  return page.locator('[data-slot="drag-list-floating-preview"]');
}

/**
 * The delete button (Trash2 icon) within a specific item.
 */
function getDeleteButton(item: Locator): Locator {
  return item.locator('button').last();
}

/**
 * The collapse toggle button (ChevronDown) within a non-leaf item.
 */
function getCollapseToggle(item: Locator): Locator {
  return item.locator('button').first();
}

export {
  getDragListContainer,
  getAllDragListItems,
  getDragListItemByName,
  getDragHandle,
  getGhostElement,
  getFloatingPreview,
  getDeleteButton,
  getCollapseToggle,
};
