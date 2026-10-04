import { PlusIcon, SquaresExcludeIcon } from 'lucide-react';
import { createElement, type ActionDispatch, type ReactNode } from 'react';
import type { ContextMenuItem } from './ContextMenu';
import { typedKeys } from '@/utils/typedKeys';
import type {
  State,
  SupportedUnderlyingTypes,
} from '@/utils/nodeStateManagement/types';
import { type XYPosition } from '@xyflow/react';
import {
  actionTypesMap,
  type Action,
} from '@/utils/nodeStateManagement/mainReducer';
import { z } from 'zod';
import { getAllDependentsOfNodeTypeRecursively } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import { standardNodeTypeNamesMap } from '@/utils/nodeStateManagement/standardNodes';

type CreateNodeContextMenuProps<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  typeOfNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['typeOfNodes'];
  dispatch: ActionDispatch<
    [
      action: Action<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >,
    ]
  >;
  setContextMenu: (menu: { isOpen: boolean; position: XYPosition }) => void;
  contextMenuPosition: XYPosition;
  hiddenNodeTypesInContextMenu?: Partial<Record<NodeTypeUniqueId, true>>;
  /**
   * Whether to allow recursion
   * - If not provided, is considered true
   * - When true, the recursion is checked, and nesting of node groups is not allowed if it creates a recursion
   * - When false, the recursion is not checked, and all nesting of node groups is allowed
   *
   * @default true
   */
  isRecursionAllowed?: boolean;
  currentNodeType?: NodeTypeUniqueId;
  /** True only on the ROOT canvas. The graph's I/O boundary nodes
   *  (groupInput/groupOutput) are otherwise hidden, but at root they surface as
   *  "Add Graph Input" / "Add Graph Output" entries (one of each, max). */
  isAtRootScope?: boolean;
  /** Whether a root Graph Input / Output already exists (so the single-instance
   *  add entry is hidden once placed). */
  rootGraphInputExists?: boolean;
  rootGraphOutputExists?: boolean;
  /** Marks node GROUPS in the menu (a type with a `subtree`). Defaults to the
   *  lucide `SquaresExclude` (two overlapping squares); `false` = no mark. */
  groupIcon?: ReactNode | false;
};

/** The default group mark: lucide `SquaresExclude` (Deepak, 2026-09-28). */
function defaultGroupIcon(): ReactNode {
  return createElement(SquaresExcludeIcon, {
    className: 'rbn:w-3 rbn:h-3',
    'aria-label': 'Node group',
  });
}

// ── Internal tree-building types ──

type MenuTreeLeaf = {
  kind: 'leaf';
  item: ContextMenuItem;
  priority: number;
  insertionIndex: number;
  isGroup: boolean;
};

type MenuTreeFolder = {
  kind: 'folder';
  label: string;
  children: MenuTreeNode[];
};

type MenuTreeNode = MenuTreeLeaf | MenuTreeFolder;

function getEffectivePriority(node: MenuTreeNode): number {
  if (node.kind === 'leaf') return node.priority;
  if (node.children.length === 0) return 0;
  return Math.max(...node.children.map(getEffectivePriority));
}

function getMinInsertionIndex(node: MenuTreeNode): number {
  if (node.kind === 'leaf') return node.insertionIndex;
  if (node.children.length === 0) return Infinity;
  return Math.min(...node.children.map(getMinInsertionIndex));
}

function sortTreeLevel(children: MenuTreeNode[]): void {
  children.sort((a, b) => {
    const priorityDiff = getEffectivePriority(b) - getEffectivePriority(a);
    if (priorityDiff !== 0) return priorityDiff;
    return getMinInsertionIndex(a) - getMinInsertionIndex(b);
  });
  for (const child of children) {
    if (child.kind === 'folder') {
      sortTreeLevel(child.children);
    }
  }
}

function treeToMenuItems(
  children: MenuTreeNode[],
  groupIcon: ReactNode | false,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  // In a folder holding any group, plain rows get an icon-sized blank so
  // every label lines up.
  const marksGroups =
    groupIcon !== false &&
    children.some((child) => child.kind === 'leaf' && child.isGroup);
  for (const child of children) {
    if (child.kind === 'leaf') {
      items.push(
        marksGroups
          ? {
              ...child.item,
              icon: child.isGroup
                ? groupIcon
                : createElement('span', { 'aria-hidden': true }),
            }
          : child.item,
      );
    } else {
      const subItems = treeToMenuItems(child.children, groupIcon);
      if (subItems.length > 0) {
        items.push({
          id: `folder-${child.label}`,
          label: child.label,
          subItems,
        });
      }
    }
  }
  return items;
}

/**
 * Creates a context menu tree for adding nodes
 * @param typeOfNodes - The available node types
 * @param dispatch - The dispatch function for state management
 * @param setContextMenu - Function to close the context menu
 * @param contextMenuPosition - The position where the context menu was opened
 * @returns ContextMenuItem array for the context menu
 */
function createNodeContextMenu<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  typeOfNodes,
  dispatch,
  setContextMenu,
  contextMenuPosition,
  isRecursionAllowed = true,
  currentNodeType,
  hiddenNodeTypesInContextMenu,
  isAtRootScope = false,
  rootGraphInputExists = false,
  rootGraphOutputExists = false,
  groupIcon = defaultGroupIcon(),
}: CreateNodeContextMenuProps<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>): ContextMenuItem[] {
  const nodeTypeKeys = typedKeys(typeOfNodes);

  if (nodeTypeKeys.length === 0) {
    return [];
  }

  // Apply recursion filtering
  function filterNodeTypeKeys(
    nodeTypeKeys: Array<NodeTypeUniqueId>,
    isRecursionAllowed: boolean,
  ): Array<NodeTypeUniqueId> {
    if (isRecursionAllowed) {
      return nodeTypeKeys;
    }
    if (!currentNodeType) {
      return nodeTypeKeys;
    }
    const dependentsOfCurrentNodeGroup = getAllDependentsOfNodeTypeRecursively(
      {
        typeOfNodes,
      },
      currentNodeType,
    );
    return nodeTypeKeys.filter(
      (nodeTypeId) => !dependentsOfCurrentNodeGroup.has(nodeTypeId),
    );
  }

  const filteredNodeTypeKeys = filterNodeTypeKeys(
    nodeTypeKeys,
    isRecursionAllowed,
  ).filter((id) => !hiddenNodeTypesInContextMenu?.[id]);

  // Build tree from location paths
  const root: MenuTreeNode[] = [];

  for (let i = 0; i < filteredNodeTypeKeys.length; i++) {
    const nodeTypeId = filteredNodeTypeKeys[i];
    const nodeType = typeOfNodes[nodeTypeId];
    const location = nodeType.locationInContextMenu ?? [];
    const priority = nodeType.priorityInContextMenu ?? 0;

    const leaf: MenuTreeLeaf = {
      kind: 'leaf',
      item: {
        id: `add-${String(nodeTypeId)}`,
        label: nodeType.name,
        onClick: () => {
          dispatch({
            type: actionTypesMap.ADD_NODE_AND_SELECT,
            payload: {
              type: nodeTypeId,
              position: contextMenuPosition,
            },
          });
          setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
        },
      },
      priority,
      insertionIndex: i,
      isGroup: nodeType.subtree !== undefined,
    };

    if (location.length === 0) {
      // Root level
      root.push(leaf);
    } else {
      // Walk the path, creating folders as needed
      let currentLevel = root;
      for (const segment of location) {
        let folder = currentLevel.find(
          (n): n is MenuTreeFolder =>
            n.kind === 'folder' && n.label === segment,
        );
        if (!folder) {
          folder = { kind: 'folder', label: segment, children: [] };
          currentLevel.push(folder);
        }
        currentLevel = folder.children;
      }
      currentLevel.push(leaf);
    }
  }

  // Sort all levels by priority (descending), stable with insertion index
  sortTreeLevel(root);

  // Convert tree to ContextMenuItem[]
  const nodeSubItems = treeToMenuItems(root, groupIcon);

  // Root-only Graph I/O placement. The boundary node types are hidden from the
  // normal listing (above), so surface them here as single-instance entries.
  const graphIoSubItems: ContextMenuItem[] = [];
  if (isAtRootScope) {
    const addGraphIoEntry = (
      nodeTypeId: NodeTypeUniqueId,
      label: string,
      alreadyExists: boolean,
    ) => {
      if (alreadyExists) return;
      if (!(nodeTypeId in typeOfNodes)) return;
      graphIoSubItems.push({
        id: `add-graph-io-${String(nodeTypeId)}`,
        label,
        onClick: () => {
          dispatch({
            type: actionTypesMap.ADD_NODE_AND_SELECT,
            payload: { type: nodeTypeId, position: contextMenuPosition },
          });
          setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
        },
      });
    };
    addGraphIoEntry(
      standardNodeTypeNamesMap.groupInput as NodeTypeUniqueId,
      'Graph Input',
      rootGraphInputExists,
    );
    addGraphIoEntry(
      standardNodeTypeNamesMap.groupOutput as NodeTypeUniqueId,
      'Graph Output',
      rootGraphOutputExists,
    );
  }

  return [
    {
      id: 'add-node',
      label: 'Add Node',
      icon: createElement(PlusIcon, { className: 'rbn:w-4 rbn:h-4' }),
      subItems: [...graphIoSubItems, ...nodeSubItems],
    },
  ];
}

/**
 * The Add-menu folders directly under `parentPath` (distinct, in first-seen
 * order) — for a menu-path picker's suggestions. Types hidden from the menu
 * are skipped, so only folders a visitor can actually see are offered.
 */
function menuFolderSuggestions(
  typeOfNodes: Record<string, { locationInContextMenu?: string[] }>,
  parentPath: readonly string[],
  hidden?: Partial<Record<string, true>>,
): string[] {
  const found: string[] = [];
  for (const [id, type] of Object.entries(typeOfNodes)) {
    if (hidden?.[id]) continue;
    const location = type.locationInContextMenu ?? [];
    if (location.length <= parentPath.length) continue;
    if (!parentPath.every((segment, index) => location[index] === segment))
      continue;
    const next = location[parentPath.length];
    if (!found.includes(next)) found.push(next);
  }
  return found;
}

export { createNodeContextMenu, menuFolderSuggestions };
export type { CreateNodeContextMenuProps };
