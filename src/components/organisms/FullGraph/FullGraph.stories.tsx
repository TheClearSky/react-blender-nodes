import type { Meta, StoryObj } from '@storybook/react-vite';

import { FullGraph } from './FullGraph';

const meta = {
  component: FullGraph,
} satisfies Meta<typeof FullGraph>;

export default meta;

export const Default: StoryObj<typeof FullGraph> = {};
