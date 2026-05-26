import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../actions/graph/graphCanvas.actions';
import {
  getHandleByName,
  getHandleByIndex,
} from '../../locators/node/node.locators';
import { addBitInput } from '../../helpers/addNode';
import { attemptConnectionByHandles } from '../../actions/node/connection.actions';
import { expectConnectionLanded } from '../../actions/connection/connection.actions';
import { collectAllNodeIds } from '../../actions/graph/selection.actions';
import {
  clickRun,
  waitForRunnerState,
} from '../../actions/runnerPanel/runnerPanel.actions';
import { rightClickCanvas } from '../../actions/graph/graphCanvas.actions';
import {
  getAllNodes,
  getAllEdges,
} from '../../locators/graph/graphCanvas.locators';
import { STORY_EMPTY_RUNNER, HANDLE_GATE_OUT } from '../../constants';

async function addSwitchViaContextMenu(
  page: import('@playwright/test').Page,
  position: { x: number; y: number },
): Promise<{ switchStartId: string; switchEndId: string }> {
  const beforeIds = new Set(await collectAllNodeIds(page));
  await rightClickCanvas(page, position);
  await page.getByText('Add Switch').click();
  await expect(getAllNodes(page)).toHaveCount(beforeIds.size + 2);
  const afterIds = await collectAllNodeIds(page);
  const newIds = afterIds.filter((id) => !beforeIds.has(id));
  let switchStartId = '';
  let switchEndId = '';
  for (const id of newIds) {
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    const text = await node.locator('p').first().textContent();
    if (text === 'Switch Start') switchStartId = id;
    if (text === 'Switch End') switchEndId = id;
  }
  return { switchStartId, switchEndId };
}

test.describe('Switch condition and deletion', () => {
  test('SC1: Inline condition checkbox is respected by executor', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    const { switchStartId, switchEndId } = await addSwitchViaContextMenu(page, {
      x: 400,
      y: 300,
    });
    const bitInputId = await addBitInput(page, { x: 100, y: 300 });

    // Connect BitInput → SwitchStart infer input
    const c1 = await attemptConnectionByHandles(
      page,
      getHandleByName(page, bitInputId, HANDLE_GATE_OUT, 'source'),
      bitInputId,
      getHandleByIndex(page, switchStartId, 'target', 0),
      switchStartId,
    );
    expectConnectionLanded(c1, 'SC1: BitInput→SwitchStart');

    // Connect SwitchStart true output → SwitchEnd true input (passthrough)
    const c2 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, switchStartId, 'source', 1),
      switchStartId,
      getHandleByIndex(page, switchEndId, 'target', 1),
      switchEndId,
    );
    expectConnectionLanded(c2, 'SC1: true passthrough');

    // Connect SwitchStart false output → SwitchEnd false input (passthrough)
    const c3 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, switchStartId, 'source', 3),
      switchStartId,
      getHandleByIndex(page, switchEndId, 'target', 3),
      switchEndId,
    );
    expectConnectionLanded(c3, 'SC1: false passthrough');

    // Toggle condition checkbox to TRUE (no edge connected)
    const switchStartNode = page.locator(
      `.react-flow__node[data-id="${switchStartId}"]`,
    );
    const conditionCheckbox = switchStartNode.locator(
      'button[role="checkbox"]',
    );
    await conditionCheckbox.click();
    await expect(conditionCheckbox).toHaveAttribute('data-state', 'checked');

    // Run the graph — should complete without errors
    await clickRun(page);
    await waitForRunnerState(page, 'Completed');
  });

  test('SC2: Switch bind edge cannot be deleted independently', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    await addSwitchViaContextMenu(page, { x: 400, y: 300 });

    // Verify 1 bind edge exists
    await expect(getAllEdges(page)).toHaveCount(1);

    // Select the bind edge
    const bindEdge = getAllEdges(page).first();
    await bindEdge.click();
    await page.waitForTimeout(200);

    // Press Delete
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    // Verify bind edge still exists (deletion was blocked)
    await expect(getAllEdges(page)).toHaveCount(1);

    // Verify both nodes still exist
    await expect(getAllNodes(page)).toHaveCount(2);
  });
});
