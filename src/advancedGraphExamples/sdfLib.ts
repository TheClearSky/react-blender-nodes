// ─────────────────────────────────────────────────────
// 2D signed-distance-field library for the SDF Shape Studio story.
//
// Pure math — no React, no DOM types beyond Uint8ClampedArray — so every
// formula is unit-testable in node. Formulas are JS ports of Inigo Quilez's
// canonical 2D distance functions (https://iquilezles.org/articles/distfunctions2d/),
// boolean/smooth operators (https://iquilezles.org/articles/distfunctions/),
// smooth-minimum operators (https://iquilezles.org/articles/smin/), and the
// artifact-free domain-repetition forms (https://iquilezles.org/articles/sdfrepetition/).
// Convention: d < 0 inside, d > 0 outside, d = 0 on the boundary; exact SDFs
// have |∇d| = 1, which is what makes the cheap CPU anti-aliasing below valid.
//
// Besides distance fields this module defines the story's MASK values —
// binary black/white images as lazy boolean fields (`(x,y) => boolean`,
// produced by thresholding a distance field) — and pixel MEASUREMENTS
// (white/black/brightness counts and ratios over a fixed deterministic
// sampling grid), which return plain numbers that can drive other params.
//
// GLSL→JS porting traps (deliberate, tested):
// - GLSL `atan(y-ish, x-ish)` two-arg form maps to `Math.atan2` with the SAME
//   argument order the shader used — sdStar uses `atan(p.x, p.y)` = angle from
//   the +y axis, so the port is `Math.atan2(x, y)`.
// - GLSL `mod(x, y)` is floor-mod; JS `%` is remainder (wrong for negatives).
// - Scalar `Math.sqrt(x*x + y*y)` beats `Math.hypot` by ~5-10x in V8.
// ─────────────────────────────────────────────────────

/** A 2D signed distance field: world-space point → signed distance. */
type Sdf2d = (x: number, y: number) => number;

/** The value flowing along `sdf` edges. `fn` is non-serializable by design —
 *  exported recordings strip it, so consumers null-guard (see the story). */
type SdfValue = {
  kind: 'sdf2d';
  fn: Sdf2d;
};

/** The "nothing" field: infinitely far from everything. Union identity;
 *  the mandated stand-in for unconnected operator inputs. */
const EMPTY_SDF: Sdf2d = () => Number.POSITIVE_INFINITY;

function makeSdfValue(fn: Sdf2d): SdfValue {
  return { kind: 'sdf2d', fn };
}

/** Runtime guard for values arriving over edges / from recorded steps. */
function isSdfValue(value: unknown): value is SdfValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as SdfValue).kind === 'sdf2d' &&
    typeof (value as SdfValue).fn === 'function'
  );
}

/** A 2D binary mask: world-space point → white (true) / black (false). */
type Mask2d = (x: number, y: number) => boolean;

/** The value flowing along `mask` edges — a lazy black/white image, closure-
 *  valued exactly like `SdfValue` (and equally non-serializable). */
type MaskValue = {
  kind: 'mask2d';
  fn: Mask2d;
};

/** The "nothing" mask: black everywhere. What an unconnected mask input
 *  degenerates to. */
const EMPTY_MASK: Mask2d = () => false;

function makeMaskValue(fn: Mask2d): MaskValue {
  return { kind: 'mask2d', fn };
}

function isMaskValue(value: unknown): value is MaskValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as MaskValue).kind === 'mask2d' &&
    typeof (value as MaskValue).fn === 'function'
  );
}

// ── small math helpers ────────────────────────────────

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** GLSL floor-mod. Mathematically in [0, modulus) for positive modulus, but
 *  float rounding can return `modulus` ITSELF when |value| ≪ ulp(modulus)
 *  (e.g. `glslMod(-1e-16, 3) === 3`) — harmless for the trig consumers here
 *  (angles are 2π-periodic), so it is documented rather than folded. */
function glslMod(value: number, modulus: number): number {
  return value - modulus * Math.floor(value / modulus);
}

// ── primitives ────────────────────────────────────────

/** Circle of radius r centered at the origin. Exact. */
function sdfCircle(radius: number): Sdf2d {
  const r = Math.max(radius, 1e-6);
  return (x, y) => Math.sqrt(x * x + y * y) - r;
}

/** Axis-aligned box with half-extents (halfWidth, halfHeight). Exact,
 *  including the corner regions. */
function sdfBox(halfWidth: number, halfHeight: number): Sdf2d {
  const bx = Math.max(halfWidth, 1e-6);
  const by = Math.max(halfHeight, 1e-6);
  return (x, y) => {
    const dx = Math.abs(x) - bx;
    const dy = Math.abs(y) - by;
    const outsideX = Math.max(dx, 0);
    const outsideY = Math.max(dy, 0);
    const outside = Math.sqrt(outsideX * outsideX + outsideY * outsideY);
    const inside = Math.min(Math.max(dx, dy), 0);
    return outside + inside;
  };
}

/** N-pointed star. `points` is rounded and clamped ≥ 3; `pointiness` m is
 *  clamped into [2, n] (m→2 = spiky, m→n = regular n-gon). Tips lie on the
 *  radius along +y for angle 0. Exact. */
function sdfStar(radius: number, points: number, pointiness: number): Sdf2d {
  const r = Math.max(radius, 1e-6);
  const n = Math.max(3, Math.round(points));
  const m = clamp(pointiness, 2, n);
  const an = Math.PI / n;
  const en = Math.PI / m;
  const acsX = Math.cos(an);
  const acsY = Math.sin(an);
  const ecsX = Math.cos(en);
  const ecsY = Math.sin(en);
  return (x, y) => {
    // GLSL: bn = mod(atan(p.x, p.y), 2*an) - an  (angle from the +y axis)
    const bn = glslMod(Math.atan2(x, y), 2 * an) - an;
    const len = Math.sqrt(x * x + y * y);
    let px = len * Math.cos(bn);
    let py = len * Math.abs(Math.sin(bn));
    px -= r * acsX;
    py -= r * acsY;
    const t = clamp(-(px * ecsX + py * ecsY), 0, (r * acsY) / ecsY);
    px += ecsX * t;
    py += ecsY * t;
    return Math.sqrt(px * px + py * py) * Math.sign(px);
  };
}

/** Box with one uniform rounded-corner radius, clamped into [0, min(b)] so a
 *  slider can't invert the shape. Exact. */
function sdfRoundedBox(
  halfWidth: number,
  halfHeight: number,
  cornerRadius: number,
): Sdf2d {
  const bx = Math.max(halfWidth, 1e-6);
  const by = Math.max(halfHeight, 1e-6);
  const cr = clamp(cornerRadius, 0, Math.min(bx, by));
  return (x, y) => {
    const qx = Math.abs(x) - bx + cr;
    const qy = Math.abs(y) - by + cr;
    const outsideX = Math.max(qx, 0);
    const outsideY = Math.max(qy, 0);
    return (
      Math.min(Math.max(qx, qy), 0) +
      Math.sqrt(outsideX * outsideX + outsideY * outsideY) -
      cr
    );
  };
}

/** Regular flat-top hexagon; `radius` is the INRADIUS (flat side at y = ±r).
 *  Exact. */
function sdfHexagon(radius: number): Sdf2d {
  const r = Math.max(radius, 1e-6);
  const kx = -0.866025404;
  const ky = 0.5;
  const kz = 0.577350269;
  return (x, y) => {
    let px = Math.abs(x);
    let py = Math.abs(y);
    const reflect = 2 * Math.min(kx * px + ky * py, 0);
    px -= reflect * kx;
    py -= reflect * ky;
    px -= clamp(px, -kz * r, kz * r);
    py -= r;
    return Math.sqrt(px * px + py * py) * Math.sign(py);
  };
}

/** Equilateral triangle pointing UP; `radius` is the half-width of the base
 *  (base edge at y = −r/√3). Exact. */
function sdfTriangle(radius: number): Sdf2d {
  const r = Math.max(radius, 1e-6);
  const k = Math.sqrt(3);
  return (x, y) => {
    let px = Math.abs(x) - r;
    let py = y + r / k;
    if (px + k * py > 0) {
      const foldedX = (px - k * py) / 2;
      const foldedY = (-k * px - py) / 2;
      px = foldedX;
      py = foldedY;
    }
    px -= clamp(px, -2 * r, 0);
    return -Math.sqrt(px * px + py * py) * Math.sign(py);
  };
}

/** Vesica piscis (lens of two circles of radius r whose centers sit 2·d
 *  apart). `distance` is clamped into (0, r) — d→0 degenerates to the circle.
 *  Exact. */
function sdfVesica(radius: number, distance: number): Sdf2d {
  const r = Math.max(radius, 1e-6);
  const d = clamp(distance, 1e-6, r * 0.999);
  const b = Math.sqrt(r * r - d * d);
  return (x, y) => {
    const px = Math.abs(x);
    const py = Math.abs(y);
    if ((py - b) * d > px * b) {
      // Closest feature is the lens tip (0, b).
      const tipDx = px;
      const tipDy = py - b;
      return Math.sqrt(tipDx * tipDx + tipDy * tipDy);
    }
    const arcDx = px + d;
    return Math.sqrt(arcDx * arcDx + py * py) - r;
  };
}

/** Crescent moon: outer disk of radius `outerRadius` minus an inner disk of
 *  radius `innerRadius` centered `offset` to the right. Exact.
 *
 *  Degenerate regime (`innerRadius ≥ outerRadius + offset`, i.e. the inner
 *  disk swallows the outer): the true moon is EMPTY, but the IQ formula's
 *  corner branch then points at a phantom corner and draws a spurious
 *  zero-contour dot — so this returns the EMPTY field instead. */
function sdfMoon(
  offset: number,
  outerRadius: number,
  innerRadius: number,
): Sdf2d {
  const d = Math.max(offset, 1e-6);
  const ra = Math.max(outerRadius, 1e-6);
  const rb = Math.max(innerRadius, 1e-6);
  if (rb >= ra + d) return EMPTY_SDF;
  const a = (ra * ra - rb * rb + d * d) / (2 * d);
  const b = Math.sqrt(Math.max(ra * ra - a * a, 0));
  return (x, y) => {
    const py = Math.abs(y);
    if (d * (x * b - py * a) > d * d * Math.max(b - py, 0)) {
      const cornerDx = x - a;
      const cornerDy = py - b;
      return Math.sqrt(cornerDx * cornerDx + cornerDy * cornerDy);
    }
    const outer = Math.sqrt(x * x + py * py) - ra;
    const innerDx = x - d;
    const inner = Math.sqrt(innerDx * innerDx + py * py) - rb;
    return Math.max(outer, -inner);
  };
}

/** Pie slice opening along +y; `apertureDegrees` is the HALF-angle of the
 *  aperture (clamped into (0°, 180°)). Exact. */
function sdfPie(apertureDegrees: number, radius: number): Sdf2d {
  const r = Math.max(radius, 1e-6);
  const halfAngle = (clamp(apertureDegrees, 0.5, 179.5) * Math.PI) / 180;
  const cx = Math.sin(halfAngle);
  const cy = Math.cos(halfAngle);
  return (x, y) => {
    const px = Math.abs(x);
    const l = Math.sqrt(px * px + y * y) - r;
    const t = clamp(px * cx + y * cy, 0, r);
    const mx = px - cx * t;
    const my = y - cy * t;
    const m = Math.sqrt(mx * mx + my * my);
    return Math.max(l, m * Math.sign(cy * px - cx * y));
  };
}

/** Heart, centered at the origin (IQ's unit heart spans y∈[0,1], recentered
 *  by −0.5 and uniformly scaled by `size`). Exact. */
function sdfHeart(size: number): Sdf2d {
  const s = Math.max(size, 1e-6);
  const cornerX = 0.25;
  const cornerY = 0.75;
  const cornerRadius = Math.sqrt(2) / 4;
  return (x, y) => {
    const px = Math.abs(x / s);
    const py = y / s + 0.5;
    if (py + px > 1) {
      const dx = px - cornerX;
      const dy = py - cornerY;
      return (Math.sqrt(dx * dx + dy * dy) - cornerRadius) * s;
    }
    const topDx = px;
    const topDy = py - 1;
    const diagonal = 0.5 * Math.max(px + py, 0);
    const diagDx = px - diagonal;
    const diagDy = py - diagonal;
    const nearest = Math.min(
      topDx * topDx + topDy * topDy,
      diagDx * diagDx + diagDy * diagDy,
    );
    return Math.sqrt(nearest) * Math.sign(px - py) * s;
  };
}

// ── boolean operators ─────────────────────────────────

/** Union: min(a, b). Exact outside, a bound inside. */
function sdfUnion(a: Sdf2d, b: Sdf2d): Sdf2d {
  return (x, y) => Math.min(a(x, y), b(x, y));
}

/** Subtraction: carve `a` OUT OF `b` — max(-a, b). A bound. */
function sdfSubtract(a: Sdf2d, b: Sdf2d): Sdf2d {
  return (x, y) => Math.max(-a(x, y), b(x, y));
}

/** Intersection: max(a, b). A bound. */
function sdfIntersect(a: Sdf2d, b: Sdf2d): Sdf2d {
  return (x, y) => Math.max(a(x, y), b(x, y));
}

/** Symmetric difference: in exactly one of a/b —
 *  max(min(a,b), −max(a,b)). Exact (exterior). */
function sdfXor(a: Sdf2d, b: Sdf2d): Sdf2d {
  return (x, y) => {
    const da = a(x, y);
    const db = b(x, y);
    return Math.max(Math.min(da, db), -Math.max(da, db));
  };
}

/** Scalar quadratic-polynomial smooth minimum (IQ). k = blend radius in
 *  field units; the caller clamps k away from 0. C1-continuous.
 *
 *  Non-finite operands (the EMPTY field is +∞) degenerate to plain `min`:
 *  the blended form would compute `∞ · 0 = NaN` through its mix weights,
 *  turning the whole downstream field into NaN — and smin ≡ min whenever
 *  |da − db| ≥ k anyway, which an infinite operand always satisfies. */
function smoothMin(da: number, db: number, k: number): number {
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Math.min(da, db);
  const h = clamp(0.5 + (0.5 * (db - da)) / k, 0, 1);
  // mix(db, da, h) - k*h*(1-h)
  return db * (1 - h) + da * h - k * h * (1 - h);
}

/** Smooth union. k = blend radius (~0.05–0.3 at our world scale); clamped
 *  away from 0. Interior distances become a bound (fills render fine,
 *  isolines inside the blend region are approximate). */
function sdfSmoothUnion(a: Sdf2d, b: Sdf2d, blendRadius: number): Sdf2d {
  const k = Math.max(blendRadius, 1e-4);
  return (x, y) => smoothMin(a(x, y), b(x, y), k);
}

/** Smooth subtraction: carve `a` out of `b` with a fillet —
 *  −smin(a, −b, k). A bound. */
function sdfSmoothSubtract(a: Sdf2d, b: Sdf2d, blendRadius: number): Sdf2d {
  const k = Math.max(blendRadius, 1e-4);
  return (x, y) => -smoothMin(a(x, y), -b(x, y), k);
}

/** Smooth intersection: −smin(−a, −b, k). A bound. */
function sdfSmoothIntersect(a: Sdf2d, b: Sdf2d, blendRadius: number): Sdf2d {
  const k = Math.max(blendRadius, 1e-4);
  return (x, y) => -smoothMin(-a(x, y), -b(x, y), k);
}

// ── shape modifiers (warp the DISTANCE, not the domain) ──

/** Round: dilate the shape by `radius` (d − r). Positive grows/rounds,
 *  negative erodes. Exact on exact fields. */
function sdfRound(child: Sdf2d, radius: number): Sdf2d {
  return (x, y) => child(x, y) - radius;
}

/** Onion: hollow the shape into a shell of `thickness` (|d| − t). Exact. */
function sdfOnion(child: Sdf2d, thickness: number): Sdf2d {
  const t = Math.max(thickness, 1e-6);
  return (x, y) => Math.abs(child(x, y)) - t;
}

// ── domain transforms (warp p BEFORE the child) ───────

/** Translate the field by (tx, ty). Exact. */
function sdfTranslate(child: Sdf2d, tx: number, ty: number): Sdf2d {
  return (x, y) => child(x - tx, y - ty);
}

/** Rotate the field by `degrees` counter-clockwise. Exact (rotation is an
 *  isometry — rotating a circle is the identity). */
function sdfRotate(child: Sdf2d, degrees: number): Sdf2d {
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  // Evaluate the child at the INVERSELY-rotated point.
  return (x, y) => child(c * x + s * y, -s * x + c * y);
}

/** UNIFORM scale by `factor`. `d(p/s) * s` — the multiply restores metric
 *  correctness (non-uniform scale has no such correction and would break the
 *  SDF, so it is deliberately not offered). Clamped away from 0. Negative
 *  factors are allowed and act as scale + 180° point reflection (the |s|
 *  correction keeps the metric true). */
function sdfScale(child: Sdf2d, factor: number): Sdf2d {
  const s = Math.abs(factor) < 1e-4 ? (factor < 0 ? -1e-4 : 1e-4) : factor;
  return (x, y) => child(x / s, y / s) * Math.abs(s);
}

/** Mirror across the y-axis: the x>0 half of the field appears on both
 *  sides (IQ opSymX). Exact — including ON the seam — when the child's
 *  content lies in x ≥ 0; content at x < 0 is DISCARDED, and its residual
 *  distance values can under-report (not even a conservative bound), so keep
 *  mirrored content in the positive half-plane (compose with Translate). */
function sdfMirrorX(child: Sdf2d): Sdf2d {
  return (x, y) => child(Math.abs(x), y);
}

/** Mirror across the x-axis: the y>0 half appears on both sides. Same
 *  content-must-be-positive-half precondition as `sdfMirrorX`. */
function sdfMirrorY(child: Sdf2d): Sdf2d {
  return (x, y) => child(x, Math.abs(y));
}

/** Infinite grid repetition with cell size (cellX, cellY) — the ARTIFACT-FREE
 *  form: the naive `round(p/s)` mod fails whenever the nearest instance sits
 *  in a neighboring tile, so the distance is taken as the min over the 2×2
 *  sign-selected neighbor tiles (IQ sdfrepetition). Exact for shapes that fit
 *  their cell; a tight bound otherwise. */
function sdfRepeat(child: Sdf2d, cellX: number, cellY: number): Sdf2d {
  const sx = Math.max(cellX, 1e-3);
  const sy = Math.max(cellY, 1e-3);
  return (x, y) => {
    const idX = Math.round(x / sx);
    const idY = Math.round(y / sy);
    const neighborX = Math.sign(x - sx * idX) || 1;
    const neighborY = Math.sign(y - sy * idY) || 1;
    let d = Number.POSITIVE_INFINITY;
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const tileX = idX + i * neighborX;
        const tileY = idY + j * neighborY;
        d = Math.min(d, child(x - sx * tileX, y - sy * tileY));
      }
    }
    return d;
  };
}

/** Polar repetition: `count` rotated copies of the field around the origin
 *  (compose with Translate to move the shape off-center first). Evaluates the
 *  TWO adjacent angular sectors — the polar analog of the neighbor-tile fix
 *  (IQ sdfrepetition). */
function sdfRadialRepeat(child: Sdf2d, count: number): Sdf2d {
  const copies = Math.max(1, Math.round(count));
  const sectorAngle = (2 * Math.PI) / copies;
  // Rotations are 2π-periodic in the sector index, so the per-pixel cos/sin
  // pairs memoize into `copies` entries (indexed by floor-mod of the index).
  const rotations = Array.from({ length: copies }, (_, index) => {
    const rotation = sectorAngle * index;
    return { c: Math.cos(rotation), s: Math.sin(rotation) };
  });
  return (x, y) => {
    const angle = Math.atan2(y, x);
    const sectorIndex = Math.floor(angle / sectorAngle);
    let d = Number.POSITIVE_INFINITY;
    for (const index of [sectorIndex, sectorIndex + 1]) {
      const wrapped = ((index % copies) + copies) % copies;
      const { c, s } = rotations[wrapped];
      d = Math.min(d, child(c * x + s * y, -s * x + c * y));
    }
    return d;
  };
}

// ── masks (field → black/white image) ─────────────────

/** White where the field is BELOW the threshold (inside, for threshold 0). */
function maskLessThan(field: Sdf2d, threshold: number): Mask2d {
  return (x, y) => field(x, y) < threshold;
}

/** White where the field is ABOVE the threshold (outside, for threshold 0). */
function maskGreaterThan(field: Sdf2d, threshold: number): Mask2d {
  return (x, y) => field(x, y) > threshold;
}

// ── measurements (image → numbers) ────────────────────

/** The fixed deterministic sampling grid every measurement uses: pixel
 *  centers of a MEASURE_RESOLUTION² raster over the given world rect — the
 *  same convention as the preview renderers, so "pixels" is an honest unit. */
const MEASURE_RESOLUTION = 220;

type MaskMeasurement = {
  whitePixels: number;
  blackPixels: number;
  whiteRatio: number;
};

/** Count white/black pixels of a mask over the sampling grid. */
function measureMask(
  mask: Mask2d,
  worldRect: WorldRect = PREVIEW_WORLD_RECT,
  resolution: number = MEASURE_RESOLUTION,
): MaskMeasurement {
  const size = Math.max(8, Math.round(resolution));
  // Early-out for the EMPTY constant only (reference check — a wrapped
  // always-false closure still samples): an optimization, not a guarantee.
  if (mask === EMPTY_MASK) {
    return { whitePixels: 0, blackPixels: size * size, whiteRatio: 0 };
  }
  const worldWidth = worldRect.maxX - worldRect.minX;
  const worldHeight = worldRect.maxY - worldRect.minY;
  let whitePixels = 0;
  for (let row = 0; row < size; row++) {
    const worldY = worldRect.maxY - ((row + 0.5) / size) * worldHeight;
    for (let col = 0; col < size; col++) {
      const worldX = worldRect.minX + ((col + 0.5) / size) * worldWidth;
      if (mask(worldX, worldY)) whitePixels++;
    }
  }
  const totalPixels = size * size;
  return {
    whitePixels,
    blackPixels: totalPixels - whitePixels,
    whiteRatio: whitePixels / totalPixels,
  };
}

/** Perceptual pixel brightness of a field: 1 inside the shape, decaying as
 *  exp(−6·d) outside — the same falloff constant the debug view and the
 *  Render glow use, so the number matches what the previews show. */
function brightnessOfDistance(d: number): number {
  return d <= 0 ? 1 : Math.exp(-6 * d);
}

type BrightnessMeasurement = {
  brightPixels: number;
  brightRatio: number;
};

/** Count pixels whose brightness is at or above `threshold` (a 0..1 ratio;
 *  clamped — 0.5 ≈ the shape plus a ~0.12-unit glow band, 1 ≈ inside only). */
function measureBrightness(
  field: Sdf2d,
  threshold: number,
  worldRect: WorldRect = PREVIEW_WORLD_RECT,
  resolution: number = MEASURE_RESOLUTION,
): BrightnessMeasurement {
  const size = Math.max(8, Math.round(resolution));
  // Same reference-only early-out as measureMask.
  if (field === EMPTY_SDF) return { brightPixels: 0, brightRatio: 0 };
  const minimumBrightness = clamp(threshold, 1e-6, 1);
  const worldWidth = worldRect.maxX - worldRect.minX;
  const worldHeight = worldRect.maxY - worldRect.minY;
  let brightPixels = 0;
  for (let row = 0; row < size; row++) {
    const worldY = worldRect.maxY - ((row + 0.5) / size) * worldHeight;
    for (let col = 0; col < size; col++) {
      const worldX = worldRect.minX + ((col + 0.5) / size) * worldWidth;
      if (brightnessOfDistance(field(worldX, worldY)) >= minimumBrightness) {
        brightPixels++;
      }
    }
  }
  return {
    brightPixels,
    brightRatio: brightPixels / (size * size),
  };
}

// ── rendering (CPU, pure) ─────────────────────────────

type WorldRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** The canonical preview view: a square window where r≈0.4 shapes read at
 *  roughly a third of the panel and composed scenes still fit. */
const PREVIEW_WORLD_RECT: WorldRect = {
  minX: -1.2,
  minY: -1.2,
  maxX: 1.2,
  maxY: 1.2,
};

type SdfRenderStyle =
  | { mode: 'debug' }
  | { mode: 'filled'; palette: number; glow: number };

/** IQ cosine palette: a + b·cos(2π(c·t + d)) per channel, 0..255. */
function cosinePalette(
  t: number,
  presetIndex: number,
): [number, number, number] {
  // [a, b, c, d] per channel; presets from https://iquilezles.org/articles/palettes/
  const presets: ReadonlyArray<
    readonly [number[], number[], number[], number[]]
  > = [
    [
      [0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [1, 1, 1],
      [0.0, 0.33, 0.67],
    ],
    [
      [0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [1, 1, 1],
      [0.0, 0.1, 0.2],
    ],
    [
      [0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [1, 1, 1],
      [0.3, 0.2, 0.2],
    ],
    [
      [0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [1, 0.7, 0.4],
      [0.0, 0.15, 0.2],
    ],
  ];
  // NaN survives clamp (`clamp(NaN,…) = NaN`) and would index `undefined`,
  // making this the library's only throwing path — guard to preset 0.
  const preset =
    presets[
      Number.isFinite(presetIndex)
        ? clamp(Math.round(presetIndex), 0, presets.length - 1)
        : 0
    ];
  const out: [number, number, number] = [0, 0, 0];
  for (let channel = 0; channel < 3; channel++) {
    const value =
      preset[0][channel] +
      preset[1][channel] *
        Math.cos(2 * Math.PI * (preset[2][channel] * t + preset[3][channel]));
    out[channel] = Math.round(clamp(value, 0, 1) * 255);
  }
  return out;
}

/**
 * The single sampling authority: evaluate `fn` over `worldRect` into an RGBA
 * pixel buffer (row-major, top row first, y-DOWN in pixels mapped to y-UP in
 * world space). Returns a `Uint8ClampedArray` of length size*size*4 — the
 * caller wraps it in `ImageData` (kept out of here so node unit tests need no
 * DOM).
 *
 * - `debug` = the canonical IQ field visualization: orange outside / blue
 *   inside, exponential falloff near the surface, cosine isoline bands, a
 *   crisp white zero-contour.
 * - `filled` = anti-aliased fill colored by a cosine palette of the distance,
 *   plus an exponential outer glow. CPU AA needs no derivatives: exact SDFs
 *   have |∇d| = 1, so alpha = clamp(0.5 − d/pixelSize, 0, 1).
 */
function renderSdfToPixels(
  fn: Sdf2d,
  worldRect: WorldRect,
  sizePx: number,
  style: SdfRenderStyle,
): Uint8ClampedArray<ArrayBuffer> {
  const size = Math.max(8, Math.round(sizePx));
  const pixels = new Uint8ClampedArray(size * size * 4);
  const worldWidth = worldRect.maxX - worldRect.minX;
  const worldHeight = worldRect.maxY - worldRect.minY;
  const pixelSize = worldWidth / size;
  // Preview-tuned isoline frequency (research: ~60-100 at ~220px so the
  // bands don't alias).
  const isolineFrequency = 80;

  for (let row = 0; row < size; row++) {
    // Pixel row 0 is the TOP of the canvas = world maxY (y-up world).
    const worldY = worldRect.maxY - ((row + 0.5) / size) * worldHeight;
    for (let col = 0; col < size; col++) {
      const worldX = worldRect.minX + ((col + 0.5) / size) * worldWidth;
      const d = fn(worldX, worldY);
      const offset = (row * size + col) * 4;

      if (style.mode === 'debug') {
        // Orange outside, blue inside (IQ's signature debug look).
        let r = d > 0 ? 0.9 : 0.65;
        let g = d > 0 ? 0.6 : 0.85;
        let b = d > 0 ? 0.3 : 1.0;
        // The EMPTY field is +∞ and cos(∞) is NaN — same guard as the filled
        // branch's palette input, so the far field keeps its dim orange.
        const bandDistance = Number.isFinite(d) ? d : 1e6;
        const falloff =
          1 - Math.exp(-6 * Math.min(Math.abs(bandDistance), 1e6));
        const bands = 0.8 + 0.2 * Math.cos(isolineFrequency * bandDistance);
        r *= falloff * bands;
        g *= falloff * bands;
        b *= falloff * bands;
        // Crisp white zero-contour.
        const edge = 1 - clamp(Math.abs(d) / 0.015, 0, 1);
        r = r * (1 - edge) + edge;
        g = g * (1 - edge) + edge;
        b = b * (1 - edge) + edge;
        pixels[offset] = Math.round(clamp(r, 0, 1) * 255);
        pixels[offset + 1] = Math.round(clamp(g, 0, 1) * 255);
        pixels[offset + 2] = Math.round(clamp(b, 0, 1) * 255);
        pixels[offset + 3] = 255;
      } else {
        // Anti-aliased fill + palette + outer glow on a dark ground.
        const alpha = clamp(0.5 - d / pixelSize, 0, 1);
        // The EMPTY field is +∞ and cos(∞) is NaN — clamp the palette input
        // so the far ground keeps its dark color instead of going black.
        const paletteDistance = Number.isFinite(d) ? d : 1e6;
        const [pr, pg, pb] = cosinePalette(paletteDistance, style.palette);
        const glow =
          style.glow > 0 ? Math.exp(-8 * Math.max(d, 0)) * style.glow : 0;
        const groundR = 16 + 90 * glow * (pr / 255);
        const groundG = 16 + 90 * glow * (pg / 255);
        const groundB = 20 + 90 * glow * (pb / 255);
        pixels[offset] = Math.round(pr * alpha + groundR * (1 - alpha));
        pixels[offset + 1] = Math.round(pg * alpha + groundG * (1 - alpha));
        pixels[offset + 2] = Math.round(pb * alpha + groundB * (1 - alpha));
        pixels[offset + 3] = 255;
      }
    }
  }
  return pixels;
}

/** Render a mask to a binary black/white RGBA buffer (same pixel-center and
 *  row conventions as `renderSdfToPixels`). */
function renderMaskToPixels(
  fn: Mask2d,
  worldRect: WorldRect,
  sizePx: number,
): Uint8ClampedArray<ArrayBuffer> {
  const size = Math.max(8, Math.round(sizePx));
  const pixels = new Uint8ClampedArray(size * size * 4);
  const worldWidth = worldRect.maxX - worldRect.minX;
  const worldHeight = worldRect.maxY - worldRect.minY;
  for (let row = 0; row < size; row++) {
    const worldY = worldRect.maxY - ((row + 0.5) / size) * worldHeight;
    for (let col = 0; col < size; col++) {
      const worldX = worldRect.minX + ((col + 0.5) / size) * worldWidth;
      const white = fn(worldX, worldY) ? 255 : 0;
      const offset = (row * size + col) * 4;
      pixels[offset] = white;
      pixels[offset + 1] = white;
      pixels[offset + 2] = white;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

// `clamp`, `smoothMin`, and `cosinePalette` are deliberately NOT exported —
// they are internal helpers with no external consumer (the export list is
// the module's tested/consumed API).
export {
  EMPTY_SDF,
  EMPTY_MASK,
  PREVIEW_WORLD_RECT,
  MEASURE_RESOLUTION,
  makeSdfValue,
  isSdfValue,
  makeMaskValue,
  isMaskValue,
  glslMod,
  sdfCircle,
  sdfBox,
  sdfStar,
  sdfRoundedBox,
  sdfHexagon,
  sdfTriangle,
  sdfVesica,
  sdfMoon,
  sdfPie,
  sdfHeart,
  sdfUnion,
  sdfSubtract,
  sdfIntersect,
  sdfXor,
  sdfSmoothUnion,
  sdfSmoothSubtract,
  sdfSmoothIntersect,
  sdfRound,
  sdfOnion,
  sdfTranslate,
  sdfRotate,
  sdfScale,
  sdfMirrorX,
  sdfMirrorY,
  sdfRepeat,
  sdfRadialRepeat,
  maskLessThan,
  maskGreaterThan,
  measureMask,
  brightnessOfDistance,
  measureBrightness,
  renderSdfToPixels,
  renderMaskToPixels,
};
export type {
  Sdf2d,
  SdfValue,
  Mask2d,
  MaskValue,
  WorldRect,
  SdfRenderStyle,
  MaskMeasurement,
  BrightnessMeasurement,
};
