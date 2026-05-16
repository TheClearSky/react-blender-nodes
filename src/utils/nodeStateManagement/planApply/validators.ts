import type { SupportedUnderlyingTypes } from '../types';
import type { State } from '../types';
import type { Action } from '../mainReducer';
import type { Plan, Result, ValidationError } from './types';
import { ok, err } from './types';
import { actionTypesMap } from '../mainReducer';
import type { z } from 'zod';
import { getCurrentNodesAndEdgesFromState } from '../nodes/constructAndModifyNodes';
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

    case actionTypesMap.UPDATE_INPUT_VALUE:
      return err({
        code: 'NOOP' as const,
        reason: 'UPDATE_INPUT_VALUE not yet implemented',
      });

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
            inputs: updates.inputs as unknown[],
          }),
          ...(updates.outputs !== undefined && {
            outputs: updates.outputs as unknown[],
          }),
        },
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

    default:
      return null; // Not yet migrated — fall through to legacy
  }
}

export { validateAction };
