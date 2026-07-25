import { describe, it, expect } from 'vitest';
import type { ReadableInputHandle } from '@/utils/nodeRunner/readInput';
import {
  MATH_OPERATIONS,
  COMPARE_OPERATIONS,
  MATH_OPERATION_FUNCTIONS,
  COMPARE_OPERATION_FUNCTIONS,
} from '@/advancedGraphExamples/mathOps';
import { sdfImplementations } from '@/advancedGraphExamples/sdfStudioDefinitions';

// The impls only read `inputs` (they ignore outputs/context), so a minimal-shape
// input map + a 1-arg cast is a faithful driver.
const runMath = sdfImplementations.math as unknown as (
  inputs: ReadonlyMap<string, ReadableInputHandle>,
) => Map<string, unknown>;
const runCompare = sdfImplementations.compare as unknown as (
  inputs: ReadonlyMap<string, ReadableInputHandle>,
) => Map<string, unknown>;

function inputsFrom(
  values: Record<string, unknown>,
): Map<string, ReadableInputHandle> {
  const map = new Map<string, ReadableInputHandle>();
  for (const [name, value] of Object.entries(values)) {
    map.set(name, { connections: [{ value }] });
  }
  return map;
}

describe('Math operation functions', () => {
  it('implements EVERY dropdown option (no option without a function)', () => {
    for (const operation of MATH_OPERATIONS) {
      expect(typeof MATH_OPERATION_FUNCTIONS[operation]).toBe('function');
    }
  });

  it('has no ORPHANED function (every function key is a listed dropdown option)', () => {
    for (const key of Object.keys(MATH_OPERATION_FUNCTIONS)) {
      expect(MATH_OPERATIONS as readonly string[]).toContain(key);
    }
  });

  const op = MATH_OPERATION_FUNCTIONS;
  it.each([
    ['Add', 2, 3, 5],
    ['Subtract', 5, 2, 3],
    ['Multiply', 3, 4, 12],
    ['Divide', 6, 2, 3],
    ['Modulo', 7, 3, 1],
    ['Power', 2, 3, 8],
    ['Min', 2, 5, 2],
    ['Max', 2, 5, 5],
    ['Hypot', 3, 4, 5],
    ['Log Base', 8, 2, 3],
    ['Negate', 5, 0, -5],
    ['Absolute', -5, 0, 5],
    ['Floor', 2.7, 0, 2],
    ['Ceil', 2.1, 0, 3],
    ['Round', 2.5, 0, 3],
    ['Truncate', -2.7, 0, -2],
    ['Fraction', 2.75, 0, 0.75],
    ['Fraction', -2.75, 0, 0.25],
    ['Sqrt', 9, 0, 3],
    ['Sign', -3, 0, -1],
    ['Reciprocal', 4, 0, 0.25],
    ['Exp', 0, 0, 1],
    ['Log2', 8, 0, 3],
    ['Sine', 0, 0, 0],
    ['Cosine', 0, 0, 1],
    ['Tangent', 0, 0, 0],
  ] as const)('%s(%d, %d) = %d', (name, a, b, expected) => {
    expect(op[name](a, b)).toBeCloseTo(expected, 10);
  });

  it('transcendental / conversion ops (unary ops ignore B — pass 0)', () => {
    expect(op.Atan2(1, 1)).toBeCloseTo(Math.PI / 4, 10);
    expect(op.Ln(Math.E, 0)).toBeCloseTo(1, 10);
    expect(op['To Radians'](180, 0)).toBeCloseTo(Math.PI, 10);
    expect(op['To Degrees'](Math.PI, 0)).toBeCloseTo(180, 10);
  });

  it('safe-math: guarded singularities return 0 (never NaN/±Infinity)', () => {
    expect(op.Divide(1, 0)).toBe(0);
    expect(op.Modulo(5, 0)).toBe(0);
    expect(op['Log Base'](8, 0)).toBe(0);
    expect(op['Log Base'](8, 1)).toBe(0); // log base 1 is undefined
    expect(op.Sqrt(-1, 0)).toBe(0);
    expect(op.Reciprocal(0, 0)).toBe(0);
    expect(op.Ln(0, 0)).toBe(0);
    expect(op.Ln(-1, 0)).toBe(0);
    expect(op.Log2(0, 0)).toBe(0);
  });
});

describe('Compare operation functions', () => {
  it('implements EVERY dropdown option', () => {
    for (const operation of COMPARE_OPERATIONS) {
      expect(typeof COMPARE_OPERATION_FUNCTIONS[operation]).toBe('function');
    }
  });

  const cmp = COMPARE_OPERATION_FUNCTIONS;
  it('comparisons', () => {
    expect(cmp['Greater Than'](3, 2)).toBe(true);
    expect(cmp['Greater Than'](2, 3)).toBe(false);
    expect(cmp['Less Than'](2, 3)).toBe(true);
    expect(cmp['Greater Or Equal'](2, 2)).toBe(true);
    expect(cmp['Less Or Equal'](2, 2)).toBe(true);
    expect(cmp.Equal(2, 2)).toBe(true);
    expect(cmp.Equal(2, 3)).toBe(false);
    expect(cmp['Not Equal'](2, 3)).toBe(true);
  });

  it('Approximately Equal uses a small epsilon', () => {
    expect(cmp['Approximately Equal'](1, 1 + 1e-9)).toBe(true);
    expect(cmp['Approximately Equal'](1, 1.1)).toBe(false);
  });
});

describe('math implementation (reads inputs, dispatches on the enum)', () => {
  it('computes Result from A, B and the Op enum', () => {
    expect(runMath(inputsFrom({ A: 2, B: 3, Op: 'Add' })).get('Result')).toBe(
      5,
    );
    expect(
      runMath(inputsFrom({ A: 10, B: 4, Op: 'Subtract' })).get('Result'),
    ).toBe(6);
  });

  it('falls back to Add for an unknown operation', () => {
    expect(runMath(inputsFrom({ A: 2, B: 3, Op: 'Bogus' })).get('Result')).toBe(
      5,
    );
  });

  it('non-numeric inputs fall back to 0 (readNumber finite-guard)', () => {
    expect(
      runMath(inputsFrom({ A: 'nope', B: 3, Op: 'Add' })).get('Result'),
    ).toBe(3);
  });

  it('clamps a non-finite result to 0 (safe-math hygiene)', () => {
    // 0 ** -1 = Infinity → the impl clamps to 0.
    expect(
      runMath(inputsFrom({ A: 0, B: -1, Op: 'Power' })).get('Result'),
    ).toBe(0);
  });
});

describe('compare implementation (outputs a boolean condition)', () => {
  it('computes a boolean Result from the enum', () => {
    expect(
      runCompare(inputsFrom({ A: 5, B: 3, Op: 'Greater Than' })).get('Result'),
    ).toBe(true);
    expect(
      runCompare(inputsFrom({ A: 5, B: 3, Op: 'Less Than' })).get('Result'),
    ).toBe(false);
  });

  it('falls back to Greater Than for an unknown operation', () => {
    expect(
      runCompare(inputsFrom({ A: 5, B: 3, Op: 'Bogus' })).get('Result'),
    ).toBe(true);
  });
});
