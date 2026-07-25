// Pure arithmetic + comparison operation tables for the SDF Shape Studio's Math /
// Compare enum nodes (and their unit tests). No React / runner imports — just the
// math. Safe-math (Blender convention): guarded singularities return 0; the Math impl
// additionally clamps a non-finite result. Unary ops use A and ignore B — every table
// entry is `(a, b) => …` so the impl can dispatch uniformly.

const MATH_OPERATIONS = [
  'Add',
  'Subtract',
  'Multiply',
  'Divide',
  'Modulo',
  'Power',
  'Min',
  'Max',
  'Atan2',
  'Hypot',
  'Log Base',
  'Negate',
  'Absolute',
  'Floor',
  'Ceil',
  'Round',
  'Truncate',
  'Fraction',
  'Sqrt',
  'Sign',
  'Reciprocal',
  'Exp',
  'Ln',
  'Log2',
  'Sine',
  'Cosine',
  'Tangent',
  'To Radians',
  'To Degrees',
] as const;

const COMPARE_OPERATIONS = [
  'Greater Than',
  'Less Than',
  'Greater Or Equal',
  'Less Or Equal',
  'Equal',
  'Not Equal',
  'Approximately Equal',
] as const;

const APPROX_EQUAL_EPSILON = 1e-6;

const MATH_OPERATION_FUNCTIONS: Record<
  string,
  (a: number, b: number) => number
> = {
  Add: (a, b) => a + b,
  Subtract: (a, b) => a - b,
  Multiply: (a, b) => a * b,
  Divide: (a, b) => (b !== 0 ? a / b : 0),
  Modulo: (a, b) => (b !== 0 ? a % b : 0),
  Power: (a, b) => a ** b,
  Min: (a, b) => Math.min(a, b),
  Max: (a, b) => Math.max(a, b),
  Atan2: (a, b) => Math.atan2(a, b),
  Hypot: (a, b) => Math.hypot(a, b),
  'Log Base': (a, b) =>
    a > 0 && b > 0 && b !== 1 ? Math.log(a) / Math.log(b) : 0,
  Negate: (a) => -a,
  Absolute: (a) => Math.abs(a),
  Floor: (a) => Math.floor(a),
  Ceil: (a) => Math.ceil(a),
  Round: (a) => Math.round(a),
  Truncate: (a) => Math.trunc(a),
  Fraction: (a) => a - Math.floor(a),
  Sqrt: (a) => (a >= 0 ? Math.sqrt(a) : 0),
  Sign: (a) => Math.sign(a),
  Reciprocal: (a) => (a !== 0 ? 1 / a : 0),
  Exp: (a) => Math.exp(a),
  Ln: (a) => (a > 0 ? Math.log(a) : 0),
  Log2: (a) => (a > 0 ? Math.log2(a) : 0),
  Sine: (a) => Math.sin(a),
  Cosine: (a) => Math.cos(a),
  Tangent: (a) => Math.tan(a),
  'To Radians': (a) => (a * Math.PI) / 180,
  'To Degrees': (a) => (a * 180) / Math.PI,
};

const COMPARE_OPERATION_FUNCTIONS: Record<
  string,
  (a: number, b: number) => boolean
> = {
  'Greater Than': (a, b) => a > b,
  'Less Than': (a, b) => a < b,
  'Greater Or Equal': (a, b) => a >= b,
  'Less Or Equal': (a, b) => a <= b,
  Equal: (a, b) => a === b,
  'Not Equal': (a, b) => a !== b,
  'Approximately Equal': (a, b) => Math.abs(a - b) <= APPROX_EQUAL_EPSILON,
};

export {
  MATH_OPERATIONS,
  COMPARE_OPERATIONS,
  MATH_OPERATION_FUNCTIONS,
  COMPARE_OPERATION_FUNCTIONS,
};
