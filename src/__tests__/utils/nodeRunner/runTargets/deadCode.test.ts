import { describe, it, expect } from 'vitest';
import { loadTs } from '@/utils/nodeRunner/runTargets/codegen/tsLoader';
import { eliminateDeadCode } from '@/utils/nodeRunner/runTargets/codegen/ast/deadCode';

// The exact shape codegen emits for graph-state 29: a live `Graph Input → AND →
// Graph Output` path plus a fully DEAD `Bit Input → AND#2 → Loop → (unused)`
// branch (the Graph Output `out` resolves to AND#1, not the loop).
const GRAPH_29_SOURCE = `async function runGraph(functionImplementations, a, b, options = {}) {
  const abortSignal = options.abortSignal;
  let loopOut, loopOut2, loopOut3;
  function makeInput(values, isDefault, defaultValue) { return { connections: values.map((value) => ({ value })), isDefault, defaultValue }; }
  function makeOutputs(names) { return new Map(names.map((name) => [name, {}])); }
  function makeContext(nodeId, nodeTypeId, nodeTypeName) { return { nodeId, nodeTypeId, nodeTypeName, abortSignal }; }
  const andGateOut = Boolean(a) && Boolean(b);
  const bitInputOut = (await functionImplementations["bitConstant"](new Map([["Value", makeInput([], true, false)]]), makeOutputs(["Out"]), makeContext("2azp", "bitConstant", "Bit Input"))).get("Out");
  const andGateOut2 = Boolean(bitInputOut) && Boolean(false);
  {
    const currentValues = [andGateOut2];
    let condition = false;
    for (let iteration = 0; iteration < 100; iteration++) {
      loopOut = currentValues[0]; condition = Boolean(false); currentValues[0] = loopOut; loopOut2 = currentValues[0];
      if (!condition) { loopOut3 = currentValues[0]; break; }
    }
    if (condition) throw new Error("Loop exceeded maximum iterations (100)");
  }
  return { out: andGateOut };
}`;

describe('eliminateDeadCode (Stage 4 dead-variable elimination)', () => {
  it('collapses graph-29 to the masterplan-correct runGraph(a, b)', async () => {
    const ts = await loadTs();
    const out = eliminateDeadCode(ts, GRAPH_29_SOURCE, {
      assumePureImplementations: true,
    });
    // Signature cleaned: no async, no plumbing params.
    expect(out).toContain('function runGraph(a, b)');
    expect(out).not.toContain('async ');
    expect(out).not.toContain('functionImplementations');
    expect(out).not.toContain('options');
    // Dead branch gone.
    expect(out).not.toContain('bitInputOut');
    expect(out).not.toContain('andGateOut2');
    expect(out).not.toContain('loopOut');
    expect(out).not.toContain('makeInput');
    expect(out).not.toContain('for (');
    // Live path kept.
    expect(out).toContain('const andGateOut = Boolean(a) && Boolean(b)');
    expect(out).toMatch(/return\s*\{\s*out:\s*andGateOut\s*\}/);
    // The runnable function returns the AND of its two inputs.
    const runGraph = new Function(`${out}\nreturn runGraph;`)() as (
      a: boolean,
      b: boolean,
    ) => { out: boolean };
    expect(runGraph(true, true)).toEqual({ out: true });
    expect(runGraph(true, false)).toEqual({ out: false });
  });

  it('does NOT over-prune: a binding the return depends on is kept', async () => {
    const ts = await loadTs();
    const src = `function runGraph(a, b) {
  const andGateOut = Boolean(a) && Boolean(b);
  const orGateOut = Boolean(a) || Boolean(b);
  return { both: andGateOut, either: orGateOut };
}`;
    const out = eliminateDeadCode(ts, src, { assumePureImplementations: true });
    expect(out).toContain('andGateOut');
    expect(out).toContain('orGateOut');
    expect(out).toContain('function runGraph(a, b)');
  });

  it('without assumePureImplementations, keeps an impl-call binding (possible side effects)', async () => {
    const ts = await loadTs();
    const src = `async function runGraph(functionImplementations, options = {}) {
  const sideFx = (await functionImplementations["logger"](new Map())).get("Out");
  const unusedPure = 1 + 2;
  return {};
}`;
    const out = eliminateDeadCode(ts, src, {
      assumePureImplementations: false,
    });
    // The impl call may have side effects → kept; the pure unused binding dropped.
    expect(out).toContain('functionImplementations');
    expect(out).toContain('sideFx');
    expect(out).not.toContain('unusedPure');
  });
});
