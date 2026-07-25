import { Input } from '@/components/atoms';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { HandleLevelRowShell } from '@/components/molecules/RegionChannelEditDrawer/HandleLevelRowShell';
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
  const theme = useGraphTheme();
  const commonName = getCommonName(level);

  function renameAll(trimmed: string) {
    const updatedHandles = { ...level.handles };
    for (const key of Object.keys(updatedHandles) as HandleKey[]) {
      updatedHandles[key] = { ...updatedHandles[key], name: trimmed };
    }
    onUpdateLevel({ ...level, handles: updatedHandles });
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
    <HandleLevelRowShell
      color={level.dataTypeColor}
      shape={level.dataTypeShape}
      commonName={commonName}
      onRenameAll={renameAll}
    >
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
              onChange={(value: string) => handleSingleNameChange(inKey, value)}
              allowOnlyNumbers={false}
              liveUpdate
              className={cn('flex-1 min-w-0', theme?.node?.inputField)}
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
              className={cn('flex-1 min-w-0', theme?.node?.inputField)}
            />
          </div>
        </div>
      ))}
    </HandleLevelRowShell>
  );
}

export { LoopHandleLevelRow };
