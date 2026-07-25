import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Tests run against a local Storybook instance.
 *
 * ─── Storybook server mode ─────────────────────────────────────────────
 * Three supported modes, picked by the `PLAYWRIGHT_STORYBOOK` env var
 * (auto-selected when omitted):
 *
 *   "dev"   — `storybook dev` (Vite dev server). ~208 module requests per
 *             story; fine for workers=1..2 locally and for HMR iteration.
 *             Default when running without CI.
 *
 *   "build" — `storybook build` THEN serve `storybook-static/` via
 *             `http-server`. Adds ~30–60 s first-build overhead; pre-bundled
 *             chunks absorb thousands of requests/second so workers ≥ 4 is
 *             safe. Default in CI.
 *
 *   "built" — serve an existing `storybook-static/` via `http-server`, no
 *             rebuild. Fastest startup; use when the bundle is already
 *             up-to-date (CI caches, iterating on tests, etc.).
 *
 * Convenience npm scripts wrap each mode × (headless | headed):
 *   test:e2e:dev  |  test:e2e:build  |  test:e2e:built     (headless)
 *   test:e2e:dev:h | test:e2e:build:h | test:e2e:built:h   (headed)
 *
 * ─── Recording ────────────────────────────────────────────────────────
 * Local (non-CI): full trace, video, and screenshots on every run so
 * failures can be inspected with `npx playwright show-trace` immediately.
 * CI: trace/video/screenshots only on first retry to keep artifact sizes
 * down.
 */
const isCI = !!process.env.CI;
type StorybookMode = 'dev' | 'build' | 'built';
const envMode = process.env.PLAYWRIGHT_STORYBOOK;
const storybookMode: StorybookMode =
  envMode === 'dev' || envMode === 'build' || envMode === 'built'
    ? envMode
    : isCI
      ? 'build'
      : 'dev';

// `--quiet` silences the Storybook build banner. We serve the built bundle
// through a tiny in-tree Node script (`e2e/serveStorybook.mjs`) rather than
// `http-server` / `serve` — both of those stall on the HTTP response body
// when their stdout is a pipe under Playwright's child-process capture,
// causing webServer probe timeouts. The in-tree server logs to stderr and
// uses node:http directly, so pipe back-pressure can't wedge it.
// Playwright resolves `webServer.command` paths relative to the config file,
// so the script path is `./serveStorybook.mjs` (next to this config). The
// `storybook-static` arg is resolved relative to `process.cwd()` at spawn
// time, which Playwright sets to the project root.
const SERVE_BUILT = 'node ./serveStorybook.mjs ../storybook-static 6006';
const STORYBOOK_COMMAND: Record<StorybookMode, string> = {
  dev: 'npm run storybook',
  build: `npm run build-storybook -- --quiet && ${SERVE_BUILT}`,
  built: SERVE_BUILT,
};
const STORYBOOK_TIMEOUT: Record<StorybookMode, number> = {
  dev: 120_000,
  build: 240_000, // storybook build can take 30–60s
  built: 30_000, // just serving; should be up in seconds
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: isCI ? 1 : 8,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:6006',
    viewport: { width: 1920, height: 1080 },
    trace: isCI ? 'on-first-retry' : 'on',
    video: isCI ? 'retain-on-failure' : 'on',
    screenshot: isCI ? 'only-on-failure' : 'on',
  },

  /**
   * Tests are grouped into feature-scoped projects. Run a single group with:
   *   npx playwright test --project=loops
   * Add a new project for a new feature by pointing `testDir` at its tests
   * folder — keeps suites isolated and lets CI parallelise per feature later.
   */
  projects: [
    {
      name: 'loops',
      testDir: './tests/loops',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'advancedGraphExamples',
      testDir: './tests/advancedGraphExamples',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'dataTypes',
      testDir: './tests/dataTypes',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'nodeGroups',
      testDir: './tests/nodeGroups',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'customInputs',
      testDir: './tests/customInputs',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'dragList',
      testDir: './tests/dragList',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'connectionOrder',
      testDir: './tests/connectionOrder',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],

  webServer: {
    command: STORYBOOK_COMMAND[storybookMode],
    url: 'http://localhost:6006',
    // build/built modes demand their OWN server on :6006 — reusing a
    // stray `storybook dev` instance would defeat the whole point of
    // switching modes.
    reuseExistingServer: storybookMode === 'dev' && !isCI,
    timeout: STORYBOOK_TIMEOUT[storybookMode],
  },
});
