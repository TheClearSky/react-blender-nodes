import type { z } from 'zod';
import type { State, SupportedUnderlyingTypes } from '../types';
import {
  collectConnectionsInScope,
  getScopeNodesEdges,
} from './handleDeletionAnalysis';
import type {
  ConnectionRef,
  HandleBlastRadius,
  HandleDeletionTarget,
} from './handleDeletionAnalysis';

/**
 * Pure analysis for deleting a whole data CHANNEL from a loop triplet or a
 * switch pair.
 *
 * Unlike node-type handle deletion (which spans root + every dependent group +
 * the type's own interior, and is matched by `name::dataType`), a loop/switch
 * channel is a set of concrete instance handle IDs living in a SINGLE scope (the
 * root graph, or the group subtree currently open). So this engine is much
 * simpler: resolve the one scope, collect every edge touching any of the
 * channel's handle IDs, and report it. Both the UI preview
 * (`computeChannelBlastRadius`) and the apply-time cascade
 * (`computeChannelDeletionCascade`) are derived here so the warning the user
 * sees and the edges actually removed are identical.
 *
 * The blast radius is shaped as a `HandleBlastRadius` with exactly ONE scope so
 * the existing `HandleSummaryModal`/`DeletionReviewModal` render it unchanged.
 */

/** A complex-schema generic constrained exactly as `State` constrains it. */
type Complex<UnderlyingType extends SupportedUnderlyingTypes> =
  UnderlyingType extends 'complex' ? z.ZodType : never;

type HandleRef = { id: string; name: string };

/** Handle IDs to drop from one node. */
type ChannelHandleRemoval = { nodeId: string; handleIds: string[] };

/** A channel deletion described independently of loop vs switch. */
type ChannelDeletionRequest = {
  /** `'root'` or a group type id — resolvable by `getScopeNodesEdges`. */
  scopeId: string;
  scopeLabel: string;
  /** Display only (the modal header / review checkbox); not used by the cascade. */
  target: HandleDeletionTarget;
  /** The channel's handles, grouped by the node they live on. */
  removals: ChannelHandleRemoval[];
};

/** Everything the apply step needs to remove one channel. */
type ChannelDeletionPlanData = {
  scopeId: string;
  /** Edge ids in `scopeId` touching any of the channel's handles. */
  edgeIds: string[];
  removals: ChannelHandleRemoval[];
};

/** The six handles of a loop channel, by triplet slot. */
type LoopChannelHandles = {
  loopStartIn: HandleRef;
  loopStartOut: HandleRef;
  loopStopIn: HandleRef;
  loopStopOut: HandleRef;
  loopEndIn: HandleRef;
  loopEndOut: HandleRef;
};

/** The six handles of a switch channel, by pair slot (true/false split). */
type SwitchChannelHandles = {
  switchStartIn: HandleRef;
  switchStartTrueOut: HandleRef;
  switchStartFalseOut: HandleRef;
  switchEndTrueIn: HandleRef;
  switchEndFalseIn: HandleRef;
  switchEndOut: HandleRef;
};

/** Collect (deduped by edge id) every connection touching the channel's handles
 *  within its single scope, with display names resolved for the mini-map. */
function collectChannelConnections<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType> = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  request: ChannelDeletionRequest,
): ConnectionRef[] {
  const scope = getScopeNodesEdges(state, request.scopeId);
  if (!scope) return [];

  const typeNames = new Map<string, string>();
  for (const id of Object.keys(state.typeOfNodes) as NodeTypeUniqueId[]) {
    typeNames.set(id, state.typeOfNodes[id].name);
  }
  const nodeById = new Map(scope.nodes.map((n) => [n.id, n]));
  const handleNameCache = new Map<string, Map<string, string>>();

  const seen = new Set<string>();
  const refs: ConnectionRef[] = [];
  for (const removal of request.removals) {
    for (const handleId of removal.handleIds) {
      const found = collectConnectionsInScope<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(scope.edges, handleId, typeNames, nodeById, handleNameCache);
      for (const ref of found) {
        if (seen.has(ref.edgeId)) continue;
        seen.add(ref.edgeId);
        refs.push(ref);
      }
    }
  }
  return refs;
}

/** The connections that deleting this channel would break (single scope). */
function computeChannelBlastRadius<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType> = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  request: ChannelDeletionRequest,
): HandleBlastRadius {
  const connections = collectChannelConnections(state, request);
  return {
    target: request.target,
    scopes:
      connections.length > 0
        ? [
            {
              scopeId: request.scopeId,
              scopeLabel: request.scopeLabel,
              isOwnInternalSubtree: false,
              instanceManifestations: 1,
              connections,
            },
          ]
        : [],
    totalConnections: connections.length,
  };
}

/** The edge ids + handle removals to apply when deleting this channel. */
function computeChannelDeletionCascade<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType> = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  request: ChannelDeletionRequest,
): ChannelDeletionPlanData {
  const connections = collectChannelConnections(state, request);
  return {
    scopeId: request.scopeId,
    edgeIds: connections.map((c) => c.edgeId),
    removals: request.removals,
  };
}

/** Map a loop channel (its six handles + the triplet node ids) to a request. */
function loopChannelToRequest(
  scopeId: string,
  scopeLabel: string,
  ids: { loopStartId: string; loopStopId: string; loopEndId: string },
  channel: { handles: LoopChannelHandles; dataTypeUniqueId: string },
): ChannelDeletionRequest {
  const h = channel.handles;
  return {
    scopeId,
    scopeLabel,
    target: {
      direction: 'input',
      handleName: h.loopStartIn.name || 'Channel',
      handleDataTypeId: channel.dataTypeUniqueId,
    },
    removals: [
      {
        nodeId: ids.loopStartId,
        handleIds: [h.loopStartIn.id, h.loopStartOut.id],
      },
      {
        nodeId: ids.loopStopId,
        handleIds: [h.loopStopIn.id, h.loopStopOut.id],
      },
      { nodeId: ids.loopEndId, handleIds: [h.loopEndIn.id, h.loopEndOut.id] },
    ],
  };
}

/** Map a switch channel (its six handles + the pair node ids) to a request. */
function switchChannelToRequest(
  scopeId: string,
  scopeLabel: string,
  ids: { switchStartId: string; switchEndId: string },
  channel: { handles: SwitchChannelHandles; dataTypeUniqueId: string },
): ChannelDeletionRequest {
  const h = channel.handles;
  return {
    scopeId,
    scopeLabel,
    target: {
      direction: 'input',
      handleName: h.switchStartIn.name || 'Channel',
      handleDataTypeId: channel.dataTypeUniqueId,
    },
    removals: [
      {
        nodeId: ids.switchStartId,
        handleIds: [
          h.switchStartIn.id,
          h.switchStartTrueOut.id,
          h.switchStartFalseOut.id,
        ],
      },
      {
        nodeId: ids.switchEndId,
        handleIds: [
          h.switchEndTrueIn.id,
          h.switchEndFalseIn.id,
          h.switchEndOut.id,
        ],
      },
    ],
  };
}

export {
  computeChannelBlastRadius,
  computeChannelDeletionCascade,
  loopChannelToRequest,
  switchChannelToRequest,
};
export type {
  ChannelDeletionRequest,
  ChannelDeletionPlanData,
  ChannelHandleRemoval,
  LoopChannelHandles,
  SwitchChannelHandles,
};
