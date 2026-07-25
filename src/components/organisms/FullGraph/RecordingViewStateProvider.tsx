import {
  useState,
  useCallback,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { RecordingViewState } from '@/utils/nodeRunner/types';
import {
  RecordingViewStateContext,
  type RecordingViewStateContextValue,
} from './RecordingViewStateContext';

// ─────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────

function RecordingViewStateProvider({
  children,
  autoScroll,
  onAutoScrollChange,
}: {
  children: ReactNode;
  /** Controlled auto-scroll preference (document-level; graph state authoritative). */
  autoScroll: boolean;
  /** Called with the new value when the timeline auto-scroll checkbox is toggled. */
  onAutoScrollChange: (enabled: boolean) => void;
}) {
  // Panel-level state
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(
    null,
  );
  const [edgeValuesAnimated, setEdgeValuesAnimated] = useState(true);
  const [isRunnerPanelOpen, setIsRunnerPanelOpen] = useState(true);

  // Timeline-level state. `autoScroll` is a CONTROLLED document preference (graph
  // state, via props); the wrapper resolves the SetStateAction updater form against
  // the current prop before forwarding the concrete boolean to the graph dispatch.
  const setAutoScroll = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) =>
      onAutoScrollChange(
        typeof value === 'function' ? value(autoScroll) : value,
      ),
    [onAutoScrollChange, autoScroll],
  );
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
    // D2: `autoScroll` is a graph-document preference now; a loaded recording does
    // NOT override it (the recording's captured value is informational only).
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
      setAutoScroll,
    ],
  );

  return (
    <RecordingViewStateContext.Provider value={value}>
      {children}
    </RecordingViewStateContext.Provider>
  );
}

export { RecordingViewStateProvider };
