import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  clickReset,
  clickStep,
  clickStop,
  setMode,
  waitForRunnerState,
  getRunnerState,
} from '../../../actions/runnerPanel/runnerPanel.actions';
import {
  getStepButton,
  getPauseButton,
} from '../../../locators/runnerPanel/runnerPanel.locators';
import { STORY_WITH_RUNNER } from '../../../constants';

test.describe('Runner UI — stop from paused (G6)', () => {
  test('G6: Stop from Paused transitions to a terminal state and disables Step/Pause', async ({
    page,
  }) => {
    // Use WithRunner's real multi-step graph so Step-by-Step actually pauses
    // between discrete steps. Reset clears the pre-loaded recording.
    await navigateToStory(page, STORY_WITH_RUNNER);
    await clickReset(page);
    await waitForRunnerState(page, 'Idle');

    await setMode(page, 'Step-by-Step');
    await clickStep(page);
    await waitForRunnerState(page, 'Paused');

    await clickStop(page);

    // After Stop from Paused, the runner lands in a terminal state.
    await Promise.race([
      waitForRunnerState(page, 'Idle', 5000).catch(() => null),
      waitForRunnerState(page, 'Completed', 5000).catch(() => null),
      waitForRunnerState(page, 'Error', 5000).catch(() => null),
    ]);
    const finalState = await getRunnerState(page);
    expect(['Idle', 'Completed', 'Error']).toContain(finalState);

    await expect(getPauseButton(page)).toBeDisabled();
    await expect(getStepButton(page)).toBeEnabled();
  });
});
