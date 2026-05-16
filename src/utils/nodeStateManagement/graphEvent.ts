/**
 * Graph event stream — observability hook for everything that happens
 * to graph state.
 *
 * Two source layers feed into a single unified stream:
 *   1. Reducer events  (`action:applied` / `action:rejected` / `state:committed`)
 *      emitted from the wrapped dispatch inside `useFullGraph`.
 *   2. UI events        (`ui:drag:ended` / `ui:delete:attempted` / `ui:state:imported`
 *      / `ui:recording:imported`) emitted from `<FullGraph>` for ReactFlow
 *      lifecycle moments that bypass the reducer (e.g. `onBeforeDelete`
 *      rejecting before any action dispatches).
 *
 * Tests, dev tooling, and telemetry can subscribe once and exhaustively
 * narrow on `event.kind`. The granular outcome props on `<FullGraph>`
 * (`onStateImported`, `onRecordingImported`, `onImportError`) are kept
 * for backwards compatibility but emit their equivalent events too.
 *
 * Event payloads carry concrete data, not strings:
 *   - `action:rejected` carries the original `ValidationError` so consumers
 *     can switch on `.code` (e.g. `'CYCLE_DETECTED'`, `'LOOP_PATH_INVALID'`).
 *   - `action:applied` carries the action type plus an optional `detail`
 *     payload typed per action (e.g. `{kind: 'ADD_NODE', nodeId, nodeType}`).
 */

import type { z } from 'zod';
import type { Connection, XYPosition } from '@xyflow/react';
import type { State, SupportedUnderlyingTypes } from './types';
import type { Action } from './mainReducer';
import type { Plan, Result, ValidationError } from './planApply/types';
import { actionTypesMap } from './mainReducer';

// ────────────────────────────────────────────────────────────────────
// Per-action success-path detail payloads
// ────────────────────────────────────────────────────────────────────
//
// Carried in `action:applied` events. Generated from a (action, plan,
// prevState, nextState) tuple AFTER the Immer commit so identifiers
// (newly-minted node/edge ids) come from the committed state itself —
// guaranteed to match what the DOM will render.

type AddNodeDetail<NodeTypeUniqueId extends string = string> = {
  kind: 'ADD_NODE';
  /** Whether this was ADD_NODE_AND_SELECT (true) or ADD_NODE (false). */
  selectExclusively: boolean;
  /**
   * The constructed node id, read from `nextState.nodes` (set-difference
   * against `prevState.nodes`). Truthful — matches the DOM `data-id` of
   * the new `.react-flow__node` element.
   */
  nodeId: string;
  /** The node type that was added. */
  nodeType: NodeTypeUniqueId;
  /** The position where it was placed. */
  position: XYPosition;
};

type AddEdgeDetail = {
  kind: 'ADD_EDGE';
  /**
   * The new edge id, read from `nextState.edges` (set-difference). Truthful —
   * matches the DOM `data-id` of the new `.react-flow__edge` element.
   */
  edgeId: string;
  /** Original ReactFlow connection that produced this edge. */
  connection: Connection;
};

type AddNodeGroupDetail = {
  kind: 'ADD_NODE_GROUP';
  /**
   * The newly-generated nodeType id for the group, read from
   * `nextState.typeOfNodes` (set-difference against `prevState`). Truthful.
   */
  newNodeTypeId: string;
};

type OpenNodeGroupDetail = {
  kind: 'OPEN_NODE_GROUP';
  /** The nodeType id that was opened. */
  nodeType: string;
  /** When opening a specific instance (not the original group), the node id. */
  nodeId?: string;
};

type CloseNodeGroupDetail = {
  kind: 'CLOSE_NODE_GROUP';
};

type SetViewportDetail = {
  kind: 'SET_VIEWPORT';
};

type ReplaceStateDetail = {
  kind: 'REPLACE_STATE';
};

type UpdateNodesByReactFlowDetail = {
  kind: 'UPDATE_NODE_BY_REACT_FLOW';
};

type UpdateEdgesByReactFlowDetail = {
  kind: 'UPDATE_EDGES_BY_REACT_FLOW';
};

type UpdateInputValueDetail = {
  kind: 'UPDATE_INPUT_VALUE';
  nodeId: string;
  inputId: string;
  value: string | number;
};

type UpdateNodeTypeDetail = {
  kind: 'UPDATE_NODE_TYPE';
  nodeTypeId: string;
  updates: {
    name?: string;
    headerColor?: string;
    inputs?: unknown[];
    outputs?: unknown[];
  };
};

type AddLoopDetail = {
  kind: 'ADD_LOOP';
};

/**
 * Discriminated union of all per-action detail payloads. The kind here
 * matches the action type 1:1 so consumers can switch on either.
 */
type ActionDetail<NodeTypeUniqueId extends string = string> =
  | AddNodeDetail<NodeTypeUniqueId>
  | AddEdgeDetail
  | AddNodeGroupDetail
  | OpenNodeGroupDetail
  | CloseNodeGroupDetail
  | SetViewportDetail
  | ReplaceStateDetail
  | UpdateNodesByReactFlowDetail
  | UpdateEdgesByReactFlowDetail
  | UpdateInputValueDetail
  | UpdateNodeTypeDetail
  | AddLoopDetail;

type ActionType = keyof typeof actionTypesMap;

// ────────────────────────────────────────────────────────────────────
// GraphEvent union
// ────────────────────────────────────────────────────────────────────

type GraphEvent<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> =
  // === Reducer events — exactly one fires per dispatch (when validateAction returns non-null) ===
  | {
      kind: 'action:applied';
      actionType: ActionType;
      /**
       * Action-specific success-path payload. Use `detail.kind` to narrow.
       * Optional because some actions (e.g. UPDATE_NODE_BY_REACT_FLOW) carry
       * no useful identifier worth surfacing.
       */
      detail?: ActionDetail<NodeTypeUniqueId>;
    }
  | {
      kind: 'action:rejected';
      actionType: ActionType;
      /**
       * Full validation error. Switch on `.code` for the rejection reason
       * — e.g. `'LOOP_PATH_INVALID'`, `'CYCLE_DETECTED'`,
       * `'COMPLEX_TYPE_MISMATCH'`. See `planApply/types.ts` for the full
       * taxonomy.
       */
      error: ValidationError;
    }

  // === Render-commit barrier — fires after React commits state changes ===
  | {
      kind: 'state:committed';
      nodeCount: number;
      edgeCount: number;
    }

  // === UI-only events — emitted by <FullGraph> for ReactFlow lifecycle ===
  | {
      kind: 'ui:drag:ended';
      /** ReactFlow's `connectionState.isValid` — null if no target reached. */
      isValid: boolean | null;
    }
  | {
      kind: 'ui:delete:attempted';
      /** Whether the wrapped onBeforeDelete validator approved the delete. */
      success: boolean;
      /** Validator's reason on rejection (e.g. V9/V10 violation text). */
      reason?: string;
      nodeIds: string[];
      edgeIds: string[];
    }
  | {
      kind: 'ui:state:imported';
      success: boolean;
      /** When success=false, parser/validator errors. */
      errors?: string[];
      /**
       * When success=true, the imported state — same shape as `State<...>`.
       * `unknown` at the public boundary because the imported state's
       * generics may not match the consumer's runtime types until the
       * import has been merged with live `dataTypes` / `typeOfNodes`.
       */
      state?: State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >;
    }
  | {
      kind: 'ui:recording:imported';
    };

// ────────────────────────────────────────────────────────────────────
// deriveActionEvent — turns a (action, validation result) pair into a
// reducer-layer GraphEvent. Used by the wrapped dispatch in useFullGraph.
// ────────────────────────────────────────────────────────────────────

/**
 * Map a Plan to its corresponding ActionDetail, when extractable from
 * the plan alone (no state diff needed).
 *
 * For action kinds that mint random ids (ADD_NODE, ADD_EDGE,
 * ADD_NODE_GROUP), this function returns `undefined` — those ids don't
 * exist until `applyPlan` runs. Stage 2's store-side dispatch fills in
 * the details by post-apply state diff (see `deriveAppliedDetailFromDiff`).
 */
function planToDetail<NodeTypeUniqueId extends string = string>(
  action: Action<string, NodeTypeUniqueId>,
  plan: Plan,
): ActionDetail<NodeTypeUniqueId> | undefined {
  switch (plan.kind) {
    case 'ADD_NODE':
    case 'ADD_EDGE':
    case 'ADD_NODE_GROUP':
      // Ids live in the post-apply state, not the plan. Caller fills these
      // in via `deriveAppliedDetailFromDiff` once apply has run.
      return undefined;
    case 'OPEN_NODE_GROUP':
      return {
        kind: 'OPEN_NODE_GROUP',
        nodeType: plan.pushEntry.nodeType,
        nodeId: plan.pushEntry.nodeId,
      };
    case 'CLOSE_NODE_GROUP':
      return { kind: 'CLOSE_NODE_GROUP' };
    case 'SET_VIEWPORT':
      return { kind: 'SET_VIEWPORT' };
    case 'REPLACE_STATE':
      return { kind: 'REPLACE_STATE' };
    case 'UPDATE_NODES_RF':
      return { kind: 'UPDATE_NODE_BY_REACT_FLOW' };
    case 'UPDATE_EDGES_RF':
      return { kind: 'UPDATE_EDGES_BY_REACT_FLOW' };
    case 'UPDATE_INPUT_VALUE':
      // UPDATE_INPUT_VALUE plan is a stub today (validateAction returns NOOP),
      // so this branch is currently unreachable — keep it for forward compat
      // in case the action gets implemented.
      void action;
      return undefined;
    case 'UPDATE_NODE_TYPE':
      return {
        kind: 'UPDATE_NODE_TYPE',
        nodeTypeId: plan.nodeTypeId,
        updates: plan.updates,
      };
    case 'ADD_LOOP':
      return { kind: 'ADD_LOOP' };
    default: {
      const _exhaustive: never = plan;
      void _exhaustive;
      return undefined;
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Diff-aware applied-event derivation
// ────────────────────────────────────────────────────────────────────
//
// For action kinds that mint new ids (ADD_NODE, ADD_EDGE, ADD_NODE_GROUP),
// the only honest source of those ids is the post-apply state. The store
// runs `validateAction → applyPlan` then calls `deriveAppliedEvent(action,
// plan, prev, next)`; this function picks ids out of `next` by set
// difference against `prev` and returns a fully-populated detail.
//
// For non-minting plans, this delegates to `planToDetail` which only
// needs the action + plan.

function diffAppliedDetail<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never,
>(
  action: Action<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  plan: Plan,
  prev: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  next: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): ActionDetail<NodeTypeUniqueId> | undefined {
  switch (plan.kind) {
    case 'ADD_NODE': {
      // Set-difference on node ids. Apply for ADD_NODE pushes exactly one
      // new node, so there's exactly one new id.
      const prevIds = new Set(prev.nodes.map((n) => n.id));
      const newNode = next.nodes.find((n) => !prevIds.has(n.id));
      if (!newNode) return undefined;
      // We know action.type is ADD_NODE or ADD_NODE_AND_SELECT here because
      // validateAction emitted an ADD_NODE plan only for those.
      if (
        action.type !== actionTypesMap.ADD_NODE &&
        action.type !== actionTypesMap.ADD_NODE_AND_SELECT
      ) {
        return undefined;
      }
      return {
        kind: 'ADD_NODE',
        selectExclusively: plan.selectExclusively,
        nodeId: newNode.id,
        nodeType: action.payload.type,
        position: action.payload.position,
      };
    }
    case 'ADD_EDGE': {
      const prevIds = new Set(prev.edges.map((e) => e.id));
      const newEdge = next.edges.find((e) => !prevIds.has(e.id));
      if (!newEdge) return undefined;
      if (action.type !== actionTypesMap.ADD_EDGE_BY_REACT_FLOW) {
        return undefined;
      }
      return {
        kind: 'ADD_EDGE',
        edgeId: newEdge.id,
        connection: action.payload.edge,
      };
    }
    case 'ADD_NODE_GROUP': {
      const prevTypes = new Set(Object.keys(prev.typeOfNodes));
      const newNodeTypeId = Object.keys(next.typeOfNodes).find(
        (k) => !prevTypes.has(k),
      );
      if (!newNodeTypeId) return undefined;
      return { kind: 'ADD_NODE_GROUP', newNodeTypeId };
    }
    default:
      // For non-minting plans the regular planToDetail handles it.
      return planToDetail<NodeTypeUniqueId>(
        action as Action<string, NodeTypeUniqueId>,
        plan,
      );
  }
}

/**
 * Build a fully-populated `action:applied` event after the plan has
 * been applied and `next` is the new state. Use from a context that
 * has both states (the external store).
 */
function deriveAppliedEvent<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  action: Action<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  plan: Plan,
  prev: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  next: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): GraphEvent<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  return {
    kind: 'action:applied',
    actionType: action.type,
    detail: diffAppliedDetail(action, plan, prev, next),
  };
}

/**
 * Build an `action:rejected` event from a validation error. Pure data
 * shaping — no state diff needed.
 */
function deriveRejectedEvent<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  action: Action<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  error: ValidationError,
): GraphEvent<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  return {
    kind: 'action:rejected',
    actionType: action.type,
    error,
  };
}

/**
 * Legacy single-step derivation — only handles non-minting plans
 * (id-bearing details come back as `detail: undefined`). Kept for
 * backward compatibility with any code that imports it; new code
 * should use `deriveAppliedEvent` / `deriveRejectedEvent`.
 *
 * @deprecated Prefer `deriveAppliedEvent(action, plan, prev, next)` +
 * `deriveRejectedEvent(action, error)`.
 */
function deriveActionEvent<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  action: Action<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  result: Result<Plan, ValidationError>,
): GraphEvent<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  if (result.ok) {
    return {
      kind: 'action:applied',
      actionType: action.type,
      detail: planToDetail<NodeTypeUniqueId>(
        action as Action<string, NodeTypeUniqueId>,
        result.value,
      ),
    };
  }
  return deriveRejectedEvent(action, result.error);
}

// ────────────────────────────────────────────────────────────────────

export { deriveActionEvent, deriveAppliedEvent, deriveRejectedEvent };
export type {
  GraphEvent,
  ActionDetail,
  ActionType,
  AddNodeDetail,
  AddEdgeDetail,
  AddNodeGroupDetail,
  OpenNodeGroupDetail,
  CloseNodeGroupDetail,
  SetViewportDetail,
  ReplaceStateDetail,
  UpdateNodesByReactFlowDetail,
  UpdateEdgesByReactFlowDetail,
  UpdateInputValueDetail,
  AddLoopDetail,
};
