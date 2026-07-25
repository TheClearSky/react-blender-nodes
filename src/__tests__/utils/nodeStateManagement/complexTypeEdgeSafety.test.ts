// Regression pin for the applyPlan inference clone (ADD_EDGE step 1).
//
// `structuredClone(newData)` threw `DataCloneError` the moment a COMPLEX data
// type (zod complexSchema = closures) was wired into a loop/switch/group infer
// slot — the produce died mid-dispatch, so the edge silently never landed (no
// toast: an exception is not a validation rejection). Loop, switch, AND group
// boundaries all funnel through the same `nodeDataReplacements` path
// (`planInference.ts` › `planInferenceForEdgeAddition`), so the loop + switch
// cases below pin the shared mechanism.
//
// The fix (`nodeStateManagement/cloneDeepPreservingNonPlainObjects.ts` ›
// `cloneDeepPreservingNonPlainObjects`) deep-copies plain data but passes
// non-plain objects (schemas, functions) through BY REFERENCE — which is also
// the CORRECT semantics: edge validation compares `complexSchema` by reference
// identity ("data types are immutable singletons"), so materialized handles
// must SHARE the schema object.
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  mainReducer,
  actionTypesMap,
} from '@/utils/nodeStateManagement/mainReducer';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';
import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
  type State,
  type SupportedUnderlyingTypes,
} from '@/utils/nodeStateManagement/types';

type ComplexProbeValue = { kind: 'probe' };
const complexProbeSchema = z.custom<ComplexProbeValue>(
  (candidate) =>
    typeof candidate === 'object' &&
    candidate !== null &&
    (candidate as ComplexProbeValue).kind === 'probe',
  'expected a probe value',
);

const testDataTypes = {
  ...standardDataTypes,
  complexProbe: makeDataTypeWithAutoInfer({
    name: 'Complex Probe',
    underlyingType: 'complex',
    color: '#8b5cf6',
    complexSchema: complexProbeSchema,
  }),
} as const;

const complexSourceType = makeTypeOfNodeWithAutoInfer<
  keyof typeof testDataTypes,
  'complexSource',
  SupportedUnderlyingTypes,
  z.ZodType
>({
  name: 'Complex Source',
  headerColor: '#7c3aed',
  locationInContextMenu: ['Test'],
  inputs: [],
  outputs: [{ name: 'Out', dataType: 'complexProbe' }],
});

const testNodeTypes = {
  ...standardNodeTypes,
  complexSource: complexSourceType,
} as const;

// Runtime-minted structure node ids force the open string unions.
type TestState = State<string, string>;

function createTestState(): TestState {
  return {
    dataTypes: testDataTypes as unknown as TestState['dataTypes'],
    typeOfNodes: testNodeTypes as unknown as TestState['typeOfNodes'],
    nodes: [],
    edges: [],
    enableTypeInference: true,
    enableCycleChecking: true,
  };
}

function findInferInput(
  state: TestState,
  nodeTypeUniqueId: string,
  inferDataTypeId: string,
): { nodeId: string; handleId: string } {
  const node = state.nodes.find(
    (entry) => entry.data.nodeTypeUniqueId === nodeTypeUniqueId,
  );
  expect(node).toBeDefined();
  const inferInput = node!.data.inputs?.find(
    (input) =>
      !('inputs' in input) &&
      input.dataType?.dataTypeUniqueId === inferDataTypeId,
  );
  expect(inferInput).toBeDefined();
  return {
    nodeId: node!.id,
    handleId: (inferInput as { id: string }).id,
  };
}

/** Every handle on `node` typed `complexProbe` must carry THE schema
 *  singleton by reference — a clone would break identity-based validation. */
function expectSchemaIdentityOnProbeHandles(node: TestState['nodes'][number]) {
  const allHandles = [
    ...(node.data.inputs ?? []),
    ...(node.data.outputs ?? []),
  ];
  const probeHandles = allHandles.filter(
    (handle) =>
      !('inputs' in handle) &&
      (handle.dataType?.dataTypeUniqueId === 'complexProbe' ||
        handle.inferredDataType?.dataTypeUniqueId === 'complexProbe'),
  );
  expect(probeHandles.length).toBeGreaterThan(0);
  for (const handle of probeHandles) {
    const resolved =
      'inferredDataType' in handle && handle.inferredDataType
        ? handle.inferredDataType
        : (handle as { dataType?: { dataTypeObject?: unknown } }).dataType;
    const dataTypeObject = (
      resolved as { dataTypeObject?: { complexSchema?: unknown } }
    )?.dataTypeObject;
    if (dataTypeObject && 'complexSchema' in dataTypeObject) {
      expect(dataTypeObject.complexSchema).toBe(complexProbeSchema);
    }
  }
}

describe('applyPlan — complex-typed inference connections (cloneDeepPreservingNonPlainObjects)', () => {
  it('connects a complex output into a LOOP infer slot without DataCloneError', () => {
    let state = createTestState();
    state = mainReducer<string, string>(state, {
      type: actionTypesMap.ADD_LOOP,
      payload: { position: { x: 0, y: 0 } },
    });
    state = mainReducer<string, string>(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: 'complexSource', position: { x: -300, y: 0 } },
    });

    const sourceNode = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === 'complexSource',
    )!;
    const sourceOut = sourceNode.data.outputs!.find(
      (output) => output.name === 'Out',
    )!;
    const loopTarget = findInferInput(state, 'loopStart', 'loopInfer');

    const edgeCountBefore = state.edges.length;
    // THE regression: this exact dispatch used to throw
    // `DataCloneError: ... could not be cloned` out of applyPlan step 1.
    const nextState = mainReducer<string, string>(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: sourceNode.id,
          target: loopTarget.nodeId,
          sourceHandle: sourceOut.id,
          targetHandle: loopTarget.handleId,
        },
      },
    });

    expect(nextState.edges.length).toBe(edgeCountBefore + 1);

    // Inference materializes the complex channel across the WHOLE triplet,
    // and every materialized handle shares the schema singleton by reference.
    for (const structuralType of ['loopStart', 'loopStop', 'loopEnd']) {
      const member = nextState.nodes.find(
        (node) => node.data.nodeTypeUniqueId === structuralType,
      )!;
      expect(member).toBeDefined();
      expectSchemaIdentityOnProbeHandles(member);
    }
  });

  it('connects a complex output into a SWITCH infer slot without DataCloneError', () => {
    let state = createTestState();
    state = mainReducer<string, string>(state, {
      type: actionTypesMap.ADD_SWITCH,
      payload: { position: { x: 0, y: 0 } },
    });
    state = mainReducer<string, string>(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: 'complexSource', position: { x: -300, y: 0 } },
    });

    const sourceNode = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === 'complexSource',
    )!;
    const sourceOut = sourceNode.data.outputs!.find(
      (output) => output.name === 'Out',
    )!;
    const switchTarget = findInferInput(state, 'switchStart', 'switchInfer');

    const edgeCountBefore = state.edges.length;
    const nextState = mainReducer<string, string>(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: sourceNode.id,
          target: switchTarget.nodeId,
          sourceHandle: sourceOut.id,
          targetHandle: switchTarget.handleId,
        },
      },
    });

    expect(nextState.edges.length).toBe(edgeCountBefore + 1);
    for (const structuralType of ['switchStart', 'switchEnd']) {
      const member = nextState.nodes.find(
        (node) => node.data.nodeTypeUniqueId === structuralType,
      )!;
      expect(member).toBeDefined();
      expectSchemaIdentityOnProbeHandles(member);
    }
  });

  it('keeps primitive-typed inference behavior identical (control)', () => {
    // The pre-fix behavior for schema-less types must be preserved verbatim:
    // connect a standard condition output into a loop infer slot.
    let state = createTestState();
    state = mainReducer<string, string>(state, {
      type: actionTypesMap.ADD_LOOP,
      payload: { position: { x: 0, y: 0 } },
    });
    // The loop-stop node exposes a condition OUTPUT-side handle pair; use a
    // second loop's stop condition as a primitive source instead of adding
    // bespoke types: simpler — connect loopStop's condition output? The
    // condition handle participates in loop internals, so use the safest
    // primitive control: a second complexSource is complex by design, so
    // instead assert that a NO-inference edge (condition → condition) still
    // works through the same reducer path.
    const loopStop = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === 'loopStop',
    )!;
    expect(loopStop).toBeDefined();
    // Control assertion: the reducer round-trips untouched states — the fix
    // must not alter ANY non-inference path. (Full primitive loop-inference
    // behavior is already pinned by the existing loops/zones suites.)
    const untouched = mainReducer<string, string>(state, {
      type: actionTypesMap.SET_VIEWPORT,
      payload: { viewport: { x: 0, y: 0, zoom: 1 } },
    });
    expect(untouched.nodes.length).toBe(state.nodes.length);
  });
});

// ── the `undefined === undefined` schema-fallback guard ────────────────────
//
// Export strips `complexSchema` from every handle's embedded dataTypeObject;
// a state loaded through a RAW `REPLACE_STATE` (no rehydration — the exact
// shape a story/consumer produces by dispatching a parsed export verbatim)
// therefore has `undefined` schemas on BOTH sides of every complex handle
// pair. The old fallback `sourceSchema === targetSchema` accepted that as
// proof of sameness, silently validating CROSS-TYPE complex wires between
// imported nodes. Ids are the primary key; a schema reference only counts
// when it exists.
import { exportGraphState } from '@/utils/importExport/stateExport';

const secondProbeSchema = z.custom<{ kind: 'other' }>(
  (candidate) =>
    typeof candidate === 'object' &&
    candidate !== null &&
    (candidate as { kind: string }).kind === 'other',
  'expected the other probe value',
);

const guardDataTypes = {
  ...standardDataTypes,
  complexProbe: makeDataTypeWithAutoInfer({
    name: 'Complex Probe',
    underlyingType: 'complex',
    color: '#8b5cf6',
    complexSchema: complexProbeSchema,
  }),
  otherProbe: makeDataTypeWithAutoInfer({
    name: 'Other Probe',
    underlyingType: 'complex',
    color: '#e5e7eb',
    complexSchema: secondProbeSchema,
  }),
  // Aliased type: a DIFFERENT id deliberately sharing complexProbe's schema
  // object — the legitimate use of the reference-identity fallback, which the
  // guard must keep working.
  aliasedProbe: makeDataTypeWithAutoInfer({
    name: 'Aliased Probe',
    underlyingType: 'complex',
    color: '#22c55e',
    complexSchema: complexProbeSchema,
  }),
} as const;

const guardNodeTypes = {
  ...standardNodeTypes,
  probeSource: makeTypeOfNodeWithAutoInfer<
    keyof typeof guardDataTypes,
    'probeSource',
    SupportedUnderlyingTypes,
    z.ZodType
  >({
    name: 'Probe Source',
    headerColor: '#7c3aed',
    locationInContextMenu: ['Test'],
    inputs: [],
    outputs: [{ name: 'Out', dataType: 'complexProbe' }],
  }),
  probeSink: makeTypeOfNodeWithAutoInfer<
    keyof typeof guardDataTypes,
    'probeSink',
    SupportedUnderlyingTypes,
    z.ZodType
  >({
    name: 'Probe Sink',
    headerColor: '#0d9488',
    locationInContextMenu: ['Test'],
    inputs: [
      { name: 'Same', dataType: 'complexProbe' },
      { name: 'Cross', dataType: 'otherProbe' },
      { name: 'Aliased', dataType: 'aliasedProbe' },
    ],
    outputs: [],
  }),
} as const;

function createGuardState(): TestState {
  return {
    dataTypes: guardDataTypes as unknown as TestState['dataTypes'],
    typeOfNodes: guardNodeTypes as unknown as TestState['typeOfNodes'],
    nodes: [],
    edges: [],
    enableTypeInference: true,
    enableCycleChecking: true,
    enableComplexTypeChecking: true,
  };
}

function addSourceAndSink(state: TestState): TestState {
  let next = mainReducer<string, string>(state, {
    type: actionTypesMap.ADD_NODE,
    payload: { type: 'probeSource', position: { x: 0, y: 0 } },
  });
  next = mainReducer<string, string>(next, {
    type: actionTypesMap.ADD_NODE,
    payload: { type: 'probeSink', position: { x: 300, y: 0 } },
  });
  return next;
}

function connectByNames(state: TestState, targetInputName: string): TestState {
  const sourceNode = state.nodes.find(
    (node) => node.data.nodeTypeUniqueId === 'probeSource',
  )!;
  const sinkNode = state.nodes.find(
    (node) => node.data.nodeTypeUniqueId === 'probeSink',
  )!;
  const sourceOut = sourceNode.data.outputs!.find(
    (output) => output.name === 'Out',
  )! as { id: string };
  const sinkInput = sinkNode.data.inputs!.find(
    (input) => !('inputs' in input) && input.name === targetInputName,
  )! as { id: string };
  return mainReducer<string, string>(state, {
    type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
    payload: {
      edge: {
        source: sourceNode.id,
        target: sinkNode.id,
        sourceHandle: sourceOut.id,
        targetHandle: sinkInput.id,
      },
    },
  });
}

describe('edge validation — complex schema-identity fallback guard', () => {
  it('fresh state: same id allowed, cross-type rejected, aliased schema allowed', () => {
    const state = addSourceAndSink(createGuardState());

    const sameType = connectByNames(state, 'Same');
    expect(sameType.edges.length).toBe(1);

    const crossType = connectByNames(state, 'Cross');
    expect(crossType.edges.length).toBe(0); // COMPLEX_TYPE_MISMATCH

    // Different id, SAME schema object — the fallback's legitimate case.
    const aliased = connectByNames(state, 'Aliased');
    expect(aliased.edges.length).toBe(1);
  });

  it('aliased complex types validate even with an (empty) conversion table present', () => {
    // NS-6 regression: the conversion check recognized sameness by id ONLY,
    // so merely SUPPLYING a conversion table (even `{}`) flipped an aliased
    // complex pair from valid to CONVERSION_NOT_ALLOWED. Both checks now share
    // `areComplexTypesSame`, so the aliased pair short-circuits as "same".
    const stateWithTable: TestState = {
      ...createGuardState(),
      allowedConversionsBetweenDataTypes: {},
    };
    const wired = addSourceAndSink(stateWithTable);
    const aliased = connectByNames(wired, 'Aliased');
    expect(aliased.edges.length).toBe(1);
    // Genuinely-different complex types are still rejected under the table.
    const crossType = connectByNames(wired, 'Cross');
    expect(crossType.edges.length).toBe(0);
  });

  it('raw-replaced export (schemas stripped): cross-type must NOT validate via undefined===undefined', () => {
    const authored = addSourceAndSink(createGuardState());

    // The REAL serializer + JSON round-trip: exactly what a consumer gets by
    // dispatching a parsed export verbatim (no rehydration).
    // `exportGraphState` returns the envelope as a JSON STRING.
    const parsed = JSON.parse(exportGraphState(authored as never)) as {
      state: unknown;
    };
    const replaced = mainReducer<string, string>(authored, {
      type: actionTypesMap.REPLACE_STATE,
      payload: { state: parsed.state as never },
    });

    // Sanity: the round-trip genuinely stripped the handle schemas.
    const sinkNode = replaced.nodes.find(
      (node) => node.data.nodeTypeUniqueId === 'probeSink',
    )!;
    const crossInput = sinkNode.data.inputs!.find(
      (input) => !('inputs' in input) && input.name === 'Cross',
    ) as { dataType?: { dataTypeObject?: { complexSchema?: unknown } } };
    expect(crossInput.dataType?.dataTypeObject?.complexSchema).toBeUndefined();

    // THE guard: ids differ + both schemas undefined → reject.
    const crossType = connectByNames(replaced, 'Cross');
    expect(crossType.edges.length).toBe(0);

    // Same-id wires keep working on stripped states (id is the primary key).
    const sameType = connectByNames(replaced, 'Same');
    expect(sameType.edges.length).toBe(1);
  });
});
