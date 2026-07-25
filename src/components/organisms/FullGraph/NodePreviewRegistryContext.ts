import { createContext, useContext } from 'react';
import type { ComponentType } from 'react';
import type {
  NodeVisualState,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/types';

/**
 * Props passed to a consumer-registered per-node-type preview component.
 *
 * A preview renders inside the node body and receives that node's current runner
 * values. `live` is the node's most-recently-computed step; `atStep` is the step at
 * (or ≤) the current timeline position (the scrub/replay head) — both are the
 * already-public `ExecutionStepRecord` (read `inputValues`/`outputValues`/`status`/
 * `error`, plus `nodeTypeName`/`customName`/timing/loop context). `visualState` is
 * the LIVE overlay status (idle/running/completed/errored/skipped/warning); a step
 * record's own `status` is its RECORDED terminal outcome (completed/errored/skipped)
 * — different axes. All value fields are `null` until the node has runner data
 * (standalone / before a run / a node that hasn't executed by the current step).
 */
type NodePreviewProps = {
  /** Instance id of the node this preview is rendering for. */
  nodeId: string;
  /** The node's type id (the registry key this preview was registered under). */
  nodeTypeId: string;
  /** The node's type display name (available even before the node runs). */
  nodeName: string;
  /** The instance's user custom name, if any. */
  customName?: string;
  /** Live per-node overlay status; `undefined` when there is no runner. */
  visualState: NodeVisualState | undefined;
  /** The node's most-recently-computed step, or `null` if it hasn't run. */
  live: ExecutionStepRecord | null;
  /** The node's step at/≤ the current timeline position, or `null`. */
  atStep: ExecutionStepRecord | null;
};

/**
 * Registry of custom node-body preview components keyed by NodeTypeUniqueId.
 * Mirrors `InputComponentRegistry`; passed as the `nodePreviews` prop and kept out
 * of serialized state. It may target any node type id — standard nodes are the
 * primary use case; group nodes record empty value maps, and group-SUBTREE nodes
 * are instance-aware (the open instance's own values; see the node-preview doc's
 * "Group instances" section). Define the registry at
 * MODULE level: a fresh object literal per render gives each entry a new component
 * identity, remounting the preview (state loss + error-boundary reset).
 */
type NodePreviewRegistry<NodeTypeUniqueId extends string = string> = Partial<
  Record<NodeTypeUniqueId, ComponentType<NodePreviewProps>>
>;

const NodePreviewRegistryContext = createContext<
  NodePreviewRegistry | undefined
>(undefined);

function useNodePreviewRegistry(): NodePreviewRegistry | undefined {
  return useContext(NodePreviewRegistryContext);
}

export { NodePreviewRegistryContext, useNodePreviewRegistry };
export type { NodePreviewProps, NodePreviewRegistry };
