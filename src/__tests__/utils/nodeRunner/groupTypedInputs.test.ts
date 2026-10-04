import { describe, it, expect } from 'vitest';
import {
  mainReducer,
  actionTypesMap,
  type Action,
} from '@/utils/nodeStateManagement/mainReducer';
import type { State } from '@/utils/nodeStateManagement/types';
import {
  standardDataTypes,
  standardNodeTypes,
  standardNodeTypeNamesMap,
} from '@/utils/nodeStateManagement/standardNodes';
import { getCurrentNodesAndEdgesFromState } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import { compile } from '@/utils/nodeRunner/compiler';
import { execute } from '@/utils/nodeRunner/executor';
import type { FunctionImplementations } from '@/utils/nodeRunner/types';

/**
 * A value TYPED on a group node's own input — with nothing wired to it —
 * must reach the inner nodes connected to that boundary input, exactly as an
 * ordinary node's knob does. Before this, the runner copied a value across the
 * boundary only when an edge fed the outer handle, so a group could expose no
 * working knob: the inner node read `undefined`.
 */

type TestGraphState = State<string, string>;

function createBaseState(): TestGraphState {
  return {
    dataTypes: {
      ...standardDataTypes,
      testNumber: {
        name: 'Test Number',
        underlyingType: 'number',
        color: '#4A90E2',
        allowInput: true,
      },
    } as TestGraphState['dataTypes'],
    typeOfNodes: {
      ...standardNodeTypes,
      testSink: {
        name: 'Test Sink',
        headerColor: '#2E86AB',
        inputs: [{ name: 'In', dataType: 'testNumber', allowInput: true }],
        outputs: [],
      },
      testSource: {
        name: 'Test Source',
        headerColor: '#2E86AB',
        inputs: [],
        outputs: [{ name: 'Out', dataType: 'testNumber' }],
      },
    } as TestGraphState['typeOfNodes'],
    nodes: [],
    edges: [],
    enableTypeInference: true,
  };
}

function applyAction(
  state: TestGraphState,
  action: Action<string, string>,
): TestGraphState {
  return mainReducer<string, string>(state, action);
}

/** A group whose inner Test Sink reads the group's (only) outer input. */
function buildGroupWithSink(): { state: TestGraphState; groupTypeId: string } {
  let state = createBaseState();
  const before = new Set(Object.keys(state.typeOfNodes));
  state = applyAction(state, { type: actionTypesMap.ADD_NODE_GROUP });
  const groupTypeId = Object.keys(state.typeOfNodes).find(
    (id) => !before.has(id),
  )!;
  // ADD_NODE_GROUP leaves us inside the new group.
  state = applyAction(state, {
    type: actionTypesMap.ADD_NODE,
    payload: { type: 'testSink', position: { x: 0, y: 0 } },
  });
  const inside = getCurrentNodesAndEdgesFromState(state);
  const sink = inside.nodes.find(
    (node) => node.data.nodeTypeUniqueId === 'testSink',
  )!;
  const groupInput = inside.nodes.find(
    (node) =>
      node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.groupInput,
  )!;
  // Wiring the boundary's spare output creates the group's outer input.
  state = applyAction(state, {
    type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
    payload: {
      edge: {
        source: groupInput.id,
        sourceHandle:
          groupInput.data.outputs![groupInput.data.outputs!.length - 1]!.id,
        target: sink.id,
        targetHandle: sink.data.inputs![0]!.id,
      },
    },
  });
  state = applyAction(state, { type: actionTypesMap.CLOSE_NODE_GROUP });
  return { state, groupTypeId };
}

async function runAndCollect(state: TestGraphState): Promise<unknown[]> {
  const received: unknown[] = [];
  const implementations: FunctionImplementations<string> = {
    testSink: (inputs: unknown) => {
      const map = inputs as Map<
        string,
        { connections: { value: unknown }[]; value?: unknown }
      >;
      const entry = map.get('In');
      received.push(entry?.connections?.[0]?.value ?? entry?.value);
      return new Map();
    },
    testSource: () => new Map<string, unknown>([['Out', 99]]),
  } as unknown as FunctionImplementations<string>;
  const plan = compile<string, string>(state, implementations, {
    maxLoopIterations: 2,
  });
  const record = await execute<string, string>(plan, implementations, state, {
    onNodeStateChange: () => {},
    abortSignal: new AbortController().signal,
  });
  expect(record.status).toBe('completed');
  return received;
}

describe('group outer inputs: a typed value with nothing wired flows inside', () => {
  it('the inner node receives the value typed on the group node', async () => {
    const built = buildGroupWithSink();
    const { groupTypeId } = built;
    let { state } = built;
    expect(state.typeOfNodes[groupTypeId]!.inputs).toHaveLength(1);
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    const instance = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === groupTypeId,
    )!;
    const outerInput = instance.data.inputs![0]! as {
      id: string;
      allowInput?: boolean;
    };
    expect(outerInput.allowInput).toBe(true);
    state = applyAction(state, {
      type: actionTypesMap.UPDATE_INPUT_VALUE,
      payload: { nodeId: instance.id, inputId: outerInput.id, value: 7 },
    });

    expect(await runAndCollect(state)).toEqual([7]);
  });

  it('a wired outer input still wins over a typed one', async () => {
    const built = buildGroupWithSink();
    const { groupTypeId } = built;
    let { state } = built;
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: 'testSource', position: { x: -300, y: 0 } },
    });
    const instance = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === groupTypeId,
    )!;
    const source = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === 'testSource',
    )!;
    const outerInput = instance.data.inputs![0]! as { id: string };
    state = applyAction(state, {
      type: actionTypesMap.UPDATE_INPUT_VALUE,
      payload: { nodeId: instance.id, inputId: outerInput.id, value: 7 },
    });
    state = applyAction(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: source.id,
          sourceHandle: source.data.outputs![0]!.id,
          target: instance.id,
          targetHandle: outerInput.id,
        },
      },
    });

    expect(await runAndCollect(state)).toEqual([99]);
  });
});
