import { useCallback } from 'react';
import { GripVertical, Trash2, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cnHelper';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { isDragListNonLeaf, type DragListItemProps } from './types';
import { pathToKey } from './dragListTreeUtils';

function DragListItemRow<
  T extends Record<string, unknown> = Record<string, never>,
>({
  item,
  path,
  depth,
  isCollapsed,
  isDraggedItem,
  onToggleCollapse,
  onDragStart,
  onDelete,
  deleteDisabled,
  isDeletable,
  renderContent,
  indentationPerLevel,
  registerRef,
}: DragListItemProps<T>) {
  const pathKey = pathToKey(path);
  const isNonLeaf = isDragListNonLeaf(item);
  // Optional graph-theme fallback: undefined without a GraphThemeProvider.
  const theme = useGraphTheme();

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      onDragStart(item.id, path, event);
    },
    [item.id, path, onDragStart],
  );

  const handleToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onToggleCollapse(item.id);
    },
    [item.id, onToggleCollapse],
  );

  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onDelete?.(item);
    },
    [item, onDelete],
  );

  const refCallback = useCallback(
    (element: HTMLElement | null) => {
      registerRef(pathKey, element);
    },
    [pathKey, registerRef],
  );

  if (isDraggedItem) {
    return null;
  }

  const content = renderContent ? (
    renderContent(item, depth)
  ) : (
    <span className='rbn:truncate rbn:text-primary-white'>{item.name}</span>
  );

  return (
    <div
      ref={refCallback}
      data-slot='drag-list-item'
      data-item-id={item.id}
      data-path={pathKey}
      className={cn(
        'rbn:group rbn:flex rbn:items-center rbn:gap-2 rbn:px-2.5 rbn:py-2 rbn:rounded-md',
        'rbn:bg-primary-dark-gray rbn:hover:bg-drag-list-item-hover-bg',
        'rbn:text-[14px] rbn:leading-[14px] rbn:font-main',
        'rbn:select-none',
        theme?.dragList?.row,
      )}
      style={{ marginLeft: depth * indentationPerLevel }}
    >
      {isNonLeaf && (
        <button
          type='button'
          onClick={handleToggle}
          className='rbn:shrink-0 rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:p-0 rbn:bg-transparent rbn:border-none rbn:cursor-pointer'
        >
          <ChevronDown
            className={cn(
              'rbn:w-4 rbn:h-4 rbn:transition-transform rbn:duration-150',
              isCollapsed && 'rbn:-rotate-90',
            )}
          />
        </button>
      )}

      <div className='rbn:flex-1 rbn:min-w-0'>{content}</div>

      {onDelete && isDeletable && (
        <button
          type='button'
          onClick={handleDelete}
          disabled={deleteDisabled}
          className={cn(
            'rbn:shrink-0 rbn:p-0 rbn:bg-transparent rbn:border-none rbn:opacity-0 rbn:group-hover:opacity-100 rbn:transition-opacity',
            deleteDisabled
              ? 'rbn:text-secondary-light-gray rbn:opacity-30 rbn:cursor-not-allowed'
              : 'rbn:text-secondary-light-gray rbn:hover:text-red-400 rbn:cursor-pointer',
          )}
        >
          <Trash2 className='rbn:w-4 rbn:h-4' />
        </button>
      )}

      <div
        onPointerDown={handlePointerDown}
        className='rbn:shrink-0 rbn:cursor-grab rbn:active:cursor-grabbing rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:touch-none'
      >
        <GripVertical className='rbn:w-4 rbn:h-4' />
      </div>
    </div>
  );
}

export { DragListItemRow };
