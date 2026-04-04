import { useCallback, useRef, useMemo, useEffect } from 'react';
import { Play } from 'lucide-react';
import { z } from 'zod';
import { useReactFlow } from '@xyflow/react';
import {
  FullGraphContext,
  useRecordContext,
  createContextValue,
  type NodeRunnerState,
} from './FullGraphState';
import { useRecordingViewState } from './RecordingViewStateContext';
import type { ExecutionRecord } from '@/utils/nodeRunner/types';
import {
  useNodeRunner,
  type UseNodeRunnerReturn,
} from '@/utils/nodeRunner/useNodeRunner';
import { NodeRunnerPanel } from '@/components/organisms/NodeRunnerPanel';
import type { FullGraphProps } from './FullGraph';
import type { SupportedUnderlyingTypes } from '@/utils/nodeStateManagement/types';

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
  dispatch,
  functionImplementations,
  children,
  onExecutionRecordRef,
  loadRecordRef,
}: {
  state: FullGraphProps<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['state'];
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
  loadRecordRef?: React.RefObject<
    | ((
        record: ExecutionRecord,
      ) => ReturnType<UseNodeRunnerReturn['loadRecord']>)
    | null
  >;
}) {
  const {
    executionRecord: controlledRecord,
    setExecutionRecord: onExecutionRecordChange,
  } = useRecordContext();
  const runner = useNodeRunner({
    state,
    functionImplementations,
    executionRecord: controlledRecord,
    onExecutionRecordChange,
  });

  const { getNode, setCenter, getViewport } = useReactFlow();
  const panelRef = useRef<HTMLDivElement>(null);

  const viewState = useRecordingViewState();
  const {
    selectedStepIndex,
    setSelectedStepIndex,
    edgeValuesAnimated,
    isRunnerPanelOpen,
    setIsRunnerPanelOpen,
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

  // Build combined nodeRunnerStates for FullGraphContext
  const nodeRunnerStates = useMemo(() => {
    const combined = new Map<string, NodeRunnerState>();

    // Add visual states
    for (const [nodeId, vs] of runner.nodeVisualStates) {
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
  }, [runner.nodeVisualStates, runner.nodeWarnings, runner.nodeErrors]);

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

  return (
    <FullGraphContext.Provider
      value={createContextValue(
        { state, dispatch },
        nodeRunnerStates,
        selectedStepRecord,
        edgeValuesAnimated,
      )}
    >
      {children}

      <NodeRunnerPanel
        runnerState={runner.runnerState}
        record={runner.executionRecord}
        currentStepIndex={runner.currentStepIndex}
        onRun={handleRun}
        onPause={runner.pause}
        onStep={runner.step}
        onStop={runner.stop}
        onReset={runner.reset}
        mode={runner.mode}
        onModeChange={handleModeChange}
        maxLoopIterations={runner.maxLoopIterations}
        onMaxLoopIterationsChange={runner.setMaxLoopIterations}
        onScrubTo={runner.replayTo}
        onNavigateToNode={handleNavigateToNode}
        panelRef={panelRef}
      />

      {/* Toggle button to reopen runner panel */}
      {!isRunnerPanelOpen && (
        <button
          type='button'
          onClick={() => setIsRunnerPanelOpen(true)}
          className='btn-press absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-secondary-dark-gray/60 bg-secondary-black/90 px-4 py-2 text-[12px] font-medium text-primary-white shadow-xl backdrop-blur-sm transition-colors hover:bg-primary-dark-gray'
          title='Open runner panel'
        >
          <Play className='h-3.5 w-3.5' />
          Runner
        </button>
      )}
    </FullGraphContext.Provider>
  );
}

export { RunnerOverlay };
