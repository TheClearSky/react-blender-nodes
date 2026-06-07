import { produce, produceWithPatches, enablePatches, type Draft } from 'immer';
import type { z } from 'zod';
import type { State, SupportedUnderlyingTypes } from './types';
import type { Plan } from './planApply/types';
import { applyPlan } from './planApply/applyPlan';
import {
  isUndoable,
  filterHistoryPatches,
  recordInHistory,
  createEmptyHistory,
} from '@/components/organisms/FullGraph/historyTypes';

enablePatches();

/**
 * Applies a validated plan to state, with automatic undo/redo history
 * management.
 *
 * This is the single function that owns the 3-path routing:
 *
 * - **Undoable actions** (ADD_NODE, ADD_EDGE, position drags, etc.):
 *   Uses `produceWithPatches` to capture forward/inverse patches, filters
 *   out history-field patches, then records them in `state.history`.
 *
 * - **Non-undoable actions** (UNDO, REDO, SET_VIEWPORT, BEGIN_BATCH, etc.):
 *   Uses plain `produce`. UNDO/REDO apply stored patches inside `applyPlan`
 *   via `applyPatchesToDraft`. BEGIN_BATCH/END_BATCH/CLEAR_HISTORY modify
 *   `state.history` directly inside `applyPlan`.
 *
 * Both `mainReducer` and `graphStore` delegate to this function after
 * calling `validateAction`, keeping history logic in one place.
 *
 * @param state - The current immutable state.
 * @param action - The dispatched action (only `type` is read, for history labeling).
 * @param plan - The validated plan from `validateAction`.
 * @returns The new state. Returns `state` unchanged (same reference) if
 *   the action produced no state change.
 *
 * @example
 * ```ts
 * const planResult = validateAction(state, action);
 * if (planResult?.ok) {
 *   const next = applyValidatedAction(state, action, planResult.value);
 *   if (next !== state) { ... }
 * }
 * ```
 */
function applyValidatedAction<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  action: { type: string },
  plan: Plan,
): State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  type StateT = State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;

  // Cast justification: `Draft<StateT>` is structurally identical to `StateT`
  // because State has no `readonly` properties. TypeScript cannot prove this
  // in a generic context because `Draft<T>` uses deferred conditional types.
  // The cast is a compile-time no-op.

  if (!isUndoable(action, plan)) {
    // ── Non-undoable: plain produce, no patch capture ──
    // UNDO/REDO are handled inside applyPlan via applyPatchesToDraft.
    // BEGIN_BATCH/END_BATCH/CLEAR_HISTORY modify history directly.
    const next = produce(state, (draft: Draft<StateT>) => {
      const returnValue = applyPlan(draft as StateT, plan);
      if (returnValue !== undefined) return returnValue as Draft<StateT>;
    });
    return next;
  }

  // ── Undoable: capture patches, then record in history ──
  const [next, patches, inversePatches] = produceWithPatches(
    state,
    (draft: Draft<StateT>) => {
      const returnValue = applyPlan(draft as StateT, plan);
      if (returnValue !== undefined) return returnValue as Draft<StateT>;
    },
  );

  if (next === state) return state;

  const dataPatches = filterHistoryPatches(patches);
  const dataInversePatches = filterHistoryPatches(inversePatches);

  // Record patches in history via a second produce. This two-step approach
  // is necessary because patches aren't available until after
  // produceWithPatches returns — we can't store them in the same produce
  // that generates them.
  return produce(next, (draft: Draft<StateT>) => {
    const d = draft as StateT;
    if (!d.history) {
      d.history = createEmptyHistory();
    }
    recordInHistory(d.history, dataPatches, dataInversePatches, action.type);
  });
}

export { applyValidatedAction };
