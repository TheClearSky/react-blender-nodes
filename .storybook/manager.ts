import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

const theme = create({
  base: 'dark',
  brandTitle: 'react-blender-nodes',
  brandImage: '/favicon.svg',
});

addons.setConfig({
  theme,
});
