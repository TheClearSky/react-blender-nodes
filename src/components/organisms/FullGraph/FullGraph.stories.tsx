import { useState, useRef, useEffect, useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toaster, toast } from 'sonner';

import { FullGraph, useFullGraph, GraphThemeProvider } from './';
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
  type Action,
} from '@/utils';
import { makeFunctionImplementationsWithAutoInfer } from '@/utils/nodeRunner/types';
import { constructNodeOfType } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import type {
  InputHandleValue,
  ExecutionRecord,
} from '@/utils/nodeRunner/types';
import { importExecutionRecord } from '@/utils/importExport';
import { ColorPicker } from '@/components/molecules/ColorPicker/ColorPicker';
import type { OklchColor } from '@/components/molecules/ColorPicker/lib/types';
import adderLoopState from '../../../../.storybook/static/graphStates/adder-state-with-inner-noop-loop.json';
import adderLoopRecordingJson from '../../../../.storybook/static/graphStates/adder-state-with-inner-noop-loop-instant.json';
import Editor from '@monaco-editor/react';
import { compile } from '@/utils/nodeRunner';
import { emitJs } from '@/utils/nodeRunner/runTargets/codegen/emitJs';
import { emitGraph } from '@/utils/nodeRunner/runTargets/codegen/emitGraph';
import { readInput } from '@/utils/nodeRunner/readInput';
import { serializeExecutionPlan } from '@/utils/nodeRunner/runTargets/serializeExecutionPlan';
import {
  makeCodegenRunTarget,
  jsonIrRunTarget,
} from '@/utils/nodeRunner/runTargets';
import type { CodegenMetadata } from '@/utils/nodeRunner/runTargets';

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
  '[&_.text-primary-white]:text-fuchsia-100 [&_.text-secondary-light-gray]:text-fuchsia-300/80 [&_.text-secondary-dark-gray]:text-fuchsia-400/60';
const TERMINAL_TEXT =
  '[&_.text-primary-white]:text-green-300 [&_.text-secondary-light-gray]:text-green-500/80 [&_.text-secondary-dark-gray]:text-green-700 [&_*]:font-mono';
const PAPER_TEXT =
  '[&_.text-primary-white]:text-stone-800 [&_.text-secondary-light-gray]:text-stone-500 [&_.text-secondary-dark-gray]:text-stone-400';
const OCEAN_TEXT =
  '[&_.text-primary-white]:text-sky-100 [&_.text-secondary-light-gray]:text-sky-300/80 [&_.text-secondary-dark-gray]:text-sky-500/60';
const BLUEPRINT_TEXT =
  '[&_.text-primary-white]:text-sky-50 [&_.text-secondary-light-gray]:text-sky-200/80 [&_.text-secondary-dark-gray]:text-sky-300/50';
const POP_TEXT =
  '[&_.text-primary-white]:text-black [&_.text-secondary-light-gray]:text-stone-600 [&_.text-secondary-dark-gray]:text-stone-400';
const STAR_TEXT =
  '[&_.text-primary-white]:text-violet-100 [&_.text-secondary-light-gray]:text-violet-300/80 [&_.text-secondary-dark-gray]:text-violet-400/60';
const NOTEBOOK_TEXT =
  '[&_.text-primary-white]:text-slate-800 [&_.text-secondary-light-gray]:text-slate-500 [&_.text-secondary-dark-gray]:text-slate-400';
const LOGO_TEXT =
  '[&_.text-primary-white]:text-[#dce9fb] [&_.text-secondary-light-gray]:text-[#a1ccf7] [&_.text-secondary-dark-gray]:text-[#5a76b8]';

/** Cyberpunk magenta/cyan on near-black violet. */
const neonHeistTheme: GraphTheme = {
  root: [
    'bg-[#0b0014]',
    '[--color-graph-menu-bg:#150022]',
    '[--color-graph-menu-item-hover-bg:#3b0a5e]',
    '[--color-graph-elevated-surface-bg:#10001d]',
    '[--color-graph-node-panel-content-bg:#1d0033]',
    '[--color-timeline-loop-accent:#ff2bd6]',
    '[--color-timeline-switch-accent:#00ffd5]',
    '[--color-timeline-scrubber-active:#ff2bd6]',
    '[--color-timeline-scrubber-line:rgba(255,43,214,0.55)]',
    '[--color-timeline-scrubber-line-active:rgba(255,43,214,0.85)]',
    '[--color-runner-muted-text:#b07ad1]',
    '[--color-timeline-hover-text:#ffd6f7]',
    '[--color-edge-value-pill-bg:#1a0030]',
    '[--color-edge-value-pill-border:#ff2bd6]',
    '[--color-edge-value-pill-text:#ffd6f7]',
    '[--color-graph-scrollbar-thumb:#5b2a86]',
    '[--color-timeline-scrollbar-thumb:#5b2a86]',
    '[--color-timeline-scrollbar-track:#150022]',
    '[--color-timeline-scrollbar-track-webkit:#1a0030]',
    '[--color-runner-resize-handle-bg:#1a0030]',
    '[--color-runner-resize-handle-hover-bg:#2a0845]',
    '[--color-graph-toggle-track-bg:#1a0030]',
    '[--color-drag-list-item-hover-bg:#3b0a5e]',
    '[--color-running-glow-strong:rgba(255,43,214,0.5)]',
    '[--color-running-glow-soft:rgba(255,43,214,0.3)]',
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
      'in-[.selected]:border-fuchsia-400 focus:border-fuchsia-400 shadow-[0_0_24px_rgba(255,43,214,0.18)]',
    header: 'uppercase tracking-[0.12em] text-[20px]',
    body: 'bg-[#1e0238] border-x border-b border-fuchsia-500/50',
    inputField: 'bg-[#1d0033] border-fuchsia-500/40 text-fuchsia-100',
  },
  // The shared portaled-popover surface — themes BOTH the runner overflow menus
  // and the connection-order reorder badge at once (root vars can't reach a portal).
  popover: {
    surface: `[--color-graph-elevated-surface-bg:#10001d] border-fuchsia-500/30 ${NEON_TEXT}`,
  },
  statusIndicator: {
    tooltip: 'bg-[#150022] border-fuchsia-400/60 text-fuchsia-100',
  },
  contextMenu: {
    list: 'bg-[#150022] border border-fuchsia-500/30 shadow-[0_0_30px_rgba(255,43,214,0.25)]',
    item: 'hover:bg-fuchsia-500/20',
    itemLabel: 'text-fuchsia-100',
    shortcut: 'text-fuchsia-400/70',
    separator: 'border-fuchsia-500/30',
    submenuPanel:
      'bg-[#150022] border border-fuchsia-500/30 shadow-[0_0_30px_rgba(255,43,214,0.25)]',
  },
  breadcrumbs: {
    backButton: 'bg-[#150022] border-fuchsia-500/40 text-fuchsia-100',
    selectTrigger:
      'bg-[#150022] border-fuchsia-500/40 text-fuchsia-100 hover:bg-fuchsia-500/20',
    list: 'text-fuchsia-100',
    editButton: 'text-fuchsia-100 hover:bg-fuchsia-500/20',
  },
  runnerToggleButton:
    'bg-[#150022]/90 border-fuchsia-500/40 text-fuchsia-100 hover:bg-fuchsia-500/20',
  runnerPanel: {
    container: `bg-[#10001d] border-fuchsia-500/30 ${NEON_TEXT}`,
    overflowMenu: `[--color-graph-elevated-surface-bg:#10001d] [--color-graph-toggle-track-bg:#1a0030] border-fuchsia-500/30 ${NEON_TEXT}`,
    overflowMenuItem: 'hover:bg-fuchsia-500/20',
    overflowMenuItemActive: 'bg-fuchsia-500/30 text-fuchsia-50',
  },
  runControls: {
    container: 'bg-[#150022] border-fuchsia-500/20',
    playButton: 'bg-fuchsia-600 shadow-[0_0_16px_rgba(255,43,214,0.6)]',
    divider: 'bg-fuchsia-500/30',
  },
  timeline: {
    container: `bg-[#10001d] ${NEON_TEXT}`,
    toolbar: 'bg-[#10001d]',
    trackArea: 'bg-[#0b0014] border-fuchsia-500/20',
    ruler: 'bg-[#1a0030]',
    navButton: 'border-fuchsia-500/30',
  },
  inspector: {
    container: `bg-[#10001d] ${NEON_TEXT}`,
    sectionHeader: 'bg-[#1a0030] text-fuchsia-100 border-fuchsia-500/20',
    valueBox: 'bg-[#150022] border-fuchsia-500/30 text-fuchsia-100',
    timelineBox: 'bg-[#150022] border-fuchsia-500/30',
  },
  drawer: {
    container: `bg-[#10001d] border-fuchsia-500/30 ${NEON_TEXT}`,
    title: 'text-fuchsia-100',
    label: 'text-fuchsia-200',
    footerButton: 'border-fuchsia-500/40',
  },
  modal: {
    content: `bg-[#150022] border-fuchsia-500/30 ${NEON_TEXT}`,
    title: 'text-fuchsia-100',
  },
  connectionMiniMap: { container: 'border-fuchsia-500/30' },
  dragList: {
    row: 'bg-[#1d0033] text-fuchsia-100 hover:bg-fuchsia-500/20',
    preview: 'bg-[#1d0033] border-fuchsia-500/40',
  },
  select: {
    trigger: 'bg-[#1d0033] text-fuchsia-100 border-fuchsia-500/30',
    content: `bg-[#150022] border-fuchsia-500/30 text-fuchsia-100 ${NEON_TEXT}`,
    item: 'hover:bg-fuchsia-500/20',
  },
  tooltip: {
    content: `bg-[#150022] border-fuchsia-400/60 text-fuchsia-100 ${NEON_TEXT}`,
  },
};

/** Phosphor-green CRT: pure black, monospace, grayscale node headers. */
const terminalGreenTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rounded-none [--color-graph-elevated-surface-bg:#020a04] [--color-graph-toggle-track-bg:#01140a] border-green-500/30 ${TERMINAL_TEXT}`,
  },
  root: [
    'bg-black',
    '[--color-graph-menu-bg:#000000]',
    '[--color-graph-menu-item-hover-bg:#052e16]',
    '[--color-graph-elevated-surface-bg:#020a04]',
    '[--color-graph-node-panel-content-bg:#01140a]',
    '[--color-timeline-loop-accent:#22c55e]',
    '[--color-timeline-switch-accent:#a3e635]',
    '[--color-timeline-scrubber-active:#22c55e]',
    '[--color-timeline-scrubber-line:rgba(34,197,94,0.55)]',
    '[--color-timeline-scrubber-line-active:rgba(34,197,94,0.85)]',
    '[--color-runner-muted-text:#16a34a]',
    '[--color-timeline-hover-text:#bbf7d0]',
    '[--color-edge-value-pill-bg:#000000]',
    '[--color-edge-value-pill-border:#22c55e]',
    '[--color-edge-value-pill-text:#86efac]',
    '[--color-graph-scrollbar-thumb:#14532d]',
    '[--color-timeline-scrollbar-thumb:#14532d]',
    '[--color-timeline-scrollbar-track:#020a04]',
    '[--color-timeline-scrollbar-track-webkit:#01140a]',
    '[--color-runner-resize-handle-bg:#01140a]',
    '[--color-runner-resize-handle-hover-bg:#052e16]',
    '[--color-graph-toggle-track-bg:#01140a]',
    '[--color-drag-list-item-hover-bg:#052e16]',
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
      'rounded-none in-[.selected]:border-green-400 focus:border-green-400',
    header: 'saturate-0 brightness-110 rounded-none font-mono text-[20px]',
    headerTitle: 'font-mono',
    body: 'rounded-none bg-[#06160d] border border-green-500/60',
    outputRow: 'text-green-300 font-mono',
    inputRow: 'text-green-300 font-mono',
    panelHeader: 'text-green-300 font-mono hover:bg-green-500/10',
    inputField:
      'rounded-none bg-black border-green-500/40 text-green-200 font-mono',
  },
  statusIndicator: {
    tooltip: 'bg-black border-green-500/60 text-green-200 font-mono',
  },
  contextMenu: {
    list: 'rounded-none bg-black border border-green-500/40',
    item: 'hover:bg-green-500/10',
    itemLabel: 'text-green-300 font-mono',
    shortcut: 'text-green-700 font-mono',
    separator: 'border-green-500/40',
    submenuPanel: 'rounded-none bg-black border border-green-500/40',
  },
  breadcrumbs: {
    backButton: 'rounded-none bg-black border-green-500/40 text-green-300',
    selectTrigger:
      'rounded-none bg-black border-green-500/40 text-green-300 hover:bg-green-500/10',
    list: 'text-green-300 font-mono',
    editButton: 'text-green-300 hover:bg-green-500/10',
  },
  runnerToggleButton:
    'rounded-none bg-black/90 border-green-500/40 text-green-300 font-mono hover:bg-green-500/10',
  runnerPanel: {
    container: `rounded-none bg-[#020a04] border-green-500/30 ${TERMINAL_TEXT}`,
    overflowMenu: `rounded-none [--color-graph-elevated-surface-bg:#020a04] [--color-graph-toggle-track-bg:#01140a] border-green-500/30 ${TERMINAL_TEXT}`,
    overflowMenuItem: 'hover:bg-green-500/20',
    overflowMenuItemActive: 'bg-green-500/30 text-green-100',
  },
  runControls: {
    container: 'bg-black border-green-500/30',
    playButton:
      'rounded-none bg-green-700 shadow-[0_0_12px_rgba(34,197,94,0.5)]',
    actionButton: 'rounded-none hover:bg-green-500/10',
    divider: 'bg-green-500/30',
  },
  timeline: {
    container: `bg-[#020a04] ${TERMINAL_TEXT}`,
    toolbar: 'bg-[#020a04]',
    trackArea: 'rounded-none bg-black border-green-500/30',
    ruler: 'bg-[#01140a]',
    navButton: 'rounded-none border-green-500/30',
  },
  inspector: {
    container: `bg-[#020a04] ${TERMINAL_TEXT}`,
    sectionHeader: 'bg-[#01140a] text-green-300 border-green-500/30',
    valueBox: 'rounded-none bg-black border-green-500/40 text-green-200',
    timelineBox: 'rounded-none bg-black border-green-500/40',
  },
  drawer: {
    container: `bg-[#020a04] border-green-500/30 ${TERMINAL_TEXT}`,
    title: 'text-green-300 font-mono',
    label: 'text-green-300 font-mono',
    footerButton: 'rounded-none border-green-500/40',
  },
  modal: {
    content: `rounded-none bg-black border-green-500/40 ${TERMINAL_TEXT}`,
    title: 'text-green-300 font-mono',
  },
  connectionMiniMap: { container: 'rounded-none border-green-500/40' },
  dragList: {
    row: 'rounded-none bg-[#01140a] text-green-300 hover:bg-green-500/10',
    preview: 'rounded-none bg-[#01140a] border-green-500/40',
  },
  select: {
    trigger: 'rounded-none bg-black text-green-300 border-green-500/40',
    content: `rounded-none bg-black border-green-500/40 text-green-300 ${TERMINAL_TEXT}`,
    item: 'hover:bg-green-500/10',
  },
  tooltip: {
    content: `rounded-none bg-black border-green-500/60 text-green-200 ${TERMINAL_TEXT}`,
  },
};

/** Warm sepia daylight: built on the light preset, amber accents, soft radii. */
const sunsetPaperTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `bg-[#fff8ec] border-amber-300 ${PAPER_TEXT} [--color-graph-toggle-track-bg:#f3e3c6] [--color-primary-gray:#e0cda8] [&_.border-secondary-dark-gray]:border-amber-300`,
  },
  root: [
    'bg-[#fdf4e3]',
    '[--color-graph-menu-bg:#fff8ec]',
    '[--color-graph-menu-item-hover-bg:#fde8c8]',
    '[--color-graph-elevated-surface-bg:#fffbf2]',
    '[--color-graph-node-panel-content-bg:#f8ecd9]',
    '[--color-timeline-loop-accent:#ea580c]',
    '[--color-timeline-switch-accent:#0d9488]',
    '[--color-runner-muted-text:#a8825f]',
    '[--color-timeline-hover-text:#431407]',
    '[--color-edge-value-pill-bg:#fff8ec]',
    '[--color-edge-value-pill-border:#ddb892]',
    '[--color-edge-value-pill-text:#431407]',
    '[--color-graph-scrollbar-thumb:#d9b991]',
    '[--color-timeline-scrollbar-thumb:#d9b991]',
    '[--color-timeline-scrollbar-track:#f4e4cb]',
    '[--color-timeline-scrollbar-track-webkit:#f0ddc0]',
    '[--color-runner-resize-handle-bg:#f4e4cb]',
    '[--color-runner-resize-handle-hover-bg:#ecd5b3]',
    '[--color-graph-toggle-track-bg:#f4e4cb]',
    '[--color-drag-list-item-hover-bg:#f0ddc0]',
    '[--color-primary-gray:#e3cba4]',
    '[--color-inspector-progress-track:#ecd5b3]',
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
    container: 'focus:border-amber-700 in-[.selected]:border-amber-700',
    header: 'rounded-t-xl',
    body: 'bg-[#fffaf0] rounded-b-xl border-x border-b border-amber-200',
    outputRow: 'text-stone-800',
    inputRow: 'text-stone-800',
    panelHeader: 'text-stone-800 hover:bg-amber-100',
    inputField:
      'bg-white text-stone-800 border-amber-300 placeholder:text-stone-400',
  },
  statusIndicator: {
    tooltip: 'bg-[#fff8ec] border-amber-300 text-stone-800',
  },
  contextMenu: {
    list: 'bg-[#fff8ec] border-amber-200 shadow-amber-900/10',
    item: 'hover:bg-amber-100',
    itemLabel: 'text-stone-800',
    shortcut: 'text-stone-500',
    separator: 'border-amber-200',
    submenuPanel: 'bg-[#fff8ec] shadow-amber-900/10',
  },
  breadcrumbs: {
    backButton: 'bg-[#fff8ec] border-amber-300 text-stone-800',
    selectTrigger:
      'bg-[#fff8ec] border-amber-300 text-stone-800 hover:bg-amber-100',
    list: 'text-stone-800',
    editButton: 'text-stone-800 hover:bg-amber-100',
  },
  errorBoundary: {
    container: 'bg-[#fdf4e3] text-stone-700',
    retryButton: 'border-amber-300 bg-white text-stone-700 hover:bg-amber-100',
  },
  runnerToggleButton:
    'border-amber-300 bg-[#fff8ec]/90 text-stone-800 hover:bg-amber-100',
  runnerPanel: {
    container: `bg-[#faf0de] border-amber-300 ${PAPER_TEXT}`,
    closeButton: 'text-stone-500 hover:bg-amber-100 hover:text-stone-800',
    overflowMenu: `bg-[#fff8ec] border-amber-300 ${PAPER_TEXT} [--color-graph-toggle-track-bg:#f3e3c6] [--color-primary-gray:#e0cda8] [&_.border-secondary-dark-gray]:border-amber-300`,
    overflowMenuItem: 'hover:bg-amber-100 hover:text-stone-900',
    overflowMenuItemActive: 'bg-amber-200 text-stone-900',
  },
  runControls: {
    container: 'bg-[#f6ead2] border-amber-200',
    statusLabel: 'text-stone-800',
    divider: 'bg-amber-200',
    actionButton: 'text-stone-700 hover:bg-amber-100 hover:text-stone-900',
    playButton: 'bg-orange-600 shadow-[0_0_12px_rgba(234,88,12,0.4)]',
  },
  timeline: {
    container: `bg-[#f6ead2] ${PAPER_TEXT}`,
    toolbar: 'bg-[#f6ead2]',
    toolbarButton: 'text-stone-800 hover:bg-amber-100',
    navButton: 'border-amber-300 bg-white text-stone-700 hover:bg-amber-200',
    ruler: 'bg-[#f0ddc0]',
    trackArea: 'bg-[#fffaf0] border-amber-200',
    loopHeader: 'bg-[#f6ead2]',
    switchHeader: 'bg-[#f6ead2]',
  },
  inspector: {
    container: `bg-[#faf0de] ${PAPER_TEXT}`,
    header: 'border-amber-200',
    sectionHeader: 'bg-[#f0ddc0] text-stone-800 border-amber-200',
    valueBox: 'bg-white border-amber-300 text-stone-800',
    timelineBox: 'bg-[#f6ead2] border-amber-300',
    contextBox: 'border-amber-300',
  },
  drawer: {
    container: `bg-[#faf0de] border-amber-300 ${PAPER_TEXT}`,
    header: 'border-amber-200',
    title: 'text-stone-800',
    closeButton: 'hover:bg-amber-100',
    footer: 'border-amber-200',
    label: 'text-stone-800',
    emptyState: 'text-stone-500',
    footerButton:
      'bg-amber-100 text-stone-800 border-amber-300 hover:bg-amber-200',
  },
  modal: {
    content: `bg-[#faf0de] border-amber-300 ${PAPER_TEXT}`,
    title: 'text-stone-800',
  },
  connectionMiniMap: { container: 'border-amber-300' },
  dragList: {
    row: 'bg-[#f0ddc0] text-stone-800 hover:bg-amber-200',
    preview: 'bg-[#f0ddc0] border-amber-300',
  },
  select: {
    trigger: 'bg-white text-stone-800 border-amber-300 hover:bg-amber-50',
    content: `bg-[#fff8ec] border-amber-300 text-stone-800 ${PAPER_TEXT}`,
    item: 'hover:bg-amber-100',
  },
  tooltip: {
    content: `bg-[#fff8ec] border-amber-400/70 text-stone-800 ${PAPER_TEXT}`,
  },
};

/** Abyssal navy with cyan instrumentation. */
const deepOceanTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `[--color-graph-elevated-surface-bg:#061827] [--color-graph-toggle-track-bg:#0a2238] border-cyan-500/30 ${OCEAN_TEXT}`,
  },
  root: [
    'bg-[#04111f]',
    '[--color-graph-menu-bg:#081c30]',
    '[--color-graph-menu-item-hover-bg:#0e3a5c]',
    '[--color-graph-elevated-surface-bg:#061827]',
    '[--color-graph-node-panel-content-bg:#0a2238]',
    '[--color-timeline-loop-accent:#22d3ee]',
    '[--color-timeline-switch-accent:#818cf8]',
    '[--color-timeline-scrubber-active:#22d3ee]',
    '[--color-timeline-scrubber-line:rgba(34,211,238,0.5)]',
    '[--color-timeline-scrubber-line-active:rgba(34,211,238,0.8)]',
    '[--color-runner-muted-text:#5e88a6]',
    '[--color-timeline-hover-text:#cffafe]',
    '[--color-edge-value-pill-bg:#081c30]',
    '[--color-edge-value-pill-border:#155e75]',
    '[--color-edge-value-pill-text:#cffafe]',
    '[--color-graph-scrollbar-thumb:#155e75]',
    '[--color-timeline-scrollbar-thumb:#155e75]',
    '[--color-timeline-scrollbar-track:#061827]',
    '[--color-timeline-scrollbar-track-webkit:#0a2238]',
    '[--color-runner-resize-handle-bg:#0a2238]',
    '[--color-runner-resize-handle-hover-bg:#0e3a5c]',
    '[--color-graph-toggle-track-bg:#0a2238]',
    '[--color-drag-list-item-hover-bg:#0e3a5c]',
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
    container: 'in-[.selected]:border-cyan-300 focus:border-cyan-300',
    body: 'bg-[#0e2c47] border-x border-b border-cyan-500/50',
    inputField: 'bg-[#081c30] border-cyan-500/40 text-sky-100',
  },
  statusIndicator: {
    tooltip: 'bg-[#081c30] border-cyan-400/60 text-sky-100',
  },
  contextMenu: {
    list: 'bg-[#081c30] border border-cyan-500/30',
    item: 'hover:bg-cyan-500/15',
    itemLabel: 'text-sky-100',
    shortcut: 'text-sky-400/70',
    separator: 'border-cyan-500/30',
    submenuPanel: 'bg-[#081c30] border border-cyan-500/30',
  },
  breadcrumbs: {
    backButton: 'bg-[#081c30] border-cyan-500/40 text-sky-100',
    selectTrigger:
      'bg-[#081c30] border-cyan-500/40 text-sky-100 hover:bg-cyan-500/15',
    list: 'text-sky-100',
    editButton: 'text-sky-100 hover:bg-cyan-500/15',
  },
  runnerToggleButton:
    'bg-[#081c30]/90 border-cyan-500/40 text-sky-100 hover:bg-cyan-500/15',
  runnerPanel: {
    container: `bg-[#061827] border-cyan-500/30 ${OCEAN_TEXT}`,
    overflowMenu: `[--color-graph-elevated-surface-bg:#061827] [--color-graph-toggle-track-bg:#0a2238] border-cyan-500/30 ${OCEAN_TEXT}`,
    overflowMenuItem: 'hover:bg-cyan-500/20',
    overflowMenuItemActive: 'bg-cyan-500/30 text-cyan-50',
  },
  runControls: {
    container: 'bg-[#081c30] border-cyan-500/20',
    playButton: 'bg-cyan-600 shadow-[0_0_14px_rgba(34,211,238,0.5)]',
    divider: 'bg-cyan-500/30',
  },
  timeline: {
    container: `bg-[#061827] ${OCEAN_TEXT}`,
    toolbar: 'bg-[#061827]',
    trackArea: 'bg-[#04111f] border-cyan-500/20',
    ruler: 'bg-[#0a2238]',
    navButton: 'border-cyan-500/30',
  },
  inspector: {
    container: `bg-[#061827] ${OCEAN_TEXT}`,
    sectionHeader: 'bg-[#0a2238] text-sky-100 border-cyan-500/20',
    valueBox: 'bg-[#081c30] border-cyan-500/30 text-sky-100',
    timelineBox: 'bg-[#081c30] border-cyan-500/30',
  },
  drawer: {
    container: `bg-[#061827] border-cyan-500/30 ${OCEAN_TEXT}`,
    title: 'text-sky-100',
    label: 'text-sky-200',
    footerButton: 'border-cyan-500/40',
  },
  modal: {
    content: `bg-[#081c30] border-cyan-500/30 ${OCEAN_TEXT}`,
    title: 'text-sky-100',
  },
  connectionMiniMap: { container: 'border-cyan-500/30' },
  dragList: {
    row: 'bg-[#0a2238] text-sky-100 hover:bg-cyan-500/15',
    preview: 'bg-[#0a2238] border-cyan-500/40',
  },
  select: {
    trigger: 'bg-[#081c30] text-sky-100 border-cyan-500/30',
    content: `bg-[#081c30] border-cyan-500/30 text-sky-100 ${OCEAN_TEXT}`,
    item: 'hover:bg-cyan-500/15',
  },
  tooltip: {
    content: `bg-[#081c30] border-cyan-400/60 text-sky-100 ${OCEAN_TEXT}`,
  },
};

/** Cobalt engineering blueprint: fine white line grid, drafting-table chrome. */
const blueprintTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `[--color-graph-elevated-surface-bg:#0a2c5e] [--color-graph-toggle-track-bg:#0c3578] border-sky-300/30 ${BLUEPRINT_TEXT}`,
  },
  root: [
    'bg-[#0b3a82]',
    '[--color-graph-menu-bg:#0b2f66]',
    '[--color-graph-menu-item-hover-bg:#1d4d9e]',
    '[--color-graph-elevated-surface-bg:#0a2c5e]',
    '[--color-graph-node-panel-content-bg:#0c3578]',
    '[--color-timeline-loop-accent:#7dd3fc]',
    '[--color-timeline-switch-accent:#fef08a]',
    '[--color-timeline-scrubber-active:#e0f2fe]',
    '[--color-timeline-scrubber-line:rgba(224,242,254,0.5)]',
    '[--color-timeline-scrubber-line-active:rgba(224,242,254,0.85)]',
    '[--color-runner-muted-text:#93c5fd]',
    '[--color-timeline-hover-text:#f0f9ff]',
    '[--color-edge-value-pill-bg:#0b2f66]',
    '[--color-edge-value-pill-border:#7dd3fc]',
    '[--color-edge-value-pill-text:#e0f2fe]',
    '[--color-graph-scrollbar-thumb:#2563eb]',
    '[--color-timeline-scrollbar-thumb:#2563eb]',
    '[--color-timeline-scrollbar-track:#0a2c5e]',
    '[--color-timeline-scrollbar-track-webkit:#0c3578]',
    '[--color-runner-resize-handle-bg:#0c3578]',
    '[--color-runner-resize-handle-hover-bg:#1d4d9e]',
    '[--color-graph-toggle-track-bg:#0c3578]',
    '[--color-drag-list-item-hover-bg:#1d4d9e]',
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
    container: 'in-[.selected]:border-sky-200 focus:border-sky-200',
    header:
      'font-mono uppercase tracking-wider text-[18px] border-b border-white/30',
    body: 'bg-[#0c3a86] border-x border-b border-sky-200/50',
    inputField: 'bg-[#0b2f66] border-sky-300/40 text-sky-50',
  },
  statusIndicator: {
    tooltip: 'bg-[#0b2f66] border-sky-300/60 text-sky-50',
  },
  contextMenu: {
    list: 'bg-[#0b2f66] border border-sky-300/30',
    item: 'hover:bg-sky-400/20',
    itemLabel: 'text-sky-50',
    shortcut: 'text-sky-300/70',
    separator: 'border-sky-300/30',
    submenuPanel: 'bg-[#0b2f66] border border-sky-300/30',
  },
  breadcrumbs: {
    backButton: 'bg-[#0b2f66] border-sky-300/40 text-sky-50',
    selectTrigger:
      'bg-[#0b2f66] border-sky-300/40 text-sky-50 hover:bg-sky-400/20',
    list: 'text-sky-50',
    editButton: 'text-sky-50 hover:bg-sky-400/20',
  },
  runnerToggleButton:
    'bg-[#0b2f66]/90 border-sky-300/40 text-sky-50 hover:bg-sky-400/20',
  runnerPanel: {
    container: `bg-[#0a2c5e] border-sky-300/30 ${BLUEPRINT_TEXT}`,
    overflowMenu: `[--color-graph-elevated-surface-bg:#0a2c5e] [--color-graph-toggle-track-bg:#0c3578] border-sky-300/30 ${BLUEPRINT_TEXT}`,
    overflowMenuItem: 'hover:bg-sky-400/20',
    overflowMenuItemActive: 'bg-sky-400/30 text-sky-50',
  },
  runControls: {
    container: 'bg-[#0b2f66] border-sky-300/20',
    playButton: 'bg-sky-500 shadow-[0_0_14px_rgba(125,211,252,0.5)]',
    divider: 'bg-sky-300/30',
  },
  timeline: {
    container: `bg-[#0a2c5e] ${BLUEPRINT_TEXT}`,
    toolbar: 'bg-[#0a2c5e]',
    trackArea: 'bg-[#0b3a82] border-sky-300/20',
    ruler: 'bg-[#0c3578]',
    navButton: 'border-sky-300/30',
  },
  inspector: {
    container: `bg-[#0a2c5e] ${BLUEPRINT_TEXT}`,
    sectionHeader: 'bg-[#0c3578] text-sky-50 border-sky-300/20',
    valueBox: 'bg-[#0b2f66] border-sky-300/30 text-sky-50',
    timelineBox: 'bg-[#0b2f66] border-sky-300/30',
  },
  drawer: {
    container: `bg-[#0a2c5e] border-sky-300/30 ${BLUEPRINT_TEXT}`,
    title: 'text-sky-50',
    label: 'text-sky-100',
    footerButton: 'border-sky-300/40',
  },
  modal: {
    content: `bg-[#0b2f66] border-sky-300/30 ${BLUEPRINT_TEXT}`,
    title: 'text-sky-50',
  },
  connectionMiniMap: { container: 'border-sky-300/30' },
  dragList: {
    row: 'bg-[#0c3578] text-sky-50 hover:bg-sky-400/20',
    preview: 'bg-[#0c3578] border-sky-300/40',
  },
  select: {
    trigger: 'bg-[#0b2f66] text-sky-50 border-sky-300/30',
    content: `bg-[#0b2f66] border-sky-300/30 text-sky-50 ${BLUEPRINT_TEXT}`,
    item: 'hover:bg-sky-400/20',
  },
  tooltip: {
    content: `bg-[#0b2f66] border-sky-300/60 text-sky-50 ${BLUEPRINT_TEXT}`,
  },
};

/** Comic pop-art: halftone dot screen on yellow, hard black borders & shadows. */
const halftonePopTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `rounded-none bg-white border-2 border-black ${POP_TEXT} [--color-graph-toggle-track-bg:#fef3c7] [--color-primary-gray:#fde047] [&_.border-secondary-dark-gray]:border-black`,
  },
  root: [
    'bg-[#fde047]',
    '[--color-graph-menu-bg:#ffffff]',
    '[--color-graph-menu-item-hover-bg:#fde047]',
    '[--color-graph-elevated-surface-bg:#fffbeb]',
    '[--color-graph-node-panel-content-bg:#fef3c7]',
    '[--color-timeline-loop-accent:#ef4444]',
    '[--color-timeline-switch-accent:#3b82f6]',
    '[--color-timeline-scrubber-active:#ef4444]',
    '[--color-timeline-scrubber-line:rgba(239,68,68,0.6)]',
    '[--color-timeline-scrubber-line-active:rgba(239,68,68,0.9)]',
    '[--color-runner-muted-text:#78716c]',
    '[--color-timeline-hover-text:#000000]',
    '[--color-edge-value-pill-bg:#ffffff]',
    '[--color-edge-value-pill-border:#000000]',
    '[--color-edge-value-pill-text:#000000]',
    '[--color-graph-scrollbar-thumb:#a8a29e]',
    '[--color-timeline-scrollbar-thumb:#a8a29e]',
    '[--color-timeline-scrollbar-track:#fef3c7]',
    '[--color-timeline-scrollbar-track-webkit:#fde68a]',
    '[--color-runner-resize-handle-bg:#fde68a]',
    '[--color-runner-resize-handle-hover-bg:#fcd34d]',
    '[--color-graph-toggle-track-bg:#fef3c7]',
    '[--color-drag-list-item-hover-bg:#fde68a]',
    '[--color-primary-gray:#fcd34d]',
    '[--color-inspector-progress-track:#fde68a]',
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
      'rounded-none border-[3px] border-black shadow-[6px_6px_0_rgba(0,0,0,0.85)] in-[.selected]:border-blue-600 focus:border-blue-600',
    header:
      'rounded-none border-b-[3px] border-black font-extrabold uppercase tracking-tight',
    body: 'rounded-none bg-white',
    outputRow: 'text-black font-semibold',
    inputRow: 'text-black font-semibold',
    panelHeader: 'text-black font-semibold hover:bg-yellow-200',
    inputField:
      'rounded-none bg-white text-black border-2 border-black placeholder:text-stone-400',
  },
  statusIndicator: {
    tooltip: 'rounded-none bg-white border-2 border-black text-black',
  },
  contextMenu: {
    list: 'rounded-none bg-white border-2 border-black shadow-[5px_5px_0_rgba(0,0,0,0.85)]',
    item: 'hover:bg-yellow-200',
    itemLabel: 'text-black font-semibold',
    shortcut: 'text-stone-500',
    separator: 'border-black',
    submenuPanel:
      'rounded-none bg-white border-2 border-black shadow-[5px_5px_0_rgba(0,0,0,0.85)]',
  },
  breadcrumbs: {
    backButton: 'rounded-none bg-white border-2 border-black text-black',
    selectTrigger:
      'rounded-none bg-white border-2 border-black text-black hover:bg-yellow-200',
    list: 'text-black',
    editButton: 'text-black hover:bg-yellow-200',
  },
  runnerToggleButton:
    'rounded-none bg-white border-2 border-black text-black font-bold shadow-[4px_4px_0_rgba(0,0,0,0.85)] hover:bg-yellow-200',
  runnerPanel: {
    container: `rounded-none bg-[#fffbeb] border-2 border-black ${POP_TEXT}`,
    closeButton: 'rounded-none text-black hover:bg-yellow-200',
    overflowMenu: `rounded-none bg-white border-2 border-black ${POP_TEXT} [--color-graph-toggle-track-bg:#fef3c7] [--color-primary-gray:#fde047] [&_.border-secondary-dark-gray]:border-black`,
    overflowMenuItem: 'hover:bg-yellow-200 hover:text-black',
    overflowMenuItemActive: 'bg-yellow-400 text-black',
  },
  runControls: {
    container: 'bg-[#fde68a] border-black',
    statusLabel: 'text-black font-bold',
    divider: 'bg-black',
    actionButton: 'rounded-none text-black hover:bg-yellow-200',
    playButton:
      'rounded-none bg-red-500 border-2 border-black shadow-[3px_3px_0_rgba(0,0,0,0.85)]',
  },
  timeline: {
    container: `bg-[#fde68a] ${POP_TEXT}`,
    toolbar: 'bg-[#fde68a]',
    toolbarButton: 'text-black hover:bg-yellow-200',
    navButton:
      'rounded-none border-black bg-white text-black hover:bg-yellow-200',
    ruler: 'bg-[#fef3c7]',
    trackArea: 'rounded-none bg-white border-2 border-black',
    loopHeader: 'bg-[#fde68a]',
    switchHeader: 'bg-[#fde68a]',
  },
  inspector: {
    container: `bg-[#fffbeb] ${POP_TEXT}`,
    header: 'border-black',
    sectionHeader: 'bg-[#fde68a] text-black border-black',
    valueBox: 'rounded-none bg-white border-2 border-black text-black',
    timelineBox: 'rounded-none bg-[#fef3c7] border-2 border-black',
    contextBox: 'rounded-none border-2 border-black',
  },
  drawer: {
    container: `bg-[#fffbeb] border-l-2 border-black ${POP_TEXT}`,
    header: 'border-black',
    title: 'text-black font-extrabold uppercase',
    closeButton: 'hover:bg-yellow-200',
    footer: 'border-black',
    label: 'text-black font-semibold',
    emptyState: 'text-stone-500',
    footerButton:
      'rounded-none bg-white text-black border-2 border-black hover:bg-yellow-200',
  },
  modal: {
    content: `rounded-none bg-[#fffbeb] border-[3px] border-black shadow-[8px_8px_0_rgba(0,0,0,0.85)] ${POP_TEXT}`,
    title: 'text-black font-extrabold uppercase',
  },
  connectionMiniMap: { container: 'rounded-none border-2 border-black' },
  dragList: {
    row: 'rounded-none bg-white text-black border border-black hover:bg-yellow-200',
    preview: 'rounded-none bg-white border-2 border-black',
  },
  select: {
    trigger: 'rounded-none bg-white text-black border-2 border-black',
    content: `rounded-none bg-white border-2 border-black text-black ${POP_TEXT}`,
    item: 'hover:bg-yellow-200',
  },
  tooltip: {
    content: `rounded-none bg-white border-2 border-black text-black ${POP_TEXT}`,
  },
};

/** Night-sky observatory: sparse white star-dots on space black, violet chrome. */
const observatoryTheme: GraphTheme = {
  // Shared portaled-popover surface — overflow menus AND the reorder badge.
  popover: {
    surface: `[--color-graph-elevated-surface-bg:#0d0a1f] [--color-graph-toggle-track-bg:#14102b] border-violet-500/30 ${STAR_TEXT}`,
  },
  root: [
    'bg-[#02010a]',
    '[--color-graph-menu-bg:#14102b]',
    '[--color-graph-menu-item-hover-bg:#2e2659]',
    '[--color-graph-elevated-surface-bg:#0d0a1f]',
    '[--color-graph-node-panel-content-bg:#161130]',
    '[--color-timeline-loop-accent:#a78bfa]',
    '[--color-timeline-switch-accent:#fbbf24]',
    '[--color-timeline-scrubber-active:#fbbf24]',
    '[--color-timeline-scrubber-line:rgba(251,191,36,0.5)]',
    '[--color-timeline-scrubber-line-active:rgba(251,191,36,0.85)]',
    '[--color-runner-muted-text:#8b7fc7]',
    '[--color-timeline-hover-text:#ede9fe]',
    '[--color-edge-value-pill-bg:#14102b]',
    '[--color-edge-value-pill-border:#a78bfa]',
    '[--color-edge-value-pill-text:#ede9fe]',
    '[--color-graph-scrollbar-thumb:#4c3d8f]',
    '[--color-timeline-scrollbar-thumb:#4c3d8f]',
    '[--color-timeline-scrollbar-track:#0d0a1f]',
    '[--color-timeline-scrollbar-track-webkit:#14102b]',
    '[--color-runner-resize-handle-bg:#14102b]',
    '[--color-runner-resize-handle-hover-bg:#2e2659]',
    '[--color-graph-toggle-track-bg:#14102b]',
    '[--color-drag-list-item-hover-bg:#2e2659]',
    '[--color-running-glow-strong:rgba(167,139,250,0.5)]',
    '[--color-running-glow-soft:rgba(167,139,250,0.3)]',
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
      'in-[.selected]:border-violet-300 focus:border-violet-300 shadow-[0_0_30px_rgba(167,139,250,0.12)]',
    body: 'bg-[#191338] border-x border-b border-violet-500/50',
    inputField: 'bg-[#14102b] border-violet-500/40 text-violet-100',
  },
  statusIndicator: {
    tooltip: 'bg-[#14102b] border-violet-400/60 text-violet-100',
  },
  contextMenu: {
    list: 'bg-[#14102b] border border-violet-500/30',
    item: 'hover:bg-violet-500/20',
    itemLabel: 'text-violet-100',
    shortcut: 'text-violet-400/70',
    separator: 'border-violet-500/30',
    submenuPanel: 'bg-[#14102b] border border-violet-500/30',
  },
  breadcrumbs: {
    backButton: 'bg-[#14102b] border-violet-500/40 text-violet-100',
    selectTrigger:
      'bg-[#14102b] border-violet-500/40 text-violet-100 hover:bg-violet-500/20',
    list: 'text-violet-100',
    editButton: 'text-violet-100 hover:bg-violet-500/20',
  },
  runnerToggleButton:
    'bg-[#14102b]/90 border-violet-500/40 text-violet-100 hover:bg-violet-500/20',
  runnerPanel: {
    container: `bg-[#0d0a1f] border-violet-500/30 ${STAR_TEXT}`,
    overflowMenu: `[--color-graph-elevated-surface-bg:#0d0a1f] [--color-graph-toggle-track-bg:#14102b] border-violet-500/30 ${STAR_TEXT}`,
    overflowMenuItem: 'hover:bg-violet-500/20',
    overflowMenuItemActive: 'bg-violet-500/30 text-violet-50',
  },
  runControls: {
    container: 'bg-[#14102b] border-violet-500/20',
    playButton: 'bg-violet-600 shadow-[0_0_16px_rgba(167,139,250,0.55)]',
    divider: 'bg-violet-500/30',
  },
  timeline: {
    container: `bg-[#0d0a1f] ${STAR_TEXT}`,
    toolbar: 'bg-[#0d0a1f]',
    trackArea: 'bg-[#02010a] border-violet-500/20',
    ruler: 'bg-[#14102b]',
    navButton: 'border-violet-500/30',
  },
  inspector: {
    container: `bg-[#0d0a1f] ${STAR_TEXT}`,
    sectionHeader: 'bg-[#14102b] text-violet-100 border-violet-500/20',
    valueBox: 'bg-[#14102b] border-violet-500/30 text-violet-100',
    timelineBox: 'bg-[#14102b] border-violet-500/30',
  },
  drawer: {
    container: `bg-[#0d0a1f] border-violet-500/30 ${STAR_TEXT}`,
    title: 'text-violet-100',
    label: 'text-violet-200',
    footerButton: 'border-violet-500/40',
  },
  modal: {
    content: `bg-[#14102b] border-violet-500/30 ${STAR_TEXT}`,
    title: 'text-violet-100',
  },
  connectionMiniMap: { container: 'border-violet-500/30' },
  dragList: {
    row: 'bg-[#161130] text-violet-100 hover:bg-violet-500/20',
    preview: 'bg-[#161130] border-violet-500/40',
  },
  select: {
    trigger: 'bg-[#14102b] text-violet-100 border-violet-500/30',
    content: `bg-[#14102b] border-violet-500/30 text-violet-100 ${STAR_TEXT}`,
    item: 'hover:bg-violet-500/20',
  },
  tooltip: {
    content: `bg-[#14102b] border-violet-400/60 text-violet-100 ${STAR_TEXT}`,
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
    surface: `bg-white border-blue-200 ${NOTEBOOK_TEXT} [--color-graph-toggle-track-bg:#e7eef6] [--color-primary-gray:#c7d6e6] [&_.border-secondary-dark-gray]:border-blue-200`,
  },
  root: [
    'bg-[#fbfaf4]',
    '[--color-graph-menu-bg:#ffffff]',
    '[--color-graph-menu-item-hover-bg:#dbeafe]',
    '[--color-graph-elevated-surface-bg:#fdfcf7]',
    '[--color-graph-node-panel-content-bg:#f1f5f9]',
    '[--color-timeline-loop-accent:#f87171]',
    '[--color-timeline-switch-accent:#60a5fa]',
    '[--color-timeline-scrubber-active:#f87171]',
    '[--color-timeline-scrubber-line:rgba(248,113,113,0.5)]',
    '[--color-timeline-scrubber-line-active:rgba(248,113,113,0.85)]',
    '[--color-runner-muted-text:#64748b]',
    '[--color-timeline-hover-text:#0f172a]',
    '[--color-edge-value-pill-bg:#ffffff]',
    '[--color-edge-value-pill-border:#93c5fd]',
    '[--color-edge-value-pill-text:#1e293b]',
    '[--color-graph-scrollbar-thumb:#cbd5e1]',
    '[--color-timeline-scrollbar-thumb:#cbd5e1]',
    '[--color-timeline-scrollbar-track:#f1f5f9]',
    '[--color-timeline-scrollbar-track-webkit:#e2e8f0]',
    '[--color-runner-resize-handle-bg:#eef2f6]',
    '[--color-runner-resize-handle-hover-bg:#e2e8f0]',
    '[--color-graph-toggle-track-bg:#eef2f6]',
    '[--color-drag-list-item-hover-bg:#e2e8f0]',
    '[--color-primary-gray:#dbe3ec]',
    '[--color-inspector-progress-track:#e2e8f0]',
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
    container: 'focus:border-red-400 in-[.selected]:border-red-400',
    header: 'rounded-t-sm',
    headerTitle: 'font-serif italic',
    body: 'bg-white/95 rounded-b-sm border-x border-b border-blue-200 shadow-sm',
    outputRow: 'text-slate-800',
    inputRow: 'text-slate-800',
    panelHeader: 'text-slate-800 hover:bg-blue-100',
    inputField:
      'bg-white text-slate-800 border-blue-200 placeholder:text-slate-400',
  },
  statusIndicator: {
    tooltip: 'bg-white border-blue-200 text-slate-800',
  },
  contextMenu: {
    list: 'bg-white border-blue-100 shadow-slate-400/20',
    item: 'hover:bg-blue-100',
    itemLabel: 'text-slate-800',
    shortcut: 'text-slate-500',
    separator: 'border-blue-200',
    submenuPanel: 'bg-white shadow-slate-400/20',
  },
  breadcrumbs: {
    backButton: 'bg-white border-blue-200 text-slate-800',
    selectTrigger: 'bg-white border-blue-200 text-slate-800 hover:bg-blue-50',
    list: 'text-slate-800 font-serif italic',
    editButton: 'text-slate-800 hover:bg-blue-100',
  },
  runnerToggleButton:
    'border-blue-200 bg-white/90 text-slate-800 hover:bg-blue-50',
  runnerPanel: {
    container: `bg-[#fdfcf7] border-blue-200 ${NOTEBOOK_TEXT}`,
    closeButton: 'text-slate-500 hover:bg-blue-100 hover:text-slate-800',
    overflowMenu: `bg-white border-blue-200 ${NOTEBOOK_TEXT} [--color-graph-toggle-track-bg:#e7eef6] [--color-primary-gray:#c7d6e6] [&_.border-secondary-dark-gray]:border-blue-200`,
    overflowMenuItem: 'hover:bg-blue-100 hover:text-slate-900',
    overflowMenuItemActive: 'bg-blue-200 text-slate-900',
  },
  runControls: {
    container: 'bg-[#f4f1e8] border-blue-200',
    statusLabel: 'text-slate-800',
    divider: 'bg-blue-200',
    actionButton: 'text-slate-700 hover:bg-blue-100 hover:text-slate-900',
    playButton: 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.4)]',
  },
  timeline: {
    container: `bg-[#f4f1e8] ${NOTEBOOK_TEXT}`,
    toolbar: 'bg-[#f4f1e8]',
    toolbarButton: 'text-slate-800 hover:bg-blue-100',
    navButton: 'border-blue-200 bg-white text-slate-700 hover:bg-blue-100',
    ruler: 'bg-[#eef2f6]',
    trackArea: 'bg-white border-blue-200',
    loopHeader: 'bg-[#f4f1e8]',
    switchHeader: 'bg-[#f4f1e8]',
  },
  inspector: {
    container: `bg-[#fdfcf7] ${NOTEBOOK_TEXT}`,
    header: 'border-blue-200',
    sectionHeader: 'bg-[#eef2f6] text-slate-800 border-blue-200',
    valueBox: 'bg-white border-blue-200 text-slate-800',
    timelineBox: 'bg-[#f4f1e8] border-blue-200',
    contextBox: 'border-blue-200',
  },
  drawer: {
    container: `bg-[#fdfcf7] border-blue-200 ${NOTEBOOK_TEXT}`,
    header: 'border-blue-200',
    title: 'text-slate-800 font-serif italic',
    closeButton: 'hover:bg-blue-100',
    footer: 'border-blue-200',
    label: 'text-slate-800',
    emptyState: 'text-slate-500',
    footerButton: 'bg-blue-50 text-slate-800 border-blue-200 hover:bg-blue-100',
  },
  modal: {
    content: `bg-[#fdfcf7] border-blue-200 ${NOTEBOOK_TEXT}`,
    title: 'text-slate-800 font-serif italic',
  },
  connectionMiniMap: { container: 'border-blue-200' },
  dragList: {
    row: 'bg-[#eef2f6] text-slate-800 hover:bg-blue-100',
    preview: 'bg-[#eef2f6] border-blue-200',
  },
  select: {
    trigger: 'bg-white text-slate-800 border-blue-200 hover:bg-blue-50',
    content: `bg-white border-blue-200 text-slate-800 ${NOTEBOOK_TEXT}`,
    item: 'hover:bg-blue-100',
  },
  tooltip: {
    content: `bg-white border-blue-300/70 text-slate-800 ${NOTEBOOK_TEXT}`,
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
    surface: `rounded-none [--color-graph-elevated-surface-bg:#0b1430] [--color-graph-toggle-track-bg:#101c42] border-[#3170a0] ${LOGO_TEXT}`,
  },
  root: [
    'bg-[#0e1939]',
    '[--color-graph-menu-bg:#101c42]',
    '[--color-graph-menu-item-hover-bg:#1d2c5e]',
    '[--color-graph-elevated-surface-bg:#0b1430]',
    '[--color-graph-node-panel-content-bg:#13204a]',
    '[--color-timeline-loop-accent:#ee7678]',
    '[--color-timeline-switch-accent:#f2db68]',
    '[--color-timeline-scrubber-active:#a1ccf7]',
    '[--color-timeline-scrubber-line:rgba(161,204,247,0.55)]',
    '[--color-timeline-scrubber-line-active:rgba(161,204,247,0.9)]',
    '[--color-runner-muted-text:#5a76b8]',
    '[--color-timeline-hover-text:#dce9fb]',
    '[--color-edge-value-pill-bg:#0e1939]',
    '[--color-edge-value-pill-border:#3170a0]',
    '[--color-edge-value-pill-text:#a1ccf7]',
    '[--color-graph-scrollbar-thumb:#3170a0]',
    '[--color-timeline-scrollbar-thumb:#3170a0]',
    '[--color-timeline-scrollbar-track:#0b1430]',
    '[--color-timeline-scrollbar-track-webkit:#101c42]',
    '[--color-runner-resize-handle-bg:#101c42]',
    '[--color-runner-resize-handle-hover-bg:#1d2c5e]',
    '[--color-graph-toggle-track-bg:#101c42]',
    '[--color-drag-list-item-hover-bg:#1d2c5e]',
    '[--color-running-glow-strong:rgba(246,225,106,0.5)]',
    '[--color-running-glow-soft:rgba(246,225,106,0.3)]',
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
      'border-[3px] border-[#3170a0] rounded-none shadow-[-10px_10px_0_rgba(10,18,48,0.9)] in-[.selected]:border-[#97ccf7] focus:border-[#97ccf7]',
    header: 'rounded-none',
    body: 'rounded-none bg-[#101c42]',
    handleShape: 'border-[#3170a0]',
    inputField: 'bg-[#0e1939] border-[#3170a0] text-[#dce9fb]',
  },
  statusIndicator: {
    tooltip: 'bg-[#101c42] border-[#3170a0] text-[#dce9fb]',
  },
  contextMenu: {
    list: 'rounded-none bg-[#101c42] border-2 border-[#3170a0]',
    item: 'hover:bg-[#1d2c5e]',
    itemLabel: 'text-[#dce9fb]',
    shortcut: 'text-[#5a76b8]',
    separator: 'border-[#3170a0]/60',
    submenuPanel: 'rounded-none bg-[#101c42] border-2 border-[#3170a0]',
  },
  breadcrumbs: {
    backButton: 'rounded-none bg-[#101c42] border-[#3170a0] text-[#dce9fb]',
    selectTrigger:
      'rounded-none bg-[#101c42] border-[#3170a0] text-[#dce9fb] hover:bg-[#1d2c5e]',
    list: 'text-[#dce9fb]',
    editButton: 'text-[#dce9fb] hover:bg-[#1d2c5e]',
  },
  runnerToggleButton:
    'rounded-none bg-[#101c42]/90 border-[#3170a0] text-[#dce9fb] hover:bg-[#1d2c5e]',
  runnerPanel: {
    container: `rounded-none bg-[#0b1430] border-[#3170a0] ${LOGO_TEXT}`,
    overflowMenu: `rounded-none [--color-graph-elevated-surface-bg:#0b1430] [--color-graph-toggle-track-bg:#101c42] border-[#3170a0] ${LOGO_TEXT}`,
    overflowMenuItem: 'hover:bg-[#3170a0]/25',
    overflowMenuItemActive: 'bg-[#3170a0]/40 text-[#dce9fb]',
  },
  runControls: {
    container: 'bg-[#101c42] border-[#3170a0]/60',
    playButton:
      'rounded-none bg-[#f2db68] text-[#0e1939] shadow-[0_0_14px_rgba(246,225,106,0.55)]',
    actionButton: 'rounded-none hover:bg-[#1d2c5e]',
    divider: 'bg-[#3170a0]/60',
  },
  timeline: {
    container: `bg-[#0b1430] ${LOGO_TEXT}`,
    toolbar: 'bg-[#0b1430]',
    trackArea: 'rounded-none bg-[#0e1939] border-[#3170a0]/60',
    ruler: 'bg-[#101c42]',
    navButton: 'rounded-none border-[#3170a0]/60',
  },
  inspector: {
    container: `bg-[#0b1430] ${LOGO_TEXT}`,
    sectionHeader: 'bg-[#101c42] text-[#dce9fb] border-[#3170a0]/60',
    valueBox: 'rounded-none bg-[#101c42] border-[#3170a0] text-[#dce9fb]',
    timelineBox: 'rounded-none bg-[#101c42] border-[#3170a0]',
  },
  drawer: {
    container: `bg-[#0b1430] border-[#3170a0] ${LOGO_TEXT}`,
    title: 'text-[#dce9fb]',
    label: 'text-[#a1ccf7]',
    footerButton: 'rounded-none border-[#3170a0]',
  },
  modal: {
    content: `rounded-none bg-[#101c42] border-2 border-[#3170a0] ${LOGO_TEXT}`,
    title: 'text-[#dce9fb]',
  },
  connectionMiniMap: { container: 'rounded-none border-[#3170a0]' },
  dragList: {
    row: 'rounded-none bg-[#13204a] text-[#dce9fb] hover:bg-[#1d2c5e]',
    preview: 'rounded-none bg-[#13204a] border-[#3170a0]',
  },
  select: {
    trigger: 'rounded-none bg-[#101c42] text-[#dce9fb] border-[#3170a0]',
    content: `rounded-none bg-[#101c42] border-2 border-[#3170a0] text-[#dce9fb] ${LOGO_TEXT}`,
    item: 'hover:bg-[#1d2c5e]',
  },
  tooltip: {
    content: `rounded-none bg-[#101c42] border-[#97ccf7]/70 text-[#dce9fb] ${LOGO_TEXT}`,
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

/**
 * Side-by-side studio: build a logic-circuit graph on the left (it starts
 * empty — right-click the canvas to add Bit Inputs and gates), and watch the
 * `codegen-js` run target emit a standalone, dependency-free JavaScript
 * `runGraph` on the right, live, in a Monaco editor with full JS syntax
 * highlighting. Bit Input defaults (and unconnected gate inputs) are baked into
 * the generated code; press Run to evaluate it and see the output. Switch to
 * `json-ir` to view the compiled plan as JSON instead.
 */
// Derive the exact node/edge types `useFullGraph<Circuit…>` expects for its
// initial state (the `Nodes` generic's parameter ORDER differs from the usual
// convention, so deriving avoids getting it wrong).
type CircuitInitialState = Parameters<
  typeof useFullGraph<CircuitDataTypeId, CircuitNodeTypeId>
>[0];

type CodegenStudioViewProps = {
  initialNodes: CircuitInitialState['nodes'];
  initialEdges: CircuitInitialState['edges'];
};

/**
 * The shared CodegenStudio canvas + live-codegen panel. Driven by an initial
 * node/edge set so it can start either empty (build from scratch) or with a
 * declared Graph Input → … → Graph Output pipeline that emits `runGraph(a, b)`.
 * Toolbar toggles: output format, `optimize` (dead-code elimination), and `lock
 * root I/O` (freezes the `runGraph` signature — `allowRootIORename` /
 * `allowRootIOStructureEdit` off, so connecting concretizes the TYPE only and the
 * Graph I/O editor's rename/add/delete affordances disable in lockstep).
 */
function CodegenStudioView({
  initialNodes,
  initialEdges,
}: CodegenStudioViewProps) {
  const { state, dispatch } = useFullGraph<
    CircuitDataTypeId,
    CircuitNodeTypeId
  >({
    dataTypes: circuitExampleDataTypes,
    typeOfNodes: circuitExampleTypeOfNodes,
    nodes: initialNodes,
    edges: initialEdges,
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

  const [format, setFormat] = useState<'codegen-js' | 'codegen-ts' | 'json-ir'>(
    'codegen-js',
  );
  // Opt-in optimization passes (codegen v2 Stage 4). Dead-code elimination drops
  // graph branches no Graph Output depends on; needs the pure-impl assumption to
  // prune threaded impl-call nodes.
  const [optimize, setOptimize] = useState(true);
  // Freeze the root I/O contract — connecting concretizes the type but does NOT
  // rename the handle or grow a spare, and the Graph I/O editor locks in step.
  const [lockRootIO, setLockRootIO] = useState(false);
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');

  // Live-regenerate whenever the graph (or chosen format) changes. Codegen is
  // Prettier-formatted (async) for a presentable preview.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Concrete matching generics (state and impls share N) — no widening
        // needed; U/C take their defaults.
        const plan = compile<CircuitDataTypeId, CircuitNodeTypeId>(
          state,
          circuitImplementations,
          { maxLoopIterations: 100 },
        );
        let next: string;
        if (format === 'json-ir') {
          next = JSON.stringify(serializeExecutionPlan(plan), null, 2);
        } else {
          const language =
            format === 'codegen-ts' ? 'typescript' : 'javascript';
          next = await emitGraph<CircuitDataTypeId, CircuitNodeTypeId>(
            plan,
            state,
            {
              metadata: circuitCodegenMetadata,
              target: language,
              optimize: { deadCode: optimize },
              assumePureImplementations: optimize,
              analyzeImplementations: optimize,
              impls: circuitImplementations as Readonly<
                Record<string, (...args: never[]) => unknown>
              >,
            },
          );
        }
        if (!cancelled) setCode(next);
      } catch (error) {
        if (!cancelled)
          setCode(
            `// Could not generate code from the current graph:\n// ${String(error)}`,
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, format, optimize]);

  const runGeneratedCode = () => {
    if (format !== 'codegen-js') {
      setOutput('Switch to "codegen-js" to run the generated function.');
      return;
    }
    void (async () => {
      try {
        const runnable = code.replace(/export\s*\{[^}]*\};?\s*$/, '');
        const runGraph = new Function(`${runnable}\nreturn runGraph;`)() as (
          ...args: unknown[]
        ) => unknown | Promise<unknown>;
        // The signature varies — root Graph I/O ⇒ `runGraph(a, b)`; threaded ⇒
        // `runGraph(functionImplementations, …)`. Map each parameter by name:
        // impls/options get the real values; declared graph inputs get a sample
        // boolean (`true`) so the demo Run shows a concrete result.
        const source = runGraph.toString();
        const params = source
          .slice(source.indexOf('(') + 1, source.indexOf(')'))
          .split(',')
          .map((p) => p.trim().split('=')[0].trim())
          .filter(Boolean);
        const args = params.map((name) =>
          name === 'functionImplementations'
            ? circuitImplementations
            : name === 'options'
              ? {}
              : true,
        );
        const values = (await runGraph(...args)) as Record<string, unknown>;
        setOutput(
          Object.keys(values).length === 0
            ? '{}\n// Build a circuit on the left, then Run.'
            : JSON.stringify(values, null, 2),
        );
      } catch (error) {
        setOutput(`Error: ${String(error)}`);
      }
    })();
  };

  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid #3f3f46' }}>
        <FullGraph<CircuitDataTypeId, CircuitNodeTypeId>
          state={state}
          dispatch={dispatch}
          functionImplementations={circuitImplementations}
          runTargets={[
            circuitCodegenJsRunTarget,
            circuitCodegenTsRunTarget,
            jsonIrRunTarget,
          ]}
          allowRootIORename={!lockRootIO}
          allowRootIOStructureEdit={!lockRootIO}
        />
      </div>
      <div
        style={{
          width: '46%',
          display: 'flex',
          flexDirection: 'column',
          background: '#1e1e1e',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            background: '#27272a',
            color: '#e4e4e7',
            fontSize: 13,
          }}
        >
          <strong style={{ marginRight: 'auto' }}>
            Generated live from the graph →
          </strong>
          <select
            value={format}
            onChange={(event) =>
              setFormat(
                event.target.value as 'codegen-js' | 'codegen-ts' | 'json-ir',
              )
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
            <option value='codegen-js'>codegen-js (standalone JS)</option>
            <option value='codegen-ts'>codegen-ts (typed TS)</option>
            <option value='json-ir'>json-ir (plan JSON)</option>
          </select>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              cursor: format === 'json-ir' ? 'not-allowed' : 'pointer',
              opacity: format === 'json-ir' ? 0.5 : 1,
            }}
            title='Dead-code elimination: drop branches no Graph Output depends on (assumes pure impls)'
          >
            <input
              type='checkbox'
              checked={optimize}
              disabled={format === 'json-ir'}
              onChange={(event) => setOptimize(event.target.checked)}
            />
            optimize
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              cursor: 'pointer',
            }}
            title='Lock the root I/O contract: connecting concretizes the type but does NOT rename the handle or grow a spare, and the Graph I/O editor rename/add/delete disable in lockstep (allowRootIORename / allowRootIOStructureEdit off).'
          >
            <input
              type='checkbox'
              checked={lockRootIO}
              onChange={(event) => setLockRootIO(event.target.checked)}
            />
            lock root I/O
          </label>
          <button
            type='button'
            onClick={runGeneratedCode}
            disabled={format !== 'codegen-js'}
            style={{
              padding: '4px 14px',
              borderRadius: 6,
              border: 'none',
              background: format === 'codegen-js' ? '#2563eb' : '#3f3f46',
              color: 'white',
              cursor: format === 'codegen-js' ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >
            ▶ Run
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Editor
            height='100%'
            language={
              format === 'codegen-js'
                ? 'javascript'
                : format === 'codegen-ts'
                  ? 'typescript'
                  : 'json'
            }
            theme='vs-dark'
            value={code}
            onChange={(value) => setCode(value ?? '')}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
            }}
          />
        </div>
        {output && (
          <div
            style={{
              maxHeight: '30%',
              overflow: 'auto',
              borderTop: '1px solid #3f3f46',
              padding: '8px 12px',
              color: '#a7f3d0',
              background: '#0b0b0b',
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            <strong style={{ color: '#e4e4e7' }}>
              Output (runGraph result):
            </strong>
            {`\n${output}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Declared root Graph I/O — the graph's I/O boundary is pre-built so the
// codegen panel shows `function runGraph(a, b)` out of the box (E5 demo).
//   Graph Input (a, b) → AND Gate → Graph Output (out)   [live]
//   Bit Input → OR Gate → (nothing)                       [dead]
// The dead branch lets the `optimize` toggle (dead-code elimination) show its
// effect: ON drops it (clean sync `runGraph(a, b)`), OFF keeps it (the threaded
// Bit Input forces `async`/`functionImplementations`). Edit the boundary handles
// via the Graph Input/Output node's pencil, or add a new one at root via the
// canvas context menu ("Add Graph Input/Output").
// ────────────────────────────────────────────────────────────────────────

function buildGraphIoCircuit() {
  // Build the demo graph the way a USER would — by dispatching reducer actions
  // onto an EMPTY graph — instead of hand-constructing nodes / handles / edges.
  let state = makeStateWithAutoInfer<CircuitDataTypeId, CircuitNodeTypeId>({
    dataTypes: circuitExampleDataTypes,
    typeOfNodes: circuitExampleTypeOfNodes,
    nodes: [],
    edges: [],
    // Inference concretizes the named Graph I/O handles to `bit` when wired.
    enableTypeInference: true,
  });
  const dispatch = (
    action: Action<CircuitDataTypeId, CircuitNodeTypeId>,
  ): void => {
    state = mainReducer<CircuitDataTypeId, CircuitNodeTypeId>(state, action);
  };

  // ADD_NODE mints a random id — recover it as the node not present beforehand.
  const addNode = (
    type: CircuitNodeTypeId,
    position: { x: number; y: number },
  ): string => {
    const before = new Set(state.nodes.map((node) => node.id));
    dispatch({ type: actionTypesMap.ADD_NODE, payload: { type, position } });
    const added = state.nodes.find((node) => !before.has(node.id));
    if (!added) throw new Error(`ADD_NODE(${type}) added no node`);
    return added.id;
  };

  // Look up a leaf handle id by NAME on a node (defensively unwrapping panels).
  const handleId = (
    nodeId: string,
    side: 'inputs' | 'outputs',
    name: string,
  ): string => {
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    const leaves = (node?.data[side] ?? []).flatMap((handle) =>
      'inputs' in handle ? handle.inputs : [handle],
    );
    const handle = leaves.find((leaf) => leaf.name === name);
    if (!handle) {
      throw new Error(`handle "${name}" not found on ${nodeId}.${side}`);
    }
    return handle.id;
  };

  // The current blank "+ slot" infer template (the unnamed `groupInfer` handle a
  // boundary node carries / regrows). Auto-grow consumes it and grows a new one,
  // so re-query before every connect.
  const blankHandleId = (
    nodeId: string,
    side: 'inputs' | 'outputs',
  ): string => {
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    const leaves = (node?.data[side] ?? []).flatMap((handle) =>
      'inputs' in handle ? handle.inputs : [handle],
    );
    const blank = leaves.find((leaf) => leaf.name === '');
    if (!blank) throw new Error(`no blank "+ slot" on ${nodeId}.${side}`);
    return blank.id;
  };

  // 1. Place the five nodes (positions mirror the original layout). A LIVE Bit
  //    Input feeds a second Graph Output; a DEAD OR gate (output wired to
  //    nothing) gives dead-code elimination something to drop.
  const graphInputId = addNode('groupInput', { x: 0, y: 120 });
  const andGateId = addNode('andGate', { x: 480, y: 140 });
  const graphOutputId = addNode('groupOutput', { x: 960, y: 180 });
  const bitInputId = addNode('bitConstant', { x: 0, y: 430 });
  const deadOrId = addNode('orGate', { x: 480, y: 430 });

  // 2. Bake the Bit Input's value so it inlines as the constant `true`. A boolean
  //    input carries its value through the `string | number` payload via the same
  //    cast `ContextAwareInput` uses for its checkbox.
  dispatch({
    type: actionTypesMap.UPDATE_INPUT_VALUE,
    payload: {
      nodeId: bitInputId,
      inputId: handleId(bitInputId, 'inputs', 'Value'),
      value: true as unknown as number,
    },
  });

  // 3. Wire it up exactly the way the canvas does — by connecting to the blank
  //    "+ slot" infer template each boundary node carries. Every such connect
  //    auto-NAMES the new root handle after the gate handle it meets, concretizes
  //    it to `bit`, and grows a FRESH blank for the next one. Auto-grow keeps a
  //    single infer handle live at a time, which is what preserves the "+ slot" as
  //    a real `groupInfer` template: naming every handle up front (via
  //    UPDATE_GRAPH_IO_HANDLES) would leave several `groupInfer` handles
  //    coexisting, and connecting one would concretize them ALL — inference
  //    matches by dataType — corrupting the blank into a `bit`-typed `''` handle.
  const connect = (
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string,
  ): void => {
    dispatch({
      type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
      payload: { edge: { source, sourceHandle, target, targetHandle } },
    });
  };
  // Graph Input → AND Gate: connect the blank "+ slot" twice → root inputs A, B.
  connect(
    graphInputId,
    blankHandleId(graphInputId, 'outputs'),
    andGateId,
    handleId(andGateId, 'inputs', 'A'),
  );
  connect(
    graphInputId,
    blankHandleId(graphInputId, 'outputs'),
    andGateId,
    handleId(andGateId, 'inputs', 'B'),
  );
  // AND Gate → Graph Output: the live result becomes root output `Out`.
  connect(
    andGateId,
    handleId(andGateId, 'outputs', 'Out'),
    graphOutputId,
    blankHandleId(graphOutputId, 'inputs'),
  );
  // LIVE: Bit Input → Graph Output: a second root output that auto-emits the
  // constant `Boolean(true)` inline when optimized.
  connect(
    bitInputId,
    handleId(bitInputId, 'outputs', 'Out'),
    graphOutputId,
    blankHandleId(graphOutputId, 'inputs'),
  );
  // DEAD: Bit Input → OR gate.A; the OR gate's output goes nowhere → DCE drops it.
  connect(
    bitInputId,
    handleId(bitInputId, 'outputs', 'Out'),
    deadOrId,
    handleId(deadOrId, 'inputs', 'A'),
  );

  return {
    nodes: state.nodes as CircuitInitialState['nodes'],
    edges: state.edges as CircuitInitialState['edges'],
  };
}

/**
 * The codegen studio: build a circuit on the left, watch the standalone `runGraph`
 * regenerate live on the right. Seeded with root Graph I/O — auto-grown by
 * connecting to each boundary node's blank "+ slot", exactly as the canvas does,
 * so the handles take the gate-derived names `A` / `B` / `Out` — plus a DEAD
 * branch so the toolbar toggles each have something to show:
 * - **format** — `codegen-js` / `codegen-ts` / `json-ir`.
 * - **optimize** (default ON) — dead-code elimination drops the dead
 *   `Bit Input → OR` branch, leaving a clean `function runGraph(A, B)`; OFF keeps
 *   it (the threaded Bit Input drags in `async` + `functionImplementations`).
 * - **lock root I/O** — freezes the `runGraph` signature: connecting concretizes
 *   the TYPE only (no rename, no grown spare), and the Graph I/O editor's
 *   rename/add/delete disable in lockstep (`allowRootIORename` /
 *   `allowRootIOStructureEdit` off). Off (default) = full group-like parity.
 *
 * Rename/add/reorder the boundary handles via the Graph Input/Output pencil to
 * watch the signature change live. Gate logic AUTO-EMITS inline from the
 * `readInput`-based implementations — there are no authored `emit` hooks.
 */
export const CodegenStudio: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    // Built lazily (not at module load) so it runs after the circuit
    // definitions further down the file have initialized.
    const graphIoCircuit = useMemo(() => buildGraphIoCircuit(), []);
    return (
      <CodegenStudioView
        initialNodes={graphIoCircuit.nodes}
        initialEdges={graphIoCircuit.edges}
      />
    );
  },
};

/**
 * Showcases the opt-in dead-code elimination pass. Build a circuit, then pick a
 * single output to "Return only:" — the exported `runGraph` is recompiled with
 * `returnValues` + `assumePureImplementations`, dropping every pure node that the
 * chosen result does not depend on (transitively). Selecting "(everything)"
 * returns the full value map and keeps every node.
 */
export const CodegenOptimizer: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
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

    const [returnKey, setReturnKey] = useState('');
    const [code, setCode] = useState('');
    const [stats, setStats] = useState('');

    // Every node output handle, as a pickable `nodeId:handleId` return value.
    const outputOptions = useMemo(() => {
      const options: { key: string; label: string }[] = [];
      for (const graphNode of state.nodes) {
        const outputs =
          (
            graphNode.data as unknown as {
              outputs?: Array<{ id: string; name: string }>;
            }
          ).outputs ?? [];
        for (const output of outputs) {
          options.push({
            key: `${graphNode.id}:${output.id}`,
            label: `${graphNode.id.slice(0, 8)} · ${output.name}`,
          });
        }
      }
      return options;
    }, [state.nodes]);

    // Reset the picker if the chosen node is deleted.
    useEffect(() => {
      if (
        returnKey &&
        !outputOptions.some((option) => option.key === returnKey)
      ) {
        setReturnKey('');
      }
    }, [outputOptions, returnKey]);

    useEffect(() => {
      try {
        const plan = compile<CircuitDataTypeId, CircuitNodeTypeId>(
          state,
          circuitImplementations,
          { maxLoopIterations: 100 },
        );
        const optimize = returnKey !== '';
        const full = emitJs<CircuitDataTypeId, CircuitNodeTypeId>(plan, state, {
          metadata: circuitCodegenMetadata,
        });
        const optimized = optimize
          ? emitJs<CircuitDataTypeId, CircuitNodeTypeId>(plan, state, {
              metadata: circuitCodegenMetadata,
              returnValues: [returnKey],
              assumePureImplementations: true,
            })
          : full;
        setCode(optimized);
        const countNodes = (source: string) =>
          (source.match(/^\s*\/\/ node /gm) ?? []).length;
        setStats(
          optimize
            ? `Dead-code elimination: ${countNodes(full)} → ${countNodes(optimized)} node calls (returning only ${returnKey})`
            : `No optimization — returning all values (${countNodes(full)} node calls)`,
        );
      } catch (error) {
        setCode(
          `// Could not generate code from the current graph:\n// ${String(error)}`,
        );
        setStats('');
      }
    }, [state, returnKey]);

    return (
      <div style={{ height: '100vh', display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid #3f3f46' }}>
          <FullGraph<CircuitDataTypeId, CircuitNodeTypeId>
            state={state}
            dispatch={dispatch}
            functionImplementations={circuitImplementations}
            runTargets={[
              circuitCodegenJsRunTarget,
              circuitCodegenTsRunTarget,
              jsonIrRunTarget,
            ]}
          />
        </div>
        <div
          style={{
            width: '46%',
            display: 'flex',
            flexDirection: 'column',
            background: '#1e1e1e',
            fontFamily: 'sans-serif',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              background: '#27272a',
              color: '#e4e4e7',
              fontSize: 13,
            }}
          >
            <strong style={{ marginRight: 'auto' }}>Optimized export →</strong>
            <label style={{ fontSize: 12, color: '#a1a1aa' }}>
              Return only:
            </label>
            <select
              value={returnKey}
              onChange={(event) => setReturnKey(event.target.value)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #71717a',
                background: '#18181b',
                color: '#e4e4e7',
                cursor: 'pointer',
                maxWidth: 240,
              }}
            >
              <option value=''>(everything — no DCE)</option>
              {outputOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              padding: '6px 12px',
              background: '#0f0f12',
              color: '#a7f3d0',
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          >
            {stats}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Editor
              height='100%'
              language='javascript'
              theme='vs-dark'
              value={code}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                readOnly: true,
              }}
            />
          </div>
        </div>
      </div>
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

// Codegen metadata (Decision 6) — dataType→TS types live HERE, passed to the
// codegen factory / emitJs, not on the core TypeOfNode / DataType. No authored
// `emit` hooks: every inlinable node reads its inputs via the recognized
// `readInput` intrinsic and is AUTO-EMITTED from its implementation
// (`analyzeImplementations`), so the impl is the single source of truth. Nodes
// that can't be auto-derived (e.g. `configurableGate`, the displays) thread.
const circuitCodegenMetadata: CodegenMetadata = {
  dataTypeToTsType: {
    bit: 'boolean',
    number: 'number',
    gateMode: "'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'XNOR'",
  },
};

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

// Codegen run targets carrying the circuit's metadata + impls (shared by the
// codegen stories). `analyzeImplementations` derives inline `emit` hooks from the
// `readInput`-based implementations above, so the gates inline without authored
// hooks. Defined AFTER `circuitImplementations` so they can reference it.
const circuitCodegenJsRunTarget = makeCodegenRunTarget({
  metadata: circuitCodegenMetadata,
  analyzeImplementations: true,
  impls: circuitImplementations as Readonly<
    Record<string, (...args: never[]) => unknown>
  >,
});
const circuitCodegenTsRunTarget = makeCodegenRunTarget({
  target: 'typescript',
  metadata: circuitCodegenMetadata,
  analyzeImplementations: true,
  impls: circuitImplementations as Readonly<
    Record<string, (...args: never[]) => unknown>
  >,
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
}: {
  frame?: { width: number; height: number };
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
    dispatch({
      type: 'REPLACE_STATE',
      payload: {
        state: {
          ...state,
          // adderLoopState is built with default generics; force it into this
          // story's concrete state shape (deliberate cross-fixture injection).
          nodes: adderLoopState.state.nodes as unknown as typeof state.nodes,
          edges: adderLoopState.state.edges as unknown as typeof state.edges,
        },
      },
    });
  }, []);

  const [record, setRecord] = useState(adderLoopRecording ?? null);

  const editor = (
    <FullGraph<CircuitDataTypeId, CircuitNodeTypeId>
      state={state}
      dispatch={dispatch}
      functionImplementations={circuitImplementations}
      executionRecord={record}
      onExecutionRecordChange={setRecord}
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
          height: '100vh',
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1 }}>{editor}</div>
    </div>
  );
}

export const WithRunner: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => <RunnerStoryView />,
};

/**
 * The runner panel inside a ~390px phone-width frame — the canonical proof of the
 * container-query responsive layout: RunControls + the timeline toolbar collapse
 * their secondary controls into ⋯ menus, and selecting a step opens the inspector
 * as a full-body slide-over instead of squeezing the timeline. Drag the Storybook
 * viewport / resize the frame to watch it reflow at the 832px breakpoint.
 */
export const WithRunnerNarrow: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => <RunnerStoryView frame={{ width: 390, height: 760 }} />,
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
                  <ColorPicker.Area className='w-full aspect-square' />
                  <ColorPicker.Hue />
                  <div className='flex items-center gap-2'>
                    <ColorPicker.Preview className='w-8 h-8 shrink-0' />
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
