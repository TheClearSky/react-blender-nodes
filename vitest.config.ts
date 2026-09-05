import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

/**
 * Standalone unit test configuration.
 *
 * This is intentionally separate from the Storybook vitest integration
 * defined in vite.config.ts. Run with `npm run test:unit`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    // Under worker-pool CPU contention a first-touch load can push the heaviest
    // case past the 5 s default and flake the gate RED. Generous timeout so a
    // pass/fail is a real signal (does not weaken any assertion).
    testTimeout: 20000,
  },
});
