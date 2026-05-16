import type { Page } from '@playwright/test';
import { addBitInput, addBitOutput, addNode } from './addNode';
import { createLoopStructure, type LoopStructure } from './createLoopStructure';
import { dragBetweenLocators } from '../actions/node/connection.actions';
import { getAllEdges } from '../locators/graph/graphCanvas.locators';
import type { Locator } from '@playwright/test';
import {
  getHandleByName,
  getInferInput,
  getInferOutput,
  getLoopStopCondition,
} from '../locators/node/node.locators';
import { MENU_PATH_UTILITY } from '../constants';

type Position = { x: number; y: number };

/**
 * Shared shape for every "two-loop" topology. `extras` holds non-triplet
 * nodes (BitIn, BitOut, body Buffers, interstitials, …). `allNodeIds` is
 * the union in creation order, handy for `ctrlSelectNodes([...allNodeIds])`.
 */
type SerialLoops = {
  a: LoopStructure;
  b: LoopStructure;
  bitInputId: string;
  bitOutputId: string;
  bodyAId: string;
  bodyBId: string;
  interstitialId: string;
  allNodeIds: string[];
};

type ParallelLoops = {
  a: LoopStructure;
  b: LoopStructure;
  bitInputId: string;
  bitOutputId: string;
  bodyAId: string;
  bodyBId: string;
  /** True iff `loopB.End.infer-out → BitOut.In` was accepted. False when
   *  `BitOut.In` refused the second incoming edge. Tests use this to pick
   *  correct expected edge counts without hardcoding library behavior. */
  bOutputConnected: boolean;
  allNodeIds: string[];
};

type NestedLoops = {
  outer: LoopStructure;
  inner: LoopStructure;
  bitInputId: string;
  bitOutputId: string;
  /** Outer body node between outer.S and inner.S (forward). */
  outerEntryBufferId: string;
  /** Outer body node between inner.E and outer.T (return). */
  outerReturnBufferId: string;
  /** Inner body node between inner.S and inner.T. */
  innerBufferId: string;
  allNodeIds: string[];
};

type NestedPostStopLoops = {
  outer: LoopStructure;
  inner: LoopStructure;
  bitInputId: string;
  bitOutputId: string;
  /** Outer post-stop buffer between outer.T.infer-out and inner.S.infer-in. */
  postStopEntryBufferId: string;
  /** Outer post-stop buffer between inner.E.infer-out and outer.E.infer-in. */
  postStopReturnBufferId: string;
  /** Inner body node between inner.S and inner.T. */
  innerBufferId: string;
  allNodeIds: string[];
};

/**
 * Two TOTALLY ISOLATED bound triplets — no shared nodes, no edges
 * between them, no body / IO. Used to test cross-loop validation rules
 * in their purest form (no other connections to confuse boundary
 * reachability).
 */
type DisconnectedPair = {
  a: LoopStructure;
  b: LoopStructure;
  allNodeIds: string[];
};

// ─────────────────────────────────────────────────────
// Shared wiring helper — outside → loopStart → Buf → loopStop(infer+cond)
// ─────────────────────────────────────────────────────
//
// Used as the canonical "body chain" that makes a loop a proper loop from
// the region-BFS perspective. `feedHandle` is the source handle to wire
// into `loop.S.infer-in`; `bodyBuf` is the body node; the body's output
// feeds both `loop.T.infer-in` AND `loop.T.condition`.

async function wireBody(
  page: Page,
  feedNodeId: string,
  feedHandleName: string,
  loop: LoopStructure,
  bodyBufId: string,
): Promise<void> {
  await dragWithRetry(
    page,
    getHandleByName(page, feedNodeId, feedHandleName, 'source'),
    getInferInput(page, loop.loopStartId, 'loopStart'),
  );
  await dragWithRetry(
    page,
    getInferOutput(page, loop.loopStartId, 'loopStart'),
    getHandleByName(page, bodyBufId, 'In', 'target'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, bodyBufId, 'Out', 'source'),
    getInferInput(page, loop.loopStopId, 'loopStop'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, bodyBufId, 'Out', 'source'),
    getLoopStopCondition(page, loop.loopStopId),
  );
}

async function addBufferAt(page: Page, position: Position): Promise<string> {
  return addNode(page, position, MENU_PATH_UTILITY, 'Buffer');
}

/**
 * Drag between two handle locators and retry if the total edge count
 * doesn't increase. ReactFlow occasionally drops the pointerup on the
 * first attempt under mid-test load (especially after a cascade of
 * handle-duplication re-renders triggered by infer propagation). The
 * retry is cheap and avoids building a graph that's structurally
 * incomplete by one edge.
 */
async function dragWithRetry(
  page: Page,
  source: Locator,
  target: Locator,
  opts: { retries?: number } = {},
): Promise<void> {
  const retries = opts.retries ?? 2;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const before = await getAllEdges(page).count();
    await dragBetweenLocators(page, source, target);
    const after = await getAllEdges(page).count();
    if (after > before) return;
  }
  // Last attempt failed — drag might have been rejected by the reducer
  // (which is a legitimate library verdict). Fall through; callers can
  // verify via `connectionExistsBetweenNodes` if the connection mattered.
}

// ─────────────────────────────────────────────────────
// Topology S — two fully-wired loops in series
//
//   BitIn → A.S → Buf-A → A.T    A.E → Buf1 → B.S → Buf-B → B.T    B.E → BitOut
//               (A body)            (interstitial)   (B body)
// ─────────────────────────────────────────────────────

async function buildSerialLoops(page: Page): Promise<SerialLoops> {
  const bitInputId = await addBitInput(page, { x: 60, y: 120 });
  const a = await createLoopStructure(page, { origin: { x: 260, y: 120 } });
  const bodyAId = await addBufferAt(page, { x: 400, y: 380 });
  const interstitialId = await addBufferAt(page, { x: 940, y: 120 });
  const b = await createLoopStructure(page, { origin: { x: 1100, y: 120 } });
  const bodyBId = await addBufferAt(page, { x: 1240, y: 380 });
  const bitOutputId = await addBitOutput(page, { x: 1820, y: 120 });

  // A's body chain (BitIn → A.S → Buf-A → A.T).
  await wireBody(page, bitInputId, 'Out', a, bodyAId);

  // Interstitial chain (A.E.infer-out → Buf1 → B.S.infer-in).
  await dragWithRetry(
    page,
    getInferOutput(page, a.loopEndId, 'loopEnd'),
    getHandleByName(page, interstitialId, 'In', 'target'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, interstitialId, 'Out', 'source'),
    getInferInput(page, b.loopStartId, 'loopStart'),
  );

  // B's body chain — feed is already landed on B.S.infer-in by the interstitial,
  // so we only need the internal Start → Buf-B → Stop part.
  await dragWithRetry(
    page,
    getInferOutput(page, b.loopStartId, 'loopStart'),
    getHandleByName(page, bodyBId, 'In', 'target'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, bodyBId, 'Out', 'source'),
    getInferInput(page, b.loopStopId, 'loopStop'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, bodyBId, 'Out', 'source'),
    getLoopStopCondition(page, b.loopStopId),
  );

  // B's downstream (B.E.infer-out → BitOut.In).
  await dragWithRetry(
    page,
    getInferOutput(page, b.loopEndId, 'loopEnd'),
    getHandleByName(page, bitOutputId, 'In', 'target'),
  );

  return {
    a,
    b,
    bitInputId,
    bitOutputId,
    bodyAId,
    bodyBId,
    interstitialId,
    allNodeIds: [
      bitInputId,
      ...a.allNodeIds,
      bodyAId,
      interstitialId,
      ...b.allNodeIds,
      bodyBId,
      bitOutputId,
    ],
  };
}

// ─────────────────────────────────────────────────────
// Topology P — two fully-wired loops in parallel
//
//             A.S → Buf-A → A.T           A.E ─┐
//    BitIn ──┤                                 ├──→ BitOut
//             B.S → Buf-B → B.T           B.E ─┘
//
// BitIn.Out fans out to BOTH loop start infers. Both loopEnds attempt to
// feed BitOut.In; the second attempt may be rejected if BitOut.In is
// maxConnections:1. `bOutputConnected` records the outcome so callers can
// pick correct expected edge counts.
// ─────────────────────────────────────────────────────

async function buildParallelLoops(page: Page): Promise<ParallelLoops> {
  // All Y ≤ 700 so no node lands under the runner panel's resizer overlay,
  // which occupies the bottom ~200 px of the 1920×1080 viewport and swallows
  // right-clicks meant for the canvas.
  const bitInputId = await addBitInput(page, { x: 60, y: 300 });
  const a = await createLoopStructure(page, { origin: { x: 380, y: 100 } });
  const bodyAId = await addBufferAt(page, { x: 520, y: 260 });
  const b = await createLoopStructure(page, { origin: { x: 380, y: 460 } });
  const bodyBId = await addBufferAt(page, { x: 520, y: 620 });
  const bitOutputId = await addBitOutput(page, { x: 1300, y: 300 });

  // A's body chain (BitIn → A.S → Buf-A → A.T).
  await wireBody(page, bitInputId, 'Out', a, bodyAId);

  // B's body chain — BitIn fans out: same source handle wires to B.S.infer-in
  // AND Buf-B becomes B's body.
  await wireBody(page, bitInputId, 'Out', b, bodyBId);

  // A.E → BitOut — should land (first connection on BitOut.In).
  await dragWithRetry(
    page,
    getInferOutput(page, a.loopEndId, 'loopEnd'),
    getHandleByName(page, bitOutputId, 'In', 'target'),
  );

  // B.E → BitOut — probe whether BitOut.In accepts a second incoming edge.
  const edgesBeforeBOutput = await page.locator('.react-flow__edge').count();
  await dragWithRetry(
    page,
    getInferOutput(page, b.loopEndId, 'loopEnd'),
    getHandleByName(page, bitOutputId, 'In', 'target'),
  );
  const edgesAfterBOutput = await page.locator('.react-flow__edge').count();
  const bOutputConnected = edgesAfterBOutput > edgesBeforeBOutput;

  return {
    a,
    b,
    bitInputId,
    bitOutputId,
    bodyAId,
    bodyBId,
    bOutputConnected,
    allNodeIds: [
      bitInputId,
      ...a.allNodeIds,
      bodyAId,
      ...b.allNodeIds,
      bodyBId,
      bitOutputId,
    ],
  };
}

// ─────────────────────────────────────────────────────
// Topology N — two fully-wired nested loops
//
//   BitIn → O.S → Buf-o1 → I.S → Buf-i → I.T    I.E → Buf-o2 → O.T    O.E → BitOut
//           (outer body enters inner)  (inner body)       (outer body returns)
//
// Two outer-body interstitial buffers: Buf-o1 links outer.S forward to
// inner.S, Buf-o2 links inner.E back to outer.T. Going via interstitials
// avoids the library's rejection of direct cross-loop infer handshakes
// (`loopEnd.infer-out → loopStart/loopStop.infer-in`).
// ─────────────────────────────────────────────────────

async function buildNestedLoops(page: Page): Promise<NestedLoops> {
  const bitInputId = await addBitInput(page, { x: 60, y: 120 });
  const outer = await createLoopStructure(page, {
    origin: { x: 260, y: 120 },
    columnSpacing: 520,
  });
  const outerEntryBufferId = await addBufferAt(page, { x: 420, y: 360 });
  const inner = await createLoopStructure(page, {
    origin: { x: 640, y: 360 },
  });
  const innerBufferId = await addBufferAt(page, { x: 780, y: 620 });
  const outerReturnBufferId = await addBufferAt(page, { x: 1180, y: 360 });
  const bitOutputId = await addBitOutput(page, { x: 1660, y: 120 });

  // BitIn → outer.S.infer-in.
  await dragWithRetry(
    page,
    getHandleByName(page, bitInputId, 'Out', 'source'),
    getInferInput(page, outer.loopStartId, 'loopStart'),
  );

  // Outer body forward chain: outer.S → Buf-o1 → inner.S.
  await dragWithRetry(
    page,
    getInferOutput(page, outer.loopStartId, 'loopStart'),
    getHandleByName(page, outerEntryBufferId, 'In', 'target'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, outerEntryBufferId, 'Out', 'source'),
    getInferInput(page, inner.loopStartId, 'loopStart'),
  );

  // Inner body chain: inner.S → Buf-i → inner.T (infer + condition).
  await dragWithRetry(
    page,
    getInferOutput(page, inner.loopStartId, 'loopStart'),
    getHandleByName(page, innerBufferId, 'In', 'target'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, innerBufferId, 'Out', 'source'),
    getInferInput(page, inner.loopStopId, 'loopStop'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, innerBufferId, 'Out', 'source'),
    getLoopStopCondition(page, inner.loopStopId),
  );

  // Outer body return chain: inner.E → Buf-o2 → outer.T (infer + condition).
  await dragWithRetry(
    page,
    getInferOutput(page, inner.loopEndId, 'loopEnd'),
    getHandleByName(page, outerReturnBufferId, 'In', 'target'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, outerReturnBufferId, 'Out', 'source'),
    getInferInput(page, outer.loopStopId, 'loopStop'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, outerReturnBufferId, 'Out', 'source'),
    getLoopStopCondition(page, outer.loopStopId),
  );

  // Outer downstream: outer.E → BitOut.In.
  await dragWithRetry(
    page,
    getInferOutput(page, outer.loopEndId, 'loopEnd'),
    getHandleByName(page, bitOutputId, 'In', 'target'),
  );

  return {
    outer,
    inner,
    bitInputId,
    bitOutputId,
    outerEntryBufferId,
    outerReturnBufferId,
    innerBufferId,
    allNodeIds: [
      bitInputId,
      ...outer.allNodeIds,
      outerEntryBufferId,
      ...inner.allNodeIds,
      innerBufferId,
      outerReturnBufferId,
      bitOutputId,
    ],
  };
}

// ─────────────────────────────────────────────────────
// Topology N-postStop — nested loops with inner in outer's POST-STOP region
//
//   BitIn → outer.S ─ outer.T → Buf-pe → inner.S → Buf-i → inner.T
//                                                  inner.E → Buf-pr → outer.E → BitOut
//
// Mirror of N (which puts inner in outer's body). Outer has NO body chain
// of its own — its bind triplet alone activates V9/V10. The cross-loop
// infer wires use the same interstitial-buffer workaround as N to avoid
// the library's silent rejection of direct loopX.infer-out → loopY.infer-in.
// Edge count is non-deterministic for the same reason as N.
// ─────────────────────────────────────────────────────

async function buildPostStopNestedLoops(
  page: Page,
): Promise<NestedPostStopLoops> {
  // Layout strategy: every node in its own (x-band × y-band) so bounding
  // boxes never overlap. Loop nodes can be ~180 px tall × ~180 px wide
  // and a "selected" overlay extends slightly beyond the body — Playwright
  // hit-tests refuse to click a node whose calculated center falls under
  // ANOTHER node's subtree, which manifests as clearAllNodes flake when
  // tests in the same describe.serial run back-to-back.
  //
  //   y= 120  BitIn ── outer.S ──────── outer.T ──────── outer.E ──── BitOut
  //   y= 320                            postStopEntryBuf  postStopReturnBuf
  //   y= 500  innerBuf  inner.S inner.T inner.E
  //
  // innerBuf sits on the FAR LEFT of the inner row so its right edge can't
  // intersect inner.S's bounding box. inner row is well below the postStop
  // buffer row to keep all 8 post-NPS.2 survivors clearly separated.
  const bitInputId = await addBitInput(page, { x: 60, y: 120 });
  const outer = await createLoopStructure(page, {
    origin: { x: 260, y: 120 },
    columnSpacing: 520,
  });
  const postStopEntryBufferId = await addBufferAt(page, { x: 780, y: 320 });
  const postStopReturnBufferId = await addBufferAt(page, { x: 1300, y: 320 });
  const innerBufferId = await addBufferAt(page, { x: 60, y: 500 });
  const inner = await createLoopStructure(page, {
    origin: { x: 880, y: 500 },
    columnSpacing: 200,
  });
  const bitOutputId = await addBitOutput(page, { x: 1660, y: 120 });

  // BitIn → outer.S.infer-in (drives uniform inference across outer S/T/E).
  await dragWithRetry(
    page,
    getHandleByName(page, bitInputId, 'Out', 'source'),
    getInferInput(page, outer.loopStartId, 'loopStart'),
  );

  // PostStop entry chain: outer.T.infer-out → Buf-pe → inner.S.infer-in.
  await dragWithRetry(
    page,
    getInferOutput(page, outer.loopStopId, 'loopStop'),
    getHandleByName(page, postStopEntryBufferId, 'In', 'target'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, postStopEntryBufferId, 'Out', 'source'),
    getInferInput(page, inner.loopStartId, 'loopStart'),
  );

  // Inner body chain: inner.S → Buf-i → inner.T (infer + condition).
  await dragWithRetry(
    page,
    getInferOutput(page, inner.loopStartId, 'loopStart'),
    getHandleByName(page, innerBufferId, 'In', 'target'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, innerBufferId, 'Out', 'source'),
    getInferInput(page, inner.loopStopId, 'loopStop'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, innerBufferId, 'Out', 'source'),
    getLoopStopCondition(page, inner.loopStopId),
  );

  // PostStop return chain: inner.E.infer-out → Buf-pr → outer.E.infer-in.
  await dragWithRetry(
    page,
    getInferOutput(page, inner.loopEndId, 'loopEnd'),
    getHandleByName(page, postStopReturnBufferId, 'In', 'target'),
  );
  await dragWithRetry(
    page,
    getHandleByName(page, postStopReturnBufferId, 'Out', 'source'),
    getInferInput(page, outer.loopEndId, 'loopEnd'),
  );

  // Outer downstream: outer.E → BitOut.In.
  await dragWithRetry(
    page,
    getInferOutput(page, outer.loopEndId, 'loopEnd'),
    getHandleByName(page, bitOutputId, 'In', 'target'),
  );

  return {
    outer,
    inner,
    bitInputId,
    bitOutputId,
    postStopEntryBufferId,
    postStopReturnBufferId,
    innerBufferId,
    allNodeIds: [
      bitInputId,
      ...outer.allNodeIds,
      postStopEntryBufferId,
      ...inner.allNodeIds,
      innerBufferId,
      postStopReturnBufferId,
      bitOutputId,
    ],
  };
}

// ─────────────────────────────────────────────────────
// Topology DISC — two totally isolated bound triplets
//
//   ┌───┐═══┌───┐═══┌───┐                    ┌───┐═══┌───┐═══┌───┐
//   │A.S│═══│A.T│═══│A.E│                    │B.S│═══│B.T│═══│B.E│
//   └───┘═══└───┘═══└───┘                    └───┘═══└───┘═══└───┘
//
// No body, no IO, no edges between the two loops. Used to probe
// cross-loop validation rules (V3/V4/V5) in their purest form.
// ─────────────────────────────────────────────────────

async function buildDisconnectedPair(page: Page): Promise<DisconnectedPair> {
  // Wide vertical separation so any rubber-band selection in tests can
  // pick exactly one triplet.
  const a = await createLoopStructure(page, { origin: { x: 240, y: 100 } });
  const b = await createLoopStructure(page, { origin: { x: 240, y: 460 } });
  return {
    a,
    b,
    allNodeIds: [...a.allNodeIds, ...b.allNodeIds],
  };
}

export {
  buildSerialLoops,
  buildParallelLoops,
  buildNestedLoops,
  buildPostStopNestedLoops,
  buildDisconnectedPair,
};
export type {
  SerialLoops,
  ParallelLoops,
  NestedLoops,
  NestedPostStopLoops,
  DisconnectedPair,
};
