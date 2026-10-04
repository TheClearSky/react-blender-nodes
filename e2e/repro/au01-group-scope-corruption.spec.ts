import { promises as fs } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { navigateToStory } from '../actions/graph/graphCanvas.actions';
import {
  importGraphStateViaUi,
  exportGraphStateViaUi,
} from '../actions/importExport/importExport.actions';
import { selectEdgeBetween } from '../actions/graph/edge.actions';
import { pressDelete } from '../actions/graph/selection.actions';
import { getAllEdges } from '../locators/graph/graphCanvas.locators';
import {
  clickRun,
  waitForRunnerState,
} from '../actions/runnerPanel/runnerPanel.actions';

/**
 * AU-01 / C2 REGRESSION GUARD — two group scopes open concurrently must each
 * keep a CLEAN `innerRecord`. (Formerly the bug-confirmation repro for the
 * ambient LIFO scope stack; flipped after the token-based recorder fix —
 * PASS = fix holds.)
 *
 * Setup (all through the real UI):
 *   1. Import `.storybook/static/graphStates/group-two-instances-not-chain-state.json`
 *      via the context-menu Import State flow (REPLACE_STATE + rehydration).
 *      As shipped it is a CHAIN — BitInput → G1 → G2 → BitOutput — so the two
 *      instances sit on DIFFERENT concurrency levels; concurrency needs the
 *      un-chaining below.
 *   2. Delete the `BitInput → G1` and `G1 → G2` edges (concrete `bit` handles,
 *      so this does NOT touch the NS-01 infer-reset path). Both instances are
 *      now in-degree 0 ⇒ the compiler puts them on the SAME level ⇒ the
 *      executor starts both group scopes in one synchronous `.map` pass.
 *   3. Export the modified state as a rerunnable fixture (input to the manual
 *      S9 smoke).
 *   4. Run. The repro story's implementations delay the inner NOT gate 900 ms,
 *      so both scopes are guaranteed to be open simultaneously.
 *
 * PASS = FIX HOLDS:
 *   - each group's innerRecord contains ONLY steps tagged with its OWN
 *     instance id (including its own NOT step); foreign-tagged steps = 0;
 *   - the story's summary panel reports ZERO recorder warnings for the run
 *     (distinguishes "fix holds" from "backstop salvaged a mistake"); the
 *     panel is fed by the real `onRecorderWarning` prop chain, which
 *     `c1-recorder-warning-channel.spec.ts` proves is live.
 */

const STORY_REPRO = 'organisms-fullgraphrepro--recorder-concurrency-playground';
const SOURCE_FIXTURE = path.resolve(
  process.cwd(),
  '.storybook/static/graphStates/group-two-instances-not-chain-state.json',
);
const OUTPUT_FIXTURE = path.resolve(
  process.cwd(),
  'e2e/repro/fixtures/au01-two-parallel-groups-state.json',
);

type RecordSummary = {
  status: string;
  errorCount: number;
  topLevelSteps: string[];
  groupRecords: Array<{
    /** OPAQUE full-path identity (`["<instance>"]` at root) — never matched
     *  against a bare node id; see `structureRecordKey`. */
    groupKey: string;
    groupNodeId: string;
    ownerInstancePath: string[];
    innerSteps: string[];
  }>;
  loopRecords: unknown[];
  recorderWarnings: Array<{
    kind: string;
    key: string;
    recordId: string;
    message: string;
  }>;
  recorderWarningsObserved: number;
};

test('AU-01 guard: parallel group scopes keep instance-pure innerRecords', async ({
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
  // assertion. It fires only from `endScope` with something still pending, and
  // neither of these graphs can produce that state — this spec's fixture has
  // no loops or switches at all — so asserting on it would be the same empty
  // array in a different costume. That probe is exercised directly in
  // `src/__tests__/utils/nodeRunner/recorderConcurrentSiblings.test.ts`.

  // ── Identify the fixture's node ids dynamically ─────────────────────
  const fixtureJson = await fs.readFile(SOURCE_FIXTURE, 'utf-8');
  const fixture = JSON.parse(fixtureJson) as {
    state: {
      nodes: Array<{ id: string; data: { nodeTypeUniqueId: string } }>;
      edges: Array<{ source: string; target: string }>;
      typeOfNodes: Record<string, { subtree?: unknown }>;
    };
  };
  const groupTypeId = Object.entries(fixture.state.typeOfNodes).find(
    ([, nodeType]) => nodeType.subtree !== undefined,
  )?.[0];
  expect(groupTypeId, 'fixture must contain a group node type').toBeTruthy();
  const groupInstanceIds = fixture.state.nodes
    .filter((node) => node.data.nodeTypeUniqueId === groupTypeId)
    .map((node) => node.id);
  expect(groupInstanceIds).toHaveLength(2);
  const bitInputId = fixture.state.nodes.find(
    (node) => node.data.nodeTypeUniqueId === 'bitConstant',
  )!.id;
  // Chain order: BitInput → firstGroup → secondGroup.
  const firstGroupId = fixture.state.edges.find(
    (edge) => edge.source === bitInputId,
  )!.target;
  const secondGroupId = groupInstanceIds.find((id) => id !== firstGroupId)!;

  console.log(
    `[setup] groupType=${groupTypeId} G1=${firstGroupId} G2=${secondGroupId} bitInput=${bitInputId}`,
  );

  // ── 1. Import through the real UI ───────────────────────────────────
  // The fixture's saved viewport (x≈-422, zoom 0.45) leaves part of the graph
  // OFF-SCREEN at 1920×1080, which breaks the later edge clicks. The viewport
  // is presentation state, not graph semantics — override it in the imported
  // JSON so all four nodes land on-screen. (Node positions span x 333–1889,
  // y 444–831; zoom 0.55 with offset (-100,-150) shows everything.)
  const importedState = JSON.parse(fixtureJson) as {
    state: { viewport?: { x: number; y: number; zoom: number } };
  };
  importedState.state.viewport = { x: -100, y: -150, zoom: 0.55 };
  const importJson = JSON.stringify(importedState);

  await navigateToStory(page, STORY_REPRO);
  await importGraphStateViaUi(page, importJson, 4);
  await expect(getAllEdges(page)).toHaveCount(3);

  // ── 2. Un-chain the groups: delete BitInput→G1 and G1→G2 ────────────
  await selectEdgeBetween(page, bitInputId, firstGroupId);
  await pressDelete(page);
  await expect(getAllEdges(page)).toHaveCount(2);

  await selectEdgeBetween(page, firstGroupId, secondGroupId);
  await pressDelete(page);
  await expect(getAllEdges(page)).toHaveCount(1);

  expect(
    uncaughtPageErrors,
    'edge deletions on concrete bit handles must not crash (NS-01 is infer-only)',
  ).toHaveLength(0);

  // ── 3. Save the parallel-groups state as a rerunnable fixture ───────
  const parallelStateJson = await exportGraphStateViaUi(page);
  await fs.mkdir(path.dirname(OUTPUT_FIXTURE), { recursive: true });
  await fs.writeFile(OUTPUT_FIXTURE, parallelStateJson, 'utf-8');

  console.log(`[setup] parallel-groups fixture saved: ${OUTPUT_FIXTURE}`);

  // ── 4. Run with delayed implementations ─────────────────────────────
  await clickRun(page);
  await waitForRunnerState(page, 'Completed', 60_000);

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
    path: 'e2e/repro/artifacts/au01-clean-group-records.png',
    fullPage: true,
  });

  // ── The fix-holds assertions ────────────────────────────────────────
  expect(summary.status).toBe('completed');
  expect(summary.errorCount).toBe(0);
  expect(summary.groupRecords).toHaveLength(2);

  // Match on the record's OWN id, not on its map key: keys are opaque
  // full-path identities (`["<instance>"]`), which is exactly why every
  // record also carries its identity structurally.
  const recordFor = (groupId: string) =>
    summary.groupRecords.find(
      (groupRecord) => groupRecord.groupNodeId === groupId,
    );
  const firstGroupRecord = recordFor(firstGroupId)!;
  const secondGroupRecord = recordFor(secondGroupId)!;
  expect(firstGroupRecord).toBeTruthy();
  expect(secondGroupRecord).toBeTruthy();

  // KEY-FORMAT pin, in the browser: both instances are root-owned, so each
  // key is the JSON array of its own single-segment path. Written literally
  // so a format change fails here rather than silently reshaping exports.
  expect(firstGroupRecord.groupKey).toBe(`["${firstGroupId}"]`);
  expect(secondGroupRecord.groupKey).toBe(`["${secondGroupId}"]`);
  expect(firstGroupRecord.ownerInstancePath).toEqual([]);
  expect(secondGroupRecord.ownerInstancePath).toEqual([]);

  console.log('');

  console.log('════════ AU-01 VERDICT ════════');

  for (const [ownId, foreignId, groupRecord] of [
    [firstGroupId, secondGroupId, firstGroupRecord],
    [secondGroupId, firstGroupId, secondGroupRecord],
  ] as const) {
    const ownSteps = groupRecord.innerSteps.filter((step) =>
      step.includes(`@${ownId}`),
    );
    const foreignSteps = groupRecord.innerSteps.filter((step) =>
      step.includes(`@${foreignId}`),
    );

    console.log(
      `${ownId}: ${groupRecord.innerSteps.length} inner step(s), ${ownSteps.length} own-tagged, ${foreignSteps.length} foreign-tagged`,
    );

    for (const step of groupRecord.innerSteps) console.log(`   ${step}`);

    // Every inner step belongs to THIS instance — nothing absorbed from the
    // sibling scope, and nothing left untagged.
    expect(
      foreignSteps,
      `${ownId} innerRecord must not claim steps of ${foreignId} (AU-01 regression)`,
    ).toHaveLength(0);
    expect(ownSteps.length).toBe(groupRecord.innerSteps.length);
    expect(groupRecord.innerSteps.length).toBeGreaterThan(0);

    // The instance's OWN delayed NOT step is present and completed.
    expect(
      groupRecord.innerSteps.some(
        (step) =>
          step.startsWith('notGate(') &&
          step.includes(`@${ownId}`) &&
          step.includes('completed'),
      ),
      `${ownId} innerRecord must contain its own completed NOT step`,
    ).toBe(true);
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
