/** Available handle shapes for node inputs and outputs */
const handleShapes = [
  'circle',
  'square',
  'rectangle',
  'list',
  'grid',
  'diamond',
  'trapezium',
  'hexagon',
  'star',
  'cross',
  'zigzag',
  'sparkle',
  'parallelogram',
] as const;

/** Map of handle shapes for type-safe access */
const handleShapesMap = {
  [handleShapes[0]]: handleShapes[0],
  [handleShapes[1]]: handleShapes[1],
  [handleShapes[2]]: handleShapes[2],
  [handleShapes[3]]: handleShapes[3],
  [handleShapes[4]]: handleShapes[4],
  [handleShapes[5]]: handleShapes[5],
  [handleShapes[6]]: handleShapes[6],
  [handleShapes[7]]: handleShapes[7],
  [handleShapes[8]]: handleShapes[8],
  [handleShapes[9]]: handleShapes[9],
  [handleShapes[10]]: handleShapes[10],
  [handleShapes[11]]: handleShapes[11],
  [handleShapes[12]]: handleShapes[12],
} as const;

/** Type representing all available handle shapes */
type HandleShape = (typeof handleShapesMap)[keyof typeof handleShapesMap];

export { handleShapesMap, type HandleShape };
