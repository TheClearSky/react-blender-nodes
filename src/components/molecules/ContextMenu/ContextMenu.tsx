import { cn } from '@/utils';
import { useState, type ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';

/**
 * Configuration for a context menu item
 *
 * Defines a single item in the context menu with optional submenu, icon, and actions.
 * Supports nested submenus for hierarchical menu structures.
 */
type ContextMenuItem = {
  /** Unique identifier for the menu item */
  id: string;
  /** Display text for the menu item */
  label: string;
  /** Optional icon to display next to the label */
  icon?: ReactNode;
  /** Optional array of submenu items for nested menus */
  subItems?: ContextMenuItem[];
  /** Callback function when the item is clicked */
  onClick?: () => void;
  /** Optional keyboard shortcut text to display */
  shortcut?: string;
  /** Whether to show a separator line before this item */
  separator?: boolean;
};

/**
 * Props for the ContextMenu component
 */
type ContextMenuProps = {
  /** Array of menu items to display */
  subItems: ContextMenuItem[];
  /** Additional CSS classes */
  className?: string;
  /** Optional callback when any item is clicked */
  onItemClick?: (item: ContextMenuItem) => void;
};

const ContextMenuSubmenu = ({
  subItems,
  onItemClick,
  className,
}: {
  subItems: ContextMenuItem[];
  onItemClick?: (item: ContextMenuItem) => void;
  className?: string;
}) => {
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.onClick) {
      item.onClick();
    }
    if (onItemClick) {
      onItemClick(item);
    }
  };

  return (
    <ul
      className={cn(
        'min-w-48 bg-[#181818] border border-none rounded-md shadow-lg py-1',
        className,
      )}
    >
      {subItems.map((item, index) => (
        <li key={item.id} className='relative'>
          {item.separator && index > 0 && (
            <div className='border-t border-gray-600 m-0' />
          )}
          <div
            className={cn(
              'flex items-center justify-between gap-2 px-3 py-1.25 hover:bg-[#3F3F3F] cursor-pointer',
              'transition-colors duration-150',
            )}
            onClick={() => handleItemClick(item)}
            onMouseEnter={() => setHoveredItemId(item.id)}
            onMouseLeave={() => setHoveredItemId(null)}
          >
            <div className='flex items-center gap-2'>
              {item.icon && (
                <span className='text-primary-white w-3 h-3 flex items-center justify-center'>
                  {item.icon}
                </span>
              )}
              <span className='text-sm leading-3.5 text-primary-white font-main'>
                {item.label}
              </span>
            </div>
            <div className='flex items-center gap-2'>
              {item.shortcut && (
                <span className='text-sm leading-3.5 text-gray-400 font-mono'>
                  {item.shortcut}
                </span>
              )}
              {item.subItems && item.subItems.length > 0 && (
                <ChevronRightIcon className='w-3 h-3 text-gray-400' />
              )}
            </div>
          </div>

          {/* Submenu */}
          {item.subItems &&
            item.subItems.length > 0 &&
            hoveredItemId === item.id && (
              <div
                className='absolute left-full top-0 z-50'
                onMouseEnter={() => setHoveredItemId(item.id)}
                onMouseLeave={() => setHoveredItemId(null)}
              >
                <ContextMenuSubmenu
                  subItems={item.subItems}
                  onItemClick={onItemClick}
                  className='ml-1'
                />
              </div>
            )}
        </li>
      ))}
    </ul>
  );
};

/**
 * A context menu component with nested submenu support
 *
 * This component provides a hierarchical context menu system with support for
 * nested submenus, icons, keyboard shortcuts, and separators. It features
 * hover-based submenu activation and Blender-inspired dark theme styling.
 *
 * Features:
 * - Nested submenu support with unlimited depth
 * - Icon and keyboard shortcut display
 * - Separator lines for visual grouping
 * - Hover-based submenu activation
 * - Dark theme styling matching Blender's aesthetic
 * - TypeScript support with full type safety
 *
 * @param props - The component props
 * @returns JSX element containing the context menu
 *
 * @example
 * ```tsx
 * // Basic context menu
 * <ContextMenu
 *   subItems={[
 *     {
 *       id: 'copy',
 *       label: 'Copy',
 *       icon: <CopyIcon className="w-4 h-4" />,
 *       shortcut: 'Ctrl+C',
 *       onClick: () => handleCopy(),
 *     },
 *     {
 *       id: 'paste',
 *       label: 'Paste',
 *       icon: <PasteIcon className="w-4 h-4" />,
 *       shortcut: 'Ctrl+V',
 *       onClick: () => handlePaste(),
 *       separator: true,
 *     },
 *   ]}
 * />
 *
 * // Nested submenu
 * <ContextMenu
 *   subItems={[
 *     {
 *       id: 'edit',
 *       label: 'Edit',
 *       icon: <EditIcon className="w-4 h-4" />,
 *       subItems: [
 *         {
 *           id: 'cut',
 *           label: 'Cut',
 *           onClick: () => handleCut(),
 *         },
 *         {
 *           id: 'copy',
 *           label: 'Copy',
 *           onClick: () => handleCopy(),
 *         },
 *         {
 *           id: 'paste',
 *           label: 'Paste',
 *           onClick: () => handlePaste(),
 *         },
 *       ],
 *     },
 *   ]}
 * />
 * ```
 */
export const ContextMenu = ({
  subItems,
  className,
  onItemClick,
}: ContextMenuProps) => {
  return (
    <div className={cn('relative', className)}>
      <ContextMenuSubmenu subItems={subItems} onItemClick={onItemClick} />
    </div>
  );
};

export type { ContextMenuItem, ContextMenuProps };
