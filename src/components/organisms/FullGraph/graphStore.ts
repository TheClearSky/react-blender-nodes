import type { z } from 'zod';
import { validateAction } from '@/utils/nodeStateManagement/planApply/validators';
import { applyValidatedAction } from '@/utils/nodeStateManagement/applyWithHistory';
import {
  deriveAppliedEvent,
  deriveRejectedEvent,
  type GraphEvent,
} from '@/utils/nodeStateManagement/graphEvent';
import type {
  State,
  SupportedUnderlyingTypes,
} from '@/utils/nodeStateManagement/types';
import type { Action } from '@/utils/nodeStateManagement/mainReducer';

/**
 * External graph store — Redux-style.
 *
 * Owns the graph state in a closure variable. Components subscribe via
 * `subscribe` (paired with React's `useSyncExternalStore` in the hook).
 * Dispatch is a plain function — runs once per call, never replayed by
 * React, so side effects (event emission) inside it fire exactly once.
 *
 * This is the architectural fix for the "wrapper-emits-with-stale-id"
 * bug: by taking dispatch out of React's reducer pipeline, we get to
 * call `validateAction` exactly once and emit an event whose detail
 * was computed from the actually-committed state — guaranteed to match
 * what the DOM renders.
 *
 * Undo/redo history lives inside `state.history` — not in the closure.
 * All history logic (patch capture, recording, undo/redo application)
 * is handled by `applyValidatedAction` from `applyWithHistory.ts`.
 *
 * `mainReducer` is unaffected by this module — direct consumers using
 * `useReducer(mainReducer, ...)` continue to work as before. This store
 * is the recommended path (via `useFullGraph`).
 */

type GraphStore<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /**
   * Read the current state. Identity is preserved across renders when
   * nothing changes — `useSyncExternalStore` relies on this for
   * memoization.
   */
  getState: () => State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
  /**
   * Subscribe to state changes. Returns an unsubscribe function. Safe to
   * call multiple times; each call adds a separate listener.
   */
  subscribe: (listener: () => void) => () => void;
  /**
   * Dispatch an action. Synchronous — by the time this returns:
   *   1. `validateAction` has run exactly ONCE.
   *   2. If the plan was valid, `applyPlan` has run exactly ONCE.
   *   3. State has been replaced with the produce result.
   *   4. The matching `action:applied` or `action:rejected` event has
   *      fired (with truthful ids derived from post-apply state diff).
   *   5. All subscribers have been notified.
   */
  dispatch: (
    action: Action<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ) => void;
};

function createGraphStore<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  initialState: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  /**
   * GETTER for the current event handler. Not the value itself, because
   * consumers commonly pass inline functions whose identity changes per
   * render — accepting a getter lets us capture the latest one without
   * re-creating the store. Mirrors how the previous `useFullGraph`
   * stored the callback in a ref.
   */
  getOnGraphEvent: () =>
    | ((
        event: GraphEvent<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >,
      ) => void)
    | undefined,
): GraphStore<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispatch(action) {
      const planResult = validateAction(state, action);
      if (planResult === null) {
        // Unrecognized action — neither apply nor emit.
        return;
      }

      if (!planResult.ok) {
        // Reducer-level rejection. Emit synchronously; state unchanged.
        getOnGraphEvent()?.(deriveRejectedEvent(action, planResult.error));
        return;
      }

      const plan = planResult.value;
      const prev = state;

      // Apply the plan with automatic history management.
      // `applyValidatedAction` handles the 3-path routing (undoable
      // with patch capture, non-undoable, UNDO/REDO) internally.
      const next = applyValidatedAction(prev, action, plan);

      // Identity-preserving short-circuit: if nothing changed, don't
      // notify or emit (keeps unnecessary re-renders + event noise out).
      if (next === prev) return;

      // Update state BEFORE emitting so any handler synchronously
      // calling `getState()` sees the post-apply view.
      state = next;

      // Emit the applied event with truthful ids — `deriveAppliedEvent`
      // diffs prev vs next to find the new node/edge/group ids.
      getOnGraphEvent()?.(deriveAppliedEvent(action, plan, prev, next));

      // Notify subscribers (React via `useSyncExternalStore`).
      listeners.forEach((l) => l());
    },
  };
}

export { createGraphStore };
export type { GraphStore };
