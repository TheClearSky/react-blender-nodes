/// <reference types="node" />
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

/**
 * Second, React-FREE library entry: the `@theclearsky/react-blender-nodes/contract`
 * subpath (source: `src/contract.ts`). Built SEPARATELY from the root library
 * (which stays single-entry ES+UMD) because Vite forbids UMD with a multi-entry
 * lib; this build emits ES+CJS only and, with `emptyOutDir: false`, ADDS its
 * artifacts to `dist/` without wiping the root build's output. Run AFTER the root
 * `vite build` (see the `build` script chain).
 *
 * No React/Tailwind plugins — the contract surface pulls no React at runtime (its
 * value graph is `handleClassifiers → standardNodes → nodeStateManagement/types →
 * zod`). Editor externals are kept bare so the emitted bundle stays lean and
 * headless-loadable.
 */
export default defineConfig({
  plugins: [
    // vite-plugin-dts's `rollupTypes` can only roll ONE entry (the package `types`
    // field = index.d.ts), and would clobber the root build's index.d.ts. So here
    // we emit PER-FILE .d.ts into a staging dir (no rollup, no index.d.ts touch);
    // `scripts/roll-contract-dts.ts` (chained after this build in `build:contract`)
    // rolls `dist/.dts-staging/contract.d.ts` into a self-contained
    // `dist/contract.d.ts` via API Extractor, then removes the staging dir.
    dts({
      rollupTypes: false,
      tsconfigPath: './tsconfig.app.json',
      outDir: 'dist/.dts-staging',
      entryRoot: 'src',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: ['src/contract.ts'],
      formats: ['es', 'cjs'],
      fileName: (format) =>
        format === 'es'
          ? 'react-blender-nodes-contract.es.js'
          : 'react-blender-nodes-contract.cjs',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'typescript',
        '@xyflow/react',
        '@xyflow/system',
        'immer',
        'zod',
      ],
    },
    sourcemap: false,
  },
});
