import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Accordion as AccordionPrimitive } from 'radix-ui';

import { cn } from '@/utils/cnHelper';

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot='accordion' {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot='accordion-item'
      className={cn(
        'rbn:border-b rbn:border-secondary-dark-gray rbn:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className='rbn:flex'>
      <AccordionPrimitive.Trigger
        data-slot='accordion-trigger'
        className={cn(
          'rbn:flex rbn:flex-1 rbn:items-center rbn:gap-2 rbn:rounded-md rbn:py-2.5 rbn:px-4 rbn:text-left rbn:text-sm rbn:font-medium rbn:transition-all rbn:outline-none rbn:bg-runner-section-header-bg rbn:text-primary-white rbn:hover:no-underline rbn:focus-visible:ring-[3px] rbn:focus-visible:ring-ring/50 rbn:disabled:pointer-events-none rbn:disabled:opacity-50 rbn:[&[data-state=open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        <ChevronDownIcon
          className='rbn:pointer-events-none rbn:size-4 rbn:shrink-0 rbn:text-secondary-light-gray rbn:transition-transform rbn:duration-200'
          strokeWidth={3}
        />
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot='accordion-content'
      className='rbn:overflow-hidden rbn:text-sm rbn:data-[state=closed]:animate-accordion-up rbn:data-[state=open]:animate-accordion-down'
      {...props}
    >
      <div className={cn('rbn:pt-0 rbn:pb-4', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
