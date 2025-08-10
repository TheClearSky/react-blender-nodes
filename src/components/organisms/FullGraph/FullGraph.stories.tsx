// Replace your-framework with the framework you are using, e.g. react-vite, nextjs, nextjs-vite, etc.
import type { Meta } from '@storybook/react';

import { FullGraph } from './FullGraph';

const meta = {
  component: FullGraph,
} satisfies Meta<typeof FullGraph>;

export default meta;

export const Default = {};
