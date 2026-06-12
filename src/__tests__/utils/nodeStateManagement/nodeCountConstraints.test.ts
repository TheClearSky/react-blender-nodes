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

type TestDataTypeId = keyof typeof standardDataTypes | 'testString';
type TestNodeTypeId =
  | keyof typeof standardNodeTypes
  | 'testSource'
  | 'testSink';

function createBaseState(): State<TestDataTypeId, TestNodeTypeId> {
  return {
    dataTypes: {
      ...standardDataTypes,
      testString: {
        name: 'Test String',
        underlyingType: 'string' as const,
        color: '#4A90E2',
      },
    } as State<TestDataTypeId, TestNodeTypeId>['dataTypes'],
    typeOfNodes: {
      ...standardNodeTypes,
      testSource: {
        name: 'Test Source',
        headerColor: '#2E86AB',
        inputs: [],
        outputs: [{ name: 'Out', dataType: 'testString' as TestDataTypeId }],
      },
      testSink: {
        name: 'Test Sink',
        headerColor: '#C44536',
        inputs: [{ name: 'In', dataType: 'testString' as TestDataTypeId }],
        outputs: [],
      },
    } as State<TestDataTypeId, TestNodeTypeId>['typeOfNodes'],
    nodes: [],
    edges: [],
  };
}

function addNode(
  state: State<TestDataTypeId, TestNodeTypeId>,
  nodeType: TestNodeTypeId,
): State<TestDataTypeId, TestNodeTypeId> {
  return mainReducer(state, {
    type: actionTypesMap.ADD_NODE,
    payload: { type: nodeType, position: { x: 0, y: 0 } },
  });
}

function removeNode(
  state: State<TestDataTypeId, TestNodeTypeId>,
  nodeId: string,
): State<TestDataTypeId, TestNodeTypeId> {
  return mainReducer(state, {
    type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
    payload: {
      changes: [{ type: 'remove', id: nodeId }],
    },
  });
}

// ─────────────────────────────────────────────────────
// No constraints (backward compatibility)
// ─────────────────────────────────────────────────────

describe('Node count constraints — no constraints', () => {
  it('allows unlimited additions when nodeCountConstraints is undefined', () => {
    let state = createBaseState();
    for (let i = 0; i < 10; i++) {
      state = addNode(state, 'testSource');
    }
    expect(state.nodes.length).toBe(10);
  });

  it('allows unlimited deletions when nodeCountConstraints is undefined', () => {
    let state = createBaseState();
    state = addNode(state, 'testSource');
    state = addNode(state, 'testSource');
    const nodeId = state.nodes[0].id;
    state = removeNode(state, nodeId);
    expect(state.nodes.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────
// ADD_NODE max constraints
// ─────────────────────────────────────────────────────

describe('Node count constraints — ADD_NODE max', () => {
  it('maxAcrossAllNodes blocks addition when total count equals limit', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { maxAcrossAllNodes: 2 },
      },
    };
    state = addNode(state, 'testSource');
    state = addNode(state, 'testSource');
    expect(state.nodes.length).toBe(2);

    const stateAfterBlocked = addNode(state, 'testSource');
    expect(stateAfterBlocked.nodes.length).toBe(2);
  });

  it('maxInRoot blocks addition at root when root count equals limit', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { maxInRoot: 1 },
      },
    };
    state = addNode(state, 'testSource');
    expect(state.nodes.length).toBe(1);

    const stateAfterBlocked = addNode(state, 'testSource');
    expect(stateAfterBlocked.nodes.length).toBe(1);
  });

  it('maxWithinANodeGroup blocks addition inside group when group count equals limit', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { maxWithinANodeGroup: 1 },
      },
    };

    state = mainReducer(state, { type: actionTypesMap.ADD_NODE_GROUP });
    const groupNodeType = state.openedNodeGroupStack?.[0]
      ?.nodeType as TestNodeTypeId;
    expect(groupNodeType).toBeDefined();

    state = addNode(state, 'testSource');
    const subtreeAfterFirst = state.typeOfNodes[groupNodeType].subtree!.nodes;
    const testSourceCountAfterFirst = subtreeAfterFirst.filter(
      (n) => n.data.nodeTypeUniqueId === 'testSource',
    ).length;
    expect(testSourceCountAfterFirst).toBe(1);

    const stateAfterBlocked = addNode(state, 'testSource');
    const subtreeAfterBlocked =
      stateAfterBlocked.typeOfNodes[groupNodeType].subtree!.nodes;
    const testSourceCountAfterBlocked = subtreeAfterBlocked.filter(
      (n) => n.data.nodeTypeUniqueId === 'testSource',
    ).length;
    expect(testSourceCountAfterBlocked).toBe(1);
  });

  it('allows addition of unconstrained node types', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { maxAcrossAllNodes: 1 },
      },
    };
    state = addNode(state, 'testSource');
    state = addNode(state, 'testSink');
    state = addNode(state, 'testSink');
    expect(state.nodes.length).toBe(3);
  });

  it('AND semantics: both maxInRoot and maxAcrossAllNodes must pass', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { maxInRoot: 3, maxAcrossAllNodes: 2 },
      },
    };
    state = addNode(state, 'testSource');
    state = addNode(state, 'testSource');
    expect(state.nodes.length).toBe(2);

    const stateAfterBlocked = addNode(state, 'testSource');
    expect(stateAfterBlocked.nodes.length).toBe(2);
  });

  it('max: 0 prevents any addition in that scope', () => {
    const state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { maxInRoot: 0 },
      },
    };
    const stateAfterBlocked = addNode(state, 'testSource');
    expect(stateAfterBlocked.nodes.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────
// DELETE min constraints
// ─────────────────────────────────────────────────────

describe('Node count constraints — DELETE min', () => {
  it('minAcrossAllNodes blocks deletion when total would go below limit', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { minAcrossAllNodes: 2 },
      },
    };
    state = addNode(state, 'testSource');
    state = addNode(state, 'testSource');
    expect(state.nodes.length).toBe(2);

    const nodeId = state.nodes[0].id;
    const stateAfterBlocked = removeNode(state, nodeId);
    expect(stateAfterBlocked.nodes.length).toBe(2);
  });

  it('minInRoot blocks deletion at root when root count would go below limit', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { minInRoot: 1 },
      },
    };
    state = addNode(state, 'testSource');
    expect(state.nodes.length).toBe(1);

    const nodeId = state.nodes[0].id;
    const stateAfterBlocked = removeNode(state, nodeId);
    expect(stateAfterBlocked.nodes.length).toBe(1);
  });

  it('allows deletion of unconstrained node types', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { minAcrossAllNodes: 1 },
      },
    };
    state = addNode(state, 'testSource');
    state = addNode(state, 'testSink');
    expect(state.nodes.length).toBe(2);

    const sinkId = state.nodes.find(
      (n) => n.data.nodeTypeUniqueId === 'testSink',
    )!.id;
    state = removeNode(state, sinkId);
    expect(state.nodes.length).toBe(1);
  });

  it('non-remove changes pass through even with constraints', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { minAcrossAllNodes: 1 },
      },
    };
    state = addNode(state, 'testSource');
    const nodeId = state.nodes[0].id;

    const stateAfterMove = mainReducer(state, {
      type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
      payload: {
        changes: [
          {
            type: 'position',
            id: nodeId,
            position: { x: 100, y: 200 },
          },
        ],
      },
    });
    expect(stateAfterMove.nodes[0].position).toEqual({ x: 100, y: 200 });
  });

  it('batch delete: blocks when removing multiple would violate min', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { minAcrossAllNodes: 1 },
      },
    };
    state = addNode(state, 'testSource');
    state = addNode(state, 'testSource');
    expect(state.nodes.length).toBe(2);

    const stateAfterBatchDelete = mainReducer(state, {
      type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
      payload: {
        changes: [
          { type: 'remove', id: state.nodes[0].id },
          { type: 'remove', id: state.nodes[1].id },
        ],
      },
    });
    expect(stateAfterBatchDelete.nodes.length).toBe(2);
  });

  it('batch delete: allows when remaining count stays above min', () => {
    let state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createBaseState(),
      nodeCountConstraints: {
        testSource: { minAcrossAllNodes: 1 },
      },
    };
    state = addNode(state, 'testSource');
    state = addNode(state, 'testSource');
    state = addNode(state, 'testSource');

    const stateAfterBatchDelete = mainReducer(state, {
      type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
      payload: {
        changes: [
          { type: 'remove', id: state.nodes[0].id },
          { type: 'remove', id: state.nodes[1].id },
        ],
      },
    });
    expect(stateAfterBatchDelete.nodes.length).toBe(1);
  });
});
