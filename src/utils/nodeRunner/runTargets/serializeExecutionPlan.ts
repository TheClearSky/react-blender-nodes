import { mapToRecord } from '../../importExport/serialization';
import type {
  ExecutionPlan,
  ExecutionStep,
  GroupExecutionScope,
  InputResolutionEntry,
  LoopExecutionBlock,
  OutputDistributionEntry,
  StandardExecutionStep,
  SwitchExecutionBlock,
} from '../types';

// ─────────────────────────────────────────────────────
// JSON-safe ExecutionPlan (the `json-ir` artifact shape)
//
// The compiled `ExecutionPlan` is PURE structure — strings, numbers, nested
// step arrays, and `ReadonlyMap`s. It carries NO `unknown` values, closures, or
// class instances (function implementations are referenced only by
// `nodeTypeId`), so serialization is purely `ReadonlyMap → Record` applied
// recursively; nothing is lossy and `safeSerializeValue` is unnecessary.
// ─────────────────────────────────────────────────────

type SerializedLoopExecutionBlock = Omit<
  LoopExecutionBlock,
  'preStopSteps' | 'postStopSteps'
> & {
  preStopSteps: ReadonlyArray<SerializedExecutionStep>;
  postStopSteps: ReadonlyArray<SerializedExecutionStep>;
};

type SerializedSwitchExecutionBlock = Omit<
  SwitchExecutionBlock,
  'trueBranchSteps' | 'falseBranchSteps'
> & {
  trueBranchSteps: ReadonlyArray<SerializedExecutionStep>;
  falseBranchSteps: ReadonlyArray<SerializedExecutionStep>;
};

type SerializedGroupExecutionScope = Omit<
  GroupExecutionScope,
  'innerPlan' | 'inputMapping' | 'outputMapping'
> & {
  innerPlan: SerializedExecutionPlan;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
};

/** A single execution step with every nested `ReadonlyMap` flattened to a Record. */
type SerializedExecutionStep =
  | StandardExecutionStep
  | SerializedLoopExecutionBlock
  | SerializedSwitchExecutionBlock
  | SerializedGroupExecutionScope;

/** JSON-safe equivalent of `ExecutionPlan` (every `ReadonlyMap` → `Record`). */
type SerializedExecutionPlan = Omit<
  ExecutionPlan,
  'levels' | 'inputResolutionMap' | 'outputDistributionMap'
> & {
  levels: ReadonlyArray<ReadonlyArray<SerializedExecutionStep>>;
  inputResolutionMap: Record<string, ReadonlyArray<InputResolutionEntry>>;
  outputDistributionMap: Record<string, ReadonlyArray<OutputDistributionEntry>>;
};

function serializeExecutionStep(step: ExecutionStep): SerializedExecutionStep {
  switch (step.kind) {
    case 'standard':
      return step;
    case 'loop':
      return {
        ...step,
        preStopSteps: step.preStopSteps.map(serializeExecutionStep),
        postStopSteps: step.postStopSteps.map(serializeExecutionStep),
      };
    case 'switch':
      return {
        ...step,
        trueBranchSteps: step.trueBranchSteps.map(serializeExecutionStep),
        falseBranchSteps: step.falseBranchSteps.map(serializeExecutionStep),
      };
    case 'group':
      return {
        ...step,
        innerPlan: serializeExecutionPlan(step.innerPlan),
        inputMapping: mapToRecord(step.inputMapping),
        outputMapping: mapToRecord(step.outputMapping),
      };
  }
}

/**
 * Pure, lossless `ExecutionPlan → JSON-safe object` conversion (recursive
 * through loop/switch bodies and nested group plans). No React, no DOM — the
 * `json-ir` run target wraps this with `JSON.stringify` + `downloadTextArtifact`.
 */
function serializeExecutionPlan(plan: ExecutionPlan): SerializedExecutionPlan {
  return {
    levels: plan.levels.map((level) => level.map(serializeExecutionStep)),
    inputResolutionMap: mapToRecord(plan.inputResolutionMap),
    outputDistributionMap: mapToRecord(plan.outputDistributionMap),
    nodeCount: plan.nodeCount,
    warnings: [...plan.warnings],
    // Root Graph I/O markers — which nodes are the program's declared inputs /
    // outputs. Must survive the JSON IR or a re-imported plan loses its root-I/O
    // contract (and falls back to the whole-store return). `JSON.stringify`
    // drops `undefined`, so passing them through is safe when absent.
    rootInputNodeId: plan.rootInputNodeId,
    rootOutputNodeId: plan.rootOutputNodeId,
  };
}

export { serializeExecutionPlan };
export type {
  SerializedExecutionPlan,
  SerializedExecutionStep,
  SerializedLoopExecutionBlock,
  SerializedSwitchExecutionBlock,
  SerializedGroupExecutionScope,
};
