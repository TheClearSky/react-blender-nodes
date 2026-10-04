import { test, expect } from '@playwright/test';
import { navigateToStory } from '../actions/graph/graphCanvas.actions';
import { addNode } from '../helpers/addNode';
import { dragBetweenLocators } from '../actions/node/connection.actions';
import { getHandleByName } from '../locators/node/node.locators';
import { getAllEdges } from '../locators/graph/graphCanvas.locators';
import { selectEdgeBetween } from '../actions/graph/edge.actions';
import { pressDelete } from '../actions/graph/selection.actions';

/**
 * NS-01 / C1 LIVE DEMO — deleting an edge into an inferFromConnection handle
 * crashes `validateAction` on frozen committed state, the throw escapes
 * `dispatch`'s try/catch, and the deletion silently does not apply.
 *
 * Sequence (the exact production path):
 *   1. Add `Bit Input` and `Infer Sink` via the real context menu.
 *   2. Drag-connect `Bit Input.Out → Infer Sink.Inferred In`. This dispatch
 *      COMMITS through immer `produce` ⇒ the committed state tree is
 *      auto-frozen. (The ADD half of inference was migrated to a pure
 *      planner, so connecting is safe — only REMOVAL still mutates.)
 *   3. Click the edge, press Delete. ReactFlow dispatches
 *      UPDATE_EDGES_BY_REACT_FLOW {type:'remove'} → `validateAction` →
 *      `inferTypesAfterEdgeRemoval` reset branch → `Object.assign` onto the
 *      frozen handle ⇒ `TypeError: Cannot assign to read only property …`.
 *
 * PASS here means BUG CONFIRMED:
 *   - an uncaught page error matching the frozen-mutation TypeError fired, and
 *   - the edge is STILL on the canvas (the user's delete did nothing).
 *
 * The spec then HOLDS THE BROWSER OPEN indefinitely so a human can inspect
 * the canvas and DevTools console. Stop it by killing the Playwright process.
 */

const STORY_REPRO = 'organisms-fullgraphrepro--recorder-concurrency-playground';

test('NS-01: deleting the inferred edge crashes the validator and the edge survives', async ({
  page,
}) => {
  // Keep-open demo — no per-test timeout.
  test.setTimeout(0);

  const uncaughtPageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    uncaughtPageErrors.push(error);

    console.log(`[pageerror] ${error.name}: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.log(`[console.error] ${message.text().slice(0, 300)}`);
    }
  });

  await navigateToStory(page, STORY_REPRO);

  // 1. Build the two-node graph through the real context menu.
  const bitInputId = await addNode(
    page,
    { x: 350, y: 300 },
    ['Add Node', 'I/O'],
    'Bit Input',
  );
  const inferSinkId = await addNode(
    page,
    { x: 800, y: 300 },
    ['Add Node', 'Inference'],
    'Infer Sink',
  );

  console.log(`[setup] bitInput=${bitInputId} inferSink=${inferSinkId}`);

  // 2. Connect concrete bit → infer input. Commit ⇒ frozen committed state.
  await dragBetweenLocators(
    page,
    getHandleByName(page, bitInputId, 'Out', 'source'),
    getHandleByName(page, inferSinkId, 'Inferred In', 'target'),
  );
  await expect(getAllEdges(page)).toHaveCount(1);

  console.log('[setup] edge committed — state is now frozen by immer');

  expect(
    uncaughtPageErrors.length,
    'no uncaught errors expected during setup',
  ).toBe(0);

  // 3. Select the edge and press Delete — the crash path.
  await selectEdgeBetween(page, bitInputId, inferSinkId);
  await pressDelete(page);

  // The TypeError must have escaped dispatch as an uncaught page error.
  await expect
    .poll(() => uncaughtPageErrors.length, {
      message:
        'expected the validator TypeError to escape dispatch as an uncaught page error',
      timeout: 5_000,
    })
    .toBeGreaterThan(0);

  const frozenMutationError = uncaughtPageErrors.find((error) =>
    /read only|not extensible|frozen/i.test(error.message),
  );
  expect(
    frozenMutationError,
    `expected a frozen-mutation TypeError, got: ${uncaughtPageErrors
      .map((error) => `${error.name}: ${error.message}`)
      .join(' | ')}`,
  ).toBeTruthy();

  // And the DELETION DID NOT APPLY — the edge is still there.
  await expect(getAllEdges(page)).toHaveCount(1);

  console.log('');

  console.log('════════ NS-01 CONFIRMED IN THE LIVE EDITOR ════════');

  console.log(
    `uncaught: ${frozenMutationError!.name}: ${frozenMutationError!.message}`,
  );

  console.log('edge count after Delete: 1 (deletion silently failed)');

  console.log('Browser stays OPEN for inspection — press Delete again');

  console.log('yourself with the edge selected to re-trigger the crash.');

  await page.screenshot({
    path: 'e2e/repro/artifacts/c1-after-delete-edge-survives.png',
    fullPage: true,
  });

  // Hold the browser open indefinitely for human inspection.
  await new Promise(() => {});
});
