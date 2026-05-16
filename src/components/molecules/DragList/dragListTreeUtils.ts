import {
  isDragListNonLeaf,
  type DragListItem,
  type DragListNonLeaf,
  type TreePath,
  type DropTarget,
  type FlatProjectionEntry,
} from './types';

function getItemAtPath<T extends Record<string, unknown>>(
  items: DragListItem<T>[],
  path: TreePath,
): DragListItem<T> | undefined {
  if (path.length === 0) return undefined;

  const [firstIndex, ...remainingPath] = path;
  const item = items[firstIndex];
  if (!item) return undefined;

  if (remainingPath.length === 0) return item;

  if (isDragListNonLeaf(item)) {
    return getItemAtPath(item.subTrees, remainingPath);
  }

  return undefined;
}

function removeItemAtPath<T extends Record<string, unknown>>(
  items: DragListItem<T>[],
  path: TreePath,
): DragListItem<T>[] {
  if (path.length === 0) return items;

  const [firstIndex, ...remainingPath] = path;

  if (remainingPath.length === 0) {
    return [...items.slice(0, firstIndex), ...items.slice(firstIndex + 1)];
  }

  return items.map((item, index) => {
    if (index !== firstIndex) return item;
    if (!isDragListNonLeaf(item)) return item;

    return {
      ...item,
      subTrees: removeItemAtPath(item.subTrees, remainingPath),
    };
  });
}

function insertItemAtPath<T extends Record<string, unknown>>(
  items: DragListItem<T>[],
  path: TreePath,
  position: 'before' | 'after' | 'inside',
  itemToInsert: DragListItem<T>,
): DragListItem<T>[] {
  if (path.length === 0) return items;

  const [firstIndex, ...remainingPath] = path;

  if (remainingPath.length === 0) {
    if (position === 'inside') {
      return items.map((existingItem, index) => {
        if (index !== firstIndex) return existingItem;
        if (!isDragListNonLeaf(existingItem)) return existingItem;
        return {
          ...existingItem,
          subTrees: [itemToInsert, ...existingItem.subTrees],
        };
      });
    }

    const insertIndex = position === 'before' ? firstIndex : firstIndex + 1;
    return [
      ...items.slice(0, insertIndex),
      itemToInsert,
      ...items.slice(insertIndex),
    ];
  }

  return items.map((item, index) => {
    if (index !== firstIndex) return item;
    if (!isDragListNonLeaf(item)) return item;

    return {
      ...item,
      subTrees: insertItemAtPath(
        item.subTrees,
        remainingPath,
        position,
        itemToInsert,
      ),
    };
  });
}

function calculateItemDepth<T extends Record<string, unknown>>(
  item: DragListItem<T>,
): number {
  if (!isDragListNonLeaf(item)) return 0;
  if (item.subTrees.length === 0) return 1;

  let maxChildDepth = 0;
  for (const child of item.subTrees) {
    const childDepth = calculateItemDepth(child);
    if (childDepth > maxChildDepth) maxChildDepth = childDepth;
  }
  return 1 + maxChildDepth;
}

function buildFlatProjection<T extends Record<string, unknown>>(
  items: DragListItem<T>[],
  collapsedIds: Set<string>,
  depth: number = 0,
  parentPath: TreePath | null = null,
  excludeItemId: string | null = null,
): FlatProjectionEntry<T>[] {
  const result: FlatProjectionEntry<T>[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item.id === excludeItemId) continue;

    const path = parentPath ? [...parentPath, index] : [index];
    const isNonLeaf = isDragListNonLeaf(item);
    const isCollapsed = isNonLeaf && collapsedIds.has(item.id);

    result.push({
      item,
      path,
      depth,
      isNonLeaf,
      isCollapsed,
      parentPath,
    });

    if (isNonLeaf && !isCollapsed) {
      const childEntries = buildFlatProjection(
        (item as DragListNonLeaf<T>).subTrees,
        collapsedIds,
        depth + 1,
        path,
        excludeItemId,
      );
      result.push(...childEntries);
    }
  }

  return result;
}

function pathsAreEqual(pathA: TreePath, pathB: TreePath): boolean {
  if (pathA.length !== pathB.length) return false;
  for (let i = 0; i < pathA.length; i++) {
    if (pathA[i] !== pathB[i]) return false;
  }
  return true;
}

function pathIsDescendantOf(
  candidateDescendant: TreePath,
  candidateAncestor: TreePath,
): boolean {
  if (candidateDescendant.length <= candidateAncestor.length) return false;
  for (let i = 0; i < candidateAncestor.length; i++) {
    if (candidateDescendant[i] !== candidateAncestor[i]) return false;
  }
  return true;
}

function pathSharesParent(pathA: TreePath, pathB: TreePath): boolean {
  if (pathA.length !== pathB.length) return false;
  if (pathA.length === 0) return true;
  for (let i = 0; i < pathA.length - 1; i++) {
    if (pathA[i] !== pathB[i]) return false;
  }
  return true;
}

function getDepthAtDropTarget(dropTarget: DropTarget): number {
  if (dropTarget.position === 'inside') {
    return dropTarget.path.length;
  }
  return dropTarget.path.length - 1;
}

function canDropAtTarget<T extends Record<string, unknown>>(
  draggedItem: DragListItem<T>,
  draggedPath: TreePath,
  dropTarget: DropTarget,
  items: DragListItem<T>[],
  maxDepth: number,
): boolean {
  if (pathsAreEqual(draggedPath, dropTarget.path)) return false;

  if (pathIsDescendantOf(dropTarget.path, draggedPath)) return false;

  if (dropTarget.position === 'inside') {
    const targetItem = getItemAtPath(items, dropTarget.path);
    if (!targetItem || !isDragListNonLeaf(targetItem)) return false;
  }

  const targetDepth = getDepthAtDropTarget(dropTarget);
  const draggedItemDepth = calculateItemDepth(draggedItem);
  if (targetDepth + draggedItemDepth > maxDepth) return false;

  return true;
}

function countAllItems<T extends Record<string, unknown>>(
  items: DragListItem<T>[],
): number {
  let count = 0;
  for (const item of items) {
    count += 1;
    if (isDragListNonLeaf(item)) {
      count += countAllItems(item.subTrees);
    }
  }
  return count;
}

function moveItem<T extends Record<string, unknown>>(
  items: DragListItem<T>[],
  sourcePath: TreePath,
  dropTarget: DropTarget,
): DragListItem<T>[] {
  const item = getItemAtPath(items, sourcePath);
  if (!item) return items;

  const afterRemoval = removeItemAtPath(items, sourcePath);
  const adjustedPath = adjustPathAfterRemoval(dropTarget.path, sourcePath);

  const result = insertItemAtPath(
    afterRemoval,
    adjustedPath,
    dropTarget.position,
    item,
  );

  if (countAllItems(result) !== countAllItems(items)) {
    return items;
  }

  return result;
}

function adjustPathAfterRemoval(
  targetPath: TreePath,
  removedPath: TreePath,
): TreePath {
  const result = [...targetPath];
  const removedParent = removedPath.slice(0, -1);
  const removedIndex = removedPath[removedPath.length - 1];
  const adjustLevel = removedParent.length;

  if (targetPath.length <= adjustLevel) return result;

  for (let i = 0; i < removedParent.length; i++) {
    if (targetPath[i] !== removedParent[i]) return result;
  }

  if (targetPath[adjustLevel] > removedIndex) {
    result[adjustLevel] = targetPath[adjustLevel] - 1;
  }

  return result;
}

function pathToKey(path: TreePath): string {
  return path.join('-');
}

export {
  getItemAtPath,
  removeItemAtPath,
  insertItemAtPath,
  calculateItemDepth,
  buildFlatProjection,
  pathsAreEqual,
  pathIsDescendantOf,
  pathSharesParent,
  getDepthAtDropTarget,
  canDropAtTarget,
  moveItem,
  adjustPathAfterRemoval,
  pathToKey,
};
