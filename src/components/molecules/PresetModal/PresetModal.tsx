import type { ComponentProps, ReactNode } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  type ModalContentProps,
} from '@/components/atoms';
import { Button } from '@/components/atoms';

type PresetModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  buttonProps?: ComponentProps<typeof Button>[];
  footerAlign?: 'left' | 'center' | 'right';
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  size?: ModalContentProps['size'];
  className?: string;
};

function PresetModal({
  open,
  onOpenChange,
  title,
  description,
  buttonProps,
  footerAlign = 'right',
  header,
  footer,
  children,
  size,
  className,
}: PresetModalProps) {
  const showDefaultHeader =
    header === undefined && (title !== undefined || description !== undefined);
  const showDefaultFooter =
    footer === undefined && buttonProps !== undefined && buttonProps.length > 0;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size={size} className={className}>
        {header !== undefined ? (
          header
        ) : showDefaultHeader ? (
          <ModalHeader>
            {title !== undefined && <ModalTitle>{title}</ModalTitle>}
            {description !== undefined && (
              <ModalDescription>{description}</ModalDescription>
            )}
          </ModalHeader>
        ) : null}

        {children !== undefined && <ModalBody>{children}</ModalBody>}

        {footer !== undefined ? (
          footer
        ) : showDefaultFooter ? (
          <ModalFooter align={footerAlign}>
            {buttonProps.map((props, index) => (
              <Button key={index} size='small' {...props} />
            ))}
          </ModalFooter>
        ) : null}
      </ModalContent>
    </Modal>
  );
}

export { PresetModal };
export type { PresetModalProps };
