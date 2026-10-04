import { promises as fs } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { navigateToStory } from '../actions/graph/graphCanvas.actions';
import {
  exportGraphStateViaUi,
  importGraphStateViaUi,
} from '../actions/importExport/importExport.actions';
import { clearAllNodes } from '../actions/graph/selection.actions';
import { getAllEdges } from '../locators/graph/graphCanvas.locators';
import { createLoopStructure } from '../helpers/createLoopStructure';
import { addNode } from '../helpers/addNode';
import { dragBetweenLocators } from '../actions/node/connection.actions';
import {
  getHandleByName,
  getInferInput,
  getInferOutput,
  getLoopStopCondition,
} from '../locators/node/node.locators';
import {
  clickRun,
  waitForRunnerState,
} from '../actions/runnerPanel/runnerPanel.actions';
import {
  MENU_PATH_UTILITY,
  NODE_BUFFER,
  HANDLE_IN,
  HANDLE_GATE_OUT,
} from '../constants';

/**
 * AU-02 / C3 REGRESSION GUARD — two INDEPENDENT sibling loops on one
 * concurrency level must BOTH keep top-level LoopRecords. (Formerly the
 * bug-confirmation repro for the ambient loop-nesting stack, which misfiled
 * the slower sibling as "nested" and dropped its record; flipped after the
 * explicit-parentage recorder fix — PASS = fix holds.)
 *
 * Construction is fully authentic, per instruction:
 *   1. Build both loops through the real context menu + drag wiring using the
 *      standard e2e helpers (`createLoopStructure`, `addNode`,
 *      `dragBetweenLocators`).
 *        - Loop A: body = ONE Buffer  (≈450 ms/iteration — the FAST loop)
 *        - Loop B: body = THREE chained Buffers (≈1350 ms — the SLOW loop)
 *      Both terminate after one iteration (BitInput default `false` reaches
 *      the loop condition).
 *   2. EXPORT the built graph via the context-menu Export State flow and save
 *      it as a rerunnable fixture (input to the manual S9 smoke).
 *   3. CLEAR the canvas and RE-IMPORT the exported JSON via the context-menu
 *      Import State flow — proving the topology round-trips the real
 *      import/export path (zones rehydrated by REPLACE_STATE).
 *   4. Run with the repro story's delayed implementations.
 *
 * PASS = FIX HOLDS:
 *   - BOTH loop structure ids appear as top-level loopRecords keys;
 *   - `nestedLoopKeysPerIteration` is empty everywhere (nothing mis-nested);
 *   - each loop completed with `totalIterations >= 1`;
 *   - the story's summary panel reports ZERO recorder warnings for the run
 *     (distinguishes "fix holds" from "backstop salvaged a mistake"); the
 *     panel is fed by the real `onRecorderWarning` prop chain, which
 *     `c1-recorder-warning-channel.spec.ts` proves is live.
 */

const STORY_REPRO = 'organisms-fullgraphrepro--recorder-concurrency-playground';
const OUTPUT_FIXTURE = path.resolve(
  process.cwd(),
  'e2e/repro/fixtures/au02-sibling-loops-state.json',
);
const TOTAL_NODES = 14;

type RecordSummary = {
  status: string;
  errorCount: number;
  topLevelSteps: string[];
  groupRecords: unknown[];
  loopRecords: Array<{
    /** OPAQUE full-path identity (`["<loopStart>"]` at root) — never matched
     *  against a bare node id; see `structureRecordKey`. */
    loopKey: string;
    loopStructureId: string;
    ownerInstancePath: string[];
    totalIterations: number;
    stepsPerIteration: string[][];
    nestedLoopKeysPerIteration: string[][];
  }>;
  recorderWarnings: Array<{
    kind: string;
    key: string;
    recordId: string;
    message: string;
  }>;
  recorderWarningsObserved: number;
};

test('AU-02 guard: both sibling loops keep top-level LoopRecords', async ({
  page,
}) => {
  const uncaughtPageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    uncaughtPageErrors.push(error);

    console.log(`[pageerror] ${error.name}: ${error.message}`);
  });
  // Recorder warnings are read from the story's SUMMARY PANEL, not from the
  // console. Since F6 the repro story registers an `onRecorderWarning`
  // handler, and `emitWarning` returns early once a callback exists — so the
  // `[ExecutionRecorder]` console fallback is unreachable here and a
  // console-based assertion would be `expect([]).toHaveLength(0)`: an
  // unconditional pass that could never catch a backstop salvage. The panel's
  // `recorderWarnings` / `recorderWarningsObserved` fields carry the real
  // signal, and `c1-recorder-warning-channel.spec.ts` proves that channel is
  // live.
  //
  // NOT listened for here: the dev-only `[ExecutionRecorder:dev]` consistency
  // assertion. It fires only from `endScope`, and `endScope` is called only by
  // `executeGroupScope` — this spec builds two LOOPS and no node groups at
  // all, so the probe never runs and asserting on it would be an empty array
  // in a different costume. (The sibling au01 spec reaches `endScope` but has
  // no loops or switches, so the probe early-returns there instead; same dead
  // assertion, different reason.) That probe is exercised directly in
  // `src/__tests__/utils/nodeRunner/recorderConcurrentSiblings.test.ts`.

  await navigateToStory(page, STORY_REPRO);

  /**
   * Drag a wire and ASSERT the edge count went up by one. A ReactFlow drag
   * that silently misses (drop point off-handle, overlay interception) would
   * otherwise cascade into a confusing downstream failure — this pins the
   * exact wire that failed instead.
   */
  async function wireAndVerify(
    label: string,
    source: ReturnType<typeof getHandleByName>,
    target: ReturnType<typeof getHandleByName>,
  ): Promise<void> {
    const before = await getAllEdges(page).count();
    await dragBetweenLocators(page, source, target);
    await expect(getAllEdges(page), `wire failed: ${label}`).toHaveCount(
      before + 1,
    );

    console.log(`[wire] ${label} ✓`);
  }

  // ── 1. Build both loops through the real UI ─────────────────────────
  // Layout: everything inside x∈[80,1290], y∈[80,840] — comfortably on a
  // 1920×1080 viewport and clear of the runner-panel strip at the bottom.
  // Loop A (FAST): bound triplet + connected 1-Buffer body + outside IO.
  // (createLoopStructure places A's body Buffer at ~(496, 320) itself.)
  const loopA = await createLoopStructure(page, {
    origin: { x: 340, y: 80 },
    body: 'connected',
    outside: 'connected',
  });

  console.log(
    `[build] loop A: start=${loopA.loopStartId} stop=${loopA.loopStopId} end=${loopA.loopEndId} body=${loopA.bodyNodes.join(',')}`,
  );

  // Loop B (SLOW): bound triplet + outside IO, body wired manually as a
  // THREE-Buffer chain (same wiring shape `createLoopStructure` uses for its
  // single-Buffer body, repeated).
  const loopB = await createLoopStructure(page, {
    origin: { x: 340, y: 490 },
    body: 'none',
    outside: 'connected',
  });
  const chainBuffer1 = await addNode(
    page,
    { x: 340, y: 700 },
    MENU_PATH_UTILITY,
    NODE_BUFFER,
  );
  const chainBuffer2 = await addNode(
    page,
    { x: 620, y: 700 },
    MENU_PATH_UTILITY,
    NODE_BUFFER,
  );
  const chainBuffer3 = await addNode(
    page,
    { x: 900, y: 700 },
    MENU_PATH_UTILITY,
    NODE_BUFFER,
  );
  await wireAndVerify(
    'loopB.start.infer-out → chain1.In',
    getInferOutput(page, loopB.loopStartId, 'loopStart'),
    getHandleByName(page, chainBuffer1, HANDLE_IN, 'target'),
  );
  await wireAndVerify(
    'chain1.Out → chain2.In',
    getHandleByName(page, chainBuffer1, HANDLE_GATE_OUT, 'source'),
    getHandleByName(page, chainBuffer2, HANDLE_IN, 'target'),
  );
  await wireAndVerify(
    'chain2.Out → chain3.In',
    getHandleByName(page, chainBuffer2, HANDLE_GATE_OUT, 'source'),
    getHandleByName(page, chainBuffer3, HANDLE_IN, 'target'),
  );
  await wireAndVerify(
    'chain3.Out → loopB.stop.infer-in',
    getHandleByName(page, chainBuffer3, HANDLE_GATE_OUT, 'source'),
    getInferInput(page, loopB.loopStopId, 'loopStop'),
  );
  await wireAndVerify(
    'chain3.Out → loopB.stop.condition',
    getHandleByName(page, chainBuffer3, HANDLE_GATE_OUT, 'source'),
    getLoopStopCondition(page, loopB.loopStopId),
  );

  console.log(
    `[build] loop B: start=${loopB.loopStartId} stop=${loopB.loopStopId} end=${loopB.loopEndId} chain=${chainBuffer1},${chainBuffer2},${chainBuffer3}`,
  );

  expect(uncaughtPageErrors, 'graph construction must not crash').toHaveLength(
    0,
  );

  // ── 2. Export the built graph and save the fixture ──────────────────
  const exportedJson = await exportGraphStateViaUi(page);
  await fs.mkdir(path.dirname(OUTPUT_FIXTURE), { recursive: true });
  await fs.writeFile(OUTPUT_FIXTURE, exportedJson, 'utf-8');

  console.log(`[build] sibling-loops fixture saved: ${OUTPUT_FIXTURE}`);

  // ── 3. Clear and RE-IMPORT through the real UI ──────────────────────
  await clearAllNodes(page);
  await importGraphStateViaUi(page, exportedJson, TOTAL_NODES);

  console.log('[build] round-trip complete — running on the IMPORTED state');

  // ── 4. Run ──────────────────────────────────────────────────────────
  await clickRun(page);
  await waitForRunnerState(page, 'Completed', 90_000);

  const summaryText = await page
    .getByTestId('repro-record-summary')
    .textContent();
  const summary = JSON.parse(summaryText ?? 'null') as RecordSummary;

  console.log('');

  console.log(
    '════════ EXECUTION RECORD SUMMARY (from the story panel) ════════',
  );

  console.log(JSON.stringify(summary, null, 2));

  await page.screenshot({
    path: 'e2e/repro/artifacts/au02-both-loop-records.png',
    fullPage: true,
  });

  // ── The fix-holds assertions ────────────────────────────────────────
  expect(summary.status).toBe('completed');
  expect(summary.errorCount).toBe(0);

  // The slow loop's chain buffers RAN — their steps are in the record…
  for (const chainBufferId of [chainBuffer1, chainBuffer2, chainBuffer3]) {
    expect(
      summary.topLevelSteps.some(
        (step) => step.includes(chainBufferId) && step.includes('completed'),
      ),
      `chain buffer ${chainBufferId} must appear as a completed step`,
    ).toBe(true);
  }

  // Structure ids for membership; keys are opaque identities checked
  // separately below.
  const recordedStructureIds = summary.loopRecords.map(
    (loopRecord) => loopRecord.loopStructureId,
  );
  const recordedLoopKeys = summary.loopRecords.map(
    (loopRecord) => loopRecord.loopKey,
  );
  const nestedKeysSeen = summary.loopRecords.flatMap((loopRecord) =>
    loopRecord.nestedLoopKeysPerIteration.flat(),
  );

  console.log('');

  console.log('════════ AU-02 VERDICT ════════');

  console.log(`loop A structure id (start node): ${loopA.loopStartId}`);

  console.log(`loop B structure id (start node): ${loopB.loopStartId}`);

  console.log(`top-level loopRecords keys: [${recordedLoopKeys.join(', ')}]`);

  console.log(
    `nested loop keys inside iterations: [${nestedKeysSeen.join(', ')}]`,
  );

  // BOTH loops are recorded top-level — the slow sibling no longer vanishes
  // or gets mis-filed as nested.
  expect(
    recordedStructureIds,
    'loop A must be a top-level LoopRecord',
  ).toContain(loopA.loopStartId);
  expect(
    recordedStructureIds,
    'loop B must be a top-level LoopRecord (AU-02 regression)',
  ).toContain(loopB.loopStartId);
  expect(summary.loopRecords).toHaveLength(2);

  // KEY-FORMAT pin, in the browser: both loops are root-owned, so each key is
  // the JSON array of its own single-segment path. Literal on purpose — a
  // format change must fail here, not silently reshape every export.
  expect([...recordedLoopKeys].sort()).toEqual(
    [`["${loopA.loopStartId}"]`, `["${loopB.loopStartId}"]`].sort(),
  );
  for (const loopRecord of summary.loopRecords) {
    expect(loopRecord.ownerInstancePath).toEqual([]);
  }

  // Nothing is nested anywhere — these are independent siblings.
  expect(
    nestedKeysSeen,
    'no loop may be mis-filed as nested (AU-02 regression)',
  ).toHaveLength(0);

  // Both loops actually iterated.
  for (const loopRecord of summary.loopRecords) {
    expect(
      loopRecord.totalIterations,
      `${loopRecord.loopKey} must have completed at least one iteration`,
    ).toBeGreaterThanOrEqual(1);
  }

  // Clean fix, not backstop salvage. Read from the SUMMARY, which the story
  // populates through the real `onRecorderWarning` prop chain — the channel
  // `c1-recorder-warning-channel.spec.ts` proves is live, so a zero here means
  // "nothing fired", not "nothing could fire".
  expect(
    summary.recorderWarnings,
    'no recorder warning may be attributed to this run',
  ).toHaveLength(0);
  expect(
    summary.recorderWarningsObserved,
    'the harness must not have observed ANY warning during this run',
  ).toBe(0);
  expect(uncaughtPageErrors).toHaveLength(0);
});
