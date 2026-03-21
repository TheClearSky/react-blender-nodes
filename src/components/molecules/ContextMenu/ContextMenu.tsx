import { cn } from '@/utils';
import { type ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { FloatingPortal } from '@floating-ui/react';
import { useSubmenuManager } from './useSubmenuManager';

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

/**
 * Simple menu item row — no floating UI, no submenu rendering.
 * Reports hover to the parent ContextMenuSubmenu which owns the shared submenu.
 */
const ContextMenuItemComponent = ({
  item,
  index,
  onItemClick,
  onHover,
  itemRef,
  itemTransitionStyle,
}: {
  item: ContextMenuItem;
  index: number;
  onItemClick: (item: ContextMenuItem) => void;
  onHover: (itemId: string | null) => void;
  itemRef: (el: HTMLDivElement | null) => void;
  itemTransitionStyle?: React.CSSProperties;
}) => {
  const hasSubItems = item.subItems && item.subItems.length > 0;

  return (
    <li className='relative'>
      {item.separator && index > 0 && (
        <div className='border-t border-gray-600 m-0' />
      )}
      <div
        ref={itemRef}
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-1.25 hover:bg-[#3F3F3F] cursor-pointer',
          'transition-colors duration-150',
        )}
        style={itemTransitionStyle}
        onClick={() => onItemClick(item)}
        onMouseEnter={() => onHover(hasSubItems ? item.id : null)}
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
          {hasSubItems && (
            <ChevronRightIcon className='w-3 h-3 text-gray-400' />
          )}
        </div>
      </div>
    </li>
  );
};

/**
 * Renders a list of menu items + manages a single shared floating submenu
 * for whichever item is currently hovered.
 *
 * @param bare - When true, the <ul> has no visual styling (bg/shadow/rounded).
 *   Used when rendered inside the floating panel which already provides styling.
 */
const ContextMenuSubmenu = ({
  subItems,
  onItemClick,
  className,
  bare = false,
  itemTransitionStyle,
}: {
  subItems: ContextMenuItem[];
  onItemClick?: (item: ContextMenuItem) => void;
  className?: string;
  bare?: boolean;
  itemTransitionStyle?: React.CSSProperties;
}) => {
  const {
    activeSubItems,
    prevSubItems,
    exitSubItems,
    crossfadePhase,
    isSwitching,
    isOpen,
    panelSizeStyles,
    incomingRef,
    floatingRefs,
    floatingStyles,
    placement,
    handleItemClick,
    handleHover,
    handleFloatingMouseEnter,
    handleFloatingMouseLeave,
    handleListMouseLeave,
    makeItemRef,
    SUBMENU_DURATION_MS,
    CONTENT_FADE_DURATION_MS,
  } = useSubmenuManager(subItems, onItemClick);

  const hasAnySubItems = subItems.some(
    (item) => item.subItems && item.subItems.length > 0,
  );

  return (
    <>
      <ul
        className={cn(
          'min-w-48 py-1',
          !bare && 'bg-[#181818] border border-none rounded-md shadow-lg',
          className,
        )}
        onMouseLeave={handleListMouseLeave}
      >
        {subItems.map((item, index) => (
          <ContextMenuItemComponent
            key={item.id}
            item={item}
            index={index}
            onItemClick={handleItemClick}
            onHover={handleHover}
            itemRef={makeItemRef(item.id)}
            itemTransitionStyle={itemTransitionStyle}
          />
        ))}
      </ul>

      {/* Shared floating submenu — portaled to body so it escapes overflow:hidden */}
      {hasAnySubItems && (
        <FloatingPortal>
          <div
            ref={floatingRefs.setFloating}
            style={{
              ...floatingStyles,
              transitionProperty: isSwitching
                ? 'opacity, transform, translate'
                : 'opacity, translate',
              transitionDuration: `${SUBMENU_DURATION_MS}ms`,
              transitionTimingFunction: 'ease-out',
            }}
            className={cn(
              'z-50',
              isOpen
                ? 'opacity-100 translate-x-0'
                : cn(
                    'opacity-0 pointer-events-none',
                    placement.startsWith('right')
                      ? '-translate-x-[20px]'
                      : 'translate-x-[20px]',
                  ),
            )}
            onMouseEnter={handleFloatingMouseEnter}
            onMouseLeave={handleFloatingMouseLeave}
          >
            {/* Visual panel — has bg, rounded corners, shadow, animated size + overflow clip */}
            <div
              className='bg-[#181818] rounded-md shadow-lg ml-1'
              style={{
                ...panelSizeStyles,
                transitionProperty: 'opacity, translate, width, height',
                transitionDuration: `${SUBMENU_DURATION_MS}ms`,
                transitionTimingFunction: 'ease-out',
              }}
            >
              {/* Crossfade wrapper */}
              <div className='relative'>
                {/* Outgoing layer (fading out via per-item opacity) */}
                {crossfadePhase !== null && prevSubItems && (
                  <div
                    className='absolute inset-0'
                    style={{ pointerEvents: 'none' }}
                  >
                    <ContextMenuSubmenu
                      subItems={prevSubItems}
                      onItemClick={onItemClick}
                      bare
                      itemTransitionStyle={
                        crossfadePhase === 'initial'
                          ? { opacity: 1, transform: 'translateX(0)' }
                          : {
                              opacity: 0,
                              transform: 'translateX(10%)',
                              transition: `opacity ${CONTENT_FADE_DURATION_MS}ms ease-out, transform ${CONTENT_FADE_DURATION_MS}ms ease-out`,
                            }
                      }
                    />
                  </div>
                )}

                {/* Incoming layer (fading in via per-item opacity, provides size) */}
                {activeSubItems && (
                  <div ref={incomingRef}>
                    <ContextMenuSubmenu
                      subItems={activeSubItems}
                      onItemClick={onItemClick}
                      bare
                      itemTransitionStyle={
                        crossfadePhase === 'initial'
                          ? { opacity: 0, transform: 'translateX(-10%)' }
                          : crossfadePhase === 'animating'
                            ? {
                                opacity: 1,
                                transform: 'translateX(0)',
                                transition: `opacity ${CONTENT_FADE_DURATION_MS}ms ease-out, transform ${CONTENT_FADE_DURATION_MS}ms ease-out`,
                              }
                            : undefined
                      }
                    />
                  </div>
                )}

                {/* Exit layer — keeps last content visible during slide-out */}
                {!activeSubItems && exitSubItems && (
                  <ContextMenuSubmenu
                    subItems={exitSubItems}
                    onItemClick={onItemClick}
                    bare
                  />
                )}
              </div>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
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
