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
  // '@xyflow/system' has no source import but IS load-bearing: the
  // api-extractor declaration rollup attributes types reached through
  // EdgeProps (e.g. EdgePosition) to it, so dist/index.d.ts imports from it.
  ignoreDependencies: ['tw-animate-css', '@xyflow/system'],
  storybook: {
    config: ['.storybook/main.ts'],
    entry: ['src/**/*.stories.tsx'],
  },
};

export default config;
