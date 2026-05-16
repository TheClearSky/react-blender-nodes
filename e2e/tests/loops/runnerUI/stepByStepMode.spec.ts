import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  clickReset,
  clickStep,
  setMode,
  waitForRunnerState,
} from '../../../actions/runnerPanel/runnerPanel.actions';
import {
  getRunButton,
  getStepButton,
} from '../../../locators/runnerPanel/runnerPanel.locators';
import { getAllTimelineBlocks } from '../../../locators/timeline/timeline.locators';
import { STORY_WITH_RUNNER } from '../../../constants';

test.describe('Runner UI — step-by-step mode (G5)', () => {
  test('G5: Step-by-Step mode advances one step at a time and leaves the runner in Paused', async ({
    page,
  }) => {
    // WithRunner ships a multi-step graph (adderLoopState) + a pre-loaded
    // recording. Reset clears the recording and puts the runner in Idle with
    // the graph intact — gives us a real multi-step graph to step through.
    await navigateToStory(page, STORY_WITH_RUNNER);
    await clickReset(page);
    await waitForRunnerState(page, 'Idle');

    await setMode(page, 'Step-by-Step');
    await clickStep(page);
    await waitForRunnerState(page, 'Paused');

    // At least one step landed on the timeline.
    expect(await getAllTimelineBlocks(page).count()).toBeGreaterThanOrEqual(1);

    // In Paused state, Run is disabled and Step remains available.
    await expect(getRunButton(page)).toBeDisabled();
    await expect(getStepButton(page)).toBeEnabled();
  });
});
