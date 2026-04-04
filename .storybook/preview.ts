import type { Preview } from '@storybook/react-vite';
import { create } from 'storybook/theming';
import '../src/index.css';
import '@fontsource/dejavu-sans';

const docsTheme = create({
  base: 'dark',
});

const preview: Preview = {
  parameters: {
    docs: {
      theme: docsTheme,
    },
    options: {
      storySort: {
        order: ['Interactive Fun🎉', 'Atoms', 'Molecules', 'Organisms', '*'],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
};

export default preview;
