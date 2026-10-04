import { defineConfig, devices } from '@playwright/test';

/**
 * REPRO-ONLY Playwright config — review `review/2026-08-07-full-project/`
 * Critical findings (NS-01 / AU-01 / AU-02).
 *
 * Deliberately SEPARATE from `playwright.config.ts`:
 *   - `testDir` points at `./repro`, which the normal config's `./tests`
 *     projects never scan, so these specs can NEVER leak into a regular
 *     `npm run test:e2e:*` run or CI. This matters because the NS-01 demo
 *     spec intentionally never finishes (it holds the browser open for a
 *     human to inspect) — inside a normal suite that would hang the run.
 *   - Headed by default: these are demonstrations for a human, not gates.
 *   - No `webServer` block: a Storybook dev server on :6006 is expected to
 *     already be running (`npm run storybook`). Specs fail fast if not.
 *   - Recording off: the keep-open spec would otherwise record an unbounded
 *     video/trace. Evidence is captured explicitly (screenshots + stdout).
 *
 * Run one spec at a time:
 *   npx playwright test --config=e2e/playwright.repro.config.ts e2e/repro/<spec> --workers=1
 */
export default defineConfig({
  testDir: './repro',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  // The repro specs manage their own pacing (delayed implementations run for
  // seconds by design); give each test a generous ceiling. The keep-open demo
  // overrides to 0 (no timeout) itself.
  timeout: 180_000,

  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:6006',
    viewport: { width: 1920, height: 1080 },
    headless: false,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
});
