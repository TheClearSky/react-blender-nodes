import { createPortal } from 'react-dom';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/utils/cnHelper';
import {
  isDragListNonLeaf,
  type DragListProps,
  type DragListItem,
  type TreePath,
  type DropTarget,
  type DragListRenderContent,
} from './types';
import { useDragList } from './useDragList';
import { DragListItemRow } from './DragListItem';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { pathsAreEqual } from './dragListTreeUtils';

const FLIP_DURATION_MS = 200;

const GHOST_DASHED_BORDER = {
  backgroundImage: [
    'repeating-linear-gradient(0deg, var(--color-drag-list-ghost-accent) 0, var(--color-drag-list-ghost-accent) 10px, transparent 10px, transparent 18px)',
    'repeating-linear-gradient(90deg, var(--color-drag-list-ghost-accent) 0, var(--color-drag-list-ghost-accent) 10px, transparent 10px, transparent 18px)',
    'repeating-linear-gradient(180deg, var(--color-drag-list-ghost-accent) 0, var(--color-drag-list-ghost-accent) 10px, transparent 10px, transparent 18px)',
    'repeating-linear-gradient(270deg, var(--color-drag-list-ghost-accent) 0, var(--color-drag-list-ghost-accent) 10px, transparent 10px, transparent 18px)',
  ].join(', '),
  backgroundSize: '2px 100%, 100% 2px, 2px 100%, 100% 2px',
  backgroundPosition: '0 0, 0 0, 100% 0, 0 100%',
  backgroundRepeat: 'no-repeat',
};

function isDropTargetAt(
  itemPath: TreePath,
  position: 'before' | 'after' | 'inside',
  dropTarget: DropTarget | null,
): boolean {
  if (!dropTarget) return false;
  return (
    dropTarget.position === position && pathsAreEqual(dropTarget.path, itemPath)
  );
}

type InlineGhostProps<T extends Record<string, unknown>> = {
  item: DragListItem<T>;
  depth: number;
  indentationPerLevel: number;
  renderContent?: DragListRenderContent<T>;
};

function InlineGhost<T extends Record<string, unknown>>({
  item,
  depth,
  indentationPerLevel,
  renderContent,
}: InlineGhostProps<T>) {
  const theme = useGraphTheme();
  const content = renderContent ? (
    renderContent(item, depth)
  ) : (
    <span className='truncate text-primary-white/60'>{item.name}</span>
  );

  return (
    <div
      data-slot='drag-list-ghost'
      className={cn(
        'flex items-center gap-2 px-2.5 py-2 rounded-md',
        'text-[14px] leading-[14px] font-main',
        'pointer-events-none opacity-80',
        theme?.dragList?.ghost,
      )}
      style={{
        ...GHOST_DASHED_BORDER,
        marginLeft: depth * indentationPerLevel,
      }}
    >
      <div className='flex-1 min-w-0'>{content}</div>
    </div>
  );
}

type FloatingDragPreviewProps<T extends Record<string, unknown>> = {
  item: DragListItem<T>;
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  renderContent?: DragListRenderContent<T>;
};

function FloatingDragPreview<T extends Record<string, unknown>>({
  item,
  pointerX,
  pointerY,
  offsetX,
  offsetY,
  width,
  renderContent,
}: FloatingDragPreviewProps<T>) {
  const theme = useGraphTheme();
  const content = renderContent ? (
    renderContent(item, 0)
  ) : (
    <span className='truncate text-primary-white'>{item.name}</span>
  );

  return createPortal(
    <div
      data-slot='drag-list-floating-preview'
      className={cn(
        'fixed z-[9999] pointer-events-none',
        'flex items-center gap-2 px-2.5 py-2 rounded-md',
        'bg-primary-dark-gray border border-secondary-dark-gray',
        'text-[14px] leading-[14px] font-main',
        'shadow-lg shadow-black/40',
        'opacity-90',
        theme?.dragList?.preview,
      )}
      style={{
        left: pointerX - offsetX,
        top: pointerY - offsetY,
        width,
      }}
    >
      <div className='flex-1 min-w-0'>{content}</div>
      <div className='shrink-0 text-secondary-light-gray'>
        <GripVertical className='w-4 h-4' />
      </div>
    </div>,
    document.body,
  );
}

function runFlipAnimation(
  containerElement: HTMLElement | null,
  previousRects: Map<string, DOMRect>,
) {
  if (!containerElement || previousRects.size === 0) return;

  const allItemElements = containerElement.querySelectorAll('[data-item-id]');
  if (!allItemElements) return;

  const animations: { element: HTMLElement; deltaY: number }[] = [];

  for (let i = 0; i < allItemElements.length; i++) {
    const htmlElement = allItemElements[i] as HTMLElement;
    const itemId = htmlElement.dataset.itemId;
    if (!itemId) continue;

    const prevRect = previousRects.get(itemId);
    if (!prevRect) continue;

    const currentRect = htmlElement.getBoundingClientRect();
    const deltaY = prevRect.top - currentRect.top;

    if (Math.abs(deltaY) > 1) {
      animations.push({ element: htmlElement, deltaY });
    }
  }

  if (animations.length === 0) return;

  for (const { element, deltaY } of animations) {
    element.style.transform = `translateY(${deltaY}px)`;
    element.style.transition = 'none';
  }

  requestAnimationFrame(() => {
    for (const { element } of animations) {
      element.style.transform = '';
      element.style.transition = `transform ${FLIP_DURATION_MS}ms ease-out`;
    }
    setTimeout(() => {
      for (const { element } of animations) {
        element.style.transform = '';
        element.style.transition = '';
      }
    }, FLIP_DURATION_MS + 50);
  });
}

function DragList<T extends Record<string, unknown> = Record<string, never>>({
  items,
  onChange,
  onDelete,
  deleteDisabled = false,
  isDeletable: isDeletableProp,
  maxDepth = Infinity,
  renderContent,
  className,
  indentationPerLevel = 16,
}: DragListProps<T>) {
  const {
    collapsedIds,
    toggleCollapsed,
    draggedItemId,
    draggedItem,
    dropTarget,
    pointerPosition,
    dragStartOffset,
    handleDragStart,
    containerRef,
    registerItemRef,
    flipRectsRef,
  } = useDragList({ items, onChange, maxDepth });

  const prevItemsRef = useRef(items);
  const prevDropTargetRef = useRef(dropTarget);

  const handleDeleteItem = useCallback(
    async (item: DragListItem<T>) => {
      if (!onDelete) return;
      const shouldDelete = await onDelete(item);
      if (!shouldDelete) return;

      function removeById(
        list: DragListItem<T>[],
        targetId: string,
      ): DragListItem<T>[] {
        const result: DragListItem<T>[] = [];
        for (const listItem of list) {
          if (listItem.id === targetId) continue;
          if (isDragListNonLeaf(listItem)) {
            result.push({
              ...listItem,
              subTrees: removeById(listItem.subTrees, targetId),
            });
          } else {
            result.push(listItem);
          }
        }
        return result;
      }

      onChange(removeById(items, item.id));
    },
    [items, onChange, onDelete],
  );

  useLayoutEffect(() => {
    const dropTargetChanged = dropTarget !== prevDropTargetRef.current;
    const itemsChanged = items !== prevItemsRef.current;

    prevDropTargetRef.current = dropTarget;
    prevItemsRef.current = items;

    if (!dropTargetChanged && !itemsChanged) return;
    if (flipRectsRef.current.size === 0) return;

    runFlipAnimation(containerRef.current, flipRectsRef.current);
    flipRectsRef.current = new Map();
  }, [dropTarget, items, flipRectsRef, containerRef]);

  function computeGhostDepth(): number {
    if (!dropTarget) return 0;
    if (dropTarget.position === 'inside') {
      return dropTarget.path.length;
    }
    return dropTarget.path.length - 1;
  }

  function renderItems(
    itemList: DragListItem<T>[],
    parentPath: TreePath,
    depth: number,
  ) {
    const elements: React.ReactNode[] = [];
    const ghostDepth = computeGhostDepth();

    for (let index = 0; index < itemList.length; index++) {
      const item = itemList[index];
      const currentPath: TreePath = [...parentPath, index];
      const isNonLeaf = isDragListNonLeaf(item);
      const isCollapsed = isNonLeaf && collapsedIds.has(item.id);
      const isDraggedItemAtPath = item.id === draggedItemId;

      if (
        !isDraggedItemAtPath &&
        draggedItem &&
        isDropTargetAt(currentPath, 'before', dropTarget)
      ) {
        elements.push(
          <InlineGhost
            key='drag-ghost'
            item={draggedItem}
            depth={ghostDepth}
            indentationPerLevel={indentationPerLevel}
            renderContent={renderContent}
          />,
        );
      }

      elements.push(
        <DragListItemRow
          key={item.id}
          item={item}
          path={currentPath}
          depth={depth}
          isCollapsed={isCollapsed}
          isDraggedItem={isDraggedItemAtPath}
          onToggleCollapse={toggleCollapsed}
          onDragStart={handleDragStart}
          onDelete={onDelete ? handleDeleteItem : undefined}
          deleteDisabled={deleteDisabled}
          isDeletable={
            isDeletableProp
              ? isDeletableProp(item)
              : !!onDelete && !deleteDisabled
          }
          renderContent={renderContent}
          indentationPerLevel={indentationPerLevel}
          registerRef={registerItemRef}
        />,
      );

      if (isNonLeaf && !isDraggedItemAtPath && !isCollapsed) {
        const nonLeafItem = item as typeof item & {
          subTrees: DragListItem<T>[];
        };

        elements.push(
          <div key={`children-${item.id}`} className='flex flex-col gap-0.5'>
            {draggedItem &&
              isDropTargetAt(currentPath, 'inside', dropTarget) && (
                <InlineGhost
                  key='drag-ghost'
                  item={draggedItem}
                  depth={ghostDepth}
                  indentationPerLevel={indentationPerLevel}
                  renderContent={renderContent}
                />
              )}
            {renderItems(nonLeafItem.subTrees, currentPath, depth + 1)}
          </div>,
        );
      }

      if (
        !isDraggedItemAtPath &&
        draggedItem &&
        isDropTargetAt(currentPath, 'after', dropTarget)
      ) {
        elements.push(
          <InlineGhost
            key='drag-ghost'
            item={draggedItem}
            depth={ghostDepth}
            indentationPerLevel={indentationPerLevel}
            renderContent={renderContent}
          />,
        );
      }
    }

    return elements;
  }

  const containerWidth = containerRef.current?.offsetWidth ?? 250;
  const isDragging = draggedItemId !== null;

  return (
    <div
      ref={containerRef}
      data-slot='drag-list'
      className={cn('flex flex-col gap-0.5', className)}
    >
      {renderItems(items, [], 0)}
      {items.length === 0 && (
        <div className='text-[14px] text-secondary-light-gray text-center py-6 font-main'>
          No items
        </div>
      )}

      {isDragging && draggedItem && pointerPosition && dragStartOffset && (
        <FloatingDragPreview
          item={draggedItem}
          pointerX={pointerPosition.x}
          pointerY={pointerPosition.y}
          offsetX={dragStartOffset.x}
          offsetY={dragStartOffset.y}
          width={containerWidth}
          renderContent={renderContent}
        />
      )}
    </div>
  );
}

export { DragList };
