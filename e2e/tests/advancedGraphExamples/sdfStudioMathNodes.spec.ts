import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../actions/graph/graphCanvas.actions';
import { addNode } from '../../helpers/addNode';
import {
  clickRun,
  waitForRunnerState,
} from '../../actions/runnerPanel/runnerPanel.actions';

// The SDF Shape Studio includes two enum-driven Math nodes in the "Math Nodes" folder:
// Math (arithmetic) + Compare (comparisons). The `Op` input is a `string` data type
// with `allowedStrings`, so it renders a Select dropdown seeded to the node's default
// operation. These smokes prove the nodes add, render their dropdowns, and execute.
const STORY_SDF_SHAPE_STUDIO =
  'advanced-graph-examples-sdf-shape-studio--playground';
const MENU_MATH = ['Add Node', 'Math Nodes'] as const;

test.describe('SDF Shape Studio — Math nodes', () => {
  test('a Math node adds with its operation dropdown seeded to Add, and runs', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_SDF_SHAPE_STUDIO);
    await addNode(page, { x: 500, y: 300 }, MENU_MATH, 'Math');

    // The `Op` input renders the enum Select seeded to the default 'Add'.
    await expect(
      page.locator('button[role="combobox"]').filter({ hasText: 'Add' }),
    ).toBeVisible();

    // Runs through the real runner panel (defaults A=0, B=0, Add → 0).
    await clickRun(page);
    await waitForRunnerState(page, 'Completed');
  });

  test('a Compare node adds with its dropdown seeded to Greater Than, and runs', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_SDF_SHAPE_STUDIO);
    await addNode(page, { x: 500, y: 300 }, MENU_MATH, 'Compare');

    await expect(
      page
        .locator('button[role="combobox"]')
        .filter({ hasText: 'Greater Than' }),
    ).toBeVisible();

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');
  });
});
