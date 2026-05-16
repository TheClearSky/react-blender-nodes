import type { Page, Locator } from '@playwright/test';

/**
 * Locators for sonner toasts rendered by `EmptyRunnerPlayground` story.
 *
 * Each toast renders with `data-sonner-toast` on the root and:
 *   - `data-type="error|warning|info|success"`
 *   - `data-mounted="true"`, `data-visible="true"` while active
 *   - `[data-title]` — the title text (we set this to the error code)
 *   - `[data-description]` — the description (we set this to error.message)
 *   - `[data-close-button]` — the X to dismiss
 *
 * Tests don't assert toasts as primary verification for actions — DOM
 * counts and ids are the source of truth for "did this happen". Toasts
 * are the surface for *reject reasons* (V3/V4/V5/V8 fire `action:rejected`
 * with `error.code`, the story turns that into a toast).
 */

function getAllToasts(page: Page): Locator {
  return page.locator('[data-sonner-toast]');
}

function getVisibleToasts(page: Page): Locator {
  return page.locator('[data-sonner-toast][data-visible="true"]');
}

function getToastCloseButtons(page: Page): Locator {
  return page.locator('[data-sonner-toast] [data-close-button]');
}

export { getAllToasts, getVisibleToasts, getToastCloseButtons };
