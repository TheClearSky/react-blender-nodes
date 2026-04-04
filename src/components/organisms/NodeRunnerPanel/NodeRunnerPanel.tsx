import { useCallback, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils';
import {
  RunControls,
  type RunMode,
} from '@/components/molecules/RunControls/RunControls';
import { ExecutionTimeline } from '@/components/molecules/ExecutionTimeline/ExecutionTimeline';
import { ExecutionStepInspector } from '@/components/molecules/ExecutionStepInspector/ExecutionStepInspector';
import type {
  RunnerState,
  ExecutionRecord,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/types';
import { useRecordingViewState } from '@/components/organisms/FullGraph/RecordingViewStateContext';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';
import { useResizeHandle } from '@/hooks/useResizeHandle';

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────

const DEFAULT_CONTENT_HEIGHT = 220;
const MIN_CONTENT_HEIGHT = 80;
const MAX_CONTENT_HEIGHT = 600;

// ─────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────

type NodeRunnerPanelProps = {
  /** Current runner state machine state */
  runnerState: RunnerState;
  /** The execution record to display (null before any run) */
  record: ExecutionRecord | null;
  /** Current scrubber / replay position */
  currentStepIndex: number;

  // ── Control actions ────────────────────────────────
  onRun: () => void;
  onPause: () => void;
  onStep: () => void;
  onStop: () => void;
  onReset: () => void;

  // ── Settings ───────────────────────────────────────
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
  maxLoopIterations: number;
  onMaxLoopIterationsChange: (max: number) => void;

  // ── Replay / scrub ────────────────────────────────
  onScrubTo: (stepIndex: number) => void;

  // ── Node navigation ──────────────────────────────────
  /** Called when prev/next navigation buttons are used to focus a node */
  onNavigateToNode?: (nodeId: string) => void;

  // ── Display options ────────────────────────────────
  debugMode?: boolean;
  hideComplexValues?: boolean;

  /** Ref forwarded to the panel's outer element for height measurement */
  panelRef?: React.RefObject<HTMLDivElement | null>;

  /** Optional className for the root element */
  className?: string;
};

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────

function NodeRunnerPanel({
  runnerState,
  record,
  currentStepIndex,
  onRun,
  onPause,
  onStep,
  onStop,
  onReset,
  mode,
  onModeChange,
  maxLoopIterations,
  onMaxLoopIterationsChange,
  onScrubTo,
  onNavigateToNode,
  panelRef,
  debugMode = false,
  hideComplexValues = false,
  className,
}: NodeRunnerPanelProps) {
  const {
    selectedStepIndex,
    setSelectedStepIndex,
    edgeValuesAnimated,
    setEdgeValuesAnimated,
    isRunnerPanelOpen,
    setIsRunnerPanelOpen,
  } = useRecordingViewState();

  const { size: contentHeight, onMouseDown: handleResizeStart } =
    useResizeHandle({
      initialSize: DEFAULT_CONTENT_HEIGHT,
      minSize: MIN_CONTENT_HEIGHT,
      maxSize: MAX_CONTENT_HEIGHT,
      direction: 'up',
    });

  const { mounted, ref: animRef, style } = useSlideAnimation(isRunnerPanelOpen);

  // Combine animation ref + external panelRef
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Set animation ref
      (animRef as React.RefObject<HTMLDivElement | null>).current = node;
      // Set external measurement ref
      if (panelRef) {
        (panelRef as React.RefObject<HTMLDivElement | null>).current = node;
      }
    },
    [animRef, panelRef],
  );

  // Reset inspector selection when panel closes
  useEffect(() => {
    if (!isRunnerPanelOpen) {
      setSelectedStepIndex(null);
    }
  }, [isRunnerPanelOpen, setSelectedStepIndex]);

  const selectedStepRecord =
    selectedStepIndex !== null && record
      ? (record.steps.find((s) => s.stepIndex === selectedStepIndex) ?? null)
      : null;

  // Keep a ref to the last selected step so we can render it during the exit animation
  const lastStepRecordRef = useRef<ExecutionStepRecord | null>(null);
  if (selectedStepRecord) lastStepRecordRef.current = selectedStepRecord;
  const inspectorOpen = selectedStepRecord !== null;
  const inspectorAnim = useSlideAnimation(inspectorOpen, {
    durationMs: 200,
    hiddenTransform: 'translateX(100%)',
    visibleTransform: 'translateX(0)',
  });
  const displayedStepRecord = selectedStepRecord ?? lastStepRecordRef.current;

  const handleStepClick = useCallback(
    (stepRecord: ExecutionStepRecord) => {
      setSelectedStepIndex(
        selectedStepIndex === stepRecord.stepIndex
          ? null
          : stepRecord.stepIndex,
      );
    },
    [selectedStepIndex, setSelectedStepIndex],
  );

  const handleCloseInspector = useCallback(() => {
    setSelectedStepIndex(null);
  }, [setSelectedStepIndex]);

  if (!mounted) return null;

  return (
    // Clip wrapper: contains the slide animation so translateY(100%)
    // doesn't overflow the page and cause scrollbars.
    <div className='absolute inset-x-0 bottom-0 z-10 overflow-hidden pointer-events-none'>
      <div
        ref={combinedRef}
        className={cn(
          'pointer-events-auto',
          'flex flex-col overflow-hidden rounded-t-lg border border-b-0 border-secondary-dark-gray/60 bg-runner-panel-bg shadow-xl',
          className,
        )}
        style={style}
      >
        {/* Window handle — three dots, also serves as resize handle */}
        <div
          className='group/resizer flex shrink-0 cursor-ns-resize items-center justify-center border-b border-runner-timeline-box-border bg-[#2b2b2b] py-2 transition-colors hover:bg-[#353535]'
          onMouseDown={handleResizeStart}
        >
          <div className='flex gap-1.5'>
            <span className='h-1.5 w-1.5 rounded-full bg-runner-handle-dot transition-colors group-hover/resizer:bg-primary-blue' />
            <span className='h-1.5 w-1.5 rounded-full bg-runner-handle-dot transition-colors group-hover/resizer:bg-primary-blue' />
            <span className='h-1.5 w-1.5 rounded-full bg-runner-handle-dot transition-colors group-hover/resizer:bg-primary-blue' />
          </div>
        </div>

        {/* Run Controls toolbar + close button */}
        <div className='flex shrink-0 items-center'>
          <div className='min-w-0 flex-1'>
            <RunControls
              runnerState={runnerState}
              onRun={onRun}
              onPause={onPause}
              onStep={onStep}
              onStop={onStop}
              onReset={onReset}
              mode={mode}
              onModeChange={onModeChange}
              maxLoopIterations={maxLoopIterations}
              onMaxLoopIterationsChange={onMaxLoopIterationsChange}
            />
          </div>
          <button
            type='button'
            onClick={() => setIsRunnerPanelOpen(false)}
            className='btn-press mr-3 shrink-0 rounded p-1.5 text-secondary-light-gray transition-colors hover:bg-primary-dark-gray hover:text-primary-white'
            title='Close panel'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        {/* Timeline + Inspector */}
        <div
          className='flex min-h-0 overflow-hidden'
          style={{ height: `${contentHeight}px` }}
        >
          {/* Timeline (flexible width) */}
          <div className='min-w-0 flex-1 overflow-hidden'>
            <ExecutionTimeline
              record={record}
              currentStepIndex={currentStepIndex}
              onScrubTo={onScrubTo}
              onStepClick={handleStepClick}
              selectedStepIndex={selectedStepIndex}
              onNavigateToNode={onNavigateToNode}
            />
          </div>

          {/* Inspector (fixed width, slides in from right) */}
          {inspectorAnim.mounted && displayedStepRecord && (
            <div
              ref={inspectorAnim.ref}
              className='node-runner-scrollbar shrink-0 overflow-y-auto border-l border-secondary-dark-gray'
              style={inspectorAnim.style}
            >
              <ExecutionStepInspector
                stepRecord={displayedStepRecord}
                onClose={handleCloseInspector}
                loopRecords={record?.loopRecords}
                hideComplexValues={hideComplexValues}
                debugMode={debugMode}
                edgeValuesAnimated={edgeValuesAnimated}
                onEdgeValuesAnimatedChange={setEdgeValuesAnimated}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { NodeRunnerPanel };

export type { NodeRunnerPanelProps };
