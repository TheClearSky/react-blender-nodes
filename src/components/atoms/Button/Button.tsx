import { forwardRef, type ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/utils/cnHelper';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 \
  py-2 px-4 rounded-md transition-all \
  text-[27px] leading-[27px] font-main whitespace-nowrap font-medium text-primary-white \
  disabled:cursor-not-allowed outline-none focus-visible:outline-none border',
  {
    variants: {
      color: {
        dark: 'bg-secondary-black border-secondary-dark-gray hover:bg-primary-dark-gray',
        lightNonPriority:
          'bg-primary-gray border-transparent hover:bg-secondary-light-gray',
        lightPriority:
          'bg-primary-gray border-transparent hover:bg-primary-light-gray',
        lightParentGroupBasedHover:
          'bg-primary-gray border-transparent hover:bg-primary-light-gray group-hover/lightParentGroupBasedHover:bg-secondary-light-gray',
      },
    },
    defaultVariants: {
      color: 'dark',
    },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, color, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        data-slot='button'
        className={cn(buttonVariants({ color, className }))}
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
