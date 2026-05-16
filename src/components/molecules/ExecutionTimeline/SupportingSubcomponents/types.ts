import type {
  ExecutionStepRecord,
  ExecutionStepRecordStatus,
  LoopRecord,
  LoopIterationRecord,
  LoopPhase,
} from '@/utils/nodeRunner/types';

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────

export const TRACK_HEIGHT = 28;
export const BLOCK_PADDING_Y = 3;
export const SUB_ROW_GAP = 4;
export const RULER_HEIGHT = 32;
export const MIN_BLOCK_WIDTH = 6;
export const MIN_LABEL_GAP_PX = 48;
export const GUTTER_WIDTH = 0;
export const TIME_PAD_RIGHT_MS = 0.15;
export const LABEL_MIN_WIDTH = 50;
export const LABEL_MIN_HEIGHT = 18;

export const TIME_MODE_OPTIONS = [
  { value: 'execution' as const, label: 'Execution' },
  { value: 'wallClock' as const, label: 'Wall Clock' },
];

// ─────────────────────────────────────────────────────
// Style maps
// ─────────────────────────────────────────────────────

export const statusBlockClass: Record<ExecutionStepRecordStatus, string> = {
  completed: 'bg-runner-bar-completed',
  errored: 'bg-runner-bar-errored',
  skipped: 'bg-status-skipped',
};

export const statusTooltipClass: Record<ExecutionStepRecordStatus, string> = {
  completed: 'text-status-completed',
  errored: 'text-status-errored',
  skipped: 'text-secondary-light-gray',
};

export const statusLabel: Record<ExecutionStepRecordStatus, string> = {
  completed: 'Done',
  errored: 'Error',
  skipped: 'Skipped',
};

// ─────────────────────────────────────────────────────
// Timeline segment types
// ─────────────────────────────────────────────────────

export type FlatSegment = {
  kind: 'flat';
  steps: ExecutionStepRecord[];
};

export type LoopIterationDisplay = {
  iteration: number;
  conditionValue: boolean;
  steps: ExecutionStepRecord[];
  nestedLoopRecords: ReadonlyMap<string, LoopRecord>;
};

export type AdjustedLoopIterationRecord = LoopIterationRecord & {
  adjustedStartTime: number;
  adjustedEndTime: number;
  adjustedDuration: number;
};

export type LoopSegment = {
  kind: 'loop';
  loopStructureId: string;
  loopRecord: LoopRecord;
  adjustedIterations: AdjustedLoopIterationRecord[];
  iterations: LoopIterationDisplay[];
};

export type TimelineSegment = FlatSegment | LoopSegment;

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

export function niceTickInterval(roughInterval: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(roughInterval)));
  const residual = roughInterval / mag;
  if (residual <= 1) return mag;
  if (residual <= 2) return 2 * mag;
  if (residual <= 5) return 5 * mag;
  return 10 * mag;
}

export function formatTime(ms: number): string {
  if (ms === 0) return '0';
  if (ms < 0) return '0';
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatDuration(step: ExecutionStepRecord): string {
  if (step.estimatedTiming) return '< 0.1ms';
  return `${step.duration.toFixed(2)}ms`;
}

/** Group steps by concurrencyLevel into sorted rows. */
export function groupByLevel(
  steps: readonly ExecutionStepRecord[],
): Map<number, ExecutionStepRecord[]> {
  const grouped = new Map<number, ExecutionStepRecord[]>();
  for (const step of steps) {
    const existing = grouped.get(step.concurrencyLevel);
    if (existing) existing.push(step);
    else grouped.set(step.concurrencyLevel, [step]);
  }
  return grouped;
}

/** Phase ordering for deterministic sort within loop iterations. */
export const PHASE_ORDER: Record<LoopPhase, number> = {
  loopStart: 0,
  preStop: 1,
  loopStop: 2,
  postStop: 3,
  loopEnd: 4,
};

/** Compare two steps by phase order (primary) then startTime (tiebreaker). */
export function compareByPhase(
  a: ExecutionStepRecord,
  b: ExecutionStepRecord,
): number {
  const pa = a.loopPhase ? PHASE_ORDER[a.loopPhase] : 1; // default to preStop for body steps
  const pb = b.loopPhase ? PHASE_ORDER[b.loopPhase] : 1;
  if (pa !== pb) return pa - pb;
  return a.startTime - b.startTime;
}

/** Build a LoopSegment from a LoopRecord, populating iteration displays. */
export function buildLoopSegment(
  loopId: string,
  loopRec: LoopRecord,
  adjustForPause: boolean,
): LoopSegment {
  const adjustedIterations: AdjustedLoopIterationRecord[] =
    loopRec.iterations.map((iter) => {
      const steps = iter.stepRecords;
      if (steps.length === 0) {
        // In-progress iteration with no steps yet — use raw iteration times
        return {
          ...iter,
          adjustedStartTime: iter.startTime,
          adjustedEndTime: iter.endTime,
          adjustedDuration: iter.duration,
        };
      }

      // Derive iteration boundaries from constituent steps.
      // This ensures parity with how individual step blocks are positioned:
      // in execution mode each step uses (startTime - pauseAdjustment).
      let minStart = Infinity;
      let maxEnd = -Infinity;
      for (const s of steps) {
        const adjStart = adjustForPause
          ? s.startTime - s.pauseAdjustment
          : s.startTime;
        const adjEnd = adjustForPause
          ? s.endTime - s.pauseAdjustment
          : s.endTime;
        if (adjStart < minStart) minStart = adjStart;
        if (adjEnd > maxEnd) maxEnd = adjEnd;
      }

      return {
        ...iter,
        adjustedStartTime: minStart,
        adjustedEndTime: maxEnd,
        adjustedDuration: maxEnd - minStart,
      };
    });

  return {
    kind: 'loop',
    loopStructureId: loopId,
    loopRecord: loopRec,
    adjustedIterations,
    iterations: loopRec.iterations.map((iter) => ({
      iteration: iter.iteration,
      conditionValue: iter.conditionValue,
      // Strip parent-loop attribution so buildSegments treats these as flat.
      // Sort by phase order for deterministic vertical positioning.
      steps: [...iter.stepRecords].sort(compareByPhase).map((s) => ({
        ...s,
        startTime: adjustForPause
          ? s.startTime - s.pauseAdjustment
          : s.startTime,
        endTime: adjustForPause ? s.endTime - s.pauseAdjustment : s.endTime,
        loopStructureId: undefined,
        loopIteration: undefined,
      })),
      nestedLoopRecords: iter.nestedLoopRecords,
    })),
  };
}

/**
 * Partition steps into ordered flat and loop segments.
 *
 * Steps are routed to their loop segment when the loopStructureId is present
 * in the provided loopRecords map. Steps belonging to deeper-nested loops
 * (IDs not in loopRecords) are skipped — they are rendered recursively when
 * the user drills into an iteration via IterationDetail.
 *
 * Loop records that have no body steps in the flat steps array (i.e. nested
 * loops whose steps live only in LoopIterationRecord.stepRecords) are still
 * created as segments and interleaved by start time.
 */
export function buildSegments(
  steps: readonly ExecutionStepRecord[],
  loopRecords: ReadonlyMap<string, LoopRecord>,
  adjustForPause: boolean,
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let currentFlat: ExecutionStepRecord[] = [];

  // Track which loop segments have been created (from step routing)
  const loopSegmentMap = new Map<string, LoopSegment>();

  for (const step of steps) {
    // Structural loop steps (Loop Start/Stop/End) have loopStructureId but
    // no loopIteration — render them as regular flat blocks on the timeline
    const isLoopBody =
      step.loopStructureId !== undefined && step.loopIteration !== undefined;

    if (!isLoopBody) {
      // Check if this is a structural step for a nested loop we don't own —
      // skip it so it doesn't appear as a flat block at this level
      if (
        step.loopStructureId !== undefined &&
        !loopRecords.has(step.loopStructureId)
      ) {
        continue;
      }
      currentFlat.push(step);
    } else {
      const loopId = step.loopStructureId!;
      const loopRec = loopRecords.get(loopId);

      if (!loopRec) {
        // Step belongs to a deeper-nested loop — skip it at this level
        continue;
      }

      // Flush any pending flat steps before this loop
      if (!loopSegmentMap.has(loopId) && currentFlat.length > 0) {
        segments.push({ kind: 'flat', steps: currentFlat });
        currentFlat = [];
      }

      // Get or create loop segment
      if (!loopSegmentMap.has(loopId)) {
        const loopSeg = buildLoopSegment(loopId, loopRec, adjustForPause);
        loopSegmentMap.set(loopId, loopSeg);
        segments.push(loopSeg);
      }
    }
  }

  // Flush remaining flat steps
  if (currentFlat.length > 0) {
    segments.push({ kind: 'flat', steps: currentFlat });
  }

  // Create segments for any loop records not encountered via steps
  // (nested loops whose body steps aren't in our flat steps array).
  // Insert them at the right position by start time.
  for (const [loopId, loopRec] of loopRecords) {
    if (loopSegmentMap.has(loopId)) continue;

    const loopSeg = buildLoopSegment(loopId, loopRec, adjustForPause);
    const loopStart = loopRec.iterations[0]?.startTime ?? 0;

    // Find insertion point: after the last segment that starts before this loop
    let insertIdx = segments.length;
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const segStart =
        seg.kind === 'flat'
          ? (seg.steps[0]?.startTime ?? 0)
          : (seg.loopRecord.iterations[0]?.startTime ?? 0);
      if (segStart <= loopStart) {
        // If the preceding segment is a flat section, we may need to split it
        if (seg.kind === 'flat') {
          const beforeSteps = seg.steps.filter((s) => s.startTime <= loopStart);
          const afterSteps = seg.steps.filter((s) => s.startTime > loopStart);
          if (beforeSteps.length > 0 && afterSteps.length > 0) {
            // Split the flat segment around the loop
            segments.splice(
              i,
              1,
              { kind: 'flat', steps: beforeSteps },
              loopSeg,
              { kind: 'flat', steps: afterSteps },
            );
            insertIdx = -1; // already inserted
            break;
          }
        }
        insertIdx = i + 1;
        break;
      }
    }
    if (insertIdx >= 0) {
      segments.splice(insertIdx, 0, loopSeg);
    }
  }

  return segments;
}
