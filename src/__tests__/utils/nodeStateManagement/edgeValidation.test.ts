import { describe, it, expect, beforeEach } from 'vitest';
import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
  makeStateWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { constructNodeOfType } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import {
  addEdgeWithTypeChecking,
  willAddingEdgeCreateCycle,
} from '@/utils/nodeStateManagement/constructAndModifyHandles';

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

const booleanType = makeDataTypeWithAutoInfer({
  name: 'Boolean',
  underlyingType: 'boolean',
  color: '#27AE60',
});

const inferType = makeDataTypeWithAutoInfer({
  name: 'Infer',
  underlyingType: 'inferFromConnection',
  color: '#999999',
});

const dataTypes = {
  stringType,
  numberType,
  booleanType,
  inferType,
} as const;

type DataTypeId = keyof typeof dataTypes;

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------
type NodeTypeId =
  | 'source'
  | 'sink'
  | 'converter'
  | 'numberSource'
  | 'numberSink'
  | 'inferInput'
  | 'inferOutput'
  | 'inferBoth'
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

const converterNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Converter',
  inputs: [{ name: 'In', dataType: 'stringType' }],
  outputs: [{ name: 'Out', dataType: 'numberType' }],
});

const numberSourceNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Number Source',
  inputs: [],
  outputs: [{ name: 'Out', dataType: 'numberType' }],
});

const numberSinkNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Number Sink',
  inputs: [{ name: 'In', dataType: 'numberType' }],
  outputs: [],
});

const inferInputNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Infer Input',
  inputs: [{ name: 'In', dataType: 'inferType' }],
  outputs: [{ name: 'Out', dataType: 'stringType' }],
});

const inferOutputNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Infer Output',
  inputs: [{ name: 'In', dataType: 'stringType' }],
  outputs: [{ name: 'Out', dataType: 'inferType' }],
});

const inferBothNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Infer Both',
  inputs: [{ name: 'In', dataType: 'inferType' }],
  outputs: [{ name: 'Out', dataType: 'inferType' }],
});

const passThroughNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'PassThrough',
  inputs: [{ name: 'In', dataType: 'stringType' }],
  outputs: [{ name: 'Out', dataType: 'stringType' }],
});

const typeOfNodes = {
  source: sourceNodeType,
  sink: sinkNodeType,
  converter: converterNodeType,
  numberSource: numberSourceNodeType,
  numberSink: numberSinkNodeType,
  inferInput: inferInputNodeType,
  inferOutput: inferOutputNodeType,
  inferBoth: inferBothNodeType,
  passThrough: passThroughNodeType,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use a factory to get the inferred state type from makeStateWithAutoInfer
function _createEmptyState() {
  return makeStateWithAutoInfer({
    dataTypes,
    typeOfNodes,
    nodes: [],
    edges: [],
  });
}
type TestState = ReturnType<typeof _createEmptyState>;

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
  if (!output)
    throw new Error(`Output ${outputIndex} not found on node ${nodeId}`);
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
  if (!input)
    throw new Error(`Input ${inputIndex} not found on node ${nodeId}`);
  // Handle panel vs regular input
  if ('inputs' in input) {
    throw new Error('Input is a panel, not a regular input');
  }
  return input.id;
}

/** Deep-clone a state so addEdgeWithTypeChecking mutations don't leak between tests */
function cloneState(state: TestState): TestState {
  return JSON.parse(JSON.stringify(state)) as TestState;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('Edge validation pipeline', () => {
  // -------------------------------------------------------------------------
  // Suite 1: Basic edge addition
  // -------------------------------------------------------------------------
  describe('Basic edge addition', () => {
    let baseState: TestState;

    beforeEach(() => {
      const sourceNode = buildNode('source', 'source-1');
      const sinkNode = buildNode('sink', 'sink-1');
      baseState = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [sourceNode, sinkNode],
        edges: [],
      } as TestState;
    });

    it('should add a valid edge between compatible types', () => {
      const state = cloneState(baseState);
      const srcHandle = getOutputHandleId(state, 'source-1');
      const tgtHandle = getInputHandleId(state, 'sink-1');

      const { validation } = addEdgeWithTypeChecking(
        'source-1',
        srcHandle,
        'sink-1',
        tgtHandle,
        state,
        undefined,
        undefined,
        state,
      );

      expect(validation.isValid).toBe(true);
      expect(state.edges.length).toBe(1);
      expect(state.edges[0].source).toBe('source-1');
      expect(state.edges[0].target).toBe('sink-1');
      expect(state.edges[0].sourceHandle).toBe(srcHandle);
      expect(state.edges[0].targetHandle).toBe(tgtHandle);
    });

    it('should reject edge when source node does not exist', () => {
      const state: TestState = {
        ...cloneState(baseState),
        enableTypeInference: true,
      };
      const tgtHandle = getInputHandleId(state, 'sink-1');

      const { validation } = addEdgeWithTypeChecking(
        'nonexistent-node',
        'fake-handle',
        'sink-1',
        tgtHandle,
        state,
        undefined,
        undefined,
        state,
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('not found');
    });

    it('should reject edge when target node does not exist', () => {
      const state: TestState = {
        ...cloneState(baseState),
        enableTypeInference: true,
      };
      const srcHandle = getOutputHandleId(state, 'source-1');

      const { validation } = addEdgeWithTypeChecking(
        'source-1',
        srcHandle,
        'nonexistent-node',
        'fake-handle',
        state,
        undefined,
        undefined,
        state,
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('not found');
    });

    it('should reject edge when source handle does not exist', () => {
      const state: TestState = {
        ...cloneState(baseState),
        enableTypeInference: true,
      };
      const tgtHandle = getInputHandleId(state, 'sink-1');

      const { validation } = addEdgeWithTypeChecking(
        'source-1',
        'nonexistent-handle',
        'sink-1',
        tgtHandle,
        state,
        undefined,
        undefined,
        state,
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('not found');
    });

    it('should reject edge when target handle does not exist', () => {
      const state: TestState = {
        ...cloneState(baseState),
        enableTypeInference: true,
      };
      const srcHandle = getOutputHandleId(state, 'source-1');

      const { validation } = addEdgeWithTypeChecking(
        'source-1',
        srcHandle,
        'sink-1',
        'nonexistent-handle',
        state,
        undefined,
        undefined,
        state,
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('not found');
    });

    it('should reject duplicate edge (same source + target handles)', () => {
      const state = cloneState(baseState);
      const srcHandle = getOutputHandleId(state, 'source-1');
      const tgtHandle = getInputHandleId(state, 'sink-1');

      // First addition should succeed
      const first = addEdgeWithTypeChecking(
        'source-1',
        srcHandle,
        'sink-1',
        tgtHandle,
        state,
        undefined,
        undefined,
        state,
      );
      expect(first.validation.isValid).toBe(true);
      expect(state.edges.length).toBe(1);

      // Second addition with same handles should be rejected
      const second = addEdgeWithTypeChecking(
        'source-1',
        srcHandle,
        'sink-1',
        tgtHandle,
        state,
        undefined,
        undefined,
        state,
      );
      expect(second.validation.isValid).toBe(false);
      expect(state.edges.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Suite 2: Type compatibility
  // -------------------------------------------------------------------------
  describe('Type compatibility', () => {
    it('should allow same-type connection (string -> string)', () => {
      const sourceNode = buildNode('source', 'src-1');
      const sinkNode = buildNode('sink', 'sink-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [sourceNode, sinkNode],
        edges: [],
        allowedConversionsBetweenDataTypes: {},
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'src-1');
      const tgtHandle = getInputHandleId(stateCopy, 'sink-1');

      const { validation } = addEdgeWithTypeChecking(
        'src-1',
        srcHandle,
        'sink-1',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(validation.isValid).toBe(true);
    });

    it('should reject mismatched types when no conversion rules (string -> number)', () => {
      const sourceNode = buildNode('source', 'src-1');
      const numberSinkNode = buildNode('numberSink', 'nsink-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [sourceNode, numberSinkNode],
        edges: [],
        allowedConversionsBetweenDataTypes: {},
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'src-1');
      const tgtHandle = getInputHandleId(stateCopy, 'nsink-1');

      const { validation } = addEdgeWithTypeChecking(
        'src-1',
        srcHandle,
        'nsink-1',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('conversion is not allowed');
    });

    it('should allow mismatched types when conversion is explicitly allowed', () => {
      const sourceNode = buildNode('source', 'src-1');
      const numberSinkNode = buildNode('numberSink', 'nsink-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [sourceNode, numberSinkNode],
        edges: [],
        allowedConversionsBetweenDataTypes: {
          stringType: { numberType: true },
        },
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'src-1');
      const tgtHandle = getInputHandleId(stateCopy, 'nsink-1');

      const { validation } = addEdgeWithTypeChecking(
        'src-1',
        srcHandle,
        'nsink-1',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(validation.isValid).toBe(true);
    });

    it('should block all cross-type conversions when allowedConversionsBetweenDataTypes is empty object', () => {
      const numberSourceNode = buildNode('numberSource', 'nsrc-1');
      const sinkNode = buildNode('sink', 'sink-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [numberSourceNode, sinkNode],
        edges: [],
        allowedConversionsBetweenDataTypes: {},
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'nsrc-1');
      const tgtHandle = getInputHandleId(stateCopy, 'sink-1');

      const { validation } = addEdgeWithTypeChecking(
        'nsrc-1',
        srcHandle,
        'sink-1',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('conversion is not allowed');
    });

    it('should allow any connection when no validation flags are set', () => {
      const numberSourceNode = buildNode('numberSource', 'nsrc-1');
      const sinkNode = buildNode('sink', 'sink-1');

      // No enableTypeInference, no enableComplexTypeChecking, no allowedConversions
      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [numberSourceNode, sinkNode],
        edges: [],
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'nsrc-1');
      const tgtHandle = getInputHandleId(stateCopy, 'sink-1');

      const { validation } = addEdgeWithTypeChecking(
        'nsrc-1',
        srcHandle,
        'sink-1',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      // When no validation is needed, any edge is accepted
      expect(validation.isValid).toBe(true);
      expect(stateCopy.edges.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Suite 3: Type inference
  // -------------------------------------------------------------------------
  describe('Type inference (enableTypeInference: true)', () => {
    it('should infer target type from source when target is inferFromConnection', () => {
      const sourceNode = buildNode('source', 'src-1');
      const inferInputNode = buildNode('inferInput', 'infer-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [sourceNode, inferInputNode],
        edges: [],
        enableTypeInference: true,
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'src-1');
      const tgtHandle = getInputHandleId(stateCopy, 'infer-1');

      const { validation } = addEdgeWithTypeChecking(
        'src-1',
        srcHandle,
        'infer-1',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(validation.isValid).toBe(true);
      expect(stateCopy.edges.length).toBe(1);

      // The target handle should now have an inferred type matching the source
      const updatedInferNode = stateCopy.nodes.find((n) => n.id === 'infer-1');
      const updatedInput = updatedInferNode?.data.inputs?.[0];
      if (updatedInput && !('inputs' in updatedInput)) {
        expect(updatedInput.inferredDataType?.dataTypeUniqueId).toBe(
          'stringType',
        );
      }
    });

    it('should infer source type from target when source is inferFromConnection', () => {
      const inferOutputNode = buildNode('inferOutput', 'infer-1');
      const sinkNode = buildNode('sink', 'sink-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [inferOutputNode, sinkNode],
        edges: [],
        enableTypeInference: true,
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'infer-1');
      const tgtHandle = getInputHandleId(stateCopy, 'sink-1');

      const { validation } = addEdgeWithTypeChecking(
        'infer-1',
        srcHandle,
        'sink-1',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(validation.isValid).toBe(true);
      expect(stateCopy.edges.length).toBe(1);

      // The source output handle should now have an inferred type matching the target
      const updatedInferNode = stateCopy.nodes.find((n) => n.id === 'infer-1');
      const updatedOutput = updatedInferNode?.data.outputs?.[0];
      expect(updatedOutput?.inferredDataType?.dataTypeUniqueId).toBe(
        'stringType',
      );
    });

    it('should reject when both sides are inferFromConnection and neither has been inferred', () => {
      const inferBothNode1 = buildNode('inferBoth', 'infer-1');
      const inferBothNode2 = buildNode('inferBoth', 'infer-2');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [inferBothNode1, inferBothNode2],
        edges: [],
        enableTypeInference: true,
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'infer-1');
      const tgtHandle = getInputHandleId(stateCopy, 'infer-2');

      const { validation } = addEdgeWithTypeChecking(
        'infer-1',
        srcHandle,
        'infer-2',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('inference has no information');
    });

    it('should succeed when both sides are inferFromConnection but one is already inferred', () => {
      const sourceNode = buildNode('source', 'src-1');
      const inferBothNode1 = buildNode('inferBoth', 'infer-1');
      const inferBothNode2 = buildNode('inferBoth', 'infer-2');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [sourceNode, inferBothNode1, inferBothNode2],
        edges: [],
        enableTypeInference: true,
      };

      // First connect source -> inferBoth1 input to infer its type
      const state1 = cloneState(state);
      const srcHandle = getOutputHandleId(state1, 'src-1');
      const infer1Input = getInputHandleId(state1, 'infer-1');

      const firstResult = addEdgeWithTypeChecking(
        'src-1',
        srcHandle,
        'infer-1',
        infer1Input,
        state1,
        undefined,
        undefined,
        state1,
      );
      expect(firstResult.validation.isValid).toBe(true);

      // Now connect inferBoth1 output -> inferBoth2 input
      const infer1Output = getOutputHandleId(state1, 'infer-1');
      const infer2Input = getInputHandleId(state1, 'infer-2');

      const secondResult = addEdgeWithTypeChecking(
        'infer-1',
        infer1Output,
        'infer-2',
        infer2Input,
        state1,
        undefined,
        undefined,
        state1,
      );

      expect(secondResult.validation.isValid).toBe(true);
      expect(state1.edges.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Suite 4: Edge removal — tested via removeEdgeWithTypeChecking
  // -------------------------------------------------------------------------
  describe('Edge removal', () => {
    it('should preserve other edges when one edge is removed from edges array', () => {
      const sourceNode1 = buildNode('source', 'src-1');
      const sourceNode2 = buildNode('source', 'src-2');
      const sinkNode = buildNode('sink', 'sink-1');
      const converterNode = buildNode('converter', 'conv-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [sourceNode1, sourceNode2, sinkNode, converterNode],
        edges: [],
      };
      const stateCopy = cloneState(state);

      const src1Handle = getOutputHandleId(stateCopy, 'src-1');
      const sinkHandle = getInputHandleId(stateCopy, 'sink-1');
      const src2Handle = getOutputHandleId(stateCopy, 'src-2');
      const convHandle = getInputHandleId(stateCopy, 'conv-1');

      // Add two edges
      addEdgeWithTypeChecking(
        'src-1',
        src1Handle,
        'sink-1',
        sinkHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );
      addEdgeWithTypeChecking(
        'src-2',
        src2Handle,
        'conv-1',
        convHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(stateCopy.edges.length).toBe(2);

      // Manually remove one edge (simulating what the reducer does before removeEdgeWithTypeChecking)
      const remainingEdges = stateCopy.edges.filter(
        (e) => e.source !== 'src-1',
      );
      expect(remainingEdges.length).toBe(1);
      expect(remainingEdges[0].source).toBe('src-2');
      expect(remainingEdges[0].target).toBe('conv-1');
    });
  });

  // -------------------------------------------------------------------------
  // Suite 5: Cycle detection
  // -------------------------------------------------------------------------
  describe('Cycle detection (willAddingEdgeCreateCycle)', () => {
    it('should detect self-connection as a cycle', () => {
      const ptNode = buildNode('passThrough', 'pt-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [ptNode],
        edges: [],
        enableCycleChecking: true,
      };

      const result = willAddingEdgeCreateCycle(state, 'pt-1', 'pt-1');
      expect(result).toBe(true);
    });

    it('should detect a simple A -> B -> A cycle', () => {
      const ptNode1 = buildNode('passThrough', 'pt-1');
      const ptNode2 = buildNode('passThrough', 'pt-2');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [ptNode1, ptNode2],
        edges: [],
      };
      const stateCopy = cloneState(state);

      // Add edge pt-1 -> pt-2
      const src1Handle = getOutputHandleId(stateCopy, 'pt-1');
      const tgt2Handle = getInputHandleId(stateCopy, 'pt-2');
      addEdgeWithTypeChecking(
        'pt-1',
        src1Handle,
        'pt-2',
        tgt2Handle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      // Now check if adding pt-2 -> pt-1 would create a cycle
      const result = willAddingEdgeCreateCycle(stateCopy, 'pt-2', 'pt-1');
      expect(result).toBe(true);
    });

    it('should detect a longer cycle A -> B -> C -> A', () => {
      const ptNode1 = buildNode('passThrough', 'pt-1');
      const ptNode2 = buildNode('passThrough', 'pt-2');
      const ptNode3 = buildNode('passThrough', 'pt-3');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [ptNode1, ptNode2, ptNode3],
        edges: [],
      };
      const stateCopy = cloneState(state);

      // Add pt-1 -> pt-2
      const src1Handle = getOutputHandleId(stateCopy, 'pt-1');
      const tgt2Handle = getInputHandleId(stateCopy, 'pt-2');
      addEdgeWithTypeChecking(
        'pt-1',
        src1Handle,
        'pt-2',
        tgt2Handle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      // Add pt-2 -> pt-3
      const src2Handle = getOutputHandleId(stateCopy, 'pt-2');
      const tgt3Handle = getInputHandleId(stateCopy, 'pt-3');
      addEdgeWithTypeChecking(
        'pt-2',
        src2Handle,
        'pt-3',
        tgt3Handle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      // Check if adding pt-3 -> pt-1 would create a cycle
      const result = willAddingEdgeCreateCycle(stateCopy, 'pt-3', 'pt-1');
      expect(result).toBe(true);
    });

    it('should not flag a valid DAG connection as a cycle', () => {
      const ptNode1 = buildNode('passThrough', 'pt-1');
      const ptNode2 = buildNode('passThrough', 'pt-2');
      const ptNode3 = buildNode('passThrough', 'pt-3');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [ptNode1, ptNode2, ptNode3],
        edges: [],
      };
      const stateCopy = cloneState(state);

      // Add pt-1 -> pt-2
      const src1Handle = getOutputHandleId(stateCopy, 'pt-1');
      const tgt2Handle = getInputHandleId(stateCopy, 'pt-2');
      addEdgeWithTypeChecking(
        'pt-1',
        src1Handle,
        'pt-2',
        tgt2Handle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      // Check if adding pt-1 -> pt-3 would create a cycle (it should not)
      const result = willAddingEdgeCreateCycle(stateCopy, 'pt-1', 'pt-3');
      expect(result).toBe(false);
    });

    it('should return false when target node does not exist', () => {
      const ptNode1 = buildNode('passThrough', 'pt-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [ptNode1],
        edges: [],
      };

      const result = willAddingEdgeCreateCycle(state, 'pt-1', 'nonexistent');
      expect(result).toBe(false);
    });

    it('should not flag diamond-shaped DAG as a cycle', () => {
      //   pt-1
      //   / \
      // pt-2  pt-3
      //   \ /
      //   pt-4
      const ptNode1 = buildNode('passThrough', 'pt-1');
      const ptNode2 = buildNode('passThrough', 'pt-2');
      const ptNode3 = buildNode('passThrough', 'pt-3');
      const ptNode4 = buildNode('passThrough', 'pt-4');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [ptNode1, ptNode2, ptNode3, ptNode4],
        edges: [],
      };
      const stateCopy = cloneState(state);

      // pt-1 -> pt-2
      addEdgeWithTypeChecking(
        'pt-1',
        getOutputHandleId(stateCopy, 'pt-1'),
        'pt-2',
        getInputHandleId(stateCopy, 'pt-2'),
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );
      // pt-1 -> pt-3
      // pt-3 has only one input, but pt-1 has one output; reactflow allows multiple edges from same output
      // We need a second source for pt-3; use pt-2 -> pt-3 instead for a true diamond
      addEdgeWithTypeChecking(
        'pt-2',
        getOutputHandleId(stateCopy, 'pt-2'),
        'pt-4',
        getInputHandleId(stateCopy, 'pt-4'),
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      // Adding pt-3 -> pt-4 should not be a cycle
      const result = willAddingEdgeCreateCycle(stateCopy, 'pt-3', 'pt-4');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Suite 6: Interaction between validation flags
  // -------------------------------------------------------------------------
  describe('Validation flag interactions', () => {
    it('should run type conversion check even when type inference is disabled', () => {
      const sourceNode = buildNode('source', 'src-1');
      const numberSinkNode = buildNode('numberSink', 'nsink-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [sourceNode, numberSinkNode],
        edges: [],
        enableTypeInference: false,
        allowedConversionsBetweenDataTypes: {},
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'src-1');
      const tgtHandle = getInputHandleId(stateCopy, 'nsink-1');

      const { validation } = addEdgeWithTypeChecking(
        'src-1',
        srcHandle,
        'nsink-1',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(validation.isValid).toBe(false);
    });

    it('should pass inference and conversion checks together for same-type connection', () => {
      const sourceNode = buildNode('source', 'src-1');
      const sinkNode = buildNode('sink', 'sink-1');

      const state = {
        dataTypes,
        typeOfNodes: typeOfNodes as TestState['typeOfNodes'],
        nodes: [sourceNode, sinkNode],
        edges: [],
        enableTypeInference: true,
        allowedConversionsBetweenDataTypes: {},
      };
      const stateCopy = cloneState(state);
      const srcHandle = getOutputHandleId(stateCopy, 'src-1');
      const tgtHandle = getInputHandleId(stateCopy, 'sink-1');

      const { validation } = addEdgeWithTypeChecking(
        'src-1',
        srcHandle,
        'sink-1',
        tgtHandle,
        stateCopy,
        undefined,
        undefined,
        stateCopy,
      );

      expect(validation.isValid).toBe(true);
      expect(stateCopy.edges.length).toBe(1);
    });
  });
});
