// Shared, pure AST scope/identifier primitives for the codegen source-emit
// analysis (`sourceEmit.ts`). These mirror the proven walker in
// `analyze/autoEmit.ts` (which keeps its own private copy per the no-touch rule
// — it is shipped and pinned by tests). Two deliberate differences the
// source-emit guard needs:
//   • `SAFE_GLOBALS` — a wider allow-list than auto-emit's `KNOWN_GLOBALS` for
//     the source-emit name-closure check (§0A), deliberately EXCLUDING
//     `globalThis` (whitelisting it would admit arbitrary `globalThis["x"]`
//     member access through the back door).
//   • a documented note that catch bindings are bound correctly (see
//     `collectDeclaredNames`), so a helper body using `try { … } catch (e) { … }`
//     is analysed soundly rather than mis-flagged.
//
// Computed / bracketed member access (`obj["k"]`, `obj[k]`) is handled for NAME
// closure here (a bracket's object and its identifier key are both visited via
// `ts.forEachChild`); the §0(B) VALUE-API SURFACE shape check that must reason
// about `context["state"]` lives in `sourceEmit.ts`, which inspects element
// access explicitly.

type TsModule = typeof import('typescript');

/**
 * Identifiers that are always safe as free references inside a source-emitted
 * function body. A superset of auto-emit's `KNOWN_GLOBALS`: a baked function is
 * the consumer's own code relocated verbatim, so any standard ambient global it
 * references resolves identically in the emitted module. `globalThis` is
 * intentionally absent — see the header note.
 */
const SAFE_GLOBALS: ReadonlySet<string> = new Set([
  'Boolean',
  'Number',
  'String',
  'Math',
  'JSON',
  'Array',
  'Object',
  'Symbol',
  'BigInt',
  'Date',
  'RegExp',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Error',
  'TypeError',
  'RangeError',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent',
  'console',
  'structuredClone',
  'undefined',
  'NaN',
  'Infinity',
  // Pure, ubiquitous, side-effect-free ambient globals — a baked impl referencing
  // them resolves identically in the emitted module (none is a sandbox escape;
  // `globalThis`/`Function`/`eval` stay OUT, see the header note). The first group is
  // ECMA-262-mandated (present in every conforming engine); the WHATWG/WinterCG group
  // (`Intl`, `URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder`) is ambient in every
  // realistic target (browser/Worker/Node >=11/Deno/edge) but NOT spec-guaranteed, so a
  // bare/embedded engine lacking them carries the same `ReferenceError`-no-warning
  // residual as a consumer-supplied `additionalGlobals` entry.
  'Reflect',
  'Intl',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
  'ArrayBuffer',
  'DataView',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
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

/**
 * Collect every identifier bound by a binding name, recursing through object /
 * array destructuring patterns (`const { a } = …`, `const [x] = …`, a
 * destructured parameter). A bare `Identifier` adds itself.
 */
function collectBindingNames(
  ts: TsModule,
  name: import('typescript').BindingName,
  into: Set<string>,
): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element))
      collectBindingNames(ts, element.name, into);
  }
}

/**
 * Collect names DECLARED directly within `node`'s own scope (const/let/function/
 * parameter binding, INCLUDING destructuring patterns), not recursing into
 * deeper nested scopes.
 *
 * Catch bindings ARE captured: a `catch (e)` clause's binding is a
 * `VariableDeclaration` child of the `CatchClause`, so when this runs WITH a
 * `CatchClause` as `node` (i.e. when `freeIdentifiers` enters the catch as a
 * child scope) the `isVariableDeclaration` branch adds `e`. A `catch` nested
 * deeper is a scope of its own and is correctly skipped here.
 */
function collectDeclaredNames(
  ts: TsModule,
  node: import('typescript').Node,
  into: Set<string>,
): void {
  const visit = (current: import('typescript').Node): void => {
    if (ts.isVariableDeclaration(current)) {
      collectBindingNames(ts, current.name, into);
    } else if (ts.isFunctionDeclaration(current) && current.name) {
      into.add(current.name.text);
    } else if (ts.isParameter(current)) {
      collectBindingNames(ts, current.name, into);
    }
    if (current !== node && introducesScope(ts, current)) return;
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
}

/**
 * Free identifiers in `node` not bound by `bound` (or by any scope nested inside
 * `node`) and not a property/key name. Scope-aware: a nested function/arrow's
 * own parameters and locals shadow the outer scope, so they are NOT counted
 * free.
 */
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
      visit(current.initializer, scope); // the key is not a free reference
      return;
    }
    ts.forEachChild(current, (c) => visit(c, scope));
  };
  visit(node, bound);
  return free;
}

export {
  introducesScope,
  collectBindingNames,
  collectDeclaredNames,
  freeIdentifiers,
  SAFE_GLOBALS,
};
export type { TsModule };
