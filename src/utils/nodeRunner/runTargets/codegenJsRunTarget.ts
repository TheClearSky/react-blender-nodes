import type { z } from 'zod';
import type { SupportedUnderlyingTypes } from '../../nodeStateManagement/types';
import { downloadTextArtifact } from './downloadTextArtifact';
import { emitGraph } from './codegen/emitGraph';
import type { PrintLanguage } from './codegen/printJs';
import type { CodegenMetadata } from './codegen/contract';
import type { ArtifactRunContext, ArtifactRunTarget } from './types';

type CodegenRunTargetOptions = {
  /** Run-target id (unique among a graph's targets). Default per language. */
  id?: string;
  /** Button label in the split Run control. Default per language. */
  label?: string;
  /** Source language to emit. Default `'javascript'`. */
  target?: PrintLanguage;
  /** Downloaded file name. Default `graph.js` / `graph.ts`. */
  filename?: string;
  /** Return ONLY these value-store keys (`"nodeId:handleId"`) from `runGraph`
   *  instead of the whole `values` map. */
  returnValues?: string[];
  /** Assert implementations are pure, enabling dead-code elimination (drops nodes
   *  no returned value depends on). Default false. */
  assumePureImplementations?: boolean;
  /** Codegen metadata — node-type `emit` + dataType→TS type, keyed by id
   *  (Decision 6: not on the core `TypeOfNode`/`DataType`). */
  metadata?: CodegenMetadata;
  /** Opt-in codegen-v2 optimization passes (run over the generated AST). Default
   *  off — the export is a faithful, threaded `runGraph` unless enabled. */
  optimize?: { deadCode?: boolean };
  /** Opt-in: analyze `impls` so self-contained value-API nodes (reading inputs
   *  via the `readInput` intrinsic) AUTO-EMIT inline instead of threading. */
  analyzeImplementations?: boolean;
  /** Node-type id → implementation, for `analyzeImplementations`. */
  impls?: Readonly<Record<string, (...args: never[]) => unknown>>;
  /** Prettier-beautify the emitted source. Default true. */
  beautify?: boolean;
};

const languageDefaults = {
  javascript: {
    id: 'codegen-js',
    label: 'Export JS',
    filename: 'graph.js',
    mimeType: 'text/javascript',
  },
  typescript: {
    id: 'codegen-ts',
    label: 'Export TS',
    filename: 'graph.ts',
    mimeType: 'text/typescript',
  },
} as const;

/**
 * Build an `artifact` run target that compiles the graph to a STANDALONE,
 * dependency-free source module — nodes → implementation calls, loops → `for`,
 * switches → `if/else`, groups → nested scoped blocks — and downloads it. The
 * emitted `runGraph` takes the implementations as a parameter, so the target
 * needs none and consumes only the read-only `ArtifactRunContext`.
 *
 * `run` is kept GENERIC (fixed via `satisfies`, never a `: ArtifactRunTarget`
 * annotation) so the target stays assignable to any concrete graph's
 * `RunTarget<…>` (a non-generic context is contravariant and fails assignment)
 * and the generic signature inlines cleanly into dist/index.d.ts.
 */
function makeCodegenRunTarget(options: CodegenRunTargetOptions = {}) {
  const language: PrintLanguage = options.target ?? 'javascript';
  const defaults = languageDefaults[language];
  const id = options.id ?? defaults.id;
  const label = options.label ?? defaults.label;
  const filename = options.filename ?? defaults.filename;

  async function run<
    DataTypeUniqueId extends string = string,
    NodeTypeUniqueId extends string = string,
    UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
    ComplexSchemaType extends UnderlyingType extends 'complex'
      ? z.ZodType
      : never = never,
  >(
    context: ArtifactRunContext<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ): Promise<void> {
    // Route through the codegen-v2 entry point: string emit → opt-in AST passes
    // (auto-emit / dead-code elimination) → Prettier. With no opt-in options this
    // is the faithful threaded `runGraph`; `optimize`/`analyzeImplementations`
    // enable the "clean runGraph" the studio demonstrates.
    const source = await emitGraph<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >(context.executionPlan, context.state, {
      target: language,
      returnValues: options.returnValues,
      assumePureImplementations: options.assumePureImplementations,
      metadata: options.metadata,
      optimize: options.optimize,
      analyzeImplementations: options.analyzeImplementations,
      impls: options.impls,
      beautify: options.beautify,
    });
    downloadTextArtifact(filename, source, defaults.mimeType);
  }

  return {
    id,
    label,
    mode: 'artifact' as const,
    run,
  } satisfies ArtifactRunTarget;
}

/** Built-in JavaScript export target (trimmed, human-readable `runGraph`). */
const codegenJsRunTarget = makeCodegenRunTarget();

/** Built-in TypeScript export target — typed `runGraph` whose stored values are
 *  cast via the metadata registry's `CodegenMetadata.dataTypeToTsType`. */
const codegenTsRunTarget = makeCodegenRunTarget({ target: 'typescript' });

export { makeCodegenRunTarget, codegenJsRunTarget, codegenTsRunTarget };
export type { CodegenRunTargetOptions };
