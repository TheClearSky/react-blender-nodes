import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './Accordion';

const meta = {
  title: 'Atoms/Accordion',
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className='rbn:w-[340px] rbn:bg-runner-panel-bg rbn:p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const Single: Story = {
  render: () => (
    <Accordion type='single' collapsible defaultValue='item-1'>
      <AccordionItem value='item-1'>
        <AccordionTrigger>Section One</AccordionTrigger>
        <AccordionContent>
          <p className='rbn:px-4 rbn:text-secondary-light-gray'>
            Content for section one with some example text.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-2'>
        <AccordionTrigger>Section Two</AccordionTrigger>
        <AccordionContent>
          <p className='rbn:px-4 rbn:text-secondary-light-gray'>
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
          <div className='rbn:flex rbn:flex-col rbn:gap-2 rbn:px-4'>
            <div className='rbn:rounded-md rbn:border rbn:border-runner-value-border rbn:bg-runner-value-bg rbn:px-3 rbn:py-2 rbn:font-mono rbn:text-[14px] rbn:text-primary-white'>
              42
            </div>
            <div className='rbn:rounded-md rbn:border rbn:border-runner-value-border rbn:bg-runner-value-bg rbn:px-3 rbn:py-2 rbn:font-mono rbn:text-[14px] rbn:text-primary-white'>
              &quot;hello&quot;
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='outputs'>
        <AccordionTrigger>Outputs</AccordionTrigger>
        <AccordionContent>
          <div className='rbn:flex rbn:flex-col rbn:gap-2 rbn:px-4'>
            <div className='rbn:rounded-md rbn:border rbn:border-runner-value-border rbn:bg-runner-value-bg rbn:px-3 rbn:py-2 rbn:font-mono rbn:text-[14px] rbn:text-primary-white'>
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
          <p className='rbn:px-4 rbn:text-secondary-light-gray'>
            Hidden content A
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='b'>
        <AccordionTrigger>Collapsed B</AccordionTrigger>
        <AccordionContent>
          <p className='rbn:px-4 rbn:text-secondary-light-gray'>
            Hidden content B
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
