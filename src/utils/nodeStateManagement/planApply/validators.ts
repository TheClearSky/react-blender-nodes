import type { SupportedUnderlyingTypes } from '../types';
import type { State } from '../types';
import type { Action } from '../mainReducer';
import type { Plan, Result, ValidationError } from './types';
import { ok, err } from './types';
import { actionTypesMap } from '../mainReducer';
import type { z } from 'zod';
import { getCurrentNodesAndEdgesFromState } from '../nodes/constructAndModifyNodes';
import { isGroupInputOrOutputNode } from '../nodes/nodeGroups';
import { isLoopNode } from '../nodes/loops';
import { isSwitchNode } from '../nodes/switches';
import { validateAddEdge } from './validateAddEdge';
import { removeEdgeWithTypeChecking } from '../constructAndModifyHandles';
import type { EdgeChangeStep } from './types';
import { standardNodeTypeNamesMap } from '../standardNodes';
import {
  countNodesOfTypeInRoot,
  countNodesOfTypeAcrossAll,
  countNodesOfTypeInGroup,
  getCurrentScope,
} from '../nodeCountHelpers';
import { computeDeletionCascade } from '../handles/handleDeletionAnalysis';
import {
  computeChannelDeletionCascade,
  loopChannelToRequest,
  switchChannelToRequest,
} from '../handles/channelDeletionAnalysis';
import { handleKey } from '../handles/handleKey';

// ---------------------------------------------------------------------------
// Helpers for UPDATE_NODE_TYPE input/output validation
// ---------------------------------------------------------------------------

type TypeOfInputLike = { name: string; dataType: string };
type TypeOfInputPanelLike = { name: string; inputs: TypeOfInputLike[] };

function flattenTypeOfInputs(
  inputs: (TypeOfInputLike | TypeOfInputPanelLike)[],
): TypeOfInputLike[] {
  const result: TypeOfInputLike[] = [];
  for (const input of inputs) {
    if ('inputs' in input) {
      for (const subInput of input.inputs) {
        result.push(subInput);
      }
    } else {
      result.push(input);
    }
  }
  return result;
}

function validateInputsUpdate(
  newInputs: (TypeOfInputLike | TypeOfInputPanelLike)[],
  oldInputs: (TypeOfInputLike | TypeOfInputPanelLike)[],
  dataTypes: Record<string, unknown>,
): Result<never, ValidationError> | null {
  for (const input of newInputs) {
    if ('inputs' in input) {
      if (input.inputs.length === 0) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'Input panels cannot be empty',
        });
      }
      if (input.name.trim() === '') {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'Panel name cannot be empty',
        });
      }
    }
  }

  const flattenedNew = flattenTypeOfInputs(newInputs);
  const flattenedOld = flattenTypeOfInputs(oldInputs);

  const newNames = flattenedNew.map((i) => i.name);
  if (new Set(newNames).size !== newNames.length) {
    return err({
      code: 'INVALID_NODE_GROUP' as const,
      reason: 'Input handle names must be unique',
    });
  }

  for (const input of flattenedNew) {
    if (!(input.dataType in dataTypes)) {
      return err({
        code: 'INVALID_NODE_GROUP' as const,
        reason: `Unknown data type: ${input.dataType}`,
      });
    }
  }

  if (flattenedOld.length !== flattenedNew.length) {
    return err({
      code: 'INVALID_NODE_GROUP' as const,
      reason:
        'Cannot add or remove inputs during reorder (only reorder/re-panel)',
    });
  }

  const sortKey = (i: TypeOfInputLike) => `${i.name}::${i.dataType}`;
  const oldSorted = [...flattenedOld].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );
  const newSorted = [...flattenedNew].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );
  for (let i = 0; i < oldSorted.length; i++) {
    if (sortKey(oldSorted[i]) !== sortKey(newSorted[i])) {
      return err({
        code: 'INVALID_NODE_GROUP' as const,
        reason:
          'Input set mismatch: inputs can only be reordered/re-paneled, not added/removed',
      });
    }
  }

  return null;
}

function validateOutputsUpdate(
  newOutputs: TypeOfInputLike[],
  oldOutputs: TypeOfInputLike[],
  dataTypes: Record<string, unknown>,
): Result<never, ValidationError> | null {
  const outputNames = newOutputs.map((o) => o.name);
  if (new Set(outputNames).size !== outputNames.length) {
    return err({
      code: 'INVALID_NODE_GROUP' as const,
      reason: 'Output handle names must be unique',
    });
  }

  for (const output of newOutputs) {
    if (!(output.dataType in dataTypes)) {
      return err({
        code: 'INVALID_NODE_GROUP' as const,
        reason: `Unknown data type: ${output.dataType}`,
      });
    }
  }

  if (oldOutputs.length !== newOutputs.length) {
    return err({
      code: 'INVALID_NODE_GROUP' as const,
      reason: 'Cannot add or remove outputs during reorder',
    });
  }

  const sortKey = (i: TypeOfInputLike) => `${i.name}::${i.dataType}`;
  const oldSorted = [...oldOutputs].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );
  const newSorted = [...newOutputs].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );
  for (let i = 0; i < oldSorted.length; i++) {
    if (sortKey(oldSorted[i]) !== sortKey(newSorted[i])) {
      return err({
        code: 'INVALID_NODE_GROUP' as const,
        reason:
          'Output set mismatch: outputs can only be reordered, not added/removed',
      });
    }
  }

  return null;
}

/**
 * Validates an action and produces a Plan describing what should change.
 *
 * This is the "Plan" half of the Plan/Apply pattern: pure validation logic
 * that reads from immutable state and returns a discriminated-union Plan
 * describing the intended mutations. The Plan is then passed to `applyPlan()`
 * which performs the actual Immer draft mutations.
 *
 * Separating validation from mutation makes each action independently testable
 * and keeps side-effect-free logic out of the Immer producer.
 *
 * Returns `null` only if the action type is completely unrecognized.
 */
function validateAction<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  _state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
  action: Action<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): Result<Plan, ValidationError> | null {
  switch (action.type) {
    case actionTypesMap.SET_VIEWPORT:
      return ok({ kind: 'SET_VIEWPORT', viewport: action.payload.viewport });
    case actionTypesMap.REPLACE_STATE:
      return ok({ kind: 'REPLACE_STATE', state: action.payload.state });

    case actionTypesMap.OPEN_NODE_GROUP: {
      if ('nodeId' in action.payload) {
        const openNodeId = action.payload.nodeId;
        const nodeToOpen = getCurrentNodesAndEdgesFromState(_state).nodes.find(
          (node) => node.id === openNodeId,
        );
        if (!nodeToOpen) {
          return err({
            code: 'INVALID_NODE_GROUP',
            reason: `Node with id "${openNodeId}" not found`,
          });
        }
        const nodeType = nodeToOpen.data.nodeTypeUniqueId;
        if (!nodeType) {
          return err({
            code: 'INVALID_NODE_GROUP',
            reason: 'Node has no nodeTypeUniqueId',
          });
        }
        const nodeTypeDef = _state.typeOfNodes[nodeType];
        if (!nodeTypeDef || !nodeTypeDef.subtree) {
          return err({
            code: 'INVALID_NODE_GROUP',
            reason: `Node type "${String(nodeType)}" is not a valid node group`,
          });
        }
        return ok({
          kind: 'OPEN_NODE_GROUP',
          pushEntry: {
            nodeType: nodeType as string,
            nodeId: openNodeId,
            previousViewport: _state.viewport,
          },
        });
      } else {
        const nodeType = action.payload.nodeType;
        const nodeTypeDef = _state.typeOfNodes[nodeType];
        if (!nodeTypeDef || !nodeTypeDef.subtree) {
          return err({
            code: 'INVALID_NODE_GROUP',
            reason: `Node type "${String(nodeType)}" is not a valid node group`,
          });
        }
        return ok({
          kind: 'OPEN_NODE_GROUP',
          pushEntry: {
            nodeType: nodeType as string,
            previousViewport:
              _state.openedNodeGroupStack?.[0]?.previousViewport ||
              _state.viewport,
          },
        });
      }
    }

    case actionTypesMap.CLOSE_NODE_GROUP: {
      const stack = _state.openedNodeGroupStack;
      if (!stack || stack.length === 0) {
        return err({ code: 'EMPTY_STACK', action: 'CLOSE_NODE_GROUP' });
      }
      const lastEntry = stack[stack.length - 1];
      const restoreViewport =
        lastEntry && 'previousViewport' in lastEntry
          ? lastEntry.previousViewport
          : undefined;
      return ok({
        kind: 'CLOSE_NODE_GROUP',
        restoreViewport,
      });
    }

    case actionTypesMap.ADD_NODE:
    case actionTypesMap.ADD_NODE_AND_SELECT: {
      const nodeType = action.payload.type;
      // Verify node type exists. The id and the constructed node object are
      // deferred to `applyPlan` so this function stays pure (deterministic
      // output for any given input).
      if (!(nodeType in _state.typeOfNodes)) {
        return err({ code: 'NODE_TYPE_NOT_FOUND', nodeType: String(nodeType) });
      }

      const addConstraints = _state.nodeCountConstraints;
      if (addConstraints) {
        const constraint = addConstraints[nodeType];
        if (constraint) {
          if (constraint.maxAcrossAllNodes !== undefined) {
            const currentCount = countNodesOfTypeAcrossAll(_state, nodeType);
            if (currentCount >= constraint.maxAcrossAllNodes) {
              return err({
                code: 'NODE_COUNT_CONSTRAINT_VIOLATED' as const,
                nodeType: String(nodeType),
                constraintKind: 'maxAcrossAllNodes',
                limit: constraint.maxAcrossAllNodes,
                currentCount,
              });
            }
          }

          const currentGroupNodeType = getCurrentScope(_state);
          if (currentGroupNodeType === undefined) {
            if (constraint.maxInRoot !== undefined) {
              const rootCount = countNodesOfTypeInRoot(_state, nodeType);
              if (rootCount >= constraint.maxInRoot) {
                return err({
                  code: 'NODE_COUNT_CONSTRAINT_VIOLATED' as const,
                  nodeType: String(nodeType),
                  constraintKind: 'maxInRoot',
                  limit: constraint.maxInRoot,
                  currentCount: rootCount,
                });
              }
            }
          } else {
            if (constraint.maxWithinANodeGroup !== undefined) {
              const groupCount = countNodesOfTypeInGroup(
                _state,
                currentGroupNodeType,
                nodeType,
              );
              if (groupCount >= constraint.maxWithinANodeGroup) {
                return err({
                  code: 'NODE_COUNT_CONSTRAINT_VIOLATED' as const,
                  nodeType: String(nodeType),
                  constraintKind: 'maxWithinANodeGroup',
                  limit: constraint.maxWithinANodeGroup,
                  currentCount: groupCount,
                });
              }
            }
          }
        }
      }

      return ok({
        kind: 'ADD_NODE' as const,
        nodeType: nodeType as string,
        position: action.payload.position,
        selectExclusively: action.type === actionTypesMap.ADD_NODE_AND_SELECT,
      });
    }

    case actionTypesMap.UPDATE_NODE_BY_REACT_FLOW: {
      const deleteConstraints = _state.nodeCountConstraints;
      if (deleteConstraints) {
        const removeChanges = action.payload.changes.filter(
          (change) => change.type === 'remove',
        );
        if (removeChanges.length > 0) {
          const currentView = getCurrentNodesAndEdgesFromState(_state);
          const currentGroupNodeType = getCurrentScope(_state);

          const removedNodeTypeCounts = new Map<NodeTypeUniqueId, number>();
          for (const change of removeChanges) {
            const nodeBeingRemoved = currentView.nodes.find(
              (n) => n.id === change.id,
            );
            if (!nodeBeingRemoved?.data.nodeTypeUniqueId) continue;
            const removedType = nodeBeingRemoved.data.nodeTypeUniqueId;
            removedNodeTypeCounts.set(
              removedType,
              (removedNodeTypeCounts.get(removedType) ?? 0) + 1,
            );
          }

          for (const [removedType, removeCount] of removedNodeTypeCounts) {
            const constraint = deleteConstraints[removedType];
            if (!constraint) continue;

            if (constraint.minAcrossAllNodes !== undefined) {
              const totalCount = countNodesOfTypeAcrossAll(_state, removedType);
              if (totalCount - removeCount < constraint.minAcrossAllNodes) {
                return err({
                  code: 'NODE_COUNT_CONSTRAINT_VIOLATED' as const,
                  nodeType: String(removedType),
                  constraintKind: 'minAcrossAllNodes',
                  limit: constraint.minAcrossAllNodes,
                  currentCount: totalCount,
                });
              }
            }

            if (currentGroupNodeType === undefined) {
              if (constraint.minInRoot !== undefined) {
                const rootCount = countNodesOfTypeInRoot(_state, removedType);
                if (rootCount - removeCount < constraint.minInRoot) {
                  return err({
                    code: 'NODE_COUNT_CONSTRAINT_VIOLATED' as const,
                    nodeType: String(removedType),
                    constraintKind: 'minInRoot',
                    limit: constraint.minInRoot,
                    currentCount: rootCount,
                  });
                }
              }
            } else {
              if (constraint.minWithinANodeGroup !== undefined) {
                const groupCount = countNodesOfTypeInGroup(
                  _state,
                  currentGroupNodeType,
                  removedType,
                );
                if (groupCount - removeCount < constraint.minWithinANodeGroup) {
                  return err({
                    code: 'NODE_COUNT_CONSTRAINT_VIOLATED' as const,
                    nodeType: String(removedType),
                    constraintKind: 'minWithinANodeGroup',
                    limit: constraint.minWithinANodeGroup,
                    currentCount: groupCount,
                  });
                }
              }
            }
          }
        }
      }

      return ok({
        kind: 'UPDATE_NODES_RF' as const,
        changes: action.payload.changes,
      });
    }

    case actionTypesMap.ADD_NODE_GROUP: {
      // No id minting, no node construction here. applyPlan does the lot —
      // mints groupNodeType id, mints input/output node ids, builds the
      // nodeGroupType. validate just decides "yes, group can be added"
      // and snapshots the previousViewport so apply can stash it.
      return ok({
        kind: 'ADD_NODE_GROUP',
        previousViewport:
          _state.openedNodeGroupStack?.[0]?.previousViewport || _state.viewport,
      });
    }

    case actionTypesMap.ADD_EDGE_BY_REACT_FLOW:
      return validateAddEdge(_state, action);

    case actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW: {
      // Package each change as an EdgeChangeStep
      const steps: EdgeChangeStep[] = [];
      const currentView = getCurrentNodesAndEdgesFromState(_state);

      for (const change of action.payload.changes) {
        if (change.type !== 'remove') {
          steps.push({ kind: 'passthrough', change });
        } else {
          // Find the edge being removed
          const edge = currentView.edges.find((e) => e.id === change.id);
          if (!edge) {
            steps.push({ kind: 'passthrough', change }); // let applyEdgeChanges handle missing
            continue;
          }
          // removeEdgeWithTypeChecking is already PURE — it returns {updatedNodes, updatedEdges, validation}
          const result = removeEdgeWithTypeChecking(
            edge,
            { ..._state, nodes: currentView.nodes, edges: currentView.edges },
            change,
          );
          steps.push({
            kind: 'removal',
            updatedNodes: result.updatedNodes,
            updatedEdges: result.updatedEdges,
            validation: result.validation,
          });
        }
      }
      return ok({ kind: 'UPDATE_EDGES_RF' as const, steps });
    }

    case actionTypesMap.UPDATE_INPUT_VALUE: {
      const { nodeId, inputId } = action.payload;
      const view = getCurrentNodesAndEdgesFromState(_state);
      const node = view.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return err({
          code: 'MISSING_ENDPOINT' as const,
          which: 'source' as const,
          detail: 'Node not found for input value update',
        });
      }
      return ok({
        kind: 'UPDATE_INPUT_VALUE' as const,
        nodeId,
        inputId,
        value: action.payload.value,
      });
    }

    case actionTypesMap.UPDATE_NODE_CUSTOM_NAME: {
      const { nodeId, customName } = action.payload;
      const view = getCurrentNodesAndEdgesFromState(_state);
      const node = view.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return err({
          code: 'MISSING_ENDPOINT' as const,
          which: 'source' as const,
          detail: 'Node not found for custom-name update',
        });
      }
      // Custom names are for STANDARD nodes only — system/structural nodes
      // (graph & group I/O, loops, switches, groups) are not nameable. Reject as a
      // NOOP so a programmatic UPDATE_NODE_CUSTOM_NAME can't name one. An imported
      // state (via REPLACE_STATE) bypasses this validator, but such a stray
      // customName is inert downstream: the display gate hides it and the
      // runner/codegen skip it for structural nodes.
      const nodeTypeId = node.data.nodeTypeUniqueId;
      const isSystemNode =
        !nodeTypeId ||
        isGroupInputOrOutputNode(nodeTypeId) ||
        isLoopNode(nodeTypeId) ||
        isSwitchNode(nodeTypeId) ||
        Boolean(_state.typeOfNodes[nodeTypeId]?.subtree);
      if (isSystemNode) {
        return err({
          code: 'NOOP' as const,
          reason: 'System nodes cannot be given a custom name',
        });
      }
      const trimmed = customName?.trim();
      return ok({
        kind: 'UPDATE_NODE_CUSTOM_NAME' as const,
        nodeId,
        customName: trimmed ? trimmed : undefined,
      });
    }

    case actionTypesMap.UPDATE_NODE_TYPE: {
      const { nodeTypeId, updates } = action.payload;
      if (!(nodeTypeId in _state.typeOfNodes)) {
        return err({
          code: 'NODE_TYPE_NOT_FOUND' as const,
          nodeType: String(nodeTypeId),
        });
      }
      if (updates.name !== undefined && updates.name.trim() === '') {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'Node type name cannot be empty',
        });
      }

      if (updates.inputs !== undefined) {
        const inputValidation = validateInputsUpdate(
          updates.inputs,
          _state.typeOfNodes[nodeTypeId].inputs,
          _state.dataTypes,
        );
        if (inputValidation !== null) return inputValidation;
      }

      if (updates.outputs !== undefined) {
        const outputValidation = validateOutputsUpdate(
          updates.outputs,
          _state.typeOfNodes[nodeTypeId].outputs,
          _state.dataTypes,
        );
        if (outputValidation !== null) return outputValidation;
      }

      return ok({
        kind: 'UPDATE_NODE_TYPE' as const,
        nodeTypeId: nodeTypeId as string,
        updates: {
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.headerColor !== undefined && {
            headerColor: updates.headerColor,
          }),
          ...(updates.inputs !== undefined && {
            inputs: updates.inputs,
          }),
          ...(updates.outputs !== undefined && {
            outputs: updates.outputs,
          }),
        },
      });
    }

    case actionTypesMap.UPDATE_GRAPH_IO_HANDLES: {
      const { nodeId, handles } = action.payload;
      // Root-scope guard (mirrors the UI gating the edit button on
      // isAtRootScope). The root Graph Input / Output boundary nodes live in
      // `_state.nodes`, so a programmatic dispatch while a group is open would
      // edit the root node off-screen. Reject unless we are at root scope.
      if (getCurrentScope(_state) !== undefined) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'Graph I/O handles can only be edited at the root scope',
        });
      }
      const node = _state.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: `Graph I/O node "${nodeId}" not found`,
        });
      }
      const typeId = node.data.nodeTypeUniqueId;
      const isInput = typeId === standardNodeTypeNamesMap.groupInput;
      const isOutput = typeId === standardNodeTypeNamesMap.groupOutput;
      if (!isInput && !isOutput) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'Node is not a Graph Input / Graph Output',
        });
      }
      const names = handles.map((handle) => handle.name.trim());
      if (names.some((name) => name === '')) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'Graph I/O handle name cannot be empty',
        });
      }
      if (new Set(names).size !== names.length) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'Graph I/O handle names must be unique',
        });
      }
      // A Graph Input edits its outputs; a Graph Output edits its inputs.
      // Outputs are always flat; inputs may (in general) carry panels, so
      // flatten defensively even though group boundary nodes never panel them.
      const editableList = isInput
        ? (node.data.outputs ?? [])
        : (node.data.inputs ?? []).flatMap((item) =>
            'inputs' in item ? item.inputs : [item],
          );
      const keptIds = new Set(
        handles
          .filter((handle) => handle.id)
          .map((handle) => handle.id as string),
      );
      const removedHandleIds = editableList
        .filter((handle) => handle.id && !keptIds.has(handle.id))
        .map((handle) => handle.id as string);
      return ok({
        kind: 'UPDATE_GRAPH_IO_HANDLES' as const,
        nodeId,
        direction: isInput ? ('output' as const) : ('input' as const),
        handles: handles.map((handle) => ({
          id: handle.id,
          name: handle.name.trim(),
        })),
        removedHandleIds,
      });
    }

    case actionTypesMap.ADD_LOOP: {
      if (
        !(standardNodeTypeNamesMap.loopStart in _state.typeOfNodes) ||
        !(standardNodeTypeNamesMap.loopStop in _state.typeOfNodes) ||
        !(standardNodeTypeNamesMap.loopEnd in _state.typeOfNodes)
      ) {
        return err({
          code: 'NODE_TYPE_NOT_FOUND' as const,
          nodeType: 'loopStart/loopStop/loopEnd',
        });
      }
      return ok({
        kind: 'ADD_LOOP' as const,
        position: action.payload.position,
      });
    }

    case actionTypesMap.ADD_SWITCH: {
      if (
        !(standardNodeTypeNamesMap.switchStart in _state.typeOfNodes) ||
        !(standardNodeTypeNamesMap.switchEnd in _state.typeOfNodes)
      ) {
        return err({
          code: 'NODE_TYPE_NOT_FOUND' as const,
          nodeType: 'switchStart/switchEnd',
        });
      }
      return ok({
        kind: 'ADD_SWITCH' as const,
        position: action.payload.position,
      });
    }

    case actionTypesMap.OPEN_DRAWER:
      return ok({
        kind: 'OPEN_DRAWER' as const,
        activeDrawer: action.payload.activeDrawer,
      });

    case actionTypesMap.CLOSE_DRAWER:
      return ok({ kind: 'CLOSE_DRAWER' as const });

    case actionTypesMap.UPDATE_LOOP: {
      const { loopStartNodeId, loopStopNodeId, loopEndNodeId, levels } =
        action.payload;
      const currentView = getCurrentNodesAndEdgesFromState(_state);
      const loopStartNode = currentView.nodes.find(
        (n) => n.id === loopStartNodeId,
      );
      const loopStopNode = currentView.nodes.find(
        (n) => n.id === loopStopNodeId,
      );
      const loopEndNode = currentView.nodes.find((n) => n.id === loopEndNodeId);
      if (!loopStartNode || !loopStopNode || !loopEndNode) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'One or more loop nodes not found',
        });
      }

      const handleSlots = [
        'loopStartIn',
        'loopStartOut',
        'loopStopIn',
        'loopStopOut',
        'loopEndIn',
        'loopEndOut',
      ] as const;
      for (const slot of handleSlots) {
        const names = levels.map((l) => l.handles[slot].name);
        if (new Set(names).size !== names.length) {
          return err({
            code: 'INVALID_NODE_GROUP' as const,
            reason: `Duplicate handle name in ${slot}`,
          });
        }
      }

      return ok({
        kind: 'UPDATE_LOOP' as const,
        loopStartNodeId,
        loopStopNodeId,
        loopEndNodeId,
        levels,
      });
    }

    case actionTypesMap.UPDATE_SWITCH: {
      const { switchStartNodeId, switchEndNodeId, levels } = action.payload;
      const currentView = getCurrentNodesAndEdgesFromState(_state);
      const switchStartNode = currentView.nodes.find(
        (n) => n.id === switchStartNodeId,
      );
      const switchEndNode = currentView.nodes.find(
        (n) => n.id === switchEndNodeId,
      );
      if (!switchStartNode || !switchEndNode) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'One or more switch nodes not found',
        });
      }

      const switchHandleSlots = [
        'switchStartIn',
        'switchStartTrueOut',
        'switchStartFalseOut',
        'switchEndTrueIn',
        'switchEndFalseIn',
        'switchEndOut',
      ] as const;
      for (const slot of switchHandleSlots) {
        const names = levels.map((l) => l.handles[slot].name);
        if (new Set(names).size !== names.length) {
          return err({
            code: 'INVALID_NODE_GROUP' as const,
            reason: `Duplicate handle name in ${slot}`,
          });
        }
      }

      return ok({
        kind: 'UPDATE_SWITCH' as const,
        switchStartNodeId,
        switchEndNodeId,
        levels,
      });
    }

    case actionTypesMap.UNDO: {
      const history = _state.history;
      if (!history || history.undoStack.length === 0) {
        return err({ code: 'NOOP', reason: 'Nothing to undo' });
      }
      return ok({
        kind: 'UNDO' as const,
        entry: history.undoStack[history.undoStack.length - 1],
      });
    }

    case actionTypesMap.REDO: {
      const history = _state.history;
      if (!history || history.redoStack.length === 0) {
        return err({ code: 'NOOP', reason: 'Nothing to redo' });
      }
      return ok({
        kind: 'REDO' as const,
        entry: history.redoStack[history.redoStack.length - 1],
      });
    }

    case actionTypesMap.BEGIN_BATCH:
      return ok({ kind: 'BEGIN_BATCH' as const });

    case actionTypesMap.END_BATCH:
      return ok({ kind: 'END_BATCH' as const });

    case actionTypesMap.CLEAR_HISTORY:
      return ok({ kind: 'CLEAR_HISTORY' as const });

    case actionTypesMap.DELETE_NODE_TYPE_HANDLES: {
      const { nodeTypeId, deletions } = action.payload;
      if (!(nodeTypeId in _state.typeOfNodes)) {
        return err({
          code: 'NODE_TYPE_NOT_FOUND' as const,
          nodeType: String(nodeTypeId),
        });
      }
      if (deletions.length === 0) {
        return err({
          code: 'NOOP' as const,
          reason: 'No handles selected for deletion',
        });
      }
      const nodeTypeDef = _state.typeOfNodes[nodeTypeId];
      const inputKeys = new Set(
        flattenTypeOfInputs(nodeTypeDef.inputs).map((i) =>
          handleKey(i.name, i.dataType),
        ),
      );
      const outputKeys = new Set(
        nodeTypeDef.outputs.map((o) => handleKey(o.name, o.dataType)),
      );
      for (const deletion of deletions) {
        const key = handleKey(deletion.handleName, deletion.handleDataTypeId);
        const exists =
          deletion.direction === 'input'
            ? inputKeys.has(key)
            : outputKeys.has(key);
        if (!exists) {
          return err({
            code: 'INVALID_NODE_GROUP' as const,
            reason: `Cannot delete ${deletion.direction} handle '${deletion.handleName}': not found on node type`,
          });
        }
      }
      const cascade = computeDeletionCascade(_state, nodeTypeId, deletions);
      return ok({
        kind: 'DELETE_NODE_TYPE_HANDLES' as const,
        nodeTypeId: nodeTypeId as string,
        cascade,
      });
    }

    case actionTypesMap.DELETE_LOOP_CHANNELS: {
      const { loopStartNodeId, loopStopNodeId, loopEndNodeId, channels } =
        action.payload;
      if (channels.length === 0) {
        return err({
          code: 'NOOP' as const,
          reason: 'No channels selected for deletion',
        });
      }
      const currentView = getCurrentNodesAndEdgesFromState(_state);
      const present = (id: string) =>
        currentView.nodes.some((n) => n.id === id);
      if (
        !present(loopStartNodeId) ||
        !present(loopStopNodeId) ||
        !present(loopEndNodeId)
      ) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'One or more loop nodes not found',
        });
      }
      const scopeTypeId = getCurrentScope(_state);
      const scopeId = scopeTypeId ?? 'root';
      const scopeLabel = scopeTypeId
        ? `Inside group "${_state.typeOfNodes[scopeTypeId].name}"`
        : 'Root graph';
      const cascades = channels.map((channel) =>
        computeChannelDeletionCascade(
          _state,
          loopChannelToRequest(
            scopeId,
            scopeLabel,
            {
              loopStartId: loopStartNodeId,
              loopStopId: loopStopNodeId,
              loopEndId: loopEndNodeId,
            },
            channel,
          ),
        ),
      );
      return ok({
        kind: 'DELETE_LOOP_CHANNELS' as const,
        loopStartNodeId,
        loopStopNodeId,
        loopEndNodeId,
        cascades,
      });
    }

    case actionTypesMap.DELETE_SWITCH_CHANNELS: {
      const { switchStartNodeId, switchEndNodeId, channels } = action.payload;
      if (channels.length === 0) {
        return err({
          code: 'NOOP' as const,
          reason: 'No channels selected for deletion',
        });
      }
      const currentView = getCurrentNodesAndEdgesFromState(_state);
      const present = (id: string) =>
        currentView.nodes.some((n) => n.id === id);
      if (!present(switchStartNodeId) || !present(switchEndNodeId)) {
        return err({
          code: 'INVALID_NODE_GROUP' as const,
          reason: 'One or more switch nodes not found',
        });
      }
      const scopeTypeId = getCurrentScope(_state);
      const scopeId = scopeTypeId ?? 'root';
      const scopeLabel = scopeTypeId
        ? `Inside group "${_state.typeOfNodes[scopeTypeId].name}"`
        : 'Root graph';
      const cascades = channels.map((channel) =>
        computeChannelDeletionCascade(
          _state,
          switchChannelToRequest(
            scopeId,
            scopeLabel,
            { switchStartId: switchStartNodeId, switchEndId: switchEndNodeId },
            channel,
          ),
        ),
      );
      return ok({
        kind: 'DELETE_SWITCH_CHANNELS' as const,
        switchStartNodeId,
        switchEndNodeId,
        cascades,
      });
    }

    case actionTypesMap.REORDER_INPUT_CONNECTIONS: {
      const { nodeId, handleId, orderedEdgeIds } = action.payload;
      const view = getCurrentNodesAndEdgesFromState(_state);
      const node = view.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) {
        return err({
          code: 'MISSING_ENDPOINT' as const,
          which: 'target' as const,
          detail: 'Node not found for connection reorder',
        });
      }
      // The fan-in set: every edge currently entering this input handle in the
      // CURRENT scope (a node group may be open). Reordering only makes sense
      // for two or more connections; zero or one is a no-op.
      const currentEdgeIds = view.edges
        .filter(
          (edge) => edge.target === nodeId && edge.targetHandle === handleId,
        )
        .map((edge) => edge.id);
      if (currentEdgeIds.length < 2) {
        return err({
          code: 'NOOP' as const,
          reason: 'Input handle has fewer than two connections to reorder',
        });
      }
      // `orderedEdgeIds` must be a strict permutation of the current fan-in set:
      // same length, no duplicates, every id present. A stale payload (e.g. an
      // edge removed concurrently) is rejected as a no-op rather than dropping
      // or inventing an order.
      const currentEdgeIdSet = new Set(currentEdgeIds);
      const orderedEdgeIdSet = new Set(orderedEdgeIds);
      if (
        orderedEdgeIds.length !== currentEdgeIds.length ||
        orderedEdgeIdSet.size !== orderedEdgeIds.length ||
        !orderedEdgeIds.every((edgeId) => currentEdgeIdSet.has(edgeId))
      ) {
        return err({
          code: 'NOOP' as const,
          reason:
            'orderedEdgeIds must be a permutation of the input handle current connections',
        });
      }
      return ok({
        kind: 'REORDER_INPUT_CONNECTIONS' as const,
        nodeId,
        handleId,
        orderedEdgeIds,
      });
    }

    default:
      return null; // Not yet migrated — fall through to legacy
  }
}

export { validateAction };
