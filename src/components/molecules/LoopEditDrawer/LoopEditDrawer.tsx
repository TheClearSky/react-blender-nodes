import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/atoms';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';
import { LoopHandleLevelRow } from './LoopHandleLevelRow';
import type { LoopHandleLevel } from './loopLevelConversion';
import { extractLevelsFromLoopNodes } from './loopLevelConversion';
import { DragList } from '@/components/molecules/DragList';
import type { DragListItem } from '@/components/molecules/DragList/types';

type LevelAdditionalProps = {
  level: LoopHandleLevel;
  levelIndex: number;
};

function levelsToItems(
  levels: LoopHandleLevel[],
): DragListItem<LevelAdditionalProps>[] {
  return levels.map((level, index) => ({
    id: level.id,
    name: level.handles.loopStartIn.name || `Channel ${index + 1}`,
    additionalProperties: { level, levelIndex: index },
  }));
}

function itemsToLevels(
  items: DragListItem<LevelAdditionalProps>[],
  currentLevels: LoopHandleLevel[],
): LoopHandleLevel[] {
  return items.map((item) => {
    const levelData = item.additionalProperties?.level;
    if (levelData) return levelData;
    return currentLevels.find((l) => l.id === item.id) ?? currentLevels[0];
  });
}

type LoopEditDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  loopStartNodeData: Record<string, unknown> | null;
  loopStopNodeData: Record<string, unknown> | null;
  loopEndNodeData: Record<string, unknown> | null;
  onSave: (levels: LoopHandleLevel[]) => void;
};

function LoopEditDrawer({
  isOpen,
  onClose,
  loopStartNodeData,
  loopStopNodeData,
  loopEndNodeData,
  onSave,
}: LoopEditDrawerProps) {
  const { mounted, ref, style } = useSlideAnimation(isOpen, {
    hiddenTransform: 'translateX(100%)',
    visibleTransform: 'translateX(0)',
    durationMs: 200,
  });

  const [localLevels, setLocalLevels] = useState<LoopHandleLevel[]>([]);

  useEffect(() => {
    if (isOpen && loopStartNodeData && loopStopNodeData && loopEndNodeData) {
      setLocalLevels(
        extractLevelsFromLoopNodes(
          loopStartNodeData as {
            inputs?: ReadonlyArray<Record<string, unknown>>;
            outputs?: ReadonlyArray<Record<string, unknown>>;
          },
          loopStopNodeData as {
            inputs?: ReadonlyArray<Record<string, unknown>>;
            outputs?: ReadonlyArray<Record<string, unknown>>;
          },
          loopEndNodeData as {
            inputs?: ReadonlyArray<Record<string, unknown>>;
            outputs?: ReadonlyArray<Record<string, unknown>>;
          },
        ),
      );
    }
  }, [isOpen, loopStartNodeData, loopStopNodeData, loopEndNodeData]);

  const handleUpdateLevel = useCallback(
    (index: number, updated: LoopHandleLevel) => {
      setLocalLevels((prev) => {
        const next = [...prev];
        next[index] = updated;
        return next;
      });
    },
    [],
  );

  const handleSave = () => {
    onSave(localLevels);
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
            Edit Loop
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
            <DragList<LevelAdditionalProps>
              items={levelsToItems(localLevels)}
              onChange={(newItems) =>
                setLocalLevels(itemsToLevels(newItems, localLevels))
              }
              maxDepth={0}
              renderContent={(item) => {
                const level = item.additionalProperties?.level;
                if (!level) return null;
                const index = localLevels.findIndex((l) => l.id === level.id);
                return (
                  <LoopHandleLevelRow
                    level={level}
                    onUpdateLevel={(updated) =>
                      handleUpdateLevel(index === -1 ? 0 : index, updated)
                    }
                  />
                );
              }}
            />
          ) : (
            <div className='text-secondary-light-gray text-sm py-2 text-center'>
              No data channels yet. Connect a data source to any loop node to
              create the first channel.
            </div>
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

export { LoopEditDrawer };
export type { LoopEditDrawerProps };
