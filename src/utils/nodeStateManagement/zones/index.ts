export type {
  Zone,
  ZoneStructureLink,
  ZoneBoundaryHandle,
  ZoneIndex,
} from './types';
export {
  getBoundaryNodeIds,
  buildZoneIndex,
  findZoneByStructure,
} from './types';
export {
  discoverZoneNodesFromHandles,
  isNodeReachableToBoundary,
} from './discoverZoneNodes';
export {
  createSwitchZones,
  createLoopZones,
  createUserZone,
  removeStructureZones,
  recomputeAllZoneMemberships,
  rehydrateAllZones,
  rehydrateSubtreeZones,
} from './zoneLifecycle';
