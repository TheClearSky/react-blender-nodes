import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { z } from 'zod';
import {
  FullGraph,
  useFullGraph,
  GraphThemeProvider,
} from '@/components/organisms/FullGraph';
import {
  actionTypesMap,
  standardNodeCountConstraints,
  type SupportedUnderlyingTypes,
} from '@/utils';
import { importGraphState } from '@/utils/importExport/stateImport';
import { compile } from '@/utils/nodeRunner';
import { execute } from '@/utils/nodeRunner/executor';
import type { ExecutionRecord } from '@/utils/nodeRunner/types';
import {
  sdfDataTypes,
  sdfImplementations,
  sdfNodePreviews,
  sdfNodeTypes,
  type SdfDataTypeId,
  type SdfNodeTypeId,
} from './sdfStudioDefinitions';
import sdfShowcaseStateJson from '../../.storybook/static/graphStates/sdf-shape-studio-state.json';

// ─────────────────────────────────────────────────────
// SDF Shape Studio — signed-distance-field shapes as first-class edge VALUES.
//
// Every node's implementation returns a closure `(x, y) => distance`;
// operators close over their upstream closures, transforms pre-warp
// coordinates, and the per-node-type PREVIEWS (the `nodePreviews` feature)
// render each node's field with the canonical IQ orange/blue debug
// visualization — the graph is literally visible computing, node by node.
// Masks threshold a field into a black/white image, and measurement nodes
// turn images into NUMBERS (pixel counts / ratios) that can drive any
// parameter downstream. Definitions live in `sdfStudioDefinitions.ts`.
//
// Closures are non-serializable by design, and rendering is MANUAL in the
// Playground: build the graph, then press Run in the runner panel — the
// runner's execution record holds every step value by reference, so the
// closures reach the previews intact. There is NO auto-run on edits;
// previews keep showing the last run until you run again. (The Showcase
// story additionally runs ONCE after its fixture pre-loads, so it opens
// already rendered.)
// ─────────────────────────────────────────────────────

type StoryTheme = 'dark' | 'light';
type StoryFrame = 'full' | 'narrow-390';

function SdfShapeStudioView({
  preloadShowcase = false,
}: {
  preloadShowcase?: boolean;
}) {
  // Input defaults are declared on the node types (`numberParam(name, default)`
  // → `TypeOfInput.defaultValue`) and seeded onto fresh nodes BY CONSTRUCTION —
  // so a new node's sliders are honest immediately, with no post-add
  // UPDATE_INPUT_VALUE seeder (the impls keep matching fallbacks for records
  // loaded without values).
  const { state, dispatch } = useFullGraph<
    SdfDataTypeId,
    SdfNodeTypeId,
    SupportedUnderlyingTypes,
    z.ZodType
  >({
    dataTypes: sdfDataTypes,
    typeOfNodes: sdfNodeTypes,
    nodes: [],
    edges: [],
    // number ↔ loopInfer so the Math nodes can carry a value through a loop (a
    // Compare boolean then drives the loop condition). Complex sdf/mask conversions
    // remain governed by the flag below.
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
    // Seed both runner view prefs OFF for this showcase: no auto-scroll and no
    // canvas-follow-into-groups during a run, so every per-node preview stays put.
    runnerViewPreferences: { autoScroll: false, followIntoGroups: false },
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // The record prop pair is the CONTROLLED round-trip every runner story
  // uses; the Showcase one-shot auto-run below also needs `setRecord`.
  // (Uncontrolled mode — omitting both props — works too since the
  // RecordContext seam fix, but controlled is what the auto-run requires.)
  const [record, setRecord] = useState<ExecutionRecord | null>(null);

  // ── Showcase preload + one-shot auto-run ────────────
  // The fixture goes through the REAL import pipeline (`importGraphState`) —
  // the same validation/repair/rehydration the Import menu uses. Rehydration
  // re-attaches the module-level z.custom schemas onto every handle's
  // dataTypeObject (export strips them), which keeps complex-type validation
  // honest on fixture nodes. Only nodes/edges are taken from the fixture; the
  // live dataTypes/typeOfNodes/config come from this story's definitions.
  const hasPreloaded = useRef(false);
  const hasAutoRun = useRef(false);
  const autoRunAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    if (!preloadShowcase || hasPreloaded.current) return;
    hasPreloaded.current = true;
    const result = importGraphState(JSON.stringify(sdfShowcaseStateJson), {
      dataTypes: sdfDataTypes,
      typeOfNodes: sdfNodeTypes,
    });
    if (!result.success) {
      // Surface loudly and leave the playground empty rather than dispatching
      // a state the validator rejected. Also disarm the one-shot auto-run:
      // otherwise the FIRST node the user adds by hand would flip nodes.length
      // 0→1 and fire the "one-shot" on a one-node graph.
      hasAutoRun.current = true;
      console.error(
        'SDF Showcase fixture failed to import:',
        result.errors,
        result.warnings,
      );
      return;
    }
    const importedNodes = result.data.nodes.map((node) => ({
      ...node,
      selected: false,
    }));
    dispatch({
      type: actionTypesMap.REPLACE_STATE,
      payload: {
        state: {
          ...stateRef.current,
          nodes: importedNodes as unknown as typeof state.nodes,
          edges: result.data.edges as unknown as typeof state.edges,
        },
      },
    });
  }, [preloadShowcase, dispatch, state]);

  // One-shot auto-run so the Showcase opens RENDERED (distinct from the
  // removed auto-run-on-edit: this fires exactly once, after the preload
  // commits). Edits afterwards follow the manual Reset → Run cadence — the
  // panel disables Run while a completed record is loaded.
  useEffect(() => {
    if (!preloadShowcase || hasAutoRun.current) return;
    if (state.nodes.length === 0) return;
    hasAutoRun.current = true;
    const graphState = stateRef.current;
    const abortController = new AbortController();
    autoRunAbortRef.current = abortController;
    try {
      const plan = compile<
        SdfDataTypeId,
        SdfNodeTypeId,
        SupportedUnderlyingTypes,
        z.ZodType
      >(graphState, sdfImplementations);
      void execute<
        SdfDataTypeId,
        SdfNodeTypeId,
        SupportedUnderlyingTypes,
        z.ZodType
      >(plan, sdfImplementations, graphState, {
        onNodeStateChange: () => {},
        abortSignal: abortController.signal,
      })
        .then((freshRecord) => {
          // Drop the result if the story unmounted or the user already Reset
          // (record cleared) / aborted while we were executing — don't
          // resurrect a record the user explicitly discarded.
          if (
            !isMountedRef.current ||
            abortController.signal.aborted ||
            autoRunAbortRef.current !== abortController
          ) {
            return;
          }
          setRecord(freshRecord);
        })
        .catch((error) => {
          console.error('[sdf-studio] Showcase auto-run failed:', error);
        });
    } catch (error) {
      // compile() throws structured errors synchronously — keep them out of
      // the render phase (an uncaught throw here crashes the story tree).
      console.error('[sdf-studio] Showcase auto-run compile failed:', error);
    }
  }, [preloadShowcase, state.nodes.length]);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      autoRunAbortRef.current?.abort();
    },
    [],
  );

  // ── story chrome (theme / frame) ────────────────────
  const [storyTheme, setStoryTheme] = useState<StoryTheme>('dark');
  const [storyFrame, setStoryFrame] = useState<StoryFrame>('full');

  const editor = (
    <FullGraph<
      SdfDataTypeId,
      SdfNodeTypeId,
      SupportedUnderlyingTypes,
      z.ZodType
    >
      state={state}
      dispatch={dispatch}
      functionImplementations={sdfImplementations}
      executionRecord={record}
      onExecutionRecordChange={setRecord}
      nodePreviews={sdfNodePreviews}
      onStateImported={() => console.info('[sdf-studio] state imported')}
      onRecordingImported={() =>
        console.info('[sdf-studio] recording imported')
      }
      onImportError={(errors) =>
        console.error('[sdf-studio] import failed:', errors)
      }
    />
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          padding: '8px 12px',
          background: '#161616',
          borderBottom: '1px solid #303030',
          fontFamily: 'sans-serif',
          fontSize: 13,
          color: '#e6e6e6',
        }}
      >
        <StoryControlGroup
          label='Theme'
          value={storyTheme}
          options={['dark', 'light'] as const}
          onChange={setStoryTheme}
        />
        <StoryControlGroup
          label='Frame'
          value={storyFrame}
          options={['full', 'narrow-390'] as const}
          onChange={setStoryFrame}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {/* Provider OUTSIDE the frame key: theme swaps live, frame remounts. */}
        <GraphThemeProvider
          preset={storyTheme === 'light' ? 'light' : undefined}
        >
          {storyFrame === 'narrow-390' ? (
            <div
              key='narrow-390'
              style={{
                width: 390,
                height: '100%',
                margin: '0 auto',
                border: '1px solid #444444',
              }}
            >
              {editor}
            </div>
          ) : (
            <div key='full' style={{ width: '100%', height: '100%' }}>
              {editor}
            </div>
          )}
        </GraphThemeProvider>
      </div>
    </div>
  );
}

function StoryControlGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly Value[];
  onChange: (next: Value) => void;
}) {
  return (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type='button'
          data-testid={`story-${label.toLowerCase()}-${option}`}
          onClick={() => onChange(option)}
          style={{
            padding: '2px 10px',
            borderRadius: 6,
            border: '1px solid #444444',
            background: option === value ? '#3b82f6' : '#282828',
            color: '#ffffff',
            cursor: 'pointer',
          }}
        >
          {option}
        </button>
      ))}
    </label>
  );
}

const meta = {
  title: 'Advanced Graph Examples/SDF Shape Studio',
  component: FullGraph,
} satisfies Meta<typeof FullGraph>;
export default meta;

/**
 * Build 2D vector art from signed distance fields: add shapes from the
 * context menu (SDF Shapes / Operators / Modify / Transforms / Masks /
 * Measure / Output — plus loops, switches, and node groups), wire them
 * together, and press **Run** in the runner panel — every node's preview
 * renders its recorded value: the IQ orange/blue debug view on field nodes,
 * binary black/white on masks, pixel counts and ratios on measurement nodes,
 * and an anti-aliased palette fill on Render. There is no auto-run: previews
 * keep the last run's output until you Reset → Run again.
 */
export const Playground: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => <SdfShapeStudioView />,
};

/**
 * A pre-built demonstration graph (authored in the Playground via the UI and
 * exported through the Import/Export menu): a Heart, shrunk and pushed
 * off-center, radially repeated into a six-petal ring, smooth-unioned onto a
 * central Circle, then split two ways — a glowing palette Render, and a
 * Less-Than mask whose Measure Mask reports the artwork's pixel coverage.
 * The story runs ONCE automatically after the fixture loads, so it opens
 * already rendered; tweak any slider and Reset → Run to riff on it (Run is
 * disabled while a completed record is loaded — Reset first).
 */
export const Showcase: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => <SdfShapeStudioView preloadShowcase />,
};
