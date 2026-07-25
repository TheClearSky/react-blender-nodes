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
import { compile } from '@/utils/nodeRunner/compiler';
import { execute } from '@/utils/nodeRunner/executor';
import { standardNodeCountConstraints } from '@/utils';
import {
  sdfDataTypes,
  sdfNodeTypes,
  sdfImplementations,
  type SdfDataTypeId,
  type SdfNodeTypeId,
} from '@/advancedGraphExamples/sdfStudioDefinitions';

// Build `i = 0; while (Compare: i < targetCount) { i = Math(Add, i, 1) }` in the SDF
// Shape Studio (its Math + Compare nodes) THROUGH THE REDUCER (ADD_NODE +
// ADD_EDGE_BY_REACT_FLOW) so the loop's data-carry handles materialize via inference —
// exactly as a user's clicks would. Proves the Studio's `Compare` node's boolean
// `condition` output drives a loop's "Continue If Condition Is True" input and is
// re-evaluated every iteration. NO extra nodes: the initial `i=0` is a Math node with
// its default (0) inputs. Uses the SAME conversion map the Studio story configures
// (`number ↔ loopInfer`), so this pins the real runtime config.

type StudioState = State<
  SdfDataTypeId,
  SdfNodeTypeId,
  SupportedUnderlyingTypes,
  z.ZodType
>;

function buildMathCounterGraph(targetCount: number) {
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

  function connect(
    sourceNodeId: string,
    sourceHandleId: string,
    targetNodeId: string,
    targetHandleId: string,
  ): void {
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
  }

  function findNode(nodeId: string) {
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Node "${nodeId}" not found`);
    return node;
  }
  // Re-read handle ids after every step (inference grows the loop's channel handles).
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

  // Nodes. `init` is a Math node with default (0) inputs → outputs the initial i=0.
  const initNodeId = addNode('math', { x: 0, y: 0 });
  const loopStartNodeId = addNode('loopStart', { x: 300, y: 0 });
  const incrementNodeId = addNode('math', { x: 600, y: 0 });
  setInputValue(incrementNodeId, 1, 1); // B = 1 (i + 1)
  const compareNodeId = addNode('compare', { x: 600, y: 250 });
  setInputValue(compareNodeId, 1, targetCount); // B = N
  setInputValue(compareNodeId, 2, 'Less Than'); // Op = Less Than (continue while i < N)
  const loopStopNodeId = addNode('loopStop', { x: 900, y: 0 });
  const loopEndNodeId = addNode('loopEnd', { x: 1200, y: 0 });

  // Bind the loop triplet FIRST (region rules depend on it).
  connect(
    loopStartNodeId,
    outputHandleId(loopStartNodeId, 0),
    loopStopNodeId,
    inputHandleId(loopStopNodeId, 0),
  );
  connect(
    loopStopNodeId,
    outputHandleId(loopStopNodeId, 0),
    loopEndNodeId,
    inputHandleId(loopEndNodeId, 0),
  );

  // Carry channel: init(0) → loopStart infer-in → increment.A ; increment(i+1) → loopStop infer-in.
  connect(
    initNodeId,
    outputHandleId(initNodeId, 0),
    loopStartNodeId,
    inputHandleId(loopStartNodeId, loopStartInputInferHandleIndex),
  );
  connect(
    loopStartNodeId,
    outputHandleId(loopStartNodeId, loopStartOutputInferHandleIndex),
    incrementNodeId,
    inputHandleId(incrementNodeId, 0),
  );
  connect(
    incrementNodeId,
    outputHandleId(incrementNodeId, 0),
    loopStopNodeId,
    inputHandleId(loopStopNodeId, loopStopInputInferHandleIndex),
  );

  // Condition: loopStart infer-out (current i) → Compare.A ; Compare(i<N) → loopStop.in[1].
  connect(
    loopStartNodeId,
    outputHandleId(loopStartNodeId, loopStartOutputInferHandleIndex),
    compareNodeId,
    inputHandleId(compareNodeId, 0),
  );
  connect(
    compareNodeId,
    outputHandleId(compareNodeId, 0),
    loopStopNodeId,
    inputHandleId(loopStopNodeId, 1),
  );

  // Post-stop carry → loopEnd (gives the loop an output channel).
  connect(
    loopStopNodeId,
    outputHandleId(loopStopNodeId, loopStopOutputInferHandleIndex),
    loopEndNodeId,
    inputHandleId(loopEndNodeId, loopEndInputInferHandleIndex),
  );

  return { state, incrementNodeId, compareNodeId };
}

async function runGraph(state: StudioState) {
  const plan = compile<
    SdfDataTypeId,
    SdfNodeTypeId,
    SupportedUnderlyingTypes,
    z.ZodType
  >(state, sdfImplementations, { maxLoopIterations: 50 });
  return execute<
    SdfDataTypeId,
    SdfNodeTypeId,
    SupportedUnderlyingTypes,
    z.ZodType
  >(plan, sdfImplementations, state, {
    onNodeStateChange: () => {},
    abortSignal: new AbortController().signal,
  });
}

describe('SDF Studio Math counter loop — Compare drives the loop condition', () => {
  it('terminates via `Compare(i < 5)` (bounded iterations, not the 50 cap)', async () => {
    const { state, incrementNodeId } = buildMathCounterGraph(5);
    const record = await runGraph(state);

    expect(record.status).toBe('completed');
    // The increment (loop body) ran once per iteration; the condition — not the cap —
    // stopped it, so the count is small and well under maxLoopIterations (50).
    const iterations = record.steps.filter(
      (step) => step.nodeId === incrementNodeId,
    ).length;
    // Exactly N+1 body runs (i = 0..5, condition checked after each) → 6, far under
    // the 50 cap. A broken/always-true condition would hit the cap (→ errored) or
    // exit immediately (→ 1) — both fail this exact assertion.
    expect(iterations).toBe(6);
    expect(iterations).toBeLessThan(50);
  });

  it('the comparison THRESHOLD drives the iteration count (N=3 runs fewer than N=8)', async () => {
    const runFor = async (targetCount: number) => {
      const { state, incrementNodeId } = buildMathCounterGraph(targetCount);
      const record = await runGraph(state);
      expect(record.status).toBe('completed');
      return record.steps.filter((step) => step.nodeId === incrementNodeId)
        .length;
    };
    // Exactly N+1 iterations, so the comparison threshold directly sets the count.
    expect(await runFor(3)).toBe(4);
    expect(await runFor(8)).toBe(9);
  });
});
