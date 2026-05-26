import type { Viewport, XYPosition } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Result type — standard sum type for validation outcomes
// ---------------------------------------------------------------------------

export type Result<T, E = ValidationError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Construct a successful Result. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Construct a failed Result. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Validation error taxonomy — machine-readable codes, not string messages
// ---------------------------------------------------------------------------

export type ValidationError =
  | { code: 'DUPLICATE_EDGE'; sourceHandle: string; targetHandle: string }
  | { code: 'CYCLE_DETECTED'; sourceNodeId: string; targetNodeId: string }
  | {
      code: 'MISSING_ENDPOINT';
      which: 'source' | 'target' | 'sourceHandle' | 'targetHandle';
      detail: string;
    }
  | { code: 'LOOP_PATH_INVALID'; reason: string }
  | { code: 'SWITCH_PATH_INVALID'; reason: string }
  | { code: 'TYPE_INFERENCE_FAILED'; reason: string }
  | {
      code: 'COMPLEX_TYPE_MISMATCH';
      sourceTypeId: string;
      targetTypeId: string;
    }
  | { code: 'CONVERSION_NOT_ALLOWED'; from: string; to: string }
  | { code: 'NODE_TYPE_NOT_FOUND'; nodeType: string }
  | { code: 'INVALID_NODE_GROUP'; reason: string }
  | { code: 'EMPTY_STACK'; action: string }
  | {
      code: 'NODE_COUNT_CONSTRAINT_VIOLATED';
      nodeType: string;
      constraintKind:
        | 'maxAcrossAllNodes'
        | 'minAcrossAllNodes'
        | 'maxWithinANodeGroup'
        | 'minWithinANodeGroup'
        | 'maxInRoot'
        | 'minInRoot';
      limit: number;
      currentCount: number;
    }
  | { code: 'NOOP'; reason: string };

// ---------------------------------------------------------------------------
// Inference plan — describes handle type changes without performing them
// ---------------------------------------------------------------------------

export type InferencePlan = {
  /**
   * Node data replacements: each entry replaces a node's entire `data` field.
   *
   * Uses `unknown` for `newData` because the actual type is
   * `InstantiatedNodeData<D,N,U,C>` which varies per generic instantiation.
   * The applier receives the draft and can assign without narrowing.
   */
  nodeDataReplacements: Array<{ nodeId: string; newData: unknown }>;
};

// ---------------------------------------------------------------------------
// Handle insertion — describes a handle to add to a node
// ---------------------------------------------------------------------------

export type HandleInsertion = {
  nodeId: string;
  at: {
    type: 'input' | 'output';
    index1: number;
    index2: number | undefined;
  };
  /** `TypeOfInput<DataTypeUniqueId>` — generic, use `unknown` at boundary. */
  handle: unknown;
};

// ---------------------------------------------------------------------------
// Per-action Plan types (discriminated union on `kind`)
// ---------------------------------------------------------------------------

export type SetViewportPlan = {
  kind: 'SET_VIEWPORT';
  viewport: Viewport;
};

export type ReplaceStatePlan = {
  kind: 'REPLACE_STATE';
  /** `State<D,N,U,C>` — generic, stored as `unknown` at this boundary. */
  state: unknown;
};

/**
 * Pure-intent plan: validate decided "we will add a node of THIS type at
 * THIS position". The id and the constructed node object are not yet
 * computed — that's `applyPlan`'s job. Keeping id minting out of the
 * Plan keeps validate fully deterministic (callable any number of times
 * for the same (state, action) yielding the same Plan).
 *
 * `nodeType` is `string` rather than `NodeTypeUniqueId` because Plan is a
 * non-generic union — applyPlan re-asserts the type via its own generic.
 */
export type AddNodePlan = {
  kind: 'ADD_NODE';
  nodeType: string;
  position: XYPosition;
  selectExclusively: boolean;
};

export type UpdateNodesByReactFlowPlan = {
  kind: 'UPDATE_NODES_RF';
  /** `NodeChange[]` from ReactFlow. */
  changes: unknown;
};

export type UpdateInputValuePlan = {
  kind: 'UPDATE_INPUT_VALUE';
  nodeId: string;
  inputId: string;
  value: string | number;
};

export type OpenNodeGroupPlan = {
  kind: 'OPEN_NODE_GROUP';
  pushEntry: {
    nodeType: string;
    nodeId?: string;
    previousViewport: unknown;
  };
};

export type CloseNodeGroupPlan = {
  kind: 'CLOSE_NODE_GROUP';
  /** `Viewport | undefined` — restore the viewport when popping a group. */
  restoreViewport: unknown;
};

/**
 * Pure-intent plan: validate decided "we will add a new node group". The
 * new nodeType id, the input/output ids, and the constructed group type
 * are deferred to applyPlan. validate returns just the snapshot of
 * `previousViewport` so apply can stash it on the new stack entry.
 */
export type AddNodeGroupPlan = {
  kind: 'ADD_NODE_GROUP';
  previousViewport: unknown;
};

/**
 * Pure-intent plan: validate decided "this Connection passes all rules".
 * The edge id and the constructed edge object are deferred to applyPlan.
 * Inference replacements ARE pre-computed because they depend on detailed
 * state inspection that doesn't repeat well — but they carry node ids
 * (existing, not freshly minted), so they remain deterministic.
 */
export type AddEdgePlan = {
  kind: 'ADD_EDGE';
  /** The validated Connection from action.payload — used to construct the edge in apply. */
  connection: {
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  };
  inference: InferencePlan;
  handleInsertions: HandleInsertion[];
};

export type EdgeChangeStep =
  | { kind: 'passthrough'; change: unknown }
  | {
      kind: 'removal';
      updatedNodes: unknown;
      updatedEdges: unknown;
      validation: { isValid: boolean };
    };

export type UpdateEdgesByReactFlowPlan = {
  kind: 'UPDATE_EDGES_RF';
  steps: EdgeChangeStep[];
};

export type UpdateNodeTypePlan = {
  kind: 'UPDATE_NODE_TYPE';
  nodeTypeId: string;
  updates: {
    name?: string;
    headerColor?: string;
    /** Reordered/re-paneled inputs. Generic boundary — stored as `unknown[]`. */
    inputs?: unknown[];
    /** Reordered outputs. Generic boundary — stored as `unknown[]`. */
    outputs?: unknown[];
  };
};

export type AddLoopPlan = {
  kind: 'ADD_LOOP';
  position: XYPosition;
};

export type UpdateLoopPlan = {
  kind: 'UPDATE_LOOP';
  loopStartNodeId: string;
  loopStopNodeId: string;
  loopEndNodeId: string;
  levels: Array<{
    handles: {
      loopStartIn: { id: string; name: string };
      loopStartOut: { id: string; name: string };
      loopStopIn: { id: string; name: string };
      loopStopOut: { id: string; name: string };
      loopEndIn: { id: string; name: string };
      loopEndOut: { id: string; name: string };
    };
  }>;
};

export type AddSwitchPlan = {
  kind: 'ADD_SWITCH';
  position: XYPosition;
};

export type UpdateSwitchPlan = {
  kind: 'UPDATE_SWITCH';
  switchStartNodeId: string;
  switchEndNodeId: string;
  levels: Array<{
    handles: {
      switchStartIn: { id: string; name: string };
      switchStartTrueOut: { id: string; name: string };
      switchStartFalseOut: { id: string; name: string };
      switchEndTrueIn: { id: string; name: string };
      switchEndFalseIn: { id: string; name: string };
      switchEndOut: { id: string; name: string };
    };
  }>;
};

export type OpenDrawerPlan = {
  kind: 'OPEN_DRAWER';
  activeDrawer: unknown;
};

export type CloseDrawerPlan = {
  kind: 'CLOSE_DRAWER';
};

// ---------------------------------------------------------------------------
// The union of all Plan types
// ---------------------------------------------------------------------------

export type Plan =
  | SetViewportPlan
  | ReplaceStatePlan
  | AddNodePlan
  | UpdateNodesByReactFlowPlan
  | UpdateInputValuePlan
  | OpenNodeGroupPlan
  | CloseNodeGroupPlan
  | AddNodeGroupPlan
  | AddEdgePlan
  | UpdateEdgesByReactFlowPlan
  | UpdateNodeTypePlan
  | AddLoopPlan
  | UpdateLoopPlan
  | OpenDrawerPlan
  | CloseDrawerPlan
  | AddSwitchPlan
  | UpdateSwitchPlan;
