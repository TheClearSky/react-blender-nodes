import type {
  ExecutionRecord,
  ExecutionRecordStatus,
  ExecutionStepRecord,
  RecordedInputHandleValue,
  RecordedOutputHandleValue,
  GraphError,
  ConcurrencyLevelRecord,
  LoopRecord,
  LoopIterationRecord,
  GroupRecord,
  LoopPhase,
} from './types';

/**
 * Monotonic timer wrapper that guarantees strictly increasing timestamps.
 *
 * `performance.now()` is quantized to ~5µs (Chrome) or ~1ms (Firefox)
 * due to Spectre mitigations. Synchronous node functions execute in
 * nanoseconds, so consecutive calls often return the same value, giving
 * duration = 0. This wrapper ensures every call returns at least
 * `minIncrement` ms after the previous one, producing non-zero
 * durations and correct ordering while preserving real time when
 * the underlying timer has sufficient resolution.
 */
class MonotonicTimer {
  private lastTimestamp = 0;
  private readonly minIncrement: number;

  constructor(minIncrementMs = 0.001) {
    this.minIncrement = minIncrementMs;
  }

  now(): number {
    const real = performance.now();
    const monotonic = Math.max(real, this.lastTimestamp + this.minIncrement);
    this.lastTimestamp = monotonic;
    return monotonic;
  }
}

/**
 * Captures a snapshot of recorder array lengths and map keys at the
 * moment a scope begins. Used by endScope() to slice only the entries
 * that belong to the current scope.
 */
type RecorderScope = {
  readonly startStepIndex: number;
  readonly startErrorIndex: number;
  readonly startLoopRecordKeys: ReadonlySet<string>;
  readonly startGroupRecordKeys: ReadonlySet<string>;
  readonly startNestedLoopKeys: ReadonlySet<string>;
  /** Saved nesting stack — group scopes isolate loop nesting context. */
  readonly savedNestingStack: ReadonlyArray<{
    loopStructureId: string;
    iteration: number;
  }>;
  readonly startTime: number;
};

/**
 * Records execution events and builds a complete ExecutionRecord.
 *
 * Uses a monotonic timer (wrapping performance.now()) for high-resolution timing
 * that guarantees strictly increasing timestamps even when the browser timer
 * has insufficient resolution for sub-millisecond operations.
 * All times are relative to the recording start time.
 *
 * Supports scoped recording via beginScope()/endScope() for group
 * inner execution — endScope() returns an ExecutionRecord containing
 * only the steps, errors, and loop/group records created within the scope.
 */
class ExecutionRecorder {
  private startTime: number = 0;
  private readonly steps: ExecutionStepRecord[] = [];
  private readonly errors: GraphError[] = [];
  private readonly concurrencyLevels: ConcurrencyLevelRecord[] = [];
  private readonly loopRecords = new Map<string, LoopRecord>();
  private readonly groupRecords = new Map<string, GroupRecord>();
  private readonly id: string;

  // Monotonic timer for strictly increasing timestamps
  private readonly timer = new MonotonicTimer();

  // Raw performance.now() values for estimatedTiming detection (stepIndex → rawStart)
  private readonly rawStartTimes = new Map<number, number>();

  // Pause tracking — used to subtract user idle time in step-by-step mode
  private pausedAt: number | null = null;
  private totalPauseDuration: number = 0;

  // Scope stack for group inner execution isolation
  private readonly scopeStack: RecorderScope[] = [];

  // Pending level tracking
  private pendingLevelStart: number = 0;
  private pendingLevelNodeIds: ReadonlyArray<string> = [];

  // Pending loop iteration tracking
  private readonly pendingLoopIterations = new Map<
    string,
    {
      iteration: number;
      startTime: number;
      stepRecords: ExecutionStepRecord[];
    }
  >();

  // Pending loop structure tracking (for building LoopRecord)
  private readonly pendingLoopStructures = new Map<
    string,
    {
      loopStartNodeId: string;
      loopStopNodeId: string;
      loopEndNodeId: string;
      iterations: LoopIterationRecord[];
      startTime: number;
    }
  >();

  // ── Nested loop tracking ──────────────────────────────
  // Stack tracking current loop nesting chain. Top = innermost active loop iteration.
  private readonly loopNestingStack: Array<{
    loopStructureId: string;
    iteration: number;
  }> = [];

  // Pending nested loop structures, keyed by `${parentLoopId}:${parentIter}:${childLoopId}`
  private readonly pendingNestedLoopStructures = new Map<
    string,
    {
      loopStartNodeId: string;
      loopStopNodeId: string;
      loopEndNodeId: string;
      iterations: LoopIterationRecord[];
      startTime: number;
    }
  >();

  // Completed nested loop records awaiting attachment to their parent iteration
  private readonly completedNestedLoopRecords = new Map<string, LoopRecord>();

  constructor() {
    // Use crypto.randomUUID if available, otherwise fallback
    this.id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Start recording. Sets the reference time for all relative timestamps.
   */
  start(): void {
    this.startTime = this.timer.now();
  }

  /**
   * Mark the recorder as paused. Call before yielding in step-by-step mode.
   * Time between pause() and resume() is accumulated and available as
   * `totalPauseDuration` on the final record and `pauseAdjustment` per step.
   */
  pause(): void {
    if (this.pausedAt === null) {
      this.pausedAt = this.timer.now();
    }
  }

  /**
   * Resume timing after a pause. Call when execution resumes after a yield.
   */
  resume(): void {
    if (this.pausedAt !== null) {
      this.totalPauseDuration += this.timer.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  /**
   * Get the effective total pause duration, including any in-progress pause.
   */
  private getEffectivePauseDuration(): number {
    if (this.pausedAt !== null) {
      return this.totalPauseDuration + (this.timer.now() - this.pausedAt);
    }
    return this.totalPauseDuration;
  }

  /**
   * Record a step beginning. Returns the step index for later completion.
   */
  beginStep(params: {
    nodeId: string;
    nodeTypeId: string;
    nodeTypeName: string;
    concurrencyLevel: number;
    loopIteration?: number;
    loopStructureId?: string;
    parentLoopStructureId?: string;
    parentLoopIteration?: number;
    groupNodeId?: string;
    groupDepth?: number;
    loopPhase?: LoopPhase;
    inputSource?: 'upstream' | 'feedback';
  }): number {
    // Commit any pending pause before recording the new step. In debug mode,
    // afterStep pauses after each step and never resumes — all inter-step
    // overhead (microtasks, channel teardown, event loop yields) is captured
    // as pause time. In performance mode this is a no-op (never paused).
    this.resume();

    const stepIndex = this.steps.length;
    const now = this.timer.now();

    // Track raw performance.now() for estimatedTiming detection
    this.rawStartTimes.set(stepIndex, performance.now());

    this.steps.push({
      stepIndex,
      nodeId: params.nodeId,
      nodeTypeId: params.nodeTypeId,
      nodeTypeName: params.nodeTypeName,
      concurrencyLevel: params.concurrencyLevel,
      startTime: now - this.startTime,
      endTime: 0, // filled on completion
      duration: 0,
      pauseAdjustment: this.totalPauseDuration,
      status: 'completed', // will be updated if errored/skipped
      inputValues: new Map(),
      outputValues: new Map(),
      loopIteration: params.loopIteration,
      loopStructureId: params.loopStructureId,
      parentLoopStructureId: params.parentLoopStructureId,
      parentLoopIteration: params.parentLoopIteration,
      groupNodeId: params.groupNodeId,
      groupDepth: params.groupDepth,
      loopPhase: params.loopPhase,
      inputSource: params.inputSource,
    });

    return stepIndex;
  }

  /**
   * Add a completed/errored/skipped step to the appropriate pending loop
   * iteration. If the step's own loopStructureId has no pending iteration
   * (e.g. structural steps of a nested loop), fall back to the parent loop
   * iteration via the nesting stack.
   */
  private addStepToPendingIteration(step: ExecutionStepRecord): void {
    if (step.loopStructureId !== undefined) {
      const pending = this.pendingLoopIterations.get(step.loopStructureId);
      if (pending) {
        pending.stepRecords.push(step);
        return;
      }
    }
    // Fallback: if we're inside a parent loop iteration, add there
    if (this.loopNestingStack.length > 0) {
      const parent = this.loopNestingStack[this.loopNestingStack.length - 1];
      const parentPending = this.pendingLoopIterations.get(
        parent.loopStructureId,
      );
      if (parentPending) {
        parentPending.stepRecords.push(step);
      }
    }
  }

  /**
   * Record a step completing successfully.
   */
  completeStep(
    stepIndex: number,
    inputValues: ReadonlyMap<string, RecordedInputHandleValue>,
    outputValues: ReadonlyMap<string, RecordedOutputHandleValue>,
  ): void {
    const step = this.steps[stepIndex];
    if (!step) return;

    const rawEndTime = performance.now();
    const now = this.timer.now();
    step.endTime = now - this.startTime;
    step.duration = step.endTime - step.startTime;
    step.status = 'completed';
    step.inputValues = inputValues;
    step.outputValues = outputValues;

    // Detect estimated timing: raw start and end were identical (timer resolution hit)
    const rawStart = this.rawStartTimes.get(stepIndex);
    if (rawStart !== undefined && rawEndTime === rawStart) {
      step.estimatedTiming = true;
    }
    this.rawStartTimes.delete(stepIndex);

    this.addStepToPendingIteration(step);
  }

  /**
   * Record a step failing with an error.
   */
  errorStep(
    stepIndex: number,
    error: GraphError,
    inputValues: ReadonlyMap<string, RecordedInputHandleValue>,
  ): void {
    const step = this.steps[stepIndex];
    if (!step) return;

    const rawEndTime = performance.now();
    const now = this.timer.now();
    step.endTime = now - this.startTime;
    step.duration = step.endTime - step.startTime;
    step.status = 'errored';
    step.inputValues = inputValues;
    step.error = error;

    // Detect estimated timing
    const rawStart = this.rawStartTimes.get(stepIndex);
    if (rawStart !== undefined && rawEndTime === rawStart) {
      step.estimatedTiming = true;
    }
    this.rawStartTimes.delete(stepIndex);

    this.errors.push(error);

    this.addStepToPendingIteration(step);
  }

  /**
   * Record a step being skipped (upstream errored).
   */
  skipStep(stepIndex: number): void {
    const step = this.steps[stepIndex];
    if (!step) return;

    const now = this.timer.now();
    step.endTime = now - this.startTime;
    step.duration = 0;
    step.status = 'skipped';
    this.rawStartTimes.delete(stepIndex);

    this.addStepToPendingIteration(step);
  }

  /**
   * Record the beginning of a concurrency level's execution.
   */
  beginLevel(_level: number, nodeIds: ReadonlyArray<string>): void {
    this.pendingLevelStart = this.timer.now();
    this.pendingLevelNodeIds = nodeIds;
  }

  /**
   * Record the completion of a concurrency level's execution.
   */
  completeLevel(level: number): void {
    const now = this.timer.now();
    this.concurrencyLevels.push({
      level,
      startTime: this.pendingLevelStart - this.startTime,
      endTime: now - this.startTime,
      duration: now - this.pendingLevelStart,
      nodeIds: this.pendingLevelNodeIds,
    });
  }

  /**
   * Begin recording a loop structure (called once before iterations start).
   * If a parent loop iteration is active (nesting stack non-empty), the
   * structure is stored as a nested pending record rather than top-level.
   */
  beginLoopStructure(
    loopStructureId: string,
    loopStartNodeId: string,
    loopStopNodeId: string,
    loopEndNodeId: string,
  ): void {
    const structure = {
      loopStartNodeId,
      loopStopNodeId,
      loopEndNodeId,
      iterations: [] as LoopIterationRecord[],
      startTime: this.timer.now(),
    };

    if (this.loopNestingStack.length > 0) {
      // Nested loop — store under parent context
      const parent = this.loopNestingStack[this.loopNestingStack.length - 1];
      const key = `${parent.loopStructureId}:${parent.iteration}:${loopStructureId}`;
      this.pendingNestedLoopStructures.set(key, structure);
    } else {
      // Top-level loop
      this.pendingLoopStructures.set(loopStructureId, structure);
    }
  }

  /**
   * Record the beginning of a loop iteration.
   */
  beginLoopIteration(loopStructureId: string, iteration: number): void {
    this.loopNestingStack.push({ loopStructureId, iteration });
    this.pendingLoopIterations.set(loopStructureId, {
      iteration,
      startTime: this.timer.now(),
      stepRecords: [],
    });
  }

  /**
   * Record the completion of a loop iteration.
   * Pops the nesting stack and collects any nested loop records
   * that completed within this iteration.
   */
  completeLoopIteration(
    loopStructureId: string,
    iteration: number,
    conditionValue: boolean,
  ): void {
    this.loopNestingStack.pop();

    const pending = this.pendingLoopIterations.get(loopStructureId);
    if (!pending) return;

    // Collect nested loop records that completed within this iteration
    const nestedLoopRecords = new Map<string, LoopRecord>();
    const prefix = `${loopStructureId}:${iteration}:`;
    for (const [key, nestedRecord] of this.completedNestedLoopRecords) {
      if (key.startsWith(prefix)) {
        const childLoopId = key.slice(prefix.length);
        nestedLoopRecords.set(childLoopId, nestedRecord);
      }
    }
    // Clean up collected entries
    for (const childLoopId of nestedLoopRecords.keys()) {
      this.completedNestedLoopRecords.delete(`${prefix}${childLoopId}`);
    }

    const now = this.timer.now();
    const record: LoopIterationRecord = {
      iteration,
      startTime: pending.startTime - this.startTime,
      endTime: now - this.startTime,
      duration: now - pending.startTime,
      conditionValue,
      stepRecords: pending.stepRecords,
      nestedLoopRecords,
    };

    // Find the parent structure (top-level or nested)
    const structure =
      this.pendingLoopStructures.get(loopStructureId) ??
      this.findPendingStructure(loopStructureId);
    if (structure) {
      structure.iterations.push(record);
    }

    this.pendingLoopIterations.delete(loopStructureId);
  }

  /**
   * Find a pending loop structure in the nested structures map.
   */
  private findPendingStructure(loopStructureId: string) {
    for (const [key, s] of this.pendingNestedLoopStructures) {
      if (key.endsWith(`:${loopStructureId}`)) return s;
    }
    return undefined;
  }

  /**
   * Finalize a loop structure recording.
   * For nested loops, stores the completed record for the parent iteration
   * to collect. For top-level loops, stores in the global loopRecords map.
   */
  completeLoopStructure(loopStructureId: string): void {
    // Try top-level first
    let structure = this.pendingLoopStructures.get(loopStructureId);
    let nestedKey: string | null = null;

    if (!structure) {
      // Find in nested pending structures
      for (const [key, s] of this.pendingNestedLoopStructures) {
        if (key.endsWith(`:${loopStructureId}`)) {
          structure = s;
          nestedKey = key;
          break;
        }
      }
    }
    if (!structure) return;

    const now = this.timer.now();
    const loopRecord: LoopRecord = {
      loopStructureId,
      loopStartNodeId: structure.loopStartNodeId,
      loopStopNodeId: structure.loopStopNodeId,
      loopEndNodeId: structure.loopEndNodeId,
      iterations: structure.iterations,
      totalIterations: structure.iterations.length,
      startTime: structure.startTime - this.startTime,
      endTime: now - this.startTime,
      duration: now - structure.startTime,
    };

    if (nestedKey) {
      // Store completed nested record for parent iteration to collect
      this.completedNestedLoopRecords.set(nestedKey, loopRecord);
      this.pendingNestedLoopStructures.delete(nestedKey);
    } else {
      this.loopRecords.set(loopStructureId, loopRecord);
      this.pendingLoopStructures.delete(loopStructureId);
    }
  }

  /**
   * Record the beginning of a group execution.
   */
  beginGroup(_groupNodeId: string, _groupNodeTypeId: string): void {
    // Group records are completed when completeGroup is called
    // No pending state needed — the inner ExecutionRecord is built separately
  }

  /**
   * Record the completion of a group execution.
   */
  completeGroup(
    groupNodeId: string,
    groupNodeTypeId: string,
    innerRecord: ExecutionRecord,
    inputMapping: ReadonlyMap<string, unknown>,
    outputMapping: ReadonlyMap<string, unknown>,
  ): void {
    this.groupRecords.set(groupNodeId, {
      groupNodeId,
      groupNodeTypeId,
      innerRecord,
      inputMapping,
      outputMapping,
    });
  }

  /**
   * Get the most recently added step record (for debug mode yields).
   */
  getLatestStep(): ExecutionStepRecord | undefined {
    return this.steps.length > 0
      ? this.steps[this.steps.length - 1]
      : undefined;
  }

  /**
   * Get the current number of recorded steps.
   */
  stepCount(): number {
    return this.steps.length;
  }

  /**
   * Get a step record by index.
   */
  getStep(index: number): ExecutionStepRecord | undefined {
    return this.steps[index];
  }

  /**
   * Begin a recording scope. All steps/errors recorded after this point
   * belong to the current scope. Call endScope() to extract a scoped
   * ExecutionRecord containing only those entries.
   *
   * Scopes nest correctly for recursive group execution — each
   * beginScope() pushes onto a stack, and endScope() pops the most recent.
   */
  beginScope(): void {
    // Save and clear the nesting stack so group inner execution
    // has an isolated loop nesting context
    const savedStack = [...this.loopNestingStack];
    this.loopNestingStack.length = 0;

    this.scopeStack.push({
      startStepIndex: this.steps.length,
      startErrorIndex: this.errors.length,
      startLoopRecordKeys: new Set(this.loopRecords.keys()),
      startGroupRecordKeys: new Set(this.groupRecords.keys()),
      startNestedLoopKeys: new Set(this.completedNestedLoopRecords.keys()),
      savedNestingStack: savedStack,
      startTime: this.timer.now(),
    });
  }

  /**
   * End the current recording scope and return an ExecutionRecord
   * containing only the steps, errors, and loop/group records
   * that were created within this scope.
   *
   * Groups execute atomically (no outer steps interleave with inner
   * steps), so slicing the arrays from the scope's start index is
   * always correct.
   */
  endScope(
    status: ExecutionRecordStatus,
    scopedValues: ReadonlyMap<string, unknown>,
  ): ExecutionRecord {
    const scope = this.scopeStack.pop();
    if (!scope) {
      throw new Error(
        'ExecutionRecorder.endScope() called without matching beginScope()',
      );
    }

    // Restore the loop nesting stack from before the scope
    this.loopNestingStack.length = 0;
    for (const entry of scope.savedNestingStack) {
      this.loopNestingStack.push(entry);
    }

    const now = this.timer.now();

    // Slice steps and errors to only those created within the scope
    const scopedSteps = this.steps.slice(scope.startStepIndex);
    const scopedErrors = this.errors.slice(scope.startErrorIndex);

    // Filter loop records: only those added during this scope
    const scopedLoopRecords = new Map<string, LoopRecord>();
    for (const [id, record] of this.loopRecords) {
      if (!scope.startLoopRecordKeys.has(id)) {
        scopedLoopRecords.set(id, record);
      }
    }

    // Filter group records: only those added during this scope
    const scopedGroupRecords = new Map<string, GroupRecord>();
    for (const [id, record] of this.groupRecords) {
      if (!scope.startGroupRecordKeys.has(id)) {
        scopedGroupRecords.set(id, record);
      }
    }

    return {
      id: `${this.id}-scope-${scope.startStepIndex}`,
      startTime: scope.startTime,
      endTime: now,
      totalDuration: now - scope.startTime,
      compilationDuration: 0,
      totalPauseDuration: this.getEffectivePauseDuration(),
      status,
      steps: scopedSteps,
      errors: scopedErrors,
      concurrencyLevels: [], // Not tracked per scope
      loopRecords: scopedLoopRecords,
      groupRecords: scopedGroupRecords,
      finalValues: scopedValues,
    };
  }

  /**
   * Materialize in-progress loop structures into temporary LoopRecord objects.
   * This allows partial snapshots to include loop data before the loop completes,
   * so the timeline and visual-state logic work identically during live stepping
   * and post-completion replay.
   */
  private snapshotPendingLoopRecords(now: number): Map<string, LoopRecord> {
    const result = new Map(this.loopRecords);

    const materialize = (
      loopStructureId: string,
      structure: {
        loopStartNodeId: string;
        loopStopNodeId: string;
        loopEndNodeId: string;
        iterations: LoopIterationRecord[];
        startTime: number;
      },
    ): LoopRecord => {
      // Include completed iterations + the in-progress one (if any)
      const pending = this.pendingLoopIterations.get(loopStructureId);
      const iterations: LoopIterationRecord[] = [...structure.iterations];

      if (pending) {
        // Materialize nested loops within this in-progress iteration
        const nestedLoopRecords = new Map<string, LoopRecord>();
        const prefix = `${loopStructureId}:${pending.iteration}:`;

        // Completed nested loops
        for (const [key, nestedRecord] of this.completedNestedLoopRecords) {
          if (key.startsWith(prefix)) {
            nestedLoopRecords.set(key.slice(prefix.length), nestedRecord);
          }
        }

        // Pending nested loops (still in-progress)
        for (const [key, nestedStructure] of this.pendingNestedLoopStructures) {
          if (key.startsWith(prefix)) {
            const childId = key.slice(prefix.length);
            if (!nestedLoopRecords.has(childId)) {
              nestedLoopRecords.set(
                childId,
                materialize(childId, nestedStructure),
              );
            }
          }
        }

        iterations.push({
          iteration: pending.iteration,
          startTime: pending.startTime - this.startTime,
          endTime: now - this.startTime,
          duration: now - pending.startTime,
          conditionValue: true, // assume continuing until proven otherwise
          stepRecords: [...pending.stepRecords],
          nestedLoopRecords,
        });
      }

      return {
        loopStructureId,
        loopStartNodeId: structure.loopStartNodeId,
        loopStopNodeId: structure.loopStopNodeId,
        loopEndNodeId: structure.loopEndNodeId,
        iterations,
        totalIterations: iterations.length,
        startTime: structure.startTime - this.startTime,
        endTime: now - this.startTime,
        duration: now - structure.startTime,
      };
    };

    // Materialize top-level pending structures
    for (const [loopId, structure] of this.pendingLoopStructures) {
      if (!result.has(loopId)) {
        result.set(loopId, materialize(loopId, structure));
      }
    }

    return result;
  }

  /**
   * Return a snapshot of the current recording state without mutating.
   * Used in debug mode to yield partial records after each step.
   *
   * Includes in-progress loop structures so the timeline and visual states
   * work identically during live stepping and post-completion replay.
   */
  snapshot(
    status: ExecutionRecordStatus,
    currentValues: ReadonlyMap<string, unknown>,
  ): ExecutionRecord {
    const now = this.timer.now();
    return {
      id: this.id,
      startTime: this.startTime,
      endTime: now,
      totalDuration: now - this.startTime,
      compilationDuration: 0,
      totalPauseDuration: this.getEffectivePauseDuration(),
      status,
      steps: [...this.steps],
      errors: [...this.errors],
      concurrencyLevels: [...this.concurrencyLevels],
      loopRecords: this.snapshotPendingLoopRecords(now),
      groupRecords: new Map(this.groupRecords),
      finalValues: currentValues,
    };
  }

  /**
   * Finalize the recording and return the complete ExecutionRecord.
   */
  finalize(
    status: ExecutionRecordStatus,
    finalValues: ReadonlyMap<string, unknown>,
    compilationDuration = 0,
  ): ExecutionRecord {
    const endTime = this.timer.now();

    return {
      id: this.id,
      startTime: this.startTime,
      endTime,
      totalDuration: endTime - this.startTime,
      compilationDuration,
      totalPauseDuration: this.getEffectivePauseDuration(),
      status,
      steps: this.steps,
      errors: this.errors,
      concurrencyLevels: this.concurrencyLevels,
      loopRecords: this.loopRecords,
      groupRecords: this.groupRecords,
      finalValues,
    };
  }
}

export { ExecutionRecorder };
