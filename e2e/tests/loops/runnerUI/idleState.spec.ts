import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  getRunButton,
  getPauseButton,
  getStopButton,
  getResetButton,
  getRunnerStateLabel,
} from '../../../locators/runnerPanel/runnerPanel.locators';
import { STORY_EMPTY_RUNNER } from '../../../constants';

test.describe('Runner UI — idle state', () => {
  test('G1: empty graph shows Idle, Run enabled, Pause/Stop/Reset disabled', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    await expect(getRunnerStateLabel(page)).toHaveText('Idle');
    await expect(getRunButton(page)).toBeEnabled();
    await expect(getPauseButton(page)).toBeDisabled();
    await expect(getStopButton(page)).toBeDisabled();
    await expect(getResetButton(page)).toBeDisabled();
  });
});
