import type { SupportedUnderlyingTypes } from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type {
  ExecutionStep,
  SwitchExecutionBlock,
  SwitchPhase,
} from '../types';
import { createGraphError } from '../errors';
import { ValueStore, qualifiedId, flattenInputs } from '../valueStore';
import type { ExecutionEnv } from './executionHelpers';
import {
  recordInputValues,
  recordOutputValues,
  shouldSkipNode,
  getStepNodeId,
  getStepTypeId,
  getStepTypeName,
  getStepCustomName,
  handleCatchError,
  getDataHandleIds,
  findConditionInputId,
  resolveConditionValue,
} from './executionHelpers';
import { executeStandardNode } from './executeStandardNode';
import { executeOneStep } from './executeOneStep';

async function executeSwitchBlock<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  block: SwitchExecutionBlock,
  env: ExecutionEnv<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  valueStore: ValueStore,
  erroredNodes: Set<string>,
  afterStep?: () => Promise<void>,
  groupContext?: {
    groupNodeId: string;
    groupNodeTypeId: string;
    groupDepth: number;
    instancePath: readonly string[];
  },
): Promise<void> {
  const { recorder, plan, nodeInfoMap, onNodeStateChange, abortSignal } = env;
  // When this switch executes INSIDE a group scope, every step it records (the
  // pair's structural steps AND branch nodes) carries the enclosing group's
  // identity + instance path — without this, switch-in-group steps record as
  // root-level (unattributed).
  const groupStepFields = groupContext
    ? {
        groupNodeId: groupContext.groupNodeId,
        groupDepth: groupContext.groupDepth,
        instancePath: groupContext.instancePath,
      }
    : {};
  const {
    switchStartNodeId,
    switchEndNodeId,
    trueBranchSteps,
    falseBranchSteps,
  } = block;

  const switchStructureId = switchStartNodeId;
  recorder.beginSwitchStructure(
    switchStructureId,
    switchStartNodeId,
    switchEndNodeId,
  );

  const startInfo = nodeInfoMap.get(switchStartNodeId);
  const endInfo = nodeInfoMap.get(switchEndNodeId);

  if (!startInfo || !endInfo) {
    const error = createGraphError({
      error: new Error('Switch structure nodes not found in state'),
      nodeId: switchStartNodeId,
      nodeTypeId: 'switch',
      nodeTypeName: 'Switch',
      path: [],
      timestamp: 0,
      duration: 0,
    });
    const errIdx = recorder.beginStep({
      nodeId: switchStartNodeId,
      nodeTypeId: 'switch',
      nodeTypeName: 'Switch',
      concurrencyLevel: block.concurrencyLevel,
      ...groupStepFields,
    });
    recorder.errorStep(errIdx, error, new Map());
    onNodeStateChange(switchStartNodeId, 'errored');
    onNodeStateChange(switchEndNodeId, 'errored');
    erroredNodes.add(switchStartNodeId);
    erroredNodes.add(switchEndNodeId);
    throw error;
  }

  const startInputs = flattenInputs(startInfo.data.inputs);
  const startOutputs = startInfo.data.outputs ?? [];
  const endInputs = flattenInputs(endInfo.data.inputs);
  const endOutputs = endInfo.data.outputs ?? [];

  const startDataInputIds = getDataHandleIds(startInputs);
  const startDataOutputIds = getDataHandleIds(startOutputs);
  const endDataInputIds = getDataHandleIds(endInputs);
  const endDataOutputIds = getDataHandleIds(endOutputs);

  const conditionInputId = findConditionInputId(startInputs);

  const dataHandleCount = startDataInputIds.length;

  // SwitchStart outputs: true zone + false zone, each with dataHandleCount handles
  // SwitchEnd inputs: true zone + false zone, each with dataHandleCount handles
  const trueOutputCount = Math.ceil(startDataOutputIds.length / 2);
  const trueInputCount = Math.ceil(endDataInputIds.length / 2);

  if (
    dataHandleCount === 0 ||
    endDataOutputIds.length !== dataHandleCount ||
    !conditionInputId
  ) {
    const error = createGraphError({
      error: new Error(
        `Switch structure has mismatched data handle counts ` +
          `(start in=${dataHandleCount}, start out=${startDataOutputIds.length}, ` +
          `end in=${endDataInputIds.length}, end out=${endDataOutputIds.length})`,
      ),
      nodeId: switchStartNodeId,
      nodeTypeId: startInfo.nodeTypeId,
      nodeTypeName: startInfo.nodeTypeName,
      path: [],
      timestamp: 0,
      duration: 0,
    });
    const errIdx = recorder.beginStep({
      nodeId: switchStartNodeId,
      nodeTypeId: startInfo.nodeTypeId,
      nodeTypeName: startInfo.nodeTypeName,
      concurrencyLevel: block.concurrencyLevel,
      ...groupStepFields,
    });
    recorder.errorStep(errIdx, error, new Map());
    onNodeStateChange(switchStartNodeId, 'errored');
    erroredNodes.add(switchStartNodeId);
    erroredNodes.add(switchEndNodeId);
    throw error;
  }

  // Resolve condition (supports both edge connections and inline allowInput values)
  const conditionValue = resolveConditionValue(
    switchStartNodeId,
    conditionInputId,
    startInputs,
    plan.inputResolutionMap,
    valueStore,
  );

  // Resolve data inputs and set SwitchStart outputs
  const inputValues: unknown[] = new Array(dataHandleCount);
  for (let i = 0; i < dataHandleCount; i++) {
    const key = qualifiedId(switchStartNodeId, startDataInputIds[i]);
    const entries = plan.inputResolutionMap.get(key) ?? [];
    if (entries.length > 0) {
      inputValues[i] = valueStore.get(
        entries[0].sourceNodeId,
        entries[0].sourceHandleId,
      );
    }
  }

  // Set ALL switch start outputs (both true and false zones get the same input values)
  for (let i = 0; i < dataHandleCount; i++) {
    // True zone output
    if (i < trueOutputCount) {
      valueStore.set(switchStartNodeId, startDataOutputIds[i], inputValues[i]);
    }
    // False zone output
    const falseIdx = trueOutputCount + i;
    if (falseIdx < startDataOutputIds.length) {
      valueStore.set(
        switchStartNodeId,
        startDataOutputIds[falseIdx],
        inputValues[i],
      );
    }
  }

  onNodeStateChange(switchStartNodeId, 'running');

  // Record SwitchStart
  const startOutputInfo = valueStore.buildOutputInfo(
    switchStartNodeId,
    startInfo.data,
    plan.outputDistributionMap,
  );
  {
    const startIdx = recorder.beginStep({
      nodeId: switchStartNodeId,
      nodeTypeId: startInfo.nodeTypeId,
      nodeTypeName: startInfo.nodeTypeName,
      concurrencyLevel: block.concurrencyLevel,
      switchPhase: 'switchStart' as SwitchPhase,
      switchStructureId,
      branchTaken: conditionValue,
      ...groupStepFields,
    });
    const startInputMap = valueStore.resolveInputs(
      switchStartNodeId,
      startInfo.data,
      plan.inputResolutionMap,
      nodeInfoMap,
    );
    const startOutputMap = new Map<string, unknown>();
    for (const [handleName, info] of startOutputInfo) {
      startOutputMap.set(
        handleName,
        valueStore.get(switchStartNodeId, info.handleId),
      );
    }
    recorder.completeStep(
      startIdx,
      recordInputValues(startInputMap),
      recordOutputValues(startOutputMap, startOutputInfo),
    );
    await afterStep?.();
  }

  // Execute the chosen branch
  const branchSteps = conditionValue ? trueBranchSteps : falseBranchSteps;
  const branchErroredNodes = new Set<string>();

  // Group by concurrency level
  const levelMap = new Map<number, ExecutionStep[]>();
  for (const step of branchSteps) {
    const group = levelMap.get(step.concurrencyLevel);
    if (group) group.push(step);
    else levelMap.set(step.concurrencyLevel, [step]);
  }
  const sortedLevels = [...levelMap.entries()].sort((a, b) => a[0] - b[0]);

  for (const [, levelSteps] of sortedLevels) {
    if (abortSignal.aborted) break;

    const toExecute: ExecutionStep[] = [];
    const toSkip: ExecutionStep[] = [];

    for (const step of levelSteps) {
      const stepNodeId = getStepNodeId(step);
      if (
        shouldSkipNode(stepNodeId, plan.inputResolutionMap, branchErroredNodes)
      ) {
        toSkip.push(step);
      } else {
        toExecute.push(step);
      }
    }

    for (const step of toSkip) {
      const stepNodeId = getStepNodeId(step);
      onNodeStateChange(stepNodeId, 'skipped');
      branchErroredNodes.add(stepNodeId);
      const skipIdx = recorder.beginStep({
        nodeId: stepNodeId,
        nodeTypeId: getStepTypeId(step),
        nodeTypeName: getStepTypeName(step),
        customName: getStepCustomName(step),
        concurrencyLevel: step.concurrencyLevel,
        ...groupStepFields,
      });
      recorder.skipStep(skipIdx);
      await afterStep?.();
    }

    const branchPhase: SwitchPhase = conditionValue
      ? 'trueBranch'
      : 'falseBranch';
    const switchNested = {
      switchContext: { switchStructureId },
      switchPhase: branchPhase,
      groupContext,
    };

    if (afterStep) {
      for (const step of toExecute) {
        if (abortSignal.aborted) break;
        try {
          if (step.kind === 'standard') {
            await executeStandardNode(step, env, valueStore, switchNested);
            await afterStep();
          } else {
            await executeOneStep(
              step,
              env,
              valueStore,
              branchErroredNodes,
              undefined,
              afterStep,
              groupContext,
            );
          }
        } catch (e) {
          branchErroredNodes.add(getStepNodeId(step));
          handleCatchError(e, step, env);
        }
      }
    } else {
      const results = await Promise.allSettled(
        toExecute.map((step) => {
          if (step.kind === 'standard') {
            return executeStandardNode(step, env, valueStore, switchNested);
          }
          return executeOneStep(
            step,
            env,
            valueStore,
            branchErroredNodes,
            undefined,
            undefined,
            groupContext,
          );
        }),
      );
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          branchErroredNodes.add(getStepNodeId(toExecute[i]));
          handleCatchError(
            (results[i] as PromiseRejectedResult).reason,
            toExecute[i],
            env,
          );
        }
      }
    }
  }

  // Resolve SwitchEnd outputs from the branch that ran
  const endOutputInfo = valueStore.buildOutputInfo(
    switchEndNodeId,
    endInfo.data,
    plan.outputDistributionMap,
  );

  // Pick inputs from the executed branch zone
  for (let i = 0; i < dataHandleCount; i++) {
    const branchInputIdx = conditionValue ? i : trueInputCount + i;
    if (branchInputIdx < endDataInputIds.length) {
      const key = qualifiedId(switchEndNodeId, endDataInputIds[branchInputIdx]);
      const entries = plan.inputResolutionMap.get(key) ?? [];
      let value: unknown;
      if (
        entries.length > 0 &&
        !branchErroredNodes.has(entries[0].sourceNodeId)
      ) {
        value = valueStore.get(
          entries[0].sourceNodeId,
          entries[0].sourceHandleId,
        );
      }
      valueStore.set(switchEndNodeId, endDataOutputIds[i], value);
    }
  }

  // Record SwitchEnd
  {
    const endIdx = recorder.beginStep({
      nodeId: switchEndNodeId,
      nodeTypeId: endInfo.nodeTypeId,
      nodeTypeName: endInfo.nodeTypeName,
      concurrencyLevel: block.concurrencyLevel,
      switchPhase: 'switchEnd' as SwitchPhase,
      switchStructureId,
      branchTaken: conditionValue,
      ...groupStepFields,
    });
    const endInputMap = valueStore.resolveInputs(
      switchEndNodeId,
      endInfo.data,
      plan.inputResolutionMap,
      nodeInfoMap,
    );
    const endOutputMap = new Map<string, unknown>();
    for (const [handleName, info] of endOutputInfo) {
      endOutputMap.set(
        handleName,
        valueStore.get(switchEndNodeId, info.handleId),
      );
    }
    recorder.completeStep(
      endIdx,
      recordInputValues(endInputMap),
      recordOutputValues(endOutputMap, endOutputInfo),
    );
    await afterStep?.();
  }

  recorder.completeSwitchStructure(switchStructureId, conditionValue);

  onNodeStateChange(switchStartNodeId, 'completed');
  onNodeStateChange(switchEndNodeId, 'completed');
}

export { executeSwitchBlock };
