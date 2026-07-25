// Re-export shim. The canonical home for the handle-shape constants moved to the
// internal `atoms/HandleShapeSwatch` so molecule editors can consume the swatch
// without a molecule->organisms layering inversion. Kept here so `handleShapesMap`
// and the `HandleShape` type keep their exact public export path (this organisms
// barrel -> src/index.ts). Explicit named re-exports (NOT `export *`) so the
// module-private `handleShapes` tuple is never leaked onto the public surface.
export {
  handleShapesMap,
  type HandleShape,
} from '@/components/atoms/HandleShapeSwatch/handleShapes';
