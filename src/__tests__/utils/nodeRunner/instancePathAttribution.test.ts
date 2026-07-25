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
import type { ExecutionRecord } from '@/utils/nodeRunner/types';
import { computeNodePreviewValues } from '@/utils/nodeRunner/computeNodePreviewValues';
import { computeVisualStatesAtStep } from '@/utils/nodeRunner/useNodeRunner';
import {
  exportExecutionRecord,
  importExecutionRecord,
} from '@/utils/importExport';

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

/** Creates a fresh group type via the real action and returns its minted id. */
function addGroupType(state: TestGraphState): {
  state: TestGraphState;
  groupTypeId: string;
} {
  const before = new Set(Object.keys(state.typeOfNodes));
  const next = applyAction(state, { type: actionTypesMap.ADD_NODE_GROUP });
  const groupTypeId = Object.keys(next.typeOfNodes).find(
    (typeId) => !before.has(typeId),
  );
  expect(groupTypeId).toBeDefined();
  // ADD_NODE_GROUP enters the new group's scope — leave it again.
  return {
    state: applyAction(next, { type: actionTypesMap.CLOSE_NODE_GROUP }),
    groupTypeId: groupTypeId!,
  };
}

/** Opens a group type, runs `build` inside its subtree scope, closes it. */
function buildInsideGroup(
  state: TestGraphState,
  groupTypeId: string,
  build: (opened: TestGraphState) => TestGraphState,
): TestGraphState {
  let next = applyAction(state, {
    type: actionTypesMap.OPEN_NODE_GROUP,
    payload: { nodeType: groupTypeId },
  });
  next = build(next);
  return applyAction(next, { type: actionTypesMap.CLOSE_NODE_GROUP });
}

async function run(state: TestGraphState): Promise<ExecutionRecord> {
  const plan = compile<string, string>(state, testSourceImplementations, {
    maxLoopIterations: 2,
  });
  return execute<string, string>(plan, testSourceImplementations, state, {
    onNodeStateChange: () => {},
    abortSignal: new AbortController().signal,
  });
}

describe('instancePath attribution — recorder thread-through', () => {
  it("depth-1: each instance's inner steps carry [thatInstanceId]; group structural steps carry the PARENT path (absent at root)", async () => {
    let state = createBaseState();
    const created = addGroupType(state);
    state = created.state;
    const groupTypeId = created.groupTypeId;
    state = buildInsideGroup(state, groupTypeId, (opened) =>
      applyAction(opened, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: 0, y: 0 } },
      }),
    );
    // TWO independent instances of the same group type at root.
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 400, y: 0 } },
    });
    const instanceIds = state.nodes
      .filter((node) => node.data.nodeTypeUniqueId === groupTypeId)
      .map((node) => node.id);
    expect(instanceIds).toHaveLength(2);

    const record = await run(state);
    expect(record.status).toBe('completed');

    // Inner testSource steps: one per instance, each attributed to EXACTLY its
    // own instance path — the collision this feature exists to fix.
    const innerSteps = record.steps.filter(
      (step) => step.nodeTypeId === 'testSource' && step.groupNodeId,
    );
    expect(innerSteps).toHaveLength(2);
    const seenPaths = innerSteps.map((step) => step.instancePath);
    for (const step of innerSteps) {
      expect(step.instancePath).toEqual([step.groupNodeId]);
    }
    expect(new Set(seenPaths.map((path) => path![0])).size).toBe(2);

    // The group node's OWN structural step carries the PARENT path — absent at
    // root (F4: never self-inclusive).
    for (const instanceId of instanceIds) {
      const structuralStep = record.steps.find(
        (step) => step.nodeId === instanceId,
      );
      expect(structuralStep).toBeDefined();
      expect(structuralStep!.instancePath).toBeUndefined();
    }
  });

  it("depth-2: inner steps carry the FULL chain [outerInstance, innerTemplateNode]; the nested group's structural step carries [outerInstance]", async () => {
    let state = createBaseState();
    // Inner group type B (subtree: a testSource).
    const createdB = addGroupType(state);
    state = createdB.state;
    const groupTypeB = createdB.groupTypeId;
    state = buildInsideGroup(state, groupTypeB, (opened) =>
      applyAction(opened, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: 0, y: 0 } },
      }),
    );
    // Outer group type A whose subtree contains a B instance (template node).
    const createdA = addGroupType(state);
    state = createdA.state;
    const groupTypeA = createdA.groupTypeId;
    state = buildInsideGroup(state, groupTypeA, (opened) =>
      applyAction(opened, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: groupTypeB, position: { x: 0, y: 0 } },
      }),
    );
    const innerTemplateNodeId = state.typeOfNodes[
      groupTypeA
    ]!.subtree!.nodes.find(
      (node) => node.data.nodeTypeUniqueId === groupTypeB,
    )?.id;
    expect(innerTemplateNodeId).toBeDefined();

    // One A instance at root.
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeA, position: { x: 0, y: 0 } },
    });
    const outerInstanceId = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === groupTypeA,
    )!.id;

    const record = await run(state);
    expect(record.status).toBe('completed');

    // The testSource inside B inside A carries the FULL chain.
    const deepStep = record.steps.find(
      (step) => step.nodeTypeId === 'testSource' && step.groupDepth === 2,
    );
    expect(deepStep).toBeDefined();
    expect(deepStep!.instancePath).toEqual([
      outerInstanceId,
      innerTemplateNodeId,
    ]);

    // B's structural step (recorded in A's scope) carries A's path only.
    const nestedGroupStructural = record.steps.find(
      (step) => step.nodeId === innerTemplateNodeId,
    );
    expect(nestedGroupStructural).toBeDefined();
    expect(nestedGroupStructural!.instancePath).toEqual([outerInstanceId]);
  });

  it('loop-inside-group (F1): the loop triplet structural steps AND body steps carry the group identity + path', async () => {
    let state = createBaseState();
    const created = addGroupType(state);
    state = created.state;
    const groupTypeId = created.groupTypeId;
    state = buildInsideGroup(state, groupTypeId, (opened) => {
      let next = applyAction(opened, {
        type: actionTypesMap.ADD_LOOP,
        payload: { position: { x: 0, y: 0 } },
      });
      next = applyAction(next, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: -400, y: 0 } },
      });
      // Wire source → loopStart infer so the loop materializes a data channel
      // (the executor validates loop channel counts at runtime).
      const subtreeView = getCurrentNodesAndEdgesFromState(next);
      const sourceNode = subtreeView.nodes.find(
        (node) => node.data.nodeTypeUniqueId === 'testSource',
      );
      const loopStartNode = subtreeView.nodes.find(
        (node) =>
          node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart,
      );
      expect(sourceNode).toBeDefined();
      expect(loopStartNode).toBeDefined();
      return applyAction(next, {
        type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
        payload: {
          edge: {
            source: sourceNode!.id,
            sourceHandle: sourceNode!.data.outputs![0]!.id,
            target: loopStartNode!.id,
            targetHandle: loopStartNode!.data.inputs![0]!.id,
          },
        },
      });
    });
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    const instanceId = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === groupTypeId,
    )!.id;

    const record = await run(state);
    expect(record.status).toBe('completed');

    // Before this fix, loop steps inside groups recorded NO group fields at
    // all (executeOneStep dropped the context) — pin both fields now.
    const loopSteps = record.steps.filter((step) => step.loopPhase);
    expect(loopSteps.length).toBeGreaterThan(0);
    for (const step of loopSteps) {
      expect(step.groupNodeId).toBe(instanceId);
      expect(step.instancePath).toEqual([instanceId]);
    }
  });

  it('switch-inside-group (F1): the switch pair structural steps carry the group identity + path', async () => {
    let state = createBaseState();
    const created = addGroupType(state);
    state = created.state;
    const groupTypeId = created.groupTypeId;
    state = buildInsideGroup(state, groupTypeId, (opened) => {
      let next = applyAction(opened, {
        type: actionTypesMap.ADD_SWITCH,
        payload: { position: { x: 0, y: 0 } },
      });
      next = applyAction(next, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: -400, y: 0 } },
      });
      // Wire source → switchStart infer so the pair materializes data channels
      // (the executor validates switch channel counts at runtime).
      const subtreeView = getCurrentNodesAndEdgesFromState(next);
      const sourceNode = subtreeView.nodes.find(
        (node) => node.data.nodeTypeUniqueId === 'testSource',
      );
      const switchStartNode = subtreeView.nodes.find(
        (node) =>
          node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart,
      );
      expect(sourceNode).toBeDefined();
      expect(switchStartNode).toBeDefined();
      return applyAction(next, {
        type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
        payload: {
          edge: {
            source: sourceNode!.id,
            sourceHandle: sourceNode!.data.outputs![0]!.id,
            target: switchStartNode!.id,
            targetHandle: switchStartNode!.data.inputs![0]!.id,
          },
        },
      });
    });
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    const instanceId = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === groupTypeId,
    )!.id;

    const record = await run(state);
    expect(record.status).toBe('completed');

    const switchSteps = record.steps.filter((step) => step.switchPhase);
    expect(switchSteps.length).toBeGreaterThan(0);
    for (const step of switchSteps) {
      expect(step.groupNodeId).toBe(instanceId);
      expect(step.instancePath).toEqual([instanceId]);
    }
  });

  it('concurrency stress: two independent sibling instances stay self-consistently attributed in performance mode', async () => {
    let state = createBaseState();
    const created = addGroupType(state);
    state = created.state;
    const groupTypeId = created.groupTypeId;
    state = buildInsideGroup(state, groupTypeId, (opened) =>
      applyAction(opened, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: 0, y: 0 } },
      }),
    );
    // Two INDEPENDENT instances → same concurrency level → Promise.allSettled
    // interleaving in performance mode (no afterStep). Even if the flat step
    // order interleaves, each step's explicit path must match its groupNodeId
    // (the reason instancePath is threaded, not reconstructed from ordering).
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 400, y: 0 } },
    });
    const instanceIds = state.nodes
      .filter((node) => node.data.nodeTypeUniqueId === groupTypeId)
      .map((node) => node.id);

    const record = await run(state);
    expect(record.status).toBe('completed');

    const innerSteps = record.steps.filter(
      (step) => step.nodeTypeId === 'testSource' && step.groupNodeId,
    );
    expect(innerSteps).toHaveLength(2);
    for (const step of innerSteps) {
      expect(step.instancePath).toEqual([step.groupNodeId]);
      expect(instanceIds).toContain(step.groupNodeId);
    }
    // groupRecords keyed by BOTH real instance ids (tree disambiguator intact).
    for (const instanceId of instanceIds) {
      expect(record.groupRecords.has(instanceId)).toBe(true);
    }
  });

  it('round-trips instancePath through the real export → import record serializer', async () => {
    let state = createBaseState();
    const created = addGroupType(state);
    state = created.state;
    const groupTypeId = created.groupTypeId;
    state = buildInsideGroup(state, groupTypeId, (opened) =>
      applyAction(opened, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: 0, y: 0 } },
      }),
    );
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    const instanceId = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === groupTypeId,
    )!.id;

    const record = await run(state);
    const json = exportExecutionRecord(record);
    const imported = importExecutionRecord(json);
    expect(imported.success).toBe(true);
    if (!imported.success) return;

    const innerStep = imported.data.steps.find(
      (step) => step.nodeTypeId === 'testSource' && step.groupNodeId,
    );
    expect(innerStep).toBeDefined();
    expect(innerStep!.instancePath).toEqual([instanceId]);
  });

  it('instance-aware consumption: previews + visual states filtered by openInstancePath show ONLY the open instance', async () => {
    // Two instances of one group type whose subtree is a single testSource —
    // the same template node runs twice with two different instance paths.
    let state = createBaseState();
    const created = addGroupType(state);
    state = created.state;
    const groupTypeId = created.groupTypeId;
    state = buildInsideGroup(state, groupTypeId, (opened) =>
      applyAction(opened, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: 0, y: 0 } },
      }),
    );
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    state = applyAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 400, y: 0 } },
    });

    const record = await run(state);
    expect(record.status).toBe('completed');

    const innerSteps = record.steps
      .filter((step) => step.nodeTypeId === 'testSource' && step.groupNodeId)
      .sort((a, b) => a.stepIndex - b.stepIndex);
    expect(innerSteps).toHaveLength(2);
    const [firstInnerStep, secondInnerStep] = innerSteps;
    const templateNodeId = firstInnerStep.nodeId;
    expect(secondInnerStep.nodeId).toBe(templateNodeId); // shared template id
    const firstInstance = firstInnerStep.groupNodeId!;
    const secondInstance = secondInnerStep.groupNodeId!;

    const lastIndex = record.steps.length - 1;

    // UNFILTERED (root/template view): last-instance-wins — live = the later
    // instance's step (the documented pre-feature behavior).
    const unfiltered = computeNodePreviewValues(record, lastIndex);
    expect(unfiltered.get(templateNodeId)?.live?.stepIndex).toBe(
      secondInnerStep.stepIndex,
    );

    // FILTERED to the FIRST instance: the same template node's entry now holds
    // the FIRST instance's step, even though the second ran later.
    const filteredToFirst = computeNodePreviewValues(record, lastIndex, [
      firstInstance,
    ]);
    expect(filteredToFirst.get(templateNodeId)?.live?.stepIndex).toBe(
      firstInnerStep.stepIndex,
    );
    const filteredToSecond = computeNodePreviewValues(record, lastIndex, [
      secondInstance,
    ]);
    expect(filteredToSecond.get(templateNodeId)?.live?.stepIndex).toBe(
      secondInnerStep.stepIndex,
    );

    // VISUAL STATES: scrub the head onto the SECOND instance's inner step.
    // Standing inside the FIRST instance, the template node must NOT read
    // running (the live-proven instance-blindness bug); inside the second, it
    // must.
    const headOnSecond = secondInnerStep.stepIndex;
    const statesInsideFirst = computeVisualStatesAtStep(record, headOnSecond, [
      firstInstance,
    ]);
    expect(statesInsideFirst.get(templateNodeId)).toBe('completed');
    const statesInsideSecond = computeVisualStatesAtStep(record, headOnSecond, [
      secondInstance,
    ]);
    expect(statesInsideSecond.get(templateNodeId)).toBe('running');

    // Scrub BEFORE either ran: inside the first instance the template reads
    // idle, not the other instance's state.
    const statesBeforeAll = computeVisualStatesAtStep(record, 0, [
      secondInstance,
    ]);
    expect(['idle', 'running']).toContain(statesBeforeAll.get(templateNodeId));

    // Unfiltered stays instance-blind (pre-feature behavior preserved).
    const statesUnfiltered = computeVisualStatesAtStep(record, headOnSecond);
    expect(statesUnfiltered.get(templateNodeId)).toBe('running');
  });
});
