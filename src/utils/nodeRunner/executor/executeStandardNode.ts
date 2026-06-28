import type { SupportedUnderlyingTypes } from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type { StandardExecutionStep, LoopPhase, SwitchPhase } from '../types';
import { createGraphError, buildErrorPath } from '../errors';
import { ValueStore } from '../valueStore';
import { isStandardNodeType, hasKey } from '../groupCompiler';
import type { ExecutionEnv } from './executionHelpers';
import { recordInputValues, recordOutputValues } from './executionHelpers';

// ─────────────────────────────────────────────────────
// Execute a single standard node
// ─────────────────────────────────────────────────────

async function executeStandardNode<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  step: StandardExecutionStep,
  env: ExecutionEnv<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  valueStore: ValueStore,
  nested?: {
    loopContext?: {
      loopIteration: number;
      loopStructureId: string;
      maxIterations: number;
    };
    groupContext?: {
      groupNodeId: string;
      groupNodeTypeId: string;
      groupDepth: number;
    };
    loopPhase?: LoopPhase;
    switchContext?: {
      switchStructureId: string;
    };
    switchPhase?: SwitchPhase;
  },
): Promise<void> {
  const {
    recorder,
    plan,
    functionImplementations,
    state,
    nodeInfoMap,
    onNodeStateChange,
    abortSignal,
  } = env;
  const loopContext = nested?.loopContext;
  const groupContext = nested?.groupContext;
  const loopPhase = nested?.loopPhase;
  const switchContext = nested?.switchContext;
  const switchPhase = nested?.switchPhase;

  const { nodeId, nodeTypeId, nodeTypeName, customName, concurrencyLevel } =
    step;

  onNodeStateChange(nodeId, 'running');

  const stepIndex = recorder.beginStep({
    nodeId,
    nodeTypeId,
    nodeTypeName,
    customName,
    concurrencyLevel,
    loopIteration: loopContext?.loopIteration,
    loopStructureId: loopContext?.loopStructureId,
    groupNodeId: groupContext?.groupNodeId,
    groupDepth: groupContext?.groupDepth,
    loopPhase,
    switchPhase,
    switchStructureId: switchContext?.switchStructureId,
  });

  const stepStartTime = performance.now();

  const nodeInfo = nodeInfoMap.get(nodeId);
  if (!nodeInfo) {
    const error = createGraphError({
      error: new Error(`Node "${nodeId}" not found in state`),
      nodeId,
      nodeTypeId,
      nodeTypeName,
      customName,
      path: [],
      timestamp: performance.now() - stepStartTime,
      duration: 0,
    });
    recorder.errorStep(stepIndex, error, new Map());
    onNodeStateChange(nodeId, 'errored');
    throw error;
  }

  // Resolve inputs
  const inputMap = valueStore.resolveInputs(
    nodeId,
    nodeInfo.data,
    plan.inputResolutionMap,
    nodeInfoMap,
  );

  // Build output info
  const outputInfo = valueStore.buildOutputInfo(
    nodeId,
    nodeInfo.data,
    plan.outputDistributionMap,
  );

  // Get function implementation — standard nodes have built-in logic, skip them.
  // step.nodeTypeId is typed as string but was built from a NodeTypeUniqueId;
  // after the isStandardNodeType guard, we know it's a non-standard key.
  if (isStandardNodeType(nodeTypeId)) {
    // Standard nodes should never reach executeStandardNode, but guard anyway
    recorder.completeStep(stepIndex, recordInputValues(inputMap), new Map());
    onNodeStateChange(nodeId, 'completed');
    return;
  }
  if (!hasKey(functionImplementations, nodeTypeId)) {
    const error = createGraphError({
      error: new Error(
        `No function implementation for node type "${nodeTypeName}" (${nodeTypeId})`,
      ),
      nodeId,
      nodeTypeId,
      nodeTypeName,
      customName,
      path: buildErrorPath(nodeId, plan.inputResolutionMap, nodeInfoMap),
      timestamp: performance.now() - stepStartTime,
      duration: performance.now() - stepStartTime,
      loopContext: loopContext
        ? {
            loopStructureId: loopContext.loopStructureId,
            iteration: loopContext.loopIteration,
            maxIterations: loopContext.maxIterations,
          }
        : undefined,
      groupContext: groupContext
        ? {
            groupNodeId: groupContext.groupNodeId,
            groupNodeTypeId: groupContext.groupNodeTypeId,
            depth: groupContext.groupDepth,
          }
        : undefined,
    });
    recorder.errorStep(stepIndex, error, recordInputValues(inputMap));
    onNodeStateChange(nodeId, 'errored');
    throw error;
  }
  const impl = functionImplementations[nodeTypeId];

  if (!impl) {
    const error = createGraphError({
      error: new Error(
        `No function implementation for node type "${nodeTypeName}" (${nodeTypeId})`,
      ),
      nodeId,
      nodeTypeId,
      nodeTypeName,
      customName,
      path: buildErrorPath(nodeId, plan.inputResolutionMap, nodeInfoMap),
      timestamp: performance.now() - stepStartTime,
      duration: performance.now() - stepStartTime,
      loopContext: loopContext
        ? {
            loopStructureId: loopContext.loopStructureId,
            iteration: loopContext.loopIteration,
            maxIterations: loopContext.maxIterations,
          }
        : undefined,
      groupContext: groupContext
        ? {
            groupNodeId: groupContext.groupNodeId,
            groupNodeTypeId: groupContext.groupNodeTypeId,
            depth: groupContext.groupDepth,
          }
        : undefined,
    });
    recorder.errorStep(stepIndex, error, recordInputValues(inputMap));
    onNodeStateChange(nodeId, 'errored');
    throw error;
  }

  // Build execution context
  const context = {
    nodeId,
    nodeTypeId,
    nodeTypeName,
    state,
    loopIteration: loopContext?.loopIteration,
    groupDepth: groupContext?.groupDepth,
    abortSignal,
  };

  try {
    // Call the function implementation (may be sync or async)
    const result = await impl(inputMap, outputInfo, context);

    // Validate result is a Map
    if (!(result instanceof Map)) {
      throw new Error(
        `Function implementation for "${nodeTypeName}" must return a Map, got ${typeof result}`,
      );
    }

    // Store outputs in ValueStore
    for (const [handleName, value] of result) {
      // Find the handle ID for this handle name
      const info = outputInfo.get(handleName);
      if (info) {
        valueStore.set(nodeId, info.handleId, value);
      }
    }

    // Record completion
    recorder.completeStep(
      stepIndex,
      recordInputValues(inputMap),
      recordOutputValues(result, outputInfo),
    );

    onNodeStateChange(nodeId, 'completed');
  } catch (thrown) {
    const duration = performance.now() - stepStartTime;
    const error = createGraphError({
      error: thrown,
      nodeId,
      nodeTypeId,
      nodeTypeName,
      customName,
      path: buildErrorPath(nodeId, plan.inputResolutionMap, nodeInfoMap),
      timestamp: duration,
      duration,
      loopContext: loopContext
        ? {
            loopStructureId: loopContext.loopStructureId,
            iteration: loopContext.loopIteration,
            maxIterations: loopContext.maxIterations,
          }
        : undefined,
      groupContext: groupContext
        ? {
            groupNodeId: groupContext.groupNodeId,
            groupNodeTypeId: groupContext.groupNodeTypeId,
            depth: groupContext.groupDepth,
          }
        : undefined,
    });
    recorder.errorStep(stepIndex, error, recordInputValues(inputMap));
    onNodeStateChange(nodeId, 'errored');
    throw error;
  }
}

export { executeStandardNode };
