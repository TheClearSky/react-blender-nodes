import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
  ExecutionPlan,
  ExecutionStep,
} from './contract';
import { emitJsInternal } from './emitJs';
import type { EmitJsOptions } from './emitJs';
import { loadTs } from './tsLoader';
import { eliminateDeadCode } from './ast/deadCode';
import { deriveAutoEmit } from './analyze/autoEmit';
import type { DerivedEmit } from './analyze/autoEmit';
import { planSourceEmission } from './analyze/sourceEmit';
import type { SourceEmissionPlan } from './analyze/sourceEmit';
import { RESERVED_NAMES } from './nameRegistry';
import { formatSource } from './formatSource';

/** Collect every standard-node `nodeTypeId` across the plan, recursing into
 *  loop/switch/group bodies (so a type used only inside a structure still counts —
 *  review SC-05). Mirrors `lower.ts`'s `collectNodeLabels` walk. */
function collectNodeTypeIds(
  steps: ReadonlyArray<ExecutionStep>,
  into: Set<string>,
): void {
  for (const step of steps) {
    switch (step.kind) {
      case 'standard':
        into.add(step.nodeTypeId);
        break;
      case 'loop':
        collectNodeTypeIds(step.preStopSteps, into);
        collectNodeTypeIds(step.postStopSteps, into);
        break;
      case 'switch':
        collectNodeTypeIds(step.trueBranchSteps, into);
        collectNodeTypeIds(step.falseBranchSteps, into);
        break;
      case 'group':
        for (const level of step.innerPlan.levels) {
          collectNodeTypeIds(level, into);
        }
        break;
      default: {
        // Exhaustiveness: a new ExecutionStep.kind must be handled here, else a
        // node type used only under it would silently escape source-emit coverage.
        const _exhaustive: never = step;
        void _exhaustive;
      }
    }
  }
}

/** Opt-in optimization passes (Masterplan §15-26), each a `ts.transform` over the
 *  generated module. Default off (codegen-v2 §10). */
type OptimizePasses = {
  /** Drop bindings/blocks no returned value depends on (needs
   *  `assumePureImplementations` to prune impl-call statements). */
  deadCode?: boolean;
};

type EmitGraphOptions = EmitJsOptions & {
  /** Opt-in optimization passes. */
  optimize?: OptimizePasses;
  /** Prettier-beautify the result (codegen-v2 Decision 7). Default true. */
  beautify?: boolean;
  /** Opt-in (codegen-v2 §6): analyze `impls` so self-contained value-API nodes
   *  (reading inputs via the `readInput` intrinsic) AUTO-EMIT inline instead of
   *  threading. Node types with an author `emit` hook are left untouched. */
  analyzeImplementations?: boolean;
  /** Node-type id → implementation, for `analyzeImplementations`. */
  impls?: Readonly<Record<string, (...args: never[]) => unknown>>;
  /** todo.txt #4 — bake the consumer's node impls + helper deps into the module so
   *  `runGraph()` runs with no `functionImplementations` arg. Under this mode prefer
   *  `knownFunctions` as the single impl registry (its impl subset also feeds
   *  auto-emit); `impls`/`analyzeImplementations` are not reconciled with it. */
  emitImplementations?: 'off' | 'source';
  /** node-type id → impl AND helper name → helper, in one object (for
   *  `emitImplementations: 'source'`). */
  knownFunctions?: Readonly<Record<string, (...args: never[]) => unknown>>;
  /** Extra identifiers treated as safe ambient globals during the source-emit
   *  name-closure check. */
  additionalGlobals?: ReadonlyArray<string>;
};

/**
 * Codegen v2 entry point: emit a standalone, dependency-free `runGraph` module
 * from an `ExecutionPlan` + its `State`, then run the opt-in optimization passes
 * over the generated TypeScript AST and beautify.
 *
 * Pipeline: `emitJs` (proven string emit) → opt-in `ts.transform` passes
 * (parsed → transformed → reprinted) → Prettier. Async because the passes lazily
 * load the TypeScript compiler and Prettier runs async.
 */
async function emitGraph<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  plan: ExecutionPlan,
  state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
  options: EmitGraphOptions = {},
): Promise<string> {
  const language = options.target ?? 'javascript';

  // 0. Opt-in auto-emit: derive inline `emit` hooks for self-contained value-API
  //    impls and merge them into the metadata (author hooks win). The derived
  //    hooks turn threaded value nodes into inline expressions.
  let metadata = options.metadata;
  if (options.analyzeImplementations && options.impls) {
    const ts = await loadTs();
    const derived: Record<
      string,
      { emit: DerivedEmit; emitFanInSafe: boolean }
    > = {};
    for (const [typeId, implementation] of Object.entries(options.impls)) {
      if (metadata?.nodeTypeMetadata?.[typeId]?.emit) continue; // author hook wins
      const hook = deriveAutoEmit(ts, implementation);
      // A derived hook mirrors exactly how the impl reads each input (first vs
      // whole-array), so it is value-identical to the executor even under fan-in.
      if (hook) derived[typeId] = { emit: hook, emitFanInSafe: true };
    }
    if (Object.keys(derived).length > 0) {
      metadata = {
        ...metadata,
        nodeTypeMetadata: { ...metadata?.nodeTypeMetadata, ...derived },
      };
    }
  }

  // 0.5. Opt-in source-emission (`emitImplementations: 'source'`): bake covered
  //      impls + helpers into the module. Auto-emit derives from the SAME
  //      `knownFunctions` impl subset (review CSM-2) and its covered ids are
  //      excluded, so a kernel inlines while a helper-using impl source-emits.
  let sourceEmission: SourceEmissionPlan | undefined;
  if (options.emitImplementations === 'source' && options.knownFunctions) {
    const ts = await loadTs();
    const knownFunctions = options.knownFunctions;
    const allNodeTypeIds = new Set<string>();
    for (const level of plan.levels) collectNodeTypeIds(level, allNodeTypeIds);

    const autoEmittedTypeIds = new Set<string>();
    const derivedFromKnown: Record<
      string,
      { emit: DerivedEmit; emitFanInSafe: boolean }
    > = {};
    for (const [key, implementation] of Object.entries(knownFunctions)) {
      if (!allNodeTypeIds.has(key)) continue; // a helper, not a node impl
      if (metadata?.nodeTypeMetadata?.[key]?.emit) continue; // author hook wins
      const hook = deriveAutoEmit(ts, implementation);
      if (hook) {
        derivedFromKnown[key] = { emit: hook, emitFanInSafe: true };
        autoEmittedTypeIds.add(key);
      }
    }
    if (Object.keys(derivedFromKnown).length > 0) {
      metadata = {
        ...metadata,
        nodeTypeMetadata: {
          ...metadata?.nodeTypeMetadata,
          ...derivedFromKnown,
        },
      };
    }

    sourceEmission = planSourceEmission(ts, {
      knownFunctions,
      allNodeTypeIds,
      autoEmittedTypeIds,
      reservedNames: new Set<string>([
        ...RESERVED_NAMES,
        'readInput',
        'switchInputs',
        'loopValue',
      ]),
      additionalGlobals: options.additionalGlobals,
    });
  }

  // 1. Proven string emit. Don't pass `returnValues` here — when the dead-code
  //    pass runs it derives roots from the actual `return`, doing the
  //    comprehensive sweep the IR-level `dropDead` only approximates.
  let text = emitJsInternal<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >(plan, state, {
    exportRunGraph: options.exportRunGraph,
    target: options.target,
    metadata,
    sourceEmission,
  });

  // 2. Opt-in passes over the generated AST.
  if (options.optimize?.deadCode) {
    const ts = await loadTs();
    // The baked local impl names — consumed ONLY by the full-DCE branch (the
    // `signatureOnly` branch never references it), so build it here, not above.
    const implCallNames = sourceEmission
      ? new Set(sourceEmission.localNameByTypeId.values())
      : undefined;
    text = eliminateDeadCode(ts, text, {
      assumePureImplementations: options.assumePureImplementations,
      // Preserve the "kept unless assumePure" floor for baked node calls (review
      // SC-01) — a local impl call no longer references `functionImplementations`.
      implCallNames,
    });
  } else if (sourceEmission) {
    // Source-emission param-drop: when every node is baked (no opaque
    // `functionImplementations["…"]` call remains), strip the now-unreferenced impls
    // param via the statement-preserving `signatureOnly` cleanup. Mixed coverage
    // keeps the param (an opaque call still references it), so the pass is skipped.
    //
    // The regex matches the opaque CALL form only — `functionImplementations["`. Every
    // opaque call target is `JSON.stringify`'d (a quote always follows `[`) and emitted
    // pre-Prettier on contiguous text, so this NEVER false-drops a real threaded call.
    // (Only a baked impl whose own body literally contains `functionImplementations["`
    // — a string-LITERAL-keyed bound LOCAL — can still false-MIXED; the param is wrongly
    // retained but that is benign: it is unused and callers pass nothing. A numeric or
    // variable subscript no longer trips it. The plan's sound `hasOpaqueCall` IR signal
    // was, by design, not built; see `ir.ts`.)
    const fullyCovered = !/functionImplementations\["/.test(text);
    if (fullyCovered) {
      const ts = await loadTs();
      text = eliminateDeadCode(ts, text, { signatureOnly: true });
    }
  }

  // 3. Beautify (default on).
  if (options.beautify !== false) {
    text = await formatSource(text, language);
  }
  return text;
}

export { emitGraph };
export type { EmitGraphOptions, OptimizePasses };
