import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { RecordingViewState } from '@/utils/nodeRunner/types';

// ─────────────────────────────────────────────────────
// Context value type
// ─────────────────────────────────────────────────────

type RecordingViewStateContextValue = {
  // ── Panel-level state (previously in FullGraph) ────
  selectedStepIndex: number | null;
  setSelectedStepIndex: Dispatch<SetStateAction<number | null>>;
  edgeValuesAnimated: boolean;
  setEdgeValuesAnimated: Dispatch<SetStateAction<boolean>>;
  isRunnerPanelOpen: boolean;
  setIsRunnerPanelOpen: Dispatch<SetStateAction<boolean>>;

  // ── Timeline-level state (previously in ExecutionTimeline) ──
  autoScroll: boolean;
  setAutoScroll: Dispatch<SetStateAction<boolean>>;
  timeMode: 'execution' | 'wallClock';
  setTimeMode: Dispatch<SetStateAction<'execution' | 'wallClock'>>;
  timelineCollapsed: boolean;
  setTimelineCollapsed: Dispatch<SetStateAction<boolean>>;
  selectedIterations: Map<string, number>;
  setSelectedIterations: Dispatch<SetStateAction<Map<string, number>>>;
  autoplayIntervalSec: number;
  setAutoplayIntervalSec: Dispatch<SetStateAction<number>>;

  // ── Serialization ──────────────────────────────────
  /** Collect all current UI preferences into a serializable object. */
  getViewState: () => RecordingViewState;
  /** Restore all UI preferences from a loaded recording. */
  restoreViewState: (vs: RecordingViewState) => void;
};

const RecordingViewStateContext =
  createContext<RecordingViewStateContextValue | null>(null);

// ─────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────

function RecordingViewStateProvider({ children }: { children: ReactNode }) {
  // Panel-level state
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(
    null,
  );
  const [edgeValuesAnimated, setEdgeValuesAnimated] = useState(true);
  const [isRunnerPanelOpen, setIsRunnerPanelOpen] = useState(true);

  // Timeline-level state
  const [autoScroll, setAutoScroll] = useState(true);
  const [timeMode, setTimeMode] = useState<'execution' | 'wallClock'>(
    'execution',
  );
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [selectedIterations, setSelectedIterations] = useState<
    Map<string, number>
  >(new Map());
  const [autoplayIntervalSec, setAutoplayIntervalSec] = useState(2);

  const getViewState = useCallback((): RecordingViewState => {
    const iterObj: Record<string, number> = {};
    for (const [k, v] of selectedIterations) iterObj[k] = v;
    return {
      selectedStepIndex,
      edgeValuesAnimated,
      panelOpen: isRunnerPanelOpen,
      autoScroll,
      timeMode,
      timelineCollapsed,
      selectedIterations: iterObj,
      autoplayIntervalSec,
    };
  }, [
    selectedStepIndex,
    edgeValuesAnimated,
    isRunnerPanelOpen,
    autoScroll,
    timeMode,
    timelineCollapsed,
    selectedIterations,
    autoplayIntervalSec,
  ]);

  const restoreViewState = useCallback((vs: RecordingViewState) => {
    if (vs.selectedStepIndex !== undefined)
      setSelectedStepIndex(vs.selectedStepIndex);
    if (vs.edgeValuesAnimated !== undefined)
      setEdgeValuesAnimated(vs.edgeValuesAnimated);
    if (vs.panelOpen !== undefined) setIsRunnerPanelOpen(vs.panelOpen);
    if (vs.autoScroll !== undefined) setAutoScroll(vs.autoScroll);
    if (vs.timeMode !== undefined) setTimeMode(vs.timeMode);
    if (vs.timelineCollapsed !== undefined)
      setTimelineCollapsed(vs.timelineCollapsed);
    if (vs.selectedIterations) {
      setSelectedIterations(
        new Map(
          Object.entries(vs.selectedIterations).map(
            ([k, v]) => [k, v] as [string, number],
          ),
        ),
      );
    }
    if (vs.autoplayIntervalSec !== undefined)
      setAutoplayIntervalSec(vs.autoplayIntervalSec);
  }, []);

  const value = useMemo<RecordingViewStateContextValue>(
    () => ({
      selectedStepIndex,
      setSelectedStepIndex,
      edgeValuesAnimated,
      setEdgeValuesAnimated,
      isRunnerPanelOpen,
      setIsRunnerPanelOpen,
      autoScroll,
      setAutoScroll,
      timeMode,
      setTimeMode,
      timelineCollapsed,
      setTimelineCollapsed,
      selectedIterations,
      setSelectedIterations,
      autoplayIntervalSec,
      setAutoplayIntervalSec,
      getViewState,
      restoreViewState,
    }),
    [
      selectedStepIndex,
      edgeValuesAnimated,
      isRunnerPanelOpen,
      autoScroll,
      timeMode,
      timelineCollapsed,
      selectedIterations,
      autoplayIntervalSec,
      getViewState,
      restoreViewState,
    ],
  );

  return (
    <RecordingViewStateContext.Provider value={value}>
      {children}
    </RecordingViewStateContext.Provider>
  );
}

// ─────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────

function useRecordingViewState(): RecordingViewStateContextValue {
  const ctx = useContext(RecordingViewStateContext);
  if (!ctx) {
    throw new Error(
      'useRecordingViewState must be used within a RecordingViewStateProvider',
    );
  }
  return ctx;
}

export { RecordingViewStateProvider, useRecordingViewState };
