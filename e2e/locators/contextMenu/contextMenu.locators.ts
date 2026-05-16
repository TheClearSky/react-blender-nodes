import type { Page, Locator } from '@playwright/test';

/**
 * Locators for the ContextMenu (right-click menu + nested submenus).
 *
 * Menu items render as `<li>` elements, and submenus render in FloatingUI
 * portals at the document root (siblings of the main app). So we don't scope
 * the locator — we match any `<li>` with the exact label text.
 *
 * Why exact text match: a `<li>` for "Add Node" has textContent that includes
 * all nested submenu text when the submenu is open. We match the inner
 * `<span>` with exact text to target only the item itself.
 */

function getMenuItemByLabel(page: Page, label: string): Locator {
  return page
    .locator('li')
    .filter({
      has: page.locator(`span:text-is("${label}")`),
    })
    .first();
}

/** Any visible menu list — useful for "menu is closed" assertions. */
function getAnyMenu(page: Page): Locator {
  return page.locator('ul:has(> li)').first();
}

export { getMenuItemByLabel, getAnyMenu };
