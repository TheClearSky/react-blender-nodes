// Optional IR → IR optimization passes. These transform the lowered `CgModule`
// before printing. They are opt-in and OFF by default (the un-optimized output is
// value-identical to the in-process executor); a caller enables a pass only when
// its precondition holds (e.g. `dropDead` requires pure implementations).

import type { CgModule, CgStmt } from './ir';

const IDENTIFIER_PATTERN = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/** Add every identifier in `text` that is a known value variable to `into`. */
function addReferencedNames(
  text: string,
  allNames: ReadonlySet<string>,
  into: Set<string>,
): void {
  IDENTIFIER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IDENTIFIER_PATTERN.exec(text)) !== null) {
    if (allNames.has(match[0])) into.add(match[0]);
  }
}

/**
 * Collect every value variable READ anywhere in the statement tree: node-call
 * input connections, raw glue lines (loop/switch/group plumbing), block headers,
 * and `if` conditions. A node's own output stores are writes, handled separately.
 *
 * Conservative by design: a raw line's assignment TARGET is also counted as a
 * "read", which can only over-keep — and a structural write target is never a
 * droppable top-level node output, so it does no harm. Reads of a top-level node's
 * output (the only droppable thing) are always captured, so DCE stays sound.
 */
function collectReads(
  stmts: ReadonlyArray<CgStmt>,
  allNames: ReadonlySet<string>,
  into: Set<string>,
): void {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'raw':
        addReferencedNames(stmt.line, allNames, into);
        break;
      case 'nodeCall':
        for (const input of stmt.inputs) {
          for (const connection of input.connections) {
            addReferencedNames(connection, allNames, into);
          }
        }
        break;
      case 'inline':
        for (const assignment of stmt.assignments) {
          addReferencedNames(assignment.expr, allNames, into);
        }
        break;
      case 'block':
        addReferencedNames(stmt.open, allNames, into);
        addReferencedNames(stmt.close, allNames, into);
        collectReads(stmt.body, allNames, into);
        break;
      case 'ifElse':
        addReferencedNames(stmt.condition, allNames, into);
        collectReads(stmt.thenBody, allNames, into);
        collectReads(stmt.elseBody, allNames, into);
        break;
    }
  }
}

/**
 * Dead-code elimination: drop TOP-LEVEL standard node calls whose every output
 * value is unused — not read by any other node (at any depth), any control-flow
 * glue, or the `returnRoots` (a set of variable names). Iterates to a fixpoint,
 * since dropping a node can orphan the nodes that only fed it.
 *
 * SOUND ONLY when implementations are pure (the caller asserts this via
 * `assumePureImplementations`): a dropped node's side effects would otherwise be
 * lost. Conservative — control structures are never dropped (so the variables
 * their glue reads always stay live), and a node with no outputs is kept. With
 * un-narrowed returns every variable is a root, so nothing is dropped.
 */
function dropDead(
  module: CgModule,
  returnRoots: ReadonlySet<string>,
): CgModule {
  const allNames = new Set(module.nameEntries.map((entry) => entry.name));
  let body = module.body;
  for (;;) {
    const live = new Set<string>(returnRoots);
    collectReads(body, allNames, live);
    let dropped = false;
    const next = body.filter((stmt) => {
      const outputNames =
        stmt.kind === 'nodeCall'
          ? stmt.stores.map((store) => store.targetRef)
          : stmt.kind === 'inline'
            ? stmt.assignments.map((assignment) => assignment.targetRef)
            : null;
      if (outputNames === null) return true; // structures are never dropped
      const known = outputNames.filter((name) => allNames.has(name));
      if (known.length === 0) return true;
      if (known.some((name) => live.has(name))) return true;
      dropped = true;
      return false;
    });
    body = next;
    if (!dropped) break;
  }

  return { ...module, body };
}

export { dropDead };
