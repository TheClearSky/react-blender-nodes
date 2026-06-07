import { useMemo } from 'react';
import { RegionChannelEditDrawer } from '@/components/molecules/RegionChannelEditDrawer/RegionChannelEditDrawer';
import { SwitchHandleLevelRow } from './SwitchHandleLevelRow';
import type { SwitchHandleLevel } from './switchLevelConversion';
import {
  extractLevelsFromSwitchNodes,
  getCommonName,
} from './switchLevelConversion';
import type { GetNeighborhood } from '@/components/molecules/NodeTypeEditDrawer/HandleSummaryModal';
import type { HandleBlastRadius } from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';

type NodeData = {
  inputs?: ReadonlyArray<Record<string, unknown>>;
  outputs?: ReadonlyArray<Record<string, unknown>>;
};

type SwitchEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  switchStartNodeData: Record<string, unknown> | null;
  switchEndNodeData: Record<string, unknown> | null;
  /** Save the kept (reordered/renamed) channels and the channels to delete. */
  onSave: (
    keptLevels: SwitchHandleLevel[],
    deletedLevels: SwitchHandleLevel[],
  ) => void;
  /** Compute the connections a channel deletion would break (from live state).
   *  When omitted, channel deletion is disabled. */
  getChannelBlastRadius?: (level: SwitchHandleLevel) => HandleBlastRadius;
  /** Neighborhood data for a connection's inline read-only mini-map. */
  getNeighborhood?: GetNeighborhood;
};

function SwitchEditDrawer({
  isOpen,
  onClose,
  switchStartNodeData,
  switchEndNodeData,
  onSave,
  getChannelBlastRadius,
  getNeighborhood,
}: SwitchEditDrawerProps) {
  const initialLevels = useMemo<SwitchHandleLevel[]>(() => {
    if (!switchStartNodeData || !switchEndNodeData) return [];
    return extractLevelsFromSwitchNodes(
      switchStartNodeData as NodeData,
      switchEndNodeData as NodeData,
    );
  }, [switchStartNodeData, switchEndNodeData]);

  return (
    <RegionChannelEditDrawer<SwitchHandleLevel>
      isOpen={isOpen}
      onClose={onClose}
      title='Edit Switch'
      emptyStateText='No data channels yet. Connect a data source to Switch Start to create the first channel.'
      initialLevels={initialLevels}
      renderRow={(level, onUpdate) => (
        <SwitchHandleLevelRow level={level} onUpdateLevel={onUpdate} />
      )}
      getListItemName={(level, index) =>
        level.handles.switchStartIn.name || `Channel ${index + 1}`
      }
      getDeletedLabel={(level) =>
        getCommonName(level) || level.handles.switchStartIn.name || 'Channel'
      }
      onSave={onSave}
      getChannelBlastRadius={getChannelBlastRadius}
      getNeighborhood={getNeighborhood}
    />
  );
}

export { SwitchEditDrawer };
export type { SwitchEditDrawerProps };
