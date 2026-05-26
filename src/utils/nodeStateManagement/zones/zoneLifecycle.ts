import type { State, SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import type { Zone, ZoneIndex } from './types';
import { buildZoneIndex, findZoneByStructure } from './types';
import { discoverZoneNodesFromHandles } from './discoverZoneNodes';
import {
  standardNodeTypeNamesMap,
  standardDataTypeNamesMap,
} from '../standardNodes';
import { getSwitchStructureFromNode } from '../nodes/switches/switchStructure';
import { getZoneHandleIds } from '../nodes/switches/switchRegion';
import { getLoopStructureFromNode } from '../nodes/loops/loopStructure';
import { generateRandomString } from '@/utils/randomGeneration';

const ZONE_ID_LENGTH = 16;

function createSwitchZones(
  switchStartId: string,
  switchEndId: string,
  trueOutputHandleIds: string[] = [],
  falseOutputHandleIds: string[] = [],
  trueInputHandleIds: string[] = [],
  falseInputHandleIds: string[] = [],
): Record<string, Zone> {
  const trueId = generateRandomString(ZONE_ID_LENGTH);
  const falseId = generateRandomString(ZONE_ID_LENGTH);

  return {
    [trueId]: {
      id: trueId,
      name: 'True Branch',
      color: '#4ade80',
      nodeIds: [],
      boundaryHandles: {
        [switchStartId]: {
          handleIds: trueOutputHandleIds,
          direction: 'outputs',
        },
        [switchEndId]: { handleIds: trueInputHandleIds, direction: 'inputs' },
      },
      structureLink: {
        structureType: 'switch',
        structureId: switchStartId,
        zoneRole: 'trueBranch',
      },
      enforced: true,
    },
    [falseId]: {
      id: falseId,
      name: 'False Branch',
      color: '#f87171',
      nodeIds: [],
      boundaryHandles: {
        [switchStartId]: {
          handleIds: falseOutputHandleIds,
          direction: 'outputs',
        },
        [switchEndId]: { handleIds: falseInputHandleIds, direction: 'inputs' },
      },
      structureLink: {
        structureType: 'switch',
        structureId: switchStartId,
        zoneRole: 'falseBranch',
      },
      enforced: true,
    },
  };
}

function removeStructureZones(
  zones: Record<string, Zone>,
  structureId: string,
): Record<string, Zone> {
  const result = { ...zones };
  for (const [id, zone] of Object.entries(result)) {
    if (zone.structureLink?.structureId === structureId) {
      delete result[id];
    }
  }
  return result;
}

function getDataHandleIdsFromNode(
  nodeData: {
    inputs?: ReadonlyArray<Record<string, unknown>>;
    outputs?: ReadonlyArray<Record<string, unknown>>;
  },
  side: 'inputs' | 'outputs',
): string[] {
  const handles = side === 'inputs' ? nodeData.inputs : nodeData.outputs;
  if (!Array.isArray(handles)) return [];
  return handles
    .filter((h) => {
      const dtId = (h as { dataType?: { dataTypeUniqueId?: string } }).dataType
        ?.dataTypeUniqueId;
      const ut = (
        h as { dataType?: { dataTypeObject?: { underlyingType?: string } } }
      ).dataType?.dataTypeObject?.underlyingType;
      return (
        dtId !== standardDataTypeNamesMap.bindLoopNodes &&
        dtId !== standardDataTypeNamesMap.loopInfer &&
        dtId !== standardDataTypeNamesMap.condition &&
        ut !== 'noEquivalent' &&
        ut !== 'inferFromConnection'
      );
    })
    .map((h) => (h as { id?: string }).id)
    .filter((id): id is string => Boolean(id));
}

function createLoopZones(
  loopStartId: string,
  loopStopId: string,
  loopEndId: string,
  loopStartData?: Record<string, unknown>,
  loopStopData?: Record<string, unknown>,
  loopEndData?: Record<string, unknown>,
): Record<string, Zone> {
  const preStopId = generateRandomString(ZONE_ID_LENGTH);
  const postStopId = generateRandomString(ZONE_ID_LENGTH);

  const startDataOuts = loopStartData
    ? getDataHandleIdsFromNode(
        loopStartData as {
          inputs?: ReadonlyArray<Record<string, unknown>>;
          outputs?: ReadonlyArray<Record<string, unknown>>;
        },
        'outputs',
      )
    : [];
  const stopDataIns = loopStopData
    ? getDataHandleIdsFromNode(
        loopStopData as {
          inputs?: ReadonlyArray<Record<string, unknown>>;
          outputs?: ReadonlyArray<Record<string, unknown>>;
        },
        'inputs',
      )
    : [];
  const stopDataOuts = loopStopData
    ? getDataHandleIdsFromNode(
        loopStopData as {
          inputs?: ReadonlyArray<Record<string, unknown>>;
          outputs?: ReadonlyArray<Record<string, unknown>>;
        },
        'outputs',
      )
    : [];
  const endDataIns = loopEndData
    ? getDataHandleIdsFromNode(
        loopEndData as {
          inputs?: ReadonlyArray<Record<string, unknown>>;
          outputs?: ReadonlyArray<Record<string, unknown>>;
        },
        'inputs',
      )
    : [];

  return {
    [preStopId]: {
      id: preStopId,
      name: 'Pre-Stop Body',
      color: '#a78bfa',
      nodeIds: [],
      boundaryHandles: {
        [loopStartId]: { handleIds: startDataOuts, direction: 'outputs' },
        [loopStopId]: { handleIds: stopDataIns, direction: 'inputs' },
        [loopEndId]: { handleIds: [], direction: 'inputs' },
      },
      structureLink: {
        structureType: 'loop',
        structureId: loopStartId,
        zoneRole: 'preStop',
      },
      enforced: true,
    },
    [postStopId]: {
      id: postStopId,
      name: 'Post-Stop Body',
      color: '#8b5cf6',
      nodeIds: [],
      boundaryHandles: {
        [loopStopId]: { handleIds: stopDataOuts, direction: 'outputs' },
        [loopEndId]: { handleIds: endDataIns, direction: 'inputs' },
        [loopStartId]: { handleIds: [], direction: 'outputs' },
      },
      structureLink: {
        structureType: 'loop',
        structureId: loopStartId,
        zoneRole: 'postStop',
      },
      enforced: true,
    },
  };
}

function recomputeAllZoneMemberships<
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
): { zones: Record<string, Zone>; zoneIndex: ZoneIndex } {
  const zones = { ...(state.zones ?? {}) };

  // Refresh switch zone boundary handles (handles change after inference)
  for (const node of state.nodes) {
    if (node.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.switchStart)
      continue;
    const structure = getSwitchStructureFromNode(state, node);
    if (!structure) continue;

    const switchStartId = structure.switchStart.id;
    const switchEndId = structure.switchEnd.id;
    const zoneHandles = getZoneHandleIds(structure);

    const trueZone = findZoneByStructure(zones, switchStartId, 'trueBranch');
    const falseZone = findZoneByStructure(zones, switchStartId, 'falseBranch');

    if (trueZone) {
      zones[trueZone.id] = {
        ...trueZone,
        boundaryHandles: {
          [switchStartId]: {
            handleIds: [...zoneHandles.switchStartTrueOutputIds],
            direction: 'outputs',
          },
          [switchEndId]: {
            handleIds: [...zoneHandles.switchEndTrueInputIds],
            direction: 'inputs',
          },
        },
      };
    }
    if (falseZone) {
      zones[falseZone.id] = {
        ...falseZone,
        boundaryHandles: {
          [switchStartId]: {
            handleIds: [...zoneHandles.switchStartFalseOutputIds],
            direction: 'outputs',
          },
          [switchEndId]: {
            handleIds: [...zoneHandles.switchEndFalseInputIds],
            direction: 'inputs',
          },
        },
      };
    }
  }

  // Refresh loop zone boundary handles
  for (const node of state.nodes) {
    if (node.data.nodeTypeUniqueId !== standardNodeTypeNamesMap.loopStart)
      continue;
    const structure = getLoopStructureFromNode(state, node);
    if (!structure) continue;

    const loopStartId = structure.loopStart.id;
    const loopStopId = structure.loopStop.id;
    const loopEndId = structure.loopEnd.id;

    const startDataOuts = getDataHandleIdsFromNode(
      structure.loopStart.data as Record<string, unknown>,
      'outputs',
    );
    const stopDataIns = getDataHandleIdsFromNode(
      structure.loopStop.data as Record<string, unknown>,
      'inputs',
    );
    const stopDataOuts = getDataHandleIdsFromNode(
      structure.loopStop.data as Record<string, unknown>,
      'outputs',
    );
    const endDataIns = getDataHandleIdsFromNode(
      structure.loopEnd.data as Record<string, unknown>,
      'inputs',
    );

    const preStopZone = findZoneByStructure(zones, loopStartId, 'preStop');
    const postStopZone = findZoneByStructure(zones, loopStartId, 'postStop');

    if (preStopZone) {
      zones[preStopZone.id] = {
        ...preStopZone,
        boundaryHandles: {
          [loopStartId]: { handleIds: startDataOuts, direction: 'outputs' },
          [loopStopId]: { handleIds: stopDataIns, direction: 'inputs' },
          [loopEndId]: { handleIds: [], direction: 'inputs' },
        },
      };
    }
    if (postStopZone) {
      zones[postStopZone.id] = {
        ...postStopZone,
        boundaryHandles: {
          [loopStopId]: { handleIds: stopDataOuts, direction: 'outputs' },
          [loopEndId]: { handleIds: endDataIns, direction: 'inputs' },
          [loopStartId]: { handleIds: [], direction: 'outputs' },
        },
      };
    }
  }

  // Recompute node membership for ALL zones using unified BFS
  for (const zoneId of Object.keys(zones)) {
    const zone = zones[zoneId];
    if (!zone.boundaryHandles) continue;
    const discovered = discoverZoneNodesFromHandles(state, zone);
    zones[zoneId] = { ...zone, nodeIds: [...discovered] };
  }

  return { zones, zoneIndex: buildZoneIndex(zones) };
}

function rehydrateAllZones<
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
): { zones: Record<string, Zone>; zoneIndex: ZoneIndex } {
  let zones: Record<string, Zone> = {};

  for (const node of state.nodes) {
    if (node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart) {
      const structure = getSwitchStructureFromNode(state, node);
      if (!structure) continue;
      const newZones = createSwitchZones(
        structure.switchStart.id,
        structure.switchEnd.id,
      );
      zones = { ...zones, ...newZones };
    }
    if (node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart) {
      const structure = getLoopStructureFromNode(state, node);
      if (!structure) continue;
      const newZones = createLoopZones(
        structure.loopStart.id,
        structure.loopStop.id,
        structure.loopEnd.id,
        structure.loopStart.data as Record<string, unknown>,
        structure.loopStop.data as Record<string, unknown>,
        structure.loopEnd.data as Record<string, unknown>,
      );
      zones = { ...zones, ...newZones };
    }
  }

  return recomputeAllZoneMemberships({ ...state, zones });
}

export {
  createSwitchZones,
  createLoopZones,
  removeStructureZones,
  recomputeAllZoneMemberships,
  rehydrateAllZones,
  findZoneByStructure,
};
