// Dead-code elimination pass (Masterplan §22-23) — a `ts` AST transform over the
// GENERATED `runGraph` module. Opt-in. Removes bindings/blocks whose values no
// returned value transitively depends on, then cleans the signature (drops
// unreferenced parameters and the `async` keyword when no `await` survives).
//
// Soundness: this runs over OUR OWN generated code, whose shape is constrained
// (block-scoped const/let, generated prelude functions, loop/switch/group blocks,
// one return). Pruning an impl-call binding (or a block whose only effect is
// producing now-dead values) assumes node implementations are side-effect free —
// hence `assumePureImplementations`. Inline (pure-expression) bindings prune
// regardless. Run-signature params that remain referenced are preserved.

// The TypeScript Compiler API namespace, passed in by the caller (lazy-loaded via
// `tsLoader`). Typed locally so this AST-pass module stays within the codegen
// extraction boundary (no parent imports).
type TsModule = typeof import('typescript');

type DeadCodeOptions = {
  /** Treat node implementations as side-effect free, so dead impl-call bindings
   *  and loop/switch/group blocks producing only dead values can be dropped.
   *  Without it, any statement containing an impl call is kept (it may have
   *  side effects); pure inline-expression bindings still prune. */
  assumePureImplementations?: boolean;
};

/** A scope-introducing node whose own declarations shadow the outer scope. */
function introducesScope(
  ts: TsModule,
  node: import('typescript').Node,
): boolean {
  return (
    ts.isBlock(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isCatchClause(node)
  );
}

/** Collect names DECLARED directly within `node`'s own scope (const/let/function/
 *  parameter/catch binding), not recursing into deeper nested scopes. */
function collectDeclaredNames(
  ts: TsModule,
  node: import('typescript').Node,
  into: Set<string>,
): void {
  const visit = (current: import('typescript').Node): void => {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      into.add(current.name.text);
    } else if (ts.isFunctionDeclaration(current) && current.name) {
      into.add(current.name.text);
    } else if (ts.isParameter(current) && ts.isIdentifier(current.name)) {
      into.add(current.name.text);
    }
    // Do not descend into a NESTED scope — it owns its declarations.
    if (current !== node && introducesScope(ts, current)) return;
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
}

/** Identifiers referenced FREELY within `node` (not bound by `bound` or by any
 *  scope nested inside `node`). Property names and non-computed object keys are
 *  not references. */
function collectFreeIdentifiers(
  ts: TsModule,
  node: import('typescript').Node,
  bound: ReadonlySet<string>,
): Set<string> {
  const free = new Set<string>();
  const visit = (
    current: import('typescript').Node,
    scope: ReadonlySet<string>,
  ): void => {
    if (current !== node && introducesScope(ts, current)) {
      const child = new Set(scope);
      collectDeclaredNames(ts, current, child);
      ts.forEachChild(current, (c) => visit(c, child));
      return;
    }
    if (ts.isIdentifier(current)) {
      if (!scope.has(current.text)) free.add(current.text);
      return;
    }
    if (ts.isPropertyAccessExpression(current)) {
      visit(current.expression, scope); // `.name` is not a reference
      return;
    }
    if (
      ts.isPropertyAssignment(current) &&
      !ts.isComputedPropertyName(current.name)
    ) {
      visit(current.initializer, scope); // the key is not a reference
      return;
    }
    ts.forEachChild(current, (c) => visit(c, scope));
  };
  visit(node, bound);
  return free;
}

/** Whether `node` contains an `await` expression (in its own scope; nested
 *  functions have their own async-ness and don't count). */
function containsAwait(ts: TsModule, node: import('typescript').Node): boolean {
  let found = false;
  const visit = (current: import('typescript').Node): void => {
    if (found) return;
    if (ts.isAwaitExpression(current)) {
      found = true;
      return;
    }
    if (
      current !== node &&
      (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current))
    ) {
      return; // nested function boundary
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

/** Whether `node` references the threaded `functionImplementations` parameter
 *  (⇒ an impl call; only side-effect-free under `assumePureImplementations`). */
function callsImplementations(
  ts: TsModule,
  node: import('typescript').Node,
): boolean {
  return collectFreeIdentifiers(ts, node, new Set()).has(
    'functionImplementations',
  );
}

type StatementInfo = {
  index: number;
  statement: import('typescript').Statement;
  defs: Set<string>;
  uses: Set<string>;
  /** Always-live: a side effect we cannot prove away (kept regardless of defs). */
  sideEffect: boolean;
  hasAwait: boolean;
  isReturn: boolean;
};

/** Classify one `runGraph`-body statement into its defs / uses / side-effect. */
function classifyStatement(
  ts: TsModule,
  statement: import('typescript').Statement,
  index: number,
  assumePure: boolean,
): StatementInfo {
  const defs = new Set<string>();
  const uses = new Set<string>();
  let sideEffect = false;
  const isReturn = ts.isReturnStatement(statement);
  const hasAwait = containsAwait(ts, statement);

  if (ts.isFunctionDeclaration(statement) && statement.name) {
    defs.add(statement.name.text);
    collectFreeIdentifiers(
      ts,
      statement,
      new Set([statement.name.text]),
    ).forEach((u) => uses.add(u));
  } else if (ts.isVariableStatement(statement)) {
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) defs.add(decl.name.text);
      if (decl.initializer) {
        collectFreeIdentifiers(ts, decl.initializer, new Set()).forEach((u) =>
          uses.add(u),
        );
      }
    }
    // A binding initialized from an impl call is a side effect unless pure.
    if (!assumePure && callsImplementations(ts, statement)) sideEffect = true;
  } else if (ts.isBlock(statement)) {
    // Loop / switch / group block: names ASSIGNED to the outer scope are defs;
    // free reads are uses; an impl call inside is a side effect unless pure.
    const localNames = new Set<string>();
    collectDeclaredNames(ts, statement, localNames);
    const collectAssignTargets = (n: import('typescript').Node): void => {
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(n.left) &&
        !localNames.has(n.left.text)
      ) {
        defs.add(n.left.text);
      }
      ts.forEachChild(n, collectAssignTargets);
    };
    collectAssignTargets(statement);
    collectFreeIdentifiers(ts, statement, new Set()).forEach((u) => {
      if (!defs.has(u)) uses.add(u);
    });
    if (!assumePure && callsImplementations(ts, statement)) sideEffect = true;
  } else if (isReturn) {
    const returnStatement = statement as import('typescript').ReturnStatement;
    if (returnStatement.expression) {
      collectFreeIdentifiers(ts, returnStatement.expression, new Set()).forEach(
        (u) => uses.add(u),
      );
    }
  } else {
    // Unknown statement (expression statement, etc.) — conservatively a side effect.
    sideEffect = true;
    collectFreeIdentifiers(ts, statement, new Set()).forEach((u) =>
      uses.add(u),
    );
  }

  return { index, statement, defs, uses, sideEffect, hasAwait, isReturn };
}

function eliminateDeadCode(
  ts: TsModule,
  source: string,
  options: DeadCodeOptions = {},
): string {
  const assumePure = options.assumePureImplementations ?? false;
  const sourceFile = ts.createSourceFile(
    'runGraph.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const runGraph = sourceFile.statements.find(ts.isFunctionDeclaration);
  if (!runGraph || !runGraph.body) return source;

  const bodyStatements = runGraph.body.statements;
  const items = bodyStatements.map((statement, index) =>
    classifyStatement(ts, statement, index, assumePure),
  );

  // Liveness fixpoint: live statements seed from the return + side effects; a
  // variable is live when used by a live statement; a statement is live when it
  // defines a live variable.
  const liveStatements = new Set<number>(
    items
      .filter((info) => info.isReturn || info.sideEffect)
      .map((i) => i.index),
  );
  const liveVars = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const info of items) {
      if (!liveStatements.has(info.index)) continue;
      for (const use of info.uses) {
        if (!liveVars.has(use)) {
          liveVars.add(use);
          changed = true;
        }
      }
    }
    for (const info of items) {
      if (liveStatements.has(info.index)) continue;
      for (const def of info.defs) {
        if (liveVars.has(def)) {
          liveStatements.add(info.index);
          changed = true;
          break;
        }
      }
    }
  }

  const kept = items.filter((info) => liveStatements.has(info.index));
  const keptStatements = kept.map((info) => info.statement);

  // Parameter cleanup: keep a parameter only if a surviving statement references it.
  const referencedByKept = new Set<string>();
  for (const info of kept) info.uses.forEach((u) => referencedByKept.add(u));
  const keptParameters = runGraph.parameters.filter((parameter) =>
    referencedByKept.has(parameter.name.getText(sourceFile)),
  );

  // async cleanup: drop `async` when no surviving statement awaits.
  const stillAsync = kept.some((info) => info.hasAwait);
  const factory = ts.factory;
  const rebuilt = factory.createFunctionDeclaration(
    stillAsync
      ? [factory.createModifier(ts.SyntaxKind.AsyncKeyword)]
      : undefined,
    undefined,
    runGraph.name,
    undefined,
    keptParameters,
    undefined,
    factory.createBlock(keptStatements, true),
  );

  // Re-emit the whole module: the rebuilt runGraph replaces the original, other
  // top-level statements (header comments live as leading trivia; `export {…}`)
  // are preserved.
  const transformer =
    (context: import('typescript').TransformationContext) =>
    (file: import('typescript').SourceFile) => {
      const visit = (
        node: import('typescript').Node,
      ): import('typescript').Node =>
        ts.isFunctionDeclaration(node) && node === runGraph
          ? rebuilt
          : ts.visitEachChild(node, visit, context);
      return ts.visitNode(file, visit) as import('typescript').SourceFile;
    };
  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed = printer.printFile(
    result.transformed[0] as import('typescript').SourceFile,
  );
  result.dispose();
  return printed;
}

export { eliminateDeadCode };
export type { DeadCodeOptions };
