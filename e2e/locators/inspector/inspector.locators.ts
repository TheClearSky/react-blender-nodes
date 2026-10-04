import type { Page, Locator } from '@playwright/test';

/**
 * Locators for ExecutionStepInspector â€” the panel that slides in from the
 * right when a timeline step or iteration is selected.
 *
 * Reliable hooks:
 *   - The panel root has class `rbn:animate-slide-in-right` when visible. In a
 *     selector the colon MUST be escaped (`.rbn\:animate-…`, doubled in a TS
 *     string) — an unescaped one parses as a pseudo-class and matches nothing,
 *     silently. Use `getInspectorPanel` rather than re-typing it.
 *   - Section triggers are accordion buttons with text "Inputs" / "Outputs".
 *   - Error section starts with an uppercase heading "Error".
 *   - Loop iteration context uses exact text "Loop iteration N of M" and
 *     "Condition: true (continues)" / "Condition: false (exits)".
 */

function getInspectorPanel(page: Page): Locator {
  return page.locator('.rbn\\:animate-slide-in-right');
}

/** Status pill in the inspector header â€” "Completed" | "Errored" | "Skipped". */
function getInspectorStatusBadge(page: Page): Locator {
  return getInspectorPanel(page).locator(
    'span.rbn\\:rounded-full.rbn\\:text-\\[13px\\]',
  );
}

function getInspectorInputsSection(page: Page): Locator {
  return getInspectorPanel(page).getByRole('button', { name: 'Inputs' });
}

function getInspectorOutputsSection(page: Page): Locator {
  return getInspectorPanel(page).getByRole('button', { name: 'Outputs' });
}

function getInspectorErrorSection(page: Page): Locator {
  return getInspectorPanel(page)
    .locator('div')
    .filter({
      hasText: /^Error$/,
    });
}

function getInspectorLoopContext(page: Page): Locator {
  return getInspectorPanel(page)
    .locator('div')
    .filter({ hasText: /^Loop iteration \d+ of \d+$/ });
}

export {
  getInspectorPanel,
  getInspectorStatusBadge,
  getInspectorInputsSection,
  getInspectorOutputsSection,
  getInspectorErrorSection,
  getInspectorLoopContext,
};
