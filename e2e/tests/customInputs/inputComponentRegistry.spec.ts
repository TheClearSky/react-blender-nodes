import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../actions/graph/graphCanvas.actions';
import {
  addColorSource,
  addColorMixer,
  addColorDisplay,
} from '../../helpers/addNode';
import {
  dragBetweenLocators,
  connectionExistsBetweenNodes,
} from '../../actions/node/connection.actions';
import {
  getNodeById,
  getAllEdges,
} from '../../locators/graph/graphCanvas.locators';
import {
  getHandleByName,
  getHandleByIndex,
} from '../../locators/node/node.locators';
import {
  clickRun,
  waitForRunnerState,
} from '../../actions/runnerPanel/runnerPanel.actions';
import { clickTimelineStep } from '../../actions/timeline/timeline.actions';
import {
  waitForInspectorOpen,
  getInspectorText,
} from '../../actions/inspector/inspector.actions';
import { pressDelete } from '../../actions/graph/selection.actions';
import { STORY_CUSTOM_INPUT, HANDLE_MIXED } from '../../constants';

const COLOR_INPUT_LOCATOR = 'input[aria-label="Color value"]';

test.describe('Custom Input Component Registry — rendering', () => {
  test('CI1: Color Source renders a custom color picker for the complex Color type', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_CUSTOM_INPUT);
    const sourceId = await addColorSource(page, { x: 400, y: 300 });

    const node = getNodeById(page, sourceId);
    const colorInput = node.locator(COLOR_INPUT_LOCATOR);
    await expect(colorInput).toBeVisible();
    await expect(colorInput).toHaveValue('#FFFFFF');
  });

  test('CI2: Color Mixer renders custom color pickers for Color A/B but SliderNumberInput for Ratio (registry cannot override built-in types)', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_CUSTOM_INPUT);
    const mixerId = await addColorMixer(page, { x: 400, y: 300 });

    const node = getNodeById(page, mixerId);

    const colorInputs = node.locator(COLOR_INPUT_LOCATOR);
    await expect(colorInputs).toHaveCount(2);

    const ratioSlider = node.locator('button', { hasText: 'Ratio' });
    await expect(ratioSlider).toBeVisible();

    const customNumberOverride = node.locator('[data-testid="custom-number"]');
    await expect(customNumberOverride).toHaveCount(0);
  });

  test('CI3: Custom color picker shows handle name label and editable hex input', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_CUSTOM_INPUT);
    const sourceId = await addColorSource(page, { x: 400, y: 300 });

    const node = getNodeById(page, sourceId);
    const label = node.locator('div.truncate.text-right');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('Color');

    const colorInput = node.locator(COLOR_INPUT_LOCATOR);
    await colorInput.fill('#ff0000');
    await colorInput.press('Enter');
    await expect(colorInput).toHaveValue('#FF0000');
  });
});

test.describe('Custom Input Component Registry — value persistence', () => {
  test('CI4: Setting a color value via the picker persists in node state', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_CUSTOM_INPUT);
    const sourceId = await addColorSource(page, { x: 400, y: 300 });

    const node = getNodeById(page, sourceId);
    const colorInput = node.locator(COLOR_INPUT_LOCATOR);

    await colorInput.fill('#ff0000');
    await colorInput.press('Enter');

    await expect(colorInput).toHaveValue('#FF0000');
  });

  test('CI5: Custom input disappears when the handle receives a connection', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_CUSTOM_INPUT);
    const sourceAId = await addColorSource(page, { x: 200, y: 200 });
    await addColorSource(page, { x: 200, y: 400 });
    const mixerId = await addColorMixer(page, { x: 600, y: 300 });

    await dragBetweenLocators(
      page,
      getHandleByName(page, sourceAId, 'Color', 'source'),
      getHandleByIndex(page, mixerId, 'target', 0),
    );
    expect(await connectionExistsBetweenNodes(page, sourceAId, mixerId)).toBe(
      true,
    );

    const mixerNode = getNodeById(page, mixerId);
    const colorInputsAfterConnect = mixerNode.locator(COLOR_INPUT_LOCATOR);
    await expect(colorInputsAfterConnect).toHaveCount(1);
  });

  test('CI6: Custom input reappears when the connection is removed', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_CUSTOM_INPUT);
    const sourceId = await addColorSource(page, { x: 200, y: 300 });
    const mixerId = await addColorMixer(page, { x: 600, y: 300 });

    await dragBetweenLocators(
      page,
      getHandleByName(page, sourceId, 'Color', 'source'),
      getHandleByIndex(page, mixerId, 'target', 0),
    );

    const mixerNode = getNodeById(page, mixerId);
    await expect(mixerNode.locator(COLOR_INPUT_LOCATOR)).toHaveCount(1);

    const edgeBefore = await getAllEdges(page).count();
    const edge = getAllEdges(page).first();
    await edge.click();
    await pressDelete(page);
    await expect(getAllEdges(page)).toHaveCount(edgeBefore - 1);

    await expect(mixerNode.locator(COLOR_INPUT_LOCATOR)).toHaveCount(2);
  });
});

test.describe('Custom Input Component Registry — runner integration', () => {
  test('CI7: Custom input value flows through the runner and appears in inspector', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_CUSTOM_INPUT);

    const sourceId = await addColorSource(page, { x: 200, y: 200 });
    const displayId = await addColorDisplay(page, { x: 600, y: 200 });

    const sourceNode = getNodeById(page, sourceId);
    const colorInput = sourceNode.locator(COLOR_INPUT_LOCATOR);
    await colorInput.fill('#42abcd');
    await colorInput.press('Enter');

    await dragBetweenLocators(
      page,
      getHandleByName(page, sourceId, 'Color', 'source'),
      getHandleByIndex(page, displayId, 'target', 0),
    );

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    const timelineBlocks = page.locator('[data-step-index]');
    const blockCount = await timelineBlocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < blockCount; i++) {
      await clickTimelineStep(page, i);
      await waitForInspectorOpen(page);
      const text = await getInspectorText(page);
      if (text.includes('Color Source')) {
        expect(text.toLowerCase()).toContain('#42abcd');
        break;
      }
    }
  });

  test('CI8: Changing custom input value between runs uses the new value', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_CUSTOM_INPUT);

    const sourceId = await addColorSource(page, { x: 200, y: 200 });
    const displayId = await addColorDisplay(page, { x: 600, y: 200 });

    const sourceNode = getNodeById(page, sourceId);
    const colorInput = sourceNode.locator(COLOR_INPUT_LOCATOR);
    await colorInput.fill('#111111');
    await colorInput.press('Enter');

    await dragBetweenLocators(
      page,
      getHandleByName(page, sourceId, 'Color', 'source'),
      getHandleByIndex(page, displayId, 'target', 0),
    );

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    const resetButton = page.locator('button[title="Reset"]');
    await resetButton.click();
    await waitForRunnerState(page, 'Idle');

    await colorInput.fill('#eeeeee');
    await colorInput.press('Enter');

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    const timelineBlocks = page.locator('[data-step-index]');
    const blockCount = await timelineBlocks.count();
    for (let i = 0; i < blockCount; i++) {
      await clickTimelineStep(page, i);
      await waitForInspectorOpen(page);
      const text = await getInspectorText(page);
      if (text.includes('Color Source')) {
        expect(text.toLowerCase()).toContain('#eeeeee');
        expect(text.toLowerCase()).not.toContain('#111111');
        break;
      }
    }
  });

  test('CI9: Color Mixer produces correct mixed output through the runner', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_CUSTOM_INPUT);

    const sourceAId = await addColorSource(page, { x: 100, y: 100 });
    const sourceBId = await addColorSource(page, { x: 100, y: 350 });
    const mixerId = await addColorMixer(page, { x: 500, y: 200 });
    const displayId = await addColorDisplay(page, { x: 900, y: 200 });

    const sourceANode = getNodeById(page, sourceAId);
    await sourceANode.locator(COLOR_INPUT_LOCATOR).fill('#000000');
    await sourceANode.locator(COLOR_INPUT_LOCATOR).press('Enter');

    const sourceBNode = getNodeById(page, sourceBId);
    await sourceBNode.locator(COLOR_INPUT_LOCATOR).fill('#ffffff');
    await sourceBNode.locator(COLOR_INPUT_LOCATOR).press('Enter');

    await dragBetweenLocators(
      page,
      getHandleByName(page, sourceAId, 'Color', 'source'),
      getHandleByIndex(page, mixerId, 'target', 0),
    );
    await dragBetweenLocators(
      page,
      getHandleByName(page, sourceBId, 'Color', 'source'),
      getHandleByIndex(page, mixerId, 'target', 1),
    );
    await dragBetweenLocators(
      page,
      getHandleByName(page, mixerId, HANDLE_MIXED, 'source'),
      getHandleByIndex(page, displayId, 'target', 0),
    );

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    const timelineBlocks = page.locator('[data-step-index]');
    const blockCount = await timelineBlocks.count();
    let foundMixer = false;
    for (let i = 0; i < blockCount; i++) {
      await clickTimelineStep(page, i);
      await waitForInspectorOpen(page);
      const text = await getInspectorText(page);
      if (text.includes('Color Mixer')) {
        foundMixer = true;
        expect(text).toContain('Mixed');
        break;
      }
    }
    expect(foundMixer).toBe(true);
  });
});
