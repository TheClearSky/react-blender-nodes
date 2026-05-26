import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../actions/graph/graphCanvas.actions';
import {
  getAllHandles,
  getHandleByName,
  getHandleByIndex,
} from '../../locators/node/node.locators';
import { addNode, addBitInput } from '../../helpers/addNode';
import { attemptConnectionByHandles } from '../../actions/node/connection.actions';
import { expectConnectionLanded } from '../../actions/connection/connection.actions';
import { STORY_EMPTY_RUNNER, HANDLE_GATE_OUT } from '../../constants';

const MENU_PATH_STANDARD = ['Add Node', 'Standard Nodes'];

async function addSwitchStart(
  page: import('@playwright/test').Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_STANDARD, 'Switch Start');
}

async function addSwitchEnd(
  page: import('@playwright/test').Page,
  position: { x: number; y: number },
): Promise<string> {
  return addNode(page, position, MENU_PATH_STANDARD, 'Switch End');
}

test.describe('Switch prototype — handle zone arithmetic', () => {
  test('SP1: Switch Start renders with correct initial handles', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const switchStartId = await addSwitchStart(page, { x: 400, y: 300 });

    // Outputs: bind + 2 infer templates = 3
    const outputs = await getAllHandles(page, switchStartId, 'source').count();
    expect(outputs).toBe(3);

    // Inputs: 1 infer template + condition = 2
    const inputs = await getAllHandles(page, switchStartId, 'target').count();
    expect(inputs).toBe(2);
  });

  test('SP2: Switch End renders with correct initial handles', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const switchEndId = await addSwitchEnd(page, { x: 400, y: 300 });

    // Inputs: bind + 2 infer templates = 3
    const inputs = await getAllHandles(page, switchEndId, 'target').count();
    expect(inputs).toBe(3);

    // Outputs: 1 infer template = 1
    const outputs = await getAllHandles(page, switchEndId, 'source').count();
    expect(outputs).toBe(1);
  });

  test('SP3: Connecting Bit Input → bound Switch Start infers handles and creates templates', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    const switchStartId = await addSwitchStart(page, { x: 400, y: 300 });
    const switchEndId = await addSwitchEnd(page, { x: 800, y: 300 });

    // Bind first
    const bindResult = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, switchStartId, 'source', 0),
      switchStartId,
      getHandleByIndex(page, switchEndId, 'target', 0),
      switchEndId,
    );
    expectConnectionLanded(bindResult, 'SP3: bind');

    const bitInputId = await addBitInput(page, { x: 100, y: 300 });

    // Connect Bit Input "Out" → Switch Start infer input (index 0 on target side)
    const result = await attemptConnectionByHandles(
      page,
      getHandleByName(page, bitInputId, HANDLE_GATE_OUT, 'source'),
      bitInputId,
      getHandleByIndex(page, switchStartId, 'target', 0),
      switchStartId,
    );
    expectConnectionLanded(result, 'SP3: BitInput→SwitchStart infer');

    // After inference:
    // Switch Start inputs: [inferred data, condition, new template] = 3
    const inputsAfter = await getAllHandles(
      page,
      switchStartId,
      'target',
    ).count();
    expect(inputsAfter).toBe(3);

    // Switch Start outputs: [bind, trueInferred, trueTemplate, falseInferred, falseTemplate] = 5
    const outputsAfter = await getAllHandles(
      page,
      switchStartId,
      'source',
    ).count();
    expect(outputsAfter).toBe(5);
  });

  test('SP5: Two same-named sources dedup between levels, not across zones', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    const switchStartId = await addSwitchStart(page, { x: 400, y: 300 });
    const switchEndId = await addSwitchEnd(page, { x: 800, y: 300 });

    // Bind
    const bindResult = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, switchStartId, 'source', 0),
      switchStartId,
      getHandleByIndex(page, switchEndId, 'target', 0),
      switchEndId,
    );
    expectConnectionLanded(bindResult, 'SP5: bind');

    // Connect first Bit Input "Out" → Switch Start infer input
    const bit1Id = await addBitInput(page, { x: 100, y: 200 });
    const c1 = await attemptConnectionByHandles(
      page,
      getHandleByName(page, bit1Id, HANDLE_GATE_OUT, 'source'),
      bit1Id,
      getHandleByIndex(page, switchStartId, 'target', 0),
      switchStartId,
    );
    expectConnectionLanded(c1, 'SP5: first BitInput→SwitchStart');

    // Connect second Bit Input "Out" → Switch Start infer template (index 1)
    const bit2Id = await addBitInput(page, { x: 100, y: 500 });
    const c2 = await attemptConnectionByHandles(
      page,
      getHandleByName(page, bit2Id, HANDLE_GATE_OUT, 'source'),
      bit2Id,
      getHandleByIndex(page, switchStartId, 'target', 1),
      switchStartId,
    );
    expectConnectionLanded(c2, 'SP5: second BitInput→SwitchStart');

    // SwitchStart inputs should dedup: [Out, Out 2, template, condition] = 4
    const inputs = await getAllHandles(page, switchStartId, 'target').count();
    expect(inputs).toBe(4);

    // Verify "Out 2" exists (deduped) on SwitchStart inputs
    const out2Handle = getHandleByName(page, switchStartId, 'Out 2', 'target');
    await expect(out2Handle).toHaveCount(1);

    // SwitchStart outputs should have zone-differentiated names
    // "True: Out" and "False: Out" are distinct — no false dedup
    // "True: Out" and "True: Out 2" are deduped within true zone
    const trueOutHandle = getHandleByName(
      page,
      switchStartId,
      'True: Out',
      'source',
    );
    const trueOut2Handle = getHandleByName(
      page,
      switchStartId,
      'True: Out 2',
      'source',
    );
    const falseOutHandle = getHandleByName(
      page,
      switchStartId,
      'False: Out',
      'source',
    );
    const falseOut2Handle = getHandleByName(
      page,
      switchStartId,
      'False: Out 2',
      'source',
    );
    await expect(trueOutHandle).toHaveCount(1);
    await expect(trueOut2Handle).toHaveCount(1);
    await expect(falseOutHandle).toHaveCount(1);
    await expect(falseOut2Handle).toHaveCount(1);

    // SwitchStart outputs total: [bind, True: Out, True: Out 2, trueTemplate, False: Out, False: Out 2, falseTemplate] = 7
    const outputs = await getAllHandles(page, switchStartId, 'source').count();
    expect(outputs).toBe(7);

    // SwitchEnd should mirror
    const endOut2Handle = getHandleByName(page, switchEndId, 'Out 2', 'source');
    await expect(endOut2Handle).toHaveCount(1);
  });

  test('SP4: Inference propagates across bind to Switch End', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    const switchStartId = await addSwitchStart(page, { x: 400, y: 300 });
    const switchEndId = await addSwitchEnd(page, { x: 800, y: 300 });

    // First bind them
    const bindResult = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, switchStartId, 'source', 0), // bind output
      switchStartId,
      getHandleByIndex(page, switchEndId, 'target', 0), // bind input
      switchEndId,
    );
    expectConnectionLanded(bindResult, 'SP4: bind');

    // Now connect Bit Input → Switch Start infer input
    const bitInputId = await addBitInput(page, { x: 100, y: 300 });
    const inferResult = await attemptConnectionByHandles(
      page,
      getHandleByName(page, bitInputId, HANDLE_GATE_OUT, 'source'),
      bitInputId,
      getHandleByIndex(page, switchStartId, 'target', 0),
      switchStartId,
    );
    expectConnectionLanded(inferResult, 'SP4: BitInput→SwitchStart');

    // Check Switch End got inference propagation
    // Switch End inputs: [bind, trueInferred, trueTemplate, falseInferred, falseTemplate] = 5
    const switchEndInputs = await getAllHandles(
      page,
      switchEndId,
      'target',
    ).count();
    expect(switchEndInputs).toBe(5);

    // Switch End outputs: [inferred, template] = 2
    const switchEndOutputs = await getAllHandles(
      page,
      switchEndId,
      'source',
    ).count();
    expect(switchEndOutputs).toBe(2);
  });
});
