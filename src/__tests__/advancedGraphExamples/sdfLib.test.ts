import { describe, it, expect } from 'vitest';
import {
  EMPTY_SDF,
  EMPTY_MASK,
  PREVIEW_WORLD_RECT,
  glslMod,
  isSdfValue,
  makeSdfValue,
  isMaskValue,
  makeMaskValue,
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
} from '@/advancedGraphExamples/sdfLib';

const EPSILON = 1e-9;

describe('sdfLib — GLSL porting pins', () => {
  it('glslMod is floor-mod (JS % would return a negative remainder)', () => {
    // This exact difference breaks sdStar's angle folding if ported with %.
    expect(glslMod(-1, 3)).toBe(2);
    expect(-1 % 3).toBe(-1);
    expect(glslMod(7, 3)).toBe(1);
  });
});

describe('sdfLib — primitives (known points)', () => {
  it('circle: center, boundary, outside', () => {
    const circle = sdfCircle(1);
    expect(circle(0, 0)).toBeCloseTo(-1);
    expect(circle(1, 0)).toBeCloseTo(0);
    expect(circle(2, 0)).toBeCloseTo(1);
    // Radially exact in every direction (|∇d| = 1).
    expect(circle(0, -3)).toBeCloseTo(2);
  });

  it('box: inside distance, face distance, exact corner distance', () => {
    const box = sdfBox(0.5, 0.3);
    // Inside: distance to the NEAREST face (the top, 0.3 away).
    expect(box(0, 0)).toBeCloseTo(-0.3);
    // Outside a face.
    expect(box(1, 0)).toBeCloseTo(0.5);
    // Outside a corner: euclidean to the corner point (0.5, 0.3) — the
    // 3-4-5 triangle scaled to 0.3/0.4 offsets = 0.5 exactly.
    expect(box(0.8, 0.7)).toBeCloseTo(0.5);
    // Boundary.
    expect(box(0.5, 0)).toBeCloseTo(0);
  });

  it('star: inside at origin, a tip lies on the +y radius, far outside positive', () => {
    const star = sdfStar(0.45, 5, 3);
    expect(star(0, 0)).toBeLessThan(0);
    // Angle 0 is measured from the +y axis, so (0, r) is a vertex.
    expect(Math.abs(star(0, 0.45))).toBeLessThan(1e-6);
    expect(star(1.2, 1.2)).toBeGreaterThan(0);
  });

  it('star clamps degenerate params instead of producing NaN', () => {
    const degenerate = sdfStar(0.45, 1.4, 99); // points<3, m>n
    const sample = degenerate(0.3, 0.2);
    expect(Number.isNaN(sample)).toBe(false);
  });

  it('rounded box: face, corner-disc, and interior distances', () => {
    const rounded = sdfRoundedBox(0.5, 0.3, 0.1);
    // Beyond the +x face: same as the sharp box.
    expect(rounded(0.6, 0)).toBeCloseTo(0.1);
    // Level with a corner disc center (0.4, 0.2): euclidean to the disc.
    expect(rounded(0.6, 0.2)).toBeCloseTo(0.1);
    // Inside: nearest face unchanged by rounding.
    expect(rounded(0, 0)).toBeCloseTo(-0.3);
    // Oversized radius clamps to min(halfW, halfH) instead of inverting.
    expect(sdfRoundedBox(0.5, 0.3, 5)(0, 0)).toBeCloseTo(-0.3);
  });

  it('hexagon: flat top at y = r, center depth, vertex distance on the x-axis', () => {
    const hexagon = sdfHexagon(0.45);
    expect(Math.abs(hexagon(0, 0.45))).toBeLessThan(1e-6);
    expect(hexagon(0, 0)).toBeCloseTo(-0.45);
    // Flat-top hexagon vertices lie on the x-axis at R = 2r/√3.
    const vertexRadius = (2 * 0.45) / Math.sqrt(3);
    expect(hexagon(0.6, 0)).toBeCloseTo(0.6 - vertexRadius, 4);
  });

  it('triangle: base edge, centroid inradius, apex on the boundary', () => {
    const triangle = sdfTriangle(0.45);
    const inradius = 0.45 / Math.sqrt(3);
    // Base edge sits at y = −r/√3, apex at y = 2r/√3.
    expect(Math.abs(triangle(0, -inradius))).toBeLessThan(1e-6);
    expect(triangle(0, 0)).toBeCloseTo(-inradius);
    expect(Math.abs(triangle(0, 2 * inradius))).toBeLessThan(1e-6);
  });

  it('vesica: center depth −(r−d), both tips on the boundary, tip-branch distance', () => {
    const vesica = sdfVesica(0.5, 0.25);
    const tipY = Math.sqrt(0.5 * 0.5 - 0.25 * 0.25);
    expect(vesica(0, 0)).toBeCloseTo(-0.25); // −(r − d)
    expect(Math.abs(vesica(0.25, 0))).toBeLessThan(1e-6); // x-tip
    expect(Math.abs(vesica(0, tipY))).toBeLessThan(1e-6); // y-tip
    expect(vesica(0, tipY + 0.1)).toBeCloseTo(0.1); // above the tip
  });

  it('moon: outer edge on boundary, the bite is outside, the meat is inside', () => {
    const moon = sdfMoon(0.25, 0.45, 0.35);
    expect(Math.abs(moon(-0.45, 0))).toBeLessThan(1e-6);
    // Origin is covered by the inner (subtracted) disk → outside by 0.1.
    expect(moon(0, 0)).toBeCloseTo(0.1);
    // Left of the inner disk, inside the outer: crescent meat.
    expect(moon(-0.3, 0)).toBeCloseTo(-0.15);
  });

  it('pie: edge distance inside, arc distance beyond, apex distance behind', () => {
    const pie = sdfPie(50, 0.45);
    // On the +y axis the nearest straight edge is |p|·sin(50°) away.
    expect(pie(0, 0.2)).toBeCloseTo(-0.2 * Math.sin((50 * Math.PI) / 180), 6);
    // Beyond the arc along +y.
    expect(pie(0, 0.55)).toBeCloseTo(0.1);
    // Behind the apex the closest feature is the apex point itself.
    expect(pie(0, -0.3)).toBeCloseTo(0.3);
  });

  it('heart: bottom tip and top notch on the boundary, center inside', () => {
    const heart = sdfHeart(0.7);
    expect(Math.abs(heart(0, -0.35))).toBeLessThan(1e-6);
    expect(Math.abs(heart(0, 0.35))).toBeLessThan(1e-6);
    expect(heart(0, 0)).toBeCloseTo(-Math.sqrt(0.125) * 0.7, 3);
  });
});

describe('sdfLib — operators', () => {
  const a = sdfCircle(0.5);
  const b = sdfTranslate(sdfCircle(0.5), 0.6, 0);

  it('union is min(a, b)', () => {
    const u = sdfUnion(a, b);
    expect(u(0, 0)).toBeCloseTo(Math.min(a(0, 0), b(0, 0)));
    expect(u(0.6, 0)).toBeCloseTo(Math.min(a(0.6, 0), b(0.6, 0)));
  });

  it('union with the EMPTY field is the identity', () => {
    const u = sdfUnion(EMPTY_SDF, a);
    expect(u(0, 0)).toBeCloseTo(a(0, 0));
    expect(u(2, 2)).toBeCloseTo(a(2, 2));
  });

  it('subtract carves A out of B: max(-a, b)', () => {
    const carved = sdfSubtract(a, b);
    // At the center of A (inside both): -a = +0.5 dominates → outside.
    expect(carved(0, 0)).toBeCloseTo(Math.max(-a(0, 0), b(0, 0)));
    expect(carved(0, 0)).toBeGreaterThan(0);
    // Far from A but inside B: stays inside.
    expect(carved(1.0, 0)).toBeLessThan(0);
  });

  it('smooth union ≤ min near the blend and equals min far away', () => {
    const k = 0.15;
    const smooth = sdfSmoothUnion(a, b, k);
    // In the blend region between the circles, the field dips BELOW min
    // (that dip is the weld bulge).
    const between = smooth(0.3, 0.4);
    expect(between).toBeLessThanOrEqual(Math.min(a(0.3, 0.4), b(0.3, 0.4)));
    // Far away (|da - db| >> k) it degenerates to plain min.
    expect(smooth(5, 5)).toBeCloseTo(Math.min(a(5, 5), b(5, 5)), 6);
  });

  it('intersect is max(a, b)', () => {
    const intersection = sdfIntersect(a, b);
    // In the lens where both circles overlap: inside.
    expect(intersection(0.3, 0)).toBeCloseTo(Math.max(a(0.3, 0), b(0.3, 0)));
    expect(intersection(0.3, 0)).toBeLessThan(0);
    // Inside A only: outside the intersection.
    expect(intersection(-0.3, 0)).toBeGreaterThan(0);
  });

  it('xor of a shape with itself is |d|; xor with EMPTY is the identity', () => {
    const shape = sdfCircle(0.4);
    const selfXor = sdfXor(shape, shape);
    expect(selfXor(0, 0)).toBeCloseTo(0.4); // |−0.4|
    expect(selfXor(0.6, 0)).toBeCloseTo(0.2);
    const emptyXor = sdfXor(shape, EMPTY_SDF);
    expect(emptyXor(0, 0)).toBeCloseTo(shape(0, 0));
    expect(emptyXor(1, 0)).toBeCloseTo(shape(1, 0));
  });

  it('smooth subtract equals hard subtract far from the seam and fillets it', () => {
    const smooth = sdfSmoothSubtract(a, b, 0.1);
    const hard = sdfSubtract(a, b);
    expect(smooth(1.5, 0)).toBeCloseTo(hard(1.5, 0), 6);
    // On the seam (both boundaries meet): the fillet removes extra material,
    // pushing the point OUTSIDE where the hard op leaves it exactly on 0.
    expect(smooth(0.3, 0.4)).toBeGreaterThan(hard(0.3, 0.4));
  });

  it('smooth intersect equals hard intersect far from the seam and fillets it', () => {
    const smooth = sdfSmoothIntersect(a, b, 0.1);
    const hard = sdfIntersect(a, b);
    expect(smooth(5, 5)).toBeCloseTo(hard(5, 5), 6);
    expect(smooth(0.3, 0.4)).toBeGreaterThan(hard(0.3, 0.4));
  });

  it('smooth operators degrade to their hard forms on the EMPTY field (no NaN)', () => {
    // The mix-form smin computes ∞·0 = NaN without the non-finite guard —
    // this pins the guard: EMPTY must behave as the union identity / the
    // subtract-nothing / the intersect-with-nothing, everywhere.
    const shape = sdfCircle(0.4);
    for (const [x, y] of [
      [0, 0],
      [0.4, 0],
      [1, 1],
    ] as const) {
      expect(sdfSmoothUnion(EMPTY_SDF, shape, 0.15)(x, y)).toBeCloseTo(
        shape(x, y),
      );
      expect(sdfSmoothUnion(shape, EMPTY_SDF, 0.15)(x, y)).toBeCloseTo(
        shape(x, y),
      );
      // Carving NOTHING out of the shape leaves the shape.
      expect(sdfSmoothSubtract(EMPTY_SDF, shape, 0.15)(x, y)).toBeCloseTo(
        shape(x, y),
      );
      // Intersecting with NOTHING is nothing.
      expect(sdfSmoothIntersect(EMPTY_SDF, shape, 0.15)(x, y)).toBe(
        Number.POSITIVE_INFINITY,
      );
    }
    // Both empty: still ∞, never NaN.
    expect(sdfSmoothUnion(EMPTY_SDF, EMPTY_SDF, 0.15)(0, 0)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('moon: the cusp (corner) branch is exact — pinned off the main branch', () => {
    // sdfMoon(0.25, 0.45, 0.35): a = 0.285, b ≈ 0.34825. A point offset
    // (+0.1, +0.1) from the corner (a, b) takes the corner branch, whose
    // distance is the euclidean distance to the cusp point.
    const moon = sdfMoon(0.25, 0.45, 0.35);
    const a = (0.45 * 0.45 - 0.35 * 0.35 + 0.25 * 0.25) / (2 * 0.25);
    const b = Math.sqrt(0.45 * 0.45 - a * a);
    expect(moon(a + 0.1, b + 0.1)).toBeCloseTo(Math.sqrt(0.02), 6);
  });

  it('moon: inner disk swallowing the outer returns the EMPTY field', () => {
    const degenerate = sdfMoon(0.25, 0.3, 0.9); // rb ≥ ra + d
    expect(degenerate).toBe(EMPTY_SDF);
    expect(degenerate(0, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('round dilates: round(circle(0.3), 0.1) ≡ circle(0.4)', () => {
    const rounded = sdfRound(sdfCircle(0.3), 0.1);
    const reference = sdfCircle(0.4);
    for (const [x, y] of [
      [0, 0],
      [0.4, 0],
      [1, 1],
    ] as const) {
      expect(rounded(x, y)).toBeCloseTo(reference(x, y));
    }
  });

  it('onion hollows into a shell: |d| − t', () => {
    const shell = sdfOnion(sdfCircle(0.4), 0.05);
    expect(shell(0.4, 0)).toBeCloseTo(-0.05); // on the old boundary: deepest
    expect(shell(0, 0)).toBeCloseTo(0.35); // old center is now outside
    expect(shell(0.5, 0)).toBeCloseTo(0.05);
  });
});

describe('sdfLib — transforms', () => {
  it('translate moves the field', () => {
    const moved = sdfTranslate(sdfCircle(1), 2, 0);
    expect(moved(2, 0)).toBeCloseTo(-1);
    expect(moved(0, 0)).toBeCloseTo(1);
  });

  it('rotate is the identity on a circle (isometry sanity)', () => {
    const rotated = sdfRotate(sdfCircle(0.7), 37);
    for (const [x, y] of [
      [0, 0],
      [0.5, 0.2],
      [-1, 0.9],
    ] as const) {
      expect(rotated(x, y)).toBeCloseTo(sdfCircle(0.7)(x, y), 9);
    }
  });

  it('rotate 90° maps the box boundary correctly', () => {
    const box = sdfBox(0.5, 0.3);
    const rotated = sdfRotate(box, 90);
    // After +90° the long axis points along y: (0, 0.5) is on the boundary.
    expect(Math.abs(rotated(0, 0.5))).toBeLessThan(EPSILON + 1e-9);
    expect(rotated(0.5, 0)).toBeGreaterThan(0);
  });

  it('scale keeps the metric correct via the ·s correction', () => {
    // The plan's own pinned example: scale(circle(1), 2) at (4, 0) → 2.
    const scaled = sdfScale(sdfCircle(1), 2);
    expect(scaled(4, 0)).toBeCloseTo(2);
    expect(scaled(0, 0)).toBeCloseTo(-2);
  });

  it('mirror X/Y duplicate the positive half-plane content', () => {
    const rightCircle = sdfTranslate(sdfCircle(0.2), 0.5, 0);
    const mirroredX = sdfMirrorX(rightCircle);
    expect(mirroredX(-0.5, 0)).toBeCloseTo(-0.2); // mirrored copy
    expect(mirroredX(0.5, 0)).toBeCloseTo(-0.2); // original
    expect(mirroredX(0, 0)).toBeCloseTo(0.3); // seam: distance to either

    const topCircle = sdfTranslate(sdfCircle(0.2), 0, 0.5);
    const mirroredY = sdfMirrorY(topCircle);
    expect(mirroredY(0, -0.5)).toBeCloseTo(-0.2);
    expect(mirroredY(0, 0.5)).toBeCloseTo(-0.2);
  });

  it('repeat tiles the field: cell centers and midpoints', () => {
    const repeated = sdfRepeat(sdfCircle(0.2), 0.8, 0.8);
    expect(repeated(0, 0)).toBeCloseTo(-0.2);
    expect(repeated(0.8, 0)).toBeCloseTo(-0.2); // neighboring cell center
    expect(repeated(0.4, 0)).toBeCloseTo(0.2); // midpoint between copies
    expect(repeated(0.8, 0.8)).toBeCloseTo(-0.2); // diagonal neighbor
  });

  it('repeat is artifact-free for off-center shapes (the naive-mod failure case)', () => {
    // Copies of a circle at x = 0.3 + 0.8k. The point (0.5, 0) lives in tile 1
    // whose own copy is 0.5 away, but tile 0's copy is only 0.2 away — the
    // naive single-tile mod would report 0.4; the neighbor-checked version
    // must report the true 0.1.
    const offCenter = sdfRepeat(sdfTranslate(sdfCircle(0.1), 0.3, 0), 0.8, 0.8);
    expect(offCenter(0.5, 0)).toBeCloseTo(0.1);
  });

  it('radial repeat places `count` rotated copies; count 1 is the identity', () => {
    const petal = sdfTranslate(sdfCircle(0.15), 0.5, 0);
    const four = sdfRadialRepeat(petal, 4);
    expect(four(0.5, 0)).toBeCloseTo(-0.15); // original copy
    expect(four(0, 0.5)).toBeCloseTo(-0.15); // 90° copy
    expect(four(-0.5, 0)).toBeCloseTo(-0.15); // 180° copy
    expect(four(0, -0.5)).toBeCloseTo(-0.15); // 270° copy
    // Between two copies (45°): distance to the nearest copy center − r.
    const diagonal = 0.5 / Math.sqrt(2);
    const expected = Math.sqrt((diagonal - 0.5) ** 2 + diagonal ** 2) - 0.15;
    expect(four(diagonal, diagonal)).toBeCloseTo(expected, 6);

    const single = sdfRadialRepeat(petal, 1);
    for (const [x, y] of [
      [0.5, 0],
      [-0.3, 0.2],
      [0.1, -0.6],
    ] as const) {
      expect(single(x, y)).toBeCloseTo(petal(x, y), 9);
    }
  });
});

describe('sdfLib — masks', () => {
  it('less-than is white inside (threshold 0), greater-than is the complement', () => {
    const field = sdfCircle(0.4);
    const inside = maskLessThan(field, 0);
    const outside = maskGreaterThan(field, 0);
    expect(inside(0, 0)).toBe(true);
    expect(inside(1, 1)).toBe(false);
    expect(outside(0, 0)).toBe(false);
    expect(outside(1, 1)).toBe(true);
  });

  it('threshold shifts the cut: less-than 0.1 includes a dilation band', () => {
    const dilated = maskLessThan(sdfCircle(0.4), 0.1);
    expect(dilated(0.45, 0)).toBe(true); // d = 0.05 < 0.1
    expect(dilated(0.55, 0)).toBe(false); // d = 0.15
  });

  it('the EMPTY field thresholds to all-black / all-white', () => {
    expect(maskLessThan(EMPTY_SDF, 0)(0, 0)).toBe(false);
    expect(maskGreaterThan(EMPTY_SDF, 0)(0, 0)).toBe(true);
    expect(EMPTY_MASK(0, 0)).toBe(false);
  });

  it('makeMaskValue/isMaskValue round-trip; sdf values rejected', () => {
    const value = makeMaskValue(maskLessThan(sdfCircle(0.4), 0));
    expect(isMaskValue(value)).toBe(true);
    expect(isMaskValue(makeSdfValue(sdfCircle(0.4)))).toBe(false);
    expect(isMaskValue({ kind: 'mask2d' })).toBe(false);
    expect(isMaskValue(null)).toBe(false);
  });

  it('renderMaskToPixels is strictly binary black/white', () => {
    const pixels = renderMaskToPixels(
      maskLessThan(sdfCircle(0.4), 0),
      PREVIEW_WORLD_RECT,
      32,
    );
    const center = (16 * 32 + 16) * 4;
    const corner = 0;
    expect(pixels[center]).toBe(255);
    expect(pixels[corner]).toBe(0);
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i] === 0 || pixels[i] === 255).toBe(true);
      expect(pixels[i + 3]).toBe(255);
    }
  });
});

describe('sdfLib — measurements', () => {
  it('measureMask matches the analytic circle area over the preview rect', () => {
    const measurement = measureMask(maskLessThan(sdfCircle(0.4), 0));
    const rectArea = 2.4 * 2.4;
    const analyticRatio = (Math.PI * 0.4 * 0.4) / rectArea;
    expect(Math.abs(measurement.whiteRatio - analyticRatio)).toBeLessThan(
      0.005,
    );
    expect(measurement.whitePixels + measurement.blackPixels).toBe(220 * 220);
    expect(measurement.whitePixels).toBeGreaterThan(0);
  });

  it('brightnessOfDistance: 1 inside, exp falloff outside (0.5 at ln2/6)', () => {
    expect(brightnessOfDistance(-0.5)).toBe(1);
    expect(brightnessOfDistance(0)).toBe(1);
    expect(brightnessOfDistance(Math.LN2 / 6)).toBeCloseTo(0.5);
  });

  it('measureBrightness: threshold 1 ≈ inside area; lower thresholds grow it', () => {
    const field = sdfCircle(0.4);
    const strict = measureBrightness(field, 1);
    const glowing = measureBrightness(field, 0.5);
    const rectArea = 2.4 * 2.4;
    const insideRatio = (Math.PI * 0.4 * 0.4) / rectArea;
    // brightness ≥ 0.5 reaches out to d = ln2/6 beyond the boundary.
    const glowRadius = 0.4 + Math.LN2 / 6;
    const glowRatio = (Math.PI * glowRadius * glowRadius) / rectArea;
    expect(Math.abs(strict.brightRatio - insideRatio)).toBeLessThan(0.005);
    expect(Math.abs(glowing.brightRatio - glowRatio)).toBeLessThan(0.005);
    expect(glowing.brightPixels).toBeGreaterThan(strict.brightPixels);
  });

  it('the EMPTY field measures to zero white / zero bright', () => {
    expect(measureMask(maskLessThan(EMPTY_SDF, 0)).whitePixels).toBe(0);
    expect(measureBrightness(EMPTY_SDF, 0.5).brightPixels).toBe(0);
  });
});

describe('sdfLib — value wrapper', () => {
  it('makeSdfValue/isSdfValue round-trip; non-values rejected', () => {
    const value = makeSdfValue(sdfCircle(0.4));
    expect(isSdfValue(value)).toBe(true);
    expect(isSdfValue({ kind: 'sdf2d', fn: 'not-a-fn' })).toBe(false);
    expect(isSdfValue(null)).toBe(false);
    expect(isSdfValue(42)).toBe(false);
    // The exported-recording shape: fn stripped by serialization.
    expect(isSdfValue({ kind: 'sdf2d' })).toBe(false);
  });
});

describe('sdfLib — renderSdfToPixels', () => {
  it('debug style: inside pixels are blue-ish, outside orange-ish, non-blank', () => {
    const pixels = renderSdfToPixels(sdfCircle(1), PREVIEW_WORLD_RECT, 32, {
      mode: 'debug',
    });
    expect(pixels.length).toBe(32 * 32 * 4);
    // Center pixel (row 16, col 16) is deep inside (d = -1): blue > red.
    const center = (16 * 32 + 16) * 4;
    expect(pixels[center + 2]).toBeGreaterThan(pixels[center]);
    // Corner pixel is outside: orange (red > blue).
    const corner = (0 * 32 + 0) * 4;
    expect(pixels[corner]).toBeGreaterThan(pixels[corner + 2]);
    // Pixel variance — the non-blank oracle the e2e also uses.
    let min = 255;
    let max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      min = Math.min(min, pixels[i]);
      max = Math.max(max, pixels[i]);
    }
    expect(max - min).toBeGreaterThan(30);
  });

  it('filled style: shape pixels take the palette, far ground stays dark', () => {
    const pixels = renderSdfToPixels(sdfCircle(0.5), PREVIEW_WORLD_RECT, 32, {
      mode: 'filled',
      palette: 0,
      glow: 0,
    });
    const center = (16 * 32 + 16) * 4;
    const corner = (0 * 32 + 0) * 4;
    const centerLuma = pixels[center] + pixels[center + 1] + pixels[center + 2];
    const cornerLuma = pixels[corner] + pixels[corner + 1] + pixels[corner + 2];
    expect(centerLuma).toBeGreaterThan(cornerLuma);
  });

  it('renders the EMPTY field without NaN artifacts (all-ground, opaque)', () => {
    const pixels = renderSdfToPixels(EMPTY_SDF, PREVIEW_WORLD_RECT, 16, {
      mode: 'filled',
      palette: 0,
      glow: 1,
    });
    for (let i = 0; i < pixels.length; i += 4) {
      // The finite-palette guard keeps the ground its dark color — a NaN
      // through cos(∞) would zero these channels out to pure black.
      expect(pixels[i]).toBe(16);
      expect(pixels[i + 2]).toBe(20);
      expect(pixels[i + 3]).toBe(255); // alpha
    }
  });

  it('DEBUG mode renders the EMPTY field as dim orange, never NaN-black', () => {
    // `bands = 0.8 + 0.2·cos(80·d)` is NaN at d = +∞ without the finite
    // clamp — every empty/unconnected node preview then paints solid black.
    const pixels = renderSdfToPixels(EMPTY_SDF, PREVIEW_WORLD_RECT, 16, {
      mode: 'debug',
    });
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i]).toBeGreaterThan(0); // red present (orange far field)
      expect(pixels[i]).toBeGreaterThan(pixels[i + 2]); // orange: r > b
      expect(pixels[i + 3]).toBe(255);
    }
  });

  it('filled mode survives a NaN palette index (guards the only throwing path)', () => {
    expect(() =>
      renderSdfToPixels(sdfCircle(0.4), PREVIEW_WORLD_RECT, 8, {
        mode: 'filled',
        palette: Number.NaN,
        glow: 1,
      }),
    ).not.toThrow();
  });
});
