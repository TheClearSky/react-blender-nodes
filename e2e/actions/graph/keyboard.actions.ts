import type { Page } from '@playwright/test';
import { T_REDUCER_TICK } from '../../constants';

/**
 * Press a keyboard key on the page. Used for graph interactions like
 * selecting and deleting (Delete, Backspace, x are all valid delete keys
 * per FullGraph's `deleteKeyCode={['Backspace', 'Delete', 'x']}`).
 */
async function pressKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
}

/**
 * Delete the currently selected nodes/edges via the Delete key. Awaits
 * the story's `delete:attempt` event signal so the call returns AFTER
 * the reducer has processed the keypress (success or rejection). If
 * nothing is selected, no event fires and the optional-event helper
 * returns without error.
 */
async function deleteSelected(page: Page): Promise<void> {
  await pressKey(page, 'Delete');
  await page.waitForTimeout(T_REDUCER_TICK);
}

export { pressKey, deleteSelected };
