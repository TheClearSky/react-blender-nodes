import type { State, SupportedUnderlyingTypes } from '../../types';
import type { z } from 'zod';
import type { ConnectionValidationResult } from '../../newOrRemovedEdgeValidation';
import {
  standardDataTypeNamesMap,
  standardNodeTypeNamesMap,
} from '../../standardNodes';
import { getHandleFromNodeDataFromIndices } from '../../handles/handleGetters';
import type { HandleIndices } from '../../handles/types';
import { isSwitchNode } from './switchIdentification';
import { getSwitchStructureFromNode } from './switchStructure';
import { getNodesInSwitchRegion, getZoneHandleIds } from './switchRegion';
import { isNodeReachableToBoundary, findZoneByStructure } from '../../zones';
import type { Zone } from '../../zones';

function isSwitchConnectionValid<
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
  sourceNode: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number],
  targetNode: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number],
  sourceHandleIndex: HandleIndices,
  targetHandleIndex: HandleIndices,
): {
  validation: ConnectionValidationResult;
} {
  const sourceNodeType = sourceNode.data.nodeTypeUniqueId;
  const targetNodeType = targetNode.data.nodeTypeUniqueId;

  if (!sourceNodeType || !targetNodeType) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target node type not found',
      },
    };
  }

  const isSourceSwitchNode = isSwitchNode(sourceNodeType);
  const isTargetSwitchNode = isSwitchNode(targetNodeType);

  // ── CASE 1: Neither node is a switch node ──
  if (!isSourceSwitchNode && !isTargetSwitchNode) {
    for (const node of state.nodes) {
      if (node.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.switchStart)
        continue;
      const structure = getSwitchStructureFromNode(state, node);
      if (!structure) continue;
      const trueZone: Zone | undefined = state.zones
        ? findZoneByStructure(
            state.zones,
            structure.switchStart.id,
            'trueBranch',
          )
        : undefined;
      const falseZone: Zone | undefined = state.zones
        ? findZoneByStructure(
            state.zones,
            structure.switchStart.id,
            'falseBranch',
          )
        : undefined;
      let nodesInTrueBranch: Set<string>;
      let nodesInFalseBranch: Set<string>;
      if (trueZone && falseZone) {
        nodesInTrueBranch = new Set(trueZone.nodeIds);
        nodesInFalseBranch = new Set(falseZone.nodeIds);
      } else {
        const regions = getNodesInSwitchRegion(state, structure);
        nodesInTrueBranch = regions.nodesInTrueBranch;
        nodesInFalseBranch = regions.nodesInFalseBranch;
      }
      const sourceInTrue = nodesInTrueBranch.has(sourceNode.id);
      const sourceInFalse = nodesInFalseBranch.has(sourceNode.id);
      const targetInTrue = nodesInTrueBranch.has(targetNode.id);
      const targetInFalse = nodesInFalseBranch.has(targetNode.id);
      if ((sourceInTrue && targetInFalse) || (sourceInFalse && targetInTrue)) {
        return {
          validation: {
            isValid: false,
            reason:
              "Can't connect nodes across true and false branches of the same switch",
          },
        };
      }
      const sourceInSwitch = sourceInTrue || sourceInFalse;
      const targetInSwitch = targetInTrue || targetInFalse;
      if (sourceInSwitch !== targetInSwitch) {
        const outsideNode = sourceInSwitch ? targetNode : sourceNode;
        const boundaryIds = new Set([
          structure.switchStart.id,
          structure.switchEnd.id,
        ]);
        const isIsolated = !isNodeReachableToBoundary(
          state,
          outsideNode.id,
          boundaryIds,
        );
        if (!isIsolated) {
          return {
            validation: {
              isValid: false,
              reason:
                "Can't connect between inside and outside a switch branch without going through Switch Start/End",
            },
          };
        }
      }
    }
    return { validation: { isValid: true } };
  }

  // Resolve handles for zone checking
  const sourceHandle = getHandleFromNodeDataFromIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof sourceNode.data,
    typeof sourceHandleIndex
  >(sourceHandleIndex, sourceNode.data)?.value;
  const targetHandle = getHandleFromNodeDataFromIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof targetNode.data,
    typeof targetHandleIndex
  >(targetHandleIndex, targetNode.data)?.value;

  if (!sourceHandle?.dataType || !targetHandle?.dataType) {
    return {
      validation: { isValid: false, reason: 'Handle data type not found' },
    };
  }

  // ── CASE 2: Both are switch nodes ──
  if (isSourceSwitchNode && isTargetSwitchNode) {
    const isBindConnection =
      sourceHandle.dataType.dataTypeUniqueId ===
        standardDataTypeNamesMap.bindSwitchNodes ||
      targetHandle.dataType.dataTypeUniqueId ===
        standardDataTypeNamesMap.bindSwitchNodes;

    if (isBindConnection) {
      const isValidOrder =
        sourceNodeType === standardNodeTypeNamesMap.switchStart &&
        targetNodeType === standardNodeTypeNamesMap.switchEnd;
      if (!isValidOrder) {
        return {
          validation: {
            isValid: false,
            reason:
              'Switch nodes can only bind in order: switchStart → switchEnd',
          },
        };
      }
      return { validation: { isValid: true } };
    }

    const sourceStructure = getSwitchStructureFromNode(state, sourceNode);
    const targetStructure = getSwitchStructureFromNode(state, targetNode);
    if (!sourceStructure || !targetStructure) {
      return {
        validation: {
          isValid: false,
          reason: "Can't connect to incomplete switch structure",
        },
      };
    }

    if (sourceStructure.switchStart.id === targetStructure.switchStart.id) {
      if (
        sourceNodeType !== standardNodeTypeNamesMap.switchStart ||
        targetNodeType !== standardNodeTypeNamesMap.switchEnd
      ) {
        return {
          validation: {
            isValid: false,
            reason:
              'Within the same switch, data can only flow from Switch Start to Switch End',
          },
        };
      }
      // Zone matching for direct passthrough
      const zones = getZoneHandleIds(sourceStructure);
      const srcId = sourceHandle.id as string;
      const tgtId = targetHandle.id as string;
      const srcTrue = zones.switchStartTrueOutputIds.has(srcId);
      const srcFalse = zones.switchStartFalseOutputIds.has(srcId);
      const tgtTrue = zones.switchEndTrueInputIds.has(tgtId);
      const tgtFalse = zones.switchEndFalseInputIds.has(tgtId);
      if ((srcTrue && tgtFalse) || (srcFalse && tgtTrue)) {
        return {
          validation: {
            isValid: false,
            reason: "Can't connect across true and false zones in passthrough",
          },
        };
      }
      return { validation: { isValid: true } };
    }

    return { validation: { isValid: true } };
  }

  // ── CASE 3: One switch node, one regular node ──
  const switchNode = isSourceSwitchNode ? sourceNode : targetNode;
  const otherNode = isSourceSwitchNode ? targetNode : sourceNode;
  const switchNodeType = isSourceSwitchNode ? sourceNodeType! : targetNodeType!;
  const switchHandle = isSourceSwitchNode ? sourceHandle : targetHandle;
  const switchHandleId = switchHandle.id as string;

  const switchStructure = getSwitchStructureFromNode(state, switchNode);
  if (!switchStructure) {
    return {
      validation: {
        isValid: false,
        reason: "Can't connect to incomplete switch structure",
      },
    };
  }

  const trueZone3: Zone | undefined = state.zones
    ? findZoneByStructure(
        state.zones,
        switchStructure.switchStart.id,
        'trueBranch',
      )
    : undefined;
  const falseZone3: Zone | undefined = state.zones
    ? findZoneByStructure(
        state.zones,
        switchStructure.switchStart.id,
        'falseBranch',
      )
    : undefined;
  let nodesInTrueBranch: Set<string>;
  let nodesInFalseBranch: Set<string>;
  if (trueZone3 && falseZone3) {
    nodesInTrueBranch = new Set(trueZone3.nodeIds);
    nodesInFalseBranch = new Set(falseZone3.nodeIds);
  } else {
    const regions = getNodesInSwitchRegion(state, switchStructure);
    nodesInTrueBranch = regions.nodesInTrueBranch;
    nodesInFalseBranch = regions.nodesInFalseBranch;
  }
  const zones = getZoneHandleIds(switchStructure);

  // Determine which zone the switch handle belongs to
  let handleZone: 'true' | 'false' | 'none' = 'none';
  if (switchNodeType === standardNodeTypeNamesMap.switchStart) {
    if (zones.switchStartTrueOutputIds.has(switchHandleId)) handleZone = 'true';
    else if (zones.switchStartFalseOutputIds.has(switchHandleId))
      handleZone = 'false';
  } else {
    if (zones.switchEndTrueInputIds.has(switchHandleId)) handleZone = 'true';
    else if (zones.switchEndFalseInputIds.has(switchHandleId))
      handleZone = 'false';
  }

  // Determine the other node's region
  const otherInTrue = nodesInTrueBranch.has(otherNode.id);
  const otherInFalse = nodesInFalseBranch.has(otherNode.id);
  const otherIsExternal = !otherInTrue && !otherInFalse;

  if (handleZone !== 'none') {
    if (otherIsExternal) {
      const switchBoundaryIds = new Set([
        switchStructure.switchStart.id,
        switchStructure.switchEnd.id,
      ]);
      const isIsolated = !isNodeReachableToBoundary(
        state,
        otherNode.id,
        switchBoundaryIds,
      );
      if (isIsolated) {
        return { validation: { isValid: true } };
      }
      return {
        validation: {
          isValid: false,
          reason:
            'External nodes cannot connect to zone handles. Connect to Switch Start inputs or Switch End outputs instead.',
        },
      };
    }
    // Zone must match region
    if (handleZone === 'true' && otherInFalse) {
      return {
        validation: {
          isValid: false,
          reason: 'False-region node cannot connect to true-zone handle',
        },
      };
    }
    if (handleZone === 'false' && otherInTrue) {
      return {
        validation: {
          isValid: false,
          reason: 'True-region node cannot connect to false-zone handle',
        },
      };
    }
  } else {
    // Non-zoned handle (bind, condition, plain data inputs/outputs)
    // Body nodes inside a region should only use zone handles to interact with the switch
    if (otherInTrue || otherInFalse) {
      if (isSourceSwitchNode) {
        // Source is switch with non-zoned output, target is body node
        // SwitchEnd non-zoned outputs are plain data — body nodes shouldn't receive from them
        if (switchNodeType === standardNodeTypeNamesMap.switchEnd) {
          return {
            validation: {
              isValid: false,
              reason:
                'Body nodes in a switch branch can only receive from Switch Start zone outputs or other body nodes',
            },
          };
        }
      } else {
        // Target is switch with non-zoned input, source is body node
        // SwitchStart non-zoned inputs are plain data/condition — body nodes shouldn't send to them
        if (switchNodeType === standardNodeTypeNamesMap.switchStart) {
          return {
            validation: {
              isValid: false,
              reason:
                'Body nodes in a switch branch can only send to Switch End zone inputs or other body nodes',
            },
          };
        }
      }
    }
  }

  return { validation: { isValid: true } };
}

export { isSwitchConnectionValid };
