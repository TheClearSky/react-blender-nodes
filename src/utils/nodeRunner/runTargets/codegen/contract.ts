// The codegen package boundary. Everything codegen needs from the editor/runner
// crosses HERE and nowhere else — so the whole `codegen/` folder can later be
// lifted into a standalone `react-blender-nodes-codegen` package by repointing
// this one file's backing imports at an adapter. An ESLint rule (added in Stage 0c)
// forbids `codegen/**` from importing editor / React / `@xyflow` / core modules
// directly; they must come through this contract. See
// `.claude/plans/codegen-ast-rebuild.md` §5.3.

// ── Runner plan IR — the structural input codegen walks ──────────────────────
export type {
  ExecutionPlan,
  ExecutionStep,
  StandardExecutionStep,
  LoopExecutionBlock,
  SwitchExecutionBlock,
  GroupExecutionScope,
} from '../../types';

// ── Core state shape (generic, type-only) ────────────────────────────────────
// Stage 2 replaces most direct `State` use with a thin `GraphView` read model;
// until then codegen lowers from `State` and this is the single crossing point.
export type {
  State,
  SupportedUnderlyingTypes,
} from '../../../nodeStateManagement/types';

// ── Executor classifiers + value-store helpers ───────────────────────────────
// Reused so codegen ≡ executor by construction (the generated control-flow and
// handle classification match the runtime exactly). Re-exported as values.
export {
  getDataHandleIds,
  findConditionInputId,
} from '../../executor/executionHelpers';
export { qualifiedId, flattenInputs } from '../../valueStore';
export type { MinimalNodeData } from '../../valueStore';

// ── Codegen metadata (Decision 6) ────────────────────────────────────────────
// Per-node and per-data-type codegen behavior. Supplied to the codegen factory
// (`makeCodegenRunTarget`) / `emitJs` — NOT stored on the core `TypeOfNode` /
// `DataType` (which carry no codegen fields). This keeps the editor core free of
// codegen concerns and is the clean seam the future package owns.

/** Context passed to a node type's `emit` hook. `inputs` maps each input handle
 *  NAME to its FIRST-connection source expression in the generated module;
 *  `inputsAll` maps each input handle NAME to an array-literal expression of ALL
 *  its fan-in connection expressions (e.g. `[B, B_2]`) — the codegen analogue of
 *  `readInput(inputs, name)` returning the whole array. A scalar hook uses
 *  `inputs.X`; a fan-in-aware hook uses `inputsAll.X`. The hook returns an
 *  expression per OUTPUT handle name. */
export type CodegenEmitContext = {
  inputs: Readonly<Record<string, string>>;
  inputsAll: Readonly<Record<string, string>>;
  outputs: ReadonlyArray<string>;
  nodeId: string;
  language: 'javascript' | 'typescript';
};

/** Per-node-type codegen behavior. */
export type NodeCodegenMetadata = {
  /** Render this node type inline as a source expression per output handle name
   *  (e.g. `a && b`) instead of a value-API call. Cover every output to opt in;
   *  a partial/throwing return falls back to the call form. */
  emit?: (context: CodegenEmitContext) => Readonly<Record<string, string>>;
  /** When true, `emit` is proven safe under input fan-in (it sources each input
   *  from `inputs` (first) or `inputsAll` (array) exactly as the implementation
   *  reads it), so lowering inlines it even when an input has multiple incoming
   *  edges. Set by auto-emit derivation; an authored opaque `emit` hook leaves it
   *  unset and stays guarded (a fan-in input forces the threaded call form). */
  emitFanInSafe?: boolean;
};

/** All codegen metadata, keyed by id. Passed to the codegen factory / `emitJs`. */
export type CodegenMetadata = {
  /** node-type id → codegen behavior. */
  nodeTypeMetadata?: Record<string, NodeCodegenMetadata>;
  /** data-type id → TypeScript type expression for the TS target's casts
   *  (e.g. `{ bit: 'boolean' }`); absent ⇒ `unknown`. */
  dataTypeToTsType?: Record<string, string>;
};
