import type { Page, Locator } from '@playwright/test';
import { getHandleByName } from '../../locators/node/node.locators';
import {
  getAllEdges,
  getEdgesBetweenNodes,
} from '../../locators/graph/graphCanvas.locators';
import { readAllToasts, type ToastSnapshot } from '../toast/toast.actions';
import { getAllToasts } from '../../locators/toast/toast.locators';

/** Center point of a Locator's bounding box. */
async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box (not visible?)');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Drag from one page coordinate to another. Designed for ReactFlow's
 * connection drag handlers.
 *
 * The "small first move" before the trip to the target is empirically
 * required: pointerdown alone does NOT trigger ReactFlow's connecting
 * state — only the FIRST pointermove inside the connection radius
 * mounts the connectionline SVG. See
 * `e2e/tests/loops/probe/domContract.spec.ts` for the live verification.
 *
 * No event-based retry here — the caller (`attemptConnection`) handles
 * outcome detection via DOM (edge count + toast diff), which is a
 * stronger signal than waiting for `ui:drag:ended` (which doesn't fire
 * when the source handle is already saturated).
 */
async function dragFromTo(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Small nudge in the direction of the target to engage ReactFlow's
  // connection-tracking. pointerdown alone is insufficient.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  await page.mouse.move(from.x + (dx / len) * 5, from.y + (dy / len) * 5);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  await page.mouse.move(midX, midY, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

/**
 * Drag between two handle locators. Just performs the drag; the caller is
 * responsible for asserting outcome (preferred: `attemptConnection`).
 *
 * Includes a single re-attempt when the first drag produced no observable
 * effect (no edge change, no toast). This guards the silent-failure case
 * under workers contention where `mouse.down` arrives before React's
 * connecting-state commit lands. Legitimate silent rejects (saturated
 * source) do produce no effect either, but a single retry costs <100 ms
 * and won't push the result either way — the caller's verdict is
 * computed from the post-retry DOM.
 */
async function dragBetweenLocators(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  await source.waitFor({ state: 'visible' });
  await target.waitFor({ state: 'visible' });
  const from = await centerOf(source);
  const to = await centerOf(target);

  const beforeEdges = await getAllEdges(page).count();
  const beforeToasts = await getAllToasts(page).count();
  await dragFromTo(page, from, to);
  // Brief settle so the next caller's edge-count read isn't racing the
  // ReactFlow → React commit pipeline. 60 ms covers ~3-4 frames.
  await page.waitForTimeout(60);
  const afterEdges = await getAllEdges(page).count();
  const afterToasts = await getAllToasts(page).count();

  // Retry ONLY when the drag had zero observable effect — no edge added,
  // no toast emitted. That's the workers-contention silent-flake pattern.
  // A legitimate reject still leaves a toast (V3/V4/V5/V8) or, for the
  // saturated-source case, leaves nothing — but the saturated-source
  // outcome is determined by handle classes BEFORE the drag, not the
  // drag itself, so a retry there is harmless (handle still saturated).
  if (afterEdges === beforeEdges && afterToasts === beforeToasts) {
    await dragFromTo(page, from, to);
    await page.waitForTimeout(60);
  }
}

/**
 * Drag from a source handle to a target handle, identified by their labels.
 * Does NOT assert success — use `attemptConnection` to verify outcome.
 */
async function dragConnect(
  page: Page,
  sourceNodeId: string,
  sourceHandleName: string,
  targetNodeId: string,
  targetHandleName: string,
): Promise<void> {
  const source = getHandleByName(
    page,
    sourceNodeId,
    sourceHandleName,
    'source',
  );
  const target = getHandleByName(
    page,
    targetNodeId,
    targetHandleName,
    'target',
  );
  await dragBetweenLocators(page, source, target);
}

/**
 * Connect two handles (wrapper around `dragConnect` kept for callers that
 * expect the connection to succeed; the caller should still verify with
 * `connectionExistsBetweenNodes` if the connection matters).
 */
async function connectHandles(
  page: Page,
  sourceNodeId: string,
  sourceHandleName: string,
  targetNodeId: string,
  targetHandleName: string,
): Promise<void> {
  await dragConnect(
    page,
    sourceNodeId,
    sourceHandleName,
    targetNodeId,
    targetHandleName,
  );
}

/**
 * Verify whether ANY edge exists with the given source→target node pair.
 *
 * ReactFlow renders each edge with
 *   `<g aria-label="Edge from <sourceNodeId> to <targetNodeId>" ...>`
 * (verified empirically — IDs in the aria-label are NODE ids, not handle
 * ids). For graphs where at most one handle pair connects a given node
 * pair (true for `bindLoopNodes` handles — each loop node has a single
 * bind handle per side), this is equivalent to checking the specific
 * handle-pair connection.
 */
async function connectionExistsBetweenNodes(
  page: Page,
  sourceNodeId: string,
  targetNodeId: string,
): Promise<boolean> {
  return (
    (await getEdgesBetweenNodes(page, sourceNodeId, targetNodeId).count()) > 0
  );
}

// ─────────────────────────────────────────────────────────────────────
// Rich attempt-connection result + reject taxonomy
// ─────────────────────────────────────────────────────────────────────

/**
 * Outcome of `attemptConnection` / `attemptConnectionByHandles`. The shape
 * carries enough information for tests to assert on the precise reason
 * an attempt was rejected, OR confirm a successful landing.
 */
type ConnectionAttemptResult = {
  /** Did an edge land between the (sourceNode, targetNode) pair? */
  landed: boolean;
  /** Total `.react-flow__edge` count change (>=1 on landing, 0 on reject). */
  edgesDelta: number;
  /**
   * Categorisation of the failure path. Empirically there are three:
   *   - `'none'`           — landed (no rejection)
   *   - `'reducer'`        — `action:rejected` fired with a validator code
   *                          (V3/V4/V5/V8/cycle/etc.). Toast title carries
   *                          the code; description carries the message.
   *   - `'handle-target'`  — `ui:drag:ended` fired with `isValid:false`,
   *                          typically MC saturation on the TARGET.
   *                          Toast title is `'CONNECTION_REFUSED'`.
   *   - `'handle-source'`  — drag never engaged at the ReactFlow level
   *                          (source handle was already saturated, e.g.
   *                          `maxConnections:1` already taken). NO event,
   *                          NO toast — DOM-only signal.
   */
  rejectKind: 'none' | 'reducer' | 'handle-target' | 'handle-source';
  /** Validator code for `rejectKind === 'reducer'`. */
  rejectCode?: string;
  /** Validator message for `rejectKind === 'reducer'` (may be empty). */
  rejectReason?: string;

  // Backwards-compat aliases — older tests assert on these names.
  pairExists: boolean;
  totalEdgesDelta: number;
};

function buildRejectResult(
  edgesDelta: number,
  pairLanded: boolean,
  newToasts: ToastSnapshot[],
): ConnectionAttemptResult {
  if (pairLanded && edgesDelta >= 1) {
    return {
      landed: true,
      edgesDelta,
      rejectKind: 'none',
      pairExists: true,
      totalEdgesDelta: edgesDelta,
    };
  }
  // Newest toast first; sonner stacks newest at the top of the DOM list.
  const errorToast = newToasts.find((t) => t.type === 'error');
  if (errorToast) {
    return {
      landed: false,
      edgesDelta,
      rejectKind: 'reducer',
      rejectCode: errorToast.title,
      rejectReason: errorToast.description,
      pairExists: false,
      totalEdgesDelta: edgesDelta,
    };
  }
  const warningToast = newToasts.find((t) => t.type === 'warning');
  if (warningToast) {
    return {
      landed: false,
      edgesDelta,
      rejectKind: 'handle-target',
      rejectCode: warningToast.title,
      rejectReason: warningToast.description,
      pairExists: false,
      totalEdgesDelta: edgesDelta,
    };
  }
  // No toast and no edge change — drag never reached ReactFlow's
  // connection handler (saturated source). This is a legitimate
  // outcome for "second bind from already-bound source"-style tests.
  return {
    landed: false,
    edgesDelta,
    rejectKind: 'handle-source',
    pairExists: false,
    totalEdgesDelta: edgesDelta,
  };
}

/**
 * Attempt a drag between two handles. Returns a rich `ConnectionAttemptResult`
 * with the precise rejection kind (when applicable).
 *
 * Verification strategy:
 *   1. Snapshot total edge count + toasts BEFORE.
 *   2. Drag.
 *   3. Snapshot total edge count + toasts AFTER (small settle for sonner mount).
 *   4. Compute deltas; classify rejection kind.
 *
 * No event-stream involvement — DOM diff + toast diff are the source of
 * truth. Sonner toast titles carry validator codes that allow tests to
 * assert on the reason ("must be a V3 reject") without coupling to free
 * text.
 */
async function attemptConnection(
  page: Page,
  sourceNodeId: string,
  sourceHandleName: string,
  targetNodeId: string,
  targetHandleName: string,
): Promise<ConnectionAttemptResult> {
  return attemptConnectionByHandles(
    page,
    getHandleByName(page, sourceNodeId, sourceHandleName, 'source'),
    sourceNodeId,
    getHandleByName(page, targetNodeId, targetHandleName, 'target'),
    targetNodeId,
  );
}

/**
 * Like `attemptConnection` but accepts handle locators directly. Required
 * for handles whose label is empty (loop infer slots — Unicode ZWS rows
 * that label-text matching can't address). Use `getInferInput/Output`
 * helpers for those.
 */
async function attemptConnectionByHandles(
  page: Page,
  source: Locator,
  sourceNodeId: string,
  target: Locator,
  targetNodeId: string,
): Promise<ConnectionAttemptResult> {
  const totalBefore = await getAllEdges(page).count();
  const toastsBefore = await readAllToasts(page);
  await dragBetweenLocators(page, source, target);
  // Brief settle — sonner mounts under requestAnimationFrame; React
  // edge-add commit + toast paint ~ a few frames.
  await page.waitForTimeout(60);
  const totalAfter = await getAllEdges(page).count();
  const edgesDelta = totalAfter - totalBefore;
  const pairLanded = await connectionExistsBetweenNodes(
    page,
    sourceNodeId,
    targetNodeId,
  );
  const toastsAfter = await readAllToasts(page);
  const beforeKey = new Set(
    toastsBefore.map((t) => `${t.type}|${t.title}|${t.description}`),
  );
  const newToasts = toastsAfter.filter(
    (t) => !beforeKey.has(`${t.type}|${t.title}|${t.description}`),
  );
  return buildRejectResult(edgesDelta, pairLanded, newToasts);
}

// ─────────────────────────────────────────────────────────────────────
// No-drag connectability probe
// ─────────────────────────────────────────────────────────────────────

/**
 * Read a handle's connectability classes WITHOUT dragging. Maps directly
 * onto ReactFlow's class flags:
 *   - `asSource` = handle has `connectablestart`
 *   - `asTarget` = handle has `connectableend`
 *
 * Both flip OFF when the handle hits its `maxConnections` limit (verified
 * empirically — `maxConnections:1` bind handles drop ALL of `connectable`,
 * `connectablestart`, `connectableend`, `connectionindicator` on edge
 * landing).
 *
 * Useful for asserting "this handle now refuses any more connections"
 * AFTER a binding lands, or for predicting that an attempted drag will
 * silently fail (saturated source) without doing the drag.
 */
async function probeConnectability(handle: Locator): Promise<{
  asSource: boolean;
  asTarget: boolean;
  isConnectable: boolean;
}> {
  await handle.waitFor({ state: 'visible' });
  const cls = (await handle.getAttribute('class')) ?? '';
  const tokens = new Set(cls.split(/\s+/).filter(Boolean));
  return {
    asSource: tokens.has('connectablestart'),
    asTarget: tokens.has('connectableend'),
    isConnectable: tokens.has('connectable'),
  };
}

export {
  dragFromTo,
  dragConnect,
  dragBetweenLocators,
  connectHandles,
  connectionExistsBetweenNodes,
  attemptConnection,
  attemptConnectionByHandles,
  probeConnectability,
  centerOf,
};
export type { ConnectionAttemptResult };
