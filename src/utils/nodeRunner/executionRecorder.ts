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
  SwitchRecord,
  GroupRecord,
  LoopPhase,
  SwitchPhase,
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
 * Explicit structural parent for nested loop recording. The executor passes
 * this at `beginLoopStructure`/`completeLoopStructure` time — parentage is
 * caller-declared, never inferred from ambient state. D1 (switch nesting)
 * will extend the union with a `{ kind: 'switch'; switchStructureId }` arm.
 */
type StructureParentContext = {
  kind: 'loop';
  loopStructureId: string;
  iteration: number;
};

// Module-private brand symbol: external code cannot name it, so a
// structurally-forged token is inexpressible in TypeScript AND detectable at
// runtime (the property cannot be set without this symbol).
const recorderScopeTokenBrand: unique symbol = Symbol('RecorderScopeToken');

/**
 * Branded, single-use scope handle returned by `beginScope()` and REQUIRED
 * by `endScope()`. The brand makes structural forgery inexpressible;
 * `endScope` throws on an unknown or already-consumed token. Captures the
 * owner's instance path plus array/map snapshots at scope start, so the
 * scoped record contains exactly the entries the owner created — even when
 * sibling scopes run concurrently and interleave.
 */
type RecorderScopeToken = {
  readonly [recorderScopeTokenBrand]: true;
  /** Monotonic per-recorder serial — also keys the scoped record id. */
  readonly tokenSerial: number;
  readonly ownerInstancePath: readonly string[];
  readonly startStepIndex: number;
  readonly startErrorIndex: number;
  /**
   * Watermark of the recorder's store counter when the scope opened. A
   * structure record belongs to this scope iff it was STORED afterwards —
   * which, unlike a snapshot of map KEYS, stays true when a re-executed
   * instance overwrites its own earlier record under the same identity key.
   */
  readonly startStoreSerial: number;
  /** Committed pause time when the scope opened, so the scoped record can
   *  report pause relative to the scope instead of the whole run. */
  readonly startPauseDuration: number;
  readonly startTime: number;
};

/**
 * Dev-mode detection that survives EVERY environment the library ships into:
 * bundlers textually replace `process.env.NODE_ENV`, Node defines it, and a
 * bare browser (script tag / CDN, no bundler) has no `process` at all — where
 * a direct read throws `ReferenceError`, so the catch treats it as dev. A
 * consumer who wants silence registers `onRecorderWarning`.
 *
 * Evaluated PER CALL rather than once at module load: a module-level constant
 * freezes whatever was true at first import, which makes the production
 * branch unreachable from a test (`vi.stubEnv` after the import does nothing
 * without `vi.resetModules()`) and pins Storybook — which has no `process`
 * global at all — permanently to dev.
 *
 * COST — call this LAST in any guard chain. It is a property read only where
 * `process` exists; in the bare-browser case the read THROWS, and a
 * thrown-and-caught ReferenceError measured ~7µs here versus ~4ns for a
 * cached constant (~1900×; ~100× in Node). That is irrelevant on the warning
 * paths, which are rare by construction, but NOT on
 * `assertNoPendingOwnedStructures`, which `endScope` reaches once per
 * group-instance execution — see the ordered guard there.
 */
function isDevEnvironment(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

/**
 * The kinds of structured warning the recorder emits when it observes an
 * anomaly it can compensate for. Delivered to the `onRecorderWarning`
 * callback when registered, else to a dev-only console.warn — never to
 * `record.errors` (status is executor-computed before finalize; a
 * bookkeeping salvage must not create error entries with no step).
 */
const recorderWarningKinds = [
  /** Residue was salvaged INTO the record. */
  'orphan-promoted',
  /** Residue could not be attached to anything and was discarded. */
  'orphan-dropped',
  /** A scope was never ended, so its inner record was not built. */
  'unclosed-scope',
  /** A begin call superseded a still-pending entry of the same identity. */
  'key-collision',
] as const;

type RecorderWarningKind = (typeof recorderWarningKinds)[number];

type RecorderWarning = {
  kind: RecorderWarningKind;
  /**
   * Diagnostic identifier — OPAQUE. Its shape varies by kind (a
   * `structureRecordKey` string, or a step index); never parse it. Use
   * `recordId` to attribute the warning and the record's own
   * `ownerInstancePath` fields for structure identity.
   */
  key: string;
  message: string;
  /** The `ExecutionRecord.id` this warning belongs to — lets a consumer
   *  attribute warnings when a superseded run finalizes after a new one
   *  has already started. */
  recordId: string;
};

type ExecutionRecorderOptions = {
  onRecorderWarning?: (warning: RecorderWarning) => void;
};

/**
 * The published identity key of a structure record: the FULL PATH to the
 * structure — the owning group-instance path followed by the structure's own
 * id — serialized as a JSON array. One format at every depth:
 *
 * ```
 * root loop L                    ["L"]
 * loop L inside instance g2      ["g2","L"]
 * loop L inside g2 → subgroup s  ["g2","s","L"]     (any nesting depth)
 * ```
 *
 * Why a JSON array and not a concatenated string: `Map` compares keys with
 * SameValueZero, so arrays/objects compare by REFERENCE and cannot serve as
 * value-addressed keys, and the published maps must serialize to JSON
 * objects — a string key is unavoidable at this boundary. JSON is INJECTIVE
 * over string arrays (any delimiter inside an id is escaped), so two
 * distinct identities can never produce one key — unlike `join('/') + '|'`,
 * where `(['a'],'b|c')` and `(['a|b'],'c')` both yield `a|b|c`. The
 * recorder's internal bookkeeping composes no strings at all.
 *
 * Keys are OPAQUE: build them with this function, never parse them — every
 * record value carries `ownerInstancePath` for structured reads.
 *
 * `ordinal` is used ONLY by the finalize salvage path when an identity
 * already holds a record. It is a NUMBER, so it can never be confused with a
 * deeper path segment (segments are always strings).
 */
function structureRecordKey(
  ownerInstancePath: readonly string[],
  structureId: string,
  ordinal?: number,
): string {
  return JSON.stringify(
    ordinal === undefined
      ? [...ownerInstancePath, structureId]
      : [...ownerInstancePath, structureId, ordinal],
  );
}

/**
 * The recorder's dev-only console fallback for a warning, in ONE place —
 * both the environment check and the wording.
 *
 * `useNodeRunner`'s trampoline needs exactly this for the window where a
 * consumer un-registers its handler mid-run: from the recorder's point of view
 * an observer is still registered (the trampoline), so `emitWarning` has
 * already skipped its own fallback, and a bare optional call there would drop
 * the warning on every channel at once. Module-level, not on the barrel.
 */
function emitRecorderWarningToConsole(warning: RecorderWarning): void {
  if (!isDevEnvironment()) return;
  console.warn(
    `[ExecutionRecorder] ${warning.kind} (${warning.key}): ${warning.message}`,
  );
}

/**
 * Does `key` have the shape `structureRecordKey` produces — a JSON array of
 * path segments, optionally closed by a numeric salvage ordinal?
 *
 * This is the ONE place besides `structureRecordKey` that knows the format,
 * and it exists for exactly one caller: import validation, which must be able
 * to tell a current recording from one exported before identity keys existed
 * (those carry bare structure ids and still resolve through
 * `resolveStructureRecord`'s legacy scan). It is deliberately NOT re-exported
 * from the package barrel — consumers treat keys as opaque, and giving them a
 * shape predicate would invite parsing.
 */
function isStructureRecordKey(key: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return false;
  // A trailing NUMBER is the salvage ordinal; every path segment is a string.
  // The ordinal test mirrors the producer exactly — `storeSalvagedRecord`
  // allocates 1, 2, 3… — so a fractional or negative trailing number is not a
  // key this module could have emitted, and the predicate stays the precise
  // inverse of `structureRecordKey`.
  const last = parsed[parsed.length - 1];
  const hasOrdinal = typeof last === 'number';
  if (hasOrdinal && !(Number.isInteger(last) && last >= 1)) return false;
  const pathSegments = hasOrdinal ? parsed.slice(0, -1) : parsed;
  return (
    pathSegments.length > 0 &&
    pathSegments.every((segment) => typeof segment === 'string')
  );
}

/**
 * Pending bookkeeping is keyed by the PLAIN structure id into a short list of
 * entries (one per concurrently-live instance of that template), each
 * carrying its structured `ownerInstancePath`. No string composition, so no
 * delimiter can ever alias two identities. Scans run latest-first, so a
 * re-begun structure resolves to the live entry rather than a stale one.
 */
function findEntryByOwner<
  Entry extends { ownerInstancePath: readonly string[] },
>(
  entries: Entry[] | undefined,
  ownerInstancePath: readonly string[],
  additionalPredicate?: (entry: Entry) => boolean,
): Entry | undefined {
  if (!entries) return undefined;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (
      instancePathsEqual(entry.ownerInstancePath, ownerInstancePath) &&
      (additionalPredicate === undefined || additionalPredicate(entry))
    ) {
      return entry;
    }
  }
  return undefined;
}

function addPendingEntry<Entry>(
  store: Map<string, Entry[]>,
  structureId: string,
  entry: Entry,
): void {
  const entries = store.get(structureId);
  if (entries) entries.push(entry);
  else store.set(structureId, [entry]);
}

function removePendingEntry<Entry>(
  store: Map<string, Entry[]>,
  structureId: string,
  entry: Entry,
): void {
  const entries = store.get(structureId);
  if (!entries) return;
  const index = entries.indexOf(entry);
  if (index >= 0) entries.splice(index, 1);
  if (entries.length === 0) store.delete(structureId);
}

/** Every live pending entry across all structure ids. */
function allPendingEntries<Entry>(store: Map<string, Entry[]>): Entry[] {
  const out: Entry[] = [];
  for (const entries of store.values()) out.push(...entries);
  return out;
}

/** Ownership + write-order metadata kept beside each final-map entry. */
type StoredRecordMeta = {
  structureId: string;
  ownerInstancePath: readonly string[];
  /** Value of the recorder's store counter when this entry was written. */
  lastStoreSerial: number;
};

type PendingLoopIterationEntry = {
  structureId: string;
  ownerInstancePath: readonly string[];
  iteration: number;
  startTime: number;
  stepRecords: ExecutionStepRecord[];
};

type PendingLoopStructureEntry = {
  structureId: string;
  ownerInstancePath: readonly string[];
  loopStartNodeId: string;
  loopStopNodeId: string;
  loopEndNodeId: string;
  iterations: LoopIterationRecord[];
  startTime: number;
  parentContext?: StructureParentContext;
};

type CompletedNestedLoopEntry = {
  record: LoopRecord;
  structureId: string;
  ownerInstancePath: readonly string[];
  parentLoopStructureId: string;
  parentIteration: number;
};

type PendingSwitchStructureEntry = {
  structureId: string;
  ownerInstancePath: readonly string[];
  switchStartNodeId: string;
  switchEndNodeId: string;
  startTime: number;
  stepRecords: ExecutionStepRecord[];
};

function instancePathsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

/** Does `path` sit under (or equal) `ownerPath`? Undefined path = root. */
function instancePathStartsWith(
  path: readonly string[] | undefined,
  ownerPath: readonly string[],
): boolean {
  if (ownerPath.length === 0) return true;
  if (!path || path.length < ownerPath.length) return false;
  return ownerPath.every((segment, index) => path[index] === segment);
}

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
  private readonly switchRecords = new Map<string, SwitchRecord>();
  private readonly groupRecords = new Map<string, GroupRecord>();
  private readonly id: string;

  // Monotonic timer for strictly increasing timestamps
  private readonly timer = new MonotonicTimer();

  // Raw performance.now() values for estimatedTiming detection (stepIndex → rawStart)
  private readonly rawStartTimes = new Map<number, number>();

  // Pause tracking — used to subtract user idle time in step-by-step mode
  private pausedAt: number | null = null;
  private totalPauseDuration: number = 0;

  // Active scope tokens (a SET, not a stack — concurrent sibling scopes may
  // end in any order; each token identifies exactly one scope)
  private readonly activeScopeTokens = new Set<RecorderScopeToken>();
  private scopeTokenCounter = 0;

  // Monotonic counter stamped onto every final-map store. `endScope` uses it
  // instead of a key snapshot, so a record that OVERWRITES its own earlier
  // entry (a group re-executed per enclosing loop iteration) is still
  // recognised as "created during this scope".
  private finalStoreSerial = 0;

  // Ownership metadata for the final record maps, keyed identically to them.
  private readonly loopRecordMeta = new Map<string, StoredRecordMeta>();
  private readonly switchRecordMeta = new Map<string, StoredRecordMeta>();
  private readonly groupRecordMeta = new Map<string, StoredRecordMeta>();

  // Warning channel (see RecorderWarning docblock)
  private readonly onRecorderWarning?: (warning: RecorderWarning) => void;

  // Pending level tracking
  private pendingLevelStart: number = 0;
  private pendingLevelNodeIds: ReadonlyArray<string> = [];

  // ── Pending bookkeeping (structural: keyed by PLAIN structure id into a
  //    short per-instance entry list; identity lives in the entries' own
  //    `ownerInstancePath`/`parentContext` fields, never in a composed key)

  private readonly pendingLoopIterations = new Map<
    string,
    PendingLoopIterationEntry[]
  >();

  // Pending loop structures — top-level AND nested in one store; a nested
  // entry declares its parent via `parentContext`.
  private readonly pendingLoopStructures = new Map<
    string,
    PendingLoopStructureEntry[]
  >();

  // Completed nested loop records awaiting collection by their parent's
  // iteration sweep. A flat list: the sweep filters by declared parentage.
  private readonly completedNestedLoopRecords: CompletedNestedLoopEntry[] = [];

  private readonly pendingSwitchStructures = new Map<
    string,
    PendingSwitchStructureEntry[]
  >();

  constructor(options?: ExecutionRecorderOptions) {
    this.onRecorderWarning = options?.onRecorderWarning;
    // Use crypto.randomUUID if available, otherwise fallback
    this.id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Deliver a recorder warning: registered callback, else a dev-only console
   * warning. The callback is consumer code — a throw from it must never
   * destroy the record it is reporting on, so it is isolated.
   */
  private emitWarning(warning: Omit<RecorderWarning, 'recordId'>): void {
    const fullWarning: RecorderWarning = { ...warning, recordId: this.id };
    if (this.onRecorderWarning) {
      try {
        this.onRecorderWarning(fullWarning);
      } catch (callbackError) {
        if (isDevEnvironment()) {
          console.error(
            '[ExecutionRecorder] onRecorderWarning threw; the warning was dropped and recording continued:',
            callbackError,
          );
        }
      }
      return;
    }
    emitRecorderWarningToConsole(fullWarning);
  }

  /**
   * Store a completed structure record in a final map under its identity key
   * (`structureRecordKey(owner, id)` — the structure's full path). Because the
   * key IS the identity, two different structures can never contest one key,
   * so there is no qualification or collision handling here. Re-completing the
   * SAME identity (a group re-executed per enclosing loop iteration)
   * legitimately replaces its own earlier record; the store serial stamped on
   * the metadata is what makes that replacement visible to open scopes.
   */
  private storeFinalRecord<RecordType>(
    map: Map<string, RecordType>,
    meta: Map<string, StoredRecordMeta>,
    structureId: string,
    ownerInstancePath: readonly string[],
    value: RecordType,
  ): void {
    // The key IS the identity (full path), so two different structures can
    // never contest one key and no qualification/collision logic is needed.
    // Re-completing the SAME identity (a group re-executed per enclosing
    // loop iteration) legitimately replaces its own earlier record; the
    // store serial makes that replacement visible to open scopes.
    const key = structureRecordKey(ownerInstancePath, structureId);
    map.set(key, value);
    meta.set(key, {
      structureId,
      ownerInstancePath: [...ownerInstancePath],
      lastStoreSerial: ++this.finalStoreSerial,
    });
  }

  /**
   * Salvage store used ONLY by the finalize backstop: never overwrites a
   * healthy record. If the identity key is taken, the salvaged record is
   * filed under the same identity plus a numeric ordinal.
   */
  private storeSalvagedRecord<RecordType>(
    map: Map<string, RecordType>,
    meta: Map<string, StoredRecordMeta>,
    structureId: string,
    ownerInstancePath: readonly string[],
    value: RecordType,
  ): string {
    let key = structureRecordKey(ownerInstancePath, structureId);
    let ordinal = 1;
    while (map.has(key)) {
      key = structureRecordKey(ownerInstancePath, structureId, ordinal++);
    }
    map.set(key, value);
    meta.set(key, {
      structureId,
      ownerInstancePath: [...ownerInstancePath],
      lastStoreSerial: ++this.finalStoreSerial,
    });
    return key;
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
    customName?: string;
    concurrencyLevel: number;
    loopIteration?: number;
    loopStructureId?: string;
    parentLoopStructureId?: string;
    parentLoopIteration?: number;
    groupNodeId?: string;
    groupDepth?: number;
    instancePath?: readonly string[];
    loopPhase?: LoopPhase;
    inputSource?: 'upstream' | 'feedback';
    switchPhase?: SwitchPhase;
    switchStructureId?: string;
    branchTaken?: boolean;
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
      customName: params.customName,
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
      instancePath: params.instancePath,
      loopPhase: params.loopPhase,
      inputSource: params.inputSource,
      switchPhase: params.switchPhase,
      switchStructureId: params.switchStructureId,
      branchTaken: params.branchTaken,
    });

    return stepIndex;
  }

  /**
   * Add a completed/errored/skipped step to the appropriate pending loop
   * iteration / switch structure. Routing is EXPLICIT: the step's own
   * `loopStructureId` (+ its instance path as the owner) first; then the
   * step's `parentLoopStructureId` for steps recorded on behalf of an
   * enclosing loop iteration after their own structure closed — the
   * post-iteration error steps of a nested loop, and the structural wrapper
   * step of a group/loop sitting in a loop body (stamped by the executors).
   * No ambient state is consulted.
   */
  private addStepToPendingIteration(step: ExecutionStepRecord): void {
    const ownerPath = step.instancePath ?? [];
    if (step.switchStructureId !== undefined) {
      const pendingSwitch = findEntryByOwner(
        this.pendingSwitchStructures.get(step.switchStructureId),
        ownerPath,
      );
      if (pendingSwitch) {
        pendingSwitch.stepRecords.push(step);
      }
    }
    if (step.loopStructureId !== undefined) {
      const pending = findEntryByOwner(
        this.pendingLoopIterations.get(step.loopStructureId),
        ownerPath,
      );
      if (pending) {
        pending.stepRecords.push(step);
        return;
      }
    }
    if (step.parentLoopStructureId !== undefined) {
      const parentPending = findEntryByOwner(
        this.pendingLoopIterations.get(step.parentLoopStructureId),
        ownerPath,
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
   * Parentage is EXPLICIT: a nested loop's executor passes its enclosing
   * loop's context; siblings pass none and stay top-level regardless of
   * what else is executing concurrently. The entry carries its full
   * identity (owner instance path + structure id + parent), so every later
   * lookup filters by fields — no key-string parsing, no ambient stack.
   */
  beginLoopStructure(
    loopStructureId: string,
    loopStartNodeId: string,
    loopStopNodeId: string,
    loopEndNodeId: string,
    ownerInstancePath: readonly string[],
    parentContext?: StructureParentContext,
  ): void {
    // Match the entry with the SAME nesting-ness: a top-level begin must not
    // supersede a live nested entry of the same id/owner (nor vice versa),
    // and asking the parity question of merely the latest entry would let a
    // stale twin of the incoming kind survive unseen.
    const existing = findEntryByOwner(
      this.pendingLoopStructures.get(loopStructureId),
      ownerInstancePath,
      (entry) => !entry.parentContext === !parentContext,
    );
    if (existing) {
      // The superseded entry can already hold COMPLETED iteration records, and
      // building each of those SPLICED its nested children out of
      // `completedNestedLoopRecords`. Dropping the entry would take those
      // child `LoopRecord`s with it, and the finalize sweep only sees what is
      // still parked — the SW-14/PD-01 shape a third time, at the one site
      // that discards an iteration record it did not produce.
      for (const iterationRecord of existing.iterations) {
        this.returnNestedRecordsForFinalize(
          iterationRecord,
          existing.structureId,
          iterationRecord.iteration,
        );
      }
      this.emitWarning({
        kind: 'key-collision',
        key: structureRecordKey(ownerInstancePath, loopStructureId),
        message:
          existing.iterations.length > 0
            ? `beginLoopStructure re-begun before completion; the earlier pending entry is superseded, discarding its ${existing.iterations.length} completed iteration record(s) — their steps remain in the flat steps list and any nested loop records they had collected were returned for finalize salvage`
            : 'beginLoopStructure re-begun before completion; the earlier pending entry is superseded',
      });
      removePendingEntry(this.pendingLoopStructures, loopStructureId, existing);
    }
    addPendingEntry(this.pendingLoopStructures, loopStructureId, {
      structureId: loopStructureId,
      ownerInstancePath: [...ownerInstancePath],
      loopStartNodeId,
      loopStopNodeId,
      loopEndNodeId,
      iterations: [] as LoopIterationRecord[],
      startTime: this.timer.now(),
      parentContext,
    });
  }

  /**
   * Record the beginning of a loop iteration.
   *
   * If an iteration of the same identity is somehow still pending (a throw
   * between complete/begin, or API misuse), the superseded one is CLOSED as
   * its own iteration record rather than having its buffered steps folded
   * into the new one. Folding was self-contradictory in two ways: it moved
   * steps stamped `loopIteration: N` into the record for `N+1`, and the new
   * entry's `startTime` is taken now — after those steps ran — so they fell
   * outside their own record's `[startTime, endTime]` window. One
   * explicitly-anomalous extra record (the warning fires either way) is
   * more honest than a silently mis-attributed, mis-timed one.
   */
  beginLoopIteration(
    loopStructureId: string,
    iteration: number,
    ownerInstancePath: readonly string[],
  ): void {
    const existing = findEntryByOwner(
      this.pendingLoopIterations.get(loopStructureId),
      ownerInstancePath,
    );
    if (existing) {
      removePendingEntry(this.pendingLoopIterations, loopStructureId, existing);
      // A new iteration beginning is itself the evidence that the loop
      // condition held, so `true` is the honest synthetic condition value.
      const supersededRecord = this.buildLoopIterationRecord(
        existing,
        existing.iteration,
        true,
        this.timer.now(),
      );
      const structure = findEntryByOwner(
        this.pendingLoopStructures.get(loopStructureId),
        ownerInstancePath,
      );
      if (structure) {
        structure.iterations.push(supersededRecord);
      } else {
        this.returnNestedRecordsForFinalize(
          supersededRecord,
          existing.structureId,
          existing.iteration,
        );
      }
      this.emitWarning({
        kind: 'key-collision',
        key: structureRecordKey(ownerInstancePath, loopStructureId),
        message: structure
          ? `beginLoopIteration called while iteration ${existing.iteration} was still pending; the superseded iteration was closed as its own record`
          : `beginLoopIteration called while iteration ${existing.iteration} was still pending and no loop structure was pending to attach it to; its steps remain in the flat steps list and any nested loop records it had collected were returned for finalize salvage`,
      });
    }
    addPendingEntry(this.pendingLoopIterations, loopStructureId, {
      structureId: loopStructureId,
      ownerInstancePath: [...ownerInstancePath],
      iteration,
      startTime: this.timer.now(),
      stepRecords: [],
    });
  }

  /**
   * Un-do a `buildLoopIterationRecord` whose record is about to be DISCARDED.
   *
   * Building an iteration record SPLICES every matching child out of
   * `completedNestedLoopRecords`. If the record is then dropped — because no
   * loop structure was pending to attach it to — those nested `LoopRecord`s go
   * with it, and `promoteOrphansAtFinalize` only sweeps what is still parked,
   * so they become unreachable. That violates the salvage machinery's stated
   * contract: "for finalized records, structure-record loss is
   * unrepresentable".
   *
   * Three sites call THIS helper: the two PRODUCERS (`beginLoopIteration`'s
   * supersede path and `completeLoopIteration`'s no-structure path) and the
   * one site that discards records it did not produce
   * (`beginLoopStructure`'s supersede path, which drops a pending entry whose
   * `iterations[]` are already built).
   *
   * A FOURTH site of the same class — `consumePendingLoopSubtree` deleting
   * pending children the materializer had declined to fold — is closed
   * differently, by the required `foldedChildEntries` set, because there the
   * records were never built in the first place. Do not read the three-caller
   * list as an enumeration of the hazard: the hazard is "a built record or a
   * parked child is discarded", and it has surfaced at four distinct places
   * across four review rounds, each time somewhere the previous fix had not
   * looked.
   */
  private returnNestedRecordsForFinalize(
    discardedRecord: LoopIterationRecord,
    parentLoopStructureId: string,
    parentIteration: number,
  ): void {
    for (const [, nestedRecord] of discardedRecord.nestedLoopRecords) {
      this.completedNestedLoopRecords.push({
        record: nestedRecord,
        structureId: nestedRecord.loopStructureId,
        ownerInstancePath: nestedRecord.ownerInstancePath ?? [],
        parentLoopStructureId,
        parentIteration,
      });
    }
  }

  /**
   * Build the `LoopIterationRecord` for a pending iteration, folding in the
   * nested loop records that completed inside it. Collection filters by
   * DECLARED parentage (parent id + iteration + owner path equality) — a
   * concurrently-executing sibling can never be collected or skipped by
   * accident, and a truly-nested child always completed before its parent's
   * sweep (the parent awaits its body levels first). Collected children are
   * REMOVED from the parked list, so each is claimed exactly once.
   *
   * `iteration` labels the RECORD (pending entries are matched by owner, not
   * by iteration, so the caller's number is what the executor intends). The
   * nested-record filter deliberately uses `pending.iteration` instead: parked
   * children were stamped with the number that was live when they ran, as were
   * the buffered steps. The two agree on every executor path; a divergence is
   * caller misuse and is reported by `completeLoopIteration` rather than
   * silently changing a nested loop's depth in the published tree.
   *
   * Still-PENDING children are NOT folded here — only completed, parked ones.
   * A child left pending when this iteration closes is surfaced flat by the
   * finalize salvage with an `orphan-promoted` warning.
   */
  private buildLoopIterationRecord(
    pending: PendingLoopIterationEntry,
    iteration: number,
    conditionValue: boolean,
    now: number,
  ): LoopIterationRecord {
    const nestedLoopRecords = new Map<string, LoopRecord>();
    for (
      let index = this.completedNestedLoopRecords.length - 1;
      index >= 0;
      index--
    ) {
      const completed = this.completedNestedLoopRecords[index]!;
      if (
        completed.parentLoopStructureId === pending.structureId &&
        completed.parentIteration === pending.iteration &&
        instancePathsEqual(
          completed.ownerInstancePath,
          pending.ownerInstancePath,
        )
      ) {
        // Nested children key by their own full path, exactly like every
        // other structure record — so a nested map is unambiguous even when
        // two instances of one template run inside a single iteration.
        nestedLoopRecords.set(
          structureRecordKey(
            completed.ownerInstancePath,
            completed.structureId,
          ),
          completed.record,
        );
        this.completedNestedLoopRecords.splice(index, 1);
      }
    }

    return {
      iteration,
      startTime: pending.startTime - this.startTime,
      endTime: now - this.startTime,
      duration: now - pending.startTime,
      conditionValue,
      // COPY, like the in-progress materializer does. `pending.stepRecords` is
      // the recorder's live buffer that `addStepToPendingIteration` pushes
      // into; publishing it by reference makes the record's
      // `ReadonlyArray` a lie the moment anything routes one more step to this
      // identity, and would let a step land outside its own record's
      // `[startTime, endTime]` window.
      stepRecords: [...pending.stepRecords],
      nestedLoopRecords,
      nestedSwitchRecords: new Map(),
    };
  }

  /**
   * Record the completion of a loop iteration and collect the nested loop
   * records that completed within it (see `buildLoopIterationRecord`).
   */
  completeLoopIteration(
    loopStructureId: string,
    iteration: number,
    conditionValue: boolean,
    ownerInstancePath: readonly string[],
  ): void {
    const pending = findEntryByOwner(
      this.pendingLoopIterations.get(loopStructureId),
      ownerInstancePath,
    );
    if (!pending) return;

    // DETACH FIRST. Once the entry is out of the pending map,
    // `addStepToPendingIteration` can no longer route a step into the buffer
    // this record is about to publish, so the record cannot grow a step that
    // ran after its own `endTime`.
    removePendingEntry(this.pendingLoopIterations, loopStructureId, pending);

    // The caller's iteration number and the pending entry's are two sources of
    // truth for one fact. They agree on every executor path; when they do not,
    // the buffered steps and the parked children are stamped with the pending
    // entry's number, so a silent mismatch would re-parent nested loops to the
    // top level with only a generic salvage warning to show for it.
    if (pending.iteration !== iteration) {
      this.emitWarning({
        kind: 'key-collision',
        key: structureRecordKey(ownerInstancePath, loopStructureId),
        message: `completeLoopIteration(${iteration}) closed a pending iteration ${pending.iteration}; nested records are collected for ${pending.iteration}, where the steps and children were actually stamped`,
      });
    }

    const record = this.buildLoopIterationRecord(
      pending,
      iteration,
      conditionValue,
      this.timer.now(),
    );

    const structure = findEntryByOwner(
      this.pendingLoopStructures.get(loopStructureId),
      ownerInstancePath,
    );
    if (structure) {
      structure.iterations.push(record);
    } else {
      // Same hazard as the supersede path: the record we just built absorbed
      // parked children, and nothing is going to hold it. Return them, and say
      // so — dropping an iteration silently is worse here than there, because
      // this is the site the executor drives on every iteration.
      this.returnNestedRecordsForFinalize(
        record,
        pending.structureId,
        pending.iteration,
      );
      this.emitWarning({
        kind: 'orphan-dropped',
        key: structureRecordKey(ownerInstancePath, loopStructureId),
        message: `completeLoopIteration found no pending loop structure to attach iteration ${pending.iteration} to; the iteration record was discarded (its steps remain in the flat steps list) and any nested loop records it had collected were returned for finalize salvage`,
      });
    }
  }

  /**
   * Finalize a loop structure recording.
   * For nested loops, stores the completed record for the parent iteration
   * to collect. For top-level loops, stores in the global loopRecords map.
   */
  completeLoopStructure(
    loopStructureId: string,
    ownerInstancePath: readonly string[],
  ): void {
    const structure = findEntryByOwner(
      this.pendingLoopStructures.get(loopStructureId),
      ownerInstancePath,
    );
    if (!structure) return;

    const now = this.timer.now();
    const loopRecord: LoopRecord = {
      loopStructureId,
      // COPY. `ExecutionRecorder` is on the published surface, so this array
      // came from consumer code; `readonly string[]` is a compile-time promise
      // a caller breaks simply by reusing one mutable array across calls.
      // Every pending entry and every metadata row already copies — a
      // published record that did not would mutate retroactively while the
      // metadata it is matched against silently disagreed.
      ownerInstancePath: [...ownerInstancePath],
      loopStartNodeId: structure.loopStartNodeId,
      loopStopNodeId: structure.loopStopNodeId,
      loopEndNodeId: structure.loopEndNodeId,
      iterations: structure.iterations,
      totalIterations: structure.iterations.length,
      startTime: structure.startTime - this.startTime,
      endTime: now - this.startTime,
      duration: now - structure.startTime,
    };

    removePendingEntry(this.pendingLoopStructures, loopStructureId, structure);
    if (structure.parentContext) {
      // Nested: park for the DECLARED parent iteration's sweep.
      this.completedNestedLoopRecords.push({
        record: loopRecord,
        structureId: loopStructureId,
        // COPY — this is a pending-bookkeeping row like any other. It is
        // compared BY VALUE (`instancePathsEqual`) to decide whether the child
        // is collected, and it MINTS the published key on two paths; a caller
        // reusing its array would silently change which parent claims this
        // child, or which key it is filed under, after the fact.
        ownerInstancePath: [...ownerInstancePath],
        parentLoopStructureId: structure.parentContext.loopStructureId,
        parentIteration: structure.parentContext.iteration,
      });
    } else {
      this.storeFinalRecord(
        this.loopRecords,
        this.loopRecordMeta,
        loopStructureId,
        ownerInstancePath,
        loopRecord,
      );
    }
  }

  /**
   * Record the beginning of a switch structure.
   */
  beginSwitchStructure(
    switchStructureId: string,
    switchStartNodeId: string,
    switchEndNodeId: string,
    ownerInstancePath: readonly string[],
  ): void {
    const existing = findEntryByOwner(
      this.pendingSwitchStructures.get(switchStructureId),
      ownerInstancePath,
    );
    if (existing) {
      this.emitWarning({
        kind: 'key-collision',
        key: structureRecordKey(ownerInstancePath, switchStructureId),
        message:
          'beginSwitchStructure re-begun before completion; the earlier pending entry is superseded',
      });
      removePendingEntry(
        this.pendingSwitchStructures,
        switchStructureId,
        existing,
      );
    }
    addPendingEntry(this.pendingSwitchStructures, switchStructureId, {
      structureId: switchStructureId,
      ownerInstancePath: [...ownerInstancePath],
      switchStartNodeId,
      switchEndNodeId,
      startTime: this.timer.now(),
      stepRecords: [],
    });
  }

  /**
   * Finalize a switch structure recording.
   */
  completeSwitchStructure(
    switchStructureId: string,
    branchTaken: boolean,
    ownerInstancePath: readonly string[],
  ): void {
    const pending = findEntryByOwner(
      this.pendingSwitchStructures.get(switchStructureId),
      ownerInstancePath,
    );
    if (!pending) return;
    const now = this.timer.now();

    const record: SwitchRecord = {
      switchStructureId,
      // Copied for the same reason as `LoopRecord.ownerInstancePath`.
      ownerInstancePath: [...ownerInstancePath],
      switchStartNodeId: pending.switchStartNodeId,
      switchEndNodeId: pending.switchEndNodeId,
      branchTaken,
      startTime: pending.startTime - this.startTime,
      endTime: now - this.startTime,
      duration: now - pending.startTime,
      // COPY, like the loop-iteration builder: `pending.stepRecords` is the
      // recorder's live buffer, so publishing it by reference would make the
      // record's `ReadonlyArray` a lie if anything routed one more step here.
      stepRecords: [...pending.stepRecords],
      nestedLoopRecords: new Map(),
      nestedSwitchRecords: new Map(),
    };

    removePendingEntry(
      this.pendingSwitchStructures,
      switchStructureId,
      pending,
    );
    this.storeFinalRecord(
      this.switchRecords,
      this.switchRecordMeta,
      switchStructureId,
      ownerInstancePath,
      record,
    );
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
    ownerInstancePath: readonly string[],
  ): void {
    this.storeFinalRecord(
      this.groupRecords,
      this.groupRecordMeta,
      groupNodeId,
      ownerInstancePath,
      {
        groupNodeId,
        // Copied for the same reason as `LoopRecord.ownerInstancePath`.
        ownerInstancePath: [...ownerInstancePath],
        groupNodeTypeId,
        innerRecord,
        inputMapping,
        outputMapping,
      },
    );
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
   * Begin a recording scope for the group instance identified by
   * `ownerInstancePath`. Returns a branded single-use token that
   * `endScope()` REQUIRES back. Tokens live in a SET — concurrent sibling
   * scopes may end in any order; each token identifies exactly one scope,
   * and ownership (not position) decides what the scoped record contains.
   */
  beginScope(ownerInstancePath: readonly string[]): RecorderScopeToken {
    const token: RecorderScopeToken = {
      [recorderScopeTokenBrand]: true,
      tokenSerial: ++this.scopeTokenCounter,
      ownerInstancePath: [...ownerInstancePath],
      startStepIndex: this.steps.length,
      startErrorIndex: this.errors.length,
      startStoreSerial: this.finalStoreSerial,
      startPauseDuration: this.getEffectivePauseDuration(),
      startTime: this.timer.now(),
    };
    this.activeScopeTokens.add(token);
    return token;
  }

  /**
   * DEV-ONLY consistency assertion for `endScope`: a group scope must not
   * close while a structure that scope OWNS is still pending. That state
   * means a begin/complete pair is mis-nested, or a throw skipped a
   * complete — the exact defect class the identity rewrite exists to make
   * impossible — and it is worth surfacing at the moment and place it
   * happens rather than later, as an anonymous `orphan-promoted` salvage at
   * finalize with no mention of which scope leaked it.
   *
   * Scoped to UNPARENTED structures deliberately: a nested loop left pending
   * inside a pending parent loop shares ONE root cause with its parent, so
   * reporting roots alone yields one message per cause instead of one per
   * level. This is also why the legitimate loop-in-loop-in-group case fires
   * nothing — when everything completes, nothing is pending at all.
   *
   * Deliberately NOT a `RecorderWarning`: the four kinds are a
   * consumer-facing contract about salvage outcomes, whereas this is an
   * internal invariant probe aimed at library developers. It therefore has
   * its own `[ExecutionRecorder:dev]` console prefix and never reaches
   * `onRecorderWarning`, so a consumer's warning stream stays exactly the
   * documented four kinds.
   */
  private assertNoPendingOwnedStructures(owner: readonly string[]): void {
    // A scope owner is a group-instance path and is never empty. The guard is
    // load-bearing for CORRECTNESS: an empty owner is a prefix of every path,
    // so it would report unrelated structures running concurrently outside
    // this scope.
    if (owner.length === 0) return;

    // Cheapest possible exit first: nothing pending anywhere means nothing to
    // report, in any environment. Three O(1) reads, no allocation. (This does
    // NOT cover a group nested in a loop — there the enclosing loop is always
    // pending — which is why the structural sweep below still precedes the
    // environment probe.)
    if (
      this.pendingLoopStructures.size === 0 &&
      this.pendingSwitchStructures.size === 0 &&
      this.pendingLoopIterations.size === 0
    ) {
      return;
    }

    // COST. `endScope` runs once per group-instance execution — a group inside
    // an N-iteration loop reaches here N times — and a `Map.size` pre-check is
    // NOT enough to make that free: in exactly that topology the enclosing
    // loop's structure and iteration are both still pending, so every size is
    // non-zero on every healthy call. So do the whole sweep STRUCTURALLY
    // first, allocating nothing per candidate and building no strings, and pay
    // for `isDevEnvironment()` (a thrown-and-caught ReferenceError, ~7µs, in a
    // bundler-less browser) and for `structureRecordKey` only once something
    // is actually going to be reported.
    //
    // The true invariant is "a healthy run has nothing pending THAT THIS SCOPE
    // OWNS" — not "nothing pending".
    const leakedStructures: PendingLoopStructureEntry[] = [];
    const leakedSwitches: PendingSwitchStructureEntry[] = [];
    const leakedIterations: PendingLoopIterationEntry[] = [];

    /**
     * Is this entry's declared parent also pending, and inside this scope?
     *
     * Looks for ANY pending entry of the declared parent id whose owner path
     * is a prefix of the child's and which this scope owns — not merely one at
     * the child's exact path. Today the executor always gives a nested loop
     * its parent's exact path, so the two readings coincide; they stop
     * coinciding the moment a caller declares a parent across a group boundary
     * (which D1's `{ kind: 'switch' }` arm and any direct use of the published
     * `ExecutionRecorder` can both do), and the exact-path reading would then
     * report the child as an orphan root beside its own live parent.
     */
    const parentIsPendingHere = (entry: PendingLoopStructureEntry): boolean => {
      const parentContext = entry.parentContext;
      if (!parentContext) return false;
      const candidates = this.pendingLoopStructures.get(
        parentContext.loopStructureId,
      );
      if (!candidates) return false;
      // KNOWN LIMITATION, deliberately not papered over.
      // `StructureParentContext` carries only the parent's structure ID, never
      // its owner path, so when several entries of that id are pending the
      // right one has to be inferred. Neither reading is strictly better:
      //   - exact-path only  ⇒ a parent declared across a group boundary is
      //     not found, and the child is reported beside its own live parent
      //     (a duplicate line);
      //   - prefix (this one) ⇒ an unrelated namesake at an ANCESTOR path can
      //     stand in for a real parent that already completed, and the child's
      //     line is missing.
      // Preferring exact-then-prefix does not help: exact matches are a subset
      // of prefix matches, so the disjunction is just the prefix test again.
      // Prefix is chosen because its failure is a missing DEV line while the
      // other's is a misleading one, and because it is the reading that stays
      // correct when a parent legitimately sits above the child. The durable
      // fix is to put the owner path ON `StructureParentContext` when D1 lands,
      // at which point this stops being a guess.
      return candidates.some(
        (parent) =>
          instancePathStartsWith(
            entry.ownerInstancePath,
            parent.ownerInstancePath,
          ) && instancePathStartsWith(parent.ownerInstancePath, owner),
      );
    };

    for (const entry of allPendingEntries(this.pendingLoopStructures)) {
      if (!instancePathStartsWith(entry.ownerInstancePath, owner)) continue;
      // Skip a nested entry ONLY when its parent is pending here too: the two
      // then share ONE root cause, and reporting the root alone gives one
      // message per cause. A child whose parent already COMPLETED is an orphan
      // root in its own right and must still be reported.
      if (parentIsPendingHere(entry)) continue;
      leakedStructures.push(entry);
    }
    for (const entry of allPendingEntries(this.pendingSwitchStructures)) {
      if (!instancePathStartsWith(entry.ownerInstancePath, owner)) continue;
      leakedSwitches.push(entry);
    }
    // Pending ITERATIONS matter too: one left behind after its structure
    // completed is DISCARDED at finalize, so naming the scope that leaked it
    // is the only attribution a developer ever gets.
    for (const entry of allPendingEntries(this.pendingLoopIterations)) {
      if (!instancePathStartsWith(entry.ownerInstancePath, owner)) continue;
      if (
        findEntryByOwner(
          this.pendingLoopStructures.get(entry.structureId),
          entry.ownerInstancePath,
        )
      ) {
        continue; // its structure is pending too — already reported above
      }
      leakedIterations.push(entry);
    }

    if (
      leakedStructures.length === 0 &&
      leakedSwitches.length === 0 &&
      leakedIterations.length === 0
    ) {
      return;
    }
    if (!isDevEnvironment()) return;

    const pendingIdentities = [
      ...leakedStructures.map((entry) =>
        structureRecordKey(entry.ownerInstancePath, entry.structureId),
      ),
      ...leakedSwitches.map((entry) =>
        structureRecordKey(entry.ownerInstancePath, entry.structureId),
      ),
      ...leakedIterations.map(
        (entry) =>
          `${structureRecordKey(entry.ownerInstancePath, entry.structureId)} (iteration ${entry.iteration})`,
      ),
    ];

    // Be exact about the consequence: structures and switches are PROMOTED at
    // finalize, but a structure-less pending iteration is DROPPED, so "will be
    // salvaged" would be false for precisely the entries this probe is the
    // only warning about.
    const consequence =
      leakedIterations.length === 0
        ? 'the residue will be salvaged into the final record.'
        : `the pending structures will be salvaged at finalize, but the ${leakedIterations.length} pending iteration(s) listed above will be DROPPED (their steps remain in the flat steps list).`;
    console.warn(
      `[ExecutionRecorder:dev] endScope(${JSON.stringify(owner)}) closed while ${pendingIdentities.length} structure(s)/iteration(s) it owns are still pending: ${pendingIdentities.join(', ')}. A begin/complete pair is mis-nested or a throw skipped a complete; ${consequence}`,
    );
  }

  /**
   * End the scope identified by `token` and return an ExecutionRecord
   * containing only the entries the scope's OWNER created:
   *
   * - steps: recorded since scope start AND whose `instancePath` sits under
   *   the owner path (concurrent siblings interleave into the shared flat
   *   array — the window alone is not ownership; the group's own wrapper
   *   step deliberately carries the PARENT path and is thus excluded);
   * - errors: identity-joined — an error belongs to the scope iff one of
   *   the scoped steps carries it (`step.error === error`). The OUTER
   *   `record.errors` array is never mutated;
   * - loop/switch/group records: STORED since the scope opened (by store
   *   serial, so an instance rewriting its own record still counts) AND owned
   *   at or under the owner path. Keys are copied VERBATIM — a scoped record
   *   uses the same absolute full-path keys as the top-level maps, so a
   *   consumer resolves them the same way at every depth
   *   (`resolveStructureRecord`). Records owned deeper than this scope are
   *   included too, so a nested record is reachable from every ancestor
   *   scope as well as from its own.
   *
   * Time bases (deliberate, documented): the record's own
   * `startTime`/`endTime` are absolute timer values and its
   * `totalPauseDuration` is scope-relative, while the steps and structure
   * records it contains keep RUN-relative times — identical to how the
   * top-level record is built.
   *
   * Throws on an unknown or already-consumed token (misuse contract
   * preserved from the stack era).
   */
  endScope(
    token: RecorderScopeToken,
    status: ExecutionRecordStatus,
    scopedValues: ReadonlyMap<string, unknown>,
  ): ExecutionRecord {
    if (!this.activeScopeTokens.has(token)) {
      throw new Error(
        'ExecutionRecorder.endScope() called with an unknown or already-consumed scope token',
      );
    }
    this.activeScopeTokens.delete(token);

    const now = this.timer.now();
    const owner = token.ownerInstancePath;

    this.assertNoPendingOwnedStructures(owner);

    const scopedSteps = this.steps
      .slice(token.startStepIndex)
      .filter((step) => instancePathStartsWith(step.instancePath, owner));

    const scopedErrors: GraphError[] = [];
    for (
      let errorIndex = token.startErrorIndex;
      errorIndex < this.errors.length;
      errorIndex++
    ) {
      const error = this.errors[errorIndex];
      if (scopedSteps.some((step) => step.error === error)) {
        scopedErrors.push(error);
      }
    }

    const filterOwnedSince = <RecordType>(
      map: ReadonlyMap<string, RecordType>,
      meta: ReadonlyMap<string, StoredRecordMeta>,
    ): Map<string, RecordType> => {
      const scoped = new Map<string, RecordType>();
      for (const [key, value] of map) {
        const entryMeta = meta.get(key);
        if (!entryMeta) continue;
        // Membership by WRITE ORDER, not key novelty: an instance that
        // re-executes (a group inside a multi-iteration loop) rewrites its
        // own record under the same identity key, which a key snapshot
        // could not see.
        if (entryMeta.lastStoreSerial <= token.startStoreSerial) continue;
        if (!instancePathStartsWith(entryMeta.ownerInstancePath, owner)) {
          continue;
        }
        // Keys are absolute full-path identities everywhere — scoped copies
        // keep the same key as the top-level map, so there is nothing to
        // re-key and no relative/absolute ambiguity for consumers.
        scoped.set(key, value);
      }
      return scoped;
    };

    return {
      id: `${this.id}-scope-${token.tokenSerial}`,
      startTime: token.startTime,
      endTime: now,
      totalDuration: now - token.startTime,
      warmupDuration: 0,
      totalPauseDuration:
        this.getEffectivePauseDuration() - token.startPauseDuration,
      status,
      steps: scopedSteps,
      errors: scopedErrors,
      concurrencyLevels: [], // Not tracked per scope
      loopRecords: filterOwnedSince(this.loopRecords, this.loopRecordMeta),
      switchRecords: filterOwnedSince(
        this.switchRecords,
        this.switchRecordMeta,
      ),
      groupRecords: filterOwnedSince(this.groupRecords, this.groupRecordMeta),
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
    // Materialize top-level pending structures (nested ones surface through
    // their parent's in-progress iteration).
    for (const entry of allPendingEntries(this.pendingLoopStructures)) {
      if (entry.parentContext) continue;
      const key = structureRecordKey(
        entry.ownerInstancePath,
        entry.structureId,
      );
      // A pending entry means this identity is executing RIGHT NOW, so any
      // record already stored under the same key is from a previous
      // execution of the same instance and is strictly stale — the live
      // materialization wins.
      // `snapshot()` consumes nothing — it is a pure read — so the folded-set
      // out-param is filled and discarded. Paying one Set allocation here is
      // what buys the compiler-enforced pairing on the salvage path.
      result.set(
        key,
        this.materializePendingLoopStructure(
          entry,
          now,
          true,
          new Set<PendingLoopStructureEntry>(),
        ),
      );
    }
    return result;
  }

  /**
   * Build a LoopRecord for a still-pending loop structure: completed
   * iterations plus the in-flight one, with its nested children (both parked
   * completed records and still-pending child structures) folded in by
   * DECLARED parentage. Shared by `snapshot()` (live stepping) and the
   * finalize salvage sweep, so both produce the same topology.
   *
   * `inFlightConditionValue` is the condition stamped on the in-progress
   * iteration: `true` for live snapshots ("assume continuing"), `false` at
   * finalize (the run stopped; it never continued).
   */
  private materializePendingLoopStructure(
    entry: PendingLoopStructureEntry,
    now: number,
    inFlightConditionValue: boolean,
    /**
     * Out-param: every pending child ENTRY this fold absorbed, by object
     * identity. `consumePendingLoopSubtree` needs exactly this set — keying by
     * identity STRING cannot work, because a parked sibling record sharing the
     * child's key is precisely the case where the fold declines the child.
     *
     * REQUIRED, deliberately. This same data-loss class was fixed at four
     * separate sites across four review rounds, every time at a site the
     * previous fix had not looked at. Making the parameter optional would keep
     * the class closed only by the discipline of every caller remembering to
     * pass it; making it required closes it by construction — a new call site
     * that forgets does not compile. `snapshot()` has nothing to consume and
     * passes a set it discards, which is a fair price for that guarantee.
     */
    foldedChildEntries: Set<PendingLoopStructureEntry>,
  ): LoopRecord {
    const pending = findEntryByOwner(
      this.pendingLoopIterations.get(entry.structureId),
      entry.ownerInstancePath,
    );
    const iterations: LoopIterationRecord[] = [...entry.iterations];

    if (pending) {
      const nestedLoopRecords = new Map<string, LoopRecord>();
      for (const completed of this.completedNestedLoopRecords) {
        if (
          completed.parentLoopStructureId === entry.structureId &&
          completed.parentIteration === pending.iteration &&
          instancePathsEqual(
            completed.ownerInstancePath,
            entry.ownerInstancePath,
          )
        ) {
          nestedLoopRecords.set(
            structureRecordKey(
              completed.ownerInstancePath,
              completed.structureId,
            ),
            completed.record,
          );
        }
      }
      for (const child of allPendingEntries(this.pendingLoopStructures)) {
        const childKey = structureRecordKey(
          child.ownerInstancePath,
          child.structureId,
        );
        if (
          child.parentContext?.loopStructureId === entry.structureId &&
          child.parentContext.iteration === pending.iteration &&
          instancePathsEqual(
            child.ownerInstancePath,
            entry.ownerInstancePath,
          ) &&
          !nestedLoopRecords.has(childKey)
        ) {
          foldedChildEntries.add(child);
          nestedLoopRecords.set(
            childKey,
            this.materializePendingLoopStructure(
              child,
              now,
              inFlightConditionValue,
              foldedChildEntries,
            ),
          );
        }
      }

      iterations.push({
        iteration: pending.iteration,
        startTime: pending.startTime - this.startTime,
        endTime: now - this.startTime,
        duration: now - pending.startTime,
        conditionValue: inFlightConditionValue,
        stepRecords: [...pending.stepRecords],
        nestedLoopRecords,
        nestedSwitchRecords: new Map(),
      });
    }

    return {
      loopStructureId: entry.structureId,
      ownerInstancePath: entry.ownerInstancePath,
      loopStartNodeId: entry.loopStartNodeId,
      loopStopNodeId: entry.loopStopNodeId,
      loopEndNodeId: entry.loopEndNodeId,
      iterations,
      totalIterations: iterations.length,
      startTime: entry.startTime - this.startTime,
      endTime: now - this.startTime,
      duration: now - entry.startTime,
    };
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
      warmupDuration: 0,
      totalPauseDuration: this.getEffectivePauseDuration(),
      status,
      steps: [...this.steps],
      errors: [...this.errors],
      concurrencyLevels: [...this.concurrencyLevels],
      loopRecords: this.snapshotPendingLoopRecords(now),
      switchRecords: new Map(this.switchRecords),
      groupRecords: new Map(this.groupRecords),
      finalValues: currentValues,
    };
  }

  /**
   * Sweep every pending map for residue a broken/aborted call sequence left
   * behind and PROMOTE it into the final record instead of dropping it —
   * for finalized records, structure-record loss is unrepresentable. Each
   * promotion emits a RecorderWarning (salvage is an anomaly, not success).
   * Promotions DELETE their source entries, so repeated finalize calls
   * (step-by-step mode has three call sites) are idempotent. Run status is
   * caller-computed BEFORE finalize; salvage never touches `errors[]` (an
   * error entry with no corresponding step would desynchronize the record).
   */
  private promoteOrphansAtFinalize(now: number): void {
    // Orphaned pending loop structures (top-level AND nested): the executor
    // completes structures on every reachable exit path, so residue here
    // means a throw between begin/complete or API misuse. Materialize with
    // relative times, folding any in-flight iteration (same conversion as
    // live-stepping snapshots).
    // PARENTLESS pending structures first: materializing one folds its
    // in-flight iteration AND its nested children (parked records + pending
    // child structures) exactly as a live snapshot would, so a salvaged
    // topology matches what the last snapshot showed. Children consumed this
    // way are deleted below so the later passes cannot promote them twice.
    for (const entry of allPendingEntries(this.pendingLoopStructures)) {
      if (entry.parentContext) continue;
      const foldedChildEntries = new Set<PendingLoopStructureEntry>();
      const record = this.materializePendingLoopStructure(
        entry,
        now,
        false,
        foldedChildEntries,
      );
      // Consume exactly what the materialization absorbed — a pending child it
      // declined to fold must stay pending so a later pass promotes it.
      this.consumePendingLoopSubtree(entry, foldedChildEntries);
      const key = this.storeSalvagedRecord(
        this.loopRecords,
        this.loopRecordMeta,
        entry.structureId,
        entry.ownerInstancePath,
        record,
      );
      this.emitWarning({
        kind: 'orphan-promoted',
        key,
        message:
          'pending loop structure never completed; promoted to the final record (an existing record for the same identity was preserved under its own key)',
      });
    }

    // Whatever nested residue remains is genuinely parentless — promote flat.
    // Re-read the store each round: materializing an entry CONSUMES its
    // subtree, so a snapshot taken up-front would re-promote children that
    // pass 1 (or an earlier round of this loop) already folded in.
    for (;;) {
      const entry = allPendingEntries(this.pendingLoopStructures)[0];
      if (!entry) break;
      const foldedChildEntries = new Set<PendingLoopStructureEntry>();
      const record = this.materializePendingLoopStructure(
        entry,
        now,
        false,
        foldedChildEntries,
      );
      // Consume exactly what the materialization absorbed — a pending child it
      // declined to fold must stay pending so a later pass promotes it.
      this.consumePendingLoopSubtree(entry, foldedChildEntries);
      const key = this.storeSalvagedRecord(
        this.loopRecords,
        this.loopRecordMeta,
        entry.structureId,
        entry.ownerInstancePath,
        record,
      );
      const parentSurvived =
        entry.parentContext !== undefined &&
        this.loopRecords.has(
          structureRecordKey(
            entry.ownerInstancePath,
            entry.parentContext.loopStructureId,
          ),
        );
      this.emitWarning({
        kind: 'orphan-promoted',
        key,
        message: parentSurvived
          ? 'nested pending loop structure was not nested into its parent (a completed record of the same identity had already taken its key there); promoted to the final record instead'
          : 'nested pending loop structure had no surviving parent; promoted to the final record',
      });
    }

    // Completed nested records whose parent iteration sweep never ran.
    while (this.completedNestedLoopRecords.length > 0) {
      const completed = this.completedNestedLoopRecords.pop()!;
      const key = this.storeSalvagedRecord(
        this.loopRecords,
        this.loopRecordMeta,
        completed.structureId,
        completed.ownerInstancePath,
        completed.record,
      );
      this.emitWarning({
        kind: 'orphan-promoted',
        key,
        message:
          'nested loop record was never collected by its parent iteration; promoted to the final record',
      });
    }

    // Structure-less pending iterations: nothing to attach them to (the
    // triplet ids live on the structure entry) — warn and DROP.
    for (const entry of allPendingEntries(this.pendingLoopIterations)) {
      removePendingEntry(this.pendingLoopIterations, entry.structureId, entry);
      this.emitWarning({
        kind: 'orphan-dropped',
        key: structureRecordKey(entry.ownerInstancePath, entry.structureId),
        message:
          'pending loop iteration had no owning structure and was discarded; its steps remain in the flat steps list',
      });
    }

    // Orphaned pending switches (reachable TODAY: beginSwitchStructure runs
    // before the structure-validation throws, which never complete it).
    for (const pending of allPendingEntries(this.pendingSwitchStructures)) {
      const record: SwitchRecord = {
        switchStructureId: pending.structureId,
        ownerInstancePath: pending.ownerInstancePath,
        switchStartNodeId: pending.switchStartNodeId,
        switchEndNodeId: pending.switchEndNodeId,
        branchTaken: false,
        startTime: pending.startTime - this.startTime,
        endTime: now - this.startTime,
        duration: now - pending.startTime,
        // Copied for the same reason as the healthy switch path above.
        stepRecords: [...pending.stepRecords],
        nestedLoopRecords: new Map(),
        nestedSwitchRecords: new Map(),
      };
      removePendingEntry(
        this.pendingSwitchStructures,
        pending.structureId,
        pending,
      );
      const key = this.storeSalvagedRecord(
        this.switchRecords,
        this.switchRecordMeta,
        pending.structureId,
        pending.ownerInstancePath,
        record,
      );
      this.emitWarning({
        kind: 'orphan-promoted',
        key,
        message:
          'pending switch structure never completed; promoted to the final record',
      });
    }

    // Steps begun but never completed: stamp a terminal state so the record
    // never claims a still-open step succeeded (times stay in range).
    for (const step of this.steps) {
      // `beginStep` writes `endTime: 0`; every terminal path overwrites it
      // with a strictly-positive monotonic value, so 0 means "never finished".
      if (step.endTime !== 0) continue;
      step.endTime = now - this.startTime;
      step.duration = step.endTime - step.startTime;
      step.status = 'errored';
      this.rawStartTimes.delete(step.stepIndex);
      this.emitWarning({
        kind: 'orphan-promoted',
        key: String(step.stepIndex),
        message: `step ${step.stepIndex} (${step.nodeId}) was begun but never completed; stamped as errored at finalize`,
      });
    }

    // Scopes never ended (a throw between beginScope and endScope): the
    // steps live in the flat list; the group record is simply absent.
    for (const token of this.activeScopeTokens) {
      this.activeScopeTokens.delete(token);
      this.emitWarning({
        kind: 'unclosed-scope',
        key: structureRecordKey(
          token.ownerInstancePath,
          `scope-${token.tokenSerial}`,
        ),
        message:
          'a recording scope was never ended; its inner record was not built',
      });
    }
  }

  /**
   * Remove a pending loop structure and everything a materialization of it
   * already absorbed: its in-flight iteration, its parked completed children,
   * and its pending child structures (recursively). Keeps the salvage sweep
   * idempotent and prevents double promotion.
   */
  private consumePendingLoopSubtree(
    entry: PendingLoopStructureEntry,
    /** REQUIRED — see `materializePendingLoopStructure`'s parameter of the
     *  same name. Must be the SAME set that materialization filled. */
    foldedChildEntries: ReadonlySet<PendingLoopStructureEntry>,
  ): void {
    removePendingEntry(this.pendingLoopStructures, entry.structureId, entry);
    const pendingIteration = findEntryByOwner(
      this.pendingLoopIterations.get(entry.structureId),
      entry.ownerInstancePath,
    );
    if (pendingIteration) {
      removePendingEntry(
        this.pendingLoopIterations,
        entry.structureId,
        pendingIteration,
      );
      for (
        let index = this.completedNestedLoopRecords.length - 1;
        index >= 0;
        index--
      ) {
        const completed = this.completedNestedLoopRecords[index]!;
        if (
          completed.parentLoopStructureId === entry.structureId &&
          completed.parentIteration === pendingIteration.iteration &&
          instancePathsEqual(
            completed.ownerInstancePath,
            entry.ownerInstancePath,
          )
        ) {
          this.completedNestedLoopRecords.splice(index, 1);
        }
      }
      for (const child of allPendingEntries(this.pendingLoopStructures)) {
        if (
          child.parentContext?.loopStructureId === entry.structureId &&
          child.parentContext.iteration === pendingIteration.iteration &&
          instancePathsEqual(child.ownerInstancePath, entry.ownerInstancePath)
        ) {
          // Only consume what the materialization ACTUALLY absorbed. The
          // folder skips a pending child whose identity key is already taken
          // by a parked sibling record (`!nestedLoopRecords.has(childKey)`),
          // so this filter — which has no such conjunct — is a strict
          // superset. Deleting the difference removed a live child, its built
          // iteration records and its parked grandchildren from every map with
          // no warning on any channel. Leaving it pending instead lets
          // `promoteOrphansAtFinalize`'s parentless pass promote it flat, with
          // an `orphan-promoted` warning, which is the honest outcome.
          if (!foldedChildEntries.has(child)) {
            continue;
          }
          this.consumePendingLoopSubtree(child, foldedChildEntries);
        }
      }
    }
  }

  /**
   * Finalize the recording and return the complete ExecutionRecord.
   */
  finalize(
    status: ExecutionRecordStatus,
    finalValues: ReadonlyMap<string, unknown>,
    warmupDuration = 0,
  ): ExecutionRecord {
    const endTime = this.timer.now();
    this.promoteOrphansAtFinalize(endTime);

    return {
      id: this.id,
      startTime: this.startTime,
      endTime,
      totalDuration: endTime - this.startTime,
      warmupDuration,
      totalPauseDuration: this.getEffectivePauseDuration(),
      status,
      steps: this.steps,
      errors: this.errors,
      concurrencyLevels: this.concurrencyLevels,
      loopRecords: this.loopRecords,
      switchRecords: this.switchRecords,
      groupRecords: this.groupRecords,
      finalValues,
    };
  }
}

/**
 * Look up a structure record by its identity instead of by a bare id.
 *
 * PURE key arithmetic — it needs nothing but the record map, so it works on
 * imported records too (the recorder's ownership bookkeeping is internal and
 * is not serialized; the identity a consumer needs travels on each record's
 * own `ownerInstancePath`).
 *
 * Pass the step's `instancePath` (a root step has none). `loopStructureId` is
 * optional on a step — only steps inside a loop body carry one — so narrow it
 * first:
 * ```ts
 * if (step.loopStructureId !== undefined) {
 *   const hit = resolveStructureRecord(
 *     record.loopRecords,
 *     step.loopStructureId,
 *     step.instancePath,
 *   );
 *   hit?.record.totalIterations; // the OWNING instance's loop, not a namesake's
 * }
 * ```
 * The fallback scan keeps recordings exported before the full-path key format
 * resolvable — a BARE key has no owner so any owner may claim it, while an
 * `<owner>|<id>` key does distinguish instances and is matched by owner, never
 * across one.
 */
function resolveStructureRecord<
  RecordType extends { ownerInstancePath?: readonly string[] },
>(
  map: ReadonlyMap<string, RecordType>,
  structureId: string,
  instancePath?: readonly string[],
): { key: string; record: RecordType } | undefined {
  const owner = instancePath ?? [];
  const key = structureRecordKey(owner, structureId);
  const exact = map.get(key);
  if (exact !== undefined) return { key, record: exact };

  // Salvage duplicates: the finalize backstop files a second record for an
  // identity under the same path plus a numeric ordinal. Return the FIRST
  // ordinal so a salvaged record is never unreachable (the healthy record,
  // when one exists, already returned above).
  for (let ordinal = 1; ordinal <= map.size; ordinal++) {
    const ordinalKey = structureRecordKey(owner, structureId, ordinal);
    const salvaged = map.get(ordinalKey);
    if (salvaged !== undefined) return { key: ordinalKey, record: salvaged };
  }

  // LEGACY ONLY: records exported before the full-path key format carry bare
  // (or `owner|id`) keys. A record filed under a real identity key is
  // addressed by that key alone — never fall back across identities, or two
  // instances of one template alias again (the precise bug this format
  // exists to eliminate).
  //
  // The test is on the KEY, not on the record: `deserializeLoopRecord` and
  // friends default a missing `ownerInstancePath` to `[]` so an imported
  // record is not a type lie, which means the VALUE of an imported pre-v3
  // record is indistinguishable from a root-owned current one. Its key still
  // tells the truth.
  //
  // The two pre-v3 shapes are NOT equivalent and must not be treated alike:
  //   - a BARE `structureId` key carries no owner at all, so any owner may
  //     legitimately claim it — that is the only reading available;
  //   - an `<owner>|<structureId>` key DOES distinguish instances, so
  //     returning one for a different owner would hand back another
  //     instance's record. Prefer an owner-matching qualified candidate, and
  //     never settle for a mismatched one.
  let bareCandidate: { key: string; record: RecordType } | undefined;
  const qualifiedSuffix = `|${structureId}`;
  // The ONE separator a shipped pre-v3 export can contain between path
  // segments. The qualified spelling was `${ownerInstancePath.join('/')}|${structureId}`,
  // so the owner part is slash-joined and the pipe appears exactly once, as
  // the boundary. Do NOT also accept a pipe-joined owner: no producer emitted
  // it, and accepting it re-opens the cross-identity alias this scan was fixed
  // for — a real key `a|b|L` (owner `['a']`, structure id `b|L`) would match a
  // query for structure `L` under owner `['a','b']` and hand back a different
  // structure's record.
  const expectedOwner = owner.join('/');
  for (const [candidateKey, candidate] of map) {
    if (isStructureRecordKey(candidateKey)) continue;
    if (candidateKey === structureId) {
      // A bare key carries no owner, so any owner may claim it — but only if
      // no owner-MATCHING qualified key exists, so hold it and keep looking.
      bareCandidate ??= { key: candidateKey, record: candidate };
      continue;
    }
    if (!candidateKey.endsWith(qualifiedSuffix)) continue;
    const candidateOwner = candidateKey.slice(
      0,
      candidateKey.length - qualifiedSuffix.length,
    );
    if (candidateOwner === expectedOwner) {
      return { key: candidateKey, record: candidate };
    }
  }
  return bareCandidate;
}

export {
  ExecutionRecorder,
  structureRecordKey,
  resolveStructureRecord,
  recorderWarningKinds,
  // Module-level only — intentionally absent from the package barrel (see
  // each docblock): import validation needs the first, `useNodeRunner`'s
  // trampoline needs the second, consumers need neither.
  isStructureRecordKey,
  emitRecorderWarningToConsole,
};
export type {
  StructureParentContext,
  RecorderScopeToken,
  RecorderWarning,
  RecorderWarningKind,
  ExecutionRecorderOptions,
};
