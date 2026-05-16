import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  getAllNodes,
  getAllEdges,
} from '../../../locators/graph/graphCanvas.locators';
import { buildMinimalLoop } from '../../../helpers/buildLoop';
import { STORY_EMPTY_RUNNER } from '../../../constants';

test.describe('Loop construction — minimal loop', () => {
  test('A1: build a valid triplet with two bindLoopNodes edges', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    expect(await getAllNodes(page).count()).toBe(0);
    expect(await getAllEdges(page).count()).toBe(0);

    await buildMinimalLoop(page);

    expect(await getAllNodes(page).count()).toBe(3);
    expect(await getAllEdges(page).count()).toBe(2);
  });
});
