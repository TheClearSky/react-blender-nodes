import { parse, formatHex } from 'culori';

/**
 * Canonicalize any CSS color string to lowercase sRGB hex (`#rrggbb`), or
 * `undefined` if it cannot be parsed. This is the ONE definition of a valid
 * stored user-zone color: the picker can emit `rgb()`/`oklch()`/uppercase-hex and
 * defaults/imports vary in case, and all collapse here so (a) the
 * `UPDATE_USER_ZONE` validator never silently drops a legitimate recolor and
 * (b) a no-change recolor compares equal instead of dispatching a phantom edit.
 *
 * `formatHex` (not `formatHex8`) intentionally drops alpha — a user zone's frame
 * opacity is overlay-owned (`fillOpacity={0.1}` in `ZoneFrameOverlay`), so
 * `#rrggbb` is the canonical stored form. It also channel-clamps out-of-sRGB
 * inputs, and is EXACT (idempotent) for in-gamut hex — matching the picker's own
 * `formatColor(_, 'hex')` output lowercased.
 */
function normalizeZoneColor(color: string | undefined): string | undefined {
  if (typeof color !== 'string' || color.trim() === '') return undefined;
  const parsed = parse(color.trim());
  if (!parsed) return undefined;
  return formatHex(parsed) ?? undefined;
}

export { normalizeZoneColor };
