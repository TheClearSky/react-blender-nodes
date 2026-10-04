import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/utils/cnHelper';
import { modalContentVariants } from './modalVariants';

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
        'rbn:fixed rbn:inset-0 rbn:z-50 rbn:bg-black/60 rbn:data-[state=open]:animate-in rbn:data-[state=closed]:animate-out rbn:data-[state=closed]:fade-out-0 rbn:data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ModalContent
// ---------------------------------------------------------------------------

type ModalContentProps = React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof modalContentVariants> & {
    /** Extra classes for the dimming overlay behind the dialog (e.g. a theme's `modal.overlay` slot). */
    overlayClassName?: string;
  };

function ModalContent({
  className,
  children,
  size,
  overlayClassName,
  ...props
}: ModalContentProps) {
  return (
    <DialogPrimitive.Portal>
      <ModalOverlay className={overlayClassName} />
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
        'rbn:px-5 rbn:pt-4 rbn:pb-3 rbn:border-b rbn:border-secondary-dark-gray rbn:flex rbn:flex-col rbn:gap-1',
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
        'rbn:text-primary-white rbn:text-[16px] rbn:leading-[16px] rbn:font-main rbn:font-medium',
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
      className={cn(
        'rbn:text-secondary-light-gray rbn:text-sm rbn:font-main',
        className,
      )}
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
      className={cn(
        'rbn:flex-1 rbn:overflow-y-auto rbn:px-5 rbn:py-4',
        className,
      )}
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
        'rbn:px-5 rbn:pb-4 rbn:pt-3 rbn:border-t rbn:border-secondary-dark-gray rbn:flex rbn:gap-2',
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
        'rbn:absolute rbn:right-3 rbn:top-3 rbn:rounded-sm rbn:p-1 rbn:text-secondary-light-gray rbn:hover:text-primary-white rbn:hover:bg-primary-gray rbn:transition-colors rbn:focus:outline-none',
        className,
      )}
    >
      <X className='rbn:w-[18px] rbn:h-[18px]' />
      <span className='rbn:sr-only'>Close</span>
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
};

export type {
  ModalContentProps,
  ModalHeaderProps,
  ModalBodyProps,
  ModalFooterProps,
};
