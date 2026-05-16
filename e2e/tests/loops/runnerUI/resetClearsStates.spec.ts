import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  clickRun,
  clickReset,
  waitForRunnerState,
} from '../../../actions/runnerPanel/runnerPanel.actions';
import {
  getRunButton,
  getResetButton,
} from '../../../locators/runnerPanel/runnerPanel.locators';
import { STORY_EMPTY_RUNNER } from '../../../constants';

test.describe('Runner UI — reset', () => {
  test('G7: after completion, Reset returns to Idle with Run enabled', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    await clickReset(page);
    await waitForRunnerState(page, 'Idle');

    await expect(getRunButton(page)).toBeEnabled();
    await expect(getResetButton(page)).toBeDisabled();
  });
});
