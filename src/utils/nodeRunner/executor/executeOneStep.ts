import type { SupportedUnderlyingTypes } from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type { ExecutionStep } from '../types';
import { ValueStore } from '../valueStore';
import type { ExecutionEnv } from './executionHelpers';
import { executeStandardNode } from './executeStandardNode';
import { executeLoopBlock } from './executeLoopBlock';
import { executeSwitchBlock } from './executeSwitchBlock';
import { executeGroupScope } from './executeGroupScope';

// ─────────────────────────────────────────────────────
// Execute one step (dispatcher)
// ─────────────────────────────────────────────────────

async function executeOneStep<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  step: ExecutionStep,
  env: ExecutionEnv<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  valueStore: ValueStore,
  erroredNodes: Set<string>,
  parentLoopContext?: {
    loopIteration: number;
    loopStructureId: string;
  },
  afterStep?: () => Promise<void>,
  groupContext?: {
    groupNodeId: string;
    groupNodeTypeId: string;
    groupDepth: number;
    instancePath: readonly string[];
  },
): Promise<void> {
  switch (step.kind) {
    case 'standard':
      await executeStandardNode(
        step,
        env,
        valueStore,
        groupContext ? { groupContext } : undefined,
      );
      await afterStep?.();
      return;

    case 'loop':
      return executeLoopBlock(
        step,
        env,
        valueStore,
        erroredNodes,
        parentLoopContext,
        afterStep,
        groupContext,
      );

    case 'switch':
      return executeSwitchBlock(
        step,
        env,
        valueStore,
        erroredNodes,
        afterStep,
        groupContext,
      );

    case 'group':
      // Inherit the enclosing scope's depth/path (a group nested inside a
      // loop/switch body which is itself inside a group must not reset to 1).
      return executeGroupScope(
        step,
        env,
        valueStore,
        erroredNodes,
        groupContext ? groupContext.groupDepth + 1 : undefined,
        afterStep,
        groupContext?.instancePath ?? [],
      );
    default:
      throw new Error('Unreachable');
  }
}

export { executeOneStep };
