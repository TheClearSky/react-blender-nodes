import { useMemo } from 'react';
import { RegionChannelEditDrawer } from '@/components/molecules/RegionChannelEditDrawer/RegionChannelEditDrawer';
import { LoopHandleLevelRow } from './LoopHandleLevelRow';
import type { LoopHandleLevel } from './loopLevelConversion';
import {
  extractLevelsFromLoopNodes,
  getCommonName,
} from './loopLevelConversion';
import type { GetNeighborhood } from '@/components/molecules/NodeTypeEditDrawer/HandleSummaryModal';
import type { HandleBlastRadius } from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';

type LoopEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  loopStartNodeData: Record<string, unknown> | null;
  loopStopNodeData: Record<string, unknown> | null;
  loopEndNodeData: Record<string, unknown> | null;
  /** Save the kept (reordered/renamed) channels and the channels to delete. */
  onSave: (
    keptLevels: LoopHandleLevel[],
    deletedLevels: LoopHandleLevel[],
  ) => void;
  /** Compute the connections a channel deletion would break (from live state).
   *  When omitted, channel deletion is disabled. */
  getChannelBlastRadius?: (level: LoopHandleLevel) => HandleBlastRadius;
  /** Neighborhood data for a connection's inline read-only mini-map. */
  getNeighborhood?: GetNeighborhood;
};

function LoopEditDrawer({
  isOpen,
  onClose,
  loopStartNodeData,
  loopStopNodeData,
  loopEndNodeData,
  onSave,
  getChannelBlastRadius,
  getNeighborhood,
}: LoopEditDrawerProps) {
  const initialLevels = useMemo<LoopHandleLevel[]>(() => {
    if (!loopStartNodeData || !loopStopNodeData || !loopEndNodeData) return [];
    return extractLevelsFromLoopNodes(
      loopStartNodeData,
      loopStopNodeData,
      loopEndNodeData,
    );
  }, [loopStartNodeData, loopStopNodeData, loopEndNodeData]);

  return (
    <RegionChannelEditDrawer<LoopHandleLevel>
      isOpen={isOpen}
      onClose={onClose}
      title='Edit Loop'
      emptyStateText='No data channels yet. Connect a data source to any loop node to create the first channel.'
      initialLevels={initialLevels}
      renderRow={(level, onUpdate) => (
        <LoopHandleLevelRow level={level} onUpdateLevel={onUpdate} />
      )}
      getListItemName={(level, index) =>
        level.handles.loopStartIn.name || `Channel ${index + 1}`
      }
      getDeletedLabel={(level) =>
        getCommonName(level) || level.handles.loopStartIn.name || 'Channel'
      }
      onSave={onSave}
      getChannelBlastRadius={getChannelBlastRadius}
      getNeighborhood={getNeighborhood}
    />
  );
}

export { LoopEditDrawer };
export type { LoopEditDrawerProps };
