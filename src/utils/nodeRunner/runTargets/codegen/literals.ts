/**
 * Render a runtime value as a JavaScript literal for the emitted code. JSON-safe
 * data round-trips via `JSON.stringify`; `undefined` and non-JSON values
 * (functions, symbols, bigint) fall back to `undefined` — a documented v1
 * boundary, since node input defaults are UI values and effectively always
 * JSON-safe.
 */
function toLiteral(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 'undefined' : json;
  } catch {
    return 'undefined';
  }
}

export { toLiteral };
