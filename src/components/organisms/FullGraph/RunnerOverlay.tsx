import { useCallback, useRef, useMemo, useEffect } from 'react';
import { z } from 'zod';
import { useReactFlow } from '@xyflow/react';
import {
  RunnerContext,
  useRecordContext,
  type NodeRunnerState,
} from './FullGraphState';
import { useRecordingViewState } from './RecordingViewStateContext';
import type { GraphRunnerHandle } from './runnerHandle';
import type { ExecutionRecord } from '@/utils/nodeRunner/types';
import {
  useNodeRunner,
  computeVisualStatesAtStep,
  type UseNodeRunnerReturn,
} from '@/utils/nodeRunner/useNodeRunner';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';
import { getRunnerViewPreferences } from '@/utils/nodeStateManagement/runnerViewPreferences';
import { NodeRunnerPanel } from '@/components/organisms/NodeRunnerPanel';
import type { FullGraphProps } from './FullGraph';
import type { SupportedUnderlyingTypes } from '@/utils/nodeStateManagement/types';
import type { RunTarget } from '@/utils/nodeRunner/runTargets/types';
import { useRunTargets } from './useRunTargets';
import { useNodePreviewRegistry } from './NodePreviewRegistryContext';
import {
  computeNodePreviewValues,
  EMPTY_NODE_PREVIEW_VALUES,
} from '@/utils/nodeRunner/computeNodePreviewValues';

// ─────────────────────────────────────────────────────
// RunnerOverlay: manages execution lifecycle and renders
// NodeRunnerPanel + provides nodeRunnerStates to context
// ─────────────────────────────────────────────────────

/**
 * Wrapper that calls useNodeRunner, provides a nested FullGraphContext
 * with nodeRunnerStates, and renders the NodeRunnerPanel.
 *
 * Rendered only when functionImplementations is provided.
 * Children (ReactFlow, context menu, etc.) are wrapped so that
 * nodes can read runner visual states from context.
 */
function RunnerOverlay<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  state,
  functionImplementations,
  children,
  onExecutionRecordRef,
  loadRecordRef,
  runnerRef,
  runTargets,
  defaultRunTargetId,
  rootInputs,
  onRecorderWarning,
  onRunEvent,
  dispatch,
}: {
  state: FullGraphProps<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['state'];
  /** Graph dispatch — used by follow-into-groups to sync `openedNodeGroupStack`
   *  with the scrub head's instance path (OPEN/CLOSE_NODE_GROUP are
   *  non-undoable view actions). */
  dispatch: FullGraphProps<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dispatch'];
  functionImplementations: NonNullable<
    FullGraphProps<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >['functionImplementations']
  >;
  children: React.ReactNode;
  onExecutionRecordRef?: React.RefObject<(() => ExecutionRecord | null) | null>;
  /** Consumer-owned ref that receives the imperative runner handle. */
  runnerRef?: React.RefObject<GraphRunnerHandle | null>;
  loadRecordRef?: React.RefObject<
    | ((
        record: ExecutionRecord,
      ) => ReturnType<UseNodeRunnerReturn['loadRecord']>)
    | null
  >;
  runTargets?: ReadonlyArray<
    RunTarget<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >;
  defaultRunTargetId?: string;
  rootInputs?: Record<string, unknown>;
  /** Recorder bookkeeping diagnostics — see `FullGraphProps.onRecorderWarning`
   *  for the kinds and the capture semantics. Passed straight through:
   *  `useNodeRunner` keeps it in a ref and calls it through a stable
   *  trampoline that dereferences that ref at emit time, so a new inline
   *  function each render neither restarts a run nor re-creates the runner,
   *  and never goes stale mid-run. */
  onRecorderWarning?: FullGraphProps<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['onRecorderWarning'];
  /** Run lifecycle stream — see `FullGraphProps.onRunEvent`. Passed straight
   *  through with the same ref/trampoline semantics as `onRecorderWarning`. */
  onRunEvent?: FullGraphProps<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['onRunEvent'];
}) {
  const {
    executionRecord: controlledRecord,
    setExecutionRecord: onExecutionRecordChange,
  } = useRecordContext();
  const { targets, activeRunTargetId, activeRunTarget, setActiveRunTargetId } =
    useRunTargets<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >({ runTargets, defaultRunTargetId });
  const runner = useNodeRunner({
    state,
    functionImplementations,
    executionRecord: controlledRecord,
    onExecutionRecordChange,
    activeRunTarget,
    rootInputs,
    // A fresh object literal is deliberate and safe: `useNodeRunner` reads
    // `options` only to seed one `useState` and to refresh a ref it calls at
    // emit time — `options` never enters a dependency array, so neither the
    // object's identity nor an inline `onRecorderWarning` can restart a run
    // or re-create the runner (RE-01).
    options: { onRecorderWarning, onRunEvent },
  });
  // Stepping (pause/step) is available only for an execute target that provides
  // `runStepwise` — the built-in default does; artifact targets do not.
  const steppingAvailable =
    activeRunTarget.mode === 'execute' && activeRunTarget.runStepwise != null;
  const runTargetSummaries = useMemo(
    () =>
      targets.map((target) => ({
        id: target.id,
        label: target.label,
        mode: target.mode,
        icon: target.icon,
      })),
    [targets],
  );

  const { getNode, setCenter, getViewport } = useReactFlow();
  const panelRef = useRef<HTMLDivElement>(null);

  // Per-node PREVIEW registry (consumer `nodePreviews`). When empty, the value
  // derivation below is skipped so idle / no-preview graphs pay zero cost and the
  // RunnerContext value keeps its stable identity (R1).
  const nodePreviewRegistry = useNodePreviewRegistry();
  const hasNodePreviews =
    !!nodePreviewRegistry && Object.values(nodePreviewRegistry).some(Boolean);

  const viewState = useRecordingViewState();
  const {
    selectedStepIndex,
    setSelectedStepIndex,
    edgeValuesAnimated,
    getViewState,
    restoreViewState,
  } = viewState;

  const handleNavigateToNode = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node) return;
      const x = node.position.x + (node.measured?.width ?? 200) / 2;
      let y = node.position.y + (node.measured?.height ?? 100) / 2;
      const currentZoom = getViewport().zoom;
      // Offset Y to account for the drawer covering the bottom of the canvas
      const panelHeight = panelRef.current?.offsetHeight ?? 0;
      if (panelHeight > 0) {
        y += panelHeight / (2 * currentZoom);
      }
      setCenter(x, y, { duration: 300, zoom: currentZoom });
    },
    [getNode, setCenter, getViewport],
  );

  // Expose loadRecord to parent via ref, restoring viewState on load
  useEffect(() => {
    if (loadRecordRef) {
      loadRecordRef.current = (record: ExecutionRecord) => {
        const result = runner.loadRecord(record);
        if (result.valid && record.viewState) {
          restoreViewState(record.viewState);
          if (record.viewState.runMode !== undefined)
            runner.setMode(record.viewState.runMode);
          if (record.viewState.maxLoopIterations !== undefined)
            runner.setMaxLoopIterations(record.viewState.maxLoopIterations);
        }
        return result;
      };
    }
    return () => {
      if (loadRecordRef) {
        loadRecordRef.current = null;
      }
    };
  }, [
    loadRecordRef,
    runner.loadRecord,
    runner.setMode,
    runner.setMaxLoopIterations,
    restoreViewState,
  ]);

  // The open scope's INSTANCE path — the `openedNodeGroupStack` nodeId chain.
  // Header-opens carry `nodeId` per level (the chain IS the recorder's
  // instancePath format). `undefined` ⇔ root view OR a TEMPLATE open via the
  // selector (any level without a nodeId) — both deliberately unfiltered (S2).
  const openedNodeGroupStack = state.openedNodeGroupStack;
  const openInstancePath = useMemo(() => {
    if (!openedNodeGroupStack || openedNodeGroupStack.length === 0) {
      return undefined;
    }
    const path: string[] = [];
    for (const stackEntry of openedNodeGroupStack) {
      if (!('nodeId' in stackEntry) || stackEntry.nodeId === undefined) {
        return undefined;
      }
      path.push(stackEntry.nodeId);
    }
    return path;
  }, [openedNodeGroupStack]);

  // ── Follow into groups (library default ON — `DEFAULT_RUNNER_VIEW_PREFERENCES`;
  // a document may store its own value. Scrub-clicks + stepping + autoplay all
  // move `currentStepIndex`, so ONE head-driven effect covers them all).
  // When the head step's instancePath differs from the open scope, sync the
  // `openedNodeGroupStack` via non-undoable OPEN/CLOSE_NODE_GROUP dispatches,
  // then center the head node once the new scope has rendered. Toggle OFF
  // restores the pre-feature behavior exactly.
  // `followIntoGroups` is a CONTROLLED document preference (graph state): read via
  // the per-field accessor, written via a non-undoable UPDATE_RUNNER_VIEW_PREFERENCE.
  const followIntoGroups = getRunnerViewPreferences(state).followIntoGroups;
  const setFollowIntoGroups = useCallback(
    (enabled: boolean) =>
      dispatch({
        type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
        payload: { preference: 'followIntoGroups', enabled },
      }),
    [dispatch],
  );
  // Follow reacts to HEAD MOVEMENT only. The effect also re-runs when the
  // user navigates manually (stack deps) — without this guard it would
  // instantly revert any manual group open back to the head's path.
  const lastFollowedStepIndexRef = useRef<number | null>(null);
  const centerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followExecutionRecord = runner.executionRecord;
  const followCurrentStepIndex = runner.currentStepIndex;
  useEffect(() => {
    if (!followIntoGroups) {
      lastFollowedStepIndexRef.current = null;
      return;
    }
    const record = followExecutionRecord;
    if (!record || record.steps.length === 0) return;
    if (lastFollowedStepIndexRef.current === followCurrentStepIndex) return;
    const headStep = record.steps.find(
      (step) => step.stepIndex === followCurrentStepIndex,
    );
    if (!headStep) return;
    lastFollowedStepIndexRef.current = followCurrentStepIndex;
    const targetPath = headStep.instancePath ?? [];

    // Diff against the CURRENT stack. A template-open (no nodeId at some
    // level) has no instance identity — close everything and reopen.
    const currentStack = openedNodeGroupStack ?? [];
    let closes: number;
    let opens: readonly string[];
    if (openInstancePath !== undefined) {
      let common = 0;
      while (
        common < openInstancePath.length &&
        common < targetPath.length &&
        openInstancePath[common] === targetPath[common]
      ) {
        common++;
      }
      closes = openInstancePath.length - common;
      opens = targetPath.slice(common);
    } else if (currentStack.length > 0) {
      closes = currentStack.length;
      opens = targetPath;
    } else {
      closes = 0;
      opens = targetPath;
    }
    if (closes === 0 && opens.length === 0) return; // already in sync (F6 guard)

    for (let i = 0; i < closes; i++) {
      dispatch({ type: actionTypesMap.CLOSE_NODE_GROUP });
    }
    for (const instanceNodeId of opens) {
      dispatch({
        type: actionTypesMap.OPEN_NODE_GROUP,
        payload: { nodeId: instanceNodeId },
      });
    }
    // Center the head node after the new scope renders (getNode resolves only
    // post-commit; a short defer is enough and purely cosmetic on miss). Held
    // in a REF, not an effect cleanup: the dispatches above re-render and
    // re-run this effect (which early-returns at the ref guard), and a cleanup
    // would cancel the pending center before it ever fired (review M1).
    const nodeIdToCenter = headStep.nodeId;
    if (centerTimerRef.current !== null) clearTimeout(centerTimerRef.current);
    centerTimerRef.current = setTimeout(() => {
      centerTimerRef.current = null;
      handleNavigateToNode(nodeIdToCenter);
    }, 80);
  }, [
    followIntoGroups,
    followExecutionRecord,
    followCurrentStepIndex,
    openInstancePath,
    openedNodeGroupStack,
    dispatch,
    handleNavigateToNode,
  ]);
  // Unmount-only cleanup for the pending center defer.
  useEffect(
    () => () => {
      if (centerTimerRef.current !== null) clearTimeout(centerTimerRef.current);
    },
    [],
  );

  // Standing inside a group INSTANCE, the hook's visual states are
  // instance-blind (keyed by shared template node ids) — recompute them
  // filtered to the open instance so another instance's execution doesn't
  // light this scope's nodes.
  const instanceCorrectedVisualStates = useMemo(
    () =>
      openInstancePath && runner.executionRecord
        ? computeVisualStatesAtStep(
            runner.executionRecord,
            runner.currentStepIndex,
            openInstancePath,
          )
        : undefined,
    [openInstancePath, runner.executionRecord, runner.currentStepIndex],
  );

  // Build combined nodeRunnerStates for FullGraphContext
  const effectiveVisualStates =
    instanceCorrectedVisualStates ?? runner.nodeVisualStates;
  const nodeRunnerStates = useMemo(() => {
    const combined = new Map<string, NodeRunnerState>();

    // Add visual states
    for (const [nodeId, vs] of effectiveVisualStates) {
      combined.set(nodeId, { visualState: vs });
    }

    // Merge warnings (may exist on nodes not yet in visual states)
    for (const [nodeId, warns] of runner.nodeWarnings) {
      const existing = combined.get(nodeId);
      if (existing) {
        combined.set(nodeId, { ...existing, warnings: warns });
      } else {
        combined.set(nodeId, { visualState: 'warning', warnings: warns });
      }
    }

    // Merge errors
    for (const [nodeId, errs] of runner.nodeErrors) {
      const existing = combined.get(nodeId);
      if (existing) {
        combined.set(nodeId, { ...existing, errors: errs });
      } else {
        combined.set(nodeId, { visualState: 'errored', errors: errs });
      }
    }

    return combined;
  }, [effectiveVisualStates, runner.nodeWarnings, runner.nodeErrors]);

  const handleModeChange = useCallback(
    (m: 'instant' | 'stepByStep') => {
      runner.setMode(m);
    },
    [runner.setMode],
  );

  // Handle Run: in stepByStep mode when paused, resume instead of starting new run
  const handleRun = useCallback(() => {
    if (runner.runnerState === 'paused') {
      runner.resume();
    } else {
      runner.run();
    }
  }, [runner.runnerState, runner.run, runner.resume]);

  // Expose the imperative runner handle (`FullGraphProps.runnerRef`) so an
  // application can start a run on its own schedule. `handleRun` is the SAME
  // function the panel's Run button calls, so the two can never disagree about
  // resume-versus-restart. The getter reads `runner.runnerState` through the
  // effect's closure, which is refreshed on every state change by the deps.
  useEffect(() => {
    if (!runnerRef) return;
    runnerRef.current = {
      run: handleRun,
      stop: runner.stop,
      reset: runner.reset,
      getRunnerState: () => runner.runnerState,
    };
    return () => {
      runnerRef.current = null;
    };
  }, [runnerRef, handleRun, runner.stop, runner.reset, runner.runnerState]);

  // Reset selection when a new run starts or on reset
  useEffect(() => {
    if (runner.runnerState === 'compiling' || runner.runnerState === 'idle') {
      setSelectedStepIndex(null);
    }
  }, [runner.runnerState]);

  // Sync node visual states with selected step
  useEffect(() => {
    if (selectedStepIndex !== null) {
      runner.replayTo(selectedStepIndex);
    }
  }, [selectedStepIndex, runner.replayTo]);

  const selectedStepRecord = useMemo(() => {
    if (selectedStepIndex === null || !runner.executionRecord) return null;
    return (
      runner.executionRecord.steps.find(
        (s) => s.stepIndex === selectedStepIndex,
      ) ?? null
    );
  }, [selectedStepIndex, runner.executionRecord]);

  // Expose execution record getter to parent via ref (with viewState merged)
  useEffect(() => {
    if (onExecutionRecordRef) {
      onExecutionRecordRef.current = () => {
        const record = runner.executionRecord;
        if (!record) return null;
        const vs = {
          ...getViewState(),
          runMode: runner.mode,
          maxLoopIterations: runner.maxLoopIterations,
        };
        return { ...record, viewState: vs };
      };
    }
    return () => {
      if (onExecutionRecordRef) {
        onExecutionRecordRef.current = null;
      }
    };
  }, [
    onExecutionRecordRef,
    runner.executionRecord,
    getViewState,
    runner.mode,
    runner.maxLoopIterations,
  ]);

  // Per-node preview snapshots (live + at-the-current-step) for `nodePreviews`.
  // Gated on `hasNodePreviews` so it's a stable EMPTY reference (never rebuilds)
  // when no preview is registered. Sourced from `currentStepIndex` — the scrub/
  // replay head that also drives `nodeVisualStates` — so status + values stay
  // coherent when the timeline is scrubbed. Single O(n) pass over `record.steps`
  // (already the flat, complete list of every step at every depth).
  const nodePreviewValues = useMemo(
    () =>
      hasNodePreviews && runner.executionRecord
        ? computeNodePreviewValues(
            runner.executionRecord,
            runner.currentStepIndex,
            openInstancePath,
          )
        : EMPTY_NODE_PREVIEW_VALUES,
    [
      hasNodePreviews,
      runner.executionRecord,
      runner.currentStepIndex,
      openInstancePath,
    ],
  );

  // R1: memoize so the context value stays stable across graph dispatches that
  // don't touch runner state — otherwise every node re-renders on every dispatch.
  const runnerContextValue = useMemo(
    () => ({
      nodeRunnerStates,
      selectedStepRecord,
      edgeValuesAnimated,
      nodePreviewValues,
    }),
    [
      nodeRunnerStates,
      selectedStepRecord,
      edgeValuesAnimated,
      nodePreviewValues,
    ],
  );

  return (
    <RunnerContext.Provider value={runnerContextValue}>
      {children}

      <NodeRunnerPanel
        runnerState={runner.runnerState}
        record={runner.executionRecord}
        currentStepIndex={runner.currentStepIndex}
        followIntoGroups={followIntoGroups}
        onFollowIntoGroupsChange={setFollowIntoGroups}
        onRun={handleRun}
        onPause={runner.pause}
        onStep={runner.step}
        onStepOver={runner.stepOver}
        onStop={runner.stop}
        onReset={runner.reset}
        mode={runner.mode}
        onModeChange={handleModeChange}
        maxLoopIterations={runner.maxLoopIterations}
        onMaxLoopIterationsChange={runner.setMaxLoopIterations}
        runTargets={runTargetSummaries}
        activeRunTargetId={activeRunTargetId}
        onRunTargetChange={setActiveRunTargetId}
        steppingAvailable={steppingAvailable}
        onScrubTo={runner.replayTo}
        onNavigateToNode={handleNavigateToNode}
        panelRef={panelRef}
      />
      {/* The floating "Runner" reopen button now lives in `BottomDrawerButtons`
          (FullGraph root), beside any consumer drawers' buttons. */}
    </RunnerContext.Provider>
  );
}

export { RunnerOverlay };
