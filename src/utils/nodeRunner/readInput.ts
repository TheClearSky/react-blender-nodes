// `readInput` — the recommended way for node implementations to read an input
// handle (codegen-v2 §5.4). Returns the handle's value ARRAY: every connected
// value (fan-in aware), or `[bakedDefault]` when unconnected. Authors index it
// (`readInput(inputs, 'A')[0]` for the first value) or use the whole array for
// fan-in.
//
// It is a codegen-RECOGNIZED intrinsic: an implementation whose inputs are read
// only through `readInput(inputs, '<handle>')[0]` (and is otherwise
// self-contained) is AUTO-EMITTED inline by the codegen run target
// (`analyzeImplementations`), instead of being threaded — see
// `runTargets/codegen/analyze/autoEmit.ts`. The in-process executor runs the
// exact same function, so parity holds in either path.

/** Minimal structural shape of one input handle's value (matches the runner). */
type ReadableInputHandle = {
  connections: ReadonlyArray<{ value: unknown }>;
  defaultValue?: unknown;
};

/**
 * Read a node input by handle name.
 *
 * @param inputs - The implementation's input map (handle name → value).
 * @param name - The input handle name.
 * @returns Every connected value (fan-in), or `[bakedDefault]` when unconnected.
 */
function readInput(
  inputs: ReadonlyMap<string, ReadableInputHandle>,
  name: string,
): unknown[] {
  const handle = inputs.get(name);
  return handle && handle.connections.length > 0
    ? handle.connections.map((connection) => connection.value)
    : [handle ? handle.defaultValue : undefined];
}

export { readInput };
export type { ReadableInputHandle };
