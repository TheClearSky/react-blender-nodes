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
        'rbn:peer rbn:bg-primary-gray rbn:border-transparent rbn:data-[state=checked]:bg-primary-blue rbn:data-[state=checked]:text-primary-white rbn:focus-visible:border-ring rbn:focus-visible:ring-ring/50 rbn:aria-invalid:ring-destructive/20 rbn:dark:aria-invalid:ring-destructive/40 rbn:aria-invalid:border-destructive rbn:size-7 rbn:shrink-0 rbn:rounded-[4px] rbn:border rbn:shadow-xs rbn:transition-shadow rbn:outline-none rbn:focus-visible:ring-[3px] rbn:disabled:cursor-not-allowed rbn:disabled:opacity-50',
        className,
      )}
      {...props}
      ref={ref}
    >
      <CheckboxPrimitive.Indicator
        data-slot='checkbox-indicator'
        className='rbn:grid rbn:place-content-center rbn:text-current rbn:transition-none'
      >
        <CheckIcon className='rbn:size-6' strokeWidth={3.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };

export type { CheckboxProps };
