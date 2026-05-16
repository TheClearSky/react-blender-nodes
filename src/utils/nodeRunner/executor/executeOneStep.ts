import type { SupportedUnderlyingTypes } from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type { ExecutionStep } from '../types';
import { ValueStore } from '../valueStore';
import type { ExecutionEnv } from './executionHelpers';
import { executeStandardNode } from './executeStandardNode';
import { executeLoopBlock } from './executeLoopBlock';
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
): Promise<void> {
  switch (step.kind) {
    case 'standard':
      await executeStandardNode(step, env, valueStore);
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
      );

    case 'group':
      return executeGroupScope(
        step,
        env,
        valueStore,
        erroredNodes,
        undefined, // groupDepth
        afterStep,
      );
    default:
      throw new Error('Unreachable');
  }
}

export { executeOneStep };
