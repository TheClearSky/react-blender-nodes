import { test, expect } from '@playwright/test';
import { navigateToStory } from '../actions/graph/graphCanvas.actions';
import { addNode } from '../helpers/addNode';
import {
  clickRun,
  clickReset,
  clickStop,
  setMode,
  clickStep,
  waitForRunnerState,
  getRunnerState,
} from '../actions/runnerPanel/runnerPanel.actions';
import {
  MENU_PATH_IO,
  MENU_PATH_LOGIC,
  NODE_BIT_INPUT,
  NODE_NOT_GATE,
} from '../constants';

/**
 * RUN IDENTITY — the invariants `onRunEvent` promises, asserted against the
 * real hook.
 *
 * WHY THIS EXISTS AS AN E2E. `useNodeRunner` has no unit coverage and cannot
 * get any here: `vitest.config.ts` runs `environment: 'node'`, and the repo
 * deliberately carries no React test renderer. So every claim about run
 * identity — "a superseded run does not close the live one", "a run that is no
 * longer current writes nothing" — was previously verified only by reading the
 * code or by measuring by hand in a consumer app. Two Critical defects lived
 * in exactly that blind spot:
 *
 *   1. `finalizeRun` read the run id at CALL time, so a superseded run
 *      announced its completion under the LIVE run's id — before that run had
 *      executed a step. A consumer stamping "this graph has been run" on that
 *      event marked a graph fresh that had never run.
 *   2. `stop()` / `reset()` only aborted a signal; the in-flight run then
 *      re-wrote the record and runner state afterwards, so a cancel did not
 *      stick.
 *
 * The story accumulates the stream into `repro-run-events`, so the assertions
 * below read what a real consumer would have received, through the whole
 * production path: FullGraphProps.onRunEvent → RunnerOverlay → useNodeRunner.
 *
 * Run it alone (this config's convention):
 *   npx playwright test --config=e2e/playwright.repro.config.ts \
 *     e2e/repro/c2-run-lifecycle-identity.spec.ts --workers=1
 */

type RunEvent =
  | { kind: 'run:started'; runId: number }
  | { kind: 'run:completed'; runId: number }
  | {
      kind: 'run:aborted';
      runId: number;
      reason: 'stopped' | 'superseded' | 'failed';
      initiator?: 'user' | 'consumer';
    }
  | { kind: 'run:reset'; initiator?: 'user' | 'consumer' };

const STORY_ID = 'organisms-fullgraphrepro--recorder-concurrency-playground';

async function readRunEvents(page: import('@playwright/test').Page) {
  const text = await page.getByTestId('repro-run-events').textContent();
  return JSON.parse(text ?? '[]') as RunEvent[];
}

/** Every started run must be closed exactly once, BY ITS OWN id. */
function assertTerminalPerRun(events: RunEvent[]) {
  const started = events
    .filter((event) => event.kind === 'run:started')
    .map((event) => (event as { runId: number }).runId);
  for (const runId of started) {
    const terminals = events.filter(
      (event) =>
        (event.kind === 'run:completed' || event.kind === 'run:aborted') &&
        (event as { runId: number }).runId === runId,
    );
    expect(
      terminals,
      `run ${runId} must have exactly one terminal event, got ${JSON.stringify(terminals)} in ${JSON.stringify(events)}`,
    ).toHaveLength(1);
  }
  // …and no terminal event may name a run that never started.
  for (const event of events) {
    if (event.kind === 'run:completed' || event.kind === 'run:aborted') {
      expect(started, `terminal event for an unstarted run`).toContain(
        (event as { runId: number }).runId,
      );
    }
  }
}

test.describe('Run lifecycle identity (onRunEvent)', () => {
  test('a completed run opens and closes under one id, in order', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_ID);
    await addNode(page, { x: 400, y: 300 }, MENU_PATH_IO, NODE_BIT_INPUT);

    await clickRun(page);
    await waitForRunnerState(page, 'Completed', 60_000);

    const events = await readRunEvents(page);
    assertTerminalPerRun(events);
    expect(events.map((event) => event.kind)).toEqual([
      'run:started',
      'run:completed',
    ]);
    expect((events[0] as { runId: number }).runId).toBe(
      (events[1] as { runId: number }).runId,
    );
  });

  test('a second run does not steal the first one’s completion', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_ID);
    await addNode(page, { x: 400, y: 300 }, MENU_PATH_IO, NODE_BIT_INPUT);

    await clickRun(page);
    await waitForRunnerState(page, 'Completed', 60_000);
    // Run is gated behind Reset once a run has completed, so a second run goes
    // through Idle. The reset's own events are expected in the stream; what is
    // asserted below is the pairing of starts to completions.
    await clickReset(page);
    await waitForRunnerState(page, 'Idle');
    await clickRun(page);
    await waitForRunnerState(page, 'Completed', 60_000);

    const events = await readRunEvents(page);
    assertTerminalPerRun(events);

    const runIds = events
      .filter((event) => event.kind === 'run:started')
      .map((event) => (event as { runId: number }).runId);
    expect(runIds).toHaveLength(2);
    expect(runIds[1]).toBeGreaterThan(runIds[0]);

    // The defect this pins: run 1's completion arriving under run 2's id.
    const completions = events
      .filter((event) => event.kind === 'run:completed')
      .map((event) => (event as { runId: number }).runId);
    expect(completions).toEqual(runIds);
  });

  test('Reset reports itself as a USER halt and closes any open run', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_ID);
    await addNode(page, { x: 400, y: 300 }, MENU_PATH_IO, NODE_BIT_INPUT);

    await clickRun(page);
    await waitForRunnerState(page, 'Completed', 60_000);
    await clickReset(page);
    await waitForRunnerState(page, 'Idle');

    const events = await readRunEvents(page);
    assertTerminalPerRun(events);

    const reset = events.find((event) => event.kind === 'run:reset');
    expect(reset, 'Reset must announce itself').toBeDefined();
    // `initiator` is what lets a consumer tell a person pressing Reset from
    // its own programmatic halt (e.g. replacing the project). A panel click is
    // always the user.
    expect((reset as { initiator?: string }).initiator).toBe('user');

    // Nothing may arrive after the reset for a run that is now gone.
    const afterReset = events.slice(events.indexOf(reset as RunEvent) + 1);
    expect(
      afterReset,
      'a run closed by Reset must not emit anything afterwards',
    ).toEqual([]);
  });

  test('a SUPERSEDED run is closed under its own id, and never closes the live one', async ({
    page,
  }) => {
    // THE case the whole run-identity change exists for, and the only one that
    // can reproduce it: a run must still be OPEN when the next one starts.
    // Neither the panel nor the imperative handle can do it from `paused`
    // (both RESUME instead), so the story opens two runs in one tick — which
    // is exactly the hazard for a consumer whose auto-run can fire twice.
    await navigateToStory(page, STORY_ID);
    // A node with a REAL delay (this story's gates await a 300 ms timeout), so
    // run 1 is genuinely mid-flight when run 2 supersedes it. With an instant
    // graph both runs finish before anything can be observed and the defect
    // leaves no trace — which is exactly why it went unnoticed.
    await addNode(page, { x: 400, y: 300 }, MENU_PATH_LOGIC, NODE_NOT_GATE);

    // Sample the stream AND the runner state together while the runs settle.
    // This is the only way to catch the defect: under it the event stream is
    // byte-identical to the correct one — one `run:completed` carrying the
    // last started id — because the superseded run CLOSES the live run's id
    // and the live run's own completion is then swallowed. What differs is
    // WHEN: the completion fires as the SUPERSEDED run unwinds, while the
    // surviving run is still executing.
    const samples: { state: string; completions: number }[] = [];
    await page.getByTestId('story-force-double-run').click();
    for (let tick = 0; tick < 120; tick += 1) {
      const [state, events] = await Promise.all([
        getRunnerState(page),
        readRunEvents(page),
      ]);
      samples.push({
        state,
        completions: events.filter((event) => event.kind === 'run:completed')
          .length,
      });
      if (state === 'Completed' || state === 'Errored') break;
      await page.waitForTimeout(25);
    }
    await waitForRunnerState(page, 'Completed', 60_000);

    const premature = samples.find(
      (sample) => sample.completions > 0 && sample.state === 'Running',
    );
    expect(
      premature,
      'a run:completed arrived while the runner was still Running — the superseded run closed the live run',
    ).toBeUndefined();

    const events = await readRunEvents(page);
    assertTerminalPerRun(events);

    const superseded = events.find(
      (event) => event.kind === 'run:aborted' && event.reason === 'superseded',
    ) as { runId: number } | undefined;
    expect(
      superseded,
      `the parked run must be superseded, got ${JSON.stringify(events)}`,
    ).toBeDefined();

    const startedIds = events
      .filter((event) => event.kind === 'run:started')
      .map((event) => (event as { runId: number }).runId);
    expect(startedIds.length).toBeGreaterThanOrEqual(2);

    expect(superseded?.runId).toBe(startedIds[0]);
    const completion = events.find(
      (event) => event.kind === 'run:completed',
    ) as { runId: number } | undefined;
    expect(completion?.runId).toBe(startedIds[startedIds.length - 1]);

    // THE assertion that actually catches the defect. The event STREAM looks
    // identical whether run 2 completed or run 1 completed under run 2's id —
    // in both cases you see one `run:completed` carrying the last started id.
    // What differs is which run's RECORD survives: a superseded run finalizes
    // a `'cancelled'` record, so if it is allowed to write, the panel ends up
    // describing the run that was thrown away.
    const summary = JSON.parse(
      (await page.getByTestId('repro-record-summary').textContent()) ?? 'null',
    ) as { status: string };
    expect(
      summary.status,
      "the SURVIVING run's record must win; 'cancelled' means the superseded run wrote over it",
    ).toBe('completed');
  });

  test('Stop mid-run closes THAT run, as a user halt, and nothing follows it', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_ID);
    await addNode(page, { x: 400, y: 300 }, MENU_PATH_IO, NODE_BIT_INPUT);

    // Step-by-step leaves the run genuinely open between steps, which is the
    // only way to press Stop with a run still in flight.
    await setMode(page, 'Step-by-Step');
    await clickStep(page);
    await waitForRunnerState(page, 'Paused', 60_000);
    await clickStop(page);

    const events = await readRunEvents(page);
    assertTerminalPerRun(events);

    const aborted = events.find((event) => event.kind === 'run:aborted') as
      | { runId: number; reason: string; initiator?: string }
      | undefined;
    expect(aborted, 'Stop must abort the open run').toBeDefined();
    expect(aborted?.reason).toBe('stopped');
    expect(aborted?.initiator).toBe('user');
    expect(aborted?.runId).toBe(
      (
        events.find((event) => event.kind === 'run:started') as {
          runId: number;
        }
      ).runId,
    );
  });
});
