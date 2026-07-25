/**
 * Deep-copy PLAIN data (true `{}`-literals and arrays) into a fresh mutable
 * tree, passing every NON-PLAIN value — functions, class instances such as zod
 * `complexSchema`s, and any object whose prototype is not exactly
 * `Object.prototype` (including `Object.create(null)` map-likes) — through BY
 * REFERENCE, with identity preserved.
 *
 * This is the state pipeline's one sanctioned deep-clone for handle/node data
 * that may EMBED consumer data-type descriptors. The two obvious stand-ins are
 * both wrong for that data:
 *
 * - `structuredClone` THROWS `DataCloneError` on the first function it meets —
 *   and a zod schema's internals are functions. Any complex data type wired
 *   into a loop/switch/group infer slot used to kill the whole dispatch
 *   mid-`produce` (silently: an exception is not a validation rejection, so
 *   no toast — just a dead edge and a console error).
 * - lodash's `cloneDeep` "succeeds" and is worse: it rebuilds class instances
 *   (prototype kept, NEW identity). Edge validation compares `complexSchema`
 *   by REFERENCE identity ("data types are immutable singletons"), so a
 *   materialized handle carrying a schema COPY silently stops comparing equal
 *   to its own data type.
 *
 * The "non-plain ⇒ by reference" rule (instead of `instanceof z.ZodType`) is
 * deliberate: a consumer's schemas may come from a DIFFERENT bundled zod copy
 * whose classes fail our `instanceof`, and any other identity-bearing object
 * a consumer embeds deserves the same treatment. Plain objects and arrays —
 * the parts the ADD_EDGE apply steps mutate (handle rows, names) — are always
 * copied, so Immer gets a fresh mutable subtree even when the input was read
 * from the frozen committed state.
 *
 * Robustness, matching (and in one case exceeding) both predecessors:
 * - **Cycle-safe** — a `seen` WeakMap breaks self-referential plain data
 *   (`a.self = a`) that would otherwise recurse to a `RangeError` mid-produce
 *   (the exact silent-dead-dispatch class this helper exists to prevent), and
 *   it also de-duplicates shared plain subtrees the way `structuredClone` did.
 * - **`__proto__`-safe** — copies are built with `Object.defineProperty`, so
 *   an own enumerable `__proto__` key (produced by `JSON.parse` of an
 *   imported/replaced state) becomes a data property rather than triggering
 *   the `Object.prototype.__proto__` setter (which would re-parent the copy
 *   and drop the value).
 * - **own enumerable string AND symbol keys** are copied (via
 *   `Reflect.ownKeys` filtered to enumerable), so consumer values carrying
 *   symbol-keyed data round-trip; non-enumerable properties are intentionally
 *   dropped (they are metadata, never load-bearing handle data).
 */
function cloneDeepPreservingNonPlainObjects<T>(
  value: T,
  seen: WeakMap<object, unknown> = new WeakMap(),
): T {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value) as T;
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const element of value) {
      copy.push(cloneDeepPreservingNonPlainObjects(element, seen));
    }
    return copy as unknown as T;
  }

  // Only TRUE plain objects (prototype exactly `Object.prototype`) are deep
  // copied. Class instances (zod schemas), null-prototype map-likes, and any
  // exotic object pass by reference — no accidental re-parenting.
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  if (seen.has(value)) return seen.get(value) as T;

  const copy: Record<string | symbol, unknown> = {};
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable) continue;
    Object.defineProperty(copy, key, {
      value: cloneDeepPreservingNonPlainObjects(
        (value as Record<string | symbol, unknown>)[key as never],
        seen,
      ),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return copy as T;
}

export { cloneDeepPreservingNonPlainObjects };
