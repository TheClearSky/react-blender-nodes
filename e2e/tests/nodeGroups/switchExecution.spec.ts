import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../actions/graph/graphCanvas.actions';
import {
  getAllNodes,
  getAllEdges,
} from '../../locators/graph/graphCanvas.locators';
import {
  getAllHandles,
  getHandleByName,
  getHandleByIndex,
} from '../../locators/node/node.locators';
import { addBitInput, addBitOutput } from '../../helpers/addNode';
import { attemptConnectionByHandles } from '../../actions/node/connection.actions';
import { expectConnectionLanded } from '../../actions/connection/connection.actions';
import { collectAllNodeIds } from '../../actions/graph/selection.actions';
import { clickRun } from '../../actions/runnerPanel/runnerPanel.actions';
import { rightClickCanvas } from '../../actions/graph/graphCanvas.actions';
import {
  STORY_EMPTY_RUNNER,
  HANDLE_GATE_OUT,
  HANDLE_IN,
} from '../../constants';

async function addSwitchViaContextMenu(
  page: import('@playwright/test').Page,
  position: { x: number; y: number },
): Promise<{ switchStartId: string; switchEndId: string }> {
  const beforeIds = new Set(await collectAllNodeIds(page));
  await rightClickCanvas(page, position);
  // Click "Add Switch" directly (root-level menu item)
  await page.getByText('Add Switch').click();
  // Wait for 2 new nodes
  await expect(getAllNodes(page)).toHaveCount(beforeIds.size + 2);
  const afterIds = await collectAllNodeIds(page);
  const newIds = afterIds.filter((id) => !beforeIds.has(id));
  if (newIds.length !== 2) {
    throw new Error(`addSwitch: expected 2 new nodes, got ${newIds.length}`);
  }

  // Identify which is start and which is end by checking node text
  let switchStartId = '';
  let switchEndId = '';
  for (const id of newIds) {
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    const text = await node.locator('p').first().textContent();
    if (text === 'Switch Start') switchStartId = id;
    if (text === 'Switch End') switchEndId = id;
  }
  if (!switchStartId || !switchEndId) {
    throw new Error('Could not identify Switch Start/End nodes');
  }
  return { switchStartId, switchEndId };
}

test.describe('Switch execution — basic flow', () => {
  test('SE1: ADD_SWITCH creates bound pair with correct handles', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    const { switchStartId, switchEndId } = await addSwitchViaContextMenu(page, {
      x: 400,
      y: 300,
    });

    // Verify bind edge exists
    expect(await getAllEdges(page).count()).toBe(1);

    // SwitchStart: 3 outputs (bind + 2 infer), 2 inputs (infer + condition)
    expect(await getAllHandles(page, switchStartId, 'source').count()).toBe(3);
    expect(await getAllHandles(page, switchStartId, 'target').count()).toBe(2);

    // SwitchEnd: 3 inputs (bind + 2 infer), 1 output (infer)
    expect(await getAllHandles(page, switchEndId, 'target').count()).toBe(3);
    expect(await getAllHandles(page, switchEndId, 'source').count()).toBe(1);
  });

  test('SE2: BitInput → SwitchStart infer, inference propagates across pair', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    const { switchStartId, switchEndId } = await addSwitchViaContextMenu(page, {
      x: 400,
      y: 300,
    });
    const bitInputId = await addBitInput(page, { x: 100, y: 300 });

    // Connect BitInput Out → SwitchStart infer input (first target handle)
    const result = await attemptConnectionByHandles(
      page,
      getHandleByName(page, bitInputId, HANDLE_GATE_OUT, 'source'),
      bitInputId,
      getHandleByIndex(page, switchStartId, 'target', 0),
      switchStartId,
    );
    expectConnectionLanded(result, 'SE2: BitInput→SwitchStart');

    // After inference: SwitchStart inputs = 3 (inferred + condition + template)
    expect(await getAllHandles(page, switchStartId, 'target').count()).toBe(3);
    // SwitchStart outputs = 5 (bind + trueInferred + trueTemplate + falseInferred + falseTemplate)
    expect(await getAllHandles(page, switchStartId, 'source').count()).toBe(5);
    // SwitchEnd inputs = 5 (bind + trueInferred + trueTemplate + falseInferred + falseTemplate)
    expect(await getAllHandles(page, switchEndId, 'target').count()).toBe(5);
    // SwitchEnd outputs = 2 (inferred + template)
    expect(await getAllHandles(page, switchEndId, 'source').count()).toBe(2);
  });

  test('SE3: Simple switch graph runs without errors', async ({ page }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // Build: BitInput → SwitchStart → SwitchEnd → BitOutput
    const { switchStartId, switchEndId } = await addSwitchViaContextMenu(page, {
      x: 400,
      y: 300,
    });
    const bitInputId = await addBitInput(page, { x: 100, y: 300 });
    const bitOutputId = await addBitOutput(page, { x: 900, y: 300 });

    // Capture ALL console messages for debugging
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);
    });

    // Connect BitInput → SwitchStart infer input
    const c1 = await attemptConnectionByHandles(
      page,
      getHandleByName(page, bitInputId, HANDLE_GATE_OUT, 'source'),
      bitInputId,
      getHandleByIndex(page, switchStartId, 'target', 0),
      switchStartId,
    );
    expectConnectionLanded(c1, 'SE3: c1');

    // Verify handle counts after inference
    const startOutputCount = await getAllHandles(
      page,
      switchStartId,
      'source',
    ).count();
    const endInputCount = await getAllHandles(
      page,
      switchEndId,
      'target',
    ).count();
    const endOutputCount = await getAllHandles(
      page,
      switchEndId,
      'source',
    ).count();
    console.log(
      'After c1: startOutputs=',
      startOutputCount,
      'endInputs=',
      endInputCount,
      'endOutputs=',
      endOutputCount,
    );

    // Connect SwitchStart true output → SwitchEnd true input (direct passthrough)
    // After inference: SwitchStart source = [bind(0), trueInferred(1), trueTemplate(2), falseInferred(3), falseTemplate(4)]
    // After inference: SwitchEnd target = [bind(0), trueInferred(1), trueTemplate(2), falseInferred(3), falseTemplate(4)]
    const c3 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, switchStartId, 'source', 1),
      switchStartId,
      getHandleByIndex(page, switchEndId, 'target', 1),
      switchEndId,
    );
    // Log ALL switch/conversion related console messages
    const relevantLogs = consoleLogs.filter(
      (l) =>
        l.includes('Switch') ||
        l.includes('Conversion') ||
        l.includes('switch'),
    );
    console.log('c3 result:', JSON.stringify(c3));
    console.log(
      'ALL relevant logs (' +
        relevantLogs.length +
        '):\n' +
        relevantLogs.join('\n'),
    );
    expectConnectionLanded(c3, 'SE3: c3 true passthrough');

    // Connect SwitchStart false output → SwitchEnd false input (direct passthrough)
    const c4 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, switchStartId, 'source', 3),
      switchStartId,
      getHandleByIndex(page, switchEndId, 'target', 3),
      switchEndId,
    );
    expectConnectionLanded(c4, 'SE3: c4 false passthrough');

    // Connect SwitchEnd output → BitOutput "In"
    const c2 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, switchEndId, 'source', 0),
      switchEndId,
      getHandleByName(page, bitOutputId, HANDLE_IN, 'target'),
      bitOutputId,
    );
    expectConnectionLanded(c2, 'SE3: c2 SwitchEnd→BitOutput');

    // Run the graph
    await clickRun(page);
    // Wait for any terminal state
    await page.waitForTimeout(3000);
    const runnerState = await page
      .locator('.bg-runner-toolbar-bg span')
      .first()
      .textContent();
    console.log('Runner state:', runnerState);

    // Log ALL error/warning messages from console
    const errorLogs = consoleLogs.filter(
      (l) => l.startsWith('[error]') || l.startsWith('[warning]'),
    );
    console.log('Error logs:', errorLogs.join('\n'));
    console.log(
      'ALL console (' + consoleLogs.length + '):',
      consoleLogs.slice(-20).join('\n'),
    );
    // Log switch executor logs
    const switchLogs = consoleLogs.filter(
      (l) => l.includes('[Switch]') || l.includes('[SwitchCompiler]'),
    );
    console.log('Switch executor logs:', switchLogs.join('\n'));

    expect(runnerState).toBe('Completed');
  });
});
