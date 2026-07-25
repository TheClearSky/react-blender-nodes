import { useContext } from 'react';
import type { ComponentType } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/utils';
import { ErrorBoundary } from '@/components/atoms/ErrorBoundary';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { RunnerContext } from '@/components/organisms/FullGraph/FullGraphState';
import {
  useNodePreviewRegistry,
  type NodePreviewProps,
} from '@/components/organisms/FullGraph/NodePreviewRegistryContext';
import type { NodeVisualState } from '@/utils/nodeRunner/types';

type NodePreviewPanelProps = {
  /** Instance id of the node (undefined ⇒ nothing renders). */
  nodeId?: string;
  /** The node's type id (the registry key). */
  nodeTypeUniqueId?: string;
  /** Type display name passed to the preview for labeling. */
  nodeName: string;
  /** Instance custom name, if any. */
  customName?: string;
  /** Whether this instance's preview is collapsed (hidden). */
  collapsed: boolean;
  /**
   * Overrides the RunnerContext-derived status. `ConfigurableNode` passes its
   * own `runnerVisualState` so a STANDALONE node (rendered without a
   * `RunnerOverlay`, hence no context) still shows a preview status that agrees
   * with its own status border, instead of the two disagreeing (D-5/AR-2).
   */
  visualState?: NodeVisualState;
};

/**
 * Outer panel: reads ONLY the preview registry and early-returns when there is
 * nothing to show (collapsed, no node id, or no preview registered for the type).
 * Only on a registry HIT does it mount `NodePreviewPanelInner`, which subscribes
 * to `RunnerContext`. So the common case — a node with NO registered preview —
 * never takes its OWN `RunnerContext` subscription (D-7/AR-4; the node's RF
 * wrapper still subscribes for status borders, so this avoids an additional
 * subscription, not node re-renders). Safe to mount unconditionally on every node.
 */
function NodePreviewPanel({
  nodeId,
  nodeTypeUniqueId,
  nodeName,
  customName,
  collapsed,
  visualState,
}: NodePreviewPanelProps) {
  const registry = useNodePreviewRegistry();

  if (collapsed || !nodeId || !nodeTypeUniqueId) return null;
  const PreviewComponent = registry?.[nodeTypeUniqueId];
  if (!PreviewComponent) return null;

  return (
    <NodePreviewPanelInner
      nodeId={nodeId}
      nodeTypeUniqueId={nodeTypeUniqueId}
      nodeName={nodeName}
      customName={customName}
      visualState={visualState}
      PreviewComponent={PreviewComponent}
    />
  );
}

type NodePreviewPanelInnerProps = {
  nodeId: string;
  nodeTypeUniqueId: string;
  nodeName: string;
  customName?: string;
  visualState?: NodeVisualState;
  PreviewComponent: ComponentType<NodePreviewProps>;
};

/**
 * Inner panel — mounted only when a preview is registered. It subscribes to the
 * runner context, derives this node's `live` / `atStep` snapshots + status, and
 * renders the consumer component inside its OWN nested `ErrorBoundary` (the whole
 * node already has one at the ReactFlow wrapper) so a throwing preview is
 * contained to the panel. The boundary's `resetKey` tracks the rendered status +
 * step indices, so a TRANSIENT bad value auto-recovers once the throwing input
 * changes (a preview that throws on EVERY render settles on the fallback card —
 * no retry loop) instead of sticking as a dead error card.
 *
 * The panel renders ON TOP of the node at the node's EXACT width (`w-0
 * min-w-full`); oversized content scrolls (`max-h` + `overflow-auto`) rather than
 * widening the node. `text-[27px]` defaults previews to the node's text scale so
 * normal-web font sizes stay legible on the canvas; consumers override with their
 * own styling.
 */
function NodePreviewPanelInner({
  nodeId,
  nodeTypeUniqueId,
  nodeName,
  customName,
  visualState: visualStateProp,
  PreviewComponent,
}: NodePreviewPanelInnerProps) {
  const runnerContext = useContext(RunnerContext);
  const theme = useGraphTheme();

  const entry = runnerContext?.nodePreviewValues?.get(nodeId);
  const live = entry?.live ?? null;
  const atStep = entry?.atStep ?? null;
  const visualState =
    visualStateProp ??
    runnerContext?.nodeRunnerStates?.get(nodeId)?.visualState;

  return (
    <div
      data-slot='node-preview-panel'
      // `w-0 min-w-full` pins the panel to EXACTLY the node's width (it
      // contributes nothing to the wrapper's intrinsic width, then stretches to
      // match the node) — oversized content scrolls instead of widening the node.
      className={cn(
        'nodrag nopan nowheel mb-1 w-0 min-w-full max-h-[320px] overflow-auto rounded-md bg-primary-dark-gray text-[27px] leading-snug',
        theme?.node?.previewPanel,
      )}
    >
      <ErrorBoundary
        // Recover when new runner values or a new status arrive (a transient bad
        // value on one step must not permanently break the preview).
        resetKey={`${visualState ?? 'none'}:${live?.stepIndex ?? -1}:${atStep?.stepIndex ?? -1}`}
        onError={(error, errorInfo) =>
          console.error(
            `[NodePreview:${nodeId}] Render error:`,
            error,
            errorInfo,
          )
        }
        fallback={({ error, reset }) => (
          <div className='flex flex-col items-center gap-2 p-3 text-center'>
            <div className='flex items-center gap-1.5 text-status-errored'>
              <AlertTriangle className='h-5 w-5' />
              <span className='text-[20px] font-medium'>Preview error</span>
            </div>
            <p className='text-[16px] text-secondary-light-gray'>
              {error.message}
            </p>
            <button
              type='button'
              onClick={reset}
              className='rounded border border-secondary-dark-gray px-2 py-1 text-[16px] text-secondary-light-gray transition-colors hover:text-primary-white'
            >
              Retry
            </button>
          </div>
        )}
      >
        <PreviewComponent
          nodeId={nodeId}
          nodeTypeId={nodeTypeUniqueId}
          nodeName={nodeName}
          customName={customName}
          visualState={visualState}
          live={live}
          atStep={atStep}
        />
      </ErrorBoundary>
    </div>
  );
}

export { NodePreviewPanel };
export type { NodePreviewPanelProps };
