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
import { execute, executeStepByStep } from './executor';
import { isStandardNodeType, hasKey } from './groupCompiler';
import { isLoopNode } from '../nodeStateManagement/nodes/loops';

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
  };
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
): ReadonlyMap<string, NodeVisualState> {
  const states = new Map<string, NodeVisualState>();

  // Phase 1: Process regular step records
  for (const step of record.steps) {
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
  for (const [, loopRec] of record.loopRecords) {
    const bodyIndices: number[] = [];
    for (const iter of loopRec.iterations) {
      for (const stepRec of iter.stepRecords) {
        bodyIndices.push(stepRec.stepIndex);
      }
    }
    if (bodyIndices.length === 0) continue;

    const minBody = Math.min(...bodyIndices);
    const maxBody = Math.max(...bodyIndices);

    // If replaying within the body range, loop nodes should show as "running"
    if (stepIndex >= minBody && stepIndex <= maxBody) {
      states.set(loopRec.loopStartNodeId, 'running');
      states.set(loopRec.loopStopNodeId, 'running');
      // LoopEnd stays idle — it represents the final output after the loop
    }
  }

  // Phase 3: Override for group nodes during inner execution.
  // Group structural step records are appended AFTER inner steps.
  for (const [groupNodeId, groupRec] of record.groupRecords) {
    const innerSteps = groupRec.innerRecord.steps;
    if (innerSteps.length === 0) continue;

    const innerIndices = innerSteps.map((s) => s.stepIndex);
    const minInner = Math.min(...innerIndices);
    const maxInner = Math.max(...innerIndices);

    if (stepIndex >= minInner && stepIndex <= maxInner) {
      states.set(groupNodeId, 'running');
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
}: UseNodeRunnerParams<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>): UseNodeRunnerReturn {
  // ── React state ──────────────────────────────────────
  const [runnerState, setRunnerState] = useState<RunnerState>('idle');
  const [nodeVisualStates, setNodeVisualStates] =
    useState<ReadonlyMap<string, NodeVisualState>>(EMPTY_VISUAL_STATES);
  const [nodeWarnings, setNodeWarnings] =
    useState<ReadonlyMap<string, ReadonlyArray<string>>>(EMPTY_WARNINGS);
  const [nodeErrors, setNodeErrors] =
    useState<ReadonlyMap<string, ReadonlyArray<GraphError>>>(EMPTY_ERRORS);
  const [executionRecord, setExecutionRecord] =
    useState<ExecutionRecord | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
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

  // ── Cleanup on unmount ────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      generatorRef.current = null;
      shouldContinueRef.current = false;
    };
  }, []);

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
    } catch {
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

    generatorRef.current = null;

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

    // Execute
    try {
      const record = await execute(plan, functionImplementations, state, {
        onNodeStateChange: handleNodeStateChange,
        abortSignal: controller.signal,
      });

      if (!isMountedRef.current) return;
      finalizeRun(record);
    } catch {
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

    // Start generator
    setRunnerState('running');
    const gen = executeStepByStep(plan, functionImplementations, state, {
      onNodeStateChange: handleNodeStateChange,
      abortSignal: controller.signal,
    });
    generatorRef.current = gen;

    // Execute first step
    try {
      const result = await gen.next();
      if (!isMountedRef.current) return;

      if (!result.done) {
        const { stepRecord, partialRecord } = result.value;
        setExecutionRecord(partialRecord);
        setCurrentStepIndex(stepRecord.stepIndex);
        flushVisualStates();
        setRunnerState('paused');
      } else {
        // Graph had zero steps or completed immediately
        finalizeRun(result.value);
      }
    } catch {
      if (isMountedRef.current) {
        flushVisualStates();
        setRunnerState('errored');
        generatorRef.current = null;
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

  // ── Public: run() ─────────────────────────────────────
  const run = useCallback(() => {
    if (mode === 'instant') {
      void runInstant();
    } else {
      void runStepByStep();
    }
  }, [mode, runInstant, runStepByStep]);

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
          flushVisualStates();
          setRunnerState('paused');
        } else {
          finalizeRun(result.value);
        }
      } catch {
        if (isMountedRef.current) {
          flushVisualStates();
          setRunnerState('errored');
          generatorRef.current = null;
        }
      }
    })();
  }, [runStepByStep, flushVisualStates, finalizeRun]);

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
          flushVisualStates();
        } catch {
          shouldContinueRef.current = false;
          if (isMountedRef.current) {
            flushVisualStates();
            setRunnerState('errored');
            generatorRef.current = null;
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
    generatorRef.current = null;

    if (isMountedRef.current) {
      flushVisualStates();
      setRunnerState('errored');
    }
  }, [flushVisualStates]);

  // ── Public: reset() ───────────────────────────────────
  const reset = useCallback(() => {
    shouldContinueRef.current = false;
    abortControllerRef.current?.abort();
    generatorRef.current = null;

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
      generatorRef.current = null;

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
