// Source-emission analysis (todo.txt #4, plan §5) — decides which registered
// `knownFunctions` can be baked verbatim into the generated `runGraph` module so
// it runs with no `functionImplementations` argument. PURE: it reads each
// function's `.toString()`, never executes it.
//
// A node-type IMPL is "source-emittable" only when BOTH halves of the §0
// correctness contract hold:
//   (A) NAME CLOSURE — every free identifier resolves to a safe global, the
//       `readInput` intrinsic, another registered (and itself emittable)
//       function, or a local. An unresolved name ⇒ thread.
//   (B) VALUE-API SURFACE — every use of the impl's positional params
//       (`inputs`/`outputs`/`context`) stays within the access shapes the
//       emitted `makeInput`/`makeOutputs`/`makeContext` prelude provides. The
//       guard is INTER-PROCEDURAL: passing a value-API param to a registered
//       helper propagates the role into that helper's parameter and checks the
//       helper's body too (so the universal `getFirstInputVal(inputs, name)`
//       pattern is covered). Passing a param to anything else, or reading
//       executor-only state / non-`.value` connection fields / handle metadata /
//       the `outputs` param / a dynamic field ⇒ thread.
//
// HELPERS are NOT subject to §0(B) on their own (their signatures are arbitrary);
// they are surface-checked on demand, with the specific role an impl passes in.
// Failing either half threads the node (graceful mixed) with a `// warning:`. The
// predicate is conservative: any doubt threads (the safe floor).

import {
  collectBindingNames,
  collectDeclaredNames,
  freeIdentifiers,
  introducesScope,
  SAFE_GLOBALS,
} from './scopeAnalysis';
import type { TsModule } from './scopeAnalysis';

// NOTE: `analyze/` is an import-leaf within the codegen extraction boundary (it may
// not reach `../*`), so the reserved-name set the verbatim-emit viability check
// needs is INJECTED by the caller (`reservedNames`) rather than imported from
// `../nameRegistry`. The caller passes `RESERVED_NAMES ∪ {readInput, switchInputs,
// loopValue}` — the registry's reserved set plus the raw structural locals the
// lowering mints (a verbatim helper named these would shadow them).

type RegisteredFunctions = Readonly<
  Record<string, (...args: never[]) => unknown>
>;

type SourceEmissionInput = {
  /** node-type id → impl AND helper name → helper, in one object. */
  knownFunctions: RegisteredFunctions;
  /** Every node-type id appearing in the plan (incl. nested scopes). */
  allNodeTypeIds: ReadonlySet<string>;
  /** Type ids already inlined by `deriveAutoEmit` — excluded from source-emit. */
  autoEmittedTypeIds: ReadonlySet<string>;
  /** Names a verbatim helper/impl-local may NOT take — `RESERVED_NAMES ∪
   *  {readInput, switchInputs, loopValue}` (injected to keep `analyze/` import-free). */
  reservedNames: ReadonlySet<string>;
  /** Extra identifiers treated as safe ambient globals during §0(A). */
  additionalGlobals?: ReadonlyArray<string>;
};

type EmittedFunction = { name: string; sourceText: string };

type SourceEmissionPlan = {
  /** node-type id → the local identifier its calls use (collision-free). */
  localNameByTypeId: ReadonlyMap<string, string>;
  /** Function defs to emit in `runGraph` (readInput intrinsic + helpers + impls),
   *  in dependency order, deduped by name. */
  emittedFunctions: ReadonlyArray<EmittedFunction>;
  /** `// warning:` lines for registered node types that stay threaded. */
  warnings: ReadonlyArray<string>;
};

type ParamRole = 'inputs' | 'outputs' | 'context';
type AnyExpr = import('typescript').Expression;
type AnyNode = import('typescript').Node;
type FnExpr =
  | import('typescript').ArrowFunction
  | import('typescript').FunctionExpression;

/** The `readInput` intrinsic, emitted as a parenthesizable arrow whose behaviour
 *  matches `src/utils/nodeRunner/readInput.ts` (TS types + `export` stripped). */
const READ_INPUT_SOURCE =
  '(inputs, name) => {\n' +
  '  const handle = inputs.get(name);\n' +
  '  return handle && handle.connections.length > 0\n' +
  '    ? handle.connections.map((connection) => connection.value)\n' +
  '    : [handle ? handle.defaultValue : undefined];\n' +
  '}';

const CONTEXT_FIELDS: ReadonlySet<string> = new Set([
  'nodeId',
  'nodeTypeId',
  'nodeTypeName',
  'abortSignal',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Identifier / parse helpers
// ─────────────────────────────────────────────────────────────────────────────

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/** Sanitize an arbitrary node-type id into a valid JS identifier (call-site use
 *  only, so a later numeric suffix on collision is harmless). */
function toIdentifier(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[A-Za-z_$]/.test(cleaned) ? cleaned : `fn_${cleaned}`;
}

/** Unwrap parens + comma-sequence (esbuild/Vite `(0, ns.readInput)`) interop. */
function baseCallee(ts: TsModule, node: AnyExpr): AnyExpr {
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

type Parsed =
  | {
      ok: true;
      fnNode: FnExpr;
      /** param i's plain-identifier name, or undefined (rest/default/destructured). */
      positionalNames: ReadonlyArray<string | undefined>;
      /** every name bound by params (incl. destructured), for §0(A). */
      bindingNames: ReadonlySet<string>;
      rawSource: string;
    }
  | { ok: false; reason: string; rawSource: string };

function parseFunction(
  ts: TsModule,
  implementation: (...args: never[]) => unknown,
): Parsed {
  const rawSource = implementation.toString();
  if (rawSource.includes('[native code]')) {
    return { ok: false, reason: 'native or bound function', rawSource };
  }
  let fnNode: FnExpr | undefined;
  try {
    const file = ts.createSourceFile(
      'fn.ts',
      `const __fn__ = (${rawSource});`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const statement = file.statements[0];
    if (!ts.isVariableStatement(statement)) {
      return { ok: false, reason: 'not a function expression', rawSource };
    }
    let initializer = statement.declarationList.declarations[0]?.initializer;
    if (initializer && ts.isParenthesizedExpression(initializer)) {
      initializer = initializer.expression;
    }
    if (
      initializer &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ) {
      fnNode = initializer;
    }
  } catch {
    return { ok: false, reason: 'unparseable source', rawSource };
  }
  if (!fnNode) {
    return {
      ok: false,
      reason: 'not an arrow/function expression (e.g. method shorthand)',
      rawSource,
    };
  }
  // Generators (`function*` / `async function*`) parse to a FunctionExpression but
  // never return a Map. A baked generator behaves IDENTICALLY to the threaded form
  // (both hit the same `out instanceof Map` store guard / inline `.get`), so this
  // reject is conservative defense-in-depth — keeping obviously-non-Map impls out of
  // the baked set — NOT a divergence fix (the executor isolates a non-Map node via
  // `Promise.allSettled`; codegen, baked or threaded, does not replicate that). Other
  // non-Map shapes (an `async` impl returning a non-Map, a thenable) are likewise
  // admitted-but-harmless for the same baked-≡-threaded reason. (Arrows can never
  // carry an asterisk token.)
  if (fnNode.asteriskToken) {
    return { ok: false, reason: 'generator function', rawSource };
  }
  // Reject `this` ANYWHERE in the function (matching `autoEmit.ts`). The executor
  // calls an impl with `this === undefined`, but a baked free call binds `this` to
  // `globalThis` under a sloppy / `new Function` load — a success-path divergence.
  // Walk the whole node (params + body, incl. a nested arrow's lexical `this`); this
  // runs for HELPERS too, so a `this`-using helper is rejected here and never baked.
  let usesThis = false;
  const thisWalk = (node: AnyNode): void => {
    if (usesThis) return;
    if (node.kind === ts.SyntaxKind.ThisKeyword) {
      usesThis = true;
      return;
    }
    ts.forEachChild(node, thisWalk);
  };
  thisWalk(fnNode);
  if (usesThis) {
    return { ok: false, reason: 'reads `this` (not emittable)', rawSource };
  }
  const positionalNames: (string | undefined)[] = [];
  const bindingNames = new Set<string>();
  for (const parameter of fnNode.parameters) {
    positionalNames.push(
      !parameter.dotDotDotToken &&
        !parameter.initializer &&
        ts.isIdentifier(parameter.name)
        ? parameter.name.text
        : undefined,
    );
    collectBindingNames(ts, parameter.name, bindingNames);
  }
  // A named function expression binds its OWN name in its body scope, so
  // self-recursion (`function fib(n){ … fib(n-1) … }`) is NOT a free reference /
  // dependency-graph self-edge (unlike an arrow recursing by its registry key).
  if (ts.isFunctionExpression(fnNode) && fnNode.name) {
    bindingNames.add(fnNode.name.text);
  }
  return { ok: true, fnNode, positionalNames, bindingNames, rawSource };
}

// ─────────────────────────────────────────────────────────────────────────────
// §0(B) value-API surface guard (inter-procedural)
// ─────────────────────────────────────────────────────────────────────────────

/** Is `call` `readInput(<inputsParam>, …)`? The handle-name arg need not be a
 *  literal (source-emit bakes the call verbatim; it runs at runtime). */
function isReadInputCall(
  ts: TsModule,
  call: import('typescript').CallExpression,
  inputsParamName: string | undefined,
): boolean {
  if (inputsParamName === undefined) return false;
  const callee = baseCallee(ts, call.expression);
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;
  return (
    name === 'readInput' &&
    call.arguments.length === 2 &&
    ts.isIdentifier(call.arguments[0]) &&
    call.arguments[0].text === inputsParamName
  );
}

/** Validate the `connections` sub-chain: `[<numLit>].value` | `.length` |
 *  `.map(c => c.value)`. */
function validateConnections(
  ts: TsModule,
  connectionsAccess: import('typescript').PropertyAccessExpression,
): string | null {
  const after = connectionsAccess.parent;
  if (
    ts.isElementAccessExpression(after) &&
    after.expression === connectionsAccess
  ) {
    if (!ts.isNumericLiteral(after.argumentExpression)) {
      return 'inputs connections[…] needs a numeric-literal index';
    }
    const valueAccess = after.parent;
    if (
      ts.isPropertyAccessExpression(valueAccess) &&
      valueAccess.expression === after &&
      valueAccess.name.text === 'value'
    ) {
      return null;
    }
    return 'inputs connections[i] must read .value';
  }
  if (
    ts.isPropertyAccessExpression(after) &&
    after.expression === connectionsAccess
  ) {
    if (after.name.text === 'length') return null;
    if (after.name.text === 'map') {
      const mapCall = after.parent;
      if (
        ts.isCallExpression(mapCall) &&
        mapCall.expression === after &&
        mapCall.arguments.length === 1 &&
        isValueMapper(ts, mapCall.arguments[0])
      ) {
        return null;
      }
      return 'inputs connections.map(...) callback must be `c => c.value`';
    }
    return `inputs connections.${after.name.text} is not emittable`;
  }
  return 'inputs connections used in a non-emittable shape';
}

/** Is `arg` the arrow `c => c.value` (expression or single-return block)? */
function isValueMapper(ts: TsModule, arg: AnyExpr): boolean {
  if (!ts.isArrowFunction(arg) || arg.parameters.length !== 1) return false;
  const param = arg.parameters[0];
  if (!ts.isIdentifier(param.name)) return false;
  const paramName = param.name.text;
  let body: AnyNode = arg.body;
  if (ts.isBlock(body)) {
    if (body.statements.length !== 1) return false;
    const only = body.statements[0];
    if (!ts.isReturnStatement(only) || !only.expression) return false;
    body = only.expression;
  }
  return (
    ts.isPropertyAccessExpression(body) &&
    ts.isIdentifier(body.expression) &&
    body.expression.text === paramName &&
    body.name.text === 'value'
  );
}

/** Validate a member-access chain rooted at the `inputs`-role param:
 *  `inputs.get(<any>).{connections… | isDefault | defaultValue}`. The `.get`
 *  argument need not be a literal (the call is baked verbatim). */
function validateInputsChain(
  ts: TsModule,
  access:
    | import('typescript').PropertyAccessExpression
    | import('typescript').ElementAccessExpression,
): string | null {
  if (!ts.isPropertyAccessExpression(access) || access.name.text !== 'get') {
    return 'inputs accessed other than via .get(...)';
  }
  const getCall = access.parent;
  if (!(ts.isCallExpression(getCall) && getCall.expression === access)) {
    return 'inputs.get must be called';
  }
  const handleAccess = getCall.parent;
  if (
    !ts.isPropertyAccessExpression(handleAccess) ||
    handleAccess.expression !== getCall
  ) {
    return 'inputs.get(...) result must read .connections/.isDefault/.defaultValue';
  }
  const field = handleAccess.name.text;
  if (field === 'isDefault' || field === 'defaultValue') return null;
  if (field !== 'connections') {
    return `inputs handle field .${field} is not emittable`;
  }
  return validateConnections(ts, handleAccess);
}

/** Validate a member-access chain rooted at the `context`-role param. */
function validateContextChain(
  ts: TsModule,
  access:
    | import('typescript').PropertyAccessExpression
    | import('typescript').ElementAccessExpression,
): string | null {
  let field: string | undefined;
  if (ts.isPropertyAccessExpression(access)) {
    field = access.name.text;
  } else {
    const arg = access.argumentExpression;
    if (!ts.isStringLiteralLike(arg)) {
      return 'context accessed with a dynamic key';
    }
    field = arg.text;
  }
  if (field !== undefined && CONTEXT_FIELDS.has(field)) return null;
  return `context.${field ?? '?'} is executor-only (not emittable)`;
}

/** Is this identifier occurrence a REFERENCE (vs a property/key name)? A
 *  shorthand `{ inputs }` name IS the value reference — keep it. */
function isReferenceOccurrence(
  ts: TsModule,
  id: import('typescript').Identifier,
): boolean {
  const parent = id.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === id) return false;
  return true;
}

/**
 * Surface-check `fnNode`'s body with the given role bindings. Inter-procedural:
 * passing a role-bound param to a registered function propagates the role into
 * that function's parameter (cycle-guarded via `stack`). Returns the first
 * violation, or null when clean.
 */
function surfaceCheck(
  ts: TsModule,
  fnNode: FnExpr,
  roleByParamName: ReadonlyMap<string, ParamRole>,
  parsedByKey: ReadonlyMap<string, Parsed>,
  stack: ReadonlySet<string>,
): string | null {
  let inputsParamName: string | undefined;
  for (const [name, role] of roleByParamName) {
    if (role === 'inputs') inputsParamName = name;
  }
  let violation: string | null = null;

  const classifyUse = (
    id: import('typescript').Identifier,
    role: ParamRole,
  ): string | null => {
    if (role === 'outputs') {
      return 'reads the outputs parameter (not emittable in v1)';
    }
    const parent = id.parent;
    if (ts.isCallExpression(parent) && parent.expression !== id) {
      const argIndex = parent.arguments.indexOf(id);
      if (
        role === 'inputs' &&
        argIndex === 0 &&
        isReadInputCall(ts, parent, inputsParamName)
      ) {
        return null; // the allowed builtin pass-through
      }
      const callee = baseCallee(ts, parent.expression);
      if (ts.isIdentifier(callee) && argIndex >= 0) {
        const target = parsedByKey.get(callee.text);
        const targetParam = target?.ok
          ? target.positionalNames[argIndex]
          : undefined;
        if (target?.ok && targetParam !== undefined) {
          if (stack.has(callee.text)) {
            return `cyclic helper "${callee.text}"`;
          }
          const nestedStack = new Set(stack);
          nestedStack.add(callee.text);
          return surfaceCheck(
            ts,
            target.fnNode,
            new Map([[targetParam, role]]),
            parsedByKey,
            nestedStack,
          );
        }
      }
      return `${role} passed as an argument to a non-readInput function`;
    }
    if (ts.isPropertyAccessExpression(parent) && parent.expression === id) {
      return role === 'inputs'
        ? validateInputsChain(ts, parent)
        : validateContextChain(ts, parent);
    }
    if (ts.isElementAccessExpression(parent) && parent.expression === id) {
      return role === 'inputs'
        ? validateInputsChain(ts, parent)
        : validateContextChain(ts, parent);
    }
    return `${role} used outside the allowed value-API surface`;
  };

  const visit = (
    node: AnyNode,
    liveRoles: ReadonlyMap<string, ParamRole>,
  ): void => {
    if (violation) return;
    if (introducesScope(ts, node)) {
      const declared = new Set<string>();
      collectDeclaredNames(ts, node, declared);
      let childRoles = liveRoles;
      for (const name of declared) {
        if (childRoles.has(name)) {
          const next = new Map(childRoles);
          next.delete(name);
          childRoles = next;
        }
      }
      ts.forEachChild(node, (child) => visit(child, childRoles));
      return;
    }
    if (ts.isIdentifier(node)) {
      const role = liveRoles.get(node.text);
      if (role !== undefined && isReferenceOccurrence(ts, node)) {
        const reason = classifyUse(node, role);
        if (reason && !violation) violation = reason;
      }
      return;
    }
    ts.forEachChild(node, (child) => visit(child, liveRoles));
  };

  visit(fnNode.body, roleByParamName);
  return violation;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

function planSourceEmission(
  ts: TsModule,
  input: SourceEmissionInput,
): SourceEmissionPlan {
  const { knownFunctions, allNodeTypeIds, autoEmittedTypeIds, reservedNames } =
    input;
  const registeredKeys = new Set(Object.keys(knownFunctions));
  const warnings: string[] = [];
  // `additionalGlobals` are trusted as ambient globals; a non-identifier entry can
  // never match a bare free identifier, so surface it rather than silently drop it.
  const extraGlobals = (input.additionalGlobals ?? []).filter((name) => {
    if (isValidIdentifier(name)) return true;
    warnings.push(
      `// warning: ignored additionalGlobals entry "${name}" — not a bare identifier`,
    );
    return false;
  });
  const safeGlobals = new Set<string>([...SAFE_GLOBALS, ...extraGlobals]);
  const isHelper = (key: string): boolean => !allNodeTypeIds.has(key);

  // 1. Parse every registered function.
  const parsedByKey = new Map<string, Parsed>();
  for (const key of registeredKeys) {
    parsedByKey.set(key, parseFunction(ts, knownFunctions[key]));
  }

  // 2. §0(A) name closure per function.
  type Closure = {
    registeredDeps: ReadonlySet<string>;
    unresolved: string | undefined;
    referencesReadInput: boolean;
  };
  const closureByKey = new Map<string, Closure>();
  for (const key of registeredKeys) {
    const parsed = parsedByKey.get(key);
    if (!parsed?.ok) {
      closureByKey.set(key, {
        registeredDeps: new Set(),
        unresolved: undefined,
        referencesReadInput: false,
      });
      continue;
    }
    const freeRefs = freeIdentifiers(ts, parsed.fnNode, parsed.bindingNames);
    const registeredDeps = new Set<string>();
    let unresolved: string | undefined;
    for (const ref of freeRefs) {
      if (ref === 'readInput' || safeGlobals.has(ref)) continue;
      if (registeredKeys.has(ref)) registeredDeps.add(ref);
      else if (unresolved === undefined) unresolved = ref;
    }
    closureByKey.set(key, {
      registeredDeps,
      unresolved,
      referencesReadInput: freeRefs.has('readInput'),
    });
  }

  const nameViable = (key: string): boolean =>
    !isHelper(key) || (isValidIdentifier(key) && !reservedNames.has(key));

  // 3. Emittability fixpoint (§0A + name-viable + deps). A registered dep must be
  //    a viable HELPER; an impl referenced by node-type id is unsupported in v1.
  type State = 'computing' | true | false;
  const emittableState = new Map<string, State>();
  const blockingReason = new Map<string, string>();
  const isEmittable = (key: string): boolean => {
    const cached = emittableState.get(key);
    if (cached === true || cached === false) return cached;
    if (cached === 'computing') return false; // cycle
    emittableState.set(key, 'computing');
    const parsed = parsedByKey.get(key);
    const closure = closureByKey.get(key);
    let ok = true;
    let reason: string | null = null;
    if (!parsed?.ok) {
      ok = false;
      reason = parsed && !parsed.ok ? parsed.reason : 'not registered';
    } else if (!nameViable(key)) {
      ok = false;
      reason = `helper name "${key}" collides with a reserved identifier`;
    } else if (closure?.unresolved !== undefined) {
      ok = false;
      reason = `references unknown identifier "${closure.unresolved}"`;
    } else {
      for (const dep of closure?.registeredDeps ?? []) {
        if (!isHelper(dep)) {
          ok = false;
          reason = `references node-type impl "${dep}" by id (unsupported in v1)`;
          break;
        }
        if (!isEmittable(dep)) {
          ok = false;
          reason = `depends on un-emittable helper "${dep}"`;
          break;
        }
      }
    }
    emittableState.set(key, ok);
    if (!ok && reason) blockingReason.set(key, reason);
    return ok;
  };
  for (const key of registeredKeys) isEmittable(key);

  // 4. Covered impl types: a registered, non-auto-emitted node type that is
  //    emittable AND whose impl is §0(B) surface-clean as `(inputs,outputs,context)`.
  const coveredImplKeys: string[] = [];
  const sortedKeys = [...registeredKeys].sort();
  for (const key of sortedKeys) {
    if (isHelper(key) || autoEmittedTypeIds.has(key)) continue;
    if (!isEmittable(key)) {
      warnings.push(
        `// warning: node type "${key}" stays threaded — ${blockingReason.get(key) ?? 'not emittable'}`,
      );
      continue;
    }
    const parsed = parsedByKey.get(key);
    if (!parsed?.ok) continue; // unreachable (emittable ⇒ parsed)
    const roleByIndex: ParamRole[] = ['inputs', 'outputs', 'context'];
    const roleByParamName = new Map<string, ParamRole>();
    let analyzable = parsed.fnNode.parameters.length <= 3;
    for (let index = 0; index < parsed.fnNode.parameters.length; index++) {
      const paramName = parsed.positionalNames[index];
      if (paramName === undefined) {
        analyzable = false;
        break;
      }
      roleByParamName.set(paramName, roleByIndex[index]);
    }
    const surfaceReason = analyzable
      ? surfaceCheck(ts, parsed.fnNode, roleByParamName, parsedByKey, new Set())
      : 'destructured/rest/defaulted parameter';
    if (surfaceReason === null) {
      coveredImplKeys.push(key);
    } else {
      warnings.push(
        `// warning: node type "${key}" stays threaded — ${surfaceReason}`,
      );
    }
  }

  // 5. Transitive closure of emitted functions (covered impls + their helpers).
  const closureSet = new Set<string>();
  const collect = (key: string): void => {
    if (closureSet.has(key)) return;
    closureSet.add(key);
    for (const dep of closureByKey.get(key)?.registeredDeps ?? []) collect(dep);
  };
  for (const key of coveredImplKeys) collect(key);

  // 6. Impl-local names: dedupe `toIdentifier(typeId)` against helper names,
  //    the scaffolding denylist, and each other.
  const taken = new Set<string>([...reservedNames]);
  for (const key of closureSet) if (isHelper(key)) taken.add(key);
  const localNameByTypeId = new Map<string, string>();
  for (const key of coveredImplKeys) {
    const base = toIdentifier(key);
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    taken.add(candidate);
    localNameByTypeId.set(key, candidate);
  }

  // 7. Emit in dependency order: readInput first (if referenced), then a topo
  //    order of the closure (deps before dependents).
  const anyReadInput = [...closureSet].some(
    (key) => closureByKey.get(key)?.referencesReadInput,
  );
  const ordered: string[] = [];
  const visited = new Set<string>();
  const topo = (key: string): void => {
    if (visited.has(key)) return;
    visited.add(key);
    for (const dep of closureByKey.get(key)?.registeredDeps ?? []) {
      if (closureSet.has(dep)) topo(dep);
    }
    ordered.push(key);
  };
  for (const key of sortedKeys) if (closureSet.has(key)) topo(key);

  const emittedFunctions: EmittedFunction[] = [];
  if (anyReadInput) {
    emittedFunctions.push({ name: 'readInput', sourceText: READ_INPUT_SOURCE });
  }
  for (const key of ordered) {
    const parsed = parsedByKey.get(key);
    if (!parsed?.ok) continue;
    // For a covered impl `localNameByTypeId` always has an entry (set in step 6); the
    // checked branch replaces an unsound `as string` and self-documents the invariant.
    const name = isHelper(key) ? key : localNameByTypeId.get(key);
    if (name === undefined) continue;
    // Wrap on its own lines so a (non-spec) body ending in a `// line comment` can't
    // comment out the closing `)` and `;` (defensive — the sole guard between consumer
    // source and the emitted module).
    emittedFunctions.push({ name, sourceText: `(\n${parsed.rawSource}\n)` });
  }

  return { localNameByTypeId, emittedFunctions, warnings };
}

export { planSourceEmission, READ_INPUT_SOURCE };
export type {
  SourceEmissionInput,
  SourceEmissionPlan,
  EmittedFunction,
  RegisteredFunctions,
};
