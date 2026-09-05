/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';

// https://vite.dev/config/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dts({ rollupTypes: true, tsconfigPath: './tsconfig.app.json' }),
  ],
  // Paths resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    //Check https://vite.dev/guide/build.html#library-mode for more info
    lib: {
      // TWO entries, ONE build. `index` is the library; `contract` is the
      // React-free `@theclearsky/react-blender-nodes/contract` subpath the
      // codegen plugin consumes. Rollup hoists the modules they share into
      // chunks both entries import — the contract's transitive graph pulls no
      // React, so its chunks stay headless-loadable (`check-dist-loads` asserts
      // this on every build).
      entry: {
        index: 'src/index.ts',
        contract: 'src/contract.ts',
      },
      // ESM only. The UMD/CJS artifact was dropped in 0.0.13: React 19 ships no
      // UMD build (so the browser-global path was already dead), and Node
      // 20.19+/22.12+ `require()`s ES modules natively via the `default`
      // export condition. Multi-entry also forbids UMD in Vite lib mode, which
      // is what previously forced the contract into a second build.
      formats: ['es'],
      fileName: (_format, entryName) =>
        entryName === 'index'
          ? 'react-blender-nodes.es.js'
          : `react-blender-nodes-${entryName}.es.js`,
      cssFileName: 'react-blender-nodes',
    },
    rollupOptions: {
      // externalize react and react-dom to avoid bundling them with the library, check peerDependencies in package.json.
      external: ['react', 'react-dom'],
    },
    sourcemap: false,
    emptyOutDir: true,
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
});
