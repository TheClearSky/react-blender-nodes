import type { z } from 'zod';
import { execute, executeStepByStep } from '../executor';
import type { SupportedUnderlyingTypes } from '../../nodeStateManagement/types';
import type { ExecutionRecord, ExecutionStepRecord } from '../types';
import type { ExecuteRunContext, ExecuteRunTarget } from './types';

/**
 * The default, built-in `execute` run target — it adapts the in-process
 * executor (`execute` / `executeStepByStep`) to the RunTarget contract. With no
 * consumer `runTargets` prop this is the only target, so routing the runner
 * through it is behaviour-identical to calling the executor directly.
 *
 * `run` / `runStepwise` are kept GENERIC (the object is fixed via `satisfies`,
 * not a type annotation) so a concretely-typed `ExecuteRunContext<D, N, U, C>`
 * from `useNodeRunner` flows in without a variance-bridge cast — the same way
 * the generic `execute` function already adapts to any graph. Explicit type
 * arguments on the executor calls pin the generics (feature-dev §4).
 */
function runInProcess<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  context: ExecuteRunContext<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): Promise<ExecutionRecord> {
  return execute<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >(context.executionPlan, context.functionImplementations, context.state, {
    onNodeStateChange: context.onNodeStateChange,
    abortSignal: context.abortSignal,
    rootInputs: context.rootInputs,
  });
}

function runInProcessStepwise<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  context: ExecuteRunContext<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): AsyncGenerator<
  { stepRecord: ExecutionStepRecord; partialRecord: ExecutionRecord },
  ExecutionRecord
> {
  return executeStepByStep<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >(context.executionPlan, context.functionImplementations, context.state, {
    onNodeStateChange: context.onNodeStateChange,
    abortSignal: context.abortSignal,
    rootInputs: context.rootInputs,
  });
}

const inProcessRunTarget = {
  id: 'in-process',
  label: 'In-process',
  mode: 'execute' as const,
  run: runInProcess,
  runStepwise: runInProcessStepwise,
} satisfies ExecuteRunTarget;

export { inProcessRunTarget };
