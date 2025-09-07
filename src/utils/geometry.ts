/**
 * Checks if a number is within a specified range
 *
 * @param number - The number to check
 * @param min - The minimum value of the range
 * @param max - The maximum value of the range
 * @param minInclusive - Whether the minimum value is inclusive (default: false)
 * @param maxInclusive - Whether the maximum value is inclusive (default: false)
 * @returns True if the number is within the range, false otherwise
 *
 * @example
 * ```tsx
 * isNumberInRange(5, 1, 10) // true (5 is between 1 and 10, exclusive)
 * isNumberInRange(1, 1, 10, true) // true (1 is included)
 * isNumberInRange(10, 1, 10, false, true) // true (10 is included)
 * isNumberInRange(0, 1, 10) // false (0 is below range)
 * ```
 */
function isNumberInRange(
  number: number,
  min: number,
  max: number,
  minInclusive: boolean = false,
  maxInclusive: boolean = false,
) {
  if (min > max) {
    const temp = min;
    min = max;
    max = temp;
  }
  return (
    (minInclusive ? number >= min : number > min) &&
    (maxInclusive ? number <= max : number < max)
  );
}

/**
 * Represents a 2D coordinate point
 */
type Coordinate = {
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
};

/**
 * Represents a rectangular bounding box
 */
type Box = {
  /** Top edge position */
  top: number;
  /** Left edge position */
  left: number;
  /** Right edge position */
  right: number;
  /** Bottom edge position */
  bottom: number;
};

/**
 * Checks if a coordinate point is within a bounding box
 *
 * @param coordinate - The coordinate point to check
 * @param box - The bounding box to check against
 * @param xAxisInclusive - Whether the x-axis boundaries are inclusive (default: false)
 * @param yAxisInclusive - Whether the y-axis boundaries are inclusive (default: false)
 * @returns True if the coordinate is within the box, false otherwise
 *
 * @example
 * ```tsx
 * const point = { x: 50, y: 50 };
 * const box = { top: 0, left: 0, right: 100, bottom: 100 };
 *
 * isCoordinateInBox(point, box) // true
 * isCoordinateInBox({ x: 0, y: 0 }, box, true, true) // true (inclusive)
 * isCoordinateInBox({ x: 100, y: 100 }, box) // false (exclusive)
 * ```
 */
function isCoordinateInBox(
  coordinate: Coordinate,
  box: Box,
  xAxisInclusive: boolean = false,
  yAxisInclusive: boolean = false,
) {
  return (
    isNumberInRange(coordinate.x, box.left, box.right, xAxisInclusive) &&
    isNumberInRange(coordinate.y, box.top, box.bottom, yAxisInclusive)
  );
}

export { isNumberInRange, isCoordinateInBox };
export type { Coordinate, Box };
