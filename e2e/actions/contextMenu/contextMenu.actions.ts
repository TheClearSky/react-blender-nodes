import type { Page } from '@playwright/test';
import { getMenuItemByLabel } from '../../locators/contextMenu/contextMenu.locators';

async function clickMenuItem(page: Page, label: string): Promise<void> {
  const item = getMenuItemByLabel(page, label);
  await item.waitFor({ state: 'visible' });
  await item.click();
}

async function hoverMenuItem(page: Page, label: string): Promise<void> {
  const item = getMenuItemByLabel(page, label);
  await item.waitFor({ state: 'visible' });
  // ANIMATION SETTLE — not a reducer wait. The submenu uses FloatingUI
  // with a multi-phase crossfade (`useSubmenuManager.ts`,
  // `SUBMENU_DURATION_MS = 100`, `CONTENT_FADE_DURATION_MS = 100`). When
  // a previous hover triggered a submenu switch, the items inside re-mount
  // mid-animation; hovering during that window may dispatch onto a DOM
  // node that's about to be unmounted, and Playwright marks the element
  // "not stable". 50 ms covers half the animation and is deterministic
  // wall-clock — this kind of wait IS appropriate for a known-duration
  // CSS animation, unlike state-propagation waits which crumble under
  // multi-worker contention.
  await page.waitForTimeout(50);
  await item.hover();
}

/**
 * Navigate the context menu by hovering through folder items and clicking the
 * final leaf item.
 *
 * Menu structure for adding a node in this app:
 *   Right-click → "Add Node" → "<Category>" → "<Node Name>"
 *
 * Example:
 *   addNodeViaContextMenu(page, ['Add Node', 'Standard Nodes'], 'Loop Start')
 *
 * No fixed sleep between hovers — each `hoverMenuItem` already calls
 * `waitFor({ state: 'visible' })` on the NEXT level's item, which naturally
 * blocks until the submenu has appeared.
 */
async function addNodeViaContextMenu(
  page: Page,
  folderPath: string[],
  nodeName: string,
): Promise<void> {
  for (const folder of folderPath) {
    await hoverMenuItem(page, folder);
  }
  await clickMenuItem(page, nodeName);
}

export { clickMenuItem, hoverMenuItem, addNodeViaContextMenu };
