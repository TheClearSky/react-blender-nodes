import { createElement, type ActionDispatch } from 'react';
import {
  SquareDashedIcon,
  PlusIcon,
  MinusIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ContextMenuItem } from './ContextMenu';
import {
  actionTypesMap,
  type Action,
} from '@/utils/nodeStateManagement/mainReducer';
import type { SupportedUnderlyingTypes } from '@/utils/nodeStateManagement/types';
import type { Zone } from '@/utils/nodeStateManagement/zones/types';
import type { XYPosition } from '@xyflow/react';
import type { z } from 'zod';

type CreateUserZoneMenuItemProps<
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
  /** IDs of the nodes selected at menu-open time (snapshot — see FullGraph). */
  selectedNodeIds: string[];
  /** User zones in the CURRENT scope (root or open group subtree). */
  userZones: Record<string, Zone>;
};

/**
 * Context-menu items for user-defined zones:
 * - "Create Zone from Selection" (only when ≥1 node is selected),
 * - "Add / Remove Selection to/from Zone" submenus (when zones exist + a selection),
 * - a "Delete Zone" submenu listing every zone in scope (an always-reachable delete
 *   even if a zone's label is degenerate or occluded — PC-9).
 *
 * Returns an empty array when there is nothing to offer (no selection, no zones).
 */
function createUserZoneMenuItem<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  dispatch,
  setContextMenu,
  selectedNodeIds,
  userZones,
}: CreateUserZoneMenuItemProps<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>): ContextMenuItem[] {
  const close = () =>
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
  const zones = Object.values(userZones);
  const hasSelection = selectedNodeIds.length > 0;
  const zoneLabel = (zone: Zone): string =>
    typeof zone.name === 'string' && zone.name ? zone.name : 'Zone';
  // A color dot per zone entry so same-named zones stay distinguishable
  // (runtime zone color ⇒ inline style, per the styling rules).
  const zoneDotIcon = (zone: Zone) =>
    createElement('span', {
      className: 'inline-block h-2.5 w-2.5 rounded-full',
      style: { backgroundColor: zone.color },
    });

  const items: ContextMenuItem[] = [];

  if (hasSelection) {
    items.push({
      id: 'create-user-zone',
      label: 'Create Zone from Selection',
      icon: createElement(SquareDashedIcon, { className: 'w-4 h-4' }),
      onClick: () => {
        dispatch({
          type: actionTypesMap.ADD_USER_ZONE,
          payload: { nodeIds: selectedNodeIds },
        });
        close();
      },
    });
  }

  if (hasSelection && zones.length > 0) {
    items.push({
      id: 'add-selection-to-user-zone',
      label: 'Add Selection to Zone',
      icon: createElement(PlusIcon, { className: 'w-4 h-4' }),
      subItems: zones.map((zone) => ({
        id: `add-to-user-zone-${zone.id}`,
        label: zoneLabel(zone),
        icon: zoneDotIcon(zone),
        onClick: () => {
          dispatch({
            type: actionTypesMap.UPDATE_USER_ZONE_MEMBERS,
            payload: { zoneId: zone.id, nodeIds: selectedNodeIds, mode: 'add' },
          });
          close();
        },
      })),
    });
    items.push({
      id: 'remove-selection-from-user-zone',
      label: 'Remove Selection from Zone',
      icon: createElement(MinusIcon, { className: 'w-4 h-4' }),
      subItems: zones.map((zone) => ({
        id: `remove-from-user-zone-${zone.id}`,
        label: zoneLabel(zone),
        icon: zoneDotIcon(zone),
        onClick: () => {
          dispatch({
            type: actionTypesMap.UPDATE_USER_ZONE_MEMBERS,
            payload: {
              zoneId: zone.id,
              nodeIds: selectedNodeIds,
              mode: 'remove',
            },
          });
          close();
        },
      })),
    });
  }

  if (zones.length > 0) {
    items.push({
      id: 'delete-user-zone',
      label: 'Delete Zone',
      icon: createElement(Trash2Icon, { className: 'w-4 h-4' }),
      subItems: zones.map((zone) => ({
        id: `delete-user-zone-${zone.id}`,
        label: zoneLabel(zone),
        icon: zoneDotIcon(zone),
        onClick: () => {
          dispatch({
            type: actionTypesMap.DELETE_USER_ZONE,
            payload: { zoneId: zone.id },
          });
          close();
        },
      })),
    });
  }

  return items;
}

export { createUserZoneMenuItem };
