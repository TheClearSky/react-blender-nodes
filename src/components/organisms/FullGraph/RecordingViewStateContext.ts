import {
  createContext,
  useContext,
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

export { RecordingViewStateContext, useRecordingViewState };
export type { RecordingViewStateContextValue };
