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
      <div className='rbn:flex rbn:flex-col rbn:overflow-hidden'>
        <div
          className='rbn:flex rbn:items-center rbn:gap-2 rbn:cursor-pointer rbn:select-none'
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
              'rbn:flex-1 rbn:min-w-0 rbn:truncate rbn:text-[14px] rbn:leading-[14px] rbn:font-main',
              commonName
                ? 'rbn:text-primary-white'
                : 'rbn:text-secondary-light-gray rbn:italic',
            )}
          >
            {displayName}
          </span>
          <button
            className='rbn:shrink-0 rbn:p-0.5 rbn:rounded rbn:hover:bg-primary-gray rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:transition-colors'
            onClick={(event) => {
              event.stopPropagation();
              handleRenameAll();
            }}
          >
            <Pencil className='rbn:w-3.5 rbn:h-3.5' />
          </button>
          <ChevronDown
            className={cn(
              'rbn:w-4 rbn:h-4 rbn:shrink-0 rbn:text-secondary-light-gray rbn:transition-transform rbn:duration-150',
              !expanded && 'rbn:-rotate-90',
            )}
          />
        </div>

        {expanded && (
          <div className='rbn:pb-1 rbn:pt-2 rbn:flex rbn:flex-col rbn:gap-2.5 rbn:border-t rbn:border-secondary-dark-gray rbn:mt-2'>
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
          className='rbn:w-full'
        />
      </PresetModal>
    </>
  );
}

export { HandleLevelRowShell };
export type { HandleLevelRowShellProps };
