import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type { standardNodeTypeNames } from '../nodeStateManagement/standardNodes';

// ─────────────────────────────────────────────────────
// Runner State Machine
// ─────────────────────────────────────────────────────

const runnerStates = [
  'idle',
  'compiling',
  'running',
  'paused',
  'completed',
  'errored',
] as const;

type RunnerState = (typeof runnerStates)[number];

// ─────────────────────────────────────────────────────
// Node Visual State (per-node UI indicator)
// ─────────────────────────────────────────────────────

const nodeVisualStates = [
  'idle',
  'running',
  'completed',
  'errored',
  'skipped',
  'warning',
] as const;

type NodeVisualState = (typeof nodeVisualStates)[number];

// ─────────────────────────────────────────────────────
// Input Connection Value (what each incoming edge carries)
// ─────────────────────────────────────────────────────

/**
 * Represents a single incoming connection to an input handle,
 * carrying the value produced by the source and full metadata
 * about which node and handle it came from.
 */
type InputConnectionValue = {
  /** The value produced by the source output handle */
  value: unknown;
  /** Source node instance ID */
  sourceNodeId: string;
  /** Source node display name (from typeOfNodes) */
  sourceNodeName: string;
  /** Source node type ID (key in typeOfNodes) */
  sourceNodeTypeId: string;
  /** Source output handle ID (unique per node instance) */
  sourceHandleId: string;
  /** Source output handle display name */
  sourceHandleName: string;
  /** Source output handle data type ID */
  sourceDataTypeId: string;
  /** Edge ID connecting source to target */
  edgeId: string;
};

// ─────────────────────────────────────────────────────
// Input Handle Value (what a function implementation receives per input)
// ─────────────────────────────────────────────────────

/**
 * Represents the resolved connections and metadata for a single input
 * handle during execution. The map key in `FunctionImplementation` is
 * the handle's **name** from the node type definition.
 *
 * `connections` is **always** an array — even for single connections:
 * - 1 incoming edge → `connections` has 1 entry
 * - N incoming edges (fan-in) → `connections` has N entries
 * - No edges → `connections` is empty, `isDefault` is true
 *
 * For default (unconnected) inputs with `allowInput`, the user-entered
 * value is available in `defaultValue`.
 */
type InputHandleValue = {
  /** All incoming connection values — always an array, one entry per edge */
  connections: ReadonlyArray<InputConnectionValue>;
  /** Runtime handle ID (unique per node instance) */
  handleId: string;
  /** Display name from the node type definition */
  handleName: string;
  /** Data type unique ID for this handle */
  dataTypeId: string;
  /** True when no edges exist — value comes from user-entered default */
  isDefault: boolean;
  /** The user-entered default value (only meaningful when isDefault is true) */
  defaultValue?: unknown;
};

// ─────────────────────────────────────────────────────
// Output Handle Info (metadata for output handles, no value yet)
// ─────────────────────────────────────────────────────

/**
 * Metadata about a single output handle, passed to the function
 * implementation so it knows what outputs to produce.
 */
type OutputHandleInfo = {
  /** Runtime handle ID (unique per node instance) */
  handleId: string;
  /** Display name from the node type definition */
  handleName: string;
  /** Data type unique ID for this handle */
  dataTypeId: string;
  /** All edges consuming this output handle's value */
  connections: ReadonlyArray<{
    targetNodeId: string;
    targetHandleId: string;
    edgeId: string;
  }>;
};

// ─────────────────────────────────────────────────────
// Execution Context (runtime info passed to function implementations)
// ─────────────────────────────────────────────────────

/**
 * Runtime context provided to every function implementation call.
 * Contains node identity, graph state reference, and control signals.
 */
/**
 * Runtime context passed to each function implementation.
 *
 * Non-generic to avoid contravariance: since FunctionImplementation takes
 * context as a parameter (contravariant position), generic params here would
 * make FunctionImplementations<ConcreteType> invariant — breaking assignment
 * to FunctionImplementations<string>. Using default (widened) types for state
 * keeps FunctionImplementations covariant in NodeTypeUniqueId.
 */
type ExecutionContext = {
  /** Runtime node instance ID */
  nodeId: string;
  /** Node type ID from the type definitions */
  nodeTypeId: string;
  /** Display name of the node type */
  nodeTypeName: string;
  /** Read-only reference to the full graph state */
  state: Readonly<State<string, string, SupportedUnderlyingTypes, z.ZodType>>;
  /** Current loop iteration (only set when executing inside a loop body) */
  loopIteration?: number;
  /** Current group nesting depth (only set when executing inside a group) */
  groupDepth?: number;
  /** Signal for cooperative cancellation */
  abortSignal: AbortSignal;
};

// ─────────────────────────────────────────────────────
// Function Implementation (user-provided node logic)
// ─────────────────────────────────────────────────────

/**
 * A single node type's execution function.
 *
 * Receives resolved input values keyed by handle **name** and output handle
 * metadata keyed by handle **name**. Returns a Map of output handle **names**
 * to computed values.
 *
 * May return synchronously (Map) or asynchronously (Promise<Map>).
 *
 * @example
 * ```ts
 * const andGate: FunctionImplementation = (inputs, outputs, ctx) => {
 *   const a = inputs.get('A')?.connections[0]?.value ?? false;
 *   const b = inputs.get('B')?.connections[0]?.value ?? false;
 *   return new Map([['Out', Boolean(a) && Boolean(b)]]);
 * };
 * ```
 */
type FunctionImplementation = (
  inputs: ReadonlyMap<string, InputHandleValue>,
  outputs: ReadonlyMap<string, OutputHandleInfo>,
  context: ExecutionContext,
) => Map<string, unknown> | Promise<Map<string, unknown>>;

/**
 * Map of node type IDs to their function implementations.
 * Standard node types (loopStart, loopEnd, etc.) are excluded
 * since they have built-in execution logic.
 *
 * Implementations are optional — missing implementations
 * generate warnings at compile time and errors only if the node
 * is actually reached during execution.
 */
type FunctionImplementations<NodeTypeUniqueId extends string = string> = {
  [K in Exclude<
    NodeTypeUniqueId,
    (typeof standardNodeTypeNames)[number]
  >]?: FunctionImplementation;
};

/**
 * Helper function to create function implementations with automatic type inference.
 *
 * This is the recommended way to define implementations — it lets TypeScript
 * infer all generic parameters from the argument, avoiding manual type
 * annotations and variance issues when passing to FullGraph.
 *
 * @example
 * ```ts
 * const implementations = makeFunctionImplementationsWithAutoInfer({
 *   andGate: (inputs) => {
 *     const a = inputs.get('A')?.connections[0]?.value ?? false;
 *     const b = inputs.get('B')?.connections[0]?.value ?? false;
 *     return new Map([['Out', Boolean(a) && Boolean(b)]]);
 *   },
 * });
 * ```
 */
function makeFunctionImplementationsWithAutoInfer<
  NodeTypeUniqueId extends string = string,
>(input: FunctionImplementations<NodeTypeUniqueId>) {
  return input;
}

// ─────────────────────────────────────────────────────
// Input Resolution (how edges map to input values)
// ─────────────────────────────────────────────────────

/**
 * Describes one edge feeding into a specific input handle.
 * Multiple entries for the same handle indicate fan-in.
 */
type InputResolutionEntry = {
  edgeId: string;
  sourceNodeId: string;
  sourceHandleId: string;
};

/**
 * Describes one edge consuming from a specific output handle.
 * Multiple entries for the same handle indicate fan-out.
 */
type OutputDistributionEntry = {
  edgeId: string;
  targetNodeId: string;
  targetHandleId: string;
};

// ─────────────────────────────────────────────────────
// Execution Steps (discriminated union for the compiled IR)
// ─────────────────────────────────────────────────────

/**
 * A standard node execution step — call the function implementation,
 * pass inputs, store outputs.
 */
type StandardExecutionStep = {
  kind: 'standard';
  nodeId: string;
  nodeTypeId: string;
  nodeTypeName: string;
  concurrencyLevel: number;
};

/**
 * A compiled loop structure containing the loop triplet node IDs
 * and the topologically sorted body steps.
 */
type LoopExecutionBlock = {
  kind: 'loop';
  loopStartNodeId: string;
  loopStopNodeId: string;
  loopEndNodeId: string;
  /** Topologically sorted body steps (nodes between loopStart and loopStop) */
  bodySteps: ReadonlyArray<ExecutionStep>;
  /** Maximum iterations before erroring (configurable, default 10000) */
  maxIterations: number;
  concurrencyLevel: number;
};

/**
 * A compiled node group scope containing the recursive inner execution plan
 * and the handle mappings between outer and inner boundaries.
 */
type GroupExecutionScope = {
  kind: 'group';
  /** The group node instance ID in the outer graph */
  groupNodeId: string;
  /** The group's node type ID (key in typeOfNodes) */
  groupNodeTypeId: string;
  /** Display name of the group node type */
  groupNodeTypeName: string;
  /** Recursively compiled execution plan for the subtree */
  innerPlan: ExecutionPlan;
  /** Map of outer input handle IDs to inner GroupInput output handle IDs */
  inputMapping: ReadonlyMap<string, string>;
  /** Map of inner GroupOutput input handle IDs to outer output handle IDs */
  outputMapping: ReadonlyMap<string, string>;
  concurrencyLevel: number;
};

/**
 * Discriminated union of all execution step types.
 * Used in the ExecutionPlan's levels array.
 */
type ExecutionStep =
  | StandardExecutionStep
  | LoopExecutionBlock
  | GroupExecutionScope;

// ─────────────────────────────────────────────────────
// Execution Plan (compiled intermediate representation)
// ─────────────────────────────────────────────────────

/**
 * The compiled execution plan — an intermediate representation
 * of the graph ready for execution. Produced by the compiler,
 * consumed by the executor.
 *
 * Steps are grouped into concurrency levels: all steps within
 * a level have no data dependencies on each other and can
 * execute concurrently via Promise.allSettled.
 */
type ExecutionPlan = {
  /**
   * Steps grouped by concurrency level.
   * levels[0] runs first, levels[1] after all of levels[0] complete, etc.
   * Steps within the same level run concurrently.
   */
  levels: ReadonlyArray<ReadonlyArray<ExecutionStep>>;
  /**
   * Maps "nodeId:handleId" to the list of edges that feed into that input handle.
   * Used by the executor to resolve input values from the ValueStore.
   */
  inputResolutionMap: ReadonlyMap<string, ReadonlyArray<InputResolutionEntry>>;
  /**
   * Maps "nodeId:handleId" to the list of edges that consume from that output handle.
   * Used for building OutputHandleInfo for function implementations.
   */
  outputDistributionMap: ReadonlyMap<
    string,
    ReadonlyArray<OutputDistributionEntry>
  >;
  /** Total number of executable nodes in the plan */
  nodeCount: number;
  /** Warnings generated during compilation (e.g., missing implementations) */
  warnings: ReadonlyArray<string>;
};

// ─────────────────────────────────────────────────────
// Error Types (with full execution path tracing)
// ─────────────────────────────────────────────────────

/**
 * One entry in the error's execution path trace,
 * showing the chain of nodes that led to the error.
 */
type GraphErrorPathEntry = {
  nodeId: string;
  nodeTypeId: string;
  nodeTypeName: string;
  handleId?: string;
  concurrencyLevel: number;
};

/**
 * A rich error type capturing the full context of where and
 * how an error occurred during graph execution.
 *
 * Includes the error message, the node that errored, the full
 * execution path leading to it, and optional loop/group context.
 */
type GraphError = {
  /** Human-readable error message */
  message: string;
  /** ID of the node where the error occurred */
  nodeId: string;
  /** Node type ID */
  nodeTypeId: string;
  /** Display name of the node type */
  nodeTypeName: string;
  /** Handle ID where the error manifested (if applicable) */
  handleId?: string;
  /** Ordered list of nodes in the execution path leading to this error */
  path: ReadonlyArray<GraphErrorPathEntry>;
  /** Loop context (if the error occurred inside a loop) */
  loopContext?: {
    loopStructureId: string;
    iteration: number;
    maxIterations: number;
  };
  /** Group context (if the error occurred inside a node group) */
  groupContext?: {
    groupNodeId: string;
    groupNodeTypeId: string;
    depth: number;
  };
  /** Timestamp when the error occurred (performance.now() relative to run start) */
  timestamp: number;
  /** Duration of the step before the error (ms) */
  duration: number;
  /** The original thrown error value */
  originalError: unknown;
};

// ─────────────────────────────────────────────────────
// Execution Recording Types (for replay/timeline)
// ─────────────────────────────────────────────────────

/**
 * Recorded snapshot of a single incoming connection to an input handle.
 * Contains the value and source metadata for display in the inspector.
 */
type RecordedInputConnection = {
  /** The value that arrived through this connection */
  value: unknown;
  /** Source node instance ID */
  sourceNodeId: string;
  /** Source node display name */
  sourceNodeName: string;
  /** Source output handle ID */
  sourceHandleId: string;
  /** Source output handle display name */
  sourceHandleName: string;
  /** Source output handle data type ID */
  sourceDataTypeId: string;
};

/**
 * Recorded snapshot of an input handle's resolved state.
 * Contains per-connection detail for the inspector to display
 * each connection on its own line with source node/handle names.
 */
type RecordedInputHandleValue = {
  /** All incoming connections — always an array, one per edge */
  connections: ReadonlyArray<RecordedInputConnection>;
  /** Data type unique ID for this input handle */
  dataTypeId: string;
  /** True when no edges exist — value came from user-entered default */
  isDefault: boolean;
  /** The user-entered default value (only when isDefault is true) */
  defaultValue?: unknown;
};

/**
 * Recorded snapshot of an output handle's computed value.
 */
type RecordedOutputHandleValue = {
  /** The computed value for this output handle */
  value: unknown;
  /** Data type unique ID for this output handle */
  dataTypeId: string;
  /** Number of target nodes consuming this output (fan-out count) */
  targetCount: number;
};

const executionStepRecordStatuses = [
  'completed',
  'errored',
  'skipped',
] as const;
type ExecutionStepRecordStatus = (typeof executionStepRecordStatuses)[number];

/**
 * Recording of a single step's execution, including timing,
 * input/output values, and any error that occurred.
 */
type ExecutionStepRecord = {
  stepIndex: number;
  nodeId: string;
  nodeTypeId: string;
  nodeTypeName: string;
  concurrencyLevel: number;
  /** Time relative to execution start (ms) */
  startTime: number;
  /** Time relative to execution start (ms) */
  endTime: number;
  /** Duration of this step (ms) */
  duration: number;
  /**
   * Cumulative pause duration (ms) at the moment this step started.
   * Subtract from startTime/endTime to get execution-only timestamps
   * (removes user idle time from step-by-step mode).
   * Always 0 in instant mode.
   */
  pauseAdjustment: number;
  status: ExecutionStepRecordStatus;
  /** Snapshot of resolved input values at execution time (handleName -> RecordedInputHandleValue) */
  inputValues: ReadonlyMap<string, RecordedInputHandleValue>;
  /** Snapshot of computed output values (handleName -> RecordedOutputHandleValue) */
  outputValues: ReadonlyMap<string, RecordedOutputHandleValue>;
  /** Error details (only when status === 'errored') */
  error?: GraphError;
  /** Loop iteration number (only when inside a loop body) */
  loopIteration?: number;
  /** Loop structure identifier (only when inside a loop body) */
  loopStructureId?: string;
  /** Group node instance ID (only when inside a group scope) */
  groupNodeId?: string;
  /** Group nesting depth (only when inside a group scope) */
  groupDepth?: number;
};

/**
 * Recording of a single loop iteration.
 */
type LoopIterationRecord = {
  iteration: number;
  startTime: number;
  endTime: number;
  duration: number;
  conditionValue: boolean;
  stepRecords: ReadonlyArray<ExecutionStepRecord>;
};

/**
 * Complete recording of a loop structure's execution.
 */
type LoopRecord = {
  loopStructureId: string;
  loopStartNodeId: string;
  loopStopNodeId: string;
  loopEndNodeId: string;
  iterations: ReadonlyArray<LoopIterationRecord>;
  totalIterations: number;
  startTime: number;
  endTime: number;
  duration: number;
};

/**
 * Recording of a node group's execution, containing
 * the recursive inner execution record.
 */
type GroupRecord = {
  groupNodeId: string;
  groupNodeTypeId: string;
  innerRecord: ExecutionRecord;
  inputMapping: ReadonlyMap<string, unknown>;
  outputMapping: ReadonlyMap<string, unknown>;
};

/**
 * Recording of a single concurrency level's execution.
 */
type ConcurrencyLevelRecord = {
  level: number;
  startTime: number;
  endTime: number;
  duration: number;
  nodeIds: ReadonlyArray<string>;
};

const executionRecordStatuses = ['completed', 'errored', 'cancelled'] as const;
type ExecutionRecordStatus = (typeof executionRecordStatuses)[number];

/**
 * Complete recording of an execution run, containing all
 * step records, timing data, errors, and loop/group records.
 * Used by the timeline/replay UI to visualize execution history.
 */
type ExecutionRecord = {
  /** Unique identifier for this execution run */
  id: string;
  /** Absolute start time (performance.now()) */
  startTime: number;
  /** Absolute end time (performance.now()) */
  endTime: number;
  /** Total execution duration (ms) — wall-clock time */
  totalDuration: number;
  /**
   * Total time spent paused during execution (ms).
   * Only non-zero in step-by-step mode. Subtract from totalDuration
   * to get execution-only duration.
   */
  totalPauseDuration: number;
  /** Final status of the execution */
  status: ExecutionRecordStatus;
  /** All step records in execution order */
  steps: ReadonlyArray<ExecutionStepRecord>;
  /** All errors that occurred during execution */
  errors: ReadonlyArray<GraphError>;
  /** Timing data per concurrency level */
  concurrencyLevels: ReadonlyArray<ConcurrencyLevelRecord>;
  /** Loop execution recordings, keyed by loop structure ID */
  loopRecords: ReadonlyMap<string, LoopRecord>;
  /** Group execution recordings, keyed by group node instance ID */
  groupRecords: ReadonlyMap<string, GroupRecord>;
  /** Complete ValueStore snapshot at end of execution ("nodeId:handleId" -> value) */
  finalValues: ReadonlyMap<string, unknown>;
};

// ─────────────────────────────────────────────────────
// Run Session Types (live/past run representation for the NodeRunnerPanel)
// ─────────────────────────────────────────────────────

/**
 * The execution mode for a run session.
 *
 * ### Why two modes instead of a boolean?
 * A discriminated string union is more readable than `debugMode: boolean`,
 * and it's extensible — future modes (e.g. 'profile', 'benchmark') can be
 * added without breaking existing code or requiring boolean combinations.
 *
 * - `'performance'` — Instant full execution, then the complete
 *   ExecutionRecord is available for post-hoc replay via the timeline.
 *   No pauses between steps. Optimized for throughput.
 *
 * - `'debug'` — Step-by-step execution controlled by the user. The
 *   executor yields after each step (or level, depending on granularity),
 *   allowing the user to inspect intermediate state, scrub through
 *   partial results, and resume or abort at any point.
 */
const runModes = ['performance', 'debug'] as const;
type RunMode = (typeof runModes)[number];

/**
 * Live progress snapshot updated during an active run.
 *
 * ### Why separate from ExecutionRecord?
 * Progress is ephemeral and high-frequency — it updates on every step
 * completion during execution. The ExecutionRecord is permanent and
 * append-only (steps are pushed as they complete). Keeping progress
 * separate avoids triggering full record re-renders on every tick
 * and enables lightweight progress bar / percentage UIs without
 * reading the heavy record object.
 *
 * ### Why include both step-level and level-level counts?
 * Step count gives overall progress percentage. Level count gives
 * structural progress through the DAG — useful for understanding
 * "how deep into the graph are we" vs "how many nodes done".
 */
type RunProgress = {
  /** Number of steps that have finished executing (completed + errored + skipped) */
  completedSteps: number;
  /** Total planned steps from ExecutionPlan.nodeCount */
  totalSteps: number;
  /** The concurrency level currently being executed (0-indexed) */
  currentLevel: number;
  /** Total number of concurrency levels in the plan */
  totalLevels: number;
  /** Elapsed wall-clock time since the run started (ms) */
  elapsedMs: number;
};

/**
 * Interaction state for a single run session.
 *
 * ### Why is this part of RunSession rather than the panel component?
 * Because interaction state is **per-run**: when switching between
 * sessions (active vs. history), each session retains its own selected
 * step and scrubber position. If interaction state lived in the panel,
 * switching sessions would lose the user's place.
 *
 * ### Why `selectedStepIndex` and `currentStepIndex` are separate?
 * - `currentStepIndex` is the replay scrubber position — it controls
 *   which node visual states are displayed on the graph canvas.
 * - `selectedStepIndex` is which step's detail is open in the inspector.
 * They are independent: the user can scrub the timeline without
 * changing which step detail is open, and vice versa.
 */
type RunSessionInteractionState = {
  /** Index of the step whose detail is shown in the inspector (null = none) */
  selectedStepIndex: number | null;
  /** Replay scrubber position: the step index up to which visual states are reconstructed */
  currentStepIndex: number;
  /** Whether the ExecutionStepInspector is open */
  inspectorOpen: boolean;
  /** Whether the ExecutionTimeline is collapsed */
  timelineCollapsed: boolean;
};

/**
 * A run session represents a single execution attempt — either live
 * (in-progress) or completed (past). It is the primary data model
 * consumed by the NodeRunnerPanel organism.
 *
 * ## Design Justification
 *
 * ### Why a single type for live and past runs?
 * Both live and past runs need the exact same rendering: timeline,
 * inspector, node overlays, controls. The only difference is mutability:
 * - Live run: `record.steps` grows as execution proceeds, `progress`
 *   is present, `runnerState` transitions through states.
 * - Past run: all fields are frozen/immutable, `progress` is undefined,
 *   `runnerState` is terminal ('completed' | 'errored' | 'cancelled').
 *
 * A single type eliminates the need for `if (isLive) ... else ...`
 * branching in every rendering component. Components just read fields
 * and render — the liveness is transparent.
 *
 * ### Why store `nodeVisualStates` in the session?
 * Visual states are derived from the `record` + `currentStepIndex`,
 * but recomputing them on every render is O(steps) work. Caching the
 * derived visual states in the session — and recomputing only when
 * `currentStepIndex` changes — gives O(1) render reads. The panel
 * updates `nodeVisualStates` via `replayTo()` or live callbacks.
 *
 * ### Why `nodeErrors` and `nodeWarnings` are Maps, not derived?
 * Same reasoning: aggregating errors from `record.errors` on every
 * render is wasteful. The maps are maintained incrementally — errors
 * are added as they occur (live) or precomputed once (past).
 *
 * ### Scalability for large graphs
 * - `record.steps` is a ReadonlyArray — no copying on every addition.
 * - `nodeVisualStates` is a Map — O(1) per-node lookup by ReactFlow.
 * - `progress` is a flat struct — minimal GC pressure on frequent updates.
 * - The session itself is a plain object — no class instances, no
 *   closures, serializable for potential persistence or sharing.
 */
type RunSession = {
  /** Unique identifier for this run session (UUID or monotonic counter) */
  id: string;
  /** Timestamp when the run was initiated (performance.now() or Date.now()) */
  startedAt: number;
  /** Timestamp when the run reached a terminal state (undefined while live) */
  completedAt?: number;
  /** The execution mode used for this run */
  mode: RunMode;
  /** Current state machine position for this run */
  runnerState: RunnerState;
  /** Max loop iterations setting active at the time of this run */
  maxLoopIterations: number;

  /**
   * Live progress — present only while `runnerState` is 'running' or 'paused'.
   * Removed (set to undefined) once the run reaches a terminal state.
   */
  progress?: RunProgress;

  /**
   * The execution record. For a live run, this grows as steps complete.
   * For a past run, this is the frozen final record. Null before the
   * executor produces its first output (i.e., during compilation).
   */
  record: ExecutionRecord | null;

  /**
   * Per-node visual states at the current `interactionState.currentStepIndex`.
   * Updated by `replayTo()` for past runs or by live execution callbacks
   * for active runs. The NodeRunnerPanel reads this to provide overlays
   * to the graph canvas without recalculating from the record.
   */
  nodeVisualStates: ReadonlyMap<string, NodeVisualState>;

  /**
   * Per-node errors aggregated from the execution record.
   * Keyed by nodeId. Multiple errors per node are possible (e.g.,
   * a node that errors on different loop iterations).
   */
  nodeErrors: ReadonlyMap<string, ReadonlyArray<GraphError>>;

  /**
   * Per-node warnings (e.g., "No function implementation for node type X").
   * Computed at compile time or at mount time. Present even before
   * execution starts — warnings are static analysis, not runtime.
   */
  nodeWarnings: ReadonlyMap<string, ReadonlyArray<string>>;

  /** User interaction state for this session's panel view */
  interactionState: RunSessionInteractionState;
};

/**
 * Global settings that persist across run sessions.
 *
 * ### Why separate from RunSession?
 * Settings are user preferences that apply to the *next* run, not
 * the current one. A RunSession captures the settings *at the time*
 * of that run (e.g., `mode`, `maxLoopIterations`), but the global
 * settings may have changed since then. Separating them avoids
 * confusion about which settings are "current" vs "historical".
 */
type NodeRunnerPanelSettings = {
  /** Default execution mode for new runs */
  mode: RunMode;
  /** Default max loop iterations for new runs */
  maxLoopIterations: number;
  /** Auto-open inspector when a step errors */
  autoInspectErrors: boolean;
  /** Hide complex values (objects, arrays, Maps) in the inspector */
  hideComplexValues: boolean;
};

/**
 * Full state for the NodeRunnerPanel organism.
 *
 * ### Why a dedicated state type instead of just passing RunSession around?
 * The panel needs to manage:
 * 1. The **active** session (the one currently visible and possibly live).
 * 2. **Session history** (past completed runs for review/comparison).
 * 3. **Global settings** (persist across runs).
 *
 * These three concerns are orthogonal and independently updated.
 * Combining them in a single state object makes the panel's data
 * dependencies explicit and enables a single `useReducer` or
 * zustand store to manage all panel state atomically.
 *
 * ### Why `maxHistorySize`?
 * ExecutionRecords can be large (hundreds of steps, each with
 * input/output snapshots). Unbounded history would leak memory.
 * `maxHistorySize` provides a configurable bound with FIFO eviction.
 *
 * ### Extensibility
 * This structure naturally supports future features:
 * - **Run comparison**: render two sessions side-by-side.
 * - **Run persistence**: serialize `sessionHistory` to localStorage.
 * - **Breakpoints**: add `breakpoints: Set<string>` to settings.
 * - **Watchpoints**: add `watchedHandles: string[]` to interaction state.
 * - **Run labels/tags**: add `label?: string` to RunSession.
 */
type NodeRunnerPanelState = {
  /** The currently visible run session (null before the first run) */
  activeSession: RunSession | null;
  /** Completed sessions, most recent first. Capped at `maxHistorySize`. */
  sessionHistory: ReadonlyArray<RunSession>;
  /** Maximum number of past sessions to retain */
  maxHistorySize: number;
  /** Global settings that apply to newly created sessions */
  settings: NodeRunnerPanelSettings;
};

// ─────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────

export {
  runnerStates,
  nodeVisualStates,
  executionStepRecordStatuses,
  executionRecordStatuses,
  runModes,
  makeFunctionImplementationsWithAutoInfer,
};

export type {
  // State machine
  RunnerState,
  NodeVisualState,
  // Function implementation contract
  InputConnectionValue,
  InputHandleValue,
  OutputHandleInfo,
  ExecutionContext,
  FunctionImplementation,
  FunctionImplementations,
  // Input/output resolution
  InputResolutionEntry,
  OutputDistributionEntry,
  // Execution steps (IR)
  StandardExecutionStep,
  LoopExecutionBlock,
  GroupExecutionScope,
  ExecutionStep,
  // Execution plan
  ExecutionPlan,
  // Error types
  GraphErrorPathEntry,
  GraphError,
  // Recording types
  RecordedInputConnection,
  RecordedInputHandleValue,
  RecordedOutputHandleValue,
  ExecutionStepRecordStatus,
  ExecutionStepRecord,
  LoopIterationRecord,
  LoopRecord,
  GroupRecord,
  ConcurrencyLevelRecord,
  ExecutionRecordStatus,
  ExecutionRecord,
  // Run session types (NodeRunnerPanel organism)
  RunMode,
  RunProgress,
  RunSessionInteractionState,
  RunSession,
  NodeRunnerPanelSettings,
  NodeRunnerPanelState,
};
