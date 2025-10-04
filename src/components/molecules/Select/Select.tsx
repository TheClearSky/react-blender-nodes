import * as SelectPrimitive from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

import { cn } from '@/utils/cnHelper';
import { forwardRef, type ComponentRef } from 'react';

/**
 * Root Select component that provides context for all sub-components
 *
 * This component manages the overall state and provides context for all
 * Select sub-components. It supports both controlled and uncontrolled usage
 * with proper accessibility features.
 *
 * @param props - The component props
 * @returns JSX element containing the select context
 */
const Select = SelectPrimitive.Root;

/**
 * Props for the SelectTrigger component
 */
type SelectTriggerProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Trigger
>;

/**
 * The trigger button that opens the select dropdown
 *
 * This component renders the button that users click to open the select dropdown.
 * It displays the currently selected value or placeholder text and includes
 * proper accessibility attributes.
 *
 * Features:
 * - Displays selected value or placeholder
 * - Keyboard navigation support
 * - Blender-inspired dark theme styling
 * - Proper ARIA attributes
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the button element
 * @returns JSX element containing the select trigger
 *
 * @example
 * ```tsx
 * <SelectTrigger className="w-[180px]">
 *   <SelectValue placeholder="Select a fruit" />
 * </SelectTrigger>
 * ```
 */
const SelectTrigger = forwardRef<
  ComponentRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-[44px] w-full items-center justify-between rounded-md border \
      border-secondary-dark-gray bg-primary-black px-4 py-2 text-[27px] \
      leading-[27px] font-main text-primary-white data-[placeholder]:text-[#6B6B6B] \
      focus:outline-none focus-visible:ring-1 \
    focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <span className='text-left truncate'>{children}</span>
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className='h-6 w-6 shrink-0 ml-2' />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));

SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

/**
 * Props for the SelectScrollUpButton component
 */
type SelectScrollUpButtonProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.ScrollUpButton
>;

/**
 * Button for scrolling up in the select content when there are many options
 *
 * This component provides a scroll up button that appears when the select
 * content is scrollable and the user has scrolled down.
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the button element
 * @returns JSX element containing the scroll up button
 */
const SelectScrollUpButton = forwardRef<
  ComponentRef<typeof SelectPrimitive.ScrollUpButton>,
  SelectScrollUpButtonProps
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className,
    )}
    {...props}
  >
    <ChevronUpIcon className='h-4 w-4' />
  </SelectPrimitive.ScrollUpButton>
));

SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

/**
 * Props for the SelectScrollDownButton component
 */
type SelectScrollDownButtonProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.ScrollDownButton
>;

/**
 * Button for scrolling down in the select content when there are many options
 *
 * This component provides a scroll down button that appears when the select
 * content is scrollable and there are more options below.
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the button element
 * @returns JSX element containing the scroll down button
 */
const SelectScrollDownButton = forwardRef<
  ComponentRef<typeof SelectPrimitive.ScrollDownButton>,
  SelectScrollDownButtonProps
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className,
    )}
    {...props}
  >
    <ChevronDownIcon className='h-4 w-4' />
  </SelectPrimitive.ScrollDownButton>
));

SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

/**
 * Props for the SelectContent component
 */
type SelectContentProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Content
>;

/**
 * The dropdown content container that holds all select options
 *
 * This component renders the dropdown panel that contains all the selectable
 * options. It includes proper positioning, scrolling, and keyboard navigation
 * support with Blender-inspired styling.
 *
 * Features:
 * - Automatic positioning and collision detection
 * - Scrollable content with scroll indicators
 * - Keyboard navigation support
 * - Blender-inspired dark theme styling
 * - Proper focus management
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the content element
 * @returns JSX element containing the select content
 *
 * @example
 * ```tsx
 * <SelectContent>
 *   <SelectGroup>
 *     <SelectLabel>Fruits</SelectLabel>
 *     <SelectItem value="apple">Apple</SelectItem>
 *     <SelectItem value="banana">Banana</SelectItem>
 *   </SelectGroup>
 * </SelectContent>
 * ```
 */
const SelectContent = forwardRef<
  ComponentRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-secondary-dark-gray bg-[#181818] text-primary-white shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));

SelectContent.displayName = SelectPrimitive.Content.displayName;

/**
 * Props for the SelectLabel component
 */
type SelectLabelProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Label
>;

/**
 * Label component for grouping select options
 *
 * This component provides a label for grouping related select options.
 * It's typically used within a SelectGroup to create visual separation
 * and organization of options.
 *
 * Features:
 * - Semantic grouping of options
 * - Blender-inspired styling
 * - Proper accessibility attributes
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the label element
 * @returns JSX element containing the select label
 *
 * @example
 * ```tsx
 * <SelectGroup>
 *   <SelectLabel>Fruits</SelectLabel>
 *   <SelectItem value="apple">Apple</SelectItem>
 *   <SelectItem value="banana">Banana</SelectItem>
 * </SelectGroup>
 * ```
 */
const SelectLabel = forwardRef<
  ComponentRef<typeof SelectPrimitive.Label>,
  SelectLabelProps
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      'py-1.5 px-2 text-[27px] leading-[27px] font-main font-semibold text-primary-white',
      className,
    )}
    {...props}
  />
));

SelectLabel.displayName = SelectPrimitive.Label.displayName;

/**
 * Props for the SelectItem component
 */
type SelectItemProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Item
>;

/**
 * Individual selectable option within the select dropdown
 *
 * This component represents a single selectable option within the select
 * dropdown. It includes hover states, selection indicators, and proper
 * keyboard navigation support.
 *
 * Features:
 * - Hover and focus states
 * - Selection indicator (checkmark)
 * - Keyboard navigation support
 * - Blender-inspired styling
 * - Proper accessibility attributes
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the item element
 * @returns JSX element containing the select item
 *
 * @example
 * ```tsx
 * <SelectItem value="apple">Apple</SelectItem>
 * <SelectItem value="banana">Banana</SelectItem>
 * ```
 */
const SelectItem = forwardRef<
  ComponentRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none \
      items-center rounded-sm py-1.5 pl-4 pr-2 text-[27px] \
      leading-[27px] font-main text-primary-white outline-none \
      focus:bg-[#3F3F3F] focus:text-primary-white \
      data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className='ml-auto'>
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className='h-5 w-5 ml-2 mr-1' strokeWidth={2.5} />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
));

SelectItem.displayName = SelectPrimitive.Item.displayName;

/**
 * Props for the SelectSeparator component
 */
type SelectSeparatorProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Separator
>;

/**
 * Visual separator between groups of select options
 *
 * This component provides a visual separator line between different groups
 * of select options, helping to organize and visually separate related items.
 *
 * Features:
 * - Visual separation between option groups
 * - Blender-inspired styling
 * - Proper accessibility attributes
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the separator element
 * @returns JSX element containing the select separator
 *
 * @example
 * ```tsx
 * <SelectItem value="apple">Apple</SelectItem>
 * <SelectSeparator />
 * <SelectItem value="orange">Orange</SelectItem>
 * ```
 */
const SelectSeparator = forwardRef<
  ComponentRef<typeof SelectPrimitive.Separator>,
  SelectSeparatorProps
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-secondary-dark-gray', className)}
    {...props}
  />
));

SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

/**
 * Container for grouping related select options with optional labels
 *
 * This component provides a semantic container for grouping related select
 * options. It can include a SelectLabel for the group and helps organize
 * options logically.
 *
 * Features:
 * - Semantic grouping of options
 * - Optional group labels
 * - Proper accessibility structure
 * - Blender-inspired styling
 *
 * @param props - The component props
 * @returns JSX element containing the select group
 *
 * @example
 * ```tsx
 * <SelectGroup>
 *   <SelectLabel>Fruits</SelectLabel>
 *   <SelectItem value="apple">Apple</SelectItem>
 *   <SelectItem value="banana">Banana</SelectItem>
 * </SelectGroup>
 * ```
 */
const SelectGroup = SelectPrimitive.Group;

/**
 * Props for the SelectValue component
 */
type SelectValueProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Value
>;

/**
 * Component that displays the currently selected value or placeholder
 *
 * This component is used within SelectTrigger to display the currently
 * selected value or a placeholder when no value is selected. It provides
 * proper text handling and accessibility.
 *
 * Features:
 * - Displays selected value or placeholder
 * - Proper text truncation
 * - Accessibility support
 * - Blender-inspired styling
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the value element
 * @returns JSX element containing the select value
 *
 * @example
 * ```tsx
 * <SelectTrigger>
 *   <SelectValue placeholder="Select a fruit" />
 * </SelectTrigger>
 * ```
 */
const SelectValue = forwardRef<
  ComponentRef<typeof SelectPrimitive.Value>,
  SelectValueProps
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Value ref={ref} className={cn(className)} {...props} />
));

SelectValue.displayName = SelectPrimitive.Value.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};

export type {
  SelectTriggerProps,
  SelectContentProps,
  SelectLabelProps,
  SelectItemProps,
  SelectSeparatorProps,
  SelectScrollUpButtonProps,
  SelectScrollDownButtonProps,
  SelectValueProps,
};
