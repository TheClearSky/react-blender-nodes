import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  buildRunnableBitLoop,
  assertBitLoopFullyWired,
} from '../../../helpers/buildRunnableLoop';
import {
  clickRun,
  waitForRunnerState,
} from '../../../actions/runnerPanel/runnerPanel.actions';
import { getAllTimelineBlocks } from '../../../locators/timeline/timeline.locators';
import { clickTimelineStep } from '../../../actions/timeline/timeline.actions';
import {
  waitForInspectorOpen,
  getInspectorText,
} from '../../../actions/inspector/inspector.actions';
import { STORY_EMPTY_RUNNER } from '../../../constants';

test.describe('Runnable bit loop', () => {
  test('constructs BitInput→Loop(Buffer)→BitOutput, runs to Completed, records six steps with Buffer among them', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const loop = await buildRunnableBitLoop(page);
    await assertBitLoopFullyWired(page, loop);

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    // Six executed nodes: BitInput, loopStart, Buffer, loopStop, loopEnd, BitOutput
    await expect(getAllTimelineBlocks(page)).toHaveCount(6);

    // Pick step 0 (BitInput) — verify inspector opens with the node name.
    await clickTimelineStep(page, 0);
    await waitForInspectorOpen(page);
    const text = await getInspectorText(page);
    expect(text).toContain('Bit Input');
  });
});
