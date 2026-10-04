import { useState, useRef, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toaster, toast } from 'sonner';

import { StickyNote } from 'lucide-react';

import { FullGraph, useFullGraph, GraphThemeProvider } from './';
import type {
  GraphBottomDrawer,
  NodePreviewProps,
  NodePreviewRegistry,
} from './';
import type { GraphTheme, GraphThemePresetName } from '@/utils/theme';
import { Position } from '@xyflow/react';
import { type Nodes, type Edges } from './types';
import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
  makeStateWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { handleShapesMap } from '@/components/organisms/ConfigurableNode';
import state1 from './PlaygroundState1.json';
import { z } from 'zod';
import {
  standardDataTypes,
  standardNodeTypes,
  standardNodeCountConstraints,
  standardHiddenNodeTypesInContextMenu,
  mainReducer,
  actionTypesMap,
  loopStartInputInferHandleIndex,
  loopStartOutputInferHandleIndex,
  loopStopInputInferHandleIndex,
  loopStopOutputInferHandleIndex,
  loopEndInputInferHandleIndex,
  loopEndOutputInferHandleIndex,
  type SupportedUnderlyingTypes,
  type State,
} from '@/utils';
import { makeFunctionImplementationsWithAutoInfer } from '@/utils/nodeRunner/types';
import { constructNodeOfType } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import { readInput } from '@/utils/nodeRunner/readInput';
import type {
  InputHandleValue,
  ExecutionRecord,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/types';
import { importExecutionRecord } from '@/utils/importExport';
import { ColorPicker } from '@/components/molecules/ColorPicker/ColorPicker';
import type { OklchColor } from '@/components/molecules/ColorPicker/lib/types';
import adderLoopState from '../../../../.storybook/static/graphStates/adder-state-with-inner-noop-loop.json';
import adderLoopRecordingJson from '../../../../.storybook/static/graphStates/adder-state-with-inner-noop-loop-instant.json';
import previewDemoState from '../../../../.storybook/static/graphStates/preview-demo-and-gate-state.json';
import previewDemoRecordingJson from '../../../../.storybook/static/graphStates/preview-demo-and-gate-recording.json';
import groupTwoInstancesState from '../../../../.storybook/static/graphStates/group-two-instances-not-chain-state.json';
import groupTwoInstancesRecordingJson from '../../../../.storybook/static/graphStates/group-two-instances-not-chain-recording.json';
import { formatGraphError } from '@/utils/nodeRunner/runTargets';

// Parse the recording JSON at module level (runs once)
const adderLoopRecordingResult = importExecutionRecord(
  JSON.stringify(adderLoopRecordingJson),
  { repair: { sanitizeNonSerializableValues: true, removeOrphanSteps: true } },
);
const adderLoopRecording: ExecutionRecord | undefined =
  adderLoopRecordingResult.success ? adderLoopRecordingResult.data : undefined;

const meta = {
  title: 'Organisms/FullGraph',
  component: FullGraph,
} satisfies Meta<typeof FullGraph>;

export default meta;

const exampleDataTypes = {
  rawData: makeDataTypeWithAutoInfer({
    name: 'Raw Data',
    underlyingType: 'string',
    color: '#00BFFF',
    shape: handleShapesMap.square,
  }),
  validationRules: makeDataTypeWithAutoInfer({
    name: 'Validation Rules',
    underlyingType: 'string',
    color: '#96CEB4',
  }),
  validatedData: makeDataTypeWithAutoInfer({
    name: 'Validated Data',
    underlyingType: 'string',
    color: '#00FFFF',
    shape: handleShapesMap.list,
  }),
  validationStatus: makeDataTypeWithAutoInfer({
    name: 'Validation Status',
    underlyingType: 'string',
    color: '#FECA57',
  }),
  errorMessages: makeDataTypeWithAutoInfer({
    name: 'Error Messages',
    underlyingType: 'string',
    color: '#FF6B6B',
    shape: handleShapesMap.rectangle,
  }),
  primaryOutput: makeDataTypeWithAutoInfer({
    name: 'Primary Output',
    underlyingType: 'number',
    color: '#FF6B6B',
    shape: handleShapesMap.grid,
  }),
  secondaryOutput: makeDataTypeWithAutoInfer({
    name: 'Secondary Output',
    underlyingType: 'number',
    color: '#00FFFF',
  }),
  metadataOutput: makeDataTypeWithAutoInfer({
    name: 'Metadata Output',
    underlyingType: 'string',
    color: '#FECA57',
  }),
  textInput: makeDataTypeWithAutoInfer({
    name: 'Text Input',
    underlyingType: 'string',
    color: '#00BFFF',
    shape: handleShapesMap.rectangle,
  }),
  numericInput: makeDataTypeWithAutoInfer({
    name: 'Numeric Input',
    underlyingType: 'number',
    color: '#96CEB4',
  }),
  inputString: makeDataTypeWithAutoInfer({
    name: 'Input String',
    underlyingType: 'string',
    color: '#00BFFF',
    shape: handleShapesMap.diamond,
  }),
  inputNumber: makeDataTypeWithAutoInfer({
    name: 'Input Number',
    underlyingType: 'number',
    color: '#96CEB4',
    shape: handleShapesMap.hexagon,
  }),
  configInput: makeDataTypeWithAutoInfer({
    name: 'Config Input',
    underlyingType: 'string',
    color: '#00FFFF',
  }),
  transformedString: makeDataTypeWithAutoInfer({
    name: 'Transformed String',
    underlyingType: 'string',
    color: '#FECA57',
    shape: handleShapesMap.square,
  }),
  transformedNumber: makeDataTypeWithAutoInfer({
    name: 'Transformed Number',
    underlyingType: 'number',
    color: '#FF9FF3',
    shape: handleShapesMap.star,
  }),
  statusOutput: makeDataTypeWithAutoInfer({
    name: 'Status Output',
    underlyingType: 'string',
    color: '#A8E6CF',
    shape: handleShapesMap.cross,
  }),
  primaryInput: makeDataTypeWithAutoInfer({
    name: 'Primary Input',
    underlyingType: 'string',
    color: '#00BFFF',
    shape: handleShapesMap.diamond,
  }),
  thresholdValue: makeDataTypeWithAutoInfer({
    name: 'Threshold Value',
    underlyingType: 'number',
    color: '#96CEB4',
    shape: handleShapesMap.trapezium,
    allowInput: true,
  }),
  configurationString: makeDataTypeWithAutoInfer({
    name: 'Configuration String',
    underlyingType: 'string',
    color: '#00FFFF',
    allowInput: true,
  }),
  maxIterations: makeDataTypeWithAutoInfer({
    name: 'Max Iterations',
    underlyingType: 'number',
    color: '#FF6B6B',
    shape: handleShapesMap.cross,
  }),
  debugMode: makeDataTypeWithAutoInfer({
    name: 'Debug Mode',
    underlyingType: 'string',
    color: '#FECA57',
  }),
  verboseLogging: makeDataTypeWithAutoInfer({
    name: 'Verbose Logging',
    underlyingType: 'string',
    color: '#FF9FF3',
  }),
  secondaryInput: makeDataTypeWithAutoInfer({
    name: 'Secondary Input',
    underlyingType: 'number',
    color: '#A8E6CF',
  }),
  finalResult: makeDataTypeWithAutoInfer({
    name: 'Final Result',
    underlyingType: 'string',
    color: '#FFD93D',
  }),
  debugOutput: makeDataTypeWithAutoInfer({
    name: 'Debug Output',
    underlyingType: 'string',
    color: '#FF6B6B',
  }),
  finalInput: makeDataTypeWithAutoInfer({
    name: 'Final Input',
    underlyingType: 'string',
    color: '#FECA57',
    shape: handleShapesMap.sparkle,
  }),
  resultInput: makeDataTypeWithAutoInfer({
    name: 'Result Input',
    underlyingType: 'number',
    color: '#FF9FF3',
    shape: handleShapesMap.parallelogram,
  }),
  statusInput: makeDataTypeWithAutoInfer({
    name: 'Status Input',
    underlyingType: 'string',
    color: '#A8E6CF',
    shape: handleShapesMap.zigzag,
  }),
  finalOutput: makeDataTypeWithAutoInfer({
    name: 'Final Output',
    underlyingType: 'string',
    color: '#A8E6CF',
  }),
  resultOutput: makeDataTypeWithAutoInfer({
    name: 'Result Output',
    underlyingType: 'number',
    color: '#FFD93D',
  }),
  inferredDataType: makeDataTypeWithAutoInfer({
    name: 'Inferred Data',
    underlyingType: 'inferFromConnection',
    color: '#C06062',
    shape: handleShapesMap.list,
  }),
  secondInferredDataType: makeDataTypeWithAutoInfer({
    name: 'Second Inferred Data',
    underlyingType: 'inferFromConnection',
    color: '#A98AD9',
    shape: handleShapesMap.diamond,
  }),
  thirdInferredDataType: makeDataTypeWithAutoInfer({
    name: 'Third Inferred Data',
    underlyingType: 'inferFromConnection',
    color: '#08B49F',
    shape: handleShapesMap.diamond,
  }),
  complexDataType: makeDataTypeWithAutoInfer({
    name: 'Complex Data',
    underlyingType: 'complex',
    color: '#59BE26',
    complexSchema: z.object({
      name: z.string(),
      age: z.number(),
    }),
    shape: handleShapesMap.trapezium,
  }),
  complexDataType2: makeDataTypeWithAutoInfer({
    name: 'Complex Data 2',
    underlyingType: 'complex',
    color: '#C40E1E',
    complexSchema: z.object({
      name: z.string(),
      age: z.number(),
    }),
    shape: handleShapesMap.trapezium,
  }),
  complexDataType3: makeDataTypeWithAutoInfer({
    name: 'Complex Data 3',
    underlyingType: 'complex',
    color: '#DCEF88',
    complexSchema: z.object({
      name: z.string(),
    }),
    shape: handleShapesMap.trapezium,
  }),
  booleanDataType: makeDataTypeWithAutoInfer({
    name: 'Boolean Data',
    underlyingType: 'boolean',
    color: '#FF6B6B',
    shape: handleShapesMap.diamond,
    allowInput: true,
  }),
  ...standardDataTypes,
};

const exampleTypeOfNodes = {
  inputValidator: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Input Validator',
    headerColor: '#C44536',
    locationInContextMenu: ['Data'],
    inputs: [
      { name: 'Raw Data', dataType: 'rawData' },
      { name: 'Validation Rules', dataType: 'validationRules' },
    ],
    outputs: [
      { name: 'Validated Data', dataType: 'validatedData' },
      { name: 'Validation Status', dataType: 'validationStatus' },
      { name: 'Error Messages', dataType: 'errorMessages' },
    ],
  }),
  dataSource: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Data Source',
    headerColor: '#C44536',
    locationInContextMenu: ['Data'],
    inputs: [
      { name: 'Text Input', dataType: 'textInput' },
      { name: 'Numeric Input', dataType: 'numericInput' },
    ],
    outputs: [
      { name: 'Primary Output', dataType: 'primaryOutput' },
      { name: 'Secondary Output', dataType: 'secondaryOutput' },
      { name: 'Metadata Output', dataType: 'metadataOutput' },
    ],
  }),
  dataTransformer: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Data Transformer',
    headerColor: '#2D5A87',
    locationInContextMenu: ['Processing'],
    inputs: [
      { name: 'Input String', dataType: 'inputString' },
      { name: 'Input Number', dataType: 'inputNumber' },
      { name: 'Config Input', dataType: 'configInput' },
    ],
    outputs: [
      { name: 'Transformed String', dataType: 'transformedString' },
      { name: 'Transformed Number', dataType: 'transformedNumber' },
      { name: 'Status Output', dataType: 'statusOutput' },
    ],
  }),
  advancedProcessor: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>(
    {
      name: 'Advanced Processor',
      headerColor: '#B8860B',
      locationInContextMenu: ['Processing'],
      inputs: [
        { name: 'Primary Input', dataType: 'primaryInput' },
        {
          name: 'Advanced Settings',
          inputs: [
            { name: 'Threshold Value', dataType: 'thresholdValue' },
            { name: 'Configuration String', dataType: 'configurationString' },
            { name: 'Max Iterations', dataType: 'maxIterations' },
          ],
        },
        {
          name: 'Debug Options',
          inputs: [
            { name: 'Debug Mode', dataType: 'debugMode' },
            { name: 'Verbose Logging', dataType: 'verboseLogging' },
          ],
        },
        { name: 'Secondary Input', dataType: 'secondaryInput' },
      ],
      outputs: [
        { name: 'Final Result', dataType: 'finalResult' },
        { name: 'Debug Output', dataType: 'debugOutput' },
      ],
    },
  ),
  dataSink: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Data Sink',
    headerColor: '#B8860B',
    locationInContextMenu: ['Data'],
    inputs: [
      { name: 'Final Input', dataType: 'finalInput' },
      { name: 'Result Input', dataType: 'resultInput' },
      { name: 'Status Input', dataType: 'statusInput' },
    ],
    outputs: [
      { name: 'Final Output', dataType: 'finalOutput' },
      { name: 'Result Output', dataType: 'resultOutput' },
    ],
  }),
  inferNode: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Infer Node',
    headerColor: '#AB3126',
    locationInContextMenu: ['Inference'],
    inputs: [
      { name: 'Inferred Data Input', dataType: 'inferredDataType' },
      {
        name: 'Second Inferred Data Input',
        dataType: 'secondInferredDataType',
      },
      {
        name: 'Second Inferred Data Input 2',
        dataType: 'secondInferredDataType',
      },
    ],
    outputs: [
      { name: 'Inferred Data Output', dataType: 'inferredDataType' },
      { name: 'Inferred Data Output 2', dataType: 'inferredDataType' },
      { name: 'Third Inferred Data Output', dataType: 'thirdInferredDataType' },
      {
        name: 'Third Inferred Data Output 2',
        dataType: 'thirdInferredDataType',
      },
    ],
  }),
  complexDataTypeNode: makeTypeOfNodeWithAutoInfer<
    keyof typeof exampleDataTypes
  >({
    name: 'Complex Data Type Node',
    headerColor: '#A64622',
    locationInContextMenu: ['Complex Types'],
    inputs: [
      { name: 'Complex Input Of Type 1', dataType: 'complexDataType' },
      { name: 'Complex Input Of Type 2', dataType: 'complexDataType2' },
    ],
    outputs: [
      { name: 'Complex Output Of Type 2', dataType: 'complexDataType2' },
      { name: 'Complex Output Of Type 1', dataType: 'complexDataType' },
    ],
  }),
  complexDataTypeNode2: makeTypeOfNodeWithAutoInfer<
    keyof typeof exampleDataTypes
  >({
    name: 'Complex Data Type Node 2',
    headerColor: '#A64622',
    locationInContextMenu: ['Complex Types'],
    inputs: [
      { name: 'Complex Input Of Type 3', dataType: 'complexDataType3' },
      { name: 'Complex Input Of Type 2', dataType: 'complexDataType2' },
    ],
    outputs: [
      { name: 'Complex Output Of Type 2', dataType: 'complexDataType2' },
      { name: 'Complex Output Of Type 3', dataType: 'complexDataType3' },
    ],
  }),
  booleanNode: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Boolean Node',
    headerColor: '#A64622',
    locationInContextMenu: ['Utility'],
    inputs: [{ name: 'Boolean Input', dataType: 'booleanDataType' }],
    outputs: [{ name: 'Boolean Output', dataType: 'booleanDataType' }],
  }),
  ...standardNodeTypes,
};

// Placeholder implementations for the abstract demo graph. They make the
// ThemedPlayground graph genuinely runnable (so the runner/timeline/inspector
// theming has real data to show) and, crucially, silence the per-node
// "missing function implementation" compile warnings that an empty
// `functionImplementations={{}}` would surface on every node. Output keys are
// handle NAMES; values are type-appropriate placeholders.
const exampleImplementations = makeFunctionImplementationsWithAutoInfer<
  keyof typeof exampleTypeOfNodes
>({
  inputValidator: () =>
    new Map<string, unknown>([
      ['Validated Data', 'validated'],
      ['Validation Status', 'ok'],
      ['Error Messages', ''],
    ]),
  dataSource: () =>
    new Map<string, unknown>([
      ['Primary Output', 42],
      ['Secondary Output', 7],
      ['Metadata Output', 'meta'],
    ]),
  dataTransformer: () =>
    new Map<string, unknown>([
      ['Transformed String', 'transformed'],
      ['Transformed Number', 100],
      ['Status Output', 'done'],
    ]),
  advancedProcessor: () =>
    new Map<string, unknown>([
      ['Final Result', 'result'],
      ['Debug Output', 'debug'],
    ]),
  dataSink: () =>
    new Map<string, unknown>([
      ['Final Output', 'final'],
      ['Result Output', 0],
    ]),
});

export const Playground: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      enableTypeInference: true,
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      nodes: state1.nodes as Nodes,
      edges: state1.edges as Edges,
    });

    return <FullGraph state={state} dispatch={dispatch} />;
  },
};

// ─────────────────────────────────────────────────────
// ThemedPlayground — a gallery of wildly different GraphThemes
// ─────────────────────────────────────────────────────

// Per-theme descendant text recolors (mechanism 3 in themingDoc.md). A theme
// that replaces a container slot must re-supply these, because slot strings
// REPLACE the preset's slot string wholesale.
const NEON_TEXT =
  'rbn:[&_.rbn\\:text-primary-white]:text-fuchsia-100 rbn:[&_.rbn\\:text-secondary-light-gray]:text-fuchsia-300/80 rbn:[&_.rbn\\:text-secondary-dark-gray]:text-fuchsia-400/60';
const TERMINAL_TEXT =
  'rbn:[&_.rbn\\:text-primary-white]:text-green-300 rbn:[&_.rbn\\:text-secondary-light-gray]:text-green-500/80 rbn:[&_.rbn\\:text-secondary-dark-gray]:text-green-700 rbn:[&_*]:font-mono';
const PAPER_TEXT =
  'rbn:[&_.rbn\\:text-primary-white]:text-stone-800 rbn:[&_.rbn\\:text-secondary-light-gray]:text-stone-500 rbn:[&_.rbn\\:text-secondary-dark-gray]:text-stone-400';
const OCEAN_TEXT =
  'rbn:[&_.rbn\\:text-primary-white]:text-sky-100 rbn:[&_.rbn\\:text-secondary-light-gray]:text-sky-300/80 rbn:[&_.rbn\\:text-secondary-dark-gray]:text-sky-500/60';
const BLUEPRINT_TEXT =
  'rbn:[&_.rbn\\:text-primary-white]:text-sky-50 rbn:[&_.rbn\\:text-secondary-light-gray]:text-sky-200/80 rbn:[&_.rbn\\:text-secondary-dark-gray]:text-sky-300/50';
const POP_TEXT =
  'rbn:[&_.rbn\\:text-primary-white]:text-black rbn:[&_.rbn\\:text-secondary-light-gray]:text-stone-600 rbn:[&_.rbn\\:text-secondary-dark-gray]:text-stone-400';
const STAR_TEXT =
  'rbn:[&_.rbn\\:text-primary-white]:text-violet-100 rbn:[&_.rbn\\:text-secondary-light-gray]:text-violet-300/80 rbn:[&_.rbn\\:text-secondary-dark-gray]:text-violet-400/60';
const NOTEBOOK_TEXT =
  'rbn:[&_.rbn\\:text-primary-white]:text-slate-800 rbn:[&_.rbn\\:text-secondary-light-gray]:text-slate-500 rbn:[&_.rbn\\:text-secondary-dark-gray]:text-slate-400';
const LOGO_TEXT =
  'rbn:[&_.rbn\\:text-primary-white]:text-[#dce9fb] rbn:[&_.rbn\\:text-secondary-light-gray]:text-[#a1ccf7] rbn:[&_.rbn\\:text-secondary-dark-gray]:text-[#5a76b8]';

/** Cyberpunk magenta/cyan on near-black violet. */
const neonHeistTheme: GraphTheme = {
  root: [
    'rbn:bg-[#0b0014]',
    'rbn:[--color-graph-menu-bg:#150022]',
    'rbn:[--color-graph-menu-item-hover-bg:#3b0a5e]',
    'rbn:[--color-graph-elevated-surface-bg:#10001d]',
    'rbn:[--color-graph-node-panel-content-bg:#1d0033]',
    'rbn:[--color-timeline-loop-accent:#ff2bd6]',
    'rbn:[--color-timeline-switch-accent:#00ffd5]',
    'rbn:[--color-timeline-scrubber-active:#ff2bd6]',
    'rbn:[--color-timeline-scrubber-line:rgba(255,43,214,0.55)]',
    'rbn:[--color-timeline-scrubber-line-active:rgba(255,43,214,0.85)]',
    'rbn:[--color-runner-muted-text:#b07ad1]',
    'rbn:[--color-timeline-hover-text:#ffd6f7]',
    'rbn:[--color-edge-value-pill-bg:#1a0030]',
    'rbn:[--color-edge-value-pill-border:#ff2bd6]',
    'rbn:[--color-edge-value-pill-text:#ffd6f7]',
    'rbn:[--color-graph-scrollbar-thumb:#5b2a86]',
    'rbn:[--color-timeline-scrollbar-thumb:#5b2a86]',
    'rbn:[--color-timeline-scrollbar-track:#150022]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#1a0030]',
    'rbn:[--color-runner-resize-handle-bg:#1a0030]',
    'rbn:[--color-runner-resize-handle-hover-bg:#2a0845]',
    'rbn:[--color-graph-toggle-track-bg:#1a0030]',
    'rbn:[--color-drag-list-item-hover-bg:#3b0a5e]',
    'rbn:[--color-running-glow-strong:rgba(255,43,214,0.5)]',
    'rbn:[--color-running-glow-soft:rgba(255,43,214,0.3)]',
  ].join(' '),
  reactFlow: {
    colorMode: 'dark',
    background: {
      variant: 'lines',
      color: '#21063a',
      bgColor: '#0b0014',
      gap: 36,
    },
    miniMap: {
      bgColor: '#150022',
      maskColor: 'rgba(21, 0, 34, 0.72)',
      nodeColor: '#3a1463',
      nodeStrokeColor: '#ff2bd6',
    },
  },
  node: {
    container:
      'rbn:in-[.selected]:border-fuchsia-400 rbn:focus:border-fuchsia-400 rbn:shadow-[0_0_24px_rgba(255,43,214,0.18)]',
    header: 'rbn:uppercase rbn:tracking-[0.12em] rbn:text-[20px]',
    body: 'rbn:bg-[#1e0238] rbn:border-x rbn:border-b rbn:border-fuchsia-500/50',
    inputField:
      'rbn:bg-[#1d0033] rbn:border-fuchsia-500/40 rbn:text-fuchsia-100',
  },
  // The shared portaled-popover surface — themes BOTH the runner overflow menus
  // and the connection-order reorder badge at once (root vars can't reach a portal).
  popover: {
    surface: `rbn:[--color-graph-elevated-surface-bg:#10001d] rbn:border-fuchsia-500/30 ${NEON_TEXT}`,
  },
  statusIndicator: {
    tooltip: 'rbn:bg-[#150022] rbn:border-fuchsia-400/60 rbn:text-fuchsia-100',
  },
  contextMenu: {
    list: 'rbn:bg-[#150022] rbn:border rbn:border-fuchsia-500/30 rbn:shadow-[0_0_30px_rgba(255,43,214,0.25)]',
    item: 'rbn:hover:bg-fuchsia-500/20',
    itemLabel: 'rbn:text-fuchsia-100',
    shortcut: 'rbn:text-fuchsia-400/70',
    separator: 'rbn:border-fuchsia-500/30',
    submenuPanel:
      'rbn:bg-[#150022] rbn:border rbn:border-fuchsia-500/30 rbn:shadow-[0_0_30px_rgba(255,43,214,0.25)]',
  },
  breadcrumbs: {
    backButton:
      'rbn:bg-[#150022] rbn:border-fuchsia-500/40 rbn:text-fuchsia-100',
    selectTrigger:
      'rbn:bg-[#150022] rbn:border-fuchsia-500/40 rbn:text-fuchsia-100 rbn:hover:bg-fuchsia-500/20',
    list: 'rbn:text-fuchsia-100',
    editButton: 'rbn:text-fuchsia-100 rbn:hover:bg-fuchsia-500/20',
  },
  runnerToggleButton:
    'rbn:bg-[#150022]/90 rbn:border-fuchsia-500/40 rbn:text-fuchsia-100 rbn:hover:bg-fuchsia-500/20',
  runnerPanel: {
    container: `rbn:bg-[#10001d] rbn:border-fuchsia-500/30 ${NEON_TEXT}`,
    overflowMenu: `rbn:[--color-graph-elevated-surface-bg:#10001d] rbn:[--color-graph-toggle-track-bg:#1a0030] rbn:border-fuchsia-500/30 ${NEON_TEXT}`,
    overflowMenuItem: 'rbn:hover:bg-fuchsia-500/20',
    overflowMenuItemActive: 'rbn:bg-fuchsia-500/30 rbn:text-fuchsia-50',
  },
  runControls: {
    container: 'rbn:bg-[#150022] rbn:border-fuchsia-500/20',
    playButton: 'rbn:bg-fuchsia-600 rbn:shadow-[0_0_16px_rgba(255,43,214,0.6)]',
    divider: 'rbn:bg-fuchsia-500/30',
  },
  timeline: {
    container: `rbn:bg-[#10001d] ${NEON_TEXT}`,
    toolbar: 'rbn:bg-[#10001d]',
    trackArea: 'rbn:bg-[#0b0014] rbn:border-fuchsia-500/20',
    ruler: 'rbn:bg-[#1a0030]',
    navButton: 'rbn:border-fuchsia-500/30',
  },
  inspector: {
    container: `rbn:bg-[#10001d] ${NEON_TEXT}`,
    sectionHeader:
      'rbn:bg-[#1a0030] rbn:text-fuchsia-100 rbn:border-fuchsia-500/20',
    valueBox: 'rbn:bg-[#150022] rbn:border-fuchsia-500/30 rbn:text-fuchsia-100',
    timelineBox: 'rbn:bg-[#150022] rbn:border-fuchsia-500/30',
  },
  drawer: {
    container: `rbn:bg-[#10001d] rbn:border-fuchsia-500/30 ${NEON_TEXT}`,
    title: 'rbn:text-fuchsia-100',
    label: 'rbn:text-fuchsia-200',
    footerButton: 'rbn:border-fuchsia-500/40',
  },
  modal: {
    content: `rbn:bg-[#150022] rbn:border-fuchsia-500/30 ${NEON_TEXT}`,
    title: 'rbn:text-fuchsia-100',
  },
  connectionMiniMap: { container: 'rbn:border-fuchsia-500/30' },
  dragList: {
    row: 'rbn:bg-[#1d0033] rbn:text-fuchsia-100 rbn:hover:bg-fuchsia-500/20',
    preview: 'rbn:bg-[#1d0033] rbn:border-fuchsia-500/40',
  },
  select: {
    trigger: 'rbn:bg-[#1d0033] rbn:text-fuchsia-100 rbn:border-fuchsia-500/30',
    content: `rbn:bg-[#150022] rbn:border-fuchsia-500/30 rbn:text-fuchsia-100 ${NEON_TEXT}`,
    item: 'rbn:hover:bg-fuchsia-500/20',
  },
  tooltip: {
    content: `rbn:bg-[#150022] rbn:border-fuchsia-400/60 rbn:text-fuchsia-100 ${NEON_TEXT}`,
  },
};

/** Phosphor-green CRT: pure black, monospace, grayscale node headers. */
const terminalGreenTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rbn:rounded-none rbn:[--color-graph-elevated-surface-bg:#020a04] rbn:[--color-graph-toggle-track-bg:#01140a] rbn:border-green-500/30 ${TERMINAL_TEXT}`,
  },
  root: [
    'rbn:bg-black',
    'rbn:[--color-graph-menu-bg:#000000]',
    'rbn:[--color-graph-menu-item-hover-bg:#052e16]',
    'rbn:[--color-graph-elevated-surface-bg:#020a04]',
    'rbn:[--color-graph-node-panel-content-bg:#01140a]',
    'rbn:[--color-timeline-loop-accent:#22c55e]',
    'rbn:[--color-timeline-switch-accent:#a3e635]',
    'rbn:[--color-timeline-scrubber-active:#22c55e]',
    'rbn:[--color-timeline-scrubber-line:rgba(34,197,94,0.55)]',
    'rbn:[--color-timeline-scrubber-line-active:rgba(34,197,94,0.85)]',
    'rbn:[--color-runner-muted-text:#16a34a]',
    'rbn:[--color-timeline-hover-text:#bbf7d0]',
    'rbn:[--color-edge-value-pill-bg:#000000]',
    'rbn:[--color-edge-value-pill-border:#22c55e]',
    'rbn:[--color-edge-value-pill-text:#86efac]',
    'rbn:[--color-graph-scrollbar-thumb:#14532d]',
    'rbn:[--color-timeline-scrollbar-thumb:#14532d]',
    'rbn:[--color-timeline-scrollbar-track:#020a04]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#01140a]',
    'rbn:[--color-runner-resize-handle-bg:#01140a]',
    'rbn:[--color-runner-resize-handle-hover-bg:#052e16]',
    'rbn:[--color-graph-toggle-track-bg:#01140a]',
    'rbn:[--color-drag-list-item-hover-bg:#052e16]',
  ].join(' '),
  reactFlow: {
    colorMode: 'dark',
    background: {
      variant: 'cross',
      color: '#0b3a1d',
      bgColor: '#000000',
      gap: 28,
      size: 6,
    },
    miniMap: {
      bgColor: '#000000',
      maskColor: 'rgba(0, 0, 0, 0.78)',
      nodeColor: '#052e16',
      nodeStrokeColor: '#22c55e',
    },
  },
  node: {
    container:
      'rbn:rounded-none rbn:in-[.selected]:border-green-400 rbn:focus:border-green-400',
    header:
      'rbn:saturate-0 rbn:brightness-110 rbn:rounded-none rbn:font-mono rbn:text-[20px]',
    headerTitle: 'rbn:font-mono',
    body: 'rbn:rounded-none rbn:bg-[#06160d] rbn:border rbn:border-green-500/60',
    outputRow: 'rbn:text-green-300 rbn:font-mono',
    inputRow: 'rbn:text-green-300 rbn:font-mono',
    panelHeader: 'rbn:text-green-300 rbn:font-mono rbn:hover:bg-green-500/10',
    inputField:
      'rbn:rounded-none rbn:bg-black rbn:border-green-500/40 rbn:text-green-200 rbn:font-mono',
  },
  statusIndicator: {
    tooltip:
      'rbn:bg-black rbn:border-green-500/60 rbn:text-green-200 rbn:font-mono',
  },
  contextMenu: {
    list: 'rbn:rounded-none rbn:bg-black rbn:border rbn:border-green-500/40',
    item: 'rbn:hover:bg-green-500/10',
    itemLabel: 'rbn:text-green-300 rbn:font-mono',
    shortcut: 'rbn:text-green-700 rbn:font-mono',
    separator: 'rbn:border-green-500/40',
    submenuPanel:
      'rbn:rounded-none rbn:bg-black rbn:border rbn:border-green-500/40',
  },
  breadcrumbs: {
    backButton:
      'rbn:rounded-none rbn:bg-black rbn:border-green-500/40 rbn:text-green-300',
    selectTrigger:
      'rbn:rounded-none rbn:bg-black rbn:border-green-500/40 rbn:text-green-300 rbn:hover:bg-green-500/10',
    list: 'rbn:text-green-300 rbn:font-mono',
    editButton: 'rbn:text-green-300 rbn:hover:bg-green-500/10',
  },
  runnerToggleButton:
    'rbn:rounded-none rbn:bg-black/90 rbn:border-green-500/40 rbn:text-green-300 rbn:font-mono rbn:hover:bg-green-500/10',
  runnerPanel: {
    container: `rbn:rounded-none rbn:bg-[#020a04] rbn:border-green-500/30 ${TERMINAL_TEXT}`,
    overflowMenu: `rbn:rounded-none rbn:[--color-graph-elevated-surface-bg:#020a04] rbn:[--color-graph-toggle-track-bg:#01140a] rbn:border-green-500/30 ${TERMINAL_TEXT}`,
    overflowMenuItem: 'rbn:hover:bg-green-500/20',
    overflowMenuItemActive: 'rbn:bg-green-500/30 rbn:text-green-100',
  },
  runControls: {
    container: 'rbn:bg-black rbn:border-green-500/30',
    playButton:
      'rbn:rounded-none rbn:bg-green-700 rbn:shadow-[0_0_12px_rgba(34,197,94,0.5)]',
    actionButton: 'rbn:rounded-none rbn:hover:bg-green-500/10',
    divider: 'rbn:bg-green-500/30',
  },
  timeline: {
    container: `rbn:bg-[#020a04] ${TERMINAL_TEXT}`,
    toolbar: 'rbn:bg-[#020a04]',
    trackArea: 'rbn:rounded-none rbn:bg-black rbn:border-green-500/30',
    ruler: 'rbn:bg-[#01140a]',
    navButton: 'rbn:rounded-none rbn:border-green-500/30',
  },
  inspector: {
    container: `rbn:bg-[#020a04] ${TERMINAL_TEXT}`,
    sectionHeader:
      'rbn:bg-[#01140a] rbn:text-green-300 rbn:border-green-500/30',
    valueBox:
      'rbn:rounded-none rbn:bg-black rbn:border-green-500/40 rbn:text-green-200',
    timelineBox: 'rbn:rounded-none rbn:bg-black rbn:border-green-500/40',
  },
  drawer: {
    container: `rbn:bg-[#020a04] rbn:border-green-500/30 ${TERMINAL_TEXT}`,
    title: 'rbn:text-green-300 rbn:font-mono',
    label: 'rbn:text-green-300 rbn:font-mono',
    footerButton: 'rbn:rounded-none rbn:border-green-500/40',
  },
  modal: {
    content: `rbn:rounded-none rbn:bg-black rbn:border-green-500/40 ${TERMINAL_TEXT}`,
    title: 'rbn:text-green-300 rbn:font-mono',
  },
  connectionMiniMap: { container: 'rbn:rounded-none rbn:border-green-500/40' },
  dragList: {
    row: 'rbn:rounded-none rbn:bg-[#01140a] rbn:text-green-300 rbn:hover:bg-green-500/10',
    preview: 'rbn:rounded-none rbn:bg-[#01140a] rbn:border-green-500/40',
  },
  select: {
    trigger:
      'rbn:rounded-none rbn:bg-black rbn:text-green-300 rbn:border-green-500/40',
    content: `rbn:rounded-none rbn:bg-black rbn:border-green-500/40 rbn:text-green-300 ${TERMINAL_TEXT}`,
    item: 'rbn:hover:bg-green-500/10',
  },
  tooltip: {
    content: `rbn:rounded-none rbn:bg-black rbn:border-green-500/60 rbn:text-green-200 ${TERMINAL_TEXT}`,
  },
};

/** Warm sepia daylight: built on the light preset, amber accents, soft radii. */
const sunsetPaperTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rbn:bg-[#fff8ec] rbn:border-amber-300 ${PAPER_TEXT} rbn:[--color-graph-toggle-track-bg:#f3e3c6] rbn:[--color-primary-gray:#e0cda8] rbn:[&_.rbn\\:border-secondary-dark-gray]:border-amber-300`,
  },
  root: [
    'rbn:bg-[#fdf4e3]',
    'rbn:[--color-graph-menu-bg:#fff8ec]',
    'rbn:[--color-graph-menu-item-hover-bg:#fde8c8]',
    'rbn:[--color-graph-elevated-surface-bg:#fffbf2]',
    'rbn:[--color-graph-node-panel-content-bg:#f8ecd9]',
    'rbn:[--color-timeline-loop-accent:#ea580c]',
    'rbn:[--color-timeline-switch-accent:#0d9488]',
    'rbn:[--color-runner-muted-text:#a8825f]',
    'rbn:[--color-timeline-hover-text:#431407]',
    'rbn:[--color-edge-value-pill-bg:#fff8ec]',
    'rbn:[--color-edge-value-pill-border:#ddb892]',
    'rbn:[--color-edge-value-pill-text:#431407]',
    'rbn:[--color-graph-scrollbar-thumb:#d9b991]',
    'rbn:[--color-timeline-scrollbar-thumb:#d9b991]',
    'rbn:[--color-timeline-scrollbar-track:#f4e4cb]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#f0ddc0]',
    'rbn:[--color-runner-resize-handle-bg:#f4e4cb]',
    'rbn:[--color-runner-resize-handle-hover-bg:#ecd5b3]',
    'rbn:[--color-graph-toggle-track-bg:#f4e4cb]',
    'rbn:[--color-drag-list-item-hover-bg:#f0ddc0]',
    'rbn:[--color-primary-gray:#e3cba4]',
    'rbn:[--color-inspector-progress-track:#ecd5b3]',
  ].join(' '),
  reactFlow: {
    colorMode: 'light',
    background: {
      variant: 'dots',
      color: '#dcb88a',
      bgColor: '#fdf4e3',
      gap: 24,
    },
    miniMap: {
      bgColor: '#fff8ec',
      maskColor: 'rgba(244, 228, 203, 0.65)',
      nodeColor: '#ecd5b3',
      nodeStrokeColor: '#b97c3c',
    },
  },
  node: {
    container: 'rbn:focus:border-amber-700 rbn:in-[.selected]:border-amber-700',
    header: 'rbn:rounded-t-xl',
    body: 'rbn:bg-[#fffaf0] rbn:rounded-b-xl rbn:border-x rbn:border-b rbn:border-amber-200',
    outputRow: 'rbn:text-stone-800',
    inputRow: 'rbn:text-stone-800',
    panelHeader: 'rbn:text-stone-800 rbn:hover:bg-amber-100',
    inputField:
      'rbn:bg-white rbn:text-stone-800 rbn:border-amber-300 rbn:placeholder:text-stone-400',
  },
  statusIndicator: {
    tooltip: 'rbn:bg-[#fff8ec] rbn:border-amber-300 rbn:text-stone-800',
  },
  contextMenu: {
    list: 'rbn:bg-[#fff8ec] rbn:border-amber-200 rbn:shadow-amber-900/10',
    item: 'rbn:hover:bg-amber-100',
    itemLabel: 'rbn:text-stone-800',
    shortcut: 'rbn:text-stone-500',
    separator: 'rbn:border-amber-200',
    submenuPanel: 'rbn:bg-[#fff8ec] rbn:shadow-amber-900/10',
  },
  breadcrumbs: {
    backButton: 'rbn:bg-[#fff8ec] rbn:border-amber-300 rbn:text-stone-800',
    selectTrigger:
      'rbn:bg-[#fff8ec] rbn:border-amber-300 rbn:text-stone-800 rbn:hover:bg-amber-100',
    list: 'rbn:text-stone-800',
    editButton: 'rbn:text-stone-800 rbn:hover:bg-amber-100',
  },
  errorBoundary: {
    container: 'rbn:bg-[#fdf4e3] rbn:text-stone-700',
    retryButton:
      'rbn:border-amber-300 rbn:bg-white rbn:text-stone-700 rbn:hover:bg-amber-100',
  },
  runnerToggleButton:
    'rbn:border-amber-300 rbn:bg-[#fff8ec]/90 rbn:text-stone-800 rbn:hover:bg-amber-100',
  runnerPanel: {
    container: `rbn:bg-[#faf0de] rbn:border-amber-300 ${PAPER_TEXT}`,
    closeButton:
      'rbn:text-stone-500 rbn:hover:bg-amber-100 rbn:hover:text-stone-800',
    overflowMenu: `rbn:bg-[#fff8ec] rbn:border-amber-300 ${PAPER_TEXT} rbn:[--color-graph-toggle-track-bg:#f3e3c6] rbn:[--color-primary-gray:#e0cda8] rbn:[&_.rbn\\:border-secondary-dark-gray]:border-amber-300`,
    overflowMenuItem: 'rbn:hover:bg-amber-100 rbn:hover:text-stone-900',
    overflowMenuItemActive: 'rbn:bg-amber-200 rbn:text-stone-900',
  },
  runControls: {
    container: 'rbn:bg-[#f6ead2] rbn:border-amber-200',
    statusLabel: 'rbn:text-stone-800',
    divider: 'rbn:bg-amber-200',
    actionButton:
      'rbn:text-stone-700 rbn:hover:bg-amber-100 rbn:hover:text-stone-900',
    playButton: 'rbn:bg-orange-600 rbn:shadow-[0_0_12px_rgba(234,88,12,0.4)]',
  },
  timeline: {
    container: `rbn:bg-[#f6ead2] ${PAPER_TEXT}`,
    toolbar: 'rbn:bg-[#f6ead2]',
    toolbarButton: 'rbn:text-stone-800 rbn:hover:bg-amber-100',
    navButton:
      'rbn:border-amber-300 rbn:bg-white rbn:text-stone-700 rbn:hover:bg-amber-200',
    ruler: 'rbn:bg-[#f0ddc0]',
    trackArea: 'rbn:bg-[#fffaf0] rbn:border-amber-200',
    loopHeader: 'rbn:bg-[#f6ead2]',
    switchHeader: 'rbn:bg-[#f6ead2]',
  },
  inspector: {
    container: `rbn:bg-[#faf0de] ${PAPER_TEXT}`,
    header: 'rbn:border-amber-200',
    sectionHeader: 'rbn:bg-[#f0ddc0] rbn:text-stone-800 rbn:border-amber-200',
    valueBox: 'rbn:bg-white rbn:border-amber-300 rbn:text-stone-800',
    timelineBox: 'rbn:bg-[#f6ead2] rbn:border-amber-300',
    contextBox: 'rbn:border-amber-300',
  },
  drawer: {
    container: `rbn:bg-[#faf0de] rbn:border-amber-300 ${PAPER_TEXT}`,
    header: 'rbn:border-amber-200',
    title: 'rbn:text-stone-800',
    closeButton: 'rbn:hover:bg-amber-100',
    footer: 'rbn:border-amber-200',
    label: 'rbn:text-stone-800',
    emptyState: 'rbn:text-stone-500',
    footerButton:
      'rbn:bg-amber-100 rbn:text-stone-800 rbn:border-amber-300 rbn:hover:bg-amber-200',
  },
  modal: {
    content: `rbn:bg-[#faf0de] rbn:border-amber-300 ${PAPER_TEXT}`,
    title: 'rbn:text-stone-800',
  },
  connectionMiniMap: { container: 'rbn:border-amber-300' },
  dragList: {
    row: 'rbn:bg-[#f0ddc0] rbn:text-stone-800 rbn:hover:bg-amber-200',
    preview: 'rbn:bg-[#f0ddc0] rbn:border-amber-300',
  },
  select: {
    trigger:
      'rbn:bg-white rbn:text-stone-800 rbn:border-amber-300 rbn:hover:bg-amber-50',
    content: `rbn:bg-[#fff8ec] rbn:border-amber-300 rbn:text-stone-800 ${PAPER_TEXT}`,
    item: 'rbn:hover:bg-amber-100',
  },
  tooltip: {
    content: `rbn:bg-[#fff8ec] rbn:border-amber-400/70 rbn:text-stone-800 ${PAPER_TEXT}`,
  },
};

/** Abyssal navy with cyan instrumentation. */
const deepOceanTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rbn:[--color-graph-elevated-surface-bg:#061827] rbn:[--color-graph-toggle-track-bg:#0a2238] rbn:border-cyan-500/30 ${OCEAN_TEXT}`,
  },
  root: [
    'rbn:bg-[#04111f]',
    'rbn:[--color-graph-menu-bg:#081c30]',
    'rbn:[--color-graph-menu-item-hover-bg:#0e3a5c]',
    'rbn:[--color-graph-elevated-surface-bg:#061827]',
    'rbn:[--color-graph-node-panel-content-bg:#0a2238]',
    'rbn:[--color-timeline-loop-accent:#22d3ee]',
    'rbn:[--color-timeline-switch-accent:#818cf8]',
    'rbn:[--color-timeline-scrubber-active:#22d3ee]',
    'rbn:[--color-timeline-scrubber-line:rgba(34,211,238,0.5)]',
    'rbn:[--color-timeline-scrubber-line-active:rgba(34,211,238,0.8)]',
    'rbn:[--color-runner-muted-text:#5e88a6]',
    'rbn:[--color-timeline-hover-text:#cffafe]',
    'rbn:[--color-edge-value-pill-bg:#081c30]',
    'rbn:[--color-edge-value-pill-border:#155e75]',
    'rbn:[--color-edge-value-pill-text:#cffafe]',
    'rbn:[--color-graph-scrollbar-thumb:#155e75]',
    'rbn:[--color-timeline-scrollbar-thumb:#155e75]',
    'rbn:[--color-timeline-scrollbar-track:#061827]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#0a2238]',
    'rbn:[--color-runner-resize-handle-bg:#0a2238]',
    'rbn:[--color-runner-resize-handle-hover-bg:#0e3a5c]',
    'rbn:[--color-graph-toggle-track-bg:#0a2238]',
    'rbn:[--color-drag-list-item-hover-bg:#0e3a5c]',
  ].join(' '),
  reactFlow: {
    colorMode: 'dark',
    background: {
      variant: 'dots',
      color: '#10456b',
      bgColor: '#04111f',
      gap: 22,
    },
    miniMap: {
      bgColor: '#081c30',
      maskColor: 'rgba(4, 17, 31, 0.72)',
      nodeColor: '#0e3a5c',
      nodeStrokeColor: '#22d3ee',
    },
  },
  node: {
    container: 'rbn:in-[.selected]:border-cyan-300 rbn:focus:border-cyan-300',
    body: 'rbn:bg-[#0e2c47] rbn:border-x rbn:border-b rbn:border-cyan-500/50',
    inputField: 'rbn:bg-[#081c30] rbn:border-cyan-500/40 rbn:text-sky-100',
  },
  statusIndicator: {
    tooltip: 'rbn:bg-[#081c30] rbn:border-cyan-400/60 rbn:text-sky-100',
  },
  contextMenu: {
    list: 'rbn:bg-[#081c30] rbn:border rbn:border-cyan-500/30',
    item: 'rbn:hover:bg-cyan-500/15',
    itemLabel: 'rbn:text-sky-100',
    shortcut: 'rbn:text-sky-400/70',
    separator: 'rbn:border-cyan-500/30',
    submenuPanel: 'rbn:bg-[#081c30] rbn:border rbn:border-cyan-500/30',
  },
  breadcrumbs: {
    backButton: 'rbn:bg-[#081c30] rbn:border-cyan-500/40 rbn:text-sky-100',
    selectTrigger:
      'rbn:bg-[#081c30] rbn:border-cyan-500/40 rbn:text-sky-100 rbn:hover:bg-cyan-500/15',
    list: 'rbn:text-sky-100',
    editButton: 'rbn:text-sky-100 rbn:hover:bg-cyan-500/15',
  },
  runnerToggleButton:
    'rbn:bg-[#081c30]/90 rbn:border-cyan-500/40 rbn:text-sky-100 rbn:hover:bg-cyan-500/15',
  runnerPanel: {
    container: `rbn:bg-[#061827] rbn:border-cyan-500/30 ${OCEAN_TEXT}`,
    overflowMenu: `rbn:[--color-graph-elevated-surface-bg:#061827] rbn:[--color-graph-toggle-track-bg:#0a2238] rbn:border-cyan-500/30 ${OCEAN_TEXT}`,
    overflowMenuItem: 'rbn:hover:bg-cyan-500/20',
    overflowMenuItemActive: 'rbn:bg-cyan-500/30 rbn:text-cyan-50',
  },
  runControls: {
    container: 'rbn:bg-[#081c30] rbn:border-cyan-500/20',
    playButton: 'rbn:bg-cyan-600 rbn:shadow-[0_0_14px_rgba(34,211,238,0.5)]',
    divider: 'rbn:bg-cyan-500/30',
  },
  timeline: {
    container: `rbn:bg-[#061827] ${OCEAN_TEXT}`,
    toolbar: 'rbn:bg-[#061827]',
    trackArea: 'rbn:bg-[#04111f] rbn:border-cyan-500/20',
    ruler: 'rbn:bg-[#0a2238]',
    navButton: 'rbn:border-cyan-500/30',
  },
  inspector: {
    container: `rbn:bg-[#061827] ${OCEAN_TEXT}`,
    sectionHeader: 'rbn:bg-[#0a2238] rbn:text-sky-100 rbn:border-cyan-500/20',
    valueBox: 'rbn:bg-[#081c30] rbn:border-cyan-500/30 rbn:text-sky-100',
    timelineBox: 'rbn:bg-[#081c30] rbn:border-cyan-500/30',
  },
  drawer: {
    container: `rbn:bg-[#061827] rbn:border-cyan-500/30 ${OCEAN_TEXT}`,
    title: 'rbn:text-sky-100',
    label: 'rbn:text-sky-200',
    footerButton: 'rbn:border-cyan-500/40',
  },
  modal: {
    content: `rbn:bg-[#081c30] rbn:border-cyan-500/30 ${OCEAN_TEXT}`,
    title: 'rbn:text-sky-100',
  },
  connectionMiniMap: { container: 'rbn:border-cyan-500/30' },
  dragList: {
    row: 'rbn:bg-[#0a2238] rbn:text-sky-100 rbn:hover:bg-cyan-500/15',
    preview: 'rbn:bg-[#0a2238] rbn:border-cyan-500/40',
  },
  select: {
    trigger: 'rbn:bg-[#081c30] rbn:text-sky-100 rbn:border-cyan-500/30',
    content: `rbn:bg-[#081c30] rbn:border-cyan-500/30 rbn:text-sky-100 ${OCEAN_TEXT}`,
    item: 'rbn:hover:bg-cyan-500/15',
  },
  tooltip: {
    content: `rbn:bg-[#081c30] rbn:border-cyan-400/60 rbn:text-sky-100 ${OCEAN_TEXT}`,
  },
};

/** Cobalt engineering blueprint: fine white line grid, drafting-table chrome. */
const blueprintTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rbn:[--color-graph-elevated-surface-bg:#0a2c5e] rbn:[--color-graph-toggle-track-bg:#0c3578] rbn:border-sky-300/30 ${BLUEPRINT_TEXT}`,
  },
  root: [
    'rbn:bg-[#0b3a82]',
    'rbn:[--color-graph-menu-bg:#0b2f66]',
    'rbn:[--color-graph-menu-item-hover-bg:#1d4d9e]',
    'rbn:[--color-graph-elevated-surface-bg:#0a2c5e]',
    'rbn:[--color-graph-node-panel-content-bg:#0c3578]',
    'rbn:[--color-timeline-loop-accent:#7dd3fc]',
    'rbn:[--color-timeline-switch-accent:#fef08a]',
    'rbn:[--color-timeline-scrubber-active:#e0f2fe]',
    'rbn:[--color-timeline-scrubber-line:rgba(224,242,254,0.5)]',
    'rbn:[--color-timeline-scrubber-line-active:rgba(224,242,254,0.85)]',
    'rbn:[--color-runner-muted-text:#93c5fd]',
    'rbn:[--color-timeline-hover-text:#f0f9ff]',
    'rbn:[--color-edge-value-pill-bg:#0b2f66]',
    'rbn:[--color-edge-value-pill-border:#7dd3fc]',
    'rbn:[--color-edge-value-pill-text:#e0f2fe]',
    'rbn:[--color-graph-scrollbar-thumb:#2563eb]',
    'rbn:[--color-timeline-scrollbar-thumb:#2563eb]',
    'rbn:[--color-timeline-scrollbar-track:#0a2c5e]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#0c3578]',
    'rbn:[--color-runner-resize-handle-bg:#0c3578]',
    'rbn:[--color-runner-resize-handle-hover-bg:#1d4d9e]',
    'rbn:[--color-graph-toggle-track-bg:#0c3578]',
    'rbn:[--color-drag-list-item-hover-bg:#1d4d9e]',
  ].join(' '),
  reactFlow: {
    colorMode: 'dark',
    background: {
      variant: 'lines',
      color: 'rgba(224, 242, 254, 0.16)',
      bgColor: '#0b3a82',
      gap: 24,
      lineWidth: 1,
    },
    miniMap: {
      bgColor: '#0b2f66',
      maskColor: 'rgba(11, 47, 102, 0.72)',
      nodeColor: '#1d4d9e',
      nodeStrokeColor: '#7dd3fc',
    },
  },
  node: {
    container: 'rbn:in-[.selected]:border-sky-200 rbn:focus:border-sky-200',
    header:
      'rbn:font-mono rbn:uppercase rbn:tracking-wider rbn:text-[18px] rbn:border-b rbn:border-white/30',
    body: 'rbn:bg-[#0c3a86] rbn:border-x rbn:border-b rbn:border-sky-200/50',
    inputField: 'rbn:bg-[#0b2f66] rbn:border-sky-300/40 rbn:text-sky-50',
  },
  statusIndicator: {
    tooltip: 'rbn:bg-[#0b2f66] rbn:border-sky-300/60 rbn:text-sky-50',
  },
  contextMenu: {
    list: 'rbn:bg-[#0b2f66] rbn:border rbn:border-sky-300/30',
    item: 'rbn:hover:bg-sky-400/20',
    itemLabel: 'rbn:text-sky-50',
    shortcut: 'rbn:text-sky-300/70',
    separator: 'rbn:border-sky-300/30',
    submenuPanel: 'rbn:bg-[#0b2f66] rbn:border rbn:border-sky-300/30',
  },
  breadcrumbs: {
    backButton: 'rbn:bg-[#0b2f66] rbn:border-sky-300/40 rbn:text-sky-50',
    selectTrigger:
      'rbn:bg-[#0b2f66] rbn:border-sky-300/40 rbn:text-sky-50 rbn:hover:bg-sky-400/20',
    list: 'rbn:text-sky-50',
    editButton: 'rbn:text-sky-50 rbn:hover:bg-sky-400/20',
  },
  runnerToggleButton:
    'rbn:bg-[#0b2f66]/90 rbn:border-sky-300/40 rbn:text-sky-50 rbn:hover:bg-sky-400/20',
  runnerPanel: {
    container: `rbn:bg-[#0a2c5e] rbn:border-sky-300/30 ${BLUEPRINT_TEXT}`,
    overflowMenu: `rbn:[--color-graph-elevated-surface-bg:#0a2c5e] rbn:[--color-graph-toggle-track-bg:#0c3578] rbn:border-sky-300/30 ${BLUEPRINT_TEXT}`,
    overflowMenuItem: 'rbn:hover:bg-sky-400/20',
    overflowMenuItemActive: 'rbn:bg-sky-400/30 rbn:text-sky-50',
  },
  runControls: {
    container: 'rbn:bg-[#0b2f66] rbn:border-sky-300/20',
    playButton: 'rbn:bg-sky-500 rbn:shadow-[0_0_14px_rgba(125,211,252,0.5)]',
    divider: 'rbn:bg-sky-300/30',
  },
  timeline: {
    container: `rbn:bg-[#0a2c5e] ${BLUEPRINT_TEXT}`,
    toolbar: 'rbn:bg-[#0a2c5e]',
    trackArea: 'rbn:bg-[#0b3a82] rbn:border-sky-300/20',
    ruler: 'rbn:bg-[#0c3578]',
    navButton: 'rbn:border-sky-300/30',
  },
  inspector: {
    container: `rbn:bg-[#0a2c5e] ${BLUEPRINT_TEXT}`,
    sectionHeader: 'rbn:bg-[#0c3578] rbn:text-sky-50 rbn:border-sky-300/20',
    valueBox: 'rbn:bg-[#0b2f66] rbn:border-sky-300/30 rbn:text-sky-50',
    timelineBox: 'rbn:bg-[#0b2f66] rbn:border-sky-300/30',
  },
  drawer: {
    container: `rbn:bg-[#0a2c5e] rbn:border-sky-300/30 ${BLUEPRINT_TEXT}`,
    title: 'rbn:text-sky-50',
    label: 'rbn:text-sky-100',
    footerButton: 'rbn:border-sky-300/40',
  },
  modal: {
    content: `rbn:bg-[#0b2f66] rbn:border-sky-300/30 ${BLUEPRINT_TEXT}`,
    title: 'rbn:text-sky-50',
  },
  connectionMiniMap: { container: 'rbn:border-sky-300/30' },
  dragList: {
    row: 'rbn:bg-[#0c3578] rbn:text-sky-50 rbn:hover:bg-sky-400/20',
    preview: 'rbn:bg-[#0c3578] rbn:border-sky-300/40',
  },
  select: {
    trigger: 'rbn:bg-[#0b2f66] rbn:text-sky-50 rbn:border-sky-300/30',
    content: `rbn:bg-[#0b2f66] rbn:border-sky-300/30 rbn:text-sky-50 ${BLUEPRINT_TEXT}`,
    item: 'rbn:hover:bg-sky-400/20',
  },
  tooltip: {
    content: `rbn:bg-[#0b2f66] rbn:border-sky-300/60 rbn:text-sky-50 ${BLUEPRINT_TEXT}`,
  },
};

/** Comic pop-art: halftone dot screen on yellow, hard black borders & shadows. */
const halftonePopTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black ${POP_TEXT} rbn:[--color-graph-toggle-track-bg:#fef3c7] rbn:[--color-primary-gray:#fde047] rbn:[&_.rbn\\:border-secondary-dark-gray]:border-black`,
  },
  root: [
    'rbn:bg-[#fde047]',
    'rbn:[--color-graph-menu-bg:#ffffff]',
    'rbn:[--color-graph-menu-item-hover-bg:#fde047]',
    'rbn:[--color-graph-elevated-surface-bg:#fffbeb]',
    'rbn:[--color-graph-node-panel-content-bg:#fef3c7]',
    'rbn:[--color-timeline-loop-accent:#ef4444]',
    'rbn:[--color-timeline-switch-accent:#3b82f6]',
    'rbn:[--color-timeline-scrubber-active:#ef4444]',
    'rbn:[--color-timeline-scrubber-line:rgba(239,68,68,0.6)]',
    'rbn:[--color-timeline-scrubber-line-active:rgba(239,68,68,0.9)]',
    'rbn:[--color-runner-muted-text:#78716c]',
    'rbn:[--color-timeline-hover-text:#000000]',
    'rbn:[--color-edge-value-pill-bg:#ffffff]',
    'rbn:[--color-edge-value-pill-border:#000000]',
    'rbn:[--color-edge-value-pill-text:#000000]',
    'rbn:[--color-graph-scrollbar-thumb:#a8a29e]',
    'rbn:[--color-timeline-scrollbar-thumb:#a8a29e]',
    'rbn:[--color-timeline-scrollbar-track:#fef3c7]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#fde68a]',
    'rbn:[--color-runner-resize-handle-bg:#fde68a]',
    'rbn:[--color-runner-resize-handle-hover-bg:#fcd34d]',
    'rbn:[--color-graph-toggle-track-bg:#fef3c7]',
    'rbn:[--color-drag-list-item-hover-bg:#fde68a]',
    'rbn:[--color-primary-gray:#fcd34d]',
    'rbn:[--color-inspector-progress-track:#fde68a]',
  ].join(' '),
  reactFlow: {
    colorMode: 'light',
    background: {
      variant: 'dots',
      color: 'rgba(0, 0, 0, 0.16)',
      bgColor: '#fde047',
      gap: 14,
      size: 2.5,
    },
    miniMap: {
      bgColor: '#ffffff',
      maskColor: 'rgba(253, 224, 71, 0.55)',
      nodeColor: '#fde68a',
      nodeStrokeColor: '#000000',
    },
  },
  node: {
    container:
      'rbn:rounded-none rbn:border-[3px] rbn:border-black rbn:shadow-[6px_6px_0_rgba(0,0,0,0.85)] rbn:in-[.selected]:border-blue-600 rbn:focus:border-blue-600',
    header:
      'rbn:rounded-none rbn:border-b-[3px] rbn:border-black rbn:font-extrabold rbn:uppercase rbn:tracking-tight',
    body: 'rbn:rounded-none rbn:bg-white',
    outputRow: 'rbn:text-black rbn:font-semibold',
    inputRow: 'rbn:text-black rbn:font-semibold',
    panelHeader: 'rbn:text-black rbn:font-semibold rbn:hover:bg-yellow-200',
    inputField:
      'rbn:rounded-none rbn:bg-white rbn:text-black rbn:border-2 rbn:border-black rbn:placeholder:text-stone-400',
  },
  statusIndicator: {
    tooltip:
      'rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black rbn:text-black',
  },
  contextMenu: {
    list: 'rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black rbn:shadow-[5px_5px_0_rgba(0,0,0,0.85)]',
    item: 'rbn:hover:bg-yellow-200',
    itemLabel: 'rbn:text-black rbn:font-semibold',
    shortcut: 'rbn:text-stone-500',
    separator: 'rbn:border-black',
    submenuPanel:
      'rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black rbn:shadow-[5px_5px_0_rgba(0,0,0,0.85)]',
  },
  breadcrumbs: {
    backButton:
      'rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black rbn:text-black',
    selectTrigger:
      'rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black rbn:text-black rbn:hover:bg-yellow-200',
    list: 'rbn:text-black',
    editButton: 'rbn:text-black rbn:hover:bg-yellow-200',
  },
  runnerToggleButton:
    'rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black rbn:text-black rbn:font-bold rbn:shadow-[4px_4px_0_rgba(0,0,0,0.85)] rbn:hover:bg-yellow-200',
  runnerPanel: {
    container: `rbn:rounded-none rbn:bg-[#fffbeb] rbn:border-2 rbn:border-black ${POP_TEXT}`,
    closeButton: 'rbn:rounded-none rbn:text-black rbn:hover:bg-yellow-200',
    overflowMenu: `rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black ${POP_TEXT} rbn:[--color-graph-toggle-track-bg:#fef3c7] rbn:[--color-primary-gray:#fde047] rbn:[&_.rbn\\:border-secondary-dark-gray]:border-black`,
    overflowMenuItem: 'rbn:hover:bg-yellow-200 rbn:hover:text-black',
    overflowMenuItemActive: 'rbn:bg-yellow-400 rbn:text-black',
  },
  runControls: {
    container: 'rbn:bg-[#fde68a] rbn:border-black',
    statusLabel: 'rbn:text-black rbn:font-bold',
    divider: 'rbn:bg-black',
    actionButton: 'rbn:rounded-none rbn:text-black rbn:hover:bg-yellow-200',
    playButton:
      'rbn:rounded-none rbn:bg-red-500 rbn:border-2 rbn:border-black rbn:shadow-[3px_3px_0_rgba(0,0,0,0.85)]',
  },
  timeline: {
    container: `rbn:bg-[#fde68a] ${POP_TEXT}`,
    toolbar: 'rbn:bg-[#fde68a]',
    toolbarButton: 'rbn:text-black rbn:hover:bg-yellow-200',
    navButton:
      'rbn:rounded-none rbn:border-black rbn:bg-white rbn:text-black rbn:hover:bg-yellow-200',
    ruler: 'rbn:bg-[#fef3c7]',
    trackArea: 'rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black',
    loopHeader: 'rbn:bg-[#fde68a]',
    switchHeader: 'rbn:bg-[#fde68a]',
  },
  inspector: {
    container: `rbn:bg-[#fffbeb] ${POP_TEXT}`,
    header: 'rbn:border-black',
    sectionHeader: 'rbn:bg-[#fde68a] rbn:text-black rbn:border-black',
    valueBox:
      'rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black rbn:text-black',
    timelineBox:
      'rbn:rounded-none rbn:bg-[#fef3c7] rbn:border-2 rbn:border-black',
    contextBox: 'rbn:rounded-none rbn:border-2 rbn:border-black',
  },
  drawer: {
    container: `rbn:bg-[#fffbeb] rbn:border-l-2 rbn:border-black ${POP_TEXT}`,
    header: 'rbn:border-black',
    title: 'rbn:text-black rbn:font-extrabold rbn:uppercase',
    closeButton: 'rbn:hover:bg-yellow-200',
    footer: 'rbn:border-black',
    label: 'rbn:text-black rbn:font-semibold',
    emptyState: 'rbn:text-stone-500',
    footerButton:
      'rbn:rounded-none rbn:bg-white rbn:text-black rbn:border-2 rbn:border-black rbn:hover:bg-yellow-200',
  },
  modal: {
    content: `rbn:rounded-none rbn:bg-[#fffbeb] rbn:border-[3px] rbn:border-black rbn:shadow-[8px_8px_0_rgba(0,0,0,0.85)] ${POP_TEXT}`,
    title: 'rbn:text-black rbn:font-extrabold rbn:uppercase',
  },
  connectionMiniMap: {
    container: 'rbn:rounded-none rbn:border-2 rbn:border-black',
  },
  dragList: {
    row: 'rbn:rounded-none rbn:bg-white rbn:text-black rbn:border rbn:border-black rbn:hover:bg-yellow-200',
    preview: 'rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black',
  },
  select: {
    trigger:
      'rbn:rounded-none rbn:bg-white rbn:text-black rbn:border-2 rbn:border-black',
    content: `rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black rbn:text-black ${POP_TEXT}`,
    item: 'rbn:hover:bg-yellow-200',
  },
  tooltip: {
    content: `rbn:rounded-none rbn:bg-white rbn:border-2 rbn:border-black rbn:text-black ${POP_TEXT}`,
  },
};

/** Night-sky observatory: sparse white star-dots on space black, violet chrome. */
const observatoryTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rbn:[--color-graph-elevated-surface-bg:#0d0a1f] rbn:[--color-graph-toggle-track-bg:#14102b] rbn:border-violet-500/30 ${STAR_TEXT}`,
  },
  root: [
    'rbn:bg-[#02010a]',
    'rbn:[--color-graph-menu-bg:#14102b]',
    'rbn:[--color-graph-menu-item-hover-bg:#2e2659]',
    'rbn:[--color-graph-elevated-surface-bg:#0d0a1f]',
    'rbn:[--color-graph-node-panel-content-bg:#161130]',
    'rbn:[--color-timeline-loop-accent:#a78bfa]',
    'rbn:[--color-timeline-switch-accent:#fbbf24]',
    'rbn:[--color-timeline-scrubber-active:#fbbf24]',
    'rbn:[--color-timeline-scrubber-line:rgba(251,191,36,0.5)]',
    'rbn:[--color-timeline-scrubber-line-active:rgba(251,191,36,0.85)]',
    'rbn:[--color-runner-muted-text:#8b7fc7]',
    'rbn:[--color-timeline-hover-text:#ede9fe]',
    'rbn:[--color-edge-value-pill-bg:#14102b]',
    'rbn:[--color-edge-value-pill-border:#a78bfa]',
    'rbn:[--color-edge-value-pill-text:#ede9fe]',
    'rbn:[--color-graph-scrollbar-thumb:#4c3d8f]',
    'rbn:[--color-timeline-scrollbar-thumb:#4c3d8f]',
    'rbn:[--color-timeline-scrollbar-track:#0d0a1f]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#14102b]',
    'rbn:[--color-runner-resize-handle-bg:#14102b]',
    'rbn:[--color-runner-resize-handle-hover-bg:#2e2659]',
    'rbn:[--color-graph-toggle-track-bg:#14102b]',
    'rbn:[--color-drag-list-item-hover-bg:#2e2659]',
    'rbn:[--color-running-glow-strong:rgba(167,139,250,0.5)]',
    'rbn:[--color-running-glow-soft:rgba(167,139,250,0.3)]',
  ].join(' '),
  reactFlow: {
    colorMode: 'dark',
    background: {
      variant: 'dots',
      color: 'rgba(255, 255, 255, 0.45)',
      bgColor: '#02010a',
      gap: 64,
      size: 1.5,
    },
    miniMap: {
      bgColor: '#0d0a1f',
      maskColor: 'rgba(2, 1, 10, 0.75)',
      nodeColor: '#2e2659',
      nodeStrokeColor: '#a78bfa',
    },
  },
  node: {
    container:
      'rbn:in-[.selected]:border-violet-300 rbn:focus:border-violet-300 rbn:shadow-[0_0_30px_rgba(167,139,250,0.12)]',
    body: 'rbn:bg-[#191338] rbn:border-x rbn:border-b rbn:border-violet-500/50',
    inputField: 'rbn:bg-[#14102b] rbn:border-violet-500/40 rbn:text-violet-100',
  },
  statusIndicator: {
    tooltip: 'rbn:bg-[#14102b] rbn:border-violet-400/60 rbn:text-violet-100',
  },
  contextMenu: {
    list: 'rbn:bg-[#14102b] rbn:border rbn:border-violet-500/30',
    item: 'rbn:hover:bg-violet-500/20',
    itemLabel: 'rbn:text-violet-100',
    shortcut: 'rbn:text-violet-400/70',
    separator: 'rbn:border-violet-500/30',
    submenuPanel: 'rbn:bg-[#14102b] rbn:border rbn:border-violet-500/30',
  },
  breadcrumbs: {
    backButton: 'rbn:bg-[#14102b] rbn:border-violet-500/40 rbn:text-violet-100',
    selectTrigger:
      'rbn:bg-[#14102b] rbn:border-violet-500/40 rbn:text-violet-100 rbn:hover:bg-violet-500/20',
    list: 'rbn:text-violet-100',
    editButton: 'rbn:text-violet-100 rbn:hover:bg-violet-500/20',
  },
  runnerToggleButton:
    'rbn:bg-[#14102b]/90 rbn:border-violet-500/40 rbn:text-violet-100 rbn:hover:bg-violet-500/20',
  runnerPanel: {
    container: `rbn:bg-[#0d0a1f] rbn:border-violet-500/30 ${STAR_TEXT}`,
    overflowMenu: `rbn:[--color-graph-elevated-surface-bg:#0d0a1f] rbn:[--color-graph-toggle-track-bg:#14102b] rbn:border-violet-500/30 ${STAR_TEXT}`,
    overflowMenuItem: 'rbn:hover:bg-violet-500/20',
    overflowMenuItemActive: 'rbn:bg-violet-500/30 rbn:text-violet-50',
  },
  runControls: {
    container: 'rbn:bg-[#14102b] rbn:border-violet-500/20',
    playButton:
      'rbn:bg-violet-600 rbn:shadow-[0_0_16px_rgba(167,139,250,0.55)]',
    divider: 'rbn:bg-violet-500/30',
  },
  timeline: {
    container: `rbn:bg-[#0d0a1f] ${STAR_TEXT}`,
    toolbar: 'rbn:bg-[#0d0a1f]',
    trackArea: 'rbn:bg-[#02010a] rbn:border-violet-500/20',
    ruler: 'rbn:bg-[#14102b]',
    navButton: 'rbn:border-violet-500/30',
  },
  inspector: {
    container: `rbn:bg-[#0d0a1f] ${STAR_TEXT}`,
    sectionHeader:
      'rbn:bg-[#14102b] rbn:text-violet-100 rbn:border-violet-500/20',
    valueBox: 'rbn:bg-[#14102b] rbn:border-violet-500/30 rbn:text-violet-100',
    timelineBox: 'rbn:bg-[#14102b] rbn:border-violet-500/30',
  },
  drawer: {
    container: `rbn:bg-[#0d0a1f] rbn:border-violet-500/30 ${STAR_TEXT}`,
    title: 'rbn:text-violet-100',
    label: 'rbn:text-violet-200',
    footerButton: 'rbn:border-violet-500/40',
  },
  modal: {
    content: `rbn:bg-[#14102b] rbn:border-violet-500/30 ${STAR_TEXT}`,
    title: 'rbn:text-violet-100',
  },
  connectionMiniMap: { container: 'rbn:border-violet-500/30' },
  dragList: {
    row: 'rbn:bg-[#161130] rbn:text-violet-100 rbn:hover:bg-violet-500/20',
    preview: 'rbn:bg-[#161130] rbn:border-violet-500/40',
  },
  select: {
    trigger: 'rbn:bg-[#14102b] rbn:text-violet-100 rbn:border-violet-500/30',
    content: `rbn:bg-[#14102b] rbn:border-violet-500/30 rbn:text-violet-100 ${STAR_TEXT}`,
    item: 'rbn:hover:bg-violet-500/20',
  },
  tooltip: {
    content: `rbn:bg-[#14102b] rbn:border-violet-400/60 rbn:text-violet-100 ${STAR_TEXT}`,
  },
};

/**
 * Ruled notebook: the Lines background with an asymmetric `gap` tuple
 * ([10000, 36]) so only the horizontal ruling shows — also a live demo that
 * tuples REPLACE (not merge index-wise) through mergeGraphThemes.
 */
const ruledNotebookTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rbn:bg-white rbn:border-blue-200 ${NOTEBOOK_TEXT} rbn:[--color-graph-toggle-track-bg:#e7eef6] rbn:[--color-primary-gray:#c7d6e6] rbn:[&_.rbn\\:border-secondary-dark-gray]:border-blue-200`,
  },
  root: [
    'rbn:bg-[#fbfaf4]',
    'rbn:[--color-graph-menu-bg:#ffffff]',
    'rbn:[--color-graph-menu-item-hover-bg:#dbeafe]',
    'rbn:[--color-graph-elevated-surface-bg:#fdfcf7]',
    'rbn:[--color-graph-node-panel-content-bg:#f1f5f9]',
    'rbn:[--color-timeline-loop-accent:#f87171]',
    'rbn:[--color-timeline-switch-accent:#60a5fa]',
    'rbn:[--color-timeline-scrubber-active:#f87171]',
    'rbn:[--color-timeline-scrubber-line:rgba(248,113,113,0.5)]',
    'rbn:[--color-timeline-scrubber-line-active:rgba(248,113,113,0.85)]',
    'rbn:[--color-runner-muted-text:#64748b]',
    'rbn:[--color-timeline-hover-text:#0f172a]',
    'rbn:[--color-edge-value-pill-bg:#ffffff]',
    'rbn:[--color-edge-value-pill-border:#93c5fd]',
    'rbn:[--color-edge-value-pill-text:#1e293b]',
    'rbn:[--color-graph-scrollbar-thumb:#cbd5e1]',
    'rbn:[--color-timeline-scrollbar-thumb:#cbd5e1]',
    'rbn:[--color-timeline-scrollbar-track:#f1f5f9]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#e2e8f0]',
    'rbn:[--color-runner-resize-handle-bg:#eef2f6]',
    'rbn:[--color-runner-resize-handle-hover-bg:#e2e8f0]',
    'rbn:[--color-graph-toggle-track-bg:#eef2f6]',
    'rbn:[--color-drag-list-item-hover-bg:#e2e8f0]',
    'rbn:[--color-primary-gray:#dbe3ec]',
    'rbn:[--color-inspector-progress-track:#e2e8f0]',
  ].join(' '),
  reactFlow: {
    colorMode: 'light',
    background: {
      variant: 'lines',
      color: 'rgba(147, 197, 253, 0.55)',
      bgColor: '#fbfaf4',
      gap: [10000, 36],
      lineWidth: 1,
    },
    miniMap: {
      bgColor: '#ffffff',
      maskColor: 'rgba(241, 245, 249, 0.65)',
      nodeColor: '#e2e8f0',
      nodeStrokeColor: '#94a3b8',
    },
  },
  node: {
    container: 'rbn:focus:border-red-400 rbn:in-[.selected]:border-red-400',
    header: 'rbn:rounded-t-sm',
    headerTitle: 'rbn:font-serif rbn:italic',
    body: 'rbn:bg-white/95 rbn:rounded-b-sm rbn:border-x rbn:border-b rbn:border-blue-200 rbn:shadow-sm',
    outputRow: 'rbn:text-slate-800',
    inputRow: 'rbn:text-slate-800',
    panelHeader: 'rbn:text-slate-800 rbn:hover:bg-blue-100',
    inputField:
      'rbn:bg-white rbn:text-slate-800 rbn:border-blue-200 rbn:placeholder:text-slate-400',
  },
  statusIndicator: {
    tooltip: 'rbn:bg-white rbn:border-blue-200 rbn:text-slate-800',
  },
  contextMenu: {
    list: 'rbn:bg-white rbn:border-blue-100 rbn:shadow-slate-400/20',
    item: 'rbn:hover:bg-blue-100',
    itemLabel: 'rbn:text-slate-800',
    shortcut: 'rbn:text-slate-500',
    separator: 'rbn:border-blue-200',
    submenuPanel: 'rbn:bg-white rbn:shadow-slate-400/20',
  },
  breadcrumbs: {
    backButton: 'rbn:bg-white rbn:border-blue-200 rbn:text-slate-800',
    selectTrigger:
      'rbn:bg-white rbn:border-blue-200 rbn:text-slate-800 rbn:hover:bg-blue-50',
    list: 'rbn:text-slate-800 rbn:font-serif rbn:italic',
    editButton: 'rbn:text-slate-800 rbn:hover:bg-blue-100',
  },
  runnerToggleButton:
    'rbn:border-blue-200 rbn:bg-white/90 rbn:text-slate-800 rbn:hover:bg-blue-50',
  runnerPanel: {
    container: `rbn:bg-[#fdfcf7] rbn:border-blue-200 ${NOTEBOOK_TEXT}`,
    closeButton:
      'rbn:text-slate-500 rbn:hover:bg-blue-100 rbn:hover:text-slate-800',
    overflowMenu: `rbn:bg-white rbn:border-blue-200 ${NOTEBOOK_TEXT} rbn:[--color-graph-toggle-track-bg:#e7eef6] rbn:[--color-primary-gray:#c7d6e6] rbn:[&_.rbn\\:border-secondary-dark-gray]:border-blue-200`,
    overflowMenuItem: 'rbn:hover:bg-blue-100 rbn:hover:text-slate-900',
    overflowMenuItemActive: 'rbn:bg-blue-200 rbn:text-slate-900',
  },
  runControls: {
    container: 'rbn:bg-[#f4f1e8] rbn:border-blue-200',
    statusLabel: 'rbn:text-slate-800',
    divider: 'rbn:bg-blue-200',
    actionButton:
      'rbn:text-slate-700 rbn:hover:bg-blue-100 rbn:hover:text-slate-900',
    playButton: 'rbn:bg-red-400 rbn:shadow-[0_0_10px_rgba(248,113,113,0.4)]',
  },
  timeline: {
    container: `rbn:bg-[#f4f1e8] ${NOTEBOOK_TEXT}`,
    toolbar: 'rbn:bg-[#f4f1e8]',
    toolbarButton: 'rbn:text-slate-800 rbn:hover:bg-blue-100',
    navButton:
      'rbn:border-blue-200 rbn:bg-white rbn:text-slate-700 rbn:hover:bg-blue-100',
    ruler: 'rbn:bg-[#eef2f6]',
    trackArea: 'rbn:bg-white rbn:border-blue-200',
    loopHeader: 'rbn:bg-[#f4f1e8]',
    switchHeader: 'rbn:bg-[#f4f1e8]',
  },
  inspector: {
    container: `rbn:bg-[#fdfcf7] ${NOTEBOOK_TEXT}`,
    header: 'rbn:border-blue-200',
    sectionHeader: 'rbn:bg-[#eef2f6] rbn:text-slate-800 rbn:border-blue-200',
    valueBox: 'rbn:bg-white rbn:border-blue-200 rbn:text-slate-800',
    timelineBox: 'rbn:bg-[#f4f1e8] rbn:border-blue-200',
    contextBox: 'rbn:border-blue-200',
  },
  drawer: {
    container: `rbn:bg-[#fdfcf7] rbn:border-blue-200 ${NOTEBOOK_TEXT}`,
    header: 'rbn:border-blue-200',
    title: 'rbn:text-slate-800 rbn:font-serif rbn:italic',
    closeButton: 'rbn:hover:bg-blue-100',
    footer: 'rbn:border-blue-200',
    label: 'rbn:text-slate-800',
    emptyState: 'rbn:text-slate-500',
    footerButton:
      'rbn:bg-blue-50 rbn:text-slate-800 rbn:border-blue-200 rbn:hover:bg-blue-100',
  },
  modal: {
    content: `rbn:bg-[#fdfcf7] rbn:border-blue-200 ${NOTEBOOK_TEXT}`,
    title: 'rbn:text-slate-800 rbn:font-serif rbn:italic',
  },
  connectionMiniMap: { container: 'rbn:border-blue-200' },
  dragList: {
    row: 'rbn:bg-[#eef2f6] rbn:text-slate-800 rbn:hover:bg-blue-100',
    preview: 'rbn:bg-[#eef2f6] rbn:border-blue-200',
  },
  select: {
    trigger:
      'rbn:bg-white rbn:text-slate-800 rbn:border-blue-200 rbn:hover:bg-blue-50',
    content: `rbn:bg-white rbn:border-blue-200 rbn:text-slate-800 ${NOTEBOOK_TEXT}`,
    item: 'rbn:hover:bg-blue-100',
  },
  tooltip: {
    content: `rbn:bg-white rbn:border-blue-300/70 rbn:text-slate-800 ${NOTEBOOK_TEXT}`,
  },
};

/**
 * The README logo (docs/logo.svg), recreated as a theme with its EXACT
 * palette: background #0e1939, grid/cables #a1ccf7 (shadow cable #3d579e),
 * strokes #3170a0, brackets #97ccf7, coral box #ee7678 / #d05a5d, gold box
 * #f2db68 / #d1b747, sparkles #ffffff / #f6e16a. The isometric box side-faces
 * become hard offset shadows; the stroked logo circles become #3170a0 handle
 * rings.
 */
const logoTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rbn:rounded-none rbn:[--color-graph-elevated-surface-bg:#0b1430] rbn:[--color-graph-toggle-track-bg:#101c42] rbn:border-[#3170a0] ${LOGO_TEXT}`,
  },
  root: [
    'rbn:bg-[#0e1939]',
    'rbn:[--color-graph-menu-bg:#101c42]',
    'rbn:[--color-graph-menu-item-hover-bg:#1d2c5e]',
    'rbn:[--color-graph-elevated-surface-bg:#0b1430]',
    'rbn:[--color-graph-node-panel-content-bg:#13204a]',
    'rbn:[--color-timeline-loop-accent:#ee7678]',
    'rbn:[--color-timeline-switch-accent:#f2db68]',
    'rbn:[--color-timeline-scrubber-active:#a1ccf7]',
    'rbn:[--color-timeline-scrubber-line:rgba(161,204,247,0.55)]',
    'rbn:[--color-timeline-scrubber-line-active:rgba(161,204,247,0.9)]',
    'rbn:[--color-runner-muted-text:#5a76b8]',
    'rbn:[--color-timeline-hover-text:#dce9fb]',
    'rbn:[--color-edge-value-pill-bg:#0e1939]',
    'rbn:[--color-edge-value-pill-border:#3170a0]',
    'rbn:[--color-edge-value-pill-text:#a1ccf7]',
    'rbn:[--color-graph-scrollbar-thumb:#3170a0]',
    'rbn:[--color-timeline-scrollbar-thumb:#3170a0]',
    'rbn:[--color-timeline-scrollbar-track:#0b1430]',
    'rbn:[--color-timeline-scrollbar-track-webkit:#101c42]',
    'rbn:[--color-runner-resize-handle-bg:#101c42]',
    'rbn:[--color-runner-resize-handle-hover-bg:#1d2c5e]',
    'rbn:[--color-graph-toggle-track-bg:#101c42]',
    'rbn:[--color-drag-list-item-hover-bg:#1d2c5e]',
    'rbn:[--color-running-glow-strong:rgba(246,225,106,0.5)]',
    'rbn:[--color-running-glow-soft:rgba(246,225,106,0.3)]',
  ].join(' '),
  reactFlow: {
    colorMode: 'dark',
    background: {
      variant: 'lines',
      color: '#a1ccf7',
      bgColor: '#0e1939',
      gap: 80,
      lineWidth: 1.5,
    },
    miniMap: {
      bgColor: '#0b1430',
      maskColor: 'rgba(14, 25, 57, 0.75)',
      nodeColor: '#1d2c5e',
      nodeStrokeColor: '#3170a0',
    },
    connectionLine: { fallbackStrokeColor: '#a1ccf7' },
  },
  node: {
    container:
      'rbn:border-[3px] rbn:border-[#3170a0] rbn:rounded-none rbn:shadow-[-10px_10px_0_rgba(10,18,48,0.9)] rbn:in-[.selected]:border-[#97ccf7] rbn:focus:border-[#97ccf7]',
    header: 'rbn:rounded-none',
    body: 'rbn:rounded-none rbn:bg-[#101c42]',
    handleShape: 'rbn:border-[#3170a0]',
    inputField: 'rbn:bg-[#0e1939] rbn:border-[#3170a0] rbn:text-[#dce9fb]',
  },
  statusIndicator: {
    tooltip: 'rbn:bg-[#101c42] rbn:border-[#3170a0] rbn:text-[#dce9fb]',
  },
  contextMenu: {
    list: 'rbn:rounded-none rbn:bg-[#101c42] rbn:border-2 rbn:border-[#3170a0]',
    item: 'rbn:hover:bg-[#1d2c5e]',
    itemLabel: 'rbn:text-[#dce9fb]',
    shortcut: 'rbn:text-[#5a76b8]',
    separator: 'rbn:border-[#3170a0]/60',
    submenuPanel:
      'rbn:rounded-none rbn:bg-[#101c42] rbn:border-2 rbn:border-[#3170a0]',
  },
  breadcrumbs: {
    backButton:
      'rbn:rounded-none rbn:bg-[#101c42] rbn:border-[#3170a0] rbn:text-[#dce9fb]',
    selectTrigger:
      'rbn:rounded-none rbn:bg-[#101c42] rbn:border-[#3170a0] rbn:text-[#dce9fb] rbn:hover:bg-[#1d2c5e]',
    list: 'rbn:text-[#dce9fb]',
    editButton: 'rbn:text-[#dce9fb] rbn:hover:bg-[#1d2c5e]',
  },
  runnerToggleButton:
    'rbn:rounded-none rbn:bg-[#101c42]/90 rbn:border-[#3170a0] rbn:text-[#dce9fb] rbn:hover:bg-[#1d2c5e]',
  runnerPanel: {
    container: `rbn:rounded-none rbn:bg-[#0b1430] rbn:border-[#3170a0] ${LOGO_TEXT}`,
    overflowMenu: `rbn:rounded-none rbn:[--color-graph-elevated-surface-bg:#0b1430] rbn:[--color-graph-toggle-track-bg:#101c42] rbn:border-[#3170a0] ${LOGO_TEXT}`,
    overflowMenuItem: 'rbn:hover:bg-[#3170a0]/25',
    overflowMenuItemActive: 'rbn:bg-[#3170a0]/40 rbn:text-[#dce9fb]',
  },
  runControls: {
    container: 'rbn:bg-[#101c42] rbn:border-[#3170a0]/60',
    playButton:
      'rbn:rounded-none rbn:bg-[#f2db68] rbn:text-[#0e1939] rbn:shadow-[0_0_14px_rgba(246,225,106,0.55)]',
    actionButton: 'rbn:rounded-none rbn:hover:bg-[#1d2c5e]',
    divider: 'rbn:bg-[#3170a0]/60',
  },
  timeline: {
    container: `rbn:bg-[#0b1430] ${LOGO_TEXT}`,
    toolbar: 'rbn:bg-[#0b1430]',
    trackArea: 'rbn:rounded-none rbn:bg-[#0e1939] rbn:border-[#3170a0]/60',
    ruler: 'rbn:bg-[#101c42]',
    navButton: 'rbn:rounded-none rbn:border-[#3170a0]/60',
  },
  inspector: {
    container: `rbn:bg-[#0b1430] ${LOGO_TEXT}`,
    sectionHeader:
      'rbn:bg-[#101c42] rbn:text-[#dce9fb] rbn:border-[#3170a0]/60',
    valueBox:
      'rbn:rounded-none rbn:bg-[#101c42] rbn:border-[#3170a0] rbn:text-[#dce9fb]',
    timelineBox: 'rbn:rounded-none rbn:bg-[#101c42] rbn:border-[#3170a0]',
  },
  drawer: {
    container: `rbn:bg-[#0b1430] rbn:border-[#3170a0] ${LOGO_TEXT}`,
    title: 'rbn:text-[#dce9fb]',
    label: 'rbn:text-[#a1ccf7]',
    footerButton: 'rbn:rounded-none rbn:border-[#3170a0]',
  },
  modal: {
    content: `rbn:rounded-none rbn:bg-[#101c42] rbn:border-2 rbn:border-[#3170a0] ${LOGO_TEXT}`,
    title: 'rbn:text-[#dce9fb]',
  },
  connectionMiniMap: { container: 'rbn:rounded-none rbn:border-[#3170a0]' },
  dragList: {
    row: 'rbn:rounded-none rbn:bg-[#13204a] rbn:text-[#dce9fb] rbn:hover:bg-[#1d2c5e]',
    preview: 'rbn:rounded-none rbn:bg-[#13204a] rbn:border-[#3170a0]',
  },
  select: {
    trigger:
      'rbn:rounded-none rbn:bg-[#101c42] rbn:text-[#dce9fb] rbn:border-[#3170a0]',
    content: `rbn:rounded-none rbn:bg-[#101c42] rbn:border-2 rbn:border-[#3170a0] rbn:text-[#dce9fb] ${LOGO_TEXT}`,
    item: 'rbn:hover:bg-[#1d2c5e]',
  },
  tooltip: {
    content: `rbn:rounded-none rbn:bg-[#101c42] rbn:border-[#97ccf7]/70 rbn:text-[#dce9fb] ${LOGO_TEXT}`,
  },
};

type StoryThemeDefinition = {
  label: string;
  description: string;
  preset: GraphThemePresetName;
  theme?: GraphTheme;
};

const storyThemesMap = {
  blenderDark: {
    label: 'Blender Dark',
    description:
      'The built-in default. An empty preset — the components’ own classes are the theme.',
    preset: 'blenderDark',
  },
  daylight: {
    label: 'Daylight',
    description:
      'The built-in light preset: slot classes + root var overrides + descendant text recolors.',
    preset: 'light',
  },
  neonHeist: {
    label: 'Neon Heist',
    description:
      'Cyberpunk magenta/cyan: glowing nodes, recolored loop/switch accents and scrubber via root vars, line-grid canvas.',
    preset: 'blenderDark',
    theme: neonHeistTheme,
  },
  terminalGreen: {
    label: 'Terminal Green',
    description:
      'Phosphor CRT: pure black, monospace everywhere, square corners, grayscale node headers via a saturate-0 header slot.',
    preset: 'blenderDark',
    theme: terminalGreenTheme,
  },
  sunsetPaper: {
    label: 'Sunset Paper',
    description:
      'Warm sepia daylight built ON TOP of the light preset (deep-merge demo): amber chrome, dotted paper canvas, soft radii.',
    preset: 'light',
    theme: sunsetPaperTheme,
  },
  deepOcean: {
    label: 'Deep Ocean',
    description:
      'Abyssal navy with cyan instrumentation and indigo switch accents on a fine dot grid.',
    preset: 'blenderDark',
    theme: deepOceanTheme,
  },
  blueprint: {
    label: 'Blueprint',
    description:
      'Cobalt drafting table: a fine white Lines grid (the classic blueprint look) with mono uppercase node headers.',
    preset: 'blenderDark',
    theme: blueprintTheme,
  },
  halftonePop: {
    label: 'Halftone Pop',
    description:
      'Comic pop-art: a dense Dots background as a halftone screen on yellow, hard black borders and offset shadows.',
    preset: 'light',
    theme: halftonePopTheme,
  },
  observatory: {
    label: 'Observatory',
    description:
      'Night sky: sparse bright Dots (gap 64, size 1.5) become a starfield over space black, with violet chrome and an amber scrubber.',
    preset: 'blenderDark',
    theme: observatoryTheme,
  },
  ruledNotebook: {
    label: 'Ruled Notebook',
    description:
      'Lines background with an asymmetric gap tuple ([10000, 36]) so only horizontal ruling shows — handwriting-style serif titles on paper.',
    preset: 'light',
    theme: ruledNotebookTheme,
  },
  logo: {
    label: 'Logo',
    description:
      'The README logo (docs/logo.svg) come to life: its exact navy #0e1939 + periwinkle #a1ccf7 grid, steel-blue #3170a0 strokes and handle rings, isometric hard-shadow boxes, coral/gold loop-switch accents, gold play button.',
    preset: 'blenderDark',
    theme: logoTheme,
  },
} as const satisfies Record<string, StoryThemeDefinition>;

type StoryThemeId = keyof typeof storyThemesMap;

const storyThemeIds = Object.keys(storyThemesMap) as StoryThemeId[];

/**
 * Gallery of wildly different GraphThemes driven by one selector. Each entry
 * is a preset plus (optionally) a custom GraphTheme deep-merged on top —
 * exercising slot classes, root CSS-variable overrides, descendant text
 * recolors, and the reactFlow section (colorMode, Background variants,
 * MiniMap colors).
 */
export const ThemedPlayground: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const [activeThemeId, setActiveThemeId] =
      useState<StoryThemeId>('neonHeist');
    const activeTheme = storyThemesMap[activeThemeId];
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      enableTypeInference: true,
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      nodes: state1.nodes as Nodes,
      edges: state1.edges as Edges,
    });

    return (
      <GraphThemeProvider
        preset={activeTheme.preset}
        theme={'theme' in activeTheme ? activeTheme.theme : undefined}
      >
        <div
          style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              background: '#27272a',
              color: '#e4e4e7',
              fontFamily: 'sans-serif',
              fontSize: 13,
            }}
          >
            <label htmlFor='story-theme-selector' style={{ fontWeight: 600 }}>
              Theme
            </label>
            <select
              id='story-theme-selector'
              data-testid='story-theme-selector'
              value={activeThemeId}
              onChange={(event) =>
                setActiveThemeId(event.target.value as StoryThemeId)
              }
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #71717a',
                background: '#18181b',
                color: '#e4e4e7',
                cursor: 'pointer',
              }}
            >
              {storyThemeIds.map((themeId) => (
                <option key={themeId} value={themeId}>
                  {storyThemesMap[themeId].label}
                </option>
              ))}
            </select>
            <span style={{ opacity: 0.75 }}>{activeTheme.description}</span>
          </div>
          <div style={{ minHeight: 0, flex: 1 }}>
            <FullGraph
              state={state}
              dispatch={dispatch}
              functionImplementations={exampleImplementations}
            />
          </div>
        </div>
      </GraphThemeProvider>
    );
  },
};

export const WithControlledInputs: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      nodes: [
        {
          id: 'n1',
          position: { x: 0, y: 200 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Interactive Data Source',
            headerColor: '#C44536',
            outputs: [
              {
                name: 'Processed Output',
                id: 'output1',
                type: 'string',
                handleColor: '#FF6B6B',
              },
            ],
            inputs: [
              {
                name: 'Text Input',
                id: 'input1',
                type: 'string',
                handleColor: '#00BFFF',
                allowInput: true,
                value: 'Interactive Text',
              },
              {
                name: 'Number Input',
                id: 'input2',
                type: 'number',
                handleColor: '#96CEB4',
                allowInput: true,
                value: 42,
              },
            ],
          },
        },
        {
          id: 'n2',
          position: { x: 500, y: 200 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Advanced Processor',
            headerColor: '#2D5A87',
            inputs: [
              {
                name: 'Primary Input',
                id: 'input1',
                type: 'string',
                handleColor: '#00BFFF',
                allowInput: true,
                value: 'Configuration',
              },
              {
                id: 'panel1',
                name: 'Settings Panel',
                inputs: [
                  {
                    name: 'Threshold',
                    id: 'panel1_input1',
                    type: 'number',
                    handleColor: '#96CEB4',
                    allowInput: true,
                    value: 75,
                  },
                  {
                    name: 'Read-only Setting',
                    id: 'panel1_input2',
                    type: 'string',
                    handleColor: '#00FFFF',
                    allowInput: false,
                  },
                ],
              },
            ],
            outputs: [
              {
                name: 'Final Result',
                id: 'output1',
                type: 'string',
                handleColor: '#FECA57',
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'n1-n2',
          source: 'n1',
          sourceHandle: 'output1',
          target: 'n2',
          targetHandle: 'input1',
          type: 'configurableEdge',
        },
      ],
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return <FullGraph state={state} dispatch={dispatch} />;
  },
};

/**
 * Fan-in: three Source nodes all wire into the Combiner's single `Inputs` handle.
 * Because the handle has 2+ connections, a compact reorder control (an
 * ordered-list icon + the connection count) appears at it — click it to open a
 * drag-to-reorder list of the incoming connections. The order
 * is persisted per-edge and is the order the runner / codegen consume the fan-in.
 */
export const WithFanInConnectionOrder: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      nodes: [
        {
          id: 'srcA',
          position: { x: 0, y: 0 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 320,
          data: {
            name: 'Source A',
            headerColor: '#C44536',
            inputs: [],
            outputs: [
              {
                name: 'Value',
                id: 'srcA_out',
                type: 'string',
                handleColor: '#FF6B6B',
              },
            ],
          },
        },
        {
          id: 'srcB',
          position: { x: 0, y: 220 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 320,
          data: {
            name: 'Source B',
            headerColor: '#C4783D',
            inputs: [],
            outputs: [
              {
                name: 'Value',
                id: 'srcB_out',
                type: 'string',
                handleColor: '#FFA94D',
              },
            ],
          },
        },
        {
          id: 'srcC',
          position: { x: 0, y: 440 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 320,
          data: {
            name: 'Source C',
            headerColor: '#2D5A87',
            inputs: [],
            outputs: [
              {
                name: 'Value',
                id: 'srcC_out',
                type: 'string',
                handleColor: '#4DA3FF',
              },
            ],
          },
        },
        {
          id: 'sink',
          position: { x: 560, y: 220 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 360,
          data: {
            name: 'Combiner',
            headerColor: '#344621',
            inputs: [
              {
                name: 'Inputs',
                id: 'sink_in',
                type: 'string',
                handleColor: '#00BFFF',
              },
            ],
            outputs: [
              {
                name: 'Result',
                id: 'sink_out',
                type: 'string',
                handleColor: '#FECA57',
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'eA',
          source: 'srcA',
          sourceHandle: 'srcA_out',
          target: 'sink',
          targetHandle: 'sink_in',
          type: 'configurableEdge',
        },
        {
          id: 'eB',
          source: 'srcB',
          sourceHandle: 'srcB_out',
          target: 'sink',
          targetHandle: 'sink_in',
          type: 'configurableEdge',
        },
        {
          id: 'eC',
          source: 'srcC',
          sourceHandle: 'srcC_out',
          target: 'sink',
          targetHandle: 'sink_in',
          type: 'configurableEdge',
        },
      ],
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return <FullGraph state={state} dispatch={dispatch} />;
  },
};

/**
 * The fan-in reorder control + its popover under the LIGHT preset. Verifies the
 * PORTALED popover themes correctly — its surface/text follow the theme via the
 * `node.inputOrderPopover` slot instead of staying the default dark (root CSS-var
 * overrides can't reach a portal). Open the blue count badge on the Combiner.
 */
export const WithFanInConnectionOrderThemed: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      nodes: [
        {
          id: 'tsrcA',
          position: { x: 0, y: 0 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 300,
          data: {
            name: 'Source A',
            headerColor: '#C44536',
            inputs: [],
            outputs: [
              {
                name: 'Value',
                id: 'tsrcA_out',
                type: 'string',
                handleColor: '#FF6B6B',
              },
            ],
          },
        },
        {
          id: 'tsrcB',
          position: { x: 0, y: 180 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 300,
          data: {
            name: 'Source B',
            headerColor: '#C4783D',
            inputs: [],
            outputs: [
              {
                name: 'Value',
                id: 'tsrcB_out',
                type: 'string',
                handleColor: '#FFA94D',
              },
            ],
          },
        },
        {
          id: 'tsink',
          position: { x: 460, y: 90 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 340,
          data: {
            name: 'Combiner',
            headerColor: '#344621',
            inputs: [
              {
                name: 'Inputs',
                id: 'tsink_in',
                type: 'string',
                handleColor: '#00BFFF',
              },
            ],
            outputs: [
              {
                name: 'Result',
                id: 'tsink_out',
                type: 'string',
                handleColor: '#FECA57',
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'te1',
          source: 'tsrcA',
          sourceHandle: 'tsrcA_out',
          target: 'tsink',
          targetHandle: 'tsink_in',
          type: 'configurableEdge',
        },
        {
          id: 'te2',
          source: 'tsrcB',
          sourceHandle: 'tsrcB_out',
          target: 'tsink',
          targetHandle: 'tsink_in',
          type: 'configurableEdge',
        },
      ],
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return (
      <GraphThemeProvider preset='light'>
        <FullGraph state={state} dispatch={dispatch} />
      </GraphThemeProvider>
    );
  },
};

/**
 * The same fan-in reorder popover under a DARK custom theme (Neon Heist) — proves
 * the portaled popover follows a non-preset theme too: its surface/border/text
 * come from the theme's shared `popover.surface` slot (which also themes the
 * runner overflow menus), not the default dark. Open the count badge on the
 * Combiner. Companion to `WithFanInConnectionOrderThemed` (light preset).
 */
export const WithFanInConnectionOrderThemedDark: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      nodes: [
        {
          id: 'dsrcA',
          position: { x: 0, y: 0 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 280,
          data: {
            name: 'Source A',
            headerColor: '#7a1f6b',
            inputs: [],
            outputs: [
              {
                name: 'Value',
                id: 'dsrcA_out',
                type: 'string',
                handleColor: '#ff2bd6',
              },
            ],
          },
        },
        {
          id: 'dsrcB',
          position: { x: 0, y: 170 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 280,
          data: {
            name: 'Source B',
            headerColor: '#1f5f7a',
            inputs: [],
            outputs: [
              {
                name: 'Value',
                id: 'dsrcB_out',
                type: 'string',
                handleColor: '#2bd6ff',
              },
            ],
          },
        },
        {
          id: 'dsink',
          position: { x: 440, y: 85 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 320,
          data: {
            name: 'Combiner',
            headerColor: '#3a1f5f',
            inputs: [
              {
                name: 'Inputs',
                id: 'dsink_in',
                type: 'string',
                handleColor: '#ff2bd6',
              },
            ],
            outputs: [
              {
                name: 'Result',
                id: 'dsink_out',
                type: 'string',
                handleColor: '#2bd6ff',
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'de1',
          source: 'dsrcA',
          sourceHandle: 'dsrcA_out',
          target: 'dsink',
          targetHandle: 'dsink_in',
          type: 'configurableEdge',
        },
        {
          id: 'de2',
          source: 'dsrcB',
          sourceHandle: 'dsrcB_out',
          target: 'dsink',
          targetHandle: 'dsink_in',
          type: 'configurableEdge',
        },
      ],
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return (
      <GraphThemeProvider preset='blenderDark' theme={neonHeistTheme}>
        <FullGraph state={state} dispatch={dispatch} />
      </GraphThemeProvider>
    );
  },
};

export const WithHandleShapes: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      nodes: [
        {
          id: 'shape-showcase-1',
          position: { x: 0, y: 390 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Handle Shapes Node 1',
            headerColor: '#8B5CF6',
            inputs: [
              {
                id: 'circle-input',
                name: 'Circle Input',
                type: 'string',
                handleColor: '#FF6B6B',
                handleShape: handleShapesMap.circle,
                allowInput: true,
              },
              {
                id: 'square-input',
                name: 'Square Input',
                type: 'string',
                handleColor: '#00FFFF',
                handleShape: handleShapesMap.square,
                allowInput: true,
              },
              {
                id: 'rectangle-input',
                name: 'Rectangle Input',
                type: 'string',
                handleColor: '#00BFFF',
                handleShape: handleShapesMap.rectangle,
                allowInput: true,
              },
            ],
            outputs: [
              {
                id: 'list-output',
                name: 'List Output',
                type: 'string',
                handleColor: '#96CEB4',
                handleShape: handleShapesMap.list,
              },
              {
                id: 'grid-output',
                name: 'Grid Output',
                type: 'string',
                handleColor: '#FECA57',
                handleShape: handleShapesMap.grid,
              },
            ],
          },
        },
        {
          id: 'shape-showcase-2',
          position: { x: 600, y: 200 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Handle Shapes Node 2',
            headerColor: '#2D5A87',
            inputs: [
              {
                id: 'list-input',
                name: 'List Input',
                type: 'string',
                handleColor: '#96CEB4',
                handleShape: handleShapesMap.list,
                allowInput: false,
              },
              {
                id: 'grid-input',
                name: 'Grid Input',
                type: 'string',
                handleColor: '#FECA57',
                handleShape: handleShapesMap.grid,
                allowInput: false,
              },
            ],
            outputs: [
              {
                id: 'circle-output',
                name: 'Circle Output',
                type: 'string',
                handleColor: '#FF9FF3',
                handleShape: handleShapesMap.circle,
              },
              {
                id: 'square-output',
                name: 'Square Output',
                type: 'string',
                handleColor: '#A8E6CF',
                handleShape: handleShapesMap.square,
              },
              {
                id: 'rectangle-output',
                name: 'Rectangle Output',
                type: 'string',
                handleColor: '#FFD93D',
                handleShape: handleShapesMap.rectangle,
              },
            ],
          },
        },
        {
          id: 'shape-showcase-3',
          position: { x: 1200, y: 120 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Mixed Shapes Node',
            headerColor: '#B8860B',
            inputs: [
              {
                id: 'mixed-input-1',
                name: 'Circle Input',
                type: 'string',
                handleColor: '#FF6B6B',
                handleShape: handleShapesMap.circle,
                allowInput: false,
              },
              {
                id: 'mixed-input-2',
                name: 'Square Input',
                type: 'string',
                handleColor: '#00FFFF',
                handleShape: handleShapesMap.square,
                allowInput: false,
              },
            ],
            outputs: [
              {
                id: 'mixed-output',
                name: 'Final Output',
                type: 'string',
                handleColor: '#00FFFF',
                handleShape: handleShapesMap.grid,
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'shape-showcase-1',
          sourceHandle: 'list-output',
          target: 'shape-showcase-2',
          targetHandle: 'list-input',
          type: 'configurableEdge',
        },
        {
          id: 'edge-2',
          source: 'shape-showcase-1',
          sourceHandle: 'grid-output',
          target: 'shape-showcase-2',
          targetHandle: 'grid-input',
          type: 'configurableEdge',
        },
        {
          id: 'edge-3',
          source: 'shape-showcase-2',
          sourceHandle: 'circle-output',
          target: 'shape-showcase-3',
          targetHandle: 'mixed-input-1',
          type: 'configurableEdge',
        },
        {
          id: 'edge-4',
          source: 'shape-showcase-2',
          sourceHandle: 'square-output',
          target: 'shape-showcase-3',
          targetHandle: 'mixed-input-2',
          type: 'configurableEdge',
        },
      ],
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return <FullGraph state={state} dispatch={dispatch} />;
  },
};

export const WithTypeCheckingAndConversions: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    // Create initial state with allowed conversions
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      nodes: [],
      edges: [],
      // Define allowed conversions between data types
      allowedConversionsBetweenDataTypes: {
        validatedData: {
          textInput: true,
        },
      },
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
      enableRecursionChecking: true,
      enableDebugMode: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            padding: '10px',
            backgroundColor: '#1a1a1a',
            color: 'white',
            borderBottom: '1px solid #333',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>
            Type Checking & Conversion Demo
          </h3>
          <p style={{ margin: '0', fontSize: '14px', opacity: 0.8 }}>
            This demo shows type checking and conversion capabilities.
            Connections will be added automatically:
          </p>
          <ul
            style={{
              margin: '5px 0 0 0',
              paddingLeft: '20px',
              fontSize: '12px',
              opacity: 0.7,
            }}
          >
            <li>String → Infer Type (with type inference)</li>
            <li>Infer Type → String (maintains inferred type)</li>
            <li>Number → Number (direct connection)</li>
          </ul>
        </div>
        <div style={{ flex: 1 }}>
          <FullGraph state={state} dispatch={dispatch} />
        </div>
      </div>
    );
  },
};

export const WithCycleChecking: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      nodes: [],
      edges: [],
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            padding: '10px',
            backgroundColor: '#1a1a1a',
            color: 'white',
            borderBottom: '1px solid #333',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>Cycle Checking Demo</h3>
          <p style={{ margin: '0', fontSize: '14px', opacity: 0.8 }}>
            This demo shows cycle checking, it won't allow a connection that
            creates a cycle
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <FullGraph state={state} dispatch={dispatch} />
        </div>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────
// Circuit Gate Demo — Data Types, Node Types, Implementations
// ─────────────────────────────────────────────────────

const circuitExampleDataTypes = {
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
  ...standardDataTypes,
} as const;

type CircuitDataTypeId = keyof typeof circuitExampleDataTypes;

const circuitExampleTypeOfNodes = {
  andGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'andGate'>({
    name: 'AND Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  orGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'orGate'>({
    name: 'OR Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  notGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'notGate'>({
    name: 'NOT Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  xorGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'xorGate'>({
    name: 'XOR Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  nandGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'nandGate'>({
    name: 'NAND Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  norGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'norGate'>({
    name: 'NOR Gate',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  buffer: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'buffer'>({
    name: 'Buffer',
    headerColor: '#9B0F2B',
    locationInContextMenu: ['Utility'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  // A genuine fan-in consumer: a SINGLE `In` handle (left unbounded so it accepts
  // multiple edges) that ORs together every connected bit. Its impl reads the
  // WHOLE `readInput(inputs, 'In')` array, so under fan-in codegen renders it as
  // the array form `[a, b, …].some(…)` instead of dropping all but the first.
  anyOf: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'anyOf'>({
    name: 'Any Of (bus OR)',
    headerColor: '#8B5CC8',
    locationInContextMenu: ['Logic Gates'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  bitConstant: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'bitConstant'>({
    name: 'Bit Input',
    headerColor: '#C75B8E',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'Value', dataType: 'bit', allowInput: true }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  bitDisplay: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'bitDisplay'>({
    name: 'Bit Output',
    headerColor: '#4A96BA',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [],
  }),
  // Numeric graph I/O — needed by the loop-counter demo: a loop's carry channel
  // is strictly single-typed, so a NUMERIC count must be seeded/displayed by
  // number nodes (a bit source/sink would make the carry type-inconsistent).
  numberConstant: makeTypeOfNodeWithAutoInfer<
    CircuitDataTypeId,
    'numberConstant'
  >({
    name: 'Number Input',
    headerColor: '#C75B8E',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'Value', dataType: 'number', allowInput: true }],
    outputs: [{ name: 'Out', dataType: 'number' }],
  }),
  numberDisplay: makeTypeOfNodeWithAutoInfer<
    CircuitDataTypeId,
    'numberDisplay'
  >({
    name: 'Number Output',
    headerColor: '#4A96BA',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'In', dataType: 'number' }],
    outputs: [],
  }),
  counter: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId, 'counter'>({
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
    CircuitDataTypeId,
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
  ...standardNodeTypes,
} as const;

type CircuitNodeTypeId = keyof typeof circuitExampleTypeOfNodes;

/**
 * Extract the first connection value from an input handle,
 * falling back to the user-entered default, then to a provided fallback.
 */
function getFirstInputVal(
  handle: InputHandleValue | undefined,
  fallback: unknown = undefined,
): unknown {
  if (!handle) return fallback;
  if (handle.connections.length > 0) return handle.connections[0].value;
  if (handle.isDefault) return handle.defaultValue;
  return fallback;
}

const circuitImplementations =
  makeFunctionImplementationsWithAutoInfer<CircuitNodeTypeId>({
    // Every gate reads its inputs via the recognized `readInput(...)[0]` intrinsic
    // and returns a SINGLE pure expression, so `analyzeImplementations` AUTO-EMITS
    // them inline — no authored `emit` hook needed (the impl is the single source
    // of truth). A fan-in input renders as its first connection (value-identical to
    // this `[0]` read); see `anyOf` for the whole-array form.
    andGate: (inputs) =>
      new Map([
        [
          'Out',
          Boolean(readInput(inputs, 'A')[0]) &&
            Boolean(readInput(inputs, 'B')[0]),
        ],
      ]),
    orGate: (inputs) =>
      new Map([
        [
          'Out',
          Boolean(readInput(inputs, 'A')[0]) ||
            Boolean(readInput(inputs, 'B')[0]),
        ],
      ]),
    // `!` already coerces to boolean, so no `Boolean(...)` wrapper (which would
    // be a redundant cast lint flags); codegen renders `!In`.
    notGate: (inputs) => new Map([['Out', !readInput(inputs, 'In')[0]]]),
    xorGate: (inputs) =>
      new Map([
        [
          'Out',
          Boolean(readInput(inputs, 'A')[0]) !==
            Boolean(readInput(inputs, 'B')[0]),
        ],
      ]),
    nandGate: (inputs) =>
      new Map([
        [
          'Out',
          !(
            Boolean(readInput(inputs, 'A')[0]) &&
            Boolean(readInput(inputs, 'B')[0])
          ),
        ],
      ]),
    norGate: (inputs) =>
      new Map([
        [
          'Out',
          !(
            Boolean(readInput(inputs, 'A')[0]) ||
            Boolean(readInput(inputs, 'B')[0])
          ),
        ],
      ]),
    buffer: (inputs) => new Map([['Out', Boolean(readInput(inputs, 'In')[0])]]),
    // Reads the WHOLE `In` fan-in array (no `[0]`) and ORs every connection. No
    // authored `emit` hook, so `analyzeImplementations` AUTO-DERIVES it; under a
    // fan-in codegen renders the input as the array `[a, b, …].some(…)` (the
    // "uses both" form) instead of dropping all but the first connection.
    anyOf: (inputs) =>
      new Map([
        ['Out', readInput(inputs, 'In').some((value) => Boolean(value))],
      ]),
    // Reads its input through the `readInput` intrinsic + only the `Boolean`
    // global ⇒ self-contained ⇒ AUTO-EMITS inline (no `emit` hook) when
    // `analyzeImplementations` is on, instead of threading.
    bitConstant: (inputs) =>
      new Map([['Out', Boolean(readInput(inputs, 'Value')[0])]]),
    bitDisplay: () => {
      return new Map();
    },
    numberConstant: (inputs) =>
      new Map([['Out', Number(readInput(inputs, 'Value')[0])]]),
    numberDisplay: () => {
      return new Map();
    },
    counter: (inputs) => {
      const count = Number(getFirstInputVal(inputs.get('Count'), 0));
      const max = Number(getFirstInputVal(inputs.get('Max'), 10));
      return new Map<string, unknown>([
        ['Count + 1', count + 1],
        ['Reached Max', count + 1 >= max],
      ]);
    },
    configurableGate: (inputs) => {
      const a = Boolean(getFirstInputVal(inputs.get('A'), false));
      const b = Boolean(getFirstInputVal(inputs.get('B'), false));
      const mode = String(getFirstInputVal(inputs.get('Mode'), 'AND'));
      const operations: Record<string, (x: boolean, y: boolean) => boolean> = {
        AND: (x, y) => x && y,
        OR: (x, y) => x || y,
        XOR: (x, y) => x !== y,
        NAND: (x, y) => !(x && y),
        NOR: (x, y) => !(x || y),
        XNOR: (x, y) => x === y,
      };
      const operation = operations[mode] ?? operations['AND'];
      return new Map([['Out', operation(a, b)]]);
    },
  });

// ─────────────────────────────────────────────────────
// Pre-built Half-Adder Circuit
//
//   BitConstant(A=true) ──┬──> AND Gate ──> BitDisplay (Carry)
//                         └──> XOR Gate ──> BitDisplay (Sum)
//   BitConstant(B=true) ──┬──> AND Gate
//                         └──> XOR Gate
//
// Demonstrates: fan-out, concurrent execution, function implementations
// ─────────────────────────────────────────────────────

/**
 * Build the pre-wired half-adder graph using constructNodeOfType
 * so handle IDs are generated correctly and edges are valid.
 */
// function buildHalfAdderGraph() {
//   const dt = circuitExampleDataTypes;
//   const nt = circuitExampleTypeOfNodes;

//   const constA = constructNodeOfType(dt, 'bitConstant', nt, 'const-a', {
//     x: 0,
//     y: 100,
//   });
//   const constB = constructNodeOfType(dt, 'bitConstant', nt, 'const-b', {
//     x: 0,
//     y: 350,
//   });
//   const andNode = constructNodeOfType(dt, 'andGate', nt, 'and-gate', {
//     x: 550,
//     y: 100,
//   });
//   const xorNode = constructNodeOfType(dt, 'xorGate', nt, 'xor-gate', {
//     x: 550,
//     y: 350,
//   });
//   const displayCarry = constructNodeOfType(
//     dt,
//     'bitDisplay',
//     nt,
//     'display-carry',
//     { x: 1100, y: 100 },
//   );
//   const displaySum = constructNodeOfType(dt, 'bitDisplay', nt, 'display-sum', {
//     x: 1100,
//     y: 350,
//   });

//   // Set initial values on the bit constants (A=true, B=true)
//   const setInputValue = (node: typeof constA, idx: number, value: boolean) => {
//     const input = node.data.inputs?.[idx];
//     if (input && 'type' in input && input.type === 'boolean') {
//       input.value = value;
//     }
//   };
//   setInputValue(constA, 0, true);
//   setInputValue(constB, 0, true);

//   // Helpers to extract handle IDs from constructed nodes
//   const outId = (node: typeof constA, idx: number): string =>
//     node.data.outputs?.[idx]?.id ?? '';
//   const inId = (node: typeof constA, idx: number): string =>
//     node.data.inputs?.[idx]?.id ?? '';

//   const nodes = [constA, constB, andNode, xorNode, displayCarry, displaySum];

//   const edges = [
//     // A → AND.A, A → XOR.A (fan-out from Bit Constant A)
//     {
//       id: 'e1',
//       source: 'const-a',
//       sourceHandle: outId(constA, 0),
//       target: 'and-gate',
//       targetHandle: inId(andNode, 0),
//       type: 'configurableEdge' as const,
//     },
//     {
//       id: 'e2',
//       source: 'const-a',
//       sourceHandle: outId(constA, 0),
//       target: 'xor-gate',
//       targetHandle: inId(xorNode, 0),
//       type: 'configurableEdge' as const,
//     },
//     // B → AND.B, B → XOR.B (fan-out from Bit Constant B)
//     {
//       id: 'e3',
//       source: 'const-b',
//       sourceHandle: outId(constB, 0),
//       target: 'and-gate',
//       targetHandle: inId(andNode, 1),
//       type: 'configurableEdge' as const,
//     },
//     {
//       id: 'e4',
//       source: 'const-b',
//       sourceHandle: outId(constB, 0),
//       target: 'xor-gate',
//       targetHandle: inId(xorNode, 1),
//       type: 'configurableEdge' as const,
//     },
//     // AND → Carry Display, XOR → Sum Display
//     {
//       id: 'e5',
//       source: 'and-gate',
//       sourceHandle: outId(andNode, 0),
//       target: 'display-carry',
//       targetHandle: inId(displayCarry, 0),
//       type: 'configurableEdge' as const,
//     },
//     {
//       id: 'e6',
//       source: 'xor-gate',
//       sourceHandle: outId(xorNode, 0),
//       target: 'display-sum',
//       targetHandle: inId(displaySum, 0),
//       type: 'configurableEdge' as const,
//     },
//   ];

//   return { nodes, edges };
// }

// const halfAdderGraph = buildHalfAdderGraph();

// ─────────────────────────────────────────────────────
// WithRunner Story
// ─────────────────────────────────────────────────────

/**
 * Shared body for the runner stories: the circuit editor pre-loaded with the
 * adder-loop state + recording so the timeline/inspector populate. When `frame`
 * is given the editor renders inside a fixed-size box, which exercises the
 * container-query responsive layout — the runner panel reflows to its OWN width,
 * not the browser viewport's.
 */
function RunnerStoryView({
  frame,
  nodePreviews,
  decorateForPreviewDemo = false,
  omitRunner = false,
  bottomDrawers,
}: {
  frame?: { width: number; height: number };
  nodePreviews?: NodePreviewRegistry<CircuitNodeTypeId>;
  /** Preview demo only: name the first previewable node + collapse the second. */
  decorateForPreviewDemo?: boolean;
  /** Tier-2 demo: render WITHOUT a runner (no impls / record) so previews show
   *  their null-safe empty states. */
  omitRunner?: boolean;
  /** Consumer bottom drawers beside the runner (the `drawers` story control). */
  bottomDrawers?: ReadonlyArray<GraphBottomDrawer>;
}) {
  const { state, dispatch } = useFullGraph<
    CircuitDataTypeId,
    CircuitNodeTypeId
  >({
    dataTypes: circuitExampleDataTypes,
    typeOfNodes: circuitExampleTypeOfNodes,
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

  // Load the pre-built state via REPLACE_STATE so zones are rehydrated
  const hasLoaded = useRef(false);
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    // adderLoopState is built with default generics; force it into this story's
    // concrete state shape (deliberate cross-fixture injection). For the preview
    // demo, decorate the first previewable node with a custom name (so its panel
    // shows `Custom : Type`) and start the second one collapsed (STORY-6).
    const rawNodes = adderLoopState.state.nodes as unknown as Array<{
      data?: { nodeTypeUniqueId?: string };
    }>;
    let named = false;
    let collapsed = false;
    const nodes = (decorateForPreviewDemo && nodePreviews
      ? rawNodes.map((node) => {
          const typeId = node.data?.nodeTypeUniqueId as
            | CircuitNodeTypeId
            | undefined;
          if (!typeId || !nodePreviews[typeId]) return node;
          if (!named) {
            named = true;
            return { ...node, data: { ...node.data, customName: 'Flagship' } };
          }
          if (!collapsed) {
            collapsed = true;
            return {
              ...node,
              data: { ...node.data, previewCollapsed: true },
            };
          }
          return node;
        })
      : rawNodes) as unknown as typeof state.nodes;
    dispatch({
      type: 'REPLACE_STATE',
      payload: {
        state: {
          ...state,
          nodes,
          edges: adderLoopState.state.edges as unknown as typeof state.edges,
        },
      },
    });
  }, [dispatch, state, nodePreviews, decorateForPreviewDemo]);

  const [record, setRecord] = useState(adderLoopRecording ?? null);

  const editor = (
    <FullGraph<CircuitDataTypeId, CircuitNodeTypeId>
      state={state}
      dispatch={dispatch}
      functionImplementations={omitRunner ? undefined : circuitImplementations}
      executionRecord={omitRunner ? undefined : record}
      onExecutionRecordChange={omitRunner ? undefined : setRecord}
      nodePreviews={nodePreviews}
      bottomDrawers={bottomDrawers}
      onStateImported={(imported) => console.log('State imported:', imported)}
      onRecordingImported={(record) =>
        console.log('Recording imported:', record)
      }
      onImportError={(errors) => console.error('Import errors:', errors)}
    />
  );

  if (frame) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
        }}
      >
        <div
          style={{
            width: frame.width,
            height: frame.height,
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid #333',
            borderRadius: 8,
          }}
        >
          {editor}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>{editor}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Consumer bottom drawer for the `drawers` story control
// ─────────────────────────────────────────────────────

/**
 * A consumer drawer body: a scratchpad. Its state is LOCAL on purpose — a
 * drawer body unmounts when the drawer closes (the documented contract), so
 * whatever is typed here is gone after close/reopen, exactly as a consumer
 * would see it before moving state outside the drawer.
 */
function StoryNotesDrawerBody() {
  const [notes, setNotes] = useState('');
  return (
    <div className='rbn:flex rbn:h-full rbn:w-full rbn:flex-col rbn:gap-2 rbn:p-3 rbn:text-[12px] rbn:text-secondary-light-gray'>
      <p>
        A consumer <code>bottomDrawers</code> entry, rendered with the runner
        panel&apos;s chrome. Open the Runner from the header switcher, or close
        this drawer and use the floating buttons — only one bottom drawer is
        open at a time.
      </p>
      <textarea
        data-testid='story-notes-textarea'
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder='Scratchpad (local state — resets when the drawer closes)'
        className='rbn:min-h-[80px] rbn:flex-1 rbn:resize-none rbn:rounded rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:p-2 rbn:text-[12px] rbn:text-primary-white rbn:outline-none rbn:focus:border-primary-blue'
      />
    </div>
  );
}

/** Module-level so the array's identity is stable across story re-renders. */
const STORY_BOTTOM_DRAWERS: ReadonlyArray<GraphBottomDrawer> = [
  {
    id: 'notes',
    label: 'Notes',
    icon: <StickyNote />,
    title: 'Open the notes drawer',
    content: <StoryNotesDrawerBody />,
  },
];

// ─────────────────────────────────────────────────────
// WithRunner control panel — one story, many aspects
// ─────────────────────────────────────────────────────

type RunnerPreviewMode =
  | 'none'
  | 'dashboard'
  | 'step-through'
  | 'error-handling'
  | 'no-runner';
type RunnerStoryTheme = 'dark' | 'light';
type RunnerStoryFrame = 'full' | 'narrow-390';
type RunnerStoryDrawers = 'none' | 'notes';

const RUNNER_PREVIEW_MODES: RunnerPreviewMode[] = [
  'none',
  'dashboard',
  'step-through',
  'error-handling',
  'no-runner',
];
const RUNNER_STORY_THEMES: RunnerStoryTheme[] = ['dark', 'light'];
const RUNNER_STORY_FRAMES: RunnerStoryFrame[] = ['full', 'narrow-390'];
const RUNNER_STORY_DRAWERS: RunnerStoryDrawers[] = ['none', 'notes'];

/** One row of labeled story-chrome buttons (data-testid="story-<control>-<value>"). */
function StoryControlGroup<Value extends string>({
  label,
  control,
  values,
  active,
  onSelect,
}: {
  label: string;
  control: string;
  values: Value[];
  active: Value;
  onSelect: (value: Value) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ opacity: 0.6, fontSize: 12 }}>{label}</span>
      {values.map((value) => (
        <button
          key={value}
          type='button'
          data-testid={`story-${control}-${value}`}
          onClick={() => onSelect(value)}
          style={{
            padding: '2px 10px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #444',
            cursor: 'pointer',
            background: active === value ? '#2f6feb' : '#222',
            color: '#eee',
          }}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

/**
 * Consolidated runner story: a story-chrome control panel drives PREVIEW MODE
 * (none / dashboard / error-handling / step-through / no-runner registries),
 * THEME (dark ≡ blenderDark ≡ no-op, light preset), and FRAME (full-bleed vs a
 * 390px phone box exercising the container-query runner-panel reflow). Defaults
 * (none/dark/full) are byte-identical to the pre-panel WithRunner, so existing
 * e2e specs are unaffected. The editor subtree remounts on mode/frame changes
 * (`key`) because the decoration + no-runner wiring are mount-coupled; the theme
 * provider sits OUTSIDE the key and swaps live.
 */
function WithRunnerStoryView() {
  const [previewMode, setPreviewMode] = useState<RunnerPreviewMode>('none');
  const [storyTheme, setStoryTheme] = useState<RunnerStoryTheme>('dark');
  const [storyFrame, setStoryFrame] = useState<RunnerStoryFrame>('full');
  const [storyDrawers, setStoryDrawers] = useState<RunnerStoryDrawers>('none');

  const modeProps =
    previewMode === 'dashboard'
      ? { nodePreviews: circuitNodePreviews, decorateForPreviewDemo: true }
      : previewMode === 'step-through'
        ? { nodePreviews: stepThroughPreviews }
        : previewMode === 'error-handling'
          ? { nodePreviews: errorHandlingPreviews }
          : previewMode === 'no-runner'
            ? { nodePreviews: noRunnerPreviews, omitRunner: true }
            : {};

  return (
    <GraphThemeProvider
      preset={storyTheme === 'light' ? 'light' : 'blenderDark'}
    >
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            padding: '8px 12px',
            background: '#161616',
            borderBottom: '1px solid #333',
            fontFamily: 'monospace',
            color: '#eee',
          }}
        >
          <StoryControlGroup
            label='previews'
            control='preview-mode'
            values={RUNNER_PREVIEW_MODES}
            active={previewMode}
            onSelect={setPreviewMode}
          />
          <StoryControlGroup
            label='theme'
            control='theme'
            values={RUNNER_STORY_THEMES}
            active={storyTheme}
            onSelect={setStoryTheme}
          />
          <StoryControlGroup
            label='frame'
            control='frame'
            values={RUNNER_STORY_FRAMES}
            active={storyFrame}
            onSelect={setStoryFrame}
          />
          <StoryControlGroup
            label='drawers'
            control='drawers'
            values={RUNNER_STORY_DRAWERS}
            active={storyDrawers}
            onSelect={setStoryDrawers}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <RunnerStoryView
            key={`${previewMode}|${storyFrame}|${storyDrawers}`}
            {...modeProps}
            frame={
              storyFrame === 'narrow-390'
                ? { width: 390, height: 760 }
                : undefined
            }
            bottomDrawers={
              storyDrawers === 'notes' ? STORY_BOTTOM_DRAWERS : undefined
            }
          />
        </div>
      </div>
    </GraphThemeProvider>
  );
}

/**
 * THE runner story: adder-loop editor + recording with a control panel for
 * preview idiom, theme, and frame (see `WithRunnerStoryView`). Consolidates the
 * former WithNodePreviews / NodePreviewsStepThrough / NodePreviewsErrorHandling /
 * NodePreviewsWithoutRunner / NodePreviewsThemed / WithRunnerNarrow stories.
 */
export const WithRunner: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => <WithRunnerStoryView />,
};

/**
 * A consumer-registered per-node-type PREVIEW component (`nodePreviews`) rendered
 * inside each node's body. This generic demo renders the node's computed outputs
 * (from the live / at-step `ExecutionStepRecord`) plus its runner status; the header
 * eye toggles it. The adder-loop recording is pre-loaded as a controlled
 * `executionRecord`, so previews populate on load — no Run click needed. Click a
 * node's eye to collapse its preview (persisted, undoable).
 */
function CircuitNodePreview({
  nodeName,
  customName,
  visualState,
  live,
  atStep,
}: NodePreviewProps) {
  // Flagship "latest-value dashboard" idiom: show the scrubbed-to step when the
  // timeline is parked on one, else the latest value (`atStep ?? live`). This
  // populates with zero clicks; STORY `NodePreviewsStepThrough` shows the honest
  // labeled at-step / live split for temporal precision.
  const snapshot = atStep ?? live;
  const outputs = snapshot ? Array.from(snapshot.outputValues.entries()) : [];
  const iteration = snapshot?.loopIteration;
  const dotColor =
    visualState === 'errored'
      ? '#ff6b6b'
      : visualState === 'running'
        ? '#feca57'
        : visualState === 'completed'
          ? '#4ade80'
          : '#797979';
  return (
    <div
      data-testid='circuit-preview'
      style={{
        padding: '10px 12px',
        fontSize: 18,
        lineHeight: 1.4,
        fontFamily: 'monospace',
        color: '#e6e6e6',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            flexShrink: 0,
            borderRadius: '50%',
            background: dotColor,
          }}
        />
        <strong>{customName ? `${customName} : ${nodeName}` : nodeName}</strong>
        {iteration !== undefined && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 14,
              opacity: 0.75,
              background: '#2a2a2a',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            it #{iteration}
          </span>
        )}
      </div>
      {outputs.length === 0 ? (
        <div style={{ opacity: 0.5 }}>{visualState ?? 'waiting…'}</div>
      ) : (
        outputs.map(([handleName, out]) => (
          <div key={handleName} data-testid='circuit-preview-output'>
            {handleName} = <strong>{String(out.value)}</strong>
          </div>
        ))
      )}
    </div>
  );
}

// Register the SAME preview for every NON-standard circuit node type, so each
// compute node in the loaded adder-loop state shows one (structural loop/group
// nodes are left out for a cleaner demo).
const circuitNodePreviews = Object.fromEntries(
  Object.keys(circuitExampleTypeOfNodes)
    .filter((key) => !(key in standardNodeTypes))
    .map((key) => [key, CircuitNodePreview]),
) as NodePreviewRegistry<CircuitNodeTypeId>;

// (The dashboard preview mode of `WithRunner` is the former WithNodePreviews
// flagship: `circuitNodePreviews` + the Flagship rename + one collapsed panel.)

/**
 * Step-through preview that embodies the TWO axes and the live-vs-at-step split
 * honestly. Reads the node's primary bit (first output, else first input) at both
 * the latest step and the scrubbed-to step.
 */
function StepThroughPreview({
  nodeName,
  visualState,
  live,
  atStep,
}: NodePreviewProps) {
  const bitOf = (snap: ExecutionStepRecord | null) => {
    if (!snap) return undefined;
    const out = Array.from(snap.outputValues.values())[0]?.value;
    if (out !== undefined) return out;
    return Array.from(snap.inputValues.values())[0]?.connections[0]?.value;
  };
  const liveVal = bitOf(live);
  const atStepVal = bitOf(atStep);
  const dotColor =
    visualState === 'errored'
      ? '#ff6b6b'
      : visualState === 'running'
        ? '#feca57'
        : visualState === 'completed'
          ? '#4ade80'
          : '#797979';
  const statusBadge = atStep?.status ?? live?.status;
  return (
    <div
      data-testid='stepthrough-preview'
      style={{
        padding: '10px 12px',
        fontSize: 18,
        fontFamily: 'monospace',
        color: '#e6e6e6',
        lineHeight: 1.4,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        {/* dot = LIVE visualState axis */}
        <span
          title={`visualState: ${visualState ?? 'none'}`}
          style={{
            width: 12,
            height: 12,
            flexShrink: 0,
            borderRadius: '50%',
            background: dotColor,
          }}
        />
        <strong>{nodeName}</strong>
        {/* badge = RECORDED step.status axis */}
        {statusBadge && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 13,
              opacity: 0.7,
              background: '#2a2a2a',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {statusBadge}
          </span>
        )}
      </div>
      <div data-testid='stepthrough-live' style={{ opacity: 0.55 }}>
        live: {liveVal === undefined ? '—' : String(liveVal)}
      </div>
      <div data-testid='stepthrough-atstep' style={{ opacity: 0.9 }}>
        at step: {atStep === null ? 'not reached' : String(atStepVal)}
      </div>
    </div>
  );
}

const stepThroughPreviews = Object.fromEntries(
  Object.keys(circuitExampleTypeOfNodes)
    .filter((key) => !(key in standardNodeTypes))
    .map((key) => [key, StepThroughPreview]),
) as NodePreviewRegistry<CircuitNodeTypeId>;

// (`stepThroughPreviews` is the WithRunner `step-through` preview mode — the
// honest dual live/at-step display with "not reached".)

/**
 * A preview that intentionally THROWS on render, to exercise the panel's nested
 * ErrorBoundary (containment + Retry + auto-recovery when new values arrive).
 */
function TrapPreview({ live, atStep }: NodePreviewProps) {
  const snapshot = atStep ?? live;
  if (snapshot) {
    throw new Error('Trap preview: simulated render failure');
  }
  return (
    <div style={{ padding: 10, fontSize: 18, opacity: 0.5 }}>waiting…</div>
  );
}

/** Reads a recorded step error via `formatGraphError`, else shows the value. */
function ErrorAwarePreview({ nodeName, live, atStep }: NodePreviewProps) {
  const snapshot = atStep ?? live;
  const errored = snapshot?.status === 'errored';
  const out = snapshot
    ? Array.from(snapshot.outputValues.values())[0]?.value
    : undefined;
  return (
    <div
      data-testid='error-aware-preview'
      style={{
        padding: '10px 12px',
        fontSize: 18,
        fontFamily: 'monospace',
        color: '#e6e6e6',
      }}
    >
      <strong>{nodeName}</strong>
      {errored && snapshot?.error ? (
        <div style={{ color: '#ff6b6b' }}>
          err: {formatGraphError(snapshot.error)}
        </div>
      ) : (
        <div style={{ opacity: 0.7 }}>
          {snapshot ? String(out) : 'waiting…'}
        </div>
      )}
    </div>
  );
}

const errorHandlingPreviews = Object.fromEntries(
  Object.keys(circuitExampleTypeOfNodes)
    .filter((key) => !(key in standardNodeTypes))
    .map((key) => [key, key === 'notGate' ? TrapPreview : ErrorAwarePreview]),
) as NodePreviewRegistry<CircuitNodeTypeId>;

/**
 * ERROR HANDLING preview mode (WithRunner panel): two failure surfaces. The
 * `notGate` node uses a `TrapPreview` that THROWS on render — contained to the
 * panel by its own nested ErrorBoundary (the fallback card + Retry appear; since
 * this trap throws on EVERY render with values, it deliberately STAYS on the
 * fallback — a transient thrower would auto-recover when its input changes), so
 * the rest of the graph is unaffected.
 * Every other node uses an `ErrorAwarePreview` that reads a recorded step error
 * via `formatGraphError` when a step errored, else shows the value.
 */
// (`errorHandlingPreviews` is the WithRunner `error-handling` preview mode.)

/** Tier-2 preview: no runner, so `live`/`atStep` are null — show an empty state. */
function NoRunnerPreview({ nodeName, live, atStep }: NodePreviewProps) {
  const snapshot = atStep ?? live;
  return (
    <div
      data-testid='no-runner-preview'
      style={{
        padding: '10px 12px',
        fontSize: 18,
        fontFamily: 'monospace',
        color: '#e6e6e6',
      }}
    >
      <strong>{nodeName}</strong>
      <div style={{ opacity: 0.6 }}>
        {snapshot ? 'has values' : 'no runner — waiting for values'}
      </div>
    </div>
  );
}

const noRunnerPreviews = Object.fromEntries(
  Object.keys(circuitExampleTypeOfNodes)
    .filter((key) => !(key in standardNodeTypes))
    .map((key) => [key, NoRunnerPreview]),
) as NodePreviewRegistry<CircuitNodeTypeId>;

// (`noRunnerPreviews` is the WithRunner `no-runner` preview mode — tier-2:
// registry without a runner, null-safe empty states. Theming is the panel's
// orthogonal `theme` control: any preview mode × the light preset pins A-1.)

// ─────────────────────────────────────────────────────────────────────────────
// Real-graph preview demo — the graph + recording were built through the REAL
// editor UI (context-menu adds, mouse-drag connections, checkbox values, Run),
// exported via the Import/Export menu, and committed as fixtures. Demonstrates
// the ON-TOP preview placement: the panel sits ABOVE the node at the node's
// width, and the runner status border wraps ONLY the node proper.
// ─────────────────────────────────────────────────────────────────────────────

const previewDemoRecordingResult = importExecutionRecord(
  JSON.stringify(previewDemoRecordingJson),
  { repair: { sanitizeNonSerializableValues: true, removeOrphanSteps: true } },
);
const previewDemoRecording: ExecutionRecord | undefined =
  previewDemoRecordingResult.success
    ? previewDemoRecordingResult.data
    : undefined;

/** Reads the node's primary bit from a step snapshot (first output, else input). */
function readPrimaryBit(
  snapshot: ExecutionStepRecord | null,
): boolean | undefined {
  if (!snapshot) return undefined;
  const firstOutput = Array.from(snapshot.outputValues.values())[0]?.value;
  if (firstOutput !== undefined) return firstOutput as boolean;
  return Array.from(snapshot.inputValues.values())[0]?.connections[0]?.value as
    | boolean
    | undefined;
}

/**
 * Node-scale bit lamp for the real-graph demo. The lamp follows the
 * SCRUBBED-TO step (`atStep`), so dragging the timeline visibly re-lights it —
 * and when the scrub head is BEFORE this node has run, `atStep` is null and the
 * preview honestly reads "not reached yet" (it does NOT silently fall back to
 * the final value). The labeled `at step` / `live` lines make the distinction
 * legible: `at step` = value at the current scrub head; `live` = latest/final.
 */
function RealGraphBitLampPreview({ nodeName, atStep, live }: NodePreviewProps) {
  const atStepBit = readPrimaryBit(atStep);
  const liveBit = readPrimaryBit(live);
  const reached = atStep !== null;
  const isLit = atStepBit === true;
  const label = (bit: boolean | undefined) =>
    bit === undefined ? '—' : String(bit);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 16px',
        fontFamily: 'monospace',
        fontSize: 27,
        lineHeight: 1.2,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          flexShrink: 0,
          background: !reached ? '#2a2a2a' : isLit ? '#4ade80' : '#3a3a3a',
          boxShadow: isLit
            ? '0 0 20px 5px rgba(74, 222, 128, 0.5)'
            : 'inset 0 0 8px rgba(0,0,0,0.6)',
          border: '3px solid #1d1d1d',
          transition: 'all 300ms',
        }}
      />
      <div>
        <div style={{ fontWeight: 700 }}>{nodeName}</div>
        <div style={{ fontSize: 20, opacity: 0.85 }}>
          at step: {reached ? label(atStepBit) : 'not reached yet'}
        </div>
        <div style={{ fontSize: 20, opacity: 0.55 }}>
          live: {label(liveBit)}
        </div>
      </div>
    </div>
  );
}

const realGraphPreviews: NodePreviewRegistry<CircuitNodeTypeId> = {
  bitConstant: RealGraphBitLampPreview,
  bitDisplay: RealGraphBitLampPreview,
  andGate: RealGraphBitLampPreview,
};

// Registry for the group fixture — includes `notGate` (the group SUBTREE node),
// so opening a group instance shows a preview INSIDE it. Two instances of the
// same group type demonstrate INSTANCE-AWARE previews: each instance shows its
// OWN values on the shared template node (instancePath filtering).
const groupFixturePreviews: NodePreviewRegistry<CircuitNodeTypeId> = {
  bitConstant: RealGraphBitLampPreview,
  bitDisplay: RealGraphBitLampPreview,
  notGate: RealGraphBitLampPreview,
};

const groupTwoInstancesRecordingResult = importExecutionRecord(
  JSON.stringify(groupTwoInstancesRecordingJson),
  { repair: { sanitizeNonSerializableValues: true, removeOrphanSteps: true } },
);
const groupTwoInstancesRecording: ExecutionRecord | undefined =
  groupTwoInstancesRecordingResult.success
    ? groupTwoInstancesRecordingResult.data
    : undefined;

type RunnerFixtureId = 'and-gate-real-graph' | 'group-two-instances';

/** UI-built + UI-exported fixture bundles (see .storybook/static/graphStates/README.md). */
const RUNNER_FIXTURE_DEMOS: Record<
  RunnerFixtureId,
  {
    state: {
      state: {
        dataTypes: unknown;
        typeOfNodes: unknown;
        nodes: unknown[];
        edges: unknown[];
      };
    };
    recording: ExecutionRecord | undefined;
    registry: NodePreviewRegistry<CircuitNodeTypeId>;
  }
> = {
  'and-gate-real-graph': {
    state: previewDemoState,
    recording: previewDemoRecording,
    registry: realGraphPreviews,
  },
  'group-two-instances': {
    state: groupTwoInstancesState,
    recording: groupTwoInstancesRecording,
    registry: groupFixturePreviews,
  },
};

function FixtureDemoStoryView({ fixtureId }: { fixtureId: RunnerFixtureId }) {
  const fixture = RUNNER_FIXTURE_DEMOS[fixtureId];
  const { state, dispatch } = useFullGraph<
    CircuitDataTypeId,
    CircuitNodeTypeId
  >({
    dataTypes: circuitExampleDataTypes,
    typeOfNodes: circuitExampleTypeOfNodes,
    nodes: [],
    edges: [],
    allowedConversionsBetweenDataTypes: {
      bit: { condition: true },
      condition: { bit: true },
    },
    allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
    enableComplexTypeChecking: true,
    enableTypeInference: true,
    enableCycleChecking: true,
    enableRecursionChecking: true,
    nodeCountConstraints: standardNodeCountConstraints,
  });

  const hasLoaded = useRef(false);
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    // FULL-STATE load: the fixture's dataTypes/typeOfNodes must come along —
    // the group fixture defines its own group type (with a subtree) that does
    // NOT exist in circuitExampleTypeOfNodes. Spread `...state` first so the
    // hook's config flags (inference/conversions/constraints) survive.
    dispatch({
      type: 'REPLACE_STATE',
      payload: {
        state: {
          ...state,
          dataTypes: fixture.state.state
            .dataTypes as unknown as typeof state.dataTypes,
          typeOfNodes: fixture.state.state
            .typeOfNodes as unknown as typeof state.typeOfNodes,
          nodes: fixture.state.state.nodes as unknown as typeof state.nodes,
          edges: fixture.state.state.edges as unknown as typeof state.edges,
        },
      },
    });
    // Ref-guarded one-shot load (early-returns on re-run).
  }, [dispatch, state, fixture]);

  const [record, setRecord] = useState(fixture.recording ?? null);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <FullGraph<CircuitDataTypeId, CircuitNodeTypeId>
          state={state}
          dispatch={dispatch}
          functionImplementations={circuitImplementations}
          executionRecord={record}
          onExecutionRecordChange={setRecord}
          nodePreviews={fixture.registry}
        />
      </div>
    </div>
  );
}

function RunnerFixtureDemosStoryView() {
  const [fixtureId, setFixtureId] = useState<RunnerFixtureId>(
    'and-gate-real-graph',
  );
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          gap: 16,
          padding: '8px 12px',
          background: '#161616',
          borderBottom: '1px solid #333',
          fontFamily: 'monospace',
          color: '#eee',
        }}
      >
        <StoryControlGroup
          label='fixture'
          control='fixture'
          values={Object.keys(RUNNER_FIXTURE_DEMOS) as RunnerFixtureId[]}
          active={fixtureId}
          onSelect={setFixtureId}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <FixtureDemoStoryView key={fixtureId} fixtureId={fixtureId} />
      </div>
    </div>
  );
}

/**
 * REAL exported-fixture demos with a fixture selector. Every graph + recording
 * here was built through the actual editor UI and exported via the
 * Import/Export menu (see `.storybook/static/graphStates/README.md`):
 * - `and-gate-real-graph` — AND(true,true) with on-top previews (placement demo).
 * - `group-two-instances` — TWO instances of one group type (subtree = NOT gate)
 *   chained; previews are registered for the SUBTREE node, so opening either
 *   instance shows ITS OWN values on the shared template node (instance-path
 *   filtering), scrubbing follows into the executing instance, and the
 *   step-over/out buttons jump over/out of group interiors.
 * (The narrow-frame responsive demo lives in `WithRunner` → frame=narrow-390.)
 */
export const RunnerFixtureDemos: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => <RunnerFixtureDemosStoryView />,
};

export const EmptyRunnerPlayground: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    // ─── E2E observable event log + reject toaster ────────────────────
    //
    // Story-only instrumentation. Tests rely on:
    //   1. Sonner toasts for reducer-level rejection reasons
    //      (V3/V4/V5/V8 fire `action:rejected` with `error.message`).
    //   2. DOM diffs (node count, edge count, handle classes) for
    //      handle-level rejections (V1/MC) which never reach the
    //      reducer and emit no events.
    //   3. The hidden `e2e-event-count` / `e2e-last-event` divs for
    //      verifying the event stream itself (NOT for primary
    //      action verification — see codingGuidelines).
    //
    // None of this ships: sonner is a devDependency and `*.stories.tsx`
    // is excluded from the published bundle.
    const [eventCount, setEventCount] = useState(0);
    const [lastEvent, setLastEvent] = useState<unknown>(null);
    // Capped ring buffer of the most recent events. Bounded so a long-
    // running session can't pin large amounts of memory; tests only ever
    // need to scan a few seconds of history.
    const EVENT_LOG_CAP = 100;
    const [eventLog, setEventLog] = useState<unknown[]>([]);
    const recordEvent = (event: unknown) => {
      setEventCount((c) => c + 1);
      setLastEvent(event);
      setEventLog((log) => {
        const next = log.concat([event]);
        return next.length > EVENT_LOG_CAP
          ? next.slice(next.length - EVENT_LOG_CAP)
          : next;
      });

      // Surface human-readable rejection text via toast so tests can
      // read the reject reason without poking at the event stream.
      const e = event as {
        kind: string;
        error?: { message?: string; code?: string };
        isValid?: boolean | null;
      };
      if (e.kind === 'action:rejected' && e.error) {
        // Title = error code (always present, machine-readable).
        // Description = error message (may be empty for some validation paths).
        // Tests assert on either — see e2e/actions/toast/toast.actions.ts.
        toast.error(e.error.code ?? 'ACTION_REJECTED', {
          description: e.error.message ?? '',
          id: 'e2e-last-reject',
        });
      } else if (e.kind === 'ui:drag:ended' && e.isValid === false) {
        toast.warning('CONNECTION_REFUSED', {
          description: 'Handle-level rejection (maxConnections or structural)',
          id: 'e2e-last-reject',
        });
      }
    };

    const { state, dispatch } = useFullGraph<
      CircuitDataTypeId,
      CircuitNodeTypeId
    >(
      {
        dataTypes: circuitExampleDataTypes,
        typeOfNodes: circuitExampleTypeOfNodes,
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
      },
      {
        // Reducer-layer events (action:applied, action:rejected,
        // state:committed) come from useFullGraph's wrapped dispatch.
        onGraphEvent: recordEvent,
      },
    );

    const [record, setRecord] = useState<ExecutionRecord | null>(null);

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1 }}>
          <FullGraph<CircuitDataTypeId, CircuitNodeTypeId>
            state={state}
            dispatch={dispatch}
            functionImplementations={circuitImplementations}
            executionRecord={record}
            onExecutionRecordChange={setRecord}
            onStateImported={(imported) =>
              console.log('State imported:', imported)
            }
            onRecordingImported={(record) =>
              console.log('Recording imported:', record)
            }
            onImportError={(errors) => console.error('Import errors:', errors)}
            // UI-layer events (ui:drag:ended, ui:delete:attempted,
            // ui:state:imported, ui:recording:imported) come from
            // FullGraph. Same handler — single subscription point.
            onGraphEvent={recordEvent}
          />
        </div>
        {/* E2E test-only observability — invisible to the user. */}
        <div
          data-testid='e2e-event-count'
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            opacity: 0,
            pointerEvents: 'none',
          }}
        >
          {eventCount}
        </div>
        <div
          data-testid='e2e-last-event'
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            opacity: 0,
            pointerEvents: 'none',
          }}
        >
          {lastEvent ? JSON.stringify(lastEvent) : ''}
        </div>
        {/*
          Full event log (last ~100 events as a JSON array). Tests
          consume this for ordered-sequence assertions ("after Add
          Node, the next 3 events were action:applied/state:committed/
          action:applied for UPDATE_NODE_BY_REACT_FLOW"). Reading a
          slice of this is how the events-stream verification test
          asserts that the event-emission contract holds.
        */}
        <div
          data-testid='e2e-event-log'
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            opacity: 0,
            pointerEvents: 'none',
            // Constrain visual footprint even at opacity:0 — sonner's
            // hidden-but-mounted contract is sensitive to overlays.
            width: 0,
            height: 0,
            overflow: 'hidden',
          }}
        >
          {JSON.stringify(eventLog)}
        </div>
        {/*
          Sonner Toaster — story-only. Tests read `[data-sonner-toast]`
          elements to verify rejection reasons and dismiss them via
          `[data-button]` (the close X). Position bottom-right so it
          never overlaps the runner panel resizer at the bottom.
        */}
        <Toaster
          position='top-right'
          richColors
          closeButton
          toastOptions={{
            // Short duration in case a test forgets to dismiss; sonner
            // queues new toasts under the same id, so missing dismiss
            // doesn't leak across cases.
            duration: 4000,
            // Make the toast container easy to address from Playwright.
            // Sonner renders each toast with `data-sonner-toast` and a
            // `data-type` of 'success'|'error'|'warning'|'info'.
          }}
        />
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────
// Full Adder Circuit
//
//   A ────┬──> XOR1 ──┬──> XOR2 ──> Sum Display
//         │           │
//   B ──┬─┼──> XOR1   │
//       │ │           │
//       │ └──> AND1 ──┼──────────> OR ──> Cout Display
//       │             │
//       └──> AND1     │
//                     │
//   Cin ──────┬──> XOR2
//             │
//             └──> AND2 ──────> OR
//
// Full adder = two half adders + OR gate for carry.
// A XOR B XOR Cin = Sum
// (A AND B) OR ((A XOR B) AND Cin) = Cout
// ─────────────────────────────────────────────────────

function buildFullAdderGraph() {
  const dt = circuitExampleDataTypes;
  const nt = circuitExampleTypeOfNodes;

  // Inputs
  const constA = constructNodeOfType(dt, 'bitConstant', nt, 'fa-const-a', {
    x: 0,
    y: 0,
  });
  const constB = constructNodeOfType(dt, 'bitConstant', nt, 'fa-const-b', {
    x: 0,
    y: 250,
  });
  const constCin = constructNodeOfType(dt, 'bitConstant', nt, 'fa-const-cin', {
    x: 0,
    y: 500,
  });

  // Stage 1: Half adder 1 (A, B)
  const xor1 = constructNodeOfType(dt, 'xorGate', nt, 'fa-xor1', {
    x: 550,
    y: 0,
  });
  const and1 = constructNodeOfType(dt, 'andGate', nt, 'fa-and1', {
    x: 550,
    y: 300,
  });

  // Stage 2: Half adder 2 (partial_sum, Cin)
  const xor2 = constructNodeOfType(dt, 'xorGate', nt, 'fa-xor2', {
    x: 1100,
    y: 0,
  });
  const and2 = constructNodeOfType(dt, 'andGate', nt, 'fa-and2', {
    x: 1100,
    y: 300,
  });

  // Stage 3: Carry OR
  const or1 = constructNodeOfType(dt, 'orGate', nt, 'fa-or1', {
    x: 1650,
    y: 300,
  });

  // Displays
  const dispSum = constructNodeOfType(dt, 'bitDisplay', nt, 'fa-disp-sum', {
    x: 1650,
    y: 0,
  });
  const dispCout = constructNodeOfType(dt, 'bitDisplay', nt, 'fa-disp-cout', {
    x: 2200,
    y: 300,
  });

  // Set initial values: A=1, B=1, Cin=1 → Sum=1, Cout=1
  const setVal = (node: typeof constA, idx: number, value: boolean) => {
    const input = node.data.inputs?.[idx];
    if (input && 'type' in input && input.type === 'boolean')
      input.value = value;
  };
  setVal(constA, 0, true);
  setVal(constB, 0, true);
  setVal(constCin, 0, true);

  const outId = (node: typeof constA, idx: number): string =>
    node.data.outputs?.[idx]?.id ?? '';
  const inId = (node: typeof constA, idx: number): string =>
    node.data.inputs?.[idx]?.id ?? '';

  const nodes = [
    constA,
    constB,
    constCin,
    xor1,
    and1,
    xor2,
    and2,
    or1,
    dispSum,
    dispCout,
  ];

  const edge = (
    id: string,
    src: string,
    srcH: string,
    tgt: string,
    tgtH: string,
  ) => ({
    id,
    source: src,
    sourceHandle: srcH,
    target: tgt,
    targetHandle: tgtH,
    type: 'configurableEdge' as const,
  });

  const edges = [
    // A → XOR1.A, AND1.A (fan-out)
    edge('fa-e1', 'fa-const-a', outId(constA, 0), 'fa-xor1', inId(xor1, 0)),
    edge('fa-e2', 'fa-const-a', outId(constA, 0), 'fa-and1', inId(and1, 0)),
    // B → XOR1.B, AND1.B (fan-out)
    edge('fa-e3', 'fa-const-b', outId(constB, 0), 'fa-xor1', inId(xor1, 1)),
    edge('fa-e4', 'fa-const-b', outId(constB, 0), 'fa-and1', inId(and1, 1)),
    // Cin → XOR2.B, AND2.B (fan-out)
    edge('fa-e5', 'fa-const-cin', outId(constCin, 0), 'fa-xor2', inId(xor2, 1)),
    edge('fa-e6', 'fa-const-cin', outId(constCin, 0), 'fa-and2', inId(and2, 1)),
    // XOR1.Out → XOR2.A, AND2.A (partial sum fans out)
    edge('fa-e7', 'fa-xor1', outId(xor1, 0), 'fa-xor2', inId(xor2, 0)),
    edge('fa-e8', 'fa-xor1', outId(xor1, 0), 'fa-and2', inId(and2, 0)),
    // AND1.Out → OR1.A (generate carry)
    edge('fa-e9', 'fa-and1', outId(and1, 0), 'fa-or1', inId(or1, 0)),
    // AND2.Out → OR1.B (propagate carry)
    edge('fa-e10', 'fa-and2', outId(and2, 0), 'fa-or1', inId(or1, 1)),
    // XOR2.Out → Sum Display
    edge('fa-e11', 'fa-xor2', outId(xor2, 0), 'fa-disp-sum', inId(dispSum, 0)),
    // OR1.Out → Cout Display
    edge('fa-e12', 'fa-or1', outId(or1, 0), 'fa-disp-cout', inId(dispCout, 0)),
  ];

  return { nodes, edges };
}

const fullAdderGraph = buildFullAdderGraph();

/**
 * Full Adder circuit: A=1, B=1, Cin=1 → Sum=1, Cout=1.
 * Demonstrates: 3-level deep DAG, fan-out (each input feeds two gates),
 * carry propagation through two half-adder stages + OR gate.
 */
export const FullAdderCircuit: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: circuitExampleDataTypes,
      typeOfNodes: circuitExampleTypeOfNodes,
      nodes: fullAdderGraph.nodes,
      edges: fullAdderGraph.edges,
      allowedConversionsBetweenDataTypes: {},
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1 }}>
          <FullGraph
            state={state}
            dispatch={dispatch}
            functionImplementations={circuitImplementations}
          />
        </div>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────
// 4-Bit Ripple Carry Adder
//
// Chains four full adders: each bit-position gets its own
// XOR1, AND1, XOR2, AND2, OR gate. The carry output of one
// feeds the carry input of the next.
//
//   A0,B0 ──> FA0 ──carry──> FA1 ──carry──> FA2 ──carry──> FA3 ──> Cout
//               │              │              │              │
//              S0             S1             S2             S3
//
// Example: A=0101 (5), B=0011 (3) → S=1000 (8), Cout=0
// Demonstrates: large concurrent execution, carry chain serialization
// ─────────────────────────────────────────────────────

function buildRippleCarryAdder(aVal: boolean[], bVal: boolean[]) {
  const dt = circuitExampleDataTypes;
  const nt = circuitExampleTypeOfNodes;

  type N = ReturnType<typeof constructNodeOfType>;
  const allNodes: N[] = [];
  const allEdges: {
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
    type: 'configurableEdge';
  }[] = [];

  const outId = (node: N, idx: number): string =>
    node.data.outputs?.[idx]?.id ?? '';
  const inId = (node: N, idx: number): string =>
    node.data.inputs?.[idx]?.id ?? '';
  const setVal = (node: N, idx: number, value: boolean | number) => {
    const input = node.data.inputs?.[idx];
    if (!input || !('type' in input)) return;
    if (input.type === 'boolean' && typeof value === 'boolean')
      input.value = value;
    else if (input.type === 'number' && typeof value === 'number')
      input.value = value;
  };
  const e = (
    id: string,
    src: string,
    srcH: string,
    tgt: string,
    tgtH: string,
  ) => ({
    id,
    source: src,
    sourceHandle: srcH,
    target: tgt,
    targetHandle: tgtH,
    type: 'configurableEdge' as const,
  });

  let eid = 0;

  // Carry-in for bit 0 is always false
  const cinConst = constructNodeOfType(dt, 'bitConstant', nt, 'rca-cin', {
    x: 0,
    y: 550,
  });
  setVal(cinConst, 0, false);
  allNodes.push(cinConst);

  // Track carry output node + handle for chaining
  let carrySource = { nodeId: 'rca-cin', handleId: outId(cinConst, 0) };

  for (let i = 0; i < 4; i++) {
    // Each full-adder bit occupies 4 columns (550px each) = 2200px wide
    const startX = i * 2200;

    // Input constants for this bit
    const constAi = constructNodeOfType(dt, 'bitConstant', nt, `rca-a${i}`, {
      x: startX,
      y: 0,
    });
    const constBi = constructNodeOfType(dt, 'bitConstant', nt, `rca-b${i}`, {
      x: startX,
      y: 250,
    });
    setVal(constAi, 0, aVal[i]);
    setVal(constBi, 0, bVal[i]);

    // Full adder gates for this bit
    const xor1 = constructNodeOfType(dt, 'xorGate', nt, `rca-xor1-${i}`, {
      x: startX + 550,
      y: 0,
    });
    const and1 = constructNodeOfType(dt, 'andGate', nt, `rca-and1-${i}`, {
      x: startX + 550,
      y: 300,
    });
    const xor2 = constructNodeOfType(dt, 'xorGate', nt, `rca-xor2-${i}`, {
      x: startX + 1100,
      y: 0,
    });
    const and2 = constructNodeOfType(dt, 'andGate', nt, `rca-and2-${i}`, {
      x: startX + 1100,
      y: 300,
    });
    const or1 = constructNodeOfType(dt, 'orGate', nt, `rca-or-${i}`, {
      x: startX + 1650,
      y: 300,
    });

    // Sum display
    const dispS = constructNodeOfType(dt, 'bitDisplay', nt, `rca-disp-s${i}`, {
      x: startX + 1650,
      y: 0,
    });

    allNodes.push(constAi, constBi, xor1, and1, xor2, and2, or1, dispS);

    // A → XOR1.A, AND1.A
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-a${i}`,
        outId(constAi, 0),
        `rca-xor1-${i}`,
        inId(xor1, 0),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-a${i}`,
        outId(constAi, 0),
        `rca-and1-${i}`,
        inId(and1, 0),
      ),
    );
    // B → XOR1.B, AND1.B
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-b${i}`,
        outId(constBi, 0),
        `rca-xor1-${i}`,
        inId(xor1, 1),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-b${i}`,
        outId(constBi, 0),
        `rca-and1-${i}`,
        inId(and1, 1),
      ),
    );
    // Cin → XOR2.B, AND2.B
    allEdges.push(
      e(
        `rca-e${eid++}`,
        carrySource.nodeId,
        carrySource.handleId,
        `rca-xor2-${i}`,
        inId(xor2, 1),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        carrySource.nodeId,
        carrySource.handleId,
        `rca-and2-${i}`,
        inId(and2, 1),
      ),
    );
    // XOR1 → XOR2.A, AND2.A
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-xor1-${i}`,
        outId(xor1, 0),
        `rca-xor2-${i}`,
        inId(xor2, 0),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-xor1-${i}`,
        outId(xor1, 0),
        `rca-and2-${i}`,
        inId(and2, 0),
      ),
    );
    // AND1 → OR.A, AND2 → OR.B
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-and1-${i}`,
        outId(and1, 0),
        `rca-or-${i}`,
        inId(or1, 0),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-and2-${i}`,
        outId(and2, 0),
        `rca-or-${i}`,
        inId(or1, 1),
      ),
    );
    // XOR2 → Sum display
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-xor2-${i}`,
        outId(xor2, 0),
        `rca-disp-s${i}`,
        inId(dispS, 0),
      ),
    );

    // Update carry chain for next bit
    carrySource = { nodeId: `rca-or-${i}`, handleId: outId(or1, 0) };
  }

  // Final carry display (after the last bit's OR gate)
  const dispCout = constructNodeOfType(dt, 'bitDisplay', nt, 'rca-disp-cout', {
    x: 3 * 2200 + 2200,
    y: 300,
  });
  allNodes.push(dispCout);
  allEdges.push(
    e(
      `rca-e${eid++}`,
      carrySource.nodeId,
      carrySource.handleId,
      'rca-disp-cout',
      inId(dispCout, 0),
    ),
  );

  return { nodes: allNodes, edges: allEdges };
}

// 5 + 3 = 8 in binary: A=0101, B=0011
// LSB-first: A=[1,0,1,0], B=[1,1,0,0] → S=[0,0,0,1], Cout=0 → 8
const rippleCarryAdderGraph = buildRippleCarryAdder(
  [true, false, true, false], // A = 0101 = 5 (LSB first)
  [true, true, false, false], // B = 0011 = 3 (LSB first)
);

/**
 * 4-bit Ripple Carry Adder: computes 5 + 3 = 8.
 * 34 nodes across 4 chained full adders.
 * Demonstrates: large graph, carry chain serialization,
 * massive fan-out/fan-in, and multi-level concurrent execution.
 */
export const RippleCarryAdder: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: circuitExampleDataTypes,
      typeOfNodes: circuitExampleTypeOfNodes,
      nodes: rippleCarryAdderGraph.nodes,
      edges: rippleCarryAdderGraph.edges,
      allowedConversionsBetweenDataTypes: {},
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1 }}>
          <FullGraph
            state={state}
            dispatch={dispatch}
            functionImplementations={circuitImplementations}
          />
        </div>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────
// Loop Counter Circuit
//
//   Number(0) ──> LoopStart ──> Counter ──> NOT ──> LoopStop ──> LoopEnd ──> Display
//   Number(5) ──────────────────> Counter (Max input)
//
// The counter increments each iteration. When count reaches
// max, NOT(Reached Max) = false and the loop terminates.
// Demonstrates: loop nodes, condition handling, iterative computation
// ─────────────────────────────────────────────────────

// Build the loop-counter graph THROUGH THE REDUCER (ADD_NODE + ADD_EDGE), so the
// loop's data-carry channel handles materialize via type inference exactly as a
// user's clicks would. A hand-placed graph (constructNodeOfType + index-wired
// edges) bypasses inference, leaving the loop nodes with zero data handles — the
// executor then rejects it with "mismatched data handle counts". The carry is
// numeric (counting 0→5), so it is seeded/displayed by Number Input/Output (a
// `bit` source would make the single-typed carry channel type-inconsistent).
function buildLoopCounterGraph() {
  // Explicit type arguments pin UnderlyingType/ComplexSchemaType to their
  // defaults — inference through State's conditional types otherwise widens
  // ComplexSchemaType to ZodType and the annotation no longer matches.
  let state: State<CircuitDataTypeId, CircuitNodeTypeId> =
    makeStateWithAutoInfer<CircuitDataTypeId, CircuitNodeTypeId>({
      dataTypes: circuitExampleDataTypes,
      typeOfNodes: circuitExampleTypeOfNodes,
      nodes: [],
      edges: [],
      allowedConversionsBetweenDataTypes: {
        bit: { condition: true, number: true, loopInfer: true },
        number: { loopInfer: true, bit: true },
        loopInfer: { number: true, bit: true },
      },
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
    });

  function addNode(
    nodeType: CircuitNodeTypeId,
    position: { x: number; y: number },
  ): string {
    // Explicit type arguments pin UnderlyingType/ComplexSchemaType to their
    // defaults — inference through State's conditional types widens otherwise.
    state = mainReducer<CircuitDataTypeId, CircuitNodeTypeId>(state, {
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
    state = mainReducer<CircuitDataTypeId, CircuitNodeTypeId>(state, {
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
    if (!node) throw new Error(`Node "${nodeId}" not found in state`);
    return node;
  }

  // Handle ids are re-read after every reducer step because inference adds
  // concrete channel handles to the loop nodes as edges are connected.
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
    value: number,
  ): void {
    state = {
      ...state,
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId || !node.data.inputs) return node;
        const inputs = node.data.inputs.map((input, index) => {
          if (index !== handleIndex || !('type' in input)) return input;
          if (input.type === 'number') return { ...input, value };
          return input;
        });
        return { ...node, data: { ...node.data, inputs } };
      }),
    };
  }

  // Create the nodes one ADD_NODE at a time, as the user would.
  const initialCountNodeId = addNode('numberConstant', { x: 0, y: 150 });
  setInputValue(initialCountNodeId, 0, 0); // initial count = 0

  const loopStartNodeId = addNode('loopStart', { x: 550, y: 150 });
  const counterNodeId = addNode('counter', { x: 1100, y: 150 });
  setInputValue(counterNodeId, 1, 5); // Counter Max = 5
  const notGateNodeId = addNode('notGate', { x: 1650, y: 400 });
  const loopStopNodeId = addNode('loopStop', { x: 2200, y: 150 });
  const loopEndNodeId = addNode('loopEnd', { x: 2750, y: 150 });
  const countOutputNodeId = addNode('numberDisplay', { x: 3300, y: 150 });

  // Bind the loop triplet BEFORE any body wiring (region rules depend on it).
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

  // Wire the carry channel — each infer-handle connection grows the channel.
  connect(
    initialCountNodeId,
    outputHandleId(initialCountNodeId, 0),
    loopStartNodeId,
    inputHandleId(loopStartNodeId, loopStartInputInferHandleIndex),
  );
  connect(
    loopStartNodeId,
    outputHandleId(loopStartNodeId, loopStartOutputInferHandleIndex),
    counterNodeId,
    inputHandleId(counterNodeId, 0),
  );
  connect(
    counterNodeId,
    outputHandleId(counterNodeId, 0),
    loopStopNodeId,
    inputHandleId(loopStopNodeId, loopStopInputInferHandleIndex),
  );
  // Counter "Reached Max" → NOT → loopStop condition (continue while NOT max).
  connect(
    counterNodeId,
    outputHandleId(counterNodeId, 1),
    notGateNodeId,
    inputHandleId(notGateNodeId, 0),
  );
  connect(
    notGateNodeId,
    outputHandleId(notGateNodeId, 0),
    loopStopNodeId,
    inputHandleId(loopStopNodeId, 1),
  );
  // Post-stop carry → loopEnd → display.
  connect(
    loopStopNodeId,
    outputHandleId(loopStopNodeId, loopStopOutputInferHandleIndex),
    loopEndNodeId,
    inputHandleId(loopEndNodeId, loopEndInputInferHandleIndex),
  );
  connect(
    loopEndNodeId,
    outputHandleId(loopEndNodeId, loopEndOutputInferHandleIndex),
    countOutputNodeId,
    inputHandleId(countOutputNodeId, 0),
  );

  return { nodes: state.nodes, edges: state.edges };
}

const loopCounterGraph = buildLoopCounterGraph();

/**
 * Loop Counter: counts from 0 to 5 using a loop structure.
 * Demonstrates: Loop Start/Stop/End triplet, condition inversion
 * with NOT gate, iterative carry of values, and loop termination.
 */
export const LoopCounterCircuit: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: circuitExampleDataTypes,
      typeOfNodes: circuitExampleTypeOfNodes,
      nodes: loopCounterGraph.nodes,
      edges: loopCounterGraph.edges,
      allowedConversionsBetweenDataTypes: {
        bit: { condition: true, number: true, loopInfer: true },
        number: { loopInfer: true, bit: true },
        loopInfer: { number: true, bit: true },
      },
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
      hiddenNodeTypesInContextMenu: standardHiddenNodeTypesInContextMenu,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1 }}>
          <FullGraph
            state={state}
            dispatch={dispatch}
            functionImplementations={circuitImplementations}
          />
        </div>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────
// Custom Input Components Demo
//
// Demonstrates the inputComponents registry: a map from
// DataTypeUniqueId → ComponentType<InputComponentProps>
// that lets consumers provide custom input widgets for
// unsupportedDirectly data types.
// ─────────────────────────────────────────────────────

const colorDataTypes = {
  color: makeDataTypeWithAutoInfer({
    name: 'Color',
    underlyingType: 'complex',
    complexSchema: z.string(),
    color: '#E91E63',
    allowInput: true,
  }),
  number: makeDataTypeWithAutoInfer({
    name: 'Number',
    underlyingType: 'number',
    color: '#FF6B6B',
    allowInput: true,
  }),
  ...standardDataTypes,
} as const;

type ColorDataTypeId = keyof typeof colorDataTypes;

const colorNodeTypes = {
  colorSource: makeTypeOfNodeWithAutoInfer<ColorDataTypeId, 'colorSource'>({
    name: 'Color Source',
    headerColor: '#880E4F',
    inputs: [{ name: 'Color', dataType: 'color', allowInput: true }],
    outputs: [{ name: 'Color', dataType: 'color' }],
  }),
  colorMixer: makeTypeOfNodeWithAutoInfer<ColorDataTypeId, 'colorMixer'>({
    name: 'Color Mixer',
    headerColor: '#4A148C',
    inputs: [
      { name: 'Color A', dataType: 'color' },
      { name: 'Color B', dataType: 'color' },
      { name: 'Ratio', dataType: 'number', allowInput: true },
    ],
    outputs: [{ name: 'Mixed', dataType: 'color' }],
  }),
  colorDisplay: makeTypeOfNodeWithAutoInfer<ColorDataTypeId, 'colorDisplay'>({
    name: 'Color Display',
    headerColor: '#1B5E20',
    inputs: [{ name: 'Color', dataType: 'color' }],
    outputs: [],
  }),
  ...standardNodeTypes,
} as const;

type ColorNodeTypeId = keyof typeof colorNodeTypes;

const colorImplementations =
  makeFunctionImplementationsWithAutoInfer<ColorNodeTypeId>({
    colorSource: (inputs) => {
      const color = String(getFirstInputVal(inputs.get('Color'), '#ffffff'));
      return new Map([['Color', color]]);
    },
    colorMixer: (inputs) => {
      const colorA = String(getFirstInputVal(inputs.get('Color A'), '#000000'));
      const colorB = String(getFirstInputVal(inputs.get('Color B'), '#ffffff'));
      const ratio = Number(getFirstInputVal(inputs.get('Ratio'), 0.5));
      const parseHex = (hex: string) => {
        const h = hex.replace('#', '');
        return [
          parseInt(h.substring(0, 2), 16),
          parseInt(h.substring(2, 4), 16),
          parseInt(h.substring(4, 6), 16),
        ];
      };
      const [r1, g1, b1] = parseHex(colorA);
      const [r2, g2, b2] = parseHex(colorB);
      const t = Math.max(0, Math.min(1, ratio));
      const mixed = `#${[
        Math.round(r1 * (1 - t) + r2 * t),
        Math.round(g1 * (1 - t) + g2 * t),
        Math.round(b1 * (1 - t) + b2 * t),
      ]
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('')}`;
      return new Map([['Mixed', mixed]]);
    },
    colorDisplay: () => new Map(),
  });

export const CustomInputComponents: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph<
      ColorDataTypeId,
      ColorNodeTypeId,
      SupportedUnderlyingTypes,
      z.ZodType
    >({
      dataTypes: colorDataTypes,
      typeOfNodes: colorNodeTypes,
      nodes: [],
      edges: [],
      enableTypeInference: true,
      enableCycleChecking: true,
      enableRecursionChecking: true,
      nodeCountConstraints: standardNodeCountConstraints,
    });

    const [record, setRecord] = useState<ExecutionRecord | null>(null);

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1 }}>
          <FullGraph<
            ColorDataTypeId,
            ColorNodeTypeId,
            SupportedUnderlyingTypes,
            z.ZodType
          >
            state={state}
            dispatch={dispatch}
            functionImplementations={colorImplementations}
            executionRecord={record}
            onExecutionRecordChange={setRecord}
            inputComponents={{
              color: ({ value, onChange }) => (
                <ColorPicker.Root
                  value={typeof value === 'string' ? value : '#ffffff'}
                  onValueChange={(_color: OklchColor, formatted: string) =>
                    onChange(formatted)
                  }
                  defaultFormat='hex'
                >
                  <ColorPicker.Area className='rbn:w-full rbn:aspect-square' />
                  <ColorPicker.Hue />
                  <div className='rbn:flex rbn:items-center rbn:gap-2'>
                    <ColorPicker.Preview className='rbn:w-8 rbn:h-8 rbn:shrink-0' />
                    <ColorPicker.CssInput size='normal' />
                  </div>
                </ColorPicker.Root>
              ),
              number: ({ name }) => (
                <div data-testid='custom-number'>Custom Number: {name}</div>
              ),
            }}
          />
        </div>
      </div>
    );
  },
};
