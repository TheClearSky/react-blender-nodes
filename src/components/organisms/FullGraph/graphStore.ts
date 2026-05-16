import { produce, type Draft } from 'immer';
import type { z } from 'zod';
import { validateAction } from '@/utils/nodeStateManagement/planApply/validators';
import { applyPlan } from '@/utils/nodeStateManagement/planApply/applyPlan';
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

      // Apply the plan to a new state. `applyPlan` mints any random ids
      // here, inside Immer's `produce`. Because this is NOT a React
      // reducer, there is no replay — `produce` runs exactly once.
      //
      // Some plans (e.g. REPLACE_STATE) RETURN a value from `applyPlan`
      // instead of mutating the draft — Immer uses the returned value as
      // the new state when one is returned. Forward the return so those
      // plans actually replace state. (mainReducer does the same forward.)
      type StateT = State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >;

      const prev = state;

      // Cast justification: `Draft<StateT>` (aka `WritableDraft<StateT>`)
      // is structurally identical to `StateT` here because State has no
      // `readonly` properties, no ReadonlyMap/ReadonlySet fields, and all
      // leaf types are primitives or plain objects.  TypeScript cannot
      // prove this in a generic context because `Draft<T>` uses deferred
      // conditional types — `Draft<NodeTypeUniqueId>` is NOT eagerly
      // simplified to `NodeTypeUniqueId` while the type parameter is
      // unresolved.  The cast is a compile-time no-op.
      const next = produce(prev, (draft: Draft<StateT>) => {
        const returnValue = applyPlan(draft as StateT, planResult.value);
        if (returnValue !== undefined) return returnValue as Draft<StateT>;
      });

      // Identity-preserving short-circuit: if nothing changed, don't
      // notify or emit (keeps unnecessary re-renders + event noise out).
      if (next === prev) return;

      // Update state BEFORE emitting so any handler synchronously
      // calling `getState()` sees the post-apply view.
      state = next;

      // Emit the applied event with truthful ids — `deriveAppliedEvent`
      // diffs prev vs next to find the new node/edge/group ids.
      getOnGraphEvent()?.(
        deriveAppliedEvent(action, planResult.value, prev, next),
      );

      // Notify subscribers (React via `useSyncExternalStore`).
      listeners.forEach((l) => l());
    },
  };
}

export { createGraphStore };
export type { GraphStore };
