import { useState, useRef, useCallback, useEffect } from 'react';
import {
  isDragListNonLeaf,
  type DragListItem,
  type TreePath,
  type DropTarget,
  type FlatProjectionEntry,
} from './types';
import {
  buildFlatProjection,
  canDropAtTarget,
  getItemAtPath,
  moveItem,
  pathToKey,
} from './dragListTreeUtils';

type PointerPosition = { x: number; y: number };

type UseDragListOptions<
  T extends Record<string, unknown> = Record<string, never>,
> = {
  items: DragListItem<T>[];
  onChange: (newItems: DragListItem<T>[]) => void;
  maxDepth?: number;
};

type UseDragListReturn<
  T extends Record<string, unknown> = Record<string, never>,
> = {
  collapsedIds: Set<string>;
  toggleCollapsed: (id: string) => void;
  draggedItemId: string | null;
  draggedItem: DragListItem<T> | null;
  dropTarget: DropTarget | null;
  pointerPosition: PointerPosition | null;
  dragStartOffset: PointerPosition | null;
  flatProjection: FlatProjectionEntry<T>[];
  handleDragStart: (
    itemId: string,
    path: TreePath,
    event: React.PointerEvent,
  ) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  registerItemRef: (pathKey: string, element: HTMLElement | null) => void;
  flipRectsRef: React.RefObject<Map<string, DOMRect>>;
};

const AUTO_EXPAND_DELAY_MS = 500;

function useDragList<
  T extends Record<string, unknown> = Record<string, never>,
>({
  items,
  onChange,
  maxDepth = Infinity,
}: UseDragListOptions<T>): UseDragListReturn<T> {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [pointerPosition, setPointerPosition] =
    useState<PointerPosition | null>(null);
  const [dragStartOffset, setDragStartOffset] =
    useState<PointerPosition | null>(null);

  const draggedPathRef = useRef<TreePath | null>(null);
  const draggedItemRef = useRef<DragListItem<T> | null>(null);
  const itemRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const itemRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoExpandTargetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const flipRectsRef = useRef<Map<string, DOMRect>>(new Map());

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const maxDepthRef = useRef(maxDepth);
  maxDepthRef.current = maxDepth;
  const collapsedIdsRef = useRef(collapsedIds);
  collapsedIdsRef.current = collapsedIds;
  const liveDropTargetRef = useRef<DropTarget | null>(null);

  const pointerMoveRef = useRef<((event: PointerEvent) => void) | null>(null);
  const pointerUpRef = useRef<((event: PointerEvent) => void) | null>(null);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const registerItemRef = useCallback(
    (pathKey: string, element: HTMLElement | null) => {
      if (element) {
        itemRefsMap.current.set(pathKey, element);
      } else {
        itemRefsMap.current.delete(pathKey);
      }
    },
    [],
  );

  const snapshotItemRects = useCallback(() => {
    const rects = new Map<string, DOMRect>();
    for (const [pathKey, element] of itemRefsMap.current) {
      rects.set(pathKey, element.getBoundingClientRect());
    }
    itemRectsRef.current = rects;
  }, []);

  const snapshotFlipRects = useCallback(() => {
    const rects = new Map<string, DOMRect>();
    for (const [, element] of itemRefsMap.current) {
      const itemId = element.dataset.itemId;
      if (itemId) {
        rects.set(itemId, element.getBoundingClientRect());
      }
    }
    flipRectsRef.current = rects;
  }, []);

  const clearAutoExpandTimer = useCallback(() => {
    if (autoExpandTimerRef.current !== null) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
    autoExpandTargetIdRef.current = null;
  }, []);

  const flatProjection = buildFlatProjection(
    items,
    collapsedIds,
    0,
    null,
    null,
  );

  const handleDragStart = useCallback(
    (itemId: string, path: TreePath, event: React.PointerEvent) => {
      event.preventDefault();

      const item = getItemAtPath(items, path);
      if (!item) return;

      const itemPathKey = pathToKey(path);
      const itemElement = itemRefsMap.current.get(itemPathKey);
      const itemRect = itemElement?.getBoundingClientRect();
      const offsetX = itemRect ? event.clientX - itemRect.left : 0;
      const offsetY = itemRect ? event.clientY - itemRect.top : 0;

      setDraggedItemId(itemId);
      setPointerPosition({ x: event.clientX, y: event.clientY });
      setDragStartOffset({ x: offsetX, y: offsetY });
      draggedPathRef.current = path;
      draggedItemRef.current = item;
      isDraggingRef.current = true;

      snapshotItemRects();

      function computeDropTargetFromPointer(
        pointerY: number,
      ): DropTarget | null {
        const currentItems = itemsRef.current;
        const currentCollapsedIds = collapsedIdsRef.current;

        const projection = buildFlatProjection(
          currentItems,
          currentCollapsedIds,
          0,
          null,
          null,
        );

        let closestEntry: FlatProjectionEntry<T> | null = null;
        let closestDistance = Infinity;
        let closestRect: DOMRect | null = null;

        for (const entry of projection) {
          if (entry.item.id === itemId) continue;
          const entryPathKey = pathToKey(entry.path);
          const rect = itemRectsRef.current.get(entryPathKey);
          if (!rect) continue;

          const midY = rect.top + rect.height / 2;
          const distance = Math.abs(pointerY - midY);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestEntry = entry;
            closestRect = rect;
          }
        }

        if (!closestEntry || !closestRect) {
          if (projection.length > 0) {
            const lastEntry = projection[projection.length - 1];
            return { path: lastEntry.path, position: 'after' };
          }
          return null;
        }

        const relativeY = pointerY - closestRect.top;
        const fraction = relativeY / closestRect.height;

        let position: 'before' | 'after' | 'inside';
        if (
          closestEntry.isNonLeaf &&
          !closestEntry.isCollapsed &&
          fraction >= 0.3
        ) {
          position = 'inside';
        } else if (
          closestEntry.isNonLeaf &&
          fraction >= 0.3 &&
          fraction <= 0.7
        ) {
          position = 'inside';
        } else if (fraction < 0.5) {
          position = 'before';
        } else {
          position = 'after';
        }

        const target: DropTarget = { path: closestEntry.path, position };

        if (
          draggedPathRef.current &&
          draggedItemRef.current &&
          !canDropAtTarget(
            draggedItemRef.current,
            draggedPathRef.current,
            target,
            currentItems,
            maxDepthRef.current,
          )
        ) {
          if (position === 'inside') {
            const fallbackPosition = fraction < 0.5 ? 'before' : 'after';
            const fallbackTarget: DropTarget = {
              path: closestEntry.path,
              position: fallbackPosition,
            };
            if (
              canDropAtTarget(
                draggedItemRef.current,
                draggedPathRef.current,
                fallbackTarget,
                currentItems,
                maxDepthRef.current,
              )
            ) {
              return fallbackTarget;
            }
          }
          return null;
        }

        return target;
      }

      function handlePointerMove(moveEvent: PointerEvent) {
        if (!isDraggingRef.current) return;

        setPointerPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
        const target = computeDropTargetFromPointer(moveEvent.clientY);

        const previousTarget = liveDropTargetRef.current;
        const targetChanged =
          (previousTarget === null) !== (target === null) ||
          (previousTarget &&
            target &&
            (previousTarget.position !== target.position ||
              previousTarget.path.join(',') !== target.path.join(',')));

        if (targetChanged) {
          snapshotFlipRects();
        }

        setDropTarget(target);
        liveDropTargetRef.current = target;

        if (target && target.position === 'inside') {
          const targetItem = getItemAtPath(itemsRef.current, target.path);
          if (
            targetItem &&
            isDragListNonLeaf(targetItem) &&
            collapsedIdsRef.current.has(targetItem.id)
          ) {
            if (autoExpandTargetIdRef.current !== targetItem.id) {
              clearAutoExpandTimer();
              autoExpandTargetIdRef.current = targetItem.id;
              autoExpandTimerRef.current = setTimeout(() => {
                setCollapsedIds((previous) => {
                  const next = new Set(previous);
                  next.delete(targetItem.id);
                  return next;
                });
                autoExpandTargetIdRef.current = null;
                autoExpandTimerRef.current = null;
                requestAnimationFrame(() => {
                  snapshotItemRects();
                });
              }, AUTO_EXPAND_DELAY_MS);
            }
          } else {
            if (autoExpandTargetIdRef.current !== null) {
              clearAutoExpandTimer();
            }
          }
        } else {
          if (autoExpandTargetIdRef.current !== null) {
            clearAutoExpandTimer();
          }
        }
      }

      function handlePointerUp() {
        if (!isDraggingRef.current) return;

        const currentDropTarget = liveDropTargetRef.current;
        if (
          currentDropTarget &&
          draggedItemRef.current &&
          draggedPathRef.current
        ) {
          snapshotFlipRects();
          const newItems = moveItem(
            itemsRef.current,
            draggedPathRef.current,
            currentDropTarget,
          );
          onChangeRef.current(newItems);
        }

        setDraggedItemId(null);
        setDropTarget(null);
        setPointerPosition(null);
        setDragStartOffset(null);
        liveDropTargetRef.current = null;
        draggedPathRef.current = null;
        draggedItemRef.current = null;
        isDraggingRef.current = false;
        clearAutoExpandTimer();

        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        pointerMoveRef.current = null;
        pointerUpRef.current = null;
      }

      pointerMoveRef.current = handlePointerMove;
      pointerUpRef.current = handlePointerUp;
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [items, snapshotItemRects, snapshotFlipRects, clearAutoExpandTimer],
  );

  useEffect(() => {
    return () => {
      clearAutoExpandTimer();
      if (pointerMoveRef.current) {
        document.removeEventListener('pointermove', pointerMoveRef.current);
      }
      if (pointerUpRef.current) {
        document.removeEventListener('pointerup', pointerUpRef.current);
      }
      isDraggingRef.current = false;
    };
  }, [clearAutoExpandTimer]);

  return {
    collapsedIds,
    toggleCollapsed,
    draggedItemId,
    draggedItem: draggedItemRef.current,
    dropTarget,
    pointerPosition,
    dragStartOffset,
    flatProjection,
    handleDragStart,
    containerRef,
    registerItemRef,
    flipRectsRef,
  };
}

export { useDragList };
export type { UseDragListOptions, UseDragListReturn };
