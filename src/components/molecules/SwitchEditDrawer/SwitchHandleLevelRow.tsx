import { Input } from '@/components/atoms';
import { HandleLevelRowShell } from '@/components/molecules/RegionChannelEditDrawer/HandleLevelRowShell';
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

// Zone prefixes keep True/False handle names disambiguated in stored data while
// the UI shows the user a single un-prefixed name per level.
const zonePrefixes: Record<HandleKey, string> = {
  switchStartIn: '',
  switchStartTrueOut: 'True: ',
  switchStartFalseOut: 'False: ',
  switchEndTrueIn: 'True: ',
  switchEndFalseIn: 'False: ',
  switchEndOut: '',
};

function SwitchHandleLevelRow({
  level,
  onUpdateLevel,
}: SwitchHandleLevelRowProps) {
  const commonName = getCommonName(level);

  function renameAll(trimmed: string) {
    const updatedHandles = { ...level.handles };
    for (const key of Object.keys(updatedHandles) as HandleKey[]) {
      updatedHandles[key] = {
        ...updatedHandles[key],
        name: zonePrefixes[key] + trimmed,
      };
    }
    onUpdateLevel({ ...level, handles: updatedHandles });
  }

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
    <HandleLevelRowShell
      color={level.dataTypeColor}
      commonName={commonName}
      onRenameAll={renameAll}
    >
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
                onChange={(value: string) => handleSingleNameChange(key, value)}
                allowOnlyNumbers={false}
                liveUpdate
                className='flex-1 min-w-0'
              />
            </div>
          ))}
        </div>
      ))}
    </HandleLevelRowShell>
  );
}

export { SwitchHandleLevelRow };
