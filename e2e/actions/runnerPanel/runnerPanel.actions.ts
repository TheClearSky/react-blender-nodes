import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  getRunButton,
  getPauseButton,
  getStepButton,
  getStopButton,
  getResetButton,
  getModeToggleInstant,
  getModeToggleStepByStep,
  getMaxLoopsIncrementButton,
  getMaxLoopsDecrementButton,
  getMaxLoopsDisplay,
  getRunnerStateLabel,
} from '../../locators/runnerPanel/runnerPanel.locators';
import {
  T_RUNNER_COMPLETION,
  type RunnerStateLabel,
  type RunMode,
} from '../../constants';

async function clickRun(page: Page): Promise<void> {
  await getRunButton(page).click();
}

async function clickPause(page: Page): Promise<void> {
  await getPauseButton(page).click();
}

async function clickStep(page: Page): Promise<void> {
  await getStepButton(page).click();
}

async function clickStop(page: Page): Promise<void> {
  await getStopButton(page).click();
}

async function clickReset(page: Page): Promise<void> {
  await getResetButton(page).click();
}

async function setMode(page: Page, mode: RunMode): Promise<void> {
  const button =
    mode === 'Instant'
      ? getModeToggleInstant(page)
      : getModeToggleStepByStep(page);
  await button.click();
}

/**
 * Set max loop iterations by reading the current value and clicking increment
 * or decrement the required number of times. The max-loops button's
 * aria-label is `"Max Loops N"` so we parse it.
 */
async function setMaxIterations(page: Page, target: number): Promise<void> {
  const display = getMaxLoopsDisplay(page);
  const text = (await display.textContent()) ?? '';
  const match = /(\d+)/.exec(text);
  if (!match) throw new Error(`Cannot parse Max Loops text: "${text}"`);
  const current = Number(match[1]);
  const delta = target - current;
  const button =
    delta > 0
      ? getMaxLoopsIncrementButton(page)
      : getMaxLoopsDecrementButton(page);
  for (let i = 0; i < Math.abs(delta); i++) {
    await button.click();
  }
}

async function getRunnerState(page: Page): Promise<string> {
  const text = await getRunnerStateLabel(page).textContent();
  return (text ?? '').trim();
}

/**
 * Wait for the runner state label to match the expected value. Polls via
 * Playwright's auto-retrying `expect`, so flaky intermediate states (e.g.
 * Compiling → Running) don't cause false failures.
 */
async function waitForRunnerState(
  page: Page,
  expected: RunnerStateLabel,
  timeout = T_RUNNER_COMPLETION,
): Promise<void> {
  await expect(getRunnerStateLabel(page)).toHaveText(expected, { timeout });
}

export {
  clickRun,
  clickPause,
  clickStep,
  clickStop,
  clickReset,
  setMode,
  setMaxIterations,
  getRunnerState,
  waitForRunnerState,
};
