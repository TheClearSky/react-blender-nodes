import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/components/organisms/FullGraph/FullGraph.tsx',
    'src/components/organisms/NodeRunnerPanel/NodeRunnerPanel.tsx',
    'src/utils/nodeRunner/useNodeRunner.ts',
    'src/utils/importExport/index.ts',
    'src/utils/nodeStateManagement/standardNodes.ts',
  ],
  project: ['src/**/*.{ts,tsx}'],
  ignoreDependencies: ['tw-animate-css'],
  storybook: {
    config: ['.storybook/main.ts'],
    entry: ['src/**/*.stories.tsx'],
  },
};

export default config;
