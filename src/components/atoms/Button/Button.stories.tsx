import type { Meta } from '@storybook/react-vite';

import { Button } from './Button';

const meta = {
  component: Button,
  args: {
    children: 'Button',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;

export const Default = {};

export const Idk = {};
