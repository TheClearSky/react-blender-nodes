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

type Coordinate = {
  x: number;
  y: number;
};

type Box = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};

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
