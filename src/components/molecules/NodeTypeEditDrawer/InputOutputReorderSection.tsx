import { useState } from 'react';
import { Info, Plus, Pencil } from 'lucide-react';
import { Button, Input } from '@/components/atoms';
import { HandleShapeSwatch } from '@/components/atoms/HandleShapeSwatch';
import { DragList } from '@/components/molecules/DragList';
import { PresetModal } from '@/components/molecules/PresetModal';
import type { DragListItem } from '@/components/molecules/DragList/types';
import { isDragListNonLeaf } from '@/components/molecules/DragList/types';
import type { InputAdditionalProps } from './inputOutputConversion';
import { generateRandomString } from '@/utils/randomGeneration';
import { cn } from '@/utils/cnHelper';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

/** Remove an item by id at the top level or nested inside any panel's subTrees. */
function removeItemById(
  items: DragListItem<InputAdditionalProps>[],
  id: string,
): DragListItem<InputAdditionalProps>[] {
  const result: DragListItem<InputAdditionalProps>[] = [];
  for (const item of items) {
    if (item.id === id) continue;
    if (isDragListNonLeaf(item)) {
      result.push({
        ...item,
        subTrees: item.subTrees.filter((sub) => sub.id !== id),
      });
    } else {
      result.push(item);
    }
  }
  return result;
}

/** Rename an item by id at the top level or nested inside any panel's subTrees. */
function renameItemById(
  items: DragListItem<InputAdditionalProps>[],
  id: string,
  name: string,
): DragListItem<InputAdditionalProps>[] {
  return items.map((item) => {
    if (item.id === id) return { ...item, name };
    if (isDragListNonLeaf(item)) {
      return {
        ...item,
        subTrees: item.subTrees.map((sub) =>
          sub.id === id ? { ...sub, name } : sub,
        ),
      };
    }
    return item;
  });
}

type InputOutputReorderSectionProps = {
  items: DragListItem<InputAdditionalProps>[];
  onChange: (items: DragListItem<InputAdditionalProps>[]) => void;
  sectionLabel: string;
  allowPanels: boolean;
  maxDepth: number;
  hasEmptyPanelError: boolean;
  /** When provided, leaf handles get a delete button that calls this (the
   *  drawer moves the handle into its "Deleted" section) instead of dropping
   *  it outright. */
  onDeleteHandle?: (item: DragListItem<InputAdditionalProps>) => void;
  /** When true, leaf handles get a rename (pencil) button that opens the same
   *  rename modal panels use. Off by default so the node-type editor (whose
   *  handle names are type-derived and read-only) is unaffected. */
  allowLeafRename?: boolean;
  /** When provided, the section header shows an add button (e.g. "+ Input")
   *  that calls this — the owner appends a new leaf handle. */
  onAddItem?: () => void;
  /** Label for the add button (defaults to "Item"). */
  addItemLabel?: string;
};

/** A copy of `items` with one leaf's description set (panels searched too). */
function setItemDescription(
  items: DragListItem<InputAdditionalProps>[],
  id: string,
  description: string,
): DragListItem<InputAdditionalProps>[] {
  return items.map((item) => {
    if (isDragListNonLeaf(item)) {
      return {
        ...item,
        subTrees: setItemDescription(item.subTrees, id, description),
      };
    }
    if (item.id !== id) return item;
    return {
      ...item,
      additionalProperties: {
        ...(item.additionalProperties as InputAdditionalProps),
        description,
      },
    };
  });
}

function InputOutputReorderSection({
  items,
  onChange,
  sectionLabel,
  allowPanels,
  maxDepth,
  hasEmptyPanelError,
  onDeleteHandle,
  allowLeafRename = false,
  onAddItem,
  addItemLabel = 'Item',
}: InputOutputReorderSectionProps) {
  const theme = useGraphTheme();
  const [panelModalOpen, setPanelModalOpen] = useState(false);
  const [panelModalName, setPanelModalName] = useState('');
  // The id of the item being renamed (leaf or panel), or null when the modal
  // is being used to add a new panel.
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  // The leaf whose description box is open (one at a time).
  const [describingId, setDescribingId] = useState<string | null>(null);

  const renamingItemIsPanel =
    renamingItemId !== null &&
    items.some((item) => item.id === renamingItemId && isDragListNonLeaf(item));

  const handleAddPanel = () => {
    setPanelModalName('');
    setRenamingItemId(null);
    setPanelModalOpen(true);
  };

  const handleStartRename = (itemId: string, currentName: string) => {
    setPanelModalName(currentName);
    setRenamingItemId(itemId);
    setPanelModalOpen(true);
  };

  const handlePanelModalConfirm = () => {
    const trimmedName = panelModalName.trim();
    if (trimmedName === '') return;

    if (renamingItemId !== null) {
      onChange(renameItemById(items, renamingItemId, trimmedName));
    } else {
      const newPanel: DragListItem<InputAdditionalProps> = {
        id: generateRandomString(20),
        name: trimmedName,
        subTrees: [],
      };
      onChange([...items, newPanel]);
    }

    setPanelModalOpen(false);
  };

  const handleDeletePanel = async (
    item: DragListItem<InputAdditionalProps>,
  ): Promise<boolean> => {
    if (!isDragListNonLeaf(item)) return false;

    const updatedItems: DragListItem<InputAdditionalProps>[] = [];
    for (const existing of items) {
      if (existing.id === item.id && isDragListNonLeaf(existing)) {
        for (const child of existing.subTrees) {
          updatedItems.push(child);
        }
      } else {
        updatedItems.push(existing);
      }
    }
    onChange(updatedItems);
    return false;
  };

  const handleDelete = async (
    item: DragListItem<InputAdditionalProps>,
  ): Promise<boolean> => {
    // Panels keep their existing "ungroup" behavior; leaf handles are moved to
    // the drawer's Deleted section via onDeleteHandle.
    if (isDragListNonLeaf(item)) {
      return handleDeletePanel(item);
    }
    if (onDeleteHandle) {
      onChange(removeItemById(items, item.id));
      onDeleteHandle(item);
    }
    return false;
  };

  const renderContent = (item: DragListItem<InputAdditionalProps>) => {
    const isPanel = isDragListNonLeaf(item);
    const isEmpty = isPanel && item.subTrees.length === 0;
    const description = !isPanel
      ? (item.additionalProperties?.description ?? '')
      : '';
    const describing = describingId === item.id;

    return (
      <div className='rbn:flex rbn:min-w-0 rbn:flex-1 rbn:flex-col rbn:gap-1'>
        <div className='rbn:flex rbn:items-center rbn:gap-1.5 rbn:min-w-0 rbn:flex-1'>
          {!isPanel &&
            (item.additionalProperties?.color ||
              item.additionalProperties?.shape) && (
              <HandleShapeSwatch
                shape={item.additionalProperties.shape}
                color={item.additionalProperties.color}
                size={16}
                className={theme?.node?.handleShape}
              />
            )}
          <span
            className={cn(
              'rbn:truncate rbn:text-primary-white',
              isPanel && 'rbn:font-medium',
              isEmpty && hasEmptyPanelError && 'rbn:text-red-400',
            )}
          >
            {item.name}
          </span>
          {!isPanel && item.additionalProperties?.dataType && (
            <span className='rbn:text-secondary-light-gray rbn:text-[13px] rbn:truncate rbn:shrink-0'>
              {item.additionalProperties.dataType}
            </span>
          )}
          {(isPanel || (!isPanel && allowLeafRename)) && (
            <button
              className='rbn:shrink-0 rbn:p-1 rbn:rounded rbn:hover:bg-primary-gray rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:transition-colors'
              onClick={(event) => {
                event.stopPropagation();
                handleStartRename(item.id, item.name);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Pencil className='rbn:w-3.5 rbn:h-3.5' />
            </button>
          )}
          {!isPanel && (
            <button
              type='button'
              aria-label={`Describe ${item.name}`}
              aria-pressed={describing}
              title={
                description
                  ? `Description: ${description}`
                  : 'Add a description (shown behind the ⓘ on this socket)'
              }
              className={cn(
                'rbn:ml-auto rbn:shrink-0 rbn:rounded rbn:p-1 rbn:transition-colors rbn:hover:bg-primary-gray rbn:hover:text-primary-white',
                description
                  ? 'rbn:text-primary-blue'
                  : 'rbn:text-secondary-light-gray',
              )}
              onClick={(event) => {
                event.stopPropagation();
                setDescribingId(describing ? null : item.id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Info className='rbn:w-3.5 rbn:h-3.5' />
            </button>
          )}
        </div>
        {describing && (
          <textarea
            autoFocus
            aria-label={`Description of ${item.name}`}
            placeholder='What this socket is for'
            value={description}
            onChange={(event) =>
              onChange(setItemDescription(items, item.id, event.target.value))
            }
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className='rbn:w-full rbn:min-h-[64px] rbn:resize-y rbn:rounded rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:px-2 rbn:py-1.5 rbn:text-[13px] rbn:leading-snug rbn:text-primary-white rbn:outline-none rbn:focus:border-primary-blue'
          />
        )}
      </div>
    );
  };

  return (
    <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
      <div className='rbn:flex rbn:items-center rbn:justify-between'>
        <label className='rbn:text-primary-white rbn:text-sm rbn:font-main'>
          {sectionLabel}
        </label>
        <div className='rbn:flex rbn:items-center rbn:gap-1'>
          {onAddItem && (
            <Button
              size='small'
              onClick={onAddItem}
              className='rbn:bg-transparent rbn:border-none rbn:hover:bg-primary-gray rbn:p-1 rbn:h-auto rbn:text-[13px] rbn:leading-[13px] rbn:gap-1'
            >
              <Plus className='rbn:w-3.5 rbn:h-3.5' />
              {addItemLabel}
            </Button>
          )}
          {allowPanels && (
            <Button
              size='small'
              onClick={handleAddPanel}
              className='rbn:bg-transparent rbn:border-none rbn:hover:bg-primary-gray rbn:p-1 rbn:h-auto rbn:text-[13px] rbn:leading-[13px] rbn:gap-1'
            >
              <Plus className='rbn:w-3.5 rbn:h-3.5' />
              Panel
            </Button>
          )}
        </div>
      </div>

      {items.length > 0 ? (
        <DragList
          items={items}
          onChange={onChange}
          onDelete={allowPanels || onDeleteHandle ? handleDelete : undefined}
          isDeletable={
            allowPanels || onDeleteHandle
              ? (item) =>
                  isDragListNonLeaf(item) ? allowPanels : !!onDeleteHandle
              : undefined
          }
          maxDepth={maxDepth}
          renderContent={renderContent}
        />
      ) : (
        <div className='rbn:text-secondary-light-gray rbn:text-sm rbn:py-2 rbn:text-center'>
          No {sectionLabel.toLowerCase()}
        </div>
      )}

      <PresetModal
        open={panelModalOpen}
        onOpenChange={setPanelModalOpen}
        title={
          renamingItemId === null
            ? 'Add Panel'
            : renamingItemIsPanel
              ? 'Rename Panel'
              : 'Rename'
        }
        description={
          renamingItemId === null
            ? 'Enter a name for the new input panel.'
            : renamingItemIsPanel
              ? 'Enter a new name for this panel.'
              : 'Enter a new name for this handle.'
        }
        size='sm'
        buttonProps={[
          {
            children: 'Cancel',
            color: 'dark' as const,
            onClick: () => setPanelModalOpen(false),
          },
          {
            children: renamingItemId !== null ? 'Rename' : 'Create',
            color: 'lightNonPriority' as const,
            onClick: handlePanelModalConfirm,
            disabled: panelModalName.trim() === '',
          },
        ]}
      >
        <Input
          size='small'
          placeholder='Panel name'
          value={panelModalName}
          onChange={setPanelModalName}
          allowOnlyNumbers={false}
          liveUpdate
          className='rbn:w-full'
        />
      </PresetModal>
    </div>
  );
}

export { InputOutputReorderSection };
export type { InputOutputReorderSectionProps };
