import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../actions/graph/graphCanvas.actions';
import { getAllEdges } from '../../locators/graph/graphCanvas.locators';
import {
  getAllHandles,
  getHandleByName,
  getHandleByIndex,
} from '../../locators/node/node.locators';
import { addLogicGate } from '../../helpers/addNode';
import { attemptConnectionByHandles } from '../../actions/node/connection.actions';
import {
  expectConnectionLanded,
  expectConnectionRejected,
} from '../../actions/connection/connection.actions';
import { collectAllNodeIds } from '../../actions/graph/selection.actions';
import {
  STORY_EMPTY_RUNNER,
  NODE_AND_GATE,
  HANDLE_GATE_A,
} from '../../constants';

/**
 * Create a new node group via the combobox selector and enter it.
 * Returns GroupInput and GroupOutput node IDs inside the group.
 */
async function createAndEnterNodeGroup(page: import('@playwright/test').Page) {
  const combobox = page.getByRole('combobox');
  await combobox.click();
  await page.getByRole('option', { name: 'Add New Node Group' }).click();
  await page.waitForTimeout(200);

  return findGroupBoundaryNodeIds(page);
}

async function findGroupBoundaryNodeIds(page: import('@playwright/test').Page) {
  const allIds = await collectAllNodeIds(page);
  let groupInputId: string | undefined;
  let groupOutputId: string | undefined;
  for (const id of allIds) {
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    const text = await node.locator('p').first().textContent();
    if (text === 'Group Input') groupInputId = id;
    if (text === 'Group Output') groupOutputId = id;
  }
  if (!groupInputId || !groupOutputId) {
    throw new Error(
      `Could not find Group Input/Output. Found nodes with text: ${allIds.join(', ')}`,
    );
  }
  return { groupInputId, groupOutputId };
}

test.describe('Group inference — handle duplication and propagation', () => {
  test('GI1: GroupInput(infer) → RegularNode(concrete) infers output and creates duplicate', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const { groupInputId } = await createAndEnterNodeGroup(page);

    const sourceHandlesBefore = await getAllHandles(
      page,
      groupInputId,
      'source',
    ).count();
    expect(sourceHandlesBefore).toBe(1);

    const andGateId = await addLogicGate(
      page,
      { x: 500, y: 200 },
      NODE_AND_GATE,
    );

    const result = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 0),
      groupInputId,
      getHandleByName(page, andGateId, HANDLE_GATE_A, 'target'),
      andGateId,
    );
    expectConnectionLanded(result, 'GI1: GroupInput→AND.A');

    const sourceHandlesAfter = await getAllHandles(
      page,
      groupInputId,
      'source',
    ).count();
    expect(sourceHandlesAfter).toBe(2);
  });

  test('GI2: RegularNode(concrete) → GroupOutput(infer) infers input and creates duplicate', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const { groupOutputId } = await createAndEnterNodeGroup(page);

    const targetHandlesBefore = await getAllHandles(
      page,
      groupOutputId,
      'target',
    ).count();
    expect(targetHandlesBefore).toBe(1);

    const andGateId = await addLogicGate(
      page,
      { x: 400, y: 200 },
      NODE_AND_GATE,
    );

    const result = await attemptConnectionByHandles(
      page,
      getHandleByName(page, andGateId, 'Out', 'source'),
      andGateId,
      getHandleByIndex(page, groupOutputId, 'target', 0),
      groupOutputId,
    );
    expectConnectionLanded(result, 'GI2: AND.Out→GroupOutput');

    const targetHandlesAfter = await getAllHandles(
      page,
      groupOutputId,
      'target',
    ).count();
    expect(targetHandlesAfter).toBe(2);
  });

  test('GI3: GroupInput(inferred) → GroupOutput(infer) direct — infers GroupOutput', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const { groupInputId, groupOutputId } = await createAndEnterNodeGroup(page);

    // Step 1: Infer GroupInput via AND Gate
    const andGateId = await addLogicGate(
      page,
      { x: 500, y: 100 },
      NODE_AND_GATE,
    );
    const step1 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 0),
      groupInputId,
      getHandleByName(page, andGateId, HANDLE_GATE_A, 'target'),
      andGateId,
    );
    expectConnectionLanded(step1, 'GI3 step1');
    expect(await getAllHandles(page, groupInputId, 'source').count()).toBe(2);

    // Step 2: GroupInput[0] (inferred) → GroupOutput[0] (infer)
    const step2 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 0),
      groupInputId,
      getHandleByIndex(page, groupOutputId, 'target', 0),
      groupOutputId,
    );
    expectConnectionLanded(step2, 'GI3 step2: direct GroupInput→GroupOutput');
    expect(await getAllHandles(page, groupOutputId, 'target').count()).toBe(2);
  });

  test('GI4: Case C fix — GroupInput(infer) → GroupOutput(already inferred) adds duplicate to GroupInput', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const { groupInputId, groupOutputId } = await createAndEnterNodeGroup(page);

    // Step 1: Infer GroupInput[0] via AND Gate
    const andGateId = await addLogicGate(
      page,
      { x: 500, y: 100 },
      NODE_AND_GATE,
    );
    const step1 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 0),
      groupInputId,
      getHandleByName(page, andGateId, HANDLE_GATE_A, 'target'),
      andGateId,
    );
    expectConnectionLanded(step1, 'GI4 step1');

    // Step 2: GroupInput[0] → GroupOutput[0]
    const step2 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 0),
      groupInputId,
      getHandleByIndex(page, groupOutputId, 'target', 0),
      groupOutputId,
    );
    expectConnectionLanded(step2, 'GI4 step2');
    expect(await getAllHandles(page, groupInputId, 'source').count()).toBe(2);
    expect(await getAllHandles(page, groupOutputId, 'target').count()).toBe(2);

    // Step 3: GroupInput[1] (infer, unconsumed) → GroupOutput[0] (already inferred)
    // THIS is the Case C scenario. Before the fix, duplicate went to GroupOutput (wrong).
    // After the fix, duplicate goes to GroupInput (correct).
    const step3 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 1),
      groupInputId,
      getHandleByIndex(page, groupOutputId, 'target', 0),
      groupOutputId,
    );
    expectConnectionLanded(step3, 'GI4 step3: Case C fix');

    // GroupInput consumed template[1], should get new template → 3 handles
    // GroupOutput was NOT the infer side → stays at 2 handles
    expect(await getAllHandles(page, groupInputId, 'source').count()).toBe(3);
    expect(await getAllHandles(page, groupOutputId, 'target').count()).toBe(2);
  });

  test('GI5: Multi-iteration — infer via multiple regular nodes then direct connections', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const { groupInputId, groupOutputId } = await createAndEnterNodeGroup(page);

    // Step 1: Infer GroupInput[0] via AND Gate A
    const andGateAId = await addLogicGate(
      page,
      { x: 500, y: 50 },
      NODE_AND_GATE,
    );
    const s1 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 0),
      groupInputId,
      getHandleByName(page, andGateAId, HANDLE_GATE_A, 'target'),
      andGateAId,
    );
    expectConnectionLanded(s1, 'GI5 s1');

    // Step 2: Infer GroupInput[1] via AND Gate B
    const andGateBId = await addLogicGate(
      page,
      { x: 500, y: 300 },
      NODE_AND_GATE,
    );
    const s2 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 1),
      groupInputId,
      getHandleByName(page, andGateBId, HANDLE_GATE_A, 'target'),
      andGateBId,
    );
    expectConnectionLanded(s2, 'GI5 s2');

    // GroupInput now has 3 outputs: [0]=inferred, [1]=inferred, [2]=template
    expect(await getAllHandles(page, groupInputId, 'source').count()).toBe(3);

    // Step 3: GroupInput[0] → GroupOutput[0] (direct, inferred→uninferred)
    const s3 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 0),
      groupInputId,
      getHandleByIndex(page, groupOutputId, 'target', 0),
      groupOutputId,
    );
    expectConnectionLanded(s3, 'GI5 s3');

    // Step 4: GroupInput[1] → GroupOutput[0] (Case C: infer→already-inferred)
    const s4 = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 1),
      groupInputId,
      getHandleByIndex(page, groupOutputId, 'target', 0),
      groupOutputId,
    );
    expectConnectionLanded(s4, 'GI5 s4');

    // After 4 connections:
    // GroupInput: [0]=inferred(step1), [1]=inferred(step2), [2]=template → 3
    // Steps 3-4 connected already-overridden GroupInput outputs, so no new templates for GroupInput.
    // GroupOutput: [0]=inferred(step3), [1]=template(step3) → 2
    // Step 4 connected to already-inferred GroupOutput[0], so Case C adds template to GroupInput → 3 stays at 3
    // (step 4's Case C: source is GroupInput[1], overridden to bit, so isSourceInferFromConnection=false,
    //  target is GroupOutput[0] also overridden → isTargetInferFromConnection=false → XOR both false → no duplication)
    const giHandles = await getAllHandles(page, groupInputId, 'source').count();
    const goHandles = await getAllHandles(
      page,
      groupOutputId,
      'target',
    ).count();
    expect(giHandles).toBe(3);
    expect(goHandles).toBe(2);

    // Total edges: 2 (AND Gates) + 2 (direct) = 4
    expect(await getAllEdges(page).count()).toBe(4);
  });

  test('GI6: Infer → Infer both unresolved is rejected', async ({ page }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const { groupInputId, groupOutputId } = await createAndEnterNodeGroup(page);

    // Neither side is inferred — direct connection should be rejected
    const result = await attemptConnectionByHandles(
      page,
      getHandleByIndex(page, groupInputId, 'source', 0),
      groupInputId,
      getHandleByIndex(page, groupOutputId, 'target', 0),
      groupOutputId,
    );
    expectConnectionRejected(result, 'GI6: both unresolved should reject');
  });
});
