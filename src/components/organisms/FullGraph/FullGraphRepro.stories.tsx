import { useCallback, useMemo, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FullGraph, useFullGraph } from './';
import { summarizeExecutionRecordForRepro } from './reproRecordSummary';
import { structureRecordKey } from '@/utils/nodeRunner/executionRecorder';
import type { RecorderWarning } from '@/utils/nodeRunner/executionRecorder';
import type { RunEvent } from '@/utils/nodeRunner/types';
import type { GraphRunnerHandle } from './runnerHandle';
import type { RunTarget } from '@/utils/nodeRunner/runTargets/types';
import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { handleShapesMap } from '@/components/organisms/ConfigurableNode';
import {
  standardDataTypes,
  standardNodeTypes,
  standardNodeCountConstraints,
} from '@/utils';
import { makeFunctionImplementationsWithAutoInfer } from '@/utils/nodeRunner/types';
import type { ExecutionRecord } from '@/utils/nodeRunner/types';
import { readInput } from '@/utils/nodeRunner/readInput';

/**
 * REPRO STORY — recorder-concurrency Critical findings (review
 * `review/2026-08-07-full-project/`, findings NS-01 / AU-01 / AU-02).
 *
 * A deliberately SLOW variant of the EmptyRunnerPlayground circuit set: every
 * function implementation awaits a real `setTimeout` delay before computing,
 * so concurrently-executing siblings genuinely overlap in time and the
 * recorder's ambient-stack bugs become visible and deterministic:
 *
 *   - AU-01 — two group scopes open concurrently ⇒ `endScope()` LIFO-pops the
 *     WRONG scope and each group's `innerRecord` absorbs the other's steps.
 *   - AU-02 — two sibling loops begin in the same synchronous window ⇒ the
 *     second is mis-filed as NESTED under the first and its LoopRecord
 *     vanishes from the final ExecutionRecord.
 *   - NS-01 — deleting the edge into the Infer Sink's `inferFromConnection`
 *     input makes `validateAction` mutate frozen committed state (TypeError
 *     escaping dispatch). Reproduced by interaction only — no run needed.
 *
 * The `<pre data-testid="repro-record-summary">` panel below the canvas
 * renders a compact JSON view of the latest ExecutionRecord (top-level steps,
 * per-group innerRecord steps, per-loop iterations and nesting), so both a
 * human and the e2e repro specs can read the corruption directly.
 *
 * Type/impl definitions mirror `circuitExample*` in FullGraph.stories.tsx and
 * MUST keep the same context-menu labels/paths — the e2e helpers
 * (`createLoopStructure`, `addBitInput`, …) and the pre-built fixture
 * `.storybook/static/graphStates/group-two-instances-not-chain-state.json`
 * identify nodes by those labels and type ids.
 *
 * Repro-only artifact: not part of the published library (stories are
 * excluded from the bundle) and safe to delete once the bugs are fixed.
 */

const meta = {
  title: 'Organisms/FullGraphRepro',
  component: FullGraph,
} satisfies Meta<typeof FullGraph>;

export default meta;

const reproDataTypes = {
  bit: makeDataTypeWithAutoInfer({
    name: 'Bit',
    underlyingType: 'boolean',
    color: '#00BFFF',
    shape: handleShapesMap.rectangle,
    allowInput: true,
  }),
  number: makeDataTypeWithAutoInfer({
    name: 'Number',
    underlyingType: 'number',
    color: '#FF6B6B',
    shape: handleShapesMap.circle,
    allowInput: true,
  }),
  gateMode: makeDataTypeWithAutoInfer({
    name: 'Gate Mode',
    underlyingType: 'string',
    color: '#FECA57',
    allowInput: true,
    allowedStrings: ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR'],
  }),
  // NS-01 repro type: a plain inferFromConnection data type, so connecting a
  // concrete `bit` output infers it and DELETING that edge takes the
  // `inferTypesAfterEdgeRemoval` reset branch (the mutating one).
  inferredData: makeDataTypeWithAutoInfer({
    name: 'Inferred Data',
    underlyingType: 'inferFromConnection',
    color: '#C06062',
    shape: handleShapesMap.diamond,
  }),
  ...standardDataTypes,
} as const;

type ReproDataTypeId = keyof typeof reproDataTypes;

const reproTypeOfNodes = {
  andGate: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'andGate'>({
    name: 'AND Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  orGate: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'orGate'>({
    name: 'OR Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  notGate: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'notGate'>({
    name: 'NOT Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  xorGate: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'xorGate'>({
    name: 'XOR Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  nandGate: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'nandGate'>({
    name: 'NAND Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  norGate: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'norGate'>({
    name: 'NOR Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  buffer: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'buffer'>({
    name: 'Buffer',
    headerColor: '#9B0F2B',
    locationInContextMenu: ['Utility'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  anyOf: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'anyOf'>({
    name: 'Any Of (bus OR)',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  bitConstant: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'bitConstant'>({
    name: 'Bit Input',
    headerColor: '#C75B8E',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'Value', dataType: 'bit', allowInput: true }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  bitDisplay: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'bitDisplay'>({
    name: 'Bit Output',
    headerColor: '#4A96BA',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [],
  }),
  numberConstant: makeTypeOfNodeWithAutoInfer<
    ReproDataTypeId,
    'numberConstant'
  >({
    name: 'Number Input',
    headerColor: '#C75B8E',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'Value', dataType: 'number', allowInput: true }],
    outputs: [{ name: 'Out', dataType: 'number' }],
  }),
  numberDisplay: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'numberDisplay'>({
    name: 'Number Output',
    headerColor: '#4A96BA',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'In', dataType: 'number' }],
    outputs: [],
  }),
  counter: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'counter'>({
    name: 'Counter',
    headerColor: '#9B0F2B',
    locationInContextMenu: ['Utility'],
    inputs: [
      { name: 'Count', dataType: 'number', allowInput: true },
      { name: 'Max', dataType: 'number', allowInput: true },
    ],
    outputs: [
      { name: 'Count + 1', dataType: 'number' },
      { name: 'Reached Max', dataType: 'bit' },
    ],
  }),
  configurableGate: makeTypeOfNodeWithAutoInfer<
    ReproDataTypeId,
    'configurableGate'
  >({
    name: 'Configurable Gate',
    headerColor: '#6B5B95',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
      { name: 'Mode', dataType: 'gateMode', allowInput: true },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  // NS-01 repro node: one inferFromConnection input + output. Connect
  // `Bit Input.Out → Inferred In` (commits ⇒ state freezes), then delete that
  // edge — `validateAction`'s removal path Object.assigns onto the frozen
  // handle and throws OUTSIDE dispatch's try/catch.
  inferSink: makeTypeOfNodeWithAutoInfer<ReproDataTypeId, 'inferSink'>({
    name: 'Infer Sink',
    headerColor: '#AB3126',
    locationInContextMenu: ['Inference'],
    inputs: [{ name: 'Inferred In', dataType: 'inferredData' }],
    outputs: [{ name: 'Inferred Out', dataType: 'inferredData' }],
  }),
  ...standardNodeTypes,
} as const;

type ReproNodeTypeId = keyof typeof reproTypeOfNodes;

/**
 * Per-node-type execution delays. Chosen so the repro outcomes are
 * deterministic, not raced:
 *   - AU-02: loop A's body is ONE buffer (≈450 ms/iteration) while loop B's
 *     body is a chain of THREE buffers (≈1350 ms/iteration) ⇒ loop A always
 *     finishes (and runs its nested-record sweep) while loop B is still
 *     mid-iteration ⇒ loop B's record reliably vanishes.
 *   - AU-01: each imported group wraps a NOT gate (900 ms) ⇒ both group
 *     scopes are guaranteed to be open simultaneously.
 */
const reproNodeTypeDelaysInMilliseconds: Record<string, number> = {
  andGate: 300,
  orGate: 300,
  notGate: 900,
  xorGate: 300,
  nandGate: 300,
  norGate: 300,
  buffer: 450,
  anyOf: 300,
  bitConstant: 150,
  bitDisplay: 150,
  numberConstant: 120,
  numberDisplay: 120,
  counter: 250,
  configurableGate: 300,
  inferSink: 200,
};

function waitForMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function firstBoolean(values: unknown[]): boolean {
  return Boolean(values[0]);
}

/**
 * Delayed implementations — same logic as `circuitImplementations` in
 * FullGraph.stories.tsx, but every impl awaits its node type's delay first so
 * sibling steps genuinely overlap in wall-clock time.
 */
const reproImplementations =
  makeFunctionImplementationsWithAutoInfer<ReproNodeTypeId>({
    andGate: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.andGate);
      return new Map([
        [
          'Out',
          firstBoolean(readInput(inputs, 'A')) &&
            firstBoolean(readInput(inputs, 'B')),
        ],
      ]);
    },
    orGate: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.orGate);
      return new Map([
        [
          'Out',
          firstBoolean(readInput(inputs, 'A')) ||
            firstBoolean(readInput(inputs, 'B')),
        ],
      ]);
    },
    notGate: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.notGate);
      return new Map([['Out', !firstBoolean(readInput(inputs, 'In'))]]);
    },
    xorGate: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.xorGate);
      return new Map([
        [
          'Out',
          firstBoolean(readInput(inputs, 'A')) !==
            firstBoolean(readInput(inputs, 'B')),
        ],
      ]);
    },
    nandGate: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.nandGate);
      return new Map([
        [
          'Out',
          !(
            firstBoolean(readInput(inputs, 'A')) &&
            firstBoolean(readInput(inputs, 'B'))
          ),
        ],
      ]);
    },
    norGate: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.norGate);
      return new Map([
        [
          'Out',
          !(
            firstBoolean(readInput(inputs, 'A')) ||
            firstBoolean(readInput(inputs, 'B'))
          ),
        ],
      ]);
    },
    buffer: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.buffer);
      return new Map([['Out', firstBoolean(readInput(inputs, 'In'))]]);
    },
    anyOf: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.anyOf);
      return new Map([
        ['Out', readInput(inputs, 'In').some((value) => Boolean(value))],
      ]);
    },
    bitConstant: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.bitConstant);
      return new Map([['Out', firstBoolean(readInput(inputs, 'Value'))]]);
    },
    bitDisplay: async () => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.bitDisplay);
      return new Map();
    },
    numberConstant: async (inputs) => {
      await waitForMilliseconds(
        reproNodeTypeDelaysInMilliseconds.numberConstant,
      );
      return new Map([['Out', Number(readInput(inputs, 'Value')[0])]]);
    },
    numberDisplay: async () => {
      await waitForMilliseconds(
        reproNodeTypeDelaysInMilliseconds.numberDisplay,
      );
      return new Map();
    },
    counter: async (inputs) => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.counter);
      const count = Number(readInput(inputs, 'Count')[0] ?? 0);
      const max = Number(readInput(inputs, 'Max')[0] ?? 10);
      return new Map<string, unknown>([
        ['Count + 1', count + 1],
        ['Reached Max', count + 1 >= max],
      ]);
    },
    configurableGate: async (inputs) => {
      await waitForMilliseconds(
        reproNodeTypeDelaysInMilliseconds.configurableGate,
      );
      const a = firstBoolean(readInput(inputs, 'A'));
      const b = firstBoolean(readInput(inputs, 'B'));
      const mode = String(readInput(inputs, 'Mode')[0] ?? 'AND');
      const operations: Record<string, (x: boolean, y: boolean) => boolean> = {
        AND: (x, y) => x && y,
        OR: (x, y) => x || y,
        XOR: (x, y) => x !== y,
        NAND: (x, y) => !(x && y),
        NOR: (x, y) => !(x || y),
        XNOR: (x, y) => x === y,
      };
      const operation = operations[mode] ?? operations.AND;
      return new Map([['Out', operation(a, b)]]);
    },
    inferSink: async () => {
      await waitForMilliseconds(reproNodeTypeDelaysInMilliseconds.inferSink);
      return new Map();
    },
  });

/**
 * NEGATIVE CONTROL (Plan C F6, review finding CP-14).
 *
 * `expect(recorderWarnings).toHaveLength(0)` in the AU-01/AU-02 guards is only
 * meaningful if a warning COULD have arrived. Nothing the public UI can do
 * makes the recorder warn any more — that is the fix working — so the channel
 * itself has to be proven live some other way.
 *
 * This run target proves the WHOLE seam: it is handed the very
 * `onRecorderWarning` that `FullGraphProps` received, threaded down through
 * `RunnerOverlay` → `useNodeRunner` → the executor's run context. It emits one
 * synthetic warning, then delegates to the real in-process executor so the run
 * is otherwise completely normal. If any link in that chain breaks, the third
 * repro spec goes red.
 *
 * Enabled only by the `induceRecorderWarning` story arg — with the arg off the
 * story passes NO `runTargets`, so the guard specs see the stock behaviour.
 */
const syntheticWarningRunTargetId = 'repro-synthetic-recorder-warning';

function makeSyntheticWarningRunTarget(): RunTarget<
  ReproDataTypeId,
  ReproNodeTypeId
> {
  return {
    id: syntheticWarningRunTargetId,
    label: 'Run (inject recorder warning)',
    mode: 'execute',
    run: async (context) => {
      const record = await context.runWithInProcessExecutor();
      // AFTER the run, so the warning can carry the finished record's id and
      // land against that run in the summary — the same ordering the
      // recorder's own finalize-time salvage produces.
      context.onRecorderWarning?.({
        kind: 'orphan-promoted',
        key: structureRecordKey([], syntheticWarningRunTargetId),
        message:
          'synthetic negative-control warning — proves the onRecorderWarning channel is wired end to end',
        recordId: record.id,
      });
      return record;
    },
  };
}

/**
 * The repro story's OWN args — deliberately not `FullGraph`'s. Storybook only
 * honours a URL arg it already knows about, so the knob must be declared in
 * `args` (with a default) as well as `argTypes`; declaring it only in
 * `argTypes` leaves `&args=induceRecorderWarning:!true` silently dropped, and
 * the story renders with the knob off while looking like it obeyed.
 */
type ReproStoryArgs = {
  /** Swap in the synthetic-warning run target — see the F6 negative control. */
  induceRecorderWarning: boolean;
};

export const RecorderConcurrencyPlayground: StoryObj<ReproStoryArgs> = {
  args: { induceRecorderWarning: false },
  argTypes: {
    // Storybook control + URL arg (`&args=induceRecorderWarning:!true`), which
    // is how the negative-control spec turns it on.
    induceRecorderWarning: { control: 'boolean' },
  },
  render: (args) => {
    const { state, dispatch } = useFullGraph<ReproDataTypeId, ReproNodeTypeId>({
      dataTypes: reproDataTypes,
      typeOfNodes: reproTypeOfNodes,
      nodes: [],
      edges: [],
      allowedConversionsBetweenDataTypes: {
        bit: {
          condition: true,
        },
        condition: {
          bit: true,
        },
      },
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
    });

    const [record, setRecord] = useState<ExecutionRecord | null>(null);

    // Warnings ACCUMULATE across runs and are attributed to a run by
    // `warning.recordId` inside the summarizer. Clearing on record change
    // would be wrong: finalize emits its warnings BEFORE the finished record
    // reaches this component, so a clear-on-change would erase exactly the
    // warnings the run just produced.
    const [recorderWarnings, setRecorderWarnings] = useState<
      readonly RecorderWarning[]
    >([]);
    const handleRecorderWarning = useCallback((warning: RecorderWarning) => {
      setRecorderWarnings((previous) => [...previous, warning]);
    }, []);

    // The RUN LIFECYCLE stream, accumulated in arrival order.
    //
    // `useNodeRunner` cannot be unit-tested in this repo — the vitest gate runs
    // in a `node` environment and there is no React test renderer — so the only
    // way to assert run identity against the real hook is to surface the stream
    // a consumer actually receives and read it from an e2e spec. The invariants
    // it pins (exactly one terminal event per started run, carrying that run's
    // OWN id; a superseded run never closing the live one) are invisible to
    // every other gate, and two Critical defects hid in exactly that blind spot.
    const [runEvents, setRunEvents] = useState<readonly RunEvent[]>([]);
    const handleRunEvent = useCallback((event: RunEvent) => {
      setRunEvents((previous) => [...previous, event]);
    }, []);

    // The imperative handle, so the story can start a run WITHOUT the panel's
    // gating. That is not a shortcut — it is the only way to reach
    // supersession, because the panel deliberately refuses to start a run
    // while one is open, and it is exactly how a consumer's auto-run reaches
    // it (`GraphRunnerHandle.run`).
    const runnerRef = useRef<GraphRunnerHandle | null>(null);

    const induceRecorderWarning = Boolean(args.induceRecorderWarning);
    const runTargets = useMemo(
      () =>
        induceRecorderWarning ? [makeSyntheticWarningRunTarget()] : undefined,
      [induceRecorderWarning],
    );

    const recordSummary = useMemo(
      () => summarizeExecutionRecordForRepro(record, recorderWarnings),
      [record, recorderWarnings],
    );

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          <FullGraph<ReproDataTypeId, ReproNodeTypeId>
            state={state}
            dispatch={dispatch}
            functionImplementations={reproImplementations}
            executionRecord={record}
            onExecutionRecordChange={setRecord}
            onRecorderWarning={handleRecorderWarning}
            onRunEvent={handleRunEvent}
            runnerRef={runnerRef}
            runTargets={runTargets}
            // The built-in in-process target is ALWAYS prepended and would
            // otherwise stay selected, so the injecting target is named as
            // the default.
            //
            // `defaultRunTargetId` is read ONCE, when the run-target selection
            // is first seeded — so this only takes effect when the arg is set
            // AT MOUNT, which is how the negative-control spec drives it (an
            // `&args=` URL parameter on the iframe). Flipping the control in
            // the Storybook panel afterwards adds the target to the dropdown
            // but does NOT re-select it; pick it from the split Run button, or
            // reload the story with the arg in the URL.
            defaultRunTargetId={
              induceRecorderWarning ? syntheticWarningRunTargetId : undefined
            }
          />
        </div>
        <pre
          data-testid='repro-record-summary'
          style={{
            margin: 0,
            maxHeight: '200px',
            overflow: 'auto',
            background: '#1d1d1d',
            color: '#e6e6e6',
            fontSize: '11px',
            lineHeight: 1.35,
            padding: '8px 12px',
            borderTop: '1px solid #444444',
          }}
        >
          {recordSummary}
        </pre>
        <button
          type='button'
          data-testid='story-force-run'
          onClick={() => runnerRef.current?.run()}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            background: '#303030',
            color: '#e6e6e6',
            border: '1px solid #545454',
            borderTop: 'none',
            cursor: 'pointer',
          }}
        >
          force run (imperative handle)
        </button>
        <button
          type='button'
          data-testid='story-force-double-run'
          // TWO runs opened before either settles — the only way to reach
          // supersession, and a real hazard for any consumer whose auto-run
          // can fire twice in a tick. `handleRun` reads `runnerState` from its
          // render closure, so both calls take the "start" branch.
          onClick={() => {
            runnerRef.current?.run();
            runnerRef.current?.run();
          }}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            background: '#303030',
            color: '#e6e6e6',
            border: '1px solid #545454',
            borderTop: 'none',
            cursor: 'pointer',
          }}
        >
          force double run (supersession)
        </button>
        <pre
          data-testid='repro-run-events'
          style={{
            margin: 0,
            maxHeight: '140px',
            overflow: 'auto',
            background: '#282828',
            color: '#e6e6e6',
            fontSize: '11px',
            lineHeight: 1.35,
            padding: '8px 12px',
            borderTop: '1px solid #444444',
          }}
        >
          {JSON.stringify(runEvents)}
        </pre>
      </div>
    );
  },
};
