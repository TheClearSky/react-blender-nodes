import type { ExecutionRecord, ExecutionStepRecord } from './types';

/** Per-node preview value snapshots derived from an ExecutionRecord. */
type NodePreviewValueEntry = {
  /** The node's most-recently-computed step (max `stepIndex`), or `null`. */
  live: ExecutionStepRecord | null;
  /** The node's step at/≤ the current timeline position, or `null`. */
  atStep: ExecutionStepRecord | null;
};

/**
 * Stable empty result so idle / no-preview graphs never rebuild or churn the
 * RunnerContext value (preserves its R1 stable identity).
 */
const EMPTY_NODE_PREVIEW_VALUES: ReadonlyMap<string, NodePreviewValueEntry> =
  new Map();

/**
 * Derive per-node `live` + `atStep` snapshots from an ExecutionRecord in a SINGLE
 * pass over `record.steps`.
 *
 * `record.steps` is ALREADY the complete, flat, globally-monotonic list of EVERY
 * step at every nesting depth: the recorder appends all steps (top-level, loop
 * body, switch branch, group inner) to one array with a global `stepIndex`,
 * `endScope` filters an ownership-scoped COPY non-destructively (window +
 * instance-path ownership; the flat array is never spliced), and the nested
 * loop/switch/group records hold duplicate references — so no recursion is
 * needed to reach nested nodes.
 *
 * - `live` = the step with the max `stepIndex` for each node (its latest
 *   occurrence). A recorded step's value maps hold its COMPLETE values, and
 *   `visualState` is NOT a completeness signal: at a pause/scrub head the current
 *   node reads `running` while its recorded step is already complete, so gating a
 *   preview on `visualState !== 'running'` would WRONGLY hide valid values. To
 *   guard against a genuinely empty snapshot, test the record itself
 *   (`outputValues.size === 0`), not the overlay state.
 * - `atStep` = the step with the max `stepIndex <= currentStepIndex` for each node
 *   (`null` when the node has not run by `currentStepIndex`, or when it is `null`).
 *
 * @param record - the (possibly partial / streaming) execution record
 * @param currentStepIndex - the replay/scrub head that drives `atStep`. Once a
 *   record exists this is always a real index into it; `null` is the deliberate
 *   seam for "no head yet" (no record), which yields an empty `atStep` everywhere.
 * @param openInstancePath - the group-INSTANCE path of the currently-open scope
 *   (the `openedNodeGroupStack` `nodeId` chain). When provided, only steps whose
 *   `instancePath` EQUALS it contribute — so a subtree template node shows the
 *   values of the instance the user is standing in, not last-instance-wins.
 *   `undefined` = no filtering (the root view, or a TEMPLATE open via the
 *   selector, which deliberately aggregates all instances).
 * @returns a per-`nodeId` map of `{ live, atStep }` (nodes never run are absent)
 */
function computeNodePreviewValues(
  record: ExecutionRecord,
  currentStepIndex: number | null,
  openInstancePath?: readonly string[],
): ReadonlyMap<string, NodePreviewValueEntry> {
  const values = new Map<string, NodePreviewValueEntry>();
  for (const step of record.steps) {
    if (
      openInstancePath !== undefined &&
      !instancePathEquals(step.instancePath, openInstancePath)
    ) {
      continue;
    }
    let entry = values.get(step.nodeId);
    if (!entry) {
      entry = { live: null, atStep: null };
      values.set(step.nodeId, entry);
    }
    if (!entry.live || step.stepIndex > entry.live.stepIndex) {
      entry.live = step;
    }
    if (
      currentStepIndex !== null &&
      step.stepIndex <= currentStepIndex &&
      (!entry.atStep || step.stepIndex > entry.atStep.stepIndex)
    ) {
      entry.atStep = step;
    }
  }
  return values;
}

/** Exact-equality comparison for instance paths (absent ≡ root ≡ empty). */
function instancePathEquals(
  stepPath: readonly string[] | undefined,
  openPath: readonly string[],
): boolean {
  const effectiveStepPath = stepPath ?? [];
  if (effectiveStepPath.length !== openPath.length) return false;
  for (let index = 0; index < openPath.length; index++) {
    if (effectiveStepPath[index] !== openPath[index]) return false;
  }
  return true;
}

export {
  computeNodePreviewValues,
  EMPTY_NODE_PREVIEW_VALUES,
  instancePathEquals,
};
export type { NodePreviewValueEntry };
