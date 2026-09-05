import { describe, it, expect, vi, type MockInstance } from 'vitest';
import { z } from 'zod';
import {
  mainReducer,
  actionTypesMap,
  type Action,
} from '@/utils/nodeStateManagement/mainReducer';
import {
  makeStateWithAutoInfer,
  type State,
  type SupportedUnderlyingTypes,
} from '@/utils/nodeStateManagement/types';
import {
  loopStartInputInferHandleIndex,
  loopStartOutputInferHandleIndex,
  loopStopInputInferHandleIndex,
  loopStopOutputInferHandleIndex,
  loopEndInputInferHandleIndex,
  standardDataTypes,
  standardNodeTypes,
  standardNodeTypeNamesMap,
} from '@/utils/nodeStateManagement/standardNodes';
import { getCurrentNodesAndEdgesFromState } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import { compile } from '@/utils/nodeRunner/compiler';
import { execute } from '@/utils/nodeRunner/executor';
import {
  ExecutionRecorder,
  structureRecordKey,
} from '@/utils/nodeRunner/executionRecorder';
import type {
  LoopExecutionBlock,
  FunctionImplementation,
  FunctionImplementations,
  ExecutionRecord,
} from '@/utils/nodeRunner/types';
import type { RecorderWarning } from '@/utils/nodeRunner/executionRecorder';
import { standardNodeCountConstraints } from '@/utils';
import {
  sdfDataTypes,
  sdfNodeTypes,
  sdfImplementations,
  type SdfDataTypeId,
  type SdfNodeTypeId,
} from '@/advancedGraphExamples/sdfStudioDefinitions';

/**
 * CONCURRENCY SUITE (Plan A, S4) — the adversarial tests the recorder fix
 * exists to pass. Every concurrency case FIRST asserts the compiled shape
 * (both structures on ONE plan level) so the concurrency is real, and runs
 * with genuinely-async implementations so sibling execution overlaps in
 * wall-clock time. Delays live INSIDE implementations (never as extra
 * upstream nodes, which would shift levels and silently remove the
 * concurrency under test).
 *
 * Assertion rule: membership/topology only — never timing fields, never
 * cross-sibling flat ordering. Happy-path cases also assert ZERO recorder
 * warnings: the fix must succeed by correctness, not by backstop salvage.
 */

function waitForMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Wrap sync implementations so every node call awaits a real delay. */
function delayImplementations<NodeTypeUniqueId extends string>(
  implementations: FunctionImplementations<NodeTypeUniqueId>,
  delayMilliseconds: number,
): FunctionImplementations<NodeTypeUniqueId> {
  const delayed: Record<string, FunctionImplementation> = {};
  for (const [nodeTypeId, candidate] of Object.entries(implementations)) {
    if (typeof candidate !== 'function') continue;
    const implementation = candidate as FunctionImplementation;
    const delayedImplementation: FunctionImplementation = async (
      ...implementationArguments
    ) => {
      await waitForMilliseconds(delayMilliseconds);
      return implementation(...implementationArguments);
    };
    delayed[nodeTypeId] = delayedImplementation;
  }
  return delayed as FunctionImplementations<NodeTypeUniqueId>;
}

// ─────────────────────────────────────────────────────────────────────
// SDF-universe builder (mirrors recorderSequentialPin.test.ts)
// ─────────────────────────────────────────────────────────────────────

type StudioState = State<
  SdfDataTypeId,
  SdfNodeTypeId,
  SupportedUnderlyingTypes,
  z.ZodType
>;

function createSdfBuilder() {
  let state: StudioState = makeStateWithAutoInfer<
    SdfDataTypeId,
    SdfNodeTypeId,
    SupportedUnderlyingTypes,
    z.ZodType
  >({
    dataTypes: sdfDataTypes,
    typeOfNodes: sdfNodeTypes,
    nodes: [],
    edges: [],
    allowedConversionsBetweenDataTypes: {
      number: { loopInfer: true },
      loopInfer: { number: true },
    },
    allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
    enableComplexTypeChecking: true,
    enableTypeInference: true,
    enableCycleChecking: true,
    enableRecursionChecking: true,
    nodeCountConstraints: standardNodeCountConstraints,
  });

  function addNode(
    nodeType: SdfNodeTypeId,
    position: { x: number; y: number },
  ): string {
    state = mainReducer<
      SdfDataTypeId,
      SdfNodeTypeId,
      SupportedUnderlyingTypes,
      z.ZodType
    >(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: nodeType, position },
    });
    return state.nodes[state.nodes.length - 1].id;
  }
  function findNode(nodeId: string) {
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Node "${nodeId}" not found`);
    return node;
  }
  function inputHandleId(nodeId: string, handleIndex: number): string {
    const handle = findNode(nodeId).data.inputs?.[handleIndex];
    const handleId = handle && 'id' in handle ? handle.id : undefined;
    if (!handleId)
      throw new Error(`Input handle ${handleIndex} missing on "${nodeId}"`);
    return handleId;
  }
  function outputHandleId(nodeId: string, handleIndex: number): string {
    const handleId = findNode(nodeId).data.outputs?.[handleIndex]?.id;
    if (!handleId)
      throw new Error(`Output handle ${handleIndex} missing on "${nodeId}"`);
    return handleId;
  }
  function connectOrThrow(
    label: string,
    sourceNodeId: string,
    sourceHandleId: string,
    targetNodeId: string,
    targetHandleId: string,
  ): void {
    const edgeCountBefore = state.edges.length;
    state = mainReducer<
      SdfDataTypeId,
      SdfNodeTypeId,
      SupportedUnderlyingTypes,
      z.ZodType
    >(state, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: sourceNodeId,
          sourceHandle: sourceHandleId,
          target: targetNodeId,
          targetHandle: targetHandleId,
        },
      },
    });
    if (state.edges.length !== edgeCountBefore + 1) {
      throw new Error(`edge silently rejected: ${label}`);
    }
  }
  function setInputValue(
    nodeId: string,
    handleIndex: number,
    value: number | string,
  ): void {
    state = {
      ...state,
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId || !node.data.inputs) return node;
        const inputs = node.data.inputs.map((input, index) => {
          if (index !== handleIndex || !('type' in input)) return input;
          if (input.type === 'number' && typeof value === 'number')
            return { ...input, value };
          if (input.type === 'string' && typeof value === 'string')
            return { ...input, value };
          return input;
        });
        return { ...node, data: { ...node.data, inputs } };
      }),
    };
  }

  /**
   * A self-terminating counting loop (i < 2) whose body is a CHAIN of
   * `bodyChainLength` Math(+1) nodes — chain length controls per-iteration
   * duration under a shared delayed `math` implementation, giving sibling
   * loops deterministic speed asymmetry without extra upstream levels.
   */
  function buildCountingLoop(
    xOffset: number,
    yOffset: number,
    bodyChainLength: number,
  ) {
    const initId = addNode('math', { x: xOffset, y: yOffset });
    const loopStartId = addNode('loopStart', { x: xOffset + 200, y: yOffset });
    const bodyChainIds: string[] = [];
    for (let chainIndex = 0; chainIndex < bodyChainLength; chainIndex++) {
      const chainNodeId = addNode('math', {
        x: xOffset + 400 + chainIndex * 200,
        y: yOffset,
      });
      if (chainIndex === bodyChainLength - 1) {
        setInputValue(chainNodeId, 1, 1); // final chain node adds 1
      }
      bodyChainIds.push(chainNodeId);
    }
    const compareId = addNode('compare', {
      x: xOffset + 400,
      y: yOffset + 250,
    });
    setInputValue(compareId, 1, 2);
    setInputValue(compareId, 2, 'Less Than');
    const loopStopId = addNode('loopStop', {
      x: xOffset + 400 + bodyChainLength * 200,
      y: yOffset,
    });
    const loopEndId = addNode('loopEnd', {
      x: xOffset + 600 + bodyChainLength * 200,
      y: yOffset,
    });

    connectOrThrow(
      'bind start-stop',
      loopStartId,
      outputHandleId(loopStartId, 0),
      loopStopId,
      inputHandleId(loopStopId, 0),
    );
    connectOrThrow(
      'bind stop-end',
      loopStopId,
      outputHandleId(loopStopId, 0),
      loopEndId,
      inputHandleId(loopEndId, 0),
    );
    connectOrThrow(
      'init → start.infer',
      initId,
      outputHandleId(initId, 0),
      loopStartId,
      inputHandleId(loopStartId, loopStartInputInferHandleIndex),
    );
    let previousOutId = loopStartId;
    let previousOutHandle = outputHandleId(
      loopStartId,
      loopStartOutputInferHandleIndex,
    );
    for (const chainNodeId of bodyChainIds) {
      connectOrThrow(
        'chain link',
        previousOutId,
        previousOutHandle,
        chainNodeId,
        inputHandleId(chainNodeId, 0),
      );
      previousOutId = chainNodeId;
      previousOutHandle = outputHandleId(chainNodeId, 0);
    }
    connectOrThrow(
      'chain → stop.infer',
      previousOutId,
      previousOutHandle,
      loopStopId,
      inputHandleId(loopStopId, loopStopInputInferHandleIndex),
    );
    connectOrThrow(
      'start.infer-out → cmp.A',
      loopStartId,
      outputHandleId(loopStartId, loopStartOutputInferHandleIndex),
      compareId,
      inputHandleId(compareId, 0),
    );
    connectOrThrow(
      'cmp → stop.cond',
      compareId,
      outputHandleId(compareId, 0),
      loopStopId,
      inputHandleId(loopStopId, 1),
    );
    connectOrThrow(
      'stop.infer-out → end.infer-in',
      loopStopId,
      outputHandleId(loopStopId, loopStopOutputInferHandleIndex),
      loopEndId,
      inputHandleId(loopEndId, loopEndInputInferHandleIndex),
    );

    return {
      initId,
      loopStartId,
      loopStopId,
      loopEndId,
      bodyChainIds,
      compareId,
    };
  }

  return {
    getState: () => state,
    addNode,
    connectOrThrow,
    inputHandleId,
    outputHandleId,
    setInputValue,
    buildCountingLoop,
  };
}

async function runSdf(
  state: StudioState,
  implementations: FunctionImplementations<SdfNodeTypeId>,
  onRecorderWarning?: (warning: RecorderWarning) => void,
  abortSignal?: AbortSignal,
  maxLoopIterations = 10,
) {
  const plan = compile<
    SdfDataTypeId,
    SdfNodeTypeId,
    SupportedUnderlyingTypes,
    z.ZodType
  >(state, implementations, { maxLoopIterations });
  const record = await execute<
    SdfDataTypeId,
    SdfNodeTypeId,
    SupportedUnderlyingTypes,
    z.ZodType
  >(plan, implementations, state, {
    onNodeStateChange: () => {},
    abortSignal: abortSignal ?? new AbortController().signal,
    onRecorderWarning,
  });
  return { plan, record };
}

/** Assert both given loop blocks sit on ONE compiled level (real concurrency). */
function assertSameLevelLoops(
  plan: { levels: ReadonlyArray<ReadonlyArray<{ kind: string }>> },
  loopStartIds: string[],
): void {
  const levelWithLoops = plan.levels.find((level) =>
    level.some(
      (step) =>
        step.kind === 'loop' &&
        loopStartIds.includes((step as LoopExecutionBlock).loopStartNodeId),
    ),
  );
  expect(levelWithLoops).toBeDefined();
  const idsOnLevel = levelWithLoops!
    .filter((step): step is LoopExecutionBlock => step.kind === 'loop')
    .map((block) => block.loopStartNodeId);
  for (const loopStartId of loopStartIds) {
    expect(idsOnLevel).toContain(loopStartId);
  }
}

describe('recorder concurrency — sibling loops (S4 case 1)', () => {
  it('two concurrent sibling loops both record top-level, iteration-pure, nothing nested, zero warnings', async () => {
    const builder = createSdfBuilder();
    // FAST loop: 1-node body chain; SLOW loop: 3-node chain — deterministic
    // completion asymmetry under one shared delayed `math` implementation.
    const fastLoop = builder.buildCountingLoop(0, 0, 1);
    const slowLoop = builder.buildCountingLoop(0, 600, 3);
    // Root-level sibling step running DURING the loops (own upstream so it
    // lands on the loops' level, not level 0).
    const siblingFeedId = builder.addNode('math', { x: 0, y: 1200 });
    const siblingId = builder.addNode('math', { x: 200, y: 1200 });
    builder.connectOrThrow(
      'sibling feed',
      siblingFeedId,
      builder.outputHandleId(siblingFeedId, 0),
      siblingId,
      builder.inputHandleId(siblingId, 0),
    );

    const warnings: RecorderWarning[] = [];
    const delayed = delayImplementations(sdfImplementations, 25);
    const { plan, record } = await runSdf(
      builder.getState(),
      delayed,
      (warning) => warnings.push(warning),
    );

    assertSameLevelLoops(plan, [fastLoop.loopStartId, slowLoop.loopStartId]);

    expect(record.status).toBe('completed');
    expect(record.errors).toHaveLength(0);
    expect(warnings).toEqual([]); // correctness, not salvage

    // BOTH loops top-level — the AU-02 fix.
    const loopKeys = Array.from(record.loopRecords.keys()).sort();
    expect(loopKeys).toEqual(
      [
        structureRecordKey([], fastLoop.loopStartId),
        structureRecordKey([], slowLoop.loopStartId),
      ].sort(),
    );

    for (const loop of [fastLoop, slowLoop]) {
      const loopRecord = record.loopRecords.get(
        structureRecordKey([], loop.loopStartId),
      )!;
      expect(loopRecord.totalIterations).toBeGreaterThanOrEqual(2);
      const ownNodeIds = new Set([
        loop.loopStartId,
        loop.loopStopId,
        loop.loopEndId,
        loop.compareId, // the condition node is a body-region member
        ...loop.bodyChainIds,
      ]);
      for (const iteration of loopRecord.iterations) {
        // Iteration purity: no sibling-loop or root-sibling steps absorbed.
        for (const step of iteration.stepRecords) {
          expect(ownNodeIds.has(step.nodeId)).toBe(true);
        }
        expect(Array.from(iteration.nestedLoopRecords.keys())).toEqual([]);
      }
    }

    // The root sibling ran and stayed OUT of every iteration record.
    expect(record.steps.some((step) => step.nodeId === siblingId)).toBe(true);
    for (const loopRecord of record.loopRecords.values()) {
      for (const iteration of loopRecord.iterations) {
        expect(
          iteration.stepRecords.some((step) => step.nodeId === siblingId),
        ).toBe(false);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Standard-universe group helpers (mirror instancePathAttribution.test.ts)
// ─────────────────────────────────────────────────────────────────────

type GroupGraphState = State<string, string>;

function createStandardGroupState(): GroupGraphState {
  return {
    dataTypes: {
      ...standardDataTypes,
      testString: {
        name: 'Test String',
        underlyingType: 'string',
        color: '#4A90E2',
      },
    } as GroupGraphState['dataTypes'],
    typeOfNodes: {
      ...standardNodeTypes,
      testSource: {
        name: 'Test Source',
        headerColor: '#2E86AB',
        inputs: [],
        outputs: [{ name: 'Out', dataType: 'testString' }],
      },
    } as GroupGraphState['typeOfNodes'],
    nodes: [],
    edges: [],
    enableTypeInference: true,
  };
}

function applyGroupAction(
  state: GroupGraphState,
  action: Action<string, string>,
): GroupGraphState {
  return mainReducer<string, string>(state, action);
}

function addGroupType(state: GroupGraphState): {
  state: GroupGraphState;
  groupTypeId: string;
} {
  const before = new Set(Object.keys(state.typeOfNodes));
  const next = applyGroupAction(state, {
    type: actionTypesMap.ADD_NODE_GROUP,
  });
  const groupTypeId = Object.keys(next.typeOfNodes).find(
    (typeId) => !before.has(typeId),
  )!;
  expect(groupTypeId).toBeDefined();
  return {
    state: applyGroupAction(next, { type: actionTypesMap.CLOSE_NODE_GROUP }),
    groupTypeId,
  };
}

function buildInsideGroup(
  state: GroupGraphState,
  groupTypeId: string,
  build: (opened: GroupGraphState) => GroupGraphState,
): GroupGraphState {
  let next = applyGroupAction(state, {
    type: actionTypesMap.OPEN_NODE_GROUP,
    payload: { nodeType: groupTypeId },
  });
  next = build(next);
  return applyGroupAction(next, { type: actionTypesMap.CLOSE_NODE_GROUP });
}

/** Group type whose subtree contains a LOOP fed by a testSource. */
function buildLoopBearingGroupType(state: GroupGraphState): {
  state: GroupGraphState;
  groupTypeId: string;
  templateLoopStartId: string;
  templateLoopStopId: string;
  templateLoopEndId: string;
} {
  const created = addGroupType(state);
  let nextState = created.state;
  const groupTypeId = created.groupTypeId;
  nextState = buildInsideGroup(nextState, groupTypeId, (opened) => {
    let next = applyGroupAction(opened, {
      type: actionTypesMap.ADD_LOOP,
      payload: { position: { x: 0, y: 0 } },
    });
    next = applyGroupAction(next, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: 'testSource', position: { x: -400, y: 0 } },
    });
    const view = getCurrentNodesAndEdgesFromState(next);
    const sourceNode = view.nodes.find(
      (node) => node.data.nodeTypeUniqueId === 'testSource',
    )!;
    const loopStartNode = view.nodes.find(
      (node) =>
        node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart,
    )!;
    // F4(8): ASSERT the subtree edge landed. Reducer rejections are silent,
    // and subtree edges live in the scoped view rather than `state.edges`, so
    // the usual connectOrThrow guard does not see them — without this the
    // suite could be exercising a loop with no carry wired at all.
    const edgesBefore = getCurrentNodesAndEdgesFromState(next).edges.length;
    const connected = applyGroupAction(next, {
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: {
        edge: {
          source: sourceNode.id,
          sourceHandle: sourceNode.data.outputs![0]!.id,
          target: loopStartNode.id,
          targetHandle: loopStartNode.data.inputs![0]!.id,
        },
      },
    });
    expect(getCurrentNodesAndEdgesFromState(connected).edges.length).toBe(
      edgesBefore + 1,
    );
    return connected;
  });
  const subtreeNodes = nextState.typeOfNodes[groupTypeId]!.subtree!.nodes;
  const templateNodeIdOfType = (nodeTypeUniqueId: string): string =>
    subtreeNodes.find(
      (node) => node.data.nodeTypeUniqueId === nodeTypeUniqueId,
    )!.id;
  return {
    state: nextState,
    groupTypeId,
    templateLoopStartId: templateNodeIdOfType(
      standardNodeTypeNamesMap.loopStart,
    ),
    templateLoopStopId: templateNodeIdOfType(standardNodeTypeNamesMap.loopStop),
    templateLoopEndId: templateNodeIdOfType(standardNodeTypeNamesMap.loopEnd),
  };
}

async function runGroups(
  state: GroupGraphState,
  implementations: FunctionImplementations<string>,
  onRecorderWarning?: (warning: RecorderWarning) => void,
): Promise<ExecutionRecord> {
  const plan = compile<string, string>(state, implementations, {
    maxLoopIterations: 2,
  });
  return execute<string, string>(plan, implementations, state, {
    onNodeStateChange: () => {},
    abortSignal: new AbortController().signal,
    onRecorderWarning,
  });
}

describe('recorder concurrency — same-template twin groups (S4 cases 2, 3, 7)', () => {
  it('case 2: two CONCURRENT instances of one loop-bearing group type each keep their own complete LoopRecord', async () => {
    const built = buildLoopBearingGroupType(createStandardGroupState());
    let state = built.state;
    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: built.groupTypeId, position: { x: 0, y: 0 } },
    });
    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: built.groupTypeId, position: { x: 400, y: 0 } },
    });
    const instanceIds = state.nodes
      .filter((node) => node.data.nodeTypeUniqueId === built.groupTypeId)
      .map((node) => node.id);
    expect(instanceIds).toHaveLength(2);

    const warnings: RecorderWarning[] = [];
    const record = await runGroups(
      state,
      {
        testSource: async () => {
          await waitForMilliseconds(40); // force scope overlap
          return new Map<string, unknown>([['Out', 'sample-value']]);
        },
      },
      (warning) => warnings.push(warning),
    );

    expect(record.status).toBe('completed');
    expect(record.errors).toHaveLength(0);
    expect(warnings).toEqual([]);

    // THE A-1 oracle: each instance's innerRecord carries ITS OWN complete
    // loop record under the (shared) template loopStart id — no merge, no
    // loss, no cross-instance steps.
    for (const instanceId of instanceIds) {
      const groupRecord = record.groupRecords.get(
        structureRecordKey([], instanceId),
      );
      expect(groupRecord).toBeDefined();
      const innerRecord = groupRecord!.innerRecord;
      expect(Array.from(innerRecord.loopRecords.keys())).toEqual([
        structureRecordKey([instanceId], built.templateLoopStartId),
      ]);
      // FORMAT pin (F4(1)) — written literally, not via the SUT's own key
      // function, so a format change cannot pass by moving both sides.
      expect(Array.from(innerRecord.loopRecords.keys())).toEqual([
        `["${instanceId}","${built.templateLoopStartId}"]`,
      ]);
      const innerLoop = innerRecord.loopRecords.get(
        structureRecordKey([instanceId], built.templateLoopStartId),
      )!;
      expect(innerLoop.totalIterations).toBeGreaterThanOrEqual(1);
      // F4(9): the record describes the INNER triplet, not the outer graph —
      // all three template ids, and the identity read structurally.
      expect(innerLoop.loopStructureId).toBe(built.templateLoopStartId);
      expect(innerLoop.loopStartNodeId).toBe(built.templateLoopStartId);
      expect(innerLoop.loopStopNodeId).toBe(built.templateLoopStopId);
      expect(innerLoop.loopEndNodeId).toBe(built.templateLoopEndId);
      expect(innerLoop.ownerInstancePath).toEqual([instanceId]);
      for (const step of innerRecord.steps) {
        expect(step.instancePath?.[0]).toBe(instanceId);
      }
    }
  });

  /**
   * F4(2) — DEPTH-2 NESTING PIN: the "works at any number of recursive
   * nesting levels" guarantee, stated as a decision (Q-C2).
   *
   *   root ─┬─ A instance a1 ─┐
   *         └─ A instance a2 ─┴─ subtree: B instance b ─ subtree: loop L
   *
   * `b` and `L` are TEMPLATE ids — byte-identical inside both a1 and a2.
   * Only the full path separates the two executions, so this is the case
   * every id-based or partially-qualified scheme gets wrong.
   */
  it('case 2b: TWO instances of a group whose subtree holds another group holding a loop key at full depth', async () => {
    // B: a group type whose subtree holds a loop.
    const innerGroup = buildLoopBearingGroupType(createStandardGroupState());
    // A: a group type whose subtree holds ONE instance of B.
    const outerCreated = addGroupType(innerGroup.state);
    const outerGroupTypeId = outerCreated.groupTypeId;
    let state = buildInsideGroup(
      outerCreated.state,
      outerGroupTypeId,
      (opened) =>
        applyGroupAction(opened, {
          type: actionTypesMap.ADD_NODE,
          payload: {
            type: innerGroup.groupTypeId,
            position: { x: 0, y: 0 },
          },
        }),
    );

    // The B-instance id INSIDE A's subtree — itself a template id, shared by
    // every instance of A.
    const templateInnerInstanceId = state.typeOfNodes[
      outerGroupTypeId
    ]!.subtree!.nodes.find(
      (node) => node.data.nodeTypeUniqueId === innerGroup.groupTypeId,
    )!.id;

    for (const x of [0, 400]) {
      state = applyGroupAction(state, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: outerGroupTypeId, position: { x, y: 0 } },
      });
    }
    const outerInstanceIds = state.nodes
      .filter((node) => node.data.nodeTypeUniqueId === outerGroupTypeId)
      .map((node) => node.id);
    expect(outerInstanceIds).toHaveLength(2);

    const warnings: RecorderWarning[] = [];
    const record = await runGroups(
      state,
      {
        testSource: async () => {
          await waitForMilliseconds(40); // force the two A scopes to overlap
          return new Map<string, unknown>([['Out', 'sample-value']]);
        },
      },
      (warning) => warnings.push(warning),
    );

    expect(record.status).toBe('completed');
    expect(record.errors).toHaveLength(0);
    expect(warnings).toEqual([]);

    const expectedLoopKeys = outerInstanceIds.map((outerInstanceId) =>
      structureRecordKey(
        [outerInstanceId, templateInnerInstanceId],
        innerGroup.templateLoopStartId,
      ),
    );

    // FORMAT pin, written literally rather than through the SUT's own key
    // function — a change to the key format cannot pass by changing both
    // sides at once.
    expect(expectedLoopKeys[0]).toBe(
      `["${outerInstanceIds[0]}","${templateInnerInstanceId}","${innerGroup.templateLoopStartId}"]`,
    );

    // TWO distinct depth-2 loop records, one per outer instance.
    expect(Array.from(record.loopRecords.keys()).sort()).toEqual(
      [...expectedLoopKeys].sort(),
    );

    for (const [index, outerInstanceId] of outerInstanceIds.entries()) {
      // Identity is readable structurally, not just from the key.
      const loopRecord = record.loopRecords.get(expectedLoopKeys[index]!)!;
      expect(loopRecord.ownerInstancePath).toEqual([
        outerInstanceId,
        templateInnerInstanceId,
      ]);
      expect(loopRecord.loopStructureId).toBe(innerGroup.templateLoopStartId);

      // The outer scope sees BOTH the nested group record and the loop two
      // levels down — scoped copies keep absolute keys, so one resolver call
      // works at every depth.
      const outerRecord = record.groupRecords.get(
        structureRecordKey([], outerInstanceId),
      );
      expect(outerRecord).toBeDefined();
      expect(Array.from(outerRecord!.innerRecord.groupRecords.keys())).toEqual([
        structureRecordKey([outerInstanceId], templateInnerInstanceId),
      ]);
      expect(Array.from(outerRecord!.innerRecord.loopRecords.keys())).toEqual([
        expectedLoopKeys[index],
      ]);

      // And the innermost scope carries it too.
      const innerRecord = outerRecord!.innerRecord.groupRecords.get(
        structureRecordKey([outerInstanceId], templateInnerInstanceId),
      )!;
      expect(Array.from(innerRecord.innerRecord.loopRecords.keys())).toEqual([
        expectedLoopKeys[index],
      ]);
      // Every step inside the innermost scope is attributed to THIS path.
      for (const step of innerRecord.innerRecord.steps) {
        expect(step.instancePath).toEqual([
          outerInstanceId,
          templateInnerInstanceId,
        ]);
      }
    }
  });

  it('case 3: an error on the SHARED template node attributes to exactly one instance (identity, not nodeId)', async () => {
    // Group whose subtree is a single testSource; the impl throws on its
    // FIRST call only ⇒ exactly one instance errors, the other succeeds —
    // with IDENTICAL template node ids across both instances.
    let state = createStandardGroupState();
    const created = addGroupType(state);
    state = created.state;
    const groupTypeId = created.groupTypeId;
    state = buildInsideGroup(state, groupTypeId, (opened) =>
      applyGroupAction(opened, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: 0, y: 0 } },
      }),
    );
    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 400, y: 0 } },
    });
    const instanceIds = state.nodes
      .filter((node) => node.data.nodeTypeUniqueId === groupTypeId)
      .map((node) => node.id);

    let callCount = 0;
    const warnings: RecorderWarning[] = [];
    const record = await runGroups(
      state,
      {
        testSource: async () => {
          const isFirstCall = callCount === 0;
          callCount += 1;
          await waitForMilliseconds(30);
          if (isFirstCall) {
            throw new Error('S4 case 3: first-instance failure');
          }
          return new Map<string, unknown>([['Out', 'sample-value']]);
        },
      },
      (warning) => warnings.push(warning),
    );

    expect(warnings).toEqual([]);
    // Outer record: the inner error + exactly one group wrapper error.
    expect(record.errors.length).toBe(2);

    const erroredInner = instanceIds.filter(
      (instanceId) =>
        record.groupRecords.get(structureRecordKey([], instanceId))!.innerRecord
          .status === 'errored',
    );
    const cleanInner = instanceIds.filter(
      (instanceId) =>
        record.groupRecords.get(structureRecordKey([], instanceId))!.innerRecord
          .status === 'completed',
    );
    expect(erroredInner).toHaveLength(1);
    expect(cleanInner).toHaveLength(1);
    // The errored instance's innerRecord holds EXACTLY the one error; the
    // clean instance's holds none — nodeId-based attribution would have
    // smeared it across both (shared template node id).
    expect(
      record.groupRecords.get(structureRecordKey([], erroredInner[0]))!
        .innerRecord.errors,
    ).toHaveLength(1);
    expect(
      record.groupRecords.get(structureRecordKey([], cleanInner[0]))!
        .innerRecord.errors,
    ).toHaveLength(0);
  });

  it('case 7: SEQUENTIAL same-template twins — the second innerRecord also keeps its structure records', async () => {
    // Sequentialized by running the same state twice? No — two instances
    // chained level-wise is complex in the standard universe; instead run
    // instance-after-instance via two levels: feed instance 2's execution
    // AFTER instance 1 by giving instance 2 an upstream dependency… the
    // standard testSource group has no data handles, so force sequential
    // execution with SYNC implementations and afterStep-free instant mode
    // is not guaranteed. Honest sequential shape: run the SAME graph with
    // ZERO delay — instance scopes then complete in creation order without
    // overlap (each inner plan is fully synchronous, so each allSettled
    // callback runs to completion before yielding).
    const built = buildLoopBearingGroupType(createStandardGroupState());
    let state = built.state;
    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: built.groupTypeId, position: { x: 0, y: 0 } },
    });
    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: built.groupTypeId, position: { x: 400, y: 0 } },
    });
    const instanceIds = state.nodes
      .filter((node) => node.data.nodeTypeUniqueId === built.groupTypeId)
      .map((node) => node.id);

    const warnings: RecorderWarning[] = [];
    const record = await runGroups(
      state,
      {
        testSource: () => new Map<string, unknown>([['Out', 'sample-value']]),
      },
      (warning) => warnings.push(warning),
    );

    expect(record.status).toBe('completed');
    expect(warnings).toEqual([]);
    // BOTH innerRecords carry the template loop — before the fix the
    // second instance's since-start filter lost it (bare-key already seen).
    for (const instanceId of instanceIds) {
      const innerRecord = record.groupRecords.get(
        structureRecordKey([], instanceId),
      )!.innerRecord;
      expect(Array.from(innerRecord.loopRecords.keys())).toEqual([
        structureRecordKey([instanceId], built.templateLoopStartId),
      ]);
    }
  });
});

describe('recorder concurrency — nested cap + abort paths (S4 cases 4, 6)', () => {
  it('case 4: a nested loop exceeding maxIterations routes its post-iteration error steps into the PARENT iteration', async () => {
    // Nested topology (mirrors the sequential pin): outer counts i<2; the
    // INNER compare targets 999 so the inner loop always exceeds the cap.
    const builder = createSdfBuilder();
    const {
      addNode,
      connectOrThrow,
      inputHandleId,
      outputHandleId,
      setInputValue,
    } = builder;

    const initId = addNode('math', { x: 0, y: 0 });
    const outerStartId = addNode('loopStart', { x: 200, y: 0 });
    const bridgeInId = addNode('math', { x: 400, y: 0 });
    const innerStartId = addNode('loopStart', { x: 600, y: 0 });
    const innerIncrementId = addNode('math', { x: 800, y: 0 });
    setInputValue(innerIncrementId, 1, 1);
    const innerCompareId = addNode('compare', { x: 800, y: 220 });
    setInputValue(innerCompareId, 1, 999); // never false ⇒ cap exceeded
    setInputValue(innerCompareId, 2, 'Less Than');
    const innerStopId = addNode('loopStop', { x: 1000, y: 0 });
    const innerEndId = addNode('loopEnd', { x: 1200, y: 0 });
    const bridgeOutId = addNode('math', { x: 1400, y: 0 });
    setInputValue(bridgeOutId, 1, 1);
    const outerCompareId = addNode('compare', { x: 400, y: 300 });
    setInputValue(outerCompareId, 1, 2);
    setInputValue(outerCompareId, 2, 'Less Than');
    const outerStopId = addNode('loopStop', { x: 1600, y: 0 });
    const outerEndId = addNode('loopEnd', { x: 1800, y: 0 });

    connectOrThrow(
      'A bind1',
      outerStartId,
      outputHandleId(outerStartId, 0),
      outerStopId,
      inputHandleId(outerStopId, 0),
    );
    connectOrThrow(
      'A bind2',
      outerStopId,
      outputHandleId(outerStopId, 0),
      outerEndId,
      inputHandleId(outerEndId, 0),
    );
    connectOrThrow(
      'B bind1',
      innerStartId,
      outputHandleId(innerStartId, 0),
      innerStopId,
      inputHandleId(innerStopId, 0),
    );
    connectOrThrow(
      'B bind2',
      innerStopId,
      outputHandleId(innerStopId, 0),
      innerEndId,
      inputHandleId(innerEndId, 0),
    );
    connectOrThrow(
      'init→A',
      initId,
      outputHandleId(initId, 0),
      outerStartId,
      inputHandleId(outerStartId, loopStartInputInferHandleIndex),
    );
    connectOrThrow(
      'A→M1',
      outerStartId,
      outputHandleId(outerStartId, loopStartOutputInferHandleIndex),
      bridgeInId,
      inputHandleId(bridgeInId, 0),
    );
    connectOrThrow(
      'M1→B',
      bridgeInId,
      outputHandleId(bridgeInId, 0),
      innerStartId,
      inputHandleId(innerStartId, loopStartInputInferHandleIndex),
    );
    connectOrThrow(
      'B→Binc',
      innerStartId,
      outputHandleId(innerStartId, loopStartOutputInferHandleIndex),
      innerIncrementId,
      inputHandleId(innerIncrementId, 0),
    );
    connectOrThrow(
      'Binc→B.stop',
      innerIncrementId,
      outputHandleId(innerIncrementId, 0),
      innerStopId,
      inputHandleId(innerStopId, loopStopInputInferHandleIndex),
    );
    connectOrThrow(
      'B→Bcmp',
      innerStartId,
      outputHandleId(innerStartId, loopStartOutputInferHandleIndex),
      innerCompareId,
      inputHandleId(innerCompareId, 0),
    );
    connectOrThrow(
      'Bcmp→cond',
      innerCompareId,
      outputHandleId(innerCompareId, 0),
      innerStopId,
      inputHandleId(innerStopId, 1),
    );
    connectOrThrow(
      'B.stop→B.end',
      innerStopId,
      outputHandleId(innerStopId, loopStopOutputInferHandleIndex),
      innerEndId,
      inputHandleId(innerEndId, loopEndInputInferHandleIndex),
    );
    connectOrThrow(
      'B.end→M2',
      innerEndId,
      outputHandleId(innerEndId, 0),
      bridgeOutId,
      inputHandleId(bridgeOutId, 0),
    );
    connectOrThrow(
      'M2→A.stop',
      bridgeOutId,
      outputHandleId(bridgeOutId, 0),
      outerStopId,
      inputHandleId(outerStopId, loopStopInputInferHandleIndex),
    );
    connectOrThrow(
      'A→Acmp',
      outerStartId,
      outputHandleId(outerStartId, loopStartOutputInferHandleIndex),
      outerCompareId,
      inputHandleId(outerCompareId, 0),
    );
    connectOrThrow(
      'Acmp→cond',
      outerCompareId,
      outputHandleId(outerCompareId, 0),
      outerStopId,
      inputHandleId(outerStopId, 1),
    );
    connectOrThrow(
      'A.stop→A.end',
      outerStopId,
      outputHandleId(outerStopId, loopStopOutputInferHandleIndex),
      outerEndId,
      inputHandleId(outerEndId, loopEndInputInferHandleIndex),
    );

    const warnings: RecorderWarning[] = [];
    const { record } = await runSdf(
      builder.getState(),
      sdfImplementations,
      (warning) => warnings.push(warning),
      undefined,
      3, // inner cap: exceeded on every outer iteration
    );

    expect(warnings).toEqual([]); // nothing orphaned — errors are recorded, not lost
    expect(record.errors.length).toBeGreaterThan(0);

    const outerRecord = record.loopRecords.get(
      structureRecordKey([], outerStartId),
    )!;
    expect(outerRecord).toBeDefined();
    expect(outerRecord.iterations.length).toBeGreaterThanOrEqual(1);
    const firstIteration = outerRecord.iterations[0];

    // The inner loop's record exists under the parent iteration, capped.
    const innerRecord = firstIteration.nestedLoopRecords.get(
      structureRecordKey([], innerStartId),
    )!;
    expect(innerRecord).toBeDefined();
    expect(innerRecord.totalIterations).toBe(3);

    // THE fallback oracle (the REAL consumers of the parent-field routing):
    // the inner loop's POST-iteration error steps — recorded after its last
    // completeLoopIteration deleted the pending entry — land in the PARENT
    // iteration's stepRecords via step.parentLoopStructureId.
    const parentStepNodeIds = firstIteration.stepRecords.map(
      (step) => step.nodeId,
    );
    const erroredInnerSteps = firstIteration.stepRecords.filter(
      (step) =>
        (step.nodeId === innerStopId || step.nodeId === innerEndId) &&
        step.status === 'errored',
    );
    expect(erroredInnerSteps.length).toBeGreaterThan(0);
    expect(parentStepNodeIds).toContain(innerStopId);
  });

  it('case 6a: aborting mid-run with two concurrent sibling loops keeps BOTH partial records, zero warnings', async () => {
    const builder = createSdfBuilder();
    const fastLoop = builder.buildCountingLoop(0, 0, 1);
    const slowLoop = builder.buildCountingLoop(0, 600, 3);

    const warnings: RecorderWarning[] = [];
    const abortController = new AbortController();
    // DETERMINISTIC abort (F4(3)): fire from INSIDE an implementation once a
    // fixed number of body nodes have run, so the cancel lands at the same
    // point in the execution every time. A wall-clock `setTimeout` raced the
    // run and made the case load-sensitive.
    let mathCalls = 0;
    const delayed = delayImplementations(
      {
        ...sdfImplementations,
        math: (...args: Parameters<FunctionImplementation>) => {
          mathCalls++;
          if (mathCalls === 4) abortController.abort();
          return (sdfImplementations.math as FunctionImplementation)(...args);
        },
      } as FunctionImplementations<SdfNodeTypeId>,
      25,
    );
    const { record } = await runSdf(
      builder.getState(),
      delayed,
      (warning) => warnings.push(warning),
      abortController.signal,
    );

    expect(mathCalls).toBeGreaterThanOrEqual(4); // the abort really fired
    expect(record.status).toBe('cancelled');
    // No orphaned recorder state on a genuine cancel: the executors complete
    // their structures on every abort path, so the backstop stays silent.
    expect(warnings).toEqual([]);
    // Both loops began (same synchronous level prefix) ⇒ both records exist
    // top-level with whatever iterations completed before the abort.
    // NOTE (pre-existing AU-06, flagged not fixed): a cancelled run may
    // carry a spurious "Loop exceeded maximum iterations" error when the
    // abort lands after a condition-true iteration — record.errors is
    // deliberately NOT asserted empty here.
    const loopKeys = Array.from(record.loopRecords.keys()).sort();
    expect(loopKeys).toEqual(
      [
        structureRecordKey([], fastLoop.loopStartId),
        structureRecordKey([], slowLoop.loopStartId),
      ].sort(),
    );
  });

  it('case 6b: aborting mid-run with two concurrent same-template groups keeps both innerRecords instance-pure', async () => {
    const built = buildLoopBearingGroupType(createStandardGroupState());
    let state = built.state;
    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: built.groupTypeId, position: { x: 0, y: 0 } },
    });
    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: built.groupTypeId, position: { x: 400, y: 0 } },
    });
    const instanceIds = state.nodes
      .filter((node) => node.data.nodeTypeUniqueId === built.groupTypeId)
      .map((node) => node.id);

    const warnings: RecorderWarning[] = [];
    const abortController = new AbortController();
    // Compile with the SAME implementation set the run uses — every other
    // case in this file does, and compiling with `{}` only differed by
    // producing extra `plan.warnings`.
    let sourceCallsForCompile = 0;
    const abortingImplementations = {
      testSource: async () => {
        sourceCallsForCompile++;
        if (sourceCallsForCompile === 2) abortController.abort();
        await waitForMilliseconds(40);
        return new Map<string, unknown>([['Out', 'sample-value']]);
      },
    };
    const plan = compile<string, string>(state, abortingImplementations, {
      maxLoopIterations: 2,
    });
    // DETERMINISTIC abort (F4(3)), on the SECOND source call.
    //
    // `runAll` starts the level with `Promise.allSettled(map(...))`, and
    // `executeGroupScope` runs its whole prefix — `beginScope` included —
    // synchronously up to its first await. So aborting on call 1 fires before
    // instance 2's scope has even OPENED: instance 2 records nothing, and a
    // per-instance purity loop over its (empty) steps asserts nothing at all.
    // Waiting for call 2 means BOTH scopes are open and populated when the
    // cancel lands, which is the interleaving this case exists to police.
    const record = await execute<string, string>(
      plan,
      abortingImplementations,
      state,
      {
        onNodeStateChange: () => {},
        abortSignal: abortController.signal,
        onRecorderWarning: (warning) => warnings.push(warning),
      },
    );

    // Both scopes were live when the cancel landed (compile does not call
    // implementations, so every count here comes from the run).
    expect(sourceCallsForCompile).toBeGreaterThanOrEqual(2);
    expect(warnings).toEqual([]);

    // BOTH instances must have recorded inner work — otherwise the purity
    // loop below would pass vacuously on an empty array.
    const groupRecords = instanceIds.map((instanceId) =>
      record.groupRecords.get(structureRecordKey([], instanceId)),
    );
    expect(groupRecords.every((groupRecord) => groupRecord !== undefined)).toBe(
      true,
    );
    for (const [index, instanceId] of instanceIds.entries()) {
      const innerSteps = groupRecords[index]!.innerRecord.steps;
      expect(innerSteps.length).toBeGreaterThan(0);
      // Instance-pure even on the cancel path — no cross-contamination
      // between two scopes that were open at the same time.
      for (const step of innerSteps) {
        expect(step.instancePath?.[0]).toBe(instanceId);
      }
    }
  });
});

describe('recorder backstop — API misuse (S4 case 5)', () => {
  it('promotes orphaned structures at finalize, warns via the callback, stays idempotent', () => {
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    // Misuse: begin a structure + iteration, never complete either.
    recorder.beginLoopStructure(
      'orphan-loop',
      'orphan-loop',
      'stop',
      'end',
      [],
    );
    recorder.beginLoopIteration('orphan-loop', 0, []);
    // Misuse: begin a switch, never complete it.
    recorder.beginSwitchStructure('orphan-switch', 'orphan-switch', 'sEnd', []);
    // Misuse: begin a scope, never end it.
    recorder.beginScope(['ghost-instance']);

    const record = recorder.finalize('completed', new Map());

    // The structures were PROMOTED, not dropped.
    const promotedLoop = record.loopRecords.get(
      structureRecordKey([], 'orphan-loop'),
    );
    expect(promotedLoop).toBeDefined();
    expect(promotedLoop!.totalIterations).toBe(1); // in-flight iteration folded
    // Times are RELATIVE and in-range (the materialization contract).
    expect(promotedLoop!.startTime).toBeGreaterThanOrEqual(0);
    expect(promotedLoop!.endTime).toBeLessThanOrEqual(record.totalDuration);
    expect(
      record.switchRecords.get(structureRecordKey([], 'orphan-switch')),
    ).toBeDefined();

    const kinds = warnings.map((warning) => warning.kind).sort();
    expect(kinds).toContain('orphan-promoted');
    expect(kinds).toContain('unclosed-scope');

    // Idempotent: a second finalize (stepByStep has three call sites)
    // produces NO further warnings and NO duplicate promotions.
    const warningCountAfterFirst = warnings.length;
    // Snapshot BEFORE re-finalizing: `record.loopRecords` is the recorder's
    // live map, so comparing it to the second record's map afterwards would
    // compare the same object to itself and pass vacuously.
    const keysAfterFirst = Array.from(record.loopRecords.keys());
    const secondRecord = recorder.finalize('completed', new Map());
    expect(warnings.length).toBe(warningCountAfterFirst);
    expect(Array.from(secondRecord.loopRecords.keys())).toEqual(keysAfterFirst);

    // FORMAT pin: the published key is a JSON array of the structure's full
    // path. Asserted as a literal (not via `structureRecordKey`) so a change
    // to the key format cannot pass by changing both sides at once.
    expect(keysAfterFirst).toEqual(['["orphan-loop"]']);
    expect(Array.from(record.switchRecords.keys())).toEqual([
      '["orphan-switch"]',
    ]);
  });

  /**
   * F4(6) — a throwing observer must never destroy the record it is
   * reporting on. `onRecorderWarning` is consumer code called from inside
   * the recorder's own bookkeeping; an unguarded call would let a consumer
   * bug abort `finalize` mid-salvage and lose the whole recording.
   */
  it('survives a throwing onRecorderWarning and still salvages the record (F4(6))', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let observerCalls = 0;
      const recorder = new ExecutionRecorder({
        onRecorderWarning: () => {
          observerCalls++;
          throw new Error('consumer observer blew up');
        },
      });
      recorder.start();

      recorder.beginLoopStructure('L', 'L', 'stop', 'end', []);
      recorder.beginSwitchStructure('S', 'S', 'sEnd', []);

      // finalize must complete, not propagate the observer's throw.
      const record = recorder.finalize('completed', new Map());

      expect(observerCalls).toBeGreaterThan(0);
      // The salvage the throwing observer was reporting on still happened.
      expect(record.loopRecords.get(structureRecordKey([], 'L'))).toBeDefined();
      expect(
        record.switchRecords.get(structureRecordKey([], 'S')),
      ).toBeDefined();
      // The failure is surfaced, not swallowed silently.
      expect(errorSpy).toHaveBeenCalled();
      expect(String(errorSpy.mock.calls[0]![0])).toContain(
        'onRecorderWarning threw',
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('endScope throws on a consumed token (misuse contract preserved)', () => {
    const recorder = new ExecutionRecorder();
    recorder.start();
    const token = recorder.beginScope(['g1']);
    recorder.endScope(token, 'completed', new Map());
    expect(() => recorder.endScope(token, 'completed', new Map())).toThrow(
      /unknown or already-consumed/,
    );
  });
});

/**
 * F2b — the amendments the v3 implementation review required (RC-07, RC-11,
 * TP-20, TP-25). Hand-driven at the recorder API, because each one is about a
 * recorder-internal invariant that no executor path can reach on purpose:
 * a superseded iteration, a scope closing over its own residue, and the
 * production branch of dev-mode detection.
 */
describe('recorder F2b — superseded iterations and the endScope dev assertion', () => {
  /** Only the `[ExecutionRecorder:dev]` assertion, not the warning channel's
   *  own `[ExecutionRecorder]` console fallback. */
  function devAssertions(spy: MockInstance<typeof console.warn>): string[] {
    return spy.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.startsWith('[ExecutionRecorder:dev]'));
  }

  it('closes a superseded loop iteration as its own record instead of folding its steps forward (RC-11)', () => {
    const warnings: RecorderWarning[] = [];
    const recorder = new ExecutionRecorder({
      onRecorderWarning: (warning) => warnings.push(warning),
    });
    recorder.start();

    recorder.beginLoopStructure('L', 'L', 'stop', 'end', []);
    recorder.beginLoopIteration('L', 0, []);
    const stepIndex = recorder.beginStep({
      nodeId: 'body',
      nodeTypeId: 'bodyType',
      nodeTypeName: 'Body',
      concurrencyLevel: 0,
      loopIteration: 0,
      loopStructureId: 'L',
    });
    recorder.completeStep(stepIndex, new Map(), new Map());

    // MISUSE: iteration 1 begins while iteration 0 is still pending.
    recorder.beginLoopIteration('L', 1, []);
    recorder.completeLoopIteration('L', 1, false, []);
    recorder.completeLoopStructure('L', []);
    const record = recorder.finalize('completed', new Map());

    expect(warnings.map((warning) => warning.kind)).toEqual(['key-collision']);

    const loopRecord = record.loopRecords.get(structureRecordKey([], 'L'));
    expect(loopRecord).toBeDefined();
    expect(loopRecord!.iterations.map((entry) => entry.iteration)).toEqual([
      0, 1,
    ]);
    const [superseded, current] = loopRecord!.iterations;

    // The step stays with the iteration that RAN it — folding moved it into
    // the NEXT iteration's record.
    expect(superseded!.stepRecords.map((step) => step.nodeId)).toEqual([
      'body',
    ]);
    expect(current!.stepRecords).toEqual([]);
    // Its own stamp agrees with the record enclosing it.
    expect(superseded!.stepRecords[0]!.loopIteration).toBe(
      superseded!.iteration,
    );
    // And it sits INSIDE that record's time window — folding took the new
    // entry's startTime AFTER the step had already run, putting the step
    // before its own record's start.
    expect(superseded!.stepRecords[0]!.startTime).toBeGreaterThanOrEqual(
      superseded!.startTime,
    );
    expect(superseded!.stepRecords[0]!.startTime).toBeLessThanOrEqual(
      superseded!.endTime,
    );
  });

  it('warns once, in dev, when a scope closes while it still owns a pending structure (RC-07)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const recorder = new ExecutionRecorder();
      recorder.start();
      const token = recorder.beginScope(['g1']);
      // Misuse: a structure owned by the scope is never completed.
      recorder.beginLoopStructure('L', 'L', 'stop', 'end', ['g1']);
      recorder.endScope(token, 'completed', new Map());

      const assertions = devAssertions(warnSpy);
      expect(assertions).toHaveLength(1);
      expect(assertions[0]).toContain(structureRecordKey(['g1'], 'L'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('stays silent for a fully-completed loop-in-loop inside a group scope (F1b VERIFY — the no-fire case)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const recorder = new ExecutionRecorder();
      recorder.start();
      const token = recorder.beginScope(['g1']);

      recorder.beginLoopStructure('outer', 'outer', 'outerStop', 'outerEnd', [
        'g1',
      ]);
      recorder.beginLoopIteration('outer', 0, ['g1']);
      // Nested inside the outer loop's body — same owner, declared parentage.
      recorder.beginLoopStructure(
        'inner',
        'inner',
        'innerStop',
        'innerEnd',
        ['g1'],
        { kind: 'loop', loopStructureId: 'outer', iteration: 0 },
      );
      recorder.beginLoopIteration('inner', 0, ['g1']);
      recorder.completeLoopIteration('inner', 0, false, ['g1']);
      recorder.completeLoopStructure('inner', ['g1']);
      recorder.completeLoopIteration('outer', 0, false, ['g1']);
      recorder.completeLoopStructure('outer', ['g1']);

      const scopedRecord = recorder.endScope(token, 'completed', new Map());

      expect(devAssertions(warnSpy)).toEqual([]);
      // The topology the assertion had to stay quiet about is real: the outer
      // loop is in the scoped record and the inner one is folded into its
      // iteration, not orphaned.
      const outerRecord = scopedRecord.loopRecords.get(
        structureRecordKey(['g1'], 'outer'),
      );
      expect(outerRecord).toBeDefined();
      expect(
        outerRecord!.iterations[0]!.nestedLoopRecords.has(
          structureRecordKey(['g1'], 'inner'),
        ),
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('reports the pending ROOT once, not once per nesting level (RC2-18)', () => {
    // The unparented-only scoping exists so one root cause yields one message.
    // The earlier no-fire case completed every structure, so this branch was
    // never actually executed — deleting it left the suite green.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const recorder = new ExecutionRecorder();
      recorder.start();
      const token = recorder.beginScope(['g1']);
      recorder.beginLoopStructure('outer', 'outer', 'oStop', 'oEnd', ['g1']);
      recorder.beginLoopIteration('outer', 0, ['g1']);
      recorder.beginLoopStructure('inner', 'inner', 'iStop', 'iEnd', ['g1'], {
        kind: 'loop',
        loopStructureId: 'outer',
        iteration: 0,
      });
      recorder.endScope(token, 'completed', new Map());

      const assertions = devAssertions(warnSpy);
      expect(assertions).toHaveLength(1);
      expect(assertions[0]).toContain(structureRecordKey(['g1'], 'outer'));
      // The nested child shares the root cause and must NOT be listed too.
      expect(assertions[0]).not.toContain(structureRecordKey(['g1'], 'inner'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('reports a nested structure whose PARENT already completed — it is an orphan root itself (RC2-06)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const recorder = new ExecutionRecorder();
      recorder.start();
      const token = recorder.beginScope(['g1']);
      recorder.beginLoopStructure('outer', 'outer', 'oStop', 'oEnd', ['g1']);
      recorder.beginLoopIteration('outer', 0, ['g1']);
      recorder.beginLoopStructure('inner', 'inner', 'iStop', 'iEnd', ['g1'], {
        kind: 'loop',
        loopStructureId: 'outer',
        iteration: 0,
      });
      // The parent finishes; the child never does. Skipping every parented
      // entry unconditionally would stay silent about a genuine leak.
      recorder.completeLoopIteration('outer', 0, false, ['g1']);
      recorder.completeLoopStructure('outer', ['g1']);
      recorder.endScope(token, 'completed', new Map());

      const assertions = devAssertions(warnSpy);
      expect(assertions).toHaveLength(1);
      expect(assertions[0]).toContain(structureRecordKey(['g1'], 'inner'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('skips a child whose parent is pending at a SHALLOWER path — the prefix reading, not exact-path equality (R2-03)', () => {
    // Pins the capability the prefix search added. With the pre-fix exact-path
    // lookup the parent at ['g1'] is not found for a child at ['g1','g2'], so
    // BOTH would be listed — one root cause, two messages.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const recorder = new ExecutionRecorder();
      recorder.start();
      const token = recorder.beginScope(['g1']);
      recorder.beginLoopStructure('P', 'P', 'pStop', 'pEnd', ['g1']);
      // A child declaring P as its parent while sitting one level deeper —
      // the shape a parent declared across a group boundary produces.
      recorder.beginLoopStructure('C', 'C', 'cStop', 'cEnd', ['g1', 'g2'], {
        kind: 'loop',
        loopStructureId: 'P',
        iteration: 0,
      });
      recorder.endScope(token, 'completed', new Map());

      const assertions = devAssertions(warnSpy);
      expect(assertions).toHaveLength(1);
      expect(assertions[0]).toContain(structureRecordKey(['g1'], 'P'));
      expect(assertions[0]).not.toContain(
        structureRecordKey(['g1', 'g2'], 'C'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('reports a pending ITERATION whose structure already completed — finalize DROPS it, so this is its only warning (PD-12)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const recorder = new ExecutionRecorder();
      recorder.start();
      const token = recorder.beginScope(['g1']);
      recorder.beginLoopStructure('L', 'L', 'stop', 'end', ['g1']);
      recorder.beginLoopIteration('L', 3, ['g1']);
      // Structure completes, iteration does not — the state
      // `promoteOrphansAtFinalize` discards with 'orphan-dropped'.
      recorder.completeLoopStructure('L', ['g1']);
      recorder.endScope(token, 'completed', new Map());

      const assertions = devAssertions(warnSpy);
      expect(assertions).toHaveLength(1);
      expect(assertions[0]).toContain(
        `${structureRecordKey(['g1'], 'L')} (iteration 3)`,
      );
      // And it says the truthful consequence for an iteration: DROPPED, not
      // salvaged.
      expect(assertions[0]).toContain('DROPPED');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does NOT double-report an iteration whose structure is also pending (PD-12)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const recorder = new ExecutionRecorder();
      recorder.start();
      const token = recorder.beginScope(['g1']);
      recorder.beginLoopStructure('L', 'L', 'stop', 'end', ['g1']);
      recorder.beginLoopIteration('L', 0, ['g1']);
      recorder.endScope(token, 'completed', new Map());

      const assertions = devAssertions(warnSpy);
      expect(assertions).toHaveLength(1);
      // The STRUCTURE line only — the iteration is de-duplicated against it.
      expect(assertions[0]).toContain(structureRecordKey(['g1'], 'L'));
      expect(assertions[0]).not.toContain('(iteration');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('stays silent for structures owned OUTSIDE the closing scope (the ownership filter, not emptiness)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const recorder = new ExecutionRecorder();
      recorder.start();
      // Plenty pending — but none of it owned at or under ['g1'].
      recorder.beginLoopStructure('sibling', 'sibling', 'stop', 'end', ['g2']);
      recorder.beginLoopStructure('rootLoop', 'rootLoop', 'stop', 'end', []);
      const token = recorder.beginScope(['g1']);
      recorder.endScope(token, 'completed', new Map());

      expect(devAssertions(warnSpy)).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('is silent in production, proving dev-mode detection is evaluated per call (TP-25)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The recorder module was imported with NODE_ENV=test. A module-level
    // dev-mode constant would have frozen `true` and kept warning here.
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const recorder = new ExecutionRecorder();
      recorder.start();
      const token = recorder.beginScope(['g1']);
      recorder.beginLoopStructure('L', 'L', 'stop', 'end', ['g1']);
      recorder.endScope(token, 'completed', new Map());
      // Neither the dev assertion nor the warning channel's console fallback.
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      warnSpy.mockRestore();
    }
  });
});
