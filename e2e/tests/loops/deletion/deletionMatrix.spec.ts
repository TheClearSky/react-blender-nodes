import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  getAllEdges,
  getAllNodes,
} from '../../../locators/graph/graphCanvas.locators';
import {
  selectOnly,
  ctrlSelectNodes,
  boxSelectNodes,
  pressDelete,
  deselect,
  clearAllNodes,
} from '../../../actions/graph/selection.actions';
import { expectNodeExists } from '../../../actions/node/node.actions';
import { createLoopStructure } from '../../../helpers/createLoopStructure';
import {
  attemptConnection,
  connectHandles,
} from '../../../actions/node/connection.actions';
import { HANDLE_BIND_LOOP_NODES, STORY_EMPTY_RUNNER } from '../../../constants';

/**
 * "V-layout" — loopStop sits far below the line between loopStart and loopEnd.
 * Lets us box-select ANY pair (including {start,end}) without the third node
 * accidentally falling inside the rubber-band rectangle.
 */
const V_LAYOUT = {
  start: { x: 100, y: 100 },
  stop: { x: 400, y: 600 },
  end: { x: 700, y: 100 },
} as const;

/**
 * Deletion + binding matrix. One `describe.serial` that shares a single
 * browser context + page across every test — Storybook + ReactFlow load
 * exactly once per file, and each scenario starts from a clean canvas via
 * `clearAllNodes` (ctrl-select everything + Delete) rather than re-navigating.
 *
 * Scenarios are grouped A–F matching the feature request's 1-through-20
 * numbering.
 */

type Triplet = {
  loopStartId: string;
  loopStopId: string;
  loopEndId: string;
};

async function deleteIndividuallyExpectAllRemoved(
  page: Page,
  triplet: Triplet,
): Promise<void> {
  for (const id of [
    triplet.loopStartId,
    triplet.loopStopId,
    triplet.loopEndId,
  ]) {
    await selectOnly(page, id);
    await pressDelete(page);
    await expectNodeExists(page, id, false);
  }
  expect(await getAllNodes(page).count()).toBe(0);
}

async function deleteIndividuallyExpectAllKept(
  page: Page,
  triplet: Triplet,
): Promise<void> {
  for (const id of [
    triplet.loopStartId,
    triplet.loopStopId,
    triplet.loopEndId,
  ]) {
    await selectOnly(page, id);
    await pressDelete(page);
    await expectNodeExists(page, id, true);
  }
}

test.describe.serial('Loop deletion matrix', () => {
  // One browser context + page for the whole file. Every test uses this
  // closure-scoped `page` (not Playwright's per-test `page` fixture), so the
  // story's JS bundle and ReactFlow tree are kept warm between scenarios.
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    page = await context.newPage();
    await navigateToStory(page, STORY_EMPTY_RUNNER);
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  // Reset the canvas between tests — much cheaper than a full reload since
  // the React tree stays mounted.
  test.beforeEach(async () => {
    await clearAllNodes(page);
    expect(await getAllNodes(page).count()).toBe(0);
    expect(await getAllEdges(page).count()).toBe(0);
  });

  // ───────────────────────────────────────────
  // A. Unbound triplet deletions (scenarios 1–2)
  // ───────────────────────────────────────────

  test('A1: unbound triplet — delete one by one → all three removed', async () => {
    const t = await createLoopStructure(page, {
      bindStartStop: false,
      bindStopEnd: false,
    });
    await deleteIndividuallyExpectAllRemoved(page, t);
  });

  test('A2a: unbound triplet — box-select all, delete → all removed', async () => {
    const t = await createLoopStructure(page, {
      bindStartStop: false,
      bindStopEnd: false,
    });
    await boxSelectNodes(page, [t.loopStartId, t.loopStopId, t.loopEndId]);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
  });

  test('A2b: unbound triplet — ctrl-select all, delete → all removed', async () => {
    const t = await createLoopStructure(page, {
      bindStartStop: false,
      bindStopEnd: false,
    });
    await ctrlSelectNodes(page, [t.loopStartId, t.loopStopId, t.loopEndId]);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
  });

  // ─────────────────────────────────────────────
  // B. Partial binding deletions (scenarios 3–5)
  //    An incomplete triplet is NOT recognised as a
  //    loop structure, so V9 does not apply.
  // ─────────────────────────────────────────────

  test('B1: bind start↔stop only — delete one by one → all three removed', async () => {
    const t = await createLoopStructure(page, {
      bindStartStop: true,
      bindStopEnd: false,
    });
    await deleteIndividuallyExpectAllRemoved(page, t);
  });

  test('B2: bind start↔stop only — box-select all, delete → all removed', async () => {
    const t = await createLoopStructure(page, {
      bindStartStop: true,
      bindStopEnd: false,
    });
    await boxSelectNodes(page, [t.loopStartId, t.loopStopId, t.loopEndId]);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
  });

  test('B3: bind stop↔end only — delete one by one → all three removed', async () => {
    const t = await createLoopStructure(page, {
      bindStartStop: false,
      bindStopEnd: true,
    });
    await deleteIndividuallyExpectAllRemoved(page, t);
  });

  test('B4: bind stop↔end only — ctrl-select all, delete → all removed', async () => {
    const t = await createLoopStructure(page, {
      bindStartStop: false,
      bindStopEnd: true,
    });
    await ctrlSelectNodes(page, [t.loopStartId, t.loopStopId, t.loopEndId]);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
  });

  // ───────────────────────────────────────
  // C. Illegal bind attempts (scenario 6)
  // ───────────────────────────────────────

  test('C1: loopStart.bind-out → loopEnd.bind-in (skip loopStop) is rejected', async () => {
    const t = await createLoopStructure(page, {
      bindStartStop: false,
      bindStopEnd: false,
    });
    const result = await attemptConnection(
      page,
      t.loopStartId,
      HANDLE_BIND_LOOP_NODES,
      t.loopEndId,
      HANDLE_BIND_LOOP_NODES,
    );
    expect(result.pairExists).toBe(false);
    expect(result.totalEdgesDelta).toBe(0);
  });

  // ──────────────────────────────────────────────
  // D. Fully-bound triplet delete matrix (7–11)
  //
  // All 9 reject combinations share ONE bound triplet — build it once,
  // deselect between cases, verify count stayed at 3. Separate tests for
  // the two "delete-all-three" cases that actually remove the triplet.
  // ──────────────────────────────────────────────

  test('D reject: bound triplet blocks every partial-delete attempt (V9)', async () => {
    const t = await createLoopStructure(page, { positions: V_LAYOUT });

    const rejectCases: Array<{ name: string; select: () => Promise<void> }> = [
      {
        name: 'click loopStart only',
        select: () => selectOnly(page, t.loopStartId),
      },
      {
        name: 'click loopStop only',
        select: () => selectOnly(page, t.loopStopId),
      },
      {
        name: 'click loopEnd only',
        select: () => selectOnly(page, t.loopEndId),
      },
      {
        name: 'box {start, stop}',
        select: () => boxSelectNodes(page, [t.loopStartId, t.loopStopId]),
      },
      {
        name: 'box {start, end}',
        select: () => boxSelectNodes(page, [t.loopStartId, t.loopEndId]),
      },
      {
        name: 'box {stop, end}',
        select: () => boxSelectNodes(page, [t.loopStopId, t.loopEndId]),
      },
      {
        name: 'ctrl {start, stop}',
        select: () => ctrlSelectNodes(page, [t.loopStartId, t.loopStopId]),
      },
      {
        name: 'ctrl {start, end}',
        select: () => ctrlSelectNodes(page, [t.loopStartId, t.loopEndId]),
      },
      {
        name: 'ctrl {stop, end}',
        select: () => ctrlSelectNodes(page, [t.loopStopId, t.loopEndId]),
      },
    ];

    for (const c of rejectCases) {
      await deselect(page);
      await c.select();
      await pressDelete(page);
      // Check all three are still present. The `.name` argument tags the
      // failing assertion with the specific case that didn't hold.
      expect(await getAllNodes(page).count(), c.name).toBe(3);
    }
  });

  test('D4: bound triplet — box-select all 3, delete → removed', async () => {
    const t = await createLoopStructure(page, { positions: V_LAYOUT });
    await boxSelectNodes(page, [t.loopStartId, t.loopStopId, t.loopEndId]);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
    expect(await getAllEdges(page).count()).toBe(0);
  });

  test('D5: bound triplet — ctrl-select all 3, delete → removed', async () => {
    const t = await createLoopStructure(page);
    await ctrlSelectNodes(page, [t.loopStartId, t.loopStopId, t.loopEndId]);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
    expect(await getAllEdges(page).count()).toBe(0);
  });

  // ─────────────────────────────────────────────────────
  // E. Bound triplet with body / postStop / outside nodes
  //    (scenarios 12–15, compressed: we keep the key
  //    assertions — partial delete rejected / full delete
  //    allowed — without re-running every inner variant)
  // ─────────────────────────────────────────────────────

  test('E1 body-connected: partial-delete rejected; selecting all triplet+body+outside deletes cleanly', async () => {
    const t = await createLoopStructure(page, {
      outside: 'connected',
      body: 'connected',
    });
    await deleteIndividuallyExpectAllKept(page, t);
    // Full delete of triplet + body + outside.
    await ctrlSelectNodes(page, t.allNodeIds);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
  });

  test('E2 postStop-connected: partial-delete rejected; selecting all deletes cleanly', async () => {
    const t = await createLoopStructure(page, {
      postStop: 'connected',
    });
    await deleteIndividuallyExpectAllKept(page, t);
    await ctrlSelectNodes(page, t.allNodeIds);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
  });

  test('E3 both regions + outside connected: partial-delete rejected; selecting all deletes cleanly', async () => {
    const t = await createLoopStructure(page, {
      outside: 'connected',
      body: 'connected',
      postStop: 'connected',
    });
    await deleteIndividuallyExpectAllKept(page, t);
    await ctrlSelectNodes(page, t.allNodeIds);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
  });

  // ────────────────────────────────────────────────────
  // F. Multi-loop partial deletion (scenarios 17–20)
  //    Two independent bound triplets; verify each
  //    triplet still requires its OWN members to be
  //    deleted together. All reject cases share one
  //    pair of triplets.
  // ────────────────────────────────────────────────────

  test('F reject: two bound triplets block every partial-delete attempt (same-loop + cross-loop)', async () => {
    const a = await createLoopStructure(page, {
      origin: { x: 80, y: 120 },
    });
    const b = await createLoopStructure(page, {
      origin: { x: 80, y: 520 },
    });

    const rejectCases: Array<{ name: string; select: () => Promise<void> }> = [
      // Same-loop partials (one loop, some but not all members).
      {
        name: 'A partial: ctrl {A.start, A.stop}',
        select: () => ctrlSelectNodes(page, [a.loopStartId, a.loopStopId]),
      },
      {
        name: 'B partial: ctrl {B.start, B.end}',
        select: () => ctrlSelectNodes(page, [b.loopStartId, b.loopEndId]),
      },
      // Cross-loop partials (one node from each).
      {
        name: 'cross: ctrl {A.start, B.start}',
        select: () => ctrlSelectNodes(page, [a.loopStartId, b.loopStartId]),
      },
      {
        name: 'cross: ctrl {A.start, B.stop}',
        select: () => ctrlSelectNodes(page, [a.loopStartId, b.loopStopId]),
      },
      {
        name: 'cross: ctrl {A.end, B.start}',
        select: () => ctrlSelectNodes(page, [a.loopEndId, b.loopStartId]),
      },
      // Cross-loop "full-of-A + partial-of-B" — still rejected because B is partial.
      {
        name: 'cross: ctrl full A + B.start',
        select: () =>
          ctrlSelectNodes(page, [
            a.loopStartId,
            a.loopStopId,
            a.loopEndId,
            b.loopStartId,
          ]),
      },
    ];

    for (const c of rejectCases) {
      await deselect(page);
      await c.select();
      await pressDelete(page);
      expect(await getAllNodes(page).count(), c.name).toBe(6);
    }
  });

  test('F2 two bound triplets: full delete of structure A only → 3 nodes remain (structure B intact)', async () => {
    const a = await createLoopStructure(page, {
      origin: { x: 80, y: 120 },
    });
    const b = await createLoopStructure(page, {
      origin: { x: 80, y: 520 },
    });
    await boxSelectNodes(page, [a.loopStartId, a.loopStopId, a.loopEndId]);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(3);
    // Structure B's nodes are still there.
    await expectNodeExists(page, b.loopStartId, true);
    await expectNodeExists(page, b.loopStopId, true);
    await expectNodeExists(page, b.loopEndId, true);
  });

  test('F4 two bound triplets: ctrl-select all 6, delete → all removed', async () => {
    const a = await createLoopStructure(page, {
      origin: { x: 80, y: 120 },
    });
    const b = await createLoopStructure(page, {
      origin: { x: 80, y: 520 },
    });
    await ctrlSelectNodes(page, [
      a.loopStartId,
      a.loopStopId,
      a.loopEndId,
      b.loopStartId,
      b.loopStopId,
      b.loopEndId,
    ]);
    await pressDelete(page);
    expect(await getAllNodes(page).count()).toBe(0);
  });

  // ───────────────────────────────────────────────────────────
  // G. Lingering bind-edge V10 rule — delete just the bind edge
  // ───────────────────────────────────────────────────────────

  test('G1: bound triplet — clicking a bind edge and pressing Delete leaves both edges intact (V10)', async () => {
    const t = await createLoopStructure(page);
    // Click the first edge's interaction path.
    const edge = getAllEdges(page).nth(0);
    await edge.click({ force: true });
    await pressDelete(page);
    expect(await getAllEdges(page).count()).toBe(2);
    await expectNodeExists(page, t.loopStartId, true);
  });

  // ───────────────────────────────────────────────
  // Sanity / regression checks for the infrastructure
  // ───────────────────────────────────────────────

  test('H1: createLoopStructure with bindStartStop only connects exactly the first bind edge', async () => {
    await createLoopStructure(page, {
      bindStartStop: true,
      bindStopEnd: false,
    });
    expect(await getAllEdges(page).count()).toBe(1);

    // Post-check: ensure attempting the OTHER bind still works (stop→end
    // between the existing partial triplet).
    const ids = await getAllNodes(page).all();
    const stopId = await ids[1].getAttribute('data-id');
    const endId = await ids[2].getAttribute('data-id');
    if (!stopId || !endId) throw new Error('Node ids missing');
    await connectHandles(
      page,
      stopId,
      HANDLE_BIND_LOOP_NODES,
      endId,
      HANDLE_BIND_LOOP_NODES,
    );
    expect(await getAllEdges(page).count()).toBe(2);
  });
});
