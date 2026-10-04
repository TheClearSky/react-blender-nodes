import { test, expect, type Page } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import { STORY_WITH_RUNNER } from '../../../constants';

/**
 * Bottom drawers (G10–G12): the consumer `bottomDrawers` prop rendered beside
 * the runner with ONE open drawer at a time. Driven through the WithRunner
 * story's `drawers` control (`story-drawers-notes` registers a "Notes" drawer)
 * and, for the no-runner tier, its `preview-mode` control.
 *
 * Selectors are the library's own contract: `[data-slot="runner-panel"]`,
 * `[data-slot="bottom-drawer"][data-drawer-id="<id>"]`,
 * `[data-testid="bottom-drawer-open-<id>"]` (floating buttons),
 * `[data-testid="bottom-drawer-switch-<id>"]` (header switchers).
 */

const RUNNER_PANEL = '[data-slot="runner-panel"]';
const NOTES_DRAWER = '[data-slot="bottom-drawer"][data-drawer-id="notes"]';
const OPEN_RUNNER = '[data-testid="bottom-drawer-open-runner"]';
const OPEN_NOTES = '[data-testid="bottom-drawer-open-notes"]';
const SWITCH_TO_NOTES = '[data-testid="bottom-drawer-switch-notes"]';
const SWITCH_TO_RUNNER = '[data-testid="bottom-drawer-switch-runner"]';

async function openWithRunnerAndNotesDrawer(page: Page): Promise<void> {
  await navigateToStory(page, STORY_WITH_RUNNER);
  await page.locator('[data-testid="story-drawers-notes"]').click();
  await expect(page.locator(RUNNER_PANEL)).toBeVisible();
}

test.describe('Runner UI — bottom drawers (G10–G12)', () => {
  test('G10: runner open by default with a Notes switcher; switching opens Notes and closes the runner (one at a time)', async ({
    page,
  }) => {
    await openWithRunnerAndNotesDrawer(page);

    // Runner open → no floating buttons; its header carries the Notes switcher.
    await expect(page.locator(OPEN_RUNNER)).toHaveCount(0);
    await expect(page.locator(OPEN_NOTES)).toHaveCount(0);
    await expect(page.locator(SWITCH_TO_NOTES)).toBeVisible();
    // Notes is closed — its DOM exists (keepMounted default) but is hidden.
    await expect(page.locator(NOTES_DRAWER)).toBeHidden();

    // Switch → Notes is open (its body visible), the runner panel is gone.
    await page.locator(SWITCH_TO_NOTES).click();
    await expect(page.locator(NOTES_DRAWER)).toBeVisible();
    await expect(
      page.locator('[data-testid="story-notes-textarea"]'),
    ).toBeVisible();
    await expect(page.locator(RUNNER_PANEL)).toHaveCount(0);
    // Notes' header offers the way back.
    await expect(page.locator(SWITCH_TO_RUNNER)).toBeVisible();
  });

  test('G11: closing the open drawer shows one floating button per drawer; each reopens its own drawer', async ({
    page,
  }) => {
    await openWithRunnerAndNotesDrawer(page);
    await page.locator(SWITCH_TO_NOTES).click();
    await expect(page.locator(NOTES_DRAWER)).toBeVisible();

    // Close Notes with its X → both floating buttons, nothing open.
    await page.locator(`${NOTES_DRAWER} button[title="Close Notes"]`).click();
    await expect(page.locator(NOTES_DRAWER)).toBeHidden();
    await expect(page.locator(OPEN_RUNNER)).toBeVisible();
    await expect(page.locator(OPEN_NOTES)).toBeVisible();
    await expect(page.locator(OPEN_RUNNER)).toHaveAttribute(
      'title',
      'Open runner panel',
    );

    // Floating Notes → Notes open, buttons gone.
    await page.locator(OPEN_NOTES).click();
    await expect(page.locator(NOTES_DRAWER)).toBeVisible();
    await expect(page.locator(OPEN_NOTES)).toHaveCount(0);

    // Header switcher → runner open, Notes hidden (keepMounted keeps its DOM).
    await page.locator(SWITCH_TO_RUNNER).click();
    await expect(page.locator(RUNNER_PANEL)).toBeVisible();
    await expect(page.locator(NOTES_DRAWER)).toBeHidden();

    // Runner X → both floating buttons again; floating Runner reopens it.
    await page.locator(`${RUNNER_PANEL} button[title="Close panel"]`).click();
    await expect(page.locator(RUNNER_PANEL)).toHaveCount(0);
    await expect(page.locator(OPEN_RUNNER)).toBeVisible();
    await expect(page.locator(OPEN_NOTES)).toBeVisible();
    await page.locator(OPEN_RUNNER).click();
    await expect(page.locator(RUNNER_PANEL)).toBeVisible();
  });

  test('G12: a consumer drawer keeps its local state across close/reopen and runner switches (keepMounted default)', async ({
    page,
  }) => {
    await openWithRunnerAndNotesDrawer(page);
    await page.locator(SWITCH_TO_NOTES).click();
    const textarea = page.locator('[data-testid="story-notes-textarea"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('remember me');

    // Notes → Runner → Notes: the text survives (the body stayed mounted).
    await page.locator(SWITCH_TO_RUNNER).click();
    await expect(page.locator(RUNNER_PANEL)).toBeVisible();
    await page.locator(SWITCH_TO_NOTES).click();
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('remember me');

    // Close → reopen from the floating button: still there.
    await page.locator(`${NOTES_DRAWER} button[title="Close Notes"]`).click();
    await expect(page.locator(OPEN_NOTES)).toBeVisible();
    await page.locator(OPEN_NOTES).click();
    await expect(textarea).toHaveValue('remember me');
  });

  test('G13: without a runner (no functionImplementations) consumer drawers and their buttons still work', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_WITH_RUNNER);
    await page.locator('[data-testid="story-drawers-notes"]').click();
    await page.locator('[data-testid="story-preview-mode-no-runner"]').click();
    await expect(
      page.locator('[data-slot="node-preview-panel"]').first(),
    ).toBeVisible();

    // No runner drawer registered: only the Notes button, nothing open.
    await expect(page.locator(RUNNER_PANEL)).toHaveCount(0);
    await expect(page.locator(OPEN_RUNNER)).toHaveCount(0);
    await expect(page.locator(OPEN_NOTES)).toBeVisible();

    // Opens; no switcher (there is no other drawer); closes back to the button.
    await page.locator(OPEN_NOTES).click();
    await expect(page.locator(NOTES_DRAWER)).toBeVisible();
    await expect(page.locator(SWITCH_TO_RUNNER)).toHaveCount(0);
    await page.locator(`${NOTES_DRAWER} button[title="Close Notes"]`).click();
    await expect(page.locator(OPEN_NOTES)).toBeVisible();
  });
});
