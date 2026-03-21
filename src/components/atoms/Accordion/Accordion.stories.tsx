import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './Accordion';

const meta = {
  component: Accordion,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className='w-[340px] bg-runner-panel-bg p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Accordion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: () => (
    <Accordion type='single' collapsible defaultValue='item-1'>
      <AccordionItem value='item-1'>
        <AccordionTrigger>Section One</AccordionTrigger>
        <AccordionContent>
          <p className='px-4 text-secondary-light-gray'>
            Content for section one with some example text.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-2'>
        <AccordionTrigger>Section Two</AccordionTrigger>
        <AccordionContent>
          <p className='px-4 text-secondary-light-gray'>
            Content for section two with some example text.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <Accordion type='multiple' defaultValue={['inputs', 'outputs']}>
      <AccordionItem value='inputs'>
        <AccordionTrigger>Inputs</AccordionTrigger>
        <AccordionContent>
          <div className='flex flex-col gap-2 px-4'>
            <div className='rounded-md border border-runner-value-border bg-runner-value-bg px-3 py-2 font-mono text-[14px] text-primary-white'>
              42
            </div>
            <div className='rounded-md border border-runner-value-border bg-runner-value-bg px-3 py-2 font-mono text-[14px] text-primary-white'>
              &quot;hello&quot;
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='outputs'>
        <AccordionTrigger>Outputs</AccordionTrigger>
        <AccordionContent>
          <div className='flex flex-col gap-2 px-4'>
            <div className='rounded-md border border-runner-value-border bg-runner-value-bg px-3 py-2 font-mono text-[14px] text-primary-white'>
              84
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const AllCollapsed: Story = {
  render: () => (
    <Accordion type='multiple'>
      <AccordionItem value='a'>
        <AccordionTrigger>Collapsed A</AccordionTrigger>
        <AccordionContent>
          <p className='px-4 text-secondary-light-gray'>Hidden content A</p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='b'>
        <AccordionTrigger>Collapsed B</AccordionTrigger>
        <AccordionContent>
          <p className='px-4 text-secondary-light-gray'>Hidden content B</p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
