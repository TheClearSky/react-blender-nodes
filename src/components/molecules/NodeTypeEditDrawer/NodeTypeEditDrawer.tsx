import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { Button, Input } from '@/components/atoms';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';
import { PopoverColorPicker } from '@/components/molecules/ColorPicker/PopoverColorPicker';
import { InputOutputReorderSection } from './InputOutputReorderSection';
import type {
  TypeOfInput,
  TypeOfInputPanel,
} from '@/utils/nodeStateManagement/types';
import type { DragListItem } from '@/components/molecules/DragList/types';
import type { InputAdditionalProps } from './inputOutputConversion';
import {
  typeOfInputsToDragListItems,
  dragListItemsToTypeOfInputs,
  typeOfOutputsToDragListItems,
  dragListItemsToTypeOfOutputs,
  hasEmptyPanels,
} from './inputOutputConversion';

type NodeTypeEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  nodeTypeId: string | null;
  nodeTypeName: string | null;
  nodeTypeHeaderColor: string | null;
  nodeTypeInputs: (TypeOfInput | TypeOfInputPanel)[] | null;
  nodeTypeOutputs: TypeOfInput[] | null;
  onSave: (
    nodeTypeId: string,
    updates: {
      name?: string;
      headerColor?: string;
      inputs?: (TypeOfInput | TypeOfInputPanel)[];
      outputs?: TypeOfInput[];
    },
  ) => void;
};

function NodeTypeEditDrawer({
  isOpen,
  onClose,
  nodeTypeId,
  nodeTypeName,
  nodeTypeHeaderColor,
  nodeTypeInputs,
  nodeTypeOutputs,
  onSave,
}: NodeTypeEditDrawerProps) {
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
  const [showEmptyPanelError, setShowEmptyPanelError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (nodeTypeName !== null) setLocalName(nodeTypeName);
      setLocalHeaderColor(nodeTypeHeaderColor);
      setLocalInputs(
        nodeTypeInputs ? typeOfInputsToDragListItems(nodeTypeInputs) : [],
      );
      setLocalOutputs(
        nodeTypeOutputs ? typeOfOutputsToDragListItems(nodeTypeOutputs) : [],
      );
      setShowEmptyPanelError(false);
    }
  }, [
    isOpen,
    nodeTypeName,
    nodeTypeHeaderColor,
    nodeTypeInputs,
    nodeTypeOutputs,
  ]);

  const handleColorChange = useCallback((hex: string) => {
    setLocalHeaderColor(hex);
  }, []);

  const handleSave = () => {
    if (!nodeTypeId) return;
    const trimmedName = localName.trim();
    if (trimmedName === '') return;

    if (hasEmptyPanels(localInputs)) {
      setShowEmptyPanelError(true);
      return;
    }

    const updates: {
      name?: string;
      headerColor?: string;
      inputs?: (TypeOfInput | TypeOfInputPanel)[];
      outputs?: TypeOfInput[];
    } = {};

    if (trimmedName !== nodeTypeName) {
      updates.name = trimmedName;
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

    if (Object.keys(updates).length > 0) {
      onSave(nodeTypeId, updates);
    }
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
            Edit Node Type
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
          <div className='flex flex-col gap-1'>
            <label className='text-primary-white text-sm font-main'>Name</label>
            <Input
              size='small'
              placeholder='Node type name'
              value={localName}
              onChange={setLocalName}
              allowOnlyNumbers={false}
              className='w-full'
            />
          </div>

          {localHeaderColor !== null && (
            <div className='flex flex-col gap-1'>
              <label className='text-primary-white text-sm font-main'>
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
            />
          )}
        </div>

        <div className='border-t border-secondary-dark-gray px-3 py-2 flex gap-2'>
          <Button size='small' color='lightNonPriority' onClick={handleSave}>
            Save
          </Button>
          <Button size='small' color='dark' onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export { NodeTypeEditDrawer };
export type { NodeTypeEditDrawerProps };
