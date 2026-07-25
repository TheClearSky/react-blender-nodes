import { useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { Input } from '@/components/atoms';
import {
  HandleShapeSwatch,
  type HandleShape,
} from '@/components/atoms/HandleShapeSwatch';
import { PresetModal } from '@/components/molecules/PresetModal';
import { cn } from '@/utils/cnHelper';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

type HandleLevelRowShellProps = {
  /** Data-type color for the leading handle-shape swatch. */
  color: string;
  /** Data-type shape for the leading swatch (defaults to circle when absent). */
  shape?: HandleShape;
  /** Shared name across all handles in the level, or null when they differ. */
  commonName: string | null;
  /** Apply a single trimmed name to every handle in the level. */
  onRenameAll: (newName: string) => void;
  /** The per-handle name inputs shown when the row is expanded. */
  children: React.ReactNode;
};

/**
 * Shared chrome for a region (loop/switch) channel row: the expand/collapse
 * header (color dot, common name, rename pencil, chevron) and the "rename all"
 * modal. The variant-specific handle inputs are slotted via `children`, and the
 * name mutation (e.g. switch zone prefixes) stays in the caller via `onRenameAll`.
 */
function HandleLevelRowShell({
  color,
  shape,
  commonName,
  onRenameAll,
  children,
}: HandleLevelRowShellProps) {
  const theme = useGraphTheme();
  const [expanded, setExpanded] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameName, setRenameName] = useState('');

  const displayName = commonName ?? '(mixed names)';

  function handleRenameAll() {
    setRenameName(commonName ?? '');
    setRenameModalOpen(true);
  }

  function handleRenameConfirm() {
    const trimmed = renameName.trim();
    if (trimmed === '') return;
    onRenameAll(trimmed);
    setRenameModalOpen(false);
  }

  return (
    <>
      <div className='flex flex-col overflow-hidden'>
        <div
          className='flex items-center gap-2 cursor-pointer select-none'
          onClick={() => setExpanded(!expanded)}
        >
          <HandleShapeSwatch
            shape={shape}
            color={color}
            size={16}
            className={theme?.node?.handleShape}
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
            {children}
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

export { HandleLevelRowShell };
export type { HandleLevelRowShellProps };
