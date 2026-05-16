import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/utils/cnHelper';

// ---------------------------------------------------------------------------
// Modal (root)
// ---------------------------------------------------------------------------

function Modal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot='modal' {...props} />;
}

// ---------------------------------------------------------------------------
// ModalTrigger
// ---------------------------------------------------------------------------

function ModalTrigger({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return (
    <DialogPrimitive.Trigger
      data-slot='modal-trigger'
      className={cn(className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ModalOverlay
// ---------------------------------------------------------------------------

function ModalOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot='modal-overlay'
      className={cn(
        'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ModalContent
// ---------------------------------------------------------------------------

const modalContentVariants = cva(
  'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-[#222222] border border-secondary-dark-gray rounded-lg shadow-xl max-h-[85vh] w-[calc(100%-2rem)] flex flex-col font-main data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
  {
    variants: {
      size: {
        sm: 'max-w-[360px]',
        md: 'max-w-[480px]',
        lg: 'max-w-[640px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

type ModalContentProps = React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof modalContentVariants>;

function ModalContent({
  className,
  children,
  size,
  ...props
}: ModalContentProps) {
  return (
    <DialogPrimitive.Portal>
      <ModalOverlay />
      <DialogPrimitive.Content
        data-slot='modal-content'
        className={cn(modalContentVariants({ size }), className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ---------------------------------------------------------------------------
// ModalHeader
// ---------------------------------------------------------------------------

type ModalHeaderProps = {
  children: React.ReactNode;
  className?: string;
};

function ModalHeader({ children, className }: ModalHeaderProps) {
  return (
    <div
      data-slot='modal-header'
      className={cn(
        'px-5 pt-4 pb-3 border-b border-secondary-dark-gray flex flex-col gap-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModalTitle
// ---------------------------------------------------------------------------

function ModalTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot='modal-title'
      className={cn(
        'text-primary-white text-[16px] leading-[16px] font-main font-medium',
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ModalDescription
// ---------------------------------------------------------------------------

function ModalDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot='modal-description'
      className={cn('text-secondary-light-gray text-sm font-main', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ModalBody
// ---------------------------------------------------------------------------

type ModalBodyProps = {
  children: React.ReactNode;
  className?: string;
};

function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div
      data-slot='modal-body'
      className={cn('flex-1 overflow-y-auto px-5 py-4', className)}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModalFooter
// ---------------------------------------------------------------------------

const footerAlignMap = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
} as const;

type ModalFooterProps = {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
};

function ModalFooter({
  children,
  className,
  align = 'right',
}: ModalFooterProps) {
  return (
    <div
      data-slot='modal-footer'
      className={cn(
        'px-5 pb-4 pt-3 border-t border-secondary-dark-gray flex gap-2',
        footerAlignMap[align],
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModalClose
// ---------------------------------------------------------------------------

function ModalClose({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      data-slot='modal-close'
      className={cn(className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ModalCloseButton — convenience X button for the top-right corner
// ---------------------------------------------------------------------------

function ModalCloseButton({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close
      data-slot='modal-close-button'
      className={cn(
        'absolute right-3 top-3 rounded-sm p-1 text-secondary-light-gray hover:text-primary-white hover:bg-primary-gray transition-colors focus:outline-none',
        className,
      )}
    >
      <X className='w-[18px] h-[18px]' />
      <span className='sr-only'>Close</span>
    </DialogPrimitive.Close>
  );
}

export {
  Modal,
  ModalTrigger,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalClose,
  ModalCloseButton,
  modalContentVariants,
};

export type {
  ModalContentProps,
  ModalHeaderProps,
  ModalBodyProps,
  ModalFooterProps,
};
