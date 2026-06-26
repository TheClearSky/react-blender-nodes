import { test, expect, type Page } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import { STORY_WITH_RUNNER } from '../../../constants';

// The runner panel reflows to its OWN container width via Tailwind container
// queries (named container `@container/runnerpanel`, breakpoint `@max-[832px]`).
// In the full-bleed WithRunner story the panel is `absolute inset-x-0`, so the
// viewport width drives the container width and `setViewportSize` exercises it.

const PANEL = '[data-slot="runner-panel"]';
const RUN_MENU = '[aria-label="More run options"]';
const TIMELINE_MENU = '[aria-label="More timeline options"]';

/** Horizontal overflow (scrollWidth − clientWidth) of the panel root. */
async function panelOverflowPx(page: Page): Promise<number> {
  return page.locator(PANEL).evaluate((el) => el.scrollWidth - el.clientWidth);
}

test.describe('Runner UI — responsive (container-query) layout', () => {
  test('G8: panel reflows with no horizontal overflow from 375 → 1200px', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_WITH_RUNNER);
    // The story pre-loads a recording, so the panel mounts with a populated
    // timeline (a step block confirms it).
    await expect(page.locator(PANEL)).toBeVisible();
    await expect(page.locator('[data-step-index="0"]')).toBeVisible();

    const runMenu = page.locator(RUN_MENU);
    const timelineMenu = page.locator(TIMELINE_MENU);
    const inlineMode = page.getByText('Instant', { exact: true }).first();

    // Nothing clips at any width.
    for (const width of [375, 600, 820, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await panelOverflowPx(page),
        `horizontal overflow at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }

    // Narrow (<832): both toolbars collapse into ⋯ menus; inline secondary
    // controls (the mode toggle) hide. 700px is below the 832px breakpoint — and
    // was WIDE under the original 576px breakpoint, so this locks in the raises
    // that fixed the cramped band.
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(runMenu).toBeVisible();
    await expect(timelineMenu).toBeVisible();
    await expect(inlineMode).toBeHidden();

    // Wide (>832): inline controls return; the ⋯ menus disappear.
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(runMenu).toBeHidden();
    await expect(timelineMenu).toBeHidden();
    await expect(inlineMode).toBeVisible();
  });

  test('G9: the step inspector is a side column when wide, a slide-over overlay when narrow', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_WITH_RUNNER);
    await expect(page.locator('[data-step-index="0"]')).toBeVisible();

    // Wide first so the inspector mounts as the in-flow fixed-width column.
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.locator('[data-step-index="0"]').click();

    // The inspector wrapper is the parent of the ExecutionStepInspector root.
    const inspectorWrapper = page
      .locator(`${PANEL} .animate-slide-in-right`)
      .locator('xpath=..');
    await expect(inspectorWrapper).toBeVisible();
    expect(
      await inspectorWrapper.evaluate((el) => getComputedStyle(el).position),
    ).toBe('static');

    // Narrow: the same inspector becomes a full-body absolute overlay.
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await inspectorWrapper.evaluate((el) => getComputedStyle(el).position),
    ).toBe('absolute');
  });
});
