import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useArgs } from 'storybook/preview-api';
import { PathChipsInput } from './PathChipsInput';

// A stand-in Add menu, for the "Existing here" suggestions.
const folders: Record<string, string[]> = {
  '': ['Sources', 'Control', 'Filter & EQ', 'Group Nodes', 'Easy Effects'],
  'Group Nodes': ['Drums', 'Synths'],
  'Group Nodes/Drums': ['Kicks', 'Snares'],
};
const getSuggestions = (parentPath: readonly string[]) =>
  folders[parentPath.join('/')] ?? [];

const meta = {
  title: 'Molecules/PathChipsInput',
  component: PathChipsInput,
  args: {
    value: ['Group Nodes', 'Drums'],
    onChange: fn(),
    getSuggestions,
    previewRoot: 'Add Node',
    previewLeaf: 'My Kick',
    emptyPathHint: 'top level of Add Node',
  },
  decorators: [
    (Story) => (
      <div className='rbn:w-[300px] rbn:bg-graph-elevated-surface-bg rbn:p-3'>
        <Story />
      </div>
    ),
  ],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <PathChipsInput
        {...args}
        onChange={(path) => {
          args.onChange(path);
          updateArgs({ value: path });
        }}
      />
    );
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PathChipsInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The node-group editor's Menu Path: chips, suggestions and the preview. */
export const MenuPath: Story = {};

/** An empty path — the group sits at the top level of Add Node. */
export const Empty: Story = { args: { value: [] } };

/** Without a preview (no `previewRoot`). */
export const ChipsOnly: Story = {
  args: { previewRoot: undefined, getSuggestions: undefined },
};
