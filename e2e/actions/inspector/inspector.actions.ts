import type { Page } from '@playwright/test';
import {
  getInspectorPanel,
  getInspectorStatusBadge,
  getInspectorLoopContext,
} from '../../locators/inspector/inspector.locators';

async function waitForInspectorOpen(page: Page): Promise<void> {
  await getInspectorPanel(page).first().waitFor({ state: 'visible' });
}

async function getInspectorText(page: Page): Promise<string> {
  return (await getInspectorPanel(page).first().textContent()) ?? '';
}

async function getInspectorStatusText(page: Page): Promise<string> {
  return (await getInspectorStatusBadge(page).textContent()) ?? '';
}

type LoopIterationInfo = {
  iteration: number;
  totalIterations: number;
  conditionValue: boolean | null;
};

/**
 * Read the loop iteration context block from the inspector. Returns null if
 * the selected step isn't inside a loop.
 */
async function getInspectorLoopIterationInfo(
  page: Page,
): Promise<LoopIterationInfo | null> {
  const section = getInspectorLoopContext(page);
  const count = await section.count();
  if (count === 0) return null;
  const text = (await section.first().textContent()) ?? '';
  const match = /Loop iteration (\d+) of (\d+)/.exec(text);
  if (!match) return null;
  const fullText = (await getInspectorText(page)) ?? '';
  const conditionValue = /Condition:\s*true/.test(fullText)
    ? true
    : /Condition:\s*false/.test(fullText)
      ? false
      : null;
  return {
    iteration: Number(match[1]),
    totalIterations: Number(match[2]),
    conditionValue,
  };
}

export {
  waitForInspectorOpen,
  getInspectorText,
  getInspectorStatusText,
  getInspectorLoopIterationInfo,
};
export type { LoopIterationInfo };
