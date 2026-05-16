import type { SupportedUnderlyingTypes } from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type { ExecutionStep, GroupExecutionScope } from '../types';
import { createGraphError } from '../errors';
import { ValueStore, qualifiedId } from '../valueStore';
import { hasKey } from '../groupCompiler';
import type { ExecutionEnv, NodeInfo } from './executionHelpers';
import {
  shouldSkipNode,
  recordStructuralNodeCompletion,
  getStepNodeId,
  getStepTypeId,
  getStepTypeName,
  handleCatchError,
  buildInnerState,
} from './executionHelpers';
import { executeStandardNode } from './executeStandardNode';
import { executeLoopBlock } from './executeLoopBlock';

// ─────────────────────────────────────────────────────
// Execute a group scope
// ─────────────────────────────────────────────────────

async function executeGroupScope<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  scope: GroupExecutionScope,
  env: ExecutionEnv<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  valueStore: ValueStore,
  erroredNodes: Set<string>,
  groupDepth: number = 1,
  afterStep?: () => Promise<void>,
): Promise<void> {
  const {
    recorder,
    plan,
    functionImplementations,
    state,
    onNodeStateChange,
    abortSignal,
  } = env;

  const { groupNodeId, groupNodeTypeId, groupNodeTypeName, innerPlan } = scope;

  onNodeStateChange(groupNodeId, 'running');

  // ── Get subtree from the group's type definition ───
  if (!hasKey(state.typeOfNodes, groupNodeTypeId)) {
    const error = createGraphError({
      error: new Error(
        `Group node type "${groupNodeTypeName}" not found in type definitions`,
      ),
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      path: [],
      timestamp: 0,
      duration: 0,
      groupContext: { groupNodeId, groupNodeTypeId, depth: groupDepth },
    });
    const errIdx = recorder.beginStep({
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      concurrencyLevel: scope.concurrencyLevel,
      groupNodeId,
      groupDepth,
    });
    recorder.errorStep(errIdx, error, new Map());
    onNodeStateChange(groupNodeId, 'errored');
    erroredNodes.add(groupNodeId);
    throw error;
  }
  const typeOfNode = state.typeOfNodes[groupNodeTypeId];

  const subtree = typeOfNode.subtree;
  if (!subtree) {
    const error = createGraphError({
      error: new Error(
        `Group node type "${groupNodeTypeName}" has no subtree definition`,
      ),
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      path: [],
      timestamp: 0,
      duration: 0,
      groupContext: { groupNodeId, groupNodeTypeId, depth: groupDepth },
    });
    const errIdx = recorder.beginStep({
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      concurrencyLevel: scope.concurrencyLevel,
      groupNodeId,
      groupDepth,
    });
    recorder.errorStep(errIdx, error, new Map());
    onNodeStateChange(groupNodeId, 'errored');
    erroredNodes.add(groupNodeId);
    throw error;
  }

  // ── Build scoped state for inner function implementations (DC-3 fix) ──
  const innerState = buildInnerState(state, subtree);

  // ── Build inner nodeInfoMap from subtree nodes ─────
  const innerNodeInfoMap = new Map<string, NodeInfo>();

  // Add all subtree nodes (including GroupInput/GroupOutput for source resolution)
  for (const node of subtree.nodes) {
    const nodeTypeId = node.data.nodeTypeUniqueId;
    if (!nodeTypeId) continue;
    const innerTypeOfNode = hasKey(state.typeOfNodes, nodeTypeId)
      ? state.typeOfNodes[nodeTypeId]
      : undefined;
    innerNodeInfoMap.set(node.id, {
      data: node.data,
      typeOfNode: innerTypeOfNode,
      nodeTypeId,
      nodeTypeName: innerTypeOfNode?.name ?? nodeTypeId,
      concurrencyLevel: -1, // Will be set from plan steps
    });
  }

  // Update concurrency levels from the inner plan's steps
  for (const level of innerPlan.levels) {
    for (const step of level) {
      if (step.kind === 'standard') {
        const info = innerNodeInfoMap.get(step.nodeId);
        if (info) info.concurrencyLevel = step.concurrencyLevel;
      }
    }
  }

  // ── Create scoped ValueStore ───────────────────────
  const scopedStore = valueStore.createScope(groupNodeId);

  // ── Map outer inputs → GroupInput outputs ──────────
  const groupInputNodeId = subtree.inputNodeId;
  if (groupInputNodeId) {
    for (const [outerHandleId, innerHandleId] of scope.inputMapping) {
      // Find what feeds into the outer group node's input handle
      const outerKey = qualifiedId(groupNodeId, outerHandleId);
      const outerEntries = plan.inputResolutionMap.get(outerKey);

      if (outerEntries && outerEntries.length > 0) {
        // Get the value from the parent store
        const value = valueStore.get(
          outerEntries[0].sourceNodeId,
          outerEntries[0].sourceHandleId,
        );
        // Set as GroupInput's output in the scoped store
        scopedStore.set(groupInputNodeId, innerHandleId, value);
      }
    }
  }

  // ── Build inner env for group execution ────────────
  const innerEnv: ExecutionEnv<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = {
    recorder,
    abortSignal,
    onNodeStateChange,
    plan: innerPlan,
    state: innerState,
    functionImplementations,
    nodeInfoMap: innerNodeInfoMap,
  };

  // ── Execute inner plan levels ──────────────────────
  recorder.beginGroup(groupNodeId, groupNodeTypeId);
  recorder.beginScope();

  let innerHasErrors = false;
  const innerErroredNodes = new Set<string>();

  for (let levelIdx = 0; levelIdx < innerPlan.levels.length; levelIdx++) {
    if (abortSignal.aborted) break;

    const level = innerPlan.levels[levelIdx];

    const toExecute: ExecutionStep[] = [];
    const toSkip: ExecutionStep[] = [];

    for (const step of level) {
      const stepNodeId = getStepNodeId(step);
      if (
        shouldSkipNode(
          stepNodeId,
          innerPlan.inputResolutionMap,
          innerErroredNodes,
        )
      ) {
        toSkip.push(step);
      } else {
        toExecute.push(step);
      }
    }

    // Record skipped inner steps
    for (const step of toSkip) {
      const stepNodeId = getStepNodeId(step);
      onNodeStateChange(stepNodeId, 'skipped');
      innerErroredNodes.add(stepNodeId);
      const skipIdx = recorder.beginStep({
        nodeId: stepNodeId,
        nodeTypeId: getStepTypeId(step),
        nodeTypeName: getStepTypeName(step),
        concurrencyLevel: step.concurrencyLevel,
        groupNodeId,
        groupDepth,
      });
      recorder.skipStep(skipIdx);
      await afterStep?.();
    }

    // Execute non-skipped inner steps.
    // Uses innerState (not outer state) so function implementations
    // see the subtree's nodes/edges in context.state (DC-3 fix).
    // In step-by-step mode (afterStep present), execute sequentially.
    // In performance mode, use Promise.allSettled for concurrency.
    if (afterStep) {
      for (const step of toExecute) {
        if (abortSignal.aborted) break;
        try {
          if (step.kind === 'standard') {
            await executeStandardNode(step, innerEnv, scopedStore, {
              groupContext: { groupNodeId, groupNodeTypeId, groupDepth },
            });
            await afterStep();
          } else if (step.kind === 'group') {
            await executeGroupScope(
              step,
              innerEnv,
              scopedStore,
              innerErroredNodes,
              groupDepth + 1,
              afterStep,
            );
          } else {
            await executeLoopBlock(
              step,
              innerEnv,
              scopedStore,
              innerErroredNodes,
              undefined, // parentLoopContext
              afterStep,
            );
          }
        } catch (e) {
          innerHasErrors = true;
          innerErroredNodes.add(getStepNodeId(step));
          handleCatchError(e, step, innerEnv);
        }
      }
    } else {
      const results = await Promise.allSettled(
        toExecute.map((step) => {
          if (step.kind === 'standard') {
            return executeStandardNode(step, innerEnv, scopedStore, {
              groupContext: { groupNodeId, groupNodeTypeId, groupDepth },
            });
          }
          if (step.kind === 'group') {
            return executeGroupScope(
              step,
              innerEnv,
              scopedStore,
              innerErroredNodes,
              groupDepth + 1,
            );
          }
          return executeLoopBlock(
            step,
            innerEnv,
            scopedStore,
            innerErroredNodes,
          );
        }),
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'rejected') {
          innerHasErrors = true;
          innerErroredNodes.add(getStepNodeId(toExecute[i]));
          handleCatchError(result.reason, toExecute[i], innerEnv);
        }
      }
    }
  }

  // ── Map GroupOutput inputs → outer outputs ─────────
  const groupOutputNodeId = subtree.outputNodeId;
  if (groupOutputNodeId) {
    for (const [innerHandleId, outerHandleId] of scope.outputMapping) {
      // Find what feeds into GroupOutput's input handle in the inner graph
      const innerKey = qualifiedId(groupOutputNodeId, innerHandleId);
      const innerEntries = innerPlan.inputResolutionMap.get(innerKey);

      if (innerEntries && innerEntries.length > 0) {
        const value = scopedStore.get(
          innerEntries[0].sourceNodeId,
          innerEntries[0].sourceHandleId,
        );
        // Set in the parent store as the group node's output
        valueStore.set(groupNodeId, outerHandleId, value);
      }
    }
  }

  // ── Build inner record snapshot for group recording ─
  // endScope() returns only the steps/errors recorded within this scope,
  // not the entire recorder history (fixes BUG #3 / DC-2).
  const innerSnapshot = recorder.endScope(
    innerHasErrors ? 'errored' : 'completed',
    scopedStore.snapshot(),
  );
  recorder.completeGroup(
    groupNodeId,
    groupNodeTypeId,
    innerSnapshot,
    scope.inputMapping,
    scope.outputMapping,
  );

  // ── Record structural step for the group node (replay/timeline visibility) ──
  // This is recorded AFTER endScope() so it belongs to the outer scope.
  const groupStepBase = {
    nodeId: groupNodeId,
    nodeTypeId: groupNodeTypeId,
    nodeTypeName: groupNodeTypeName,
    concurrencyLevel: scope.concurrencyLevel,
    groupNodeId,
    groupDepth,
  };

  if (innerHasErrors) {
    const groupError = createGraphError({
      error: new Error(
        `Group "${groupNodeTypeName}" inner execution had errors`,
      ),
      nodeId: groupNodeId,
      nodeTypeId: groupNodeTypeId,
      nodeTypeName: groupNodeTypeName,
      path: [],
      timestamp: 0,
      duration: 0,
      groupContext: { groupNodeId, groupNodeTypeId, depth: groupDepth },
    });
    recordStructuralNodeCompletion(recorder, groupStepBase, {
      status: 'errored',
      error: groupError,
    });
    onNodeStateChange(groupNodeId, 'errored');
    erroredNodes.add(groupNodeId);
  } else {
    recordStructuralNodeCompletion(recorder, groupStepBase, {
      status: 'completed',
    });
    onNodeStateChange(groupNodeId, 'completed');
  }
}

export { executeGroupScope };
