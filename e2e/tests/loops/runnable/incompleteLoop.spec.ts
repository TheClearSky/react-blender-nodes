import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import { addLoopTriplet } from '../../../helpers/buildLoop';
import { addBitInput, addBitOutput } from '../../../helpers/addNode';
import { dragBetweenLocators } from '../../../actions/node/connection.actions';
import { getHandleByName } from '../../../locators/node/node.locators';
import {
  clickRun,
  waitForRunnerState,
  getRunnerState,
} from '../../../actions/runnerPanel/runnerPanel.actions';
import { STORY_EMPTY_RUNNER } from '../../../constants';

test.describe('Incomplete loop — runner handles gracefully', () => {
  test('triplet without bind edges coexisting with a standalone BitInput→BitOutput chain runs without hanging', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // Unbound triplet — structurally incomplete.
    await addLoopTriplet(page, {
      start: { x: 60, y: 500 },
      stop: { x: 300, y: 500 },
      end: { x: 540, y: 500 },
    });

    // A legitimate non-loop chain alongside. The runner should execute this
    // regardless of the incomplete triplet.
    const bitInId = await addBitInput(page, { x: 60, y: 120 });
    const bitOutId = await addBitOutput(page, { x: 400, y: 120 });
    await dragBetweenLocators(
      page,
      getHandleByName(page, bitInId, 'Out', 'source'),
      getHandleByName(page, bitOutId, 'In', 'target'),
    );

    await clickRun(page);
    // Terminal state reached — NOT hanging, NOT thrown to UI.
    await Promise.race([
      waitForRunnerState(page, 'Completed', 10000).catch(() => null),
      waitForRunnerState(page, 'Error', 10000).catch(() => null),
    ]);
    const state = await getRunnerState(page);
    expect(['Completed', 'Error']).toContain(state);
  });
});
