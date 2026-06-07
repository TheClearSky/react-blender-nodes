/**
 * Links a system-controlled zone to the structural node pair that owns it.
 * Used to find zones by their parent structure without relying on zone IDs.
 */
type ZoneStructureLink = {
  /** The kind of structure that owns this zone. */
  structureType: 'switch' | 'loop';
  /** The anchor node ID of the structure (switchStartId or loopStartId). */
  structureId: string;
  /** Which region of the structure this zone represents (e.g. 'trueBranch', 'preStop'). */
  zoneRole: string;
};

/**
 * Describes the boundary handles on a single boundary node that define
 * one edge of a zone. The direction indicates which side of the boundary
 * node the zone's body nodes connect to.
 */
type ZoneBoundaryHandle = {
  /** Handle IDs on this boundary node that belong to this zone. */
  handleIds: string[];
  /** Whether these handles are inputs or outputs on the boundary node. */
  direction: 'inputs' | 'outputs';
};

/**
 * A first-class region of the graph, visually rendered as a frame polygon
 * and optionally enforcing connection boundary rules.
 *
 * System zones (switches, loops) are created/updated automatically when
 * structures are added or edges change. User zones (future) are visual-only
 * with no boundary enforcement.
 *
 * Zones are scope-local: root-level zones live on `state.zones`, subtree
 * zones live on `subtree.zones` inside their node group.
 */
type Zone = {
  /** Opaque unique identifier (UUID, not derived from node IDs). */
  id: string;
  /** Display name shown on the zone frame label. */
  name: string;
  /** CSS color for the zone frame polygon and label. */
  color: string;
  /** IDs of body nodes currently inside this zone (recomputed on every edge change). */
  nodeIds: string[];
  /**
   * Per-boundary-node handle definitions. Keys are boundary node IDs.
   * The BFS zone discovery starts from edges connected to these handles
   * and stops at boundary nodes.
   *
   * Undefined for user-created zones (no boundaries, visual only).
   */
  boundaryHandles?: Record<string, ZoneBoundaryHandle>;
  /** Present for system-controlled zones; absent for user-created zones. */
  structureLink?: ZoneStructureLink;
  /** Whether connections crossing this zone's boundary are blocked. */
  enforced: boolean;
};

/**
 * Reverse index from handle IDs to zone IDs for O(1) lookups
 * during connection validation. Rebuilt whenever zones change.
 */
type ZoneIndex = {
  /** Maps each boundary handle ID to the zone it belongs to. */
  handleToZone: Record<string, string>;
};

/**
 * Derives boundary node IDs from a zone's `boundaryHandles` keys.
 *
 * @param zone - The zone to extract boundary node IDs from.
 * @returns Array of node IDs that form the zone's boundary. Empty for user zones.
 *
 * @example
 * ```ts
 * const boundaryIds = getBoundaryNodeIds(trueZone);
 * // ['switchStartId', 'switchEndId']
 * ```
 */
function getBoundaryNodeIds(zone: Zone): string[] {
  return Object.keys(zone.boundaryHandles ?? {});
}

/**
 * Builds a reverse index mapping each boundary handle ID to its owning zone ID.
 * Used for O(1) lookups during connection validation.
 *
 * @param zones - All zones in the current scope.
 * @returns A `ZoneIndex` with the `handleToZone` mapping.
 *
 * @example
 * ```ts
 * const index = buildZoneIndex(state.zones);
 * const zoneId = index.handleToZone[someHandleId]; // O(1)
 * ```
 */
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

/**
 * Finds a zone by its parent structure ID and role via `structureLink`.
 * O(n) scan over zones — n is typically small (2–4 per structure).
 *
 * @param zones - All zones in the current scope.
 * @param structureId - The anchor node ID of the structure (e.g. switchStartId).
 * @param zoneRole - The role to match (e.g. 'trueBranch', 'preStop').
 * @returns The matching zone, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const trueZone = findZoneByStructure(state.zones, switchStartId, 'trueBranch');
 * ```
 */
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
