import type { ExecutionRecord } from '@/utils/nodeRunner/types';
import type { RecorderWarning } from '@/utils/nodeRunner/executionRecorder';

/**
 * Shared serializer for the recorder-concurrency repro harness.
 *
 * DIAGNOSTIC ONLY — deliberately absent from every barrel (`index.ts`,
 * `src/index.ts`): this shape exists so the `e2e/repro/*.spec.ts` guards can
 * read a run's structure out of the DOM, and it must never become something
 * consumers depend on.
 *
 * It exposes exactly the structures the recorder-concurrency bugs corrupt:
 * - which steps each GROUP's innerRecord claims (AU-01 — a step whose
 *   `instancePath` names a DIFFERENT group is the smoking gun),
 * - which LOOP records exist at the top level and what nests inside each
 *   iteration (AU-02 — a sibling loop missing here has vanished),
 * - the recorder WARNINGS the run produced (a healthy run produces none; a
 *   non-empty list means the salvage backstop had to compensate).
 */

/** One warning, flattened for the DOM. Mirrors `RecorderWarning`. */
type ReproRecorderWarning = {
  kind: string;
  key: string;
  recordId: string;
  message: string;
};

type ReproRecordSummary = {
  status: string;
  errorCount: number;
  topLevelSteps: string[];
  groupRecords: Array<{
    groupKey: string;
    groupNodeId: string;
    ownerInstancePath: readonly string[];
    innerSteps: string[];
  }>;
  loopRecords: Array<{
    loopKey: string;
    /** The structure's OWN id (the LoopStart node). Match on this, never on
     *  `loopKey` — the key is an opaque full-path identity. */
    loopStructureId: string;
    ownerInstancePath: readonly string[];
    totalIterations: number;
    stepsPerIteration: string[][];
    nestedLoopKeysPerIteration: string[][];
  }>;
  /**
   * ALWAYS present, so a spec can tell "no warnings" from "the harness is
   * broken" only by reading `recorderWarningsObserved` — see below.
   */
  recorderWarnings: ReproRecorderWarning[];
  /**
   * How many warnings this harness has seen for ANY run since the story
   * mounted. A guard spec asserting `recorderWarnings: []` is otherwise
   * indistinguishable from a spec whose warning channel was never wired at
   * all; the negative-control story arg drives this above zero on demand so
   * the channel is proven live.
   */
  recorderWarningsObserved: number;
};

function describeStep(step: ExecutionRecord['steps'][number]): string {
  const instanceSuffix = step.instancePath?.length
    ? ` @${step.instancePath.join('/')}`
    : '';
  return `${step.nodeTypeId}(${step.nodeId})${instanceSuffix}: ${step.status}`;
}

/**
 * Build the DOM-facing summary text.
 *
 * `recorderWarnings` is filtered to the run being displayed by `recordId` —
 * the field `RecorderWarning` carries for exactly this reason. A warning
 * emitted during finalize arrives BEFORE the finished record reaches the
 * story, so clearing the accumulator on record change would erase the very
 * warnings that run produced; matching on `recordId` keeps each run's
 * warnings with their own run without any clearing at all.
 */
function summarizeExecutionRecordForRepro(
  record: ExecutionRecord | null,
  recorderWarnings: readonly RecorderWarning[] = [],
): string {
  if (!record) {
    // ALWAYS JSON, even with nothing to show: every repro spec does
    // `JSON.parse(summaryText)`, and a prose string here would throw a
    // `SyntaxError` instead of failing an assertion legibly. The runner sets
    // the record to `null` at the START of each run, so this branch is on the
    // path of every re-run.
    //
    // `recorderWarnings` stays EMPTY here rather than dumping the accumulator:
    // with no record there is no `recordId` to attribute against, and showing
    // a previous run's warnings under one `no-record` object is precisely the
    // ambiguity `recordId` exists to remove. The running total is still
    // reported.
    //
    // ONE LINE, deliberately. This panel sits in a flex column above the
    // canvas, so its height is subtracted from the canvas the e2e specs click
    // into. Pretty-printing this branch made it 6 lines / ~106px instead of
    // ~20px, which shrank the canvas by ~86px and pushed context menus opened
    // near the bottom (au02 adds nodes at y=700) into the clipped region — the
    // specs then failed during graph CONSTRUCTION, nowhere near an assertion.
    // Compactness costs a reader nothing: it is parsed, not read.
    return JSON.stringify({
      status: 'no-record',
      recorderWarnings: [],
      recorderWarningsObserved: recorderWarnings.length,
      note: 'No execution record yet — build or import a graph and press Run.',
    });
  }

  const summary: ReproRecordSummary = {
    status: record.status,
    errorCount: record.errors.length,
    topLevelSteps: record.steps.map(describeStep),
    groupRecords: Array.from(record.groupRecords.entries()).map(
      ([groupKey, groupRecord]) => ({
        groupKey,
        groupNodeId: groupRecord.groupNodeId,
        ownerInstancePath: groupRecord.ownerInstancePath ?? [],
        innerSteps: groupRecord.innerRecord.steps.map(describeStep),
      }),
    ),
    loopRecords: Array.from(record.loopRecords.entries()).map(
      ([loopKey, loopRecord]) => ({
        loopKey,
        loopStructureId: loopRecord.loopStructureId,
        ownerInstancePath: loopRecord.ownerInstancePath ?? [],
        totalIterations: loopRecord.totalIterations,
        stepsPerIteration: loopRecord.iterations.map((iterationRecord) =>
          iterationRecord.stepRecords.map(describeStep),
        ),
        nestedLoopKeysPerIteration: loopRecord.iterations.map(
          (iterationRecord) =>
            Array.from(iterationRecord.nestedLoopRecords.keys()),
        ),
      }),
    ),
    recorderWarnings: recorderWarnings
      .filter((warning) => warning.recordId === record.id)
      .map(flattenWarning),
    recorderWarningsObserved: recorderWarnings.length,
  };

  return JSON.stringify(summary, null, 2);
}

function flattenWarning(warning: RecorderWarning): ReproRecorderWarning {
  return {
    kind: warning.kind,
    key: warning.key,
    recordId: warning.recordId,
    message: warning.message,
  };
}

export { summarizeExecutionRecordForRepro };
export type { ReproRecordSummary, ReproRecorderWarning };
