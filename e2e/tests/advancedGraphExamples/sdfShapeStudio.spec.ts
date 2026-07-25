import { test, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { navigateToStory } from '../../actions/graph/graphCanvas.actions';
import { connectHandles } from '../../actions/node/connection.actions';
import { addNode } from '../../helpers/addNode';
import {
  clickRun,
  waitForRunnerState,
} from '../../actions/runnerPanel/runnerPanel.actions';

const STORY_SDF_SHAPE_STUDIO =
  'advanced-graph-examples-sdf-shape-studio--playground';
const STORY_SDF_SHOWCASE = 'advanced-graph-examples-sdf-shape-studio--showcase';

/**
 * SDF Shape Studio: SDF closures flow through the graph as edge values and
 * every node's preview renders its RECORDED value on a Canvas2D (or as
 * numbers, for measurement nodes). Rendering is manual in the Playground —
 * previews stay on their "Run to render" empty state until the runner
 * panel's Run executes the graph (no auto-run on edits). The Showcase story
 * pre-loads a UI-authored fixture and runs ONCE on load, so it opens already
 * rendered.
 *
 * Node adds reuse the shared `addNode` helper (set-difference id capture +
 * submenu settle) — the context-menu path is ['Add Node', '<folder>'].
 */

const MENU_SDF_SHAPES = ['Add Node', 'SDF Shapes'] as const;
const MENU_SDF_MASKS = ['Add Node', 'SDF Masks'] as const;
const MENU_SDF_MEASURE = ['Add Node', 'SDF Measure'] as const;
const MENU_SDF_OUTPUT = ['Add Node', 'SDF Output'] as const;

/** Bring every node on-screen and let the fit ANIMATION settle — handle
 *  positions are read before a connect drag, and a still-moving viewport
 *  drops the wire where the handle WAS. */
async function fitViewAndSettle(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Fit View' }).click({ force: true });
  await page.waitForTimeout(500);
}

/** Pixel VARIANCE of a canvas's red channel (max − min). Solid fills compress
 *  too well for a toDataURL-length heuristic, so this is the paint oracle. */
function canvasRedVariance(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const context = canvasElement.getContext('2d');
    if (!context) return 0;
    const { data } = context.getImageData(
      0,
      0,
      canvasElement.width,
      canvasElement.height,
    );
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      min = Math.min(min, data[i]);
      max = Math.max(max, data[i]);
    }
    return max - min;
  });
}

test.describe('Advanced Graph Examples — SDF Shape Studio', () => {
  test('seeded params are honest, arrows chain off them, and previews stay empty until Run', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_SDF_SHAPE_STUDIO);
    await addNode(page, { x: 500, y: 300 }, MENU_SDF_SHAPES, 'Circle');

    // PARAM_DEFAULTS seeding: the Radius slider displays the seeded 0.4 (a
    // TypeOfNode input has no default mechanism — the story dispatches it).
    await expect(page.getByText('0.4000', { exact: true })).toBeVisible();

    // SliderNumberInput external-value sync: the FIRST increment after a
    // programmatic UPDATE_INPUT_VALUE must chain off the seeded value
    // (0.4 → 0.44), not the mount-time internal default (0 → 0.04).
    await page.locator('button[aria-label="Increment Radius"]').click();
    await expect(page.getByText('0.4400', { exact: true })).toBeVisible();

    // NO auto-run: the preview shows its empty state and no canvas exists.
    await expect(page.getByText('Run to render')).toBeVisible();
    await expect(page.locator('[data-testid="sdf-field-canvas"]')).toHaveCount(
      0,
    );

    // Run through the real runner panel — the recorded value feeds the canvas.
    await clickRun(page);
    await waitForRunnerState(page, 'Completed');
    const canvas = page.locator('[data-testid="sdf-field-canvas"]').first();
    await expect(canvas).toBeVisible();
    await expect
      .poll(() => canvasRedVariance(canvas), { timeout: 5000 })
      .toBeGreaterThan(30);
  });

  test('wiring Circle → Render paints the filled render preview after Run', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_SDF_SHAPE_STUDIO);
    const circleNodeId = await addNode(
      page,
      { x: 250, y: 300 },
      MENU_SDF_SHAPES,
      'Circle',
    );
    const renderNodeId = await addNode(
      page,
      { x: 850, y: 300 },
      MENU_SDF_OUTPUT,
      'Render',
    );
    await fitViewAndSettle(page);

    await connectHandles(page, circleNodeId, 'Out', renderNodeId, 'In');
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');
    const renderCanvas = page
      .locator('[data-testid="sdf-render-canvas"]')
      .first();
    await expect(renderCanvas).toBeVisible();
    await expect
      .poll(() => canvasRedVariance(renderCanvas), { timeout: 5000 })
      .toBeGreaterThan(30);
  });

  test('Circle → Less Than → Measure Mask: binary mask preview + plausible ratio', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_SDF_SHAPE_STUDIO);
    const circleNodeId = await addNode(
      page,
      { x: 200, y: 300 },
      MENU_SDF_SHAPES,
      'Circle',
    );
    const lessThanNodeId = await addNode(
      page,
      { x: 650, y: 300 },
      MENU_SDF_MASKS,
      'Less Than',
    );
    const measureNodeId = await addNode(
      page,
      { x: 1100, y: 300 },
      MENU_SDF_MEASURE,
      'Measure Mask',
    );
    await fitViewAndSettle(page);

    await connectHandles(page, circleNodeId, 'Out', lessThanNodeId, 'In');
    await connectHandles(page, lessThanNodeId, 'Out', measureNodeId, 'In');
    await expect(page.locator('.react-flow__edge')).toHaveCount(2);

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    // The mask preview is STRICTLY black/white: every red-channel sample is
    // 0 or 255, and both colors are present (the thresholded circle).
    const maskCanvas = page.locator('[data-testid="sdf-mask-canvas"]').first();
    await expect(maskCanvas).toBeVisible();
    await expect
      .poll(
        () =>
          maskCanvas.evaluate((element) => {
            const canvasElement = element as HTMLCanvasElement;
            const context = canvasElement.getContext('2d');
            if (!context) return 'no-context';
            const { data } = context.getImageData(
              0,
              0,
              canvasElement.width,
              canvasElement.height,
            );
            let sawBlack = false;
            let sawWhite = false;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] === 0) sawBlack = true;
              else if (data[i] === 255) sawWhite = true;
              else return `non-binary:${data[i]}`;
            }
            return sawBlack && sawWhite ? 'binary-both' : 'binary-one-color';
          }),
        { timeout: 5000 },
      )
      .toBe('binary-both');

    // The measurement preview reports the recorded numbers; a 0.4-radius
    // circle covers ~8.7% of the preview window, so the ratio lands well
    // inside (5%, 95%).
    const measurePreview = page
      .locator('[data-testid="sdf-measure-preview"]')
      .first();
    await expect(measurePreview).toBeVisible();
    const previewText = await measurePreview.innerText();
    const ratioMatch = /White Ratio\s*([\d.]+)%/.exec(previewText);
    expect(ratioMatch).not.toBeNull();
    const whiteRatioPercent = Number.parseFloat(ratioMatch![1]);
    expect(whiteRatioPercent).toBeGreaterThan(5);
    expect(whiteRatioPercent).toBeLessThan(95);
  });

  test('the Showcase fixture pre-loads AND auto-runs once — it opens rendered', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_SDF_SHOWCASE);

    // The UI-authored fixture: 8 nodes / 7 edges, imported through the real
    // pipeline (schemas rehydrated), then run ONCE programmatically.
    await expect(page.locator('.react-flow__node')).toHaveCount(8);
    await expect(page.locator('.react-flow__edge')).toHaveCount(7);

    // Rendered WITHOUT any user interaction (the one-shot auto-run).
    const renderCanvas = page
      .locator('[data-testid="sdf-render-canvas"]')
      .first();
    await expect(renderCanvas).toBeVisible({ timeout: 10000 });
    await expect
      .poll(() => canvasRedVariance(renderCanvas), { timeout: 5000 })
      .toBeGreaterThan(30);
    const measureText = await page
      .locator('[data-testid="sdf-measure-preview"]')
      .first()
      .innerText();
    expect(measureText).toContain('White Ratio');

    // The manual cadence still works on top: Reset → Run re-executes.
    await page.locator('[title="Reset"]').first().click();
    await waitForRunnerState(page, 'Idle');
    await clickRun(page);
    await waitForRunnerState(page, 'Completed');
    await expect
      .poll(() => canvasRedVariance(renderCanvas), { timeout: 5000 })
      .toBeGreaterThan(30);
  });
});
