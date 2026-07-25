import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Info, Undo2 } from 'lucide-react';
import { Button, Input } from '@/components/atoms';
import { HandleShapeSwatch } from '@/components/atoms/HandleShapeSwatch';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';
import { PopoverColorPicker } from '@/components/molecules/ColorPicker/PopoverColorPicker';
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
  headerColor?: string;
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
    <div className='absolute right-0 top-0 bottom-0 w-[320px] z-20 overflow-hidden pointer-events-none'>
      <div
        ref={ref}
        style={style}
        className={cn(
          'w-full h-full pointer-events-auto flex flex-col bg-graph-elevated-surface-bg border-l border-secondary-dark-gray',
          theme?.drawer?.container,
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between border-b border-secondary-dark-gray px-3 py-2.5',
            theme?.drawer?.header,
          )}
        >
          <span
            className={cn(
              'text-primary-white text-[16px] leading-[16px] font-main truncate',
              theme?.drawer?.title,
            )}
          >
            Edit Node Type
          </span>
          <Button
            size='small'
            onClick={onClose}
            className={cn(
              'bg-transparent border-none hover:bg-primary-gray p-1',
              theme?.drawer?.closeButton,
            )}
          >
            <X className='w-[18px] h-[18px]' />
          </Button>
        </div>

        <div
          className={cn(
            'flex-1 overflow-y-auto p-3 flex flex-col gap-3',
            theme?.drawer?.content,
          )}
        >
          <div className='flex flex-col gap-1'>
            <label
              className={cn(
                'text-primary-white text-sm font-main',
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
              className={cn('w-full', theme?.node?.inputField)}
            />
          </div>

          {localHeaderColor !== null && (
            <div className='flex flex-col gap-1'>
              <label
                className={cn(
                  'text-primary-white text-sm font-main',
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
            <div className='flex flex-col gap-1.5'>
              <label
                className={cn(
                  'text-primary-white text-sm font-main',
                  theme?.drawer?.label,
                )}
              >
                Deleted ({deleted.length})
              </label>
              <div className='flex flex-col gap-1'>
                {deleted.map((entry) => (
                  <div
                    key={entry.item.id}
                    className='flex items-center gap-1.5 px-2 py-1 rounded bg-primary-gray/40'
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
                    <span className='truncate text-primary-white/70 line-through text-[13px]'>
                      {entry.item.name}
                    </span>
                    {entry.item.additionalProperties?.dataType && (
                      <span className='text-secondary-light-gray text-[12px] truncate shrink-0'>
                        {entry.item.additionalProperties.dataType}
                      </span>
                    )}
                    <span className='text-[10px] text-primary-white/40 shrink-0'>
                      {entry.direction}
                    </span>
                    <button
                      type='button'
                      title='Show connections that will break'
                      onClick={() => setSummaryFor(entry)}
                      className='ml-auto shrink-0 p-1 rounded hover:bg-primary-gray text-secondary-light-gray hover:text-primary-white transition-colors'
                    >
                      <Info className='w-3.5 h-3.5' />
                    </button>
                    <button
                      type='button'
                      title='Restore this handle'
                      onClick={() => restoreDeleted(entry)}
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

        <div
          className={cn(
            'border-t border-secondary-dark-gray px-3 py-2 flex gap-2',
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
