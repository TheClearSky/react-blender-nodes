import type { Page } from '@playwright/test';
import {
  getAllTimelineBlocks,
  getTimelineBlock,
  getAllLoopIterationBlocks,
  getStepCountText,
} from '../../locators/timeline/timeline.locators';

async function clickTimelineStep(page: Page, stepIndex: number): Promise<void> {
  await getTimelineBlock(page, stepIndex).click();
}

async function clickLoopIteration(
  page: Page,
  iterationIndex: number,
): Promise<void> {
  await getAllLoopIterationBlocks(page).nth(iterationIndex).click();
}

async function getTimelineStepCount(page: Page): Promise<number> {
  return getAllTimelineBlocks(page).count();
}

async function getLoopIterationCount(page: Page): Promise<number> {
  return getAllLoopIterationBlocks(page).count();
}

/** Parse the "N steps" text for a numeric count. */
async function getStepCountFromText(page: Page): Promise<number> {
  const text = (await getStepCountText(page).textContent()) ?? '';
  const match = /(\d+) steps/.exec(text);
  if (!match) throw new Error(`Cannot parse step count: "${text}"`);
  return Number(match[1]);
}

export {
  clickTimelineStep,
  clickLoopIteration,
  getTimelineStepCount,
  getLoopIterationCount,
  getStepCountFromText,
};
