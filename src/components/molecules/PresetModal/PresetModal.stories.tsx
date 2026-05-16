import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PresetModal } from './PresetModal';
import {
  Button,
  Input,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalClose,
} from '@/components/atoms';

const meta = {
  title: 'Molecules/PresetModal',
  component: PresetModal,
  args: {
    open: false,
    onOpenChange: () => {},
  },
} satisfies Meta<typeof PresetModal>;

export default meta;
type Story = StoryObj<typeof meta>;

function BasicTemplate() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size='small' onClick={() => setOpen(true)}>
        Open PresetModal
      </Button>
      <PresetModal
        open={open}
        onOpenChange={setOpen}
        title='Create Panel'
        description='Enter a name for the new input panel.'
        buttonProps={[
          {
            children: 'Cancel',
            color: 'dark' as const,
            onClick: () => setOpen(false),
          },
          {
            children: 'Create',
            color: 'lightNonPriority' as const,
            onClick: () => setOpen(false),
          },
        ]}
      >
        <Input
          size='small'
          placeholder='Panel name'
          value=''
          onChange={() => {}}
          allowOnlyNumbers={false}
          className='w-full'
        />
      </PresetModal>
    </>
  );
}

export const Basic: Story = {
  render: () => <BasicTemplate />,
};

function WithCustomHeaderFooterTemplate() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size='small' onClick={() => setOpen(true)}>
        Custom Header/Footer
      </Button>
      <PresetModal
        open={open}
        onOpenChange={setOpen}
        header={
          <ModalHeader className='bg-primary-dark-gray'>
            <ModalTitle>Custom Header</ModalTitle>
          </ModalHeader>
        }
        footer={
          <ModalFooter align='center'>
            <ModalClose asChild>
              <Button size='small' color='lightPriority'>
                Got It
              </Button>
            </ModalClose>
          </ModalFooter>
        }
      >
        <p className='text-primary-white text-sm'>
          This modal has custom header and footer JSX overrides.
        </p>
      </PresetModal>
    </>
  );
}

export const WithCustomHeaderFooter: Story = {
  render: () => <WithCustomHeaderFooterTemplate />,
};

function ConfirmationTemplate() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size='small' onClick={() => setOpen(true)}>
        Delete Panel
      </Button>
      <PresetModal
        open={open}
        onOpenChange={setOpen}
        title='Delete Panel'
        description='This will move all inputs in this panel back to the root level. Are you sure?'
        size='sm'
        buttonProps={[
          {
            children: 'Cancel',
            color: 'dark' as const,
            onClick: () => setOpen(false),
          },
          {
            children: 'Delete',
            className: 'bg-red-900 border-red-700 hover:bg-red-800',
            onClick: () => setOpen(false),
          },
        ]}
      />
    </>
  );
}

export const Confirmation: Story = {
  render: () => <ConfirmationTemplate />,
};

function FooterAlignmentTemplate() {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('right');

  return (
    <>
      <div className='flex gap-2'>
        {(['left', 'center', 'right'] as const).map((a) => (
          <Button
            key={a}
            size='small'
            onClick={() => {
              setAlign(a);
              setOpen(true);
            }}
          >
            Align {a}
          </Button>
        ))}
      </div>
      <PresetModal
        open={open}
        onOpenChange={setOpen}
        title='Footer Alignment'
        description={`Buttons aligned to the ${align}.`}
        footerAlign={align}
        buttonProps={[
          {
            children: 'Cancel',
            color: 'dark' as const,
            onClick: () => setOpen(false),
          },
          {
            children: 'OK',
            color: 'lightNonPriority' as const,
            onClick: () => setOpen(false),
          },
        ]}
      >
        <p className='text-primary-white text-sm'>
          The footer buttons are aligned to the {align}.
        </p>
      </PresetModal>
    </>
  );
}

export const FooterAlignment: Story = {
  render: () => <FooterAlignmentTemplate />,
};
