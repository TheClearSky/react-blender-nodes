import type { Page } from '@playwright/test';
import { getCanvas } from '../../locators/graph/graphCanvas.locators';

/**
 * Navigate to a Storybook story using the `iframe.html` endpoint so the story
 * renders at the page root (no outer Storybook iframe).
 *
 * @param page - Playwright Page
 * @param storyId - Story ID from Storybook, e.g. "organisms-fullgraph--with-runner"
 */
async function navigateToStory(page: Page, storyId: string): Promise<void> {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
  // Wait for ReactFlow to mount and render
  await page
    .locator('.react-flow')
    .waitFor({ state: 'visible', timeout: 15000 });
}

/**
 * Right-click the ReactFlow canvas (the `.react-flow__pane` background) at
 * a specific position to open the context menu.
 */
async function rightClickCanvas(
  page: Page,
  position: { x: number; y: number },
): Promise<void> {
  const canvas = getCanvas(page);
  // `force: true` — the collapsed runner panel renders an invisible resizer
  // overlay at the bottom of the viewport that Playwright treats as
  // intercepting clicks, even though the contextmenu event fires correctly.
  await canvas.click({ button: 'right', position, force: true });
}

/**
 * Left-click the canvas background to dismiss context menus or clear node
 * selection.
 */
async function clickCanvas(
  page: Page,
  position: { x: number; y: number } = { x: 10, y: 10 },
): Promise<void> {
  const canvas = getCanvas(page);
  await canvas.click({ position });
}

export { navigateToStory, rightClickCanvas, clickCanvas };
