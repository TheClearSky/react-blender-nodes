// Internal primitive — intentionally NOT re-exported from the public atoms barrel
// (`src/components/atoms/index.ts`). Import directly via
// `@/components/atoms/HandleShapeSwatch` inside the library only.
//
// `handleShapesMap` and `HandleShape` remain public through their original path
// (the organisms `ConfigurableNode` barrel re-exports them from here); the
// `handleShapes` tuple stays private in `./handleShapes`.
export { HandleShapeSwatch } from './HandleShapeSwatch';
export type { HandleShapeSwatchProps } from './HandleShapeSwatch';
export { handleShapesMap, type HandleShape } from './handleShapes';
