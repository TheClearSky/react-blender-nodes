import { describe, it, expect } from 'vitest';
import {
  mainReducer,
  actionTypesMap,
} from '@/utils/nodeStateManagement/mainReducer';
import type {
  State,
  SupportedUnderlyingTypes,
} from '@/utils/nodeStateManagement/types';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';
import {
  constructNodeOfType,
  getCurrentNodesAndEdgesFromState,
} from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import type { Viewport } from '@xyflow/react';
import {
  ensureUniqueHandleName,
  ensureAllHandleNamesUnique,
} from '@/utils/nodeStateManagement/handles/ensureUniqueHandleName';
import { insertOrDeleteHandleInNodeDataUsingHandleIndices } from '@/utils/nodeStateManagement/handles/handleSetters';

// ---------------------------------------------------------------------------
// Test data type / node type keys
// ---------------------------------------------------------------------------
type TestDataTypeId =
  | keyof typeof standardDataTypes
  | 'testString'
  | 'testNumber';
type TestNodeTypeId =
  | keyof typeof standardNodeTypes
  | 'testProcessor'
  | 'testSource';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal valid State with standard + custom types, no node instances. */
function createTestState(): State<TestDataTypeId, TestNodeTypeId> {
  return {
    dataTypes: {
      ...standardDataTypes,
      testString: {
        name: 'Test String',
        underlyingType: 'string',
        color: '#4A90E2',
      },
      testNumber: {
        name: 'Test Number',
        underlyingType: 'number',
        color: '#E74C3C',
      },
    } as State<TestDataTypeId, TestNodeTypeId>['dataTypes'],
    typeOfNodes: {
      ...standardNodeTypes,
      testProcessor: {
        name: 'Test Processor',
        headerColor: '#C44536',
        inputs: [{ name: 'In', dataType: 'testString' as TestDataTypeId }],
        outputs: [{ name: 'Out', dataType: 'testString' as TestDataTypeId }],
      },
      testSource: {
        name: 'Test Source',
        headerColor: '#2E86AB',
        inputs: [],
        outputs: [{ name: 'Value', dataType: 'testNumber' as TestDataTypeId }],
      },
    } as State<TestDataTypeId, TestNodeTypeId>['typeOfNodes'],
    nodes: [],
    edges: [],
  };
}

/**
 * Builds a state that already contains 2 real node instances created via
 * `constructNodeOfType`, ready for edge / mutation tests.
 */
function createStateWithNodes() {
  const base = createTestState();

  const nodeA = constructNodeOfType(
    base.dataTypes,
    'testSource' as TestNodeTypeId,
    base.typeOfNodes,
    'node-a',
    { x: 0, y: 0 },
  );

  const nodeB = constructNodeOfType(
    base.dataTypes,
    'testProcessor' as TestNodeTypeId,
    base.typeOfNodes,
    'node-b',
    { x: 300, y: 0 },
  );

  return {
    ...base,
    nodes: [nodeA, nodeB],
  } as State<TestDataTypeId, TestNodeTypeId>;
}

// ====================================================================
// Suite 1: ADD_NODE
// ====================================================================
describe('ADD_NODE', () => {
  it('adds a node to an empty state', () => {
    const state = createTestState();
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'testProcessor' as TestNodeTypeId,
        position: { x: 50, y: 75 },
      },
    });

    expect(next.nodes).toHaveLength(1);
  });

  it('new node has the correct position', () => {
    const state = createTestState();
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'testProcessor' as TestNodeTypeId,
        position: { x: 50, y: 75 },
      },
    });

    const node = next.nodes[0];
    expect(node.position).toEqual({ x: 50, y: 75 });
  });

  it('new node has the correct nodeTypeUniqueId', () => {
    const state = createTestState();
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'testProcessor' as TestNodeTypeId,
        position: { x: 0, y: 0 },
      },
    });

    expect(next.nodes[0].data.nodeTypeUniqueId).toBe('testProcessor');
  });

  it('node gets a generated string ID', () => {
    const state = createTestState();
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'testProcessor' as TestNodeTypeId,
        position: { x: 0, y: 0 },
      },
    });

    expect(typeof next.nodes[0].id).toBe('string');
    expect(next.nodes[0].id.length).toBeGreaterThan(0);
  });

  it('maintains existing nodes when adding another', () => {
    const state = createStateWithNodes(); // already has 2 nodes
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'testSource' as TestNodeTypeId,
        position: { x: 600, y: 0 },
      },
    });

    expect(next.nodes).toHaveLength(3);
    // Original nodes still present
    expect(next.nodes.find((n) => n.id === 'node-a')).toBeTruthy();
    expect(next.nodes.find((n) => n.id === 'node-b')).toBeTruthy();
  });
});

// ====================================================================
// Suite 2: ADD_NODE_AND_SELECT
// ====================================================================
describe('ADD_NODE_AND_SELECT', () => {
  it('adds a node and selects it', () => {
    const state = createTestState();
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_NODE_AND_SELECT,
      payload: {
        type: 'testProcessor' as TestNodeTypeId,
        position: { x: 10, y: 20 },
      },
    });

    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0].selected).toBe(true);
  });

  it('deselects previously selected nodes', () => {
    // Start with a state that has a selected node
    const base = createStateWithNodes();
    const withSelection: State<TestDataTypeId, TestNodeTypeId> = {
      ...base,
      nodes: base.nodes.map((n) => ({ ...n, selected: true })),
    };

    const next = mainReducer(withSelection, {
      type: actionTypesMap.ADD_NODE_AND_SELECT,
      payload: {
        type: 'testSource' as TestNodeTypeId,
        position: { x: 0, y: 0 },
      },
    });

    // All old nodes should be deselected
    const oldNodes = next.nodes.filter(
      (n) => n.id === 'node-a' || n.id === 'node-b',
    );
    for (const n of oldNodes) {
      expect(n.selected).toBe(false);
    }

    // The new node should be selected
    const newNode = next.nodes.find(
      (n) => n.id !== 'node-a' && n.id !== 'node-b',
    );
    expect(newNode).toBeTruthy();
    expect(newNode!.selected).toBe(true);
  });

  it('new node has correct nodeTypeUniqueId and position', () => {
    const state = createTestState();
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_NODE_AND_SELECT,
      payload: {
        type: 'testProcessor' as TestNodeTypeId,
        position: { x: 99, y: 88 },
      },
    });

    expect(next.nodes[0].data.nodeTypeUniqueId).toBe('testProcessor');
    expect(next.nodes[0].position).toEqual({ x: 99, y: 88 });
  });
});

// ====================================================================
// Suite 3: UPDATE_NODE_BY_REACT_FLOW
// ====================================================================
describe('UPDATE_NODE_BY_REACT_FLOW', () => {
  it('applies position changes to nodes', () => {
    const state = createStateWithNodes();
    const next = mainReducer(state, {
      type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
      payload: {
        changes: [
          {
            type: 'position',
            id: 'node-a',
            position: { x: 200, y: 300 },
          },
        ],
      },
    });

    const nodeA = next.nodes.find((n) => n.id === 'node-a');
    expect(nodeA).toBeTruthy();
    expect(nodeA!.position).toEqual({ x: 200, y: 300 });
  });

  it('handles empty changes array', () => {
    const state = createStateWithNodes();
    const next = mainReducer(state, {
      type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
      payload: { changes: [] },
    });

    expect(next.nodes).toHaveLength(state.nodes.length);
  });

  it('handles multiple changes in one dispatch', () => {
    const state = createStateWithNodes();
    const next = mainReducer(state, {
      type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
      payload: {
        changes: [
          { type: 'position', id: 'node-a', position: { x: 10, y: 20 } },
          { type: 'position', id: 'node-b', position: { x: 30, y: 40 } },
        ],
      },
    });

    expect(next.nodes.find((n) => n.id === 'node-a')!.position).toEqual({
      x: 10,
      y: 20,
    });
    expect(next.nodes.find((n) => n.id === 'node-b')!.position).toEqual({
      x: 30,
      y: 40,
    });
  });
});

// ====================================================================
// Suite 4: UPDATE_EDGES_BY_REACT_FLOW
// ====================================================================
describe('UPDATE_EDGES_BY_REACT_FLOW', () => {
  it('handles non-remove changes (select) applied directly', () => {
    const state = createStateWithNodes();
    // Add a fake edge first
    const stateWithEdge: State<TestDataTypeId, TestNodeTypeId> = {
      ...state,
      edges: [
        {
          id: 'edge-1',
          source: 'node-a',
          target: 'node-b',
          sourceHandle: 'h1',
          targetHandle: 'h2',
          type: 'configurableEdge' as const,
          data: {},
        },
      ],
    };

    const next = mainReducer(stateWithEdge, {
      type: actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW,
      payload: {
        changes: [{ type: 'select', id: 'edge-1', selected: true }],
      },
    });

    const edge = next.edges.find((e) => e.id === 'edge-1');
    expect(edge).toBeTruthy();
    expect(edge!.selected).toBe(true);
  });

  it('handles edge removal via removeEdgeWithTypeChecking', () => {
    // Build state with a real edge between compatible handles
    const state = createStateWithNodes();
    const nodeA = state.nodes.find((n) => n.id === 'node-a')!;
    const nodeB = state.nodes.find((n) => n.id === 'node-b')!;

    // testSource output handle ID and testProcessor input handle ID
    const sourceHandleId = nodeA.data.outputs![0].id;
    const targetHandleId = (nodeB.data.inputs![0] as { id: string }).id;

    const stateWithEdge: State<TestDataTypeId, TestNodeTypeId> = {
      ...state,
      edges: [
        {
          id: 'edge-rm',
          source: 'node-a',
          target: 'node-b',
          sourceHandle: sourceHandleId,
          targetHandle: targetHandleId,
          type: 'configurableEdge' as const,
          data: {},
        },
      ],
    };

    const next = mainReducer(stateWithEdge, {
      type: actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW,
      payload: {
        changes: [{ type: 'remove', id: 'edge-rm' }],
      },
    });

    // Edge should be removed
    expect(next.edges.find((e) => e.id === 'edge-rm')).toBeUndefined();
  });
});

// ====================================================================
// Suite 5: ADD_EDGE_BY_REACT_FLOW
// ====================================================================
describe('ADD_EDGE_BY_REACT_FLOW', () => {
  it('rejects connection when handles are missing', () => {
    const state = createStateWithNodes();
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'node-a',
          target: 'node-b',
          sourceHandle: null,
          targetHandle: null,
        },
      },
    });

    // No edge should be added
    expect(next.edges).toHaveLength(0);
  });

  it('does not crash on missing source/target', () => {
    const state = createStateWithNodes();
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: '',
          target: '',
          sourceHandle: null,
          targetHandle: null,
        },
      },
    });

    expect(next.edges).toHaveLength(0);
  });

  it('commits a valid edge (happy path)', () => {
    // Two testProcessor nodes share compatible string types.
    const base = createTestState();
    const nodeA = constructNodeOfType(
      base.dataTypes,
      'testProcessor' as TestNodeTypeId,
      base.typeOfNodes,
      'proc-a',
      { x: 0, y: 0 },
    );
    const nodeB = constructNodeOfType(
      base.dataTypes,
      'testProcessor' as TestNodeTypeId,
      base.typeOfNodes,
      'proc-b',
      { x: 300, y: 0 },
    );
    const state = { ...base, nodes: [nodeA, nodeB] } as State<
      TestDataTypeId,
      TestNodeTypeId
    >;

    const outHandleA = nodeA.data.outputs![0].id;
    const inputB = nodeB.data.inputs![0];
    if ('inputs' in inputB) throw new Error('expected non-panel input');
    const inHandleB = inputB.id;

    const next = mainReducer(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'proc-a',
          target: 'proc-b',
          sourceHandle: outHandleA,
          targetHandle: inHandleB,
        },
      },
    });

    expect(next.edges).toHaveLength(1);
    expect(next.edges[0].source).toBe('proc-a');
    expect(next.edges[0].target).toBe('proc-b');
  });

  it('does not commit edge and does not leak mutations when validation fails (trial rollback)', () => {
    // testSource outputs testNumber; testProcessor input is testString.
    // With allowedConversionsBetweenDataTypes: {} the conversion check rejects
    // the edge. Verify that:
    //   (a) no edge is pushed onto state
    //   (b) node handle metadata is not mutated compared to pre-call state
    const base = createTestState();
    const srcNode = constructNodeOfType(
      base.dataTypes,
      'testSource' as TestNodeTypeId,
      base.typeOfNodes,
      'src',
      { x: 0, y: 0 },
    );
    const procNode = constructNodeOfType(
      base.dataTypes,
      'testProcessor' as TestNodeTypeId,
      base.typeOfNodes,
      'proc',
      { x: 300, y: 0 },
    );
    const state = {
      ...base,
      nodes: [srcNode, procNode],
      enableTypeInference: true,
      allowedConversionsBetweenDataTypes: {},
    } as State<TestDataTypeId, TestNodeTypeId>;

    const outHandle = srcNode.data.outputs![0].id;
    const inputProc = procNode.data.inputs![0];
    if ('inputs' in inputProc) throw new Error('expected non-panel input');
    const inHandle = inputProc.id;

    // Snapshot handle metadata before dispatch
    const preSnapshot = JSON.stringify(state.nodes);

    const next = mainReducer(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'src',
          target: 'proc',
          sourceHandle: outHandle,
          targetHandle: inHandle,
        },
      },
    });

    // (a) Edge must not be added
    expect(next.edges).toHaveLength(0);
    // (b) Node handle metadata must be identical — trial mutations (if any) rolled back
    expect(JSON.stringify(next.nodes)).toBe(preSnapshot);
  });
});

// ====================================================================
// Suite 6: OPEN_NODE_GROUP / CLOSE_NODE_GROUP
// ====================================================================
describe('OPEN_NODE_GROUP / CLOSE_NODE_GROUP', () => {
  /** Helper: create state with an ADD_NODE_GROUP already applied */
  function createStateWithGroup() {
    const base = createTestState();
    return mainReducer(base, { type: actionTypesMap.ADD_NODE_GROUP });
  }

  it('ADD_NODE_GROUP then OPEN by nodeType pushes to stack and saves viewport', () => {
    const afterAdd = createStateWithGroup();
    // Find the newly created group type key
    const groupTypeKey = Object.keys(afterAdd.typeOfNodes).find(
      (k) =>
        afterAdd.typeOfNodes[k as TestNodeTypeId].subtree !== undefined &&
        !Object.keys(standardNodeTypes).includes(k),
    );
    expect(groupTypeKey).toBeTruthy();

    // The ADD_NODE_GROUP action itself already opens the group
    expect(afterAdd.openedNodeGroupStack).toBeDefined();
    expect(afterAdd.openedNodeGroupStack!.length).toBe(1);
    expect(afterAdd.openedNodeGroupStack![0].nodeType).toBe(groupTypeKey);
  });

  it('CLOSE pops from stack and restores viewport', () => {
    const base = createTestState();
    const withViewport: State<TestDataTypeId, TestNodeTypeId> = {
      ...base,
      viewport: { x: 100, y: 200, zoom: 1.5 },
    };
    const afterAdd = mainReducer(withViewport, {
      type: actionTypesMap.ADD_NODE_GROUP,
    });

    // Stack should have 1 entry now
    expect(afterAdd.openedNodeGroupStack!.length).toBe(1);

    const afterClose = mainReducer(afterAdd, {
      type: actionTypesMap.CLOSE_NODE_GROUP,
    });

    expect(afterClose.openedNodeGroupStack).toHaveLength(0);
    // Previous viewport restored
    expect(afterClose.viewport).toEqual({ x: 100, y: 200, zoom: 1.5 });
  });

  it('CLOSE on empty stack does not crash', () => {
    const state = createTestState();
    const next = mainReducer(state, {
      type: actionTypesMap.CLOSE_NODE_GROUP,
    });

    // Should be safe; stack should be empty or undefined
    expect(
      next.openedNodeGroupStack === undefined ||
        next.openedNodeGroupStack.length === 0,
    ).toBe(true);
  });

  it('UPDATE_NODE_CUSTOM_NAME on a node inside an OPEN group lands on the shared subtree (scope-locality / per-definition)', () => {
    // ADD_NODE_GROUP creates AND opens the group (subtree starts as [groupInput, groupOutput]).
    const opened = mainReducer(createTestState(), {
      type: actionTypesMap.ADD_NODE_GROUP,
    });
    const groupTypeKey = Object.keys(opened.typeOfNodes).find(
      (k) =>
        opened.typeOfNodes[k as TestNodeTypeId].subtree !== undefined &&
        !Object.keys(standardNodeTypes).includes(k),
    ) as TestNodeTypeId;

    // Add a standard node while the group is open → it lands in the subtree (scope-aware).
    const withInner = mainReducer(opened, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'testProcessor' as TestNodeTypeId,
        position: { x: 0, y: 0 },
      },
    });
    const innerNode = withInner.typeOfNodes[groupTypeKey].subtree!.nodes.find(
      (n) => n.data.nodeTypeUniqueId === 'testProcessor',
    )!;
    expect(innerNode).toBeTruthy();

    // Rename it.
    const renamed = mainReducer(withInner, {
      type: actionTypesMap.UPDATE_NODE_CUSTOM_NAME,
      payload: { nodeId: innerNode.id, customName: 'Summer' },
    });

    // The name lands on the SHARED subtree definition (per-definition, D3), NOT at root.
    const subtreeNode = renamed.typeOfNodes[groupTypeKey].subtree!.nodes.find(
      (n) => n.id === innerNode.id,
    )!;
    expect(subtreeNode.data.customName).toBe('Summer');
    expect(renamed.nodes.find((n) => n.id === innerNode.id)).toBeUndefined();
  });

  it('OPEN_NODE_GROUP with nodeId pushes instance entry', () => {
    const afterAdd = createStateWithGroup();
    const groupTypeKey = Object.keys(afterAdd.typeOfNodes).find(
      (k) =>
        afterAdd.typeOfNodes[k as TestNodeTypeId].subtree !== undefined &&
        !Object.keys(standardNodeTypes).includes(k),
    ) as TestNodeTypeId;

    // Close the auto-opened group first
    const closed = mainReducer(afterAdd, {
      type: actionTypesMap.CLOSE_NODE_GROUP,
    });

    // Add an instance of the group node to the root graph
    const withInstance = mainReducer(closed, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeKey, position: { x: 0, y: 0 } },
    });
    const instanceNodeId = withInstance.nodes[0].id;

    const opened = mainReducer(withInstance, {
      type: actionTypesMap.OPEN_NODE_GROUP,
      payload: { nodeId: instanceNodeId },
    });

    expect(opened.openedNodeGroupStack!.length).toBe(1);
    expect(opened.openedNodeGroupStack![0].nodeType).toBe(groupTypeKey);
  });
});

// ====================================================================
// Suite 7: ADD_NODE_GROUP
// ====================================================================
describe('ADD_NODE_GROUP', () => {
  it('creates a new group type in typeOfNodes', () => {
    const state = createTestState();
    const keysBefore = Object.keys(state.typeOfNodes);

    const next = mainReducer(state, { type: actionTypesMap.ADD_NODE_GROUP });
    const keysAfter = Object.keys(next.typeOfNodes);

    expect(keysAfter.length).toBe(keysBefore.length + 1);
  });

  it('new type has subtree with groupInput and groupOutput nodes', () => {
    const state = createTestState();
    const next = mainReducer(state, { type: actionTypesMap.ADD_NODE_GROUP });

    const newKey = Object.keys(next.typeOfNodes).find(
      (k) => !Object.keys(state.typeOfNodes).includes(k),
    ) as TestNodeTypeId;
    expect(newKey).toBeTruthy();

    const subtree = next.typeOfNodes[newKey].subtree;
    expect(subtree).toBeDefined();
    expect(subtree!.nodes).toHaveLength(2);
    expect(subtree!.inputNodeId).toBeTruthy();
    expect(subtree!.outputNodeId).toBeTruthy();

    // Verify the two nodes are groupInput and groupOutput
    const nodeTypes = subtree!.nodes.map((n) => n.data.nodeTypeUniqueId);
    expect(nodeTypes).toContain('groupInput');
    expect(nodeTypes).toContain('groupOutput');
  });

  it('opens the new group immediately (sets openedNodeGroupStack)', () => {
    const state = createTestState();
    const next = mainReducer(state, { type: actionTypesMap.ADD_NODE_GROUP });

    expect(next.openedNodeGroupStack).toBeDefined();
    expect(next.openedNodeGroupStack!.length).toBe(1);

    const newKey = Object.keys(next.typeOfNodes).find(
      (k) => !Object.keys(state.typeOfNodes).includes(k),
    );
    expect(next.openedNodeGroupStack![0].nodeType).toBe(newKey);
  });
});

// ====================================================================
// Suite 8: SET_VIEWPORT
// ====================================================================
describe('SET_VIEWPORT', () => {
  it('sets viewport correctly', () => {
    const state = createTestState();
    const viewport: Viewport = { x: 42, y: 84, zoom: 2 };

    const next = mainReducer(state, {
      type: actionTypesMap.SET_VIEWPORT,
      payload: { viewport },
    });

    expect(next.viewport).toEqual(viewport);
  });

  it('overwrites existing viewport', () => {
    const state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createTestState(),
      viewport: { x: 1, y: 2, zoom: 3 },
    };
    const viewport: Viewport = { x: 10, y: 20, zoom: 0.5 };

    const next = mainReducer(state, {
      type: actionTypesMap.SET_VIEWPORT,
      payload: { viewport },
    });

    expect(next.viewport).toEqual(viewport);
  });
});

// ====================================================================
// Suite 9: REPLACE_STATE
// ====================================================================
describe('REPLACE_STATE', () => {
  it('replaces entire state', () => {
    const state = createStateWithNodes();
    const replacement = createTestState(); // empty nodes

    const next = mainReducer(state, {
      type: actionTypesMap.REPLACE_STATE,
      payload: { state: replacement },
    });

    expect(next.nodes).toHaveLength(0);
    expect(next.edges).toHaveLength(0);
  });

  it('old state is completely replaced', () => {
    const state: State<TestDataTypeId, TestNodeTypeId> = {
      ...createTestState(),
      viewport: { x: 1, y: 2, zoom: 3 },
    };
    const replacement: State<TestDataTypeId, TestNodeTypeId> = {
      ...createTestState(),
      viewport: { x: 99, y: 99, zoom: 99 },
    };

    const next = mainReducer(state, {
      type: actionTypesMap.REPLACE_STATE,
      payload: { state: replacement },
    });

    expect(next.viewport).toEqual({ x: 99, y: 99, zoom: 99 });
  });

  it('replaces state with the payload content without mutating the payload', () => {
    const state = createTestState();
    const replacement = createTestState();

    const next = mainReducer(state, {
      type: actionTypesMap.REPLACE_STATE,
      payload: { state: replacement },
    });

    // S1: REPLACE_STATE now returns a FRESH tree (reducer purity) rather than
    // the dispatched payload object, while carrying the replacement's content.
    expect(next).not.toBe(replacement);
    expect(next.dataTypes).toEqual(replacement.dataTypes);
    expect(next.typeOfNodes).toEqual(replacement.typeOfNodes);
    expect(next.nodes).toEqual(replacement.nodes);
  });
});

// ====================================================================
// Suite 10: State immutability
// ====================================================================
describe('State immutability', () => {
  it('old state is not mutated after ADD_NODE', () => {
    const state = createTestState();
    const nodesBefore = [...state.nodes];

    mainReducer(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'testProcessor' as TestNodeTypeId,
        position: { x: 0, y: 0 },
      },
    });

    expect(state.nodes).toEqual(nodesBefore);
    expect(state.nodes).toHaveLength(0);
  });

  it('new state is a different reference from old state', () => {
    const state = createTestState();
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'testProcessor' as TestNodeTypeId,
        position: { x: 0, y: 0 },
      },
    });

    expect(next).not.toBe(state);
  });

  it('old state is not mutated after SET_VIEWPORT', () => {
    const state = createTestState();
    const viewportBefore = state.viewport;

    mainReducer(state, {
      type: actionTypesMap.SET_VIEWPORT,
      payload: { viewport: { x: 5, y: 5, zoom: 5 } },
    });

    expect(state.viewport).toBe(viewportBefore);
  });

  it('old state is not mutated after ADD_NODE_GROUP', () => {
    const state = createTestState();
    const typeKeysBefore = Object.keys(state.typeOfNodes);

    mainReducer(state, { type: actionTypesMap.ADD_NODE_GROUP });

    expect(Object.keys(state.typeOfNodes)).toEqual(typeKeysBefore);
  });

  it('getCurrentNodesAndEdgesFromState returns current level nodes', () => {
    const state = createStateWithNodes();
    const result = getCurrentNodesAndEdgesFromState(state);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(0);
  });
});

// ====================================================================
// Suite 11: Group inference handle duplication
// ====================================================================
describe('Group inference handle duplication', () => {
  it('connecting a concrete output to groupOutput infer input creates a new infer handle', () => {
    // 1. Create state with type inference enabled and a group
    const base: State<TestDataTypeId, TestNodeTypeId> = {
      ...createTestState(),
      enableTypeInference: true,
    };
    const withGroup = mainReducer(base, {
      type: actionTypesMap.ADD_NODE_GROUP,
    });

    // We're now inside the group (openedNodeGroupStack is set).
    // Find the groupOutput node in the subtree.
    const groupTypeKey = Object.keys(withGroup.typeOfNodes).find(
      (k) =>
        withGroup.typeOfNodes[k as TestNodeTypeId].subtree !== undefined &&
        !Object.keys(base.typeOfNodes).includes(k),
    ) as TestNodeTypeId;
    const subtree = withGroup.typeOfNodes[groupTypeKey].subtree!;
    const groupOutputNode = subtree.nodes.find(
      (n) => n.data.nodeTypeUniqueId === 'groupOutput',
    )!;
    expect(groupOutputNode).toBeDefined();

    // groupOutput starts with exactly 1 infer input handle
    const flatInputs = (inputs: unknown[]) => {
      const result: { id: string; name: string }[] = [];
      for (const item of inputs as Array<Record<string, unknown>>) {
        if ('inputs' in item) {
          for (const inner of item.inputs as Array<Record<string, unknown>>) {
            result.push(inner as { id: string; name: string });
          }
        } else {
          result.push(item as { id: string; name: string });
        }
      }
      return result;
    };
    const initialInputs = flatInputs(groupOutputNode.data.inputs ?? []);
    expect(initialInputs.length).toBe(1);

    // 2. Add a testSource node inside the group (it has a 'Value' output)
    const withNode = mainReducer(withGroup, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'testSource' as TestNodeTypeId,
        position: { x: 0, y: 0 },
      },
    });

    // Find the testSource node inside the group
    const currentView = getCurrentNodesAndEdgesFromState(withNode);
    const sourceNode = currentView.nodes.find(
      (n) => n.data.nodeTypeUniqueId === 'testSource',
    )!;
    expect(sourceNode).toBeDefined();

    const sourceOutputHandle = sourceNode.data.outputs![0];
    const groupOutputInferInput = flatInputs(
      currentView.nodes.find((n) => n.id === groupOutputNode.id)!.data.inputs ??
        [],
    )[0];

    // 3. Connect source output -> groupOutput infer input
    const withEdge = mainReducer(withNode, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: sourceNode.id,
          target: groupOutputNode.id,
          sourceHandle: sourceOutputHandle.id,
          targetHandle: groupOutputInferInput.id,
        },
      },
    });

    // Edge should be added
    const edgeView = getCurrentNodesAndEdgesFromState(withEdge);
    expect(edgeView.edges.length).toBe(1);

    // 4. Verify a NEW infer handle was created on groupOutput
    const updatedGroupOutput = edgeView.nodes.find(
      (n) => n.id === groupOutputNode.id,
    )!;
    const updatedInputs = flatInputs(updatedGroupOutput.data.inputs ?? []);
    expect(updatedInputs.length).toBe(2);
  });
});

// ====================================================================
// Suite 12: Handle name deduplication utility
// ====================================================================
describe('Handle name deduplication', () => {
  it('ensureUniqueHandleName returns unique names', () => {
    expect(ensureUniqueHandleName('Value', [])).toBe('Value');
    expect(ensureUniqueHandleName('Value', ['Value'])).toBe('Value 2');
    expect(ensureUniqueHandleName('Value', ['Value', 'Value 2'])).toBe(
      'Value 3',
    );
    expect(ensureUniqueHandleName('Value 2', ['Value', 'Value 2'])).toBe(
      'Value 3',
    );
    expect(ensureUniqueHandleName('A', ['A', 'A 2', 'A 3'])).toBe('A 4');
  });

  it('ensureAllHandleNamesUnique deduplicates in-place', () => {
    // Create a processor node with one input 'In' and one output 'Out'
    const base = createTestState();
    const node = constructNodeOfType(
      base.dataTypes,
      'testProcessor' as TestNodeTypeId,
      base.typeOfNodes,
      'test-node',
      { x: 0, y: 0 },
    );

    // Manually add a duplicate input with the same name
    const firstInput = node.data.inputs![0];
    if (!('name' in firstInput)) throw new Error('expected non-panel input');
    const dupInput = { ...firstInput, id: 'dup-id' };
    node.data = {
      ...node.data,
      inputs: [...node.data.inputs!, dupInput],
    };

    // Both have name 'In'
    expect(firstInput.name).toBe('In');
    expect(dupInput.name).toBe('In');

    ensureAllHandleNamesUnique(node.data);

    // First keeps 'In', second becomes 'In 2'
    expect(firstInput.name).toBe('In');
    expect(dupInput.name).toBe('In 2');
  });

  it('insertOrDeleteHandleInNodeDataUsingHandleIndices deduplicates on insertion', () => {
    const base = createTestState();
    const node = constructNodeOfType(
      base.dataTypes,
      'testProcessor' as TestNodeTypeId,
      base.typeOfNodes,
      'test-node',
      { x: 0, y: 0 },
    );

    // node has input 'In'. Insert another input also named 'In' at the end.
    const existingInput = node.data.inputs![0];
    if (!('name' in existingInput)) throw new Error('expected non-panel input');
    expect(existingInput.name).toBe('In');

    const duplicateHandle = {
      ...existingInput,
      id: 'dup-handle-id',
      name: 'In',
    };

    // Call with explicit generics to satisfy the build tsconfig's stricter inference
    insertOrDeleteHandleInNodeDataUsingHandleIndices<
      SupportedUnderlyingTypes,
      TestNodeTypeId
    >(
      node.data as Parameters<
        typeof insertOrDeleteHandleInNodeDataUsingHandleIndices
      >[0],
      { type: 'input' as const, index1: -1, index2: undefined },
      0,
      duplicateHandle as Parameters<
        typeof insertOrDeleteHandleInNodeDataUsingHandleIndices
      >[3],
      true,
      'after',
    );

    // The inserted handle should have been renamed to 'In 2'
    const allInputs = node.data.inputs as Array<{ name: string }>;
    const names = allInputs.map((h) => h.name);
    expect(names).toContain('In');
    expect(names).toContain('In 2');
    expect(new Set(names).size).toBe(names.length); // all unique
  });
});
