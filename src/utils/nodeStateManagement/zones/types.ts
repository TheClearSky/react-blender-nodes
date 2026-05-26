type ZoneStructureLink = {
  structureType: 'switch' | 'loop';
  structureId: string;
  zoneRole: string;
};

type ZoneBoundaryHandle = {
  handleIds: string[];
  direction: 'inputs' | 'outputs';
};

type Zone = {
  id: string;
  name: string;
  color: string;
  nodeIds: string[];
  boundaryHandles?: Record<string, ZoneBoundaryHandle>;
  structureLink?: ZoneStructureLink;
  enforced: boolean;
};

type ZoneIndex = {
  handleToZone: Record<string, string>;
};

function getBoundaryNodeIds(zone: Zone): string[] {
  return Object.keys(zone.boundaryHandles ?? {});
}

function buildZoneIndex(zones: Record<string, Zone>): ZoneIndex {
  const handleToZone: Record<string, string> = {};
  for (const zone of Object.values(zones)) {
    if (!zone.boundaryHandles) continue;
    for (const { handleIds } of Object.values(zone.boundaryHandles)) {
      for (const handleId of handleIds) {
        handleToZone[handleId] = zone.id;
      }
    }
  }
  return { handleToZone };
}

function findZoneByStructure(
  zones: Record<string, Zone>,
  structureId: string,
  zoneRole: string,
): Zone | undefined {
  return Object.values(zones).find(
    (z) =>
      z.structureLink?.structureId === structureId &&
      z.structureLink?.zoneRole === zoneRole,
  );
}

export { getBoundaryNodeIds, buildZoneIndex, findZoneByStructure };
export type { Zone, ZoneStructureLink, ZoneBoundaryHandle, ZoneIndex };
