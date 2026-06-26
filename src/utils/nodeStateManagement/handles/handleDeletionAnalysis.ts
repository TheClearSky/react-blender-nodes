import type { z } from 'zod';
import type { Node, Edge } from '@xyflow/react';
import type {
  State,
  SupportedUnderlyingTypes,
  TypeOfInput,
  TypeOfInputPanel,
} from '../types';
import { getDirectDependentsOfNodeType } from '../nodes/constructAndModifyNodes';
import { handleKey } from './handleKey';

/**
 * Pure analysis for deleting input/output handles from a node type.
 *
 * Handles live on the node *type* (`TypeOfNode.inputs/outputs`) and are
 * inherited by every instance. Deleting one therefore breaks edges in several
 * *state scopes*:
 *   - the root graph (`state.edges`) — one concrete edge per root instance;
 *   - every group type whose subtree contains an instance of the edited type
 *     (`getDirectDependentsOfNodeType`) — definitional edges in
 *     `<group>.subtree.edges` that manifest in all of that group's instances;
 *   - the edited type's *own* interior, when it is a group — the boundary
 *     handle on its `groupInput`/`groupOutput` node and the internal edge(s)
 *     wired to it (`<type>.subtree.edges`).
 *
 * `getDirectDependentsOfNodeType` scans every type in `typeOfNodes`, so the
 * scope set `root + directDependents + own-subtree` is COMPLETE regardless of
 * how deeply a containing group is itself nested — there is no need for a
 * recursive walk.
 *
 * Both the UI preview (`computeHandleBlastRadius`) and the apply-time cascade
 * (`computeDeletionCascade`) are derived here so the warning the user sees and
 * the edges actually removed are guaranteed identical.
 *
 * Types are threaded from `State<DataTypeUniqueId, NodeTypeUniqueId,
 * UnderlyingType, ComplexSchemaType>` via indexed-access element types
 * (`State<…>['nodes'][number]`, `State<…>['edges'][number]`) — no structural
 * shadow types, no `as` erasure.
 */

type HandleDirection = 'input' | 'output';

/**
 * A handle targeted for deletion, identified structurally. Drag-list item ids
 * in the editor are regenerated and do NOT equal instance handle ids, so a
 * handle is addressed by its direction + `name::dataType` instead.
 */
type HandleDeletionTarget = {
  direction: HandleDirection;
  handleName: string;
  handleDataTypeId: string;
};

/** One edge that will break, with enough info to render a mini-diagram. */
type ConnectionRef = {
  edgeId: string;
  sourceNodeId: string;
  sourceNodeName: string;
  sourceHandleName: string;
  targetNodeId: string;
  targetNodeName: string;
  targetHandleName: string;
};

/** Connections grouped under one state scope. */
type ScopeConnections = {
  /** `'root'` for the root graph, the group type id for a subtree, or
   *  `'<typeId>::own'` for the edited group's own interior. */
  scopeId: string;
  scopeLabel: string;
  /** True when this scope is the edited group's own interior (boundary edges). */
  isOwnInternalSubtree: boolean;
  /** How many live instances a definitional scope manifests in (root = 1). A
   *  hint for the UI ("appears in N place(s)"); from `numberOfReferences`. */
  instanceManifestations: number;
  connections: ConnectionRef[];
};

/** The full set of connections that deleting a single handle would break. */
type HandleBlastRadius = {
  target: HandleDeletionTarget;
  scopes: ScopeConnections[];
  totalConnections: number;
};

/** Boundary handle on a group's groupInput/groupOutput node to remove. */
type BoundaryHandleRemoval = {
  boundaryNodeId: string;
  handleId: string;
};

/**
 * Serialisable description of everything a deletion mutates. Computed once at
 * validate time and consumed by apply, so apply performs exactly the edits the
 * preview promised.
 */
type HandleDeletionPlanData = {
  /** Rewritten type-level arrays with the deleted handles removed. */
  newInputs: (TypeOfInput | TypeOfInputPanel)[];
  newOutputs: TypeOfInput[];
  /** Deleted handle keys (`name::dataType`) used to splice instances. */
  deletedInputKeys: string[];
  deletedOutputKeys: string[];
  /** Edge ids to remove from the root graph (`state.edges`). */
  rootEdgeIds: string[];
  /** Edge ids to remove per dependent group subtree (`<id>.subtree.edges`). */
  subtreeEdgeIds: Record<string, string[]>;
  /** Edge ids to remove from the edited type's own subtree (boundary edges). */
  ownSubtreeEdgeIds: string[];
  /** Boundary handles to remove from the edited group's groupInput/groupOutput. */
  ownBoundaryHandleRemovals: BoundaryHandleRemoval[];
};

/* -------------------------------------------------------------------------- */
/* Real element types, derived from State via indexed access                  */
/* -------------------------------------------------------------------------- */

/** A complex-schema generic constrained exactly as `State` constrains it. */
type Complex<UnderlyingType extends SupportedUnderlyingTypes> =
  UnderlyingType extends 'complex' ? z.ZodType : never;

/** One node element of the (root or subtree) node array. */
type AnalysisNode<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
> = State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>['nodes'][number];

/** One edge element. `State['edges']` is the non-generic `Edges`. */
type AnalysisEdge = State['edges'][number];

/**
 * Visit every leaf handle on a node in the given direction, expanding input
 * panels into their child handles. Inputs are a `(handle | panel)` union
 * discriminated by the presence of `inputs`; outputs are flat.
 */
function eachHandleInDirection<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
>(
  node: AnalysisNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  direction: HandleDirection,
  cb: (handle: {
    id: string;
    name: string;
    dataType?: { dataTypeUniqueId: DataTypeUniqueId };
  }) => void,
): void {
  if (direction === 'input') {
    for (const entry of node.data?.inputs ?? []) {
      if ('inputs' in entry) {
        for (const sub of entry.inputs) cb(sub);
      } else {
        cb(entry);
      }
    }
  } else {
    for (const out of node.data?.outputs ?? []) cb(out);
  }
}

/** Find the id of the handle on `node` (in the given direction) whose
 *  `name::dataType` matches `targetKey`. */
function findInstanceHandleId<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
>(
  node: AnalysisNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  direction: HandleDirection,
  targetKey: string,
): string | undefined {
  let found: string | undefined;
  eachHandleInDirection(node, direction, (handle) => {
    if (found !== undefined) return;
    if (
      handleKey(handle.name, handle.dataType?.dataTypeUniqueId) === targetKey
    ) {
      found = handle.id;
    }
  });
  return found;
}

/** Map handle id -> handle name across all of a node's handles. */
function buildHandleIdToName<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
>(
  node: AnalysisNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): Map<string, string> {
  const map = new Map<string, string>();
  const add = (handle: { id: string; name: string }) => {
    map.set(handle.id, handle.name);
  };
  eachHandleInDirection(node, 'input', add);
  eachHandleInDirection(node, 'output', add);
  return map;
}

function resolveNodeName<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
>(
  node: AnalysisNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  typeNames: Map<string, string>,
): string {
  if (node.data?.name) return node.data.name;
  const typeId = node.data?.nodeTypeUniqueId;
  if (typeId && typeNames.has(typeId)) return typeNames.get(typeId) ?? node.id;
  return node.id;
}

/** Collect every edge in a scope that references `handleId` (as source or
 *  target), resolving endpoint node/handle names for display. */
function collectConnectionsInScope<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
>(
  scopeEdges: readonly AnalysisEdge[],
  handleId: string,
  typeNames: Map<string, string>,
  nodeById: Map<
    string,
    AnalysisNode<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >,
  handleNameCache: Map<string, Map<string, string>>,
): ConnectionRef[] {
  const handleNames = (
    node:
      | AnalysisNode<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >
      | undefined,
  ): Map<string, string> => {
    if (!node) return new Map();
    let cached = handleNameCache.get(node.id);
    if (!cached) {
      cached = buildHandleIdToName(node);
      handleNameCache.set(node.id, cached);
    }
    return cached;
  };

  const refs: ConnectionRef[] = [];
  for (const edge of scopeEdges) {
    if (edge.sourceHandle !== handleId && edge.targetHandle !== handleId) {
      continue;
    }
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    refs.push({
      edgeId: edge.id,
      sourceNodeId: edge.source,
      sourceNodeName: sourceNode
        ? resolveNodeName(sourceNode, typeNames)
        : edge.source,
      sourceHandleName:
        handleNames(sourceNode).get(edge.sourceHandle ?? '') ?? '',
      targetNodeId: edge.target,
      targetNodeName: targetNode
        ? resolveNodeName(targetNode, typeNames)
        : edge.target,
      targetHandleName:
        handleNames(targetNode).get(edge.targetHandle ?? '') ?? '',
    });
  }
  return refs;
}

/* -------------------------------------------------------------------------- */
/* Scope enumeration                                                          */
/* -------------------------------------------------------------------------- */

type Scope<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
> = {
  scopeId: string;
  scopeLabel: string;
  nodes: readonly AnalysisNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >[];
  edges: readonly AnalysisEdge[];
  isOwnInternalSubtree: boolean;
  instanceManifestations: number;
};

function buildTypeNames<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): Map<string, string> {
  const map = new Map<string, string>();
  // `Object.keys` is typed `string[]`; the keys of `typeOfNodes` are `NodeTypeUniqueId`.
  for (const id of Object.keys(state.typeOfNodes) as NodeTypeUniqueId[]) {
    map.set(id, state.typeOfNodes[id].name);
  }
  return map;
}

/**
 * Ordered list of scopes that can contain edges referencing `nodeTypeId`'s
 * handles: root, every direct dependent group's subtree, and (if the edited
 * type is itself a group) its own interior.
 */
function enumerateScopes<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  nodeTypeId: NodeTypeUniqueId,
): Scope<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>[] {
  const scopes: Scope<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >[] = [];

  scopes.push({
    scopeId: 'root',
    scopeLabel: 'Root graph',
    nodes: state.nodes,
    edges: state.edges,
    isOwnInternalSubtree: false,
    instanceManifestations: 1,
  });

  const dependents = getDirectDependentsOfNodeType(state, nodeTypeId);
  for (const depType of dependents) {
    if (depType === nodeTypeId) continue; // guard against self (recursion)
    const subtree = state.typeOfNodes[depType]?.subtree;
    if (!subtree) continue;
    scopes.push({
      scopeId: depType,
      scopeLabel: `Inside group "${state.typeOfNodes[depType].name}"`,
      nodes: subtree.nodes,
      edges: subtree.edges,
      isOwnInternalSubtree: false,
      instanceManifestations: subtree.numberOfReferences,
    });
  }

  const ownSubtree = state.typeOfNodes[nodeTypeId]?.subtree;
  if (ownSubtree) {
    scopes.push({
      scopeId: `${nodeTypeId}::own`,
      scopeLabel: 'Inside this group',
      nodes: ownSubtree.nodes,
      edges: ownSubtree.edges,
      isOwnInternalSubtree: true,
      instanceManifestations: ownSubtree.numberOfReferences,
    });
  }

  return scopes;
}

/**
 * For the edited type's own interior, a type *input* maps to an *output*
 * handle on the `groupInput` node, and a type *output* maps to an *input*
 * handle on the `groupOutput` node (mirrors `reconstructAllInstances`).
 */
function getOwnBoundary<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  nodeTypeId: NodeTypeUniqueId,
  direction: HandleDirection,
):
  | {
      boundaryNode: AnalysisNode<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >;
      boundaryDirection: HandleDirection;
    }
  | undefined {
  const subtree = state.typeOfNodes[nodeTypeId]?.subtree;
  if (!subtree) return undefined;
  const boundaryNodeId =
    direction === 'input' ? subtree.inputNodeId : subtree.outputNodeId;
  const boundaryNode = subtree.nodes.find((n) => n.id === boundaryNodeId);
  if (!boundaryNode) return undefined;
  return {
    boundaryNode,
    boundaryDirection: direction === 'input' ? 'output' : 'input',
  };
}

/* -------------------------------------------------------------------------- */
/* Public: blast radius (single handle, for the UI summary)                   */
/* -------------------------------------------------------------------------- */

function computeHandleBlastRadius<
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
  nodeTypeId: NodeTypeUniqueId,
  target: HandleDeletionTarget,
): HandleBlastRadius {
  const typeNames = buildTypeNames(state);
  const targetKey = handleKey(target.handleName, target.handleDataTypeId);
  const scopes: ScopeConnections[] = [];

  for (const scope of enumerateScopes(state, nodeTypeId)) {
    const nodeById = new Map(scope.nodes.map((n) => [n.id, n]));
    const handleNameCache = new Map<string, Map<string, string>>();
    const connections: ConnectionRef[] = [];

    if (scope.isOwnInternalSubtree) {
      const boundary = getOwnBoundary(state, nodeTypeId, target.direction);
      if (boundary) {
        const handleId = findInstanceHandleId(
          boundary.boundaryNode,
          boundary.boundaryDirection,
          targetKey,
        );
        if (handleId) {
          connections.push(
            ...collectConnectionsInScope(
              scope.edges,
              handleId,
              typeNames,
              nodeById,
              handleNameCache,
            ),
          );
        }
      }
    } else {
      for (const node of scope.nodes) {
        if (node.data?.nodeTypeUniqueId !== nodeTypeId) continue;
        const handleId = findInstanceHandleId(
          node,
          target.direction,
          targetKey,
        );
        if (!handleId) continue;
        connections.push(
          ...collectConnectionsInScope(
            scope.edges,
            handleId,
            typeNames,
            nodeById,
            handleNameCache,
          ),
        );
      }
    }

    if (connections.length > 0) {
      scopes.push({
        scopeId: scope.scopeId,
        scopeLabel: scope.scopeLabel,
        isOwnInternalSubtree: scope.isOwnInternalSubtree,
        instanceManifestations: scope.instanceManifestations,
        connections,
      });
    }
  }

  const totalConnections = scopes.reduce(
    (sum, scope) => sum + scope.connections.length,
    0,
  );
  return { target, scopes, totalConnections };
}

/* -------------------------------------------------------------------------- */
/* Public: root Graph I/O blast radius (single handle on a root boundary node) */
/* -------------------------------------------------------------------------- */

/**
 * Blast radius of deleting a single handle on a ROOT Graph Input / Graph Output
 * node. Unlike `computeHandleBlastRadius` (which works on a node *type* whose
 * handles are inherited by every instance and addressed by `name::dataType`),
 * root Graph I/O handles live on a single instance node in `state.nodes` and are
 * addressed directly by their stable handle id. The only scope that can break is
 * the root graph itself (`state.edges`).
 *
 * Returns the SAME `HandleBlastRadius` shape the deletion modals consume, so
 * `GraphIOEditDrawer` can reuse `HandleSummaryModal` / `DeletionReviewModal`
 * verbatim (and `getConnectionNeighborhood(state, 'root', edgeId)` powers the
 * inline mini-maps).
 */
function computeRootIoHandleBlastRadius<
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
  boundaryNodeId: string,
  handle: { id: string; name: string; direction: HandleDirection },
): HandleBlastRadius {
  const typeNames = buildTypeNames(state);
  const nodeById = new Map(state.nodes.map((node) => [node.id, node]));
  const handleNameCache = new Map<string, Map<string, string>>();

  const connections = collectConnectionsInScope(
    state.edges,
    handle.id,
    typeNames,
    nodeById,
    handleNameCache,
  ).filter(
    // Only edges that actually touch THIS boundary node's handle (the handle id
    // is unique, but keep the boundary-node guard explicit and cheap).
    (connection) =>
      connection.sourceNodeId === boundaryNodeId ||
      connection.targetNodeId === boundaryNodeId,
  );

  const target: HandleDeletionTarget = {
    direction: handle.direction,
    handleName: handle.name,
    handleDataTypeId: '',
  };

  const scopes: ScopeConnections[] =
    connections.length > 0
      ? [
          {
            scopeId: 'root',
            scopeLabel: 'Root graph',
            isOwnInternalSubtree: false,
            instanceManifestations: 1,
            connections,
          },
        ]
      : [];

  return { target, scopes, totalConnections: connections.length };
}

/* -------------------------------------------------------------------------- */
/* Public: full cascade (multiple handles, for validate/apply)               */
/* -------------------------------------------------------------------------- */

function removeFromTypeInputs(
  inputs: (TypeOfInput | TypeOfInputPanel)[],
  deletedKeys: Set<string>,
): (TypeOfInput | TypeOfInputPanel)[] {
  const result: (TypeOfInput | TypeOfInputPanel)[] = [];
  for (const input of inputs) {
    if ('inputs' in input) {
      const keptSub = input.inputs.filter(
        (sub) => !deletedKeys.has(handleKey(sub.name, sub.dataType)),
      );
      // Drop panels that become empty (matches the drawer's empty-panel rule).
      if (keptSub.length > 0) result.push({ ...input, inputs: keptSub });
    } else if (!deletedKeys.has(handleKey(input.name, input.dataType))) {
      result.push(input);
    }
  }
  return result;
}

function removeFromTypeOutputs(
  outputs: TypeOfInput[],
  deletedKeys: Set<string>,
): TypeOfInput[] {
  return outputs.filter((o) => !deletedKeys.has(handleKey(o.name, o.dataType)));
}

function computeDeletionCascade<
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
  nodeTypeId: NodeTypeUniqueId,
  targets: HandleDeletionTarget[],
): HandleDeletionPlanData {
  const nodeTypeDef = state.typeOfNodes[nodeTypeId];

  const inputTargets = targets.filter((t) => t.direction === 'input');
  const outputTargets = targets.filter((t) => t.direction === 'output');
  const deletedInputKeys = inputTargets.map((t) =>
    handleKey(t.handleName, t.handleDataTypeId),
  );
  const deletedOutputKeys = outputTargets.map((t) =>
    handleKey(t.handleName, t.handleDataTypeId),
  );
  const deletedInputKeySet = new Set(deletedInputKeys);
  const deletedOutputKeySet = new Set(deletedOutputKeys);

  const newInputs = removeFromTypeInputs(
    nodeTypeDef.inputs,
    deletedInputKeySet,
  );
  const newOutputs = removeFromTypeOutputs(
    nodeTypeDef.outputs,
    deletedOutputKeySet,
  );

  const rootEdgeIds = new Set<string>();
  const subtreeEdgeIds: Record<string, Set<string>> = {};
  const ownSubtreeEdgeIds = new Set<string>();
  const ownBoundaryHandleRemovals: BoundaryHandleRemoval[] = [];
  const typeNames = buildTypeNames(state);

  for (const scope of enumerateScopes(state, nodeTypeId)) {
    const nodeById = new Map(scope.nodes.map((n) => [n.id, n]));
    const handleNameCache = new Map<string, Map<string, string>>();

    const addEdgeIds = (ids: string[]) => {
      for (const id of ids) {
        if (scope.scopeId === 'root') rootEdgeIds.add(id);
        else if (scope.isOwnInternalSubtree) ownSubtreeEdgeIds.add(id);
        else {
          (subtreeEdgeIds[scope.scopeId] ??= new Set<string>()).add(id);
        }
      }
    };

    if (scope.isOwnInternalSubtree) {
      for (const target of targets) {
        const boundary = getOwnBoundary(state, nodeTypeId, target.direction);
        if (!boundary) continue;
        const targetKey = handleKey(target.handleName, target.handleDataTypeId);
        const handleId = findInstanceHandleId(
          boundary.boundaryNode,
          boundary.boundaryDirection,
          targetKey,
        );
        if (!handleId) continue;
        ownBoundaryHandleRemovals.push({
          boundaryNodeId: boundary.boundaryNode.id,
          handleId,
        });
        addEdgeIds(
          collectConnectionsInScope(
            scope.edges,
            handleId,
            typeNames,
            nodeById,
            handleNameCache,
          ).map((c) => c.edgeId),
        );
      }
    } else {
      for (const node of scope.nodes) {
        if (node.data?.nodeTypeUniqueId !== nodeTypeId) continue;
        for (const target of targets) {
          const targetKey = handleKey(
            target.handleName,
            target.handleDataTypeId,
          );
          const handleId = findInstanceHandleId(
            node,
            target.direction,
            targetKey,
          );
          if (!handleId) continue;
          addEdgeIds(
            collectConnectionsInScope(
              scope.edges,
              handleId,
              typeNames,
              nodeById,
              handleNameCache,
            ).map((c) => c.edgeId),
          );
        }
      }
    }
  }

  return {
    newInputs,
    newOutputs,
    deletedInputKeys,
    deletedOutputKeys,
    rootEdgeIds: [...rootEdgeIds],
    subtreeEdgeIds: Object.fromEntries(
      Object.entries(subtreeEdgeIds).map(([k, v]) => [k, [...v]]),
    ),
    ownSubtreeEdgeIds: [...ownSubtreeEdgeIds],
    ownBoundaryHandleRemovals,
  };
}

/* -------------------------------------------------------------------------- */
/* Public: connection neighborhood (for the inline read-only mini-map)        */
/* -------------------------------------------------------------------------- */

type ConnectionNeighborhood = {
  /** Real ReactFlow node objects (subset) — rendered read-only in the mini-map
   *  with the actual node renderer, so it looks identical to the canvas. */
  nodes: Node[];
  /** Real ReactFlow edge objects (subset). */
  edges: Edge[];
  /** Id of the connection being deleted, so the mini-map can highlight it. */
  highlightEdgeId: string | null;
  /** Multiple connections to highlight at once (e.g. every edge a loop/switch
   *  channel would break). Takes precedence over `highlightEdgeId` when set. */
  highlightEdgeIds?: string[];
};

function getScopeNodesEdges<
  DataTypeUniqueId extends string,
  NodeTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes,
  ComplexSchemaType extends Complex<UnderlyingType>,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  scopeId: string,
):
  | {
      nodes: State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['nodes'];
      edges: State['edges'];
    }
  | undefined {
  if (scopeId === 'root') {
    return { nodes: state.nodes, edges: state.edges };
  }
  // scopeId is a plain string carrying a type id (or `<id>::own`); re-assert the
  // brand to index `typeOfNodes` (string -> NodeTypeUniqueId boundary).
  const typeId = (
    scopeId.endsWith('::own') ? scopeId.slice(0, -'::own'.length) : scopeId
  ) as NodeTypeUniqueId;
  const subtree = state.typeOfNodes[typeId]?.subtree;
  if (!subtree) return undefined;
  return { nodes: subtree.nodes, edges: subtree.edges };
}

/**
 * Local neighborhood around one connection in a scope: the two endpoint nodes,
 * their 1-hop neighbours, and the edges among that node set, with the target
 * edge flagged. Powers the inline read-only mini-map — purely from state data,
 * no canvas navigation.
 */
function getConnectionNeighborhood<
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
  scopeId: string,
  edgeId: string,
): ConnectionNeighborhood {
  const scope = getScopeNodesEdges(state, scopeId);
  if (!scope) return { nodes: [], edges: [], highlightEdgeId: null };

  const targetEdge = scope.edges.find((e) => e.id === edgeId);
  if (!targetEdge) return { nodes: [], edges: [], highlightEdgeId: null };

  const endpointIds = new Set([targetEdge.source, targetEdge.target]);
  const nodeIds = new Set(endpointIds);
  for (const edge of scope.edges) {
    if (endpointIds.has(edge.source)) nodeIds.add(edge.target);
    if (endpointIds.has(edge.target)) nodeIds.add(edge.source);
  }

  return {
    nodes: scope.nodes.filter((n) => nodeIds.has(n.id)),
    edges: scope.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    ),
    highlightEdgeId: edgeId,
  };
}

/**
 * The entire graph at a connection's scope (the root graph, or a group's
 * interior) — unfiltered — with the target edge flagged. Same shape as
 * getConnectionNeighborhood, just without the 1-hop filtering. Powers the
 * enlarged mini-map's "Whole tree" view.
 */
function getConnectionScopeGraph<
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
  scopeId: string,
  edgeId: string,
): ConnectionNeighborhood {
  const scope = getScopeNodesEdges(state, scopeId);
  if (!scope) return { nodes: [], edges: [], highlightEdgeId: null };

  return {
    nodes: scope.nodes,
    edges: scope.edges,
    highlightEdgeId: scope.edges.some((e) => e.id === edgeId) ? edgeId : null,
  };
}

export {
  computeHandleBlastRadius,
  computeRootIoHandleBlastRadius,
  computeDeletionCascade,
  collectConnectionsInScope,
  getScopeNodesEdges,
  getConnectionNeighborhood,
  getConnectionScopeGraph,
  handleKey,
};
export type {
  HandleDirection,
  HandleDeletionTarget,
  ConnectionRef,
  ScopeConnections,
  HandleBlastRadius,
  HandleDeletionPlanData,
  BoundaryHandleRemoval,
  ConnectionNeighborhood,
};
