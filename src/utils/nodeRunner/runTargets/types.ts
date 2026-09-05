import type { ReactNode } from 'react';
import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
} from '../../nodeStateManagement/types';
import type {
  ExecutionPlan,
  ExecutionRecord,
  ExecutionStepRecord,
  FunctionImplementations,
  NodeVisualState,
} from '../types';
import type { RecorderWarning } from '../executionRecorder';

/**
 * Pluggable run targets — the Strategy pattern for graph execution.
 *
 * A `RunTarget` is one execution strategy (the built-in in-process executor, a
 * codegen / artifact emitter, a backend caller, …); the runner is the context
 * that selects one when the user clicks Run. Two first-class modes:
 *  - `execute`  → produces an `ExecutionRecord` that feeds the timeline.
 *  - `artifact` → returns / downloads a file or string and skips the timeline.
 *
 * Stepping (pause / step) is an OPTIONAL per-target capability: an execute
 * target that provides `runStepwise` lights up the stepping UI; one that omits
 * it runs single-shot (the LangChain `stream`-is-optional / DAP capability
 * negotiation model — implemented → used, omitted → ignored).
 */

const runTargetModes = ['execute', 'artifact'] as const;
type RunTargetMode = (typeof runTargetModes)[number];

/**
 * Read-only data EVERY target receives. NOTE: `functionImplementations` is NOT
 * here — no artifact target needs the impl closures (json-ir serializes the
 * plan; codegen emits a function that TAKES impls as a parameter), so it lives
 * on `ExecuteRunContext` only (Interface Segregation).
 */
type RunTargetContextBase<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /** Raw graph state — escape hatch for targets that re-derive their own IR. */
  state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >;
  /** The compiled stable IR — the default input a target consumes. */
  executionPlan: ExecutionPlan;
  options: { maxLoopIterations: number };
  abortSignal: AbortSignal;
  /**
   * Values for the graph's declared root inputs, keyed by Graph Input handle
   * NAME. The in-process executor seeds these into the root Graph Input node's
   * output handles (mirroring codegen's `runGraph(a, b)` parameters); other
   * targets may forward them however they model parameters. Absent / `undefined`
   * when the graph declares no root inputs or the host supplies no values.
   */
  rootInputs?: Record<string, unknown>;
};

/**
 * Context for `execute` targets: the base plus the impls and the
 * record-production machinery.
 */
type ExecuteRunContext<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = RunTargetContextBase<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> & {
  functionImplementations: FunctionImplementations<NodeTypeUniqueId>;
  /** Optional live per-node visual feedback the target may drive. */
  onNodeStateChange: (nodeId: string, visualState: NodeVisualState) => void;
  /**
   * Optional observer for recorder anomaly warnings (orphan promotion at
   * finalize, unclosed scopes, key collisions). The in-process executor
   * threads it into its `ExecutionRecorder`; without it the recorder
   * dev-`console.warn`s and stays silent in production.
   */
  onRecorderWarning?: (warning: RecorderWarning) => void;
  /**
   * Easy path: delegate to the built-in in-process executor and return its
   * record. Advanced authors hand-build a record with the public
   * `ExecutionRecorder` instead.
   */
  runWithInProcessExecutor: () => Promise<ExecutionRecord>;
};

/** Context for `artifact` targets: the read-only base data only. */
type ArtifactRunContext<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = RunTargetContextBase<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>;

type RunTargetIdentity = {
  /** Stable unique id (used for selection + dedupe). */
  id: string;
  /** Human-facing label for the run-target dropdown. */
  label: string;
  /** Optional icon shown in the dropdown / on the Run button. */
  icon?: ReactNode;
};

/**
 * An `execute` target: produces an `ExecutionRecord` fed to the timeline.
 * Optionally provides `runStepwise` to enable pause / step for this target.
 */
type ExecuteRunTarget<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = RunTargetIdentity & {
  mode: 'execute';
  run: (
    context: ExecuteRunContext<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ) => Promise<ExecutionRecord>;
  runStepwise?: (
    context: ExecuteRunContext<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ) => AsyncGenerator<
    { stepRecord: ExecutionStepRecord; partialRecord: ExecutionRecord },
    ExecutionRecord
  >;
};

/** An `artifact` target: returns / downloads a file or string; no timeline. */
type ArtifactRunTarget<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = RunTargetIdentity & {
  mode: 'artifact';
  run: (
    context: ArtifactRunContext<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ) => Promise<void>;
};

/**
 * A run target = one execution strategy. Discriminated on `mode` so the return
 * type AND the context shape are encoded in the type (no "which return based on
 * mode" ambiguity); `runStepwise` can only exist on execute targets.
 */
type RunTarget<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> =
  | ExecuteRunTarget<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  | ArtifactRunTarget<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >;

/**
 * Identity factory for authoring a run target with full type-checking and
 * IntelliSense, without spelling the 4 generics (mirrors
 * `makeStateWithAutoInfer`). The `const` type parameter preserves the literal
 * `mode` discriminant — a plain identity over the union would widen `mode` to
 * `'execute' | 'artifact'` and lose narrowing on the result.
 */
function makeRunTargetWithAutoInfer<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  const SpecificRunTarget extends RunTarget<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = RunTarget<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
>(runTarget: SpecificRunTarget): SpecificRunTarget {
  return runTarget;
}

export { runTargetModes, makeRunTargetWithAutoInfer };
export type {
  RunTargetMode,
  ExecuteRunContext,
  ArtifactRunContext,
  ExecuteRunTarget,
  ArtifactRunTarget,
  RunTarget,
};
