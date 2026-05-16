import type { ReactNode } from 'react';

// ─────────────────────────────────────────────────────
// Item types
// ─────────────────────────────────────────────────────

type DragListLeaf<T extends Record<string, unknown> = Record<string, never>> = {
  id: string;
  name: string;
  additionalProperties?: T;
};

type DragListNonLeaf<
  T extends Record<string, unknown> = Record<string, never>,
> = {
  id: string;
  name: string;
  additionalProperties?: T;
  subTrees: DragListItem<T>[];
};

type DragListItem<T extends Record<string, unknown> = Record<string, never>> =
  | DragListLeaf<T>
  | DragListNonLeaf<T>;

function isDragListNonLeaf<T extends Record<string, unknown>>(
  item: DragListItem<T>,
): item is DragListNonLeaf<T> {
  return 'subTrees' in item;
}

// ─────────────────────────────────────────────────────
// Tree path and drop target
// ─────────────────────────────────────────────────────

type TreePath = readonly number[];

const dropPositions = ['before', 'after', 'inside'] as const;
type DropPosition = (typeof dropPositions)[number];

type DropTarget = {
  path: TreePath;
  position: DropPosition;
};

// ─────────────────────────────────────────────────────
// Flat projection entry
// ─────────────────────────────────────────────────────

type FlatProjectionEntry<
  T extends Record<string, unknown> = Record<string, never>,
> = {
  item: DragListItem<T>;
  path: TreePath;
  depth: number;
  isNonLeaf: boolean;
  isCollapsed: boolean;
  parentPath: TreePath | null;
};

// ─────────────────────────────────────────────────────
// Callback types
// ─────────────────────────────────────────────────────

type DragListOnChange<
  T extends Record<string, unknown> = Record<string, never>,
> = (newItems: DragListItem<T>[]) => void;

type DragListOnDelete<
  T extends Record<string, unknown> = Record<string, never>,
> = (item: DragListItem<T>) => Promise<boolean>;

type DragListRenderContent<
  T extends Record<string, unknown> = Record<string, never>,
> = (item: DragListItem<T>, depth: number) => ReactNode;

// ─────────────────────────────────────────────────────
// Component props
// ─────────────────────────────────────────────────────

type DragListProps<T extends Record<string, unknown> = Record<string, never>> =
  {
    items: DragListItem<T>[];
    onChange: DragListOnChange<T>;
    onDelete?: DragListOnDelete<T>;
    deleteDisabled?: boolean;
    isDeletable?: (item: DragListItem<T>) => boolean;
    maxDepth?: number;
    renderContent?: DragListRenderContent<T>;
    className?: string;
    indentationPerLevel?: number;
  };

// ─────────────────────────────────────────────────────
// Internal item props
// ─────────────────────────────────────────────────────

type DragListItemProps<
  T extends Record<string, unknown> = Record<string, never>,
> = {
  item: DragListItem<T>;
  path: TreePath;
  depth: number;
  isCollapsed: boolean;
  isDraggedItem: boolean;
  onToggleCollapse: (id: string) => void;
  onDragStart: (
    itemId: string,
    path: TreePath,
    event: React.PointerEvent,
  ) => void;
  onDelete?: (item: DragListItem<T>) => void;
  deleteDisabled: boolean;
  isDeletable: boolean;
  renderContent?: DragListRenderContent<T>;
  indentationPerLevel: number;
  registerRef: (pathKey: string, element: HTMLElement | null) => void;
};

export { isDragListNonLeaf, dropPositions };
export type {
  DragListLeaf,
  DragListNonLeaf,
  DragListItem,
  TreePath,
  DropPosition,
  DropTarget,
  FlatProjectionEntry,
  DragListOnChange,
  DragListOnDelete,
  DragListRenderContent,
  DragListProps,
  DragListItemProps,
};
