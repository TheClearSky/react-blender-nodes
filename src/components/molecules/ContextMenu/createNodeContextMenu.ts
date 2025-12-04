import { PlusIcon } from 'lucide-react';
import { createElement, type ActionDispatch } from 'react';
import type { ContextMenuItem } from './ContextMenu';
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

type CreateNodeContextMenuProps<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? any
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
};

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
}: CreateNodeContextMenuProps<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>): ContextMenuItem[] {
  // Get all node type names and create menu items, also preserve the type of the keys
  const nodeTypeKeys = Object.keys(typeOfNodes) as Array<
    keyof typeof typeOfNodes
  >;

  if (nodeTypeKeys.length === 0) {
    return [];
  }

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
  );

  const nodeSubItems: ContextMenuItem[] = filteredNodeTypeKeys.map(
    (nodeTypeId) => ({
      id: `add-${nodeTypeId}`,
      label: typeOfNodes[nodeTypeId].name,
      onClick: () => {
        // Dispatch the ADD_NODE action
        dispatch({
          type: actionTypesMap.ADD_NODE_AND_SELECT,
          payload: {
            type: nodeTypeId,
            position: contextMenuPosition,
          },
        });

        // Close the context menu
        setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
      },
    }),
  );

  return [
    {
      id: 'add-node',
      label: 'Add Node',
      icon: createElement(PlusIcon, { className: 'w-4 h-4' }),
      subItems: nodeSubItems,
    },
  ];
}

export { createNodeContextMenu };
export type { CreateNodeContextMenuProps };
