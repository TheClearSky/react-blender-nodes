import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { ContextMenu } from './ContextMenu';
import {
  FolderIcon,
  FileIcon,
  SettingsIcon,
  DatabaseIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  CopyIcon,
  ClipboardIcon,
  EyeIcon,
  XIcon,
  GlobeIcon,
} from 'lucide-react';

const meta = {
  component: ContextMenu,
  argTypes: {},
  decorators: [
    (Story) => (
      <div className='flex justify-center items-center min-h-screen p-8'>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ContextMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground = {
  args: {
    subItems: [
      {
        id: 'link-to-viewer',
        label: 'Link to Viewer',
        icon: <EyeIcon className='w-4 h-4' />,
        onClick: fn(),
      },
      {
        id: 'copy',
        label: 'Copy',
        icon: <CopyIcon className='w-4 h-4' />,
        onClick: fn(),
      },
      {
        id: 'paste',
        label: 'Paste',
        icon: <ClipboardIcon className='w-4 h-4' />,
        onClick: fn(),
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: <FileIcon className='w-4 h-4' />,
        shortcut: 'Shift D',
        onClick: fn(),
        separator: true,
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: <XIcon className='w-4 h-4' />,
        shortcut: 'X',
        onClick: fn(),
        separator: true,
      },
      {
        id: 'dissolve',
        label: 'Dissolve',
        shortcut: 'Ctrl X',
        onClick: fn(),
        separator: true,
      },
      {
        id: 'make-group',
        label: 'Make Group',
        icon: <FolderIcon className='w-4 h-4' />,
        shortcut: 'Ctrl G',
        onClick: fn(),
        separator: true,
      },
      {
        id: 'insert-into-group',
        label: 'Insert Into Group',
        onClick: fn(),
        separator: true,
      },
      {
        id: 'join-in-new-frame',
        label: 'Join in New Frame',
        onClick: fn(),
      },
      {
        id: 'remove-from-frame',
        label: 'Remove from Frame',
        shortcut: 'Alt P',
        onClick: fn(),
        separator: true,
      },
      {
        id: 'rename',
        label: 'Rename...',
        shortcut: 'F2',
        onClick: fn(),
        separator: true,
      },
      {
        id: 'select',
        label: 'Select',
        subItems: [
          {
            id: 'select-all',
            label: 'Select All',
            onClick: fn(),
          },
          {
            id: 'select-none',
            label: 'Select None',
            onClick: fn(),
          },
        ],
      },
      {
        id: 'show-hide',
        label: 'Show/Hide',
        subItems: [
          {
            id: 'show-all',
            label: 'Show All',
            onClick: fn(),
          },
          {
            id: 'hide-selected',
            label: 'Hide Selected',
            onClick: fn(),
          },
        ],
        separator: true,
      },
      {
        id: 'online-manual',
        label: 'Online Manual',
        icon: <GlobeIcon className='w-4 h-4' />,
        onClick: fn(),
      },
    ],
  },
} satisfies Story;

export const WithIcons = {
  args: {
    subItems: [
      {
        id: 'database',
        label: 'Database',
        icon: <DatabaseIcon className='w-4 h-4' />,
        subItems: [
          {
            id: 'tables',
            label: 'Tables',
            icon: <FolderIcon className='w-4 h-4' />,
            subItems: [
              {
                id: 'users',
                label: 'Users',
                icon: <FileIcon className='w-4 h-4' />,
                onClick: fn(),
              },
              {
                id: 'products',
                label: 'Products',
                icon: <FileIcon className='w-4 h-4' />,
                onClick: fn(),
              },
            ],
          },
          {
            id: 'views',
            label: 'Views',
            icon: <FolderIcon className='w-4 h-4' />,
            subItems: [
              {
                id: 'user-view',
                label: 'User View',
                icon: <FileIcon className='w-4 h-4' />,
                onClick: fn(),
              },
            ],
          },
        ],
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: <SettingsIcon className='w-4 h-4' />,
        subItems: [
          {
            id: 'appearance',
            label: 'Appearance',
            subItems: [
              {
                id: 'theme',
                label: 'Theme',
                onClick: fn(),
              },
              {
                id: 'colors',
                label: 'Colors',
                onClick: fn(),
              },
            ],
          },
          {
            id: 'preferences',
            label: 'Preferences',
            subItems: [
              {
                id: 'general',
                label: 'General',
                onClick: fn(),
              },
              {
                id: 'advanced',
                label: 'Advanced',
                onClick: fn(),
              },
            ],
          },
        ],
      },
    ],
  },
} satisfies Story;

export const DeepNesting = {
  args: {
    subItems: [
      {
        id: 'level1',
        label: 'Level 1',
        subItems: [
          {
            id: 'level2a',
            label: 'Level 2A',
            subItems: [
              {
                id: 'level3a',
                label: 'Level 3A',
                subItems: [
                  {
                    id: 'level4a',
                    label: 'Level 4A',
                    onClick: fn(),
                  },
                  {
                    id: 'level4b',
                    label: 'Level 4B',
                    onClick: fn(),
                  },
                ],
              },
              {
                id: 'level3b',
                label: 'Level 3B',
                onClick: fn(),
              },
            ],
          },
          {
            id: 'level2b',
            label: 'Level 2B',
            subItems: [
              {
                id: 'level3c',
                label: 'Level 3C',
                onClick: fn(),
              },
              {
                id: 'level3d',
                label: 'Level 3D',
                onClick: fn(),
              },
            ],
          },
        ],
      },
    ],
  },
} satisfies Story;

export const ActionsMenu = {
  args: {
    subItems: [
      {
        id: 'create',
        label: 'Create',
        icon: <PlusIcon className='w-4 h-4' />,
        subItems: [
          {
            id: 'new-project',
            label: 'New Project',
            onClick: fn(),
          },
          {
            id: 'new-file',
            label: 'New File',
            onClick: fn(),
          },
          {
            id: 'new-folder',
            label: 'New Folder',
            onClick: fn(),
          },
        ],
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: <EditIcon className='w-4 h-4' />,
        subItems: [
          {
            id: 'rename',
            label: 'Rename',
            onClick: fn(),
          },
          {
            id: 'duplicate',
            label: 'Duplicate',
            onClick: fn(),
          },
          {
            id: 'move',
            label: 'Move',
            onClick: fn(),
          },
        ],
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: <TrashIcon className='w-4 h-4' />,
        onClick: fn(),
      },
    ],
  },
} satisfies Story;

export const InteractiveExample = {
  args: {
    subItems: [],
  },
  render: () => {
    const [lastAction, setLastAction] = useState<string | null>(null);

    const menuItems = [
      {
        id: 'tools',
        label: 'Tools',
        icon: <SettingsIcon className='w-4 h-4' />,
        subItems: [
          {
            id: 'development',
            label: 'Development',
            subItems: [
              {
                id: 'debug',
                label: 'Debug Mode',
                onClick: () => setLastAction('Debug Mode activated'),
              },
              {
                id: 'test',
                label: 'Run Tests',
                onClick: () => setLastAction('Running tests...'),
              },
              {
                id: 'build',
                label: 'Build Project',
                onClick: () => setLastAction('Building project...'),
              },
            ],
          },
          {
            id: 'utilities',
            label: 'Utilities',
            subItems: [
              {
                id: 'clean',
                label: 'Clean Cache',
                onClick: () => setLastAction('Cache cleaned'),
              },
              {
                id: 'optimize',
                label: 'Optimize Assets',
                onClick: () => setLastAction('Assets optimized'),
              },
            ],
          },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        icon: <FileIcon className='w-4 h-4' />,
        subItems: [
          {
            id: 'documentation',
            label: 'Documentation',
            onClick: () => setLastAction('Opening documentation'),
          },
          {
            id: 'tutorials',
            label: 'Tutorials',
            onClick: () => setLastAction('Opening tutorials'),
          },
          {
            id: 'support',
            label: 'Support',
            onClick: () => setLastAction('Opening support'),
          },
        ],
      },
    ];

    return (
      <div className='space-y-4'>
        <ContextMenu subItems={menuItems} />
        {lastAction && (
          <div className='mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md'>
            <p className='text-sm text-blue-800'>
              Last fn: <strong>{lastAction}</strong>
            </p>
          </div>
        )}
      </div>
    );
  },
} satisfies Story;
