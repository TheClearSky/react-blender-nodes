// Auto-emit (codegen-v2 Stage 3 / Masterplan §8-9, §5.4) — derive inline `emit`
// hooks from self-contained value-API implementations, so a node type that reads
// its inputs through the recognized `readInput` intrinsic and returns a pure
// `new Map([[name, expr]])` inlines as an expression INSTEAD of threading.
//
// Recognition reads `impl.toString()`. A node type is auto-emittable only when:
//   • the impl is `(inputs) => new Map([[<lit>, <pureExpr>], …])` (arrow or
//     function form, single return),
//   • every value expr is pure + SELF-CONTAINED — its only free identifiers are
//     the input param, the `readInput` intrinsic, and known globals,
//   • inputs are read as `readInput(<param>, "<handleName>")[0]` (first connection)
//     or as the whole `readInput(<param>, "<handleName>")` (all fan-in connections).
// The [0] read maps to the input's first-connection expression; the whole read maps
// to the array-literal of all its connections (`inputsAll`), so a fan-in input
// inlines instead of threading. A derived hook is fan-in-safe by construction (it
// mirrors exactly how the impl reads each input).
// Anything else (free helper var, async/await/this, fan-in `[k>0]`, dynamic handle
// name) → NOT recognized → the node threads (safe floor).

type TsModule = typeof import('typescript');

/** The emit-hook shape codegen calls during lowering (mirrors `NodeCodegenMetadata`
 *  ›`emit`). THROWS when a read can't be scalarized — `lower` catches that and
 *  falls back to threading (the safe floor). */
type DerivedEmit = (context: {
  inputs: Readonly<Record<string, string>>;
  inputsAll: Readonly<Record<string, string>>;
  outputs: ReadonlyArray<string>;
  nodeId: string;
  language: 'javascript' | 'typescript';
}) => Readonly<Record<string, string>>;

// Identifiers that are always safe as free references inside a self-contained impl.
const KNOWN_GLOBALS = new Set([
  'Boolean',
  'Number',
  'String',
  'Math',
  'JSON',
  'Array',
  'Object',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'undefined',
  'NaN',
  'Infinity',
]);

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
 *  parameter binding), not recursing into deeper nested scopes. */
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
    if (current !== node && introducesScope(ts, current)) return;
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
}

/** Free identifiers in `node` not bound by `bound` (or by any scope nested inside
 *  `node`) and not a property/key name. Scope-aware: a nested function/arrow's own
 *  parameters and locals shadow the outer scope, so they are NOT counted free. */
function freeIdentifiers(
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
      visit(current.expression, scope); // `.name` is not a free reference
      return;
    }
    if (
      ts.isPropertyAssignment(current) &&
      !ts.isComputedPropertyName(current.name)
    ) {
      visit(current.initializer, scope);
      return;
    }
    ts.forEachChild(current, (c) => visit(c, scope));
  };
  visit(node, bound);
  return free;
}

/** Extract the `(param) => <body-expr>` of an arrow/function impl, or null. */
function implReturnExpression(
  ts: TsModule,
  fn: import('typescript').Expression,
): { paramName: string; returned: import('typescript').Expression } | null {
  const params =
    ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)
      ? fn.parameters
      : null;
  if (!params || params.length !== 1) return null;
  const param = params[0];
  if (!ts.isIdentifier(param.name)) return null;
  const paramName = param.name.text;

  let returned: import('typescript').Expression | undefined;
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) {
    returned = fn.body;
  } else {
    const body =
      ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)
        ? (fn.body as import('typescript').Block | undefined)
        : undefined;
    if (!body || body.statements.length !== 1) return null;
    const only = body.statements[0];
    if (!ts.isReturnStatement(only) || !only.expression) return null;
    returned = only.expression;
  }
  return returned ? { paramName, returned } : null;
}

/** Parse `new Map([["Out", expr], …])` into `[handleName, valueExpr]` pairs. */
function mapEntries(
  ts: TsModule,
  expr: import('typescript').Expression,
): Array<{ outName: string; value: import('typescript').Expression }> | null {
  if (
    !ts.isNewExpression(expr) ||
    !ts.isIdentifier(expr.expression) ||
    expr.expression.text !== 'Map' ||
    !expr.arguments ||
    expr.arguments.length !== 1
  ) {
    return null;
  }
  const arrayArg = expr.arguments[0];
  if (!ts.isArrayLiteralExpression(arrayArg)) return null;
  const entries: Array<{
    outName: string;
    value: import('typescript').Expression;
  }> = [];
  for (const element of arrayArg.elements) {
    if (
      !ts.isArrayLiteralExpression(element) ||
      element.elements.length !== 2
    ) {
      return null;
    }
    const [key, value] = element.elements;
    if (!ts.isStringLiteralLike(key)) return null;
    entries.push({ outName: key.text, value });
  }
  return entries;
}

/** Unwrap parens + comma-sequence (esbuild/Vite `(0, ns.readInput)`) to the base
 *  callee expression. */
function baseCallee(
  ts: TsModule,
  node: import('typescript').Expression,
): import('typescript').Expression {
  let current = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.CommaToken
    ) {
      current = current.right;
      continue;
    }
    return current;
  }
}

/** If `node` is `<paramName>`-rooted `readInput(<paramName>, "X")[0]` (any callee
 *  form whose name is `readInput`), return the handle name `X`; else null. The
 *  FIRST argument must be the impl's own input param — a `readInput` reading from
 *  any other (captured) map is NOT self-contained, and this check must run BEFORE
 *  the subtree is swapped for a placeholder (which would erase the offending
 *  identifier from the later free-identifier check). */
function readInputFirstHandle(
  ts: TsModule,
  node: import('typescript').Node,
  paramName: string,
): string | null {
  if (
    !ts.isElementAccessExpression(node) ||
    !ts.isNumericLiteral(node.argumentExpression) ||
    node.argumentExpression.text !== '0' ||
    !ts.isCallExpression(node.expression)
  ) {
    return null;
  }
  const call = node.expression;
  const callee = baseCallee(ts, call.expression);
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;
  if (
    name !== 'readInput' ||
    call.arguments.length !== 2 ||
    !ts.isStringLiteralLike(call.arguments[1]) ||
    !ts.isIdentifier(call.arguments[0]) ||
    call.arguments[0].text !== paramName
  ) {
    return null;
  }
  return call.arguments[1].text;
}

/** If `node` is the WHOLE `readInput(<paramName>, "X")` call (NOT wrapped in a
 *  `[0]` element access — that is matched by `readInputFirstHandle` first), return
 *  the handle name `X`; else null. This is the fan-in / all-connections read: it
 *  maps to the input's array-literal expression (`inputsAll`). Same first-arg
 *  guard as the scalar matcher — a `readInput` over any other (captured) map is
 *  NOT self-contained. */
function readInputWholeHandle(
  ts: TsModule,
  node: import('typescript').Node,
  paramName: string,
): string | null {
  if (!ts.isCallExpression(node)) {
    return null;
  }
  const callee = baseCallee(ts, node.expression);
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;
  if (
    name !== 'readInput' ||
    node.arguments.length !== 2 ||
    !ts.isStringLiteralLike(node.arguments[1]) ||
    !ts.isIdentifier(node.arguments[0]) ||
    node.arguments[0].text !== paramName
  ) {
    return null;
  }
  return node.arguments[1].text;
}

/** Does the subtree still reference `readInput` anywhere (identifier or
 *  `.readInput` property)? Used to reject UNHANDLED reads (`[k>0]`, dynamic index)
 *  that survive after the `[0]` and whole-array substitutions. */
function referencesReadInput(
  ts: TsModule,
  node: import('typescript').Node,
): boolean {
  let found = false;
  const visit = (current: import('typescript').Node): void => {
    if (found) return;
    if (
      (ts.isIdentifier(current) && current.text === 'readInput') ||
      (ts.isPropertyAccessExpression(current) &&
        current.name.text === 'readInput')
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

// Two placeholder kinds sharing one handle-index table: FIRST → the input's
// first-connection expression (`inputs[handle]`), ALL → its array-literal of all
// fan-in connections (`inputsAll[handle]`). Both are identifier-safe.
const PLACEHOLDER_FIRST = '__rbnReadInputFirst__';
const PLACEHOLDER_ALL = '__rbnReadInputAll__';

/**
 * Try to derive an inline `emit` hook from a value-API implementation. Returns
 * the hook, or null when the impl is not safely auto-emittable (caller threads).
 *
 * Robust to transpilation: inputs read as `readInput(inputs, "X")[0]` are matched
 * by AST shape (including Vite/esbuild's `(0, ns.readInput)(…)` interop form) and
 * replaced with placeholders, so the import-namespace variable does not count as
 * a free identifier in the self-containment check.
 */
function deriveAutoEmit(
  ts: TsModule,
  implementation: (...args: never[]) => unknown,
): DerivedEmit | null {
  let parsed: import('typescript').Expression;
  try {
    const source = implementation.toString();
    const file = ts.createSourceFile(
      'impl.ts',
      `const __impl__ = (${source});`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const statement = file.statements[0];
    if (!ts.isVariableStatement(statement)) return null;
    const initializer = statement.declarationList.declarations[0]?.initializer;
    if (!initializer) return null;
    parsed = ts.isParenthesizedExpression(initializer)
      ? initializer.expression
      : initializer;
  } catch {
    return null;
  }

  const head = implReturnExpression(ts, parsed);
  if (!head) return null;
  const { paramName, returned } = head;

  const entries = mapEntries(ts, returned);
  if (!entries || entries.length === 0) return null;

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed: Array<{ outName: string; exprText: string }> = [];

  // Handle names are user-authored and may contain spaces / non-identifier
  // characters, so map each handle NAME to a stable numeric index and embed only
  // the index in the (always identifier-safe) placeholder. The emitted hook
  // recovers the name from this table — never from the placeholder text.
  const handleByIndex: string[] = [];
  const indexForHandle = new Map<string, number>();
  const placeholderIndex = (handle: string): number => {
    let index = indexForHandle.get(handle);
    if (index === undefined) {
      index = handleByIndex.length;
      handleByIndex.push(handle);
      indexForHandle.set(handle, index);
    }
    return index;
  };

  for (const { outName, value } of entries) {
    // Replace each `readInput(<param>, "X")[0]` with an index placeholder, BUT only
    // when `paramName` still refers to the impl's own input map. A nested
    // function/arrow that re-binds an identically-named parameter SHADOWS it — a
    // `readInput(<shadow>, …)` inside is NOT this node's input read, so leave it in
    // place. The surviving `readInput` then trips `referencesReadInput` below and
    // the whole impl threads (the safe floor) — mirroring `deadCode.ts`'s scope
    // model (it has no binder symbols, so scope is tracked by hand).
    const result = ts.transform(value, [
      (context: import('typescript').TransformationContext) =>
        (node: import('typescript').Node) => {
          const visit = (
            current: import('typescript').Node,
            paramShadowed: boolean,
          ): import('typescript').Node => {
            if (!paramShadowed) {
              // Check the `[0]` element-access form FIRST: it wraps the inner
              // `readInput(...)` call, and matching it replaces the whole node so
              // the inner call is never separately matched as a whole-read.
              const firstHandle = readInputFirstHandle(ts, current, paramName);
              if (firstHandle !== null) {
                return ts.factory.createIdentifier(
                  PLACEHOLDER_FIRST + placeholderIndex(firstHandle),
                );
              }
              // A node-input `readInput(...)` wrapped in a NON-`[0]` element access
              // (`[1]`, dynamic) is unhandled: return it WITHOUT descending so the
              // inner `readInput` survives and forces the safe-floor thread.
              // (Descending would let the whole-read matcher rewrite the inner call
              // and silently mis-handle the indexed read as the full array.)
              if (
                ts.isElementAccessExpression(current) &&
                readInputWholeHandle(ts, current.expression, paramName) !== null
              ) {
                return current;
              }
              const wholeHandle = readInputWholeHandle(ts, current, paramName);
              if (wholeHandle !== null) {
                return ts.factory.createIdentifier(
                  PLACEHOLDER_ALL + placeholderIndex(wholeHandle),
                );
              }
            }
            const shadowsHere =
              (ts.isArrowFunction(current) ||
                ts.isFunctionExpression(current) ||
                ts.isFunctionDeclaration(current)) &&
              current.parameters.some(
                (parameter) =>
                  ts.isIdentifier(parameter.name) &&
                  parameter.name.text === paramName,
              );
            const childShadowed = paramShadowed || shadowsHere;
            return ts.visitEachChild(
              current,
              (child) => visit(child, childShadowed),
              context,
            );
          };
          return ts.visitNode(node, (child) =>
            visit(child, false),
          ) as import('typescript').Node;
        },
    ]);
    const transformed = result
      .transformed[0] as import('typescript').Expression;

    // Any surviving readInput reference (fan-in `[k>0]`, whole-array, dynamic) ⇒
    // not scalarizable → not auto-emittable.
    if (referencesReadInput(ts, transformed)) {
      result.dispose();
      return null;
    }
    // Self-containment: after substitution the only free identifiers may be known
    // globals + our placeholders. Anything else (the input param used directly, a
    // captured helper, an import namespace) ⇒ NOT self-contained → thread.
    const allowed = new Set<string>(KNOWN_GLOBALS);
    for (let index = 0; index < handleByIndex.length; index++) {
      allowed.add(PLACEHOLDER_FIRST + index);
      allowed.add(PLACEHOLDER_ALL + index);
    }
    if (freeIdentifiers(ts, transformed, allowed).size > 0) {
      result.dispose();
      return null;
    }
    // Reject await / this (not pure / not self-contained).
    let unsafe = false;
    const safetyVisit = (node: import('typescript').Node): void => {
      if (
        ts.isAwaitExpression(node) ||
        node.kind === ts.SyntaxKind.ThisKeyword
      ) {
        unsafe = true;
      }
      ts.forEachChild(node, safetyVisit);
    };
    safetyVisit(transformed);
    if (unsafe) {
      result.dispose();
      return null;
    }

    printed.push({
      outName,
      exprText: printer.printNode(
        ts.EmitHint.Unspecified,
        transformed,
        value.getSourceFile(),
      ),
    });
    result.dispose();
  }

  // One regex for both placeholder kinds: capture the kind (First|All) and index.
  const placeholder = new RegExp(`__rbnReadInput(First|All)__(\\d+)`, 'g');
  return ({ inputs, inputsAll }) => {
    const result: Record<string, string> = {};
    for (const { outName, exprText } of printed) {
      result[outName] = exprText.replace(
        placeholder,
        (_match, kind: string, index: string) => {
          const handle = handleByIndex[Number(index)];
          const upstream =
            handle === undefined
              ? undefined
              : kind === 'All'
                ? inputsAll[handle]
                : inputs[handle];
          return upstream === undefined ? '(undefined)' : `(${upstream})`;
        },
      );
    }
    return result;
  };
}

export { deriveAutoEmit };
export type { DerivedEmit };
