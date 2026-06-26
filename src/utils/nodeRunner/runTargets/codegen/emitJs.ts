import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
  ExecutionPlan,
  CodegenMetadata,
} from './contract';
import { lowerModule } from './lower';
import { dropDead } from './passes';
import { printSource } from './printJs';
import type { PrintLanguage } from './printJs';

type EmitJsOptions = {
  /** Append `export { runGraph };` (ESM module). Default true; pass false for an
   *  evaluable snippet (e.g. `new Function(src + '; return runGraph;')`). */
  exportRunGraph?: boolean;
  /** Target language. `'typescript'` emits a typed module whose stored values are
   *  cast via the metadata's `dataTypeToTsType`. Default `'javascript'`. */
  target?: PrintLanguage;
  /** When provided, `runGraph` returns ONLY these value-store keys
   *  (`"nodeId:handleId"`) instead of the whole `values` map. */
  returnValues?: string[];
  /** Assert implementations are side-effect free, enabling dead-code elimination
   *  (drops nodes no returned value depends on). Inert unless `returnValues`
   *  narrows the result. Default false. */
  assumePureImplementations?: boolean;
  /** Codegen metadata — node-type `emit` + dataType→TS type, keyed by id.
   *  Decision 6: supplied here, NOT on the core `TypeOfNode`/`DataType`. */
  metadata?: CodegenMetadata;
};

/**
 * Compile an `ExecutionPlan` (+ its `State`, for handle names / defaults /
 * loop-switch handle classification) into a STANDALONE, dependency-free,
 * human-readable JavaScript module:
 *
 * ```js
 * async function runGraph(functionImplementations, options = {}) { … }
 * ```
 *
 * Pure: string in → string out, no React / DOM / IO. Nodes become implementation
 * calls, loops become `for`, switches become `if/else`, and groups become nested
 * scoped blocks. See plan §17 for the full contract and v1 boundaries (value-API
 * fidelity, success-path parity, sequential concurrency, JSON-able defaults).
 */
function emitJs<
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
  options: EmitJsOptions = {},
): string {
  const language: PrintLanguage = options.target ?? 'javascript';
  // Data-type id → source type expression, for the TypeScript printer's store
  // casts. Sourced from the CodegenMetadata registry (Decision 6); only the TS
  // target emits casts, so JS resolves to undefined (≡ the prior behavior).
  const resolveType = (dataTypeId: string): string | undefined =>
    language === 'typescript'
      ? options.metadata?.dataTypeToTsType?.[dataTypeId]
      : undefined;

  // plan → codegen IR (lowerModule) → string (printSource). The IR seam lets the
  // passes (trim / compact) and the TypeScript printer plug in additively.
  let codegenModule = lowerModule<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >(plan, state, {
    exportRunGraph: options.exportRunGraph,
    language,
    nodeTypeMetadata: options.metadata?.nodeTypeMetadata,
  });
  // Opt-in DCE: drop pure nodes that no returned value depends on. Inert unless
  // the return is narrowed (otherwise every key is a live root). The IR is keyed
  // by readable names, so map the requested original keys to their names first.
  if (options.assumePureImplementations && options.returnValues) {
    const nameByKey = new Map(
      codegenModule.nameEntries.map((entry) => [entry.scopedKey, entry.name]),
    );
    const roots = new Set(
      options.returnValues
        .map((key) => nameByKey.get(key))
        .filter((name): name is string => name !== undefined),
    );
    codegenModule = dropDead(codegenModule, roots);
  }
  return printSource(codegenModule, {
    language,
    resolveType,
    returnValues: options.returnValues,
  });
}

export { emitJs };
export type { EmitJsOptions };
