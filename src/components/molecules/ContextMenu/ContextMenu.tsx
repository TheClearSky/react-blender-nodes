import { cn } from '@/utils';
import { useState, type ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';

type ContextMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  subItems?: ContextMenuItem[];
  onClick?: () => void;
  shortcut?: string;
  separator?: boolean;
};

type ContextMenuProps = {
  subItems: ContextMenuItem[];
  className?: string;
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
    <ul className={cn('min-w-48 bg-[#181818] border border-gray-600 rounded-md shadow-lg py-1', className)}>
      {subItems.map((item, index) => (
        <li key={item.id} className="relative">
          {item.separator && index > 0 && (
            <div className="border-t border-gray-600 my-1" />
          )}
          <div
            className={cn(
              'flex items-center justify-between px-3 py-1.5 text-sm text-primary-white hover:bg-gray-700 cursor-pointer',
              'transition-colors duration-150',
            )}
            onClick={() => handleItemClick(item)}
            onMouseEnter={() => setHoveredItemId(item.id)}
            onMouseLeave={() => setHoveredItemId(null)}
          >
            <div className="flex items-center gap-2">
              {item.icon && <span className="text-gray-400 w-4 h-4 flex items-center justify-center">{item.icon}</span>}
              <span className="text-sm">{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {item.shortcut && (
                <span className="text-xs text-gray-400 font-mono">{item.shortcut}</span>
              )}
              {item.subItems && item.subItems.length > 0 && (
                <ChevronRightIcon className="w-3 h-3 text-gray-400" />
              )}
            </div>
          </div>
          
          {/* Submenu */}
          {item.subItems && item.subItems.length > 0 && hoveredItemId === item.id && (
            <div 
              className="absolute left-full top-0 z-50"
              onMouseEnter={() => setHoveredItemId(item.id)}
              onMouseLeave={() => setHoveredItemId(null)}
            >
              <ContextMenuSubmenu
                subItems={item.subItems}
                onItemClick={onItemClick}
                className="ml-1"
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

export const ContextMenu = ({ subItems, className, onItemClick }: ContextMenuProps) => {
  return (
    <div className={cn('relative', className)}>
      <ContextMenuSubmenu subItems={subItems} onItemClick={onItemClick} />
    </div>
  );
};

export type { ContextMenuItem, ContextMenuProps };
