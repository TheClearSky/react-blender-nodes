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

// Collapse the addon panel on first load by setting its height to 0
addons.register('collapse-panel', (api) => {
  api.setSizes({ bottomPanelHeight: 0 });
});
