import { CodeWriter } from './codeWriter';
import type {
  CgHandleMeta,
  CgInlineNode,
  CgInput,
  CgModule,
  CgNodeCall,
  CgStmt,
} from './ir';

type PrintLanguage = 'javascript' | 'typescript';

type PrintOptions = {
  /** Emit full handle metadata + inline literals (the Stage A legacy form).
   *  Default false → value-API-trimmed + prelude helpers (cleaner). */
  fullMetadata?: boolean;
  /** Target language. `'typescript'` adds a typed signature, typed `values`,
   *  typed prelude helpers, and per-store `as <type>` casts. Default JS. */
  language?: PrintLanguage;
  /** TypeScript only: a data-type id → source type expression (e.g. `'number'`).
   *  Returns undefined ⇒ the store is cast to `unknown`. */
  resolveType?: (dataTypeId: string) => string | undefined;
  /** When provided, `runGraph` returns ONLY these value-store keys (a narrowed
   *  `{ "k": values["k"], … }` object) instead of the whole `values` map. */
  returnValues?: string[];
};

type PrintContext = {
  fullMetadata: boolean;
  usePrelude: boolean;
  language: PrintLanguage;
  resolveType: (dataTypeId: string) => string | undefined;
};

// ─────────────────────────────────────────────────────
// Full-metadata form (Stage A — byte-identical to the original emitter)
// ─────────────────────────────────────────────────────

function handleMetaFields(meta: CgHandleMeta): string {
  return `handleId: ${JSON.stringify(meta.handleId)}, handleName: ${JSON.stringify(meta.handleName)}, dataTypeId: ${JSON.stringify(meta.dataTypeId)}`;
}

/** How a node call reaches its implementation: a source-emitted LOCAL function
 *  name (`emitImplementations: 'source'`), else the threaded
 *  `functionImplementations[nodeTypeId]` lookup (the default). */
function implCallTarget(node: CgNodeCall): string {
  return (
    node.localCallName ??
    `functionImplementations[${JSON.stringify(node.nodeTypeId)}]`
  );
}

function printNodeCallFull(
  node: CgNodeCall,
  writer: CodeWriter,
  context: PrintContext,
): void {
  writer.line(node.comment);
  writer.block('{', () => {
    writer.line('const inputs = new Map();');
    for (const input of node.inputs) {
      const meta = handleMetaFields(input.meta);
      if (!input.isDefault) {
        const connections = input.connections
          .map((expr) => `{ value: ${expr} }`)
          .join(', ');
        writer.line(
          `inputs.set(${JSON.stringify(input.name)}, { connections: [${connections}], ${meta}, isDefault: false });`,
        );
      } else {
        writer.line(
          `inputs.set(${JSON.stringify(input.name)}, { connections: [], ${meta}, isDefault: true, defaultValue: ${input.defaultExpr} });`,
        );
      }
    }
    writer.line('const outputs = new Map();');
    for (const output of node.outputs) {
      writer.line(
        `outputs.set(${JSON.stringify(output.name)}, { ${handleMetaFields(output.meta)} });`,
      );
    }
    writer.line(
      `const context = { nodeId: ${JSON.stringify(node.nodeId)}, nodeTypeId: ${JSON.stringify(node.nodeTypeId)}, nodeTypeName: ${JSON.stringify(node.nodeTypeName)}, abortSignal };`,
    );
    writer.line(
      `const out = await ${implCallTarget(node)}(inputs, outputs, context);`,
    );
    printStores(node, writer, context);
  });
}

// ─────────────────────────────────────────────────────
// Trimmed + prelude form (default — value-API only, compact call)
// ─────────────────────────────────────────────────────

/** The value passed for one input handle — `makeInput([refs], isDefault, default?)`. */
function inputValueExpr(input: CgInput): string {
  const connections = `[${input.connections.join(', ')}]`;
  return input.isDefault
    ? `makeInput([], true, ${input.defaultExpr})`
    : `makeInput(${connections}, false)`;
}

/** The whole inputs Map as a single expression: `new Map([[name, __in(...)], …])`. */
function inputsMapExpr(node: CgNodeCall): string {
  if (node.inputs.length === 0) return 'new Map()';
  const entries = node.inputs
    .map((input) => `[${JSON.stringify(input.name)}, ${inputValueExpr(input)}]`)
    .join(', ');
  return `new Map([${entries}])`;
}

function printNodeCallTrimmed(
  node: CgNodeCall,
  writer: CodeWriter,
  context: PrintContext,
  topLevel: boolean,
): void {
  writer.line(node.comment);
  const outputsExpr = `makeOutputs([${node.outputs.map((o) => JSON.stringify(o.name)).join(', ')}])`;
  const ctxExpr = `makeContext(${JSON.stringify(node.nodeId)}, ${JSON.stringify(node.nodeTypeId)}, ${JSON.stringify(node.nodeTypeName)})`;
  const callExpr = `await ${implCallTarget(node)}(${inputsMapExpr(node)}, ${outputsExpr}, ${ctxExpr})`;

  // A top-level single-output node declares its value inline; the store guard is
  // redundant here (the variable is written once — an absent key yields the same
  // `undefined`), and `toEqual` ignores undefined keys.
  if (topLevel && node.stores.length === 1) {
    const store = node.stores[0];
    const cast =
      context.language === 'typescript'
        ? ` as ${context.resolveType(store.dataTypeId) ?? 'unknown'}`
        : '';
    writer.line(
      `const ${store.targetRef} = (${callExpr}).get(${JSON.stringify(store.outputName)})${cast};`,
    );
    return;
  }

  // Multi-output or nested: a guarded block assigning the (hoisted) variables.
  writer.block('{', () => {
    writer.line(`const out = ${callExpr};`);
    printStores(node, writer, context);
  });
}

/** Guarded output stores — kept in every form (a non-Map / partial-Map return
 *  must not throw or mis-store; value-identical to the executor). In TypeScript
 *  the stored value is cast to its data type (or `unknown`). */
function printStores(
  node: CgNodeCall,
  writer: CodeWriter,
  context: PrintContext,
): void {
  for (const store of node.stores) {
    const get = `out.get(${JSON.stringify(store.outputName)})`;
    const valueExpr =
      context.language === 'typescript'
        ? `${get} as ${context.resolveType(store.dataTypeId) ?? 'unknown'}`
        : get;
    writer.line(
      `if (out instanceof Map && out.has(${JSON.stringify(store.outputName)})) ${store.targetRef} = ${valueExpr};`,
    );
  }
}

/** A node rendered via its `emitCode` hook: `const name = expr;` at top level, or
 *  a bare assignment to a hoisted `let` when nested. The expression is the
 *  consumer's own (already-typed) code, so no cast is added. */
function printInlineNode(
  node: CgInlineNode,
  writer: CodeWriter,
  topLevel: boolean,
): void {
  writer.line(node.comment);
  for (const assignment of node.assignments) {
    writer.line(
      topLevel
        ? `const ${assignment.targetRef} = ${assignment.expr};`
        : `${assignment.targetRef} = ${assignment.expr};`,
    );
  }
}

// ─────────────────────────────────────────────────────
// Statement dispatch
// ─────────────────────────────────────────────────────

function printStmt(
  stmt: CgStmt,
  writer: CodeWriter,
  context: PrintContext,
  topLevel: boolean,
): void {
  switch (stmt.kind) {
    case 'raw':
      writer.line(stmt.line);
      return;
    case 'nodeCall':
      if (context.fullMetadata) printNodeCallFull(stmt, writer, context);
      else printNodeCallTrimmed(stmt, writer, context, topLevel);
      return;
    case 'inline':
      printInlineNode(stmt, writer, topLevel);
      return;
    case 'block':
      writer.block(
        stmt.open,
        () => {
          for (const child of stmt.body)
            printStmt(child, writer, context, false);
        },
        stmt.close,
      );
      return;
    case 'ifElse':
      writer.ifElse(
        stmt.condition,
        () => {
          for (const child of stmt.thenBody)
            printStmt(child, writer, context, false);
        },
        () => {
          for (const child of stmt.elseBody)
            printStmt(child, writer, context, false);
        },
      );
      return;
  }
}

function countNodeCalls(stmts: ReadonlyArray<CgStmt>): number {
  let count = 0;
  for (const stmt of stmts) {
    if (stmt.kind === 'nodeCall') count += 1;
    else if (stmt.kind === 'block') count += countNodeCalls(stmt.body);
    else if (stmt.kind === 'ifElse')
      count += countNodeCalls(stmt.thenBody) + countNodeCalls(stmt.elseBody);
  }
  return count;
}

// ─────────────────────────────────────────────────────
// Module
// ─────────────────────────────────────────────────────

/** The named value-API helpers, declared once — at module level in function style,
 *  or inside `runGraph` in inline style. They close over the in-scope `abortSignal`. */
function writeHelpers(writer: CodeWriter, ts: boolean): void {
  writer.block(
    ts
      ? 'function makeInput(values: unknown[], isDefault: boolean, defaultValue?: unknown) {'
      : 'function makeInput(values, isDefault, defaultValue) {',
    () => {
      writer.line(
        'return { connections: values.map((value) => ({ value })), isDefault, defaultValue };',
      );
    },
  );
  writer.block(
    ts
      ? 'function makeOutputs(names: string[]) {'
      : 'function makeOutputs(names) {',
    () => {
      writer.line(
        ts
          ? 'return new Map<string, Record<string, unknown>>(names.map((name) => [name, {}]));'
          : 'return new Map(names.map((name) => [name, {}]));',
      );
    },
  );
  writer.block(
    ts
      ? 'function makeContext(nodeId: string, nodeTypeId: string, nodeTypeName: string) {'
      : 'function makeContext(nodeId, nodeTypeId, nodeTypeName) {',
    () => {
      writer.line('return { nodeId, nodeTypeId, nodeTypeName, abortSignal };');
    },
  );
}

/**
 * Render the codegen IR module to a standalone source string. JavaScript by
 * default (value-API-trimmed + `__in/__outs/__ctx` prelude + compact node calls,
 * the store guard always kept). `language: 'typescript'` adds a typed signature,
 * typed `values`, typed prelude, and per-store `as <type>` casts from
 * `CodegenMetadata.dataTypeToTsType`. `fullMetadata: true` reproduces the legacy
 * form.
 */
function printSource(module: CgModule, options: PrintOptions = {}): string {
  const fullMetadata = options.fullMetadata ?? false;
  const language = options.language ?? 'javascript';
  const ts = language === 'typescript';
  const usePrelude = !fullMetadata && countNodeCalls(module.body) >= 1;
  const context: PrintContext = {
    fullMetadata,
    usePrelude,
    language,
    resolveType: options.resolveType ?? (() => undefined),
  };

  // A top-level single-output node declares its value inline (`const name = …`);
  // every other value is a hoisted `let`. These two sets partition all names.
  const inlineConstNames = new Set<string>();
  for (const stmt of module.body) {
    if (stmt.kind === 'inline') {
      for (const assignment of stmt.assignments) {
        inlineConstNames.add(assignment.targetRef);
      }
    } else if (
      !fullMetadata &&
      stmt.kind === 'nodeCall' &&
      stmt.stores.length === 1
    ) {
      inlineConstNames.add(stmt.stores[0].targetRef);
    }
  }
  // Root Graph Input handles are PARAMETERS, not hoisted locals — exclude them
  // (their registry entries exist so downstream reads resolve to the param name).
  const rootParamNames = new Set((module.rootParams ?? []).map((p) => p.name));
  const hoistedNames = module.nameEntries
    .map((entry) => entry.name)
    .filter((name) => !inlineConstNames.has(name) && !rootParamNames.has(name));

  const writer = new CodeWriter();
  for (const line of module.headerLines) writer.line(line);
  if (ts) {
    writer.line('');
    writer.line(
      'type NodeImplementation = (inputs: Map<string, unknown>, outputs: Map<string, unknown>, context: { nodeId: string; nodeTypeId: string; nodeTypeName: string; abortSignal?: AbortSignal }) => Map<string, unknown> | Promise<Map<string, unknown>>;',
    );
  }
  writer.line('');

  // Signature: the FUNCTION MODEL (root Graph Input present) emits the graph's
  // input handles as parameters, dropping `functionImplementations` / `options`
  // and the `async` keyword when nothing actually needs them (an all-`emitCode`
  // graph → a clean `function runGraph(a, b)`). Otherwise the compat signature is
  // kept.
  const hasRootParams = module.rootParams !== undefined;
  const hasRootReturn = module.rootReturn !== undefined;
  const needsImpls = countNodeCalls(module.body) > 0;

  let signature: string;
  let emitAbortSignalLocal: boolean;
  if (!hasRootParams) {
    signature = ts
      ? 'async function runGraph(functionImplementations: Record<string, NodeImplementation>, options: { abortSignal?: AbortSignal } = {}): Promise<Record<string, unknown>> {'
      : 'async function runGraph(functionImplementations, options = {}) {';
    emitAbortSignalLocal = true;
  } else {
    const params: string[] = [];
    if (needsImpls) {
      params.push(
        ts
          ? 'functionImplementations: Record<string, NodeImplementation>'
          : 'functionImplementations',
      );
    }
    for (const param of module.rootParams ?? []) {
      params.push(
        ts
          ? `${param.name}: ${context.resolveType(param.dataTypeId) ?? 'unknown'}`
          : param.name,
      );
    }
    if (needsImpls) {
      params.push(
        ts ? 'options: { abortSignal?: AbortSignal } = {}' : 'options = {}',
      );
    }
    signature = `${needsImpls ? 'async ' : ''}function runGraph(${params.join(', ')}) {`;
    emitAbortSignalLocal = needsImpls;
  }

  writer.block(signature, () => {
    if (emitAbortSignalLocal) {
      writer.line(
        ts
          ? 'const abortSignal: AbortSignal | undefined = options.abortSignal;'
          : 'const abortSignal = options.abortSignal;',
      );
    }
    if (hoistedNames.length > 0) writer.line(`let ${hoistedNames.join(', ')};`);
    // Source-emitted defs depend on the prelude (makeInput/makeContext), so the
    // two share one gate (a source-emitted node is still a nodeCall, so today
    // `usePrelude` already holds — the `||` keeps them coupled if that changes).
    const emittedFunctions = module.emittedFunctions ?? [];
    if (usePrelude || emittedFunctions.length > 0) writeHelpers(writer, ts);
    for (const emitted of emittedFunctions) {
      writer.line(`const ${emitted.name} = ${emitted.sourceText};`);
    }
    writer.line('');
    for (const stmt of module.body) printStmt(stmt, writer, context, true);
    writer.line('');
    if (hasRootReturn) {
      // Function model: return the Graph Output handles, keyed by name.
      const entries = (module.rootReturn ?? [])
        .map((entry) => `${JSON.stringify(entry.outputName)}: ${entry.expr}`)
        .join(', ');
      writer.line(entries ? `return { ${entries} };` : 'return {};');
    } else {
      // Compat: remap the return to the stable original `nodeId:handleId` keys.
      // Loop-carry variables are internal state, never node outputs — exclude them.
      const nameByKey = new Map(
        module.nameEntries.map((entry) => [entry.scopedKey, entry.name]),
      );
      const carryNames = new Set(module.loopCarryNames ?? []);
      const returnKeys =
        options.returnValues ??
        module.nameEntries.map((entry) => entry.scopedKey);
      const entries = returnKeys
        .map((key) => {
          const name = nameByKey.get(key);
          return name === undefined || carryNames.has(name)
            ? null
            : `${JSON.stringify(key)}: ${name}`;
        })
        .filter((entry): entry is string => entry !== null)
        .join(', ');
      writer.line(entries ? `return { ${entries} };` : 'return {};');
    }
  });

  if (module.exportRunGraph) {
    writer.line('');
    writer.line('export { runGraph };');
  }
  return writer.toString();
}

export { printSource };
export type { PrintOptions, PrintLanguage };
