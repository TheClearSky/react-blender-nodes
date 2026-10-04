import { useCallback, useRef, useEffect } from 'react';
import { cn } from '@/utils';
import {
  RunControls,
  type RunMode,
  type RunControlsRunTarget,
} from '@/components/molecules/RunControls/RunControls';
import { ExecutionTimeline } from '@/components/molecules/ExecutionTimeline/ExecutionTimeline';
import { ExecutionStepInspector } from '@/components/molecules/ExecutionStepInspector/ExecutionStepInspector';
import { BottomDrawerShell } from '@/components/molecules/BottomDrawerShell/BottomDrawerShell';
import type {
  RunnerState,
  ExecutionRecord,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/types';
import { useRecordingViewState } from '@/components/organisms/FullGraph/RecordingViewStateContext';
import { BottomDrawerSwitchers } from '@/components/organisms/FullGraph/BottomDrawerSwitchers';
import { RUNNER_DRAWER_ID } from '@/components/organisms/FullGraph/bottomDrawers';
import { useSlideAnimation } from '@/hooks/useSlideAnimation';

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
  /** Live step-over (forwarded to RunControls; rendered when provided). */
  onStepOver?: () => void;
  onStop: () => void;
  onReset: () => void;

  // ── Settings ───────────────────────────────────────
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
  maxLoopIterations: number;
  onMaxLoopIterationsChange: (max: number) => void;

  // ── Run targets ────────────────────────────────────
  runTargets?: ReadonlyArray<RunControlsRunTarget>;
  activeRunTargetId?: string;
  onRunTargetChange?: (id: string) => void;
  steppingAvailable?: boolean;

  // ── Replay / scrub ────────────────────────────────
  onScrubTo: (stepIndex: number) => void;

  // ── Node navigation ──────────────────────────────────
  /** Called when prev/next navigation buttons are used to focus a node */
  onNavigateToNode?: (nodeId: string) => void;
  /** Follow-into-groups toggle — a document-level graph-`State` preference
   *  (`runnerViewPreferences.followIntoGroups`, persisted); forwarded to the
   *  timeline. */
  followIntoGroups?: boolean;
  onFollowIntoGroupsChange?: (enabled: boolean) => void;

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

/**
 * The runner drawer: `RunControls` in the header, `ExecutionTimeline` +
 * `ExecutionStepInspector` in the body. The chrome (clip wrapper, slide
 * animation, resize handle, header row with the `X`) is `BottomDrawerShell`,
 * shared with consumer `bottomDrawers`; the open flag comes from
 * `useRecordingViewState()`, which derives it from the shared bottom-drawer
 * context — so this panel and any consumer drawer are never open together.
 */
function NodeRunnerPanel({
  runnerState,
  record,
  currentStepIndex,
  onRun,
  onPause,
  onStep,
  onStepOver,
  onStop,
  onReset,
  mode,
  onModeChange,
  maxLoopIterations,
  onMaxLoopIterationsChange,
  runTargets,
  activeRunTargetId,
  onRunTargetChange,
  steppingAvailable,
  onScrubTo,
  onNavigateToNode,
  followIntoGroups,
  onFollowIntoGroupsChange,
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

  const handleClose = useCallback(
    () => setIsRunnerPanelOpen(false),
    [setIsRunnerPanelOpen],
  );

  return (
    <BottomDrawerShell
      open={isRunnerPanelOpen}
      onClose={handleClose}
      panelRef={panelRef}
      dataSlot='runner-panel'
      drawerId={RUNNER_DRAWER_ID}
      // The named container the responsive layout keys on (`@max-[832px]/runnerpanel:`).
      className={cn('rbn:@container/runnerpanel', className)}
      ariaLabel='Runner panel'
      closeTitle='Close panel'
      header={
        <RunControls
          runnerState={runnerState}
          onRun={onRun}
          onPause={onPause}
          onStep={onStep}
          onStepOver={onStepOver}
          onStop={onStop}
          onReset={onReset}
          mode={mode}
          onModeChange={onModeChange}
          maxLoopIterations={maxLoopIterations}
          onMaxLoopIterationsChange={onMaxLoopIterationsChange}
          runTargets={runTargets}
          activeRunTargetId={activeRunTargetId}
          onRunTargetChange={onRunTargetChange}
          steppingAvailable={steppingAvailable}
        />
      }
      headerActions={
        <BottomDrawerSwitchers currentDrawerId={RUNNER_DRAWER_ID} />
      }
    >
      {/* Timeline (flexible width) */}
      <div className='rbn:min-w-0 rbn:flex-1 rbn:overflow-hidden'>
        <ExecutionTimeline
          record={record}
          currentStepIndex={currentStepIndex}
          onScrubTo={onScrubTo}
          onStepClick={handleStepClick}
          selectedStepIndex={selectedStepIndex}
          onNavigateToNode={onNavigateToNode}
          followIntoGroups={followIntoGroups}
          onFollowIntoGroupsChange={onFollowIntoGroupsChange}
        />
      </div>

      {/* Inspector — fixed-width column ≥832px, full-body slide-over overlay below */}
      {inspectorAnim.mounted && displayedStepRecord && (
        <div
          ref={inspectorAnim.ref}
          // Below @max-[832px] (container < 832px) the inspector becomes a
          // full-body overlay (slide-over) instead of squeezing the timeline;
          // at/above 832px it stays the in-flow fixed-width column. The
          // translateX slide (inspectorAnim) is preserved in both modes.
          // z-30 puts the overlay strictly above everything inside the
          // timeline body (ruler z-20, scrubber line z-[15], selected/active
          // blocks z-10, loop labels z-[5]) so it covers by layer, not by DOM
          // source order — still well below the ⋯ popover portal's z-50.
          className='node-runner-scrollbar rbn:shrink-0 rbn:overflow-y-auto rbn:border-l rbn:border-secondary-dark-gray rbn:@max-[832px]/runnerpanel:absolute rbn:@max-[832px]/runnerpanel:inset-0 rbn:@max-[832px]/runnerpanel:z-30 rbn:@max-[832px]/runnerpanel:border-l-0'
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
    </BottomDrawerShell>
  );
}

export { NodeRunnerPanel };

export type { NodeRunnerPanelProps };
