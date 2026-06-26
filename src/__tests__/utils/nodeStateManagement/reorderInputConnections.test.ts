import { describe, it, expect } from 'vitest';
import {
  mainReducer,
  actionTypesMap,
} from '@/utils/nodeStateManagement/mainReducer';
import type { State } from '@/utils/nodeStateManagement/types';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';
import {
  constructNodeOfType,
  getCurrentNodesAndEdgesFromState,
} from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import { StateSerializer } from '@/utils/importExport/stateSerializer';
import { importGraphState } from '@/utils/importExport/stateImport';

// ---------------------------------------------------------------------------
// Test types: three sources fan into ONE input handle (In) of a sink; the sink
// also has a second input (Other) fed by a single non-fan-in edge so we can
// assert it is never touched by a reorder.
// ---------------------------------------------------------------------------
type TestDataTypeId = keyof typeof standardDataTypes | 'testNumber';
type TestNodeTypeId =
  | keyof typeof standardNodeTypes
  | 'testSource'
  | 'testSink';

function createBaseState(): State<TestDataTypeId, TestNodeTypeId> {
  return {
    dataTypes: {
      ...standardDataTypes,
      testNumber: {
        name: 'Test Number',
        underlyingType: 'number',
        color: '#E74C3C',
      },
    } as State<TestDataTypeId, TestNodeTypeId>['dataTypes'],
    typeOfNodes: {
      ...standardNodeTypes,
      testSource: {
        name: 'Source',
        headerColor: '#2E86AB',
        inputs: [],
        outputs: [{ name: 'Value', dataType: 'testNumber' as TestDataTypeId }],
      },
      testSink: {
        name: 'Sink',
        headerColor: '#C44536',
        inputs: [
          { name: 'In', dataType: 'testNumber' as TestDataTypeId },
          { name: 'Other', dataType: 'testNumber' as TestDataTypeId },
        ],
        outputs: [],
      },
    } as State<TestDataTypeId, TestNodeTypeId>['typeOfNodes'],
    nodes: [],
    edges: [],
  };
}

type FanInFixture = {
  state: State<TestDataTypeId, TestNodeTypeId>;
  sinkId: string;
  sinkInHandleId: string;
};

/** A sink whose `In` handle has a 3-way fan-in (e1,e2,e3) plus an unrelated
 *  single edge (e4) into `Other`. */
function createFanInState(withHistory = false): FanInFixture {
  const base = createBaseState();
  const sink = constructNodeOfType(
    base.dataTypes,
    'testSink' as TestNodeTypeId,
    base.typeOfNodes,
    'sink',
    { x: 400, y: 0 },
  );
  const sources = ['s1', 's2', 's3'].map((id, index) =>
    constructNodeOfType(
      base.dataTypes,
      'testSource' as TestNodeTypeId,
      base.typeOfNodes,
      id,
      { x: 0, y: index * 100 },
    ),
  );

  const sinkInHandleId = (sink.data.inputs?.[0] as { id: string }).id;
  const sinkOtherHandleId = (sink.data.inputs?.[1] as { id: string }).id;
  const sourceOutId = (node: (typeof sources)[number]) =>
    (node.data.outputs?.[0] as { id: string }).id;

  const edge = (
    id: string,
    source: (typeof sources)[number],
    targetHandle: string,
  ) => ({
    id,
    source: source.id,
    sourceHandle: sourceOutId(source),
    target: 'sink',
    targetHandle,
    type: 'configurableEdge' as const,
  });

  const state = {
    ...base,
    nodes: [sink, ...sources],
    edges: [
      edge('e1', sources[0], sinkInHandleId),
      edge('e2', sources[1], sinkInHandleId),
      edge('e3', sources[2], sinkInHandleId),
      edge('e4', sources[0], sinkOtherHandleId),
    ],
    ...(withHistory
      ? {
          history: {
            undoStack: [],
            redoStack: [],
            config: {},
            activeBatch: null,
          },
        }
      : {}),
  } as State<TestDataTypeId, TestNodeTypeId>;

  return { state, sinkId: 'sink', sinkInHandleId };
}

/** Map of edge id → its `data.order` (undefined when unset). */
function edgeOrders(
  state: State<TestDataTypeId, TestNodeTypeId>,
): Record<string, number | undefined> {
  const { edges } = getCurrentNodesAndEdgesFromState(state);
  return Object.fromEntries(edges.map((edge) => [edge.id, edge.data?.order]));
}

describe('REORDER_INPUT_CONNECTIONS — apply', () => {
  it('writes a contiguous 0..n-1 order across the fan-in edges in the new order', () => {
    const { state, sinkId, sinkInHandleId } = createFanInState();
    const next = mainReducer<TestDataTypeId, TestNodeTypeId>(state, {
      type: actionTypesMap.REORDER_INPUT_CONNECTIONS,
      payload: {
        nodeId: sinkId,
        handleId: sinkInHandleId,
        orderedEdgeIds: ['e3', 'e1', 'e2'],
      },
    });

    expect(edgeOrders(next)).toEqual({
      e3: 0,
      e1: 1,
      e2: 2,
      // The unrelated single edge into `Other` is never touched.
      e4: undefined,
    });
  });

  it('leaves the original state object untouched (immutability)', () => {
    const { state, sinkId, sinkInHandleId } = createFanInState();
    mainReducer<TestDataTypeId, TestNodeTypeId>(state, {
      type: actionTypesMap.REORDER_INPUT_CONNECTIONS,
      payload: {
        nodeId: sinkId,
        handleId: sinkInHandleId,
        orderedEdgeIds: ['e3', 'e2', 'e1'],
      },
    });
    expect(edgeOrders(state)).toEqual({
      e1: undefined,
      e2: undefined,
      e3: undefined,
      e4: undefined,
    });
  });

  it('re-ordering again overwrites the previous order', () => {
    const { state, sinkId, sinkInHandleId } = createFanInState();
    const once = mainReducer<TestDataTypeId, TestNodeTypeId>(state, {
      type: actionTypesMap.REORDER_INPUT_CONNECTIONS,
      payload: {
        nodeId: sinkId,
        handleId: sinkInHandleId,
        orderedEdgeIds: ['e3', 'e1', 'e2'],
      },
    });
    const twice = mainReducer<TestDataTypeId, TestNodeTypeId>(once, {
      type: actionTypesMap.REORDER_INPUT_CONNECTIONS,
      payload: {
        nodeId: sinkId,
        handleId: sinkInHandleId,
        orderedEdgeIds: ['e1', 'e2', 'e3'],
      },
    });
    expect(edgeOrders(twice)).toEqual({ e1: 0, e2: 1, e3: 2, e4: undefined });
  });
});

describe('REORDER_INPUT_CONNECTIONS — validation (rejected as a no-op)', () => {
  function reorder(
    state: State<TestDataTypeId, TestNodeTypeId>,
    payload: { nodeId: string; handleId: string; orderedEdgeIds: string[] },
  ) {
    return mainReducer<TestDataTypeId, TestNodeTypeId>(state, {
      type: actionTypesMap.REORDER_INPUT_CONNECTIONS,
      payload,
    });
  }

  it('rejects a payload missing one of the current connections', () => {
    const { state, sinkId, sinkInHandleId } = createFanInState();
    const next = reorder(state, {
      nodeId: sinkId,
      handleId: sinkInHandleId,
      orderedEdgeIds: ['e1', 'e2'],
    });
    expect(next).toBe(state);
  });

  it('rejects a payload with a foreign / non-existent edge id', () => {
    const { state, sinkId, sinkInHandleId } = createFanInState();
    const next = reorder(state, {
      nodeId: sinkId,
      handleId: sinkInHandleId,
      orderedEdgeIds: ['e1', 'e2', 'ghost'],
    });
    expect(next).toBe(state);
  });

  it('rejects a payload with a duplicated edge id', () => {
    const { state, sinkId, sinkInHandleId } = createFanInState();
    const next = reorder(state, {
      nodeId: sinkId,
      handleId: sinkInHandleId,
      orderedEdgeIds: ['e1', 'e1', 'e2'],
    });
    expect(next).toBe(state);
  });

  it('rejects reordering a handle with fewer than two connections', () => {
    const { state, sinkId } = createFanInState();
    const otherHandleId = (
      getCurrentNodesAndEdgesFromState(state).nodes.find(
        (n) => n.id === sinkId,
      )!.data.inputs?.[1] as { id: string }
    ).id;
    const next = reorder(state, {
      nodeId: sinkId,
      handleId: otherHandleId, // `Other` has a single connection (e4)
      orderedEdgeIds: ['e4'],
    });
    expect(next).toBe(state);
  });

  it('rejects when the node does not exist', () => {
    const { state, sinkInHandleId } = createFanInState();
    const next = reorder(state, {
      nodeId: 'nope',
      handleId: sinkInHandleId,
      orderedEdgeIds: ['e1', 'e2', 'e3'],
    });
    expect(next).toBe(state);
  });
});

describe('REORDER_INPUT_CONNECTIONS — history & serialization', () => {
  it('is a single undoable step that restores the prior order', () => {
    const { state, sinkId, sinkInHandleId } = createFanInState(true);
    const reordered = mainReducer<TestDataTypeId, TestNodeTypeId>(state, {
      type: actionTypesMap.REORDER_INPUT_CONNECTIONS,
      payload: {
        nodeId: sinkId,
        handleId: sinkInHandleId,
        orderedEdgeIds: ['e3', 'e1', 'e2'],
      },
    });
    expect(reordered.history?.undoStack).toHaveLength(1);
    expect(edgeOrders(reordered)).toMatchObject({ e3: 0, e1: 1, e2: 2 });

    const undone = mainReducer<TestDataTypeId, TestNodeTypeId>(reordered, {
      type: actionTypesMap.UNDO,
    });
    expect(edgeOrders(undone)).toEqual({
      e1: undefined,
      e2: undefined,
      e3: undefined,
      e4: undefined,
    });
    expect(undone.history?.undoStack).toHaveLength(0);
  });

  it('persists connection order through an export round-trip', () => {
    const { state, sinkId, sinkInHandleId } = createFanInState();
    const reordered = mainReducer<TestDataTypeId, TestNodeTypeId>(state, {
      type: actionTypesMap.REORDER_INPUT_CONNECTIONS,
      payload: {
        nodeId: sinkId,
        handleId: sinkInHandleId,
        orderedEdgeIds: ['e2', 'e3', 'e1'],
      },
    });

    const exported = StateSerializer.serialize(reordered);
    // Survives JSON (the export envelope is plain data).
    const roundTripped = JSON.parse(
      JSON.stringify(exported),
    ) as typeof exported;
    const exportedEdges = (
      roundTripped.state as {
        edges: { id: string; data?: { order?: number } }[];
      }
    ).edges;
    const orderById = Object.fromEntries(
      exportedEdges.map((edge) => [edge.id, edge.data?.order]),
    );
    expect(orderById).toEqual({ e2: 0, e3: 1, e1: 2, e4: undefined });
  });

  it('survives a full export → importGraphState round-trip (order preserved)', () => {
    const { state, sinkId, sinkInHandleId } = createFanInState();
    const reordered = mainReducer<TestDataTypeId, TestNodeTypeId>(state, {
      type: actionTypesMap.REORDER_INPUT_CONNECTIONS,
      payload: {
        nodeId: sinkId,
        handleId: sinkInHandleId,
        orderedEdgeIds: ['e2', 'e3', 'e1'],
      },
    });
    const json = JSON.stringify(StateSerializer.serialize(reordered));

    const result = importGraphState(json, {
      dataTypes: state.dataTypes,
      typeOfNodes: state.typeOfNodes,
      repair: { fillMissingDefaults: true },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const imported = result.data as unknown as {
      edges: { id: string; data?: { order?: number } }[];
    };
    const orderById = Object.fromEntries(
      imported.edges.map((edge) => [edge.id, edge.data?.order]),
    );
    // The importer never strips edge data, so the pinned order survives unchanged.
    expect(orderById).toEqual({ e2: 0, e3: 1, e1: 2, e4: undefined });
  });

  it('normalizes out-of-contract imported fan-in orders via the repair flag', () => {
    const { state } = createFanInState();
    const exported = JSON.parse(
      JSON.stringify(StateSerializer.serialize(state)),
    ) as { state: { edges: { id: string; data?: Record<string, unknown> }[] } };
    // Inject out-of-contract orders on the In fan-in: duplicate 99 (e1,e2) +
    // negative (e3). e4 (the unrelated single edge into Other) is left clean.
    for (const edge of exported.state.edges) {
      if (edge.id === 'e1') edge.data = { ...edge.data, order: 99 };
      if (edge.id === 'e2') edge.data = { ...edge.data, order: 99 };
      if (edge.id === 'e3') edge.data = { ...edge.data, order: -4 };
    }

    const result = importGraphState(JSON.stringify(exported), {
      dataTypes: state.dataTypes,
      typeOfNodes: state.typeOfNodes,
      repair: { fillMissingDefaults: true, normalizeConnectionOrder: true },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const imported = result.data as unknown as {
      edges: { id: string; data?: { order?: number } }[];
    };
    const orderById = Object.fromEntries(
      imported.edges.map((edge) => [edge.id, edge.data?.order]),
    );
    // Repacked to 0..n-1 in compiler order: e3(-4) first, then e1,e2 (tie at 99)
    // by edges-array index → e3:0, e1:1, e2:2. The single edge e4 is untouched.
    expect(orderById).toEqual({ e1: 1, e2: 2, e3: 0, e4: undefined });
  });
});
