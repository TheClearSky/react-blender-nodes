import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button, Input } from '@/components/atoms';
import { DragList } from '@/components/molecules/DragList';
import { PresetModal } from '@/components/molecules/PresetModal';
import type { DragListItem } from '@/components/molecules/DragList/types';
import { isDragListNonLeaf } from '@/components/molecules/DragList/types';
import type { InputAdditionalProps } from './inputOutputConversion';
import { generateRandomString } from '@/utils/randomGeneration';
import { cn } from '@/utils/cnHelper';

type InputOutputReorderSectionProps = {
  items: DragListItem<InputAdditionalProps>[];
  onChange: (items: DragListItem<InputAdditionalProps>[]) => void;
  sectionLabel: string;
  allowPanels: boolean;
  maxDepth: number;
  hasEmptyPanelError: boolean;
};

function InputOutputReorderSection({
  items,
  onChange,
  sectionLabel,
  allowPanels,
  maxDepth,
  hasEmptyPanelError,
}: InputOutputReorderSectionProps) {
  const [panelModalOpen, setPanelModalOpen] = useState(false);
  const [panelModalName, setPanelModalName] = useState('');
  const [renamingPanelId, setRenamingPanelId] = useState<string | null>(null);

  const handleAddPanel = () => {
    setPanelModalName('');
    setRenamingPanelId(null);
    setPanelModalOpen(true);
  };

  const handleRenamePanel = (panelId: string, currentName: string) => {
    setPanelModalName(currentName);
    setRenamingPanelId(panelId);
    setPanelModalOpen(true);
  };

  const handlePanelModalConfirm = () => {
    const trimmedName = panelModalName.trim();
    if (trimmedName === '') return;

    if (renamingPanelId !== null) {
      const updatedItems = items.map((item) => {
        if (item.id === renamingPanelId && isDragListNonLeaf(item)) {
          return { ...item, name: trimmedName };
        }
        return item;
      });
      onChange(updatedItems);
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

  const renderContent = (item: DragListItem<InputAdditionalProps>) => {
    const isPanel = isDragListNonLeaf(item);
    const isEmpty = isPanel && item.subTrees.length === 0;

    return (
      <div className='flex items-center gap-1.5 min-w-0 flex-1'>
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
        {isPanel && (
          <button
            className='shrink-0 p-1 rounded hover:bg-primary-gray text-secondary-light-gray hover:text-primary-white transition-colors'
            onClick={(event) => {
              event.stopPropagation();
              handleRenamePanel(item.id, item.name);
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

      {items.length > 0 ? (
        <DragList
          items={items}
          onChange={onChange}
          onDelete={allowPanels ? handleDeletePanel : undefined}
          isDeletable={
            allowPanels ? (item) => isDragListNonLeaf(item) : undefined
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
        title={renamingPanelId !== null ? 'Rename Panel' : 'Add Panel'}
        description={
          renamingPanelId !== null
            ? 'Enter a new name for this panel.'
            : 'Enter a name for the new input panel.'
        }
        size='sm'
        buttonProps={[
          {
            children: 'Cancel',
            color: 'dark' as const,
            onClick: () => setPanelModalOpen(false),
          },
          {
            children: renamingPanelId !== null ? 'Rename' : 'Create',
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
