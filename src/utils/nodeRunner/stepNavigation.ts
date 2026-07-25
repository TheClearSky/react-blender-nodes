import type { ExecutionStepRecord } from './types';

// ─────────────────────────────────────────────────────
// Step-over / step-out navigation over the flat step list
// ─────────────────────────────────────────────────────
//
// The flat `record.steps` list is globally-monotonic and every step carries an
// `instancePath` (chain of group-instance ids; absent = root). Depth = path
// length. These helpers compute REPLAY jump targets purely from that — they
// never assume contiguity of a group's inner steps (concurrent sibling
// instances may interleave), only path relationships.

/** Depth of a step = its instance-path length (root steps have depth 0). */
function stepDepth(step: ExecutionStepRecord): number {
  return step.instancePath?.length ?? 0;
}

/**
 * STEP OVER: from the head, jump to the next step whose depth is at or above
 * (≤) the head's depth — skipping any deeper region the next step(s) descend
 * into. On a step just before a group executes, this lands on the group's own
 * structural step (which carries the PARENT path) instead of entering it.
 * Returns `null` when there is nothing after the head at that depth.
 */
function findStepOverTarget(
  steps: readonly ExecutionStepRecord[],
  currentStepIndex: number,
): number | null {
  const headStep = steps.find((step) => step.stepIndex === currentStepIndex);
  if (!headStep) return null;
  const headDepth = stepDepth(headStep);
  for (const step of steps) {
    if (step.stepIndex <= currentStepIndex) continue;
    if (stepDepth(step) <= headDepth) return step.stepIndex;
  }
  return null;
}

/**
 * STEP OUT: from a step INSIDE a group, jump to the first subsequent step that
 * is strictly shallower than the head (typically the enclosing group's own
 * structural step, which carries the parent path). Returns `null` at root
 * depth or when nothing shallower follows.
 */
function findStepOutTarget(
  steps: readonly ExecutionStepRecord[],
  currentStepIndex: number,
): number | null {
  const headStep = steps.find((step) => step.stepIndex === currentStepIndex);
  if (!headStep) return null;
  const headDepth = stepDepth(headStep);
  if (headDepth === 0) return null;
  for (const step of steps) {
    if (step.stepIndex <= currentStepIndex) continue;
    if (stepDepth(step) < headDepth) return step.stepIndex;
  }
  return null;
}

export { findStepOverTarget, findStepOutTarget, stepDepth };
