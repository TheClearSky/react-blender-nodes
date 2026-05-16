import { expect, type Page } from '@playwright/test';
import {
  getAllToasts,
  getVisibleToasts,
  getToastCloseButtons,
} from '../../locators/toast/toast.locators';

/**
 * Compact representation of a sonner toast for test inspection.
 *
 *   - `type`        — `'error'|'warning'|'info'|'success'` (mirrors `data-type`)
 *   - `title`       — text inside `[data-title]`. The story uses this for the
 *                     error code (e.g. `'LOOP_PATH_INVALID'`) on
 *                     `action:rejected`, or `'CONNECTION_REFUSED'` on
 *                     handle-level rejection (`ui:drag:ended` `isValid:false`).
 *   - `description` — text inside `[data-description]`. The story uses this for
 *                     the human-readable rejection message when one is present.
 *
 * Tests should match on `title` (machine-readable codes) for assertions, not
 * `description` (free-text, may change).
 */
type ToastSnapshot = {
  type: 'error' | 'warning' | 'info' | 'success' | string;
  title: string;
  description: string;
};

/**
 * Read all currently-mounted toasts as `ToastSnapshot[]` (most-recent last).
 * Returns `[]` when no toasts are visible — callers should treat that as
 * "no rejection happened" rather than an error.
 */
async function readAllToasts(page: Page): Promise<ToastSnapshot[]> {
  return await getAllToasts(page).evaluateAll((els: HTMLElement[]) =>
    els.map((el) => ({
      type: el.getAttribute('data-type') ?? '',
      title: el.querySelector('[data-title]')?.textContent?.trim() ?? '',
      description:
        el.querySelector('[data-description]')?.textContent?.trim() ?? '',
    })),
  );
}

/**
 * Read just the most-recently-shown toast. Returns `null` when no toasts
 * are visible. Useful for "did the last action emit a reject" checks.
 *
 * Sonner stacks toasts most-recent-first in the DOM (the newest mounts at
 * the top of the stack), so the LAST element in document order is the
 * OLDEST. We reverse to make `[0]` consistently mean "most recent".
 */
async function readLastToast(page: Page): Promise<ToastSnapshot | null> {
  const all = await readAllToasts(page);
  return all.length === 0 ? null : all[0];
}

/**
 * Wait for a toast whose `title` matches `expectedTitle`. Throws if no
 * matching toast appears within the timeout. Auto-retries via Playwright's
 * `expect`, so a small drag-to-toast latency is tolerated.
 *
 * Use exact-match semantics — the story emits machine-readable codes
 * (`'LOOP_PATH_INVALID'` etc.) so tests can assert precisely on rejection
 * reasons without parsing free text.
 */
async function expectToastWithTitle(
  page: Page,
  expectedTitle: string,
  options: { timeout?: number } = {},
): Promise<void> {
  const titleLocator = getAllToasts(page).locator('[data-title]', {
    hasText: expectedTitle,
  });
  await expect(titleLocator).toHaveCount(1, {
    timeout: options.timeout ?? 3000,
  });
}

/**
 * Dismiss every visible toast by clicking its X. Polls until no toasts
 * remain on screen. Tests call this between cases in a sweep so leftover
 * toasts don't bleed into the next assertion.
 *
 * Idempotent — returns immediately if there are no toasts.
 */
async function dismissAllToasts(page: Page): Promise<void> {
  const closeButtons = getToastCloseButtons(page);
  // Snapshot the count once; we click them in order. Sonner unmounts each
  // toast asynchronously after the close click, so we wait for the visible
  // count to settle to zero rather than re-querying mid-loop.
  const count = await closeButtons.count();
  for (let i = 0; i < count; i++) {
    // Always click the FIRST visible close button — as toasts unmount the
    // list shrinks from the top.
    const first = getToastCloseButtons(page).first();
    if ((await first.count()) === 0) break;
    await first.click({ force: true }).catch(() => undefined);
  }
  // Wait for the dismissal animation to finish.
  await expect(getVisibleToasts(page)).toHaveCount(0, { timeout: 2000 });
}

/**
 * Capture toast state before an action, run the action, then return only
 * NEWLY-shown toasts. Avoids assertions tripping on stale toasts left from
 * earlier cases.
 *
 * Returns `[]` when no new toasts appeared (e.g. a successful drag, or a
 * silent-failure case like a saturated source handle which fires no event).
 */
async function captureToastsAround<T>(
  page: Page,
  fn: () => Promise<T>,
): Promise<{ result: T; newToasts: ToastSnapshot[] }> {
  const before = await readAllToasts(page);
  const result = await fn();
  // Brief settle for the toast mount to land. Sonner mounts under a
  // requestAnimationFrame; ~50 ms is more than enough.
  await page.waitForTimeout(50);
  const after = await readAllToasts(page);
  // Diff by (type + title + description) — sonner re-uses the same `id`
  // we set in the story, so identical-text re-mounts replace rather than
  // stack. Newly-appeared toasts are the ones not in `before`.
  const beforeKey = new Set(
    before.map((t) => `${t.type}|${t.title}|${t.description}`),
  );
  const newToasts = after.filter(
    (t) => !beforeKey.has(`${t.type}|${t.title}|${t.description}`),
  );
  return { result, newToasts };
}

export {
  readAllToasts,
  readLastToast,
  expectToastWithTitle,
  dismissAllToasts,
  captureToastsAround,
};
export type { ToastSnapshot };
