import type { Patch } from 'immer';
import type {
  Plan,
  UpdateEdgesByReactFlowPlan,
} from '@/utils/nodeStateManagement/planApply/types';

/**
 * A single entry in the undo/redo history.
 *
 * Stores the Immer patches that transition state forward (for redo)
 * and backward (for undo). The actionType is stored for debugging
 * and optional UI labeling (e.g., tooltip: "Undo Add Node").
 *
 * @example
 * ```ts
 * const entry: HistoryEntry = {
 *   patches: [{ op: 'add', path: ['nodes', 5], value: newNode }],
 *   inversePatches: [{ op: 'remove', path: ['nodes', 5] }],
 *   actionType: 'ADD_NODE',
 *   timestamp: 1716825600000,
 * };
 * ```
 */
type HistoryEntry = {
  /** Patches to move state forward (apply on redo). */
  patches: Patch[];
  /** Patches to move state backward (apply on undo). */
  inversePatches: Patch[];
  /** The action type(s) that produced this entry, for debugging/display. */
  actionType: string;
  /** Timestamp of when this entry was created. */
  timestamp: number;
};

/**
 * Configuration for the undo/redo history subsystem.
 *
 * @example
 * ```ts
 * const initialState = makeStateWithAutoInfer({
 *   ...myState,
 *   history: {
 *     undoStack: [],
 *     redoStack: [],
 *     config: { maxSize: 100 },
 *     activeBatch: null,
 *   },
 * });
 * ```
 */
type HistoryConfig = {
  /** Maximum number of undo entries. Undefined means unlimited. */
  maxSize?: number;
};

/**
 * Serialized form of a HistoryEntry for export.
 *
 * Patch values that contain non-serializable data (Zod schemas,
 * onChange callbacks) are stripped before serialization.
 */
type SerializedHistoryEntry = {
  patches: SerializedPatch[];
  inversePatches: SerializedPatch[];
  actionType: string;
  timestamp: number;
};

/**
 * A JSON-safe Immer patch. Same shape as `Patch` but the `value`
 * field is guaranteed to be JSON-serializable (no Zod schemas,
 * no function references).
 */
type SerializedPatch = {
  op: 'replace' | 'remove' | 'add';
  path: (string | number)[];
  value?: unknown;
};

// ---------------------------------------------------------------------------
// Undoability determination
// ---------------------------------------------------------------------------

const NON_UNDOABLE_PLAN_KINDS: ReadonlySet<Plan['kind']> = new Set([
  'SET_VIEWPORT',
  'REPLACE_STATE',
  'OPEN_DRAWER',
  'CLOSE_DRAWER',
  // Runner-panel view-preference toggle (auto-scroll / follow-groups) — a VIEW
  // concern, never on the undo stack.
  'UPDATE_RUNNER_VIEW_PREFERENCE',
  // Group navigation is a VIEW concern like SET_VIEWPORT (editor convention;
  // also lets runner follow-mode sync the open scope on scrub without
  // flooding the undo stack). Deliberate product decision — see the
  // group-instance-tracking plan.
  'OPEN_NODE_GROUP',
  'CLOSE_NODE_GROUP',
  'UNDO',
  'REDO',
  'BEGIN_BATCH',
  'END_BATCH',
  'CLEAR_HISTORY',
]);

/**
 * Determines whether a dispatched action should be recorded in the
 * undo/redo history.
 *
 * Static non-undoable actions (viewport, navigation, UI drawers,
 * history operations) are rejected by plan kind. Two conditional
 * cases exist:
 *
 * - `UPDATE_NODES_RF`: only undoable if the changes contain at least
 *   one user-initiated change (position or removal).
 * - `UPDATE_EDGES_RF`: only undoable if the plan contains at least
 *   one removal step (passthroughs are no-ops for undo purposes).
 *
 * @param action - The dispatched action (only `type` and `payload` are read).
 * @param plan - The validated plan produced by `validateAction`.
 * @returns `true` if the action should create a history entry.
 */
function isUndoable(
  action: { type: string; payload?: unknown },
  plan: Plan,
): boolean {
  if (NON_UNDOABLE_PLAN_KINDS.has(plan.kind)) return false;

  if (plan.kind === 'UPDATE_NODES_RF') {
    return hasNonSelectionChanges(action.payload);
  }

  if (plan.kind === 'UPDATE_EDGES_RF') {
    return hasRemovalStep(plan);
  }

  return true;
}

/**
 * Node change types that represent user-initiated structural edits.
 * All other types (`select`, `dimensions`, `replace`, `reset`, `add`)
 * are ReactFlow internal bookkeeping and should not create undo entries.
 */
const UNDOABLE_NODE_CHANGE_TYPES: ReadonlySet<string> = new Set([
  'position',
  'remove',
]);

/**
 * Returns `true` if the action payload contains at least one
 * user-initiated node change (`position` or `remove`).
 *
 * ReactFlow also fires `select` (selection toggles), `dimensions`
 * (measuring rendered size), `replace` (internal node data updates),
 * and `add`/`reset` (library-managed lifecycle). These are excluded
 * because they are not meaningful user actions.
 *
 * @param payload - The raw action payload. Expected shape when
 *   originating from `UPDATE_NODE_BY_REACT_FLOW`:
 *   `{ changes: Array<{ type: string; ... }> }`.
 */
function hasNonSelectionChanges(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  if (!('changes' in payload) || !Array.isArray(payload.changes)) return false;

  return payload.changes.some(
    (change: unknown) =>
      typeof change === 'object' &&
      change !== null &&
      'type' in change &&
      typeof change.type === 'string' &&
      UNDOABLE_NODE_CHANGE_TYPES.has(change.type),
  );
}

function hasRemovalStep(plan: UpdateEdgesByReactFlowPlan): boolean {
  return plan.steps.some((step) => step.kind === 'removal');
}

// ---------------------------------------------------------------------------
// Draft-compatible patch application
// ---------------------------------------------------------------------------

/**
 * Applies Immer patches directly to an Immer draft by mutating it
 * in place. This is necessary because Immer's built-in `applyPatches`
 * returns a new immutable object and cannot operate on a draft proxy.
 *
 * Used by the UNDO/REDO plan handlers inside `applyPlan` to restore
 * state from stored patches without leaving the Immer producer.
 *
 * @param draft - The Immer draft to mutate.
 * @param patches - Ordered array of Immer patches to apply.
 */
/** An interior node of an Immer patch path: always an object or array. */
type PatchTarget = Record<string, unknown> | unknown[];

function applyPatchesToDraft(
  draft: Record<string, unknown>,
  patches: ReadonlyArray<Patch>,
): void {
  for (const patch of patches) {
    // Navigate to the parent of the target field. Immer patch paths only
    // traverse containers, so each interior node is an object/array — asserted
    // via `as PatchTarget` (the one justified cast in this generic tree-walk).
    let target: PatchTarget = draft;
    for (let i = 0; i < patch.path.length - 1; i++) {
      const step = patch.path[i];
      target = (
        Array.isArray(target) ? target[step as number] : target[step]
      ) as PatchTarget;
    }
    const key = patch.path[patch.path.length - 1];

    switch (patch.op) {
      case 'replace':
        if (Array.isArray(target)) target[key as number] = patch.value;
        else target[key] = patch.value;
        break;
      case 'add':
        if (Array.isArray(target)) {
          target.splice(key as number, 0, patch.value);
        } else {
          target[key] = patch.value;
        }
        break;
      case 'remove':
        if (Array.isArray(target)) {
          target.splice(key as number, 1);
        } else {
          delete target[key];
        }
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// History recording building blocks
// ---------------------------------------------------------------------------

/**
 * Filters out patches that target the `history` field on State.
 * This prevents recursive self-reference — history recording its own
 * mutations would create an infinite growth loop.
 *
 * @param patches - Raw patches from `produceWithPatches`.
 * @returns Only the patches that modify non-history fields.
 */
function filterHistoryPatches(patches: ReadonlyArray<Patch>): Patch[] {
  return patches.filter((p) => p.path[0] !== 'history');
}

/**
 * Minimal shape of `State.history` needed by `recordInHistory`.
 * Using a structural type avoids importing the full generic `State<D,N,U,C>`.
 */
type HistoryField = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  config: HistoryConfig;
  activeBatch: {
    patches: Patch[];
    inversePatches: Patch[];
    actionTypes: string[];
    startTimestamp: number;
  } | null;
};

/**
 * Records filtered patches into the history. Handles both the normal
 * case (push a new undo entry) and the batch case (accumulate into
 * the active batch buffer).
 *
 * Call this on a draft that already has `history` initialized.
 *
 * @param history - The `draft.history` field to mutate.
 * @param dataPatches - Filtered forward patches (no history paths).
 * @param dataInversePatches - Filtered inverse patches (no history paths).
 * @param actionType - The action type string for debugging/display.
 */
function recordInHistory(
  history: HistoryField,
  dataPatches: Patch[],
  dataInversePatches: Patch[],
  actionType: string,
): void {
  if (history.activeBatch) {
    history.activeBatch.patches.push(...dataPatches);
    // Inverse patches are prepended so that when the batch is undone,
    // the last frame's inverse is applied first — correctly restoring
    // the original position.
    history.activeBatch.inversePatches.unshift(...dataInversePatches);
    history.activeBatch.actionTypes.push(actionType);
  } else if (dataPatches.length > 0) {
    history.undoStack.push({
      patches: dataPatches,
      inversePatches: dataInversePatches,
      actionType,
      timestamp: Date.now(),
    });
    history.redoStack = [];

    const maxSize = history.config.maxSize;
    if (maxSize !== undefined && history.undoStack.length > maxSize) {
      history.undoStack = history.undoStack.slice(-maxSize);
    }
  }
}

/**
 * Returns a default empty history object. Used when `state.history`
 * is `undefined` and needs to be initialized.
 */
function createEmptyHistory(): HistoryField {
  return {
    undoStack: [],
    redoStack: [],
    config: {},
    activeBatch: null,
  };
}

export {
  isUndoable,
  applyPatchesToDraft,
  filterHistoryPatches,
  recordInHistory,
  createEmptyHistory,
};
export type {
  HistoryEntry,
  HistoryConfig,
  SerializedHistoryEntry,
  SerializedPatch,
};
