import { useCallback } from 'react';
import { GripVertical, Trash2, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cnHelper';
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
    <span className='truncate text-primary-white'>{item.name}</span>
  );

  return (
    <div
      ref={refCallback}
      data-slot='drag-list-item'
      data-item-id={item.id}
      data-path={pathKey}
      className={cn(
        'group flex items-center gap-2 px-2.5 py-2 rounded-md',
        'bg-primary-dark-gray hover:bg-[#383838]',
        'text-[14px] leading-[14px] font-main',
        'select-none',
      )}
      style={{ marginLeft: depth * indentationPerLevel }}
    >
      {isNonLeaf && (
        <button
          type='button'
          onClick={handleToggle}
          className='shrink-0 text-secondary-light-gray hover:text-primary-white p-0 bg-transparent border-none cursor-pointer'
        >
          <ChevronDown
            className={cn(
              'w-4 h-4 transition-transform duration-150',
              isCollapsed && '-rotate-90',
            )}
          />
        </button>
      )}

      <div className='flex-1 min-w-0'>{content}</div>

      {onDelete && isDeletable && (
        <button
          type='button'
          onClick={handleDelete}
          disabled={deleteDisabled}
          className={cn(
            'shrink-0 p-0 bg-transparent border-none opacity-0 group-hover:opacity-100 transition-opacity',
            deleteDisabled
              ? 'text-secondary-light-gray opacity-30 cursor-not-allowed'
              : 'text-secondary-light-gray hover:text-red-400 cursor-pointer',
          )}
        >
          <Trash2 className='w-4 h-4' />
        </button>
      )}

      <div
        onPointerDown={handlePointerDown}
        className='shrink-0 cursor-grab active:cursor-grabbing text-secondary-light-gray hover:text-primary-white touch-none'
      >
        <GripVertical className='w-4 h-4' />
      </div>
    </div>
  );
}

export { DragListItemRow };
