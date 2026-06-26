/**
 * Shared connection-order helpers for multi-connection (fan-in) input handles.
 *
 * A fan-in input handle resolves its incoming connections in an order persisted
 * per-edge as `edge.data.order`. Two readers must agree on that order — the
 * compiler (`compile`, the single point that fixes the order for the executor
 * AND every codegen target) and the reorder popover
 * (`InputConnectionOrderControl`). Both compare via `compareConnectionOrder` and
 * break ties on the same edges-array index, so the resolved order can never
 * drift between the on-screen preview, the runtime, and generated code.
 */

/**
 * Effective sort key for a connection's persisted order. Unset or out-of-contract
 * (`NaN`/`±Infinity`, e.g. from a hand-edited import) values map to `+∞` — a true
 * upper bound, so EVERY finite order (even a huge hand-edited one) sorts before
 * them and the "un-reordered ⇒ last" guarantee holds across the whole `number`
 * domain. Do not subtract two of these directly (see `compareConnectionOrder`).
 */
export function connectionOrderValue(order: number | undefined): number {
  return typeof order === 'number' && Number.isFinite(order)
    ? order
    : Number.POSITIVE_INFINITY;
}

/**
 * Sign-only comparator for two connection orders — the ONLY correct way to
 * compare them. Subtracting `connectionOrderValue` results is unsafe: with the
 * `+∞` sentinel, `connectionOrderValue(undefined) - connectionOrderValue(undefined)`
 * is `+∞ - +∞ = NaN`, and two un-reordered edges in one fan-in group (the common
 * back-compat case) both map to the sentinel — a `NaN` comparator return yields
 * an inconsistent sort and a garbage permutation. Returns `-1`/`0`/`1`; equal
 * orders (incl. both unset) tie, for the caller to break on the edges-array index
 * (the compiler's `edgeIndexById`, the popover's filtered index).
 */
export function compareConnectionOrder(
  firstOrder: number | undefined,
  secondOrder: number | undefined,
): number {
  const first = connectionOrderValue(firstOrder);
  const second = connectionOrderValue(secondOrder);
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

/**
 * Full fan-in comparator: connection order first (sign-only, via
 * `compareConnectionOrder`), then the edges-array index as an explicit, stable
 * tiebreak. The ONE rule the compiler, the reorder popover, and the import
 * normalizer all sort by, so resolved fan-in order is identical across the
 * on-screen preview, the runtime, and every codegen target.
 */
export function compareFanIn(
  firstOrder: number | undefined,
  firstIndex: number,
  secondOrder: number | undefined,
  secondIndex: number,
): number {
  return (
    compareConnectionOrder(firstOrder, secondOrder) || firstIndex - secondIndex
  );
}
