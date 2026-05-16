import type { Page, Locator } from '@playwright/test';

/**
 * Locators for individual graph nodes and their handles.
 *
 * ReactFlow renders each node inside a `<div class="react-flow__node">` with
 * a `data-id` attribute. Handles carry:
 *   - `data-handleid="<handleId>"`             — stable per handle
 *   - `data-nodeid="<nodeId>"`                  — owning node
 *   - `data-handlepos="left" | "right"`         — visual side (target | source)
 *   - `data-id="1-<nodeId>-<handleId>-<dir>"`  — composite globally-unique id
 *   - classes:
 *       `connectable connectablestart connectableend connectionindicator`
 *     reflect "can a connection start / end here right now". `maxConnections:1`
 *     handles drop ALL four classes once an edge lands on them — verified
 *     empirically (see e2e/tests/loops/probe/domContract.spec.ts).
 *
 * Empty-label handles (loop infer slots) carry a Unicode zero-width space
 * (charCode 8203) as their label text, so label-text matching fails for
 * them — use `getHandleByIndex` or the loop-infer helpers below.
 */

function getNodeByName(page: Page, name: string): Locator {
  return page.locator('.react-flow__node').filter({ hasText: name });
}

function getNodeById(page: Page, nodeId: string): Locator {
  return page.locator(`.react-flow__node[data-id="${nodeId}"]`);
}

/**
 * All handles on a node, filtered by source/target direction.
 * Source handles live on the right of the node; target handles on the left.
 */
function getAllHandles(
  page: Page,
  nodeId: string,
  type: 'source' | 'target',
): Locator {
  const handlepos = type === 'source' ? 'right' : 'left';
  return page.locator(
    `.react-flow__handle[data-nodeid="${nodeId}"][data-handlepos="${handlepos}"]`,
  );
}

/**
 * Stable per-handle locator using ReactFlow's composite `data-id`.
 *
 * Format: `1-<nodeId>-<handleId>-<source|target>`. Match by suffix against
 * the prefix `1-<nodeId>-<handleId>-` so the caller doesn't have to know
 * which direction the handle is.
 *
 * Once you have a handle's `handleId` (captured by reading the freshly-
 * mounted node's DOM in a builder), this is the cheapest and most precise
 * way to reach the handle for the rest of the test — pure CSS attribute
 * match, no xpath, no label scanning, no positional assumptions.
 */
function getHandleByDataId(
  page: Page,
  nodeId: string,
  handleId: string,
): Locator {
  return page.locator(
    `.react-flow__handle[data-nodeid="${nodeId}"][data-handleid="${handleId}"]`,
  );
}

/**
 * A specific handle on a node, located by the label text next to it.
 *
 *   Source row:  <div …flex-row justify-end…>
 *                  <div class="truncate">LABEL</div>
 *                  <div class="react-flow__handle"/>
 *                </div>
 *   Target row:  <div …flex-row…>
 *                  <div class="react-flow__handle"/>
 *                  <div class="flex-1 …">LABEL</div>
 *                </div>
 *
 * Match the handle whose IMMEDIATE parent row contains a descendant
 * element with the exact label text. Uses xpath because Playwright's
 * `:has(...:text-is(...))` CSS form doesn't compose reliably with the
 * descendant-text engine; xpath's `normalize-space(.)` walks all
 * descendants and is exact-match.
 *
 * For empty-label handles (loop infer slots — Unicode ZWS), use
 * `getHandleByIndex` or `getInferInput` / `getInferOutput`.
 */
function getHandleByName(
  page: Page,
  nodeId: string,
  handleName: string,
  type: 'source' | 'target',
): Locator {
  const pos = type === 'source' ? 'right' : 'left';
  return page.locator(
    `xpath=//div[contains(@class,"react-flow__handle") and @data-nodeid="${nodeId}" and @data-handlepos="${pos}" and parent::*[*[normalize-space(.)="${handleName}"]]]`,
  );
}

/** Nth handle on a node (source or target side). */
function getHandleByIndex(
  page: Page,
  nodeId: string,
  type: 'source' | 'target',
  index: number,
): Locator {
  return getAllHandles(page, nodeId, type).nth(index);
}

/**
 * Match a handle whose sibling label CONTAINS the given substring. Useful for
 * handles that render an `allowInput` default value appended to the label
 * (e.g. `Count0.0000`, `Max0.0000`).
 */
function getHandleByLabelContains(
  page: Page,
  nodeId: string,
  labelSubstring: string,
  type: 'source' | 'target',
): Locator {
  const pos = type === 'source' ? 'right' : 'left';
  return page.locator(
    `xpath=//div[contains(@class,"react-flow__handle") and @data-nodeid="${nodeId}" and @data-handlepos="${pos}" and parent::*[*[contains(normalize-space(.), "${labelSubstring}")]]]`,
  );
}

// ─────────────────────────────────────────────────────
// Loop-infer handle helpers
// ─────────────────────────────────────────────────────
//
// The infer handles on loop nodes have empty labels until a connection drives
// inference. The simplest stable addressing is by position within the known
// source/target arrays (see e2e/TEST_MATRIX.md — handle-topology table):
//
//   loopStart  sources: [bind, infer*]          targets: [infer*]
//   loopStop   sources: [bind, infer*]          targets: [bind, condition, infer*]
//   loopEnd    sources: [infer*]                targets: [bind, infer*]
//
// *infer slot count grows as new connections land — the FIRST empty infer
// slot is what `getFirstInferInput/Output` returns.

type LoopKind = 'loopStart' | 'loopStop' | 'loopEnd';

const LOOP_FIRST_INFER_SOURCE_INDEX: Record<LoopKind, number> = {
  loopStart: 1,
  loopStop: 1,
  loopEnd: 0,
};

const LOOP_FIRST_INFER_TARGET_INDEX: Record<LoopKind, number> = {
  loopStart: 0,
  loopStop: 2,
  loopEnd: 1,
};

/** Nth infer source (output) handle on a loop node. n=0 is the first. */
function getInferOutput(
  page: Page,
  nodeId: string,
  kind: LoopKind,
  n = 0,
): Locator {
  return getHandleByIndex(
    page,
    nodeId,
    'source',
    LOOP_FIRST_INFER_SOURCE_INDEX[kind] + n,
  );
}

/** Nth infer target (input) handle on a loop node. n=0 is the first. */
function getInferInput(
  page: Page,
  nodeId: string,
  kind: LoopKind,
  n = 0,
): Locator {
  return getHandleByIndex(
    page,
    nodeId,
    'target',
    LOOP_FIRST_INFER_TARGET_INDEX[kind] + n,
  );
}

/** The condition target handle on loopStop (fixed at target index 1). */
function getLoopStopCondition(page: Page, loopStopId: string): Locator {
  return getHandleByIndex(page, loopStopId, 'target', 1);
}

export {
  getNodeByName,
  getNodeById,
  getAllHandles,
  getHandleByDataId,
  getHandleByName,
  getHandleByIndex,
  getHandleByLabelContains,
  getInferOutput,
  getInferInput,
  getLoopStopCondition,
};
export type { LoopKind };
