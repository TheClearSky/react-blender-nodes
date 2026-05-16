import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  clickRun,
  waitForRunnerState,
} from '../../../actions/runnerPanel/runnerPanel.actions';
import {
  getRunButton,
  getResetButton,
} from '../../../locators/runnerPanel/runnerPanel.locators';
import { STORY_EMPTY_RUNNER } from '../../../constants';

test.describe('Runner UI — completed state', () => {
  test('G3: running an empty graph transitions to Completed with Reset enabled', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    await expect(getRunButton(page)).toBeDisabled();
    await expect(getResetButton(page)).toBeEnabled();
  });
});
