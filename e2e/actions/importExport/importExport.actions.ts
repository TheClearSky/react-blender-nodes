import { expect, type Page } from '@playwright/test';
import {
  hoverMenuItem,
  clickMenuItem,
} from '../contextMenu/contextMenu.actions';
import { rightClickCanvas } from '../graph/graphCanvas.actions';
import { clearAllNodes } from '../graph/selection.actions';
import { getAllNodes } from '../../locators/graph/graphCanvas.locators';
import { T_REDUCER_TICK } from '../../constants';

/**
 * Drive the actual import/export UI exactly as a user would: right-click
 * the canvas → "Import/Export" submenu → "Export State" or "Import State".
 *
 * EXPORT — opens the menu, clicks "Export State", waits for the download
 * the app triggers via `downloadJson` (a programmatic <a download> click),
 * and reads the response body in-memory. No file is persisted.
 *
 * IMPORT — opens the menu, sets up a `filechooser` listener, clicks
 * "Import State". The app's hidden `<input type="file">` opens a native
 * picker; Playwright intercepts it and provides a synthetic in-memory
 * file (no disk I/O).
 *
 * Used by tests that build a topology once in beforeAll and import it per
 * test to skip the slow context-menu-and-drag rebuild.
 */

const MENU_LABEL_FOLDER = 'Import/Export';
const MENU_LABEL_EXPORT_STATE = 'Export State';
const MENU_LABEL_IMPORT_STATE = 'Import State';

// Right-click position on the canvas background. (5, 5) is the
// top-left clear area used by other tests to avoid hitting nodes.
const MENU_TRIGGER_POSITION = { x: 5, y: 5 } as const;

/**
 * Open the context menu and read the entire downloaded JSON into memory.
 */
async function exportGraphStateViaUi(page: Page): Promise<string> {
  await rightClickCanvas(page, MENU_TRIGGER_POSITION);
  await hoverMenuItem(page, MENU_LABEL_FOLDER);
  // Set up the listener BEFORE the click so we don't miss the event.
  const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
  await clickMenuItem(page, MENU_LABEL_EXPORT_STATE);
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Open the context menu, click "Import State", and feed the JSON to the
 * native file picker via Playwright's `filechooser` event. Waits for the
 * resulting REPLACE_STATE + ReactFlow re-render to land at the expected
 * node count.
 */
async function importGraphStateViaUi(
  page: Page,
  json: string,
  expectedNodeCount: number,
): Promise<void> {
  await rightClickCanvas(page, MENU_TRIGGER_POSITION);
  await hoverMenuItem(page, MENU_LABEL_FOLDER);
  const fileChooserPromise = page.waitForEvent('filechooser', {
    timeout: 10_000,
  });
  await clickMenuItem(page, MENU_LABEL_IMPORT_STATE);
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'graph-state.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json, 'utf-8'),
  });
  // Wait for ReactFlow to re-render at the expected node count. The
  // locator's auto-retry handles the REPLACE_STATE → re-render cascade.
  await expect(getAllNodes(page)).toHaveCount(expectedNodeCount, {
    timeout: 5000,
  });
  // Settle one reducer tick for any post-mount cascade (handle
  // re-registration etc.) before the test body starts interacting.
  await page.waitForTimeout(T_REDUCER_TICK);
}

// ─── Fixture pattern ─────────────────────────────────────────────────
//
// "Build a topology once via the slow context-menu-and-drag path, then
// import the resulting JSON in every test that needs it."
//
// `captureFixture` runs in beforeAll: it clears the canvas, runs the
// caller's slow build, exports the state, and bundles the JSON +
// builder-returned topology record (the node-id map) into a fixture.
// `loadFixture` runs at the start of each test: it imports the fixture
// JSON via the same UI flow as a user would, replacing whatever the
// previous test left on the canvas.
//
// The fixture's `topology` is the SAME node-id record `build` returned
// originally — node ids round-trip through export/import unchanged, so
// tests can refer to `topology.a.loopStartId` etc. across all imports.

/**
 * Bundled in-memory output of a one-time topology build.
 *   - `json`        — the exported State, ready to feed back into import
 *   - `topology`    — the builder's id record (e.g. `SerialLoops`)
 *   - `totalNodes`  — node count, used by importGraphStateViaUi to wait
 *                     for the post-import re-render to settle
 */
type Fixture<T> = { json: string; topology: T; totalNodes: number };

/**
 * Run a slow builder once, export the result, and bundle the JSON +
 * topology record into a fixture for in-memory reuse across tests in
 * the same describe.serial block.
 */
async function captureFixture<T extends { allNodeIds: string[] }>(
  page: Page,
  build: (page: Page) => Promise<T>,
): Promise<Fixture<T>> {
  await clearAllNodes(page);
  const topology = await build(page);
  const json = await exportGraphStateViaUi(page);
  return { json, topology, totalNodes: topology.allNodeIds.length };
}

/**
 * Replace the page's graph state with the fixture's JSON via the same
 * Import State menu flow a user would follow. Returns the original
 * topology record so the caller has the node ids handy.
 */
async function loadFixture<T>(page: Page, fixture: Fixture<T>): Promise<T> {
  await importGraphStateViaUi(page, fixture.json, fixture.totalNodes);
  return fixture.topology;
}

export {
  exportGraphStateViaUi,
  importGraphStateViaUi,
  captureFixture,
  loadFixture,
};
export type { Fixture };
