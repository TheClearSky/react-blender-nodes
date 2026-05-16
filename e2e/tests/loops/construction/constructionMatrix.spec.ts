import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  getAllEdges,
  getAllNodes,
} from '../../../locators/graph/graphCanvas.locators';
import {
  attemptConnection,
  connectionExistsBetweenNodes,
} from '../../../actions/node/connection.actions';
import {
  captureFixture,
  loadFixture,
  type Fixture,
} from '../../../actions/importExport/importExport.actions';
import {
  runAllowCases,
  expectConnectionLanded,
  expectConnectionRejected,
  attemptInferToInfer,
  attemptInferToNamed,
  attemptNamedToInfer,
  type AllowCase,
} from '../../../actions/connection/connection.actions';
import {
  addLoopTriplet,
  buildMinimalLoop,
  type LoopTriplet,
} from '../../../helpers/buildLoop';
import { buildRunnableBitLoop } from '../../../helpers/buildRunnableLoop';
import {
  buildDisconnectedPair,
  buildSerialLoops,
  buildParallelLoops,
  buildNestedLoops,
  buildPostStopNestedLoops,
} from '../../../helpers/buildMultiLoop';
import {
  addBitInput,
  addCounter,
  addLoopStart,
  addLoopStop,
  addNode,
} from '../../../helpers/addNode';
import {
  HANDLE_BIND_LOOP_NODES,
  MENU_PATH_UTILITY,
  STORY_EMPTY_RUNNER,
} from '../../../constants';

/**
 * Construction matrix — every "edge can / cannot land" case across every
 * topology shape the suite supports. Mirrors the deletion matrix's
 * fixture-based pattern: each topology is built ONCE in `beforeAll` via
 * the slow context-menu-and-drag UI flow, exported to JSON, and
 * imported per test in sub-second time.
 *
 * See CONSTRUCTION_MATRIX.md for the full per-group rationale and rule
 * citations.
 */

// Adapter — extends a builder's return type with `allNodeIds` for
// `captureFixture`'s constraint. The bare/bound triplet builders pre-date
// the fixture pattern so their return types don't carry `allNodeIds`.
type WithAllNodeIds<T> = T & { allNodeIds: string[] };

async function buildBareTripletWithIds(
  page: Page,
): Promise<WithAllNodeIds<LoopTriplet>> {
  const t = await addLoopTriplet(page);
  return { ...t, allNodeIds: [t.loopStartId, t.loopStopId, t.loopEndId] };
}

async function buildBoundTripletWithIds(
  page: Page,
): Promise<WithAllNodeIds<LoopTriplet>> {
  const t = await buildMinimalLoop(page);
  return { ...t, allNodeIds: [t.loopStartId, t.loopStopId, t.loopEndId] };
}

async function buildRunnableBitLoopWithIds(page: Page) {
  const loop = await buildRunnableBitLoop(page);
  return {
    ...loop,
    allNodeIds: [
      loop.bitInputId,
      loop.loopStartId,
      loop.bufferId,
      loop.loopStopId,
      loop.loopEndId,
      loop.bitOutputId,
    ],
  };
}

test.describe.serial('Construction matrix', () => {
  test.setTimeout(60_000);

  let page: Page;

  // ─── Fixtures (built once in beforeAll, imported per test) ─────────
  let bareTripletFixture: Fixture<WithAllNodeIds<LoopTriplet>>;
  let boundTripletFixture: Fixture<WithAllNodeIds<LoopTriplet>>;
  let runnableBitLoopFixture: Fixture<
    Awaited<ReturnType<typeof buildRunnableBitLoopWithIds>>
  >;
  let disconnectedPairFixture: Fixture<
    Awaited<ReturnType<typeof buildDisconnectedPair>>
  >;
  let serialFixture: Fixture<Awaited<ReturnType<typeof buildSerialLoops>>>;
  let parallelFixture: Fixture<Awaited<ReturnType<typeof buildParallelLoops>>>;
  let nestedFixture: Fixture<Awaited<ReturnType<typeof buildNestedLoops>>>;
  let postStopFixture: Fixture<
    Awaited<ReturnType<typeof buildPostStopNestedLoops>>
  >;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    page = await context.newPage();
    await navigateToStory(page, STORY_EMPTY_RUNNER);

    // Long budget for the build phase — 8 builds at ~10–15 s each.
    test.setTimeout(300_000);
    bareTripletFixture = await captureFixture(page, buildBareTripletWithIds);
    boundTripletFixture = await captureFixture(page, buildBoundTripletWithIds);
    runnableBitLoopFixture = await captureFixture(
      page,
      buildRunnableBitLoopWithIds,
    );
    disconnectedPairFixture = await captureFixture(page, buildDisconnectedPair);
    serialFixture = await captureFixture(page, buildSerialLoops);
    parallelFixture = await captureFixture(page, buildParallelLoops);
    nestedFixture = await captureFixture(page, buildNestedLoops);
    postStopFixture = await captureFixture(page, buildPostStopNestedLoops);
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  // ───────────────────────────────────────────────────────────────────
  // Group BARE — bare triplet, no binds yet
  // ───────────────────────────────────────────────────────────────────

  test('BARE allow: bind sequence S→T then T→E', async () => {
    const t = await loadFixture(page, bareTripletFixture);
    expectConnectionLanded(
      await attemptConnection(
        page,
        t.loopStartId,
        HANDLE_BIND_LOOP_NODES,
        t.loopStopId,
        HANDLE_BIND_LOOP_NODES,
      ),
      'S→T',
    );
    expectConnectionLanded(
      await attemptConnection(
        page,
        t.loopStopId,
        HANDLE_BIND_LOOP_NODES,
        t.loopEndId,
        HANDLE_BIND_LOOP_NODES,
      ),
      'T→E',
    );
    expect(await getAllEdges(page).count()).toBe(2);
  });

  test('BARE reject: V1 / MC bind violations on a bare triplet', async () => {
    const allowedFirstBind: AllowCase<WithAllNodeIds<LoopTriplet>>[] = [];
    void allowedFirstBind; // silence unused warning if scope shifts

    // Each case re-imports the fixture, so the canvas always starts as
    // a bare 3-node triplet with zero edges.
    const cases: AllowCase<WithAllNodeIds<LoopTriplet>>[] = [
      {
        name: 'BARE.R1 skip stop: S → E direct',
        run: async (p, t) => {
          expectConnectionRejected(
            await attemptConnection(
              p,
              t.loopStartId,
              HANDLE_BIND_LOOP_NODES,
              t.loopEndId,
              HANDLE_BIND_LOOP_NODES,
            ),
          );
        },
      },
      {
        name: 'BARE.R3 self-bind: T.bind-out → T.bind-in',
        run: async (p, t) => {
          expectConnectionRejected(
            await attemptConnection(
              p,
              t.loopStopId,
              HANDLE_BIND_LOOP_NODES,
              t.loopStopId,
              HANDLE_BIND_LOOP_NODES,
            ),
          );
        },
      },
      {
        name: 'BARE.R5 MC: two starts → one stop',
        run: async (p, t) => {
          // First bind S→T, then add S₂ and try S₂→T.
          await attemptConnection(
            p,
            t.loopStartId,
            HANDLE_BIND_LOOP_NODES,
            t.loopStopId,
            HANDLE_BIND_LOOP_NODES,
          );
          const s2 = await addLoopStart(p, { x: 100, y: 500 });
          expectConnectionRejected(
            await attemptConnection(
              p,
              s2,
              HANDLE_BIND_LOOP_NODES,
              t.loopStopId,
              HANDLE_BIND_LOOP_NODES,
            ),
          );
        },
      },
      {
        name: 'BARE.R6 MC: one start → two stops',
        run: async (p, t) => {
          await attemptConnection(
            p,
            t.loopStartId,
            HANDLE_BIND_LOOP_NODES,
            t.loopStopId,
            HANDLE_BIND_LOOP_NODES,
          );
          const t2 = await addLoopStop(p, { x: 700, y: 500 });
          expectConnectionRejected(
            await attemptConnection(
              p,
              t.loopStartId,
              HANDLE_BIND_LOOP_NODES,
              t2,
              HANDLE_BIND_LOOP_NODES,
            ),
          );
        },
      },
      {
        name: 'BARE.R7 V1: non-loop output → bind input',
        run: async (p, t) => {
          const buf = await addNode(
            p,
            { x: 100, y: 500 },
            MENU_PATH_UTILITY,
            'Buffer',
          );
          expectConnectionRejected(
            await attemptConnection(
              p,
              buf,
              'Out',
              t.loopStopId,
              HANDLE_BIND_LOOP_NODES,
            ),
          );
        },
      },
    ];

    await runAllowCases(page, bareTripletFixture, cases);
  });

  // ───────────────────────────────────────────────────────────────────
  // Group BOUND — bound triplet, no body, no IO
  // ───────────────────────────────────────────────────────────────────

  test('BOUND allow: extend bound triplet (body, postStop, outside)', async () => {
    const cases: AllowCase<WithAllNodeIds<LoopTriplet>>[] = [
      {
        name: 'BOUND.A1 first body buffer wired in',
        run: async (p, t) => {
          const buf = await addNode(
            p,
            { x: 450, y: 500 },
            MENU_PATH_UTILITY,
            'Buffer',
          );
          // S.infer-out → Buf.In ; Buf.Out → T.infer-in
          expectConnectionLanded(
            await attemptInferToNamed(p, t.loopStartId, 'loopStart', buf, 'In'),
            'S.infer-out → Buf.In',
          );
          expectConnectionLanded(
            await attemptNamedToInfer(p, buf, 'Out', t.loopStopId, 'loopStop'),
            'Buf.Out → T.infer-in',
          );
        },
      },
      {
        name: 'BOUND.A4 outside-in source: BitIn → S',
        run: async (p, t) => {
          const bitIn = await addBitInput(p, { x: 50, y: 300 });
          expectConnectionLanded(
            await attemptNamedToInfer(
              p,
              bitIn,
              'Out',
              t.loopStartId,
              'loopStart',
            ),
          );
        },
      },
      {
        name: 'BOUND.A6 isolated buffer (just node-add)',
        run: async (p) => {
          const before = await getAllNodes(p).count();
          await addNode(p, { x: 100, y: 500 }, MENU_PATH_UTILITY, 'Buffer');
          expect(await getAllNodes(p).count()).toBe(before + 1);
        },
      },
    ];
    await runAllowCases(page, boundTripletFixture, cases);
  });

  test('BOUND reject: V8 type conflict via Counter (number) on an inferred-bit triplet', async () => {
    const t = await loadFixture(page, boundTripletFixture);
    // Drive S with bit first.
    const bitIn = await addBitInput(page, { x: 50, y: 300 });
    expectConnectionLanded(
      await attemptNamedToInfer(page, bitIn, 'Out', t.loopStartId, 'loopStart'),
    );
    // Now try to drive T with number — must reject (uniform inference).
    const counter = await addCounter(page, { x: 450, y: 600 });
    expectConnectionRejected(
      await attemptNamedToInfer(
        page,
        counter,
        'Count + 1',
        t.loopStopId,
        'loopStop',
      ),
    );
  });

  // ───────────────────────────────────────────────────────────────────
  // Group RUN — runnable bit loop (full IO + body)
  // ───────────────────────────────────────────────────────────────────

  test('RUN reject: V3 body buffer → BitOut (body↔outside-reachable)', async () => {
    const loop = await loadFixture(page, runnableBitLoopFixture);
    expectConnectionRejected(
      await attemptConnection(
        page,
        loop.bufferId,
        'Out',
        loop.bitOutputId,
        'In',
      ),
    );
    // Sanity: the legitimate loopEnd → BitOut edge survives.
    expect(
      await connectionExistsBetweenNodes(
        page,
        loop.loopEndId,
        loop.bitOutputId,
      ),
    ).toBe(true);
  });

  test('RUN reject: V3 chain — BitIn → externalBuf → bodyBuf', async () => {
    const loop = await loadFixture(page, runnableBitLoopFixture);
    const extBuf = await addNode(
      page,
      { x: 50, y: 500 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    expectConnectionLanded(
      await attemptConnection(page, loop.bitInputId, 'Out', extBuf, 'In'),
      'BitIn → extBuf (allow — extBuf is reachable to loopStart via BitIn)',
    );
    // Now extBuf is reachable to the loop boundary; pushing into bodyBuf is V3.
    expectConnectionRejected(
      await attemptConnection(page, extBuf, 'Out', loop.bufferId, 'In'),
    );
  });

  test('RUN reject: V4 body → postStop direct (cross-region same loop)', async () => {
    const loop = await loadFixture(page, runnableBitLoopFixture);
    // Add a postStop buffer, wire it.
    const postBuf = await addNode(
      page,
      { x: 800, y: 500 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    expectConnectionLanded(
      await attemptInferToNamed(
        page,
        loop.loopStopId,
        'loopStop',
        postBuf,
        'In',
      ),
      'T.infer-out → postBuf.In',
    );
    expectConnectionLanded(
      await attemptNamedToInfer(
        page,
        postBuf,
        'Out',
        loop.loopEndId,
        'loopEnd',
      ),
      'postBuf.Out → E.infer-in',
    );
    // Now bodyBuf (in body region) and postBuf (in postStop region) live
    // in the SAME loop but DIFFERENT regions. Direct connection rejected.
    expectConnectionRejected(
      await attemptConnection(page, loop.bufferId, 'Out', postBuf, 'In'),
      'body→postStop',
    );
    expectConnectionRejected(
      await attemptConnection(page, postBuf, 'Out', loop.bufferId, 'In'),
      'postStop→body (reverse)',
    );
  });

  test('RUN reject: V8 conflicting type via Counter onto already-inferred-bit S', async () => {
    const loop = await loadFixture(page, runnableBitLoopFixture);
    const counter = await addCounter(page, { x: 50, y: 600 });
    expectConnectionRejected(
      await attemptNamedToInfer(
        page,
        counter,
        'Count + 1',
        loop.loopStartId,
        'loopStart',
      ),
    );
  });

  // ───────────────────────────────────────────────────────────────────
  // Group DISC — two DISCONNECTED bound triplets
  // ───────────────────────────────────────────────────────────────────

  test('DISC allow: two isolated buffers connect (outermost-level)', async () => {
    await loadFixture(page, disconnectedPairFixture);
    const bufA = await addNode(
      page,
      { x: 50, y: 300 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    const bufB = await addNode(
      page,
      { x: 1100, y: 300 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    expectConnectionLanded(
      await attemptConnection(page, bufA, 'Out', bufB, 'In'),
    );
  });

  test('DISC allow: outside fan-out from one source to two destinations', async () => {
    await loadFixture(page, disconnectedPairFixture);
    const bufA = await addNode(
      page,
      { x: 50, y: 300 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    const bufB = await addNode(
      page,
      { x: 1100, y: 250 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    const bufC = await addNode(
      page,
      { x: 1100, y: 380 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    expectConnectionLanded(
      await attemptConnection(page, bufA, 'Out', bufB, 'In'),
      'fan-out 1',
    );
    expectConnectionLanded(
      await attemptConnection(page, bufA, 'Out', bufC, 'In'),
      'fan-out 2',
    );
  });

  test('DISC reject: V3/V4 body₁ → body₂ across disconnected loops (boundary mismatch)', async () => {
    const g = await loadFixture(page, disconnectedPairFixture);
    // Wire body of loop A.
    const bodyA = await addNode(
      page,
      { x: 50, y: 250 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    expectConnectionLanded(
      await attemptInferToNamed(
        page,
        g.a.loopStartId,
        'loopStart',
        bodyA,
        'In',
      ),
      'A.S → bodyA',
    );
    expectConnectionLanded(
      await attemptNamedToInfer(page, bodyA, 'Out', g.a.loopStopId, 'loopStop'),
      'bodyA → A.T',
    );
    // Wire body of loop B.
    const bodyB = await addNode(
      page,
      { x: 50, y: 600 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    expectConnectionLanded(
      await attemptInferToNamed(
        page,
        g.b.loopStartId,
        'loopStart',
        bodyB,
        'In',
      ),
      'B.S → bodyB',
    );
    expectConnectionLanded(
      await attemptNamedToInfer(page, bodyB, 'Out', g.b.loopStopId, 'loopStop'),
      'bodyB → B.T',
    );
    // Now bodyA and bodyB are inside their respective loops with
    // different boundary sets. Connection rejected (V3/V4 message).
    expectConnectionRejected(
      await attemptConnection(page, bodyA, 'Out', bodyB, 'In'),
      'body₁ → body₂',
    );
    // Reverse direction is also rejected (boundary mismatch is symmetric).
    expectConnectionRejected(
      await attemptConnection(page, bodyB, 'Out', bodyA, 'In'),
      'body₂ → body₁ (reverse)',
    );
  });

  test('DISC reject: V3/V4 body₁ → postStop₂ (cross-loop different regions)', async () => {
    const g = await loadFixture(page, disconnectedPairFixture);
    // Wire body of loop A.
    const bodyA = await addNode(
      page,
      { x: 50, y: 250 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    await attemptInferToNamed(page, g.a.loopStartId, 'loopStart', bodyA, 'In');
    await attemptNamedToInfer(page, bodyA, 'Out', g.a.loopStopId, 'loopStop');
    // Wire postStop of loop B.
    const postB = await addNode(
      page,
      { x: 50, y: 700 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    expectConnectionLanded(
      await attemptInferToNamed(page, g.b.loopStopId, 'loopStop', postB, 'In'),
      'B.T → postB',
    );
    expectConnectionLanded(
      await attemptNamedToInfer(page, postB, 'Out', g.b.loopEndId, 'loopEnd'),
      'postB → B.E',
    );
    expectConnectionRejected(
      await attemptConnection(page, bodyA, 'Out', postB, 'In'),
      'bodyA → postB',
    );
  });

  test('DISC reject: V3/V4 postStop₁ → postStop₂ (cross-loop)', async () => {
    const g = await loadFixture(page, disconnectedPairFixture);
    const postA = await addNode(
      page,
      { x: 50, y: 250 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    await attemptInferToNamed(page, g.a.loopStopId, 'loopStop', postA, 'In');
    await attemptNamedToInfer(page, postA, 'Out', g.a.loopEndId, 'loopEnd');
    const postB = await addNode(
      page,
      { x: 50, y: 700 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    await attemptInferToNamed(page, g.b.loopStopId, 'loopStop', postB, 'In');
    await attemptNamedToInfer(page, postB, 'Out', g.b.loopEndId, 'loopEnd');
    expectConnectionRejected(
      await attemptConnection(page, postA, 'Out', postB, 'In'),
    );
  });

  test('DISC allow: V3 first-contact loophole — body₁ → ISOLATED outside buffer', async () => {
    const g = await loadFixture(page, disconnectedPairFixture);
    // Wire body of loop A.
    const bodyA = await addNode(
      page,
      { x: 50, y: 250 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    await attemptInferToNamed(page, g.a.loopStartId, 'loopStart', bodyA, 'In');
    await attemptNamedToInfer(page, bodyA, 'Out', g.a.loopStopId, 'loopStop');
    // Add an ISOLATED buffer (no connections — boundary set = ∅).
    const isolated = await addNode(
      page,
      { x: 1200, y: 250 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    // First-contact loophole: bodyA → isolated SHOULD land because
    // `verifyParentLoopRegionsAreValid` short-circuits when either side
    // is in an isolated island (loopValidation.ts:316-329).
    expectConnectionLanded(
      await attemptConnection(page, bodyA, 'Out', isolated, 'In'),
      'first-contact loophole landing',
    );
  });

  // ───────────────────────────────────────────────────────────────────
  // Group SER — Serial loops (existing complex topology)
  // ───────────────────────────────────────────────────────────────────

  test('SER allow: direct cross-loop infer A.E → B.S (loopEnd→loopStart is the allowed serial pattern)', async () => {
    // The fixture's existing wiring routes A.E.infer-out via Buf1 → B.S
    // for inference cleanliness, but `loopEnd → loopStart` direct is
    // ALLOWED by the validator (see `isSourceLoopEndConnectedToTargetLoopStart`
    // branch in loopValidation.ts:611). A.E.infer-out has unlimited
    // maxConnections so it can fan out to B.S in addition.
    const g = await loadFixture(page, serialFixture);
    expectConnectionLanded(
      await attemptInferToInfer(
        page,
        g.a.loopEndId,
        'loopEnd',
        g.b.loopStartId,
        'loopStart',
      ),
    );
  });

  test('SER reject: V3/V4 A body → B body across serial loops', async () => {
    const g = await loadFixture(page, serialFixture);
    expectConnectionRejected(
      await attemptConnection(page, g.bodyAId, 'Out', g.bodyBId, 'In'),
    );
  });

  test('SER reject: V3 A body → BitOut (downstream sink)', async () => {
    const g = await loadFixture(page, serialFixture);
    expectConnectionRejected(
      await attemptConnection(page, g.bodyAId, 'Out', g.bitOutputId, 'In'),
    );
  });

  // ───────────────────────────────────────────────────────────────────
  // Group PAR — Parallel loops
  // ───────────────────────────────────────────────────────────────────

  test('PAR reject: V3/V4 A body → B body across parallel loops', async () => {
    const g = await loadFixture(page, parallelFixture);
    expectConnectionRejected(
      await attemptConnection(page, g.bodyAId, 'Out', g.bodyBId, 'In'),
    );
  });

  test('PAR reject: V3 A body → BitOut', async () => {
    const g = await loadFixture(page, parallelFixture);
    expectConnectionRejected(
      await attemptConnection(page, g.bodyAId, 'Out', g.bitOutputId, 'In'),
    );
  });

  // ───────────────────────────────────────────────────────────────────
  // Group NB — Nested loops, body-region inner
  // ───────────────────────────────────────────────────────────────────

  test('NB reject: V3/V4 outer.entryBuf → inner.bodyBuf (cross-loop body)', async () => {
    const g = await loadFixture(page, nestedFixture);
    expectConnectionRejected(
      await attemptConnection(
        page,
        g.outerEntryBufferId,
        'Out',
        g.innerBufferId,
        'In',
      ),
    );
  });

  test('NB reject: V3 inner.bodyBuf → BitOut', async () => {
    const g = await loadFixture(page, nestedFixture);
    expectConnectionRejected(
      await attemptConnection(
        page,
        g.innerBufferId,
        'Out',
        g.bitOutputId,
        'In',
      ),
    );
  });

  test('NB reject: direct cross-loop outer.E → inner.S (rejected in NESTED context)', async () => {
    // Contrast with SER above: when the two loops are independent,
    // `loopEnd→loopStart` direct connects (it's the allowed serial
    // pattern). When inner sits INSIDE outer.body, the same drag is
    // rejected — the nested boundary configuration causes the
    // `verifyParentLoopRegionsAreValid` region check (loopValidation.ts:616)
    // to fail. This is why `buildNestedLoops` routes via interstitial
    // buffers in both directions.
    const g = await loadFixture(page, nestedFixture);
    expectConnectionRejected(
      await attemptInferToInfer(
        page,
        g.outer.loopEndId,
        'loopEnd',
        g.inner.loopStartId,
        'loopStart',
      ),
    );
  });

  // ───────────────────────────────────────────────────────────────────
  // Group NPS — Nested loops, postStop-region inner
  // ───────────────────────────────────────────────────────────────────

  test('NPS reject: V3 inner.bodyBuf → BitOut (inner is in outer.postStop; BitOut is outside-reachable)', async () => {
    const g = await loadFixture(page, postStopFixture);
    expectConnectionRejected(
      await attemptConnection(
        page,
        g.innerBufferId,
        'Out',
        g.bitOutputId,
        'In',
      ),
    );
  });

  test('NPS reject: QK direct cross-loop outer.T → inner.E', async () => {
    const g = await loadFixture(page, postStopFixture);
    expectConnectionRejected(
      await attemptInferToInfer(
        page,
        g.outer.loopStopId,
        'loopStop',
        g.inner.loopEndId,
        'loopEnd',
      ),
    );
  });
});
