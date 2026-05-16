import { expect, type Page } from '@playwright/test';
import { getAllNodes } from '../../locators/graph/graphCanvas.locators';
import { deselect, pressDelete } from '../graph/selection.actions';

/**
 * One row in a deletion-rejection sweep:
 *   - `name`   identifies the case in failure messages
 *   - `select` performs whatever selection the case attempts
 *
 * The runner deselects, runs `select`, presses Delete, then asserts the
 * total node count is unchanged. Use this for V9/V10 reject sweeps where
 * a single shared structure is exercised against many select-and-delete
 * variants in one test.
 */
type RejectCase = {
  name: string;
  select: () => Promise<void>;
};

/**
 * Run a sequence of "should reject" delete attempts against the current
 * canvas. After each attempt the canvas is asserted to still hold
 * `expectedTotal` nodes; the case `name` is threaded into `expect()` so
 * a failure points at the exact sub-case that broke the rule.
 */
async function runRejectCases(
  page: Page,
  cases: RejectCase[],
  expectedTotal: number,
): Promise<void> {
  for (const c of cases) {
    await deselect(page);
    await c.select();
    await pressDelete(page);
    expect(await getAllNodes(page).count(), c.name).toBe(expectedTotal);
  }
}

export { runRejectCases };
export type { RejectCase };
