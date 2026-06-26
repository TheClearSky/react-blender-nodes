/**
 * Pick a unique default handle name like `input1`, `input2`, … for a new
 * boundary handle.
 *
 * Dedupes against `takenNames`; `startIndex` seeds the numeric suffix (defaults
 * to one past the taken count). Shared by the Graph I/O editor drawer
 * (`GraphIOEditDrawer`) and the state-layer auto-name path in
 * `growSpareAndPropagateBoundaryHandle` (root inference with rename disabled),
 * so the two never drift on what `input{n}` means.
 */
function nextDefaultHandleName(
  base: string,
  takenNames: ReadonlyArray<string>,
  startIndex?: number,
): string {
  const taken = new Set(takenNames);
  let index = startIndex ?? takenNames.length + 1;
  let candidate = `${base}${index}`;
  while (taken.has(candidate)) {
    index += 1;
    candidate = `${base}${index}`;
  }
  return candidate;
}

export { nextDefaultHandleName };
