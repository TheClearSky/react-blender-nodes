import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/utils/cnHelper';
import { forwardRef, type ComponentProps, type ComponentRef } from 'react';

/**
 * Checkbox component
 *
 * This component is a wrapper around the Radix UI Checkbox component.
 * It adds a few extra styles and a check icon.
 *
 * @param props - The component props
 * @returns JSX element containing the checkbox
 */
type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root> & {
  className?: string;
};

const Checkbox = forwardRef<
  ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, ...props }, ref) => {
  return (
    <CheckboxPrimitive.Root
      data-slot='checkbox'
      className={cn(
        'peer bg-primary-gray border-transparent data-[state=checked]:bg-primary-blue data-[state=checked]:text-primary-white focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-7 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
      ref={ref}
    >
      <CheckboxPrimitive.Indicator
        data-slot='checkbox-indicator'
        className='grid place-content-center text-current transition-none'
      >
        <CheckIcon className='size-6' strokeWidth={3.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };

export type { CheckboxProps };
