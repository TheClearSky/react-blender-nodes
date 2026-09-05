import { useState, useCallback, useRef, useEffect } from 'react';
import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
} from '../nodeStateManagement/types';
import type {
  RunnerState,
  NodeVisualState,
  GraphError,
  ExecutionRecord,
  ExecutionStepRecord,
  FunctionImplementations,
  ExecutionPlan,
} from './types';
import { compile, DEFAULT_MAX_LOOP_ITERATIONS } from './compiler';
import {
  resolveStructureRecord,
  emitRecorderWarningToConsole,
} from './executionRecorder';
import type { RecorderWarning } from './executionRecorder';
import { inProcessRunTarget } from './runTargets/inProcessRunTarget';
import type {
  ArtifactRunContext,
  ArtifactRunTarget,
  ExecuteRunContext,
  RunTarget,
} from './runTargets/types';
import { isStandardNodeType, hasKey } from './groupCompiler';
import { instancePathEquals } from './computeNodePreviewValues';
import { isLoopNode } from '../nodeStateManagement/nodes/loops';
import { isSwitchNode } from '../nodeStateManagement/nodes/switches';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

/**
 * Execution mode for the runner.
 * - 'instant': Full execution, then replay via timeline.
 * - 'stepByStep': Pauses after each step for manual advancement.
 */
type UseNodeRunnerMode = 'instant' | 'stepByStep';

type UseNodeRunnerParams<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>;
  options?: {
    maxLoopIterations?: number;
    /**
     * Observer for recorder anomaly warnings (orphan promotion at finalize,
     * unclosed scopes, key collisions — the salvage backstop's signal).
     * Threaded into the executor's `ExecutionRecorder`; when absent the
     * recorder dev-`console.warn`s and stays silent in production.
     */
    onRecorderWarning?: (warning: RecorderWarning) => void;
  };
  /** Controlled execution record. When provided, useNodeRunner uses this instead of internal state. */
  executionRecord?: ExecutionRecord | null;
  /** Setter called whenever the execution record changes (run completes, reset, load, etc.). */
  onExecutionRecordChange?: (record: ExecutionRecord | null) => void;
  /** The active run target. Absent → the built-in in-process executor (back-compat).
   *  An `execute` target feeds the timeline like the default; an `artifact` target
   *  produces a file/string and skips the timeline. */
  activeRunTarget?: RunTarget<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
  /** Values for the graph's declared root inputs, keyed by Graph Input handle
   *  NAME (mirrors codegen's `runGraph(a, b)` parameters) OR by stable handle
   *  ID — the id is honored as a fallback, so id-keyed inputs are immune to
   *  rename-on-connect (`allowRootIORename`). Seeded into the root Graph Input
   *  node's output handles for both instant and step-by-step runs. Absent /
   *  `undefined` when the graph declares no root inputs. */
  rootInputs?: Record<string, unknown>;
};

/** Result of validating an imported record against the current graph. */
type RecordValidationResult = {
  /** Whether the record is valid enough to load (no fatal issues). */
  valid: boolean;
  /** Warnings about non-fatal mismatches (e.g. extra nodes in record). */
  warnings: string[];
  /** Fatal errors that prevent loading (e.g. empty steps). */
  errors: string[];
};

type UseNodeRunnerReturn = {
  // State
  runnerState: RunnerState;
  nodeVisualStates: ReadonlyMap<string, NodeVisualState>;
  nodeWarnings: ReadonlyMap<string, ReadonlyArray<string>>;
  nodeErrors: ReadonlyMap<string, ReadonlyArray<GraphError>>;
  executionRecord: ExecutionRecord | null;
  currentStepIndex: number;

  // Actions
  run: () => void;
  pause: () => void;
  resume: () => void;
  step: () => void;
  /** Live step-OVER: drains steps until execution returns to the depth the
   *  head was at (skips through a group's interior); honors pause()/stop(). */
  stepOver: () => void;
  stop: () => void;
  reset: () => void;
  replayTo: (stepIndex: number) => void;
  /** Load an imported execution record, validating it against the current graph. */
  loadRecord: (record: ExecutionRecord) => RecordValidationResult;

  // Settings
  mode: UseNodeRunnerMode;
  setMode: (mode: UseNodeRunnerMode) => void;
  maxLoopIterations: number;
  setMaxLoopIterations: (max: number) => void;
};

// ─────────────────────────────────────────────────────
// Empty maps (stable references for initial/reset state)
// ─────────────────────────────────────────────────────

const EMPTY_VISUAL_STATES: ReadonlyMap<string, NodeVisualState> = new Map();
const EMPTY_WARNINGS: ReadonlyMap<string, ReadonlyArray<string>> = new Map();
const EMPTY_ERRORS: ReadonlyMap<string, ReadonlyArray<GraphError>> = new Map();

// ─────────────────────────────────────────────────────
// Replay helper: reconstruct visual states at a given step index
// ─────────────────────────────────────────────────────

function computeVisualStatesAtStep(
  record: ExecutionRecord,
  stepIndex: number,
  openInstancePath?: readonly string[],
): ReadonlyMap<string, NodeVisualState> {
  const states = new Map<string, NodeVisualState>();

  // Phase 1: Process regular step records. When an `openInstancePath` is given
  // (the viewport is standing INSIDE a specific group instance), only steps of
  // THAT instance drive real states — another instance's execution of the same
  // shared template node reads as 'idle' here, not 'running'/'completed'.
  for (const step of record.steps) {
    if (
      openInstancePath !== undefined &&
      !instancePathEquals(step.instancePath, openInstancePath)
    ) {
      if (!states.has(step.nodeId)) {
        states.set(step.nodeId, 'idle');
      }
      continue;
    }
    if (step.stepIndex < stepIndex) {
      states.set(
        step.nodeId,
        step.status === 'errored'
          ? 'errored'
          : step.status === 'skipped'
            ? 'skipped'
            : 'completed',
      );
    } else if (step.stepIndex === stepIndex) {
      states.set(step.nodeId, 'running');
    } else {
      // Only set to idle if not already set by an earlier step
      // (a node can appear multiple times in loop iterations)
      if (!states.has(step.nodeId)) {
        states.set(step.nodeId, 'idle');
      }
    }
  }

  // Phase 2: Override for loop structural nodes during body execution.
  // Loop triplet step records are appended AFTER body steps (high stepIndex),
  // so without this override they'd show as "idle" while the body replays.
  // Instance-filtered like Phase 1: a loop living in another instance of the
  // open scope must not light this scope's loop template nodes.
  for (const [, loopRec] of record.loopRecords) {
    let minBody = Infinity;
    let maxBody = -Infinity;
    let bodyCount = 0;
    let bodyMatchesOpenPath = openInstancePath === undefined;
    for (const iter of loopRec.iterations) {
      for (const stepRec of iter.stepRecords) {
        const idx = stepRec.stepIndex;
        if (idx < minBody) minBody = idx;
        if (idx > maxBody) maxBody = idx;
        bodyCount++;
        if (
          openInstancePath !== undefined &&
          instancePathEquals(stepRec.instancePath, openInstancePath)
        ) {
          bodyMatchesOpenPath = true;
        }
      }
    }
    if (bodyCount === 0 || !bodyMatchesOpenPath) continue;

    // If replaying within the body range, loop nodes should show as "running"
    if (stepIndex >= minBody && stepIndex <= maxBody) {
      states.set(loopRec.loopStartNodeId, 'running');
      states.set(loopRec.loopStopNodeId, 'running');
      // LoopEnd stays idle — it represents the final output after the loop
    }
  }

  // Phase 3: Override for group nodes during inner execution.
  // Group structural step records are appended AFTER inner steps.
  if (openInstancePath === undefined) {
    // Root / template view: the top-level groupRecords are keyed by REAL
    // instance ids, so this is instance-correct as-is.
    // Map keys are opaque identity keys, NOT node ids — the node id lives
    // on the record itself.
    for (const groupRec of record.groupRecords.values()) {
      const groupNodeId = groupRec.groupNodeId;
      const innerSteps = groupRec.innerRecord.steps;
      if (innerSteps.length === 0) continue;

      let minInner = Infinity;
      let maxInner = -Infinity;
      for (const s of innerSteps) {
        const idx = s.stepIndex;
        if (idx < minInner) minInner = idx;
        if (idx > maxInner) maxInner = idx;
      }

      if (stepIndex >= minInner && stepIndex <= maxInner) {
        states.set(groupNodeId, 'running');
      }
    }
  } else {
    // Standing inside an instance: walk the GroupRecord tree ALONG the open
    // path (nested groupRecords are keyed by shared TEMPLATE ids — a flat
    // recursive walk would light the wrong instance), then apply the range
    // override to the nested group template nodes visible at this level.
    let scopeRecord: ExecutionRecord | undefined = record;
    const walkedPath: string[] = [];
    for (const pathSegment of openInstancePath) {
      // Group records key by full-path identity, so the walk addresses the
      // exact instance at each level (a bare id would be ambiguous for a
      // template subgroup instantiated more than once).
      scopeRecord = scopeRecord
        ? resolveStructureRecord(
            scopeRecord.groupRecords,
            pathSegment,
            walkedPath,
          )?.record.innerRecord
        : undefined;
      walkedPath.push(pathSegment);
      if (!scopeRecord) break;
    }
    if (scopeRecord) {
      // Map keys are opaque identity keys, NOT node ids.
      for (const groupRec of scopeRecord.groupRecords.values()) {
        const groupNodeId = groupRec.groupNodeId;
        const innerSteps = groupRec.innerRecord.steps;
        if (innerSteps.length === 0) continue;

        let minInner = Infinity;
        let maxInner = -Infinity;
        for (const s of innerSteps) {
          const idx = s.stepIndex;
          if (idx < minInner) minInner = idx;
          if (idx > maxInner) maxInner = idx;
        }

        if (stepIndex >= minInner && stepIndex <= maxInner) {
          states.set(groupNodeId, 'running');
        }
      }
    }
  }

  return states;
}

// ─────────────────────────────────────────────────────
// Warning detection: find nodes without implementations
// ─────────────────────────────────────────────────────

function detectWarnings<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>,
): ReadonlyMap<string, ReadonlyArray<string>> {
  const warnings = new Map<string, string[]>();

  for (const node of state.nodes) {
    const nodeTypeId = node.data.nodeTypeUniqueId;
    if (!nodeTypeId) continue;

    // Look up type definition before narrowing (nodeTypeId is still full NodeTypeUniqueId)
    const typeOfNode = state.typeOfNodes[nodeTypeId];

    // Skip built-in node types (narrows nodeTypeId to exclude standard types)
    if (isStandardNodeType(nodeTypeId)) continue;
    if (isLoopNode(nodeTypeId)) continue;
    if (isSwitchNode(nodeTypeId)) continue;

    // Skip group node instances (their subtree is checked by the compiler)
    if (typeOfNode?.subtree) continue;

    // Check if a function implementation exists
    if (
      !hasKey(functionImplementations, nodeTypeId) ||
      !functionImplementations[nodeTypeId]
    ) {
      const name = typeOfNode?.name ?? nodeTypeId;
      const existing = warnings.get(node.id);
      if (existing) {
        existing.push(`No function implementation for node type "${name}"`);
      } else {
        warnings.set(node.id, [
          `No function implementation for node type "${name}"`,
        ]);
      }
    }
  }

  return warnings;
}

// ─────────────────────────────────────────────────────
// Extract per-node errors from an ExecutionRecord
// ─────────────────────────────────────────────────────

function extractNodeErrors(
  record: ExecutionRecord,
): ReadonlyMap<string, ReadonlyArray<GraphError>> {
  const errorMap = new Map<string, GraphError[]>();
  for (const error of record.errors) {
    const existing = errorMap.get(error.nodeId);
    if (existing) {
      existing.push(error);
    } else {
      errorMap.set(error.nodeId, [error]);
    }
  }
  return errorMap;
}

// ─────────────────────────────────────────────────────
// Validate imported record against the current graph
// ─────────────────────────────────────────────────────

function validateRecordAgainstGraph<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  record: ExecutionRecord,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): RecordValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Fatal: no steps at all
  if (record.steps.length === 0) {
    errors.push('Recording has no execution steps.');
    return { valid: false, warnings, errors };
  }

  // Build set of current graph node IDs
  const graphNodeIds = new Set(state.nodes.map((n) => n.id));

  // Build set of current graph node type IDs
  const graphNodeTypeIds = new Set(Object.keys(state.typeOfNodes));

  // Check each step references a node that exists in the graph
  const missingNodeIds = new Set<string>();
  const missingNodeTypeIds = new Set<string>();

  for (const step of record.steps) {
    if (!graphNodeIds.has(step.nodeId)) {
      missingNodeIds.add(step.nodeId);
    }
    if (
      !isStandardNodeType(step.nodeTypeId) &&
      !isLoopNode(step.nodeTypeId) &&
      !isSwitchNode(step.nodeTypeId) &&
      !graphNodeTypeIds.has(step.nodeTypeId)
    ) {
      missingNodeTypeIds.add(step.nodeTypeId);
    }
  }

  if (missingNodeIds.size > 0) {
    warnings.push(
      `Recording references ${missingNodeIds.size} node(s) not in the current graph: ${[...missingNodeIds].join(', ')}`,
    );
  }

  if (missingNodeTypeIds.size > 0) {
    warnings.push(
      `Recording references ${missingNodeTypeIds.size} node type(s) not in the current graph: ${[...missingNodeTypeIds].join(', ')}`,
    );
  }

  // Check nodes in graph that have no steps (were not executed)
  const executedNodeIds = new Set(record.steps.map((s) => s.nodeId));
  const unexecutedNodes: string[] = [];
  for (const node of state.nodes) {
    const nodeTypeId = node.data.nodeTypeUniqueId;
    if (!nodeTypeId) continue;
    if (isStandardNodeType(nodeTypeId)) continue;
    if (isLoopNode(nodeTypeId)) continue;
    if (isSwitchNode(nodeTypeId)) continue;
    if (state.typeOfNodes[nodeTypeId]?.subtree) continue;
    if (!executedNodeIds.has(node.id)) {
      unexecutedNodes.push(node.id);
    }
  }
  if (unexecutedNodes.length > 0) {
    warnings.push(
      `${unexecutedNodes.length} node(s) in the current graph were not in the recording: ${unexecutedNodes.join(', ')}`,
    );
  }

  return { valid: true, warnings, errors };
}

// ─────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────

function useNodeRunner<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  state,
  functionImplementations,
  options,
  executionRecord: controlledRecord,
  onExecutionRecordChange,
  activeRunTarget,
  rootInputs,
}: UseNodeRunnerParams<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>): UseNodeRunnerReturn {
  // ── Controlled / uncontrolled record ─────────────────
  const isControlled = controlledRecord !== undefined;
  // Latch the mode chosen at mount. Switching controlled↔uncontrolled at
  // runtime (e.g. a parent passing `executionRecord={record ?? undefined}`, or
  // toggling the prop's presence) is UNSUPPORTED: the derived stores
  // (runnerState, visual states, errors, step index) reconcile only on the
  // controlled sync path, so any flip across that boundary leaves them stale
  // and orphans `internalRecord`. React warns for the analogous controlled
  // `<input>` flip; we do the same in dev.
  const initialIsControlledRef = useRef(isControlled);
  const [internalRecord, setInternalRecord] = useState<ExecutionRecord | null>(
    null,
  );
  const executionRecord = isControlled ? controlledRecord : internalRecord;
  // Track the last record we set internally so the external sync can
  // distinguish our own updates from truly external changes.
  const lastSetRecordRef = useRef<ExecutionRecord | null>(
    executionRecord ?? null,
  );
  // Keep the latest external callback + controlled flag in refs so the STABLE
  // setExecutionRecord below always reaches the current handler. Without this,
  // finalizeRun and the run callbacks (deps `[]`) close over the first render's
  // setExecutionRecord and notify a stale onExecutionRecordChange (S4).
  const onExecutionRecordChangeRef = useRef(onExecutionRecordChange);
  onExecutionRecordChangeRef.current = onExecutionRecordChange;
  const isControlledRef = useRef(isControlled);
  isControlledRef.current = isControlled;
  // Latest active run target via a ref so the run callbacks always dispatch to
  // the current selection without re-creating on every target switch (same ref
  // pattern as onExecutionRecordChangeRef above).
  const activeRunTargetRef = useRef(activeRunTarget);
  activeRunTargetRef.current = activeRunTarget;
  // Latest root-input values via a ref so the run callbacks (deps `[]`-ish) always
  // seed the current values without re-creating on every value change.
  const rootInputsRef = useRef(rootInputs);
  rootInputsRef.current = rootInputs;
  // Latest recorder-warning observer via the same ref pattern (a consumer
  // passing an inline callback must not re-create the run callbacks).
  const onRecorderWarningRef = useRef(options?.onRecorderWarning);
  onRecorderWarningRef.current = options?.onRecorderWarning;
  /**
   * Stable TRAMPOLINE handed to the executor, so the recorder calls whatever
   * the consumer's LATEST render supplied rather than the function value that
   * happened to be current when the run started.
   *
   * Dereferencing the ref at run start instead (`onRecorderWarningRef.current`)
   * silently freezes a closure for the whole run — worst in step-by-step mode,
   * where the generator can outlive many renders — so a handler like
   * `(w) => setWarnings([...warnings, w])` would read a stale `warnings`.
   *
   * Why the call sites still pass `undefined` when nothing is registered: it
   * keeps `ExecuteRunContext.onRecorderWarning` ABSENT, which a custom run
   * target can legitimately branch on to skip building diagnostics nobody is
   * listening for — the field is optional for exactly that reason. It is NOT
   * what selects the console fallback any more: the trampoline below emits
   * the recorder's own line either way, so an unconditional trampoline would
   * behave identically except that it would also deliver a handler registered
   * MID-RUN. Consequence of keeping the conditional: such a handler still
   * does nothing until the next run.
   */
  const recorderWarningTrampoline = useCallback((warning: RecorderWarning) => {
    const handler = onRecorderWarningRef.current;
    if (handler) {
      handler(warning);
      return;
    }
    // The handler was registered when the run STARTED and has since been
    // removed (a `cond ? fn : undefined` toggle flipped mid-run). The recorder
    // still sees a registered observer — this trampoline — so it has already
    // skipped its own dev fallback; a bare `?.()` here would drop the warning
    // on every channel at once. Emit the recorder's own line instead.
    emitRecorderWarningToConsole(warning);
  }, []);
  const setExecutionRecord = useCallback((record: ExecutionRecord | null) => {
    lastSetRecordRef.current = record;
    if (!isControlledRef.current) setInternalRecord(record);
    onExecutionRecordChangeRef.current?.(record);
  }, []);

  // ── React state ──────────────────────────────────────
  const [runnerState, setRunnerState] = useState<RunnerState>(() =>
    executionRecord ? 'completed' : 'idle',
  );
  const [nodeVisualStates, setNodeVisualStates] = useState<
    ReadonlyMap<string, NodeVisualState>
  >(() => {
    if (!executionRecord) return EMPTY_VISUAL_STATES;
    return computeVisualStatesAtStep(
      executionRecord,
      Math.max(0, executionRecord.steps.length - 1),
    );
  });
  const [nodeWarnings, setNodeWarnings] =
    useState<ReadonlyMap<string, ReadonlyArray<string>>>(EMPTY_WARNINGS);
  const [nodeErrors, setNodeErrors] = useState<
    ReadonlyMap<string, ReadonlyArray<GraphError>>
  >(() =>
    executionRecord ? extractNodeErrors(executionRecord) : EMPTY_ERRORS,
  );
  const [currentStepIndex, setCurrentStepIndex] = useState(() =>
    executionRecord ? Math.max(0, executionRecord.steps.length - 1) : 0,
  );
  const [mode, setMode] = useState<UseNodeRunnerMode>('instant');
  const [maxLoopIterations, setMaxLoopIterations] = useState(
    options?.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITERATIONS,
  );

  // ── Refs for async operation coordination ─────────────
  const abortControllerRef = useRef<AbortController | null>(null);
  const generatorRef = useRef<AsyncGenerator<
    { stepRecord: ExecutionStepRecord; partialRecord: ExecutionRecord },
    ExecutionRecord
  > | null>(null);
  /** Mutable map updated during execution, flushed to React state at key points */
  const liveVisualStatesRef = useRef(new Map<string, NodeVisualState>());
  /** Flag to stop auto-draining in resume() */
  const shouldContinueRef = useRef(false);
  /** Guard against running actions after unmount */
  const isMountedRef = useRef(true);
  /** Terminate the active generator without requiring a valid return value.
   *  Generator.return() expects the return type, but we're just discarding it. */
  const terminateGenerator = useCallback(() => {
    const generator = generatorRef.current;
    if (generator) {
      (generator.return as (value?: unknown) => Promise<unknown>)(undefined);
      generatorRef.current = null;
    }
  }, []);
  /** Internal-only: captures the last error for debugging */
  const lastErrorRef = useRef<unknown>(null);

  // ── Cleanup on unmount ────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      terminateGenerator();
      shouldContinueRef.current = false;
    };
  }, []);

  // ── Sync derived state when controlled record changes externally ──
  // Skip when the incoming record is one we set ourselves (lastSetRecordRef
  // holds the exact reference). Only sync for truly external changes
  // (e.g., parent loading a different recording).
  const prevRecordRef = useRef(executionRecord);
  useEffect(() => {
    if (!isControlled) return;
    if (executionRecord === prevRecordRef.current) return;
    prevRecordRef.current = executionRecord;

    // If this is a record we set ourselves, just track it — no state sync needed.
    if (executionRecord === lastSetRecordRef.current) return;

    // Truly-external record change: STOP any in-flight execution before
    // adopting it (mirrors loadRecord's preamble). Without this, the sync
    // below flips runnerState to 'completed'/'idle' while the background
    // execute()/generator keeps running and later SILENTLY OVERWRITES the
    // externally-loaded record — the UI asserts 'completed' mid-run. The
    // preamble is safe when nothing is in flight (abort on a settled
    // controller is a no-op; the next run resets shouldContinueRef).
    shouldContinueRef.current = false;
    abortControllerRef.current?.abort();
    terminateGenerator();

    if (executionRecord) {
      const lastIdx = Math.max(0, executionRecord.steps.length - 1);
      setCurrentStepIndex(lastIdx);
      setNodeErrors(extractNodeErrors(executionRecord));
      const vs = computeVisualStatesAtStep(executionRecord, lastIdx);
      liveVisualStatesRef.current = new Map(vs);
      setNodeVisualStates(vs);
      setRunnerState(
        executionRecord.status === 'cancelled'
          ? 'errored'
          : executionRecord.errors.length > 0
            ? 'errored'
            : 'completed',
      );
    } else {
      setCurrentStepIndex(0);
      setNodeErrors(EMPTY_ERRORS);
      liveVisualStatesRef.current = new Map();
      setNodeVisualStates(EMPTY_VISUAL_STATES);
      setRunnerState('idle');
    }
  }, [executionRecord, isControlled, terminateGenerator]);

  // ── Dev diagnostic: controlled↔uncontrolled mode flip (unsupported) ──
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' &&
      isControlled !== initialIsControlledRef.current
    ) {
      console.error(
        'react-blender-nodes: the runner switched between controlled and ' +
          'uncontrolled mode at runtime (the `executionRecord` prop went ' +
          (initialIsControlledRef.current
            ? 'from provided to undefined'
            : 'from undefined to provided') +
          '). This is not supported — choose one mode per mount. The derived ' +
          'runner state (timeline, previews, step index) may be incoherent. ' +
          'For uncontrolled use, omit `executionRecord` entirely; do not pass ' +
          '`record ?? undefined`.',
      );
    }
  }, [isControlled]);

  // ── Warning detection on state/implementation change ──
  useEffect(() => {
    const warnings = detectWarnings(state, functionImplementations);
    setNodeWarnings(warnings);
  }, [state.nodes, state.typeOfNodes, functionImplementations]);

  // ── Flush live visual states to React state ───────────
  const flushVisualStates = useCallback(() => {
    if (!isMountedRef.current) return;
    setNodeVisualStates(new Map(liveVisualStatesRef.current));
  }, []);

  // ── Callback for executor's per-node state changes ────
  const handleNodeStateChange = useCallback(
    (nodeId: string, vs: NodeVisualState) => {
      liveVisualStatesRef.current.set(nodeId, vs);
    },
    [],
  );

  // ── Compile helper ────────────────────────────────────
  const compileGraph = useCallback((): ExecutionPlan | null => {
    try {
      return compile(state, functionImplementations, {
        maxLoopIterations,
      });
    } catch (e) {
      lastErrorRef.current = e;
      if (process.env.NODE_ENV !== 'production')
        console.error('react-blender-nodes runner error:', e);
      if (isMountedRef.current) {
        setRunnerState('errored');
      }
      return null;
    }
  }, [state, functionImplementations, maxLoopIterations]);

  // ── Finalize a completed run ──────────────────────────
  const finalizeRun = useCallback((record: ExecutionRecord) => {
    if (!isMountedRef.current) return;

    setExecutionRecord(record);
    setCurrentStepIndex(Math.max(0, record.steps.length - 1));

    const errors = extractNodeErrors(record);
    setNodeErrors(errors);

    // Build final visual states from the complete record
    const finalStates = new Map<string, NodeVisualState>();
    for (const step of record.steps) {
      finalStates.set(
        step.nodeId,
        step.status === 'errored'
          ? 'errored'
          : step.status === 'skipped'
            ? 'skipped'
            : 'completed',
      );
    }
    liveVisualStatesRef.current = finalStates;
    setNodeVisualStates(finalStates);

    terminateGenerator();

    setRunnerState(
      record.status === 'cancelled'
        ? 'errored'
        : record.errors.length > 0
          ? 'errored'
          : 'completed',
    );
  }, []);

  // ── RUN (instant mode) ────────────────────────────────
  const runInstant = useCallback(async () => {
    // Clear previous state
    liveVisualStatesRef.current = new Map();
    setNodeVisualStates(EMPTY_VISUAL_STATES);
    setNodeErrors(EMPTY_ERRORS);
    setExecutionRecord(null);
    setCurrentStepIndex(0);

    // Create new AbortController
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Compile
    setRunnerState('compiling');
    const plan = compileGraph();
    if (!plan) return;

    if (!isMountedRef.current) return;
    setRunnerState('running');

    // Execute via the default in-process run target. Building the context here
    // (instead of calling `execute` directly) is the seam a consumer-selected
    // run target will later plug into — with no target prop this is identical.
    try {
      const executeContext: ExecuteRunContext<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      > = {
        state,
        executionPlan: plan,
        functionImplementations,
        options: { maxLoopIterations },
        abortSignal: controller.signal,
        onNodeStateChange: handleNodeStateChange,
        onRecorderWarning: onRecorderWarningRef.current
          ? recorderWarningTrampoline
          : undefined,
        rootInputs: rootInputsRef.current,
        runWithInProcessExecutor: () => inProcessRunTarget.run(executeContext),
      };
      // Dispatch to the active execute target (or the built-in default). The
      // `runWithInProcessExecutor` helper above always delegates to the in-process
      // executor regardless of which target is active.
      const activeTarget = activeRunTargetRef.current;
      const executeTarget =
        activeTarget?.mode === 'execute' ? activeTarget : inProcessRunTarget;
      const record = await executeTarget.run(executeContext);

      if (!isMountedRef.current) return;
      finalizeRun(record);
    } catch (e) {
      lastErrorRef.current = e;
      if (process.env.NODE_ENV !== 'production')
        console.error('react-blender-nodes runner error:', e);
      if (isMountedRef.current) {
        flushVisualStates();
        setRunnerState('errored');
      }
    }
  }, [
    state,
    functionImplementations,
    compileGraph,
    handleNodeStateChange,
    flushVisualStates,
    finalizeRun,
  ]);

  // ── RUN (step-by-step mode) ───────────────────────────
  const runStepByStep = useCallback(async () => {
    // Clear previous state
    liveVisualStatesRef.current = new Map();
    setNodeVisualStates(EMPTY_VISUAL_STATES);
    setNodeErrors(EMPTY_ERRORS);
    setExecutionRecord(null);
    setCurrentStepIndex(0);

    // Create new AbortController
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Compile
    setRunnerState('compiling');
    const plan = compileGraph();
    if (!plan) return;

    if (!isMountedRef.current) return;

    // Start generator via the default in-process run target's stepping path.
    setRunnerState('running');
    const stepwiseContext: ExecuteRunContext<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    > = {
      state,
      executionPlan: plan,
      functionImplementations,
      options: { maxLoopIterations },
      abortSignal: controller.signal,
      onNodeStateChange: handleNodeStateChange,
      onRecorderWarning: onRecorderWarningRef.current
        ? recorderWarningTrampoline
        : undefined,
      rootInputs: rootInputsRef.current,
      runWithInProcessExecutor: () => inProcessRunTarget.run(stepwiseContext),
    };
    // Step-by-step uses the active target's optional `runStepwise`; run() only
    // routes here when stepping is available (the default target, or a custom
    // execute target that provides it), so the fallback preserves the default.
    const activeTarget = activeRunTargetRef.current;
    const stepwiseRun =
      activeTarget?.mode === 'execute' && activeTarget.runStepwise
        ? activeTarget.runStepwise
        : inProcessRunTarget.runStepwise;
    const gen = stepwiseRun(stepwiseContext);
    generatorRef.current = gen;

    // Execute first step
    try {
      const result = await gen.next();
      if (!isMountedRef.current) return;

      if (!result.done) {
        const { stepRecord, partialRecord } = result.value;
        setExecutionRecord(partialRecord);
        setCurrentStepIndex(stepRecord.stepIndex);
        setNodeVisualStates(
          computeVisualStatesAtStep(partialRecord, stepRecord.stepIndex),
        );
        setRunnerState('paused');
      } else {
        // Graph had zero steps or completed immediately
        finalizeRun(result.value);
      }
    } catch (e) {
      lastErrorRef.current = e;
      if (process.env.NODE_ENV !== 'production')
        console.error('react-blender-nodes runner error:', e);
      if (isMountedRef.current) {
        flushVisualStates();
        setRunnerState('errored');
        terminateGenerator();
      }
    }
  }, [
    state,
    functionImplementations,
    compileGraph,
    handleNodeStateChange,
    flushVisualStates,
    finalizeRun,
  ]);

  // ── RUN (artifact targets — no record / timeline) ─────
  const runArtifact = useCallback(
    async (
      target: ArtifactRunTarget<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >,
    ) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setRunnerState('compiling');
      const plan = compileGraph();
      if (!plan) return;
      if (!isMountedRef.current) return;

      setRunnerState('running');
      try {
        const artifactContext: ArtifactRunContext<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        > = {
          state,
          executionPlan: plan,
          options: { maxLoopIterations },
          abortSignal: controller.signal,
          rootInputs: rootInputsRef.current,
        };
        await target.run(artifactContext);
        if (!isMountedRef.current) return;
        // Artifact targets own their delivery and produce no record — settle back
        // to idle (no timeline, no replay).
        setRunnerState('idle');
      } catch (e) {
        lastErrorRef.current = e;
        if (process.env.NODE_ENV !== 'production')
          console.error('react-blender-nodes run target error:', e);
        if (isMountedRef.current) setRunnerState('errored');
      }
    },
    [state, compileGraph, maxLoopIterations],
  );

  // ── Public: run() ─────────────────────────────────────
  const run = useCallback(() => {
    const activeTarget = activeRunTargetRef.current;
    if (activeTarget?.mode === 'artifact') {
      void runArtifact(activeTarget);
      return;
    }
    // Execute target (or the default). Mode coercion: step-by-step needs the
    // target to advertise `runStepwise` (the default always does).
    const steppingAvailable =
      activeTarget == null || activeTarget.runStepwise != null;
    if (mode === 'stepByStep' && steppingAvailable) {
      void runStepByStep();
    } else {
      void runInstant();
    }
  }, [mode, runInstant, runStepByStep, runArtifact]);

  // ── Public: step() ────────────────────────────────────
  const step = useCallback(() => {
    const gen = generatorRef.current;

    if (!gen) {
      // No active generator: start a new step-by-step run
      void runStepByStep();
      return;
    }

    // Advance generator by one step
    setRunnerState('running');
    void (async () => {
      try {
        const result = await gen.next();
        if (!isMountedRef.current) return;

        if (!result.done) {
          const { stepRecord, partialRecord } = result.value;
          setExecutionRecord(partialRecord);
          setCurrentStepIndex(stepRecord.stepIndex);
          setNodeVisualStates(
            computeVisualStatesAtStep(partialRecord, stepRecord.stepIndex),
          );
          setRunnerState('paused');
        } else {
          finalizeRun(result.value);
        }
      } catch (e) {
        lastErrorRef.current = e;
        if (process.env.NODE_ENV !== 'production')
          console.error('react-blender-nodes runner error:', e);
        if (isMountedRef.current) {
          flushVisualStates();
          setRunnerState('errored');
          terminateGenerator();
        }
      }
    })();
  }, [runStepByStep, flushVisualStates, finalizeRun]);

  // ── Public: stepOver() — live drain until execution returns to the depth
  // the head was at (skips THROUGH a group/structure the next step descends
  // into, pausing on the first step back at/above the starting depth). Mirrors
  // resume()'s guards: shouldContinueRef honors pause(), isMountedRef guards
  // unmount, errors terminate the generator (F5).
  const stepOver = useCallback(() => {
    const gen = generatorRef.current;
    if (!gen) return;
    // Base depth = the generator's TRUE head (the last recorded step), NOT
    // `currentStepIndex` — scrubbing moves the latter freely while paused, and
    // a scrubbed-to-root index would make the drain run through everything
    // (review M2). `steps` is append-ordered, so last entry = max stepIndex.
    const lastRecordedStep =
      executionRecord?.steps[executionRecord.steps.length - 1];
    const baseDepth = lastRecordedStep?.instancePath?.length ?? 0;

    shouldContinueRef.current = true;
    setRunnerState('running');

    void (async () => {
      while (shouldContinueRef.current) {
        try {
          const result = await gen.next();
          if (!isMountedRef.current) return;

          if (result.done) {
            shouldContinueRef.current = false;
            finalizeRun(result.value);
            return;
          }

          const { stepRecord, partialRecord } = result.value;
          setExecutionRecord(partialRecord);
          setCurrentStepIndex(stepRecord.stepIndex);
          setNodeVisualStates(
            computeVisualStatesAtStep(partialRecord, stepRecord.stepIndex),
          );
          if ((stepRecord.instancePath?.length ?? 0) <= baseDepth) {
            // Back at/above the starting depth — the "over" is complete.
            shouldContinueRef.current = false;
          }
        } catch (e) {
          lastErrorRef.current = e;
          if (process.env.NODE_ENV !== 'production')
            console.error('react-blender-nodes runner error:', e);
          shouldContinueRef.current = false;
          if (isMountedRef.current) {
            flushVisualStates();
            setRunnerState('errored');
            terminateGenerator();
          }
          return;
        }
      }

      if (isMountedRef.current) {
        setRunnerState('paused');
      }
    })();
  }, [
    executionRecord,
    flushVisualStates,
    finalizeRun,
    setExecutionRecord,
    terminateGenerator,
  ]);

  // ── Public: pause() ───────────────────────────────────
  const pause = useCallback(() => {
    // Only meaningful when auto-draining in resume()
    shouldContinueRef.current = false;
    if (isMountedRef.current) {
      setRunnerState('paused');
    }
  }, []);

  // ── Public: resume() — auto-drain remaining steps ─────
  const resume = useCallback(() => {
    const gen = generatorRef.current;
    if (!gen) return;

    shouldContinueRef.current = true;
    setRunnerState('running');

    void (async () => {
      while (shouldContinueRef.current) {
        try {
          const result = await gen.next();
          if (!isMountedRef.current) return;

          if (result.done) {
            shouldContinueRef.current = false;
            finalizeRun(result.value);
            return;
          }

          const { stepRecord, partialRecord } = result.value;
          setExecutionRecord(partialRecord);
          setCurrentStepIndex(stepRecord.stepIndex);
          setNodeVisualStates(
            computeVisualStatesAtStep(partialRecord, stepRecord.stepIndex),
          );
        } catch (e) {
          lastErrorRef.current = e;
          if (process.env.NODE_ENV !== 'production')
            console.error('react-blender-nodes runner error:', e);
          shouldContinueRef.current = false;
          if (isMountedRef.current) {
            flushVisualStates();
            setRunnerState('errored');
            terminateGenerator();
          }
          return;
        }
      }

      // If we get here, pause() was called during drain
      if (isMountedRef.current) {
        setRunnerState('paused');
      }
    })();
  }, [flushVisualStates, finalizeRun]);

  // ── Public: stop() ────────────────────────────────────
  const stop = useCallback(() => {
    shouldContinueRef.current = false;
    abortControllerRef.current?.abort();
    terminateGenerator();

    if (isMountedRef.current) {
      flushVisualStates();
      setRunnerState('errored');
    }
  }, [flushVisualStates]);

  // ── Public: reset() ───────────────────────────────────
  const reset = useCallback(() => {
    shouldContinueRef.current = false;
    abortControllerRef.current?.abort();
    terminateGenerator();

    if (isMountedRef.current) {
      liveVisualStatesRef.current = new Map();
      setRunnerState('idle');
      setNodeVisualStates(EMPTY_VISUAL_STATES);
      setNodeErrors(EMPTY_ERRORS);
      setExecutionRecord(null);
      setCurrentStepIndex(0);
    }
  }, []);

  // ── Public: replayTo() ────────────────────────────────
  const replayTo = useCallback(
    (stepIndex: number) => {
      if (!executionRecord) return;

      const clamped = Math.max(
        0,
        Math.min(stepIndex, executionRecord.steps.length - 1),
      );
      setCurrentStepIndex(clamped);

      const newStates = computeVisualStatesAtStep(executionRecord, clamped);
      liveVisualStatesRef.current = new Map(newStates);
      setNodeVisualStates(newStates);
    },
    [executionRecord],
  );

  // ── Public: loadRecord() ───────────────────────────────
  const loadRecord = useCallback(
    (record: ExecutionRecord): RecordValidationResult => {
      const result = validateRecordAgainstGraph(record, state);

      if (!result.valid) {
        return result;
      }

      // Stop any in-flight execution
      shouldContinueRef.current = false;
      abortControllerRef.current?.abort();
      terminateGenerator();

      // Load the record into runner state (same as finalizeRun)
      finalizeRun(record);

      return result;
    },
    [state, finalizeRun],
  );

  return {
    runnerState,
    nodeVisualStates,
    nodeWarnings,
    nodeErrors,
    executionRecord,
    currentStepIndex,

    run,
    pause,
    resume,
    step,
    stepOver,
    stop,
    reset,
    replayTo,
    loadRecord,

    mode,
    setMode,
    maxLoopIterations,
    setMaxLoopIterations,
  };
}

export { useNodeRunner, computeVisualStatesAtStep };

export type {
  UseNodeRunnerParams,
  UseNodeRunnerReturn,
  UseNodeRunnerMode,
  RecordValidationResult,
};
