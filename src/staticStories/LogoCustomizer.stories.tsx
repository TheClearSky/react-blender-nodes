import type { Meta, StoryObj } from '@storybook/react-vite';

const LogoCustomizer = () => (
  <iframe
    src='colorpickerlogo.html'
    style={{ width: '100%', height: '100vh', border: 'none' }}
    title='Logo Color Customizer'
  />
);

const meta = {
  title: 'Interactive Fun🎉/Logo Customizer',
  component: LogoCustomizer,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof LogoCustomizer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
