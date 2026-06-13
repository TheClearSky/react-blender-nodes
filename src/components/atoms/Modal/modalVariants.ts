import { cva } from 'class-variance-authority';

const modalContentVariants = cva(
  'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-graph-elevated-surface-bg border border-secondary-dark-gray rounded-lg shadow-xl max-h-[85vh] w-[calc(100%-2rem)] flex flex-col font-main data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
  {
    variants: {
      size: {
        sm: 'max-w-[360px]',
        md: 'max-w-[480px]',
        lg: 'max-w-[640px]',
        // Large, near-viewport modal with a backdrop margin (NOT literally
        // edge-to-edge). Overrides the base w-[calc(100%-2rem)] and the
        // inherited max-width; the base still centers and caps at max-h-[85vh].
        fullscreen: 'w-[90vw] h-[85vh] max-w-none',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export { modalContentVariants };
