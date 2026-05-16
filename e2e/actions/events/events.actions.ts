import { expect, type Page } from '@playwright/test';
import type { GraphEvent } from '@/utils';

/**
 * Bridge to the EmptyRunnerPlayground story's hidden DOM event log.
 *
 * The story records every event from FullGraph's unified `onGraphEvent`
 * stream — both reducer-layer events (`action:applied`/`action:rejected`/
 * `state:committed`) and UI-layer events (`ui:drag:ended`/
 * `ui:delete:attempted`/`ui:state:imported`/`ui:recording:imported`) —
 * to two hidden divs:
 *   - `data-testid="e2e-event-count"` — monotonically-increasing counter
 *   - `data-testid="e2e-last-event"`   — JSON of the latest event
 *
 * Tests use these to wait for the system to actually process an attempt
 * BEFORE asserting outcome — eliminating the need for arbitrary
 * `waitForTimeout` calls that crumble under multi-worker CPU contention.
 *
 * The event union type comes from the package itself (single source of
 * truth) so any new event kind added to the component is automatically
 * available to tests with full type narrowing.
 *
 * Usage:
 *   const next = await captureNextEvent(page);
 *   await page.keyboard.press('Delete');     // or do a drag, etc.
 *   const event = await next();
 *   if (event.kind === 'ui:delete:attempted') {
 *     expect(event.success).toBe(false);
 *     expect(event.reason).toContain('different regions');
 *   }
 */

/**
 * Read the current event-count value from the story's hidden div.
 */
async function readEventCount(page: Page): Promise<number> {
  const text = await page.getByTestId('e2e-event-count').textContent();
  return Number(text ?? '0');
}

/**
 * Read the most recently recorded event (or null if none yet).
 */
async function readLastEvent(page: Page): Promise<GraphEvent | null> {
  const text = await page.getByTestId('e2e-last-event').textContent();
  if (!text) return null;
  return JSON.parse(text) as GraphEvent;
}

/**
 * Read the full ring-buffered event log (last ~100 events). Used by
 * sequence-order tests that assert on the exact event chain emitted
 * by a single action ("ADD_NODE fires action:applied → state:committed
 * → action:applied for the implicit UPDATE_NODE_BY_REACT_FLOW").
 */
async function readEventLog(page: Page): Promise<GraphEvent[]> {
  const text = await page.getByTestId('e2e-event-log').textContent();
  if (!text) return [];
  return JSON.parse(text) as GraphEvent[];
}

/**
 * Capture the current event-log length, then return a finaliser that
 * returns just the events appended after the snapshot.
 */
async function captureEventsAround<T>(
  page: Page,
  fn: () => Promise<T>,
): Promise<{ result: T; events: GraphEvent[] }> {
  const before = (await readEventLog(page)).length;
  const result = await fn();
  // Settle so any post-action commit events (state:committed,
  // UPDATE_NODE_BY_REACT_FLOW) land before we slice.
  await page.waitForTimeout(80);
  const after = await readEventLog(page);
  return { result, events: after.slice(before) };
}

/**
 * Capture the current event count, then return a finaliser that:
 *   1. Awaits the count to advance past `before` (i.e. an event fired).
 *   2. Returns the event payload that just landed.
 *
 * Tests should call this BEFORE the action they want to observe, so the
 * baseline is captured even if the action fires extremely fast.
 */
async function captureNextEvent(
  page: Page,
  options: { timeout?: number } = {},
): Promise<() => Promise<GraphEvent>> {
  const before = await readEventCount(page);
  return async () => {
    await expect(page.getByTestId('e2e-event-count')).not.toHaveText(
      String(before),
      { timeout: options.timeout ?? 5000 },
    );
    const event = await readLastEvent(page);
    if (!event) {
      throw new Error(
        'Event count advanced but last-event div was empty — story wiring bug?',
      );
    }
    return event;
  };
}

/**
 * Wait for the event count to advance, but tolerate it NOT advancing
 * within `timeout`. Use this for actions that may or may not produce an
 * event (e.g. pressing Delete with no selection).
 *
 * Returns the event if one fired, or null if the timeout elapsed.
 */
async function captureOptionalNextEvent(
  page: Page,
  options: { timeout?: number } = {},
): Promise<() => Promise<GraphEvent | null>> {
  const before = await readEventCount(page);
  return async () => {
    try {
      await expect(page.getByTestId('e2e-event-count')).not.toHaveText(
        String(before),
        { timeout: options.timeout ?? 500 },
      );
    } catch {
      return null;
    }
    return readLastEvent(page);
  };
}

export {
  readEventCount,
  readLastEvent,
  readEventLog,
  captureEventsAround,
  captureNextEvent,
  captureOptionalNextEvent,
};
export type { GraphEvent };
