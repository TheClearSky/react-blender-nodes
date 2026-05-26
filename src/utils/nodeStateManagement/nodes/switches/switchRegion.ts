import type { State, SupportedUnderlyingTypes } from '../../types';
import type { z } from 'zod';
import { getOutgoers, getIncomers } from '@xyflow/react';
import type { SwitchStructure } from './types';
import { standardDataTypeNamesMap } from '../../standardNodes';
import { getAllHandlesFromNodeData } from '../../handles/handleGetters';

type ZoneHandleIds = {
  switchStartTrueOutputIds: Set<string>;
  switchStartFalseOutputIds: Set<string>;
  switchEndTrueInputIds: Set<string>;
  switchEndFalseInputIds: Set<string>;
};

function isDataHandle(h: {
  value: {
    dataType?: {
      dataTypeUniqueId?: string;
      dataTypeObject?: { underlyingType?: string };
    };
  };
}): boolean {
  const dtId = h.value.dataType?.dataTypeUniqueId;
  return (
    dtId === standardDataTypeNamesMap.switchInfer ||
    (dtId !== standardDataTypeNamesMap.bindSwitchNodes &&
      h.value.dataType?.dataTypeObject?.underlyingType !== 'noEquivalent')
  );
}

function splitIntoZones(handles: ReadonlyArray<{ value: { id?: string } }>): {
  trueIds: Set<string>;
  falseIds: Set<string>;
} {
  const count = handles.length;
  const trueCount = Math.ceil(count / 2);
  const trueIds = new Set<string>();
  const falseIds = new Set<string>();
  for (let i = 0; i < count; i++) {
    const id = handles[i].value.id;
    if (id) {
      if (i < trueCount) trueIds.add(id);
      else falseIds.add(id);
    }
  }
  return { trueIds, falseIds };
}

function getZoneHandleIds<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  switchStructure: SwitchStructure<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): ZoneHandleIds {
  const { switchStart, switchEnd } = switchStructure;

  const startHandles = getAllHandlesFromNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof switchStart.data
  >(switchStart.data);
  const startDataOutputs = startHandles.outputsAndIndices.filter(isDataHandle);
  const startZones = splitIntoZones(startDataOutputs);

  const endHandles = getAllHandlesFromNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    typeof switchEnd.data
  >(switchEnd.data);
  const endDataInputs = endHandles.inputsAndIndices.filter(isDataHandle);
  const endZones = splitIntoZones(endDataInputs);

  return {
    switchStartTrueOutputIds: startZones.trueIds,
    switchStartFalseOutputIds: startZones.falseIds,
    switchEndTrueInputIds: endZones.trueIds,
    switchEndFalseInputIds: endZones.falseIds,
  };
}

function getNodesInSwitchRegion<
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
  switchStructure: SwitchStructure<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): {
  nodesInTrueBranch: Set<string>;
  nodesInFalseBranch: Set<string>;
} {
  const { switchStart, switchEnd } = switchStructure;
  const boundaryIds = new Set([switchStart.id, switchEnd.id]);

  const zones = getZoneHandleIds(switchStructure);

  const trueSeeds = new Set<string>();
  const falseSeeds = new Set<string>();

  for (const edge of state.edges) {
    if (edge.source === switchStart.id && edge.sourceHandle) {
      if (zones.switchStartTrueOutputIds.has(edge.sourceHandle)) {
        if (!boundaryIds.has(edge.target)) trueSeeds.add(edge.target);
      } else if (zones.switchStartFalseOutputIds.has(edge.sourceHandle)) {
        if (!boundaryIds.has(edge.target)) falseSeeds.add(edge.target);
      }
    }
    if (edge.target === switchEnd.id && edge.targetHandle) {
      if (zones.switchEndTrueInputIds.has(edge.targetHandle)) {
        if (!boundaryIds.has(edge.source)) trueSeeds.add(edge.source);
      } else if (zones.switchEndFalseInputIds.has(edge.targetHandle)) {
        if (!boundaryIds.has(edge.source)) falseSeeds.add(edge.source);
      }
    }
  }

  function bfsRegion(seeds: Set<string>): Set<string> {
    const visited = new Set<string>();
    const queue = [...seeds];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId) || boundaryIds.has(nodeId)) continue;
      visited.add(nodeId);

      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      for (const outgoer of getOutgoers(node, state.nodes, state.edges)) {
        if (!visited.has(outgoer.id) && !boundaryIds.has(outgoer.id)) {
          queue.push(outgoer.id);
        }
      }
      for (const incomer of getIncomers(node, state.nodes, state.edges)) {
        if (!visited.has(incomer.id) && !boundaryIds.has(incomer.id)) {
          queue.push(incomer.id);
        }
      }
    }
    return visited;
  }

  return {
    nodesInTrueBranch: bfsRegion(trueSeeds),
    nodesInFalseBranch: bfsRegion(falseSeeds),
  };
}

export { getNodesInSwitchRegion, getZoneHandleIds };
export type { ZoneHandleIds };
