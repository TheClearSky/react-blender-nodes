/** Small numeric helpers shared across the ColorPicker lib. */

/** Clamp a number to the inclusive [lo, hi] range. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Round a number to `precision` decimal places. */
export function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/** Wrap a number into the [0, mod) range (e.g. hue degrees). */
export function wrap(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}
