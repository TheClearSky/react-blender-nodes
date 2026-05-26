import { useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { Input } from '@/components/atoms';
import { PresetModal } from '@/components/molecules/PresetModal';
import { cn } from '@/utils/cnHelper';
import type { SwitchHandleLevel } from './switchLevelConversion';
import { getCommonName, stripZonePrefix } from './switchLevelConversion';

type SwitchHandleLevelRowProps = {
  level: SwitchHandleLevel;
  onUpdateLevel: (updated: SwitchHandleLevel) => void;
};

type HandleKey = keyof SwitchHandleLevel['handles'];

const HANDLE_GROUPS: Array<{
  label: string;
  keys: { label: string; key: HandleKey }[];
}> = [
  {
    label: 'Switch Start',
    keys: [
      { label: 'In', key: 'switchStartIn' },
      { label: 'True Out', key: 'switchStartTrueOut' },
      { label: 'False Out', key: 'switchStartFalseOut' },
    ],
  },
  {
    label: 'Switch End',
    keys: [
      { label: 'True In', key: 'switchEndTrueIn' },
      { label: 'False In', key: 'switchEndFalseIn' },
      { label: 'Out', key: 'switchEndOut' },
    ],
  },
];

function SwitchHandleLevelRow({
  level,
  onUpdateLevel,
}: SwitchHandleLevelRowProps) {
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
    const zonePrefixes: Record<HandleKey, string> = {
      switchStartIn: '',
      switchStartTrueOut: 'True: ',
      switchStartFalseOut: 'False: ',
      switchEndTrueIn: 'True: ',
      switchEndFalseIn: 'False: ',
      switchEndOut: '',
    };
    const updatedHandles = { ...level.handles };
    for (const key of Object.keys(updatedHandles) as HandleKey[]) {
      updatedHandles[key] = {
        ...updatedHandles[key],
        name: zonePrefixes[key] + trimmed,
      };
    }
    onUpdateLevel({ ...level, handles: updatedHandles });
    setRenameModalOpen(false);
  }

  const zonePrefixes: Record<HandleKey, string> = {
    switchStartIn: '',
    switchStartTrueOut: 'True: ',
    switchStartFalseOut: 'False: ',
    switchEndTrueIn: 'True: ',
    switchEndFalseIn: 'False: ',
    switchEndOut: '',
  };

  function handleSingleNameChange(key: HandleKey, newName: string) {
    onUpdateLevel({
      ...level,
      handles: {
        ...level.handles,
        [key]: { ...level.handles[key], name: zonePrefixes[key] + newName },
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
            {HANDLE_GROUPS.map(({ label, keys }) => (
              <div key={label} className='flex flex-col gap-1'>
                <span className='text-secondary-light-gray text-[11px] font-main'>
                  {label}
                </span>
                {keys.map(({ label: handleLabel, key }) => (
                  <div key={key} className='flex items-center gap-1.5'>
                    <span className='text-secondary-light-gray text-[11px] w-14 shrink-0'>
                      {handleLabel}
                    </span>
                    <Input
                      size='small'
                      value={stripZonePrefix(level.handles[key].name)}
                      onChange={(value: string) =>
                        handleSingleNameChange(key, value)
                      }
                      allowOnlyNumbers={false}
                      liveUpdate
                      className='flex-1 min-w-0'
                    />
                  </div>
                ))}
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

export { SwitchHandleLevelRow };
