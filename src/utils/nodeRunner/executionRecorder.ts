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
} from './types';

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
  readonly startTime: number;
};

/**
 * Records execution events and builds a complete ExecutionRecord.
 *
 * Uses performance.now() for high-resolution timing.
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
    this.startTime = performance.now();
  }

  /**
   * Mark the recorder as paused. Call before yielding in step-by-step mode.
   * Time between pause() and resume() is accumulated and available as
   * `totalPauseDuration` on the final record and `pauseAdjustment` per step.
   */
  pause(): void {
    if (this.pausedAt === null) {
      this.pausedAt = performance.now();
    }
  }

  /**
   * Resume timing after a pause. Call when execution resumes after a yield.
   */
  resume(): void {
    if (this.pausedAt !== null) {
      this.totalPauseDuration += performance.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  /**
   * Get the effective total pause duration, including any in-progress pause.
   */
  private getEffectivePauseDuration(): number {
    if (this.pausedAt !== null) {
      return this.totalPauseDuration + (performance.now() - this.pausedAt);
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
    groupNodeId?: string;
    groupDepth?: number;
  }): number {
    const stepIndex = this.steps.length;
    const now = performance.now();

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
      groupNodeId: params.groupNodeId,
      groupDepth: params.groupDepth,
    });

    return stepIndex;
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

    const now = performance.now();
    step.endTime = now - this.startTime;
    step.duration = step.endTime - step.startTime;
    step.status = 'completed';
    step.inputValues = inputValues;
    step.outputValues = outputValues;

    // Add to pending loop iteration if inside a loop
    if (step.loopStructureId !== undefined) {
      const pending = this.pendingLoopIterations.get(step.loopStructureId);
      if (pending) {
        pending.stepRecords.push(step);
      }
    }
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

    const now = performance.now();
    step.endTime = now - this.startTime;
    step.duration = step.endTime - step.startTime;
    step.status = 'errored';
    step.inputValues = inputValues;
    step.error = error;

    this.errors.push(error);

    // Add to pending loop iteration if inside a loop
    if (step.loopStructureId !== undefined) {
      const pending = this.pendingLoopIterations.get(step.loopStructureId);
      if (pending) {
        pending.stepRecords.push(step);
      }
    }
  }

  /**
   * Record a step being skipped (upstream errored).
   */
  skipStep(stepIndex: number): void {
    const step = this.steps[stepIndex];
    if (!step) return;

    const now = performance.now();
    step.endTime = now - this.startTime;
    step.duration = 0;
    step.status = 'skipped';

    // Add to pending loop iteration if inside a loop
    if (step.loopStructureId !== undefined) {
      const pending = this.pendingLoopIterations.get(step.loopStructureId);
      if (pending) {
        pending.stepRecords.push(step);
      }
    }
  }

  /**
   * Record the beginning of a concurrency level's execution.
   */
  beginLevel(_level: number, nodeIds: ReadonlyArray<string>): void {
    this.pendingLevelStart = performance.now();
    this.pendingLevelNodeIds = nodeIds;
  }

  /**
   * Record the completion of a concurrency level's execution.
   */
  completeLevel(level: number): void {
    const now = performance.now();
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
   */
  beginLoopStructure(
    loopStructureId: string,
    loopStartNodeId: string,
    loopStopNodeId: string,
    loopEndNodeId: string,
  ): void {
    this.pendingLoopStructures.set(loopStructureId, {
      loopStartNodeId,
      loopStopNodeId,
      loopEndNodeId,
      iterations: [],
      startTime: performance.now(),
    });
  }

  /**
   * Record the beginning of a loop iteration.
   */
  beginLoopIteration(loopStructureId: string, iteration: number): void {
    this.pendingLoopIterations.set(loopStructureId, {
      iteration,
      startTime: performance.now(),
      stepRecords: [],
    });
  }

  /**
   * Record the completion of a loop iteration.
   */
  completeLoopIteration(
    loopStructureId: string,
    iteration: number,
    conditionValue: boolean,
  ): void {
    const pending = this.pendingLoopIterations.get(loopStructureId);
    if (!pending) return;

    const now = performance.now();
    const record: LoopIterationRecord = {
      iteration,
      startTime: pending.startTime - this.startTime,
      endTime: now - this.startTime,
      duration: now - pending.startTime,
      conditionValue,
      stepRecords: pending.stepRecords,
    };

    const structure = this.pendingLoopStructures.get(loopStructureId);
    if (structure) {
      structure.iterations.push(record);
    }

    this.pendingLoopIterations.delete(loopStructureId);
  }

  /**
   * Finalize a loop structure recording.
   */
  completeLoopStructure(loopStructureId: string): void {
    const structure = this.pendingLoopStructures.get(loopStructureId);
    if (!structure) return;

    const now = performance.now();
    this.loopRecords.set(loopStructureId, {
      loopStructureId,
      loopStartNodeId: structure.loopStartNodeId,
      loopStopNodeId: structure.loopStopNodeId,
      loopEndNodeId: structure.loopEndNodeId,
      iterations: structure.iterations,
      totalIterations: structure.iterations.length,
      startTime: structure.startTime - this.startTime,
      endTime: now - this.startTime,
      duration: now - structure.startTime,
    });

    this.pendingLoopStructures.delete(loopStructureId);
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
   * Begin a recording scope. All steps/errors recorded after this point
   * belong to the current scope. Call endScope() to extract a scoped
   * ExecutionRecord containing only those entries.
   *
   * Scopes nest correctly for recursive group execution — each
   * beginScope() pushes onto a stack, and endScope() pops the most recent.
   */
  beginScope(): void {
    this.scopeStack.push({
      startStepIndex: this.steps.length,
      startErrorIndex: this.errors.length,
      startLoopRecordKeys: new Set(this.loopRecords.keys()),
      startGroupRecordKeys: new Set(this.groupRecords.keys()),
      startTime: performance.now(),
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

    const now = performance.now();

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
   * Return a snapshot of the current recording state without mutating.
   * Used in debug mode to yield partial records after each step.
   */
  snapshot(
    status: ExecutionRecordStatus,
    currentValues: ReadonlyMap<string, unknown>,
  ): ExecutionRecord {
    const now = performance.now();
    return {
      id: this.id,
      startTime: this.startTime,
      endTime: now,
      totalDuration: now - this.startTime,
      totalPauseDuration: this.getEffectivePauseDuration(),
      status,
      steps: [...this.steps],
      errors: [...this.errors],
      concurrencyLevels: [...this.concurrencyLevels],
      loopRecords: new Map(this.loopRecords),
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
  ): ExecutionRecord {
    const endTime = performance.now();

    return {
      id: this.id,
      startTime: this.startTime,
      endTime,
      totalDuration: endTime - this.startTime,
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
