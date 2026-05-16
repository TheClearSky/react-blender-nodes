import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DragList } from './DragList';
import type { DragListItem } from './types';

const meta = {
  title: 'Molecules/DragList',
  component: DragList,
  args: {
    items: [],
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className='w-[300px] bg-[#222222] p-3 rounded-md'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DragList>;

export default meta;
type Story = StoryObj<typeof meta>;

function PlaygroundTemplate() {
  const [items, setItems] = useState<DragListItem[]>([
    { id: '1', name: 'Alpha' },
    { id: '2', name: 'Beta' },
    { id: '3', name: 'Gamma' },
    { id: '4', name: 'Delta' },
    { id: '5', name: 'Epsilon' },
    { id: '6', name: 'Zeta' },
  ]);

  return <DragList items={items} onChange={setItems} />;
}

export const Playground: Story = {
  render: () => <PlaygroundTemplate />,
};

function WithSubtreesTemplate() {
  const [items, setItems] = useState<DragListItem[]>([
    { id: '1', name: 'Position' },
    {
      id: '2',
      name: 'Transform',
      subTrees: [
        { id: '2a', name: 'Scale X' },
        { id: '2b', name: 'Scale Y' },
        { id: '2c', name: 'Rotation' },
      ],
    },
    { id: '3', name: 'Opacity' },
    {
      id: '4',
      name: 'Color Settings',
      subTrees: [
        { id: '4a', name: 'Hue' },
        { id: '4b', name: 'Saturation' },
      ],
    },
    { id: '5', name: 'Output' },
  ]);

  return <DragList items={items} onChange={setItems} />;
}

export const WithSubtrees: Story = {
  render: () => <WithSubtreesTemplate />,
};

function DeepNestingTemplate() {
  const [items, setItems] = useState<DragListItem[]>([
    { id: '1', name: 'Root Item A' },
    {
      id: '2',
      name: 'Level 1 Group',
      subTrees: [
        { id: '2a', name: 'Level 1 Leaf' },
        {
          id: '2b',
          name: 'Level 2 Group',
          subTrees: [
            { id: '2b1', name: 'Level 2 Leaf' },
            {
              id: '2b2',
              name: 'Level 3 Group',
              subTrees: [
                { id: '2b2a', name: 'Level 3 Leaf A' },
                { id: '2b2b', name: 'Level 3 Leaf B' },
              ],
            },
          ],
        },
      ],
    },
    { id: '3', name: 'Root Item B' },
  ]);

  return <DragList items={items} onChange={setItems} maxDepth={4} />;
}

export const DeepNesting: Story = {
  render: () => <DeepNestingTemplate />,
};

function WithDeleteTemplate() {
  const [items, setItems] = useState<DragListItem[]>([
    { id: '1', name: 'Deletable Item A' },
    { id: '2', name: 'Deletable Item B' },
    {
      id: '3',
      name: 'Deletable Group',
      subTrees: [
        { id: '3a', name: 'Child A' },
        { id: '3b', name: 'Child B' },
      ],
    },
    { id: '4', name: 'Deletable Item C' },
  ]);

  const handleDelete = async (item: DragListItem): Promise<boolean> => {
    return window.confirm(`Delete "${item.name}"?`);
  };

  return <DragList items={items} onChange={setItems} onDelete={handleDelete} />;
}

export const WithDelete: Story = {
  render: () => <WithDeleteTemplate />,
};

function DeleteDisabledTemplate() {
  const [items, setItems] = useState<DragListItem[]>([
    { id: '1', name: 'Item A' },
    { id: '2', name: 'Item B' },
    { id: '3', name: 'Item C' },
  ]);

  const handleDelete = async (): Promise<boolean> => {
    return true;
  };

  return (
    <DragList
      items={items}
      onChange={setItems}
      onDelete={handleDelete}
      deleteDisabled
    />
  );
}

export const DeleteDisabled: Story = {
  render: () => <DeleteDisabledTemplate />,
};

function EmptyGroupsTemplate() {
  const [items, setItems] = useState<DragListItem[]>([
    { id: '1', name: 'Loose Item' },
    {
      id: '2',
      name: 'Group (drag its child out)',
      subTrees: [{ id: '2a', name: 'Only Child' }],
    },
    { id: '3', name: 'Another Item' },
  ]);

  return <DragList items={items} onChange={setItems} />;
}

export const EmptyGroups: Story = {
  render: () => <EmptyGroupsTemplate />,
};

type CustomData = { description: string; color: string };

function CustomContentTemplate() {
  const [items, setItems] = useState<DragListItem<CustomData>[]>([
    {
      id: '1',
      name: 'Number',
      additionalProperties: { description: 'Numeric value', color: '#E74C3C' },
    },
    {
      id: '2',
      name: 'String',
      additionalProperties: { description: 'Text value', color: '#4A90E2' },
    },
    {
      id: '3',
      name: 'Boolean',
      additionalProperties: {
        description: 'True or false',
        color: '#27AE60',
      },
    },
    {
      id: '4',
      name: 'Settings',
      subTrees: [
        {
          id: '4a',
          name: 'Threshold',
          additionalProperties: {
            description: 'Cutoff value',
            color: '#F39C12',
          },
        },
      ],
    },
  ]);

  return (
    <DragList
      items={items}
      onChange={setItems}
      renderContent={(item) => (
        <div className='flex items-center gap-2 min-w-0'>
          {'additionalProperties' in item && item.additionalProperties && (
            <div
              className='w-2.5 h-2.5 rounded-full shrink-0'
              style={{ backgroundColor: item.additionalProperties.color }}
            />
          )}
          <div className='min-w-0'>
            <div className='text-primary-white truncate text-[13px]'>
              {item.name}
            </div>
            {'additionalProperties' in item && item.additionalProperties && (
              <div className='text-secondary-light-gray text-[11px] truncate'>
                {item.additionalProperties.description}
              </div>
            )}
          </div>
        </div>
      )}
    />
  );
}

export const CustomContent: Story = {
  render: () => <CustomContentTemplate />,
};

function MaxDepthEnforcementTemplate() {
  const [items, setItems] = useState<DragListItem[]>([
    { id: '1', name: 'Root Leaf' },
    {
      id: '2',
      name: 'Group A (depth 1)',
      subTrees: [
        { id: '2a', name: 'Leaf in A' },
        {
          id: '2b',
          name: 'Nested Group (depth 2)',
          subTrees: [{ id: '2b1', name: 'Deep Leaf' }],
        },
      ],
    },
    { id: '3', name: 'Another Root Leaf' },
    {
      id: '4',
      name: 'Group B (depth 1)',
      subTrees: [{ id: '4a', name: 'Leaf in B' }],
    },
  ]);

  return (
    <div className='flex flex-col gap-2'>
      <div className='text-[11px] text-secondary-light-gray font-main'>
        maxDepth=2 — try dragging &quot;Nested Group&quot; into &quot;Group
        B&quot;
      </div>
      <DragList items={items} onChange={setItems} maxDepth={2} />
    </div>
  );
}

export const MaxDepthEnforcement: Story = {
  render: () => <MaxDepthEnforcementTemplate />,
};
