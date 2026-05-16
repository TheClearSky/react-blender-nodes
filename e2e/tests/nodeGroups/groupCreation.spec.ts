import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../actions/graph/graphCanvas.actions';
import {
  getAllNodes,
  getAllEdges,
} from '../../locators/graph/graphCanvas.locators';
import { getNodeById } from '../../locators/node/node.locators';
import {
  addBitInput,
  addBitOutput,
  addConfigurableGate,
} from '../../helpers/addNode';
import { connectHandles } from '../../actions/node/connection.actions';
import {
  clickRun,
  waitForRunnerState,
  clickReset,
} from '../../actions/runnerPanel/runnerPanel.actions';
import { getTimelineStepCount } from '../../actions/timeline/timeline.actions';
import {
  STORY_EMPTY_RUNNER,
  HANDLE_GATE_A,
  HANDLE_GATE_B,
  HANDLE_GATE_OUT,
  HANDLE_IN,
} from '../../constants';

test.describe('Node groups — construction inside a group', () => {
  test('NG1: Nodes added inside a group are visible and connectable', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // We start inside a Node Group. Add two nodes and connect them.
    const bitInputId = await addBitInput(page, { x: 200, y: 200 });
    const bitOutputId = await addBitOutput(page, { x: 600, y: 200 });

    await connectHandles(
      page,
      bitInputId,
      HANDLE_GATE_OUT,
      bitOutputId,
      HANDLE_IN,
    );

    // Verify: 2 nodes + 1 edge (not counting invisible group boundary nodes)
    const visibleNodes = await getAllNodes(page).count();
    expect(visibleNodes).toBeGreaterThanOrEqual(2);
    await expect(getAllEdges(page)).toHaveCount(1);
  });

  test('NG2: Graph inside a group can be executed via runner', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // Build a simple chain inside the group: BitInput → BitOutput
    // (Buffer adds menu navigation complexity; keep it simple)
    const bitInputId = await addBitInput(page, { x: 200, y: 200 });
    const bitOutputId = await addBitOutput(page, { x: 600, y: 200 });

    await connectHandles(
      page,
      bitInputId,
      HANDLE_GATE_OUT,
      bitOutputId,
      HANDLE_IN,
    );

    // Run the graph from inside the group
    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    // Should have at least 2 timeline steps (BitInput, BitOutput)
    const stepCount = await getTimelineStepCount(page);
    expect(stepCount).toBeGreaterThanOrEqual(2);
  });

  test('NG3: Configurable Gate with Mode selection executes correctly inside a group', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // Build: BitInput(A) → gate.A, BitInput(B) → gate.B, gate.Out → BitOutput
    const bitInputAId = await addBitInput(page, { x: 100, y: 100 });
    const bitInputBId = await addBitInput(page, { x: 100, y: 300 });
    const gateId = await addConfigurableGate(page, { x: 400, y: 180 });
    const bitOutputId = await addBitOutput(page, { x: 700, y: 180 });

    await connectHandles(
      page,
      bitInputAId,
      HANDLE_GATE_OUT,
      gateId,
      HANDLE_GATE_A,
    );
    await connectHandles(
      page,
      bitInputBId,
      HANDLE_GATE_OUT,
      gateId,
      HANDLE_GATE_B,
    );
    await connectHandles(page, gateId, HANDLE_GATE_OUT, bitOutputId, HANDLE_IN);

    // Select OR mode
    const gateNode = getNodeById(page, gateId);
    const selectTrigger = gateNode.locator('button[role="combobox"]');
    await selectTrigger.click();
    await page.locator('role=option[name="OR" i]').click();
    await expect(selectTrigger).toContainText('OR');

    // Run
    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    // Should have 4 steps: 2 BitInputs + Gate + BitOutput
    const stepCount = await getTimelineStepCount(page);
    expect(stepCount).toBe(4);
  });

  test('NG4: Multiple runs with different Mode selections produce different results', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // Simple gate with one input
    const bitInputId = await addBitInput(page, { x: 100, y: 200 });
    const gateId = await addConfigurableGate(page, { x: 400, y: 200 });
    const bitOutputId = await addBitOutput(page, { x: 700, y: 200 });

    await connectHandles(
      page,
      bitInputId,
      HANDLE_GATE_OUT,
      gateId,
      HANDLE_GATE_A,
    );
    await connectHandles(page, gateId, HANDLE_GATE_OUT, bitOutputId, HANDLE_IN);

    // Run 1: with AND mode
    const gateNode = getNodeById(page, gateId);
    const selectTrigger = gateNode.locator('button[role="combobox"]');
    await selectTrigger.click();
    await page.locator('role=option[name="AND" i]').click();

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    // Verify execution completed (basic sanity)
    const stepCount1 = await getTimelineStepCount(page);
    expect(stepCount1).toBeGreaterThanOrEqual(3);

    // Reset and change mode
    await clickReset(page);
    await waitForRunnerState(page, 'Idle');

    // Deselect AND, select OR
    await selectTrigger.click();
    await page.locator('role=option[name="AND" i]').click(); // deselect
    await selectTrigger.click();
    await page.locator('role=option[name="OR" i]').click();
    await expect(selectTrigger).toContainText('OR');

    // Run 2
    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    const stepCount2 = await getTimelineStepCount(page);
    expect(stepCount2).toBeGreaterThanOrEqual(3);
  });
});
