import { forwardRef, type ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/utils/cnHelper';

const buttonVariants = cva(
  'rbn:inline-flex rbn:items-center rbn:justify-center rbn:gap-2 rbn:cursor-pointer \
  rbn:rounded-md rbn:transition-all \
  rbn:font-main rbn:whitespace-nowrap rbn:text-primary-white \
  rbn:disabled:cursor-not-allowed rbn:disabled:bg-secondary-dark-gray rbn:disabled:opacity-50 rbn:outline-none rbn:focus-visible:outline-none rbn:border',
  {
    variants: {
      color: {
        dark: 'rbn:bg-secondary-black rbn:border-secondary-dark-gray',
        lightNonPriority: 'rbn:bg-primary-gray rbn:border-transparent',
        lightPriority: 'rbn:bg-primary-gray rbn:border-transparent',
        lightParentGroupBasedHover:
          'rbn:bg-primary-gray rbn:border-transparent',
      },
      //Handled in compoundVariants
      applyHoverStyles: {
        true: '',
        false: '',
      },
      size: {
        normal: 'rbn:py-2 rbn:px-4 rbn:text-[27px] rbn:leading-[27px]',
        small:
          'rbn:py-2 rbn:px-3 rbn:text-[16px] rbn:leading-[13px] rbn:rounded-sm',
      },
    },
    defaultVariants: {
      color: 'dark',
      applyHoverStyles: true,
      size: 'normal',
    },
    compoundVariants: [
      {
        color: 'dark',
        applyHoverStyles: true,
        className: 'rbn:hover:bg-primary-dark-gray',
      },
      {
        color: 'lightNonPriority',
        applyHoverStyles: true,
        className:
          'rbn:hover:bg-secondary-light-gray-as-transparent-overlay-over-primary-gray',
      },

      {
        color: 'lightPriority',
        applyHoverStyles: true,
        className:
          'rbn:hover:bg-primary-light-gray-as-transparent-overlay-over-primary-gray',
      },

      {
        color: 'lightParentGroupBasedHover',
        applyHoverStyles: true,
        className:
          'rbn:hover:bg-primary-light-gray-as-transparent-overlay-over-primary-gray rbn:group-hover/lightParentGroupBasedHover:bg-secondary-light-gray-as-transparent-overlay-over-primary-gray',
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
  (
    { className, color, size, asChild = false, applyHoverStyles, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        data-slot='button'
        className={cn(
          buttonVariants({ color, size, className, applyHoverStyles }),
        )}
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
