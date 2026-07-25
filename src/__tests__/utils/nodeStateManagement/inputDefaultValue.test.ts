// Pins the input-default DSL: `TypeOfInput.defaultValue` is copied onto a
// freshly-constructed node's input handle `value` at construction, for the
// number/string/boolean underlying types whose runtime value matches — so a
// node type can declare its own defaults instead of the consumer seeding them
// via UPDATE_INPUT_VALUE after every add.
import { describe, it, expect } from 'vitest';
import { constructNodeOfType } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
  type State,
} from '@/utils/nodeStateManagement/types';

const dataTypes = {
  num: makeDataTypeWithAutoInfer({
    name: 'Number',
    underlyingType: 'number',
    color: '#38bdf8',
    allowInput: true,
  }),
  text: makeDataTypeWithAutoInfer({
    name: 'Text',
    underlyingType: 'string',
    color: '#22c55e',
    allowInput: true,
  }),
  flag: makeDataTypeWithAutoInfer({
    name: 'Flag',
    underlyingType: 'boolean',
    color: '#f59e0b',
    allowInput: true,
  }),
} as const;

const typeOfNodes = {
  demo: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypes, 'demo'>({
    name: 'Demo',
    headerColor: '#7c3aed',
    inputs: [
      { name: 'Radius', dataType: 'num', defaultValue: 0.4 },
      { name: 'Label', dataType: 'text', defaultValue: 'hello' },
      { name: 'Enabled', dataType: 'flag', defaultValue: true },
      { name: 'NoDefault', dataType: 'num' },
      // A number-typed input given a mismatched (string) default — must be
      // ignored, not coerced.
      { name: 'Mismatched', dataType: 'num', defaultValue: 'nope' as never },
    ],
    outputs: [],
  }),
} as const;

type DemoState = State<keyof typeof dataTypes, 'demo'>;

function findInput(node: DemoState['nodes'][number], name: string) {
  return node.data.inputs?.find(
    (input) => !('inputs' in input) && input.name === name,
  ) as { name: string; value?: unknown } | undefined;
}

describe('constructNodeOfType — TypeOfInput.defaultValue seeding', () => {
  // Explicit type args pin UnderlyingType/ComplexSchemaType to their defaults —
  // inference from the auto-infer factories widens ComplexSchemaType to ZodType
  // otherwise (the documented generic-widening trap).
  const node = constructNodeOfType<keyof typeof dataTypes, 'demo'>(
    dataTypes as unknown as DemoState['dataTypes'],
    'demo',
    typeOfNodes as unknown as DemoState['typeOfNodes'],
    'node-1',
    { x: 0, y: 0 },
  );

  it('copies a matching number/string/boolean default onto the handle value', () => {
    expect(findInput(node, 'Radius')?.value).toBe(0.4);
    expect(findInput(node, 'Label')?.value).toBe('hello');
    expect(findInput(node, 'Enabled')?.value).toBe(true);
  });

  it('leaves value undefined when no default is declared', () => {
    expect(findInput(node, 'NoDefault')?.value).toBeUndefined();
  });

  it('ignores a default whose type mismatches the underlying type', () => {
    // A string default on a number input must not become the number value.
    expect(findInput(node, 'Mismatched')?.value).toBeUndefined();
  });
});
