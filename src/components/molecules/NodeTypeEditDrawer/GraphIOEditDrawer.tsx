import { useState, useEffect, useMemo } from 'react';
import { X, Info, Undo2 } from 'lucide-react';
import { Button } from '@/components/atoms';
import {
  HandleShapeSwatch,
  type HandleShape,
} from '@/components/atoms/HandleShapeSwatch';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';
import { InputOutputReorderSection } from './InputOutputReorderSection';
import { HandleSummaryModal, type GetNeighborhood } from './HandleSummaryModal';
import { DeletionReviewModal } from './DeletionReviewModal';
import type { DragListItem } from '@/components/molecules/DragList/types';
import type { InputAdditionalProps } from './inputOutputConversion';
import type {
  HandleBlastRadius,
  HandleDeletionTarget,
} from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';
import { generateRandomString } from '@/utils/randomGeneration';
import { nextDefaultHandleName } from '@/utils/nodeStateManagement/handles/handleNaming';

/** The two flavours of the editor — a Graph Input edits its OUTPUT handles, a
 *  Graph Output edits its INPUT handles. The `variant` drives the labels; the
 *  caller (FullGraph) decides which handle list to feed in. */
type GraphIOVariant = 'graphInput' | 'graphOutput';

/** One existing handle on the root Graph I/O node, identified by its stable id. */
type GraphIOHandle = {
  id: string;
  name: string;
  /** Live handle color/shape for the display-only swatch (canvas-accurate). */
  color?: string;
  shape?: HandleShape;
};

/** The save payload: the FINAL kept handle list. Entries WITHOUT an `id` are
 *  new (their id is minted in `applyPlan`); entries WITH an `id` are reused. */
type GraphIOHandleSpec = { id?: string; name: string };

type GraphIOEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  variant: GraphIOVariant;
  nodeId: string | null;
  /** The node's current handle list (its outputs for a Graph Input, its inputs
   *  for a Graph Output). */
  handles: GraphIOHandle[];
  onSave: (nodeId: string, handles: GraphIOHandleSpec[]) => void;
  /** Compute the blast radius of deleting one root Graph I/O handle (from live
   *  state). When omitted, the deletion-review surface is disabled and the
   *  drawer falls back to plain Save + Undo (e.g. standalone story usage). */
  getHandleBlastRadius?: (
    nodeId: string,
    handle: { id: string; name: string; direction: 'input' | 'output' },
  ) => HandleBlastRadius;
  /** Neighborhood data for a connection's inline read-only mini-map. */
  getNeighborhood?: GetNeighborhood;
  /** When false, root I/O handles cannot be renamed here (hides the rename
   *  control); mirrors the `allowRootIORename` `<FullGraph>` prop. Default true. */
  allowRename?: boolean;
  /** When false, root I/O handles cannot be added or deleted here; mirrors the
   *  `allowRootIOStructureEdit` `<FullGraph>` prop. Default true. ONE switch that
   *  short-circuits the add button, the per-row delete, the staged "Deleted (n)"
   *  section, and the deletion-review modal — independent of whether
   *  `getHandleBlastRadius` is wired (its absence still means only "review data
   *  unavailable"). */
  allowStructureEdit?: boolean;
};

const VARIANT_LABELS: Record<
  GraphIOVariant,
  { title: string; section: string; addLabel: string; newNameBase: string }
> = {
  graphInput: {
    title: 'Edit Graph Input',
    section: 'Inputs',
    addLabel: 'Input',
    newNameBase: 'input',
  },
  graphOutput: {
    title: 'Edit Graph Output',
    section: 'Outputs',
    addLabel: 'Output',
    newNameBase: 'output',
  },
};

/**
 * Pick a unique default name like "input1", "input2", … for a new handle.
 *
 * Dedupes against the current `existing` rows AND any `deleted` (restorable)
 * rows + the originals — restoring a deleted handle after a new one was
 * auto-named must not produce a collision (blocked at save, but confusing).
 */
function nextDefaultName(
  base: string,
  existing: DragListItem<InputAdditionalProps>[],
  alsoKnown: ReadonlyArray<{ name: string }> = [],
): string {
  return nextDefaultHandleName(
    base,
    [
      ...existing.map((item) => item.name),
      ...alsoKnown.map((item) => item.name),
    ],
    existing.length + 1,
  );
}

function GraphIOEditDrawer({
  isOpen,
  onClose,
  variant,
  nodeId,
  handles,
  onSave,
  getHandleBlastRadius,
  getNeighborhood,
  allowRename = true,
  allowStructureEdit = true,
}: GraphIOEditDrawerProps) {
  const theme = useGraphTheme();
  const labels = VARIANT_LABELS[variant];
  const { mounted, ref, style } = useSlideAnimation(isOpen, {
    hiddenTransform: 'translateX(100%)',
    visibleTransform: 'translateX(0)',
    durationMs: 200,
  });

  // The DragList item ids ARE the real handle ids for existing handles, so on
  // save an item whose id is among the originals is a reuse and anything else
  // is new (no id → minted in applyPlan).
  const [localItems, setLocalItems] = useState<
    DragListItem<InputAdditionalProps>[]
  >([]);
  const [deleted, setDeleted] = useState<DragListItem<InputAdditionalProps>[]>(
    [],
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [summaryFor, setSummaryFor] =
    useState<DragListItem<InputAdditionalProps> | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const originalIds = useMemo(
    () => new Set(handles.map((handle) => handle.id)),
    [handles],
  );

  // A Graph Input edits its OUTPUT handles; a Graph Output its INPUT handles —
  // that is the direction these handles sit on the boundary node, which the
  // blast-radius lookup needs.
  const handleDirection: 'input' | 'output' =
    variant === 'graphInput' ? 'output' : 'input';

  const deletionsEnabled = !!getHandleBlastRadius;
  const neighborhood = getNeighborhood;

  useEffect(() => {
    if (isOpen) {
      setLocalItems(
        handles.map((handle) => ({
          id: handle.id,
          name: handle.name,
          // The dataType badge is intentionally blank — root Graph I/O handles
          // infer their type on connect, so the editor manages names only. The
          // color/shape ride the live boundary handle so a connected root I/O
          // handle still shows its inferred shape (display-only; never saved).
          additionalProperties: {
            dataType: '',
            color: handle.color,
            shape: handle.shape,
          },
        })),
      );
      setDeleted([]);
      setSaveError(null);
      setSummaryFor(null);
      setReviewOpen(false);
    }
  }, [isOpen, handles]);

  const handleAddItem = () => {
    setSaveError(null);
    // Dedupe the auto-name against deleted (restorable) handles and the
    // originals too, not just the current rows (E7).
    const knownNames = [...handles, ...deleted];
    setLocalItems((prev) => [
      ...prev,
      {
        id: generateRandomString(20),
        name: nextDefaultName(labels.newNameBase, prev, knownNames),
        additionalProperties: { dataType: '' },
      },
    ]);
  };

  const restoreDeleted = (entry: DragListItem<InputAdditionalProps>) => {
    setDeleted((prev) => prev.filter((item) => item.id !== entry.id));
    setLocalItems((prev) => [...prev, entry]);
  };

  // Only ORIGINAL handles (with a real id) can break edges; a handle added then
  // deleted within this session has no connections. So the review covers only
  // staged deletions of original handles.
  const deletedOriginals = useMemo(
    () => deleted.filter((entry) => originalIds.has(entry.id)),
    [deleted, originalIds],
  );

  const summaryBlastRadius = useMemo<HandleBlastRadius | null>(() => {
    if (!summaryFor || !nodeId || !getHandleBlastRadius) return null;
    return getHandleBlastRadius(nodeId, {
      id: summaryFor.id,
      name: summaryFor.name,
      direction: handleDirection,
    });
  }, [summaryFor, nodeId, getHandleBlastRadius, handleDirection]);

  const reviewBlastRadii = useMemo<HandleBlastRadius[]>(() => {
    if (!reviewOpen || !nodeId || !getHandleBlastRadius) return [];
    return deletedOriginals.map((entry) =>
      getHandleBlastRadius(nodeId, {
        id: entry.id,
        name: entry.name,
        direction: handleDirection,
      }),
    );
  }, [
    reviewOpen,
    deletedOriginals,
    nodeId,
    getHandleBlastRadius,
    handleDirection,
  ]);

  /** Build the final kept-handle spec list from the current rows, optionally
   *  re-including deleted originals the user CHOSE TO KEEP in the review. */
  const buildSpecs = (
    keepBackEntries: DragListItem<InputAdditionalProps>[] = [],
  ): GraphIOHandleSpec[] => {
    const toSpec = (
      item: DragListItem<InputAdditionalProps>,
    ): GraphIOHandleSpec =>
      originalIds.has(item.id)
        ? { id: item.id, name: item.name.trim() }
        : { name: item.name.trim() };
    return [...localItems, ...keepBackEntries].map(toSpec);
  };

  const validateNames = (
    entries: DragListItem<InputAdditionalProps>[],
  ): boolean => {
    const names = entries.map((item) => item.name.trim());
    if (names.some((name) => name === '')) {
      setSaveError('Handle names cannot be empty.');
      return false;
    }
    if (new Set(names).size !== names.length) {
      setSaveError('Handle names must be unique.');
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (!nodeId) return;
    if (!validateNames(localItems)) return;
    // When deletions of original handles are staged and the blast-radius review
    // is available, route through the review modal (parity with the node-type
    // editor) so the user previews / opts out per handle before committing.
    if (deletionsEnabled && deletedOriginals.length > 0) {
      setReviewOpen(true); // commit happens on review confirm
      return;
    }
    onSave(nodeId, buildSpecs());
    onClose();
  };

  const handleReviewConfirm = (includedTargets: HandleDeletionTarget[]) => {
    if (!nodeId) {
      setReviewOpen(false);
      return;
    }
    // Targets the user toggled ON are the deletions to keep; the rest are kept
    // back (re-included in the saved spec list). Root I/O handle names are
    // unique, so match by name.
    const includedNames = new Set(
      includedTargets.map((target) => target.handleName),
    );
    const keepBack = deletedOriginals.filter(
      (entry) => !includedNames.has(entry.name),
    );
    if (!validateNames([...localItems, ...keepBack])) {
      setReviewOpen(false);
      return;
    }
    setReviewOpen(false);
    onSave(nodeId, buildSpecs(keepBack));
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
            {labels.title}
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
          <InputOutputReorderSection
            items={localItems}
            onChange={(items) => {
              setLocalItems(items);
              setSaveError(null);
            }}
            sectionLabel={labels.section}
            allowPanels={false}
            maxDepth={0}
            hasEmptyPanelError={false}
            allowLeafRename={allowRename}
            onAddItem={allowStructureEdit ? handleAddItem : undefined}
            addItemLabel={labels.addLabel}
            onDeleteHandle={
              allowStructureEdit
                ? (item) => setDeleted((prev) => [...prev, item])
                : undefined
            }
          />

          {allowStructureEdit && deleted.length > 0 && (
            <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
              <label
                className={cn(
                  'rbn:text-primary-white rbn:text-sm rbn:font-main',
                  theme?.drawer?.label,
                )}
              >
                Deleted ({deleted.length})
              </label>
              <p className='rbn:text-secondary-light-gray rbn:text-[12px]'>
                Their connections will be removed when you save.
              </p>
              <div className='rbn:flex rbn:flex-col rbn:gap-1'>
                {deleted.map((entry) => (
                  <div
                    key={entry.id}
                    className='rbn:flex rbn:items-center rbn:gap-1.5 rbn:px-2 rbn:py-1 rbn:rounded rbn:bg-primary-gray/40'
                  >
                    {(entry.additionalProperties?.color ||
                      entry.additionalProperties?.shape) && (
                      <HandleShapeSwatch
                        shape={entry.additionalProperties.shape}
                        color={entry.additionalProperties.color}
                        size={14}
                        className={theme?.node?.handleShape}
                      />
                    )}
                    <span className='rbn:truncate rbn:text-primary-white/70 rbn:line-through rbn:text-[13px]'>
                      {entry.name}
                    </span>
                    {deletionsEnabled && originalIds.has(entry.id) && (
                      <button
                        type='button'
                        title='Show connections that will break'
                        onClick={() => setSummaryFor(entry)}
                        className='rbn:ml-auto rbn:shrink-0 rbn:p-1 rbn:rounded rbn:hover:bg-primary-gray rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:transition-colors'
                      >
                        <Info className='rbn:w-3.5 rbn:h-3.5' />
                      </button>
                    )}
                    <button
                      type='button'
                      title='Restore this handle'
                      onClick={() => restoreDeleted(entry)}
                      className={cn(
                        'rbn:shrink-0 rbn:p-1 rbn:rounded rbn:hover:bg-primary-gray rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:transition-colors',
                        !(deletionsEnabled && originalIds.has(entry.id)) &&
                          'rbn:ml-auto',
                      )}
                    >
                      <Undo2 className='rbn:w-3.5 rbn:h-3.5' />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {saveError && (
            <p className='rbn:text-red-400 rbn:text-[13px]'>{saveError}</p>
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
            {deletionsEnabled && deletedOriginals.length > 0
              ? 'Save & Review Deletions'
              : 'Save'}
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

      {neighborhood && (
        <HandleSummaryModal
          isOpen={summaryBlastRadius !== null}
          onClose={() => setSummaryFor(null)}
          blastRadius={summaryBlastRadius}
          getNeighborhood={neighborhood}
        />
      )}

      {neighborhood && (
        <DeletionReviewModal
          isOpen={reviewOpen}
          onClose={() => setReviewOpen(false)}
          blastRadii={reviewBlastRadii}
          getNeighborhood={neighborhood}
          onConfirm={handleReviewConfirm}
        />
      )}
    </div>
  );
}

export { GraphIOEditDrawer };
export type { GraphIOEditDrawerProps, GraphIOVariant, GraphIOHandleSpec };
