import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Modal,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalClose,
  ModalCloseButton,
} from './Modal';
import { Button } from '@/components/atoms';

const meta = {
  title: 'Atoms/Modal',
  component: Modal,
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

function BasicTemplate() {
  return (
    <Modal>
      <ModalTrigger asChild>
        <Button size='small'>Open Modal</Button>
      </ModalTrigger>
      <ModalContent>
        <ModalCloseButton />
        <ModalHeader>
          <ModalTitle>Edit Node Type</ModalTitle>
          <ModalDescription>
            Modify the properties of this node type.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <p className='text-primary-white text-sm'>
            Modal body content goes here. This area scrolls when content
            overflows.
          </p>
        </ModalBody>
        <ModalFooter>
          <ModalClose asChild>
            <Button size='small' color='dark'>
              Cancel
            </Button>
          </ModalClose>
          <Button size='small' color='lightNonPriority'>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export const Basic: Story = {
  render: () => <BasicTemplate />,
};

function SizesTemplate() {
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [open, setOpen] = useState(false);

  return (
    <div className='flex gap-2'>
      {(['sm', 'md', 'lg'] as const).map((s) => (
        <Button
          key={s}
          size='small'
          onClick={() => {
            setSize(s);
            setOpen(true);
          }}
        >
          {s.toUpperCase()}
        </Button>
      ))}
      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent size={size}>
          <ModalCloseButton />
          <ModalHeader>
            <ModalTitle>Size: {size.toUpperCase()}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className='text-primary-white text-sm'>
              This modal uses the &quot;{size}&quot; size variant.
            </p>
          </ModalBody>
          <ModalFooter>
            <ModalClose asChild>
              <Button size='small' color='lightNonPriority'>
                Close
              </Button>
            </ModalClose>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

export const Sizes: Story = {
  render: () => <SizesTemplate />,
};

function ScrollableTemplate() {
  return (
    <Modal>
      <ModalTrigger asChild>
        <Button size='small'>Open Scrollable</Button>
      </ModalTrigger>
      <ModalContent size='sm'>
        <ModalCloseButton />
        <ModalHeader>
          <ModalTitle>Scrollable Content</ModalTitle>
          <ModalDescription>
            The body area scrolls independently.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className='flex flex-col gap-3'>
            {Array.from({ length: 20 }, (_, index) => (
              <div
                key={index}
                className='bg-primary-dark-gray rounded-md p-3 text-primary-white text-sm'
              >
                Item {index + 1}
              </div>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalClose asChild>
            <Button size='small' color='lightNonPriority'>
              Done
            </Button>
          </ModalClose>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export const Scrollable: Story = {
  render: () => <ScrollableTemplate />,
};
