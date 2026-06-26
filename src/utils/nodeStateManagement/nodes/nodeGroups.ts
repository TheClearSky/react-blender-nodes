import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import type { InstantiatedNonPanelTypesOfHandles } from '../handles/types';
import { addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees } from '../constructAndModifyHandles';
import { constructTypeOfHandleFromIndices } from './constructAndModifyNodes';
import { insertOrDeleteHandleInNodeDataUsingHandleIndices } from '../handles/handleSetters';
import { nextDefaultHandleName } from '../handles/handleNaming';
import type { ConnectionValidationResult } from '../newOrRemovedEdgeValidation';
import type { InferenceScope } from '../planApply/types';
import { standardNodeTypeNamesMap } from '../standardNodes';

/**
 * Grows a fresh blank spare handle on a groupInput/groupOutput boundary after a
 * connection inferred one of its template handles, and (for an OPEN GROUP only)
 * propagates the newly-named handle across every instance of the group's node
 * type. Works for BOTH an open group boundary and the ROOT graph boundary.
 *
 * The body is three independent steps so the root path can run "grow, never
 * propagate" (root is a single instance with no node type):
 *   1. Resolve the consumed handle's name. Group / root+rename-on already
 *      carry the source name (via `overrideName`); root+rename-off auto-names
 *      the blank template `input{n}`/`output{n}` so a concrete handle is never
 *      left `name:''`. Bound to TEMPLATE CONSUMPTION, not to the grow guard.
 *   2. Grow a blank spare on this boundary node — group always; root only when
 *      `allowStructureGrow`.
 *   3. Propagate across the node type — GROUP ONLY (`nodeGroup.nodeType` does
 *      not exist at root, so this is unrepresentable there by construction).
 *
 * @param scope - Root (carries the rename/structure policy) vs open group.
 * @param nodeGroup - The open group (undefined at root); read by `applyPlan`
 *   from its stack and threaded here for the propagation step.
 * @returns Validation result indicating success or failure
 */
function growSpareAndPropagateBoundaryHandle<
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
  sourceNodeIndex: number,
  targetNodeIndex: number,
  sourceHandle: InstantiatedNonPanelTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  targetHandle: InstantiatedNonPanelTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  unmodifiedState: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  isSourceHandleInferredFromConnection: boolean,
  isTargetHandleInferredFromConnection: boolean,
  isSourceNodeGroupInput: boolean,
  isTargetNodeGroupOutput: boolean,
  nodeGroup:
    | NonNullable<
        State<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >['openedNodeGroupStack']
      >[number]
    | undefined,
  scope: InferenceScope,
): {
  validation: ConnectionValidationResult;
} {
  // Enter only for a real boundary template consume (the XOR: exactly one side
  // is inferFromConnection AND a group boundary), and only in a scope that
  // grows — an OPEN GROUP (read from applyPlan's stack via `nodeGroup`) or
  // ROOT. A direct GroupInput→GroupOutput first connect (both sides infer+
  // boundary) is blocked by the XOR — no type information exists yet; after
  // `overrideDataType` concretizes one side, the XOR opens.
  const isBoundaryTemplateConsumed =
    (isSourceHandleInferredFromConnection && isSourceNodeGroupInput) !==
    (isTargetHandleInferredFromConnection && isTargetNodeGroupOutput);
  if (!isBoundaryTemplateConsumed || !(nodeGroup || scope.kind === 'root')) {
    return { validation: { isValid: true } };
  }

  // The node whose template was consumed is the infer side — NOT always the
  // boundary target; after `overrideDataType` either side could be it.
  const indexOfNodeToUpdateInGroup = isSourceHandleInferredFromConnection
    ? sourceNodeIndex
    : targetNodeIndex;
  const inputOrOutputType = isSourceHandleInferredFromConnection
    ? 'output'
    : 'input';
  const inferredHandle = isSourceHandleInferredFromConnection
    ? sourceHandle
    : targetHandle;

  // ── Step 1: resolve the consumed handle's name. ──────────────────────────
  // Group / root+rename-on: `overrideName` already wrote the source name onto
  // the handle. root+rename-off: the consumed blank template is still `name:''`
  // after concretization — auto-name it (deduped) so a concrete handle is never
  // left empty-named (codegen drops it; import rejects it). Bound to TEMPLATE
  // CONSUMPTION, not to the grow guard below: even with structure editing off,
  // a consumed template must be named.
  let handleToAddName = inferredHandle.name;
  if (!handleToAddName && scope.kind === 'root') {
    const boundaryHandleList =
      inputOrOutputType === 'output'
        ? state.nodes[indexOfNodeToUpdateInGroup].data.outputs
        : state.nodes[indexOfNodeToUpdateInGroup].data.inputs;
    const existingNames = (boundaryHandleList ?? [])
      .map((handle) => handle?.name)
      .filter((name): name is string => Boolean(name));
    // A Graph Input node's OUTPUT handles are the graph's inputs ("input{n}");
    // a Graph Output node's INPUT handles are the graph's outputs ("output{n}").
    const newNameBase = isSourceHandleInferredFromConnection
      ? 'input'
      : 'output';
    handleToAddName = nextDefaultHandleName(newNameBase, existingNames);
    inferredHandle.name = handleToAddName;
  }

  const handleToAddDataType = inferredHandle.inferredDataType?.dataTypeUniqueId;
  const handleToAddAllowInput =
    inferredHandle.inferredDataType?.dataTypeObject.allowInput;
  const handleToAddMaxConnections =
    inferredHandle.inferredDataType?.dataTypeObject.maxConnections;
  if (!handleToAddName || !handleToAddDataType) {
    return {
      validation: {
        isValid: false,
        reason: 'Handle to add name, data type, or allow input not found',
      },
    };
  }

  // ── Step 2: grow a fresh blank spare on this boundary node. ──────────────
  // Groups always grow; root grows only when structure editing is allowed.
  const shouldGrowSpare = scope.kind === 'group' || scope.allowStructureGrow;
  if (shouldGrowSpare) {
    const newDuplicateHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      state.nodes[indexOfNodeToUpdateInGroup].data
        .nodeTypeUniqueId as NodeTypeUniqueId,
      state.typeOfNodes,
      { type: inputOrOutputType, index1: 0, index2: undefined },
    );
    if (!newDuplicateHandle) {
      return {
        validation: {
          isValid: false,
          reason: 'New duplicate handle not found',
        },
      };
    }
    insertOrDeleteHandleInNodeDataUsingHandleIndices<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >(
      state.nodes[indexOfNodeToUpdateInGroup].data,
      {
        type: inputOrOutputType,
        index1: -1,
        index2: undefined,
      },
      0,
      newDuplicateHandle,
      true,
      'after',
    );
  }

  // ── Step 3: propagate the named handle across the node TYPE. ─────────────
  // GROUP ONLY — root is a single instance with no node type to propagate to
  // (`nodeGroup.nodeType` does not exist), so this path is unrepresentable at
  // root by construction.
  if (scope.kind === 'group' && nodeGroup) {
    addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees(
      unmodifiedState,
      nodeGroup.nodeType,
      {
        name: handleToAddName,
        dataType: handleToAddDataType,
        allowInput: handleToAddAllowInput,
        maxConnections: handleToAddMaxConnections,
      },
      {
        type: isSourceHandleInferredFromConnection ? 'input' : 'output',
        index1: -1,
        index2: undefined,
      },
      'after',
    );
  }

  return {
    validation: { isValid: true },
  };
}

/**
 * Checks if a node is a group input or output node (groupInput or groupOutput)
 *
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @param nodeTypeUniqueId - The node type unique ID to check
 * @returns True if the node is a group input or output node
 */
function isGroupInputOrOutputNode<NodeTypeUniqueId extends string = string>(
  nodeTypeUniqueId: NodeTypeUniqueId,
): boolean {
  return (
    nodeTypeUniqueId === standardNodeTypeNamesMap.groupInput ||
    nodeTypeUniqueId === standardNodeTypeNamesMap.groupOutput
  );
}

export { growSpareAndPropagateBoundaryHandle, isGroupInputOrOutputNode };
