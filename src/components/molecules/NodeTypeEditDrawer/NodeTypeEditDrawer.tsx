import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Info, Undo2 } from 'lucide-react';
import { Button, Input } from '@/components/atoms';
import { HandleShapeSwatch } from '@/components/atoms/HandleShapeSwatch';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';
import { PopoverColorPicker } from '@/components/molecules/ColorPicker/PopoverColorPicker';
import { PathChipsInput } from '@/components/molecules/PathChipsInput';
import { InputOutputReorderSection } from './InputOutputReorderSection';
import { HandleSummaryModal, type GetNeighborhood } from './HandleSummaryModal';
import { DeletionReviewModal } from './DeletionReviewModal';
import type {
  TypeOfInput,
  TypeOfInputPanel,
} from '@/utils/nodeStateManagement/types';
import type { DragListItem } from '@/components/molecules/DragList/types';
import type {
  InputAdditionalProps,
  HandleVisual,
  ResolveHandleVisual,
} from './inputOutputConversion';
import type {
  HandleBlastRadius,
  HandleDeletionTarget,
} from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';
import {
  typeOfInputsToDragListItems,
  dragListItemsToTypeOfInputs,
  typeOfOutputsToDragListItems,
  dragListItemsToTypeOfOutputs,
  hasEmptyPanels,
} from './inputOutputConversion';

type HandleDirection = 'input' | 'output';

type SaveUpdates = {
  name?: string;
  /** Trimmed; '' clears it. */
  description?: string;
  headerColor?: string;
  /** Add-menu folders, outermost first; `[]` = top level of Add Node. */
  locationInContextMenu?: string[];
  inputs?: (TypeOfInput | TypeOfInputPanel)[];
  outputs?: TypeOfInput[];
  /** Handles to delete (cascading their edges). Applied before the reorder. */
  deletions?: HandleDeletionTarget[];
};

type NodeTypeEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  nodeTypeId: string | null;
  nodeTypeName: string | null;
  /** The group's in-app description (shown behind the ⓘ on its title). */
  nodeTypeDescription?: string | null;
  /** Where the group sits in the Add menu (its `locationInContextMenu`).
   *  When given (even `[]`), the drawer shows a Menu Path field. */
  nodeTypeLocationInContextMenu?: readonly string[] | null;
  /** Existing Add-menu folders directly under a path (suggestions). */
  getMenuFolderSuggestions?: (parentPath: readonly string[]) => string[];
  nodeTypeHeaderColor: string | null;
  nodeTypeInputs: (TypeOfInput | TypeOfInputPanel)[] | null;
  nodeTypeOutputs: TypeOfInput[] | null;
  onSave: (nodeTypeId: string, updates: SaveUpdates) => void;
  /** Compute the blast radius of deleting a handle (from live state). When
   *  omitted, handle deletion is disabled (e.g. standalone story usage). */
  getHandleBlastRadius?: (
    nodeTypeId: string,
    target: HandleDeletionTarget,
  ) => HandleBlastRadius;
  /** Neighborhood data for a connection's inline read-only mini-map. */
  getNeighborhood?: GetNeighborhood;
  /** Resolve a data-type id to its swatch visual (color + shape) for the handle
   *  rows. Display-only; when omitted no swatch is shown (e.g. standalone story). */
  getDataTypeVisual?: ResolveHandleVisual;
};

const EMPTY_NEIGHBORHOOD: GetNeighborhood = () => ({
  nodes: [],
  edges: [],
  highlightEdgeId: null,
});

/** A staged-deleted leaf handle, tagged with its direction. */
type DeletedHandle = {
  item: DragListItem<InputAdditionalProps>;
  direction: HandleDirection;
};

function itemToTarget(deleted: DeletedHandle): HandleDeletionTarget | null {
  if ('subTrees' in deleted.item) return null; // only leaves are deletable
  const dataType = deleted.item.additionalProperties?.dataType;
  if (dataType === undefined) return null;
  return {
    direction: deleted.direction,
    handleName: deleted.item.name,
    handleDataTypeId: dataType,
  };
}

function NodeTypeEditDrawer({
  isOpen,
  onClose,
  nodeTypeId,
  nodeTypeName,
  nodeTypeDescription = null,
  nodeTypeLocationInContextMenu = null,
  getMenuFolderSuggestions,
  nodeTypeHeaderColor,
  nodeTypeInputs,
  nodeTypeOutputs,
  onSave,
  getHandleBlastRadius,
  getNeighborhood,
  getDataTypeVisual,
}: NodeTypeEditDrawerProps) {
  const theme = useGraphTheme();
  const { mounted, ref, style } = useSlideAnimation(isOpen, {
    hiddenTransform: 'translateX(100%)',
    visibleTransform: 'translateX(0)',
    durationMs: 200,
  });

  const [localName, setLocalName] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localMenuPath, setLocalMenuPath] = useState<string[]>([]);
  // A string key, so a fresh array with the same folders does not reset an
  // in-progress edit.
  const menuPathKey = nodeTypeLocationInContextMenu?.join('\u0000') ?? null;
  useEffect(() => {
    if (isOpen) {
      setLocalMenuPath(menuPathKey ? menuPathKey.split('\u0000') : []);
    }
  }, [isOpen, menuPathKey]);
  const [localHeaderColor, setLocalHeaderColor] = useState<string | null>(null);
  const [localInputs, setLocalInputs] = useState<
    DragListItem<InputAdditionalProps>[]
  >([]);
  const [localOutputs, setLocalOutputs] = useState<
    DragListItem<InputAdditionalProps>[]
  >([]);
  const [deleted, setDeleted] = useState<DeletedHandle[]>([]);
  const [showEmptyPanelError, setShowEmptyPanelError] = useState(false);
  const [summaryFor, setSummaryFor] = useState<DeletedHandle | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (nodeTypeName !== null) setLocalName(nodeTypeName);
      setLocalDescription(nodeTypeDescription ?? '');
      setLocalHeaderColor(nodeTypeHeaderColor);
      setLocalInputs(
        nodeTypeInputs
          ? typeOfInputsToDragListItems(nodeTypeInputs, getDataTypeVisual)
          : [],
      );
      setLocalOutputs(
        nodeTypeOutputs
          ? typeOfOutputsToDragListItems(nodeTypeOutputs, getDataTypeVisual)
          : [],
      );
      setDeleted([]);
      setShowEmptyPanelError(false);
      setSummaryFor(null);
      setReviewOpen(false);
    }
  }, [
    isOpen,
    nodeTypeName,
    nodeTypeDescription,
    nodeTypeHeaderColor,
    nodeTypeInputs,
    nodeTypeOutputs,
    getDataTypeVisual,
  ]);

  const handleColorChange = useCallback((hex: string) => {
    setLocalHeaderColor(hex);
  }, []);

  const deletionsEnabled = !!getHandleBlastRadius;
  const neighborhood = getNeighborhood ?? EMPTY_NEIGHBORHOOD;

  const deletionTargets = useMemo<HandleDeletionTarget[]>(() => {
    const targets: HandleDeletionTarget[] = [];
    for (const entry of deleted) {
      const target = itemToTarget(entry);
      if (target) targets.push(target);
    }
    return targets;
  }, [deleted]);

  const summaryBlastRadius = useMemo<HandleBlastRadius | null>(() => {
    if (!summaryFor || !nodeTypeId || !getHandleBlastRadius) return null;
    const target = itemToTarget(summaryFor);
    if (!target) return null;
    return getHandleBlastRadius(nodeTypeId, target);
  }, [summaryFor, nodeTypeId, getHandleBlastRadius]);

  const reviewBlastRadii = useMemo<HandleBlastRadius[]>(() => {
    if (!reviewOpen || !nodeTypeId || !getHandleBlastRadius) return [];
    return deletionTargets.map((target) =>
      getHandleBlastRadius(nodeTypeId, target),
    );
  }, [reviewOpen, deletionTargets, nodeTypeId, getHandleBlastRadius]);

  const moveToDeleted = (
    item: DragListItem<InputAdditionalProps>,
    direction: HandleDirection,
  ) => {
    setDeleted((prev) => [...prev, { item, direction }]);
  };

  const restoreDeleted = (entry: DeletedHandle) => {
    setDeleted((prev) => prev.filter((d) => d.item.id !== entry.item.id));
    if (entry.direction === 'input') {
      setLocalInputs((prev) => [...prev, entry.item]);
    } else {
      setLocalOutputs((prev) => [...prev, entry.item]);
    }
  };

  const buildUpdates = (): SaveUpdates => {
    const updates: SaveUpdates = {};
    const trimmedName = localName.trim();
    if (trimmedName !== nodeTypeName) updates.name = trimmedName;
    if (menuPathKey !== null && localMenuPath.join('\u0000') !== menuPathKey) {
      updates.locationInContextMenu = localMenuPath;
    }
    const trimmedDescription = localDescription.trim();
    if (trimmedDescription !== (nodeTypeDescription ?? '')) {
      updates.description = trimmedDescription;
    }
    if (localHeaderColor !== null && localHeaderColor !== nodeTypeHeaderColor) {
      updates.headerColor = localHeaderColor;
    }
    if (nodeTypeInputs !== null) {
      updates.inputs = dragListItemsToTypeOfInputs(localInputs);
    }
    if (nodeTypeOutputs !== null) {
      updates.outputs = dragListItemsToTypeOfOutputs(localOutputs);
    }
    return updates;
  };

  const commit = (deletions: HandleDeletionTarget[]) => {
    if (!nodeTypeId) return;
    const updates = buildUpdates();
    if (deletions.length > 0) updates.deletions = deletions;
    if (Object.keys(updates).length > 0) onSave(nodeTypeId, updates);
    onClose();
  };

  const handleSave = () => {
    if (!nodeTypeId) return;
    if (localName.trim() === '') return;
    if (hasEmptyPanels(localInputs)) {
      setShowEmptyPanelError(true);
      return;
    }
    if (deletionTargets.length > 0) {
      setReviewOpen(true); // commit happens on review confirm
      return;
    }
    commit([]);
  };

  const handleReviewConfirm = (includedTargets: HandleDeletionTarget[]) => {
    setReviewOpen(false);
    commit(includedTargets);
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
            Edit Node Type
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
          <div className='rbn:flex rbn:flex-col rbn:gap-1'>
            <label
              className={cn(
                'rbn:text-primary-white rbn:text-sm rbn:font-main',
                theme?.drawer?.label,
              )}
            >
              Name
            </label>
            <Input
              size='small'
              placeholder='Node type name'
              value={localName}
              onChange={setLocalName}
              allowOnlyNumbers={false}
              className={cn('rbn:w-full', theme?.node?.inputField)}
            />
          </div>

          <div className='rbn:flex rbn:flex-col rbn:gap-1'>
            <label
              htmlFor='rbn-node-type-description'
              className={cn(
                'rbn:text-primary-white rbn:text-sm rbn:font-main',
                theme?.drawer?.label,
              )}
            >
              Description
            </label>
            <textarea
              id='rbn-node-type-description'
              placeholder='What this does — shown behind the ⓘ on its title'
              value={localDescription}
              onChange={(event) => setLocalDescription(event.target.value)}
              className='rbn:w-full rbn:min-h-[64px] rbn:resize-y rbn:rounded rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:px-2 rbn:py-1.5 rbn:text-[13px] rbn:leading-snug rbn:text-primary-white rbn:outline-none rbn:focus:border-primary-blue'
            />
          </div>

          {menuPathKey !== null && (
            <div className='rbn:flex rbn:flex-col rbn:gap-1'>
              <label
                htmlFor='rbn-node-type-menu-path'
                className={cn(
                  'rbn:text-primary-white rbn:text-sm rbn:font-main',
                  theme?.drawer?.label,
                )}
              >
                Menu Path
              </label>
              <PathChipsInput
                id='rbn-node-type-menu-path'
                value={localMenuPath}
                onChange={setLocalMenuPath}
                getSuggestions={getMenuFolderSuggestions}
                previewRoot='Add Node'
                previewLeaf={localName.trim() || undefined}
                emptyPathHint='top level of Add Node'
              />
            </div>
          )}

          {localHeaderColor !== null && (
            <div className='rbn:flex rbn:flex-col rbn:gap-1'>
              <label
                className={cn(
                  'rbn:text-primary-white rbn:text-sm rbn:font-main',
                  theme?.drawer?.label,
                )}
              >
                Header Color
              </label>
              <PopoverColorPicker
                value={localHeaderColor}
                onChange={handleColorChange}
                size='small'
              />
            </div>
          )}

          {nodeTypeInputs !== null && (
            <InputOutputReorderSection
              items={localInputs}
              onChange={(items) => {
                setLocalInputs(items);
                setShowEmptyPanelError(false);
              }}
              sectionLabel='Inputs'
              allowPanels={true}
              maxDepth={1}
              hasEmptyPanelError={showEmptyPanelError}
              onDeleteHandle={
                deletionsEnabled
                  ? (item) => moveToDeleted(item, 'input')
                  : undefined
              }
            />
          )}

          {nodeTypeOutputs !== null && (
            <InputOutputReorderSection
              items={localOutputs}
              onChange={setLocalOutputs}
              sectionLabel='Outputs'
              allowPanels={false}
              maxDepth={0}
              hasEmptyPanelError={false}
              onDeleteHandle={
                deletionsEnabled
                  ? (item) => moveToDeleted(item, 'output')
                  : undefined
              }
            />
          )}

          {deleted.length > 0 && (
            <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
              <label
                className={cn(
                  'rbn:text-primary-white rbn:text-sm rbn:font-main',
                  theme?.drawer?.label,
                )}
              >
                Deleted ({deleted.length})
              </label>
              <div className='rbn:flex rbn:flex-col rbn:gap-1'>
                {deleted.map((entry) => (
                  <div
                    key={entry.item.id}
                    className='rbn:flex rbn:items-center rbn:gap-1.5 rbn:px-2 rbn:py-1 rbn:rounded rbn:bg-primary-gray/40'
                  >
                    {(entry.item.additionalProperties?.color ||
                      entry.item.additionalProperties?.shape) && (
                      <HandleShapeSwatch
                        shape={entry.item.additionalProperties.shape}
                        color={entry.item.additionalProperties.color}
                        size={14}
                        className={theme?.node?.handleShape}
                      />
                    )}
                    <span className='rbn:truncate rbn:text-primary-white/70 rbn:line-through rbn:text-[13px]'>
                      {entry.item.name}
                    </span>
                    {entry.item.additionalProperties?.dataType && (
                      <span className='rbn:text-secondary-light-gray rbn:text-[12px] rbn:truncate rbn:shrink-0'>
                        {entry.item.additionalProperties.dataType}
                      </span>
                    )}
                    <span className='rbn:text-[10px] rbn:text-primary-white/40 rbn:shrink-0'>
                      {entry.direction}
                    </span>
                    <button
                      type='button'
                      title='Show connections that will break'
                      onClick={() => setSummaryFor(entry)}
                      className='rbn:ml-auto rbn:shrink-0 rbn:p-1 rbn:rounded rbn:hover:bg-primary-gray rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:transition-colors'
                    >
                      <Info className='rbn:w-3.5 rbn:h-3.5' />
                    </button>
                    <button
                      type='button'
                      title='Restore this handle'
                      onClick={() => restoreDeleted(entry)}
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
            {deleted.length > 0 ? 'Save & Review Deletions' : 'Save'}
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
      />

      <DeletionReviewModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        blastRadii={reviewBlastRadii}
        getNeighborhood={neighborhood}
        onConfirm={handleReviewConfirm}
      />
    </div>
  );
}

export { NodeTypeEditDrawer };
export type {
  NodeTypeEditDrawerProps,
  SaveUpdates,
  HandleVisual,
  ResolveHandleVisual,
};
