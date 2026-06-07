import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Info, Undo2 } from 'lucide-react';
import { Button } from '@/components/atoms';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';
import { DragList } from '@/components/molecules/DragList';
import type { DragListItem } from '@/components/molecules/DragList/types';
import {
  HandleSummaryModal,
  type GetNeighborhood,
} from '@/components/molecules/NodeTypeEditDrawer/HandleSummaryModal';
import { DeletionReviewModal } from '@/components/molecules/NodeTypeEditDrawer/DeletionReviewModal';
import type {
  HandleBlastRadius,
  HandleDeletionTarget,
} from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';

/** Minimal shape every region channel level must provide for the shared drawer. */
type RegionChannelLevel = { id: string; dataTypeColor: string };

type LevelAdditionalProps<TLevel> = {
  level: TLevel;
  levelIndex: number;
};

type RegionChannelEditDrawerProps<TLevel extends RegionChannelLevel> = {
  isOpen: boolean;
  onClose: () => void;
  /** Drawer header title, e.g. "Edit Loop" / "Edit Switch". */
  title: string;
  /** Copy shown when there are no channels yet. */
  emptyStateText: string;
  /** Channels derived from live node data by the caller (memoized). Re-applied
   *  to local edit state each time the drawer opens or the source data changes. */
  initialLevels: TLevel[];
  /** Render the variant-specific level row (handle inputs). */
  renderRow: (
    level: TLevel,
    onUpdate: (updated: TLevel) => void,
  ) => React.ReactNode;
  /** Drag-list item label for a level. */
  getListItemName: (level: TLevel, index: number) => string;
  /** Label for a level in the "Deleted" section. */
  getDeletedLabel: (level: TLevel) => string;
  /** Save the kept (reordered/renamed) channels and the channels to delete. */
  onSave: (keptLevels: TLevel[], deletedLevels: TLevel[]) => void;
  /** Compute the connections a channel deletion would break (from live state).
   *  When omitted, channel deletion is disabled. */
  getChannelBlastRadius?: (level: TLevel) => HandleBlastRadius;
  /** Neighborhood data for a connection's inline read-only mini-map. */
  getNeighborhood?: GetNeighborhood;
};

const EMPTY_NEIGHBORHOOD: GetNeighborhood = () => ({
  nodes: [],
  edges: [],
  highlightEdgeId: null,
});

/**
 * Shared right-side drawer for editing the data channels of a region (loop or
 * switch). It owns the slide animation, the reorder/rename/delete-staging state,
 * the DragList, the "Deleted" section, and the connection-summary / deletion-review
 * modals. Variant-specific concerns (how a level renders, how it is labelled, and
 * how its channels are extracted) are injected via props, so loops and switches
 * share one implementation.
 */
function RegionChannelEditDrawer<TLevel extends RegionChannelLevel>({
  isOpen,
  onClose,
  title,
  emptyStateText,
  initialLevels,
  renderRow,
  getListItemName,
  getDeletedLabel,
  onSave,
  getChannelBlastRadius,
  getNeighborhood,
}: RegionChannelEditDrawerProps<TLevel>) {
  const { mounted, ref, style } = useSlideAnimation(isOpen, {
    hiddenTransform: 'translateX(100%)',
    visibleTransform: 'translateX(0)',
    durationMs: 200,
  });

  const [localLevels, setLocalLevels] = useState<TLevel[]>([]);
  const [deletedLevels, setDeletedLevels] = useState<TLevel[]>([]);
  const [summaryFor, setSummaryFor] = useState<TLevel | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const deletionsEnabled = !!getChannelBlastRadius;
  const neighborhood = getNeighborhood ?? EMPTY_NEIGHBORHOOD;

  useEffect(() => {
    if (isOpen) {
      setLocalLevels(initialLevels);
      setDeletedLevels([]);
      setSummaryFor(null);
      setReviewOpen(false);
    }
  }, [isOpen, initialLevels]);

  const levelsToItems = (
    levels: TLevel[],
  ): DragListItem<LevelAdditionalProps<TLevel>>[] =>
    levels.map((level, index) => ({
      id: level.id,
      name: getListItemName(level, index),
      additionalProperties: { level, levelIndex: index },
    }));

  const itemsToLevels = (
    items: DragListItem<LevelAdditionalProps<TLevel>>[],
    currentLevels: TLevel[],
  ): TLevel[] =>
    items.map((item) => {
      const levelData = item.additionalProperties?.level;
      if (levelData) return levelData;
      return currentLevels.find((l) => l.id === item.id) ?? currentLevels[0];
    });

  const handleUpdateLevel = useCallback((index: number, updated: TLevel) => {
    setLocalLevels((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  const summaryBlastRadius = useMemo<HandleBlastRadius | null>(() => {
    if (!summaryFor || !getChannelBlastRadius) return null;
    return getChannelBlastRadius(summaryFor);
  }, [summaryFor, getChannelBlastRadius]);

  const reviewBlastRadii = useMemo<HandleBlastRadius[]>(() => {
    if (!reviewOpen || !getChannelBlastRadius) return [];
    return deletedLevels.map((level) => getChannelBlastRadius(level));
  }, [reviewOpen, deletedLevels, getChannelBlastRadius]);

  const moveToDeleted = (level: TLevel) => {
    setLocalLevels((prev) => prev.filter((l) => l.id !== level.id));
    setDeletedLevels((prev) => [...prev, level]);
  };

  const restoreDeleted = (level: TLevel) => {
    setDeletedLevels((prev) => prev.filter((l) => l.id !== level.id));
    setLocalLevels((prev) => [...prev, level]);
  };

  // DragList delete: stage the channel into the "Deleted" section instead of
  // dropping it outright (`return false` suppresses DragList's auto-removal —
  // `moveToDeleted` shrinks `localLevels`, which is what `items` derives from).
  const handleChannelDelete = async (
    item: DragListItem<LevelAdditionalProps<TLevel>>,
  ): Promise<boolean> => {
    const level = item.additionalProperties?.level;
    if (level) moveToDeleted(level);
    return false;
  };

  const handleSave = () => {
    if (deletedLevels.length > 0) {
      setReviewOpen(true); // commit happens on review confirm
      return;
    }
    onSave(localLevels, []);
    onClose();
  };

  const handleReviewConfirm = (includedTargets: HandleDeletionTarget[]) => {
    setReviewOpen(false);
    // The modal returns the exact `blastRadius.target` refs; map them back to
    // levels by identity (positionally aligned with `deletedLevels`).
    const keptDeleted = deletedLevels.filter((_, index) =>
      includedTargets.includes(reviewBlastRadii[index]?.target),
    );
    onSave(localLevels, keptDeleted);
    onClose();
  };

  if (!mounted) return null;

  return (
    <div className='absolute right-0 top-0 bottom-0 w-[320px] z-20 overflow-hidden pointer-events-none'>
      <div
        ref={ref}
        style={style}
        className='w-full h-full pointer-events-auto flex flex-col bg-[#222222] border-l border-secondary-dark-gray'
      >
        <div className='flex items-center justify-between border-b border-secondary-dark-gray px-3 py-2.5'>
          <span className='text-primary-white text-[16px] leading-[16px] font-main truncate'>
            {title}
          </span>
          <Button
            size='small'
            onClick={onClose}
            className='bg-transparent border-none hover:bg-primary-gray p-1'
          >
            <X className='w-[18px] h-[18px]' />
          </Button>
        </div>

        <div className='flex-1 overflow-y-auto p-3 flex flex-col gap-3'>
          <label className='text-primary-white text-sm font-main'>
            Data Channels ({localLevels.length})
          </label>

          {localLevels.length > 0 ? (
            <DragList<LevelAdditionalProps<TLevel>>
              items={levelsToItems(localLevels)}
              onChange={(newItems) =>
                setLocalLevels(itemsToLevels(newItems, localLevels))
              }
              onDelete={deletionsEnabled ? handleChannelDelete : undefined}
              isDeletable={deletionsEnabled ? () => true : undefined}
              maxDepth={0}
              renderContent={(item) => {
                const level = item.additionalProperties?.level;
                if (!level) return null;
                const index = localLevels.findIndex((l) => l.id === level.id);
                return renderRow(level, (updated) =>
                  handleUpdateLevel(index === -1 ? 0 : index, updated),
                );
              }}
            />
          ) : (
            <div className='text-secondary-light-gray text-sm py-2 text-center'>
              {emptyStateText}
            </div>
          )}

          {deletedLevels.length > 0 && (
            <div className='flex flex-col gap-1.5'>
              <label className='text-primary-white text-sm font-main'>
                Deleted ({deletedLevels.length})
              </label>
              <div className='flex flex-col gap-1'>
                {deletedLevels.map((level) => (
                  <div
                    key={level.id}
                    className='flex items-center gap-1.5 px-2 py-1 rounded bg-primary-gray/40'
                  >
                    <span
                      className='w-2.5 h-2.5 rounded-sm shrink-0'
                      style={{ backgroundColor: level.dataTypeColor }}
                    />
                    <span className='truncate text-primary-white/70 line-through text-[13px]'>
                      {getDeletedLabel(level)}
                    </span>
                    <button
                      type='button'
                      title='Show connections that will break'
                      onClick={() => setSummaryFor(level)}
                      className='ml-auto shrink-0 p-1 rounded hover:bg-primary-gray text-secondary-light-gray hover:text-primary-white transition-colors'
                    >
                      <Info className='w-3.5 h-3.5' />
                    </button>
                    <button
                      type='button'
                      title='Restore this channel'
                      onClick={() => restoreDeleted(level)}
                      className='shrink-0 p-1 rounded hover:bg-primary-gray text-secondary-light-gray hover:text-primary-white transition-colors'
                    >
                      <Undo2 className='w-3.5 h-3.5' />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className='border-t border-secondary-dark-gray px-3 py-2 flex gap-2'>
          <Button size='small' color='lightNonPriority' onClick={handleSave}>
            {deletedLevels.length > 0 ? 'Save & Review Deletions' : 'Save'}
          </Button>
          <Button size='small' color='dark' onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>

      <HandleSummaryModal
        isOpen={summaryBlastRadius !== null}
        onClose={() => setSummaryFor(null)}
        blastRadius={summaryBlastRadius}
        getNeighborhood={neighborhood}
        consolidatedMap
      />

      <DeletionReviewModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        blastRadii={reviewBlastRadii}
        getNeighborhood={neighborhood}
        onConfirm={handleReviewConfirm}
        singleMap
      />
    </div>
  );
}

export { RegionChannelEditDrawer };
export type { RegionChannelEditDrawerProps, RegionChannelLevel };
