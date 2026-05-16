import type { Page, Locator } from '@playwright/test';

/**
 * Locators for the ExecutionTimeline below the runner toolbar.
 *
 * Reliable hooks:
 *   - `[data-step-index="N"]` on each flat step block
 *   - `.timeline-block` class on all step blocks
 *   - `bg-[#8c52d1]/60` (purple) on loop iteration blocks
 *   - `.tabular-nums` span next to a Timer icon for total duration
 *   - text like "N steps" for step count
 */

/** Every flat step block on the timeline (data-step-index=0..N-1). */
function getAllTimelineBlocks(page: Page): Locator {
  return page.locator('[data-step-index]');
}

/** The timeline block for a specific step index. */
function getTimelineBlock(page: Page, stepIndex: number): Locator {
  return page.locator(`[data-step-index="${stepIndex}"]`);
}

/**
 * All loop iteration blocks. The iteration block wrapper renders with the
 * theme purple `bg-[#8c52d1]/60`. Tests typically scope this by the overall
 * iteration count, not by which loop it belongs to.
 */
function getAllLoopIterationBlocks(page: Page): Locator {
  return page.locator('div.bg-\\[\\#8c52d1\\]\\/60');
}

/** Total duration number+unit text in the timeline toolbar (e.g. "2.80ms"). */
function getTotalDurationText(page: Page): Locator {
  return page.locator('span.tabular-nums').first();
}

/** Step count span (e.g. "12 steps"). */
function getStepCountText(page: Page): Locator {
  return page
    .locator('span')
    .filter({ hasText: /^\d+ steps$/ })
    .first();
}

export {
  getAllTimelineBlocks,
  getTimelineBlock,
  getAllLoopIterationBlocks,
  getTotalDurationText,
  getStepCountText,
};
