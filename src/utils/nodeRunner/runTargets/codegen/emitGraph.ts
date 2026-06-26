import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
  ExecutionPlan,
} from './contract';
import type { CodegenMetadata } from './contract';
import { emitJs } from './emitJs';
import type { EmitJsOptions } from './emitJs';
import { loadTs } from './tsLoader';
import { eliminateDeadCode } from './ast/deadCode';
import { deriveAutoEmit } from './analyze/autoEmit';
import { formatSource } from './formatSource';

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
      { emit: ReturnType<typeof deriveAutoEmit>; emitFanInSafe: boolean }
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
      } as CodegenMetadata;
    }
  }

  // 1. Proven string emit. Don't pass `returnValues` here — when the dead-code
  //    pass runs it derives roots from the actual `return`, doing the
  //    comprehensive sweep the IR-level `dropDead` only approximates.
  let text = emitJs<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >(plan, state, {
    exportRunGraph: options.exportRunGraph,
    target: options.target,
    metadata,
  });

  // 2. Opt-in passes over the generated AST.
  if (options.optimize?.deadCode) {
    const ts = await loadTs();
    text = eliminateDeadCode(ts, text, {
      assumePureImplementations: options.assumePureImplementations,
    });
  }

  // 3. Beautify (default on).
  if (options.beautify !== false) {
    text = await formatSource(text, language);
  }
  return text;
}

export { emitGraph };
export type { EmitGraphOptions, OptimizePasses };
