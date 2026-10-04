import { test, expect } from '@playwright/test';
import { navigateToStory } from '../actions/graph/graphCanvas.actions';
import { addNode } from '../helpers/addNode';
import {
  clickRun,
  waitForRunnerState,
} from '../actions/runnerPanel/runnerPanel.actions';
import { MENU_PATH_IO, NODE_BIT_INPUT } from '../constants';

/**
 * NEGATIVE CONTROL for the recorder-warning channel (Plan C F6, review
 * finding CP-14).
 *
 * The AU-01 and AU-02 guards both end with
 * `expect(recorderWarnings).toHaveLength(0)`. That assertion is only worth
 * anything if a warning COULD have reached them — and after the fix nothing
 * a user can do through the UI makes the recorder warn, which is precisely
 * what makes the assertion unfalsifiable on its own. An empty list is
 * indistinguishable from a channel that was never wired.
 *
 * This spec closes that hole from the other side. With the story's
 * `induceRecorderWarning` arg on, the story supplies a run target that emits
 * ONE synthetic warning through the `onRecorderWarning` it was handed, then
 * delegates to the real in-process executor. The warning therefore travels
 * the entire production path:
 *
 *   FullGraphProps.onRecorderWarning
 *     → RunnerOverlay
 *       → useNodeRunner (ref, read at emit time)
 *         → ExecuteRunContext.onRecorderWarning
 *           → the story's accumulator
 *             → summarizeExecutionRecordForRepro
 *               → the `repro-record-summary` panel this spec reads
 *
 * PASS = the channel is live, so the sibling guards' zero-warning assertions
 * mean "nothing fired", not "nothing could fire". A break anywhere in that
 * chain — a dropped prop, a stale ref, a summarizer that forgets the field —
 * turns this red while every other suite stays green.
 *
 * Run it alone (per this config's convention):
 *   npx playwright test --config=e2e/playwright.repro.config.ts \
 *     e2e/repro/c1-recorder-warning-channel.spec.ts --workers=1
 */

type WarningSummary = {
  status: string;
  recorderWarnings: Array<{
    kind: string;
    key: string;
    recordId: string;
    message: string;
  }>;
  recorderWarningsObserved: number;
};

const STORY_ID = 'organisms-fullgraphrepro--recorder-concurrency-playground';

test('the onRecorderWarning channel carries a warning end to end (F6 negative control)', async ({
  page,
}) => {
  const uncaughtPageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    uncaughtPageErrors.push(error);

    console.log(`[pageerror] ${error.name}: ${error.message}`);
  });

  // The story arg switches in the injecting run target. Storybook reads args
  // from the iframe URL, so no in-page plumbing is needed.
  await navigateToStory(page, `${STORY_ID}&args=induceRecorderWarning:!true`);

  // ── A minimal runnable graph ────────────────────────────────────────
  // The control is about the WARNING channel, not about topology: one node
  // is enough to produce a real run with a real record id.
  await addNode(page, { x: 400, y: 300 }, MENU_PATH_IO, NODE_BIT_INPUT);

  // ── Run ─────────────────────────────────────────────────────────────
  await clickRun(page);
  await waitForRunnerState(page, 'Completed', 60_000);

  const summaryText = await page
    .getByTestId('repro-record-summary')
    .textContent();
  const summary = JSON.parse(summaryText ?? 'null') as WarningSummary;

  console.log('');

  console.log('════════ RECORDER-WARNING CHANNEL SUMMARY ════════');

  console.log(JSON.stringify(summary, null, 2));

  // THE control: a warning arrived, and it arrived attributed to THIS run.
  expect(
    summary.recorderWarningsObserved,
    'the story must have observed at least one warning — an empty channel here means the prop chain is broken',
  ).toBeGreaterThan(0);
  expect(
    summary.recorderWarnings,
    'the warning must be attributed to the displayed run via recordId',
  ).toHaveLength(1);

  const [warning] = summary.recorderWarnings;
  expect(warning.kind).toBe('orphan-promoted');
  expect(warning.message).toContain('synthetic negative-control warning');
  // `recordId` is what ties a warning to its run; a blank one would make the
  // summary's per-run attribution meaningless.
  expect(warning.recordId).toBeTruthy();

  expect(uncaughtPageErrors).toHaveLength(0);
});
