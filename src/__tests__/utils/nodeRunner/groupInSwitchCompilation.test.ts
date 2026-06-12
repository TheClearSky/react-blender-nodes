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
import { findZoneByStructure } from '@/utils/nodeStateManagement/zones';
import { getCurrentNodesAndEdgesFromState } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import {
  compile,
  DEFAULT_MAX_LOOP_ITERATIONS,
} from '@/utils/nodeRunner/compiler';
import { execute } from '@/utils/nodeRunner/executor';
import type {
  ExecutionPlan,
  ExecutionStep,
  GroupExecutionScope,
  LoopExecutionBlock,
} from '@/utils/nodeRunner/types';

// Node-group type ids are minted at runtime, so this graph cannot be typed
// with a closed key union — plain string unions are the honest type here.
type TestGraphState = State<string, string>;

function createBaseState(): TestGraphState {
  return {
    dataTypes: {
      ...standardDataTypes,
      testString: {
        name: 'Test String',
        underlyingType: 'string',
        color: '#4A90E2',
      },
    } as TestGraphState['dataTypes'],
    typeOfNodes: {
      ...standardNodeTypes,
      testSource: {
        name: 'Test Source',
        headerColor: '#2E86AB',
        inputs: [],
        outputs: [{ name: 'Out', dataType: 'testString' }],
      },
    } as TestGraphState['typeOfNodes'],
    nodes: [],
    edges: [],
    // Required for the concrete→infer connection below to materialize the
    // switch's data channel handles (the runtime validates channel counts).
    enableTypeInference: true,
  };
}

const testSourceImplementations = {
  testSource: () => new Map<string, unknown>([['Out', 'sample-value']]),
};

function applyAction(
  state: TestGraphState,
  action: Action<string, string>,
): TestGraphState {
  // Explicit type arguments pin UnderlyingType/ComplexSchemaType to their
  // defaults — inference from State's conditional types widens them otherwise.
  return mainReducer<string, string>(state, action);
}

function findStepOfKind<TargetKind extends ExecutionStep['kind']>(
  executionPlan: ExecutionPlan,
  kind: TargetKind,
): Extract<ExecutionStep, { kind: TargetKind }> | undefined {
  for (const level of executionPlan.levels) {
    for (const step of level) {
      if (step.kind === kind) {
        return step as Extract<ExecutionStep, { kind: TargetKind }>;
      }
    }
  }
  return undefined;
}

/**
 * Builds, through real reducer actions, a root graph containing a switch pair
 * and a node-group instance whose subtree contains a loop triplet. The group
 * instance is then placed into the switch's true branch by setting the
 * true-branch zone's membership — the compiler consumes zone membership as
 * data (`findZoneByStructure` + `zone.nodeIds`), and membership itself is
 * derived state recomputed by the reducer, so a compiler unit test may supply
 * it directly without wiring inference-driven edges.
 */
function createStateWithGroupedLoopInsideSwitchTrueBranch(): {
  stateForCompilation: TestGraphState;
  switchStartNodeId: string;
  groupNodeId: string;
} {
  let graphState = createBaseState();

  graphState = applyAction(graphState, {
    type: actionTypesMap.ADD_SWITCH,
    payload: { position: { x: 0, y: 0 } },
  });

  // Wire a concrete source into the switch's infer input so the channel-sync
  // machinery materializes real data handles across the pair — the executor
  // validates switch data-channel counts at runtime.
  graphState = applyAction(graphState, {
    type: actionTypesMap.ADD_NODE,
    payload: { type: 'testSource', position: { x: -400, y: 0 } },
  });
  const sourceNodeBeforeEdge = graphState.nodes.find(
    (node) => node.data.nodeTypeUniqueId === 'testSource',
  );
  const switchStartNodeBeforeEdge = graphState.nodes.find(
    (node) =>
      node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart,
  );
  expect(sourceNodeBeforeEdge).toBeDefined();
  expect(switchStartNodeBeforeEdge).toBeDefined();
  const sourceOutputHandleId = sourceNodeBeforeEdge!.data.outputs?.[0]?.id;
  const switchStartInferInputHandleId =
    switchStartNodeBeforeEdge!.data.inputs?.[0]?.id;
  expect(sourceOutputHandleId).toBeDefined();
  expect(switchStartInferInputHandleId).toBeDefined();
  graphState = applyAction(graphState, {
    type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
    payload: {
      edge: {
        source: sourceNodeBeforeEdge!.id,
        sourceHandle: sourceOutputHandleId!,
        target: switchStartNodeBeforeEdge!.id,
        targetHandle: switchStartInferInputHandleId!,
      },
    },
  });

  graphState = applyAction(graphState, {
    type: actionTypesMap.ADD_NODE_GROUP,
  });
  const groupNodeTypeId = Object.keys(graphState.typeOfNodes).find(
    (nodeTypeId) => graphState.typeOfNodes[nodeTypeId]?.subtree !== undefined,
  );
  expect(groupNodeTypeId).toBeDefined();

  // Add a loop triplet inside the group's subtree (scope follows the
  // opened-group stack), wire a concrete source into its infer input so the
  // loop materializes a real data channel (the executor validates loop
  // channel counts at runtime), then close the group again.
  graphState = applyAction(graphState, {
    type: actionTypesMap.OPEN_NODE_GROUP,
    payload: { nodeType: groupNodeTypeId! },
  });
  graphState = applyAction(graphState, {
    type: actionTypesMap.ADD_LOOP,
    payload: { position: { x: 0, y: 0 } },
  });
  graphState = applyAction(graphState, {
    type: actionTypesMap.ADD_NODE,
    payload: { type: 'testSource', position: { x: -400, y: 0 } },
  });
  const subtreeView = getCurrentNodesAndEdgesFromState(graphState);
  const subtreeSourceNode = subtreeView.nodes.find(
    (node) => node.data.nodeTypeUniqueId === 'testSource',
  );
  const subtreeLoopStartNode = subtreeView.nodes.find(
    (node) => node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart,
  );
  expect(subtreeSourceNode).toBeDefined();
  expect(subtreeLoopStartNode).toBeDefined();
  const subtreeSourceOutputHandleId = subtreeSourceNode!.data.outputs?.[0]?.id;
  const loopStartInferInputHandleId =
    subtreeLoopStartNode!.data.inputs?.[0]?.id;
  expect(subtreeSourceOutputHandleId).toBeDefined();
  expect(loopStartInferInputHandleId).toBeDefined();
  graphState = applyAction(graphState, {
    type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
    payload: {
      edge: {
        source: subtreeSourceNode!.id,
        sourceHandle: subtreeSourceOutputHandleId!,
        target: subtreeLoopStartNode!.id,
        targetHandle: loopStartInferInputHandleId!,
      },
    },
  });
  graphState = applyAction(graphState, {
    type: actionTypesMap.CLOSE_NODE_GROUP,
  });

  graphState = applyAction(graphState, {
    type: actionTypesMap.ADD_NODE,
    payload: { type: groupNodeTypeId!, position: { x: 300, y: 0 } },
  });

  const switchStartNode = graphState.nodes.find(
    (node) =>
      node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart,
  );
  const groupNode = graphState.nodes.find(
    (node) => node.data.nodeTypeUniqueId === groupNodeTypeId,
  );
  expect(switchStartNode).toBeDefined();
  expect(groupNode).toBeDefined();

  const trueBranchZone = findZoneByStructure(
    graphState.zones ?? {},
    switchStartNode!.id,
    'trueBranch',
  );
  expect(trueBranchZone).toBeDefined();

  const stateForCompilation: TestGraphState = {
    ...graphState,
    zones: {
      ...graphState.zones,
      [trueBranchZone!.id]: {
        ...trueBranchZone!,
        nodeIds: [groupNode!.id],
      },
    },
  };

  return {
    stateForCompilation,
    switchStartNodeId: switchStartNode!.id,
    groupNodeId: groupNode!.id,
  };
}

function findLoopBlockInsideSwitchTrueBranchGroup(
  executionPlan: ExecutionPlan,
  groupNodeId: string,
): LoopExecutionBlock | undefined {
  const switchBlock = findStepOfKind(executionPlan, 'switch');
  expect(switchBlock).toBeDefined();

  const groupScope = switchBlock!.trueBranchSteps.find(
    (step): step is GroupExecutionScope =>
      step.kind === 'group' && step.groupNodeId === groupNodeId,
  );
  expect(groupScope).toBeDefined();

  return findStepOfKind(groupScope!.innerPlan, 'loop');
}

describe('nodeRunner/compiler — group nested inside a switch branch', () => {
  it('threads the configured maxLoopIterations through the switch branch into the group subtree', () => {
    const { stateForCompilation, groupNodeId } =
      createStateWithGroupedLoopInsideSwitchTrueBranch();

    const configuredMaxLoopIterations = 7;
    const executionPlan = compile<string, string>(
      stateForCompilation,
      {},
      { maxLoopIterations: configuredMaxLoopIterations },
    );

    const loopBlock = findLoopBlockInsideSwitchTrueBranchGroup(
      executionPlan,
      groupNodeId,
    );
    expect(loopBlock).toBeDefined();
    expect(loopBlock!.maxIterations).toBe(configuredMaxLoopIterations);
  });

  it('falls back to the default cap for the nested group when no options are given', () => {
    const { stateForCompilation, groupNodeId } =
      createStateWithGroupedLoopInsideSwitchTrueBranch();

    const executionPlan = compile<string, string>(stateForCompilation, {});

    const loopBlock = findLoopBlockInsideSwitchTrueBranchGroup(
      executionPlan,
      groupNodeId,
    );
    expect(loopBlock).toBeDefined();
    expect(loopBlock!.maxIterations).toBe(DEFAULT_MAX_LOOP_ITERATIONS);
  });

  it('executes the group inside the taken true branch without errors at runtime', async () => {
    const { stateForCompilation, switchStartNodeId, groupNodeId } =
      createStateWithGroupedLoopInsideSwitchTrueBranch();

    // The condition input is unconnected, so the executor reads the inline
    // value persisted on the node data — set it to true so the true branch
    // (which contains the group) is the one that executes. Looked up by name
    // because channel sync shifts handle indices.
    const stateForExecution: TestGraphState = {
      ...stateForCompilation,
      nodes: stateForCompilation.nodes.map((node) => {
        if (node.id !== switchStartNodeId) return node;
        const inputsWithConditionEnabled = node.data.inputs?.map(
          (inputEntry) =>
            'name' in inputEntry && inputEntry.name === 'Condition'
              ? { ...inputEntry, value: true }
              : inputEntry,
        ) as typeof node.data.inputs;
        return {
          ...node,
          data: { ...node.data, inputs: inputsWithConditionEnabled },
        };
      }),
    };

    const executionPlan = compile<string, string>(
      stateForExecution,
      testSourceImplementations,
      { maxLoopIterations: 3 },
    );
    const executionRecord = await execute<string, string>(
      executionPlan,
      testSourceImplementations,
      stateForExecution,
      {
        onNodeStateChange: () => {},
        abortSignal: new AbortController().signal,
      },
    );

    expect(executionRecord.status).toBe('completed');
    expect(executionRecord.errors).toHaveLength(0);

    const switchRecord = [...executionRecord.switchRecords.values()].find(
      (record) => record.switchStartNodeId === switchStartNodeId,
    );
    expect(switchRecord).toBeDefined();
    expect(switchRecord!.branchTaken).toBe(true);

    const groupExecutionObserved =
      executionRecord.groupRecords.size > 0 ||
      executionRecord.steps.some(
        (stepRecord) => stepRecord.nodeId === groupNodeId,
      ) ||
      switchRecord!.stepRecords.some(
        (stepRecord) => stepRecord.nodeId === groupNodeId,
      );
    expect(groupExecutionObserved).toBe(true);
  });
});
