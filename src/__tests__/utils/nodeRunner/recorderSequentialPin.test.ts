import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  mainReducer,
  actionTypesMap,
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
} from '@/utils/nodeStateManagement/standardNodes';
import { structureRecordKey } from '@/utils/nodeRunner/executionRecorder';
import { compile } from '@/utils/nodeRunner/compiler';
import { execute } from '@/utils/nodeRunner/executor';
import { standardNodeCountConstraints } from '@/utils';
import type { LoopExecutionBlock } from '@/utils/nodeRunner/types';
import {
  sdfDataTypes,
  sdfNodeTypes,
  sdfImplementations,
  type SdfDataTypeId,
  type SdfNodeTypeId,
} from '@/advancedGraphExamples/sdfStudioDefinitions';
import {
  standardDataTypes,
  standardNodeTypes,
  standardNodeTypeNamesMap,
} from '@/utils/nodeStateManagement/standardNodes';
import { getCurrentNodesAndEdgesFromState } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import type { Action } from '@/utils/nodeStateManagement/mainReducer';

/**
 * SEQUENTIAL PIN SUITE (Plan A, S1) — written BEFORE the recorder-concurrency
 * fix and required to pass UNCHANGED afterwards. Pins the recorder's
 * sequential behavior: nested-loop record topology, innerRecord composition,
 * group-in-loop step routing, and error placement.
 *
 * Assertion rule (plan §4): membership/topology only — map keys, step
 * node-ids/statuses/nesting — NEVER timing fields, never cross-sibling
 * ordering.
 *
 * S0 CONSTRUCTION ROUTE (probe result recorded per plan): route (a) —
 * action-driven through `mainReducer`, with the nested loop wired through
 * INTERMEDIARY Math nodes (outer.start → Math → inner.start and inner.end →
 * Math → outer.stop) so no single edge touches two loop structures — the
 * parked `isLoopConnectionValid` two-loop rejection
 * (`e2e/TEST_MATRIX.md:116`) fires only on DIRECT loop-to-loop infer edges.
 * Every connect asserts its edge landed (rejections are silent).
 */

type StudioState = State<
  SdfDataTypeId,
  SdfNodeTypeId,
  SupportedUnderlyingTypes,
  z.ZodType
>;

function createGraphBuilder() {
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

  /** Connect and ASSERT the edge committed — reducer rejections are silent. */
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

  return {
    getState: () => state,
    addNode,
    connectOrThrow,
    inputHandleId,
    outputHandleId,
    setInputValue,
  };
}

/**
 * Nested-loop topology (outer counts via Compare < 2; inner via Compare < 2):
 *
 *   init(Math:0) ─▶ A.start ─▶ M1(Math) ─▶ B.start ─▶ Binc(Math+1) ─▶ B.stop
 *                     │                       │  ▲                       │
 *                     ▼                       ▼  └──(bind)               ▼
 *                  Acmp(<2) ─▶ A.stop.cond  Bcmp(<2) ─▶ B.stop.cond   B.end
 *                                  ▲                                     │
 *                                  └────────── M2(Math+1) ◀──────────────┘
 *   A.stop ─▶ A.end   (binds: A.start→A.stop→A.end, B.start→B.stop→B.end)
 */
function buildNestedLoopGraph() {
  const builder = createGraphBuilder();
  const {
    addNode,
    connectOrThrow,
    inputHandleId,
    outputHandleId,
    setInputValue,
  } = builder;

  const initNodeId = addNode('math', { x: 0, y: 0 });
  const outerStartId = addNode('loopStart', { x: 200, y: 0 });
  const bridgeInId = addNode('math', { x: 400, y: 0 }); // M1: A=carry, B=0
  const innerStartId = addNode('loopStart', { x: 600, y: 0 });
  const innerIncrementId = addNode('math', { x: 800, y: 0 });
  setInputValue(innerIncrementId, 1, 1); // inner j + 1
  const innerCompareId = addNode('compare', { x: 800, y: 220 });
  setInputValue(innerCompareId, 1, 2); // j < 2
  setInputValue(innerCompareId, 2, 'Less Than');
  const innerStopId = addNode('loopStop', { x: 1000, y: 0 });
  const innerEndId = addNode('loopEnd', { x: 1200, y: 0 });
  const bridgeOutId = addNode('math', { x: 1400, y: 0 }); // M2: A=j, B=1
  setInputValue(bridgeOutId, 1, 1);
  const outerCompareId = addNode('compare', { x: 400, y: 300 });
  setInputValue(outerCompareId, 1, 2); // i < 2
  setInputValue(outerCompareId, 2, 'Less Than');
  const outerStopId = addNode('loopStop', { x: 1600, y: 0 });
  const outerEndId = addNode('loopEnd', { x: 1800, y: 0 });

  // Binds first (region rules depend on them).
  connectOrThrow(
    'A.start bind A.stop',
    outerStartId,
    outputHandleId(outerStartId, 0),
    outerStopId,
    inputHandleId(outerStopId, 0),
  );
  connectOrThrow(
    'A.stop bind A.end',
    outerStopId,
    outputHandleId(outerStopId, 0),
    outerEndId,
    inputHandleId(outerEndId, 0),
  );
  connectOrThrow(
    'B.start bind B.stop',
    innerStartId,
    outputHandleId(innerStartId, 0),
    innerStopId,
    inputHandleId(innerStopId, 0),
  );
  connectOrThrow(
    'B.stop bind B.end',
    innerStopId,
    outputHandleId(innerStopId, 0),
    innerEndId,
    inputHandleId(innerEndId, 0),
  );

  // Outer carry in.
  connectOrThrow(
    'init → A.start.infer-in',
    initNodeId,
    outputHandleId(initNodeId, 0),
    outerStartId,
    inputHandleId(outerStartId, loopStartInputInferHandleIndex),
  );
  // Outer body → bridge → inner carry in (NO direct loop-to-loop edge).
  connectOrThrow(
    'A.start.infer-out → M1.A',
    outerStartId,
    outputHandleId(outerStartId, loopStartOutputInferHandleIndex),
    bridgeInId,
    inputHandleId(bridgeInId, 0),
  );
  connectOrThrow(
    'M1 → B.start.infer-in',
    bridgeInId,
    outputHandleId(bridgeInId, 0),
    innerStartId,
    inputHandleId(innerStartId, loopStartInputInferHandleIndex),
  );
  // Inner body: carry + condition.
  connectOrThrow(
    'B.start.infer-out → Binc.A',
    innerStartId,
    outputHandleId(innerStartId, loopStartOutputInferHandleIndex),
    innerIncrementId,
    inputHandleId(innerIncrementId, 0),
  );
  connectOrThrow(
    'Binc → B.stop.infer-in',
    innerIncrementId,
    outputHandleId(innerIncrementId, 0),
    innerStopId,
    inputHandleId(innerStopId, loopStopInputInferHandleIndex),
  );
  connectOrThrow(
    'B.start.infer-out → Bcmp.A',
    innerStartId,
    outputHandleId(innerStartId, loopStartOutputInferHandleIndex),
    innerCompareId,
    inputHandleId(innerCompareId, 0),
  );
  connectOrThrow(
    'Bcmp → B.stop.cond',
    innerCompareId,
    outputHandleId(innerCompareId, 0),
    innerStopId,
    inputHandleId(innerStopId, 1),
  );
  // Inner post-stop carry to B.end.
  connectOrThrow(
    'B.stop.infer-out → B.end.infer-in',
    innerStopId,
    outputHandleId(innerStopId, loopStopOutputInferHandleIndex),
    innerEndId,
    inputHandleId(innerEndId, loopEndInputInferHandleIndex),
  );
  // Inner result → bridge → outer carry.
  connectOrThrow(
    'B.end.infer-out → M2.A',
    innerEndId,
    outputHandleId(innerEndId, 0),
    bridgeOutId,
    inputHandleId(bridgeOutId, 0),
  );
  connectOrThrow(
    'M2 → A.stop.infer-in',
    bridgeOutId,
    outputHandleId(bridgeOutId, 0),
    outerStopId,
    inputHandleId(outerStopId, loopStopInputInferHandleIndex),
  );
  // Outer condition.
  connectOrThrow(
    'A.start.infer-out → Acmp.A',
    outerStartId,
    outputHandleId(outerStartId, loopStartOutputInferHandleIndex),
    outerCompareId,
    inputHandleId(outerCompareId, 0),
  );
  connectOrThrow(
    'Acmp → A.stop.cond',
    outerCompareId,
    outputHandleId(outerCompareId, 0),
    outerStopId,
    inputHandleId(outerStopId, 1),
  );
  // Outer post-stop carry.
  connectOrThrow(
    'A.stop.infer-out → A.end.infer-in',
    outerStopId,
    outputHandleId(outerStopId, loopStopOutputInferHandleIndex),
    outerEndId,
    inputHandleId(outerEndId, loopEndInputInferHandleIndex),
  );

  return {
    state: builder.getState(),
    outerStartId,
    innerStartId,
    innerStopId,
    innerIncrementId,
  };
}

async function runGraph(state: StudioState) {
  const plan = compile<
    SdfDataTypeId,
    SdfNodeTypeId,
    SupportedUnderlyingTypes,
    z.ZodType
  >(state, sdfImplementations, { maxLoopIterations: 10 });
  const record = await execute<
    SdfDataTypeId,
    SdfNodeTypeId,
    SupportedUnderlyingTypes,
    z.ZodType
  >(plan, sdfImplementations, state, {
    onNodeStateChange: () => {},
    abortSignal: new AbortController().signal,
  });
  return { plan, record };
}

describe('recorder sequential pins — nested loop (S1 pin #1)', () => {
  it('S0 probe: the nested topology constructs through the reducer and compiles NESTED', async () => {
    const { state, outerStartId, innerStartId } = buildNestedLoopGraph();
    const plan = compile<
      SdfDataTypeId,
      SdfNodeTypeId,
      SupportedUnderlyingTypes,
      z.ZodType
    >(state, sdfImplementations, { maxLoopIterations: 10 });

    // Exactly one TOP-LEVEL loop block (the outer); the inner appears as a
    // nested loop block inside the outer's body steps, not at the top level.
    const topLevelLoopBlocks = plan.levels
      .flat()
      .filter((step): step is LoopExecutionBlock => step.kind === 'loop');
    expect(topLevelLoopBlocks.map((block) => block.loopStartNodeId)).toEqual([
      outerStartId,
    ]);

    const nestedLoopBlocks = topLevelLoopBlocks[0].preStopSteps.filter(
      (step): step is LoopExecutionBlock => step.kind === 'loop',
    );
    expect(nestedLoopBlocks.map((block) => block.loopStartNodeId)).toEqual([
      innerStartId,
    ]);
  });

  /**
   * F3 pin (6) — Class B oracle for the F2 hoist.
   *
   * `executeLoopBlock` builds `parentFields` (the enclosing group's identity
   * plus the enclosing loop's `parentLoopStructureId`/`parentLoopIteration`)
   * ABOVE its early validation-error steps. Before that hoist, a malformed
   * NESTED loop's error step was recorded with no parent routing, so
   * `addStepToPendingIteration`'s parent fallback could not file it and the
   * step existed only in the flat list — invisible inside the parent
   * iteration that actually ran it.
   *
   * The surgery: compile the FULL state (the plan needs a well-formed graph),
   * then execute against a state with the inner `loopStop` node removed.
   * `buildNodeInfoMap` reads `state.nodes`, so the inner block's
   * `nodeInfoMap.get(loopStopNodeId)` misses and the early-error branch runs.
   */
  it('files a malformed NESTED loop’s early error step into the PARENT iteration (F3 pin 6)', async () => {
    const { state, outerStartId, innerStartId, innerStopId } =
      buildNestedLoopGraph();

    const plan = compile<
      SdfDataTypeId,
      SdfNodeTypeId,
      SupportedUnderlyingTypes,
      z.ZodType
    >(state, sdfImplementations, { maxLoopIterations: 10 });

    const stateWithoutInnerStop: StudioState = {
      ...state,
      nodes: state.nodes.filter((node) => node.id !== innerStopId),
    };

    const record = await execute<
      SdfDataTypeId,
      SdfNodeTypeId,
      SupportedUnderlyingTypes,
      z.ZodType
    >(plan, sdfImplementations, stateWithoutInnerStop, {
      onNodeStateChange: () => {},
      abortSignal: new AbortController().signal,
    });

    // The inner block fails structurally on EVERY outer iteration (the outer
    // carry never advances, so it runs to its cap) — each failure recorded as
    // an error step on the inner loopStart, typed as the loop structure
    // rather than as a node type.
    const errorSteps = record.steps.filter(
      (step) => step.status === 'errored' && step.nodeTypeId === 'loop',
    );
    expect(errorSteps.length).toBeGreaterThan(0);

    // The outer loop survives every one of them: the throw is duck-typed as a
    // GraphError by the loop body's settle handler.
    const outerRecord = record.loopRecords.get(
      structureRecordKey([], outerStartId),
    );
    expect(outerRecord).toBeDefined();

    for (const errorStep of errorSteps) {
      expect(errorStep.nodeId).toBe(innerStartId);
      // THE pin: the step carries the OUTER loop's routing fields...
      expect(errorStep.parentLoopStructureId).toBe(outerStartId);
      expect(errorStep.parentLoopIteration).toBeDefined();

      // ...and is therefore INSIDE the parent iteration record that ran it,
      // not merely in the flat list.
      const parentIteration = outerRecord!.iterations.find(
        (iteration) => iteration.iteration === errorStep.parentLoopIteration,
      );
      expect(parentIteration).toBeDefined();
      expect(parentIteration!.stepRecords).toContain(errorStep);
    }

    // Each outer iteration owns exactly one of them — no cross-iteration
    // duplication, no iteration silently missing its failure.
    expect(
      new Set(errorSteps.map((step) => step.parentLoopIteration)).size,
    ).toBe(errorSteps.length);
  });

  it('pins the nested record topology: outer top-level, inner under iterations[].nestedLoopRecords', async () => {
    const { state, outerStartId, innerStartId, innerIncrementId } =
      buildNestedLoopGraph();
    const { record } = await runGraph(state);

    expect(record.status).toBe('completed');
    expect(record.errors).toHaveLength(0);

    // Top-level loopRecords: EXACTLY the outer loop.
    expect(Array.from(record.loopRecords.keys())).toEqual([
      structureRecordKey([], outerStartId),
    ]);

    const outerRecord = record.loopRecords.get(
      structureRecordKey([], outerStartId),
    )!;
    expect(outerRecord.loopStartNodeId).toBe(outerStartId);
    expect(outerRecord.totalIterations).toBeGreaterThanOrEqual(1);

    // EVERY outer iteration carries the inner loop as a nested record —
    // keyed by the inner loopStart id — and the inner's own iterations
    // contain the inner increment step.
    for (const iteration of outerRecord.iterations) {
      expect(Array.from(iteration.nestedLoopRecords.keys())).toEqual([
        structureRecordKey([], innerStartId),
      ]);
      const innerRecord = iteration.nestedLoopRecords.get(
        structureRecordKey([], innerStartId),
      )!;
      expect(innerRecord.loopStartNodeId).toBe(innerStartId);
      expect(innerRecord.totalIterations).toBeGreaterThanOrEqual(1);
      const innerStepNodeIds = innerRecord.iterations.flatMap(
        (innerIteration) =>
          innerIteration.stepRecords.map((step) => step.nodeId),
      );
      expect(innerStepNodeIds).toContain(innerIncrementId);
      // Structural steps of the INNER loop route to its own iterations,
      // not the outer's (per-iteration stepRecords stay instance-pure).
      for (const innerIteration of innerRecord.iterations) {
        expect(Array.from(innerIteration.nestedLoopRecords.keys())).toEqual([]);
      }
    }

    // The inner increment ran INSIDE the nesting only — it must not appear
    // as a top-level loopRecords key, and the flat steps list must contain
    // it (flat completeness invariant).
    expect(record.loopRecords.has(structureRecordKey([], innerStartId))).toBe(
      false,
    );
    expect(record.steps.some((step) => step.nodeId === innerIncrementId)).toBe(
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pins #2 and #4 use the string-typed standard-nodes universe (group type
// ids are runtime-minted ⇒ `State<string, string>` is the honest typing).
// Construction patterns mirror `instancePathAttribution.test.ts`.
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
      testThrower: {
        name: 'Test Thrower',
        headerColor: '#AB2E2E',
        inputs: [],
        outputs: [{ name: 'Out', dataType: 'testString' }],
      },
    } as GroupGraphState['typeOfNodes'],
    nodes: [],
    edges: [],
    enableTypeInference: true,
  };
}

const groupPinImplementations = {
  testSource: () => new Map<string, unknown>([['Out', 'sample-value']]),
  testThrower: () => {
    throw new Error('pin: intentional inner failure');
  },
};

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
  );
  expect(groupTypeId).toBeDefined();
  return {
    state: applyGroupAction(next, { type: actionTypesMap.CLOSE_NODE_GROUP }),
    groupTypeId: groupTypeId!,
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

async function runGroupGraph(
  state: GroupGraphState,
): Promise<import('@/utils/nodeRunner/types').ExecutionRecord> {
  const plan = compile<string, string>(state, groupPinImplementations, {
    maxLoopIterations: 2,
  });
  return execute<string, string>(plan, groupPinImplementations, state, {
    onNodeStateChange: () => {},
    abortSignal: new AbortController().signal,
  });
}

describe('recorder sequential pins — innerRecord composition (S1 pin #2)', () => {
  it('a group containing a LOOP and a SWITCH surfaces both records in its innerRecord maps', async () => {
    let state = createStandardGroupState();
    const created = addGroupType(state);
    state = created.state;
    const groupTypeId = created.groupTypeId;

    // Subtree: one loop (ADD_LOOP composite: bound triplet + zones), one
    // switch (ADD_SWITCH: bound pair), each fed by a testSource on its infer
    // input so channels materialize. Conditions stay unconnected (default
    // false ⇒ one loop iteration, false switch branch) — composition, not
    // iteration count, is the pin.
    state = buildInsideGroup(state, groupTypeId, (opened) => {
      let next = applyGroupAction(opened, {
        type: actionTypesMap.ADD_LOOP,
        payload: { position: { x: 0, y: 0 } },
      });
      next = applyGroupAction(next, {
        type: actionTypesMap.ADD_SWITCH,
        payload: { position: { x: 0, y: 600 } },
      });
      next = applyGroupAction(next, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: -400, y: 0 } },
      });
      next = applyGroupAction(next, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testSource', position: { x: -400, y: 600 } },
      });
      const view = getCurrentNodesAndEdgesFromState(next);
      const sources = view.nodes.filter(
        (node) => node.data.nodeTypeUniqueId === 'testSource',
      );
      const loopStartNode = view.nodes.find(
        (node) =>
          node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart,
      );
      const switchStartNode = view.nodes.find(
        (node) =>
          node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart,
      );
      expect(sources).toHaveLength(2);
      expect(loopStartNode).toBeDefined();
      expect(switchStartNode).toBeDefined();
      next = applyGroupAction(next, {
        type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
        payload: {
          edge: {
            source: sources[0]!.id,
            sourceHandle: sources[0]!.data.outputs![0]!.id,
            target: loopStartNode!.id,
            targetHandle: loopStartNode!.data.inputs![0]!.id,
          },
        },
      });
      return applyGroupAction(next, {
        type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
        payload: {
          edge: {
            source: sources[1]!.id,
            sourceHandle: sources[1]!.data.outputs![0]!.id,
            target: switchStartNode!.id,
            targetHandle: switchStartNode!.data.inputs![0]!.id,
          },
        },
      });
    });

    // Template ids of the subtree structures (shared by every instance).
    const subtree = state.typeOfNodes[groupTypeId]!.subtree!;
    const templateLoopStartId = subtree.nodes.find(
      (node) =>
        node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart,
    )!.id;
    const templateSwitchStartId = subtree.nodes.find(
      (node) =>
        node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.switchStart,
    )!.id;
    const templateSourceIds = subtree.nodes
      .filter((node) => node.data.nodeTypeUniqueId === 'testSource')
      .map((node) => node.id);

    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    const instanceId = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === groupTypeId,
    )!.id;

    const record = await runGroupGraph(state);
    expect(record.status).toBe('completed');
    expect(record.errors).toHaveLength(0);

    // THE composition pin (covered by no other test): the group's
    // innerRecord carries the inner loop AND switch records in its maps.
    const groupRecord = record.groupRecords.get(
      structureRecordKey([], instanceId),
    );
    expect(groupRecord).toBeDefined();
    const innerRecord = groupRecord!.innerRecord;
    expect(Array.from(innerRecord.loopRecords.keys())).toEqual([
      structureRecordKey([instanceId], templateLoopStartId),
    ]);
    expect(Array.from(innerRecord.switchRecords.keys())).toEqual([
      structureRecordKey([instanceId], templateSwitchStartId),
    ]);
    // Inner steps include both sources, attributed to this instance.
    const innerSourceSteps = innerRecord.steps.filter((step) =>
      templateSourceIds.includes(step.nodeId),
    );
    expect(innerSourceSteps.length).toBe(2);
    for (const step of innerSourceSteps) {
      expect(step.instancePath).toEqual([instanceId]);
      expect(step.status).toBe('completed');
    }
  });
});

// Runtime-minted group type ids ⇒ honest typing is a string-keyed State; the
// SDF universe carries complex zod types, so the 4th generic must be z.ZodType
// (never — the default — would reject sdf's complexSchema).
type MixedState = State<string, string, SupportedUnderlyingTypes, z.ZodType>;

/**
 * A group instance wired INSIDE a multi-iteration loop body:
 *
 *   init → A.start ─▶ g.In … g.Out ─▶ M2(+1) ─▶ A.stop ─▶ A.end
 *                        └ subtree: groupInput → math → groupOutput
 *
 * With `withLoopInsideGroup`, the subtree also carries a loop fed from the
 * same groupInput slot (a side branch, exactly like S1 pin #2's):
 *
 *                        └ subtree: groupInput ─┬▶ math → groupOutput
 *                                               └▶ K.start → K.stop → K.end
 *
 * so the group re-executes a structure-bearing subtree once per OUTER
 * iteration — the Class A topology, where every execution rewrites the same
 * identity key.
 *
 * Shared by S1 pin #3 (the group wrapper step appears in every iteration),
 * F3 pin 5 (the completion-serial watermark) and F3 pin 7 (a group whose
 * TYPE is missing at execute time still routes its early error step into the
 * enclosing loop's iteration).
 */
function buildGroupInsideLoopGraph(options?: {
  withLoopInsideGroup?: boolean;
}) {
  // Runtime-minted group type id ⇒ honest typing is a string-keyed State;
  // the SDF universe carries complex zod types, so the 4th generic must be
  // z.ZodType (never = the default would reject sdf's complexSchema).
  let state: MixedState = {
    dataTypes: { ...sdfDataTypes } as MixedState['dataTypes'],
    typeOfNodes: { ...sdfNodeTypes } as MixedState['typeOfNodes'],
    nodes: [],
    edges: [],
    allowedConversionsBetweenDataTypes: {
      number: { loopInfer: true },
      loopInfer: { number: true },
    } as MixedState['allowedConversionsBetweenDataTypes'],
    enableTypeInference: true,
  };
  const apply = (
    action: Action<string, string, SupportedUnderlyingTypes, z.ZodType>,
  ) => {
    state = mainReducer<string, string, SupportedUnderlyingTypes, z.ZodType>(
      state,
      action,
    );
  };
  const addNode = (
    nodeType: string,
    position: { x: number; y: number },
  ): string => {
    apply({
      type: actionTypesMap.ADD_NODE,
      payload: { type: nodeType, position },
    });
    return state.nodes[state.nodes.length - 1].id;
  };
  const findNode = (nodeId: string) => {
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`node ${nodeId} missing`);
    return node;
  };
  const connectOrThrow = (
    label: string,
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string,
  ) => {
    const before = state.edges.length;
    apply({
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: { edge: { source, sourceHandle, target, targetHandle } },
    });
    if (state.edges.length !== before + 1) {
      throw new Error(`edge silently rejected: ${label}`);
    }
  };
  const inputId = (nodeId: string, index: number): string => {
    const handle = findNode(nodeId).data.inputs?.[index];
    const id = handle && 'id' in handle ? handle.id : undefined;
    if (!id) throw new Error(`input ${index} missing on ${nodeId}`);
    return id;
  };
  const outputId = (nodeId: string, index: number): string => {
    const id = findNode(nodeId).data.outputs?.[index]?.id;
    if (!id) throw new Error(`output ${index} missing on ${nodeId}`);
    return id;
  };
  const setRootInputValue = (
    nodeId: string,
    index: number,
    value: number | string,
  ) => {
    state = {
      ...state,
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId || !node.data.inputs) return node;
        const inputs = node.data.inputs.map((input, i) => {
          if (i !== index || !('type' in input)) return input;
          if (input.type === 'number' && typeof value === 'number')
            return { ...input, value };
          if (input.type === 'string' && typeof value === 'string')
            return { ...input, value };
          return input;
        });
        return { ...node, data: { ...node.data, inputs } };
      }),
    };
  };

  // Group type G: subtree groupInput.slot → math.A ; math.out → groupOutput.slot
  // (XOR boundary materialization exposes number In/Out on the type).
  const beforeTypes = new Set(Object.keys(state.typeOfNodes));
  apply({ type: actionTypesMap.ADD_NODE_GROUP });
  const groupTypeId = Object.keys(state.typeOfNodes).find(
    (typeId) => !beforeTypes.has(typeId),
  )!;
  expect(groupTypeId).toBeDefined();
  // ADD_NODE_GROUP opens the new group's scope — build inside, then close.
  {
    apply({
      type: actionTypesMap.ADD_NODE,
      payload: { type: 'math', position: { x: 0, y: 0 } },
    });
    const view = getCurrentNodesAndEdgesFromState(state);
    const groupInputNode = view.nodes.find(
      (node) =>
        node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.groupInput,
    )!;
    const groupOutputNode = view.nodes.find(
      (node) =>
        node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.groupOutput,
    )!;
    const innerMathNode = view.nodes.find(
      (node) => node.data.nodeTypeUniqueId === 'math',
    )!;
    expect(groupInputNode).toBeDefined();
    expect(groupOutputNode).toBeDefined();
    // ASSERT each subtree edge landed. Reducer rejections are SILENT, and
    // subtree edges live in the scoped view rather than `state.edges`, so the
    // root-level guard never sees them — a rejected boundary edge would leave
    // the group exposing no concrete handle and fail much later, somewhere
    // less obvious.
    const subtreeEdgeCount = () =>
      getCurrentNodesAndEdgesFromState(state).edges.length;
    let expectedSubtreeEdges = subtreeEdgeCount();
    const applySubtreeEdge = (
      label: string,
      edge: {
        source: string;
        sourceHandle: string;
        target: string;
        targetHandle: string;
      },
    ) => {
      apply({ type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW, payload: { edge } });
      expectedSubtreeEdges += 1;
      expect(subtreeEdgeCount(), `subtree edge rejected: ${label}`).toBe(
        expectedSubtreeEdges,
      );
    };

    applySubtreeEdge('groupInput → math', {
      source: groupInputNode.id,
      sourceHandle: groupInputNode.data.outputs![0]!.id,
      target: innerMathNode.id,
      targetHandle:
        'id' in innerMathNode.data.inputs![0]!
          ? innerMathNode.data.inputs![0]!.id
          : '',
    });
    applySubtreeEdge('math → groupOutput', {
      source: innerMathNode.id,
      sourceHandle: innerMathNode.data.outputs![0]!.id,
      target: groupOutputNode.id,
      targetHandle:
        'id' in groupOutputNode.data.inputs![0]!
          ? groupOutputNode.data.inputs![0]!.id
          : '',
    });
    if (options?.withLoopInsideGroup) {
      // A loop as a SIDE BRANCH off the same groupInput slot — it does not
      // feed groupOutput, so the group's exposed number In/Out (and therefore
      // the root wiring below) are unchanged. Its condition stays unconnected
      // ⇒ one iteration per group execution, which is all this topology needs.
      apply({
        type: actionTypesMap.ADD_LOOP,
        payload: { position: { x: 0, y: 400 } },
      });
      const withLoop = getCurrentNodesAndEdgesFromState(state);
      const innerLoopStartNode = withLoop.nodes.find(
        (node) =>
          node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart,
      )!;
      expect(innerLoopStartNode).toBeDefined();
      const subtreeEdgesBefore = withLoop.edges.length;
      apply({
        type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
        payload: {
          edge: {
            source: groupInputNode.id,
            sourceHandle: groupInputNode.data.outputs![0]!.id,
            target: innerLoopStartNode.id,
            targetHandle:
              innerLoopStartNode.data.inputs![
                loopStartInputInferHandleIndex
              ]! &&
              'id' in
                innerLoopStartNode.data.inputs![loopStartInputInferHandleIndex]!
                ? (
                    innerLoopStartNode.data.inputs![
                      loopStartInputInferHandleIndex
                    ] as { id: string }
                  ).id
                : '',
          },
        },
      });
      // Subtree edges live in the scoped view, not `state.edges`, so the
      // usual connectOrThrow guard does not apply here — check the view.
      expect(getCurrentNodesAndEdgesFromState(state).edges.length).toBe(
        subtreeEdgesBefore + 1,
      );
    }
    apply({ type: actionTypesMap.CLOSE_NODE_GROUP });
  }
  const subtreeNodes = state.typeOfNodes[groupTypeId]!.subtree!.nodes as Array<{
    id: string;
    data: { nodeTypeUniqueId: string };
  }>;
  const templateMathId = subtreeNodes.find(
    (node) => node.data.nodeTypeUniqueId === 'math',
  )!.id;
  const templateLoopStartId = subtreeNodes.find(
    (node) => node.data.nodeTypeUniqueId === standardNodeTypeNamesMap.loopStart,
  )?.id;

  // Root: init → A.start → g.In ; g.Out → M2(+1) → A.stop ; cmp(i<2) → cond.
  const initId = addNode('math', { x: 0, y: 0 });
  const loopStartId = addNode('loopStart', { x: 200, y: 0 });
  const groupInstanceId = addNode(groupTypeId, { x: 400, y: 0 });
  const bridgeId = addNode('math', { x: 600, y: 0 });
  setRootInputValue(bridgeId, 1, 1); // carried + 1 each iteration
  const compareId = addNode('compare', { x: 400, y: 250 });
  setRootInputValue(compareId, 1, 2); // i < 2
  setRootInputValue(compareId, 2, 'Less Than');
  const loopStopId = addNode('loopStop', { x: 800, y: 0 });
  const loopEndId = addNode('loopEnd', { x: 1000, y: 0 });

  connectOrThrow(
    'bind start→stop',
    loopStartId,
    outputId(loopStartId, 0),
    loopStopId,
    inputId(loopStopId, 0),
  );
  connectOrThrow(
    'bind stop→end',
    loopStopId,
    outputId(loopStopId, 0),
    loopEndId,
    inputId(loopEndId, 0),
  );
  connectOrThrow(
    'init → A.start.infer-in',
    initId,
    outputId(initId, 0),
    loopStartId,
    inputId(loopStartId, loopStartInputInferHandleIndex),
  );
  // Group's exposed concrete input/output (materialized by the XOR rule).
  const groupInstance = findNode(groupInstanceId);
  const exposedInput = groupInstance.data.inputs?.find(
    (handle) => 'type' in handle && handle.type === 'number',
  );
  const exposedOutput = groupInstance.data.outputs?.find(
    (handle) => handle.type === 'number',
  );
  expect(exposedInput && 'id' in exposedInput).toBeTruthy();
  expect(exposedOutput).toBeDefined();
  connectOrThrow(
    'A.start.infer-out → g.In',
    loopStartId,
    outputId(loopStartId, loopStartOutputInferHandleIndex),
    groupInstanceId,
    (exposedInput as { id: string }).id,
  );
  connectOrThrow(
    'g.Out → M2.A',
    groupInstanceId,
    exposedOutput!.id,
    bridgeId,
    inputId(bridgeId, 0),
  );
  connectOrThrow(
    'M2 → A.stop.infer-in',
    bridgeId,
    outputId(bridgeId, 0),
    loopStopId,
    inputId(loopStopId, loopStopInputInferHandleIndex),
  );
  connectOrThrow(
    'A.start.infer-out → cmp.A',
    loopStartId,
    outputId(loopStartId, loopStartOutputInferHandleIndex),
    compareId,
    inputId(compareId, 0),
  );
  connectOrThrow(
    'cmp → A.stop.cond',
    compareId,
    outputId(compareId, 0),
    loopStopId,
    inputId(loopStopId, 1),
  );
  connectOrThrow(
    'A.stop.infer-out → A.end.infer-in',
    loopStopId,
    outputId(loopStopId, loopStopOutputInferHandleIndex),
    loopEndId,
    inputId(loopEndId, loopEndInputInferHandleIndex),
  );

  return {
    state,
    groupTypeId,
    groupInstanceId,
    loopStartId,
    bridgeId,
    templateMathId,
    templateLoopStartId,
  };
}

describe('recorder sequential pins — group inside a multi-iteration loop (S1 pin #3)', () => {
  it('the group wrapper step appears in EVERY loop iteration record (fallback-routing oracle)', async () => {
    const { state, groupInstanceId, loopStartId, bridgeId, templateMathId } =
      buildGroupInsideLoopGraph();

    const plan = compile<string, string, SupportedUnderlyingTypes, z.ZodType>(
      state,
      sdfImplementations,
      { maxLoopIterations: 10 },
    );
    // The group must have compiled INTO the loop body (region membership).
    const loopBlocks = plan.levels
      .flat()
      .filter((step): step is LoopExecutionBlock => step.kind === 'loop');
    expect(loopBlocks.map((block) => block.loopStartNodeId)).toEqual([
      loopStartId,
    ]);
    expect(
      loopBlocks[0].preStopSteps.some((step) => step.kind === 'group'),
    ).toBe(true);

    const record = await execute<
      string,
      string,
      SupportedUnderlyingTypes,
      z.ZodType
    >(plan, sdfImplementations, state, {
      onNodeStateChange: () => {},
      abortSignal: new AbortController().signal,
    });

    expect(record.status).toBe('completed');
    expect(record.errors).toHaveLength(0);

    const loopRecord = record.loopRecords.get(
      structureRecordKey([], loopStartId),
    )!;
    expect(loopRecord).toBeDefined();
    // MULTI-iteration — the whole point of this pin.
    expect(loopRecord.totalIterations).toBeGreaterThanOrEqual(2);

    // THE A-2 ORACLE: every iteration's stepRecords contains the group's
    // structural (wrapper) step — routed there by the recorder today; the
    // fix must preserve this exactly.
    for (const iteration of loopRecord.iterations) {
      const iterationNodeIds = iteration.stepRecords.map((step) => step.nodeId);
      expect(iterationNodeIds).toContain(groupInstanceId);
      expect(iterationNodeIds).toContain(bridgeId);
    }

    // Group record exists with the inner math step attributed to the instance.
    const groupRecord = record.groupRecords.get(
      structureRecordKey([], groupInstanceId),
    );
    expect(groupRecord).toBeDefined();
    expect(
      groupRecord!.innerRecord.steps.some(
        (step) => step.nodeId === templateMathId,
      ),
    ).toBe(true);
  });

  /**
   * F3 pin (5) — the Class A completion-serial watermark, end to end.
   *
   * A group containing loop K, re-executed once per OUTER iteration. Every
   * execution completes K under the SAME identity key
   * `["<instance>","<K>"]`, so "which record keys are new since this scope
   * opened" sees nothing new from the second iteration onward and the later
   * groups' innerRecords come back EMPTY. Membership is decided by write
   * order instead (`lastStoreSerial > token.startStoreSerial`), which sees a
   * rewrite of an existing key.
   *
   * `record.groupRecords` keeps the LAST execution's record (same identity,
   * last write wins) — precisely the one a key-novelty filter would have
   * emptied, which is what makes this an oracle rather than a smoke test.
   */
  it('keeps a re-executed group’s inner loop record in EVERY iteration’s scope (F3 pin 5)', async () => {
    const {
      state,
      groupInstanceId,
      loopStartId,
      templateMathId,
      templateLoopStartId,
    } = buildGroupInsideLoopGraph({ withLoopInsideGroup: true });
    expect(templateLoopStartId).toBeDefined();

    const plan = compile<string, string, SupportedUnderlyingTypes, z.ZodType>(
      state,
      sdfImplementations,
      { maxLoopIterations: 10 },
    );
    const record = await execute<
      string,
      string,
      SupportedUnderlyingTypes,
      z.ZodType
    >(plan, sdfImplementations, state, {
      onNodeStateChange: () => {},
      abortSignal: new AbortController().signal,
    });

    expect(record.status).toBe('completed');

    // The outer loop really did run more than once — without that there is
    // no re-execution and nothing to pin.
    const outerRecord = record.loopRecords.get(
      structureRecordKey([], loopStartId),
    )!;
    expect(outerRecord.totalIterations).toBeGreaterThanOrEqual(2);

    const innerLoopKey = structureRecordKey(
      [groupInstanceId],
      templateLoopStartId!,
    );

    // The group really did re-execute — one wrapper step per outer iteration,
    // so K was completed under its identity key MORE THAN ONCE.
    const wrapperSteps = record.steps.filter(
      (step) => step.nodeId === groupInstanceId,
    );
    expect(wrapperSteps.length).toBe(outerRecord.totalIterations);

    // THE pin: the surviving (last) group record still carries K.
    const groupRecord = record.groupRecords.get(
      structureRecordKey([], groupInstanceId),
    );
    expect(groupRecord).toBeDefined();
    // The innerRecord is ONE scope's window, not an accumulation — exactly one
    // run of the subtree's math node. Together with the wrapper count above,
    // that makes this the LAST execution's scope, opened when K's key already
    // existed: a key-novelty filter would hand back an EMPTY loopRecords map
    // here, which is precisely the Class A bug.
    expect(
      groupRecord!.innerRecord.steps.filter(
        (step) => step.nodeId === templateMathId,
      ),
    ).toHaveLength(1);
    expect(Array.from(groupRecord!.innerRecord.loopRecords.keys())).toEqual([
      innerLoopKey,
    ]);
    // ONE record for the identity at top level too — re-execution replaces
    // its own record rather than accumulating aliases.
    expect(
      Array.from(record.loopRecords.keys()).filter(
        (key) => key === innerLoopKey,
      ),
    ).toHaveLength(1);
    expect(record.loopRecords.get(innerLoopKey)!.ownerInstancePath).toEqual([
      groupInstanceId,
    ]);
  });

  /**
   * F3 pin (7) — the group-side twin of pin (6).
   *
   * `executeGroupScope` builds `parentLoopFields` above its early validation
   * errors, so a group that fails BEFORE its scope opens still records a step
   * that the parent loop's iteration can claim. The surgery differs from pin
   * (6)'s: this branch consults `state.typeOfNodes`, never `state.nodes`, so
   * the lever is removing the group's TYPE from the execute-time state (the
   * plan was compiled while the type still existed).
   */
  it('files a group-with-missing-TYPE early error step into the enclosing loop’s iteration (F3 pin 7)', async () => {
    const { state, groupTypeId, groupInstanceId, loopStartId } =
      buildGroupInsideLoopGraph();

    const plan = compile<string, string, SupportedUnderlyingTypes, z.ZodType>(
      state,
      sdfImplementations,
      { maxLoopIterations: 10 },
    );

    const typeOfNodesWithoutGroup = { ...state.typeOfNodes };
    delete typeOfNodesWithoutGroup[groupTypeId];
    const stateWithoutGroupType: MixedState = {
      ...state,
      typeOfNodes: typeOfNodesWithoutGroup,
    };

    const record = await execute<
      string,
      string,
      SupportedUnderlyingTypes,
      z.ZodType
    >(plan, sdfImplementations, stateWithoutGroupType, {
      onNodeStateChange: () => {},
      abortSignal: new AbortController().signal,
    });

    const errorSteps = record.steps.filter(
      (step) => step.status === 'errored' && step.nodeId === groupInstanceId,
    );
    expect(errorSteps.length).toBeGreaterThan(0);

    const loopRecord = record.loopRecords.get(
      structureRecordKey([], loopStartId),
    );
    expect(loopRecord).toBeDefined();

    for (const errorStep of errorSteps) {
      // THE pin: the enclosing loop's routing fields are present...
      expect(errorStep.parentLoopStructureId).toBe(loopStartId);
      expect(errorStep.parentLoopIteration).toBeDefined();
      // ...the step carries the PARENT scope's instance path (a group's own
      // steps never carry its own instance id — that is what separates a
      // group's wrapper step from the steps inside it)...
      expect(errorStep.instancePath).toBeUndefined();
      // ...and it lands in the parent iteration record, not just the flat list.
      const parentIteration = loopRecord!.iterations.find(
        (iteration) => iteration.iteration === errorStep.parentLoopIteration,
      );
      expect(parentIteration).toBeDefined();
      expect(parentIteration!.stepRecords).toContain(errorStep);
    }

    // The scope never opened, so no group record was produced — the error
    // step is the ONLY trace, which is precisely why its routing matters.
    expect(
      record.groupRecords.has(structureRecordKey([], groupInstanceId)),
    ).toBe(false);
  });
});

describe('recorder sequential pins — erroring group (S1 pin #4)', () => {
  it('inner error appears in BOTH the innerRecord and the outer record, plus the group wrapper error', async () => {
    let state = createStandardGroupState();
    const created = addGroupType(state);
    state = created.state;
    const groupTypeId = created.groupTypeId;
    state = buildInsideGroup(state, groupTypeId, (opened) =>
      applyGroupAction(opened, {
        type: actionTypesMap.ADD_NODE,
        payload: { type: 'testThrower', position: { x: 0, y: 0 } },
      }),
    );
    state = applyGroupAction(state, {
      type: actionTypesMap.ADD_NODE,
      payload: { type: groupTypeId, position: { x: 0, y: 0 } },
    });
    const instanceId = state.nodes.find(
      (node) => node.data.nodeTypeUniqueId === groupTypeId,
    )!.id;

    const record = await runGroupGraph(state);

    // Outer record: the inner node error AND the group wrapper error — the
    // exact today-behavior the ownership filter must NOT change
    // (`record.errors` feeds node badges + runnerState; endScope only
    // FILTERS the scoped copy, never mutates the outer array).
    expect(record.errors.length).toBe(2);
    const outerErrorNodeIds = record.errors.map((error) => error.nodeId);
    expect(outerErrorNodeIds).toContain(instanceId); // wrapper
    // Inner record: errored status, contains the inner error only.
    const groupRecord = record.groupRecords.get(
      structureRecordKey([], instanceId),
    );
    expect(groupRecord).toBeDefined();
    expect(groupRecord!.innerRecord.status).toBe('errored');
    expect(groupRecord!.innerRecord.errors.length).toBe(1);
    const innerErrorNodeId = groupRecord!.innerRecord.errors[0]!.nodeId;
    expect(outerErrorNodeIds).toContain(innerErrorNodeId);
    // The group's own structural step in the OUTER record is errored.
    const wrapperStep = record.steps.find((step) => step.nodeId === instanceId);
    expect(wrapperStep).toBeDefined();
    expect(wrapperStep!.status).toBe('errored');
  });
});
