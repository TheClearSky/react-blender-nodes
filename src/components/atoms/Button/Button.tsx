import { forwardRef, type ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/utils/cnHelper';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 \
  py-2 px-4 rounded-md transition-all \
  text-[27px] leading-[27px] font-main whitespace-nowrap text-primary-white \
  disabled:cursor-not-allowed outline-none focus-visible:outline-none border',
  {
    variants: {
      color: {
        dark: 'bg-secondary-black border-secondary-dark-gray',
        lightNonPriority: 'bg-primary-gray border-transparent',
        lightPriority: 'bg-primary-gray border-transparent',
        lightParentGroupBasedHover: 'bg-primary-gray border-transparent',
      },
      //Handled in compoundVariants
      applyHoverStyles: {
        true: '',
        false: '',
      },
    },
    defaultVariants: {
      color: 'dark',
      applyHoverStyles: true,
    },
    compoundVariants: [
      {
        color: 'dark',
        applyHoverStyles: true,
        className: 'hover:bg-primary-dark-gray',
      },
      {
        color: 'lightNonPriority',
        applyHoverStyles: true,
        className:
          'hover:bg-secondary-light-gray-as-transparent-overlay-over-primary-gray',
      },

      {
        color: 'lightPriority',
        applyHoverStyles: true,
        className:
          'hover:bg-primary-light-gray-as-transparent-overlay-over-primary-gray',
      },

      {
        color: 'lightParentGroupBasedHover',
        applyHoverStyles: true,
        className:
          'hover:bg-primary-light-gray-as-transparent-overlay-over-primary-gray group-hover/lightParentGroupBasedHover:bg-secondary-light-gray-as-transparent-overlay-over-primary-gray',
      },
    ],
  },
);

/**
 * Props for the Button component
 *
 * Extends the standard button element props with custom styling variants
 * and composition capabilities.
 */
type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Whether to render as a child component using Radix Slot */
    asChild?: boolean;
  };

/**
 * A customizable button component with Blender-inspired styling
 *
 * This button component provides multiple color variants and hover states
 * that match the Blender node editor aesthetic. It supports composition
 * through the asChild prop and includes proper accessibility features.
 *
 * Features:
 * - Multiple color variants (dark, lightNonPriority, lightPriority)
 * - Configurable hover styles
 * - Composition support with Radix Slot
 * - Full TypeScript support
 * - Accessibility features
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the button element
 * @returns JSX element containing the button
 *
 * @example
 * ```tsx
 * // Basic button
 * <Button onClick={handleClick}>Click me</Button>
 *
 * // Button with custom color
 * <Button color="lightPriority" onClick={handleSubmit}>
 *   Submit
 * </Button>
 *
 * // Button as child component
 * <Button asChild>
 *   <Link to="/dashboard">Go to Dashboard</Link>
 * </Button>
 *
 * // Button without hover styles
 * <Button applyHoverStyles={false} disabled>
 *   Disabled Button
 * </Button>
 * ```
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, color, asChild = false, applyHoverStyles, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        data-slot='button'
        className={cn(buttonVariants({ color, className, applyHoverStyles }))}
        {...props}
      />
    );
  },
);

/**
 * To prevent anonymous debug logs
 */
Button.displayName = 'Button';

export { Button };

export type { ButtonProps };
