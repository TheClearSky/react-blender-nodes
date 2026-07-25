import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
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

    return (
      <div className='flex items-center gap-1.5 min-w-0 flex-1'>
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
            'truncate text-primary-white',
            isPanel && 'font-medium',
            isEmpty && hasEmptyPanelError && 'text-red-400',
          )}
        >
          {item.name}
        </span>
        {!isPanel && item.additionalProperties?.dataType && (
          <span className='text-secondary-light-gray text-[13px] truncate shrink-0'>
            {item.additionalProperties.dataType}
          </span>
        )}
        {(isPanel || (!isPanel && allowLeafRename)) && (
          <button
            className='shrink-0 p-1 rounded hover:bg-primary-gray text-secondary-light-gray hover:text-primary-white transition-colors'
            onClick={(event) => {
              event.stopPropagation();
              handleStartRename(item.id, item.name);
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Pencil className='w-3.5 h-3.5' />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center justify-between'>
        <label className='text-primary-white text-sm font-main'>
          {sectionLabel}
        </label>
        <div className='flex items-center gap-1'>
          {onAddItem && (
            <Button
              size='small'
              onClick={onAddItem}
              className='bg-transparent border-none hover:bg-primary-gray p-1 h-auto text-[13px] leading-[13px] gap-1'
            >
              <Plus className='w-3.5 h-3.5' />
              {addItemLabel}
            </Button>
          )}
          {allowPanels && (
            <Button
              size='small'
              onClick={handleAddPanel}
              className='bg-transparent border-none hover:bg-primary-gray p-1 h-auto text-[13px] leading-[13px] gap-1'
            >
              <Plus className='w-3.5 h-3.5' />
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
        <div className='text-secondary-light-gray text-sm py-2 text-center'>
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
          className='w-full'
        />
      </PresetModal>
    </div>
  );
}

export { InputOutputReorderSection };
export type { InputOutputReorderSectionProps };
