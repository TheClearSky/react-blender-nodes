import { z } from 'zod';
import type { NodePreviewRegistry } from '@/components/organisms/FullGraph';
import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
  type SupportedUnderlyingTypes,
  type TypeOfNode,
} from '@/utils/nodeStateManagement/types';
import {
  standardDataTypes,
  standardNodeTypes,
  standardDataTypeNamesMap,
} from '@/utils/nodeStateManagement/standardNodes';
import { makeFunctionImplementationsWithAutoInfer } from '@/utils/nodeRunner/types';
import { readInput } from '@/utils/nodeRunner/readInput';
import {
  MATH_OPERATIONS,
  COMPARE_OPERATIONS,
  MATH_OPERATION_FUNCTIONS,
  COMPARE_OPERATION_FUNCTIONS,
} from './mathOps';
import {
  EMPTY_MASK,
  EMPTY_SDF,
  isMaskValue,
  isSdfValue,
  makeMaskValue,
  makeSdfValue,
  maskGreaterThan,
  maskLessThan,
  measureBrightness,
  measureMask,
  sdfBox,
  sdfCircle,
  sdfHeart,
  sdfHexagon,
  sdfIntersect,
  sdfMirrorX,
  sdfMirrorY,
  sdfMoon,
  sdfOnion,
  sdfPie,
  sdfRadialRepeat,
  sdfRepeat,
  sdfRotate,
  sdfRound,
  sdfRoundedBox,
  sdfScale,
  sdfSmoothIntersect,
  sdfSmoothSubtract,
  sdfSmoothUnion,
  sdfStar,
  sdfSubtract,
  sdfTranslate,
  sdfTriangle,
  sdfUnion,
  sdfVesica,
  sdfXor,
  type Mask2d,
  type Sdf2d,
  type SdfValue,
  type MaskValue,
} from './sdfLib';
import {
  SdfFieldPreview,
  SdfMaskPreview,
  SdfMeasurePreview,
  SdfRenderPreview,
} from './SdfPreview';

// ─────────────────────────────────────────────────────
// SDF Shape Studio — definitions (data types, node types, implementations,
// preview registry, param defaults).
//
// Extracted from the story so unit tests (fixture import round-trip, impl
// contracts) can consume the REAL tables without importing Storybook, and so
// the story file stays a story. Everything here is module-level on purpose:
// registries and definition objects must keep stable identities across
// renders.
// ─────────────────────────────────────────────────────

// ── data types ────────────────────────────────────────

const sdfDataTypes = {
  sdf: makeDataTypeWithAutoInfer({
    name: 'SDF',
    underlyingType: 'complex',
    color: '#8b5cf6',
    complexSchema: z.custom<SdfValue>(
      (candidate) => isSdfValue(candidate),
      'expected an SDF value',
    ),
  }),
  mask: makeDataTypeWithAutoInfer({
    name: 'Mask',
    underlyingType: 'complex',
    color: '#e5e7eb',
    complexSchema: z.custom<MaskValue>(
      (candidate) => isMaskValue(candidate),
      'expected a mask value',
    ),
  }),
  number: makeDataTypeWithAutoInfer({
    name: 'Number',
    underlyingType: 'number',
    color: '#38bdf8',
    allowInput: true,
  }),
  // Enum operation selectors: a `string` type with `allowedStrings` renders the
  // Select dropdown on the unconnected input (the Math / Compare nodes below).
  mathOp: makeDataTypeWithAutoInfer({
    name: 'Math Op',
    underlyingType: 'string',
    color: '#f59e0b',
    allowInput: true,
    allowedStrings: MATH_OPERATIONS,
  }),
  compareOp: makeDataTypeWithAutoInfer({
    name: 'Compare Op',
    underlyingType: 'string',
    color: '#10b981',
    allowInput: true,
    allowedStrings: COMPARE_OPERATIONS,
  }),
  // Standard structural types: grouping, loops, and switches need these
  // (groupInfer/loopInfer/switchInfer, condition, bind*) — without them the
  // always-visible group selector and Add Loop/Add Switch would dispatch into
  // missing definitions.
  ...standardDataTypes,
} as const;
type SdfDataTypeId = keyof typeof sdfDataTypes;

// ── node types (context-menu folders) ─────────────────

const SHAPES_FOLDER = ['SDF Shapes'];
const OPERATORS_FOLDER = ['SDF Operators'];
const MODIFY_FOLDER = ['SDF Modify'];
const TRANSFORMS_FOLDER = ['SDF Transforms'];
const MASKS_FOLDER = ['SDF Masks'];
const MEASURE_FOLDER = ['SDF Measure'];
const OUTPUT_FOLDER = ['SDF Output'];
// Folder name distinct from the node names ('Math'/'Compare') so the context menu
// has no folder-vs-node label collision.
const MATH_FOLDER = ['Math Nodes'];

/** Pins the 4-param generic so the complex `sdf` schema type flows through
 *  (the helper's ComplexSchemaType otherwise defaults to `never` — the
 *  documented explicit-type-args-fix-generic-widening rule). */
function makeSdfNodeType<NodeTypeUniqueId extends string>(
  definition: TypeOfNode<
    SdfDataTypeId,
    NodeTypeUniqueId,
    SupportedUnderlyingTypes,
    z.ZodType
  >,
) {
  return makeTypeOfNodeWithAutoInfer<
    SdfDataTypeId,
    NodeTypeUniqueId,
    SupportedUnderlyingTypes,
    z.ZodType
  >(definition);
}

/** One sdf input, capped to a single wire (clean A/B mental model — N-ary
 *  union via fan-in folding is a recorded fast-follow). */
function sdfInput(name: string) {
  return { name, dataType: 'sdf' as const, maxConnections: 1 };
}
/** One mask input, same single-wire discipline. */
function maskInput(name: string) {
  return { name, dataType: 'mask' as const, maxConnections: 1 };
}
function numberParam(name: string, defaultValue: number) {
  return {
    name,
    dataType: 'number' as const,
    allowInput: true,
    // First-class input default (TypeOfInput.defaultValue): construction seeds
    // this onto the handle's `value`, so a fresh node's sliders are honest
    // immediately — no post-add UPDATE_INPUT_VALUE seeder needed.
    defaultValue,
  };
}

// Param defaults live inline on each `numberParam(name, default)` above and are
// seeded onto fresh nodes by construction (`TypeOfInput.defaultValue`). Impls
// still fall back to the same numbers as belt-and-braces for loaded records.

const sdfNodeTypes = {
  sdfCircle: makeSdfNodeType<'sdfCircle'>({
    name: 'Circle',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [numberParam('Radius', 0.4)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfBox: makeSdfNodeType<'sdfBox'>({
    name: 'Box',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [numberParam('Width', 0.5), numberParam('Height', 0.3)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfStar: makeSdfNodeType<'sdfStar'>({
    name: 'Star',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [
      numberParam('Radius', 0.45),
      numberParam('Points', 5),
      numberParam('Pointiness', 3),
    ],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfRoundedBox: makeSdfNodeType<'sdfRoundedBox'>({
    name: 'Rounded Box',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [
      numberParam('Width', 0.5),
      numberParam('Height', 0.35),
      numberParam('Corner', 0.1),
    ],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfHexagon: makeSdfNodeType<'sdfHexagon'>({
    name: 'Hexagon',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [numberParam('Radius', 0.45)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfTriangle: makeSdfNodeType<'sdfTriangle'>({
    name: 'Triangle',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [numberParam('Radius', 0.45)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfVesica: makeSdfNodeType<'sdfVesica'>({
    name: 'Vesica',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [numberParam('Radius', 0.5), numberParam('Distance', 0.25)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfMoon: makeSdfNodeType<'sdfMoon'>({
    name: 'Moon',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [
      numberParam('Offset', 0.25),
      numberParam('Outer', 0.45),
      numberParam('Inner', 0.35),
    ],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfPie: makeSdfNodeType<'sdfPie'>({
    name: 'Pie',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [numberParam('Angle', 50), numberParam('Radius', 0.45)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfHeart: makeSdfNodeType<'sdfHeart'>({
    name: 'Heart',
    headerColor: '#7c3aed',
    locationInContextMenu: SHAPES_FOLDER,
    inputs: [numberParam('Size', 0.7)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfUnion: makeSdfNodeType<'sdfUnion'>({
    name: 'Union',
    headerColor: '#ea580c',
    locationInContextMenu: OPERATORS_FOLDER,
    inputs: [sdfInput('A'), sdfInput('B')],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfSubtract: makeSdfNodeType<'sdfSubtract'>({
    name: 'Subtract',
    headerColor: '#ea580c',
    locationInContextMenu: OPERATORS_FOLDER,
    inputs: [sdfInput('A'), sdfInput('B')],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfIntersect: makeSdfNodeType<'sdfIntersect'>({
    name: 'Intersect',
    headerColor: '#ea580c',
    locationInContextMenu: OPERATORS_FOLDER,
    inputs: [sdfInput('A'), sdfInput('B')],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfXor: makeSdfNodeType<'sdfXor'>({
    name: 'Xor',
    headerColor: '#ea580c',
    locationInContextMenu: OPERATORS_FOLDER,
    inputs: [sdfInput('A'), sdfInput('B')],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfSmoothUnion: makeSdfNodeType<'sdfSmoothUnion'>({
    name: 'Smooth Union',
    headerColor: '#ea580c',
    locationInContextMenu: OPERATORS_FOLDER,
    inputs: [sdfInput('A'), sdfInput('B'), numberParam('Blend', 0.15)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfSmoothSubtract: makeSdfNodeType<'sdfSmoothSubtract'>({
    name: 'Smooth Subtract',
    headerColor: '#ea580c',
    locationInContextMenu: OPERATORS_FOLDER,
    inputs: [sdfInput('A'), sdfInput('B'), numberParam('Blend', 0.15)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfSmoothIntersect: makeSdfNodeType<'sdfSmoothIntersect'>({
    name: 'Smooth Intersect',
    headerColor: '#ea580c',
    locationInContextMenu: OPERATORS_FOLDER,
    inputs: [sdfInput('A'), sdfInput('B'), numberParam('Blend', 0.15)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfRound: makeSdfNodeType<'sdfRound'>({
    name: 'Round',
    headerColor: '#b45309',
    locationInContextMenu: MODIFY_FOLDER,
    inputs: [sdfInput('In'), numberParam('Radius', 0.1)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfOnion: makeSdfNodeType<'sdfOnion'>({
    name: 'Onion',
    headerColor: '#b45309',
    locationInContextMenu: MODIFY_FOLDER,
    inputs: [sdfInput('In'), numberParam('Thickness', 0.05)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfTranslate: makeSdfNodeType<'sdfTranslate'>({
    name: 'Translate',
    headerColor: '#0d9488',
    locationInContextMenu: TRANSFORMS_FOLDER,
    inputs: [sdfInput('In'), numberParam('X', 0.4), numberParam('Y', 0)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfRotate: makeSdfNodeType<'sdfRotate'>({
    name: 'Rotate',
    headerColor: '#0d9488',
    locationInContextMenu: TRANSFORMS_FOLDER,
    inputs: [sdfInput('In'), numberParam('Degrees', 30)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfScale: makeSdfNodeType<'sdfScale'>({
    name: 'Scale',
    headerColor: '#0d9488',
    locationInContextMenu: TRANSFORMS_FOLDER,
    inputs: [sdfInput('In'), numberParam('Factor', 1.5)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfMirrorX: makeSdfNodeType<'sdfMirrorX'>({
    name: 'Mirror X',
    headerColor: '#0d9488',
    locationInContextMenu: TRANSFORMS_FOLDER,
    inputs: [sdfInput('In')],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfMirrorY: makeSdfNodeType<'sdfMirrorY'>({
    name: 'Mirror Y',
    headerColor: '#0d9488',
    locationInContextMenu: TRANSFORMS_FOLDER,
    inputs: [sdfInput('In')],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfRepeat: makeSdfNodeType<'sdfRepeat'>({
    name: 'Repeat',
    headerColor: '#0d9488',
    locationInContextMenu: TRANSFORMS_FOLDER,
    inputs: [
      sdfInput('In'),
      numberParam('Cell X', 0.8),
      numberParam('Cell Y', 0.8),
    ],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfRadialRepeat: makeSdfNodeType<'sdfRadialRepeat'>({
    name: 'Radial Repeat',
    headerColor: '#0d9488',
    locationInContextMenu: TRANSFORMS_FOLDER,
    inputs: [sdfInput('In'), numberParam('Count', 6)],
    outputs: [{ name: 'Out', dataType: 'sdf' }],
  }),
  sdfLessThan: makeSdfNodeType<'sdfLessThan'>({
    name: 'Less Than',
    headerColor: '#4b5563',
    locationInContextMenu: MASKS_FOLDER,
    inputs: [sdfInput('In'), numberParam('Threshold', 0)],
    outputs: [{ name: 'Out', dataType: 'mask' }],
  }),
  sdfGreaterThan: makeSdfNodeType<'sdfGreaterThan'>({
    name: 'Greater Than',
    headerColor: '#4b5563',
    locationInContextMenu: MASKS_FOLDER,
    inputs: [sdfInput('In'), numberParam('Threshold', 0)],
    outputs: [{ name: 'Out', dataType: 'mask' }],
  }),
  sdfMeasureMask: makeSdfNodeType<'sdfMeasureMask'>({
    name: 'Measure Mask',
    headerColor: '#1d4ed8',
    locationInContextMenu: MEASURE_FOLDER,
    inputs: [maskInput('In')],
    outputs: [
      { name: 'White Pixels', dataType: 'number' },
      { name: 'Black Pixels', dataType: 'number' },
      { name: 'White Ratio', dataType: 'number' },
    ],
  }),
  sdfMeasureBrightness: makeSdfNodeType<'sdfMeasureBrightness'>({
    name: 'Measure Brightness',
    headerColor: '#1d4ed8',
    locationInContextMenu: MEASURE_FOLDER,
    inputs: [sdfInput('In'), numberParam('Threshold', 0.5)],
    outputs: [
      { name: 'Bright Pixels', dataType: 'number' },
      { name: 'Bright Ratio', dataType: 'number' },
    ],
  }),
  sdfRender: makeSdfNodeType<'sdfRender'>({
    name: 'Render',
    headerColor: '#be123c',
    locationInContextMenu: OUTPUT_FOLDER,
    inputs: [sdfInput('In'), numberParam('Palette', 0), numberParam('Glow', 1)],
    outputs: [],
  }),
  // Math / Compare — enum-driven arithmetic + comparison over Numbers (minimal node
  // count: one dropdown packs ~30 ops). Compare's boolean `condition` output drives
  // loop/switch conditions (e.g. `Compare(i < N)` on a counter loop).
  math: makeSdfNodeType<'math'>({
    name: 'Math',
    headerColor: '#f59e0b',
    locationInContextMenu: MATH_FOLDER,
    inputs: [
      { name: 'A', dataType: 'number', allowInput: true, defaultValue: 0 },
      { name: 'B', dataType: 'number', allowInput: true, defaultValue: 0 },
      { name: 'Op', dataType: 'mathOp', allowInput: true, defaultValue: 'Add' },
    ],
    outputs: [{ name: 'Result', dataType: 'number' }],
  }),
  compare: makeSdfNodeType<'compare'>({
    name: 'Compare',
    headerColor: '#10b981',
    locationInContextMenu: MATH_FOLDER,
    inputs: [
      { name: 'A', dataType: 'number', allowInput: true, defaultValue: 0 },
      { name: 'B', dataType: 'number', allowInput: true, defaultValue: 0 },
      {
        name: 'Op',
        dataType: 'compareOp',
        allowInput: true,
        defaultValue: 'Greater Than',
      },
    ],
    outputs: [{ name: 'Result', dataType: standardDataTypeNamesMap.condition }],
  }),
  // Structural node types (group boundaries, loop triplet, switch pair) —
  // required the moment grouping/loops/switches are used in the studio.
  ...standardNodeTypes,
} as const;
type SdfNodeTypeId = keyof typeof sdfNodeTypes;

// ── implementations ───────────────────────────────────
// Degenerate-graph contract (mandatory): operators with NEITHER input → the
// EMPTY field; with ONE input → pass the connected field through unchanged
// (friendliest mid-drag behavior; never a TypeError). All param constraints
// are clamped INSIDE sdfLib (sliders have no min/max plumbing).

type ImplementationInputs = Parameters<typeof readInput>[0];

function readSdf(
  inputs: ImplementationInputs,
  handleName: string,
): Sdf2d | undefined {
  const [value] = readInput(inputs, handleName);
  return isSdfValue(value) ? value.fn : undefined;
}
function readMask(
  inputs: ImplementationInputs,
  handleName: string,
): Mask2d | undefined {
  const [value] = readInput(inputs, handleName);
  return isMaskValue(value) ? value.fn : undefined;
}
/** NaN and ±Infinity fall back too — `typeof NaN === 'number'`, and a single
 *  non-finite parameter would silently turn a whole field into NaN. */
function readNumber(
  inputs: ImplementationInputs,
  handleName: string,
  fallback: number,
): number {
  const [value] = readInput(inputs, handleName);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
/** Read an enum operation string; the seeded default normally makes the fallback
 *  unreachable (belt-and-braces for records loaded without a value). */
function readOperation(
  inputs: ImplementationInputs,
  handleName: string,
  fallback: string,
): string {
  const [value] = readInput(inputs, handleName);
  return typeof value === 'string' ? value : fallback;
}
function outputSdf(fieldFn: Sdf2d): Map<string, unknown> {
  return new Map<string, unknown>([['Out', makeSdfValue(fieldFn)]]);
}
/** Two-input operator with the pass-through / empty-field contract. */
function combineOrPassThrough(
  a: Sdf2d | undefined,
  b: Sdf2d | undefined,
  combine: (a: Sdf2d, b: Sdf2d) => Sdf2d,
): Sdf2d {
  if (a && b) return combine(a, b);
  return a ?? b ?? EMPTY_SDF;
}

const sdfImplementations =
  makeFunctionImplementationsWithAutoInfer<SdfNodeTypeId>({
    math: (inputs) => {
      const a = readNumber(inputs, 'A', 0);
      const b = readNumber(inputs, 'B', 0);
      const operation = readOperation(inputs, 'Op', 'Add');
      const compute =
        MATH_OPERATION_FUNCTIONS[operation] ?? MATH_OPERATION_FUNCTIONS.Add;
      const result = compute(a, b);
      return new Map<string, unknown>([
        ['Result', Number.isFinite(result) ? result : 0],
      ]);
    },
    compare: (inputs) => {
      const a = readNumber(inputs, 'A', 0);
      const b = readNumber(inputs, 'B', 0);
      const operation = readOperation(inputs, 'Op', 'Greater Than');
      const compute =
        COMPARE_OPERATION_FUNCTIONS[operation] ??
        COMPARE_OPERATION_FUNCTIONS['Greater Than'];
      return new Map<string, unknown>([['Result', compute(a, b)]]);
    },
    sdfCircle: (inputs) =>
      outputSdf(sdfCircle(readNumber(inputs, 'Radius', 0.4))),
    sdfBox: (inputs) =>
      outputSdf(
        sdfBox(
          readNumber(inputs, 'Width', 0.5),
          readNumber(inputs, 'Height', 0.3),
        ),
      ),
    sdfStar: (inputs) =>
      outputSdf(
        sdfStar(
          readNumber(inputs, 'Radius', 0.45),
          readNumber(inputs, 'Points', 5),
          readNumber(inputs, 'Pointiness', 3),
        ),
      ),
    sdfRoundedBox: (inputs) =>
      outputSdf(
        sdfRoundedBox(
          readNumber(inputs, 'Width', 0.5),
          readNumber(inputs, 'Height', 0.35),
          readNumber(inputs, 'Corner', 0.1),
        ),
      ),
    sdfHexagon: (inputs) =>
      outputSdf(sdfHexagon(readNumber(inputs, 'Radius', 0.45))),
    sdfTriangle: (inputs) =>
      outputSdf(sdfTriangle(readNumber(inputs, 'Radius', 0.45))),
    sdfVesica: (inputs) =>
      outputSdf(
        sdfVesica(
          readNumber(inputs, 'Radius', 0.5),
          readNumber(inputs, 'Distance', 0.25),
        ),
      ),
    sdfMoon: (inputs) =>
      outputSdf(
        sdfMoon(
          readNumber(inputs, 'Offset', 0.25),
          readNumber(inputs, 'Outer', 0.45),
          readNumber(inputs, 'Inner', 0.35),
        ),
      ),
    sdfPie: (inputs) =>
      outputSdf(
        sdfPie(
          readNumber(inputs, 'Angle', 50),
          readNumber(inputs, 'Radius', 0.45),
        ),
      ),
    sdfHeart: (inputs) => outputSdf(sdfHeart(readNumber(inputs, 'Size', 0.7))),
    sdfUnion: (inputs) =>
      outputSdf(
        combineOrPassThrough(
          readSdf(inputs, 'A'),
          readSdf(inputs, 'B'),
          sdfUnion,
        ),
      ),
    sdfSubtract: (inputs) =>
      outputSdf(
        combineOrPassThrough(
          readSdf(inputs, 'A'),
          readSdf(inputs, 'B'),
          sdfSubtract,
        ),
      ),
    sdfIntersect: (inputs) =>
      outputSdf(
        combineOrPassThrough(
          readSdf(inputs, 'A'),
          readSdf(inputs, 'B'),
          sdfIntersect,
        ),
      ),
    sdfXor: (inputs) =>
      outputSdf(
        combineOrPassThrough(
          readSdf(inputs, 'A'),
          readSdf(inputs, 'B'),
          sdfXor,
        ),
      ),
    sdfSmoothUnion: (inputs) => {
      const blendRadius = readNumber(inputs, 'Blend', 0.15);
      return outputSdf(
        combineOrPassThrough(
          readSdf(inputs, 'A'),
          readSdf(inputs, 'B'),
          (a, b) => sdfSmoothUnion(a, b, blendRadius),
        ),
      );
    },
    sdfSmoothSubtract: (inputs) => {
      const blendRadius = readNumber(inputs, 'Blend', 0.15);
      return outputSdf(
        combineOrPassThrough(
          readSdf(inputs, 'A'),
          readSdf(inputs, 'B'),
          (a, b) => sdfSmoothSubtract(a, b, blendRadius),
        ),
      );
    },
    sdfSmoothIntersect: (inputs) => {
      const blendRadius = readNumber(inputs, 'Blend', 0.15);
      return outputSdf(
        combineOrPassThrough(
          readSdf(inputs, 'A'),
          readSdf(inputs, 'B'),
          (a, b) => sdfSmoothIntersect(a, b, blendRadius),
        ),
      );
    },
    sdfRound: (inputs) =>
      outputSdf(
        sdfRound(
          readSdf(inputs, 'In') ?? EMPTY_SDF,
          readNumber(inputs, 'Radius', 0.1),
        ),
      ),
    sdfOnion: (inputs) =>
      outputSdf(
        sdfOnion(
          readSdf(inputs, 'In') ?? EMPTY_SDF,
          readNumber(inputs, 'Thickness', 0.05),
        ),
      ),
    sdfTranslate: (inputs) =>
      outputSdf(
        sdfTranslate(
          readSdf(inputs, 'In') ?? EMPTY_SDF,
          readNumber(inputs, 'X', 0.4),
          readNumber(inputs, 'Y', 0),
        ),
      ),
    sdfRotate: (inputs) =>
      outputSdf(
        sdfRotate(
          readSdf(inputs, 'In') ?? EMPTY_SDF,
          readNumber(inputs, 'Degrees', 30),
        ),
      ),
    sdfScale: (inputs) =>
      outputSdf(
        sdfScale(
          readSdf(inputs, 'In') ?? EMPTY_SDF,
          readNumber(inputs, 'Factor', 1.5),
        ),
      ),
    sdfMirrorX: (inputs) =>
      outputSdf(sdfMirrorX(readSdf(inputs, 'In') ?? EMPTY_SDF)),
    sdfMirrorY: (inputs) =>
      outputSdf(sdfMirrorY(readSdf(inputs, 'In') ?? EMPTY_SDF)),
    sdfRepeat: (inputs) =>
      outputSdf(
        sdfRepeat(
          readSdf(inputs, 'In') ?? EMPTY_SDF,
          readNumber(inputs, 'Cell X', 0.8),
          readNumber(inputs, 'Cell Y', 0.8),
        ),
      ),
    sdfRadialRepeat: (inputs) =>
      outputSdf(
        sdfRadialRepeat(
          readSdf(inputs, 'In') ?? EMPTY_SDF,
          readNumber(inputs, 'Count', 6),
        ),
      ),
    sdfLessThan: (inputs) =>
      new Map<string, unknown>([
        [
          'Out',
          makeMaskValue(
            maskLessThan(
              readSdf(inputs, 'In') ?? EMPTY_SDF,
              readNumber(inputs, 'Threshold', 0),
            ),
          ),
        ],
      ]),
    sdfGreaterThan: (inputs) =>
      new Map<string, unknown>([
        [
          'Out',
          makeMaskValue(
            maskGreaterThan(
              readSdf(inputs, 'In') ?? EMPTY_SDF,
              readNumber(inputs, 'Threshold', 0),
            ),
          ),
        ],
      ]),
    sdfMeasureMask: (inputs) => {
      const measurement = measureMask(readMask(inputs, 'In') ?? EMPTY_MASK);
      return new Map<string, unknown>([
        ['White Pixels', measurement.whitePixels],
        ['Black Pixels', measurement.blackPixels],
        ['White Ratio', measurement.whiteRatio],
      ]);
    },
    sdfMeasureBrightness: (inputs) => {
      const measurement = measureBrightness(
        readSdf(inputs, 'In') ?? EMPTY_SDF,
        readNumber(inputs, 'Threshold', 0.5),
      );
      return new Map<string, unknown>([
        ['Bright Pixels', measurement.brightPixels],
        ['Bright Ratio', measurement.brightRatio],
      ]);
    },
    // Display sink: no outputs, but MUST have an impl (a registered type
    // without one throws at execution). Its preview reads recorded INPUTs.
    sdfRender: () => new Map<string, unknown>(),
  });

// ── preview registry (module-level: stable identity) ──

const sdfNodePreviews = {
  sdfCircle: SdfFieldPreview,
  sdfBox: SdfFieldPreview,
  sdfStar: SdfFieldPreview,
  sdfRoundedBox: SdfFieldPreview,
  sdfHexagon: SdfFieldPreview,
  sdfTriangle: SdfFieldPreview,
  sdfVesica: SdfFieldPreview,
  sdfMoon: SdfFieldPreview,
  sdfPie: SdfFieldPreview,
  sdfHeart: SdfFieldPreview,
  sdfUnion: SdfFieldPreview,
  sdfSubtract: SdfFieldPreview,
  sdfIntersect: SdfFieldPreview,
  sdfXor: SdfFieldPreview,
  sdfSmoothUnion: SdfFieldPreview,
  sdfSmoothSubtract: SdfFieldPreview,
  sdfSmoothIntersect: SdfFieldPreview,
  sdfRound: SdfFieldPreview,
  sdfOnion: SdfFieldPreview,
  sdfTranslate: SdfFieldPreview,
  sdfRotate: SdfFieldPreview,
  sdfScale: SdfFieldPreview,
  sdfMirrorX: SdfFieldPreview,
  sdfMirrorY: SdfFieldPreview,
  sdfRepeat: SdfFieldPreview,
  sdfRadialRepeat: SdfFieldPreview,
  sdfLessThan: SdfMaskPreview,
  sdfGreaterThan: SdfMaskPreview,
  sdfMeasureMask: SdfMeasurePreview,
  sdfMeasureBrightness: SdfMeasurePreview,
  sdfRender: SdfRenderPreview,
} satisfies NodePreviewRegistry<SdfNodeTypeId>;

export { sdfDataTypes, sdfNodeTypes, sdfImplementations, sdfNodePreviews };
export type { SdfDataTypeId, SdfNodeTypeId };
