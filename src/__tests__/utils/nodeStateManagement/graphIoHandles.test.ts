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
// State scaffold: the standard data/node types (which provide groupInfer plus
// the groupInput / groupOutput boundary node types) merged with one custom
// `doubler` node so the root graph has an interior node to wire I/O through.
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

function graphInputOutputHandleIds(
  state: TestState,
  nodeId: string,
  direction: 'input' | 'output',
): string[] {
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  const list = direction === 'output' ? node.data.outputs : node.data.inputs;
  return (list ?? []).flatMap((handle) =>
    'inputs' in handle ? handle.inputs.map((inner) => inner.id) : [handle.id],
  );
}

function graphInputOutputHandleNames(
  state: TestState,
  nodeId: string,
  direction: 'input' | 'output',
): string[] {
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  const list = direction === 'output' ? node.data.outputs : node.data.inputs;
  return (list ?? []).flatMap((handle) =>
    'inputs' in handle
      ? handle.inputs.map((inner) => inner.name)
      : [handle.name],
  );
}

function dispatch(
  state: TestState,
  nodeId: string,
  handles: { id?: string; name: string }[],
) {
  const result = validateAction(state, {
    type: actionTypesMap.UPDATE_GRAPH_IO_HANDLES,
    payload: { nodeId, handles },
  });
  return result;
}

// ====================================================================
// UPDATE_GRAPH_IO_HANDLES — validate -> apply round-trips
// ====================================================================
describe('UPDATE_GRAPH_IO_HANDLES (Graph I/O editor)', () => {
  it('renames the existing handle and appends a new groupInfer handle (Graph Input)', () => {
    const graphInput = buildNode('groupInput', 'gi');
    const state: TestState = { ...createEmptyState(), nodes: [graphInput] };

    const existingId = graphInputOutputHandleIds(state, 'gi', 'output')[0];
    const result = dispatch(state, 'gi', [
      { id: existingId, name: 'x' },
      { name: 'y' },
    ]);

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    if (!result!.ok) return;

    const next = produce(state, (draft) => {
      applyPlan(draft, result!.value);
    });

    // Graph Input edits its OUTPUT handles.
    expect(graphInputOutputHandleNames(next, 'gi', 'output')).toEqual([
      'x',
      'y',
    ]);
    const ids = graphInputOutputHandleIds(next, 'gi', 'output');
    // The reused handle keeps its id; the new one is freshly minted.
    expect(ids[0]).toBe(existingId);
    expect(ids[1]).not.toBe(existingId);
    expect(ids[1]).toBeTruthy();

    // The new handle infers on connect → it is a groupInfer handle.
    const newHandle = next.nodes
      .find((node) => node.id === 'gi')!
      .data.outputs!.find(
        (handle) => !('inputs' in handle) && handle.id === ids[1],
      );
    expect(newHandle).toBeTruthy();
    if (newHandle && !('inputs' in newHandle)) {
      expect(newHandle.dataType?.dataTypeUniqueId).toBe('groupInfer');
    }
  });

  it('renames a Graph Output handle (edits its INPUT side)', () => {
    const graphOutput = buildNode('groupOutput', 'go');
    const state: TestState = { ...createEmptyState(), nodes: [graphOutput] };

    const existingId = graphInputOutputHandleIds(state, 'go', 'input')[0];
    const result = dispatch(state, 'go', [{ id: existingId, name: 'out' }]);

    expect(result!.ok).toBe(true);
    if (!result!.ok) return;
    const next = produce(state, (draft) => {
      applyPlan(draft, result!.value);
    });

    expect(graphInputOutputHandleNames(next, 'go', 'input')).toEqual(['out']);
    expect(graphInputOutputHandleIds(next, 'go', 'input')[0]).toBe(existingId);
  });

  it('deleting a connected handle cascades the removal of its root edge', () => {
    const graphInput = buildNode('groupInput', 'gi');
    const doubler = buildNode('doubler', 'd');
    const handleId = graphInput.data.outputs![0].id;
    const doublerInputId = (() => {
      const input = doubler.data.inputs![0];
      if ('inputs' in input) throw new Error('unexpected panel');
      return input.id;
    })();

    const state: TestState = {
      ...createEmptyState(),
      nodes: [graphInput, doubler],
      edges: [
        {
          id: 'e1',
          source: 'gi',
          sourceHandle: handleId,
          target: 'd',
          targetHandle: doublerInputId,
          type: 'configurableEdge',
        },
      ] as TestState['edges'],
    };

    // Remove the only handle (handles: []) → its edge must cascade away.
    const result = dispatch(state, 'gi', []);
    expect(result!.ok).toBe(true);
    if (!result!.ok) return;
    expect(result!.value.kind).toBe('UPDATE_GRAPH_IO_HANDLES');
    if (result!.value.kind === 'UPDATE_GRAPH_IO_HANDLES') {
      expect(result!.value.removedHandleIds).toEqual([handleId]);
    }

    const next = produce(state, (draft) => {
      applyPlan(draft, result!.value);
    });

    // The named handle (and its edge) are gone; deleting every handle leaves the
    // boundary node with no output handles.
    const remainingNames = graphInputOutputHandleNames(next, 'gi', 'output');
    expect(remainingNames).toEqual([]);
    expect(next.edges).toHaveLength(0);
  });

  it('rejects editing a non-boundary node (INVALID_NODE_GROUP)', () => {
    const doubler = buildNode('doubler', 'd');
    const state: TestState = { ...createEmptyState(), nodes: [doubler] };

    const result = dispatch(state, 'd', [{ name: 'whatever' }]);
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.code).toBe('INVALID_NODE_GROUP');
    }
  });

  it('rejects duplicate handle names (INVALID_NODE_GROUP)', () => {
    const graphInput = buildNode('groupInput', 'gi');
    const state: TestState = { ...createEmptyState(), nodes: [graphInput] };

    const result = dispatch(state, 'gi', [{ name: 'a' }, { name: 'a' }]);
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.code).toBe('INVALID_NODE_GROUP');
    }
  });

  it('rejects empty handle names (INVALID_NODE_GROUP)', () => {
    const graphInput = buildNode('groupInput', 'gi');
    const state: TestState = { ...createEmptyState(), nodes: [graphInput] };

    const result = dispatch(state, 'gi', [{ name: '   ' }]);
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.code).toBe('INVALID_NODE_GROUP');
    }
  });

  it('rejects editing root Graph I/O while a node group is open (root-scope guard)', () => {
    const graphInput = buildNode('groupInput', 'gi');
    // A non-empty openedNodeGroupStack means the canvas is scoped INTO a group;
    // the root boundary node is off-screen, so the edit must be rejected even
    // though the root node id still resolves in `_state.nodes`.
    const state: TestState = {
      ...createEmptyState(),
      nodes: [graphInput],
      openedNodeGroupStack: [{ nodeType: 'doubler' }],
    };

    const result = dispatch(state, 'gi', [{ name: 'x' }]);
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.code).toBe('INVALID_NODE_GROUP');
    }
  });
});
