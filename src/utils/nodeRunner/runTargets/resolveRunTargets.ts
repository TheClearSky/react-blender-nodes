import { inProcessRunTarget } from './inProcessRunTarget';
import type { RunTarget } from './types';

type ResolveRunTargetsResult = {
  /** Effective, ordered target list (the built-in default prepended unless a
   *  consumer target already claims its id). */
  targets: RunTarget[];
  /** The resolved active target id. */
  activeRunTargetId: string;
  /** The resolved active target object. */
  activeRunTarget: RunTarget;
};

/**
 * Pure registry resolution — no React. Given the consumer's `runTargets` and the
 * current/desired selection, it produces the effective ordered list and the
 * active target:
 *
 * - the built-in `inProcessRunTarget` is PREPENDED unless a consumer target
 *   already uses its id (`'in-process'`) — consumer wins on collision;
 * - duplicate ids are dropped, keeping the first (dev-warns on a drop);
 * - the active id resolves as `activeRunTargetId` → `defaultRunTargetId` →
 *   `'in-process'`, falling back to the first target if the candidate is absent.
 */
function resolveRunTargets(
  consumerRunTargets: ReadonlyArray<RunTarget> | undefined,
  selection?: { activeRunTargetId?: string; defaultRunTargetId?: string },
): ResolveRunTargetsResult {
  const provided = consumerRunTargets ?? [];
  const consumerClaimsInProcessId = provided.some(
    (target) => target.id === inProcessRunTarget.id,
  );

  const targets: RunTarget[] = [];
  const seenIds = new Set<string>();
  if (!consumerClaimsInProcessId) {
    targets.push(inProcessRunTarget);
    seenIds.add(inProcessRunTarget.id);
  }
  for (const target of provided) {
    if (seenIds.has(target.id)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[react-blender-nodes] Duplicate run target id '${target.id}' ignored (the first one wins).`,
        );
      }
      continue;
    }
    seenIds.add(target.id);
    targets.push(target);
  }

  const fallbackId = targets[0]?.id ?? inProcessRunTarget.id;
  const candidateId =
    selection?.activeRunTargetId ??
    selection?.defaultRunTargetId ??
    inProcessRunTarget.id;
  const activeRunTargetId = seenIds.has(candidateId) ? candidateId : fallbackId;
  const activeRunTarget =
    targets.find((target) => target.id === activeRunTargetId) ??
    inProcessRunTarget;

  return { targets, activeRunTargetId, activeRunTarget };
}

export { resolveRunTargets };
export type { ResolveRunTargetsResult };
