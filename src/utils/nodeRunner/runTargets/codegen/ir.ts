// The codegen IR — a language-neutral structural representation produced by
// `lower.ts` and rendered by a per-language printer (`print/printJs.ts`). Stage A
// (behaviour-frozen refactor): standard nodes become a STRUCTURED `nodeCall`
// (so later passes can trim/compact them); control structures become generic
// `block`/`ifElse`/`raw` statements that map 1:1 onto `CodeWriter`, so the printer
// reproduces today's output byte-for-byte. Leaf value-expressions are JS strings
// in v1 (see plan §8.4 for the future structured-leaf upgrade).

/** A leaf JS expression fragment (already escaped) — e.g. `values["n:o"]`. */
type CgExpr = string;

type CgHandleMeta = {
  handleId: string;
  handleName: string;
  dataTypeId: string;
};

type CgInput = {
  /** Handle name — the impl's input Map key. */
  name: string;
  /** Upstream value expressions (fan-in ⇒ length > 1; default ⇒ empty). */
  connections: CgExpr[];
  isDefault: boolean;
  /** Present iff `isDefault`. */
  defaultExpr?: CgExpr;
  /** Always retained; the printer decides whether to emit it (trim vs full). */
  meta: CgHandleMeta;
};

type CgOutput = { name: string; meta: CgHandleMeta };

type CgStore = {
  outputName: string;
  /** The assignment target, e.g. `values["n:o"]`. */
  targetRef: CgExpr;
  dataTypeId: string;
};

type CgNodeCall = {
  kind: 'nodeCall';
  nodeId: string;
  nodeTypeId: string;
  nodeTypeName: string;
  /** The prebuilt `// node …` identity comment (incl. the custom name if any),
   *  built once in `lower.ts` so the call + inline + raw forms never drift. */
  comment: string;
  inputs: CgInput[];
  outputs: CgOutput[];
  stores: CgStore[];
  /** When set (source-emission, `emitImplementations: 'source'`), the node calls
   *  this LOCAL function name instead of `functionImplementations[nodeTypeId]`. */
  localCallName?: string;
};

/** A node rendered inline via its `emitCode` hook — one `<name> = <expr>` per
 *  output (declared `const` at top level, assigned to a hoisted `let` if nested). */
type CgInlineNode = {
  kind: 'inline';
  /** The `// node …` comment line. */
  comment: string;
  assignments: Array<{ targetRef: string; expr: CgExpr; dataTypeId: string }>;
};

type CgStmt =
  /** A literal line printed verbatim at the current indent (comments + glue). */
  | { kind: 'raw'; line: string }
  | CgNodeCall
  | CgInlineNode
  /** `open` line, indented `body`, `close` line — maps onto CodeWriter.block. */
  | { kind: 'block'; open: string; body: CgStmt[]; close: string }
  /** `if (condition) { thenBody } else { elseBody }` — maps onto CodeWriter.ifElse. */
  | {
      kind: 'ifElse';
      condition: string;
      thenBody: CgStmt[];
      elseBody: CgStmt[];
    };

type CgModule = {
  /** Header comment lines (incl. `// warning:` lines) emitted before runGraph. */
  headerLines: string[];
  /** The body of `runGraph` (the lowered plan levels). */
  body: CgStmt[];
  /** Append `export { runGraph };`. */
  exportRunGraph: boolean;
  /** scopedKey (original `nodeId:handleId`) → readable variable name, in
   *  registration order. Lets the printer remap the `return` back to the stable
   *  `nodeId:handleId` keys the value store / parity tests expect. */
  nameEntries: ReadonlyArray<{ scopedKey: string; name: string }>;
  /** Root Graph Input handles → `runGraph` PARAMETERS (in order). Downstream reads
   *  of these handles resolve to the param name (forced in the registry). Absent ⇒
   *  no declared graph inputs (compat: `functionImplementations`/`options`). */
  rootParams?: Array<{ name: string; dataTypeId: string }>;
  /** Root Graph Output handles → the `runGraph` RETURN object (keyed by handle
   *  name). Absent ⇒ compat keyed `nodeId:handleId` return. */
  rootReturn?: Array<{ outputName: string; expr: string }>;
  /** Loop-carry variable names — hoisted `let`s that hold internal loop state,
   *  NOT node outputs. Excluded from the compat keyed return. */
  loopCarryNames?: ReadonlyArray<string>;
  /** Source-emitted function defs (the `readInput` intrinsic + helpers + node
   *  impls), in dependency order — printed as `const <name> = <sourceText>;` inside
   *  `runGraph`. Present only under `emitImplementations: 'source'`.
   *
   *  (`fullyCovered` for the param-drop is derived by `emitGraph` from the emitted
   *  string's `functionImplementations["` opaque-call marker — sound vs author-emit
   *  fan-in fall-throughs — so no `hasOpaqueCall` IR flag is threaded through `emitJs`.) */
  emittedFunctions?: ReadonlyArray<{ name: string; sourceText: string }>;
};

export type {
  CgExpr,
  CgHandleMeta,
  CgInput,
  CgOutput,
  CgStore,
  CgNodeCall,
  CgInlineNode,
  CgStmt,
  CgModule,
};
