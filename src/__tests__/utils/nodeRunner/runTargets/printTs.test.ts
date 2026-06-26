import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { emitJs } from '@/utils/nodeRunner/runTargets/codegen/emitJs';
import type { ExecutionPlan } from '@/utils/nodeRunner/types';
import type { CodegenMetadata } from '@/utils/nodeRunner/runTargets';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

const numberType = { dataTypeUniqueId: 'number' };
const node = (id: string, t: string, i: unknown[], o: unknown[]) => ({
  id,
  position: { x: 0, y: 0 },
  data: { nodeTypeUniqueId: t, inputs: i, outputs: o },
});

/** Number source → Add(A connected, B default 3), both `number`-typed. */
function fixture() {
  const plan: ExecutionPlan = {
    levels: [
      [
        {
          kind: 'standard',
          nodeId: 'src',
          nodeTypeId: 'src',
          nodeTypeName: 'Number',
          concurrencyLevel: 0,
        },
      ],
      [
        {
          kind: 'standard',
          nodeId: 'add',
          nodeTypeId: 'add',
          nodeTypeName: 'Add',
          concurrencyLevel: 1,
        },
      ],
    ],
    inputResolutionMap: new Map([
      [
        'add:a',
        [{ edgeId: 'e', sourceNodeId: 'src', sourceHandleId: 'src_out' }],
      ],
    ]),
    outputDistributionMap: new Map(),
    nodeCount: 2,
    warnings: [],
  };
  const state = {
    nodes: [
      node(
        'src',
        'src',
        [],
        [{ id: 'src_out', name: 'Value', dataType: numberType }],
      ),
      node(
        'add',
        'add',
        [
          { id: 'a', name: 'A', dataType: numberType },
          {
            id: 'b',
            name: 'B',
            allowInput: true,
            value: 3,
            dataType: numberType,
          },
        ],
        [{ id: 'sum', name: 'Sum', dataType: numberType }],
      ),
    ],
    edges: [],
    typeOfNodes: { src: { name: 'Number' }, add: { name: 'Add' } },
    dataTypes: {
      number: { name: 'Number', underlyingType: 'number', color: '#fff' },
    },
  };
  // Decision 6: dataType→TS type lives in CodegenMetadata, passed to emitJs.
  const metadata: CodegenMetadata = { dataTypeToTsType: { number: 'number' } };
  return { plan, state: state as AnyState, metadata };
}

type ValueApiInput = {
  connections: { value: unknown }[];
  isDefault: boolean;
  defaultValue?: unknown;
};

/** Strip TS types, evaluate the module, and run `runGraph` with the impls. */
async function transpileAndRun(
  tsSource: string,
  impls: Record<
    string,
    (inputs: Map<string, ValueApiInput>) => Map<string, unknown>
  >,
): Promise<Record<string, unknown>> {
  const js = ts.transpileModule(tsSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const factory = new Function(`${js}\nreturn runGraph;`);
  const runGraph = factory() as (
    impls: unknown,
    options?: unknown,
  ) => Promise<Record<string, unknown>>;
  return runGraph(impls, {});
}

describe('emitJs — TypeScript target (Stage D)', () => {
  it('emits a typed module with codegenTypes-driven store casts', () => {
    const { plan, state, metadata } = fixture();
    const source = emitJs(plan, state, { metadata, target: 'typescript' });
    expect(source).toContain('type NodeImplementation =');
    expect(source).toContain(
      'async function runGraph(functionImplementations: Record<string, NodeImplementation>',
    );
    expect(source).toContain(
      'const numberValue = (await functionImplementations["src"]',
    );
    // store cast pulled from DataType.codegenTypes.typescript (inline const form)
    expect(source).toContain('.get("Sum") as number;');
    expect(source).toContain('Promise<Record<string, unknown>>');
  });

  it('falls back to `unknown` when a data type has no codegenTypes', () => {
    const { plan, state, metadata } = fixture();
    metadata.dataTypeToTsType = {};
    const source = emitJs(plan, state, { metadata, target: 'typescript' });
    expect(source).toContain('.get("Sum") as unknown;');
  });

  it('transpiles and runs with executor-equivalent values', async () => {
    const { plan, state, metadata } = fixture();
    const source = emitJs(plan, state, {
      metadata,
      target: 'typescript',
      exportRunGraph: false,
    });
    const impls = {
      src: () => new Map<string, unknown>([['Value', 10]]),
      add: (inputs: Map<string, ValueApiInput>) => {
        const a = Number(inputs.get('A')?.connections[0]?.value ?? 0);
        const handleB = inputs.get('B');
        const b = Number(handleB?.isDefault ? handleB.defaultValue : 0);
        return new Map<string, unknown>([['Sum', a + b]]);
      },
    };
    const values = await transpileAndRun(source, impls);
    expect(values['src:src_out']).toBe(10);
    expect(values['add:sum']).toBe(13);
  });
});
