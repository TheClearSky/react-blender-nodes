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

/**
 * Creates two enforced zones (True Branch, False Branch) for a new switch structure.
 *
 * @param switchStartId - The switch start node ID (used in structureLink).
 * @param switchEndId - The switch end node ID.
 * @param trueOutputHandleIds - Handle IDs for the true-zone outputs on SwitchStart.
 * @param falseOutputHandleIds - Handle IDs for the false-zone outputs on SwitchStart.
 * @param trueInputHandleIds - Handle IDs for the true-zone inputs on SwitchEnd.
 * @param falseInputHandleIds - Handle IDs for the false-zone inputs on SwitchEnd.
 * @returns Record of two zones keyed by their UUID IDs.
 */
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

/**
 * Removes all zones owned by a given structure.
 *
 * @param zones - The current zones record.
 * @param structureId - The anchor node ID of the structure to remove zones for.
 * @returns A new zones record with the structure's zones removed.
 */
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

/**
 * Default color palette for new user zones. The first palette color not used
 * by an existing user zone in scope is picked (falling back to count-rotation
 * once all are taken), so freshly-created zones stay visually distinct even
 * after deletions. Hex (sRGB) so it round-trips through the ColorPicker and
 * persists cleanly.
 */
// Shared with the label swatch presets (UserZoneLabelLayer) so a default-colored
// zone's swatch shows as active — one source of truth (no drift).
export const USER_ZONE_PALETTE = [
  '#60a5fa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#22d3ee',
  '#fb923c',
  '#a3e635',
];

/** Matches default zone names: bare `Zone` (suffix 1) or `Zone <n>`. Case-sensitive by intent. */
const DEFAULT_ZONE_NAME_PATTERN = /^Zone(?: (\d+))?$/;

/**
 * Creates a single USER-AUTHORED zone (a named/colored visual frame the user
 * wraps around selected nodes). Unlike system zones it has NO `structureLink`
 * and NO `boundaryHandles`, and `enforced: false` — membership is the authored
 * `nodeIds`, never recomputed by `recomputeAllZoneMemberships`.
 *
 * Defaults are derived from the zones already in scope:
 * - NAME: `Zone`, then `Zone 2`, `Zone 3`, … — max existing suffix + 1 (a bare
 *   `Zone` counts as suffix 1; a manually-typed `Zone 7` joins the scan), so a
 *   default name never duplicates an existing one even after deletions.
 * - COLOR: the first palette color no existing user zone uses; count-rotation
 *   once all palette colors are taken.
 *
 * @param nodeIds - Member node IDs (already deduped + scope-validated by the validator).
 * @param existingUserZones - The current scope's user zones (drives the name/color defaults).
 * @param name - Optional display name; blank falls back to the numbered default.
 * @param color - Optional CSS hex color; absent falls back to the first unused palette color.
 * @returns A visual-only `Zone`.
 */
function createUserZone(
  nodeIds: string[],
  existingUserZones: Record<string, Zone>,
  name?: string,
  color?: string,
): Zone {
  const existing = Object.values(existingUserZones);

  const trimmedName = name?.trim();
  let defaultName = 'Zone';
  const suffixes = existing
    .map((zone) => DEFAULT_ZONE_NAME_PATTERN.exec(zone.name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => (match[1] ? Number(match[1]) : 1));
  if (suffixes.length > 0) {
    defaultName = `Zone ${Math.max(...suffixes) + 1}`;
  }

  const usedColors = new Set(existing.map((zone) => zone.color));
  const defaultColor =
    USER_ZONE_PALETTE.find((paletteColor) => !usedColors.has(paletteColor)) ??
    USER_ZONE_PALETTE[existing.length % USER_ZONE_PALETTE.length];

  return {
    id: generateRandomString(ZONE_ID_LENGTH),
    name: trimmedName ? trimmedName : defaultName,
    color: color ?? defaultColor,
    nodeIds: [...nodeIds],
    enforced: false,
  };
}

/** Minimal handle shape needed for zone boundary discovery. */
type HandleLikeForZone = {
  id?: string;
  dataType?: {
    dataTypeUniqueId?: string;
    dataTypeObject?: { underlyingType?: string };
  };
};

/**
 * Extracts concrete data handle IDs from a node's inputs or outputs,
 * filtering out structural handles (bind, infer templates, condition).
 *
 * @param nodeData - The node's data containing inputs/outputs arrays.
 * @param side - Whether to extract from 'inputs' or 'outputs'.
 * @returns Array of handle IDs for concrete data handles only.
 */
function getDataHandleIdsFromNode(
  nodeData: {
    inputs?: ReadonlyArray<HandleLikeForZone>;
    outputs?: ReadonlyArray<HandleLikeForZone>;
  },
  side: 'inputs' | 'outputs',
): string[] {
  const handles = side === 'inputs' ? nodeData.inputs : nodeData.outputs;
  if (!Array.isArray(handles)) return [];
  return handles
    .filter((h) => {
      const dtId = h.dataType?.dataTypeUniqueId;
      if (!dtId) return false;
      const ut = h.dataType?.dataTypeObject?.underlyingType;
      return (
        dtId !== standardDataTypeNamesMap.bindLoopNodes &&
        dtId !== standardDataTypeNamesMap.loopInfer &&
        dtId !== standardDataTypeNamesMap.condition &&
        ut !== 'noEquivalent' &&
        ut !== 'inferFromConnection'
      );
    })
    .map((h) => h.id)
    .filter((id): id is string => Boolean(id));
}

/** Minimal node data shape needed for zone boundary handle extraction. */
type NodeDataForZone = {
  inputs?: ReadonlyArray<HandleLikeForZone>;
  outputs?: ReadonlyArray<HandleLikeForZone>;
};

/**
 * Creates two enforced zones (Pre-Stop Body, Post-Stop Body) for a new loop structure.
 *
 * @param loopStartId - The loop start node ID (used in structureLink).
 * @param loopStopId - The loop stop node ID.
 * @param loopEndId - The loop end node ID.
 * @param loopStartData - Node data for LoopStart (used to extract boundary handle IDs).
 * @param loopStopData - Node data for LoopStop.
 * @param loopEndData - Node data for LoopEnd.
 * @returns Record of two zones keyed by their UUID IDs.
 */
function createLoopZones(
  loopStartId: string,
  loopStopId: string,
  loopEndId: string,
  loopStartData?: NodeDataForZone,
  loopStopData?: NodeDataForZone,
  loopEndData?: NodeDataForZone,
): Record<string, Zone> {
  const preStopId = generateRandomString(ZONE_ID_LENGTH);
  const postStopId = generateRandomString(ZONE_ID_LENGTH);

  const startDataOuts = loopStartData
    ? getDataHandleIdsFromNode(loopStartData, 'outputs')
    : [];
  const stopDataIns = loopStopData
    ? getDataHandleIdsFromNode(loopStopData, 'inputs')
    : [];
  const stopDataOuts = loopStopData
    ? getDataHandleIdsFromNode(loopStopData, 'outputs')
    : [];
  const endDataIns = loopEndData
    ? getDataHandleIdsFromNode(loopEndData, 'inputs')
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

/**
 * Refreshes boundary handle IDs and recomputes node membership for all
 * zones in the given scope.
 *
 * Call after any edge addition/removal. The state must contain the
 * scope-correct nodes/edges/zones — use `getCurrentNodesAndEdgesFromState`
 * to get the right scope before calling.
 *
 * @param state - Scope-correct state with nodes, edges, and zones for the
 *   current view (root or subtree).
 * @returns Updated zones and rebuilt zone index.
 *
 * @example
 * ```ts
 * const view = getCurrentNodesAndEdgesFromState(draft);
 * const scopedState = { ...draft, nodes: view.nodes, edges: view.edges, zones: view.zones };
 * const { zones, zoneIndex } = recomputeAllZoneMemberships(scopedState);
 * setCurrentZonesToState(draft, zones, zoneIndex);
 * ```
 */
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
      structure.loopStart.data,
      'outputs',
    );
    const stopDataIns = getDataHandleIdsFromNode(
      structure.loopStop.data,
      'inputs',
    );
    const stopDataOuts = getDataHandleIdsFromNode(
      structure.loopStop.data,
      'outputs',
    );
    const endDataIns = getDataHandleIdsFromNode(
      structure.loopEnd.data,
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

/**
 * Rebuilds zones from scratch by scanning for all switch/loop structures
 * in the state, creating their zones, and computing initial memberships.
 *
 * Used on import (`REPLACE_STATE`) when the incoming state has no zones
 * field (zones are stripped on export).
 *
 * @param state - The imported state with nodes and edges but no zones.
 * @returns Fully populated zones and zone index.
 *
 * @example
 * ```ts
 * const rehydrated = rehydrateAllZones(importedState);
 * importedState.zones = rehydrated.zones;
 * importedState.zoneIndex = rehydrated.zoneIndex;
 * ```
 */
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
        structure.loopStart.data,
        structure.loopStop.data,
        structure.loopEnd.data,
      );
      zones = { ...zones, ...newZones };
    }
  }

  return recomputeAllZoneMemberships({ ...state, zones });
}

/**
 * Rebuild the DERIVED `zones`/`zoneIndex` for every group SUBTREE in a state's
 * `typeOfNodes`, returning a NEW `typeOfNodes`.
 *
 * Export strips subtree zones, and `rehydrateAllZones` only walks the ROOT
 * scope — so without this an imported group's inner loops/switches have no
 * zones (no frames, and zone-guarded validation branches fall back to BFS).
 * Groups are flat, id-keyed entries in `typeOfNodes` (no recursion needed:
 * every group's subtree — including nested ones — is its own top-level key).
 * Authored `subtree.userZones` is left untouched (never rehydrated).
 */
function rehydrateSubtreeZones<
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
): State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>['typeOfNodes'] {
  const typeOfNodes = state.typeOfNodes;
  const result = { ...typeOfNodes };
  for (const key of Object.keys(typeOfNodes) as NodeTypeUniqueId[]) {
    const nodeType = typeOfNodes[key];
    const subtree = nodeType.subtree;
    if (!subtree) continue;
    const rehydrated = rehydrateAllZones({
      ...state,
      nodes: subtree.nodes,
      edges: subtree.edges,
    });
    result[key] = {
      ...nodeType,
      subtree: {
        ...subtree,
        zones: rehydrated.zones,
        zoneIndex: rehydrated.zoneIndex,
      },
    };
  }
  return result;
}

export {
  createSwitchZones,
  createLoopZones,
  createUserZone,
  removeStructureZones,
  recomputeAllZoneMemberships,
  rehydrateAllZones,
  rehydrateSubtreeZones,
  findZoneByStructure,
};
