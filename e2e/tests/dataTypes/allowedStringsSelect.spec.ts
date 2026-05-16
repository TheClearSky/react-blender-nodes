import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../actions/graph/graphCanvas.actions';
import {
  addConfigurableGate,
  addBitInput,
  addBitOutput,
} from '../../helpers/addNode';
import {
  connectHandles,
  attemptConnection,
} from '../../actions/node/connection.actions';
import { getNodeById } from '../../locators/graph/graphCanvas.locators';
import {
  clickRun,
  waitForRunnerState,
} from '../../actions/runnerPanel/runnerPanel.actions';
import { clickTimelineStep } from '../../actions/timeline/timeline.actions';
import {
  waitForInspectorOpen,
  getInspectorText,
} from '../../actions/inspector/inspector.actions';
import {
  STORY_EMPTY_RUNNER,
  HANDLE_GATE_A,
  HANDLE_GATE_B,
  HANDLE_GATE_OUT,
  HANDLE_IN,
} from '../../constants';

test.describe('allowedStrings Select — UI behavior', () => {
  test('DT1: Configurable Gate renders a Select dropdown for the Mode handle', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const gateId = await addConfigurableGate(page, { x: 500, y: 300 });

    const node = getNodeById(page, gateId);
    const selectTrigger = node.locator('button[role="combobox"]');
    await expect(selectTrigger).toBeVisible();
    await expect(selectTrigger).toContainText('Mode');
  });

  test('DT2: Clicking the Select opens a dropdown with all allowedStrings options', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const gateId = await addConfigurableGate(page, { x: 500, y: 300 });

    const node = getNodeById(page, gateId);
    const selectTrigger = node.locator('button[role="combobox"]');
    await selectTrigger.click();

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible();
    const options = listbox.locator('[role="option"]');
    await expect(options).toHaveCount(6);
    await expect(listbox.locator('role=option[name="AND" i]')).toBeVisible();
    await expect(listbox.locator('role=option[name="XNOR" i]')).toBeVisible();
  });

  test('DT3: Selecting an option updates the trigger text', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const gateId = await addConfigurableGate(page, { x: 500, y: 300 });

    const node = getNodeById(page, gateId);
    const selectTrigger = node.locator('button[role="combobox"]');
    await selectTrigger.click();
    await page.locator('role=option[name="XOR" i]').click();

    await expect(selectTrigger).toContainText('XOR');
  });

  test('DT4: Click-to-deselect clears the value back to placeholder', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const gateId = await addConfigurableGate(page, { x: 500, y: 300 });

    const node = getNodeById(page, gateId);
    const selectTrigger = node.locator('button[role="combobox"]');

    // Select NAND
    await selectTrigger.click();
    await page.locator('role=option[name="NAND" i]').click();
    await expect(selectTrigger).toContainText('NAND');

    // Re-open and click NAND again to deselect
    await selectTrigger.click();
    await page.locator('role=option[name="NAND" i]').click();
    await expect(selectTrigger).toContainText('Mode');
  });

  test('DT5: Selected option shows a checkmark in the dropdown', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const gateId = await addConfigurableGate(page, { x: 500, y: 300 });

    const node = getNodeById(page, gateId);
    const selectTrigger = node.locator('button[role="combobox"]');

    await selectTrigger.click();
    await page.locator('role=option[name="OR" i]').click();
    await selectTrigger.click();

    const orOption = page.locator('role=option[name="OR" i]');
    await expect(orOption).toHaveAttribute('aria-selected', 'true');
  });

  test('DT6: Select dropdown closes on click outside', async ({ page }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const gateId = await addConfigurableGate(page, { x: 500, y: 300 });

    const node = getNodeById(page, gateId);
    const selectTrigger = node.locator('button[role="combobox"]');

    await selectTrigger.click();
    await expect(page.locator('[role="option"]').first()).toBeVisible();

    await page
      .locator('.react-flow__pane')
      .click({ position: { x: 100, y: 100 } });

    await expect(page.locator('[role="option"]')).toHaveCount(0);
  });

  test('DT7: Select closes on Escape key', async ({ page }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const gateId = await addConfigurableGate(page, { x: 500, y: 300 });

    const node = getNodeById(page, gateId);
    const selectTrigger = node.locator('button[role="combobox"]');

    await selectTrigger.click();
    await expect(page.locator('[role="option"]').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[role="option"]')).toHaveCount(0);
  });

  test('DT8: Select stays visible when a DIFFERENT handle on the same node gets connected', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const gateId = await addConfigurableGate(page, { x: 500, y: 300 });

    const node = getNodeById(page, gateId);
    const selectTrigger = node.locator('button[role="combobox"]');
    await expect(selectTrigger).toBeVisible();

    // Connect BitInput.Out → gate.A (bit type, not Mode)
    const bitInputId = await addBitInput(page, { x: 200, y: 300 });
    await connectHandles(
      page,
      bitInputId,
      HANDLE_GATE_OUT,
      gateId,
      HANDLE_GATE_A,
    );

    // Mode select should still be visible (only Mode's own connection hides it)
    await expect(selectTrigger).toBeVisible();
  });
});

test.describe('allowedStrings Select — runner integration', () => {
  test('DT9: Selected Mode value flows through execution and appears in inspector output', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // Build: BitInput(A=true) → gate.A, BitInput(B=false) → gate.B, gate.Out → BitOutput
    const bitInputAId = await addBitInput(page, { x: 100, y: 100 });
    const bitInputBId = await addBitInput(page, { x: 100, y: 250 });
    const gateId = await addConfigurableGate(page, { x: 400, y: 150 });
    const bitOutputId = await addBitOutput(page, { x: 700, y: 150 });

    // Connect A and B inputs
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
    // Connect gate output to display
    await connectHandles(page, gateId, HANDLE_GATE_OUT, bitOutputId, HANDLE_IN);

    // Set A=true via the checkbox (Bit Input has allowInput: true)
    const bitInputANode = getNodeById(page, bitInputAId);
    const checkboxA = bitInputANode.locator('[role="checkbox"]');
    // Check the checkbox (default is false, click to make true)
    await checkboxA.click();

    // Select XOR mode on the gate
    const gateNode = getNodeById(page, gateId);
    const selectTrigger = gateNode.locator('button[role="combobox"]');
    await selectTrigger.click();
    await page.locator('role=option[name="XOR" i]').click();
    await expect(selectTrigger).toContainText('XOR');

    // Run the graph
    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    // The graph ran: A=true XOR B=false = true
    // Click the Configurable Gate step in timeline to inspect its output
    // Find the timeline block for the gate
    const timelineBlocks = page.locator('[data-step-index]');
    const blockCount = await timelineBlocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(4); // At least: BitInputA, BitInputB, Gate, BitOutput

    // Click the gate's timeline block and check the inspector shows "XOR" as the Mode input
    for (let i = 0; i < blockCount; i++) {
      await clickTimelineStep(page, i);
      await waitForInspectorOpen(page);
      const text = await getInspectorText(page);
      if (text.includes('Configurable Gate')) {
        // Found the gate step — verify Mode input shows XOR
        expect(text).toContain('XOR');
        break;
      }
    }
  });

  test('DT10: Changing Mode value between runs uses the new value', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // Build minimal: BitInput → gate.A, gate.Out → BitOutput
    const bitInputId = await addBitInput(page, { x: 100, y: 150 });
    const gateId = await addConfigurableGate(page, { x: 400, y: 150 });
    const bitOutputId = await addBitOutput(page, { x: 700, y: 150 });

    await connectHandles(
      page,
      bitInputId,
      HANDLE_GATE_OUT,
      gateId,
      HANDLE_GATE_A,
    );
    await connectHandles(page, gateId, HANDLE_GATE_OUT, bitOutputId, HANDLE_IN);

    // Select AND mode, run
    const gateNode = getNodeById(page, gateId);
    const selectTrigger = gateNode.locator('button[role="combobox"]');
    await selectTrigger.click();
    await page.locator('role=option[name="AND" i]').click();
    await expect(selectTrigger).toContainText('AND');

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    // Reset, change to OR, run again
    const resetButton = page.locator('button[title="Reset"]');
    await resetButton.click();
    await waitForRunnerState(page, 'Idle');

    await selectTrigger.click();
    // Deselect AND first
    await page.locator('role=option[name="AND" i]').click();
    // Now select OR
    await selectTrigger.click();
    await page.locator('role=option[name="OR" i]').click();
    await expect(selectTrigger).toContainText('OR');

    await clickRun(page);
    await waitForRunnerState(page, 'Completed');

    // Find gate step in timeline and verify it shows OR, not AND
    const timelineBlocks = page.locator('[data-step-index]');
    const blockCount = await timelineBlocks.count();
    for (let i = 0; i < blockCount; i++) {
      await clickTimelineStep(page, i);
      await waitForInspectorOpen(page);
      const text = await getInspectorText(page);
      if (text.includes('Configurable Gate')) {
        expect(text).toContain('OR');
        expect(text).not.toContain('AND');
        break;
      }
    }
  });
});

test.describe('allowedStrings Select — type validation', () => {
  test('DT11: Connecting incompatible type to Mode handle is rejected', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // BitInput outputs "bit" (boolean), Mode expects "gateMode" (string)
    // These are different data types with no conversion rule between them
    const bitInputId = await addBitInput(page, { x: 200, y: 300 });
    const gateId = await addConfigurableGate(page, { x: 500, y: 300 });

    // Attempt to connect BitInput.Out (bit) → gate.Mode (gateMode)
    // This should be rejected because bit→gateMode conversion is not allowed
    const result = await attemptConnection(
      page,
      bitInputId,
      HANDLE_GATE_OUT,
      gateId,
      'Mode',
    );

    expect(result.pairExists).toBe(false);
    expect(result.totalEdgesDelta).toBe(0);
  });
});
