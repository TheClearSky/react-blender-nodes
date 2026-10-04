import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Info, Undo2 } from 'lucide-react';
import { Button } from '@/components/atoms';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';
import { DragList } from '@/components/molecules/DragList';
import {
  HandleShapeSwatch,
  type HandleShape,
} from '@/components/atoms/HandleShapeSwatch';
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
type RegionChannelLevel = {
  id: string;
  dataTypeColor: string;
  dataTypeShape?: HandleShape;
};

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
  /** Save the kept (reordered/renamed) channels and the channels to delete,
   *  plus the (trimmed) description when `initialDescription` is given. */
  onSave: (
    keptLevels: TLevel[],
    deletedLevels: TLevel[],
    description?: string,
  ) => void;
  /** The region's current in-app description. When given (even `''`), the
   *  drawer shows a Description field and passes its value to `onSave`. */
  initialDescription?: string;
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
  initialDescription,
}: RegionChannelEditDrawerProps<TLevel>) {
  const theme = useGraphTheme();
  const { mounted, ref, style } = useSlideAnimation(isOpen, {
    hiddenTransform: 'translateX(100%)',
    visibleTransform: 'translateX(0)',
    durationMs: 200,
  });

  const [localLevels, setLocalLevels] = useState<TLevel[]>([]);
  const [deletedLevels, setDeletedLevels] = useState<TLevel[]>([]);
  const [summaryFor, setSummaryFor] = useState<TLevel | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [localDescription, setLocalDescription] = useState('');
  const describable = initialDescription !== undefined;

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
  // Separate from the levels reset so a description change elsewhere (undo)
  // re-seeds the field without discarding staged channel edits.
  useEffect(() => {
    if (isOpen) setLocalDescription(initialDescription ?? '');
  }, [isOpen, initialDescription]);
  const descriptionToSave = describable ? localDescription.trim() : undefined;

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
    onSave(localLevels, [], descriptionToSave);
    onClose();
  };

  const handleReviewConfirm = (includedTargets: HandleDeletionTarget[]) => {
    setReviewOpen(false);
    // The modal returns the exact `blastRadius.target` refs; map them back to
    // levels by identity (positionally aligned with `deletedLevels`).
    const keptDeleted = deletedLevels.filter((_, index) =>
      includedTargets.includes(reviewBlastRadii[index]?.target),
    );
    onSave(localLevels, keptDeleted, descriptionToSave);
    onClose();
  };

  if (!mounted) return null;

  return (
    <div className='rbn:absolute rbn:right-0 rbn:top-0 rbn:bottom-0 rbn:w-[320px] rbn:z-20 rbn:overflow-hidden rbn:pointer-events-none'>
      <div
        ref={ref}
        style={style}
        className={cn(
          'rbn:w-full rbn:h-full rbn:pointer-events-auto rbn:flex rbn:flex-col rbn:bg-graph-elevated-surface-bg rbn:border-l rbn:border-secondary-dark-gray',
          theme?.drawer?.container,
        )}
      >
        <div
          className={cn(
            'rbn:flex rbn:items-center rbn:justify-between rbn:border-b rbn:border-secondary-dark-gray rbn:px-3 rbn:py-2.5',
            theme?.drawer?.header,
          )}
        >
          <span
            className={cn(
              'rbn:text-primary-white rbn:text-[16px] rbn:leading-[16px] rbn:font-main rbn:truncate',
              theme?.drawer?.title,
            )}
          >
            {title}
          </span>
          <Button
            size='small'
            onClick={onClose}
            className={cn(
              'rbn:bg-transparent rbn:border-none rbn:hover:bg-primary-gray rbn:p-1',
              theme?.drawer?.closeButton,
            )}
          >
            <X className='rbn:w-[18px] rbn:h-[18px]' />
          </Button>
        </div>

        <div
          className={cn(
            'rbn:flex-1 rbn:overflow-y-auto rbn:p-3 rbn:flex rbn:flex-col rbn:gap-3',
            theme?.drawer?.content,
          )}
        >
          {describable && (
            <div className='rbn:flex rbn:flex-col rbn:gap-1'>
              <label
                htmlFor='rbn-region-description'
                className={cn(
                  'rbn:text-primary-white rbn:text-sm rbn:font-main',
                  theme?.drawer?.label,
                )}
              >
                Description
              </label>
              <textarea
                id='rbn-region-description'
                placeholder='What this does — shown behind the ⓘ on its titles'
                value={localDescription}
                onChange={(event) => setLocalDescription(event.target.value)}
                className='rbn:w-full rbn:min-h-[64px] rbn:resize-y rbn:rounded rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:px-2 rbn:py-1.5 rbn:text-[13px] rbn:leading-snug rbn:text-primary-white rbn:outline-none rbn:focus:border-primary-blue'
              />
            </div>
          )}

          <label
            className={cn(
              'rbn:text-primary-white rbn:text-sm rbn:font-main',
              theme?.drawer?.label,
            )}
          >
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
            <div
              className={cn(
                'rbn:text-secondary-light-gray rbn:text-sm rbn:py-2 rbn:text-center',
                theme?.drawer?.emptyState,
              )}
            >
              {emptyStateText}
            </div>
          )}

          {deletedLevels.length > 0 && (
            <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
              <label
                className={cn(
                  'rbn:text-primary-white rbn:text-sm rbn:font-main',
                  theme?.drawer?.label,
                )}
              >
                Deleted ({deletedLevels.length})
              </label>
              <div className='rbn:flex rbn:flex-col rbn:gap-1'>
                {deletedLevels.map((level) => (
                  <div
                    key={level.id}
                    className='rbn:flex rbn:items-center rbn:gap-1.5 rbn:px-2 rbn:py-1 rbn:rounded rbn:bg-primary-gray/40'
                  >
                    <HandleShapeSwatch
                      shape={level.dataTypeShape}
                      color={level.dataTypeColor}
                      size={14}
                      className={theme?.node?.handleShape}
                    />
                    <span className='rbn:truncate rbn:text-primary-white/70 rbn:line-through rbn:text-[13px]'>
                      {getDeletedLabel(level)}
                    </span>
                    <button
                      type='button'
                      title='Show connections that will break'
                      onClick={() => setSummaryFor(level)}
                      className='rbn:ml-auto rbn:shrink-0 rbn:p-1 rbn:rounded rbn:hover:bg-primary-gray rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:transition-colors'
                    >
                      <Info className='rbn:w-3.5 rbn:h-3.5' />
                    </button>
                    <button
                      type='button'
                      title='Restore this channel'
                      onClick={() => restoreDeleted(level)}
                      className='rbn:shrink-0 rbn:p-1 rbn:rounded rbn:hover:bg-primary-gray rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:transition-colors'
                    >
                      <Undo2 className='rbn:w-3.5 rbn:h-3.5' />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className={cn(
            'rbn:border-t rbn:border-secondary-dark-gray rbn:px-3 rbn:py-2 rbn:flex rbn:gap-2',
            theme?.drawer?.footer,
          )}
        >
          <Button
            size='small'
            color='lightNonPriority'
            onClick={handleSave}
            className={theme?.drawer?.footerButton}
          >
            {deletedLevels.length > 0 ? 'Save & Review Deletions' : 'Save'}
          </Button>
          <Button
            size='small'
            color='dark'
            onClick={onClose}
            className={theme?.drawer?.footerButton}
          >
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
