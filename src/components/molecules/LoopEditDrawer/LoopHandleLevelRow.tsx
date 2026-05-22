import { useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { Input } from '@/components/atoms';
import { PresetModal } from '@/components/molecules/PresetModal';
import { cn } from '@/utils/cnHelper';
import type { LoopHandleLevel } from './loopLevelConversion';
import { getCommonName } from './loopLevelConversion';

type LoopHandleLevelRowProps = {
  level: LoopHandleLevel;
  onUpdateLevel: (updated: LoopHandleLevel) => void;
};

type HandleKey = keyof LoopHandleLevel['handles'];

const HANDLE_GROUPS: Array<{
  label: string;
  inKey: HandleKey;
  outKey: HandleKey;
}> = [
  { label: 'Loop Start', inKey: 'loopStartIn', outKey: 'loopStartOut' },
  { label: 'Loop Stop', inKey: 'loopStopIn', outKey: 'loopStopOut' },
  { label: 'Loop End', inKey: 'loopEndIn', outKey: 'loopEndOut' },
];

function LoopHandleLevelRow({ level, onUpdateLevel }: LoopHandleLevelRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameName, setRenameName] = useState('');

  const commonName = getCommonName(level);
  const displayName = commonName ?? '(mixed names)';

  function handleRenameAll() {
    setRenameName(commonName ?? '');
    setRenameModalOpen(true);
  }

  function handleRenameConfirm() {
    const trimmed = renameName.trim();
    if (trimmed === '') return;
    const updatedHandles = { ...level.handles };
    for (const key of Object.keys(updatedHandles) as HandleKey[]) {
      updatedHandles[key] = { ...updatedHandles[key], name: trimmed };
    }
    onUpdateLevel({ ...level, handles: updatedHandles });
    setRenameModalOpen(false);
  }

  function handleSingleNameChange(key: HandleKey, newName: string) {
    onUpdateLevel({
      ...level,
      handles: {
        ...level.handles,
        [key]: { ...level.handles[key], name: newName },
      },
    });
  }

  return (
    <>
      <div className='flex flex-col overflow-hidden'>
        <div
          className='flex items-center gap-2 cursor-pointer select-none'
          onClick={() => setExpanded(!expanded)}
        >
          <div
            className='w-3 h-3 rounded-full shrink-0'
            style={{ backgroundColor: level.dataTypeColor }}
          />
          <span
            className={cn(
              'flex-1 min-w-0 truncate text-[14px] leading-[14px] font-main',
              commonName
                ? 'text-primary-white'
                : 'text-secondary-light-gray italic',
            )}
          >
            {displayName}
          </span>
          <button
            className='shrink-0 p-0.5 rounded hover:bg-primary-gray text-secondary-light-gray hover:text-primary-white transition-colors'
            onClick={(event) => {
              event.stopPropagation();
              handleRenameAll();
            }}
          >
            <Pencil className='w-3.5 h-3.5' />
          </button>
          <ChevronDown
            className={cn(
              'w-4 h-4 shrink-0 text-secondary-light-gray transition-transform duration-150',
              !expanded && '-rotate-90',
            )}
          />
        </div>

        {expanded && (
          <div className='pb-1 pt-2 flex flex-col gap-2.5 border-t border-secondary-dark-gray mt-2'>
            {HANDLE_GROUPS.map(({ label, inKey, outKey }) => (
              <div key={label} className='flex flex-col gap-1'>
                <span className='text-secondary-light-gray text-[11px] font-main'>
                  {label}
                </span>
                <div className='flex items-center gap-1.5'>
                  <span className='text-secondary-light-gray text-[11px] w-6 shrink-0'>
                    In
                  </span>
                  <Input
                    size='small'
                    value={level.handles[inKey].name}
                    onChange={(value: string) =>
                      handleSingleNameChange(inKey, value)
                    }
                    allowOnlyNumbers={false}
                    liveUpdate
                    className='flex-1 min-w-0'
                  />
                </div>
                <div className='flex items-center gap-1.5'>
                  <span className='text-secondary-light-gray text-[11px] w-6 shrink-0'>
                    Out
                  </span>
                  <Input
                    size='small'
                    value={level.handles[outKey].name}
                    onChange={(value: string) =>
                      handleSingleNameChange(outKey, value)
                    }
                    allowOnlyNumbers={false}
                    liveUpdate
                    className='flex-1 min-w-0'
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PresetModal
        open={renameModalOpen}
        onOpenChange={setRenameModalOpen}
        title='Rename Channel'
        description='Enter a name for all handles in this level.'
        size='sm'
        buttonProps={[
          {
            children: 'Cancel',
            color: 'dark' as const,
            onClick: () => setRenameModalOpen(false),
          },
          {
            children: 'Rename',
            color: 'lightNonPriority' as const,
            onClick: handleRenameConfirm,
            disabled: renameName.trim() === '',
          },
        ]}
      >
        <Input
          size='small'
          placeholder='Channel name'
          value={renameName}
          onChange={setRenameName}
          allowOnlyNumbers={false}
          liveUpdate
          className='w-full'
        />
      </PresetModal>
    </>
  );
}

export { LoopHandleLevelRow };
