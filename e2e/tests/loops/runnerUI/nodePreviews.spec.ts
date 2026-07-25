import { test, expect, type Page } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  clickReset,
  clickStep,
  setMode,
} from '../../../actions/runnerPanel/runnerPanel.actions';
import {
  STORY_WITH_RUNNER,
  STORY_RUNNER_FIXTURE_DEMOS,
} from '../../../constants';

/**
 * Per-node-type preview components (`nodePreviews`), driven through the
 * consolidated WithRunner story's control panel: `story-preview-mode-<mode>`
 * buttons switch the registered registry (remounting the editor), and
 * `story-theme-<theme>` swaps the GraphThemeProvider preset live. The story
 * pre-loads a completed adder-loop recording as a controlled `executionRecord`,
 * so panels populate without a Run click.
 */

/** Navigate to WithRunner and select a preview mode via the story chrome. */
async function openPreviewMode(page: Page, mode: string): Promise<void> {
  await navigateToStory(page, STORY_WITH_RUNNER);
  await page.locator(`[data-testid="story-preview-mode-${mode}"]`).click();
  await expect(
    page.locator('[data-slot="node-preview-panel"]').first(),
  ).toBeVisible();
}

test.describe('Runner UI — per-node-type previews (WithRunner panel modes)', () => {
  test('dashboard: renders panels populated from the pre-loaded record', async ({
    page,
  }) => {
    await openPreviewMode(page, 'dashboard');

    // Value plumbing: a computed output shows an exact boolean from the record.
    await expect(
      page.locator('[data-testid="circuit-preview-output"]').first(),
    ).toContainText(/=\s*(true|false)/);

    // The decorated node surfaces its custom name as `Custom : Type`.
    await expect(page.getByText(/Flagship\s*:/).first()).toBeVisible();
  });

  test('dashboard: the header eye toggle collapses and re-expands a node preview', async ({
    page,
  }) => {
    await openPreviewMode(page, 'dashboard');

    const panels = page.locator('[data-slot="node-preview-panel"]');
    const eyes = page.locator('[data-testid="toggle-preview"]');

    const initialCount = await panels.count();
    expect(initialCount).toBeGreaterThan(0);

    // Collapse the first node's preview via its eye toggle → one fewer panel.
    await eyes.first().click();
    await expect(panels).toHaveCount(initialCount - 1);

    // Expand it again → back to the original count (persisted per-node state).
    await eyes.first().click();
    await expect(panels).toHaveCount(initialCount);
  });

  test('dashboard: collapsing a preview is undoable (Ctrl+Z re-expands it)', async ({
    page,
  }) => {
    await openPreviewMode(page, 'dashboard');

    const panels = page.locator('[data-slot="node-preview-panel"]');
    const eyes = page.locator('[data-testid="toggle-preview"]');
    const initialCount = await panels.count();

    // Collapse one preview, then undo — the toggle is undoable (decision D2).
    await eyes.first().click();
    await expect(panels).toHaveCount(initialCount - 1);

    await page.keyboard.press('Control+z');
    await expect(panels).toHaveCount(initialCount);
  });

  test('step-through: scrubbing to step 0 shows historical / not-reached at-step values', async ({
    page,
  }) => {
    await openPreviewMode(page, 'step-through');

    // Scrub the head to the very first step.
    await page.locator('[data-step-index="0"]').first().click({ force: true });

    // A node that has NOT run by step 0 honestly reads "not reached"…
    await expect(page.getByText('at step: not reached').first()).toBeVisible();
    // …while the `live:` (latest) rows still render a concrete latest value.
    await expect(
      page.locator('[data-testid="stepthrough-live"]').first(),
    ).toBeVisible();
  });

  test('error handling: a throwing preview is contained to the panel (fallback + Retry)', async ({
    page,
  }) => {
    // FIXTURE COUPLING: the trap fires only because the adder-loop fixture
    // contains a notGate with recorded values (TrapPreview throws on a snapshot).
    await openPreviewMode(page, 'error-handling');

    // The trap preview throws → the panel's nested ErrorBoundary fallback renders.
    await expect(page.getByText('Preview error').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Retry' }).first(),
    ).toBeVisible();

    // Containment: the other nodes' previews still render.
    await expect(
      page.locator('[data-testid="error-aware-preview"]').first(),
    ).toBeVisible();
  });

  test('no-runner tier: previews render null-safe empty states without a runner', async ({
    page,
  }) => {
    await openPreviewMode(page, 'no-runner');

    // No runner → the preview shows its designed empty state.
    await expect(
      page.getByText('no runner — waiting for values').first(),
    ).toBeVisible();
  });

  test('themed: dashboard previews recolor under the light preset (A-1 pin)', async ({
    page,
  }) => {
    await openPreviewMode(page, 'dashboard');

    // Theme is an orthogonal control — swap the preset live (no remount).
    await page.locator('[data-testid="story-theme-light"]').click();

    const panel = page.locator('[data-slot="node-preview-panel"]').first();
    await expect(panel).toBeVisible();
    await expect(
      page.locator('[data-testid="circuit-preview-output"]').first(),
    ).toBeVisible();

    // The light `node.previewPanel` slot paints the panel bg-zinc-100 (A-1).
    // Tailwind v4 emits oklch; accept either color-space serialization.
    await expect(panel).toHaveCSS(
      'background-color',
      /oklch\(0\.967 0\.001 286\.375\)|rgb\(244, 244, 245\)/,
    );
  });

  test('group instances: previews inside an instance show ITS OWN values (instance-path filtering)', async ({
    page,
  }) => {
    // The fixture recording carries per-step instancePath, so the pre-loaded
    // record demonstrates instance-aware previews with no Run click. G1's NOT
    // computed false, G2's computed true — the SAME template node.
    await navigateToStory(page, STORY_RUNNER_FIXTURE_DEMOS);
    await page
      .locator('[data-testid="story-fixture-group-two-instances"]')
      .click();
    await expect(page.locator('[data-step-index]').first()).toBeVisible();

    // Inside the FIRST instance: its own value (false), not last-instance-wins.
    await page
      .locator('[data-testid="open-node-group"]')
      .first()
      .click({ force: true });
    await expect(
      page.locator('[data-slot="node-preview-panel"]').first(),
    ).toContainText('at step: false');

    // Back to root, then inside the SECOND instance: its own value (true).
    await page.locator('button:has(svg.lucide-arrow-left)').first().click();
    await page
      .locator('[data-testid="open-node-group"]')
      .nth(1)
      .click({ force: true });
    await expect(
      page.locator('[data-slot="node-preview-panel"]').first(),
    ).toContainText('at step: true');
  });

  test('follow-into-groups: scrubbing opens the executing instance; toggle off restores inert scrubbing', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_RUNNER_FIXTURE_DEMOS);
    await page
      .locator('[data-testid="story-fixture-group-two-instances"]')
      .click();
    await expect(page.locator('[data-step-index]').first()).toBeVisible();

    const back = page.locator('button:has(svg.lucide-arrow-left)').first();
    const panel = page.locator('[data-slot="node-preview-panel"]').first();

    // Scrub to G1's inner step → the viewport auto-opens G1 (back enabled)
    // and the subtree preview shows G1's OWN value.
    await page.locator('[data-step-index="1"]').first().click({ force: true });
    await expect(back).toBeEnabled();
    await expect(panel).toContainText('at step: false');

    // Scrub to G2's inner step → follow SWITCHES instance (proven by the
    // preview now showing G2's value on the same template node).
    await page.locator('[data-step-index="3"]').first().click({ force: true });
    await expect(back).toBeEnabled();
    await expect(panel).toContainText('at step: true');

    // Scrub to a root step → follow closes back to the root scope.
    await page.locator('[data-step-index="0"]').first().click({ force: true });
    await expect(back).toBeDisabled();

    // Toggle follow OFF → scrubbing into a group no longer navigates.
    await page.locator('[data-testid="follow-into-groups"]').click();
    await page.locator('[data-step-index="1"]').first().click({ force: true });
    await expect(back).toBeDisabled();
  });

  test('step over / step out: replay jumps skip or exit group interiors (instancePath depth)', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_RUNNER_FIXTURE_DEMOS);
    await page
      .locator('[data-testid="story-fixture-group-two-instances"]')
      .click();
    await expect(page.locator('[data-step-index]').first()).toBeVisible();
    const back = page.locator('button:has(svg.lucide-arrow-left)').first();

    // Park the head on root step #0 (follow keeps the viewport at root).
    await page.locator('[data-step-index="0"]').first().click({ force: true });
    await expect(back).toBeDisabled();

    // STEP OVER from #0 jumps PAST G1's interior to its structural step
    // (root depth) — with follow ON, the viewport therefore NEVER enters G1.
    await page.locator('[data-testid="timeline-step-over"]').click();
    await expect(back).toBeDisabled();

    // Contrast: scrub INTO the group interior (#1) → follow opens G1…
    await page.locator('[data-step-index="1"]').first().click({ force: true });
    await expect(back).toBeEnabled();

    // …then STEP OUT lands on the first shallower step (the structural exit,
    // root depth) → follow closes back to root.
    await page.locator('[data-testid="timeline-step-out"]').click();
    await expect(back).toBeDisabled();
  });

  test('LIVE step-over: executes through a group interior and pauses at root depth', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_RUNNER_FIXTURE_DEMOS);
    await page
      .locator('[data-testid="story-fixture-group-two-instances"]')
      .click();
    await expect(page.locator('[data-step-index]').first()).toBeVisible();

    const back = page.locator('button:has(svg.lucide-arrow-left)').first();
    const stepBlocks = page.locator('[data-step-index]');

    // Fresh live run in step-by-step mode: Reset clears the pre-loaded record,
    // the first Step executes BitInput (#0, root) and pauses.
    await clickReset(page);
    await expect(stepBlocks).toHaveCount(0);
    await setMode(page, 'Step-by-Step');
    await clickStep(page);
    await expect(stepBlocks).toHaveCount(1);
    await expect(back).toBeDisabled();

    // LIVE STEP-OVER: drains through G1's interior (its inner NOT + the
    // structural step) and pauses back at root depth — the viewport (follow ON)
    // never enters the group.
    await page
      .locator(
        '[title="Step over (execute through the group the next step enters)"]',
      )
      .click();
    await expect(stepBlocks).toHaveCount(3);
    await expect(back).toBeDisabled();

    // Contrast: a plain Step descends INTO G2's interior — follow opens it.
    await clickStep(page);
    await expect(stepBlocks).toHaveCount(4);
    await expect(back).toBeEnabled();
  });
});
