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

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

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
