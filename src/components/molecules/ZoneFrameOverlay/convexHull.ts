type Point = { x: number; y: number };

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points: Point[]): Point[] {
  if (points.length <= 1) return [...points];

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const n = sorted.length;

  const lower: Point[] = [];
  for (let i = 0; i < n; i++) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0
    ) {
      lower.pop();
    }
    lower.push(sorted[i]);
  }

  const upper: Point[] = [];
  for (let i = n - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0
    ) {
      upper.pop();
    }
    upper.push(sorted[i]);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function computePaddedHull(
  nodeRects: ReadonlyArray<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>,
  padding: number = 20,
): Point[] {
  if (nodeRects.length === 0) return [];

  const cornerPoints: Point[] = [];
  for (const rect of nodeRects) {
    cornerPoints.push(
      { x: rect.x - padding, y: rect.y - padding },
      { x: rect.x + rect.width + padding, y: rect.y - padding },
      { x: rect.x + rect.width + padding, y: rect.y + rect.height + padding },
      { x: rect.x - padding, y: rect.y + rect.height + padding },
    );
  }

  return convexHull(cornerPoints);
}

export { convexHull, computePaddedHull };
export type { Point };
