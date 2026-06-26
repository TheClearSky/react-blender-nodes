import { describe, it, expect } from 'vitest';
import { loadTs } from '@/utils/nodeRunner/runTargets/codegen/tsLoader';
import { deriveAutoEmit } from '@/utils/nodeRunner/runTargets/codegen/analyze/autoEmit';
// The REAL intrinsic — importing it means esbuild rewrites `readInput(...)` to
// its namespace-interop form in any impl below, exercising the transpiled path.
import { readInput } from '@/utils/nodeRunner/readInput';

describe('deriveAutoEmit (Stage 3 auto-emit recognition)', () => {
  it('derives an inline emit hook from a readInput-based source node (Bit Input)', async () => {
    const ts = await loadTs();
    // Use a literal source string to control the exact shape under test.
    const impl = new Function(
      'readInput',
      'return (inputs) => new Map([["Out", readInput(inputs, "Value")[0]]]);',
    )(readInput) as (...a: never[]) => unknown;

    const emit = deriveAutoEmit(ts, impl);
    expect(emit).not.toBeNull();
    const out = emit!({
      inputs: { Value: 'true' },
      inputsAll: { Value: '[true]' },
      outputs: ['Out'],
      nodeId: 'n',
      language: 'javascript',
    });
    expect(out).toEqual({ Out: '(true)' });
  });

  it('handles the transpiled (Vite/esbuild) readInput call form', async () => {
    const ts = await loadTs();
    // Authored normally with the imported intrinsic ⇒ esbuild rewrites it to the
    // `(0, ns.readInput)(…)` interop form. Recognition must still match it.
    const impl = (inputs: ReadonlyMap<string, never>) =>
      new Map([['Out', Boolean(readInput(inputs, 'Value')[0])]]);
    const emit = deriveAutoEmit(ts, impl as never);
    expect(emit).not.toBeNull();
    expect(
      emit!({
        inputs: { Value: 'x' },
        inputsAll: { Value: '[x]' },
        outputs: ['Out'],
        nodeId: 'n',
        language: 'javascript',
      }),
    ).toEqual({ Out: 'Boolean((x))' });
  });

  it('derives a gate (AND) with two readInput reads', async () => {
    const ts = await loadTs();
    const impl = new Function(
      'readInput',
      'return (inputs) => new Map([["Out", Boolean(readInput(inputs, "A")[0]) && Boolean(readInput(inputs, "B")[0])]]);',
    )(readInput) as (...a: never[]) => unknown;
    const emit = deriveAutoEmit(ts, impl);
    expect(emit).not.toBeNull();
    const out = emit!({
      inputs: { A: 'a', B: 'b' },
      inputsAll: { A: '[a]', B: '[b]' },
      outputs: ['Out'],
      nodeId: 'n',
      language: 'javascript',
    });
    expect(out).toEqual({ Out: 'Boolean((a)) && Boolean((b))' });
  });

  it('returns null for a NON-self-contained impl (free helper var)', async () => {
    const ts = await loadTs();
    // References `getFirstInputVal` — a captured helper codegen cannot resolve.
    const impl = new Function(
      'getFirstInputVal',
      'return (inputs) => new Map([["Out", getFirstInputVal(inputs.get("A"))]]);',
    )(() => 0) as (...a: never[]) => unknown;
    expect(deriveAutoEmit(ts, impl)).toBeNull();
  });

  it('returns null for an async impl', async () => {
    const ts = await loadTs();
    const impl = new Function(
      'readInput',
      'return async (inputs) => new Map([["Out", await readInput(inputs, "A")[0]]]);',
    )(readInput) as (...a: never[]) => unknown;
    expect(deriveAutoEmit(ts, impl)).toBeNull();
  });

  it('does not auto-emit a non-[0] indexed read ([1])', async () => {
    const ts = await loadTs();
    const impl = new Function(
      'readInput',
      'return (inputs) => new Map([["Out", readInput(inputs, "A")[1]]]);',
    )(readInput) as (...a: never[]) => unknown;
    // `[1]` is neither the recognized first-read (`[0]`) nor a whole-array read
    // (a bare `readInput(...)` call); the leftover readInput reference makes the
    // impl non-self-contained → not auto-emittable → thread.
    expect(deriveAutoEmit(ts, impl)).toBeNull();
  });

  it('derives the ARRAY form from a WHOLE readInput read (fan-in aware)', async () => {
    const ts = await loadTs();
    // Reads the whole input array and reduces it — the fan-in case. The handle is
    // sourced from `inputsAll` (the array-literal of every connection).
    const impl = new Function(
      'readInput',
      'return (inputs) => new Map([["Out", readInput(inputs, "In").some((v) => Boolean(v))]]);',
    )(readInput) as (...a: never[]) => unknown;
    const emit = deriveAutoEmit(ts, impl);
    expect(emit).not.toBeNull();
    const out = emit!({
      inputs: { In: 'B' },
      inputsAll: { In: '[B, B_2]' },
      outputs: ['Out'],
      nodeId: 'n',
      language: 'javascript',
    });
    // The whole read pulls from inputsAll → ([B, B_2]); the scalar `inputs.In` is
    // unused here.
    expect(out).toEqual({ Out: '([B, B_2]).some((v) => Boolean(v))' });
  });

  it('mixes first-read and whole-read inputs in one impl', async () => {
    const ts = await loadTs();
    // `A` read as `[0]` (scalar/first) and `B` read whole (array) — each sources
    // from the matching channel.
    const impl = new Function(
      'readInput',
      'return (inputs) => new Map([["Out", Boolean(readInput(inputs, "A")[0]) || readInput(inputs, "B").some((v) => Boolean(v))]]);',
    )(readInput) as (...a: never[]) => unknown;
    const emit = deriveAutoEmit(ts, impl);
    expect(emit).not.toBeNull();
    const out = emit!({
      inputs: { A: 'a', B: 'b' },
      inputsAll: { A: '[a]', B: '[b, b2]' },
      outputs: ['Out'],
      nodeId: 'n',
      language: 'javascript',
    });
    expect(out).toEqual({
      Out: 'Boolean((a)) || ([b, b2]).some((v) => Boolean(v))',
    });
  });

  it('returns null when readInput reads a NON-param map (not self-contained)', async () => {
    const ts = await loadTs();
    // `readInput(otherMap, "A")` reads a captured map, NOT the impl's own `inputs`
    // param. Recognizing it would silently wire handle "A"'s upstream where the
    // impl actually meant `otherMap` → must thread, not auto-emit.
    const impl = new Function(
      'readInput',
      'otherMap',
      'return (inputs) => new Map([["Out", readInput(otherMap, "A")[0]]]);',
    )(readInput, new Map()) as (...a: never[]) => unknown;
    expect(deriveAutoEmit(ts, impl)).toBeNull();
  });

  it('returns null when a nested lambda shadows the input param (scope-aware)', async () => {
    const ts = await loadTs();
    // The inner arrow re-binds `inputs`, so `readInput(inputs, "X")` inside it is
    // NOT this node's input read. A scope-blind recognizer would mis-replace it and
    // miscompile; the visitor must leave the readInput in place → impl threads.
    const impl = new Function(
      'readInput',
      'return (inputs) => new Map([["Out", [1, 2].map((inputs) => readInput(inputs, "X")[0])]]);',
    )(readInput) as (...a: never[]) => unknown;
    expect(deriveAutoEmit(ts, impl)).toBeNull();
  });

  it('still auto-emits when a nested lambda does NOT shadow the input param', async () => {
    const ts = await loadTs();
    // The inner arrow binds `element`, not `inputs`, so the outer `readInput(inputs,
    // "X")[0]` is a genuine node-input read and stays auto-emittable.
    const impl = new Function(
      'readInput',
      'return (inputs) => new Map([["Out", [1, 2].map((element) => element + readInput(inputs, "X")[0])]]);',
    )(readInput) as (...a: never[]) => unknown;
    const emit = deriveAutoEmit(ts, impl);
    expect(emit).not.toBeNull();
    expect(
      emit!({
        inputs: { X: 'src' },
        inputsAll: { X: '[src]' },
        outputs: ['Out'],
        nodeId: 'n',
        language: 'javascript',
      }),
    ).toEqual({ Out: '[1, 2].map((element) => element + (src))' });
  });

  it('handles a non-identifier handle name (spaces) without corrupting the emit', async () => {
    const ts = await loadTs();
    // The handle name "Color A" is not identifier-safe; placeholders must be keyed
    // by index, not by the raw name, or the emit recovers a truncated handle.
    const impl = new Function(
      'readInput',
      'return (inputs) => new Map([["Mixed", readInput(inputs, "Color A")[0]]]);',
    )(readInput) as (...a: never[]) => unknown;
    const emit = deriveAutoEmit(ts, impl);
    expect(emit).not.toBeNull();
    expect(
      emit!({
        inputs: { 'Color A': 'src' },
        inputsAll: { 'Color A': '[src]' },
        outputs: ['Mixed'],
        nodeId: 'n',
        language: 'javascript',
      }),
    ).toEqual({ Mixed: '(src)' });
  });
});
