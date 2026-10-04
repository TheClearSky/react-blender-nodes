import { cva } from 'class-variance-authority';

const modalContentVariants = cva(
  'rbn:fixed rbn:left-1/2 rbn:top-1/2 rbn:z-50 rbn:-translate-x-1/2 rbn:-translate-y-1/2 rbn:bg-graph-elevated-surface-bg rbn:border rbn:border-secondary-dark-gray rbn:rounded-lg rbn:shadow-xl rbn:max-h-[85vh] rbn:w-[calc(100%-2rem)] rbn:flex rbn:flex-col rbn:font-main rbn:data-[state=open]:animate-in rbn:data-[state=closed]:animate-out rbn:data-[state=closed]:fade-out-0 rbn:data-[state=open]:fade-in-0 rbn:data-[state=closed]:zoom-out-95 rbn:data-[state=open]:zoom-in-95',
  {
    variants: {
      size: {
        sm: 'rbn:max-w-[360px]',
        md: 'rbn:max-w-[480px]',
        lg: 'rbn:max-w-[640px]',
        // Large, near-viewport modal with a backdrop margin (NOT literally
        // edge-to-edge). Overrides the base w-[calc(100%-2rem)] and the
        // inherited max-width; the base still centers and caps at max-h-[85vh].
        fullscreen: 'rbn:w-[90vw] rbn:h-[85vh] rbn:max-w-none',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export { modalContentVariants };
