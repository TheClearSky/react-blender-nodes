import type { Page, Locator } from '@playwright/test';

/**
 * Locators for the runner toolbar (RunControls) and max-loop input.
 *
 * The toolbar is the top bar of the runner drawer and carries the tailwind
 * class `bg-runner-toolbar-bg` — a custom theme color that is stable across
 * style refactors of content inside the toolbar.
 */

const TOOLBAR_SELECTOR = '.bg-runner-toolbar-bg';

function getRunnerToolbar(page: Page): Locator {
  return page.locator(TOOLBAR_SELECTOR);
}

/**
 * The state label text span in the runner toolbar.
 *
 * Scoped to the toolbar so it doesn't collide with a "Completed" status badge
 * that also appears in the step inspector.
 */
function getRunnerStateLabel(page: Page): Locator {
  return getRunnerToolbar(page)
    .locator('span')
    .filter({
      hasText: /^(Idle|Compiling|Running|Paused|Completed|Error)$/,
    })
    .first();
}

// ─────────────────────────────────────────────────────
// Action buttons — each carries a title="<verb>" attribute
// ─────────────────────────────────────────────────────

function getRunButton(page: Page): Locator {
  // The run button carries title="Run" (no active target) or
  // title="Run: <target label>" once the pluggable run-targets feature mounts a
  // default target (e.g. "Run: In-process"). Prefix-match covers both; it does
  // not collide with Reset/Pause/Step/Stop (none start with "Run").
  return getRunnerToolbar(page).locator('button[title^="Run"]');
}

function getPauseButton(page: Page): Locator {
  return getRunnerToolbar(page).locator('button[title="Pause"]');
}

function getStepButton(page: Page): Locator {
  return getRunnerToolbar(page).locator('button[title="Step"]');
}

function getStopButton(page: Page): Locator {
  return getRunnerToolbar(page).locator('button[title="Stop"]');
}

function getResetButton(page: Page): Locator {
  return getRunnerToolbar(page).locator('button[title="Reset"]');
}

// ─────────────────────────────────────────────────────
// Mode toggle — two buttons with exact text
// ─────────────────────────────────────────────────────

function getModeToggleInstant(page: Page): Locator {
  return getRunnerToolbar(page).getByRole('button', {
    name: /^Instant$/,
    exact: true,
  });
}

function getModeToggleStepByStep(page: Page): Locator {
  return getRunnerToolbar(page).getByRole('button', {
    name: /^Step-by-Step$/,
    exact: true,
  });
}

// ─────────────────────────────────────────────────────
// Max loop iterations — slider-style number input
// ─────────────────────────────────────────────────────

function getMaxLoopsDecrementButton(page: Page): Locator {
  return getRunnerToolbar(page).locator(
    'button[aria-label="Decrement Max Loops"]',
  );
}

function getMaxLoopsIncrementButton(page: Page): Locator {
  return getRunnerToolbar(page).locator(
    'button[aria-label="Increment Max Loops"]',
  );
}

/**
 * The display button that reads "Max Loops N". Has no aria-label — the
 * accessible name is built from its two inner spans (label + value), so we
 * locate it by role + name regex.
 */
function getMaxLoopsDisplay(page: Page): Locator {
  return getRunnerToolbar(page).getByRole('button', {
    name: /^Max Loops \d+$/,
  });
}

export {
  getRunnerToolbar,
  getRunnerStateLabel,
  getRunButton,
  getPauseButton,
  getStepButton,
  getStopButton,
  getResetButton,
  getModeToggleInstant,
  getModeToggleStepByStep,
  getMaxLoopsDecrementButton,
  getMaxLoopsIncrementButton,
  getMaxLoopsDisplay,
};
