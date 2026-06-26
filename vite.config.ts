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
      entry: ['src/index.ts'],
      name: 'react-blender-nodes',
      //We are not using the second parameter (entryName) because this is a single entry library
      fileName: (format) => `react-blender-nodes.${format}.js`,
      cssFileName: 'react-blender-nodes',
      // We are building both ES and UMD formats, as a single entry library, check https://vite.dev/guide/build.html#library-mode for more info
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // externalize react and react-dom to avoid bundling them with the library, check peerDependencies in package.json.
      // `typescript` is a runtime dependency used ONLY by the opt-in codegen run
      // target (lazy `import('typescript')`); externalize it so the ~8MB compiler
      // is never bundled into the library — consumers get it via the dependency.
      external: ['react', 'react-dom', 'typescript'],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          typescript: 'ts',
        },
      },
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
