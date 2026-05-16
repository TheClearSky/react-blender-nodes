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
import { mainReducer } from '@/utils/nodeStateManagement/mainReducer';
import type { AddEdgePlan } from '@/utils/nodeStateManagement/planApply/types';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';
import { typedKeys } from '@/utils/typedKeys';

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------
const stringType = makeDataTypeWithAutoInfer({
  name: 'String',
  underlyingType: 'string',
  color: '#4A90E2',
});

const numberType = makeDataTypeWithAutoInfer({
  name: 'Number',
  underlyingType: 'number',
  color: '#E74C3C',
});

const inferType = makeDataTypeWithAutoInfer({
  name: 'Infer',
  underlyingType: 'inferFromConnection',
  color: '#999999',
});

const dataTypes = {
  stringType,
  numberType,
  inferType,
} as const;

type DataTypeId = keyof typeof dataTypes;

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------
type NodeTypeId =
  | 'source'
  | 'sink'
  | 'numberSource'
  | 'inferInput'
  | 'passThrough';

const sourceNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Source',
  inputs: [],
  outputs: [{ name: 'Out', dataType: 'stringType' }],
});

const sinkNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Sink',
  inputs: [{ name: 'In', dataType: 'stringType' }],
  outputs: [],
});

const numberSourceNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Number Source',
  inputs: [],
  outputs: [{ name: 'Out', dataType: 'numberType' }],
});

const inferInputNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Infer Input',
  inputs: [{ name: 'In', dataType: 'inferType' }],
  outputs: [{ name: 'Out', dataType: 'stringType' }],
});

const passThroughNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'PassThrough',
  inputs: [{ name: 'In', dataType: 'stringType' }],
  outputs: [{ name: 'Out', dataType: 'stringType' }],
});

const typeOfNodes = {
  source: sourceNodeType,
  sink: sinkNodeType,
  numberSource: numberSourceNodeType,
  inferInput: inferInputNodeType,
  passThrough: passThroughNodeType,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  nodeType: NodeTypeId,
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

function getOutputHandleId(
  state: TestState,
  nodeId: string,
  outputIndex = 0,
): string {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  const output = node.data.outputs?.[outputIndex];
  if (!output) throw new Error(`Output ${outputIndex} not found on ${nodeId}`);
  return output.id;
}

function getInputHandleId(
  state: TestState,
  nodeId: string,
  inputIndex = 0,
): string {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  const input = node.data.inputs?.[inputIndex];
  if (!input) throw new Error(`Input ${inputIndex} not found on ${nodeId}`);
  if ('inputs' in input)
    throw new Error('Input is a panel, not a regular input');
  return input.id;
}

// ====================================================================
// Suite 1: Validator purity (does NOT mutate state)
// ====================================================================
describe('Validator purity', () => {
  it('validateAction does not mutate state for SET_VIEWPORT', () => {
    const state = createEmptyState();
    const frozen = JSON.stringify(state);

    validateAction(state, {
      type: actionTypesMap.SET_VIEWPORT,
      payload: { viewport: { x: 1, y: 1, zoom: 1 } },
    });

    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('validateAction does not mutate state for ADD_NODE', () => {
    const sourceNode = buildNode('source', 'src-1');
    const state: TestState = {
      ...createEmptyState(),
      nodes: [sourceNode],
    };
    const frozen = JSON.stringify(state);

    validateAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'passThrough' as NodeTypeId,
        position: { x: 50, y: 75 },
      },
    });

    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('validateAction does not mutate state for ADD_EDGE (with inference enabled)', () => {
    // This is the CRITICAL test - inference previously mutated state
    const sourceNode = buildNode('source', 'src-1');
    const inferNode = buildNode('inferInput', 'infer-1');

    const state: TestState = {
      ...createEmptyState(),
      nodes: [sourceNode, inferNode],
      enableTypeInference: true,
    };

    const frozen = JSON.stringify(state);

    const srcHandle = getOutputHandleId(state, 'src-1');
    const tgtHandle = getInputHandleId(state, 'infer-1');

    validateAction(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'src-1',
          target: 'infer-1',
          sourceHandle: srcHandle,
          targetHandle: tgtHandle,
        },
      },
    });

    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('validateAction does not mutate state for CLOSE_NODE_GROUP', () => {
    const state: TestState = {
      ...createEmptyState(),
      openedNodeGroupStack: [],
    };
    const frozen = JSON.stringify(state);

    validateAction(state, { type: actionTypesMap.CLOSE_NODE_GROUP });

    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('validateAction does not mutate state for UPDATE_EDGES_BY_REACT_FLOW', () => {
    const sourceNode = buildNode('source', 'src-1');
    const sinkNode = buildNode('sink', 'sink-1');

    const srcHandle = getOutputHandleId(
      { ...createEmptyState(), nodes: [sourceNode] } as TestState,
      'src-1',
    );
    const tgtHandle = getInputHandleId(
      { ...createEmptyState(), nodes: [sinkNode] } as TestState,
      'sink-1',
    );

    const state: TestState = {
      ...createEmptyState(),
      nodes: [sourceNode, sinkNode],
      edges: [
        {
          id: 'edge-1',
          source: 'src-1',
          target: 'sink-1',
          sourceHandle: srcHandle,
          targetHandle: tgtHandle,
          type: 'configurableEdge' as const,
          data: {},
        },
      ],
    };
    const frozen = JSON.stringify(state);

    validateAction(state, {
      type: actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW,
      payload: {
        changes: [{ type: 'remove', id: 'edge-1' }],
      },
    });

    expect(JSON.stringify(state)).toBe(frozen);
  });
});

// ====================================================================
// Suite 2: Validator error codes
// ====================================================================
describe('Validator error codes', () => {
  it('ADD_EDGE returns MISSING_ENDPOINT for null handles', () => {
    const sourceNode = buildNode('source', 'src-1');
    const sinkNode = buildNode('sink', 'sink-1');

    const state: TestState = {
      ...createEmptyState(),
      nodes: [sourceNode, sinkNode],
    };

    const result = validateAction(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'src-1',
          target: 'sink-1',
          sourceHandle: null,
          targetHandle: null,
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.code).toBe('MISSING_ENDPOINT');
    }
  });

  it('CLOSE_NODE_GROUP returns EMPTY_STACK on empty stack', () => {
    const state: TestState = {
      ...createEmptyState(),
      openedNodeGroupStack: [],
    };

    const result = validateAction(state, {
      type: actionTypesMap.CLOSE_NODE_GROUP,
    });

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.code).toBe('EMPTY_STACK');
    }
  });

  it('ADD_NODE returns NODE_TYPE_NOT_FOUND for missing type', () => {
    const state = createEmptyState();

    const result = validateAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'nonExistentNodeType' as NodeTypeId,
        position: { x: 0, y: 0 },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.code).toBe('NODE_TYPE_NOT_FOUND');
    }
  });

  it('ADD_EDGE returns MISSING_ENDPOINT when source node does not exist', () => {
    const sinkNode = buildNode('sink', 'sink-1');
    const state: TestState = {
      ...createEmptyState(),
      nodes: [sinkNode],
    };

    const tgtHandle = getInputHandleId(state, 'sink-1');

    const result = validateAction(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'nonexistent',
          target: 'sink-1',
          sourceHandle: 'fake-handle',
          targetHandle: tgtHandle,
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.code).toBe('MISSING_ENDPOINT');
    }
  });

  it('ADD_EDGE returns CONVERSION_NOT_ALLOWED for mismatched types', () => {
    const numberSourceNode = buildNode('numberSource', 'nsrc-1');
    const sinkNode = buildNode('sink', 'sink-1');

    const state: TestState = {
      ...createEmptyState(),
      nodes: [numberSourceNode, sinkNode],
      allowedConversionsBetweenDataTypes: {},
    };

    const srcHandle = getOutputHandleId(state, 'nsrc-1');
    const tgtHandle = getInputHandleId(state, 'sink-1');

    const result = validateAction(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'nsrc-1',
          target: 'sink-1',
          sourceHandle: srcHandle,
          targetHandle: tgtHandle,
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.code).toBe('CONVERSION_NOT_ALLOWED');
    }
  });
});

// ====================================================================
// Suite 3: ADD_EDGE Plan correctness
// ====================================================================
describe('ADD_EDGE plan correctness', () => {
  it('produces an InferencePlan with nodeDataReplacements when inference is enabled', () => {
    const sourceNode = buildNode('source', 'src-1');
    const inferNode = buildNode('inferInput', 'infer-1');

    const state: TestState = {
      ...createEmptyState(),
      nodes: [sourceNode, inferNode],
      enableTypeInference: true,
    };

    const srcHandle = getOutputHandleId(state, 'src-1');
    const tgtHandle = getInputHandleId(state, 'infer-1');

    const result = validateAction(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'src-1',
          target: 'infer-1',
          sourceHandle: srcHandle,
          targetHandle: tgtHandle,
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    if (result!.ok) {
      const plan = result!.value as AddEdgePlan;
      expect(plan.kind).toBe('ADD_EDGE');
      expect(plan.inference.nodeDataReplacements.length).toBeGreaterThan(0);
      // The replacement should target the infer node
      expect(
        plan.inference.nodeDataReplacements.some((r) => r.nodeId === 'infer-1'),
      ).toBe(true);
    }
  });

  it('produces empty inference when no type inference flags are set', () => {
    const sourceNode = buildNode('source', 'src-1');
    const sinkNode = buildNode('sink', 'sink-1');

    const state: TestState = {
      ...createEmptyState(),
      nodes: [sourceNode, sinkNode],
      // No enableTypeInference, no enableComplexTypeChecking, no allowedConversions
    };

    const srcHandle = getOutputHandleId(state, 'src-1');
    const tgtHandle = getInputHandleId(state, 'sink-1');

    const result = validateAction(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'src-1',
          target: 'sink-1',
          sourceHandle: srcHandle,
          targetHandle: tgtHandle,
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    if (result!.ok) {
      const plan = result!.value as AddEdgePlan;
      expect(plan.kind).toBe('ADD_EDGE');
      expect(plan.inference.nodeDataReplacements).toHaveLength(0);
    }
  });

  it('apply(validate(state, addEdge).value) produces correct state', () => {
    const sourceNode = buildNode('source', 'src-1');
    const inferNode = buildNode('inferInput', 'infer-1');

    const state: TestState = {
      ...createEmptyState(),
      nodes: [sourceNode, inferNode],
      enableTypeInference: true,
    };

    const srcHandle = getOutputHandleId(state, 'src-1');
    const tgtHandle = getInputHandleId(state, 'infer-1');

    const result = validateAction(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'src-1',
          target: 'infer-1',
          sourceHandle: srcHandle,
          targetHandle: tgtHandle,
        },
      },
    });

    expect(result!.ok).toBe(true);
    if (result!.ok) {
      const newState = produce(state, (draft) => {
        applyPlan(draft, result!.value);
      });

      // Edge is present
      expect(newState.edges).toHaveLength(1);
      expect(newState.edges[0].source).toBe('src-1');
      expect(newState.edges[0].target).toBe('infer-1');

      // Inference data was applied to the infer node
      const updatedInferNode = newState.nodes.find((n) => n.id === 'infer-1');
      expect(updatedInferNode).toBeTruthy();
      const updatedInput = updatedInferNode?.data.inputs?.[0];
      if (updatedInput && !('inputs' in updatedInput)) {
        expect(updatedInput.inferredDataType?.dataTypeUniqueId).toBe(
          'stringType',
        );
      }
    }
  });
});

// ====================================================================
// Suite 4: Validate -> Apply round-trip
// ====================================================================
describe('Validate -> Apply round-trip', () => {
  it('SET_VIEWPORT round-trip produces correct viewport', () => {
    const state = createEmptyState();

    const result = validateAction(state, {
      type: actionTypesMap.SET_VIEWPORT,
      payload: { viewport: { x: 100, y: 200, zoom: 0.5 } },
    });

    expect(result).not.toBeNull();
    const r = result!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const newState = produce(state, (draft) => {
      applyPlan(draft, r.value);
    });

    expect(newState.viewport).toEqual({ x: 100, y: 200, zoom: 0.5 });
  });

  it('ADD_NODE round-trip adds node to state', () => {
    const state = createEmptyState();

    const result = validateAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: {
        type: 'passThrough' as NodeTypeId,
        position: { x: 50, y: 75 },
      },
    });

    expect(result).not.toBeNull();
    const r = result!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const newState = produce(state, (draft) => {
      applyPlan(draft, r.value);
    });

    expect(newState.nodes).toHaveLength(1);
    expect(newState.nodes[0].position).toEqual({ x: 50, y: 75 });
    expect(newState.nodes[0].data.nodeTypeUniqueId).toBe('passThrough');
  });

  it('ADD_NODE_AND_SELECT round-trip adds and selects node', () => {
    // Start with an existing node that is selected
    const existingNode = buildNode('source', 'existing-1');
    const state: TestState = {
      ...createEmptyState(),
      nodes: [{ ...existingNode, selected: true }],
    };

    const result = validateAction(state, {
      type: actionTypesMap.ADD_NODE_AND_SELECT,
      payload: {
        type: 'sink' as NodeTypeId,
        position: { x: 200, y: 300 },
      },
    });

    expect(result).not.toBeNull();
    const r = result!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const newState = produce(state, (draft) => {
      applyPlan(draft, r.value);
    });

    expect(newState.nodes).toHaveLength(2);

    // The new node should be selected
    const newNode = newState.nodes.find((n) => n.id !== 'existing-1');
    expect(newNode).toBeTruthy();
    expect(newNode!.selected).toBe(true);

    // The old node should be deselected
    const oldNode = newState.nodes.find((n) => n.id === 'existing-1');
    expect(oldNode).toBeTruthy();
    expect(oldNode!.selected).toBe(false);
  });

  it('REPLACE_STATE round-trip replaces entire state', () => {
    const state = createEmptyState();
    const replacement: TestState = {
      ...createEmptyState(),
      viewport: { x: 42, y: 84, zoom: 2 },
    };

    const result = validateAction(state, {
      type: actionTypesMap.REPLACE_STATE,
      payload: { state: replacement },
    });

    expect(result).not.toBeNull();
    const r = result!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // REPLACE_STATE: applyPlan returns the new state; verify via mainReducer pattern
    // We test the plan value directly instead of going through produce,
    // since REPLACE_STATE's plan contains the replacement state.
    expect(r.value.kind).toBe('REPLACE_STATE');
    if (r.value.kind === 'REPLACE_STATE') {
      expect((r.value.state as TestState).viewport).toEqual({
        x: 42,
        y: 84,
        zoom: 2,
      });
    }
  });

  it('UPDATE_NODE_BY_REACT_FLOW round-trip applies position changes', () => {
    const sourceNode = buildNode('source', 'src-1');
    const state: TestState = {
      ...createEmptyState(),
      nodes: [sourceNode],
    };

    const result = validateAction(state, {
      type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
      payload: {
        changes: [
          { type: 'position', id: 'src-1', position: { x: 999, y: 888 } },
        ],
      },
    });

    expect(result).not.toBeNull();
    const r = result!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const newState = produce(state, (draft) => {
      applyPlan(draft, r.value);
    });

    const updatedNode = newState.nodes.find((n) => n.id === 'src-1');
    expect(updatedNode).toBeTruthy();
    expect(updatedNode!.position).toEqual({ x: 999, y: 888 });
  });

  it('ADD_EDGE round-trip (no inference) adds edge correctly', () => {
    const sourceNode = buildNode('source', 'src-1');
    const sinkNode = buildNode('sink', 'sink-1');

    const state: TestState = {
      ...createEmptyState(),
      nodes: [sourceNode, sinkNode],
    };

    const srcHandle = getOutputHandleId(state, 'src-1');
    const tgtHandle = getInputHandleId(state, 'sink-1');

    const result = validateAction(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: 'src-1',
          target: 'sink-1',
          sourceHandle: srcHandle,
          targetHandle: tgtHandle,
        },
      },
    });

    const r = result!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const newState = produce(state, (draft) => {
      applyPlan(draft, r.value);
    });

    expect(newState.edges).toHaveLength(1);
    expect(newState.edges[0].source).toBe('src-1');
    expect(newState.edges[0].target).toBe('sink-1');
    expect(newState.edges[0].sourceHandle).toBe(srcHandle);
    expect(newState.edges[0].targetHandle).toBe(tgtHandle);
  });

  it('failed validation does not produce a plan to apply', () => {
    const state: TestState = {
      ...createEmptyState(),
      openedNodeGroupStack: [],
    };

    const result = validateAction(state, {
      type: actionTypesMap.CLOSE_NODE_GROUP,
    });

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    // There is no .value on a failed result — only .error
    if (!result!.ok) {
      expect(result!.error).toBeDefined();
      expect(result!.error.code).toBe('EMPTY_STACK');
    }
  });
});

// ====================================================================
// Suite: UPDATE_NODE_TYPE
// ====================================================================

describe('UPDATE_NODE_TYPE', () => {
  const groupDataTypes = {
    ...dataTypes,
    ...standardDataTypes,
  } as const;
  const groupTypeOfNodes = {
    ...typeOfNodes,
    ...standardNodeTypes,
  } as const;
  type GroupNodeTypeId = keyof typeof groupTypeOfNodes;

  function createGroupState() {
    return makeStateWithAutoInfer({
      dataTypes: groupDataTypes,
      typeOfNodes: groupTypeOfNodes,
      nodes: [],
      edges: [],
      enableTypeInference: true,
    });
  }
  type GroupState = ReturnType<typeof createGroupState>;

  function addNodeGroup(state: GroupState): GroupState {
    return mainReducer(state, {
      type: actionTypesMap.ADD_NODE_GROUP,
    }) as GroupState;
  }

  function findGroupNodeTypeId(state: GroupState): string {
    return typedKeys(state.typeOfNodes).find(
      (key) => state.typeOfNodes[key].subtree !== undefined,
    )!;
  }

  describe('validation', () => {
    it('rejects when nodeTypeId does not exist', () => {
      const state = createGroupState();
      const result = validateAction(state, {
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: 'nonExistentType' as GroupNodeTypeId,
          updates: { name: 'New Name' },
        },
      });
      expect(result).not.toBeNull();
      expect(result!.ok).toBe(false);
      if (!result!.ok) {
        expect(result!.error.code).toBe('NODE_TYPE_NOT_FOUND');
      }
    });

    it('rejects when name is empty string', () => {
      const state = addNodeGroup(createGroupState());
      const groupTypeId = findGroupNodeTypeId(state);
      const result = validateAction(state, {
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: groupTypeId as GroupNodeTypeId,
          updates: { name: '' },
        },
      });
      expect(result).not.toBeNull();
      expect(result!.ok).toBe(false);
      if (!result!.ok) {
        expect(result!.error.code).toBe('INVALID_NODE_GROUP');
      }
    });

    it('rejects when name is whitespace only', () => {
      const state = addNodeGroup(createGroupState());
      const groupTypeId = findGroupNodeTypeId(state);
      const result = validateAction(state, {
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: groupTypeId as GroupNodeTypeId,
          updates: { name: '   ' },
        },
      });
      expect(result).not.toBeNull();
      expect(result!.ok).toBe(false);
    });

    it('accepts valid name update', () => {
      const state = addNodeGroup(createGroupState());
      const groupTypeId = findGroupNodeTypeId(state);
      const result = validateAction(state, {
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: groupTypeId as GroupNodeTypeId,
          updates: { name: 'My Custom Group' },
        },
      });
      expect(result).not.toBeNull();
      expect(result!.ok).toBe(true);
      if (result!.ok) {
        expect(result!.value.kind).toBe('UPDATE_NODE_TYPE');
      }
    });
  });

  describe('apply — 3-tier propagation', () => {
    it('Tier 1: updates the typeOfNode definition', () => {
      const state = addNodeGroup(createGroupState());
      const groupTypeId = findGroupNodeTypeId(state);
      const newState = mainReducer(state, {
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: groupTypeId as GroupNodeTypeId,
          updates: { name: 'Renamed Group' },
        },
      }) as GroupState;

      expect(newState.typeOfNodes[groupTypeId as GroupNodeTypeId].name).toBe(
        'Renamed Group',
      );
    });

    it('Tier 1: updates headerColor on the definition', () => {
      const state = addNodeGroup(createGroupState());
      const groupTypeId = findGroupNodeTypeId(state);
      const newState = mainReducer(state, {
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: groupTypeId as GroupNodeTypeId,
          updates: { headerColor: '#ff0000' },
        },
      }) as GroupState;

      expect(
        newState.typeOfNodes[groupTypeId as GroupNodeTypeId].headerColor,
      ).toBe('#ff0000');
    });

    it('Tier 3: updates instances in root-level nodes', () => {
      let state = addNodeGroup(createGroupState());
      const groupTypeId = findGroupNodeTypeId(state);

      // Close the group to go back to root
      state = mainReducer(state, {
        type: actionTypesMap.CLOSE_NODE_GROUP,
      }) as GroupState;

      // Add an instance of the group at root level
      state = mainReducer(state, {
        type: actionTypesMap.ADD_NODE,
        payload: {
          type: groupTypeId as GroupNodeTypeId,
          position: { x: 0, y: 0 },
        },
      }) as GroupState;

      const instanceBefore = state.nodes.find(
        (n) => n.data.nodeTypeUniqueId === groupTypeId,
      );
      expect(instanceBefore).toBeDefined();
      expect(instanceBefore!.data.name).toBe('Node Group 1');

      // Rename the group
      state = mainReducer(state, {
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: groupTypeId as GroupNodeTypeId,
          updates: { name: 'Calculator' },
        },
      }) as GroupState;

      const instanceAfter = state.nodes.find(
        (n) => n.data.nodeTypeUniqueId === groupTypeId,
      );
      expect(instanceAfter!.data.name).toBe('Calculator');
    });

    it('Tier 2: updates instances in dependent subtrees', () => {
      let state = addNodeGroup(createGroupState());
      const innerGroupTypeId = findGroupNodeTypeId(state);

      // Close back to root
      state = mainReducer(state, {
        type: actionTypesMap.CLOSE_NODE_GROUP,
      }) as GroupState;

      // Create a second group (the outer group)
      state = mainReducer(state, {
        type: actionTypesMap.ADD_NODE_GROUP,
      }) as GroupState;

      const outerGroupTypeId = typedKeys(state.typeOfNodes).find(
        (key) =>
          state.typeOfNodes[key].subtree !== undefined &&
          key !== innerGroupTypeId,
      )!;

      // We are now inside the outer group. Add an instance of the inner group.
      state = mainReducer(state, {
        type: actionTypesMap.ADD_NODE,
        payload: {
          type: innerGroupTypeId as GroupNodeTypeId,
          position: { x: 0, y: 0 },
        },
      }) as GroupState;

      // Verify the instance exists inside the outer group's subtree
      const outerSubtree =
        state.typeOfNodes[outerGroupTypeId as GroupNodeTypeId].subtree!;
      const instanceInSubtree = outerSubtree.nodes.find(
        (n) => n.data.nodeTypeUniqueId === innerGroupTypeId,
      );
      expect(instanceInSubtree).toBeDefined();
      expect(instanceInSubtree!.data.name).toBe('Node Group 1');

      // Rename the inner group
      state = mainReducer(state, {
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: innerGroupTypeId as GroupNodeTypeId,
          updates: { name: 'Inner Logic' },
        },
      }) as GroupState;

      // Verify Tier 1: type definition updated
      expect(state.typeOfNodes[innerGroupTypeId as GroupNodeTypeId].name).toBe(
        'Inner Logic',
      );

      // Verify Tier 2: instance in outer group's subtree updated
      const updatedSubtree =
        state.typeOfNodes[outerGroupTypeId as GroupNodeTypeId].subtree!;
      const updatedInstance = updatedSubtree.nodes.find(
        (n) => n.data.nodeTypeUniqueId === innerGroupTypeId,
      );
      expect(updatedInstance!.data.name).toBe('Inner Logic');
    });

    it('leaves other node types unchanged', () => {
      let state = addNodeGroup(createGroupState());
      const groupTypeId = findGroupNodeTypeId(state);

      // Close and add a regular source node at root
      state = mainReducer(state, {
        type: actionTypesMap.CLOSE_NODE_GROUP,
      }) as GroupState;
      state = mainReducer(state, {
        type: actionTypesMap.ADD_NODE,
        payload: {
          type: 'source' as GroupNodeTypeId,
          position: { x: 0, y: 0 },
        },
      }) as GroupState;

      const sourceNodeBefore = state.nodes.find(
        (n) => n.data.nodeTypeUniqueId === 'source',
      );
      expect(sourceNodeBefore!.data.name).toBe('Source');

      // Rename the group
      state = mainReducer(state, {
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: groupTypeId as GroupNodeTypeId,
          updates: { name: 'Renamed' },
        },
      }) as GroupState;

      // Source node should be unchanged
      const sourceNodeAfter = state.nodes.find(
        (n) => n.data.nodeTypeUniqueId === 'source',
      );
      expect(sourceNodeAfter!.data.name).toBe('Source');
    });
  });
});
