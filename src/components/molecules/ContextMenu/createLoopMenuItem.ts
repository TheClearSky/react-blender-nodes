import { createElement, type ActionDispatch } from 'react';
import { RepeatIcon } from 'lucide-react';
import type { ContextMenuItem } from './ContextMenu';
import {
  actionTypesMap,
  type Action,
} from '@/utils/nodeStateManagement/mainReducer';
import type { SupportedUnderlyingTypes } from '@/utils/nodeStateManagement/types';
import type { XYPosition } from '@xyflow/react';
import type { z } from 'zod';

type CreateLoopMenuItemProps<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
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
};

function createLoopMenuItem<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  dispatch,
  setContextMenu,
  contextMenuPosition,
}: CreateLoopMenuItemProps<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>): ContextMenuItem[] {
  return [
    {
      id: 'add-loop',
      label: 'Add Loop',
      icon: createElement(RepeatIcon, { className: 'w-4 h-4' }),
      onClick: () => {
        dispatch({
          type: actionTypesMap.ADD_LOOP,
          payload: { position: contextMenuPosition },
        });
        setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
      },
    },
  ];
}

export { createLoopMenuItem };
