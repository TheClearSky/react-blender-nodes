import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { validateAction } from '@/utils/nodeStateManagement/planApply/validators';
import { applyPlan } from '@/utils/nodeStateManagement/planApply/applyPlan';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';
import {
  makeStateWithAutoInfer,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { constructNodeOfType } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';

// ---------------------------------------------------------------------------
// Root Graph I/O ↔ group-boundary inference parity.
//
// Connecting a wire to a ROOT Graph Input/Output should, by default, behave
// exactly like a group boundary: concretize the consumed handle's type, RENAME
// it to the connected source's name, and grow a fresh blank infer spare. The
// two `<FullGraph>` props (forwarded onto the action payload here) opt out per
// axis. The standard data/node types provide `groupInfer` + the
// groupInput/groupOutput boundary node types.
// ---------------------------------------------------------------------------

const numberType = makeDataTypeWithAutoInfer({
  name: 'Number',
  underlyingType: 'number',
  color: '#E74C3C',
});

const dataTypes = {
  ...standardDataTypes,
  numberType,
} as const;

type DataTypeId = keyof typeof dataTypes;

const doublerNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Doubler',
  inputs: [{ name: 'In', dataType: 'numberType' }],
  outputs: [{ name: 'Out', dataType: 'numberType' }],
});

const typeOfNodes = {
  ...standardNodeTypes,
  doubler: doublerNodeType,
} as const;

function createEmptyState() {
  return makeStateWithAutoInfer({
    dataTypes,
    typeOfNodes,
    nodes: [],
    edges: [],
    enableTypeInference: true,
  });
}
type TestState = ReturnType<typeof createEmptyState>;

function buildNode(
  nodeType: keyof typeof typeOfNodes,
  id: string,
): TestState['nodes'][number] {
  return constructNodeOfType(
    dataTypes,
    nodeType,
    typeOfNodes as TestState['typeOfNodes'],
    id,
    { x: 0, y: 0 },
  ) as TestState['nodes'][number];
}

function leafHandles(
  state: TestState,
  nodeId: string,
  dir: 'input' | 'output',
) {
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  const list = dir === 'output' ? node.data.outputs : node.data.inputs;
  return (list ?? []).flatMap((handle) =>
    'inputs' in handle ? handle.inputs : [handle],
  );
}

function names(state: TestState, nodeId: string, dir: 'input' | 'output') {
  return leafHandles(state, nodeId, dir).map((handle) => handle.name);
}

function dataTypeIds(
  state: TestState,
  nodeId: string,
  dir: 'input' | 'output',
) {
  return leafHandles(state, nodeId, dir).map(
    (handle) => handle.dataType?.dataTypeUniqueId,
  );
}

function firstHandleId(
  state: TestState,
  nodeId: string,
  dir: 'input' | 'output',
) {
  return leafHandles(state, nodeId, dir)[0].id;
}

/** Dispatch ADD_EDGE_BY_REACT_FLOW through validate→apply and return next state. */
function connect(
  state: TestState,
  edge: {
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  },
  policy?: { allowRootIORename?: boolean; allowRootIOStructureEdit?: boolean },
): TestState {
  const result = validateAction(state, {
    type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
    payload: { edge, ...policy },
  });
  if (!result || !result.ok) {
    throw new Error(
      `connect failed: ${result ? JSON.stringify(result.error) : 'null'}`,
    );
  }
  return produce(state, (draft) => {
    applyPlan(draft, result.value);
  });
}

// Root state: a Graph Input (gi) feeding a Doubler (d) feeding a Graph Output
// (go). gi starts with one blank groupInfer output template; go with one blank
// groupInfer input template.
function rootState(): TestState {
  return {
    ...createEmptyState(),
    nodes: [
      buildNode('groupInput', 'gi'),
      buildNode('doubler', 'd'),
      buildNode('groupOutput', 'go'),
    ],
  };
}

describe('root Graph Input inference (connect to a Graph Input template)', () => {
  it('DEFAULT: concretizes the type, renames to the source, and grows a blank spare', () => {
    const state = rootState();
    const next = connect(state, {
      source: 'gi',
      sourceHandle: firstHandleId(state, 'gi', 'output'),
      target: 'd',
      targetHandle: firstHandleId(state, 'd', 'input'),
    });

    // Renamed to the connected doubler input ("In"); a fresh blank spare grew.
    expect(names(next, 'gi', 'output')).toEqual(['In', '']);
    // Consumed handle concretized to numberType; the spare stays groupInfer.
    expect(dataTypeIds(next, 'gi', 'output')).toEqual([
      'numberType',
      'groupInfer',
    ]);
  });

  it('allowRootIORename:false — concretizes + AUTO-NAMES input1 (no source rename), still grows', () => {
    const state = rootState();
    const next = connect(
      state,
      {
        source: 'gi',
        sourceHandle: firstHandleId(state, 'gi', 'output'),
        target: 'd',
        targetHandle: firstHandleId(state, 'd', 'input'),
      },
      { allowRootIORename: false },
    );

    // Not renamed to "In"; auto-named so it is never an empty-named concrete
    // handle. The blank spare still grows.
    expect(names(next, 'gi', 'output')).toEqual(['input1', '']);
    expect(dataTypeIds(next, 'gi', 'output')).toEqual([
      'numberType',
      'groupInfer',
    ]);
  });

  it('allowRootIOStructureEdit:false — renames + concretizes but does NOT grow a spare', () => {
    const state = rootState();
    const next = connect(
      state,
      {
        source: 'gi',
        sourceHandle: firstHandleId(state, 'gi', 'output'),
        target: 'd',
        targetHandle: firstHandleId(state, 'd', 'input'),
      },
      { allowRootIOStructureEdit: false },
    );

    // Renamed + concretized, but the last slot was consumed with no regrow.
    expect(names(next, 'gi', 'output')).toEqual(['In']);
    expect(dataTypeIds(next, 'gi', 'output')).toEqual(['numberType']);
  });

  it('both locks off — concretizes + auto-names, no spare', () => {
    const state = rootState();
    const next = connect(
      state,
      {
        source: 'gi',
        sourceHandle: firstHandleId(state, 'gi', 'output'),
        target: 'd',
        targetHandle: firstHandleId(state, 'd', 'input'),
      },
      { allowRootIORename: false, allowRootIOStructureEdit: false },
    );

    expect(names(next, 'gi', 'output')).toEqual(['input1']);
    expect(dataTypeIds(next, 'gi', 'output')).toEqual(['numberType']);
  });
});

describe('root Graph Output inference (connect to a Graph Output template)', () => {
  it('DEFAULT: renames to the source ("Out"), concretizes, grows a spare', () => {
    const state = rootState();
    const next = connect(state, {
      source: 'd',
      sourceHandle: firstHandleId(state, 'd', 'output'),
      target: 'go',
      targetHandle: firstHandleId(state, 'go', 'input'),
    });

    expect(names(next, 'go', 'input')).toEqual(['Out', '']);
    expect(dataTypeIds(next, 'go', 'input')).toEqual([
      'numberType',
      'groupInfer',
    ]);
  });

  it('allowRootIORename:false — auto-names output1 (output base), grows a spare', () => {
    const state = rootState();
    const next = connect(
      state,
      {
        source: 'd',
        sourceHandle: firstHandleId(state, 'd', 'output'),
        target: 'go',
        targetHandle: firstHandleId(state, 'go', 'input'),
      },
      { allowRootIORename: false },
    );

    expect(names(next, 'go', 'input')).toEqual(['output1', '']);
  });
});

describe('disconnect after root inference (group parity — no revert)', () => {
  it('a concretized root handle STAYS concrete on disconnect (matches group behavior)', () => {
    const state = rootState();
    const connected = connect(state, {
      source: 'gi',
      sourceHandle: firstHandleId(state, 'gi', 'output'),
      target: 'd',
      targetHandle: firstHandleId(state, 'd', 'input'),
    });
    expect(dataTypeIds(connected, 'gi', 'output')[0]).toBe('numberType');

    const edgeId = connected.edges[0]?.id;
    expect(edgeId).toBeTruthy();

    const afterRemove = produce(connected, (draft) => {
      const result = validateAction(draft, {
        type: actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW,
        payload: { changes: [{ type: 'remove', id: edgeId }] },
      });
      if (result && result.ok) applyPlan(draft, result.value);
    });

    // The consumed handle does NOT revert to groupInfer — exactly how a group
    // boundary behaves; the blank spare remains the live infer slot.
    expect(dataTypeIds(afterRemove, 'gi', 'output')[0]).toBe('numberType');
    expect(names(afterRemove, 'gi', 'output')[0]).toBe('In');
  });
});
